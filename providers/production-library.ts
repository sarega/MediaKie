import type {Express, Request, Response} from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ASSET_ROLES, localMediaUrls, studioAssetIds, type ProductionAsset, type ProductionLibrary} from '../src/models/assets';
import {validateStudio} from '../src/models/production';

const run = promisify(execFile);
export const MAX_IMPORT_BYTES = 250 * 1024 * 1024;
const formats: Record<string, {kind: ProductionAsset['kind']; ext: string}> = {
  'image/png': {kind: 'image', ext: 'png'}, 'image/jpeg': {kind: 'image', ext: 'jpg'},
  'image/webp': {kind: 'image', ext: 'webp'}, 'image/gif': {kind: 'image', ext: 'gif'},
  'video/mp4': {kind: 'video', ext: 'mp4'}, 'video/quicktime': {kind: 'video', ext: 'mov'},
  'video/webm': {kind: 'video', ext: 'webm'}, 'audio/mpeg': {kind: 'audio', ext: 'mp3'},
  'audio/wav': {kind: 'audio', ext: 'wav'}, 'audio/x-wav': {kind: 'audio', ext: 'wav'},
  'audio/ogg': {kind: 'audio', ext: 'ogg'}, 'audio/flac': {kind: 'audio', ext: 'flac'},
  'audio/mp4': {kind: 'audio', ext: 'm4a'},
};

class LibraryError extends Error {
  constructor(message: string, public status = 400) {super(message);}
}

function validMedia(buffer: Buffer, mime: string) {
  const head = buffer.subarray(0, 16);
  if (mime === 'image/png') return head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (mime === 'image/gif') return /^GIF8[79]a/.test(head.toString('ascii'));
  if (mime === 'image/webp') return head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'video/webm') return head.subarray(0, 4).equals(Buffer.from([26,69,223,163]));
  if (['video/mp4', 'video/quicktime', 'audio/mp4'].includes(mime)) return head.toString('ascii', 4, 8) === 'ftyp';
  if (mime === 'audio/ogg') return head.toString('ascii', 0, 4) === 'OggS';
  if (mime === 'audio/flac') return head.toString('ascii', 0, 4) === 'fLaC';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE';
  if (mime === 'audio/mpeg') return head.toString('ascii', 0, 3) === 'ID3' || head[0] === 255 && (head[1] & 224) === 224;
  return false;
}

const urlsFromLog = (log: any): string[] => [...new Set<string>([log?.mediaUrl, ...(Array.isArray(log?.mediaUrls) ? log.mediaUrls : [])].filter(url => typeof url === 'string' && url))];
const generatedId = (logId: string, index: number) => `g_${createHash('sha256').update(`${logId}:${index}`).digest('hex').slice(0, 32)}`;

type Dependencies = {
  projectDir: (id: string) => string;
  libraryDir: (id: string) => string;
  libraryUrl: (id: string, filename: string) => string;
  projectId: (raw: unknown) => string | null;
  readHistory: (id: string) => Promise<any[]>;
  writeHistoryFile: (id: string, logs: any[]) => Promise<void>;
  lock: <T>(id: string, task: () => Promise<T>) => Promise<T>;
  resolveFile: (url: string, id: string) => string | null;
  hideJobs: (id: string, logIds: string[]) => Promise<void>;
  inputReferences: () => Promise<any[]>;
};

export function installProductionLibrary(app: Express, d: Dependencies) {
  const fileFor = (id: string) => path.join(d.projectDir(id), 'production.json');
  const read = async (id: string): Promise<ProductionLibrary> => {
    let raw: string;
    try {raw = await fs.readFile(fileFor(id), 'utf8');}
    catch (error: any) {if (error.code === 'ENOENT') return {schemaVersion: 1, revision: 0, assets: []}; throw error;}
    let data: ProductionLibrary;
    try {data = JSON.parse(raw);} catch {throw new LibraryError('Production library is unreadable. Original file retained; restore a backup before editing.', 500);}
    if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.assets) ||
      data.assets.some(a => !a || typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.url !== 'string' || !['image','video','audio'].includes(a.kind) || !['imported','generated'].includes(a.source) || !ASSET_ROLES.includes(a.role) || !Array.isArray(a.tags) || a.tags.some(t => typeof t !== 'string') || !a.metadata || typeof a.metadata !== 'object') ||
      new Set(data.assets.map(a => a.id)).size !== data.assets.length) {
      throw new LibraryError('Unsupported or invalid production library. Original file retained.', 500);
    }
    if (data.studio) {try {validateStudio(data.studio, data.assets);} catch {throw new LibraryError('Invalid studio metadata. Original file retained.',500);}}
    return data;
  };
  const write = async (id: string, data: ProductionLibrary) => {
    const temporary = `${fileFor(id)}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), {mode: 0o600});
      await fs.rename(temporary, fileFor(id));
    } finally {await fs.unlink(temporary).catch(() => {});}
  };
  const localFile = (url: string, id: string) => {
    const file = d.resolveFile(url, id);
    if (!file || path.dirname(file) !== d.libraryDir(id)) return null;
    return file;
  };
  const metadata = async (file: string, mimeType?: string): Promise<ProductionAsset['metadata']> => {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new LibraryError('A regular local media file is required');
    const result: ProductionAsset['metadata'] = {bytes: stat.size, ...(mimeType ? {mimeType} : {})};
    try {
      const binary = process.env.FFPROBE_PATH || (await fs.access('/opt/homebrew/bin/ffprobe').then(() => '/opt/homebrew/bin/ffprobe').catch(() => 'ffprobe'));
      const {stdout} = await run(binary, ['-v','error','-protocol_whitelist','file,pipe','-show_entries','stream=codec_type,width,height:format=duration','-of','json',file], {timeout: 10000, maxBuffer: 128 * 1024});
      const info = JSON.parse(stdout);
      const video = info.streams?.find((s: any) => s.codec_type === 'video');
      if (Number.isFinite(video?.width)) result.width = video.width;
      if (Number.isFinite(video?.height)) result.height = video.height;
      if (Number.isFinite(Number(info.format?.duration))) result.duration = Number(info.format.duration);
    } catch {} // Metadata is optional; original media remains usable without ffprobe.
    return result;
  };
  // Called inside the shared project lock; generated assets reference existing files, never copy them.
  const reconcile = async (id: string) => {
    const current = await read(id);
    const byId = new Map(current.assets.map(a => [a.id, a]));
    let changed = false;
    for (const log of await d.readHistory(id)) {
      if (log.status !== 'success' || !['image','video','audio'].includes(log.type) || typeof log.id !== 'string') continue;
      for (const [index, url] of urlsFromLog(log).entries()) {
        const matching = current.assets.find(a => a.generationLogId === log.id && a.url === url);
        let outputIndex = index;
        while (!matching && byId.has(generatedId(log.id, outputIndex))) outputIndex++;
        const assetId = matching?.id || generatedId(log.id, outputIndex);
        const existing = byId.get(assetId);
        if (existing?.url === url) continue;
        const file = localFile(url, id);
        const info = file ? await metadata(file).catch(() => ({})) : {};
        byId.set(assetId, {...existing, id: assetId, name: existing?.name || `${log.modelName || 'Generation'}${urlsFromLog(log).length > 1 ? ` · ${index + 1}` : ''}`, kind: log.type, role: existing?.role || (log.type === 'video' ? 'video' : 'other'), tags: existing?.tags || [], url, source: 'generated', createdAt: log.timestamp, generationLogId: log.id, outputIndex: existing?.outputIndex ?? outputIndex, metadata: info});
        changed = true;
      }
    }
    if (!changed) {
      try {await fs.access(fileFor(id));} catch {await write(id, current);}
      return current;
    }
    const next = {...current, revision: current.revision + 1, assets: [...byId.values()]};
    await write(id, next);
    return next;
  };
  const assertRevision = (data: ProductionLibrary, revision: unknown) => {
    if (revision !== data.revision) throw new LibraryError('Library changed in another tab. Reload the library and try again; your edit has not been saved.', 409);
  };
  const assertUnused = (assets: ProductionAsset[], remainingLogs: any[], id: string) => {
    const files = new Set(assets.map(a => localFile(a.url, id)).filter(Boolean));
    for (const log of remainingLogs) {
      const urls = localMediaUrls([log.sourceMediaUrls, log.settingsSnapshot, ...(log.projectId && log.projectId !== id ? urlsFromLog(log) : [])]);
      if (urls.some(url => files.has(d.resolveFile(url, log.projectId || id)))) {
        throw new LibraryError(`Media is used as an input by ${log.modelName || log.id}. Remove that generation first.`, 409);
      }
    }
  };
  // Existing Activity/clear routes remove their generated catalog entries, but retain independently imported files.
  const removeHistoryAssets = async (id: string, removed: any[], remaining: any[]) => {
    const data = await read(id);
    const ids = new Set(removed.map(log => log.id));
    const assets = data.assets.filter(a => a.generationLogId && ids.has(a.generationLogId));
    assertStudioUnused(data, assets);
    const candidates = [...assets, ...removed.flatMap(log => urlsFromLog(log).map(url => ({url} as ProductionAsset)))];
    assertUnused(candidates, [...remaining, ...(await d.inputReferences()).filter(log => log.projectId !== id || !ids.has(log.id))], id);
    const next = {...data, revision: data.revision + 1, assets: data.assets.filter(a => !a.generationLogId || !ids.has(a.generationLogId))};
    if (assets.length) await write(id, next);
    return next.assets.map(a => a.url);
  };
  const protectedUrls = async (id: string) => (await read(id)).assets.map(a => a.url);
  const assertStudioUnused = (data: ProductionLibrary, assets: ProductionAsset[]) => {
    const used = new Set(studioAssetIds(data.studio));
    if (assets.some(a => used.has(a.id))) throw new LibraryError('Media is used by the Board or saved sequence. Remove its references there first.', 409);
  };

  const route = (handler: (req: Request, res: Response, id: string) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const id = d.projectId(req.params.projectId);
      if (!id) throw new LibraryError('Invalid project id');
      await fs.access(path.join(d.projectDir(id), 'project.json')).catch(() => {throw new LibraryError('Project not found', 404);});
      await handler(req, res, id);
    } catch (error: any) {res.status(error.status || 500).json({error: error.status ? error.message : 'Unable to update production library. Original metadata retained.'});}
  };
  app.get('/api/projects/:projectId/production', route(async (_req, res, id) => {
    res.json(await d.lock(id, () => reconcile(id)));
  }));
  app.put('/api/projects/:projectId/studio', route(async (req, res, id) => {
    res.json(await d.lock(id, async () => {
      const data = await reconcile(id); assertRevision(data, req.body?.revision);
      try {validateStudio(req.body?.studio, data.assets);} catch (error: any) {throw new LibraryError(error.message);}
      const next = {...data, revision:data.revision + 1, studio:req.body.studio};
      await write(id,next); return next;
    }));
  }));
  app.patch('/api/projects/:projectId/assets/:assetId', route(async (req, res, id) => {
    res.json(await d.lock(id, async () => {
      const data = await reconcile(id); assertRevision(data, req.body?.revision);
      const asset = data.assets.find(a => a.id === req.params.assetId);
      if (!asset) throw new LibraryError('Asset not found', 404);
      const {name, role, tags} = req.body || {};
      if (typeof name !== 'string' || !name.trim() || name.length > 200 || !ASSET_ROLES.includes(role) || !Array.isArray(tags) || tags.length > 30 || tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 60)) throw new LibraryError('Enter a name (1–200 characters), valid role and up to 30 tags (60 characters each)');
      const next = {...data, revision: data.revision + 1, assets: data.assets.map(a => a.id === asset.id ? {...a, name: name.trim(), role, tags: [...new Set<string>(tags.map(t => t.trim()))]} : a)};
      await write(id, next); return next;
    }));
  }));
  app.post('/api/projects/:projectId/assets/import', (req, res, next) => {
    if (Number(req.headers['content-length']) > MAX_IMPORT_BYTES) return res.status(413).json({error:'Media exceeds the 250 MB import limit'});
    next();
  }, express.raw({type: Object.keys(formats), limit: MAX_IMPORT_BYTES}), route(async (req, res, id) => {
    const mime = req.headers['content-type']?.split(';')[0].trim().toLowerCase() || '';
    const format = formats[mime];
    if (!format || !Buffer.isBuffer(req.body) || !req.body.length || req.body.length > MAX_IMPORT_BYTES || !validMedia(req.body, mime)) throw new LibraryError('Unsupported or invalid media. Use PNG/JPEG/WebP/GIF, MP4/MOV/WebM or MP3/WAV/OGG/FLAC/M4A (up to 250 MB).');
    let name: string;
    try {name = decodeURIComponent(String(req.headers['x-file-name'] || 'Imported media'));}
    catch {throw new LibraryError('Invalid file name encoding');}
    if (!name.trim() || name.length > 200) throw new LibraryError('File name must contain 1–200 characters');
    res.json(await d.lock(id, async () => {
      const data = await reconcile(id); assertRevision(data, Number(req.headers['x-library-revision']));
      const filename = `${randomUUID()}.${format.ext}`;
      const file = path.join(d.libraryDir(id), filename);
      try {
        await fs.writeFile(file, req.body, {flag: 'wx'});
        const asset: ProductionAsset = {id: `a_${randomUUID()}`, name, kind: format.kind, role: format.kind === 'video' ? 'video' : 'other', tags: [], url: d.libraryUrl(id, filename), source: 'imported', createdAt: new Date().toISOString(), metadata: await metadata(file, mime)};
        const next = {...data, revision: data.revision + 1, assets: [asset, ...data.assets]};
        await write(id, next); return next;
      } catch (error) {await fs.unlink(file).catch(() => {}); throw error;}
    }));
  }));
  app.use('/api/projects/:projectId/assets/import', (error: any, _req: Request, res: Response, next: (error?: unknown) => void) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({error:'Media exceeds the 250 MB import limit'});
    next(error);
  });
  app.post('/api/projects/:projectId/assets/delete-many', route(async (req, res, id) => {
    const ids = req.body?.assetIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(a => typeof a !== 'string')) throw new LibraryError('Select 1–500 assets');
    res.json(await d.lock(id, async () => {
      const data = await reconcile(id); assertRevision(data, req.body?.revision);
      const removed = data.assets.filter(a => ids.includes(a.id));
      assertStudioUnused(data, removed);
      if (removed.length !== new Set(ids).size) throw new LibraryError('One or more assets were not found', 404);
      const logs = await d.readHistory(id);
      const removedUrls = new Set(removed.filter(a => a.source === 'generated').map(a => a.url));
      const affectedIds = new Set(removed.map(a => a.generationLogId).filter(Boolean));
      const nextLogs = logs.flatMap(log => {
        if (!affectedIds.has(log.id)) return [log];
        const urls = urlsFromLog(log).filter(url => !removedUrls.has(url));
        return urls.length ? [{...log, mediaUrl: urls[0], mediaUrls: urls}] : [];
      });
      const deletedLogIds = logs.filter(log => !nextLogs.some(l => l.id === log.id)).map(log => log.id);
      assertUnused(removed, [...nextLogs, ...(await d.inputReferences()).filter(log => log.projectId !== id || !deletedLogIds.includes(log.id))], id);
      const next = {...data, revision: data.revision + 1, assets: data.assets.filter(a => !ids.includes(a.id))};
      // Keep output identities stable when an earlier output is removed; reconciliation matches retained URLs.
      await d.hideJobs(id, deletedLogIds);
      await d.writeHistoryFile(id, nextLogs);
      await write(id, next);
      const protectedFiles = new Set([...next.assets.map(a => a.url), ...nextLogs.flatMap(urlsFromLog), ...nextLogs.flatMap(log => localMediaUrls([log.sourceMediaUrls, log.settingsSnapshot]))].map(url => localFile(url, id)).filter(Boolean));
      for (const asset of removed) {
        const file = localFile(asset.url, id);
        if (file && !protectedFiles.has(file)) await fs.unlink(file).catch(() => {});
      }
      return {...next, logs: nextLogs};
    }));
  }));
  app.post('/api/projects/:projectId/assets/export', route(async (req, res, id) => {
    let ids = req.body?.assetIds;
    if (typeof ids === 'string') {try {ids = JSON.parse(ids);} catch {ids = null;}}
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(a => typeof a !== 'string')) throw new LibraryError('Select 1–500 assets');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-assets-'));
    const archive = path.join(temporary, 'assets.zip');
    try {
      await d.lock(id, async () => {
        const data = await reconcile(id);
        const assets = data.assets.filter(a => ids.includes(a.id));
        if (assets.length !== new Set(ids).size) throw new LibraryError('Some selected assets were not found', 404);
        const files: string[] = [];
        for (const asset of assets) {
          const file = localFile(asset.url, id);
          if (!file || !(await fs.lstat(file).catch(() => null))?.isFile()) throw new LibraryError(`Save ${asset.name} locally before exporting`);
          files.push(file);
        }
        await fs.writeFile(path.join(temporary, 'assets.json'), JSON.stringify({schemaVersion: 1, assets}, null, 2));
        await run('zip', ['-q', archive, 'assets.json'], {cwd: temporary});
        await run('zip', ['-q','-j',archive, ...new Set(files)]);
      });
      res.download(archive, 'selected-assets.zip', () => {void fs.rm(temporary, {recursive: true, force: true});});
    } catch (error) {await fs.rm(temporary, {recursive: true, force: true}); throw error;}
  }));
  return {read, write, reconcile, removeHistoryAssets, protectedUrls};
}
