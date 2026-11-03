# Kai Media Studio — Production Workflow Handoff

วันที่จัดทำ: 2026-10-06  
ฐานโค้ดที่สำรวจ: v2.2.0, commit `20885a8`  
สถานะ: Phase 1–4 implement ใน local แล้ว; หลักฐาน fixture/browser และข้อจำกัดอยู่ในหัวข้อ 12 (2026-10-07); รวมใน release v2.3.0 (2026-11-03)

## 1. เป้าหมาย

ทำให้แอปรองรับการผลิตวิดีโอเป็นเรื่อง ตั้งแต่ brief และภาพอ้างอิง ไปจนถึง storyboard, หลายเทก, การเลือกเทก, การประกอบภาพ/เสียง และส่งออก โดยใช้ระบบ generation และ provider เดิม

ตัวอย่างงานตรวจรับหลัก: โปรเจกต์วิดีโอ 45–60 วินาที มี 2 ฉาก 8 ช็อต ตัวละครและสถานที่ใช้ซ้ำ หลายเทกในบางช็อต และ voiceover ผู้ใช้กลับมาเปิดงานหลัง restart แล้วทำต่อได้

ความยาวตัวอย่างเป็นเป้าหมายของงานประกอบ ไม่ใช่การรับรองว่าโมเดลสร้างวิดีโอยาวเท่านี้ได้ในการเรียกครั้งเดียว

## 2. สิ่งที่มีอยู่แล้วและต้องใช้ต่อ

| ระบบ | หลักฐานในโค้ด | ใช้ต่ออย่างไร |
| --- | --- | --- |
| Project และ backup ZIP | `server.ts`, `src/App.tsx` | เพิ่มข้อมูลการผลิตเข้าโปรเจกต์เดิม |
| Library และรายการ generation | `src/components/LibraryGallery.tsx`, `src/types.ts` | เพิ่มข้อมูล asset และการผูกกับช็อต |
| บันทึก history ราย ID | `src/lib/historyApi.ts`, `server.ts` | รักษา queue และ atomic replacement |
| Durable generation queue | `providers/service.ts`, `src/generation/client.ts` | ผูก job กับ project/shot/take ตั้งแต่ก่อน submit |
| Model registry และ workflow compatibility | `src/models/registry.ts`, `src/models/workflows.ts` | แสดงเฉพาะ input และ controls ที่ route รองรับ |
| ภาพ → I2V/reference/first-last frame | `src/App.tsx`, `src/components/MediaWorkspace.tsx` | ใช้เป็นทางส่ง storyboard ไปสร้างเทก |
| Prompt/settings/cost snapshot | `GenerationLog` ใน `src/types.ts` | เก็บที่มาของแต่ละเทกและสร้างซ้ำได้ |
| H3 Prompt Director | `providers/h3-ir.ts`, `MediaWorkspace.tsx` | คงเป็นตัวเลือกเฉพาะ H3; ไม่ใช่ storyboard storage ของเรื่อง |
| Editor เรียง/trim/split | `src/components/MediaWorkspace.tsx` | ย้าย state ของงานตัดต่อไปบันทึกต่อโปรเจกต์ |
| Thumbnail ผ่าน FFmpeg | `providers/thumbnails.ts` | ใช้แนวทาง resolve local file เดิมกับงาน export |

ช่องว่างที่ตรวจพบจากโค้ด:

- `Project` มีเพียง ID, ชื่อ และเวลา ยังไม่มี scene/shot
- Library รับ `GenerationLog[]` เป็นหลัก ยังไม่มี asset catalog สำหรับไฟล์นำเข้าและ reference ที่ตั้งชื่อ
- generation ยังไม่มี shot/take identity และ approved take
- timeline อยู่ใน React state ยังไม่ persist ต่อ project
- export เดิมใช้ canvas/MediaRecorder เป็น WebM 1280×720 และไม่ได้รวมเสียง
- Clypra เป็น experimental editor; export adapter ยังเป็น stub ไม่ใช่ production pipeline
- Higgsfield mapping ปัจจุบันมี Soul Standard, Soul 2 และ Kling I2V บาง route; Soul Cinema ยังปิดรอ verified schema

รายการช่องว่างข้างต้นเป็น baseline ก่อนเริ่มพัฒนา ดูผล Phase 1 ที่ท้ายเอกสารสำหรับสถานะปัจจุบัน

## 3. แนวทางผลิตภัณฑ์

Flow หลัก:

```text
Project brief + look + references
  → Scenes / Shot Board
  → Storyboard image ของช็อต
  → Generate video takes
  → Compare / approve take
  → Assemble timeline + audio
  → Export / delivery package
```

ภายในโปรเจกต์ใช้แท็บ `Overview / Board / Library / Edit` แทนการเปิดทุกส่วนพร้อมกัน ส่วน Image, Video, Audio เดิมยังใช้สร้างงานอิสระได้

- Board เป็นพื้นที่หลักสำหรับเรื่อง: การ์ดช็อตเรียงตามฉาก พร้อมภาพ, ความยาว, สถานะ และเทกที่เลือก
- เลือกช็อตแล้วเปิด inspector สำหรับ action, camera, lighting, dialogue, references และ generation controls
- Library ใช้ grid/list กับ filter และรายละเอียดเมื่อเลือก ไม่เปิด inspector ถาวรบนหน้าต่างเล็ก
- Activity แสดงสถานะงาน; Library แสดงไฟล์; Board แสดงโครงเรื่อง ทั้งสามอ้างถึงงานเดียวกันได้
- ตรวจ viewport 1280×800 เป็นอย่างน้อยสำหรับจอ 13 นิ้ว และหน้าต่างแคบ โดยพื้นที่ Board และ Parameters ต้องใช้งานได้
- reference และ prompt ช่วยความต่อเนื่อง แต่ไม่รับประกันหน้าตา เสื้อผ้า หรือฉากตรงกันทุกเทก

## 4. โครงสร้างข้อมูลที่เสนอ

เป็นข้อเสนอสำหรับเริ่ม implementation ปรับชื่อฟิลด์ได้ตามโค้ดจริง แต่รักษาความสัมพันธ์และ migration ด้านล่าง

| Entity | ข้อมูลหลัก | ความสัมพันธ์ |
| --- | --- | --- |
| Production settings | brief, script, ratio, target duration, visual notes | อยู่ใน project |
| Scene | id, title, order, notes | อยู่ใน project |
| Shot | id, sceneId, order, title, action, camera, lighting, dialogue, targetDuration, referenceAssetIds, storyboardAssetId, approvedTakeId | อยู่ใน scene |
| Asset | id, name, kind, role, local media path, source, generationLogId/outputIndex ถ้ามี, tags, technical metadata | อยู่ใน project; ใช้ซ้ำในหลาย shot ได้ |
| Take | id, shotId, generationJobId/logId, outputAssetId, notes | แต่ละ shot มีหลาย take |
| Edit sequence | id, ordered clips, assetId, trim in/out, audio placements, output settings | อยู่ใน project |

กติกา:

- Asset คือไฟล์; GenerationLog คือการสร้างครั้งหนึ่ง; Take คือผลลัพธ์ที่ผูกกับช็อต ไม่ใช้ entity เดียวแทนทั้งหมด
- รองรับหนึ่ง generation มีหลาย output โดยระบุ output index/asset แยก
- ใช้ ID เป็นความสัมพันธ์ ไม่ใช้ชื่อ, prompt หรือ URL เป็น identity
- กำหนด approved take ที่ shot เป็นแหล่งเดียว เพื่อไม่ให้มีสองเทก approved พร้อมกันโดยไม่ตั้งใจ
- เมื่อสร้าง take เก็บ prompt, inputs และ settings snapshot ของครั้งนั้น การแก้ช็อตภายหลังไม่เปลี่ยนที่มาของเทกเก่า
- reference ที่เป็น data URL หรือ upload ชั่วคราวต้องมีสำเนา local ที่คงอยู่ก่อนใช้เป็น production asset
- เปลี่ยน project ระหว่างงานรันแล้วผลต้องกลับไป shot/project ต้นทาง
- estimated cost กับ final cost ต้องแยกกัน; ราคาที่ provider ไม่รายงานยังเป็น unknown

## 5. Storage และ compatibility

เริ่มจาก JSON ใน `data/projects/<projectId>/` และ local library เดิม ไม่จำเป็นต้องเพิ่มฐานข้อมูลในรอบแรก

- เสนอ `production.json` ที่มี `schemaVersion: 1` สำหรับ scenes, shots, assets, takes และ sequence
- missing file หมายถึงโปรเจกต์เก่า ใช้ค่าเริ่มต้นโดยไม่แก้หรือล้าง history
- เชื่อม generation เก่ามาเป็น asset เมื่อจำเป็นด้วย stable log/output identity; migration ต้องรันซ้ำแล้วไม่เกิดรายการซ้ำ
- new production writes ใช้ project queue + atomic replace; ต้องกำหนด revision/conflict handling สำหรับ stale writes จากหลายแท็บ
- JSON เสียหายต้องแจ้งข้อผิดพลาดและเก็บไฟล์ต้นฉบับ ห้ามแทนด้วยข้อมูลว่างเงียบ ๆ
- backup ZIP ต้องรวม production metadata และไฟล์อ้างอิงทั้งหมด
- ทุกเส้นทางลบเดิม รวม bulk delete และ clear project ต้องตรวจ reference จาก Board/Library/timeline ด้วย ไม่ตรวจ history อย่างเดียว
- การเอา asset ออกจากช็อตไม่เท่ากับลบไฟล์; ถ้ายังถูกใช้อยู่ให้บล็อกการลบและบอกตำแหน่งการใช้งาน
- ต่อ queue metadata ให้ recovery หลัง restart สร้าง take กลับเข้า shot เดิมได้ โดยไม่ submit paid job ซ้ำ

## 6. เฟสพัฒนาและเกณฑ์ตรวจรับ

แต่ละเฟสจบด้วยผลตรวจรับและบันทึก handoff ไม่ประกาศเสร็จจาก build ผ่านอย่างเดียว

### Phase 1 — Production Library และข้อมูลที่คงอยู่

ขอบเขต:

- เพิ่ม production storage/versioned schema และ API ที่ validate input
- Library รับทั้ง generated assets และไฟล์นำเข้า image/video/audio
- ตั้งชื่อ, tags, role: character/location/style/storyboard/video/voice/music/other และ filter
- เก็บไฟล์นำเข้าใน project library; นำ generation เดิมมาแสดงโดยไม่ทำสำเนาซ้ำ
- เปิด details, ใช้เป็น generation input, แสดงที่มาและ technical metadata
- รวม metadata ใน backup และป้องกันลบไฟล์ที่ยังมี reference

ตรวจรับ:

- [x] โปรเจกต์ที่ไม่มี production.json เปิดได้; ตรวจ history/file compatibility ด้วย fixture เดิม ไม่แก้ data จริง
- [x] Import/rename/tag แล้ว reload และ restart ข้อมูลยังอยู่
- [x] ไฟล์ unsupported/signature ไม่ตรง/เกินขนาด/path ไม่ถูกต้องถูกปฏิเสธพร้อมข้อความ
- [x] หนึ่ง generation หลาย output แสดงแยกกัน; ลบ output แรกแล้ว ID/ชื่อของ output ที่เหลือไม่เปลี่ยน
- [x] competing metadata edits ได้ 200/409; Reload library แล้วส่ง edit ใหม่ได้โดยไม่ overwrite stale data
- [x] backup มี production.json และ project media; ตรวจ ZIP และ selected-assets manifest ด้วย fixture
- [x] ใช้ mock/fixture จึงไม่เสียเครดิต

### Phase 2 — Scene / Shot Board และ Takes

ขึ้นกับ Phase 1

ขอบเขต:

- เพิ่ม project brief/look, scene และ shot CRUD พร้อม reorder
- ผูก storyboard และ reference จาก Library กับแต่ละช็อต
- สร้างภาพ/วิดีโอจากช็อตผ่าน flow เดิม; ส่ง shot/take context ไป durable queue
- รวมเทกไว้ใต้ช็อต เปรียบเทียบ prompt/settings/result และเลือก Approved take
- สถานะ Draft / Ready / Generating / Needs review / Approved คำนวณจากข้อมูลที่เกี่ยวข้อง
- การสร้างเทกใหม่ไม่แทนที่ approved take อัตโนมัติ

ตรวจรับ:

- [ ] ตัวอย่าง 2 ฉาก 8 ช็อตเรียงและกลับมาเปิดได้เหมือนเดิม
- [ ] งานจบสลับลำดับและเปลี่ยน project ระหว่างรันแล้วเทกอยู่ถูกช็อต
- [ ] restart ระหว่างรันแล้ว recovery ไม่สร้าง paid task ซ้ำ
- [ ] เลือก approved take ใหม่แล้วของเดิมยังอยู่
- [ ] ลบ scene/shot แจ้งผลกระทบและไม่ลบ media โดยปริยาย
- [ ] Board/inspector ใช้ keyboard ได้และใช้งานได้ที่ 1280×800

### Phase 3 — Direction, Continuity และ Batch

ขึ้นกับ Phase 2

ขอบเขต:

- ช่องคำกำกับ Action / Camera / Lighting / Dialogue แยกจาก provider parameters
- เลือก named references ของตัวละคร/ฉาก/สไตล์ และ project defaults พร้อม override ต่อ shot
- preview final prompt และ provider-ready input ก่อนสร้าง พร้อม snapshot
- preset ขนาดช็อตและการเคลื่อนกล้องเริ่มจากคำกำกับ; ใช้ parameter จริงเฉพาะ route ที่ตรวจ schema แล้ว
- สร้างเฉพาะช็อตที่เลือกหรือยังไม่มีเทก; แสดงจำนวนงานและราคารวมก่อน submit
- สร้างเทกใหม่เฉพาะช็อต ไม่สร้างภาพหรือช็อตที่ approved แล้วซ้ำโดยอัตโนมัติ
- ต่อยอด H3 Prompt Director โดยไม่บังคับโมเดลอื่นใช้ compiler นี้

ตรวจรับ:

- [ ] เปลี่ยน model แล้ว input ที่ไม่รองรับมีคำอธิบาย ไม่ถูกทิ้งเงียบ ๆ
- [ ] resolution/duration/count/A-B เปลี่ยนแล้ว batch estimate เปลี่ยนตาม
- [ ] unknown pricing แสดง unknown ไม่ตีเป็นศูนย์ และไม่เทียบ credits ต่าง provider ตรง ๆ
- [ ] บางงานล้มเหลวแล้วช็อตอื่นยังติดตามต่อได้ ไม่มี retry เสียเครดิตอัตโนมัติ
- [ ] reference/คำกำกับของเทกเก่าไม่เปลี่ยนเมื่อแก้ defaults
- [ ] แยกผล mock ผ่านออกจากผลตรวจ continuity ด้วย provider จริง

### Phase 4 — Saved Assembly และ Delivery

ขึ้นกับ Phase 2; ทำพื้นฐานได้ก่อน Phase 3 เสร็จ

ขอบเขต:

- บันทึก timeline ต่อ project พร้อม trim/reorder/split และ reload recovery
- นำ approved takes ลง timeline ตาม shot order; การเปลี่ยน approved take ไม่เขียนทับ edit เดิมเงียบ ๆ
- เพิ่ม voiceover/music placements, volume และ mute
- export ฝั่ง server ผ่าน FFmpeg จาก local assets เป็น MP4 พร้อมเสียง
- normalize ratio/resolution/FPS/audio ตาม output preset และแสดง progress/error
- สร้าง edit package: original selected clips, shot-based filenames และ JSON manifest
- เก็บ export กลับเข้า Library พร้อมที่มาของ sequence

ตรวจรับ:

- [ ] restart แล้ว timeline และ trim/audio placements อยู่ครบ
- [ ] synthetic fixtures ตรวจลำดับคลิป ความยาว สัดส่วนภาพ และ audio sync
- [ ] export มีเสียงจริง ไม่ใช่เพียง preview มีเสียง
- [ ] FFmpeg ไม่พร้อมมีข้อความและไม่มีการรายงาน export สำเร็จ
- [ ] export failure/cancel ไม่เผยแพร่ไฟล์บางส่วนเป็นผลสำเร็จ
- [ ] package มีคลิปและ manifest ครบ; ไม่อ้างว่าเป็น native Premiere/Resolve project

## 7. ยังไม่อยู่ในรอบแรก

- Node editor/canvas เต็มรูปแบบ: เริ่มจาก flow และปุ่มที่ใช้จริงก่อน
- AI เขียนบท/แตกช็อตอัตโนมัติ: Board ต้องทำด้วยมือได้ก่อน แล้วค่อยเพิ่มผู้ช่วย
- Collaboration, login, cloud sync หรือเปิด server บน LAN/public
- ย้าย storage ไป SQL หรือเปลี่ยน editor ทั้งชุดเพียงเพราะไฟล์ใหญ่
- รับรอง deterministic camera/character consistency จาก prompt presets
- เปิด Cinema Studio/Soul Cinema/Runway API route โดยอาศัยชื่อฟีเจอร์เว็บอย่างเดียว
- Professional color grading, subtitles, effects และ native NLE project export

## 8. การตรวจและส่งต่องานแต่ละเฟส

ใช้ project จำลองและ synthetic media สำหรับการทดสอบเขียน/ลบ/export ห้ามใช้ข้อมูลจริงเป็น fixture

คำสั่งพื้นฐานเดิม (ตรวจ scripts อีกครั้งเมื่อเริ่มแต่ละเฟส):

```bash
npm run lint
npm test
npm run build
```

เพิ่ม runnable check เท่าที่จำเป็นสำหรับ schema/migration/reference integrity/job recovery/export ของเฟสนั้น และตรวจ UI จริงที่ 1280×800 กับหน้าต่างแคบ ใช้ provider mock เป็นค่าเริ่มต้น การทดสอบเสียเครดิตต้องแสดงขอบเขตและราคาที่ประเมินได้ก่อนรัน

handoff แต่ละเฟสต้องบันทึก:

1. ขอบเขตที่ทำจริงและสิ่งที่ยังไม่ทำ
2. ไฟล์/API/schema ที่เปลี่ยน และ migration/backup compatibility
3. คำสั่งตรวจและผล พร้อมผล browser/provider ที่ทดสอบจริง
4. ข้อจำกัด/ปัญหาค้าง และ commit ถ้ามี
5. ขั้นตอนเริ่มเฟสถัดไป

| เฟส | สถานะ | หลักฐานตรวจรับ / commit |
| --- | --- | --- |
| 1 — Production Library | Implement และตรวจ local/fixture แล้ว | รายละเอียดด้านล่าง; รวมใน release v2.3.0 (2026-11-03) |
| 2 — Board / Takes | Implement local | Studio + productionShotId; 2 scenes / 8 shots, approval/deletion/restart checks |
| 3 — Direction / Batch | Implement local | Prompt/reference compiler, compatibility and costs; no paid continuity validation |
| 4 — Assembly / Delivery | Implement local | Saved sequence, FFmpeg MP4/audio, delivery ZIP; synthetic render and cancellation checks |

## 9. เริ่มงานครั้งถัดไป

เริ่มจาก review Studio flow และข้อจำกัดในหัวข้อ 12 อ่าน `src/models/assets.ts`, `src/models/production.ts`, `providers/production-library.ts`, `providers/production-export.ts`, `src/components/ProductionStudio.tsx` และ provider queue ก่อนแก้ไข เก็บ revision checks และ deletion guards ทุกเส้นทางไว้

ตรวจ git status และเวอร์ชันจริงใหม่ก่อนทำงาน เก็บ user changes และ data เดิมไว้ ไม่ถือว่า commit ในหัวเอกสารยังเป็น HEAD เสมอ

## 10. แหล่งแนวทางและข้อจำกัดการสำรวจ

สำรวจเอกสาร/หน้าสาธารณะทางการวันที่ 2026-10-06 ไม่ได้ทดลอง workspace ที่ล็อกอินหรือ paid generation ของ Runway/Higgsfield ฟีเจอร์เว็บและ API อาจมีขอบเขตต่างกัน ต้องตรวจ model-specific API schema/account access ใหม่เมื่อเพิ่ม route

- Runway Projects: https://help.runwayml.com/hc/en-us/articles/52913052730387-Creating-a-Project
- Runway asset organization: https://help.runwayml.com/hc/en-us/articles/23998498329107-How-to-organize-assets
- Runway saved references: https://help.runwayml.com/hc/en-us/articles/52963720640275-Using-reference-media-to-guide-your-generations
- Runway Workflows: https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows
- Higgsfield Cinema Studio: https://higgsfield.ai/blog/how-we-built-cinema-studio
- Higgsfield Cinema Studio 4.0: https://higgsfield.ai/blog/cinema-studio-4-0
- Higgsfield storyboard: https://higgsfield.ai/blog/script-to-storyboard-ai

เอกสารนี้เป็นแผนของ Kai Media Studio ไม่ใช่คำรับรองว่าจะจำลองฟีเจอร์หรือคุณภาพของบริการเหล่านั้นได้ทั้งหมด

## 11. Phase 1 implementation handoff — 2026-10-06

### สิ่งที่ทำจริง

- หน้า Library ใหม่แยกจาก Recent generations ที่ Home; งานกำลังรันอยู่ใน Activity
- นำเข้า PNG/JPEG/WebP/GIF, MP4/MOV/WebM และ MP3/WAV/OGG/FLAC/M4A สูงสุด 250 MiB ต่อไฟล์ เก็บชื่อเดิมเป็น display name แต่ใช้ UUID เป็นชื่อไฟล์จริง
- ตรวจ MIME allowlist และ media signature ก่อนเขียนไฟล์; ไม่รองรับ SVG/HTML
- เปลี่ยนชื่อ, role และ tags; ค้นหาชื่อ/แท็ก/prompt และกรองชนิด/role/source
- รายละเอียด preview, source prompt/settings, ขนาดไฟล์ และ dimensions/duration เมื่อ ffprobe อ่านได้
- Image → Animate/reference และ Use as input สำหรับ model ที่รับ media ชนิดนั้น; audio ถูกส่งเข้า file parameter ของ model ที่รองรับ ไม่ใช่สร้าง voice cloning flow ใหม่
- แยก generated output เป็น asset ID ตาม log/output เดิม ไม่ทำสำเนาไฟล์; เก็บ ID ของ output ที่เหลือเมื่อเลือกบาง output มาลบ
- เลือกหลาย asset เพื่อลบหรือ export ZIP พร้อม assets.json; full project backup รวม production.json
- ลบ generation ผ่าน Activity/Home แล้วปรับ catalog ด้วย; Clear generations เก็บ imported assets ไว้
- ตรวจ local inputs ของ remaining history และ durable jobs รวม references ข้ามโปรเจกต์ก่อนลบไฟล์
- เก็บ sourceMediaUrls ของ generation ใหม่ก่อนแปลง local input เป็น public upload URL และเก็บใน durable job เพื่อ recovery

### Schema และ API ปัจจุบัน

`production.json` ใน Phase 1 มีเพียง `{schemaVersion: 1, revision, assets}` ยังไม่มี scene, shot, take หรือ sequence อย่า overwrite unknown fields เมื่อขยาย schema ในเฟสถัดไป

- `GET /api/projects/:projectId/production` — reconcile generation history ที่สำเร็จกับ catalog แบบ idempotent
- `POST /api/projects/:projectId/assets/import` — raw media body; headers Content-Type, X-File-Name (URI encoded), X-Library-Revision
- `PATCH /api/projects/:projectId/assets/:assetId` — revision, name, role, tags
- `POST /api/projects/:projectId/assets/delete-many` — revision, assetIds; คืน catalog และ updated history
- `POST /api/projects/:projectId/assets/export` — assetIds; คืน ZIP พร้อม manifest
- Full backup endpoint เดิมรวม production metadata ภายใต้ project write lock

Metadata writes ใช้ project queue เดียวกับ history, temporary file + rename และ revision conflict 409 โดย UI มี Reload library ข้อมูล JSON เสีย/เวอร์ชันไม่รองรับแจ้ง error และไม่แทนที่ไฟล์ต้นฉบับ

### ผลตรวจรับ

- `npm run lint` ผ่าน
- `npm run check:library` ผ่าน (รวม production build และ isolated server/restart/ZIP fixtures)
- `npm test` ผ่าน รวม provider contracts, durable queue, polling, pricing, catalog, thumbnail/workflows และ H3 proxy
- `node scripts/check-improvements.mjs` ผ่าน รวม shared-file deletion และ history concurrency เดิม
- Library fixture ตรวจ image/audio/video imports, malformed media, oversized Content-Length 413, invalid project/path, 200/409 competing edits, multi-output identity, restart persistence, corrupt JSON preservation, cross-project references และ ZIP contents
- Codex in-app browser ตรวจ Import PNG ผ่าน file chooser, ชื่อภาษาไทย/role/tags, reload persistence, filters, Escape/focus restoration และ reference image ถูก attach ใน Reference → Video
- Browser viewport จริง 1280×800 และ 571×800 ไม่พบ horizontal overflow ใน Library/details
- ไม่มี paid generation; ไม่ทดลอง provider upload/production quality จริง และไม่ใช้ data ของผู้ใช้เป็น fixture

### ข้อจำกัดและงานต่อ

- Metadata ของไฟล์เก็บ bytes เสมอเมื่อมี local file; dimensions/duration เป็น optional หากไม่มี ffprobe หรือไฟล์อ่านไม่ได้
- Reference safety ย้อนหลังได้เฉพาะ local input ที่มีอยู่ใน log/settings; public upload URL ของ generation เก่าที่ไม่มี original local link ไม่สามารถเดาเชื่อมกลับได้
- การบันทึก production/history ใช้ atomic replacement ต่อไฟล์ ยังไม่ใช่ transaction หลายไฟล์แบบฐานข้อมูล; ไม่มี filesystem crash/power-loss injection ในรอบนี้
- Full backup เก็บ library ของโปรเจกต์นั้น; ยังไม่มี self-contained dependency package/restore UI สำหรับ references ที่ชี้ข้ามโปรเจกต์
- ยังไม่ตรวจ Safari/Chrome standalone ทุกเวอร์ชัน; production build เตือน bundle หลักเกิน 500 kB ตาม Vite ยังไม่ได้ทำ performance benchmark
- `npm run check:library` เป็นคำสั่งแยกที่ build ก่อนตรวจ ไม่ได้แทรก build เข้า npm test เดิม
- หมายเหตุย้อนหลังเมื่อจบ Phase 1: Phase 2 ต้องเริ่มจาก Board/take context และ deletion guards; ผลที่ implement ต่อแล้วอยู่ในหัวข้อ 12

## 12. ผล Phase 2–4 และ handoff สำหรับ review (2026-10-07)

### ขอบเขตที่ทำจริง

- เมนู Studio ใช้ Overview / Board / Edit; Library อยู่ใน navigation เดิมเพื่อไม่ทำ UI ซ้ำ
- `production.json` schemaVersion 1 เพิ่ม optional `studio`; assets เดิมไม่ migrate ทับและ unknown top-level fields ยังถูกเก็บ
- Overview: brief, visual look, named default references; Shot เพิ่ม Action/Camera/Lighting/Dialogue, model/schema parameters, storyboard, reference override (ปิดการ inherit ได้), provider-input JSON, take notes และ approved asset ID
- Scene/Shot CRUD และ reorder; sequence import ใช้ scene order แล้ว shot order ไม่ใช่เวลา generation จบ
- Job และ history เก็บ `productionShotId`; grouping ใช้ identity ไม่ใช่ตำแหน่งใน list ผลใหม่ไม่เปลี่ยน approval โดยอัตโนมัติ Original prompt/settings ของแต่ละ take อยู่ใน history snapshot
- Batch สร้าง selected หรือ missing shots หลังยืนยันจำนวน/ราคา ใช้ durable queue เดิม ส่งทีละ create request แต่ queue รันตาม concurrency settings ไม่ retry paid failure เอง ราคาคำนวณจาก model/resolution/duration/count และความยาว reference video; unknown แสดงชัด และแยกยอดแต่ละ provider
- H3 Prompt Director / A-B เดิมยังอยู่ในหน้า Create; Studio ไม่บังคับ compiler และไม่ได้เพิ่ม A-B batch button ใหม่ Camera presets เป็น prompt เท่านั้น ไม่อ้างว่าเป็น native camera control
- Edit: persisted ordered image/video clips, trim/split/reorder, voice/music source trims, offsets, volume และ mute นำ approved take ลง sequence แบบ explicit; approvals ใหม่ไม่ rewrite clips เดิม
- Server export ใช้ trusted regular local files เท่านั้น มี source snapshot ก่อน render, normalize video/audio, MP4 H.264/AAC, progress, cancellation และ failure ไม่มี partial result ใน Library
- Completed sequence เป็น Library asset (source imported + sequence-export tag) พร้อม provenance JSON ที่ดาวน์โหลดจาก asset details ได้ Delivery ZIP มี original selected files, shot-based names และ manifest ที่รวม edit/audio settings ไม่ใช่ native NLE project
- Single/bulk/clear Activity และ Library deletion บล็อก assets ที่เป็น storyboard/reference/approval/take notes/sequence โดยถอดออกจาก Board/Edit ก่อน ลบ Scene/Shot ไม่ลบ media
- Save project เป็น explicit action; unsaved edits เก็บใน sessionStorage แยก project และกลับมาได้เมื่อเปลี่ยนหน้าใน browser session เดิม ถ้า revision เปลี่ยนจะบอก conflict ไม่ overwrite ข้อมูลอีก tab อัตโนมัติ

### API เพิ่มเติม

```text
PUT  /api/projects/:projectId/studio                 {revision, studio}
POST /api/projects/:projectId/sequence/export        {revision} -> 202 render id
GET  /api/projects/:projectId/sequence/export/:id    progress / status / result URL
POST /api/projects/:projectId/sequence/export/:id/cancel
POST /api/projects/:projectId/sequence/delivery      {revision} -> ZIP
```

Render source snapshot และ destination catalog write ใช้ project lock เดิม รับได้สูงสุดสอง local renders และหนึ่ง render ต่อ project FFmpeg ใช้ `FFMPEG_PATH`/`FFPROBE_PATH` หรือ installed binaries ไม่เพิ่ม dependency

รายละเอียด concat / mixing / delay อ้างอิง [FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html) และตรวจการทำงานจริงด้วย local fixtures ไม่ใช่อาศัยเอกสารอย่างเดียว

### หลักฐานตรวจ

- `npm run lint`: TypeScript ผ่าน
- `npm test`: provider contracts, durable generation queue/recovery/cancel/spend caps, polling, credits, catalog, media workflows และ H3 proxy ผ่าน ใช้ provider mocks ไม่จ่ายเครดิต
- `npm run check:production`: direction/reference compiler, unsupported inputs, default-reference deduplication, H3 resolution costs, unknown pricing, sequence validation และ isolated server/library integration
- Server fixture: 2 scenes / 8 shots, revision conflicts, invalid scene references, approval retained after late take, legacy single/bulk/clear guards, full backup production.json, restart persistence
- Real local FFmpeg fixture: red then blue order, expected 2-second duration / 1280×720, audio stream present; frequency-isolated RMS confirms 880 Hz voice appears after configured 0.5 s offset Delivery ZIP contains selected clips/audio and manifest Cancellation and missing FFmpeg produce no partial catalog result
- Codex in-app browser: 1280×800 and 640×800 with no document horizontal overflow, Board/inspector, H3 768P↔2K price 48↔78 cr at 6 seconds, JSON, save and draft recovery after Library navigation, Edit/audio controls and UI render reaching completed/100%
- ภาพจริงจาก disposable fixture: `docs/production-studio-verified.jpg` และ `docs/production-edit-verified.jpg` ไม่ใช่งาน paid generation; keyboard Enter เปิด Shot inspector ได้ Render completion refresh ยืนยันข้อความ MP4 saved in Library และรายการ asset ใหม่

### ข้อจำกัดที่ต้องรู้ก่อน production rollout

- ไม่ได้ส่ง paid generation หรือทดสอบ continuity กับ Kie/Higgsfield จริง และไม่ได้ทดสอบ browser/project-switch out-of-order completion กับ provider จริง Queue checks ใช้ mocks จึงไม่รับรองความเหมือนตัวละคร/ฉากระหว่างโมเดล
- Native camera schema ไม่ถูกเดา; references จำกัดตาม schema การมี reference ไม่รับรอง semantic continuity
- Render jobs เป็น transient local tracking ไม่ resume หลัง server restart การ restart ระหว่าง render อาจทิ้ง temp directory ให้ OS cleanup; saved sequence และ completed outputs ยังอยู่ ห้ามอ้างว่า render restart recovery เทียบเท่า durable provider queue
- Progress เป็นช่วงการทำงาน/จำนวน clips ไม่ใช่ ETA หรือ frame-accurate overall percentage Local export จำกัด 60 นาที; ไม่มี benchmark งานยาว/ไฟล์ใหญ่/500 clips
- Timeline เป็น compact assembly list ไม่ใช่ waveform/dragging DAW; ดูผลรวมด้วย MP4 export ไม่มี live multi-track playback engine เพิ่ม
- Browser drafts ไม่แทน Save/backup และไม่ใช่ recovery ข้าม browser session; ถ้า conflict ต้องเก็บ edits แล้ว reload ไม่มี automatic three-way merge
- Atomic JSON replacement ต่อไฟล์ยังไม่เป็น database transaction; ยังไม่มี power-loss/disk-full injection หรือ restore UI Full backups ของ project ไม่ bundle foreign-project references อัตโนมัติ
- Bundle warning >500 kB ยังมี; ไม่มี performance benchmark, Safari/standalone Chrome certification หรือ native Premiere/Resolve export
- Worktree รวมใน release v2.3.0 (2026-11-03) และไม่ได้ publish/deploy การเปรียบเทียบ GitHub ไม่เท่ากับเผยแพร่ feature รอบนี้

### ภาพแนวคิด

ไฟล์ `docs/production-studio-concept.png` สร้างด้วย built-in imagegen เป็น **design concept ไม่ใช่ screenshot ของแอปจริง** รูปแนวคิดแสดงบางองค์ประกอบเกิน implementation เช่น waveform UI; ตรวจ feature จริงตามรายการด้านบน

Prompt ที่ใช้ (built-in mode):

> Use case: ui-mockup. Create a polished realistic desktop web-app interface concept for MediaKie production studio, landscape 16:10, designed for a compact 13-inch laptop. Existing visual language: near-black surfaces, purple primary buttons, crisp white and gray typography. Show a practical storyboard workspace, not a marketing landing page. Left compact navigation MediaKie, Create, Library, Projects. Top project title 'Short Film' with tabs 'Overview', 'Board', 'Library', 'Edit'. Main area two scene sections with three cinematic storyboard thumbnail cards each, each showing shot number, duration, status and tiny take counts. Selected shot right inspector with compact tabs 'Direction', 'References', 'Takes', Action Camera Lighting fields, resolution 1080p and duration 6s, visible request JSON toggle and purple Generate button with cost. Bottom compact saved sequence strip with video clips and voice/music tracks; no enormous input preview hiding controls. Thumbnail imagery coherent cinematic forest short-film mood. High fidelity usable UI, restrained spacing, readable short labels, no Runway or Higgsfield logos. This is a design concept, not evidence of completed software.
