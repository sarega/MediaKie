# Kai Media Studio

Kai Media Studio is a local creative studio for generating images and videos through Kie.ai and Higgsfield, with provider routing and a shared model registry.

## Creative studio update

Navigation is now Home, Image, Video, Library, Projects and Settings. Create from a bottom composer with model search and contextual controls; open Parameters or Activity only when needed. The result inspector supports download, remix and compatible image-to-video/reference/edit/frame workflows.

To animate a saved image: open **Library → Images → Animate → I2V**, choose a model from the filtered browser, describe the movement and Generate. **Use as reference** selects reference-to-video instead. You can also select the workflow in the composer and upload a starting image or first/last frames directly.

Library supports image/video, status and text filters. Video posters are cached automatically using an existing `ffmpeg` installation (`FFMPEG_PATH` may override its location); browser frame loading is the fallback.

Configure Kie.ai and Higgsfield under **Settings → Providers**, or set server environment variables. Higgsfield uses `HF_API_KEY_ID` plus `HF_API_KEY_SECRET` (or `HF_CREDENTIALS=key-id:key-secret`). Secrets are never returned by the settings API. Legacy browser Kie keys migrate to server storage on first successful load.

See [Architecture and migration notes](docs/ARCHITECTURE.md) for adapters, registry, schemas, routing, queue recovery, cost semantics, verified API sources and how to add providers/models. Soul 2, Soul Standard and a shared Kling 2.5 Pro I2V route are enabled; Soul Cinema remains disabled pending verified API schema.

```bash
npm run lint
npm test
npm run build
npm run check:improvements
```

The tests mock provider calls and do not generate paid media. Existing history and media remain in place. Back up `data/` before upgrading. New durable jobs/settings use additional JSON files in that directory; no SQL migration is necessary.

## Version

Current version: `2.0.0`

## What is included

- Text-to-image, image-to-image, text-to-video, image-to-video, and video-to-video workspaces
- Kie API key setup from `.env.local` or the in-app settings panel
- Model and parameter settings that stay saved after reload
- Optional video autoplay setting
- Credit counter refresh after reloads and completed generations
- Project-based activity history
- Project management with rename, ZIP backup export, and confirmed clearing of project history and local media
- Searchable model/workflow browser with vendor and API-provider metadata
- Google Omni, Seedance, Kling, Veo, and Nano Banana model grouping labels
- Simple video editor for assembling, trimming, splitting, previewing, and exporting generated clips
- Reveal saved generated files in Finder directly from the result and Activity Log

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

   The server listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` only when you intentionally want to expose the app on your local network and have added appropriate access control.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the local app:

   ```text
   http://127.0.0.1:3000
   ```

6. Choose a mode, select a model, add your prompt or media input, then generate.

## Build for production

```bash
npm run build
npm run start
```

Run the isolated improvement checks after a build:

```bash
npm run check:improvements
```

## Update log

### Unreleased

- No unreleased changes.

### 2.0.0 — 2026-09-22

- Added a shared provider adapter layer for Kie.ai and Higgsfield with normalized submission, polling, results, errors, health, cancellation and costs.
- Added a provider-independent model registry, capability schemas and schema-driven controls for image, video, reference, frame and editing workflows.
- Added provider routing policies for Auto, Manual, Lowest cost, Preferred and Fastest/preferred, with durable provider-neutral generation jobs and restart recovery.
- Redesigned the app around Home, Image, Video, Library, Projects and Settings with a bottom generation composer and on-demand model, parameter and activity panels.
- Separated new-creation pages from saved work: Image and Video now open in a clean Ready state, while prior generations stay in Library and Activity until explicitly inspected.
- Added searchable workflow-aware model browsing and direct Image → Animate, Use as reference, first-frame and last-frame paths.
- Added reliable local thumbnails and cached video posters, plus media, workflow, status and text filters.
- Added per-item deletion, multi-select, filtered select-all, bulk deletion and selected-media ZIP export with a metadata manifest.
- Added project rename, full backup export and confirmed project clearing while preserving media still referenced by remaining history.
- Added stalled-job recovery, status rechecks and local stop-tracking controls so abandoned tasks no longer block the workspace.
- Added secure multi-provider credential settings, provider connection state, priority, concurrency and spend-cap controls.
- Added a Reveal in Finder action for generated media saved in the local project library.
- Added provider, routing, cost, polling, media workflow, thumbnail and generation recovery checks.

### 1.4.0 — 2026-09-02

- Updated the Kie model catalog and credit estimates, including current image and video models.
- Added parallel generation workflow: submit another job while earlier Kie tasks are processing.
- Made Activity Log items selectable so completed or running jobs can be viewed in the main workspace.
- Refresh credits automatically while jobs are running and as soon as each job completes.

### 1.3.0 — 2026-08-03

- Added Light and Dark theme selection in Settings with saved preferences.
- Added PixVerse V6 and MiniMax H3 modes with live generation cost estimates.
- Kept model Parameters open by default.

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
