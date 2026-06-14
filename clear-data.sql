-- ════════════════════════════════════════════════════════
-- ClassKru — เคลียร์ข้อมูลทั้งหมด (เก็บ account ครูไว้)
--
-- วิธีใช้:
--   1. เปิด Supabase Dashboard → SQL Editor → New query
--   2. วางทั้งไฟล์นี้ → กด Run
--
-- ลบ: วิชา / นักเรียน / ตารางสอน / การเช็คชื่อ ทั้งหมด (ทุก user)
-- เก็บ: public.users (โปรไฟล์ครู) + auth.users (บัญชี login)
-- ════════════════════════════════════════════════════════

-- TRUNCATE เร็วและ reset ทุกอย่าง — CASCADE ตามลำดับ FK อัตโนมัติ
truncate table
  public.attendance_records,
  public.attendance_sessions,
  public.enrollments,
  public.schedules,
  public.students,
  public.course_sections
restart identity cascade;

-- ตรวจผล — ควรได้ 0 ทุกแถว
select 'course_sections'    as table_name, count(*) from public.course_sections
union all select 'students',          count(*) from public.students
union all select 'enrollments',       count(*) from public.enrollments
union all select 'schedules',         count(*) from public.schedules
union all select 'attendance_sessions', count(*) from public.attendance_sessions
union all select 'attendance_records',  count(*) from public.attendance_records
union all select 'users (เก็บไว้)',     count(*) from public.users;
