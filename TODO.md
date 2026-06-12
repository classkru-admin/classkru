# ClassKru — TODO & Setup Guide
อัพเดทล่าสุด: 13 มิ.ย. 2569

---

## ✅ เสร็จแล้ว (AI ทำไว้ให้ขณะคุณนอน)

- [x] Backup UI ไว้ที่ `classroom-app-backup-YYYYMMDD-HHMM/`
- [x] Fix attendance isolation bug — ทุก function ใน attendance.html ใช้ period-based records แล้ว ไม่มี cross-section leak
- [x] เขียน Supabase Schema v2 (`supabase-schema-v2.sql`) — รองรับหลายครู, multi-section
- [x] สร้าง Login page (`login.html`) — email login พร้อมใช้
- [x] สร้าง `ck-service.js` — Supabase data layer ใหม่ (แทน ck-data.js ในอนาคต)

---

## 🔧 สิ่งที่ต้องทำเอง (User Setup)

### Step 1: Run Schema ใน Supabase

1. เปิด [Supabase Dashboard](https://app.supabase.com)
2. เลือก project `pxjomsfyczfdbmjhaffq`
3. ไปที่ **SQL Editor** → New Query
4. เปิดไฟล์ `supabase-schema-v2.sql` แล้ว copy ทั้งหมด → วางใน SQL Editor
5. กด **Run**
6. ตรวจดูว่า tables ถูกสร้างครบ:
   - users
   - course_sections
   - students
   - enrollments
   - schedules
   - attendance_sessions
   - attendance_records

### Step 2: เปิด Email Auth

1. ใน Supabase Dashboard → **Authentication** → **Providers**
2. เปิด **Email** provider
3. ตั้ง **Confirm email** = OFF (สะดวกสำหรับ dev) หรือ ON (production)

### Step 3: ทดสอบ Login

1. เปิด `login.html`
2. กด "สมัครสมาชิก" → กรอกชื่อ email password → สมัคร
3. Login เข้าระบบ
4. หน้าจะ redirect ไป `index.html`

---

## 🚧 งานที่เหลือ (Next Steps)

### Priority A — ต้องทำก่อน
- [ ] เพิ่ม Auth guard ทุกหน้า (index.html, attendance.html, overview.html)
  - ใส่ `<script src="ck-service.js"></script>`
  - เรียก `CKService.requireAuth()` ตอน init
- [ ] หน้า setup ครั้งแรก — ครูกรอกตารางสอน + upload รายชื่อ
- [ ] Import รายชื่อนักเรียนจาก Excel (Desktop)
  - ใช้ `CKService.importStudentsFromArray(sectionId, students)`

### Priority B — สำคัญแต่รอได้
- [ ] เปลี่ยน attendance.html ให้ใช้ `ck-service.js` แทน `ck-data.js`
  - สำคัญมาก: section id จะเป็น UUID แทน 'm31'
  - ต้อง map `_period.periodId` (schedule uuid) → `_period.classId` (section uuid)
- [ ] overview.html — แก้ให้ดึงจาก Supabase แทน mock history
- [ ] index.html — แก้ให้โหลด schedule จาก Supabase

### Priority C — Features
- [ ] Deploy ขึ้น Vercel
- [ ] Desktop: จัดการ course_sections (เพิ่ม/แก้/ลบ)
- [ ] Desktop: analytics ทั้งเทอม
- [ ] Export PDF/Excel รายงาน
- [ ] Offline support (service worker)

---

## ⚠️ Known Issues / Bugs

### overview.html
- ยังใช้ `s.history[dateKey]` (mock data) ในหลายจุด
- TODO: เปลี่ยนเป็น `CKService.getAttendance(sectionId, dateKey)`
- บรรทัดที่ต้องแก้: 571, 748, 769, 825, 846, 910, 1135, 1226, 1243, 1248, 1290

### attendance.html
- `absCounts()` นับจาก period records แล้ว แต่ถ้า section ใหม่ยังไม่มี data จะขึ้น 0 ทั้งหมด (ถูกต้อง)
- "เช็คย้อนหลัง" ยังแสดงเฉพาะ web desktop

### ck-data.js (legacy)
- ยังใช้อยู่ใน production ขณะนี้
- ให้ migrate ไป ck-service.js ทีละหน้า
- อย่าลบ ck-data.js จนกว่าทุกหน้าจะ migrate ครบ

---

## 📁 ไฟล์ใหม่ที่สร้างไว้

| ไฟล์ | คำอธิบาย |
|------|----------|
| `supabase-schema-v2.sql` | Schema ใหม่ multi-teacher |
| `login.html` | หน้า login/register email |
| `ck-service.js` | Supabase data layer (แทน ck-data.js) |
| `classroom-app-backup-*/` | Backup UI ก่อนแก้ไข |

---

## 🏗️ Architecture Overview

```
Teacher (auth.users)
  └─ course_sections (สุขศึกษา ม.1/1)
       ├─ schedules (จันทร์ 08:40-09:40)
       ├─ enrollments
       │    └─ students (รายชื่อนักเรียน)
       └─ attendance_sessions (วันที่ 12 มิ.ย.)
            └─ attendance_records (มา/ขาด/สาย/ลา)
```

**สำคัญมาก:**
- `course_sections` คือ core entity
- attendance isolated ที่ระดับ `section + date` ไม่มี cross-section leak
- ครูแต่ละคนเห็นแค่ข้อมูลตัวเอง (RLS)

---

## 📞 ถ้าติดปัญหา

1. Supabase RLS block → ตรวจว่า Auth token ถูกส่งใน request
2. login ไม่ได้ → ตรวจ Supabase Auth providers เปิดหรือยัง
3. ข้อมูลไม่ขึ้น → ตรวจ RLS policy ใน Supabase Dashboard → Table Editor → RLS
