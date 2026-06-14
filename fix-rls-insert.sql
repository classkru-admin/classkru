-- ════════════════════════════════════════════════════════
-- ClassKru — เสริม RLS WITH CHECK สำหรับ INSERT
--
-- รันไฟล์นี้ "เฉพาะถ้า" import แล้วเจอ error:
--   "new row violates row-level security policy"
--
-- วิธีใช้: Supabase Dashboard → SQL Editor → วาง → Run
-- ════════════════════════════════════════════════════════

-- students: อนุญาต insert ถ้า teacher_id = ตัวเอง
drop policy if exists "students_own" on public.students;
create policy "students_own" on public.students
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- enrollments: อนุญาต insert ถ้า section เป็นของครูคนนี้
drop policy if exists "enrollments_own" on public.enrollments;
create policy "enrollments_own" on public.enrollments
  for all
  using (
    exists (select 1 from public.course_sections cs
            where cs.id = course_section_id and cs.teacher_id = auth.uid())
  )
  with check (
    exists (select 1 from public.course_sections cs
            where cs.id = course_section_id and cs.teacher_id = auth.uid())
  );

-- course_sections: เผื่อ insert section ก็ติด
drop policy if exists "sections_own" on public.course_sections;
create policy "sections_own" on public.course_sections
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- schedules: เผื่อ insert คาบติด
drop policy if exists "schedules_own" on public.schedules;
create policy "schedules_own" on public.schedules
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

select 'RLS with check เพิ่มแล้ว — ลอง import อีกครั้ง' as result;
