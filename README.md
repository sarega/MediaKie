# Kai Media Studio

Kai Media Studio is a local creative studio for generating images, videos and speech through Kie.ai and Higgsfield, with provider routing and a shared model registry.

## Creative studio update

Navigation is now Home, Image, Video, Audio, Studio, Library, Projects and Settings. Create from a bottom composer with model search and contextual controls; open Parameters or Activity only when needed. The result inspector supports download, remix and compatible image-to-video/reference/edit/frame workflows.

To animate a saved image: open **Library → Images → Animate → I2V**, choose a model from the filtered browser, describe the movement and Generate. **Use as reference** selects reference-to-video instead. You can also select the workflow in the composer and upload a starting image or first/last frames directly.

Library now stores imported images, videos and audio alongside individual generated outputs. Import media, rename assets, assign character/location/style/storyboard/video/voice/music roles, add tags and filter by type, role or source. Open asset details to reuse media as a compatible generation input. Select assets for ZIP export or deletion; files still used as recorded generation inputs are protected. Recent generations and running jobs remain in Home/Activity.

Project backups include `production.json` and local media. Clearing generation history retains imported assets. Library metadata uses revision checks; if another tab changes it, reload the library before retrying an edit. Video posters use an existing `ffmpeg` installation (`FFMPEG_PATH` may override its location); optional technical metadata uses `ffprobe` (`FFPROBE_PATH` may override its location). No new dependency is required.

**Studio → Overview / Board / Edit** adds saved scenes and shots, named references, direction fields, model parameters with request JSON, cost-confirmed batch generation, take notes and explicit approvals. Save project edits; unsaved drafts survive navigation in the same browser session. New takes never replace approvals or existing sequence clips. Assets referenced by the Board, take notes or sequence cannot be deleted through Library or Activity.

In Edit, append approved takes or choose Library clips, reorder/trim/split them and place voice/music with offsets, volume and mute. Export a local MP4 with audio using installed FFmpeg + ffprobe, or download a delivery ZIP containing original selected media and a JSON edit manifest. Completed MP4s and sequence provenance are saved to Library. Render tracking is local and transient: after a server restart, export again; provider generation jobs remain durable. Delivery ZIPs are not native Premiere/Resolve projects.

Configure Kie.ai and Higgsfield under **Settings → Providers**, or set server environment variables. Higgsfield uses `HF_API_KEY_ID` plus `HF_API_KEY_SECRET` (or `HF_CREDENTIALS=key-id:key-secret`). Secrets are never returned by the settings API. Legacy browser Kie keys migrate to server storage on first successful load.

See [Architecture and migration notes](docs/ARCHITECTURE.md) for adapters, registry, schemas, routing, queue recovery, cost semantics, verified API sources and how to add providers/models. Soul 2, Soul Standard and a shared Kling 2.5 Pro I2V route are enabled; Soul Cinema remains disabled pending verified API schema.

```bash
npm run lint
npm test
npm run build
npm run check:improvements
npm run check:library
npm run check:production
```

The tests mock provider calls and do not generate paid media. Existing history and media remain in place. Back up `data/` before upgrading. New durable jobs/settings use additional JSON files in that directory; no SQL migration is necessary.

## Version

Production workflow roadmap and phase handoff: [Production Workflow Handoff](docs/PRODUCTION_WORKFLOW_HANDOFF.md).

Current version: `2.3.0`

## What is included

- Text-to-image, image-to-image, text-to-video, image-to-video, video-to-video and text-to-speech workspaces
- Kie API key setup from `.env.local` or the in-app settings panel
- Project-specific last-used models and workflows for Image, Video, and Audio
- Favorite models with star controls and a Favorites filter in the model browser
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

### MiniMax H3 Prompt Director (optional)

MiniMax H3 models show **Original**, **H3 Enhanced**, and **A/B Compare** prompt modes. Enhancement uses the [open-h3-ir](https://github.com/ruashots/open-h3-ir) compiler through its local HTTP API; other models never use it.

```bash
python3 -m venv .venv-h3ir
.venv-h3ir/bin/pip install open-h3-ir
# Configure H3IR_LLM_URL and H3IR_LLM_MODEL for an OpenAI-compatible chat-completions model.
.venv-h3ir/bin/h3ir serve --host 127.0.0.1 --port 8420
```

Set `H3_IR_URL` only when the service runs elsewhere. The app uploads references to the compiler, previews its shot plan, and stores the original and compiled prompts with each generation. A/B submits two paid MiniMax generations, so the composer shows the doubled credit estimate before submission. If the compiler is unavailable, switch back to **Original**.

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

### 2.3.0 — 2026-11-03

- Added Production Studio with scenes, shots, reusable references, generation takes, explicit approvals and saved project drafts.
- Added sequence editing, trimming/splitting, voice/music placement, local FFmpeg MP4 export and delivery ZIPs with edit manifests.
- Expanded Library to imported and generated image/video/audio assets, roles, tags, rename, reuse, protected deletion and project backups.
- Added Library image selection and video-frame capture for first/last/reference inputs, plus collapsible controls for larger previews on small screens.
- Updated existing Kie model wire IDs, Veo market requests with legacy job recovery, input validation, fractional credit estimates and public-price fixtures.
- Added Kling 4.0 text, first/middle/last keyframe and image/video reference workflows, 3–30 second duration, 720p/1080p and current Kie pricing with source-video billing rules.
- Added offline API/pricing regressions and isolated production/library workflow checks. Named Kling 4.0 elements/voices remain unsupported; paid provider generation has not been tested.

### 2.2.0 — 2026-10-02

- Remembered the last model and workflow independently for each project and each Image, Video, and Audio workspace.
- Added starred favorite models, a Favorites-only filter, and favorite-first model sorting.

### 2.1.0 — 2026-10-01

- Added an Audio workspace for Gemini and ElevenLabs text-to-speech with voice lists, speaking direction and provider-ready inputs.
- Restored the live Kie credit balance in the persistent sidebar.
- Added an optional open-h3-ir Prompt Director for MiniMax H3 with original, enhanced and paid A/B generation modes, shot-plan preview, reference upload and comparison labels.

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

### Kie API / pricing snapshot (2026-10-24)

Existing models use the current Kie wire IDs and Veo market API for new jobs. Persisted legacy Veo jobs retain their original polling route. Credit estimates preserve fractional credits and include verified source-duration/HD costs; unknown input dimensions, auto durations and unpublished rates remain unknown. Audio shows published unit rates; final charges are recorded only when Kie reports `creditsConsumed`.

`npm run check:kie-api` verifies request migration with mocks. `npm run check:credits` also checks 86 public-price fixtures dated 2026-10-24. No paid provider calls are needed. See [the catalog review and implementation notes](docs/KIE_CATALOG_REVIEW_2026-10-24.md).

### Preview on smaller screens

In the Image/Video workspace, **Hide controls** collapses the prompt, uploads and generation settings so the preview can use the available height. **Show controls** restores the same draft. **New creation** opens the controls again. Single results fit the preview area; multiple results keep their scrolling grid.

Layout regression check (use an isolated completed-video fixture): at 1280×720, hide controls and confirm the video grows within the viewport; restore controls and confirm prompt, duration and resolution are unchanged. Check Enter on the toggle, New creation reopening the controls, and no horizontal overflow at 640×720. Verified in Chrome with a local MP4 and no paid generation.

### Reusing images and video frames

- Each image input offers **Library / Video frame** alongside **Upload**. Choose a project image or open a project video, seek to a still (or use **Start of clip / End of clip**), and press **Use this frame** to fill that input.
- **Use video frame…** on a result or Library video starts at the current preview position. After capturing, choose **First frame**, **End frame** or **Reference image**, then a compatible destination model. **Send image to model…** does the same for Library images. Sending fills the input without starting generation.
- Reference inputs append images up to the model's limit; single-frame inputs replace their own image. Switching workflows within the same model keeps attached files. Cross-model transfers preserve the requested role rather than silently converting an end frame to a first frame.

The picker uses the current project's Library. Remote videos must allow browser frame extraction; otherwise import the downloaded clip into Library first. Captured stills remain in the current draft until used for generation.

`npm run check:media` covers role mapping, reference-only models, file limits and end-of-clip time boundaries. Chrome fixture checks cover independent first/end inputs, cross-model end-frame routing, captured plus Library reference arrays in JSON, current-playhead preservation, Escape, and 1280×720 / 640×720 layouts. No paid provider generation is included.

### Kling update — 2026-11-03

Kling 4.0 is available under Video: Text to Video, Keyframes (first/middle/last), and Reference (up to 10 images and 5 videos, 15 combined). Duration: 3–30 seconds; resolutions: 720p / 1080p. Mention supplied inputs as `@first_frame`, `@keyframe_1`, `@last_frame`, `@image_1` or `@video_1`. Keyframes require a first frame when any frames are supplied, with at most min(duration + 1, 10) total frames. Named elements/voice references are not exposed in this workspace yet. Reference video clips must each be 2–30 seconds; check source clips before submitting.

Verified against https://kie.ai/pricing and https://docs.kie.ai/market/kling/v4-keyframe-to-video and https://docs.kie.ai/market/kling/v4-reference-to-video:

| Kling 4.0 | 720p credits/second | 1080p credits/second |
| --- | ---: | ---: |
| Text, keyframes, references without video | 28.5 | 42.5 |
| References with video | 17 | 25.5 |

With video, billed seconds = max(total input video seconds, output seconds) + output seconds. Unknown source duration yields an unknown estimate. These are Kie credits, not Kling subscription credits. Existing Kling 2.6, 3.0, O3 text/image and Turbo rates match their current Kie model pages; their values remain unchanged. Offline request/pricing regressions run in `check:kie-api`; no paid generation was used for verification.
