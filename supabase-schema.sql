-- ════════════════════════════════════════════
-- ClassKru — Supabase Schema v1
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query
--          วางทั้งไฟล์นี้ → กด Run
-- ════════════════════════════════════════════

-- ── 1. ตารางเช็คชื่อ ──
-- scope = periodId (เช่น 'thu_m11_hlt_0940') หรือ classId (เช่น 'm31' — backward compat)
create table if not exists public.attendance (
  scope      text    not null,
  date_key   text    not null,            -- 'YYYY-MM-DD'
  student_id integer not null,
  status     text    not null check (status in ('present','late','absent','leave')),
  note       text    not null default '',
  updated_at timestamptz not null default now(),
  primary key (scope, date_key, student_id)
);

-- ── 2. ตารางคะแนน ──
create table if not exists public.scores (
  class_id      text    not null,
  student_id    integer not null,
  assignment_id text    not null,
  score         integer,                  -- null = ยังไม่ส่งงาน
  updated_at    timestamptz not null default now(),
  primary key (class_id, student_id, assignment_id)
);

-- ── 3. Row Level Security ──
-- MVP: เปิดให้ anon อ่าน/เขียนได้ (ครูคนเดียว ยังไม่มี login)
-- ⚠️ ก่อนใช้กับข้อมูลนักเรียนจริง ต้องเพิ่ม Supabase Auth แล้วแก้ policy
alter table public.attendance enable row level security;
alter table public.scores     enable row level security;

drop policy if exists "mvp_all_attendance" on public.attendance;
create policy "mvp_all_attendance" on public.attendance
  for all using (true) with check (true);

drop policy if exists "mvp_all_scores" on public.scores;
create policy "mvp_all_scores" on public.scores
  for all using (true) with check (true);
