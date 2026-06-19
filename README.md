# Kai Media Studio

Kai Media Studio is a local web app for generating images and videos with Kie.ai models.

## Version

Current version: `1.2.0`

## What is included

- Text-to-image, image-to-image, text-to-video, image-to-video, and video-to-video workspaces
- Kie API key setup from `.env.local` or the in-app settings panel
- Model and parameter settings that stay saved after reload
- Optional video autoplay setting
- Credit counter refresh after reloads and completed generations
- Project-based activity history
- Use Case and Provider model browsing with search
- Google Omni, Seedance, Kling, Veo, and Nano Banana model grouping labels
- Simple video editor for assembling, trimming, splitting, previewing, and exporting generated clips

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

### 1.2.0 — 2026-06-19

- Added collapsible, resizable model and activity panes with saved layout preferences.
- Added an experimental Clypra editor host behind the `VITE_USE_CLYPRA_EDITOR=true` feature flag while retaining the existing editor by default.
- Added typed asset, project, native media, and export adapter contracts for the Clypra integration boundary.
- Added an isolated vendor-style Clypra module area without introducing new runtime dependencies.
- Kept Clypra export intentionally stubbed until the native export pipeline is connected.
- Reduced the clip controls inspector width and spacing in both editor implementations.

### 1.1.0 — 2026-06-19

- Added a Provider browsing tab alongside the existing Use Case categories.
- Added model search across model names, providers, modes, categories, and IDs.
- Added grouped labels for multi-mode model families such as Google Omni, Seedance, Kling, Veo, and Nano Banana Pro.
- Added Gemini Omni Audio voice selection while keeping name, voice description, and example dialogue inputs.
- Added Kling 3.0 Turbo text-to-video and image-to-video modes.
- Added a simple video editing mode with drag-and-drop clips from Activity Log, timeline ordering, trimming, splitting, preview, and WebM export.
- Fixed provider metadata for Nanobanana 2 and normalized Bytedance provider naming.

### 1.0.0 — 2026-06-19

- Renamed the app to Kai Media Studio.
- Removed old setup and branding references.
- Saved the last selected model and model settings after reload.
- Added a setting to turn video autoplay on or off.
- Stopped videos from autoplaying by default.
- Refreshed credits after app reloads and completed generations.
