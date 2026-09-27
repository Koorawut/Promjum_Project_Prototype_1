# รายงานการตรวจสอบและทดสอบ Bug — SpeakUp (Promjum)

วันที่: 26 กันยายน 2026
ขอบเขต: การไหลของเกมทั้งหมด (lobby → match → summary → post-match call) + การเชื่อมต่อเสียง WebRTC + ทุกทางออกจากสาย + edge cases ต่างๆ

---

## สรุปผู้บริหาร

พบ bug หลัก 2 ตัว (ตามที่ user รายงาน) + bug ซ่อนอยู่อีก 7 ตัวที่พบระหว่าง audit และแก้ไขหมดแล้ว:

| # | Bug | ความรุนแรง | สถานะ |
|---|---|---|---|
| 1 | redirect อีกฝ่ายไม่ทำงานบนมือถือ (browser back / swipe-back ไม่ถูกดัก) | สูง | ✅ แก้แล้ว |
| 2 | เสียงเชื่อมไม่ได้เลย PC↔Mobile (ไม่มี TURN relay ใช้งาน) | สูง | ✅ แก้แล้ว |
| 3 | ICE failed ครั้งเดียว = เงียบตลอดแมตช์ (ไม่มี retry) | สูง | ✅ แก้แล้ว |
| 4 | มือถือจอดับ/แอปถูกพับ ตอนสายจบ → ค้างหน้าสรุปผลตลอดไป (event หายถาวร) | สูง | ✅ แก้แล้ว |
| 5 | TURN credentials เก่า (cache ตลอด session, หมดอายุ 15 นาที) | กลาง | ✅ แก้แล้ว |
| 6 | "เล่นอีกรอบ" → reset() ฆ่าไมโครโฟน → ต้องขอสิทธิ์ไมค์ใหม่ทุกรอบ | กลาง | ✅ แก้แล้ว |
| 7 | "เล่นอีกรอบ" → getUserMedia ซ้ำ ทำ stream ซ้อนกัน (resource leak) | กลาง | ✅ แก้แล้ว |
| 8 | pathname watcher ฉบับแรกยิง leave_match ทันทีที่จับคู่ (ฆ่าแมตช์ตอนเกิด) | วิกฤต (regression ที่เกือบทำ) | ✅ จับได้ก่อน deploy |
| 9 | หน้าสรุปผลนับ 0 แล้วแต่ไม่ปิดสายเอง (รอแต่ server) | กลาง | ✅ แก้แล้ว |

---

## ปัญหาที่ 1 — Redirect อีกฝ่ายไม่ทำงานบนมือถือ (PC-PC ผ่าน แต่ PC-Mobile ไม่ผ่าน)

### อาการ (จาก user)
เวลากดกลับด้วยฟังก์ชันอื่น user อีกฝั่ง redirect กลับ homepage ถูกต้อง **แต่เฉพาะการทดสอบบน PC-PC** พอเปลี่ยนเป็น PC-Mobile อีกฝ่ายยังค้างหน้าสรุปผลแม้อีกฝ่ายจะกดออกไปแล้ว

### การวิเคราะห์
Fix รอบก่อน (commit `71d8745`) wire `useLeaveCall()` เข้ากับปุ่มทุกปุ่มในแอป: topbar links, tabbar links, ปุ่มบนหน้าสรุปผล, logout — **แต่ลืมวิธี navigation ที่ไม่ผ่านปุ่มในแอปเลย**

บนมือถือ ผู้ใช้ navigate ด้วย:
1. **ปุ่มย้อนกลับของเบราว์เซอร์ / gesture swipe-back** (ทางหลักของคนมือถือ!) — ไม่ผ่าน `onClick` ของ `<Link>` ใดๆ ทั้งสิ้น → ไม่มี `finish_match` ถูก emit → server ไม่รู้ → สายและ runtime ค้าง → อีกฝ่ายไม่ได้รับ `call_end`
2. **การพับแอป/จอดับ** ระหว่างอยู่หน้าสรุปผล — socket ตายแบบไม่มีการ notify ที่ client จะจับได้

อธิบายได้ว่าทำไม PC-PC ผ่าน: บน PC ทุกคนทดสอบด้วยการ "คลิกปุ่มในแอป" (topbar/tabbar) ซึ่งถูก wire ครบ แต่มือถือเลื่อน/pinch แล้ว swipe กลับ หรือกดปุ่ม back ของตัวเบราว์เซอร์เอง ซึ่งเป็น path ที่ไม่มี handler เลย

### วิธีแก้
เพิ่ม **catch-all safety net** ที่ `CallSessionManager` (component ระดับ root ที่ไม่ unmount):
- เฝ้าดู `usePathname()` — ถ้า pathname **เปลี่ยนจาก** route ของสาย (`/game/[matchId]` หรือ `/game/[matchId]/summary`) **ไปเป็นอย่างอื่น** ขณะที่สายยัง live → emit `finish_match` (กรณี post-match) หรือ `leave_match` (กรณีกลางเกม) ให้ server ทันที + reset ฝั่งตัวเอง
- ใช้การเปรียบเทียบ **transition** (prev → current) ไม่ใช่แค่ "อยู่นอก call route" เพราะ `voiceEnabled` เป็น true ตั้งแต่ `matched` มาถึง ตอนที่ยังอยู่ lobby ระหว่าง countdown — ถ้าดูแค่ "อยู่นอก call route" จะยิง `leave_match` ฆ่าแมตช์ทันทีที่จับคู่ (bug #8 ที่จับได้ก่อน deploy)
- **ไม่บังคับ navigate** — user ไปหน้าที่ตัวเองเลือกแล้ว watcher แค่เก็บกวาดสายให้

ผลลัพธ์: ครอบคลุมทุกวิธีออกจากหน้า — ปุ่มในแอป (ยิงจาก onClick), browser back/swipe-back (ยิงจาก watcher), ปิด tab ทั้งเครื่อง (server เห็น disconnect)

### ไฟล์ที่แก้
- `apps/web/src/components/call-session-manager.tsx` — เพิ่ม pathname transition watcher

---

## ปัญหาที่ 2 — เสียงเชื่อมต่อไม่สำเร็จเลย PC↔Mobile (ทุกครั้ง ไม่มีเว้น)

### อาการ (จาก user)
ระหว่างทดสอบ PC-Mobile **ไม่มีครั้งใดที่การเชื่อมต่อเสียงสำเร็จเลย** ทั้งที่ PC-PC ใช้ได้ปกติ

### การวิเคราะห์
อาการ "วงเน็ตเดียวกันผ่าน ข้ามเครือข่ายไม่ผ่านเลยแม้แต่ครั้งเดียว" คือลายเซ็นคลาสสิกของ **การไม่มี TURN relay ใช้งาน**:

1. WebRTC เชื่อมเสียง 2 วิธี: ตรงๆ (ผ่าน STUN hole-punching) หรือผ่าน TURN relay
2. เครื่องในวงเน็ตเดียวกัน (PC-PC บ้านเดียวกัน) — hole-punch ง่าย ผ่านแทบทุกครั้ง
3. ข้ามเครือข่าย (PC บ้าน ↔ Mobile 4G/5G) — carrier NAT ของมือถือเข้มงวดมาก (symmetric NAT) hole-punch ไม่ผ่าน **ต้องมี TURN เท่านั้น**

ตรวจสอบพบว่า:
- `apps/api/.env` **ไม่มีตัวแปร `METERED_DOMAIN` / `METERED_API_KEY`** (มีแค่ DATABASE_URL, JWT secrets, Google placeholders, CORS, PORT)
- endpoint `/turn/credentials` (`app.controller.ts`) เมื่อไม่มีค่าพวกนี้จะคืน **STUN-only** กลับมา
- **client (`useWebRTC.ts`) รับ STUN-only มาแล้วใช้ตามไปด้วย** — ไม่มีการตรวจว่า "จริงๆแล้วไม่มี TURN เลยนะ นี่ข้ามเครือข่ายไม่ได้แน่" → ทุกการ์ดที่เล่นคือ STUN เพียวๆ → มือถือเชื่อมไม่ได้ 100% ตรงกับที่ user เจอ

(พยายาม probe production `/turn/credentials` เพื่อยืนยัน แต่ permission classifier ของเครื่องมือล่มซ้ำๆ ระหว่างทำ — ไม่ใช่ถูกปฏิเสธ แค่ยืนยันจาก code path ไม่ได้ ซึ่ง code path ชัดเจนพออยู่แล้ว)

### วิธีแก้ (2 ชั้น)
**ชั้นที่ 1 — client fallback (แก้ได้ทันที ไม่ต้องรอ config):**
เพิ่ม `PUBLIC_TURN_ICE_SERVERS` ใน `useWebRTC.ts`: เมื่อ backend คืน iceServers ที่ **ไม่มี entry แบบ `turn:`** (คือ STUN-only) → client แทนด้วยชุด public TURN ของ Open Relay Project (`turn:openrelay.metered.ca` พร้อม username/credential สาธารณะ openrelayproject) — บริการ TURN ฟรีสาธารณะที่ใช้ได้ทันที ทำให้ข้ามเครือข่ายเชื่อมได้เลยโดยไม่ต้องแตะ server

**ชั้นที่ 2 — คงใช้ Metered ได้เมื่อตั้งค่า:** ถ้าในอนาคตใส่ `METERED_DOMAIN`/`METERED_API_KEY` ใน Railway env แล้ว server จะคืน TURN แบบมี credential จริง ซึ่ง client ตรวจเจอ `turn:` ก็จะใช้อันนั้นแทน (private TURN เร็วกว่า/เสถียรกว่า public)

### ไฟล์ที่แก้
- `apps/web/src/hooks/useWebRTC.ts` — เพิ่ม public TURN fallback + ตรวจ hasTurn ใน response

---

## ปัญหาที่ 3 — ICE failed ครั้งเดียว = เงียบตลอดแมตช์ (ไม่มี retry)

### การวิเคราะห์
`onconnectionstatechange` เดิม: state `failed` → แค่ตั้ง `voiceConnected = false` แล้วจบ — ไม่มีความพยายามครั้งที่สอง ทั้งที่ first-ever TURN allocation ล้มเหลวเป็นเรื่องปกติ (credential sync, network blip ชั่วขณะ) และ ICE restart มักสำเร็จ

### วิธีแก้
เมื่อ state = `failed` → เรียก `pc.restartIce()` 1 ครั้ง (นับด้วย `restartsUsedRef` กัน infinite loop) — ให้โอกาส negotiation ที่สองโดยไม่ต้องเข้าคิวใหม่

### ไฟล์ที่แก้
- `apps/web/src/hooks/useWebRTC.ts`

---

## ปัญหาที่ 4 — มือถือจอดับ/แอปถูกพับ ตอนสายจบ → ค้างหน้าสรุปผลตลอดไป

### การวิเคราะห์
Mobile browser ที่พับแอปไว้ (จอดับ, สลับแอป) จะ **kill socket แบบเงียบๆ** เมื่อกลับมา socket reconnect ใหม่ แต่:
- `call_end` ที่ server ส่งตอนที่ tab ถูกพับ **หายไปตลอดกาล** (ไม่มี replay 机制)
- ฝั่ง server runtime ถูกลบไปแล้ว ไม่มีอะไรบอก client ว่าสายจบแล้ว
- ผล: user กลับมาเจอหน้าสรุปผลที่ countdown ค้าง/หยุดนิ่ง ไม่มีปุ่มไหนพาออก (นอกจาก topbar — ซึ่งตอนนี้ watcher จะเก็บให้ แต่ตัว countdown เองก็ควรปิดเองได้)

### วิธีแก้ (2 ชั้น)
1. **หน้าสรุปผลมี deadline ในเครื่อง**: countdown tick ถ้าเหลือ 0 → emit `finish_match` + `reset()` เองทันที (ไม่รอ server) และซ่อน notice เมื่อหมด
2. **CallSessionManager มี deadline สำรอง**: ถ้า `voiceEnabled` ยังเป็น true แต่เลย `matchEndedAt + 30s` ไปแล้ว (เช่น ตื่นมาจาก tab ที่ถูกพับทั้งคืน) → reset ทันที — สายที่เกินเวลา post-match ไม่มีทางยัง live อยู่ได้ จึงเก็บกวาดฝั่งเราได้เลยโดยไม่ต้องถาม server

### ไฟล์ที่แก้
- `apps/web/src/app/(protected)/game/[matchId]/summary/page.tsx`
- `apps/web/src/components/call-session-manager.tsx`

---

## ปัญหาที่ 5 — TURN credentials เก่า (cache ตลอด session)

### การวิเคราะห์
`getIceServers()` เดิม cache promise ไว้ **ตลอดทั้ง session** (module-level, ไม่มี expiry) — แต่ TURN credentials จาก Metered มีอายุ ~15 นาที ถ้า user ใช้แอปนานๆ แล้วจับคู่ใหม่ ICE จะยิงขอ credential หมดอายุ → เชื่อมไม่ได้โดยไม่มี error ชัดเจน

### วิธีแก้
เพิ่ม TTL 10 นาที (`ICE_TTL_MS`) — พ้นหมดอายุแล้ว fetch ใหม่

### ไฟล์ที่แก้
- `apps/web/src/hooks/useWebRTC.ts`

---

## ปัญหาที่ 6 — "เล่นอีกรอบ" → reset() ฆ่าไมโครโฟน

### การวิเคราะห์
`useLeaveCall()` เรียก `reset()` ซึ่ง `localStream.getTracks().forEach(t => t.stop())` — แต่ปุ่ม "เล่นอีกรอบ" นำ user กลับ lobby เพื่อแมตช์ใหม่ที่ **ต้องใช้ stream เดิม** ผลคือทุกครั้งที่กดเล่นอีกรอบต้องขอสิทธิ์ไมค์ใหม่ (และบาง browser จะถามซ้ำ) — UX แย่และไม่จำเป็น

### วิธีแก้
ปุ่ม "เล่นอีกรอบ" เลี่ยง `reset()`: emit `finish_match` (จบสายให้อีกฝ่าย) + `setVoiceEnabled(false)` (ปิด call lifecycle) แต่ **หยุด stream ไม่ได้** — แล้ว `router.push("/game/lobby")` เอง

### ไฟล์ที่แก้
- `apps/web/src/app/(protected)/game/[matchId]/summary/page.tsx`

---

## ปัญหาที่ 7 — getUserMedia ซ้ำทำ stream ซ้อนกัน

### การวิเคราะห์
ต่อจาก #6: พอ stream ยังอยู่ใน store แต่ lobby `handleAllow()` เดิมจะ `getUserMedia` ใหม่เสมอ — เกิด 2 audio tracks ทำงานพร้อมกัน (อันเก่าไม่ถูก stop เพราะ `setLocalStream` แค่ทับ reference) = mic indicator ค้าง +  resource leak

### วิธีแก้
`handleAllow()` ตรวจก่อน: ถ้า stream เดิมยัง live (`readyState === "live"`) → ใช้อันเดิม ไม่ขอใหม่; ขอใหม่เฉพาะเมื่อไม่มีหรือตายแล้ว

### ไฟล์ที่แก้
- `apps/web/src/app/(protected)/game/lobby/page.tsx`

---

## ปัญหาที่ 8 — (Regression ที่จับได้ก่อน deploy) pathname watcher ฉบับแรกจะฆ่าแมตช์ทันทีที่จับคู่

### การวิเคราะห์
ระหว่างเขียน fix ปัญหา 1 ผมเขียน watcher ฉบับแรกเป็น "ถ้า voiceEnabled && อยู่นอก call route → ยิง leave_match" — **ผิดร้ายแรง**: `voiceEnabled` เป็น true ตั้งแต่ `matched` event มาถึง ตอนที่ user **ยังอยู่หน้า lobby ระหว่าง countdown 3-2-1** → watcher จะยิงทันทีที่ matched เกิด = ทุกแมตช์ถูกฆ่าตอนเกิด ทุกครั้ง ไม่มีเว้น

จับได้จากการ walk-through ตัวโค้ดที่เพิ่งเขียนเอง (self-review ก่อน commit) และแก้เป็นเงื่อนไข **transition**: ยิงเฉพาะเมื่อ pathname เปลี่ยน **จาก** call route **ไป** non-call route เท่านั้น (การเข้า lobby ตอน matched ไม่ใช่ transition จาก call route จึงไม่โดน)

บันทึกไว้เป็นบทเรียน: กับ state machine แบบนี้ ต้องคิดเป็น "เหตุการณ์เปลี่ยนสถานะ" ไม่ใช่ "สถานะปัจจุบัน"

### ไฟล์ที่แก้
- `apps/web/src/components/call-session-manager.tsx`

---

## ปัญหาที่ 9 — หน้าสรุปผล countdown ถึง 0 แล้วไม่ปิดสายเอง

### การวิเคราะห์
Countdown เดิมแค่ render เลข พอถึง 0 ก็แสดง "0" ไปเรื่อยๆ (และ notice ยังโชว์) รอแต่ `call_end` จาก server — ถ้า event นั้นหาย (ดูปัญหา 4) หน้าก็ค้าง

### วิธีแก้
รวมใน fix ปัญหา 4: tick ถึง 0 → จบสายเอง + ซ่อน notice (`callSecondsLeft > 0` เท่านั้นที่แสดง)

---

## การทดสอบที่ทำ (และสิ่งที่ยังต้องทดสอบจริงบน device)

### สิ่งที่ตรวจแล้วด้วยการ walk-through โค้ด (code audit)
| Scenario | ผล |
|---|---|
| กดปุ่ม topbar/tabbar ทุกปุ่มขณะสาย live | ✅ onClick → leaveCall → finish_match → อีกฝ่าย call_end |
| ปุ่ม back ของเบราว์เซอร์ / swipe-back จากหน้าสรุปผล | ✅ watcher จับ transition → finish_match |
| ปุ่ม back ระหว่างเล่นเกม (กลางแมตช์) | ✅ watcher → leave_match (abandon ถูกต้อง ไม่ใช่ finish) |
| matched มาถึงระหว่าง lobby countdown | ✅ ไม่ยิงอะไร (ไม่ใช่ transition จาก call route) |
| เล่นอีกรอบ: summary → lobby → match ใหม่ | ✅ stream ถูก reuse, ไม่ถูก reset ฆ่า |
| logout ขณะสาย live | ✅ useAuth ยิง finish_match ก่อน disconnect |
| ปิด tab / refresh หน้า | ✅ server handleDisconnect → call_end อีกฝ่าย |
| มือถือพับ tab ตอนสายจบ → กลับมา | ✅ deadline ในเครื่อง reset เอง |
| ICE failed ครั้งแรก | ✅ restartIce 1 ครั้ง |
| TURN credential หมดอายุ | ✅ TTL 10 นาที re-fetch |
| Type check (`tsc --noEmit`) | ✅ ผ่านทั้ง apps/web (api ไม่ได้แตะ) |

### สิ่งที่ต้องทดสอบจริงบน device (ผมทดสอบแทนไม่ได้ ต้องใช้เครื่องจริง 2 เครื่องคนละเครือข่าย)
1. **PC (WiFi บ้าน) ↔ Mobile (4G/5G ไม่ใช้ WiFi)** — เป้าหมายหลัก: เสียงต้องเชื่อมได้ผ่าน public TURN fallback (ปัญหา 2)
   - ตรวจยืนยันได้ที่ `chrome://webrtc-internals` ที่ PC: ดู selected candidate — ควรเห็น `relay` (TURN) ไม่ใช่ `srflx` อย่างเดียว
2. **Mobile: จบเกม → อยู่หน้าสรุปผล → swipe-back ของเบราว์เซอร์** — PC ฝั่งตรงข้ามต้องถูก redirect กลับ homepage ทันที (ปัญหา 1)
3. **Mobile: อยู่หน้าสรุปผล → พับแอป 1 นาที → กลับมา** — ต้องไม่ค้าง (deadline ปิดเอง)
4. **เล่นอีกรอบ 3-4 รอบติด** — ไม่ต้องขอไมค์ใหม่ + ไม่มีไมค์ค้างใน taskbar ของมือถือ
5. **Mobile: กดปุ่มกลางเกม (back ระหว่างเล่น)** — อีกฝ่ายต้องเห็น "เพื่อนออกจากเกมแล้ว" แล้วถูกพากลับหน้าหลัก
6. ถ้าเสียงยังไม่ผ่านในข้อ 1: เช็คว่าบริการ openrelay.metered.ca ยัง active (เป็นบริการฟรีสาธารณะ อาจมี downtime) — ทางแก้ถาวรคือตั้ง `METERED_DOMAIN`/`METERED_API_KEY` จริงใน Railway

### ข้อจำกัดที่ควรทราบ
- **Public TURN (Open Relay) เป็นบริการฟรี** — ใช้ได้จริงแต่ไม่มี SLA ถ้าเจอช่วงหนักๆ อาจช้า ทางแก้ระยะยาวที่แนะนำคือสมัคร Metered free tier เอง (ฟรี 500GB/เดือน) แล้วใส่ env ใน Railway — โค้ดฝั่ง server/client รองรับอยู่แล้ว แค่ใส่ค่า
- การทดสอบของผมเป็น **code audit + type check** — ไม่ได้รัน browser จริง 2 เครื่อง (เกินขอบเขตสภาพแวดล้อมนี้) รายการ device test ด้านบนคือสิ่งที่ user ควรรันยืนยัน

---

## สรุปไฟล์ที่แก้ทั้งหมดรอบนี้

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `apps/web/src/hooks/useWebRTC.ts` | Public TURN fallback + hasTurn detection + ICE TTL + ICE restart on failed |
| `apps/web/src/components/call-session-manager.tsx` | Pathname transition watcher (catch-all exit) + local post-match deadline |
| `apps/web/src/app/(protected)/game/[matchId]/summary/page.tsx` | Local countdown deadline (จบสายเองที่ 0) + "เล่นอีกรอบ" ไม่ reset stream |
| `apps/web/src/app/(protected)/game/lobby/page.tsx` | Reuse live mic stream แทน getUserMedia ซ้ำ |

**ฝั่ง API ไม่มีการเปลี่ยนแปลง** — แก้ทั้งหมดที่ client จึงต้อง deploy เฉพาะ Vercel (frontend)

---

## รอบทดสอบที่ 2 (2026-09-27) — Bug ที่ดูเหมือนแก้ไม่หาย: root cause จริงคือ client socket singleton race

### สรุป
หลัง deploy รอบแรกและยืนยัน server-side ด้วย simulation script (`test-midmatch-duplogin.js`) แล้วว่า logic ฝั่ง server ถูกต้อง 100% ยังมีรายงานจริงจาก user ว่า: login ซ้ำระหว่างเล่นเกมบางครั้งไม่บังคับ user เดิมออก, เสียงเชื่อมต่อไม่น่าเชื่อถือ, duplicate-login kick ไม่ยิงในบางเคส, และบัญชี tester3/tester4 โดยเฉพาะเสียงไม่เชื่อมเลยสักครั้ง + ตรวจจับ exit พลาด

**สาเหตุที่ simulation script เดิมพลาด**: script ทดสอบใช้ 1 socket ต่อ 1 ฝั่งตรงๆ ไม่มีการจำลอง sibling component หลายตัว (`ForceLogoutListener`, `CallSessionManager`, หน้า active) ที่เรียก `getSocket()` พร้อมกันจาก effect ของตัวเองตอน root layout mount — เป็น bug ฝั่ง **client** ที่ server-side simulation ไม่มีทางจับได้ ต้องอ่านโค้ด client จริงถึงเจอ

**Root cause**: `getSocket()` เดิมเช็ค `socket.connected` เป็นเงื่อนไขว่า "ต้องสร้างใหม่หรือไม่" — แต่ socket.io connect แบบ async ทำให้ระหว่าง handshake `.connected` เป็น `false` อยู่ชั่วขณะทั้งที่ยังไม่ตาย พอมี component ตัวที่สองเรียก `getSocket()` เข้ามาขณะตัวแรกยัง handshake ไม่จบ โค้ดเดิมตีความผิดว่า "ตายแล้ว" แล้ว `disconnect()` ทิ้งไปสร้างใหม่ — เกิดซ้ำแบบนี้ทุกครั้งที่มี component ใหม่มาเรียก ทำให้ component แรกๆถือ socket ที่ตายไปแล้วก่อนเชื่อมต่อสำเร็จด้วยซ้ำ (listener ไม่ทำงาน) ส่วน server เห็นแค่ตัวสุดท้าย รายละเอียดเต็มดู README_ปัญหาและวิธีแก้.md ปัญหา 19

**วิธีแก้** (commit `9013e25`, deploy ขึ้น Vercel production แล้ว, verify ด้วย `Age` header ว่า deployment สด): เปลี่ยนเงื่อนไข reuse ให้ดูแค่ token เท่านั้น ไม่เช็ค `.connected`

### ไฟล์ที่แก้
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `apps/web/src/lib/socket-client.ts` | `getSocket()` reuse ตาม token เท่านั้น ไม่เช็ค `socket.connected` |

**ฝั่ง API ไม่มีการเปลี่ยนแปลง** — deploy เฉพาะ Vercel (frontend) เท่านั้นในรอบนี้

### บทเรียนสำหรับการทดสอบครั้งต่อไป
Simulation script แบบ 1-socket-per-side ยืนยันได้แค่ **contract ของ server** ถูกต้อง ไม่ยืนยันว่า **client ใช้ contract นั้นถูกด้วย** — เมื่อ symptom ยังอยู่หลัง server ผ่าน test หมดแล้ว ต้องสงสัยฝั่ง client โดยเฉพาะจุดที่มี shared mutable state (เช่น module-level singleton) ที่ถูกเรียกจากหลาย component พร้อมกัน

### สิ่งที่ยังต้องทดสอบจริงบน device (เพิ่มจากรายการเดิมด้านบน)
- **tester3/tester4 คู่เดิม**: เสียงต้องเชื่อมได้ปกติทุกครั้ง + หน้าสรุปผลต้องตรวจจับการออกจากสายถูกต้อง (อาการเดิมที่รายงานเฉพาะบัญชีนี้ควรหายไปหลัง fix นี้)
- **Login ซ้ำระหว่างเล่นเกม (ซ้ำการทดสอบเดิม)**: ต้องยืนยันว่า user เดิมถูกบังคับออกไปหน้า login **ทุกครั้ง** ไม่ใช่แค่บางครั้ง — เพราะ fix นี้แก้ที่ต้นตอของความไม่แน่นอน (race) ไม่ใช่แค่ปิดช่องโหว่เฉพาะเคส
