# Promjum_v1.3 — บันทึกความคืบหน้า (Checkpoint)

วันที่: 28 กันยายน 2026
โปรเจกต์: Promjum (เดิม SpeakUp) — Next.js frontend + NestJS backend monorepo
ที่ตั้ง: `C:\Users\dadad\Documents\Promjum`
Checkpoint ก่อนหน้า: `Promjum_Prototype_1_3.md`
Git: commit `02e49bb` บน `main` (pushed)

---

## สรุปสถานะปัจจุบัน (ณ จุดหยุดนี้)

### งานที่เสร็จสมบูรณ์ (ครอบคลุม 3 release: v1.1, v1.2, v1.3 — deploy + ตรวจสอบ production แล้วทั้งหมด)

#### v1.1 — เปลี่ยนชื่อ + version badge + จัด modal (commit `6a1979f`)
- เปลี่ยนชื่อเว็บ SpeakUp → **PromJum** ทุกจุด display (ไม่แตะ localStorage key `speakup_login_notice`)
- **Version badge** ขวาล่างทุกหน้า (`APP_VERSION` ใน `apps/web/src/app/layout.tsx` — ต้นทางเดียว) เริ่มที่ v1.1 และ bump ทุกครั้งที่ deploy สิ่งที่ user มองเห็น (ธรรมเนียมถาวร)
- จัด modal จัดการ Quiz ให้กลางจอ + เรียงเป็นระเบียบ (`.modal` margin auto, `.modal-lg` ขยาย 600px + max-height scroll, `.media-edit` card, footer ปุ่มชัดเจน)
- บันทึกเป็น **ปัญหา 36** ใน README_ปัญหาและวิธีแก้.md

#### v1.2 — แก้ quiz ที่แอดมินสร้าง/แก้ ใช้งานจริงพัง 3 จุด (commit `7257af9`, user report)
1. **choices ไม่แสดง**: seed เก็บ `options` เป็น keyed format `[{key:'a',text:'7:00'}]` แต่ admin รุ่นแรกบันทึก string array → สร้าง normalizer กลาง `apps/api/src/shared/quiz-options.util.ts` (`toKeyedOptionsJson` ตอนเขียน, `normalizeQuizOptions`/`optionsAsTexts` ตอนอ่าน) — ข้อมูลเก่าถูกเยียวยาตอนอ่าน ไม่แตะ DB
2. **รูปไม่โหลด + เสียงไม่ดัง**: ไฟล์อัปโหลดถูกเก็บเป็น `/media/<uuid>` (สัมพัทธ์) แต่หน้า practice ใช้ URL ตรงๆ → 404 บนโดเมน Vercel → ย้าย `mediaSrc()` มาเป็น shared helper ใน `apps/web/src/lib/api-client.ts` ใช้ทั้ง practice (รูป+เสียง) และแอดมิน
3. **form ไม่ fill ข้อมูลเดิม**: อาการเดียวกับข้อ 1 (value undefined กลายเป็น uncontrolled)
- บันทึกเป็น **ปัญหา 37**

#### v1.3 — ฟังก์ชัน "จัดการมินิเกม" ใน Admin Panel (commit `02e49bb`) ⭐ งานหลักของ checkpoint นี้
ออกแบบตาม frontend design ใน `Promjum_Folder_Prototype_1/v1.3` — แอดมินจัดชุดคำตอบของเกมทายภาพ (ภาพ 4 รูป/ชุด + เลือก 1 รูปเป็น "ภาพคำตอบ") การเปลี่ยนแปลงมีผลกับ database จริงทันทีเหมือนฟังก์ชันแอดมินอื่น

**การตัดสินใจหลัก — reuse ตารางเดิม**: ไม่สร้างตาราง `MinigameSet` ใหม่ แต่ใช้ `ImageSet`/`GameImage` ที่ gateway สุ่มจาก pool เดียวกันอยู่แล้ว → seed 3 ชุดเดิม (animals-1, places-1, food-1) ใช้ได้ทันที ชุดใหม่เข้า pool เดียวกันโดยไม่ต้องแก้ gateway

1. **คอลัมน์ใหม่ `position`** บน `game_images` (migration `20260929000000_minigame_set_position`) — ให้ลำดับช่อง A–D ของแอดมินนิ่ง backfill ด้วย `ROW_NUMBER() OVER (PARTITION BY image_set_id ORDER BY id ASC)` (uuid ไม่มีลำดับเวลา แต่ไม่กระทบผู้เล่นเพราะ gateway สุ่มสลับภาพให้คนทายอยู่แล้ว)
2. **API** `/admin/minigame-sets` — GET / POST (ต้องแนบไฟล์ครบ 4 ไฟล์ตามลำดับ A–D, `FilesInterceptor('images', 4)`) / PATCH / DELETE (transaction ลบ GameImage ก่อนแล้วค่อยลบ ImageSet)
   - **PATCH contract**: ส่งเฉพาะไฟล์ที่เปลี่ยน + field `slots` (JSON array 4 ตัว: `""` = ช่องถูกแทนด้วยไฟล์ใหม่ / URL เดิม = คงไว้) — หลีกเลี่ยงการอัปโหลดซ้ำไฟล์ที่ไม่ได้แก้
3. **หน้า admin** `/admin/minigame` — list แถวละชุด (thumbnail A–D + ป้าย "คำตอบ" + check mark), modal grid 2×2 กดเลือกไฟล์ทีละช่อง + radio เลือกภาพคำตอบ + พรีวิว "คนอธิบายจะเห็นอะไร", ObjectURL revoke ทันทีที่เปลี่ยน/ปิด modal, ปุ่มเพิ่ม/แก้ไข/ลบ (confirm dialog) + toast — เพิ่มใน admin nav + dashboard panel ที่ 3
4. **รูปที่แอดมินอัปโหลดโชว์ในเกมได้** — ไฟล์ใหม่เป็น `/media/<uuid>` → ใช้ `mediaSrc()` ทั้งฝั่งคนทายและคนอธิบายใน `game/[matchId]/page.tsx` (seed เป็น full URL อยู่แล้ว ไม่กระทบ)
5. **ความปลอดภัยที่คงไว้**: ไม่เคยส่ง correctIndex/คำตอบไปให้ client ฝั่งคนทาย, แมตช์ที่กำลังเล่นไม่กระทบจากการลบชุด (runtime snapshot ภาพไว้แล้ว)
- บันทึกเป็น **ปัญหา 38**

### การ deploy (สำเร็จครบ + ยืนยันแล้ว)
- `git push` (`7257af9..02e49bb`) — *permission classifier ของโมเดลล่มบ่อยในรอบนี้ ผู้ใช้รันคำสั่งผ่าน `!` prefix แทนตลอด*
- **Backend (Railway)**: deployment `a09d742f` SUCCESS — migration `20260929000000` apply อัตโนมัติผ่าน `prisma migrate deploy` ตอน start
- **Frontend (Vercel)**: READY, aliased `https://web-woad-two-58zkxybk8s.vercel.app`
- ยืนยัน production: badge **v1.3** ขึ้นจริง, route `/admin/minigame` ตอบ 200, `GET /admin/minigame-sets` ไม่มี token ตอบ **403** (= route live + AdminGuard ทำงาน)

### บทเรียนเชิงเทคนิครอบนี้
- **`react-hooks/set-state-in-effect`** (กฎใหม่ของ React): ห้ามเรียก setState แบบ sync ใน body ของ useEffect — pattern แก้: ย้าย setState ไปอยู่ใน `.then`/`.catch` callback หรือใช้ `reloadKey` counter สำหรับ "โหลดซ้ำ" (หน้า minigame ใช้วิธีนี้), ส่วน login page ใช้ eslint-disable พร้อมเหตุผล
- Prisma Json column: interface ไม่มี index signature สำหรับ `InputJsonValue` → แก้ด้วย `JSON.parse(JSON.stringify(...))` round-trip cast (`toKeyedOptionsJson`)
- Here-string ของ PowerShell โดนแตกเป็น argument ถ้ามี `/` นำหน้า (เช่น path `/admin`) → commit message ยาวใช้ไฟล์ + `git commit -F` แทน

---

## วิธี rollback กลับมาที่จุดนี้

```powershell
cd C:\Users\dadad\Documents\Promjum
git checkout 02e49bb          # ดูโค้ดอย่างเดียว (detached HEAD)
# หรือกลับมาทำงานต่อ:
git checkout main             # (main ปัจจุบัน = 02e49bb)
# ย้อนกลับไปก่อน v1.3 (จุด rollback ของรอบนี้):
git checkout 7257af9          # = v1.2
```
Rollback production แยกจากโค้ด: ต้อง push commit ที่ต้องการกลับขึ้น GitHub แล้ว deploy ใหม่ — **ระวัง: migration `20260929000000` ที่ apply แล้วไม่ย้อนกลับเอง** ถ้า rollback ข้ามมันต้องเขียน migration ย้อนกลับเอง (DropColumn position) หรือทิ้งไว้ก็ได้เพราะ `@default(0)` ไม่ทำให้โค้ดเก่าพัง

---

## งานที่ค้าง (ทำต่อในครั้งหน้า)

1. **ทดสอบ e2e บนอุปกรณ์จริง** (สำคัญที่สุด):
   - หน้า `/admin/minigame`: เพิ่มชุดใหม่ → เล่นเกมจริงต้องสุ่มเจอชุดใหม่ + รูปแสดงทั้งฝั่งคนทาย/คนอธิบาย; แก้ไขเฉพาะบางช่อง (PATCH slots) → ยืนยันว่าช่องที่ไม่แก้ค่าเดิม; ลบชุด → แมตช์ที่เล่นอยู่ไม่พัง แต่แมตช์ใหม่ไม่เจออีก
   - รายการ device-test เดิมทั้งหมดจาก checkpoint 1_3 (voice PC↔Mobile, tester3/tester4, refresh กลางแมตช์, duplicate-login kick)
2. **Google OAuth**: โค้ดพร้อมแต่ยังไม่มี credentials จริง
3. **Scratch files ที่ root ยังไม่ tracked**: `.git-commit-msg.txt`, `PromjumResume*.txt`, `Promjum_Problem_*.txt`, `adminPanel_Design_Prompt.txt`, `test-midmatch-duplogin.js`, `Promjum_Prototype_1_*.md`, `Promjum_v1.3.md`, `Promjum_Folder_Prototype_1.zip` + `Promjum_Folder_Prototype_1/` — ควรตัดสินใจเก็บ/ลบ/ย้าย
4. **Housekeeping (ไม่ด่วน)**: OpenSSL line ใน Dockerfile, `railway config migrate` (ก่อน 2026-12-01), ลบ Vercel project หลอก `api` ถ้ายังค้าง, lint debt 25 จุดใน `realtime.gateway.ts` (unsafe-member-access เดิม)
5. **eslint pre-existing**: `game/[matchId]/summary/page.tsx:58` มี error `react-hooks/set-state-in-effect` เหมือนกันแต่เป็นของเดิม (ไม่ได้แก้ในรอบนี้เพราะไม่เกี่ยวกับ v1.3) — ควรแก้ในรอบถัดไปก่อนจะไปกันใหญ่
