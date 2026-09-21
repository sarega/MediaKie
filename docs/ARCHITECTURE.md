# Provider-neutral creative studio

## Migration plan and completed stages

1. Preserve the existing Kie catalog, estimates, upload service, project files, editor and polling checks.
2. Introduce a shared registry and two server-side adapters. Extract Kie payload preparation without replacing its working model-specific behavior.
3. Route new jobs through a durable server queue; retain read-only legacy status/credit endpoints for old history.
4. Move credentials into server-only storage. Replace the four-column shell with navigation, workspace, bottom composer and on-demand drawers.
5. Verify contracts with mocked providers, storage/queue integration tests and local visual checks.

No database rewrite is needed: the app already uses JSON files. Existing `data/projects/`, media files and project history remain intact. New files are `data/providers.json` and `data/generation-jobs.json`; writes use atomic replacement and owner-only file permissions. Back up the whole `data/` folder before upgrading. These files are excluded from Git.

On first browser load, an existing `kie_client_api_key` is sent once to the same-origin server settings endpoint and removed from localStorage only after success. Environment credentials remain supported; a saved server credential takes precedence. Browser settings reads return connection metadata, never secrets. Blank credential fields retain existing values.

Old logs keep their original IDs and Kie task IDs. New history links to a provider-neutral job by `generationJobId`; `providerTaskId` is the upstream task ID. Missing history entries are recovered from the durable queue after reload. Hidden history does not resurrect on restart; its accounting record remains. Old Kie running jobs resume through the existing poller.

## Modules and contracts

- `providers/types.ts`: adapter contract, common status/output/error/cost types.
- `providers/kie.ts`, `providers/kie-input.ts`: Kie submit, status, health and legacy payload transformation, including separate Veo operations.
- `providers/higgsfield.ts`: documented Key ID/secret authentication, async lifecycle, normalized images/video/audio and queued cancellation. Lifecycle URLs must remain on the Higgsfield API origin.
- `providers/service.ts`: settings, upload, cost estimates, durable job storage, scheduler and cancellation. Uses local JSON storage and the existing Express server.
- `providers/routing.ts`: provider eligibility, manual choice, price comparison and preferred order. Fastest accepts latency observations but falls back to priority when data is absent.
- `src/models/registry.ts`: logical identity, vendor/family, workflow, provider mappings, schema-derived capabilities and pricing. `src/types.ts` retains existing Kie metadata and estimation formulas.
- `src/generation/client.ts`: provider-neutral job polling for the UI.
- `src/ui/composer/Controls.tsx`: compact controls generated from parameter metadata.
- `src/ui/drawers/ModelBrowser.tsx`: searchable logical model/workflow browser with provider and estimated pricing.

The adapter exposes catalog ingestion into the registry via `catalog()`, local estimation, preparation, submit, polling, normalized results and health. Cancellation is optional; Kie does not advertise it here. The normalization function also accepts provider result-shaped payloads for a future verified webhook handler. No unauthenticated webhook receiver is exposed in this localhost app.

The existing parameter descriptor is the capability schema: type, values, defaults, limits, media acceptance, multiplicity and description. `capabilitiesFor` provides semantic groups for ratio, resolution, duration, audio, seed, CFG, negative prompt, references, frames, motion, camera and output count. Uncommon options remain in the schema-driven Form drawer; JSON is a read-only request preview. Provider-specific schema overrides prevent controls being advertised where an upstream API cannot honor them. Auto uses the common parameter subset; explicit Kie retains its full controls.

## Routing and costs

Model vendors (for example Kuaishou) and API providers (Kie/Higgsfield) are distinct. A model mapping identifies the endpoint; logical identity identifies the user's choice. Workflow variants stay separate where their input requirements differ. Kling 2.5 Pro image-to-video demonstrates one logical model with both providers. The Higgsfield route supports a single image, with ratio inherited from that image; an explicit ratio or last frame makes that route ineligible.

Auto/Preferred use the configured order among supported, configured providers. Lowest Cost compares known USD estimates; unknown prices sort last. Fastest uses priority until sufficient measurements exist. There is no automatic retry through another provider after submission, because it could incur duplicate charges.

Kie estimates preserve the existing metadata at USD 0.005 per credit. Higgsfield Soul 2 uses the verified public resolution and batch-size price, while conflicting Soul Standard pricing is unknown. Every amount distinguishes `estimate` from `final`. Final cost remains absent when the provider does not report it. No documented estimate endpoint was verified for these Higgsfield models.

The optional cap is a conservative, installation-wide estimated budget covering new jobs in this queue, not the provider account or historic jobs. It reserves estimates at acceptance, counts failed/canceled reservations conservatively, and blocks unknown pricing. Provider-side billing limits remain separate. The queue enforces both total and per-provider concurrency. A task interrupted during submission becomes `unknown` and is not retried; inspect provider history before resubmitting. Unknown tasks reserve a concurrency slot to avoid silently oversubscribing an upstream job.

## Add a provider or model

1. Add an adapter implementing the shared contract, with fixed trusted API origins and server-only credential access. Prefer the platform fetch client; no SDK is required for these two integrations.
2. Add credential metadata/options to settings and wire the adapter into the service.
3. Add a logical registry entry or a mapping on an existing entry. Keep logical IDs stable when editing display labels. Record source URL and verification date; do not equate models merely because names look similar.
4. Reuse the existing parameter descriptors or add a mapping-specific schema when capabilities differ. Translate canonical inputs only in the adapter preparation step. Reject unsupported requested features rather than silently discarding them.
5. Add public-pricing metadata or call a verified estimate endpoint in the adapter. Unknown is preferable to an invented price. Add mocked contract tests and a schema/render check.

## Higgsfield verification (2026-09-21)

Primary sources:

- https://docs.higgsfield.ai/docs/llms.txt — use model-specific documents over the supplementary OpenAPI catalog.
- https://docs.higgsfield.ai/docs/concepts/requests — `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`; use returned lifecycle URLs; cancellation returns an empty 202 response.
- https://docs.higgsfield.ai/docs/concepts/file-uploads — generate-upload-url, PUT all returned headers, never forward credentials to storage.
- https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference — verified Soul 2 schema.
- https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/playground — public Soul 2 pricing.
- https://open.higgsfield.ai/models/higgsfield-ai/soul/standard/api-reference — Soul Standard schema; public pricing conflicts with the overview's headline, so no estimate is assumed.
- https://open.higgsfield.ai/models/kling-video/v2.5-turbo/pro/image-to-video/api-reference — verified video schema and public price.

Soul Cinema is represented as an unavailable registry entry because its model-specific API reference could not be verified. Product marketing confirms the model exists, but is not enough to infer an endpoint/schema. The supplementary OpenAPI's Soul Standard schema conflicts with current model docs; the model docs win. No user-account access or paid generation was tested.

## Current limits

This is a local, single-server application, not a multi-user service. Keep its default loopback binding. Server secrets are owner-readable files rather than an OS keychain. Webhook signature verification, remote deployment authentication, distributed queue locking, measured latency selection and provider-wide spend reconciliation require separate work before such deployment.

Completed outputs use the existing local library downloader while the app is open or on history recovery. Higgsfield retains remote output for at least seven days; leaving the UI closed longer can lose access to unarchived outputs. Legacy tasks remain browser-polled; new jobs are server-polled. Projects and the existing video editor remain available. Soul Cinema needs verified model docs and account access before activation.

## Preview and reference workflow follow-up

Library now filters by image/video, job status and prompt/model search. Video tiles use cached JPEG posters generated by the installed ffmpeg binary (`FFMPEG_PATH`, Homebrew path or PATH). Thumbnail extraction accepts only resolved local library files, runs serially, and reuses a source-mtime/size cache in `data/thumbnails/`. If ffmpeg or a file is unavailable, visible tiles load a real video frame in the browser; failures show an explicit message instead of an empty rectangle. No remote URL is passed to ffmpeg.

The model browser filters by workflow, model vendor and API provider separately. Text-to-video excludes extend/upscale utilities. The composer has a labeled workflow selector, starting-image upload, and visible reference/first/last-frame slots when supported. Library image cards have Animate → I2V and Use as reference actions; each attaches the image and opens a browser filtered to compatible models. `src/models/workflows.ts` is the shared classification and reference-slot mapping. `npm run check:media` exercises these mappings and a real synthetic-video thumbnail/cache check (skipped when ffmpeg is unavailable).
