# SpeakUp — Frontend Design Spec & Build Prompt (Prototype v1)

> เอกสารนี้ใช้เป็น **prompt/context สำหรับ AI agent หรือ developer** ที่จะพัฒนา Frontend จริง (Next.js + TypeScript + Tailwind ตาม `developer-manual.md`)
> Prototype อ้างอิง: `index.html` (สารบัญ) และไฟล์หน้าจอแต่ละหน้า · Token/Component กลางอยู่ที่ `assets/app.css`

---

## 1. Prompt สำเร็จรูป (คัดลอกไปใช้ได้เลย)

```text
You are building the frontend of "SpeakUp", a Thai-first English speaking practice web app
for kids and teenagers (approx. 10–18 years old). Stack: Next.js App Router + TypeScript +
Tailwind CSS + Zustand + TanStack Query. Deploy target: Vercel.

SCOPE — implement ONLY these screens and features (do not add anything else):
  /(auth)/login, /(auth)/register, /(auth)/verify-email
  /practice/select, /practice/[sessionId]
  /game/lobby, /game/[matchId], /game/[matchId]/summary
No streaks, XP, leaderboards, profile pages, settings pages, dark mode, notifications,
chat, or social features. If something seems missing, ask — do not invent it.

VISUAL LANGUAGE — "bright, friendly, tactile, clean":
  - Clean cool-neutral background (not cream/beige), white cards, one teal primary,
    one sunny yellow for game/reward moments, 4 soft category tints.
  - Signature flourish (use it everywhere, nothing else decorative): "chunky press" —
    buttons and selectable tiles have a solid 4px bottom shadow in a darker shade and
    move down 3px when pressed.
  - Big rounded radii (14–24px), bold simple layout, one main action per screen.
  - Monoline SVG icons (1.8px stroke, currentColor). No emoji as icons. No gradients
    as decoration. No illustrated people.
  - All UI copy in Thai; English only for the practice sentences and speaking tips.

Follow the design tokens, components, and screen specs in design-prompt.md exactly.
Mobile-first; every tap target ≥ 44px; WCAG AA contrast; visible :focus-visible ring.
The server owns quiz answers, correct game image, and game timing — the client only renders.
```

---

## 2. หลักการออกแบบ (Design Principles)

| # | หลักการ | นำไปใช้ยังไง |
|---|---|---|
| 1 | **หนึ่งหน้าจอ = หนึ่งงาน** | ทุกหน้ามีปุ่มหลัก (สีเขียวอมฟ้า) ได้ **แค่ 1 ปุ่ม** ปุ่มอื่นเป็น secondary / ghost / link |
| 2 | **สัมผัสได้ (Tactile)** | ปุ่มและการ์ดที่เลือกได้ใช้ "chunky press" เงาทึบด้านล่าง 4px กดแล้วยุบลง 3px — เป็นลูกเล่นเดียวของทั้งระบบ |
| 3 | **สดใสแต่ไม่รก** | พื้นหลังกลาง ๆ สีเย็น 70–90% ของหน้าจอ, สีหลัก (accent) โผล่ไม่เกิน 2 จุดต่อหน้าจอ |
| 4 | **Focus mode ตอนเรียน/เล่น** | หน้าฝึกพูดและหน้าเกม **ซ่อนเมนูหลัก** เหลือแค่ปุ่มออก (X) + แถบความคืบหน้า + ปุ่ม action ติดขอบล่าง |
| 5 | **Thumb-first** | ปุ่มหลักติดด้านล่างจอบนมือถือ, สูง ≥ 52px, เต็มความกว้าง |
| 6 | **บอกสถานะชัดเสมอ** | ทุก flow มีสถานะ: ว่าง → กำลังโหลด → สำเร็จ / ผิดพลาด ใช้สี + ไอคอน + ข้อความ (ไม่ใช้สีอย่างเดียว) |
| 7 | **ภาษาเป็นกันเอง** | ข้อความไทยสั้น พูดเหมือนเพื่อน เช่น "กรอกชื่อผู้ใช้ก่อนนะ", "ไม่เป็นไร รอบหน้าเอาใหม่" |
| 8 | **ไม่เพิ่มฟีเจอร์เอง** | ทุกองค์ประกอบต้องย้อนกลับไปหา requirement ใน developer-manual.md ได้ |
| 9 | **ความปลอดภัยสะท้อนใน UI** | ฝั่งคนทายไม่เห็นว่าภาพไหนถูกจนกว่า server ตอบ, เวลาแสดงผลเป็นแค่ตัวช่วยดู (server นับจริง), มีข้อความบอกว่าเสียงไม่ถูกบันทึก |

---

## 3. Design Tokens

### 3.1 สี (ใช้ `oklch()` ทั้งหมด — map เข้า `tailwind.config` เป็น CSS variables)

| Token | ค่า | ใช้กับ |
|---|---|---|
| `--bg` | `oklch(98% 0.004 240)` | พื้นหลังหน้า |
| `--surface` | `oklch(100% 0 0)` | การ์ด, input, ปุ่ม secondary |
| `--surface-2` | `oklch(96.5% 0.005 240)` | hover, กล่องรอง |
| `--surface-3` | `oklch(93.5% 0.007 240)` | track ของ progress, placeholder ภาพ |
| `--fg` | `oklch(20% 0.02 240)` | ข้อความหลัก |
| `--muted` | `oklch(50% 0.018 240)` | ข้อความรอง (คอนทราสต์ ≥ 4.5:1 บน bg) |
| `--border` | `oklch(90% 0.006 240)` | เส้นขอบ + เงา press ของปุ่ม secondary |
| `--accent` | `oklch(56% 0.12 170)` | สีแบรนด์ teal (ใช้กับ fill ที่ไม่มีตัวอักษร) |
| `--accent-strong` | `oklch(50% 0.12 170)` | พื้นปุ่มหลัก (ตัวอักษรขาวผ่าน 4.5:1) |
| `--accent-hover` | `oklch(44% 0.11 170)` | hover ปุ่มหลัก (เข้มขึ้น ไม่ใช่จางลง) |
| `--accent-shade` | `oklch(38% 0.09 170)` | เงา press ของปุ่มหลัก |
| `--accent-soft` | `oklch(95.5% 0.035 170)` | พื้นการ์ดที่ถูกเลือก, badge "ประโยคใหม่" |
| `--sun` / `--sun-shade` / `--sun-soft` | `oklch(87% 0.15 88)` / `oklch(72% 0.14 75)` / `oklch(96.5% 0.05 90)` | **เฉพาะช่วงเกมและรางวัล** (ถ้วย, เจอคู่, แถบรอบ) ตัวอักษรบน `--sun` ใช้ `--fg` เสมอ |
| `--success` / `--success-soft` | `oklch(52% 0.13 150)` / `oklch(95.5% 0.05 150)` | ตอบถูก, เชื่อมต่อแล้ว, เวลาเหลือเยอะ |
| `--danger` / `--danger-soft` | `oklch(52% 0.18 25)` / `oklch(96% 0.035 25)` | ตอบผิด, error, เวลาใกล้หมด (≤ 8 วิ), ปิดไมค์ |

**สีประจำหมวด** (พื้น soft + ตัวอักษร/ไอคอนเข้ม — ใช้กับไอคอนหมวดและ placeholder ภาพ):

| หมวด | พื้น | ink | ไอคอน |
|---|---|---|---|
| ชีวิตประจำวัน | `oklch(95% 0.055 90)` | `oklch(45% 0.1 70)` | sun |
| ท่องเที่ยว | `oklch(95% 0.04 230)` | `oklch(45% 0.12 240)` | plane |
| ธุรกิจ | `oklch(95% 0.035 300)` | `oklch(45% 0.12 300)` | briefcase |
| ทนาย | `oklch(95% 0.04 35)` | `oklch(48% 0.14 35)` | scale |

### 3.2 ตัวอักษร

| บทบาท | Font stack | ขนาด / line-height |
|---|---|---|
| Display (หัวข้อ, ปุ่ม, ตัวเลขคะแนน, ประโยคภาษาอังกฤษ) | `'Söhne', 'Avenir Next', 'Mitr', system-ui` | H1 26–36px / 1.35 · H2 21–26px · ตัวเลขใหญ่ 64–72px / 1.05 |
| Body (เนื้อหา, ฟอร์ม) | `-apple-system, 'SF Pro Text', 'Noto Sans Thai', system-ui` | 16px / 1.7 · small 14px / 1.6 · caption 12.5px |

- ภาษาไทยใช้ line-height ≥ 1.35 สำหรับหัวข้อ และ ≥ 1.7 สำหรับเนื้อหา — **ห้ามใส่ letter-spacing ติดลบกับข้อความไทย**
- ประโยคฝึก EN: display 26–34px weight 600 letter-spacing -0.01em · คำแปล TH: 18px สี `--muted`
- ใช้ 3 น้ำหนัก: 400 / 500 / 600 เท่านั้น
- ตัวเลขที่เปลี่ยนค่า (เวลา, คะแนน) ใส่ `font-variant-numeric: tabular-nums`

### 3.3 ขนาด / มุม / เงา

- Radius: `10 / 14 / 18 / 24px` (sm / md ปุ่ม+input / lg tile / xl การ์ดใหญ่), pill = 999px
- Spacing: ฐาน 4px — ใช้ 8, 12, 16, 20, 24, 28, 32, 40
- Container: max 1080px (หน้าทั่วไป), 640–880px (ฟอร์ม/ฝึกพูด/สรุป), padding ข้าง 20px
- Card shadow: `0 1px 2px fg/5%, 0 8px 24px -12px fg/14%` — ใช้กับการ์ดหลักเท่านั้น
- Breakpoint หลัก: 560 / 720 / 860 / 900px

---

## 4. Components (ดูของจริงใน `assets/app.css`)

| Component | สเปก |
|---|---|
| **Button primary** | สูง 52px, radius 14, พื้น `--accent-strong`, ตัวขาว, `box-shadow: 0 4px 0 --accent-shade`; hover → `--accent-hover`; active → `translateY(3px)` + เงา 1px; disabled → พื้น `--surface-3` ตัว muted |
| **Button secondary** | พื้นขาว, ขอบ 2px `--border`, เงา press สี border; hover → `--surface-2` |
| **Button sun** | (สำรองไว้สำหรับช่วงเกม) พื้น `--sun`, ตัว `--fg` |
| **Ghost / icon button** | 44–48px สี่เหลี่ยมมุมมน ใช้กับปุ่มออก (X), logout, แสดงรหัสผ่าน |
| **Choice tile** (radio ที่ดูเป็นการ์ด) | ขอบ 2px + เงา press; checked → ขอบและเงา `--accent-strong`, พื้น `--accent-soft`, วงกลมติ๊กถูกด้านขวา; disabled → พื้นเทา ไม่มีเงา พร้อมเหตุผลเป็นข้อความ |
| **Input** | สูง 52px, ขอบ 2px; focus → ขอบ accent + ring soft 4px; error → ขอบ danger + ข้อความใต้ช่อง |
| **Badge** | pill สูง 28px: `ประโยคใหม่` (accent-soft), `ทบทวน` (ม่วงอ่อน), `Quiz` (sun-soft), success, danger |
| **Segmented progress** | แท่งแบ่งตามจำนวนประโยค/รอบ: เสร็จ = success (ฝึกพูด) หรือ sun-shade (เกม), ปัจจุบัน = `--fg`, ยังไม่ถึง = surface-3 |
| **Timer bar** | สูง 12px เต็มกว้าง ลดจากเต็มไปศูนย์ใน 30 วิ, เขียว → แดงเมื่อ ≤ 8 วิ + ตัวเลขวินาทีด้านขวา |
| **Image placeholder** `.ph-img` | อัตราส่วน 4:3 (ฝึกพูด) / 1:1 (เกม), พื้นสีหมวด + ไอคอนภาพ + คำอธิบาย — แทนที่ด้วยภาพจริงจาก Cloudflare R2 |
| **Notice** | กล่องแจ้งเตือนเต็มพื้น (ไม่มีแถบสีด้านซ้าย) ไอคอน + ข้อความ: warn / danger / success |
| **Nav** | Desktop: top bar sticky (logo, ฝึกพูด, มินิเกม, avatar, logout) · Mobile: bottom tab bar 2 แท็บ สูง 68px · หน้า Focus ไม่มีเมนู |
| **Dialog** | ใช้ `<dialog>` สำหรับยืนยันออกจากเกม ปุ่ม "เล่นต่อ" (secondary) + "ออกจากเกม" (danger) |

**Interaction rules**
- hover: เปลี่ยนพื้นหลัง ±0.06–0.12 L หรือขอบ **ห้ามทำให้ตัวอักษรจางลง**
- ทุก element ที่โฟกัสได้มี `:focus-visible` outline 3px สี `oklch(45% 0.12 170)` offset 3px
- Animation: `pop` (scale .96→1, 220ms) ตอนเปลี่ยนขั้น, pulse ring ตอนเล่นเสียง/หาคู่, count-up คะแนน — ปิดทั้งหมดเมื่อ `prefers-reduced-motion`

---

## 5. สเปกรายหน้าจอ

### 5.1 Login `/(auth)/login` — `login.html`
- Desktop: แบ่ง 2 คอลัมน์ — ซ้ายเป็น panel สีแบรนด์ (teal) มีหัวข้อ + บทสนทนาตัวอย่าง 2 ฟองคำพูด (EN + คำแปล) · ขวาเป็นฟอร์ม · Mobile: เหลือแค่ฟอร์ม + โลโก้ด้านบน
- ลำดับ: หัวข้อ → ปุ่ม "ดำเนินการต่อด้วย Google" (secondary) → เส้นคั่น → ชื่อผู้ใช้ → รหัสผ่าน (ปุ่มแสดง/ซ่อน) → กล่อง error (ซ่อนไว้) → ปุ่ม "เข้าสู่ระบบ" (primary) → ลิงก์ไปสมัคร
- Validation เฉพาะช่องว่าง; error จาก server แสดงในกล่อง notice-danger

### 5.2 Register `/(auth)/register` — `register.html`
- โครงเดียวกับ login · ช่อง: ชื่อผู้ใช้ (≥ 3), อีเมล (รูปแบบถูก, hint "จะส่งลิงก์ยืนยัน"), รหัสผ่าน (≥ 8)
- ใต้ปุ่ม Google มี caption "สมัครด้วย Google ไม่ต้องยืนยันอีเมลซ้ำ"
- สำเร็จ → ไปหน้า verify-email พร้อมอีเมลที่กรอก

### 5.3 Verify email `/(auth)/verify-email` — `verify-email.html`
- การ์ดกลางจอ 2 สถานะ: **ส่งแล้ว** (ไอคอนซองจดหมาย, แสดงอีเมลใน pill, ปุ่ม "ส่งอีเมลอีกครั้ง" มี cooldown 60 วิ) และ **ยืนยันสำเร็จ** (มี `?token=`, ไอคอนถูกสีเขียว, ปุ่ม primary "เริ่มฝึกพูด")

### 5.4 Practice select `/practice/select` — `practice-select.html`
- 3 ขั้นที่มีเลขกำกับ: **1 เลือกหมวด** (4 tile, มือถือ 2×2 / desktop 4 คอลัมน์) → **2 ฝึกแบบไหน** ("ประโยคใหม่ทั้งหมด" / "ใหม่ + ทบทวนของเก่า") → **3 จำนวนประโยค** (2 / 3)
- tile จำนวนประโยคแสดง badge สัดส่วนตาม rule: 3 = ใหม่ 2 · ทบทวน 1, 2 = ใหม่ 1 · ทบทวน 1 (โหมดใหม่ทั้งหมด = ใหม่ทั้งหมด)
- ถ้าหมวดนั้นยังไม่มีประโยคที่ฝึกจบ → tile "ใหม่ + ทบทวน" disabled พร้อมเหตุผล
- Action bar ติดล่าง: สรุป "หมวด · จำนวน" + "ใหม่ x · ทบทวน y" + ปุ่ม primary "เริ่มฝึก"
- หมายเหตุใต้ขั้น 3: ประโยคนับว่าฝึกจบเมื่อทำ Quiz เสร็จเท่านั้น

### 5.5 Practice session `/practice/[sessionId]` — `practice-session.html` (Focus mode)
- Header: ปุ่ม X · segmented progress · "1 / 3"
- วนต่อประโยค 3 ขั้น:
  1. **อ่าน** — badge (ประโยคใหม่/ทบทวน + หมวด), ภาพ 4:3 เต็มกว้าง, ประโยค EN ตัวใหญ่, คำแปล TH → ปุ่ม "ถัดไป · ฟังเสียง"
  2. **ฟัง** — ภาพย่อเหลือ max 320px + ปุ่มลำโพงใหญ่ 112px (primary, pulse ring ตอนเล่น) + hint → ปุ่มย้อนกลับ (secondary icon) + "ไปทำ Quiz"
  3. **Quiz** — กล่องอ้างอิง (ภาพเล็ก + ประโยค), คำถาม, 4 ตัวเลือกปุ่มใหญ่ A–D → "ตรวจคำตอบ" (disabled จนกว่าจะเลือก) → แถบ feedback ถูก (เขียว) / ผิด (แดง + เฉลย) → "ประโยคถัดไป" / "จบรอบฝึก"
- **จบรอบ**: ถ้วยพื้น sun, "ฝึกครบ N ประโยคแล้ว!", จำนวนตอบถูก, รายการประโยคทั้งหมด → "เล่นมินิเกม" (secondary) + "ฝึกอีกรอบ" (primary)

### 5.6 Game lobby `/game/lobby` — `game-lobby.html`
- Desktop 2 คอลัมน์ (7:5) · ซ้าย = panel สถานะ · ขวา = การ์ด "คิดคะแนนยังไง?" (ตารางกติกา + กราฟพื้นที่คะแนนลดตามเวลา 100 → ขั้นต่ำ 10)
- Panel มี 4 สถานะ:
  1. **idle** — badge "เล่นกับเพื่อนแบบสด 2 คน", หัวข้อ, วิธีเล่น 3 ข้อ, ปุ่ม "เริ่มหาคู่เล่น", caption เรื่องไมค์และไม่บันทึกเสียง
  2. **ขอสิทธิ์ไมค์** — อธิบายก่อนเรียก permission ของเบราว์เซอร์; ถ้าถูกปฏิเสธแสดง notice-warn วิธีเปิดสิทธิ์
  3. **กำลังหาคู่** — วงกลม pulse พื้น sun, ตัวจับเวลา m:ss, ปุ่มยกเลิก, caption เรื่อง cold start ("ครั้งแรกของวันอาจใช้เวลานานขึ้น")
  4. **เจอคู่แล้ว** — avatar ทั้งสองฝั่ง + นับถอยหลัง 3 วิ ก่อนเข้าเกม

### 5.7 Game match `/game/[matchId]` — `game-match.html` (Focus mode)
- Header: ปุ่ม X (เปิด dialog ยืนยัน) · ผู้เล่นซ้าย (คุณ) / ขวา (เพื่อน) พร้อมบทบาท · ผู้ที่กำลังพูดมีวงแหวนเขียวรอบ avatar · "รอบ n / 4" + แท่ง 4 รอบ
- **คนทาย**: หัวข้อ "ฟังเพื่อนอธิบาย แล้วเลือกภาพที่ใช่" + timer bar + grid 2×2 ภาพสี่เหลี่ยมจัตุรัสมี key A–D · กดแล้วล็อกทุกภาพ แสดงถูก (ขอบเขียว) / ผิด (ขอบแดง) หลัง server ตอบ
- **คนอธิบาย**: หัวข้อ "อธิบายภาพนี้เป็นภาษาอังกฤษ" + timer + ภาพเป้าหมายใหญ่ (ขอบ sun) + "มีแค่คุณที่เห็นภาพนี้" + chip ช่วยพูด (`It's a…`, `The color is…`, `It's next to…`) + สถานะ "รอเพื่อนเลือกคำตอบ…"
- **ผลรอบ**: การ์ดกลาง ไอคอนถูก/ผิด/หมดเวลา, "+คะแนน" ตัวใหญ่ 64px, คะแนนรวม / 400, บทบาทรอบถัดไป
- Footer ติดล่าง: ปุ่มไมค์ toggle (เปิด = ขาว / ปิด = danger-soft + ไอคอน mic-off) + สถานะ "เชื่อมต่อเสียงแล้ว" (จุดเขียว)

### 5.8 Game summary `/game/[matchId]/summary` — `game-summary.html`
- การ์ดคะแนนรวม: ถ้วย sun, "คะแนนรวมของทีม", ตัวเลข 72px count-up + "/ 400", ข้อความให้กำลังใจตามช่วงคะแนน, avatar คู่
- รายการ 4 รอบ: เลขรอบ · ผล + บทบาท · แท่งคะแนน (sun-shade) · คะแนน
- ปุ่ม: "กลับไปฝึกพูด" (secondary) + "เล่นอีกรอบ" (primary)

---

## 6. Responsive
- Mobile-first ตั้งแต่ 360px ไม่มี horizontal scroll
- < 860px: bottom tab bar (ฝึกพูด / มินิเกม), ปุ่มหลักติดขอบล่าง / action bar ลอยเหนือ tab bar
- ≥ 860px: top nav, action bar ติดล่างของคอนเทนต์, auth แบ่ง 2 คอลัมน์ที่ ≥ 900px
- หน้า focus (practice session, game match) ใช้คอลัมน์เดียวกว้างสุด 640–760px ทุกขนาดจอ

## 7. Accessibility checklist
- ข้อความปกติ ≥ 4.5:1, ข้อความใหญ่/ไอคอน ≥ 3:1 · ห้ามวางตัวขาวบน `--sun`
- ถูก/ผิดสื่อด้วย **สี + ไอคอน + ข้อความ** เสมอ
- Radio group ใช้ `role="radiogroup"` / `aria-checked`, ปุ่มไอคอนมี `aria-label`, พื้นที่ที่เปลี่ยนสถานะใช้ `aria-live="polite"`
- `lang="en"` บนประโยคภาษาอังกฤษ เพื่อ screen reader อ่านถูกภาษา
- Touch target ≥ 44px, ปุ่มหลัก 52px

## 8. สิ่งที่ห้ามทำ (Don'ts)
- ห้ามเพิ่มฟีเจอร์นอก developer-manual.md (streak, XP, leaderboard, โปรไฟล์, ตั้งค่า, dark mode ฯลฯ)
- ห้ามมีปุ่ม primary มากกว่า 1 ปุ่มในหน้าจอเดียว
- ห้ามใช้ emoji เป็นไอคอน, gradient ตกแต่ง, พื้นหลังครีม/เบจ, การ์ดขอบซ้ายสี
- ห้ามแสดงคำตอบที่ถูกของเกม/Quiz ใน client ก่อน server ตอบ
- ห้ามเก็บ access token ใน localStorage (ตาม Security Checklist)

## 9. Open items สำหรับ iteration ถัดไป
- ภาพประกอบจริงของประโยคและชุดภาพเกม (ตอนนี้ใช้ placeholder สีหมวด)
- ยืนยันฟอนต์ display (Söhne ต้องมี license — fallback ปัจจุบันคือ Avenir Next / Mitr สำหรับภาษาไทย)
- หน้าจอ error กลาง (เช่น เชื่อมต่อเสียงไม่สำเร็จ, เพื่อนหลุดกลางเกม) ยังไม่ได้ออกแบบ — ต้องการ requirement เพิ่มก่อน
- สเปกเนื้อหา Quiz (รูปแบบคำถาม) ยังเป็นตัวอย่าง รอข้อมูลจริงจากทีมเนื้อหา
