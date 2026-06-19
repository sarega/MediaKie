import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

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

  const writeHistory = async (projectId: string, logs: unknown[]) => {
    await ensureProject(projectId);
    await fs.writeFile(getProjectHistoryPath(projectId), JSON.stringify({ logs }, null, 2));
    const meta = await readJson(getProjectMetaPath(projectId), null);
    if (meta?.id) {
      await fs.writeFile(getProjectMetaPath(projectId), JSON.stringify({ ...meta, updatedAt: new Date().toISOString() }, null, 2));
    }
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

  const libraryUrlFor = (projectId: string, filename: string) => {
    return projectId === defaultProjectId ? `/library/${filename}` : `/projects/${projectId}/library/${filename}`;
  };

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

  app.delete('/api/projects/:projectId/history', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });

    const logs = await readHistory(projectId);
    for (const log of logs) {
      const urls = Array.isArray(log.mediaUrls) ? log.mediaUrls : [log.mediaUrl].filter(Boolean);
      for (const mediaUrl of urls) {
        if (typeof mediaUrl === 'string') {
          const filePath = resolveLibraryFile(mediaUrl, projectId);
          if (filePath) await fs.unlink(filePath).catch(() => {});
        }
      }
    }

    await writeHistory(projectId, []);
    res.json({ logs: [] });
  });

  app.delete('/api/projects/:projectId/history/:id', async (req, res) => {
    const projectId = safeProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });

    const logs = await readHistory(projectId);
    const removed = logs.filter((log: any) => log.id === req.params.id);
    const nextLogs = logs.filter((log: any) => log.id !== req.params.id);

    for (const log of removed) {
      const urls = Array.isArray(log.mediaUrls) ? log.mediaUrls : [log.mediaUrl].filter(Boolean);
      for (const mediaUrl of urls) {
        if (typeof mediaUrl === 'string') {
          const filePath = resolveLibraryFile(mediaUrl, projectId);
          if (filePath) await fs.unlink(filePath).catch(() => {});
        }
      }
    }

    await writeHistory(projectId, nextLogs);
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

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch media: ${response.statusText}` });
      }

      const contentType = response.headers.get('content-type');
      const urlExt = getExtensionFromUrl(url, type);
      const ext = urlExt || getExtensionFromContentType(contentType, type);
      const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(path.join(getProjectLibraryDir(projectId), filename), buffer);

      res.json({ url: libraryUrlFor(projectId, filename) });
    } catch (error) {
      console.error('Project library save error:', error);
      res.status(500).json({ error: 'Failed to save media locally' });
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
    const logs = await readHistory(defaultProjectId);
    const removed = logs.filter((log: any) => log.id === req.params.id);
    const nextLogs = logs.filter((log: any) => log.id !== req.params.id);

    for (const log of removed) {
      const urls = Array.isArray(log.mediaUrls) ? log.mediaUrls : [log.mediaUrl].filter(Boolean);
      for (const mediaUrl of urls) {
        if (typeof mediaUrl === 'string') {
          const filePath = resolveLibraryFile(mediaUrl, defaultProjectId);
          if (filePath) await fs.unlink(filePath).catch(() => {});
        }
      }
    }

    await writeHistory(defaultProjectId, nextLogs);
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

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch media: ${response.statusText}` });
      }

      const contentType = response.headers.get('content-type');
      const urlExt = getExtensionFromUrl(url, type);
      const ext = urlExt || getExtensionFromContentType(contentType, type);
      const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(path.join(getProjectLibraryDir(defaultProjectId), filename), buffer);

      res.json({ url: `/library/${filename}` });
    } catch (error) {
      console.error('Library save error:', error);
      res.status(500).json({ error: 'Failed to save media locally' });
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
        const matches = targetUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).send('Invalid data URL format');
        }
        res.setHeader('Content-Type', matches[1]);
        return res.send(Buffer.from(matches[2], 'base64'));
      }

      const absoluteTargetUrl = targetUrl.startsWith('/')
        ? new URL(targetUrl, `${req.protocol}://${req.get('host')}`).toString()
        : targetUrl;

      const response = await fetch(absoluteTargetUrl, {
        headers: {
          'User-Agent': 'kai-media-studio/1.0',
          'Accept': '*/*',
        },
      });
      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch file: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Stream the response to the client
      if (response.body) {
        (async () => {
          try {
             // using web streams properly in node 18+
             for await (const chunk of response.body as any) {
               res.write(chunk);
             }
             res.end();
          } catch(e) {
             res.end();
          }
        })();
      } else {
        res.end();
      }
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).send('Failed to download file');
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
