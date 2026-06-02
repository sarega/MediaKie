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
  return fallbackType === 'video' ? 'mp4' : 'png';
};

const getExtensionFromUrl = (url: string, fallbackType?: string) => {
  try {
    const pathname = new URL(url, 'http://local').pathname;
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {}
  return fallbackType === 'video' ? 'mp4' : 'png';
};

const safeDownloadFilename = (filename: unknown) => {
  const raw = typeof filename === 'string' && filename.trim() ? filename : 'download';
  return raw.replace(/[\r\n"]/g, '').replace(/[\\/]/g, '-').slice(0, 180) || 'download';
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const dataDir = path.join(process.cwd(), 'data');
  const libraryDir = path.join(dataDir, 'library');
  const historyPath = path.join(dataDir, 'history.json');

  await fs.mkdir(libraryDir, { recursive: true });

  app.use(express.json({ limit: '50mb' })); // Support large base64/image payloads
  app.use('/library', express.static(libraryDir));

  const readHistory = async () => {
    try {
      const raw = await fs.readFile(historyPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.logs) ? parsed.logs : [];
    } catch {
      return [];
    }
  };

  const writeHistory = async (logs: unknown[]) => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(historyPath, JSON.stringify({ logs }, null, 2));
  };

  app.get('/api/history', async (_req, res) => {
    res.json({ logs: await readHistory() });
  });

  app.put('/api/history', async (req, res) => {
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
    await writeHistory(logs);
    res.json({ ok: true });
  });

  app.delete('/api/history/:id', async (req, res) => {
    const logs = await readHistory();
    const removed = logs.filter((log: any) => log.id === req.params.id);
    const nextLogs = logs.filter((log: any) => log.id !== req.params.id);

    for (const log of removed) {
      const urls = Array.isArray(log.mediaUrls) ? log.mediaUrls : [log.mediaUrl].filter(Boolean);
      for (const mediaUrl of urls) {
        if (typeof mediaUrl === 'string' && mediaUrl.startsWith('/library/')) {
          await fs.unlink(path.join(libraryDir, path.basename(mediaUrl))).catch(() => {});
        }
      }
    }

    await writeHistory(nextLogs);
    res.json({ logs: nextLogs });
  });

  app.post('/api/library/save-url', async (req, res) => {
    try {
      const { url, type } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }
      if (url.startsWith('/library/')) {
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
      await fs.writeFile(path.join(libraryDir, filename), buffer);

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

      if (targetUrl.startsWith('/library/')) {
        const filePath = path.join(libraryDir, path.basename(targetUrl));
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
          'User-Agent': 'kie-media-studio/1.0',
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
          uploadPath: 'kie-media-studio',
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
