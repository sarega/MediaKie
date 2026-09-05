import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

const MAX_REMOTE_MEDIA_BYTES = 250 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS = 3;
const REMOTE_FETCH_TIMEOUT_MS = 30_000;
const execFileAsync = promisify(execFile);

const isPrivateIpv4 = (address: string) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase().split('%')[0];
  const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);
  if (normalized === '::' || normalized === '::1') return true;

  const firstBlock = parseInt(normalized.split(':').find(Boolean) || '0', 16);
  return normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || (firstBlock >= 0xfe80 && firstBlock <= 0xfebf)
    || firstBlock === 0;
};

const isPrivateAddress = (address: string) => isIP(address) === 4
  ? isPrivateIpv4(address)
  : isIP(address) === 6 && isPrivateIpv6(address);

const assertPublicRemoteUrl = async (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid media URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS media URLs are supported');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local media URLs are not allowed');
  }

  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true })).map(({ address }) => address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('Private network media URLs are not allowed');
  }

  return parsed;
};

const fetchRemoteUrl = async (rawUrl: string) => {
  let nextUrl = rawUrl;
  for (let redirect = 0; redirect <= MAX_REMOTE_REDIRECTS; redirect += 1) {
    const safeUrl = await assertPublicRemoteUrl(nextUrl);
    const response = await fetch(safeUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'kai-media-studio/1.0', Accept: '*/*' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Remote media redirect has no destination');
      if (redirect === MAX_REMOTE_REDIRECTS) throw new Error('Too many remote media redirects');
      nextUrl = new URL(location, safeUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error('Unable to fetch remote media');
};

const assertResponseSize = (response: Response) => {
  const contentLength = Number(response.headers.get('content-length') || '');
  if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_MEDIA_BYTES) {
    throw new Error('Remote media is too large');
  }
};

const readResponseBuffer = async (response: Response) => {
  assertResponseSize(response);
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_REMOTE_MEDIA_BYTES) throw new Error('Remote media is too large');
    return buffer;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body as any) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REMOTE_MEDIA_BYTES) throw new Error('Remote media is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const getRemoteMediaError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Remote media is too large') return { status: 413, message };
  if (message.includes('media URL') || message.includes('redirect') || message.includes('data URL')) return { status: 400, message };
  return { status: 500, message: fallback };
};

const decodeBase64DataUrl = (rawUrl: string) => {
  const matches = rawUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches || !/^[A-Za-z0-9+/]*={0,2}$/.test(matches[2]) || matches[2].length % 4 === 1) {
    throw new Error('Invalid data URL format');
  }

  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.length > MAX_REMOTE_MEDIA_BYTES) throw new Error('Remote media is too large');
  return { contentType: matches[1], buffer };
};

const getExtensionFromContentType = (contentType: string | null, fallbackType?: string) => {
  if (contentType?.includes('image/png')) return 'png';
  if (contentType?.includes('image/jpeg')) return 'jpg';
  if (contentType?.includes('image/webp')) return 'webp';
  if (contentType?.includes('image/gif')) return 'gif';
  if (contentType?.includes('video/webm')) return 'webm';
  if (contentType?.includes('video/quicktime')) return 'mov';
  if (contentType?.includes('video/mp4')) return 'mp4';
  if (contentType?.includes('audio/mpeg')) return 'mp3';
  if (contentType?.includes('audio/wav') || contentType?.includes('audio/x-wav')) return 'wav';
  if (contentType?.includes('audio/aac')) return 'aac';
  if (contentType?.includes('audio/ogg')) return 'ogg';
  if (contentType?.includes('audio/mp4')) return 'm4a';
  if (fallbackType === 'audio') return 'mp3';
  return fallbackType === 'video' ? 'mp4' : 'png';
};

const getExtensionFromUrl = (url: string, fallbackType?: string) => {
  try {
    const pathname = new URL(url, 'http://local').pathname;
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {}
  if (fallbackType === 'audio') return 'mp3';
  return fallbackType === 'video' ? 'mp4' : 'png';
};

const safeDownloadFilename = (filename: unknown) => {
  const raw = typeof filename === 'string' && filename.trim() ? filename : 'download';
  return raw.replace(/[\r\n"]/g, '').replace(/[\\/]/g, '-').slice(0, 180) || 'download';
};

const safeProjectName = (name: unknown) => {
  const raw = typeof name === 'string' ? name.trim() : '';
  return raw.replace(/[\r\n"]/g, ' ').slice(0, 80) || 'Untitled Project';
};

const safeProjectId = (id: unknown) => {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const dataDir = path.join(process.cwd(), 'data');
  const legacyLibraryDir = path.join(dataDir, 'library');
  const legacyHistoryPath = path.join(dataDir, 'history.json');
  const projectsDir = path.join(dataDir, 'projects');
  const defaultProjectId = 'default';

  const getProjectDir = (projectId: string) => path.join(projectsDir, projectId);
  const getProjectLibraryDir = (projectId: string) => path.join(getProjectDir(projectId), 'library');
  const getProjectHistoryPath = (projectId: string) => path.join(getProjectDir(projectId), 'history.json');
  const getProjectMetaPath = (projectId: string) => path.join(getProjectDir(projectId), 'project.json');

  const readJson = async (filePath: string, fallback: any) => {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  };

  const ensureProject = async (projectId: string, name = 'Untitled Project') => {
    const projectDir = getProjectDir(projectId);
    await fs.mkdir(getProjectLibraryDir(projectId), { recursive: true });
    const metaPath = getProjectMetaPath(projectId);
    const existing = await readJson(metaPath, null);
    if (existing?.id) return existing;

    const now = new Date().toISOString();
    const project = { id: projectId, name: safeProjectName(name), createdAt: now, updatedAt: now };
    await fs.writeFile(metaPath, JSON.stringify(project, null, 2));
    await fs.writeFile(getProjectHistoryPath(projectId), JSON.stringify({ logs: [] }, null, 2)).catch(() => {});
    return project;
  };

  const migrateLegacyProject = async () => {
    await fs.mkdir(projectsDir, { recursive: true });
    await ensureProject(defaultProjectId, 'Default Project');

    const defaultHistoryPath = getProjectHistoryPath(defaultProjectId);
    const legacy = await readJson(legacyHistoryPath, { logs: [] });
    const currentDefault = await readJson(defaultHistoryPath, { logs: [] });
    if (Array.isArray(legacy.logs) && legacy.logs.length > 0 && (!Array.isArray(currentDefault.logs) || currentDefault.logs.length === 0)) {
      await fs.writeFile(defaultHistoryPath, JSON.stringify({ logs: Array.isArray(legacy.logs) ? legacy.logs : [] }, null, 2));
    }

    try {
      const files = await fs.readdir(legacyLibraryDir);
      const defaultLibraryDir = getProjectLibraryDir(defaultProjectId);
      await fs.mkdir(defaultLibraryDir, { recursive: true });
      await Promise.all(files.map(async (filename) => {
        const from = path.join(legacyLibraryDir, filename);
        const to = path.join(defaultLibraryDir, filename);
        try {
          await fs.access(to);
        } catch {
          await fs.copyFile(from, to).catch(() => {});
        }
      }));
    } catch {}
  };

  await migrateLegacyProject();

  app.use(express.json({ limit: '50mb' })); // Support large base64/image payloads
  app.use('/library', express.static(getProjectLibraryDir(defaultProjectId)));
  app.use('/projects/:projectId/library', (req, res, next) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(404).send('Project not found');
    express.static(getProjectLibraryDir(projectId))(req, res, next);
  });

  const readHistory = async (projectId = defaultProjectId) => {
    try {
      const raw = await fs.readFile(getProjectHistoryPath(projectId), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.logs) ? parsed.logs : [];
    } catch {
      return [];
    }
  };

  const historyWriteQueues = new Map<string, Promise<unknown>>();

  const withHistoryWrite = async <T>(projectId: string, task: () => Promise<T>) => {
    const previous = historyWriteQueues.get(projectId) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    historyWriteQueues.set(projectId, current);
    try {
      return await current;
    } finally {
      if (historyWriteQueues.get(projectId) === current) historyWriteQueues.delete(projectId);
    }
  };

  const writeHistoryFile = async (projectId: string, logs: unknown[]) => {
    await ensureProject(projectId);
    const historyPath = getProjectHistoryPath(projectId);
    const tempPath = `${historyPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify({ logs }, null, 2));
      await fs.rename(tempPath, historyPath);
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
    const meta = await readJson(getProjectMetaPath(projectId), null);
    if (meta?.id) {
      await fs.writeFile(getProjectMetaPath(projectId), JSON.stringify({ ...meta, updatedAt: new Date().toISOString() }, null, 2));
    }
  };

  const writeHistory = (projectId: string, logs: unknown[]) => {
    return withHistoryWrite(projectId, () => writeHistoryFile(projectId, logs));
  };

  const listProjects = async () => {
    await migrateLegacyProject();
    const ids = await fs.readdir(projectsDir).catch(() => []);
    const projects = await Promise.all(ids.map((id) => readJson(getProjectMetaPath(id), null)));
    return projects
      .filter((project) => project?.id)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  };

  const resolveLibraryFile = (mediaUrl: string, projectId = defaultProjectId) => {
    if (mediaUrl.startsWith('/projects/')) {
      const match = mediaUrl.match(/^\/projects\/([^/]+)\/library\/([^/?#]+)/);
      if (!match) return null;
      const matchedProjectId = safeProjectId(match[1]);
      if (!matchedProjectId) return null;
      return path.join(getProjectLibraryDir(matchedProjectId), path.basename(match[2]));
    }
    if (mediaUrl.startsWith('/library/')) {
      return path.join(getProjectLibraryDir(projectId), path.basename(mediaUrl));
    }
    return null;
  };

  const resolveLocalLibraryFile = (rawUrl: unknown, projectId = defaultProjectId) => {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

    let parsed: URL;
    try {
      parsed = new URL(rawUrl, 'http://local');
    } catch {
      return null;
    }

    if (parsed.origin !== 'http://local') return null;
    return resolveLibraryFile(parsed.pathname, projectId);
  };

  const libraryUrlFor = (projectId: string, filename: string) => {
    return projectId === defaultProjectId ? `/library/${filename}` : `/projects/${projectId}/library/${filename}`;
  };

  const mediaUrlsFromLog = (log: any) => {
    const urls = Array.isArray(log?.mediaUrls) ? log.mediaUrls : [log?.mediaUrl].filter(Boolean);
    return urls.filter((url: unknown): url is string => typeof url === 'string');
  };

  const removeUnreferencedMedia = async (projectId: string, removedLogs: any[], remainingLogs: any[]) => {
    const remainingUrls = new Set(remainingLogs.flatMap(mediaUrlsFromLog));
    for (const log of removedLogs) {
      for (const mediaUrl of mediaUrlsFromLog(log)) {
        if (remainingUrls.has(mediaUrl)) continue;
        const filePath = resolveLibraryFile(mediaUrl, projectId);
        if (!filePath) continue;
        const relativePath = path.relative(getProjectLibraryDir(projectId), filePath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;
        await fs.unlink(filePath).catch(() => {});
      }
    }
  };

  app.post('/api/reveal-file', async (req, res) => {
    const projectId = safeProjectId(req.body?.projectId) || defaultProjectId;
    const filePath = resolveLocalLibraryFile(req.body?.url, projectId);
    if (!filePath) {
      return res.status(400).json({ error: 'Only saved local library files can be revealed in Finder.' });
    }
    if (process.platform !== 'darwin') {
      return res.status(501).json({ error: 'Reveal in Finder is only available on macOS.' });
    }

    try {
      const fileStats = await fs.stat(filePath);
      if (!fileStats.isFile()) {
        return res.status(400).json({ error: 'Only saved local media files can be revealed in Finder.' });
      }
      await execFileAsync('open', ['-R', filePath]);
      return res.json({ ok: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({ error: 'Saved local media file was not found.' });
      }
      console.error('Reveal file error:', error);
      return res.status(500).json({ error: 'Unable to reveal file in Finder.' });
    }
  });

  app.get('/api/projects', async (_req, res) => {
    res.json({ projects: await listProjects(), defaultProjectId });
  });

  app.post('/api/projects', async (req, res) => {
    const id = `p_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
    const project = await ensureProject(id, req.body?.name || 'Untitled Project');
    res.json({ project });
  });

  app.patch('/api/projects/:projectId', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });

    const meta = await readJson(getProjectMetaPath(projectId), null);
    if (!meta?.id) return res.status(404).json({ error: 'Project not found' });

    const next = { ...meta, name: safeProjectName(req.body?.name), updatedAt: new Date().toISOString() };
    await fs.writeFile(getProjectMetaPath(projectId), JSON.stringify(next, null, 2));
    res.json({ project: next });
  });

  app.get('/api/projects/:projectId/history', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    await ensureProject(projectId);
    res.json({ logs: await readHistory(projectId) });
  });

  app.put('/api/projects/:projectId/history', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
    await writeHistory(projectId, logs);
    res.json({ ok: true });
  });

  app.put('/api/projects/:projectId/history/:id', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    const logId = typeof req.params.id === 'string' ? req.params.id : '';
    const log = req.body?.log;
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!logId || logId.length > 200) return res.status(400).json({ error: 'Invalid history id' });
    if (!log || typeof log !== 'object' || Array.isArray(log) || log.id !== logId) {
      return res.status(400).json({ error: 'A matching history log is required' });
    }

    await withHistoryWrite(projectId, async () => {
      const logs = await readHistory(projectId);
      const index = logs.findIndex((item: any) => item?.id === logId);
      const nextLogs = index === -1
        ? [log, ...logs]
        : logs.map((item: any, itemIndex: number) => itemIndex === index ? log : item);
      await writeHistoryFile(projectId, nextLogs);
    });

    res.json({ ok: true });
  });

  app.delete('/api/projects/:projectId/history', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });

    await withHistoryWrite(projectId, async () => {
      const currentLogs = await readHistory(projectId);
      await removeUnreferencedMedia(projectId, currentLogs, []);
      await writeHistoryFile(projectId, []);
    });
    res.json({ logs: [] });
  });

  app.delete('/api/projects/:projectId/history/:id', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });

    const nextLogs = await withHistoryWrite(projectId, async () => {
      const logs = await readHistory(projectId);
      const removed = logs.filter((log: any) => log.id === req.params.id);
      const nextLogs = logs.filter((log: any) => log.id !== req.params.id);
      await removeUnreferencedMedia(projectId, removed, nextLogs);
      await writeHistoryFile(projectId, nextLogs);
      return nextLogs;
    });
    res.json({ logs: nextLogs });
  });

  app.post('/api/projects/:projectId/library/save-url', async (req, res) => {
    try {
      const projectId = safeProjectId(req.params.projectId);
      if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
      await ensureProject(projectId);

      const { url, type } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }
      if (url.startsWith('/library/') || url.startsWith('/projects/')) {
        return res.json({ url });
      }

      const response = await fetchRemoteUrl(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch media: ${response.statusText}` });
      }

      const contentType = response.headers.get('content-type');
      const urlExt = getExtensionFromUrl(url, type);
      const ext = urlExt || getExtensionFromContentType(contentType, type);
      const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const buffer = await readResponseBuffer(response);
      await fs.writeFile(path.join(getProjectLibraryDir(projectId), filename), buffer);

      res.json({ url: libraryUrlFor(projectId, filename) });
    } catch (error) {
      console.error('Project library save error:', error);
      const response = getRemoteMediaError(error, 'Failed to save media locally');
      res.status(response.status).json({ error: response.message });
    }
  });

  app.get('/api/history', async (_req, res) => {
    res.json({ logs: await readHistory(defaultProjectId) });
  });

  app.put('/api/history', async (req, res) => {
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
    await writeHistory(defaultProjectId, logs);
    res.json({ ok: true });
  });

  app.delete('/api/history/:id', async (req, res) => {
    const nextLogs = await withHistoryWrite(defaultProjectId, async () => {
      const logs = await readHistory(defaultProjectId);
      const removed = logs.filter((log: any) => log.id === req.params.id);
      const nextLogs = logs.filter((log: any) => log.id !== req.params.id);
      await removeUnreferencedMedia(defaultProjectId, removed, nextLogs);
      await writeHistoryFile(defaultProjectId, nextLogs);
      return nextLogs;
    });
    res.json({ logs: nextLogs });
  });

  app.post('/api/library/save-url', async (req, res) => {
    try {
      const { url, type } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }
      if (url.startsWith('/library/') || url.startsWith('/projects/')) {
        return res.json({ url });
      }

      const response = await fetchRemoteUrl(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch media: ${response.statusText}` });
      }

      const contentType = response.headers.get('content-type');
      const urlExt = getExtensionFromUrl(url, type);
      const ext = urlExt || getExtensionFromContentType(contentType, type);
      const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const buffer = await readResponseBuffer(response);
      await fs.writeFile(path.join(getProjectLibraryDir(defaultProjectId), filename), buffer);

      res.json({ url: `/library/${filename}` });
    } catch (error) {
      console.error('Library save error:', error);
      const response = getRemoteMediaError(error, 'Failed to save media locally');
      res.status(response.status).json({ error: response.message });
    }
  });

  // Proxy route for downloading files to bypass CORS
  app.get('/api/download', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).send('URL is required');
      }

      const filename = safeDownloadFilename(req.query.filename);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      if (targetUrl.startsWith('/library/') || targetUrl.startsWith('/projects/')) {
        const filePath = resolveLibraryFile(targetUrl, defaultProjectId);
        if (!filePath) return res.status(404).send('File not found');
        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        const contentType = ext === 'mp4'
          ? 'video/mp4'
          : ext === 'webm'
            ? 'video/webm'
            : ext === 'mov'
              ? 'video/quicktime'
              : ext === 'jpg' || ext === 'jpeg'
                ? 'image/jpeg'
                : ext === 'webp'
                  ? 'image/webp'
                  : 'image/png';
        res.setHeader('Content-Type', contentType);
        const buffer = await fs.readFile(filePath);
        return res.send(buffer);
      }

      if (targetUrl.startsWith('data:')) {
        const { contentType, buffer } = decodeBase64DataUrl(targetUrl);
        res.setHeader('Content-Type', contentType);
        return res.send(buffer);
      }

      const absoluteTargetUrl = targetUrl.startsWith('/')
        ? new URL(targetUrl, `${req.protocol}://${req.get('host')}`).toString()
        : targetUrl;

      const response = await fetchRemoteUrl(absoluteTargetUrl);
      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch file: ${response.statusText}`);
      }

      assertResponseSize(response);
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Stream the response to the client
      if (response.body) {
        let bytesSent = 0;
        (async () => {
          try {
             // using web streams properly in node 18+
             for await (const chunk of response.body as any) {
               const buffer = Buffer.from(chunk);
               bytesSent += buffer.length;
               if (bytesSent > MAX_REMOTE_MEDIA_BYTES) {
                 res.destroy(new Error('Remote media is too large'));
                 return;
               }
               res.write(buffer);
             }
             res.end();
          } catch(e) {
             if (!res.destroyed) res.destroy(e as Error);
          }
        })();
      } else {
        const buffer = await readResponseBuffer(response);
        res.send(buffer);
      }
    } catch (error) {
      console.error('Download error:', error);
      const response = getRemoteMediaError(error, 'Failed to download file');
      if (!res.headersSent) res.status(response.status).send(response.message);
    }
  });

  // Upload temp file for APIs that require public URLs
  app.post('/api/upload-temp', async (req, res) => {
    try {
      const { dataUrl } = req.body;
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return res.status(400).json({ error: 'Valid dataUrl is required' });
      }

      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Invalid data URL format' });
      }

      const mimeType = matches[1];
      const ext = mimeType.split('/')[1] || 'bin';
      const filename = `kie-media-${Date.now()}.${ext}`;

      let apiKey = '';
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.split(' ')[1];
      }
      if (!apiKey) {
        apiKey = process.env.KIE_API_KEY || '';
      }
      if (!apiKey) {
        return res.status(401).json({ error: 'KIE_API_KEY is required for Kie file uploads.' });
      }

      const response = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64Data: dataUrl,
          uploadPath: 'kai-media-studio',
          fileName: filename,
        }),
      });

      if (!response.ok) {
        throw new Error(`Kie file upload returned ${response.status}`);
      }

      const result = await response.json();
      const uploadedUrl = result.data?.downloadUrl || result.data?.fileUrl;
      if (result.code === 200 && uploadedUrl) {
        return res.json({ url: uploadedUrl });
      } else {
        throw new Error(result.msg || 'Failed to parse Kie file upload response');
      }
    } catch (error) {
       console.error('Temp upload error:', error);
       res.status(500).json({ error: 'Failed to upload file to Kie' });
    }
  });

  // Kie AI Proxy route
  app.all('/api/kie/:endpoint(*)', async (req, res) => {
    try {
      // 1. Try to get key from client request header (Authorization: Bearer XXX)
      let apiKey = '';
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.split(' ')[1];
      }
      
      // 2. Fallback to server environment variable
      if (!apiKey) {
        apiKey = process.env.KIE_API_KEY || '';
      }

      if (!apiKey) {
        return res.status(401).json({ error: 'KIE_API_KEY is not set. Please provide it in the API settings or environment variables.' });
      }

      const { endpoint } = req.params;
      const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const kieUrl = `https://api.kie.ai/${endpoint}${queryStr}`;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        }
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(req.body);
      }

      console.log(`Proxying ${req.method} request to ${kieUrl}...`);

      const response = await fetch(kieUrl, fetchOptions);

      // Parse JSON safely
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse JSON response from Kie.ai:', responseText);
        return res.status(response.status).send(responseText);
      }

      res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying to Kie.ai:', error);
      res.status(500).json({ error: 'Internal server error while calling Kie.ai' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const HOST = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
    console.warn(`Server is listening on ${HOST}; this exposes local project and proxy routes beyond this machine.`);
  }
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
