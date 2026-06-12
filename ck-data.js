/**
 * ClassKru — Shared Data Layer v5
 * ทุกหน้าอ่าน/เขียนผ่าน window.CK เท่านั้น
 *
 * Schema v5 — Hybrid Period-based:
 * store = {
 *   students:  { classId: [ Student ] }
 *   attendance:{ periodId: { dateKey: { studentId: {status,note} } } }
 *   scores:    { classId:  { studentId: { assignmentId: score } } }
 * }
 *
 * Student    = { id, no, fn, ln, col, classId, attendProfile }
 * Period     = { periodId, s, e, subject, classId, name, dot, dow }
 * Attendance = stored per periodId+dateKey, NOT inside student.history
 *
 * Backward-compat: getStudents(classId) ยังใช้ได้
 * New: getStudentsForPeriod(periodId), getAttendance(periodId,dateKey)
 */
(function(){

const KEY = 'ck_v6'; // bump — ล้างข้อมูลเก่าอัตโนมัติ (v6: classId มีเลขห้อง p6→p61)

/* ─────────────────────────────────────────
   NAMES — แยกตามช่วงวัย
───────────────────────────────────────── */
const NAMES_JUNIOR = [
  ['กนกวรรณ','สุขสวัสดิ์'],['กิตติภัทร','วงศ์ไพบูลย์'],['ขวัญฤดี','มีสุข'],
  ['คณิน','รักเรียน'],['จิดาภา','ทองดี'],['จิรายุ','บุญมา'],
  ['ชนัญชิดา','ศรีสุข'],['ชินวัตร','พงษ์ไทย'],['ญาณิศา','เจริญสุข'],
  ['ณัฐพล','วงษ์สวรรค์'],['ณัฐริกา','เพชรงาม'],['ตะวัน','โชติมา'],
  ['ทัศนีย์','สมบัติ'],['ธนกฤต','ชัยชนะ'],['ธัญพิชชา','แสงทอง'],
  ['นภัสวรรณ','พิมพ์ดี'],['นันทิชา','ขยันเรียน'],['ปัณณ์','ดีงาม'],
  ['พชร','รุ่งเรือง'],['พัทธ์ธีรา','ศิริมงคล'],['ภูมิพัฒน์','วิชาดี'],
  ['มนัสนันท์','แก้วใส'],['รพีพัฒน์','ทองพูล'],['รัชนก','สุขสันต์'],
  ['วรัญญา','ประเสริฐ'],['วิชยา','เด่นดวง'],['ศุภิสรา','ใจงาม'],
  ['สิปปภาส','สมาธิ'],['สุทธิดา','มั่นคง'],['อภิชาติ','เก่งกล้า'],
  ['อริษา','สุขใจ'],['อัครพล','ผลดี'],['อุษามณี','ดาวดี'],['เอื้ออังกูร','หมั่นเพียร'],
  ['กัลยรัตน์','สว่างจิต'],['จารุวรรณ','ใจดี'],
];

const NAMES_PRIMARY = [
  ['กมลชนก','ใจดี'],['กรวิชญ์','สว่างใส'],['ขวัญข้าว','รักดี'],
  ['คุณากร','บุญช่วย'],['จิณณพัต','ทองแดง'],['จิรภัทร','แก้วใส'],
  ['ชนกนันท์','สุขสม'],['ชัยมงคล','ดีงาม'],['ญาตาวี','มีสุข'],
  ['ณัฐชา','ประเสริฐ'],['ณิชกมล','วงศ์ดี'],['ตรีทิพย์','โชติรัตน์'],
  ['ทองหล่อ','สมบูรณ์'],['ธนัชชา','รุ่งเรือง'],['ธีรภัทร','ดาวดี'],
  ['นพรัตน์','ขยันดี'],['นันทพร','หมั่นดี'],['ปณิธาน','แสงทอง'],
  ['พิมพ์มาดา','ศรีงาม'],['ภัทรภร','ชัยดี'],['ภูตะวัน','วิชาดี'],
  ['มนัสชนก','สุขสันต์'],['รวีวรรณ','ทองพูน'],['รัตนาภรณ์','สดใส'],
  ['วรภัทร','เจริญดี'],['วิชิต','มั่นคง'],['ศุภณัฐ','ใจงาม'],
  ['สิริมา','สมาธิ'],['สุกฤษฎา','เก่งดี'],['อดิเทพ','สุขใจ'],
  ['อนันตชัย','ผลดี'],['อรนภา','ดาวสวย'],['อิงอร','หมั่นเพียร'],
  ['เกียรติภูมิ','สว่างจิต'],['เดชาวัต','บุญมา'],['โชติกา','ทองดี'],
  ['ไพลิน','รักเรียน'],['ไอยเรศ','ชัยชนะ'],
];

const COLS = [
  {bg:'#f0fdf4',c:'#15803d'},{bg:'#eff6ff',c:'#1d4ed8'},
  {bg:'#fffbeb',c:'#b45309'},{bg:'#fdf2f8',c:'#be185d'},
  {bg:'#f5f3ff',c:'#6d28d9'},{bg:'#fff7ed',c:'#c2410c'},
  {bg:'#f0f9ff',c:'#0369a1'},{bg:'#ecfdf5',c:'#065f46'},
];

/* ─────────────────────────────────────────
   LEVEL COLORS
───────────────────────────────────────── */
const LEVEL_COLORS = {
  primary: { bg:'#fefce8', icon:'#ca8a04', border:'#fde047', text:'#854d0e' },
  junior:  { bg:'#f0fdf4', icon:'#16a34a', border:'#86efac', text:'#15803d' },
  senior:  { bg:'#eff6ff', icon:'#2563eb', border:'#93c5fd', text:'#1d4ed8' },
  uni:     { bg:'#f5f3ff', icon:'#7c3aed', border:'#c4b5fd', text:'#6d28d9' },
};

/* ─────────────────────────────────────────
   CLASSES META — ห้องเรียน (node หลัก)
───────────────────────────────────────── */
const CLASSES_META = [
  {id:'m31', name:'ม.3/1', count:34, level:'junior'},
  {id:'m32', name:'ม.3/2', count:32, level:'junior'},
  {id:'m21', name:'ม.2/1', count:32, level:'junior'},
  {id:'m22', name:'ม.2/2', count:30, level:'junior'},
  {id:'m11', name:'ม.1/1', count:36, level:'junior'},
  {id:'p61', name:'ป.6/1', count:38, level:'primary'},
  {id:'p51', name:'ป.5/1', count:36, level:'primary'},
  {id:'p41', name:'ป.4/1', count:35, level:'primary'},
  {id:'p31', name:'ป.3/1', count:33, level:'primary'},
  {id:'p21', name:'ป.2/1', count:32, level:'primary'},
  {id:'p11', name:'ป.1/1', count:30, level:'primary'},
];

/* ─────────────────────────────────────────
   TIMETABLE — Period-based
   periodId = dow_classId_subject_hhmm (unique ต่อคาบ)
   dow: 1=จันทร์ ... 5=ศุกร์
───────────────────────────────────────── */
const TIMETABLE_MASTER = {
  1: [ // จันทร์
    {periodId:'mon_p61_soc_0940',  dow:1, s:[9,40],  e:[10,40], subject:'สังคมศึกษา',      classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
    {periodId:'mon_m21_art_1030',  dow:1, s:[10,30], e:[11,40], subject:'ทัศนศิลป์',       classId:'m21', name:'ม.2/1', dot:'#3b82f6'},
    {periodId:'mon_p51_hlt_1240',  dow:1, s:[12,40], e:[13,40], subject:'สุขศึกษา',        classId:'p51', name:'ป.5/1', dot:'#f59e0b'},
    {periodId:'mon_m11_art_1340',  dow:1, s:[13,40], e:[14,40], subject:'ศิลปะ',           classId:'m11', name:'ม.1/1', dot:'#8b5cf6'},
    {periodId:'mon_m31_hlt_1440',  dow:1, s:[14,40], e:[15,40], subject:'สุขศึกษา',        classId:'m31', name:'ม.3/1', dot:'#1d9e75'},
  ],
  2: [ // อังคาร
    {periodId:'tue_p11_pe_0840',   dow:2, s:[8,40],  e:[9,40],  subject:'พลศึกษา',         classId:'p11', name:'ป.1/1', dot:'#ec4899'},
    {periodId:'tue_p21_pe_0940',   dow:2, s:[9,40],  e:[10,40], subject:'พลศึกษา',         classId:'p21', name:'ป.2/1', dot:'#f97316'},
    {periodId:'tue_p61_soc_1030',  dow:2, s:[10,30], e:[11,40], subject:'สังคมศึกษา',      classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
    {periodId:'tue_p41_hpe_1240',  dow:2, s:[12,40], e:[13,40], subject:'สุขพลศึกษา',      classId:'p41', name:'ป.4/1', dot:'#eab308'},
    {periodId:'tue_p61_hpe_1340',  dow:2, s:[13,40], e:[14,40], subject:'สุขพลศึกษา',      classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
    {periodId:'tue_m11_pe_1440',   dow:2, s:[14,40], e:[15,40], subject:'พลศึกษา',         classId:'m11', name:'ม.1/1', dot:'#8b5cf6'},
  ],
  3: [ // พุธ
    {periodId:'wed_p31_pe_0940',   dow:3, s:[9,40],  e:[10,40], subject:'พลศึกษา',         classId:'p31', name:'ป.3/1', dot:'#14b8a6'},
    {periodId:'wed_p61_his_1030',  dow:3, s:[10,30], e:[11,40], subject:'ประวัติศาสตร์',    classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
    {periodId:'wed_m11_pe_1240',   dow:3, s:[12,40], e:[13,40], subject:'พลศึกษา',         classId:'m11', name:'ม.1/1', dot:'#8b5cf6'},
    {periodId:'wed_p51_pe_1340',   dow:3, s:[13,40], e:[14,40], subject:'พลศึกษา',         classId:'p51', name:'ป.5/1', dot:'#f59e0b'},
    {periodId:'wed_p61_pe_1440',   dow:3, s:[14,40], e:[15,40], subject:'พลศึกษา',         classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
  ],
  4: [ // พฤหัสบดี
    {periodId:'thu_m11_hlt_0940',  dow:4, s:[9,40],  e:[10,40], subject:'สุขศึกษา',        classId:'m11', name:'ม.1/1', dot:'#8b5cf6'},
    {periodId:'thu_m21_hlt_1030',  dow:4, s:[10,30], e:[11,40], subject:'สุขศึกษา',        classId:'m21', name:'ม.2/1', dot:'#3b82f6'},
    {periodId:'thu_m11_art_1240',  dow:4, s:[12,40], e:[13,40], subject:'ศิลปะ',           classId:'m11', name:'ม.1/1', dot:'#8b5cf6'},
    {periodId:'thu_m21_art_1340',  dow:4, s:[13,40], e:[14,40], subject:'ทัศนศิลป์',       classId:'m21', name:'ม.2/1', dot:'#3b82f6'},
    {periodId:'thu_p61_sco_1440',  dow:4, s:[14,40], e:[15,40], subject:'ลูกเสือ',          classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
  ],
  5: [ // ศุกร์
    {periodId:'fri_p61_anti_1030', dow:5, s:[10,30], e:[11,40], subject:'ป้องกันทุจริต',   classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
    {periodId:'fri_p41_hpe_1240',  dow:5, s:[12,40], e:[13,40], subject:'สุขพลศึกษา',      classId:'p41', name:'ป.4/1', dot:'#eab308'},
    {periodId:'fri_m21_pe_1340',   dow:5, s:[13,40], e:[14,40], subject:'พลศึกษา',         classId:'m21', name:'ม.2/1', dot:'#3b82f6'},
    {periodId:'fri_p61_pray_1440', dow:5, s:[14,40], e:[15,40], subject:'สวดมนต์',          classId:'p61', name:'ป.6/1', dot:'#ca8a04'},
  ],
};

/* flat list ของทุก period — สะดวกค้นหา */
const ALL_PERIODS = Object.values(TIMETABLE_MASTER).flat();

/* ─────────────────────────────────────────
   SUBJECTS — derive จาก TIMETABLE_MASTER
   Subject เป็น first-class citizen (v6)
   hierarchy: Subject → Class → Student
───────────────────────────────────────── */

/** unique subjects ทั้งหมดที่สอน (เรียงตามชื่อ) */
const SUBJECTS_MASTER = (function(){
  const map = {};
  ALL_PERIODS.forEach(p=>{
    if(!map[p.subject]){
      map[p.subject] = {id:p.subject, name:p.subject, dot:p.dot, classIds:[], periods:[]};
    }
    if(!map[p.subject].classIds.includes(p.classId)) map[p.subject].classIds.push(p.classId);
    map[p.subject].periods.push(p);
  });
  return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name,'th'));
})();

function getSubjects(){ return SUBJECTS_MASTER; }
function getSubject(name){ return SUBJECTS_MASTER.find(s=>s.id===name)||null; }

/** classes ที่สอนวิชา subjectName เรียงตาม CLASS_ORDER */
function getClassesForSubject(name){
  const s = getSubject(name); if(!s) return [];
  return s.classIds
    .map(id=>CLASSES_META.find(c=>c.id===id)).filter(Boolean)
    .sort((a,b)=>CLASS_ORDER.indexOf(a.id)-CLASS_ORDER.indexOf(b.id));
}

/** periods ทั้งหมดของวิชา (ทุกวัน ทุกห้อง) */
function getPeriodsForSubject(name){ return ALL_PERIODS.filter(p=>p.subject===name); }

/** subjects ที่สอนวันนี้ dow — เรียงตามเวลา ไม่ซ้ำ */
function getSubjectsForDay(dow){
  const dayPeriods = TIMETABLE_MASTER[dow]||[];
  const seen = new Set(); const result = [];
  dayPeriods.forEach(p=>{
    if(!seen.has(p.subject)){
      seen.add(p.subject);
      result.push({...getSubject(p.subject), todayPeriods: dayPeriods.filter(dp=>dp.subject===p.subject)});
    }
  });
  return result;
}

/** attendance summary ต่อวิชา สำหรับวันที่ dateKey */
function getAttendanceSummaryForSubject(subjectName, dateKey){
  const d = new Date(dateKey);
  const periods = getPeriodsForSubject(subjectName).filter(p=>p.dow===d.getDay());
  const total = {present:0, late:0, absent:0, leave:0, total:0};
  periods.forEach(p=>{
    const s = getAttendanceSummaryForPeriod(p.periodId, dateKey);
    total.present+=s.present; total.late+=s.late;
    total.absent+=s.absent;   total.leave+=s.leave; total.total+=s.total;
  });
  return total;
}

/* ─────────────────────────────────────────
   ASSIGNMENTS — key = subject group
   ใช้ classId เป็น key เพื่อ backward compat
   แต่ควรย้ายเป็น subjectId ใน v6
───────────────────────────────────────── */
const ASSIGNMENTS_MASTER = {
  m31: [
    {id:'a1', name:'ใบงาน — ระบบร่างกาย',           type:'hw',        maxScore:10, due:'2569-05-21'},
    {id:'a2', name:'ทดสอบ บทที่ 1 สุขภาพกาย',       type:'quiz',      maxScore:20, due:'2569-05-28'},
    {id:'a3', name:'ใบงาน — สุขภาพจิต',             type:'hw',        maxScore:10, due:'2569-06-04'},
    {id:'a4', name:'ปฏิบัติ — ปฐมพยาบาลเบื้องต้น',  type:'practical', maxScore:20, due:'2569-06-07'},
    {id:'a5', name:'สอบกลางภาค สุขศึกษา',           type:'exam',      maxScore:50, due:'2569-06-11'},
    {id:'a6', name:'โครงงาน — สุขภาพชุมชน',         type:'project',   maxScore:20, due:'2569-06-18'},
  ],
  m32: [
    {id:'a1', name:'ใบงาน — ระบบร่างกาย',           type:'hw',        maxScore:10, due:'2569-05-21'},
    {id:'a2', name:'ทดสอบ บทที่ 1 สุขภาพกาย',       type:'quiz',      maxScore:20, due:'2569-05-28'},
    {id:'a3', name:'ใบงาน — สุขภาพจิต',             type:'hw',        maxScore:10, due:'2569-06-04'},
    {id:'a4', name:'ปฏิบัติ — ปฐมพยาบาลเบื้องต้น',  type:'practical', maxScore:20, due:'2569-06-07'},
    {id:'a5', name:'สอบกลางภาค สุขศึกษา',           type:'exam',      maxScore:50, due:'2569-06-11'},
  ],
  m21: [
    {id:'a1', name:'ใบงาน — ทฤษฎีสี',               type:'hw',        maxScore:10, due:'2569-05-20'},
    {id:'a2', name:'งานสร้างสรรค์ — ภาพสีน้ำ',      type:'project',   maxScore:30, due:'2569-05-27'},
    {id:'a3', name:'ทดสอบ — องค์ประกอบศิลป์',       type:'quiz',      maxScore:20, due:'2569-06-03'},
    {id:'a4', name:'งานปฏิบัติ — ภาพพิมพ์',         type:'practical', maxScore:20, due:'2569-06-10'},
    {id:'a5', name:'สอบกลางภาค ทัศนศิลป์',          type:'exam',      maxScore:40, due:'2569-06-12'},
  ],
  m22: [
    {id:'a1', name:'ทดสอบสมรรถภาพทางกาย',           type:'practical', maxScore:20, due:'2569-05-23'},
    {id:'a2', name:'ทักษะ — บาสเกตบอล',              type:'practical', maxScore:20, due:'2569-06-06'},
    {id:'a3', name:'รายงาน — กีฬาและสุขภาพ',        type:'hw',        maxScore:10, due:'2569-06-10'},
    {id:'a4', name:'สอบกลางภาค พลศึกษา',            type:'exam',      maxScore:30, due:'2569-06-13'},
  ],
  m11: [
    {id:'a1', name:'ใบงาน — ทัศนธาตุ',              type:'hw',        maxScore:10, due:'2569-05-20'},
    {id:'a2', name:'งานสร้างสรรค์ — วาดเส้น',       type:'project',   maxScore:20, due:'2569-05-27'},
    {id:'a3', name:'ทดสอบสมรรถภาพทางกาย',           type:'practical', maxScore:20, due:'2569-06-03'},
    {id:'a4', name:'ทักษะ — ฟุตบอล',                type:'practical', maxScore:20, due:'2569-06-06'},
    {id:'a5', name:'สอบกลางภาค ศิลปะ',              type:'exam',      maxScore:30, due:'2569-06-10'},
  ],
  p61: [
    {id:'a1', name:'ใบงาน — ประวัติศาสตร์ไทย',      type:'hw',        maxScore:10, due:'2569-05-21'},
    {id:'a2', name:'ทดสอบ — สังคมศึกษา บทที่ 1',    type:'quiz',      maxScore:20, due:'2569-05-28'},
    {id:'a3', name:'งานศิลปะ — ภาพประกอบเรื่อง',    type:'project',   maxScore:20, due:'2569-06-04'},
    {id:'a4', name:'ทดสอบทักษะลูกเสือ',             type:'practical', maxScore:20, due:'2569-06-07'},
    {id:'a5', name:'สอบกลางภาค สังคมศึกษา',         type:'exam',      maxScore:40, due:'2569-06-11'},
  ],
  p51: [
    {id:'a1', name:'ใบงาน — ระบบย่อยอาหาร',         type:'hw',        maxScore:10, due:'2569-05-22'},
    {id:'a2', name:'ทดสอบสมรรถภาพทางกาย',           type:'practical', maxScore:20, due:'2569-05-29'},
    {id:'a3', name:'ทักษะกีฬา — วอลเลย์บอล',        type:'practical', maxScore:20, due:'2569-06-05'},
    {id:'a4', name:'สอบกลางภาค สุขศึกษา',           type:'exam',      maxScore:30, due:'2569-06-10'},
  ],
  p41: [
    {id:'a1', name:'ใบงาน — สุขอนามัยส่วนตัว',      type:'hw',        maxScore:10, due:'2569-05-22'},
    {id:'a2', name:'ทดสอบสมรรถภาพทางกาย',           type:'practical', maxScore:20, due:'2569-05-29'},
    {id:'a3', name:'ทักษะกีฬา — ตะกร้อ',            type:'practical', maxScore:20, due:'2569-06-05'},
    {id:'a4', name:'สอบกลางภาค สุขพละ',             type:'exam',      maxScore:30, due:'2569-06-10'},
  ],
  p31: [
    {id:'a1', name:'ทดสอบสมรรถภาพ',                type:'practical', maxScore:20, due:'2569-05-29'},
    {id:'a2', name:'ทักษะพื้นฐาน — วิ่ง/กระโดด',   type:'practical', maxScore:20, due:'2569-06-05'},
    {id:'a3', name:'สอบกลางภาค พลศึกษา',            type:'exam',      maxScore:20, due:'2569-06-10'},
  ],
  p21: [
    {id:'a1', name:'ทดสอบสมรรถภาพ',                type:'practical', maxScore:20, due:'2569-05-29'},
    {id:'a2', name:'ทักษะพื้นฐาน — เดิน/วิ่ง',     type:'practical', maxScore:20, due:'2569-06-05'},
    {id:'a3', name:'สอบกลางภาค พลศึกษา',            type:'exam',      maxScore:20, due:'2569-06-10'},
  ],
  p11: [
    {id:'a1', name:'กิจกรรม — เคลื่อนไหวตามจังหวะ',type:'practical', maxScore:20, due:'2569-05-29'},
    {id:'a2', name:'ทักษะพื้นฐาน — ทรงตัว',         type:'practical', maxScore:20, due:'2569-06-05'},
    {id:'a3', name:'สังเกตพฤติกรรม',                type:'exam',      maxScore:20, due:'2569-06-10'},
  ],
};

/* ─────────────────────────────────────────
   UTILS
───────────────────────────────────────── */
function fmtKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch(e){ return {}; }
}
function save(store){
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch(e){}
}

/* ─────────────────────────────────────────
   TIMETABLE HELPERS — single source of truth
───────────────────────────────────────── */

/** คืน periods ทั้งหมดของวัน dow (ทุกคาบ แม้ห้องซ้ำ) */
function getTodayPeriods(dow){
  return TIMETABLE_MASTER[dow] || [];
}

/** คืน unique classId ของวัน dow — เรียงตาม CLASS_ORDER */
const CLASS_ORDER = ['p11','p21','p31','p41','p51','p61','m11','m21','m22','m31','m32'];
function getTodayClasses(dow){
  const ids = [...new Set((TIMETABLE_MASTER[dow]||[]).map(p=>p.classId))];
  return ids
    .map(id=>CLASSES_META.find(c=>c.id===id))
    .filter(Boolean)
    .sort((a,b)=>CLASS_ORDER.indexOf(a.id)-CLASS_ORDER.indexOf(b.id));
}

/** คืน period object จาก periodId */
function getPeriod(periodId){
  return ALL_PERIODS.find(p=>p.periodId===periodId) || null;
}

/** คืน periods ทั้งหมดของ classId (ทุกวัน) */
function getPeriodsForClass(classId){
  return ALL_PERIODS.filter(p=>p.classId===classId);
}

/* ─────────────────────────────────────────
   MOCK BUILDERS
───────────────────────────────────────── */
function buildHistoryForPeriod(profile){
  // สร้าง attendance history 60 วันย้อนหลัง ต่อ period
  const h = {};
  const today = new Date();
  for(let d=60;d>=1;d--){
    const dt = new Date(today); dt.setDate(today.getDate()-d);
    if(dt.getDay()===0||dt.getDay()===6) continue;
    const key = fmtKey(dt);
    const r = Math.random();
    let status;
    if(profile==='good')   status = r<.90?'present':r<.95?'late':r<.98?'absent':'leave';
    else if(profile==='risky') status = r<.75?'present':r<.83?'late':r<.92?'absent':'leave';
    else if(profile==='bad')   status = r<.55?'present':r<.65?'late':r<.88?'absent':'leave';
    else                   status = r<.82?'present':r<.89?'late':r<.95?'absent':'leave';
    h[key] = {status, note:''};
  }
  return h;
}

function buildScores(classId, studentId, attendProfile){
  const assignments = ASSIGNMENTS_MASTER[classId] || [];
  const scores = {};
  const baseLevel = attendProfile==='good'
    ? (Math.random()<.4?'high':'mid')
    : attendProfile==='risky'
    ? (Math.random()<.3?'mid':'low')
    : 'low';
  assignments.forEach(a=>{
    const max = a.maxScore;
    let pct;
    if(baseLevel==='high')  pct = 0.78 + Math.random()*0.22;
    else if(baseLevel==='mid') pct = 0.55 + Math.random()*0.28;
    else                    pct = 0.28 + Math.random()*0.32;
    if(attendProfile==='bad' && (a.type==='hw'||a.type==='project') && Math.random()<0.35){
      scores[a.id] = null;
    } else {
      scores[a.id] = Math.round(pct * max);
    }
  });
  return scores;
}

/* ─────────────────────────────────────────
   STUDENTS API
───────────────────────────────────────── */

/**
 * getStudents(classId) — backward compat
 * คืน students พร้อม history (เก็บ attendance รวมทุก period ใน classId นั้น)
 * history key = dateKey (รวมจาก primary period ของวันนั้น)
 */
function getStudents(classId){
  const store = load();
  if(!store.students) store.students = {};
  if(!store.students[classId]){
    const meta = CLASSES_META.find(c=>c.id===classId);
    const count = meta ? meta.count : 34;
    const profiles = Array.from({length:count},(_,i)=>{
      if(i===3) return 'bad';
      if(i===9||i===15||i===22) return 'risky';
      return 'good';
    });
    const namePool = (meta?.level==='primary') ? NAMES_PRIMARY : NAMES_JUNIOR;
    store.students[classId] = Array.from({length:count},(_,i)=>{
      const n = namePool[i % namePool.length];
      const col = COLS[i % COLS.length];
      const profile = profiles[i];
      return {
        id:i, no:i+1, fn:n[0], ln:n[1], col, classId,
        attendProfile: profile,
        history: buildHistoryForPeriod(profile), // ใช้ backward compat history
      };
    });
    save(store);
  }
  return store.students[classId];
}

/**
 * getStudentsForPeriod(periodId) — NEW v5
 * คืน students ของ classId ที่ผูกกับ period นั้น
 * พร้อม attendance history เฉพาะ period นั้น
 */
function getStudentsForPeriod(periodId){
  const period = getPeriod(periodId);
  if(!period) return [];
  const students = getStudents(period.classId);
  const store = load();
  const periodAtt = store.attendance?.[periodId] || {};
  // merge period-specific attendance เข้าไปใน history ชั่วคราว
  return students.map(s=>{
    const periodHistory = {};
    Object.entries(periodAtt).forEach(([dateKey, dayRecords])=>{
      if(dayRecords[s.id] !== undefined){
        periodHistory[dateKey] = dayRecords[s.id];
      }
    });
    // strict period-only — ไม่ fallback mock history
    return {...s, history: periodHistory, periodId};
  });
}

/* ─────────────────────────────────────────
   ATTENDANCE API — Period-based (NEW v5)
───────────────────────────────────────── */

/**
 * getAttendance(periodId, dateKey)
 * คืน { studentId: {status,note} } หรือ {} ถ้ายังไม่เช็ค
 */
function getAttendance(periodId, dateKey){
  const store = load();
  return store.attendance?.[periodId]?.[dateKey] || {};
}

/**
 * setAttendancePeriod(periodId, dateKey, studentId, status, note)
 * บันทึก attendance ต่อ period (NEW v5)
 */
function setAttendancePeriod(periodId, dateKey, studentId, status, note){
  if(!periodId||!dateKey) return;
  const store = load();
  if(!store.attendance) store.attendance = {};
  if(!store.attendance[periodId]) store.attendance[periodId] = {};
  if(!store.attendance[periodId][dateKey]) store.attendance[periodId][dateKey] = {};
  store.attendance[periodId][dateKey][studentId] = {status, note:note||''};
  save(store);
}

/**
 * bulkSetAttendancePeriod(periodId, dateKey, records)
 * records = [{id, status, note}, ...]
 */
function bulkSetAttendancePeriod(periodId, dateKey, records){
  if(!periodId||!dateKey) return;
  const store = load();
  if(!store.attendance) store.attendance = {};
  if(!store.attendance[periodId]) store.attendance[periodId] = {};
  if(!store.attendance[periodId][dateKey]) store.attendance[periodId][dateKey] = {};
  records.forEach(r=>{
    store.attendance[periodId][dateKey][r.id] = {status:r.status, note:r.note||''};
  });
  save(store);
}

/** isPeriodChecked(periodId, dateKey) — เช็คชื่อครบ period นั้นแล้วหรือยัง */
function isPeriodChecked(periodId, dateKey){
  const period = getPeriod(periodId);
  if(!period) return false;
  const students = getStudents(period.classId);
  if(!students.length) return false;
  const records = getAttendance(periodId, dateKey);
  // ต้องมี period attendance จริงๆ เท่านั้น — ไม่ fallback mock history
  if(Object.keys(records).length === 0) return false;
  return students.every(s=>records[s.id] !== undefined);
}

/** getCheckedPeriods(dow, dateKey) — คืน array periodId ที่เช็คครบแล้ว */
function getCheckedPeriods(dow, dateKey){
  const periods = getTodayPeriods(dow);
  return periods.filter(p=>isPeriodChecked(p.periodId, dateKey)).map(p=>p.periodId);
}

/* ─────────────────────────────────────────
   ATTENDANCE API — Class-based (backward compat)
───────────────────────────────────────── */
function setAttendance(classId, dateKey, studentId, status, note){
  if(!classId||!dateKey) return;
  getStudents(classId);
  const store = load();
  const stu = store.students[classId].find(s=>s.id===studentId);
  if(stu){ stu.history[dateKey] = {status, note:note||''}; save(store); }
}

function bulkSetAttendance(classId, dateKey, records){
  if(!classId||!dateKey) return;
  getStudents(classId);
  const store = load();
  records.forEach(r=>{
    const stu = store.students[classId].find(s=>s.id===r.id);
    if(stu) stu.history[dateKey] = {status:r.status, note:r.note||''};
  });
  save(store);
}

function getAttendanceSummary(classId, dateKey){
  const students = getStudents(classId);
  const c = {present:0,late:0,absent:0,leave:0,total:students.length};
  students.forEach(s=>{
    const r = s.history[dateKey];
    if(r && c[r.status]!==undefined) c[r.status]++;
  });
  return c;
}

/** getAttendanceSummaryForPeriod(periodId, dateKey) — NEW v5 */
function getAttendanceSummaryForPeriod(periodId, dateKey){
  const period = getPeriod(periodId);
  if(!period) return {present:0,late:0,absent:0,leave:0,total:0};
  const students = getStudents(period.classId);
  const records = getAttendance(periodId, dateKey);
  const c = {present:0,late:0,absent:0,leave:0,total:students.length};
  // strict period-only — ไม่ fallback mock history
  students.forEach(s=>{
    const r = records[s.id];
    if(r && c[r.status]!==undefined) c[r.status]++;
  });
  return c;
}

function clearAttendance(classId, dateKey){
  const store = load();
  if(!store.students||!store.students[classId]) return;
  store.students[classId].forEach(s=>{ delete s.history[dateKey]; });
  save(store);
}

/* ─────────────────────────────────────────
   SCORES API
───────────────────────────────────────── */
function getStudentScores(classId, studentId){
  const store = load();
  if(!store.scores) store.scores = {};
  if(!store.scores[classId]) store.scores[classId] = {};
  if(!store.scores[classId][studentId]){
    const stu = getStudents(classId).find(s=>s.id===studentId);
    store.scores[classId][studentId] = buildScores(classId, studentId, stu?.attendProfile||'good');
    save(store);
  }
  return store.scores[classId][studentId];
}

function setScore(classId, studentId, assignmentId, score){
  const store = load();
  if(!store.scores) store.scores = {};
  if(!store.scores[classId]) store.scores[classId] = {};
  if(!store.scores[classId][studentId]) store.scores[classId][studentId] = {};
  store.scores[classId][studentId][assignmentId] = score;
  save(store);
}

function calcGrade(classId, studentId){
  const assignments = ASSIGNMENTS_MASTER[classId]||[];
  const scores = getStudentScores(classId, studentId);
  let total=0, maxTotal=0, missing=0;
  assignments.forEach(a=>{
    maxTotal += a.maxScore;
    const sc = scores[a.id];
    if(sc===null||sc===undefined){ missing++; }
    else { total += sc; }
  });
  const pct = maxTotal>0 ? (total/maxTotal)*100 : 0;
  let grade;
  if(pct>=80) grade='A';
  else if(pct>=75) grade='B+';
  else if(pct>=70) grade='B';
  else if(pct>=65) grade='C+';
  else if(pct>=60) grade='C';
  else if(pct>=55) grade='D+';
  else if(pct>=50) grade='D';
  else grade='F';
  return {total, maxTotal, pct:Math.round(pct*10)/10, grade, missing};
}

function getClassScores(classId){
  const students = getStudents(classId);
  return students.map(s=>({
    student:s,
    ...calcGrade(classId, s.id),
    scores: getStudentScores(classId, s.id),
  }));
}

/* ─────────────────────────────────────────
   ASSIGNMENTS API
───────────────────────────────────────── */
function getAssignments(classId){
  return ASSIGNMENTS_MASTER[classId]||[];
}

function addAssignment(classId, assignment){
  const store = load();
  if(!store.customAssignments) store.customAssignments={};
  if(!store.customAssignments[classId]) store.customAssignments[classId]=[];
  store.customAssignments[classId].push(assignment);
  save(store);
}

/* ─────────────────────────────────────────
   STUDENT PROFILE HELPERS
───────────────────────────────────────── */
function getStudentAttendStats(student){
  const counts = {present:0, late:0, absent:0, leave:0, total:0};
  Object.values(student.history).forEach(r=>{
    if(counts[r.status]!==undefined){ counts[r.status]++; counts.total++; }
  });
  const miss = counts.absent + counts.leave;
  const MAX_ABSENT = 8;
  return {
    ...counts,
    miss,
    remaining: Math.max(0, MAX_ABSENT - miss),
    overLimit: miss >= MAX_ABSENT,
    riskLevel: miss>=MAX_ABSENT?'danger':miss>=MAX_ABSENT*0.75?'warning':'ok',
  };
}

function getRecentAttendance(student, days=30){
  return Object.entries(student.history)
    .sort((a,b)=>b[0].localeCompare(a[0]))
    .slice(0, days)
    .map(([date,rec])=>({date, ...rec}));
}

/* ─────────────────────────────────────────
   EXPOSE
───────────────────────────────────────── */
window.CK = {
  // internal store access (for undo)
  _loadStore:   load,
  _saveStore:   save,

  // meta
  CLASSES:      CLASSES_META,
  TIMETABLE:    TIMETABLE_MASTER,
  LEVEL_COLORS,
  MAX_ABSENT:   8,
  CLASS_ORDER,

  // utils
  fmtKey,

  // timetable helpers (NEW v5)
  getTodayPeriods,
  getTodayClasses,
  getPeriod,
  getPeriodsForClass,

  // subjects (NEW v6 — first-class)
  getSubjects,
  getSubject,
  getClassesForSubject,
  getPeriodsForSubject,
  getSubjectsForDay,
  getAttendanceSummaryForSubject,

  // students
  getStudents,
  getStudentsForPeriod,

  // attendance — period-based (NEW v5)
  getAttendance,
  setAttendancePeriod,
  bulkSetAttendancePeriod,
  isPeriodChecked,
  getCheckedPeriods,
  getAttendanceSummaryForPeriod,

  // attendance — class-based (backward compat)
  setAttendance,
  bulkSetAttendance,
  clearAttendance,
  getAttendanceSummary,

  // scores
  getStudentScores,
  setScore,
  calcGrade,
  getClassScores,

  // assignments
  getAssignments,
  addAssignment,

  // student profile
  getStudentAttendStats,
  getRecentAttendance,
};

/* ─────────────────────────────────────────
   CLOUD SYNC — Supabase (v5.1)
   offline-first: localStorage เป็นหลัก
   - เขียน → save local ทันที + push ขึ้น cloud เบื้องหลัง
   - เปิดหน้า → pull จาก cloud มา merge
   - push ไม่สำเร็จ → เก็บใน outbox, ส่งใหม่อัตโนมัติ
───────────────────────────────────────── */
const SB_URL = 'https://pxjomsfyczfdbmjhaffq.supabase.co';
const SB_KEY = 'sb_publishable_Pjn4kk9obTsNjnavnOBm3Q_d_vlf3z2';
const OUTBOX_KEY = 'ck_v5_outbox';

let sb = null;
const cloud = { status:'connecting', lastSync:null, pull:pullCloud };
window.CK.cloud = cloud;

function outboxLoad(){ try{ return JSON.parse(localStorage.getItem(OUTBOX_KEY))||[]; }catch(e){ return []; } }
function outboxSave(q){ try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify(q)); }catch(e){} }

async function pushCloud(table, rows){
  if(!rows || !rows.length) return;
  if(!sb){ outboxSave(outboxLoad().concat([{table, rows}])); return; }
  try{
    const {error} = await sb.from(table).upsert(rows);
    if(error) throw error;
    cloud.status = 'online';
  }catch(e){
    console.warn('[CK cloud] push ไม่สำเร็จ — เก็บเข้า outbox:', e.message);
    outboxSave(outboxLoad().concat([{table, rows}]));
    cloud.status = 'offline';
  }
}

async function flushOutbox(){
  const q = outboxLoad();
  if(!q.length || !sb) return;
  outboxSave([]);
  for(const item of q) await pushCloud(item.table, item.rows);
}

function attRows(scope, dateKey, records){
  const now = new Date().toISOString();
  return records.map(r=>({
    scope, date_key:dateKey, student_id:r.id,
    status:r.status, note:r.note||'', updated_at:now,
  }));
}

async function pullCloud(){
  if(!sb) return;
  try{
    const [att, sc] = await Promise.all([
      sb.from('attendance').select('*'),
      sb.from('scores').select('*'),
    ]);
    if(att.error) throw att.error;
    if(sc.error) throw sc.error;

    // pre-generate students ของ class ที่มีข้อมูล class-based (backward compat)
    const periodIds = new Set(ALL_PERIODS.map(p=>p.periodId));
    const classScopes = [...new Set(att.data.filter(r=>!periodIds.has(r.scope)).map(r=>r.scope))];
    classScopes.forEach(cid=>{ if(CLASSES_META.find(c=>c.id===cid)) getStudents(cid); });

    const store = load();
    if(!store.attendance) store.attendance = {};
    att.data.forEach(r=>{
      if(periodIds.has(r.scope)){
        if(!store.attendance[r.scope]) store.attendance[r.scope] = {};
        if(!store.attendance[r.scope][r.date_key]) store.attendance[r.scope][r.date_key] = {};
        store.attendance[r.scope][r.date_key][r.student_id] = {status:r.status, note:r.note};
      } else {
        const stu = store.students?.[r.scope]?.find(s=>s.id===r.student_id);
        if(stu) stu.history[r.date_key] = {status:r.status, note:r.note};
      }
    });
    if(!store.scores) store.scores = {};
    sc.data.forEach(r=>{
      if(!store.scores[r.class_id]) store.scores[r.class_id] = {};
      if(!store.scores[r.class_id][r.student_id]) store.scores[r.class_id][r.student_id] = {};
      store.scores[r.class_id][r.student_id][r.assignment_id] = r.score;
    });
    save(store);

    cloud.status = 'online';
    cloud.lastSync = new Date();
    window.dispatchEvent(new CustomEvent('ck:sync'));
  }catch(e){
    console.warn('[CK cloud] pull ไม่สำเร็จ:', e.message);
    cloud.status = 'offline';
  }
}

/* wrap write APIs — local ก่อน แล้ว push เบื้องหลัง */
const _setAttendancePeriod = window.CK.setAttendancePeriod;
window.CK.setAttendancePeriod = function(periodId, dateKey, studentId, status, note){
  _setAttendancePeriod(periodId, dateKey, studentId, status, note);
  pushCloud('attendance', attRows(periodId, dateKey, [{id:studentId, status, note}]));
};

const _bulkSetAttendancePeriod = window.CK.bulkSetAttendancePeriod;
window.CK.bulkSetAttendancePeriod = function(periodId, dateKey, records){
  _bulkSetAttendancePeriod(periodId, dateKey, records);
  pushCloud('attendance', attRows(periodId, dateKey, records));
};

const _setAttendance = window.CK.setAttendance;
window.CK.setAttendance = function(classId, dateKey, studentId, status, note){
  _setAttendance(classId, dateKey, studentId, status, note);
  pushCloud('attendance', attRows(classId, dateKey, [{id:studentId, status, note}]));
};

const _bulkSetAttendance = window.CK.bulkSetAttendance;
window.CK.bulkSetAttendance = function(classId, dateKey, records){
  _bulkSetAttendance(classId, dateKey, records);
  pushCloud('attendance', attRows(classId, dateKey, records));
};

const _setScore = window.CK.setScore;
window.CK.setScore = function(classId, studentId, assignmentId, score){
  _setScore(classId, studentId, assignmentId, score);
  pushCloud('scores', [{
    class_id:classId, student_id:studentId, assignment_id:assignmentId,
    score:(score===undefined?null:score), updated_at:new Date().toISOString(),
  }]);
};

const _clearAttendance = window.CK.clearAttendance;
window.CK.clearAttendance = function(classId, dateKey){
  _clearAttendance(classId, dateKey);
  if(sb) sb.from('attendance').delete().eq('scope', classId).eq('date_key', dateKey)
    .then(({error})=>{ if(error) console.warn('[CK cloud] clear ไม่สำเร็จ:', error.message); });
};

/* init — โหลด supabase-js จาก CDN */
(function initCloud(){
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload = function(){
    sb = window.supabase.createClient(SB_URL, SB_KEY);
    flushOutbox().then(pullCloud);
  };
  s.onerror = function(){
    cloud.status = 'offline';
    console.warn('[CK cloud] โหลด supabase-js ไม่ได้ — ทำงาน offline ต่อ');
  };
  document.head.appendChild(s);
})();

window.addEventListener('online', function(){
  if(sb){ flushOutbox().then(pullCloud); }
});

})();
