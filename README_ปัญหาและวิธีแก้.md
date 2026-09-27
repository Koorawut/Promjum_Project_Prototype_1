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

## ช่วงที่ 11 — Bug round จาก 4-way audit (2026-09-27, หลัง checkpoint `checkpoint-1_2-before-bugfix-round`)

> ทั้งหมดมาจากการ audit แบบ 4 ทางขนาน (auth / realtime gateway / practice+scoring+schema / WebRTC+socket client) หลังจบปัญหา 19 — พบใหม่ 14 จุด แยกตามความรุนแรง 🔴 3 / 🟠 6 / 🟡 5 แก้ครบทั้ง 14 ในรอบนี้ ยกเว้นที่ระบุว่าเลื่อนไว้

### ปัญหา 20 (🔴): Socket ถูก lockout ถาวรเมื่อ access token หมดอายุ
**อาการ**: หลัง access token (15 นาที) หมดอายุ ระหว่างที่หน้าเว็บยังเปิดค้างไว้ — socket.io พยายาม reconnect ไม่จำกัดครั้ง แต่ `auth` ที่ส่งเป็น static object ถูก capture ตั้งแต่ตอนสร้าง socket แล้ว **ไม่เปลี่ยนตลอดการ reconnect** → server ปฏิเสธทุกครั้ง (`ws-auth.guard` disconnect) → ผู้เล่นหลุดจากเกม/ไม่ได้รับ event อะไรอีกเลย โดยไม่มีทางกลับมาเอง
**สาเหตุ**: `getSocket()` ส่ง `auth: { token }` เป็น object — socket.io-client อ่านค่านี้ครั้งเดียวตอน construct และ reuse ตลอด retry ไม่ว่าเราจะเปลี่ยนตัวแปรทีหลัง
**วิธีแก้** (`apps/web/src/lib/socket-client.ts`, `apps/web/src/lib/api-client.ts`):
- เปลี่ยนเป็น `auth: (cb) => cb({ token: socketToken })` — รูป function ถูกเรียกใหม่**ทุกครั้ง**ที่ (re)connect จึงได้ token ล่าสุดเสมอ
- เพิ่ม listener `connect_error` — ถ้า server ปฏิเสธ handshake ให้เรียก `refreshAccessToken()` (export `doRefresh` จาก api-client มา reuse) แล้วอัปเดต `socketToken` พร้อม flag กันเรียกซ้อน

### ปัญหา 21 (🔴): Login พร้อมกัน 2 request ทำให้มี 2 session พร้อมกัน
**อาการ**: single-session-per-account ถูกบังคับด้วย `deleteMany` ตามด้วย `create` แบบไม่มี transaction — 2 login ที่ยิงพร้อมกัน (double-submit / 2 tab) ผ่านเช็ค "ยังไม่มี session" ทั้งคู่ แล้ว insert ทั้งคู่ → มี refresh token ที่ใช้ได้จริง 2 ตัวสำหรับบัญชีเดียว
**วิธีแก้** (`auth.service.ts` + migration `20260927000000_user_session_unique_user_id`):
- เพิ่ม `@unique` ให้ `UserSession.userId` (DB-level guarantee)
- เปลี่ยน logic เป็น `findUnique` (เพื่อ flag `duplicateLogin` อย่างเดียว) + `upsert` — atomic แม้มี race เพราะ Postgres จัดการ `INSERT ... ON CONFLICT` ให้เอง

### ปัญหา 22 (🔴): Google OAuth — ไม่มี CSRF state + โดนยึดบัญชีผ่าน unverified email
**อาการ (2 ประการ)**:
1. **Login CSRF** — strategy ไม่ได้ส่ง `state` และไม่มี express-session ให้ passport ใช้ → ไม่มีการผูก callback กับ browser ที่เริ่ม flow ผู้โจมตี login Google ของตัวเอง จับ URL callback (`/auth/google/callback?code=...`) แล้วหลอกให้เหยื่อเปิด → เบราว์เซอร์เหยื่อถูก login เป็นบัญชีที่ผู้โจมตีเลือก
2. **Account takeover ผ่าน email ซ้อน** — `register()` ไม่บังคับยืนยันอีเมลก่อนใช้บัญชี → ผู้โจมตี register ด้วยอีเมลจริงของเหยื่อ + รหัสตัวเอง (login ด้วยรหัสได้เลยเพราะ login เช็คแค่ passwordHash) — พอเหยื่อ login ด้วย Google อีเมลเดียวกัน `loginOrRegisterWithGoogle` หาเจอ row เดิมด้วย email แล้ว**เติม googleId ให้เลย** → ทั้งคู่เข้าบัญชีเดียวกันได้ โดยเหยื่อไม่รู้
**วิธีแก้** (`strategies/oauth-state.store.ts` ใหม่, `google.strategy.ts`, `auth.service.ts`, `auth.controller.ts`):
- สร้าง `CookieStateStore` — เก็บ random nonce ใน HttpOnly cookie (อายุ 5 นาที, `SameSite=Lax`, `Secure`) set ตอน `/auth/google` และตรวจตอน callback — ทำหน้าที่เดียวกับ session-based state โดยไม่ต้องติดตั้ง express-session; implement ทั้ง overload 2-arg/3-arg ตาม interface ของ `@types/passport-oauth2` (runtime เลือกทางด้วย `Function.length`)
- ตัดการ auto-link แบบเงียบ: ถ้าบัญชีเดิม (email ตรงกัน) **ยังไม่ verified** → ปฏิเสธ พร้อมข้อความให้ยืนยันอีเมลก่อน (link ยืนยันคือช่องทางเดียวที่พิสูจน์ความเป็นเจ้าของจริง) — verified แล้วเท่านั้นจึง link googleId ได้
- `googleCallback` wrap ด้วย try/catch → redirect กลับ `/login?error=...` แทนการทิ้ง JSON 400 กลาง redirect flow

### ปัญหา 23 (🟠): gateway races 4 จุด (match creation / round resolution / over-termination / kick window)
1. **Disconnect ระหว่างสร้างแมตช์** — `startMatch` await `prisma.matchSession.create` อยู่ ถ้า socket ฝั่งใดฝั่งหนึ่งตายช่วงนั้น `handleDisconnect` ยังไม่เห็น runtime (ยังไม่ได้ create) → แมตช์ถูกสร้างต่อด้วย socket ตายติดไปด้วย อีกฝ่ายรอ 60 วิก่อนเจอ `voice_failed` → แก้: หลัง DB create เช็ค `server.sockets.sockets.has(socketId)` ทั้งคู่ ถ้ามีฝั่งตาย จบแมตช์ทันทีเป็น `opponent_disconnected`
2. **Round resolution สายหลัง match finalize** — `resolveRound` await DB อยู่ ถ้าคู่แข่ง disconnect ระหว่างนั้น `handleDisconnect` finalize ไปก่อนแล้ว → `resolveRound` ฝืนเขียน `MatchRound` row ที่ score ไม่ถูกนับใน total ที่ finalize ไปแล้ว + ยิง `round_result` ทับ `match_end` → แก้: เช็ค `this.runtime.get(matchSessionId)` ก่อน mutate score/เขียน DB และอีกครั้งหลัง await ก่อน emit — ถ้า runtime หายแล้วให้ bail out
3. **`terminateStaleLiveMatches` ตัดเกิน** — เดิมจบทุก live match ของ user เมื่อกด `join_queue` โดยไม่ดูว่า match นั้นอยู่บน socket ตัวเองหรือเปล่า → stray/duplicate emit หรือ tab ที่สองสามารถ "จบ" match ที่กำลังเล่นจริงได้ → แก้: ผ่าน `currentSocketId` เข้าไป และ skip ทุก match ที่ participant record ชี้ที่ socket ปัจจุบัน (ไม่ stale)
4. **หน้าต่าง 150ms ระหว่าง force-kick emit กับ disconnect** — ช่วงนั้น socket ยัง emit ได้: (ก) zombie socket (โดน reject ที่ handleConnection) มี `socket.data.userId` เป็น undefined → `join_queue` สร้าง QueuedPlayer พัง → `startMatch` โยน error ใน path ที่ไม่มี catch คู่จริงที่ถูก pop จาก queue ค้างเฉยๆ; (ข) socket ที่เพิ่งโดน kick แต่ยังไม่ปิด กด `join_queue` ใหม่ได้ → เกิด match ที่ตายแน่นอน → แก้: `handleJoinQueue` ตรวจ `!socket.data.userId` ให้ return + เช็ค `presence.getForcedLogout(userId, iatSec) !== null` ให้ return (เก็บ `iatSec` ไว้ใน `socket.data` ตั้งแต่ handleConnection)

### ปัญหา 24 (🟠): `/auth/refresh` พร้อมกัน → 500
**สาเหตุ**: 2 request ใช้ cookie เดียวกัน ผ่าน `findFirst` ทั้งคู่ แล้ว `delete` ทั้งคู่ — ฝ่ายแพ้โดน Prisma P2025 (record not found) ไม่มีใคร catch → 500 แทนที่จะเป็น 401 สะอาดๆ
**วิธีแก้**: wrap `userSession.delete` ด้วย try/catch → throw `UnauthorizedException('Invalid or expired refresh token')` (ความหมายเดียวกับ "cookie นี้ถูก rotate ไปแล้วโดยอีก request")

### ปัญหา 25 (🟠): `resendVerification` เล็ก email ที่ verified แล้ว
**สาเหตุ**: unknown email → 200 เงียบๆ, unverified → 200 + ส่งเมล, **verified → 400 'Email already verified'** — สามช่องทางแยกกัน ทำให้ยิงสำรวจ email ได้ว่าตัวไหนเป็นบัญชีจริงที่ verified แล้ว (ตรงข้ามกับ comment ตัวเองที่เขียนว่า don't reveal account existence)
**วิธีแก้**: รวมเป็น 200 เงียบๆ ทุกกรณี (unknown/verified/unverified) — ส่งเมลเฉพาะเมื่อมีอะไรต้อง verify จริง; ฝั่ง web ไม่ต้องแก้ตามเพราะ handler เดิมแสดง error กลางๆ อยู่แล้ว

### ปัญหา 26-30 (🟡): กลุ่ม low-severity
| # | เรื่อง | วิธีแก้ |
|---|---|---|
| 26 | `CORS_ORIGIN` เป็น static string เดี่ยว — ทุก Vercel preview URL auth พังเงียบๆ | `main.ts` รองรับ comma-separated list (`parseCorsOrigins()` แย่งค่าด้วย comma + trim + ตัด trailing slash) |
| 27 | สูตรคะแนนมี floor ไม่มี ceiling — clock ย้อนหลัง (NTP/VM migration) ทำให้ score > 100 | `scoring.util.ts` clamp `Math.min(100, Math.max(10, ...))` |
| 28 | session JWT อายุ 2 ชม. อ้าง sentenceId ที่ถูกลบไปแล้ว → FK violation เป็น 500 | `completeSentence` เช็คว่า sentence ยังมีอยู่ก่อน upsert → ตอบ 404 สะอาดๆ |
| 29 | `GET /game/summary/:matchId` ไม่ validate UUID → ค่าไม่ใช่ UUID ได้ 500 | เพิ่ม `ParseUUIDPipe` ที่ param → 400 |
| 30 | ไม่มีอะไรกัน `GameImage.isCorrect = true` ซ้อนใน image set เดียว → รอบเละโดยไม่มี error | migration `20260927000100` สร้าง **partial unique index** บน `(image_set_id) WHERE is_correct = true` (Prisma schema syntax ไม่รองรับ partial index — อยู่ใน SQL อย่างเดียว พร้อม comment อ้างอิงใน schema.prisma) |

**การตรวจสอบ**: `tsc --noEmit` ผ่านทั้ง `apps/api` + `apps/web`, `nest build` ผ่าน, `prisma validate` + `prisma generate` ผ่าน, eslint ไม่เพิ่ม error ใหม่ (จำนวนลดลงจาก baseline หลัง `--fix`)
**หมายเหตุ deploy**: migration 2 ไฟล์ (`20260927000000`, `20260927000100`) ยังไม่ได้ run กับ production DB โดยตรง — จะถูก apply อัตโนมัติตอน Railway deploy ถัดไปผ่าน `prisma migrate deploy` ตาม flow เดิม (ตรวจ duplicate `user_id` ใน `user_sessions` แล้วไม่มี — ไม่มีอะไรกั้น migration; ฝั่ง `game_images` ยังตรวจ duplicate ไม่ได้ในรอบนี้เพราะข้อจำกัดเครื่องมือ — ถ้า migration ชน duplicate ตอน deploy ให้เก็บ row ที่ต้องการแล้ว re-run)
**สิ่งที่ยังเลื่อน**: reuse-detection/alerting ของ refresh token ที่ถูก rotate ไปแล้ว (hardening gap ไม่ใช่ bug — ปิดแบบ fail-closed แล้ว)

---

## ช่วงที่ 12 — Admin Panel (2026-09-27, หลัง checkpoint `checkpoint-1_3-after-bugfix-round`)

ฟีเจอร์ใหม่ตามดีไซน์ที่ user เตรียมไว้ (3 หน้า: Dashboard / จัดการ Quiz / จัดการผู้ใช้) — ไม่ใช่การแก้ bug แต่บันทึกการตัดสินใจสำคัญและปัญหาที่เจอระหว่างทำ:

### การตัดสินใจออกแบบ (จากดีไซน์ → ระบบจริง)
- **Role-based auth**: `UserRole` enum (`user`/`admin`) ใน schema + ฝัง role ใน JWT payload ตั้งแต่ login — ไม่ต้อง query DB ทุก request; token เก่า default เป็น `user` จนหมดอายุ (15 นาที) จึงไม่กระทบ user ที่ login ค้างอยู่ตอน deploy
- **ไม่มี hardcoded admin credentials**: คู่ `Adminstrator/0819736177z` ในไฟล์ดีไซน์เป็น demo เท่านั้น — admin คือแถว `users` ปกติที่ `role='admin'` การตั้งครั้งแรกต้องแก้ผ่าน DB โดยตรง (ดูด้านล่าง)
- **ไฟล์แนบเก็บใน Postgres** (`media_files` table, column `Bytes`): Railway FS เป็น ephemeral และยังไม่มี R2/S3 ต่อว่า — trade-off คือ DB โตตามไฟล์ แต่ไม่เพิ่ม dependency; ย้ายไป object storage ภายหลังได้โดยเปลี่ยนแค่ `MediaService`
- **เสียงอัปโหลดแยก endpoint** (`POST /admin/media/audio`): ฟอร์มแก้ไขใช้ช่องรูปเป็นตัวขับ multipart request เดียว จึงไม่สามารถแนบไฟล์เสียงใน request เดียวกันได้ — flow คืออัปโหลดเสียงก่อนได้ URL แล้วส่ง URL นั้นเป็นฟิลด์ข้อความ `audioUrl` ตามหลัง
- **`GET /media/:id` เป็น public**: ให้แท็ก `<img>`/`<audio>` บนหน้าผู้ใช้ดึงไฟล์ได้โดยไม่ต้องมี Bearer token — ความปลอดภัยอิง UUID ที่เดาไม่ได้ (trust model เดียวกับ URL picsum/soundhelix ที่ seed ใช้อยู่เดิม)
- **Options เก็บเป็น key-string**: ฟอร์มแอดมินส่ง `options` (JSON array) + `correctIndex` แต่ DB เก็บ `correctOptionKey` ('a'/'b'/...) ตาม convention เดิมของ seed — service แปลงให้ทั้งสองทาง

### ปัญหาที่เจอระหว่าง implement

### ปัญหา 31 (🟠): `apiFetch` พังกับ FormData
**สาเหตุ**: `apiFetch` set `Content-Type: application/json` + `JSON.stringify(body)` เสมอ — กับ FormData จะทำให้ request boundary พัง (browser ต้องสร้าง Content-Type พร้อม multipart boundary เอง)
**วิธีแก้**: เพิ่ม `apiUpload()` ใน `api-client.ts` — ไม่แตะ Content-Type, แนบ Bearer token, มี 401 → refresh → retry เหมือน `apiFetch` (admin session ที่หมดอายุกลางอัปโหลดจึงกู้คืนได้เหมือนกัน)

### ปัญหา 32 (🟡): multipart fields มาเป็น string ทั้งหมด
**สาเหตุ**: request multipart ผ่าน Multer ทำให้ทุกฟิลด์ข้อความเป็น string — `enabled: "true"`, `options: '["A","B"]'`, `correctIndex: "0"`
**วิธีแก้**: controller normalize เอง — `enabled` รับได้ทั้ง string/boolean, `options` parse JSON (fallback แบ่งด้วย `|`), `correctIndex` แปลง `Number()` พร้อม validate

### ปัญหา 33 (🟡): Prisma `Bytes` ไม่รับ `Buffer`
**สาเหตุ**: TS บอก `Buffer` ใส่ใน field `Bytes` ไม่ได้ (ต้องการ ArrayBuffer แบบ definite)
**วิธีแก้**: `data: new Uint8Array(file.buffer)` ใน `MediaService.store()`

### ปัญหา 34 (🟡): `multer.d.ts` ต้องเป็น global script
**สาเหตุ**: ไม่มี `@types/multer` (ติดตั้งเพิ่มไม่ได้ในรอบนั้น) เลยเขียน ambient typings เอง — เวอร์ชันแรกมี top-level `import type` ทำให้ไฟล์กลายเป็น module แล้ว `declare namespace Express.Multer` ไม่ถูก register (TS2694)
**วิธีแก้**: เขียนใหม่เป็น global script ล้วน (ห้ามมี top-level import/export ใดๆ)

### ปัญหา 35 (🟠): Admin Panel 3 จุดที่ผิดจากการทดสอบจริง (user report)
1. **Navbar ซ้อน 2 อันตอนเลื่อนลง** — `/admin` อยู่ใต้ route group `(protected)` จึงโดน topbar + tabbar ของผู้ใช้ครอบทับกับ admin topbar ตัวเอง → แก้: ย้าย `admin/` ออกมาเป็น route ระดับบน (`src/app/admin/`) นอก `(protected)` — layout ของ admin มี auth guard + topbar ของตัวเองอยู่แล้ว จึงแยก layer ของ admin กับของ user ออกจากกันสนิท
2. **Modal (เพิ่ม/แก้ไข/ลบ) ไปโผล่ซ้ายล่างของจอ ไม่ลอยกลาง** — เขียนเป็น `<dialog open>` ซึ่งเป็นการเปิดแบบ "inline" (dialog อยู่ใน document flow ตามตำแหน่งที่ render ไม่เข้า browser top layer) → แก้: hook `useModalOpen()` เรียก `el.showModal()` ผ่าน ref เมื่อ state เปิด (showModal คือวิธีเดียวที่ทำให้ dialog เข้า top layer — กลางจอ + ::backdrop บังพื้นหลัง + กด Esc ปิดได้) พร้อม sync state กลับตอน `close` event
3. **หน้าจัดการผู้ใช้: ชื่อ/อีเมล/ป้ายสถานะเรียงแยกบรรทัดกันเกะกะ + ช่องค้นหาติดกับ list เกินไป** — เดิม `.usr-info b` กับ `.usr-info span` เป็น `display: block` ทุกตัว (ชื่อบรรทัด, อีเมลบรรทัด, badge บรรทัด) → แก้: จัดชื่อ + อีเมลอยู่บรรทัดเดียว (`.usr-line` flex + baseline) badge อยู่บรรทัดล่าง, เพิ่ม `margin-top` ให้ช่องค้นหาและ list

### ปัญหา 36 (🟢): เปลี่ยนชื่อเว็บ SpeakUp → PromJum + แสดงเวอร์ชัน + จัดระเบียบ modal จัดการ Quiz
1. **เปลี่ยนชื่อเว็บไซต์** — แทนที่ข้อความ display ทุกจุด (root layout metadata, topbar, login, register, verify-email, admin ×3) จาก "SpeakUp" เป็น "PromJum" โดย**ไม่แตะ** localStorage key `speakup_login_notice` (เป็น storage key — ถ้าเปลี่ยนจะทำให้ notice เดิมที่เก็บไว้หาย/กลายเป็นของกำพร้า)
2. **Version badge ขวาล่าง** — เพิ่ม `APP_VERSION = "1.1"` export จาก `apps/web/src/app/layout.tsx` (ต้นทางเดียว) แล้ว render `<div className="version-badge">v{APP_VERSION}</div>` ท้าย body ทุกหน้า — CSS ใช้ `position: fixed; right: 10px; bottom: 8px; font-size: 11px; color: var(--muted); opacity: .7; pointer-events: none` ให้จางๆ ไม่รบกวน กดไม่ได้ ไม่บังอะไร
   - **ธรรมเนียมจากนี้ไป**: ทุกครั้งที่ deploy อะไรที่ user มองเห็น ให้ bump `APP_VERSION` ใน `apps/web/src/app/layout.tsx` (เช่น v1.1 → v1.2) แล้วจดใน README ว่าเวอร์ชันนั้นเปลี่ยนอะไร
3. **Modal จัดการ Quiz จัดเรียงให้เป็นระเบียบ + กลางจอ** — ปัญหาที่เห็นจริงคือ form สูง (ฟิลด์เยอะ) ทำให้ dialog ติดขอบบนของจอ (`<dialog>` ใน top layer จะถูกวางที่ top โดย default ถ้าไม่มี margin) → แก้ 3 ชั้น:
   - `.modal` / `.modal-lg` เพิ่ม `margin: auto` — ตัวจัดแนวตั้งให้ form สูงอยู่กลางจอจริงๆ (แนวนอน showModal จัดให้อยู่แล้ว)
   - ขยาย `.modal-lg` เป็น `max-width: 600px` + `max-height: calc(100vh - 64px); overflow: auto` — สมดุลกับฟิลด์ทั้งหมด
   - จัดระเบียบเนื้อใน: ช่องรูป/เสียงกลายเป็น card `.media-edit` (ขอบ + พื้นหลัง + thumb 84×84) เรียงต่อกันเป็นแถวสวยงาม, ปุ่ม "กลับ/บันทึก" แยกเป็น footer ชัดเจน (เส้นแบ่งด้านบน + ชิดขวา + ความกว้างขั้นต่ำ 120px)

### การตั้งบัญชีแอดมินครั้งแรก (manual step ครั้งเดียว)
ไม่มี endpoint สร้าง admin (โดยตั้งใจ — จะได้ไม่มีช่องทาง privilege escalation ผ่าน API) วิธีเดียวคือแก้ DB ตรงๆ ครั้งเดียว:
```sql
UPDATE users SET role = 'admin' WHERE email = '<อีเมลของคุณ>';
```
รันกับ Neon Postgres ผ่าน connection ปกติ (เช่น psql หรือ console ของ Neon) แล้ว **logout → login ใหม่** เพื่อให้ JWT ใหม่มี role admin (token เก่ายังเป็น `user` จนหมดอายุ)

**หมายเหตุ deploy**: migration `20260928000000_admin_panel` (enum UserRole + column `role`/`text_th`/`is_enabled` + ตาราง `media_files`) จะถูก apply อัตโนมัติตอน Railway deploy ผ่าน `prisma migrate deploy` — ไม่ต้อง run เอง

---

## ปัญหา/เรื่องที่ยังค้าง (ไม่ได้แก้ โดยตั้งใจ)

| เรื่อง | สถานะ | เหตุผล |
|---|---|---|
| Session หลุดบน iPad/iPhone Safari หลัง refresh | เลื่อนไว้ | สงสัย ITP ของ Safari; รอผลทดสอบซ้ำจาก user |
| ทำให้การเชื่อมต่อเสียงเร็วขึ้นถาวร (เช่น TURN server ใกล้ผู้ใช้) | Optional ตามที่ user ระบุ | ต้องเพิ่ม infrastructure; ระบบปัจจุบันมี fallback พอใช้ได้ |
| Email ยืนยันส่งจริง (ตอนนี้ print ลง console) | รอ credentials | ใช้ interface แล้ว สลับ implementation ได้ทันทีที่มี SMTP/API key |
| Google Login จริง | รอ credentials | เหมือนกัน — route + CSRF state + กัน account takeover พร้อมแล้ว (ปัญหา 22) |
