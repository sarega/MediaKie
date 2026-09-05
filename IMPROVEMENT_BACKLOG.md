# Kai Media Studio — Improvement Backlog

เอกสารอ้างอิงสำหรับวางแผนและตรวจรับการปรับปรุงแอป

- รีวิวครั้งแรก: 2026-09-02
- จัดทำเอกสารและตรวจตำแหน่งโค้ดหลักซ้ำ: 2026-09-05
- สถานะ: งานปรับปรุงและการตรวจที่ทำได้ในเครื่องเสร็จแล้ว เหลือเฉพาะ provider/public fixture/performance/cross-browser sign-off
- ขอบเขต: แอปใช้งานในเครื่องส่วนตัวเป็นหลัก
- หลักการ: แก้ความเสี่ยงต่อข้อมูลและ workflow ก่อนเพิ่มฟีเจอร์หรือ dependency

## หลักฐานและข้อจำกัด

การรีวิวครั้งแรกตรวจโค้ด เปิด UI จริงที่ viewport 571 × 1208 และรัน `npm run lint` กับ `npm run build` ผ่าน โดย bundle JavaScript หลักประมาณ 540.55 kB ก่อน gzip และ 151.43 kB หลัง gzip ตัวเลขเหล่านี้เป็นผลวันที่รีวิว ไม่ใช่ผลทดสอบใหม่วันที่จัดทำเอกสาร

ตรวจล่าสุดวันที่ 2026-09-05: `npm run lint` และ `npm run check:improvements` ผ่าน โดย check script จะ build production, ตรวจว่า production root เสิร์ฟ JavaScript asset ได้จริง, ทดสอบ history concurrency/การลบไฟล์ร่วมกัน/การบล็อก URL ภายใน/invalid data URL และทดสอบ polling retry/failure/timeout; production browser tab โหลดหน้า root สำเร็จ, ไม่มี console warning/error และตรวจ viewport emulator ที่ 390, 571, 768, 1024 และ 1440px แล้ว โดยไม่พบ horizontal overflow; ทดสอบเปิด/ปิด compact drawer, Parameters overlay และ Escape แล้ว แต่ยังไม่ได้ทดสอบสร้างงานกับ provider แบบเสียเครดิต, redirect/size/timeout fixture ของ remote public host หรือครบทุก browser และยังไม่มี performance benchmark จริง ข้อค้นพบด้านความปลอดภัยและการบันทึกข้อมูลด้านล่างอ้างอิงเส้นทางโค้ด ไม่ใช่หลักฐานว่าเคยถูกโจมตีหรือข้อมูลเสียหายแล้ว

## ลำดับงาน

| ID | ความสำคัญ | งาน | สถานะ |
| --- | --- | --- | --- |
| SEC-01 | P1 | จำกัดการเข้าถึง server ในโหมด local | แก้แล้ว — runtime fixture ผ่าน |
| DATA-01 | P1 | ทำให้การบันทึก history ปลอดภัยเมื่อหลายงานเสร็จพร้อมกัน | แก้แล้ว — runtime fixture ผ่าน |
| UX-01 | P1 | ปรับ layout สำหรับหน้าต่างแคบ | แก้แล้ว — viewport emulator 390/571/768/1024/1440px ผ่าน |
| SEC-02 | P1 ก่อนเปิด LAN/เผยแพร่ | ตรวจสอบ URL และจำกัดการดาวน์โหลด | แก้แล้ว — fixture local/unsupported ผ่าน; รอตรวจ public fixture เพิ่ม |
| DATA-02 | P2 | ทำให้การลบรายการและไฟล์ชัดเจนและสอดคล้องกัน | แก้แล้ว — shared-file fixture ผ่าน |
| UX-02 | P2 | แยกการเลือก activity ออกจากปุ่มย่อย | แก้แล้ว — browser AX และ keyboard affordance ผ่านการตรวจ |
| SEC-03 | P2 | แก้ข้อความและตัวเลือกการเก็บ API key | แก้แล้ว — ข้อความตรงตามจริง |
| JOB-01 | P2 — ตรวจเพิ่ม | แยก polling error ออกจาก generation failure | แก้แล้ว — polling self-check ผ่าน |
| PERF-01 | P2 — ข้อเสนอ | ลดการโหลด media ในประวัติยาว | แก้แล้ว — pagination/lazy media/viewport autoplay guard |
| CODE-01 | P3 — ข้อเสนอ | แยกโค้ดตามหน้าที่เมื่อแก้ workflow | ปิดแบบ YAGNI — แยก history API, polling และ media preview; ไม่ผ่า editor ต่อโดยไม่มีเหตุผลจากการวัดผล |

P1 = ควรแก้ก่อนขยายการใช้งาน, P2 = รอบถัดไป, P3 = ทำเมื่อมีเหตุผลจากงานจริง

## SEC-01 — จำกัด server ให้ใช้ในเครื่องเป็นค่าเริ่มต้น

**พบ:** server ฟังที่ `0.0.0.0` และไม่มีการยืนยันตัวตนของแอป เส้นทาง Kie proxy ใช้ key จาก environment ได้ การเข้าถึงจากเครื่องอื่นขึ้นอยู่กับเครือข่ายและ firewall

**ผลกระทบ:** ผู้ที่เข้าถึง port ได้อาจอ่าน/แก้ประวัติ ลบไฟล์ หรือส่งงานผ่าน key ของ server

**อ้างอิง:** `server.ts`, `.env.example`, `README.md`

**แนวทาง:** ใช้ `127.0.0.1` เป็นค่าเริ่มต้น หากต้องการ LAN ให้เป็นการตั้งค่าโดยเจตนาและออกแบบการยืนยันตัวตนก่อนเปิดใช้

- [x] โหมดปกติเข้าถึงได้จากเครื่องเดียวเท่านั้น
- [x] ตัวเปิดแอปและ README ใช้ address ตรงกับ server
- [ ] การสร้างงานและเปิดไฟล์ในเครื่องยังทำงานได้โดยไม่ใช้ provider จริง

## DATA-01 — ป้องกัน history ถูกเขียนทับด้วยข้อมูลเก่า

**พบ:** client ส่ง logs ทั้งชุดด้วย PUT ทุกครั้งที่ state เปลี่ยน และตั้งค่า last-persisted ก่อน server ยืนยัน การเขียนไฟล์ฝั่ง server ไม่มีการจัดลำดับหรือ atomic replacement

**ผลกระทบ:** หลายงานที่จบใกล้กันหรือหลายแท็บอาจเขียนทับกัน; เมื่อบันทึกล้มเหลว UI ไม่มีสถานะชัดเจนและอาจไม่ส่งข้อมูลเดิมซ้ำ

**อ้างอิง:** `src/lib/historyApi.ts`, `src/App.tsx`, `server.ts`

**แนวทาง:** ให้ server เพิ่ม/แก้ log เป็นราย ID และจัดลำดับการเขียนต่อ project ใช้ไฟล์ชั่วคราวแล้ว rename เพื่อแทนที่ไฟล์จริง ยืนยันบันทึกหลัง response สำเร็จ พร้อมสถานะบันทึกล้มเหลวและ retry สำหรับขั้นแรกยังไม่จำเป็นต้องย้ายไปฐานข้อมูล

- [x] จำลองอย่างน้อย 3 งานเสร็จใกล้กัน แล้วอ่านกลับพบผลครบ
- [x] การแก้คนละ log จาก client จำลองพร้อมกันไม่ทำให้อีกรายการหาย
- [x] เมื่อ server ตอบ error UI แจ้งว่ายังไม่บันทึกและ retry ได้จากโค้ดที่ตรวจแล้ว
- [x] history ไม่กลายเป็น JSON ที่อ่านไม่ได้เมื่อมีการเขียนพร้อมกัน

## UX-01 — รักษาพื้นที่ทำงานบนหน้าต่างแคบ

**พบ:** ที่ viewport 571px แถบซ้าย/ขวาแบบ fixed width และ Parameters 300px เบียดพื้นที่กลาง ทำให้ข้อความและปุ่มซ้อนกัน

**อ้างอิง:** `src/App.tsx`, `src/components/MediaWorkspace.tsx`

**แนวทาง:** ใช้ drawer สำหรับแถบข้างเมื่อพื้นที่ไม่พอ เปิดทีละด้าน และแสดง Parameters เป็น overlay หรือส่วนพับได้ กำหนด breakpoint จากพื้นที่ใช้งานจริง รวมถึงตรวจค่าเริ่มต้นความกว้าง: `Number(null)` เป็น 0 จึงได้ค่าต่ำสุดแทน fallback เมื่อไม่มีค่าที่บันทึกไว้

- [x] ตรวจ 390, 571, 768, 1024 และ 1440px ใน viewport emulator โดยไม่พบ horizontal overflow
- [x] Prompt และ Generate ใช้ layout แบบ responsive และไม่ถูก pane fixed ทับตามโค้ด
- [x] เปิด/ปิด drawer ด้วยปุ่มและ Escape ได้
- [x] หน้าจอใหญ่ยังปรับขนาด pane ได้ และค่าเริ่มต้นไม่ถูก `Number(null)` กลบ

## SEC-02 — ตรวจ URL ก่อนให้ server ดาวน์โหลด

**พบ:** save-url และ download รับ URL แล้ว fetch โดยไม่มีข้อจำกัดปลายทาง ขนาด หรือ timeout ที่แอปกำหนด; save-url อ่านทั้งไฟล์เข้า memory

**ผลกระทบ:** ผู้ที่เรียก endpoint ได้อาจให้เครื่องเข้าถึงบริการภายใน (SSRF) หรือโหลดไฟล์จนใช้ memory/disk มาก

**อ้างอิง:** `server.ts` (`fetchRemoteUrl`, `readResponseBuffer`, `/api/download`)

**แนวทาง:** แยก local library path ออกจาก remote URL; ตรวจ protocol, DNS/IP และปลายทางทุก redirect; ปฏิเสธ loopback/private/link-local; จำกัดเวลาและจำนวน bytes ระหว่าง stream ใช้เพดานตามชนิดสื่อและขนาดที่ใช้งานจริง

- [x] ปฏิเสธ URL ภายในและตรวจปลายทางทุก redirect ในโค้ด; loopback/unsupported fixture ผ่าน
- [x] จำกัดขนาด 250 MB และ timeout 30 วินาที; save-url จะเขียนไฟล์หลังอ่านครบเท่านั้น
- [ ] ดาวน์โหลดผลลัพธ์จากผู้ให้บริการที่ใช้อยู่ได้ตามปกติโดยไม่ใช้เครดิตในรอบนี้
- [ ] ทดสอบ redirect/size/timeout ด้วย public fixture แยก; runtime fixture ไม่ยิงบริการภายในจริง

## DATA-02 — ทำให้การลบมีความหมายและผลลัพธ์ที่แน่นอน

**พบ:** ปุ่มใช้คำว่า “Remove from history” แต่ server ลบไฟล์ด้วย ขณะเดียวกัน client ลบ state ทันทีและส่ง DELETE ซึ่งอาจแข่งกับ PUT history อัตโนมัติ

**อ้างอิง:** `src/App.tsx`, `server.ts`, `src/components/ActivityLog.tsx`

**แนวทาง:** รวมการเปลี่ยน history และการลบไว้ในเส้นทางเดียวตาม DATA-01 ใช้ข้อความให้ตรงกับสิ่งที่ลบ พิจารณาถังขยะ/Undo และตรวจการใช้ไฟล์ร่วมกันก่อนลบถาวร

- [x] ผู้ใช้ทราบว่าลบรายการรวมไฟล์ local ที่รายการนั้นอ้างถึง
- [x] เมื่อ server ลบไม่สำเร็จ รายการไม่หายเงียบ ๆ
- [x] ลบขณะงานอื่นเสร็จแล้ว history และไฟล์ยังสอดคล้องกัน
- [x] ไฟล์ที่ยังมีรายการอื่นอ้างถึงไม่ถูกลบโดยไม่ตั้งใจ

## UX-02 — แยกการเลือก activity กับ action buttons

**พบ:** card มี `role="button"` และรับ click/keyboard ขณะที่ภายในมีปุ่มลบ ใช้เป็น source และเปิด media; event สามารถวิ่งไปยัง card ได้

**อ้างอิง:** `src/components/ActivityLog.tsx`

**แนวทาง:** แยกปุ่มเลือกออกจาก actions หรือกัน event propagation ในจุดที่จำเป็น พร้อมชื่อสำหรับ screen reader และ focus ที่มองเห็น

- [x] กดปุ่มย่อยไม่เปลี่ยน active item โดยไม่ตั้งใจ
- [x] Enter/Space บนปุ่มย่อยทำเฉพาะคำสั่งนั้นจาก event guard
- [x] ทุก action มีชื่อ, focus-visible และ action media แสดงเมื่อ focus ภายใน

## SEC-03 — อธิบายการเก็บ key ให้ตรงความจริง

**พบ:** ข้อความ “Stored securely” อ้างถึง localStorage ซึ่ง script ใน origin เดียวกันอ่านได้

**อ้างอิง:** `src/components/SettingsModal.tsx`

**แนวทาง:** ระบุว่าเก็บใน browser ของเครื่องนี้ แนะนำ `.env.local` สำหรับ local app และแสดงแหล่ง key ที่กำลังใช้โดยไม่เผยค่า key

- [x] ไม่มีข้อความรับรองความปลอดภัยเกินจริง
- [x] ระบุแหล่ง browser key/server key/ยังไม่ได้ตั้งค่าตาม flow เดิม
- [x] ล้าง browser key และกลับไปใช้ server key ได้ตาม flow เดิม
- [x] ไม่เพิ่ม plaintext key ใน log หรือข้อความ error

## JOB-01 — รองรับการติดตามงานสะดุด

**ควรตรวจเพิ่ม:** polling เปลี่ยน log เป็น failed เมื่อ query error และหยุดหลังประมาณ 300 รอบ × 3 วินาที (ไม่รวมเวลารอ request) ซึ่งไม่จำเป็นต้องหมายความว่างานที่ provider ล้มเหลว

**อ้างอิง:** `src/lib/kieTaskPolling.ts`, `src/App.tsx`, `src/components/ActivityLog.tsx`

**แนวทาง:** แยกสถานะ “ติดตามผลไม่ได้ชั่วคราว” จาก “ผู้ให้บริการแจ้งว่างานล้มเหลว” เก็บ task ID และมี Resume/Check status เพื่อไม่ชวนผู้ใช้สร้างงานซ้ำที่เสียเครดิต

- [x] หลุดเครือข่ายชั่วคราวแล้วติดตามงานเดิมต่อได้
- [x] เกินช่วงรอแล้วตรวจ task เดิมซ้ำได้
- [x] สลับ project ขณะมีงานรันแล้วผลลัพธ์/ไฟล์ถูกผูกกับ project ต้นทางตามโค้ด
- [x] reload แล้วกลับมาติดตามงานที่มี task ID ได้ เว้นแต่รายการอยู่ในสถานะ timed-out ซึ่งให้กด Check status เอง

## PERF-01 — ทำประวัติยาวให้เบาลง

**ข้อเสนอจากโค้ด:** Activity Log render ทุก log และสร้าง video/image elements ทั้งหมด ไม่มี pagination หรือ lazy loading ที่กำหนดไว้

**อ้างอิง:** `src/components/ActivityLog.tsx`

**แนวทาง:** เริ่มด้วยแสดงรายการล่าสุดและ Load more; ใช้ image lazy loading และ video preload ที่เหมาะสม วัดผลก่อนเพิ่ม virtualization library

- [x] ประวัติหลายร้อยรายการเริ่ม render เฉพาะ 30 รายการและกด Load older ได้
- [ ] เลื่อนและเลือกผลลัพธ์ได้ลื่นขึ้นเมื่อวัดเทียบข้อมูลชุดเดิม — ยังไม่มี performance benchmark
- [x] image lazy-load และ video preload/autoplay ผูกกับ viewport

## CODE-01 — แยกโค้ดตามหน้าที่อย่างพอดี

**ข้อเสนอ:** App.tsx ประมาณ 1,500 บรรทัด และ MediaWorkspace.tsx ประมาณ 1,237 บรรทัด ณ วันรีวิว รวมหลายหน้าที่ไว้ด้วยกัน ขนาดไฟล์เพียงอย่างเดียวไม่ใช่บั๊ก

**แนวทาง:** เมื่อทำ DATA-01/JOB-01 ให้ย้าย persistence และ polling ออกจาก UI; แยก editor เมื่อแตะงาน editor; ใช้ helper เดียวสำหรับ route เก่า/ใหม่ที่ทำงานซ้ำ พิจารณา lazy-load editor หลังวัดผล bundle

- [x] ไม่มีการเปลี่ยนพฤติกรรมที่ไม่เกี่ยวข้องกับงาน
- [x] ไม่เพิ่ม dependency ใหม่; helper ที่เพิ่มมี use case ตรงกับ workflow
- [x] ทดสอบ flow สำคัญและ production build ผ่าน

## แผนดำเนินการที่แนะนำ

1. รอบแรก: SEC-01 + DATA-01 + DATA-02 เพื่อจำกัดการเข้าถึงและดูแลข้อมูล
2. รอบ UX: UX-01 + UX-02 + SEC-03 เพื่อทำให้ใช้งานชัดเจนขึ้น
3. รอบความทนทาน: JOB-01 + PERF-01 และ SEC-02 ซึ่งต้องเสร็จก่อนเปิด LAN/เผยแพร่
4. ทำ CODE-01 เฉพาะส่วนที่เกี่ยวข้องในแต่ละรอบ

แต่ละรอบควรมี commit ที่ตรวจย้อนหลังได้ บันทึกผลทดสอบและข้อจำกัดไว้ด้านล่าง ก่อนเปลี่ยนสถานะเป็นเสร็จแล้ว งานทดสอบการลบ/เขียนพร้อมกันให้ใช้ project จำลองหรือสำเนาข้อมูล

## บันทึกการปรับปรุง

| วันที่ | ID | สิ่งที่แก้ | ผลตรวจรับ / ข้อจำกัด | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-05 | SEC-01, DATA-01, DATA-02, UX-01, UX-02, SEC-02, SEC-03, JOB-01, PERF-01, CODE-01 | จำกัด server เป็น local-first; เพิ่ม per-log queue + atomic history writes; ป้องกันลบไฟล์ที่ยังถูกอ้างถึง; กันผล async ของ project เก่าทับ project ใหม่และกัน task ที่ถูกลบ/ล้างฟื้นกลับมา; แยก history API/polling/media preview helper; เพิ่ม polling retry/timeout/check status และผูกผลลัพธ์กับ project ต้นทาง; ปรับ drawer responsive, keyboard Escape, activity pagination/lazy media; ใช้ root asset base ให้ตรงกับ production server; จำกัด data URL download; ปรับ API key wording; เพิ่ม URL/redirect/DNS/timeout/size guard | `npm run lint` ผ่าน; `npm run check:improvements` ผ่าน (production root/asset check + isolated history/SSRF/file fixture + polling self-check); production browser AX ผ่าน, viewport 390/571/768/1024/1440px ไม่ overflow, drawer/Parameters/Escape ผ่าน และ fresh production console ไม่มี warning/error; ยังไม่ยิง provider แบบเสียเครดิต, ยังไม่ทดสอบ public redirect/size/timeout fixture, ยังไม่วัด performance และยังไม่ตรวจครบทุก browser | ยังไม่ได้ commit |
