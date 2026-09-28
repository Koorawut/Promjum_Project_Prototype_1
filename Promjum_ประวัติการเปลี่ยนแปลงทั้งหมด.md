# PromJum — สรุปการเปลี่ยนแปลงทั้งหมด แบ่งตามเวอร์ชัน (ต้นจนถึง v1.3.1)

รวบรวมจาก git history จริง (35 commits บน `main`) + README ทั้ง 4 ไฟล์ + checkpoint files
อัปเดตล่าสุด: 28 กันยายน 2026

---

## ก่อนมีระบบเวอร์ชัน (กันยายน 2026)

> ช่วงนี้ยังไม่มี version badge — แบ่งตาม checkpoint/ช่วงงานแทน อ้างอิง commit จริง

### ช่วงก่อนเริ่ม (Prototype + เริ่ม monorepo)
- **`89ec0c7` Initial commit** — SpeakUp (Promjum) monorepo: NestJS API (`apps/api`) + Next.js frontend (`apps/web`) ตามสถาปัตยกรรมใน `developer-manual.md`
- **`9bdbafa` → `224c472`** — แก้ปัญหา deploy ขึ้น Railway ครั้งแรกทั้งห่วง: ตั้ง build/start ชัดเจนใน `railway.json`, เปลี่ยนจาก Railpack เป็น **Dockerfile เอง** (npm-workspace output ไม่น่าไว้ใจ), บังคับ dev deps ตอน build, แก้ entrypoint path (`dist/src/main.js` ไม่ใช่ `dist/main.js`)

### ช่วงที่ 1 — เชื่อมต่อระบบหลักให้ใช้งานจริงได้
- **`a107af9`** — แก้ BOM ใน env vars ของ API URL + production fallback
- **`b130abd`** — แก้ session หลุดตอน refresh (cookie `SameSite=None` เพราะคนละ domain), ปุ่มกลับหน้าหลัก, เพิ่ม TURN relay สำหรับเสียงข้ามเครือข่าย
- **`f30e041` + `3fec558`** — TURN ผ่าน Metered proxy endpoint (จัดรูปแบบ iceServers ให้ตรง response จริง)
- **`5ceaa31`** — แก้ lobby layout shift, refresh-race logout, voice-readiness gating
- **`8c1f37c`** — เริ่ม WebRTC negotiation ทันทีที่เข้าหน้าเกม (ไม่รอ `round_start`)
- **`c22fe05`** — แก้ cold-start WebRTC signal race + **บังคับ 1 session ต่อบัญชี** (login ที่อื่น = ไล่ที่เดิมออก) + แจ้งเมื่ออีกฝ่ายออก
- **`d90d488`** — คุยต่อหลังจบเกมได้จนกด "เสร็จสิ้น" หรือครบ 30 วิ
- **`2e686ce`** — แก้ teardown สาย post-match + rematch state พัง + ไมค์เริ่มต้นปิด
- **`13ef81f`** — ไมค์เปิดเมื่อรอบ 1 เริ่มจริง + รอบ 1 รอทั้งสองฝั่งโหลดหน้าเสร็จก่อน
- **`71d8745`** — ทางออกจากสายทุกทาง (กลับหน้าหลัก/ฝึกพูด/เล่นอีกรอบ/logout) = ตัดสายทั้งสองฝั่ง
- **`8a7c845`** — แก้ mobile call-exit หลุด + เสียงข้ามเครือข่ายล้มเหลว
- **`d5d8f5b`** — แก้ duplicate-login กลางแมตช์ที่ทำให้ทั้งคู่ค้าง (checkpoint `Promjum_Prototype_1_1`)
- **`cd3ad0a`** — รอบ 1 รอเสียงเชื่อมจริงทั้งสองฝั่ง (60 วิ ไม่งั้นจบแมตช์ด้วย `voice_failed`) + เคลียร์แมตช์ผี (haunted matches)
- **`833ccd7`** — เอกสาร + พบว่า URL production จริงคือ `web-woad-two-58zkxybk8s.vercel.app` (อีก alias โดน Deployment Protection)

### ช่วงที่ 2 — Bug ที่แก้ไม่หาย: root cause ที่ฝั่ง client
- **`9013e25`** — **socket.io singleton race** ฝั่ง client (`socket-client.ts`): component หลายตัวเรียก `getSocket()` พร้อมกันแล้ว tear down ของกันเอง — อธิบายอาการ force_logout ไม่ถึง/เสียงไม่เสถียร/คนบางบัญชีต่อเสียงไม่ได้ทั้งหมดพร้อมกัน → แก้ด้วย reuse ตาม token อย่างเดียว (checkpoint `Promjum_Prototype_1_2`)

### ช่วงที่ 3 — 4-way adversarial audit: แก้ 14 บัค
- **`5593bec`** — พบ 14 จุด แก้ครบ (ปัญหา 20–30): socket auth lockout ถาวร (auth เป็น callback + refresh ตอน `connect_error`), double-session race (`UserSession.userId @unique` + atomic upsert), Google OAuth CSRF + กัน account takeover, gateway races 4 จุด, concurrent refresh 500, email enumeration, CORS comma-list, score clamp, dangling FK 404, ParseUUIDPipe, partial unique index ที่ DB ระดับ (checkpoint `Promjum_Prototype_1_3`)

### ช่วงที่ 4 — Admin Panel
- **`359e443`** — Admin Panel ฉบับเต็ม: `UserRole` + role ใน JWT, `AdminGuard`, `/admin/stats|quizzes CRUD|users`, MediaService (เก็บไฟล์ใน Postgres `media_files`), `Sentence.textTh` + `isEnabled` (อัปเดตเนื้อหาทันทีไม่ต้อง deploy), หน้า `/admin` + `/admin/quizzes` + `/admin/users` — **ไม่มี hardcoded admin credentials** (ตั้ง admin ครั้งแรกผ่าน DB ครั้งเดียวเท่านั้น)
- **`cc98260`** — ลืม register MediaController ทำให้ GET /media/:id ตอบ 404 บน production
- **`847d0ea`** — แก้ 3 จุดจากการทดสอบจริง: navbar ซ้อน 2 อัน (ย้าย `admin/` ออกจาก `(protected)`), modal ไปโผล่มุมซ้ายล่าง (`useModalOpen()` + `showModal()`), แถวข้อมูล user เรียงเกะกะ

---

## ระบบเวอร์ชันเริ่มที่นี่ (มี badge ขวาล่างทุกหน้า)

> ธรรมเนียม: bump `APP_VERSION` ใน `apps/web/src/app/layout.tsx` ทุกครั้งที่ deploy สิ่งที่ user มองเห็น แล้วจดว่าเวอร์ชันนั้นเปลี่ยนอะไร

### v1.1 — เปลี่ยนชื่อเว็บ + version badge (commit `6a1979f`)
- เปลี่ยนชื่อ **SpeakUp → PromJum** ทุกจุด display (ไม่แตะ localStorage key เดิม)
- เพิ่ม **version badge** มุมขวาล่างทุกหน้า (เล็ก จางๆ กดไม่ได้) — ต้นทางเดียวที่ `APP_VERSION`
- จัดระเบียบ modal จัดการ Quiz ให้กลางจอ + เรียงเป็นระเบียบ (form สูงเลื่อนได้, การ์ดรูป/เสียง, footer ปุ่มชัด)
- บันทึก: ปัญหา 36

### v1.2 — แก้ quiz ที่แอดมินสร้าง/แก้ ใช้งานจริงพัง (commit `7257af9`)
จาก user report 3 อาการ (รูปไม่แสดง / choices ไม่แสดง / form ไม่ fill ข้อมูลเดิม + เสียงไม่ดัง):
1. **options format mismatch** — seed เก็บ keyed format แต่ admin รุ่นแรกบันทึก string array → สร้าง normalizer กลาง `quiz-options.util.ts` (บันทึกใหม่เป็น keyed เสมอ, อ่านของเก่าทั้งสองรูปแบบได้ — เยียวยาข้อมูลเก่าแบบ lazy ไม่แตะ DB)
2. **relative `/media/` path 404 บนโดเมน Vercel** — ย้าย `mediaSrc()` เป็น shared helper ใน `api-client.ts` ใช้ทั้งหน้า practice (รูป+เสียง) และแอดมิน
3. **form ไม่ fill** — อาการเดียวกับข้อ 1
- บันทึก: ปัญหา 37

### v1.3 — ฟังก์ชัน "จัดการมินิเกม" ใน Admin Panel (commit `02e49bb`)
ออกแบบตาม frontend design ใน `Promjum_Folder_Prototype_1/v1.3` — แอดมินจัดชุดคำตอบของเกมทายภาพ (4 รูป A–D + เลือก 1 รูปเป็น "ภาพคำตอบ") การเปลี่ยนแปลงมีผลกับ database จริงทันที:

- **การตัดสินใจหลัก: reuse ตาราง `ImageSet`/`GameImage` เดิม** (ไม่สร้างตารางใหม่) — seed 3 ชุดเดิมกับชุดที่แอดมินสร้างรวมเป็น pool เดียวที่ gateway สุ่ม
- **Migration `20260929000000`** — คอลัมน์ `position` บน `game_images` (ลำดับช่อง A–D นิ่งฝั่งแอดมิน, backfill ด้วย ROW_NUMBER, ผู้เล่นไม่กระทบเพราะ gateway สุ่มสลับภาพอยู่แล้ว)
- **API 4 endpoints** `/admin/minigame-sets` — POST ต้องแนบไฟล์ครบ 4 ตามลำดับ A–D, **PATCH ส่งเฉพาะไฟล์ที่เปลี่ยน + field `slots`** ("" = ช่องถูกแทน, URL เดิม = คงไว้ — ไม่ต้องอัปโหลดซ้ำ), DELETE ลบใน transaction
- **หน้า `/admin/minigame`** — list thumbnail A–D + ป้าย "คำตอบ", modal grid 2×2 เลือกไฟล์ทีละช่อง + radio เลือกภาพคำตอบ + พรีวิว "คนอธิบายจะเห็นอะไร" (ObjectURL revoke ทันทีที่เปลี่ยน/ปิด), เพิ่มใน admin nav + dashboard
- **รูปแอดมินโชว์ในเกมได้** — ใช้ `mediaSrc()` ทั้งฝั่งคนทายและคนอธิบายในหน้าเกม
- **ความปลอดภัยคงไว้**: ไม่ส่ง correctIndex ให้ client ฝั่งคนทาย, แมตช์ที่เล่นอยู่ไม่กระทบจากการลบ (runtime snapshot)
- บันทึก: ปัญหา 38 + checkpoint `Promjum_v1.3.md` (commit เอกสาร `ba26017`)

### v1.3.1 — e2e verification ครบ (commit `b907067`)
- **ทดสอบ e2e เต็มรูปแบบกับ production จริง: ผ่านครบ 36/36** ด้วย script `test-minigame-admin.js` (login บัญชีทดสอบ admin → ทดสอบทุก endpoint: สร้าง/ดูรายการ/แก้ไข/ลบ/validation — cleanup ตัวเอง ไม่แตะ seed)
- ยืนยันสิ่งสำคัญ: ไฟล์ที่เก็บโหลดกลับได้จริงผ่าน `GET /media/:id`, PATCH slots contract ทำงานถูก (ช่องที่ไม่แก้คง URL เดิม), guard กันคนนอก, seed ไม่เสียหาย
- อัปเดตผลทดสอบลง `README_รายงานการทดสอบ_Bug.md` (รอบที่ 5–6) + checkpoint + สถานะทุก README

---

## สรุปตัวเลขรวม

| | |
|---|---|
| Commits ทั้งหมดบน `main` | 35 |
| ปัญหาที่บันทึกใน README_ปัญหาและวิธีแก้ | 38 ปัญหา |
| Checkpoints | 1_1, 1_2, 1_3, v1.3 (`Promjum_Prototype_1_*.md`, `Promjum_v1.3.md`) |
| เวอร์ชันปัจจุบัน | **v1.3.1** (badge ขวาล่างทุกหน้า) |
| Production | API: Railway · Web: `https://web-woad-two-58zkxybk8s.vercel.app` · DB: Neon Postgres |
| Migrations | `20260927000000`, `20260927000100`, `20260928000000`, `20260929000000` (apply อัตโนมัติตอน Railway deploy) |

## งานที่ค้าง (ไม่ได้แก้ โดยตั้งใจ)
- ทดสอบด้วยมือ: UI มินิเกมใน browser, เล่นเกมจริงกับชุดที่สร้างเอง, ลบชุดกลางแมตช์ + device-test เดิม (voice PC↔Mobile, tester3/tester4)
- Google OAuth + Email ยืนยันจริง (รอ credentials)
- Session หลุดบน iPad/iPhone Safari (รอผลทดสอบซ้ำ)
- eslint เดิมที่ `game/[matchId]/summary/page.tsx:58` + lint debt 25 จุดใน `realtime.gateway.ts`
- Housekeeping: scratch files ที่ root, `railway config migrate` (ก่อน 2026-12-01), Vercel project หลอก `api`, OpenSSL line ใน Dockerfile
