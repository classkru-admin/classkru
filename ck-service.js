/**
 * ClassKru — ck-service.js
 * Supabase data layer v1
 *
 * ใช้แทน ck-data.js เมื่อ backend พร้อม
 * API เหมือนกับ window.CK เดิม — UI ไม่ต้องแก้
 *
 * วิธีใช้:
 *   1. run supabase-schema-v2.sql ใน Supabase ก่อน
 *   2. เพิ่ม <script src="ck-service.js"></script> แทน ck-data.js
 *   3. ตรวจ auth ในทุกหน้า ด้วย CKService.requireAuth()
 */
(function(){

const SUPABASE_URL = 'https://pxjomsfyczfdbmjhaffq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Pjn4kk9obTsNjnavnOBm3Q_d_vlf3z2';

// ── State ──
let sb = null;
let _currentUser = null;
let _sections = [];       // cache course_sections
let _schedules = [];      // cache schedules
let _studentCache = {};   // { sectionId: [students] }
let _attendanceCache = {}; // { 'sectionId|dateKey': records }

// ── Level colors (ใช้เหมือนเดิม) ──
const LEVEL_COLORS = {
  primary: { bg:'#fefce8', icon:'#d99a4e', border:'#fde047', text:'#854d0e' },
  junior:  { bg:'#f0fdf4', icon:'#6cae8f', border:'#86efac', text:'#15803d' },
  senior:  { bg:'#eff6ff', icon:'#7b9bb5', border:'#93c5fd', text:'#1d4ed8' },
  uni:     { bg:'#f5f3ff', icon:'#9d8ec4', border:'#c4b5fd', text:'#6d28d9' },
};

/* ─────────────────────────────────────────
   PASTELIZE — แมปสีสดเก่า → พาสเทลโทนเดียว
   ใช้กับสีไอคอนห้องที่ seed ไว้แล้ว เพื่อไม่ต้องแก้ข้อมูลใน DB
───────────────────────────────────────── */
const PASTEL_MAP = {
  '#ec4899':'#d98a9e','#e91e63':'#d98a9e','#db2777':'#c98aa6','#be185d':'#c98aa6','#f43f5e':'#d98a9e',
  '#22c55e':'#6cae8f','#16a34a':'#6cae8f','#15803d':'#4a9b94','#4caf50':'#6cae8f','#21c55e':'#6cae8f',
  '#3b82f6':'#7b9bb5','#2563eb':'#7b9bb5','#2196f3':'#7b9bb5','#1d4ed8':'#7b9bb5','#0891b2':'#3f8c84','#0369a1':'#7b9bb5',
  '#8b5cf6':'#9d8ec4','#a855f7':'#9d8ec4','#7c3aed':'#9d8ec4','#9c27b0':'#9d8ec4','#6d28d9':'#9d8ec4',
  '#f59e0b':'#d99a4e','#f97316':'#d99a4e','#eab308':'#d99a4e','#ca8a04':'#d99a4e','#ff9800':'#d99a4e','#d97706':'#d99a4e','#c2410c':'#d99a4e','#b45309':'#d99a4e',
  '#ef4444':'#d98a9e','#dc2626':'#d98a9e','#f44336':'#d98a9e','#e11d48':'#d98a9e',
  '#14b8a6':'#4a9b94','#1d9e75':'#4a9b94','#0f6e56':'#3f8c84','#065f46':'#3f8c84',
};
/** แปลงสีไอคอนห้องให้เป็นพาสเทล (รับ hex ใดๆ คืนพาสเทลที่ map ไว้ ถ้าไม่มีคืนค่าเดิม) */
function pastelize(hex){
  if(!hex) return hex;
  return PASTEL_MAP[String(hex).toLowerCase()] || hex;
}

const MAX_ABSENT = 8;
const CLASS_ORDER_GRADE = ['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3','ม.4','ม.5','ม.6'];
const DAYS_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

function fmtKey(d){
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ── Init Supabase ──
function initSupabase(){
  return new Promise((resolve, reject)=>{
    if(sb){ resolve(sb); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = ()=>{
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      resolve(sb);
    };
    script.onerror = ()=> reject(new Error('Supabase load failed'));
    document.head.appendChild(script);
  });
}

// ── Auth ──

/** ดึง session ปัจจุบัน */
async function getSession(){
  await initSupabase();
  const { data:{ session } } = await sb.auth.getSession();
  return session;
}

/** บังคับ login — redirect ถ้าไม่มี session */
async function requireAuth(){
  const session = await getSession();
  if(!session){
    location.href = 'login.html';
    return null;
  }
  _currentUser = session.user;
  return session.user;
}

/** logout */
async function signOut(){
  await initSupabase();
  await sb.auth.signOut();
  location.href = 'login.html';
}

/** current user */
function getCurrentUser(){ return _currentUser; }

// ── Course Sections ──

/** โหลด sections ทั้งหมดของครูคนนี้ */
async function loadSections(){
  if(!sb || !_currentUser) return [];
  const { data, error } = await sb
    .from('course_sections')
    .select('*')
    .order('grade_level').order('room');
  if(error){ console.error('loadSections:', error); return []; }
  _sections = (data||[]).map(normSection);
  return _sections;
}

/** normalize section จาก DB เป็น format ที่ UI ใช้ */
function normSection(s){
  const gradeLevel = s.grade_level;
  const level = gradeLevel.startsWith('ม.') ? 'junior' : 'primary';
  return {
    id: s.id,
    name: `${s.grade_level}/${s.room}`,
    displayName: `${s.subject_name} ${s.grade_level}/${s.room}`,
    subject: s.subject_name,
    grade: s.grade_level,
    room: s.room,
    count: s.student_count,
    level,
    color: pastelize(s.color) || LEVEL_COLORS[level].icon,
    academicYear: s.academic_year,
    semester: s.semester,
    _raw: s,
  };
}

function getSections(){ return _sections; }
function getSection(id){ return _sections.find(s=>s.id===id)||null; }

/** sections ที่มีสอนวันนี้ */
async function getSectionsForDay(dow){
  if(!_schedules.length) await loadSchedules();
  const todaySchedules = _schedules.filter(s=>s.weekday===dow);
  const sectionIds = [...new Set(todaySchedules.map(s=>s.course_section_id))];
  return sectionIds.map(id=>getSection(id)).filter(Boolean);
}

// ── Schedules ──

async function loadSchedules(){
  if(!sb||!_currentUser) return [];
  const { data, error } = await sb
    .from('schedules')
    .select('*, course_sections(subject_name, grade_level, room, student_count, color)')
    .order('weekday').order('start_time');
  if(error){ console.error('loadSchedules:', error); return []; }
  _schedules = data||[];
  return _schedules;
}

/** periods วันนี้ (format เหมือน ck-data.js) */
async function getTodayPeriods(dow){
  if(!_schedules.length) await loadSchedules();
  return _schedules
    .filter(s=>s.weekday===dow)
    .map(s=>({
      periodId: s.id,
      dow: s.weekday,
      s: parseTime(s.start_time),
      e: parseTime(s.end_time),
      subject: s.course_sections?.subject_name || '',
      classId: s.course_section_id,
      name: `${s.course_sections?.grade_level}/${s.course_sections?.room}`,
      dot: s.course_sections?.color || '#1d9e75',
    }));
}

function parseTime(timeStr){
  // '08:40:00' → [8, 40]
  const [h,m] = (timeStr||'').split(':').map(Number);
  return [h||0, m||0];
}

function getPeriod(periodId){
  const s = _schedules.find(s=>s.id===periodId);
  if(!s) return null;
  return {
    periodId: s.id,
    dow: s.weekday,
    s: parseTime(s.start_time),
    e: parseTime(s.end_time),
    subject: s.course_sections?.subject_name || '',
    classId: s.course_section_id,
    name: `${s.course_sections?.grade_level}/${s.course_sections?.room}`,
  };
}

// ── Students ──

/** โหลดนักเรียนใน section */
async function getStudents(sectionId){
  if(_studentCache[sectionId]) return _studentCache[sectionId];
  if(!sb||!_currentUser) return [];

  const { data, error } = await sb
    .from('enrollments')
    .select('students(*)')
    .eq('course_section_id', sectionId)
    .order('students(student_number)');

  if(error){ console.error('getStudents:', error); return []; }

  // avatar สีเดียวเรียบๆ (เลิกสุ่มสี — ทำให้ตารางดูรก)
  const AVATAR = {bg:'#f1f5f9', c:'#64748b'};

  const students = (data||[]).map((e,i)=>{
    const s = e.students;
    return {
      id: s.id,
      no: s.student_number,
      fn: s.first_name,
      ln: s.last_name,
      col: AVATAR,
      classId: sectionId,
      history: {},
    };
  });

  _studentCache[sectionId] = students;
  return students;
}

// ── จัดการนักเรียน (CRUD) ──

/** แก้ไขข้อมูลนักเรียน */
async function updateStudent(studentId, { student_number, first_name, last_name }){
  if(!sb||!_currentUser) return false;
  const patch={};
  if(student_number!==undefined) patch.student_number=parseInt(student_number)||0;
  if(first_name!==undefined) patch.first_name=first_name;
  if(last_name!==undefined) patch.last_name=last_name;
  const { error } = await sb.from('students').update(patch).eq('id', studentId);
  if(error){ console.error('updateStudent:', error); return false; }
  _studentCache={}; // clear ทั้งหมด (กันค้าง)
  return true;
}

/** ลบนักเรียน (ลบ enrollment + student) */
async function deleteStudent(studentId, sectionId){
  if(!sb||!_currentUser) return false;
  // ลบ enrollment ก่อน
  await sb.from('enrollments').delete().eq('student_id', studentId);
  // ลบ attendance records
  await sb.from('attendance_records').delete().eq('student_id', studentId);
  // ลบ student
  const { error } = await sb.from('students').delete().eq('id', studentId);
  if(error){ console.error('deleteStudent:', error); return false; }
  delete _studentCache[sectionId];
  // อัปเดต count
  await recountSection(sectionId);
  return true;
}

/** เพิ่มนักเรียนรายคนเข้า section */
async function addStudent(sectionId, { student_number, first_name, last_name }){
  if(!sb||!_currentUser) return false;
  const { data:stu, error:e1 } = await sb.from('students').insert({
    teacher_id:_currentUser.id,
    student_number: parseInt(student_number)||0,
    first_name: first_name||'', last_name: last_name||'',
  }).select('id').single();
  if(e1){ console.error('addStudent:', e1); return false; }
  const { error:e2 } = await sb.from('enrollments').insert({
    student_id: stu.id, course_section_id: sectionId,
  });
  if(e2){ console.error('addStudent enroll:', e2); return false; }
  delete _studentCache[sectionId];
  await recountSection(sectionId);
  return true;
}

/** ย้ายนักเรียนไปห้องอื่น (เปลี่ยน enrollment) */
async function moveStudent(studentId, fromSectionId, toSectionId){
  if(!sb||!_currentUser) return false;
  const { error } = await sb.from('enrollments')
    .update({ course_section_id: toSectionId })
    .eq('student_id', studentId)
    .eq('course_section_id', fromSectionId);
  if(error){ console.error('moveStudent:', error); return false; }
  delete _studentCache[fromSectionId];
  delete _studentCache[toSectionId];
  await recountSection(fromSectionId);
  await recountSection(toSectionId);
  return true;
}

/** อัปเดต student_count ของ section ตามจำนวน enrollment จริง */
async function recountSection(sectionId){
  const { count } = await sb.from('enrollments')
    .select('id', { count:'exact', head:true })
    .eq('course_section_id', sectionId);
  await sb.from('course_sections').update({ student_count: count||0 }).eq('id', sectionId);
  // อัปเดต cache section ถ้ามี
  const sec=_sections.find(s=>s.id===sectionId);
  if(sec) sec.count=count||0;
}

// ── Attendance ──

/**
 * getAttendance(sectionId, dateKey)
 * คืน { studentId: {status, note} }
 * NOTE: sectionId ใน v2 = course_section_id (uuid)
 *       attendance_sessions เชื่อม section + date
 */
async function getAttendance(sectionId, dateKey){
  const cacheKey = `${sectionId}|${dateKey}`;
  if(_attendanceCache[cacheKey]) return _attendanceCache[cacheKey];
  if(!sb||!_currentUser) return {};

  // หา session ก่อน
  const { data:sessionData } = await sb
    .from('attendance_sessions')
    .select('id')
    .eq('course_section_id', sectionId)
    .eq('attendance_date', dateKey)
    .maybeSingle();

  if(!sessionData) return {};

  // ดึง records
  const { data:records, error } = await sb
    .from('attendance_records')
    .select('student_id, status, note')
    .eq('attendance_session_id', sessionData.id);

  if(error){ console.error('getAttendance:', error); return {}; }

  const result = {};
  (records||[]).forEach(r=>{ result[r.student_id] = {status:r.status, note:r.note||''}; });
  _attendanceCache[cacheKey] = result;
  return result;
}

/** บันทึก attendance คนเดียว */
async function setAttendancePeriod(sectionId, dateKey, studentId, status, note){
  if(!sb||!_currentUser) return;

  // upsert session
  const session = await getOrCreateSession(sectionId, dateKey);
  if(!session) return;

  // upsert record
  const { error } = await sb
    .from('attendance_records')
    .upsert({
      attendance_session_id: session.id,
      student_id: studentId,
      status, note: note||'',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'attendance_session_id,student_id' });

  if(error){ console.error('setAttendancePeriod:', error); return; }

  // update cache
  const cacheKey = `${sectionId}|${dateKey}`;
  if(!_attendanceCache[cacheKey]) _attendanceCache[cacheKey] = {};
  _attendanceCache[cacheKey][studentId] = {status, note:note||''};
}

/** บันทึก attendance หลายคนพร้อมกัน */
async function bulkSetAttendancePeriod(sectionId, dateKey, records){
  if(!sb||!_currentUser||!records.length) return;

  const session = await getOrCreateSession(sectionId, dateKey);
  if(!session) return;

  const rows = records.map(r=>({
    attendance_session_id: session.id,
    student_id: r.id,
    status: r.status,
    note: r.note||'',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb
    .from('attendance_records')
    .upsert(rows, { onConflict: 'attendance_session_id,student_id' });

  if(error){ console.error('bulkSetAttendancePeriod:', error); return; }

  // update cache
  const cacheKey = `${sectionId}|${dateKey}`;
  if(!_attendanceCache[cacheKey]) _attendanceCache[cacheKey] = {};
  records.forEach(r=>{ _attendanceCache[cacheKey][r.id] = {status:r.status, note:r.note||''}; });

  // mark session complete ถ้าบันทึกครบทุกคน
  const students = await getStudents(sectionId);
  if(records.length >= students.length){
    await sb.from('attendance_sessions')
      .update({status:'completed'})
      .eq('id', session.id);
  }
}

/** สร้าง attendance_session ถ้ายังไม่มี */
async function getOrCreateSession(sectionId, dateKey){
  if(!_currentUser) return null;
  const { data, error } = await sb
    .from('attendance_sessions')
    .upsert({
      course_section_id: sectionId,
      teacher_id: _currentUser.id,
      attendance_date: dateKey,
    }, { onConflict: 'course_section_id,attendance_date', ignoreDuplicates: false })
    .select('id')
    .maybeSingle();

  if(error){
    // ถ้า upsert fail ลอง select แทน
    const { data:existing } = await sb
      .from('attendance_sessions')
      .select('id')
      .eq('course_section_id', sectionId)
      .eq('attendance_date', dateKey)
      .maybeSingle();
    return existing;
  }
  return data;
}

/** เช็คชื่อครบหรือยัง */
async function isPeriodChecked(sectionId, dateKey){
  const records = await getAttendance(sectionId, dateKey);
  if(!Object.keys(records).length) return false;
  const students = await getStudents(sectionId);
  return students.every(s=>records[s.id]!==undefined);
}

/** เช็คสถานะหลายห้องทีเดียว → { sectionId: {checked, count} }
 *  checked = มี record อย่างน้อย 1 คน (เริ่มเช็กแล้ว), count = จำนวนที่เช็กแล้ว
 */
async function getCheckStatusForSections(sectionIds, dateKey){
  const result = {};
  sectionIds.forEach(id=>{ result[id]={checked:false, count:0}; });
  if(!sb||!_currentUser||!sectionIds.length) return result;

  // ดึง session ทุกห้องในวันนี้ทีเดียว
  const { data:sessions } = await sb
    .from('attendance_sessions')
    .select('id, course_section_id')
    .in('course_section_id', sectionIds)
    .eq('attendance_date', dateKey);
  if(!sessions || !sessions.length) return result;

  const sessIdToSection = {};
  sessions.forEach(s=>{ sessIdToSection[s.id]=s.course_section_id; });

  // นับ records ต่อ session
  const { data:recs } = await sb
    .from('attendance_records')
    .select('attendance_session_id')
    .in('attendance_session_id', sessions.map(s=>s.id));
  (recs||[]).forEach(r=>{
    const secId = sessIdToSection[r.attendance_session_id];
    if(secId && result[secId]){ result[secId].count++; result[secId].checked=true; }
  });
  return result;
}

/** ล้าง attendance ของวันนี้ */
async function clearAttendance(sectionId, dateKey){
  if(!sb||!_currentUser) return;
  const { data:session } = await sb
    .from('attendance_sessions')
    .select('id')
    .eq('course_section_id', sectionId)
    .eq('attendance_date', dateKey)
    .maybeSingle();

  if(!session) return;

  await sb.from('attendance_records').delete().eq('attendance_session_id', session.id);

  // clear cache
  delete _attendanceCache[`${sectionId}|${dateKey}`];
}

/** invalidate cache (ใช้ตอน switch section) */
function clearCache(sectionId){
  if(sectionId){
    Object.keys(_attendanceCache)
      .filter(k=>k.startsWith(sectionId+'|'))
      .forEach(k=>delete _attendanceCache[k]);
    delete _studentCache[sectionId];
  } else {
    _attendanceCache = {};
    _studentCache = {};
  }
}

// ── Attendance summary ──
async function getAttendanceSummaryForPeriod(sectionId, dateKey){
  const students = await getStudents(sectionId);
  const records = await getAttendance(sectionId, dateKey);
  const c = {present:0,late:0,absent:0,leave:0,total:students.length};
  students.forEach(s=>{
    const r=records[s.id];
    if(r&&c[r.status]!==undefined) c[r.status]++;
  });
  return c;
}

// ── Setup helpers (ใช้ใน setup.html) ──

/** อัพเดตข้อมูลครูใน public.users */
async function updateUserProfile({ display_name, school_name }){
  if(!sb||!_currentUser) return false;
  const { error } = await sb
    .from('users')
    .upsert({
      id: _currentUser.id,
      email: _currentUser.email,
      display_name: display_name || '',
      school_name: school_name || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if(error){ console.error('updateUserProfile:', error); return false; }
  return true;
}

/** สร้าง course_section ใหม่ */
async function createSection({ subject_name, grade_level, room, academic_year, semester, color }){
  if(!sb||!_currentUser) return null;
  const { data, error } = await sb
    .from('course_sections')
    .insert({
      teacher_id: _currentUser.id,
      subject_name, grade_level, room,
      academic_year: academic_year || String(new Date().getFullYear()+543),
      semester: semester || 1,
      color: color || '#1d9e75',
    })
    .select()
    .single();
  if(error){ console.error('createSection:', error); return null; }
  return data;
}

/** แก้ไข course_section (ข้อมูลพื้นฐาน 2.1) */
async function updateSection(sectionId, { subject_name, grade_level, room, color }){
  if(!sb||!_currentUser) return false;
  const patch = { updated_at: new Date().toISOString() };
  if(subject_name!==undefined) patch.subject_name = subject_name;
  if(grade_level!==undefined)  patch.grade_level = grade_level;
  if(room!==undefined)         patch.room = room;
  if(color!==undefined)        patch.color = color;
  const { error } = await sb
    .from('course_sections')
    .update(patch)
    .eq('id', sectionId);
  if(error){ console.error('updateSection:', error); return false; }
  // refresh cache
  await loadSections();
  return true;
}

/** ลบ course_section (Danger Zone 2.5) — cascade ลบ schedules/enrollments/attendance ตาม FK */
async function deleteSection(sectionId){
  if(!sb||!_currentUser) return false;
  const { error } = await sb
    .from('course_sections')
    .delete()
    .eq('id', sectionId);
  if(error){ console.error('deleteSection:', error); return false; }
  // clear cache
  _sections = _sections.filter(s=>s.id!==sectionId);
  delete _studentCache[sectionId];
  Object.keys(_attendanceCache).filter(k=>k.startsWith(sectionId+'|')).forEach(k=>delete _attendanceCache[k]);
  return true;
}

/** รีเซ็ต attendance ทั้งหมดของวิชานี้ (Danger Zone 2.5) */
async function resetSectionAttendance(sectionId){
  if(!sb||!_currentUser) return false;
  // ลบ records ทั้งหมดผ่าน sessions ของ section นี้
  const { data:sessions } = await sb
    .from('attendance_sessions')
    .select('id')
    .eq('course_section_id', sectionId);
  if(sessions && sessions.length){
    const ids = sessions.map(s=>s.id);
    await sb.from('attendance_records').delete().in('attendance_session_id', ids);
    await sb.from('attendance_sessions').delete().eq('course_section_id', sectionId);
  }
  // clear cache
  Object.keys(_attendanceCache).filter(k=>k.startsWith(sectionId+'|')).forEach(k=>delete _attendanceCache[k]);
  return true;
}

/** คืน array ของ date keys ที่เคยเช็คชื่อ สำหรับ section นี้ (ทั้งเทอม) */
async function getSessionDates(sectionId){
  if(!sb||!_currentUser) return [];
  const { data, error } = await sb
    .from('attendance_sessions')
    .select('attendance_date')
    .eq('course_section_id', sectionId)
    .order('attendance_date');
  if(error){ console.error('getSessionDates:', error); return []; }
  return (data||[]).map(r=>r.attendance_date);
}

/** นับจำนวนคาบ/สัปดาห์ ของแต่ละ section */
async function getScheduleCountBySection(){
  if(!_schedules.length) await loadSchedules();
  const counts = {};
  _schedules.forEach(s=>{ counts[s.course_section_id] = (counts[s.course_section_id]||0)+1; });
  return counts;
}

/** สร้าง schedule ใหม่ */
async function createSchedule({ course_section_id, weekday, start_time, end_time }){
  if(!sb||!_currentUser) return null;
  const { data, error } = await sb
    .from('schedules')
    .insert({ teacher_id: _currentUser.id, course_section_id, weekday, start_time, end_time })
    .select()
    .single();
  if(error){ console.error('createSchedule:', error); return null; }
  return data;
}

/** import นักเรียน (alias ของ importStudentsFromArray) */
async function importStudents(sectionId, students){
  const result = await importStudentsFromArray(sectionId, students);
  return result.ok;
}

// ── Import helpers (สำหรับ desktop) ──

/**
 * importStudentsFromArray(sectionId, students)
 * students = [{student_number, first_name, last_name}, ...]
 */
async function importStudentsFromArray(sectionId, students){
  if(!sb||!_currentUser) return {ok:false, error:'Not authenticated'};

  // Insert students
  const rows = students.map(s=>({
    teacher_id: _currentUser.id,
    student_number: s.student_number || s.no || 0,
    first_name: s.first_name || s.fn || '',
    last_name: s.last_name || s.ln || '',
  }));

  const { data:inserted, error:err1 } = await sb
    .from('students')
    .insert(rows)
    .select('id');

  if(err1) return {ok:false, error:err1.message};

  // Enroll in section
  const enrollRows = (inserted||[]).map(s=>({
    student_id: s.id,
    course_section_id: sectionId,
  }));

  const { error:err2 } = await sb.from('enrollments').insert(enrollRows);
  if(err2) return {ok:false, error:err2.message};

  // Update student_count
  await sb.from('course_sections')
    .update({student_count: students.length})
    .eq('id', sectionId);

  // clear cache
  delete _studentCache[sectionId];
  return {ok:true, count:inserted.length};
}

// ── Onboard orchestrator (ชั้น 4) ──
/**
 * importFromOnboard(plan, onProgress)
 * plan = ผลจาก CKImport.process():
 *   { sections:[{subject, room, normRoom, level, periods, color?}],
 *     schedules:[{normRoom, subject, weekday, start, end}],
 *     matches:[{matchedRoom(normRoom), students:[{no, first_name, last_name}]}] }
 * onProgress(step, total, label) — callback อัปเดต UI
 * คืน { ok, created:{sections, schedules, students}, errors:[] }
 */
async function importFromOnboard(plan, onProgress){
  if(!sb||!_currentUser) return {ok:false, error:'Not authenticated'};
  const errors=[];
  const created={sections:0, schedules:0, students:0};
  const roomToSectionId={}; // normRoom -> new section id

  const prog=(s,t,l)=>{ try{ onProgress && onProgress(s,t,l); }catch(e){} };
  const total = plan.sections.length + 1 /*schedules*/ + plan.matches.filter(m=>m.matchedRoom).length;
  let step=0;

  // 1) สร้าง sections
  const PALETTE=['#4a9b94','#6cae8f','#7b9bb5','#d99a4e','#d98a9e','#9d8ec4','#3f8c84','#c98aa6'];
  for(let i=0;i<plan.sections.length;i++){
    const s=plan.sections[i];
    prog(++step, total, `สร้างห้อง ${s.subject} ${s.room}…`);
    const sec=await createSection({
      subject_name:s.subject, grade_level: gradeOf(s.room), room: roomOf(s.room),
      color: s.color || PALETTE[i%PALETTE.length],
    });
    if(sec && sec.id){ roomToSectionId[s.normRoom]=sec.id; created.sections++; }
    else errors.push(`สร้างห้อง ${s.subject} ${s.room} ไม่สำเร็จ`);
  }

  // 2) สร้าง schedules (คาบสอน)
  prog(++step, total, 'บันทึกตารางสอน…');
  for(const sc of plan.schedules){
    const secId=roomToSectionId[sc.normRoom];
    if(!secId) continue;
    const ok=await createSchedule({
      course_section_id:secId,
      weekday: sc.weekday,
      start_time: toTime(sc.start),
      end_time: toTime(sc.end),
    });
    if(ok) created.schedules++;
  }

  // 3) students + enrollments ต่อห้องที่ match
  for(const m of plan.matches){
    if(!m.matchedRoom) continue;
    const secId=roomToSectionId[m.matchedRoom];
    if(!secId){ errors.push(`ไม่พบห้องสำหรับ ${m.name}`); continue; }
    prog(++step, total, `นำเข้ารายชื่อ ${roomDisplayLocal(m.matchedRoom)}…`);
    const res=await importStudentsFromArray(secId, (m.students||[]).map(st=>({
      student_number: st.no, first_name: st.first_name, last_name: st.last_name,
    })));
    if(res.ok) created.students+=res.count;
    else errors.push(`รายชื่อ ${m.name}: ${res.error}`);
  }

  // refresh caches
  await loadSections();
  await loadSchedules();

  return { ok: errors.length===0, created, errors };
}

// helpers สำหรับ onboard
function gradeOf(roomDisplay){ // "ม.1/1" -> "ม.1"
  const m=String(roomDisplay).match(/(ม\.?\s*[1-6]|ป\.?\s*[1-6])/);
  return m ? m[1].replace(/\s/g,'') : roomDisplay;
}
function roomOf(roomDisplay){ // "ม.1/1" -> "1"
  const m=String(roomDisplay).match(/[/\-_]\s*([0-9]+)\s*$/);
  return m ? m[1] : '1';
}
function toTime(hhmm){ // "08:30" -> "08:30:00"
  if(!hhmm) return '08:00:00';
  const parts=String(hhmm).split(':');
  return `${String(parts[0]||'8').padStart(2,'0')}:${String(parts[1]||'00').padStart(2,'0')}:00`;
}
function roomDisplayLocal(nr){
  const m=String(nr).match(/M([1-6])_([0-9]+)/);
  return m ? `ม.${m[1]}/${m[2]}` : nr;
}

// ── EXPOSE (เหมือน window.CK เดิม) ──
window.CKService = {
  // auth
  requireAuth,
  signOut,
  pastelize,
  getCurrentUser,
  getSession,

  // sections (แทน CLASSES)
  loadSections,
  getSections,
  getSection,
  getSectionsForDay,

  // schedules (แทน TIMETABLE)
  loadSchedules,
  getTodayPeriods,
  getPeriod,

  // students
  getStudents,
  updateStudent,
  deleteStudent,
  addStudent,
  moveStudent,

  // attendance
  getAttendance,
  setAttendancePeriod,
  bulkSetAttendancePeriod,
  isPeriodChecked,
  getCheckStatusForSections,
  clearAttendance,
  getAttendanceSummaryForPeriod,
  clearCache,

  // setup
  updateUserProfile,
  createSection,
  updateSection,
  deleteSection,
  resetSectionAttendance,
  getSessionDates,
  getScheduleCountBySection,
  createSchedule,
  importStudents,

  // import
  importStudentsFromArray,
  importFromOnboard,

  // constants
  LEVEL_COLORS,
  MAX_ABSENT,
  fmtKey,
};

// ── Also expose as CK alias for backward compat ──
// (ใช้ชั่วคราวระหว่าง migration)
window.CK = window.CK || window.CKService;

})();
