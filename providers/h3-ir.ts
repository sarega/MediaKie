import {createHash} from 'node:crypto';
import type {Express} from 'express';

const serviceUrl = () => (process.env.H3_IR_URL || 'http://127.0.0.1:8420').replace(/\/$/, '');

const requestH3 = async (path: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.H3_IR_TIMEOUT_MS || 180_000));
  try {
    return await fetch(`${serviceUrl()}${path}`, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timeout);
  }
};

const decodeDataUrl = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('H3 reference media must be an uploaded file');
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('H3 reference media must be uploaded again before enhancing');
  return match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
};

const readError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return body?.detail?.message || body?.error || `open-h3-ir returned ${response.status}`;
};

export const installH3Enhancer = (app: Express) => {
  app.get('/api/h3-ir/status', async (_req, res) => {
    try {
      const response = await requestH3('/health');
      const body = await response.json().catch(() => ({}));
      res.status(response.ok ? 200 : 503).json({available: response.ok, service: serviceUrl(), ...body});
    } catch (error: any) {
      res.status(503).json({available: false, service: serviceUrl(), error: error.name === 'AbortError' ? 'open-h3-ir timed out' : 'open-h3-ir is not running'});
    }
  });

  app.post('/api/h3-ir/compile', async (req, res) => {
    try {
      const {intent, seconds = 6, aspect = '16:9', creativity = 'balanced', assets = []} = req.body || {};
      if (typeof intent !== 'string' || !intent.trim()) return res.status(400).json({error: 'Enter a prompt before enhancing it'});
      if (!['restrained', 'balanced', 'bold', 'extreme'].includes(creativity)) return res.status(400).json({error: 'Unknown H3 creativity setting'});
      if (!Array.isArray(assets) || assets.length > 15) return res.status(400).json({error: 'Too many H3 reference assets'});

      const uploaded = [];
      for (const asset of assets) {
        if (!asset || !['image', 'video', 'audio'].includes(asset.kind)) return res.status(400).json({error: 'Unsupported H3 reference asset'});
        const bytes = decodeDataUrl(asset.dataUrl);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const upload = await requestH3(`/v1/assets/${sha256}`, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: bytes});
        if (!upload.ok && upload.status !== 409) throw new Error(await readError(upload));
        uploaded.push({sha256, kind: asset.kind, ...(asset.role ? {role: asset.role} : {}), ...(asset.note ? {note: String(asset.note).slice(0, 500)} : {})});
      }

      const response = await requestH3('/v1/briefs', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({intent: intent.trim(), seconds: Number(seconds) || 6, aspect: aspect === 'adaptive' ? '16:9' : aspect, creativity, assets: uploaded}),
      });
      if (!response.ok) return res.status(response.status === 422 ? 422 : 502).json({error: await readError(response)});
      const body: any = await response.json();
      const enhancedPrompt = body?.ir?.prompt;
      if (typeof enhancedPrompt !== 'string' || !enhancedPrompt.trim()) return res.status(502).json({error: 'open-h3-ir returned no compiled prompt'});
      res.json({id: body.id, status: body.status, prompt: enhancedPrompt, presentation: body.presentation, plan: body.plan, diagnostics: body.ir?.diagnostics || [], target: body.ir?.target});
    } catch (error: any) {
      res.status(error.name === 'AbortError' ? 504 : 503).json({error: error.name === 'AbortError' ? 'open-h3-ir timed out' : error.message || 'open-h3-ir is unavailable'});
    }
  });
};
