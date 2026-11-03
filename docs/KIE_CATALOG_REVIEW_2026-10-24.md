# Kie catalog comparison — 24 October 2026

เทียบกับ MediaKie local v2.2.0 ณ วันที่ตรวจ: 135 workflow entries, 116 model IDs ของ Kie ใน `src/types.ts` ก่อนเพิ่ม Higgsfield mappings ใน `src/models/registry.ts` งาน Production Studio เดิมยังเป็น local changes และไม่ได้ถูกแก้ในรอบตรวจนี้

คำว่า “ยังไม่มี” หมายถึงไม่พบใน checkout นี้ ไม่ได้ยืนยันวันเปิดตัวโมเดล และการมี public API schema ไม่เท่ากับผ่านการทดสอบ paid generation

## สิ่งที่ควรแก้ก่อนเพิ่มโมเดล

### 1. Veo 3.1 มี API รุ่นใหม่

- แอปส่ง `POST /api/v1/veo/generate` และ poll ด้วย Veo record-info ผ่าน special case ใน `providers/kie.ts`
- [เอกสารปัจจุบัน](https://docs.kie.ai/veo3-api/generate-veo-3-video) ระบุ `POST /api/v1/jobs/createTask`, top-level `model: "veo-3-1"` และให้เลือก Fast/Lite/Quality ด้วย `input.model`
- เปลี่ยนจาก `imageUrls`, `generationType`, `aspectRatio`, `enableFallback`, `enableTranslation` เป็น `image_urls`, `generation_type`, `aspect_ratio`, `enable_fallback`, `enable_translation`
- `duration` เป็น integer 4/6/8; reference mode ใช้ 8 วินาที ส่วนแอปยังใช้ string controls และยังไม่จำกัด duration ของ reference mode
- ราคา 1080p/4K รวมค่า upgrade ตามเอกสาร แต่ estimator ปัจจุบันคิดค่าคงที่ตาม Fast/Lite/Quality ไม่แยก resolution
- เอกสารลิงก์ไป [API รุ่นเก่า](https://docs.kie.ai/old-model/veo3-api/generate-veo-3-video) โดยตรง จึงยังไม่ควรสรุปว่า endpoint เก่าปิดแล้ว
- ตอน migrate ต้องเก็บเส้นทาง polling ของ jobs เก่าและไม่เปลี่ยน historical settings ในไฟล์ผู้ใช้

### 2. Model IDs หลายตัวไม่ตรงกับเอกสารปัจจุบัน

| Workflow | ID ในแอป | ID ใน schema ปัจจุบัน | เอกสาร |
| --- | --- | --- | --- |
| Kling 2.6 T2V/I2V | `kling/2-6-text-to-video`, `kling/2-6-image-to-video` | `kling-2.6/text-to-video`, `kling-2.6/image-to-video` | [T2V](https://docs.kie.ai/market/kling/text-to-video), [I2V](https://docs.kie.ai/market/kling/image-to-video) |
| Kling 2.5 Turbo | `kling/2-5-turbo-…` | `kling/v2-5-turbo-…` | [I2V](https://docs.kie.ai/market/kling/v25-turbo-image-to-video-pro) |
| Kling 2.1 | `kling/2-1-…` | `kling/v2-1-…` | [Master I2V](https://docs.kie.ai/market/kling/v2-1-master-image-to-video) |
| Grok Image 2.0 | `grok-imagine-image-2-0` ใช้ร่วมกัน T2I/I2I | `grok-imagine-image-2-0/text-to-image`, `grok-imagine-image-2-0/image-edit` | [T2I](https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image), [Edit](https://docs.kie.ai/market/grok-imagine-image-2-0/image-to-image) |
| Grok video upscale/extend | `grok-imagine/video-upscale`, `grok-imagine/video-extend` | `grok-imagine/upscale`, `grok-imagine/extend` | [Upscale](https://docs.kie.ai/market/grok-imagine/upscale), [Extend](https://docs.kie.ai/market/grok-imagine/extend) |
| Hailuo 2.3 | `hailuo/2-3-pro-image-to-video`, `hailuo/2-3-standard-image-to-video` | `hailuo/2-3-image-to-video-pro`, `hailuo/2-3-image-to-video-standard` | [Pro](https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro) |
| Wan 2.7 video edit | `wan/2-7-video-edit` | `wan/2-7-videoedit` | [Video edit](https://docs.kie.ai/market/wan/2-7-videoedit) |
| Volcengine lip sync | `volcengine-video-to-video-lip-sync` | `volcengine/video-to-video-lip-sync` | [Lip sync](https://docs.kie.ai/market/volcengine/video-to-video-lip-sync) |

นี่เป็นความต่างที่ยืนยันจากโค้ดกับ schema ยังไม่ได้ยืนยันว่า ID เดิมถูกเลิกรองรับ ควรแก้ผ่าน provider mapping โดยรักษา model identity/history เดิม และตรวจ request contract ก่อนใช้เงินจริง

### 3. ราคาและ controls ของโมเดลเดิมล้าหลัง

| โมเดล | สิ่งที่มีในแอป | สิ่งที่พบปัจจุบัน / งานที่ต้องอัปเดต |
| --- | --- | --- |
| Grok Video T2V/I2V | 480p = 1.6, 720p = 3 credits/s | [หน้าโมเดล](https://kie.ai/grok-imagine) ระบุ 2.4 / 4.5 / 8 credits/s สำหรับ 480p / 720p / 1080p ตามลำดับ จึงประเมินสองระดับเดิมต่ำกว่าหน้าเว็บ 1.5 เท่า; ต้องเพิ่ม 1080p |
| Grok Video 1.5 Preview | 480p = 14.75, 720p = 27.65 credits/s; ไม่มี 1080p/first-last/loop/keyframes/audio control | [หน้าโมเดล](https://kie.ai/grok-imagine-video-1.5) ระบุสองระดับแรก 2.4 / 4.5 credits/s; [schema](https://docs.kie.ai/market/grok-imagine/1-5-preview.md) มี 1080p, first/last frame, loop, keyframes ≤4 และ `enable_audio` ต้องตรวจ file-slot limits ด้วย เพราะ schema กับ Playground อธิบาย image count ไม่ตรงกัน |
| Seedance 2.5 | มี T2V/I2V/V2V, references 30 ภาพ/10 วิดีโอ/10 เสียง และช่วง duration 1–30 | [schema](https://docs.kie.ai/market/bytedance/seedance-2-5.md) ระบุ duration 4–30 หรือ `-1` auto, เพิ่ม `draft`; first/last-frame กับ multimodal references เป็นคนละ scenario ห้ามใช้พร้อมกัน แอปยังไม่ป้องกันการผสมนี้ ต้องตรวจราคาอีกครั้งก่อนใช้ estimator เดิม |
| GPT Image 2 | 6 aspect-ratio options; ไม่มี background control | [T2I schema](https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md) และ [I2I](https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image.md) มี 16 ratio options และ `background` เช่น transparent; resolution 1K/2K/4K ยังมีอยู่ |
| Seedream 5 Pro | ยังไม่มี layer decomposition และไม่มี 21:9 ใน ratio options | [T2I](https://docs.kie.ai/market/seedream/5-pro-text-to-image.md) เพิ่ม 21:9; [Layer decomposition](https://docs.kie.ai/market/seedream/5-pro-layer-decomposition.md) เป็นอีก model ID ต้องจัดการผลลัพธ์หลาย layer |
| Gemini 3.8 Flash TTS | UI แปลงเป็น speaker เดียว + dialogue turn เดียว; ไม่มี estimate | [schema](https://docs.kie.ai/market/google/gemini-3-8-flash-tts.md) รองรับ speakers/dialogue turns และ `filler_words`; เป็นความสามารถที่แอปยังไม่เปิดให้ใช้เต็ม ไม่ใช่ยืนยันว่า API เดิมพัง |

ข้อควรระวังเรื่องราคา: หน้า Grok 1.5 เขียนชื่อ resolution ซ้ำว่า 720p ในรายการราคา tier ที่สาม แต่ controls/schema มี 1080p อย่าคัดลอกข้อความผิดไปเป็น pricing rule และอย่าเอา bonus credits จากการเติมเงินมาเป็น base price

## โมเดล/รุ่นที่มีเอกสารแล้ว แต่ยังไม่มีในแอป

| กลุ่ม | สิ่งที่ยังไม่มี | Model IDs / แหล่งข้อมูล | ขอบเขตสำหรับเพิ่ม |
| --- | --- | --- | --- |
| Kling 4.0 | Reference + Keyframe | `kling-4.0/reference-to-video`, `kling-4.0/keyframe-to-video` — [Reference](https://docs.kie.ai/market/kling/v4-reference-to-video), [Keyframe](https://docs.kie.ai/market/kling/v4-keyframe-to-video) | 3–30 วินาที, 720p/1080p; reference มี elements/voices และ keyframe มี middle frames ต้องเพิ่ม structured inputs; estimator ต้องคิด source duration ตามกฎใหม่ |
| GPT Image 2.5 | Flare / Sunburst ทั้ง T2I/I2I | `gpt-image-2-5-flare-text-to-image`, `gpt-image-2-5-flare-image-to-image`, `gpt-image-2-5-sunburst-text-to-image`, `gpt-image-2-5-sunburst-image-to-image` — [Flare](https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image), [Sunburst](https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-text-to-image) | รูปแบบใกล้ GPT Image 2 มี background และ input URLs; ต้องแยกราคาของแต่ละ variant |
| FLUX 3 Klein | สร้าง/แก้ภาพ | `flux-3/klein-text-to-image`, `flux-3/klein-edit-image` — [T2I](https://docs.kie.ai/market/flux3/klein-text-to-image), [Edit](https://docs.kie.ai/market/flux3/klein-edit-image) | 1K/2K/4K, multi-image output, reference images; schema พร้อมให้เทียบกับระบบเดิม |
| Nano Banana 2.1 | สร้าง/แก้ภาพใน endpoint เดียว | `nano-banana-2-1` — [API](https://docs.kie.ai/market/google/nanobanana-2-1) | 1K/2K/4K, image_input ≤10, ratio/output format; ของเดิมมี 2 และ 2 Lite ไม่ใช่ 2.1 |
| Seedream 5 Flash | T2I / I2I / Layer decomposition | `seedream/5-flash-text-to-image`, `seedream/5-flash-image-to-image`, `seedream/5-flash-layer-decomposition` — [T2I](https://docs.kie.ai/market/seedream/5-flash-text-to-image.md), [I2I](https://docs.kie.ai/market/seedream/5-flash-image-to-image.md), [Layers](https://docs.kie.ai/market/seedream/5-flash-layer-decomposition.md) | generation/editing เพิ่มตาม pattern เดิมได้; layers แยกงานผลลัพธ์ |
| PixVerse V6 Max | T2V / I2V | `pixverse-v6-max/text-to-video`, `pixverse-v6-max/image-to-video` — [T2V](https://docs.kie.ai/market/pixverse/v6-max-text-to-video), [I2V](https://docs.kie.ai/market/pixverse/v6-max-image-to-video) | 1–15 วินาที, quality 360p/540p/720p/1080p, `generate_audio_switch`; ต้องแยกราคาตามเสียงและ quality |
| Vidu Q4 | I2V / Reference | `vidu-q4/image-to-video`, `vidu-q4/reference-to-video` — [I2V](https://docs.kie.ai/market/vidu-q4/image-to-video), [Reference](https://docs.kie.ai/market/vidu-q4/reference-to-video) | input ภาพ/เสียงและ output settings; เป็น family ใหม่สำหรับแอป |
| OmniHuman 2.0 | Avatar จากภาพ+เสียง | `omnihuman-2-0` — [API](https://docs.kie.ai/market/omnihuman-2-0) | image_urls + audio_url; ของเดิมมี 1.5 อยู่แล้ว |
| Seedance | 2.0 Fast / 2.5 Draft rendering | `bytedance/seedance-2-fast`, `bytedance/seedance-2-5-draft` — [Fast](https://docs.kie.ai/market/bytedance/seedance-2-fast), [Draft](https://docs.kie.ai/market/bytedance/seedance-2-5-draft) | Draft ไม่ใช่แค่ชื่อโมเดลอีกตัว: สร้าง draft จาก base 2.5 แล้วใช้ draft_task_id สั่ง render; docs ระบุ draft อายุ 7 วัน |
| Qwen Image | 2.1 T2I/I2I + Qwen3 Pro T2I | `qwen2-1/text-to-image`, `qwen2-1/image-to-image`, `qwen3/pro-text-to-image` — [2.1 T2I](https://docs.kie.ai/market/qwen2-1/text-to-image), [2.1 I2I](https://docs.kie.ai/market/qwen2-1/image-to-image), [3 Pro](https://docs.kie.ai/market/qwen3-pro/text-to-image) | 2.1 ยังไม่มี แม้แอปมี Qwen3; Qwen3 Pro เดิมมีเฉพาะ I2I |
| Gemini TTS | 3.8 Flash Lite / 3.1 Flash / 2.5 Pro | `google/gemini-3-8-flash-lite-tts`, `google/gemini-3-1-flash-tts`, `google/gemini-2-5-pro-tts` — [Lite](https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts), [3.1](https://docs.kie.ai/market/google/gemini-3-1-flash-tts), [Pro](https://docs.kie.ai/market/google/gemini-2-5-pro-tts) | AudioWorkspace ปัจจุบันมี Gemini 3.8 Flash กับ ElevenLabs Turbo; ต้องเพิ่ม UI dispatch และ adapter ให้ตรงแต่ละ schema |

[ราคา Kling 4.0](https://kie.ai/pricing): เมื่อมี input video ต้องคิด `max(total input seconds, output seconds) + output seconds` แล้วคูณราคาต่อวินาทีของกรณีมีวิดีโอ ไม่ใช่แค่ output หรือ input+output โดยไม่มีขั้นต่ำ ตัวอย่าง output 10s + input 5s ถูกคิด 20s; input 15s ถูกคิด 25s

## ช่องว่างเดิมที่ไม่ควรนับว่าเพิ่งเปิดตัว

มีในเอกสารแต่ยังไม่มี local entries เช่น Kling 2.6/3.0 Motion Control, Kling Avatar Standard/Pro, Kling Omni Reference/Transformation, Wan 2.2 Turbo/Animate, Wan 2.6 Flash I2V, Wan 2.7 Reference, HappyHorse 1.1 T2V/I2V, Grok Image 2.0 Segment Map/Edit, Ideogram Character, Infinitalk, ElevenLabs Multilingual v2/Dialogue v3/Audio Isolation และ OmniHuman 1.5 detection helpers ดู [API index](https://docs.kie.ai/llms.txt) เพื่อเลือกเฉพาะ workflow ที่ต้องใช้ ไม่ต้องเปิดทั้งหมดในหน้า UI

Suno ปัจจุบันหน้า [Market](https://kie.ai/market) ระบุ V5.5 แต่แอปไม่มี music-generation workflow ส่วน Chat/LLM มีเพิ่มหลายรุ่นเช่น GPT 6.1 Sol, Gemini 4 Argon, Claude 5.5; ควรแยกเป็นงานเพิ่มผลิตภัณฑ์ เพราะไม่ได้ใช้ createTask/polling รูปแบบเดียวกับทุก media model

Kling 4.0 Flash ยังแสดง Coming Soon บน Market ณ วันที่ตรวจ จึงยังไม่ควรเปิดเป็น available model เพียงเพราะมีชื่อบนหน้าเว็บ และไม่ใช้หัวข้อข่าว GPT Image 3 ใน blog เป็นหลักฐานว่ามี API ใช้งานแล้ว

## ลำดับอัปเดตที่เสนอ

1. ตรวจ/ปรับ provider mapping ของโมเดลเดิม, รองรับ Veo API รุ่นใหม่โดยรักษางานเก่า, แก้ Grok pricing และ request limits ก่อน เพื่อไม่ให้ส่งผิด route หรือแสดงราคาต่ำกว่าจริง
2. เพิ่ม image models ที่เข้ากับ flow ปัจจุบันก่อน: GPT Image 2.5, FLUX 3 Klein, Nano Banana 2.1 และ Seedream 5 Flash; เพิ่ม controls ของ GPT Image 2 เดิมไปพร้อมกัน
3. เพิ่ม PixVerse V6 Max และ OmniHuman 2.0; ทำ Kling 4.0/Vidu Q4 พร้อม structured references และ pricing tests ของ source video
4. เพิ่ม TTS variants / Seedance draft pipeline / layer decomposition ตาม workflow ที่ผู้ใช้ต้องการจริง

สิ่งที่งาน implementation ต้องครอบคลุม: `src/types.ts` (models/params/estimates/catalog), `src/models/registry.ts` (provider mappings), `src/App.tsx` (upload/normalization/source tracking), `providers/kie-input.ts`, `providers/kie.ts` (submit/poll/output), `src/components/MediaWorkspace.tsx`, `src/components/AudioWorkspace.tsx`, `src/models/production.ts` และ tests ที่ผูก IDs/parameters เดิม ต้องรักษา settings/history และไม่ fallback/retry paid generation ข้ามโมเดลโดยเงียบ ๆ

## ผลตรวจและข้อจำกัด

- อ่าน catalog จาก active checkout และเทียบ public model pages/OpenAPI ที่ดาวน์โหลดจาก docs.kie.ai; ไม่อ่าน credentials และไม่ส่ง paid generation
- `npm run check:catalog` ไม่ผ่าน: `Catalog entry is stale (52 days): text-to-image:grok-imagine-image-2-0` เพราะ verifiedAt = 2026-09-02 เกินเกณฑ์ 45 วันใน test; รายการ reviewed ทั้ง 13 entries ใช้วันเดียวกัน อย่าแก้วันที่เฉย ๆ โดยไม่ตรวจ mapping/schema/pricing
- ไม่รัน full build/tests เนื่องจากรอบนี้เพิ่มรายงานเท่านั้น ไม่เปลี่ยน application code
- ยังไม่ยืนยันว่า legacy IDs/old Veo API ใช้ไม่ได้ และยังไม่รับรองคุณภาพ generation, account access, latency หรือราคา charged จริง; ราคาและ availability ต้องตรวจอีกครั้งเมื่อเริ่ม implementation
- รายงานนี้ไม่ได้เปลี่ยน registry, settings หรือข้อมูล project ของผู้ใช้

## Implementation follow-up — 24 October 2026

อัปเดต application code แล้วสำหรับโมเดลที่มีอยู่เดิม (ยังไม่เพิ่ม model families ใหม่):

- แยก local model identity ออกจาก Kie wire ID; ปรับ Kling, Grok Image 2/tools, Hailuo 2.3, Wan edit และ Volcengine ตาม schema ปัจจุบัน
- ใหม่ทุก Kie mapping ระบุ market API version; Veo generation/extend/upgrades ใช้ createTask/recordInfo ส่วน mapping เก่าที่บันทึกอยู่ยังใช้ legacy submit/poll โดยไม่เปลี่ยน historical jobs
- ย้าย callback ไป top-level, ใช้ Veo snake_case/integer duration, ตรวจ reference mode, อ่าน HD จาก `resultJson.data.result_urls` และไม่เอา `origin_urls` 720p มาเป็นผล HD; เก็บ finalCost เฉพาะเมื่อ recordInfo ส่ง creditsConsumed จริง
- ปรับ Grok, Veo Lite/HD, Seedance 2.5 1080p, Seedance Mini, Flux Flex, Seedream Pro/input fees, HappyHorse 1.0, Gemini Omni, PixVerse reference, Nano Banana Pro, Qwen2/3 input fees, Ideogram Character, Wan Flash, Topaz video, ElevenLabs และ utility rates; ไม่ปัด fractional credits ขึ้นโดยอัตโนมัติ
- HappyHorse video-edit และ Topaz video คิดตาม source duration; auto duration / input+output billing ที่ไม่รู้ source duration แสดง unknown
- เพิ่ม controls ที่ตรง API เช่น GPT Image 2 background/ratios, Grok 1080p/first-last/loop/audio, Grok tools ใช้ task ID, Seedance duration 4–30 หรือ -1, Seedream 21:9; ป้องกัน first/last frames + multimodal references ของ Seedance ที่ใช้พร้อมกันไม่ได้
- ปิดการส่ง Kling 2.1 Pro/Standard แบบ text-only เนื่องจาก public contract เป็น image-to-video เท่านั้น; IDs/history เดิมยังอยู่ และ Kling 2.1 Master T2V ยังใช้ได้
- บันทึก public-price fixtures 86 กรณีใน `scripts/fixtures/kie-pricing-2026-10-24.json` จากตารางราคา public (605 rows, ไม่ใช้ credentials) และตรวจแบบ offline ใน `check:credits`; `check:kie-api` ตรวจ migration/callback/legacy/HD ด้วย mocks
- ตรวจ reviewed catalog entries เดิมทั้ง 13 รายการอีกครั้งและอัปเดต verifiedAt; ไม่ใช่การเลื่อนวันเพียงเพื่อข้าม freshness test

ราคาที่ตั้งใจให้เป็น unknown: Grok 1.5 Preview 1080p (ไม่มีราคาชัดในตาราง), Grok upscale 1080p (20 หรือ 30 credits ตาม source resolution), Topaz image (ต้องรู้ output dimensions), Qwen image-edit (5 credits/MP ต้องรู้ dimensions), Gemini ID creation (ไม่มี current public rate), Gemini TTS total (ยังไม่รู้ audio output token count) หน้า Audio แสดง token/character unit rates แทนการเดายอดรวม

ยังไม่มี paid provider acceptance test หรือการยืนยัน account access จริง; ไม่ได้เพิ่ม draft-render pipeline, layer decomposition, structured keyframe editor หรือ model families ใหม่ในรอบนี้
