# SpeakUp (Promjum) — สรุปการทำงานของระบบทั้งหมด (ละเอียด)

โครงสร้าง: Monorepo `apps/api` (NestJS backend) + `apps/web` (Next.js frontend)
Deploy: Backend บน Railway, Frontend บน Vercel, Database คือ Neon Postgres (Prisma ORM)

---

## ส่วนที่ 1 — Backend (NestJS, `apps/api`)

### 1.1 Auth Module (`src/auth/`)
ระบบสมาชิกแบบครบวงจร:

| Endpoint | ทำงานอย่างไร |
|---|---|
| `POST /auth/register` | สมัครสมาชิก (username, email, password — bcrypt hash) แล้วสร้าง verify token |
| `GET /auth/verify-email?token=` | ยืนยันอีเมลจาก link (JWT signed ด้วย `EMAIL_VERIFY_SECRET`) |
| `POST /auth/resend-verification` | ส่งอีเมลยืนยันใหม่ |
| `POST /auth/login` | เข้าสู่ระบบ → คืน `accessToken` (JWT, อายุสั้น) + `refreshToken` (ใส่ HttpOnly cookie สำหรับ silent refresh) |
| `POST /auth/refresh` | แลก refresh cookie เป็น accessToken ใหม่ (rotate token ทุกครั้ง — ใช้ซ้ำไม่ได้) |
| `POST /auth/logout` | ลบ refresh token ออกจาก DB + ล้าง cookie |
| `GET /auth/google` | เริ่ม Google OAuth flow (ต้องตั้ง credentials จริงก่อน) |

กลไกสำคัญ:
- **Session เดียวต่อ account**: ถ้า login ที่เครื่องใหม่ session เครื่องเก่าจะถูก invalidate และ client เก่าถูก force-logout (มี `ForceLogoutListener` คอยจับฝั่ง frontend)
- **Email service** เป็น interface — ตอนนี้ใช้ `ConsoleEmailService` (print ลง console แทนการส่งจริง) สลับเป็น SMTP/SendGrid ได้ทีหลังโดยไม่แก้ business logic
- ทุก protected endpoint ใช้ `JwtAuthGuard` + `@CurrentUser()` decorator

### 1.2 Users / Sentences / Categories Module
- `UsersService` — ข้อมูล profile, สถิติการใช้งาน
- `SentencesService` — CRUD ประโยคฝึกพูด (มี `audioUrl`, `imageUrl`, และ `Quiz` แนบได้)
- Categories ถูกจัดการผ่าน practice module

### 1.3 Practice Module (`src/practice/`)
| Endpoint | ทำงานอย่างไร |
|---|---|
| `GET /categories` | รายการหมวดหมู่พร้อมจำนวนประโยค |
| `POST /practice/session` | สร้าง session ใหม่ — สุ่มประโยคจากหมวดที่เลือก (`count` ประโยค) |
| `GET /practice/session/:id` | ดึงรายละเอียด session + ประโยคทั้งหมด (เรียงตามลำดับ) |
| `POST /practice/session/:id/complete-sentence` | ส่งคำตอบ quiz → ตรวจความถูกต้อง บันทึกผล คืน `{isCorrect, correctOptionKey}` |

การไหลของข้อมูล: ประโยคถูกสุ่มตอนสร้าง session แล้วคงที่ตลอด session (ผู้เรียน refresh ก็ได้ชุดเดิม) ผล quiz ทุกประโยคถูกเก็บลง DB เพื่อใช้ทำสถิติ

### 1.4 Game Module (`src/game/`)
- `GET /game/summary/:matchId` — สรุปคะแนน match จบแล้ว (คะแนนแต่ละรอบ, คะแนนรวมแต่ละคน, ใครอธิบาย/ใครทายในแต่ละรอบ)
- `scoring.util.ts` — สูตรคะแนนแบบ server-authoritative: ตอบถูกได้ 100 คะแนน ลดตามเวลาที่ใช้ (ตอบเร็ว = ได้เยอะ) ตอบผิด/หมดเวลา = 0

### 1.5 Realtime Module (`src/realtime/`) — หัวใจของมินิเกม

ประกอบด้วย 4 services ที่แยกหน้าที่กันชัดเจน:

**MatchmakingQueueService** — คิวจับคู่
- ผู้เล่นกด "หาคู่" → เข้าคิว → พอมีครบ 2 คน (`tryDequeuePair`) จับคู่ทันที (FIFO)

**MatchRuntimeService** — สถานะแมตช์ที่กำลังเล่นอยู่ (in-memory)
- `MatchRuntimeState` เก็บ: participants (userId, username, socketId), currentRound, totalScores, ธงต่างๆ (`voiceReady`, `gameReady`, `matchCompleted`), และ timers
- Index สองทาง: `matchesById` (matchId → state) และ `matchIdBySocketId` (socketId → matchId)
- `reconnectUser()` — ถ้า socket หลุดแล้วต่อใหม่ (refresh เบื้องหลัง, network สะดุด) จะ repoint participant record ไปที่ socket.id ใหม่ ไม่ให้ event หลุด
- `remove()` มี guard กันลบ socketId mapping ของแมตช์ใหม่ที่ซ้อนกัน (เคยเกิด bug จากเรื่องนี้ — ดูไฟล์สรุปปัญหา)

**PresenceService** — ติดตามว่า user คนไหน online อยู่ที่ socket ไหน (ใช้กับระบบเพื่อน/สถานะในอนาคต)

**RealtimeGateway** — Socket.io gateway, ศูนย์รวม event ทั้งหมด:

ลำดับการทำงานของหนึ่งแมตช์ (lifecycle):
1. `join_queue` → เข้าคิว (ถ้ามีแมตช์เก่าค้างอยู่จะถูกปิดก่อนผ่าน `endStaleCompletedMatch`)
2. จับคู่ได้ → สร้าง `MatchSession` ใน DB → ส่ง `matched` event ให้ทั้งคู่ (พร้อม `isInitiator` สำหรับกำหนดฝั่งที่จะส่ง WebRTC offer — ใช้การเทียบ userId เพื่อให้ deterministic)
3. ทั้งสองฝั่งเชื่อมเสียงกันเองผ่าน **WebRTC** (server เป็นแค่คนกลาง forward สัญญาณผ่าน `webrtc_signal` event — เสียงไม่ผ่าน server)
4. **รอความพร้อมสองอย่างก่อนเริ่มรอบ 1**: `voice_ready` (เสียงเชื่อมแล้ว) + `game_ready` (หน้าเกมโหลดเสร็จและกำลังฟัง event อยู่) จาก **ทั้งสองคน** — มี fallback 12 วินาทีกันค้าง
5. `startRound` — สุ่ม ImageSet (มีภาพ 4-6 ใบ มีถูก 1 ใบ) สลับบทบาททุกรอบ ส่ง `round_start` ให้ฝั่ง describer (เห็นภาพเป้าหมาย) และฝั่ง guesser (เห็น 4 ตัวเลือก)
6. `submit_answer` → `resolveRound` — คิดคะแนน server-side, บันทึก `MatchRound` ลง DB, ส่ง `round_result` ให้ทั้งคู่; มี `setTimeout` คุมเวลาแต่ละรอบ (30 วิ) ถ้าไม่ตอบก็ resolve เป็นผิดอัตโนมัติ
7. ครบ 4 รอบ → `finalizeMatch` (บันทึกคะแนนรวม, ปิด MatchSession) → ส่ง `match_end (reason: "completed")` ให้ทั้งคู่ → เข้าสู่ **โหมด post-match**
8. **โหมด post-match** (`matchCompleted = true`): สายเสียงยังอยู่ต่ออีก 30 วินาที — จบก่อก่อนโดย `finish_match` จากฝ่ายใดฝ่ายหนึ่ง (ส่ง `call_end` ให้ **อีกฝ่าย** แล้ว teardown) หรือรอ `postMatchTimeout` หมด (ส่ง `call_end` ให้**ทั้งคู่**) — อย่างใดอย่างหนึ่งก่อน
9. กรณีออกกลางเกม: `leave_match` (กด X ในเกม) ส่ง `match_end (reason: "opponent_left")` ให้อีกฝ่ายพร้อมแจ้งเตือน; ถ้า socket หลุดกระทันหัน (`handleDisconnect`) ส่ง `match_end (reason: "opponent_disconnected")` — ทั้งสองกรณีจบแมตช์และไม่มีสายค้าง

Guard ที่สำคัญ:
- `handleDisconnect` ตอน `matchCompleted` = แค่วางสาย post-match ไม่ใช่ abandon กลางเกม
- `endStaleCompletedMatch` ตอน `join_queue` = กันแมตช์เก่า (ที่เล่นจบแล้วแต่ไม่ได้กดเสร็จสิ้น) มาปนกับแมตช์ใหม่
- `remove()` ของ runtime service = ลบ timers ทั้งหมด (round timeout, voiceReady timeout, postMatch timeout) กัน timer ย้อนหลังมายิงถูกแมตช์ผิด

### 1.6 ข้อมูล (Prisma schema)
โมเดลหลัก: `User`, `AuthSession` (refresh token), `Category`, `Sentence`, `Quiz`, `PracticeSession` + `PracticeSessionSentence`, `ImageSet` + `GameImage`, `MatchSession` + `MatchParticipant` + `MatchRound`
Seed: 3 หมวด, ประโยค + รูป + เสียงตัวอย่าง, quiz ~70% ของประโยค, 3 ชุดภาพเกม (ชุดละ 4-6 ภาพ, ถูก 1 ภาพ)

---

## ส่วนที่ 2 — Frontend (Next.js App Router, `apps/web`)

### 2.1 โครงสร้าง route
- `(auth)/` — login, register, verify-email, oauth-complete (ไม่มี topbar)
- `(protected)/` — home, practice/select, practice/[sessionId], game/lobby, game/[matchId], game/[matchId]/summary
- **Focus mode**: หน้า `practice/[id]` และ `game/[id]` ไม่แสดง topbar/tabbar (เพื่อ focus การเรียน/เล่น) — สังเกตว่า `game/[id]/summary` **ไม่อยู่ใน** focus mode จึงมี topbar ให้ออกไปหน้าอื่นได้

### 2.2 State management (Zustand — ไม่ persist ลง localStorage เพื่อความปลอดภัยของ token)
- `store/auth.ts` — user, accessToken (in-memory เท่านั้น), status
- `store/game.ts` — สถานะแมตช์: `localStream`, `matchId`, `opponentUsername`, `isInitiator`, `totalScores`, `voiceEnabled/Connected`, `muted`, `matchEndedAt` (timestamp สำหรับนับ 30 วิ post-match)

### 2.3 Lib / Hooks หลัก
- `lib/api-client.ts` — `apiFetch()`: แนบ Bearer token, ตรวจ 401 → เรียก refresh (dedupe ไม่ให้ยิงซ้ำ) → retry ครั้งเดียว, โยน `ApiError` พร้อม message ภาษาไทยจาก server
- `lib/socket-client.ts` — socket.io singleton (`getSocket()`, `getCurrentSocket()`, `disconnectSocket()`); `getSocket(token)` reuse ตัวเดิมโดยเช็คแค่ token เท่านั้น (ไม่เช็ค `.connected` — ดู README_ปัญหาและวิธีแก้.md ปัญหา 19 สำหรับสาเหตุที่ต้องเป็นแบบนี้ เพราะมีหลาย component เรียกพร้อมกันตอน root layout mount)
- `hooks/useAuth.ts` — login/register/logout/refresh; `logout()` ตัดสายค้างก่อน disconnect เสมอ
- `hooks/useSocket.ts` — คืน socket ที่ connect แล้วเมื่อมี token
- `hooks/useWebRTC.ts` — สร้าง `RTCPeerConnection`, STUN + TURN (Metered), exchange SDP/ICE ผ่าน `webrtc_signal`, คุม mute ผ่าน `track.enabled`
- `hooks/useLeaveCall.ts` — ปิดสาย post-match เมื่อ user กดออกไปหน้าอื่น (ไม่แตะการ navigate ของ user)

### 2.4 Components ที่สำคัญต่อ lifecycle
- **`CallSessionManager`** (mount ที่ root layout, ไม่ unmount ตลอด session) — เจ้าของ `RTCPeerConnection` ตัวเดียวของแมตช์ ทำให้สายรอดจากหน้าเกม → หน้าสรุปผล; ฟัง `call_end` → reset ทุกอย่าง + redirect กลับ `/home`
- `AuthInitializer` — silent refresh ครั้งเดียวตอนเปิดเว็บ (ให้รู้ status ทั้ง app โดยไม่ต้อง login ใหม่)
- `ForceLogoutListener` — จับ event ที่ session ถูกไล่ออก (login ที่เครื่องอื่น) → เคลียร์ state + redirect

### 2.5 การไหลของหน้าเกม (frontend side)
1. **Lobby** — ขอไมค์ (`getUserMedia`) เก็บ stream ไว้ใน store → กดหาคู่ → `join_queue` → นับถอยหลัง
2. **`matched` มาถึง** → `setMatch()` (mute ไมค์ทันที + เคลียร์ state แมตช์เก่า) → ไป `/game/[matchId]`
3. **หน้าเกม** — emit `game_ready` ทันทีที่ mount; WebRTC เริ่ม negotiate ตั้งแต่ยังไม่เข้าหน้าเกมเลย (เริ่มตอน matched); เมื่อ `round_start` แรกมาถึงจึงเปิดไมค์ (กันเสียงหลุดช่วงนับถอยหลัง); รับ `round_start/round_result/match_end` มา render ตาม role (describer/guesser)
4. **หน้าสรุปผล** — fetch `/game/summary/:id`, นับถอยหลัง 30 วิจาก `matchEndedAt` (sync กับ timer ฝั่ง server), ปุ่ม: "เสร็จสิ้น" (emit `finish_match` + reset + ไป `/home`), "กลับไปฝึกพูด" / "เล่นอีกรอบ" / topbar ทุก link (ทุกปุ่มเรียก `useLeaveCall()` ก่อน = ตัดสายให้อีกฝ่ายทันที แต่ตัวเองไปหน้าที่เลือกตามปกติ)
5. **`call_end` มาถึง** (อีกฝ่ายออก หรือ timeout) → `CallSessionManager` reset + redirect `/home`

---

## ส่วนที่ 3 — Infrastructure

### Deployment flow
1. `git push` → ขึ้น GitHub
2. `railway up --service Promjum_Project_Prototype_1` (จาก `apps/api`) — build ผ่าน Dockerfile, รัน `prisma migrate deploy` ตอน start
3. `vercel deploy --prod --yes` (จาก `apps/web`) — ค่า `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` ชี้ไปที่ Railway

### การสื่อสารระหว่างกัน
- Frontend ↔ Backend (HTTP): `apiFetch` พร้อม Bearer token + refresh cookie (SameSite=None เพราะคนละ domain)
- Frontend ↔ Backend (WebSocket): Socket.io, path `/socket.io/`, auth ผ่าน JWT ใน handshake (`ws-auth.guard.ts` ตรวจทุก connection)
- ผู้เล่น ↔ ผู้เล่น (เสียง): WebRTC ตรงๆ หรือผ่าน TURN relay (Metered) ถ้า NAT เข้ม — **เสียงไม่ผ่าน server เลย**
