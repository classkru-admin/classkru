/**
 * ClassKru — Shared Data Layer
 * ทุกหน้าอ่าน/เขียนผ่าน window.CK เท่านั้น
 * ข้อมูลเก็บใน localStorage key: "ck_v1"
 */
(function(){

const KEY = 'ck_v1';

const NAMES_MASTER = [
  ['กฤษณะ','เจริญสุข'],['ขวัญชัย','มีสุข'],['คณิตา','รักเรียน'],
  ['งามนิตย์','ใจดี'],['จันทร์เพ็ญ','สว่างจิต'],['ฉันทนา','บุญมา'],
  ['ชนาภา','ทองดี'],['ญาณิศา','ศรีสุข'],['ฐิติรัตน์','พงษ์ไทย'],
  ['ณัฐพล','วงษ์สวรรค์'],['ดวงหทัย','เพชรงาม'],['ตะวัน','โชติมา'],
  ['ทิพย์วรรณ','สมบัติ'],['ธนภัทร','ชัยชนะ'],['นภาพร','แสงทอง'],
  ['บุษบา','พิมพ์ดี'],['ปิยะนุช','ขยันเรียน'],['ผกามาศ','ดีงาม'],
  ['พลอยไพลิน','รุ่งเรือง'],['ภัทรพล','ศิริมงคล'],['มนัสนันท์','วิชาดี'],
  ['ยุพา','แก้วใส'],['รัตนา','ทองพูล'],['ลลิตา','สุขสันต์'],
  ['วริศรา','ประเสริฐ'],['ศิริพร','เด่นดวง'],['สมหมาย','ใจงาม'],
  ['อนุชา','สมาธิ'],['อรอุมา','มั่นคง'],['อัจฉรา','เก่งกล้า'],
  ['อานนท์','สุขใจ'],['อิสรา','ผลดี'],['อุไรวรรณ','ดาวดี'],['เอมอร','หมั่นเพียร']
];

const COLS = [
  {bg:'#f0fdf4',c:'#15803d'},{bg:'#eff6ff',c:'#1d4ed8'},
  {bg:'#fffbeb',c:'#b45309'},{bg:'#fdf2f8',c:'#be185d'},
  {bg:'#f5f3ff',c:'#6d28d9'},{bg:'#fff7ed',c:'#c2410c'},
  {bg:'#f0f9ff',c:'#0369a1'},{bg:'#ecfdf5',c:'#065f46'},
];

const CLASSES_META = [
  {id:'m31',name:'ม.3/1',subject:'วิทยาศาสตร์',count:34,dot:'#1d9e75'},
  {id:'m32',name:'ม.3/2',subject:'วิทยาศาสตร์',count:32,dot:'#3b82f6'},
  {id:'m21',name:'ม.2/1',subject:'วิทยาศาสตร์',count:30,dot:'#f59e0b'},
  {id:'m11',name:'ม.1/1',subject:'วิทยาศาสตร์',count:36,dot:'#ec4899'},
];

function fmtKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** โหลด store จาก localStorage */
function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch(e){ return {}; }
}

/** บันทึก store ลง localStorage */
function save(store){
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch(e){}
}

/** สร้าง mock history 29 วันย้อนหลัง */
function buildHistory(){
  const h = {};
  const today = new Date();
  for(let d=29;d>=1;d--){
    const dt = new Date(today); dt.setDate(today.getDate()-d);
    if(dt.getDay()===0||dt.getDay()===6) continue;
    const r = Math.random();
    h[fmtKey(dt)] = {
      status: r<.82?'present':r<.89?'late':r<.95?'absent':'leave',
      note:''
    };
  }
  return h;
}

/**
 * คืน array นักเรียนของ classId
 * ถ้ายังไม่มีใน store จะสร้าง mock แล้วบันทึก
 */
function getStudents(classId){
  const store = load();
  if(!store.students) store.students = {};
  if(!store.students[classId]){
    const meta = CLASSES_META.find(c=>c.id===classId);
    const count = meta ? meta.count : 34;
    store.students[classId] = Array.from({length:count},(_,i)=>{
      const n = NAMES_MASTER[i % NAMES_MASTER.length];
      const col = COLS[i % COLS.length];
      return {id:i, no:i+1, fn:n[0], ln:n[1], col, history: buildHistory()};
    });
    save(store);
  }
  return store.students[classId];
}

/**
 * บันทึกสถานะเช็คชื่อของนักเรียน 1 คน
 */
function setAttendance(classId, dateKey, studentId, status, note){
  const store = load();
  if(!store.students || !store.students[classId]) getStudents(classId);
  const fresh = load();
  const stu = fresh.students[classId].find(s=>s.id===studentId);
  if(stu){
    stu.history[dateKey] = {status, note: note||''};
    save(fresh);
  }
}

/**
 * บันทึกทั้งห้องในคราวเดียว (array of {id, status, note})
 */
function bulkSetAttendance(classId, dateKey, records){
  const store = load();
  if(!store.students || !store.students[classId]) getStudents(classId);
  const fresh = load();
  records.forEach(r=>{
    const stu = fresh.students[classId].find(s=>s.id===r.id);
    if(stu) stu.history[dateKey] = {status:r.status, note:r.note||''};
  });
  save(fresh);
}

/** คืน {present,late,absent,leave} summary ของวันนั้น */
function getAttendanceSummary(classId, dateKey){
  const students = getStudents(classId);
  const c = {present:0,late:0,absent:0,leave:0,total:students.length};
  students.forEach(s=>{
    const r = s.history[dateKey];
    if(r && c[r.status]!==undefined) c[r.status]++;
  });
  return c;
}

/** expose */
window.CK = {
  CLASSES: CLASSES_META,
  fmtKey,
  getStudents,
  setAttendance,
  bulkSetAttendance,
  getAttendanceSummary,
};

})();
