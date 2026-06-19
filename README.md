# Kai Media Studio

Kai Media Studio is a local web app for generating images and videos with Kie.ai models.

## Version

Current version: `1.0.0`

## What is included

- Text-to-image, image-to-image, text-to-video, image-to-video, and video-to-video workspaces
- Kie API key setup from `.env.local` or the in-app settings panel
- Model and parameter settings that stay saved after reload
- Optional video autoplay setting
- Credit counter refresh after reloads and completed generations
- Project-based activity history

## How to use

1. Install Node.js.
2. Install dependencies:

   ```bash
   npm ci
   ```

3. Add your Kie API key in `.env.local`:

   ```bash
   KIE_API_KEY=your_api_key_here
   ```

   You can also enter the key inside the app settings.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the local app:

   ```text
   http://localhost:3000
   ```

6. Choose a mode, select a model, add your prompt or media input, then generate.

## Build for production

```bash
npm run build
npm run start
```

## Update log

### 1.0.0 — 2026-06-19

- Renamed the app to Kai Media Studio.
- Removed old setup and branding references.
- Saved the last selected model and model settings after reload.
- Added a setting to turn video autoplay on or off.
- Stopped videos from autoplaying by default.
- Refreshed credits after app reloads and completed generations.
