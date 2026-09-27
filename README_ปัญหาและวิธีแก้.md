# SpeakUp (Promjum) — สรุปปัญหาที่เจอและวิธีแก้ทั้งหมด (ละเอียด)

เรียงตามลำดับเวลาที่เจอและแก้ (อ้างอิง commit จริงใน git history)

---

## ช่วงที่ 1 — Deploy ขึ้น Railway ครั้งแรก

### ปัญหา 1: build บน Railway ล้มเหลว (Railpack build ไม่เจอ output)
**อาการ**: deploy ครั้งแรกๆ build ผ่านแต่หา `dist/main.js` ไม่เจอตอน start
**สาเหตุ**: Railway ใช้ Railpack auto-detect ซึ่งกับ monorepo แบบ npm workspace มัน build ไม่ตรง path — NestJS ผ่าน `nest build` output ออกมาเป็น `dist/src/main.js` ไม่ใช่ `dist/main.js`
**วิธีแก้** (commit `7be1365`, `c4c1965`, `a9bde9b`, `224c472`):
- เปลี่ยนไปใช้ Dockerfile แบบ explicit แทนการปล่อยให้ Railpack จัดการเอง
- force dev dependencies ตอน build (nest CLI ต้องใช้) — ก่อนหน้านั้นถูก prune ทิ้งเพราะถูกนับเป็น prod build
- แก้ entrypoint path ใน start command ให้ชี้ `dist/src/main.js` ตรงตามที่ nest build สร้างจริง
- เพิ่ม `prisma generate` เข้าไปใน build script + `prisma migrate deploy` ตอน container start (commit `11c8508`)

### ปัญหา 2: env vars มี BOM ทำให้ URL พัง
**อาการ**: frontend ยิง API ไม่ถึงเพราะ URL มี invisible character นำหน้า
**สาเหตุ**: ไฟล์ env ที่เขียนบน Windows มี BOM (U+FEFF) ติดมากับค่า
**วิธีแก้** (commit `a107af9`): strip BOM ตอนอ่าน env (`replace(/^﻿/, "")`) + ใส่ production fallback URL ตรงใน code

---

## ช่วงที่ 2 — Session หลุดตอน refresh + เสียงข้ามเครือข่ายไม่ได้

### ปัญหา 3: login แล้ว refresh หน้า = ถูกไล่ออก
**อาการ**: ใช้งานบน PC ได้ปกติ แต่กด refresh หรือมี action ที่ทำให้เว็บ reload แล้วต้อง login ใหม่
**สาเหตุ**: refresh cookie ถูก set เป็น `SameSite=Lax` — ปกติใช้ได้ แต่เมื่อ frontend (Vercel) กับ backend (Railway) คนละ domain การส่ง cookie ข้าม site ในบาง browser/context ถูก block
**วิธีแก้** (commit `b130abd`): เปลี่ยน cookie เป็น `SameSite=None; Secure` (จำเป็นเมื่อ API กับ web คนละ domain) + เพิ่ม `AuthInitializer` ที่ root layout ให้ silent refresh ครั้งเดียวตอนเปิดเว็บ — เพิ่มปุ่มกลับหน้าหลักตามอาการที่ user แจ้งด้วย
**หมายเหตุค้าง**: บน iOS Safari/iPad บาง device ยังมี report ว่า session ไม่คงอยู่หลัง refresh (สงสัยเกี่ยวกับ ITP ลบ cookie) — **ยังไม่ได้แก้ เลื่อนไว้ก่อน** รอ user ยืนยันอาการอีกครั้ง

### ปัญหา 4: คุยด้วยเสียงไม่ได้ถ้าสองคนคนละเครือข่าย
**อาการ**: เล่นในวงเน็ตเดียวกันได้ ข้ามเครือข่าย (เช่น WiFi บ้าน กับ 4G) เสียงเงียบ
**สาเหตุ**: WebRTC เดิมใช้ STUN อย่างเดียว — ผ่านไม่ได้เมื่อ NAT ฝั่งใดฝั่งหนึ่งเข้มงวด (symmetric NAT) ต้องมี TURN relay
**วิธีแก้** (commit `f30e041`, `3fec558`): เพิ่ม TURN server ผ่าน Metered (ICE servers ดึงจาก Metered API) — format ตอนแรกไม่ตรง (commit `3fec558` แก้ response format)

---

## ช่วงที่ 3 — เสียงเชื่อมช้า/ไม่พร้อมกัน

### ปัญหา 5: WebRTC เริ่ม negotiate ช้าเกิน
**อาการ**: เข้าหน้าเกมแล้วเสียงมาช้า เพราะการเชื่อมต่อเริ่มตอน `round_start` (คือหลังเข้าหน้าเกมแล้ว)
**วิธีแก้** (commit `8c1f37c`): เริ่ม negotiate ทันทีที่ `matched` มาถึง (ตอนยังอยู่ lobby/กำลัง redirect) ไม่รอ round_start — ได้เวลาถ่อมไปพร้อมกับการโหลดหน้า

### ปัญหา 6: cold-start signal race
**อาการ**: บางครั้งสัญญาณ WebRTC หายระหว่างที่หน้ากำลังเปลี่ยน (signal มาตอนที่ listener ยังไม่ mount)
**วิธีแก้** (commit `c22fe05`): จัดการ signal buffering ให้เสียง connect ได้แม้จะมี race; ใน commit เดียวกันยังเพิ่ม **single-session enforcement** (login ที่เครื่องใหม่ = ไล่เครื่องเก่าออก) และ **แจ้งเตือนเมื่ออีกฝ่ายออกจากเกม**

### ปัญหา 7: refresh race ทำให้ถูก logout ผิดๆ + layout กระตุก + เกมเริ่มโดยเสียงยังไม่พร้อม
**อาการ**: (1) บางหน้ามี double refresh ที่ชนกัน (token rotate แล้วอันหนึ่งกลายเป็น invalid) → logout ผิด, (2) lobby กระตุกตอนเปลี่ยน state, (3) รอบ 1 เริ่มก่อนเสียงทั้งคู่เชื่อม
**วิธีแก้** (commit `5ceaa31`): ให้ protected layout รอ status จาก AuthInitializer แทนการยิง refresh ซ้ำ (กัน race), แก้ layout, เพิ่ม voice-readiness gating

---

## ช่วงที่ 4 — ระบบคุยต่อหลังจบเกม (Post-match call)

### ปัญหา 8: อยากให้คุยต่อหลังเล่นจบ (feature request)
**ที่ต้องการ**: เสียงคงอยู่หลังเข้าหน้าสรุปผล จนกว่าฝ่ายใดกด "เสร็จสิ้น" หรือครบ 30 วิ (มี countdown ให้ user เห็น)
**วิธีทำ** (commit `d90d488`):
- ย้ายความเป็นเจ้าของ `RTCPeerConnection` จากหน้าเกม ไปไว้ที่ `CallSessionManager` ที่ mount ที่ root layout (ไม่ unmount) — สายจึงรอดจาก route change หน้าเกม → หน้าสรุป
- Server: ตอนแมตช์จบเปลี่ยนเป็นโหมด `matchCompleted` แทนการลบ runtime ทิ้งทันที + ตั้ง `postMatchTimeout` 30 วิ
- `finish_match` event → ส่ง `call_end` → ทั้งคู่ reset + กลับ `/home`
- หน้าสรุปนับถอยหลังจาก `matchEndedAt` timestamp (sync กับ timer ของ server)

---

## ช่วงที่ 5 — Bug ที่ตามมาจาก post-match call (รอบแรก)

### ปัญหา 9: กด "เสร็จสิ้น" แล้วอีกฝ่ายไม่ถูก redirect
**อาการ**: A กดเสร็จสิ้น → A กลับหน้าหลัก แต่ B ยังค้างอยู่หน้าสรุป สายตัดแล้วแต่ไม่รู้ว่าต้องออก
**สาเหตุ**: `finish_match` ตอนแรกดึง state จาก `getBySocketId` ซึ่งใช้ socketId เก่า (ผู้เล่น redirect ระหว่างทางทำให้ socket เปลี่ยน) → emit `call_end` ไปโดน socket ตาย
**วิธีแก้** (commit `2e686ce`): เพิ่ม `reconnectUser()` ใน `MatchRuntimeService` — ทุกครั้งที่ socket connect ใหม่ (`handleConnection`) ถ้า user มีแมตช์ค้างอยู่ให้ repoint participant.socketId เป็นตัวใหม่

### ปัญหา 10: rematch (เล่นอีกรอบ) แล้วเกมพังหลายแบบ
**อาการ**: กดจับคู่รอบสอง (คู่เดิม) → (แบบ 1) เล่นได้แต่กดตอบแล้วค้าง, (แบบ 2) เข้าหน้าสรุปเลยโดยไม่ได้เล่น
**สาเหตุ**: runtime state ของแมตช์เก่า (`matchCompleted` + `postMatchTimeout` 30 วิ) ยังไม่ถูกลบ — เพราะทั้งสองกด "เล่นอีกรอบ" โดยไม่กด "เสร็จสิ้น" ก่อน พอแมตช์ใหม่เริ่มใช้ socket เดิม: (1) `postMatchTimeout` ของแมตช์เก่ายิงทีหลัง ลบ socketId→matchId mapping ของแมตช์ใหม่ทิ้ง ทำให้ event ไปผิดแมตช์/หาย, (2) client มี state เก่า (totalScores, matchEndedAt) หลุดมาแมตช์ใหม่
**วิธีแก้** (commit `2e686ce`):
- Server: `join_queue` เรียก `endStaleCompletedMatch()` ก่อนเข้าคิวเสมอ (ปิดแมตช์เก่า + ลบ timers + ลบ state ให้เรียบร้อยก่อนจับคู่ใหม่)
- Server: `remove()` เพิ่ม guard — ลบ socketId mapping เฉพาะเมื่อมันยังชี้อยู่ที่แมตช์ *เดิม* ตัวนี้ (กันลบทับแมตช์ใหม่)
- Client: `setMatch()` force-mute ไมค์ + เคลียร์ state เก่าทั้งหมด (scores, endReason, remoteStream, ฯลฯ) ทุกครั้งที่แมตช์ใหม่เริ่ม

### ปัญหา 11: เสียงหลุดออกช่วงนับถอยหลัง
**อาการ**: หลังจับคู่ ระหว่าง countdown ผู้เล่นยังพูดจากกันได้ ทั้งที่ควรเงียบจนกว่าจะเริ่มเล่นจริง
**วิธีแก้** (commit `2e686ce` รอบแรก): mute ไมค์ตั้งแต่ `setMatch()` (ตอน `matched` มาถึง) — แต่ยังมีรูรั่วคือ unmute ตอนหน้าเกม mount ซึ่งอาจยังก่อน countdown จบ → แก้ซ้ำใน `13ef81f` (ปัญหา 13)

---

## ช่วงที่ 6 — Bug จากการทดสอบรอบสอง

### ปัญหา 12: เกมเริ่มก่อนที่ client จะโหลดเสร็จ (เสียเวลา/คะแนนฟรี)
**อาการ**: บางครั้งเชื่อมต่อ/โหลดหน้าช้า ทำให้รอบ 1 เริ่ม (และ timer วิ่ง) ก่อนที่ user จะเห็นหน้าเกมเลย
**สาเหตุ**: รอบ 1 เริ่มได้ทั้งจากเงื่อนไขพร้อม (voice_ready ทั้งคู่) และจาก fallback timeout — ไม่มีการรอให้ *หน้าเกม* ของทั้งสองฝั่ง mount เสร็จ
**วิธีแก้** (commit `13ef81f`): เพิ่ม event `game_ready` — หน้าเกม emit ทันทีที่ mount และกำลังฟัง `round_start`; server รอ **ทั้ง** `voiceReady` **และ** `gameReady` จากทั้งสองคนก่อนเริ่มรอบ 1 (fallback 12 วิยังอยู่กันค้าง)
**ผลลัพธ์**: เกม freeze ให้ทั้งคู่โหลดเสร็จก่อน ไม่เสียเวลา/คะแนนฟรีอีก

### ปัญหา 13: ยังพูดได้ระหว่างนับถอยหลัง (แก้ปัญหา 11 ที่ยังไม่ตัดจบ)
**อาการ**: จากการแก้รอบแรก (unmute ตอนหน้าเกม mount) ยังเปิดไมค์เร็วเกิน — ช่วง "waiting for opponent/voice" ยังได้ยินกัน
**วิธีแก้** (commit `13ef81f`): ย้าย trigger การ unmute จาก "ตอนหน้าเกม mount" ไปเป็น "ตอน `round_start` แรกมาถึงจริงๆ" (guard ด้วย `unmutedRef` ให้เกิดครั้งเดียว) — `round_start` คือสัญญาณ "ปลอดภัยที่จะพูด" ตัวจริง

---

## ช่วงที่ 7 — สายไม่ตัดเมื่อ user ออกไปหน้าอื่น (ปัญหาล่าสุด)

### ปัญหา 14: ออกจากหน้าสรุปผลไปหน้าอื่น แต่สายยังค้าง
**อาการ**: หลังเล่นจบ อยู่หน้าสรุปผล — ถ้าไม่กด "เสร็จสิ้น" และไม่รอ 30 วิ แต่กดออกไปหน้าอื่น (หน้าหลัก / ฝึกพูด / มินิเกม / ออกจากระบบ / กลับไปฝึกพูด / เล่นอีกรอบ) — **สายเสียงยังต่ออยู่** ทั้งที่ user คนนั้นไปแล้วแล้ว
**สาเหตุ**: Next.js `<Link>` ทำ client-side navigation **โดยไม่ตัด socket** — จึงไม่มี event ใดๆ ถูกส่งถึง server (handleDisconnect ก็ไม่ยิงเพราะ socket ยัง live) สายและ runtime state ฝั่ง server เลยเดินต่อเฉยๆ
**วิธีแก้** (commit `71d8745`):
1. **Server** — เปลี่ยนพฤติกรรม `finish_match` และ `endStaleCompletedMatch`: emit `call_end` ให้ **เฉพาะอีกฝ่าย** ไม่ใช่ทั้งคู่ — เพราะคนกดออกเองกำลังจะไปหน้าที่เขาเลือกเอง ถ้าส่งกลับให้ตัวเองด้วย `CallSessionManager` จะ redirect เขาไป `/home` ทับความตั้งใจของเขา (เช่น กด "ฝึกพูด" แล้วโดนดึงกลับหน้าหลัก)
2. **Client** — สร้าง hook `useLeaveCall()`: emit `finish_match` + reset state ฝั่งตัวเอง **โดยไม่แตะการ navigate**; ต่อเข้ากับทุกทางออก:
   - topbar/tabbar links (หน้าหลัก, ฝึกพูด, มินิเกม) ทุกตำแหน่งใน `(protected)/layout.tsx`
   - ปุ่ม "กลับไปฝึกพูด" / "เล่นอีกรอบ" บนหน้าสรุปผล
   - `logout()` ใน `useAuth` — emit `finish_match` **ก่อน** disconnect socket (พอ disconnect แล้วจะ emit อะไรไม่ได้แล้ว)
3. **ผลลัพธ์**: ฝ่ายที่เหลือได้ `call_end` → reset + กลับ `/home` ทันที (เหมือนกดเสร็จสิ้น/หมดเวลา); ฝ่ายที่กดออกเอง = สายตัดเรียบร้อย แล้วไปหน้าที่เลือกตามปกติ

### เรื่องที่อธิบายเพิ่ม (ไม่ใช่ bug): ทำไมบางครั้งเชื่อมต่อเสียงช้า?
- **TURN allocation ครั้งแรกช้า** — ถ้า NAT เข้มจนต้องผ่าน TURN relay การขอ allocation ครั้งแรกของ connection นั้นใช้เวลาหลายวินาทีได้ (ครั้งต่อไปจะเร็วขึ้นเพราะ path คุ้นแล้ว)
- **เครือข่ายผู้เล่นแต่ละฝ่ายต่างกัน** — มือถือ 4G/5G หรือ WiFi องค์กรที่ NAT เข้ม ทำให้การเจรจา ICE ใช้เวลานานกว่า
- **Server cold start** — ถ้า Railway ไม่มี traffic สักพัก อาจต้องปลุก container ก่อน round-trip แรกจะช้ากว่าปกติ
- ระบบมี fallback 12 วิ (`VOICE_READY_TIMEOUT_MS`) กันค้างตลอดกาล + ตอนนี้ (ปัญหา 12) รอทั้ง voice_ready + game_ready จากทั้งคู่ ทำให้ timer ของเกมไม่เสียเวลาไปกับการรออีกต่อไป

---

## ช่วงที่ 8 — Login ซ้อนระหว่างเล่นมินิเกม

### ปัญหา 15: Login ซ้อนระหว่างเล่นเกม — user เดิมไม่ถูกไล่ออก, แมตช์ไม่จบ, session ใหม่โดนผูกกับแมตช์เก่า
**อาการ** (จาก user): ระหว่าง user1 กำลังเล่นมินิเกมกับ user2 อยู่ ถ้ามีการ login ซ้อนด้วยบัญชีของ user1 บนอุปกรณ์อื่น — user1 ที่กำลังเล่น **ยังอยู่ในหน้าเกมได้ปกติ** ทั้งที่ควรถูกบังคับออกไปหน้า login พร้อมเหตุผล; แมตช์ก็ไม่จบ user2 เล่นต่อกับคนที่หายไปแล้ว

**สาเหตุ** — เป็น race condition 3 ทางเกิดพร้อมกันตอน login ซ้อน (ทั้งหมดวิเคราะห์จากโค้ด):
1. **packet `force_logout` หาย** — `presence.forceLogout()` สั่ง `emit('force_logout')` แล้ว `disconnect(true)` **ในทิคเดียวกัน** → close frame แซง data frame ได้ (ขึ้นกับ transport) → client ไม่เคยได้รับเหตุผล → นั่งอยู่ในหน้าเกมกับ socket ที่ตายแล้ว
2. **`reconnectUser` ขโมยแมตช์** — user2 จะได้ `match_end` ก็ต่อเมื่อ `handleDisconnect` ของ socket เก่าของ user1 ยิงก่อน แต่ถ้า socket ของอุปกรณ์ที่ login ใหม่เชื่อมต่อเข้าก่อน `handleConnection` จะเรียก `reconnectUser()` ซึ่ง**ย้าย participant record ของแมตช์เก่าไปชี้ที่ socket ใหม่** → `handleDisconnect` ของ socket เก่าหา runtime ไม่เจอ → **แมตช์ไม่จบ user2 ค้าง** และ session ใหม่ของ user1 ถูกผูกกับแมตช์ที่ถูกทิ้งไว้
3. **zombie reconnect** — access token อายุ 15 นาที ยัง valid หลังถูก kick → มือถือที่ tab ถูกพับแล้วตื่นมา socket.io auto-reconnect ด้วย token เก่า → **เข้ามาได้เฉยๆ** ไม่มีใครบอกว่าถูก kick ไปแล้ว

**วิธีแก้** (commit `d5d8f5b`) — ทำให้ทุกอย่าง deterministic ฝั่ง server แทนการพนันกับลำดับ event:
1. **จบทุกอย่างของ user ที่โดน kick ทันทีตอน kick** (`terminateUserMatches()` ใน gateway, เรียกจาก `forceLogout` ผ่าน callback):
   - แมตช์ที่ยังเล่นอยู่ → แจ้งอีกฝ่าย `match_end {reason: 'opponent_disconnected', totalScores}` → **user2 ไปหน้าสรุปผล** (flow เดิมของ client ที่มีอยู่แล้ว) พร้อม finalize คะแนนลง DB
   - สาย post-match (ถ้าโดน kick ตอนอยู่หน้าสรุปผล) → `call_end` ให้อีกฝ่าย
   - เอาออกจาก matchmaking queue ด้วย
   - ผลลัพธ์: ตอน socket ของอุปกรณ์ใหม่เชื่อมต่อมาถึง `reconnectUser` วนหาแมตช์ของ user1 → **ไม่เจอแล้ว** → session ใหม่เข้า homepage แบบสะอาด ไม่ถูกดึงเข้าเกมเก่า
2. **แยก emit กับ disconnect** — หน่วง 150ms ระหว่าง `emit('force_logout')` กับ `disconnect(true)` ให้ packet ไปถึง client ก่อน → `ForceLogoutListener` (mount ที่ root layout จึงทำงานแม้กำลังอยู่ในหน้าเกม) ได้รับเหตุผล → บันทึกลง sessionStorage → **reset game store (หยุดไมค์)** → ไป `/login` พร้อมแสดงเหตุผล
3. **สกัด zombie reconnect** — `authenticateSocket` ตอนนี้ส่ง `iat` ของ token ออกมาด้วย; `handleConnection` เทียบกับเวลาที่ถูก kick (เก็บใน `PresenceService` นาน 15 นาที = อายุ token): token ที่ออกก่อนการ kick = อุปกรณ์เก่าที่ถูกไล่ → ส่ง `force_logout` ซ้ำ + disconnect อีกครั้ง; token ที่ออกหลังการ kick = อุปกรณ์ใหม่ที่ login ถูกต้อง → ผ่านเข้าได้ปกติ

**การไหลใหม่ทั้งหมด** (ตอบโจทย์ user ครบ 3 ข้อ):
- user1 (ในเกม) → โดน kick ออกจากเกม → ไป `/login` พร้อมข้อความ "บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น..." ✅
- เกมจบลง → user2 ได้ `match_end` → **ไปหน้าสรุปผล** ✅
- user1 ที่ login ใหม่ → เข้า homepage ปกติ ไม่ถูกดึงเข้าแมตช์เก่า ✅

**ไฟล์ที่แก้**:
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `apps/api/src/realtime/presence.service.ts` | เก็บ kick record (เทียบ JWT `iat` ได้) + แยก emit/disconnect ด้วย delay 150ms + callback ให้ gateway จบแมตช์ตอน kick |
| `apps/api/src/realtime/realtime.gateway.ts` | `terminateUserMatches()` จบแมตช์/สาย/คิวของ user ที่โดน kick แบบ deterministic + สกัด zombie reconnect ที่ handleConnection |
| `apps/api/src/realtime/match-runtime.service.ts` | เพิ่ม `getAllByUserId()` |
| `apps/api/src/common/guards/ws-auth.guard.ts` | ส่ง `iat` ของ token ออกมาจาก `authenticateSocket` |
| `apps/web/src/components/force-logout-listener.tsx` | reset game store ตอนโดน kick (หยุดไมค์ที่ค้าง + ปิด voiceEnabled) |

**หมายเหตุ**: fix นี้แตะ **ทั้ง API และ web** — ต้อง deploy ทั้ง Railway (backend) และ Vercel (frontend) ถึงจะมีผลครบ

---

---

## ช่วงที่ 9 — เกมเริ่มโดยเสียงยังไม่พร้อม + แมตช์ผี + ลืม push

### ปัญหา 16: เกมเริ่มได้แม้เสียงยังไม่เชื่อม + แมตช์ผี (haunted matches) ทำให้บางบัญชีเสียงไม่เชื่อมเลยสักครั้ง
**อาการ**: (1) user ขอให้เกมห้ามเริ่มจนกว่าเสียงเชื่อมสำเร็จทั้งสองฝ่าย เพราะเสียงคือ core ของระบบ แต่ของเดิมมี fallback 12 วิที่เริ่มเกมแบบไม่มีเสียงได้; (2) บัญชี tester3/tester4 เจอเฉพาะเจาะจง: เสียงไม่เชื่อมเลยสักครั้ง + ระบบตรวจจับการออกใช้ไม่ได้
**สาเหตุ (2)**: แมตช์ที่ค้างใน memory ของ server จาก session ก่อน (ก่อนโดน kick/ปิด tab) ซึ่ง `reconnectUser` ย้าย record มาผูกกับ socket ใหม่ทุกครั้ง → แมตช์ใหม่ทุกแมตช์ของบัญชีนั้นสืบทอด runtime ที่ถูกหลอกไว้ → event ยิงสวนกันหมด (เดิมมีแค่ `endStaleCompletedMatch` ซึ่งครอบคลุมเฉพาะแมตช์ที่จบไปแล้ว ไม่ครอบคลุมแมตช์ live ที่ค้าง)
**วิธีแก้** (commit `cd3ad0a`):
- ตัด fallback `VOICE_READY_TIMEOUT_MS` (12 วิ, เริ่มเกมแบบไม่มีเสียง) ออก — รอ `voice_ready` จากทั้งสองฝ่ายไม่มีเวลาจำกัดสำหรับการเริ่ม
- ถ้า 60 วิ (`VOICE_FAILED_TIMEOUT_MS`) เสียงยังไม่เชื่อม → จบแมตช์ด้วย reason ใหม่ `voice_failed` + แจ้งเหตุผลชัดเจน ("ไม่สามารถเชื่อมต่อเสียงระหว่างคุณสองคนได้ ลองจับคู่ใหม่อีกครั้งนะ")
- Client: เพิ่ม reason `voice_failed` ทั้ง type (`store/game.ts`) + UI dialog + ข้อความรอเชื่อมเสียงใหม่ (`game/[matchId]/page.tsx`)
- `terminateStaleLiveMatches(userId)` เรียกที่ `handleJoinQueue` — จบแมตช์ live ค้างทั้งหมดของ user ก่อนเข้าคิว (แก้แมตช์ผีตรงจุด)
- ผลพลอยได้: การ redeploy รอบนี้ล้าง memory ของ server ทั้งหมดด้วย ทำให้แมตช์ผีเก่าที่ค้างอยู่แล้วหายไปเองด้วย

### ปัญหา 17: แก้แล้วไม่เห็นผลบน production — เพราะ commit ไม่ถูก push ขึ้น GitHub
**อาการ**: fix การ login ซ้อน (commit `d5d8f5b`) deploy ไม่เห็นผลอะไรเปลี่ยนบน production เลย ทั้งที่ local build ถูกต้อง
**สาเหตุ**: `d5d8f5b` commit ไว้ในเครื่อง local เท่านั้น ไม่เคย `git push` — Railway deploy จาก GitHub repo (`Koorawut/Promjum_Project_Prototype_1`) ไม่ใช่จากไฟล์ในเครื่อง ดังนั้นโค้ดที่แก้ไม่เคยขึ้น production จนกว่าจะ push จริง
**วิธีแก้**: push `cd3ad0a` (รวม `d5d8f5b`) ขึ้น GitHub แล้ว `railway up` ใหม่ → deployment สำเร็จ ยืนยันด้วยสคริปต์ `test-zombie-reconnect.js` ว่าโค้ดใหม่ทำงานจริง
**บทเรียนสำคัญ: หลัง commit ต้อง push เสมอ — Railway ผูกกับ GitHub repo ไม่ใช่ไฟล์ local**

### ปัญหา 18 (2026-09-27): ตรวจ production frontend ไม่พบ `voice_failed` ในตอนแรก — ที่จริง URL หลักที่ใช้อ้างอิงถูก Vercel SSO กันไว้
**อาการ**: สคริปต์ `check-deploy.js` วิ่งผ่าน `web-ai-test-project1.vercel.app` แล้วหา `voice_failed` ในทุก script ไม่เจอเลย ทั้งที่ source code มี fix อยู่แน่นอน
**สาเหตุ**: URL `web-ai-test-project1.vercel.app` ที่ใช้อ้างอิงมาตลอดถูก Vercel **Deployment Protection** (scope: Standard Protection) กันไว้ด้วย Vercel SSO ของตัวเอง — ทุก route (รวม `/`) 302 ไป `vercel.com/sso-api` เพราะโปรเจกต์นี้ไม่มี custom domain ผูกไว้เลย (`vercel domains ls` = 0 domains) Vercel เลยไม่ถือว่า URL นี้เป็น "production domain" ตัวจริงที่ Standard Protection จะยกเว้นให้ (Standard Protection ยกเว้นแค่ production domain เท่านั้น ตัว generated alias อื่นๆ ยังถูกกันอยู่) สคริปต์ตรวจสอบเลยเจอแต่หน้า login ของ Vercel ไม่ใช่ตัวแอปจริง
**วิธีแก้**: ยืนยันด้วย `vercel project ls` ว่า Vercel เองรายงาน `https://web-woad-two-58zkxybk8s.vercel.app` เป็น "Latest Production URL" — URL นี้เปิดสาธารณะจริง (200 OK, ไม่ต้อง login) และเสิร์ฟ bundle ที่มี `voice_failed` ถูกต้อง แก้ `check-deploy.js` ให้ชี้ไป URL นี้แทน
**บทเรียนสำคัญ: ใช้ `https://web-woad-two-58zkxybk8s.vercel.app` เป็น URL production หลักจากนี้ไป (ไม่ใช่ `web-ai-test-project1.vercel.app`) จนกว่าจะผูก custom domain จริง**

---

---

## ช่วงที่ 10 — Race condition ใน client socket singleton (สาเหตุแท้จริงของ bug ที่ดูเหมือนแก้ไม่หาย)

### ปัญหา 19 (2026-09-27): force_logout ไม่ถึง client บางครั้ง + เสียงไม่เชื่อมบางครั้ง + ตรวจจับการออกจากสายพลาด — โดยเฉพาะบัญชี tester3/tester4
**อาการ**: แม้ฝั่ง server (ปัญหา 15-16) ถูกแก้และยืนยันด้วย simulation script แล้วว่าทำงานถูกต้อง 100% แต่ยังมีรายงานจริงว่า: (1) login ซ้ำระหว่างเล่นเกมบางครั้งไม่บังคับ user เดิมออกไปหน้า login, (2) เสียงเชื่อมต่อไม่น่าเชื่อถือ, (3) การไล่ออกซ้ำ (duplicate-login kick) ไม่ยิงในบางเคสที่สังเกตได้จริง, (4) บัญชี tester3/tester4 โดยเฉพาะ เสียงไม่เชื่อมเลยสักครั้ง + หน้าสรุปผลตรวจจับการออกจากสายไม่ได้

**สาเหตุ**: bug อยู่ฝั่ง **client** (`apps/web/src/lib/socket-client.ts`) ไม่ใช่ server เดิม `getSocket(token)` เช็คทั้ง `socket.connected` และ token ก่อนตัดสินใจ reuse socket เดิม:
```ts
if (socket && socket.connected && socketToken === token) return socket;
if (socket) socket.disconnect();
```
ที่ root layout มี 2-3 component ที่ mount พร้อมกันและแต่ละตัวเรียก `useSocket()` เอง (`ForceLogoutListener`, `CallSessionManager`, และหน้าที่กำลัง active) — ทั้งหมด react ต่อ `accessToken` ตัวเดียวกันที่ resolve มาพร้อมกันใน render เดียว socket.io connect แบบ async (handshake ใช้เวลา) ทำให้ตอน component ตัวที่สองเรียก `getSocket()` socket ของตัวแรกยัง `connected === false` อยู่ (แค่ยังไม่จบ handshake ไม่ใช่ตายจริง) — โค้ดเดิมตีความว่า "ไม่ connected = ต้องสร้างใหม่" แล้ว `disconnect()` ตัวเก่าทิ้งทันที เกิดขึ้นซ้ำแบบนี้หนึ่งครั้งต่อหนึ่ง component ที่เรียก

ผลคือ component ที่เรียกก่อน (เช่น `ForceLogoutListener`) ถือ reference ของ socket ที่ถูก disconnect ไปแล้วก่อนที่มันจะเชื่อมต่อสำเร็จด้วยซ้ำ — listener ของมัน (`force_logout`, `webrtc_signal`, ...) ไม่มีวันถูกยิง ในขณะที่ server เห็นแค่ socket ตัวสุดท้ายที่ component ตัวสุดท้ายสร้างผ่าน `handleConnection` ตรงกับอาการทั้งหมดที่รายงานมา: force_logout หาย, เสียงไม่เชื่อม, ตรวจจับ exit พลาด — และแย่ลงบนการเชื่อมต่อที่ช้า (handshake นานขึ้น = ช่องเวลาการแข่ง race กว้างขึ้น) ตรงกับที่ tester3/tester4 เจอเฉพาะเจาะจง

**ทำไม simulation script (`test-midmatch-duplogin.js`) เดิมไม่จับ bug นี้**: script ใช้ 1 socket ต่อ 1 ฝั่งตรงๆ ไม่มี sibling component หลายตัวแย่งกันเรียก `getSocket()` ในเวลาเดียวกัน จึงไม่มีทางสร้าง race นี้ขึ้นมาได้ — พิสูจน์ได้แค่ว่า logic ฝั่ง server ถูกต้อง แต่ไม่ครอบคลุม bug ฝั่ง client ตัวนี้

**วิธีแก้** (commit `9013e25`): เปลี่ยนเงื่อนไข reuse ให้ดูแค่ **token** เท่านั้น ไม่เช็ค `.connected`:
```ts
if (socket && socketToken === token) return socket;
if (socket) socket.disconnect();
```
สร้าง socket ใหม่เฉพาะตอน token เปลี่ยนจริง (re-login/refresh rotation) หรือหลังเรียก `disconnectSocket()` เอง — ถ้ายังไม่เชื่อมต่อ (แค่กำลัง handshake) ไม่ต้องสร้างใหม่ เพราะ socket.io reconnect ให้อัตโนมัติอยู่แล้วถ้าหลุดจริง

**บทเรียนสำคัญ**: เมื่อมี component หลายตัวเรียก singleton accessor พร้อมกันจาก effect ของตัวเอง (ทุกตัว react ต่อ state เดียวกัน) ต้องระวัง async initialization race — เงื่อนไข "ยังไม่ connected" ไม่ควรใช้ตัดสินว่า "ต้องสร้างใหม่" เพราะ "ยังไม่ connected" ครอบคลุมทั้ง "ตายแล้ว" และ "กำลังจะเชื่อมสำเร็จ" ซึ่งเป็นสองเคสที่ต้องรับมือต่างกันโดยสิ้นเชิง

**ไฟล์ที่แก้**: `apps/web/src/lib/socket-client.ts` (client เท่านั้น ไม่แตะ API — deploy แค่ Vercel)

---

## ปัญหา/เรื่องที่ยังค้าง (ไม่ได้แก้ โดยตั้งใจ)

| เรื่อง | สถานะ | เหตุผล |
|---|---|---|
| Session หลุดบน iPad/iPhone Safari หลัง refresh | เลื่อนไว้ | สงสัย ITP ของ Safari; รอผลทดสอบซ้ำจาก user |
| ทำให้การเชื่อมต่อเสียงเร็วขึ้นถาวร (เช่น TURN server ใกล้ผู้ใช้) | Optional ตามที่ user ระบุ | ต้องเพิ่ม infrastructure; ระบบปัจจุบันมี fallback พอใช้ได้ |
| Email ยืนยันส่งจริง (ตอนนี้ print ลง console) | รอ credentials | ใช้ interface แล้ว สลับ implementation ได้ทันทีที่มี SMTP/API key |
| Google Login จริง | รอ credentials | เหมือนกัน — route พร้อมแล้ว |
