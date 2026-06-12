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
  primary: { bg:'#fefce8', icon:'#ca8a04', border:'#fde047', text:'#854d0e' },
  junior:  { bg:'#f0fdf4', icon:'#16a34a', border:'#86efac', text:'#15803d' },
  senior:  { bg:'#eff6ff', icon:'#2563eb', border:'#93c5fd', text:'#1d4ed8' },
  uni:     { bg:'#f5f3ff', icon:'#7c3aed', border:'#c4b5fd', text:'#6d28d9' },
};

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
    color: s.color || LEVEL_COLORS[level].icon,
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

  const COLS = [
    {bg:'#f0fdf4',c:'#15803d'},{bg:'#eff6ff',c:'#1d4ed8'},
    {bg:'#fffbeb',c:'#b45309'},{bg:'#fdf2f8',c:'#be185d'},
    {bg:'#f5f3ff',c:'#6d28d9'},{bg:'#fff7ed',c:'#c2410c'},
  ];

  const students = (data||[]).map((e,i)=>{
    const s = e.students;
    return {
      id: s.id,
      no: s.student_number,
      fn: s.first_name,
      ln: s.last_name,
      col: COLS[i % COLS.length],
      classId: sectionId,
      history: {}, // ไม่ใช้ mock history แล้ว
    };
  });

  _studentCache[sectionId] = students;
  return students;
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
    .update({ display_name, school_name, updated_at: new Date().toISOString() })
    .eq('id', _currentUser.id);
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

// ── EXPOSE (เหมือน window.CK เดิม) ──
window.CKService = {
  // auth
  requireAuth,
  signOut,
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

  // attendance
  getAttendance,
  setAttendancePeriod,
  bulkSetAttendancePeriod,
  isPeriodChecked,
  clearAttendance,
  getAttendanceSummaryForPeriod,
  clearCache,

  // setup
  updateUserProfile,
  createSection,
  createSchedule,
  importStudents,

  // import
  importStudentsFromArray,

  // constants
  LEVEL_COLORS,
  MAX_ABSENT,
  fmtKey,
};

// ── Also expose as CK alias for backward compat ──
// (ใช้ชั่วคราวระหว่าง migration)
window.CK = window.CK || window.CKService;

})();
