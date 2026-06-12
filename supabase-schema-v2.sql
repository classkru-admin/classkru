-- ════════════════════════════════════════════════════════
-- ClassKru — Supabase Schema v2
-- Multi-teacher, Course-Section based attendance
--
-- วิธีใช้:
--   1. เปิด Supabase Dashboard → SQL Editor → New query
--   2. วางทั้งไฟล์นี้ → กด Run
--   3. ไปที่ Authentication → Enable Email provider
-- ════════════════════════════════════════════════════════

-- ── CLEANUP (run ถ้าต้องการ reset) ──
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- ────────────────────────────────────────
-- 1. USERS (teacher profiles)
--    auth.users สร้างโดย Supabase Auth อัตโนมัติ
--    ตารางนี้เก็บข้อมูลเพิ่มเติมของครู
-- ────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  display_name  text not null default '',
  school_name   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ────────────────────────────────────────
-- 2. COURSE_SECTIONS (core entity)
--    แต่ละรายวิชา-ห้องเรียน = 1 section
--    เช่น สุขศึกษา ม.1/1 ≠ สุขศึกษา ม.2/1
-- ────────────────────────────────────────
create table if not exists public.course_sections (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.users(id) on delete cascade,
  subject_name    text not null,      -- เช่น 'สุขศึกษา'
  grade_level     text not null,      -- เช่น 'ม.1', 'ป.6'
  room            text not null,      -- เช่น '1', '2'
  academic_year   text not null,      -- เช่น '2569'
  semester        integer not null default 1 check (semester in (1,2)),
  student_count   integer not null default 0,
  color           text not null default '#1d9e75', -- dot color
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- unique per teacher per academic context
  unique (teacher_id, subject_name, grade_level, room, academic_year, semester)
);

-- derived display name: subject_name + ' ' + grade_level + '/' + room
-- เช่น 'สุขศึกษา ม.1/1'

-- ────────────────────────────────────────
-- 3. STUDENTS
--    นักเรียนในระบบ (ไม่ผูกกับ teacher โดยตรง)
--    ผูกผ่าน enrollments
-- ────────────────────────────────────────
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.users(id) on delete cascade,
  student_number  integer not null,   -- เลขที่
  first_name      text not null,
  last_name       text not null,
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────
-- 4. ENROLLMENTS
--    ผูก student กับ course_section
--    นักเรียนคนเดียวเรียนได้หลาย section
-- ────────────────────────────────────────
create table if not exists public.enrollments (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students(id) on delete cascade,
  course_section_id   uuid not null references public.course_sections(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (student_id, course_section_id)
);

-- ────────────────────────────────────────
-- 5. SCHEDULES (ตารางสอน)
--    แต่ละ section สอนวันไหน เวลาอะไร
-- ────────────────────────────────────────
create table if not exists public.schedules (
  id                  uuid primary key default gen_random_uuid(),
  teacher_id          uuid not null references public.users(id) on delete cascade,
  course_section_id   uuid not null references public.course_sections(id) on delete cascade,
  weekday             integer not null check (weekday between 1 and 7), -- 1=จันทร์ 7=อาทิตย์
  start_time          time not null,   -- เช่น '08:40:00'
  end_time            time not null,   -- เช่น '09:40:00'
  created_at          timestamptz not null default now()
);

-- ────────────────────────────────────────
-- 6. ATTENDANCE_SESSIONS
--    1 session = ครู 1 คน เช็คชื่อ 1 section 1 วัน
--    ป้องกัน duplicate session
-- ────────────────────────────────────────
create table if not exists public.attendance_sessions (
  id                  uuid primary key default gen_random_uuid(),
  course_section_id   uuid not null references public.course_sections(id) on delete cascade,
  teacher_id          uuid not null references public.users(id) on delete cascade,
  attendance_date     date not null,
  status              text not null default 'pending' check (status in ('pending','completed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (course_section_id, attendance_date)
);

-- ────────────────────────────────────────
-- 7. ATTENDANCE_RECORDS
--    นักเรียนแต่ละคนใน session นั้น
-- ────────────────────────────────────────
create table if not exists public.attendance_records (
  id                      uuid primary key default gen_random_uuid(),
  attendance_session_id   uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id              uuid not null references public.students(id) on delete cascade,
  status                  text not null check (status in ('present','absent','late','leave')),
  note                    text not null default '',
  updated_at              timestamptz not null default now(),
  unique (attendance_session_id, student_id)
);

-- ════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- แต่ละครูเห็นแค่ข้อมูลตัวเอง
-- ════════════════════════════════════════════════════════

alter table public.users              enable row level security;
alter table public.course_sections    enable row level security;
alter table public.students           enable row level security;
alter table public.enrollments        enable row level security;
alter table public.schedules          enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records  enable row level security;

-- users: ครูเห็นแค่ข้อมูลตัวเอง
drop policy if exists "users_own" on public.users;
create policy "users_own" on public.users
  for all using (auth.uid() = id);

-- course_sections: เห็นแค่ section ของตัวเอง
drop policy if exists "sections_own" on public.course_sections;
create policy "sections_own" on public.course_sections
  for all using (auth.uid() = teacher_id);

-- students: เห็นแค่นักเรียนที่ตัวเองสร้าง
drop policy if exists "students_own" on public.students;
create policy "students_own" on public.students
  for all using (auth.uid() = teacher_id);

-- enrollments: เห็น enrollment ของ section ตัวเอง
drop policy if exists "enrollments_own" on public.enrollments;
create policy "enrollments_own" on public.enrollments
  for all using (
    exists (
      select 1 from public.course_sections cs
      where cs.id = course_section_id and cs.teacher_id = auth.uid()
    )
  );

-- schedules: เห็นตารางสอนของตัวเอง
drop policy if exists "schedules_own" on public.schedules;
create policy "schedules_own" on public.schedules
  for all using (auth.uid() = teacher_id);

-- attendance_sessions: เห็น session ของตัวเอง
drop policy if exists "sessions_own" on public.attendance_sessions;
create policy "sessions_own" on public.attendance_sessions
  for all using (auth.uid() = teacher_id);

-- attendance_records: เห็น records ของ session ตัวเอง
drop policy if exists "records_own" on public.attendance_records;
create policy "records_own" on public.attendance_records
  for all using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = attendance_session_id and s.teacher_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════
-- TRIGGERS — auto-update updated_at
-- ════════════════════════════════════════════════════════
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists sections_updated_at on public.course_sections;
create trigger sections_updated_at before update on public.course_sections
  for each row execute function public.set_updated_at();

drop trigger if exists sessions_updated_at on public.attendance_sessions;
create trigger sessions_updated_at before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════
-- TRIGGER — auto-create user profile on signup
-- ════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════
-- INDEXES — performance
-- ════════════════════════════════════════════════════════
create index if not exists idx_sections_teacher on public.course_sections(teacher_id);
create index if not exists idx_students_teacher on public.students(teacher_id);
create index if not exists idx_enrollments_section on public.enrollments(course_section_id);
create index if not exists idx_schedules_teacher_day on public.schedules(teacher_id, weekday);
create index if not exists idx_sessions_section_date on public.attendance_sessions(course_section_id, attendance_date);
create index if not exists idx_records_session on public.attendance_records(attendance_session_id);

-- ════════════════════════════════════════════════════════
-- VIEWS — useful queries
-- ════════════════════════════════════════════════════════

-- view: today's schedule with section info
create or replace view public.today_schedule as
select
  s.id as schedule_id,
  s.teacher_id,
  s.weekday,
  s.start_time,
  s.end_time,
  cs.id as section_id,
  cs.subject_name,
  cs.grade_level,
  cs.room,
  cs.student_count,
  cs.color,
  cs.subject_name || ' ' || cs.grade_level || '/' || cs.room as display_name
from public.schedules s
join public.course_sections cs on cs.id = s.course_section_id
where cs.teacher_id = auth.uid();

-- view: attendance summary per session
create or replace view public.attendance_summary as
select
  sess.id as session_id,
  sess.course_section_id,
  sess.attendance_date,
  sess.status as session_status,
  sess.teacher_id,
  count(*) filter (where r.status = 'present') as present_count,
  count(*) filter (where r.status = 'absent')  as absent_count,
  count(*) filter (where r.status = 'late')    as late_count,
  count(*) filter (where r.status = 'leave')   as leave_count,
  count(*) as total_checked
from public.attendance_sessions sess
left join public.attendance_records r on r.attendance_session_id = sess.id
where sess.teacher_id = auth.uid()
group by sess.id, sess.course_section_id, sess.attendance_date, sess.status, sess.teacher_id;
