# Promjum_Prototype_1_1 — บันทึกความคืบหน้า (Checkpoint)

วันที่: 27 กันยายน 2026
โปรเจกต์: SpeakUp (Promjum) — Next.js frontend + NestJS backend monorepo
ที่ตั้ง: `C:\Users\dadad\Documents\Promjum`

---

## สรุปสถานะปัจจุบัน (ณ จุดหยุดนี้)

### งานที่เสร็จสมบูรณ์ + deployed ขึ้น production แล้ว

**1. Fix การ login ซ้อนระหว่างเล่นมินิเกม** (commit `d5d8f5b` + `cd3ad0a`, **backend deployed และตรวจสอบแล้วใช้งานจริงบน production**)
- ปัญหาเดิม: login ซ้อนระหว่างเล่นเกม → user เดิมไม่ถูกไล่ออก, แมตช์ไม่จบ, session ใหม่โดนผูกกับแมตช์เก่า
- สาเหตุ (race condition 3 ทาง):
  1. `presence.forceLogout()` emit `force_logout` แล้ว `disconnect(true)` ในทิคเดียวกัน → close frame แซง data frame → client ไม่ได้รับเหตุผล
  2. `reconnectUser()` ใน `handleConnection` ย้าย participant record ของแมตช์เก่าไปชี้ socket ใหม่ของอุปกรณ์ที่ login ซ้อน → `handleDisconnect` ของ socket เก่าหา runtime ไม่เจอ → แมตช์ไม่จบ + session ใหม่ผูกกับแมตช์เก่า
  3. Zombie reconnect: access token อายุ 15 นาทียัง valid หลังถูก kick → มือถือที่ tab ถูกพับตื่นมา reconnect ด้วย token เก่าเข้ามาได้เฉยๆ
- วิธีแก้ (ทั้งหมดฝั่ง server, deterministic):
  - `presence.service.ts`: เก็บ kick record (เทียบกับ JWT `iat`) + แยก emit กับ disconnect ด้วย delay 150ms (`FORCE_KICK_DISCONNECT_DELAY_MS`) + callback `setForceLogoutHandler` ให้ gateway จบแมตช์ตอน kick
  - `realtime.gateway.ts`: `terminateUserMatches()` จบแมตช์/สาย/คิวของ user ที่โดน kick ทันที (user2 ได้ `match_end` → ไปหน้าสรุปผล; user1 ใหม่เข้า homepage สะอาด) + ตรวจ zombie reconnect ที่ `handleConnection` (token iat เก่ากว่า kick → kick ซ้ำ)
  - `match-runtime.service.ts`: เพิ่ม `getAllByUserId()`
  - `ws-auth.guard.ts`: `authenticateSocket` ส่ง `iatSec` ออกมาด้วย
  - `force-logout-listener.tsx` (client): reset game store ตอนโดน kick (หยุดไมค์)

**2. เกมเริ่มได้ก็ต่อเมื่อเสียงเชื่อมต่อสำเร็จเท่านั้น** (commit `cd3ad0a`, deployed)
- ตามคำขอ user: "การสื่อสารด้วยเสียงเป็น core หลักของการเล่นระบบนี้"
- ตัด fallback เดิม (`VOICE_READY_TIMEOUT_MS` 12 วิ = เริ่มเกมแบบไม่มีเสียง) ออก
- ใหม่: รอ `voice_ready` จาก **ทั้งสองฝ่าย** ไม่มีเวลาจำกัดสำหรับการเริ่ม; ถ้า 60 วิ (`VOICE_FAILED_TIMEOUT_MS`) เสียงยังไม่เชื่อม → จบแมตช์ด้วย reason ใหม่ `voice_failed` + แจ้งเหตุผลชัดเจน ("ไม่สามารถเชื่อมต่อเสียงระหว่างคุณสองคนได้ ลองจับคู่ใหม่อีกครั้งนะ")
- Client (`game/[matchId]/page.tsx` + `store/game.ts`): เพิ่ม reason `voice_failed` ทั้ง type + UI dialog + ข้อความรอเชื่อมเสียงใหม่ ("กำลังเชื่อมต่อเสียงกับเพื่อน… เกมจะเริ่มเมื่อเชื่อมต่อสำเร็จ")

**3. กวาดล้าง "แมตช์ผี" (haunted matches)** (commit `cd3ad0a`, deployed)
- ปัญหาอาการเฉพาะเจาะจง tester3/tester4 (เสียงไม่เชื่อมเลยสักครั้ง + ระบบตรวจจับการออกใช้ไม่ได้): แมตช์ที่ค้างใน memory ของ server จาก session ที่แล้ว (ก่อนโดน kick/ปิด tab) ซึ่ง `reconnectUser` ย้าย record มาผูกกับ socket ใหม่ทุกครั้ง → แมตช์ใหม่ทุกแมตช์สืบทอด runtime ที่ถูกหลอก → event ยิงสวนกัน
- แก้: `terminateStaleLiveMatches(userId)` เรียกที่ `handleJoinQueue` — จบแมตช์ live ค้างทั้งหมดของ user ก่อนเข้าคิว (เดิมมีแค่ `endStaleCompletedMatch` ซึ่งครอบคลุมเฉพาะแมตช์ที่จบแล้ว)
- **การ redeploy ตัวนี้เองก็ล้าง memory ของ server ทั้งหมดด้วย** → อาการของ tester3/tester4 ควรหายทันที

---

## สิ่งที่ค้นพบระหว่างทาง (สำคัญมาก — อ่านก่อนทำงานต่อ)

### สาเหตุที่แท้จริงของ "แก้แล้วไม่เห็นผล"
**Commit `d5d8f5b` (fix login ซ้อน) ไม่เคยถูก push ขึ้น GitHub เลย** — local branch นั่งเป็น "ahead 1" และ Railway deploy จาก GitHub (repo `Koorawut/Promjum_Project_Prototype_1`) ดังนั้น fix ทั้งหมดไม่เคยขึ้น production จนกว่าจะ push (ทำแล้วในรอบนี้: push `cd3ad0a` + `railway up` = deployment `4a66dd90` SUCCESS เมื่อ 08:27)

**บทเรียน: หลัง commit ต้อง push เสมอ — Railway ผูกกับ GitHub repo ไม่ใช่ไฟล์ local**

### การตรวจสอบ production ด้วยสคริปต์จริง (ไฟล์ทดสอบอยู่ที่ root ของโปรเจกต์)
- `test-force-logout.js` — ทดสอบ login ซ้อน 2 รอบ ผล: `force_logout` ถึง client จริง + disconnect ถูกต้อง ✅
- `test-zombie-reconnect.js` — ทดสอบ zombie reconnect ด้วย token เก่า: หลัง deploy โค้ดใหม่ = "RE-KICKED — NEW CODE is live ✅" (ก่อน deploy = ZOMBIE RECONNECTED พิสูจน์ว่าโค้ดเก่ายังรันอยู่)
- `check-deploy.js` — ตรวจว่า frontend bundle มีโค้ดใหม่ (หา `voice_failed` ใน JS chunks) — **ค้างอยู่ตรงนี้**: พบว่า Next.js รุ่นที่ใช้เสิร์ฟ assets จาก `/_next/static/immutable/` (content-hash) ไม่ใช่ `/_next/static/chunks/` แบบคลาสสิก สคริปต์แก้ pattern แล้วและกำลังรัน (background task `b8bta1sto`) ตอนที่หยุด — **ยังไม่ได้ยืนยันว่า frontend production ได้โค้ดใหม่**
- บัญชีทดสอบบน production: `dupprobe1`, `dupprobe2` (รหัส `TempPass1234!`)

### การ deploy
- **Backend (Railway)**: ✅ deploy สำเร็จ `railway up --service Promjum_Project_Prototype_1` จาก `apps/api` → deployment `4a66dd90` (08:27) — ตรวจแล้วโค้ดใหม่ทำงานจริง
- **Frontend (Vercel)**: deploy แล้ว (`web-kb9pom5yw-ai-test-project1.vercel.app`, status Ready) **แต่ยังไม่ยืนยันว่า production alias `web-ai-test-project1.vercel.app` เสิร์ฟโค้ดใหม่** (มีประวัติปัญหา CDN cache จากรอบก่อน — ถ้า user ทดสอบแล้วไม่เห็นผล ให้ hard refresh Ctrl+Shift+R หรือเช็คที่ URL deployment ตรง)
- คำสั่ง deploy frontend: `cd apps\web; vercel deploy --prod --yes`
- **อัปเดต (2026-09-27):** ยืนยันแล้วว่า URL production ที่เปิดสาธารณะจริงคือ `https://web-woad-two-58zkxybk8s.vercel.app` — `web-ai-test-project1.vercel.app` โดน Vercel Deployment Protection (Standard Protection) กันไว้เพราะโปรเจกต์ไม่มี custom domain ผูก ให้ Vercel ตีความว่าไม่ใช่ production domain ตัวจริง เสิร์ฟโค้ดใหม่ถูกต้อง (มี `voice_failed` ใน bundle) ให้ user/tester ใช้ URL นี้จากนี้ไป

---

## งานที่ค้าง (ทำต่อในครั้งหน้า)

1. ~~ยืนยัน frontend production ได้โค้ดใหม่~~ — **เสร็จแล้ว (2026-09-27)**. พบปัญหาจริง: `web-ai-test-project1.vercel.app` (URL หลักที่ใช้อ้างอิงมาตลอด) ถูก Vercel **Deployment Protection** (Standard Protection scope) กันไว้ด้วย SSO ของ Vercel เอง — ทุก route (รวม `/`) เด้งไป `vercel.com/sso-api` เพราะโปรเจกต์นี้ไม่มี custom domain ผูกไว้ (`vercel domains ls` = 0 domains) Vercel เลยไม่ถือว่า URL นั้นเป็น "production domain" ตัวจริงที่ Standard Protection จะยกเว้นให้ **URL production ที่ถูกต้อง/เปิดสาธารณะจริงคือ `https://web-woad-two-58zkxybk8s.vercel.app`** (ยืนยันจาก `vercel project ls` ว่า Vercel รายงานเป็น "Latest Production URL" เอง) — ใช้ URL นี้กับ user/tester ทุกครั้งจากนี้ ไม่ใช่ `web-ai-test-project1.vercel.app`. ยืนยันแล้วว่า bundle มี `voice_failed` จริง (`check-deploy.js` แก้ base URL แล้ว ผลลัพธ์: ✅ FOUND ที่ `/_next/static/immutable/chunks/0qm0_bjo4csjt.js`)
2. **ให้ user ทดสอบบนเครื่องจริง** (ผมทดสอบ server-side ได้ แต่ browser จริง 2 เครื่องเกินขอบเขต):
   - Login ซ้อนระหว่างเล่นเกม: user1 ต้องโดนดีดไป /login พร้อมเหตุผล, user2 ไปหน้าสรุปผล, user1 ใหม่ไป homepage ปกติ
   - เสียงเชื่อมต่อ PC↔Mobile ข้ามเครือข่าย (TURN)
   - ด้วยบัญชี tester3/tester4 เดิม — อาการ "เสียงไม่เชื่อมเลย + ตรวจจับการออกใช้ไม่ได้" ต้องหาย (ทั้งจาก fix และจากการที่ redeploy ล้าง memory)
   - เกมต้องไม่เริ่มจนกว่าเสียงเชื่อมสำเร็จทั้งสองฝ่าย
3. **ถ้าเสียงยังไม่ผ่าน PC↔Mobile**: ตรวจ `chrome://webrtc-internals` ว่า selected candidate เป็น `relay` (TURN) หรือไม่; ถ้า openrelay.metered.ca (public TURN fallback) ล่ม ทางแก้ถาวรคือตั้ง `METERED_DOMAIN`/`METERED_API_KEY` จริงใน Railway (production มีค่า Metered อยู่แล้ว! ตรวจพบจาก probe `/turn/credentials` รอบก่อน — คืน TURN เต็มชุด)
4. ~~อัปเดต README_ปัญหาและวิธีแก้.md ด้วยปัญหา 16-17~~ — **เสร็จแล้ว (2026-09-27)**: เพิ่มปัญหา 16 (voice gating + haunted matches), 17 (บทเรียน push), 18 (Vercel Deployment Protection กัน production URL ที่ใช้อ้างอิงมาตลอด)
5. ไฟล์ทดสอบที่ root (`test-force-logout.js`, `test-zombie-reconnect.js`, `check-deploy.js`) ควรลบหรือย้ายก่อน commit ครั้งหน้า (ยังไม่ได้ commit — untracked)

## ปัญหา/เรื่องที่เลื่อนไว้ (ไม่เกี่ยวกับรอบนี้)
- Session หลุดบน iPad/iPhone Safari หลัง refresh (สงสัย ITP) — รอผลทดสอบจาก user
- Email ยืนยันจริง + Google Login จริง — รอ credentials

---

## Git state ณ จุดหยุด
- Branch: `main`, commit ล่าสุด `cd3ad0a` ("Gate round 1 on voice actually connecting; sweep haunted matches")
- **Push ขึ้น GitHub แล้ว** (`8a7c845..cd3ad0a`) — local = remote ไม่มี commit ค้าง
- Untracked: ไฟล์ทดสอบ 3 ไฟล์ + README ฉบับต่างๆ + `Promjum_Problem_*.txt` + `.git-commit-msg.txt`

## เทคนิคการทำงานที่ใช้ (จำไว้ใช้ต่อ)
- git ต้องใช้ full path: `& "C:\Program Files\Git\cmd\git.exe"`
- commit ใช้ไฟล์ message: `.git-commit-msg.txt` + `git commit -F`
- path ที่มี `(protected)` ต้อง quote ใน PowerShell เสมอ
- typecheck: `npx tsc --noEmit` ทั้ง `apps/api` และ `apps/web`
- deploy backend: `cd apps\api; railway up --service Promjum_Project_Prototype_1`
- deploy frontend: `cd apps\web; vercel deploy --prod --yes`
- ข้อจำกัดความปลอดภัยที่ยังมีผล: ห้าม mutate production DB ตรงๆ, ห้าม hardcode/extract live secrets, ใช้ API ปกติของระบบเท่านั้น
