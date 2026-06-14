/**
 * ClassKru — ck-import.js
 * Smart Import engine (V2 onboarding)
 *
 * Rule-based "fake smart" — ไม่ใช้ AI
 * รับ array ของ {name, rows} (rows = array of arrays จาก SheetJS)
 * คืน { sections, rosters, matches } สำหรับ preview
 *
 * ใช้ได้ทั้งใน browser (window.CKImport) และ Node (module.exports)
 */
(function(root){

// ── normalize ชื่อห้อง → format กลาง M{ระดับ}_{ห้อง} ──
// รองรับ: ม.1/1, ม1/1, ม 1/1, ม1-1, m1-1, M1_1
function normRoom(s){
  if(s===null||s===undefined) return null;
  s=String(s);
  // แปลง ม/m ทุกแบบเป็น M
  let t=s.replace(/ม\.?/g,'M').replace(/[mM]\.?/g,'M');
  const m=t.match(/M\s*([1-6])\s*[/\-_ ]\s*([0-9]+)/);
  if(m) return `M${m[1]}_${m[2]}`;
  return null;
}

// แปลง normRoom กลับเป็น display: M1_2 → "ม.1/2"
function roomDisplay(nr){
  if(!nr) return '';
  const m=nr.match(/M([1-6])_([0-9]+)/);
  return m ? `ม.${m[1]}/${m[2]}` : nr;
}

// ── หา header row อัตโนมัติ (ข้าม title row) ──
// คืน index ของแถวที่เป็น header จริง (-1 ถ้าไม่เจอ)
function findHeaderRow(rows, maxScan){
  maxScan = maxScan || Math.min(rows.length, 6);
  for(let i=0;i<maxScan;i++){
    const cells=(rows[i]||[]).map(c=>String(c==null?'':c).trim());
    const hasName=cells.some(h=>/^ชื่อ/.test(h)||/ชื่อ-?สกุล|ชื่อ-?นามสกุล/.test(h));
    const hasNo  =cells.some(h=>/เลขที่|^รหัส|ลำดับ/.test(h));
    if(hasName && hasNo) return i;
    // timetable header: มีชื่อวัน
    const DAYS=['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์'];
    if(cells.filter(h=>DAYS.some(d=>h.includes(d))).length>=2) return i;
  }
  return -1;
}

// normalize input: รับได้ทั้ง rows เดียว, {rows}, หรือ {sheets:[{sheetName,rows}]}
// คืน array ของ {sheetName, rows}
function toSheets(input){
  if(Array.isArray(input)) return [{sheetName:null, rows:input}];
  if(input && Array.isArray(input.sheets)) return input.sheets;
  if(input && Array.isArray(input.rows)) return [{sheetName:input.sheetName||null, rows:input.rows}];
  return [];
}

// ── แยกประเภทไฟล์: 'timetable' | 'roster' | 'unknown' ──
// รับ name + (rows | {sheets})
function classifyFile(name, data){
  const sheets=toSheets(data);
  if(!sheets.length) return 'unknown';
  // ถ้า sheet แรกมี header เป็นรายชื่อ หรือ timetable → ตัดสินจากนั้น
  for(const sh of sheets){
    const rows=sh.rows||[];
    const hi=findHeaderRow(rows);
    if(hi<0) continue;
    const header=(rows[hi]||[]).map(c=>String(c==null?'':c).trim());
    const hasName=header.some(h=>/ชื่อ/.test(h));
    const hasNo=header.some(h=>/เลขที่|รหัส|ลำดับ/.test(h));
    if(hasName && hasNo) return 'roster';
    const DAYS=['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์'];
    if(header.filter(h=>DAYS.some(d=>h.includes(d))).length>=2) return 'timetable';
    if(/คาบ|วัน/.test(header[0]||'') && header.filter(h=>DAYS.some(d=>h.includes(d))).length>=1) return 'timetable';
  }
  return 'unknown';
}

// ── อ่านตารางสอน → sections + schedules ──
const DAY_INDEX={'จันทร์':1,'อังคาร':2,'พุธ':3,'พฤหัส':4,'พฤหัสบดี':4,'ศุกร์':5,'เสาร์':6,'อาทิตย์':0};

function parseTimetable(rows){
  const sections={};   // key normRoom -> {subject, room, level, periods:[]}
  const schedules=[];  // {room(nr), subject, weekday, period, start, end}
  if(!rows||rows.length<2) return {sections, schedules};

  const header=(rows[0]||[]).map(c=>String(c==null?'':c).trim());
  // map column index → weekday
  const colDay={};
  header.forEach((h,i)=>{
    for(const d in DAY_INDEX){ if(h.includes(d)){ colDay[i]=DAY_INDEX[d]; break; } }
  });

  for(let r=1;r<rows.length;r++){
    const row=rows[r]||[];
    const periodCell=String(row[0]==null?'':row[0]);
    // ดึงเวลา "08:30-09:20" + ชื่อคาบ
    const timeM=periodCell.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    const start=timeM?timeM[1]:'';
    const end=timeM?timeM[2]:'';
    const periodName=periodCell.split(/[\n\r]/)[0].trim();

    for(let c=1;c<row.length;c++){
      const cell=String(row[c]==null?'':row[c]).trim();
      if(!cell) continue;
      const weekday=colDay[c];
      if(weekday===undefined) continue;
      const nr=normRoom(cell);
      // แยก "วิทยาศาสตร์ ม.1/1" → subject + room
      const m=cell.match(/^(.+?)\s+(ม\.?\s*[1-6]\s*[/\-_ ]\s*[0-9]+)\s*$/);
      const subject=m?m[1].trim():cell;
      const roomTxt=m?m[2].trim():roomDisplay(nr);
      const key=nr||cell;

      if(!sections[key]){
        sections[key]={
          subject, room:roomTxt, normRoom:nr,
          level: levelFromNorm(nr),
          periods:0,
        };
      }
      sections[key].periods++;
      schedules.push({normRoom:nr, subject, weekday, periodName, start, end});
    }
  }
  return {sections, schedules};
}

function levelFromNorm(nr){
  if(!nr) return 'junior';
  const m=nr.match(/M([1-6])_/);
  if(!m) return 'junior';
  const g=parseInt(m[1]);
  return g<=3?'junior':'senior'; // ม.1-3 = ต้น, ม.4-6 = ปลาย
}

// ── อ่าน 1 sheet รายชื่อ → {normRoom, students[]} ──
// รับ rows + sheetName (ใช้ดึงห้องถ้าไม่มีคอลัมน์ห้อง)
function parseRosterSheet(rows, sheetName){
  if(!rows||rows.length<2) return null;
  const hi=findHeaderRow(rows);
  if(hi<0) return null;
  const header=(rows[hi]||[]).map(c=>String(c==null?'':c).trim());
  const idx={};
  header.forEach((h,i)=>{
    if(/เลขที่|ลำดับ/.test(h) && idx.no===undefined) idx.no=i;
    else if(/^รหัส|รหัสนักเรียน|รหัสประจำ/.test(h)) idx.code=i;
    else if(/คำนำหน้า/.test(h)) idx.prefix=i;
    else if(/นามสกุล/.test(h)) idx.last=i;
    else if(/ชื่อ-?สกุล|ชื่อ-?นามสกุล/.test(h)) idx.fullname=i;
    else if(/^ชื่อ/.test(h) && idx.first===undefined) idx.first=i;
    else if(/ห้อง/.test(h)) idx.room=i;
  });
  // fallback: ถ้าไม่เจอคอลัมน์ชื่อเลย ใช้คอลัมน์ถัดจากรหัส
  if(idx.first===undefined && idx.fullname===undefined) return null;

  const students=[];
  let roomFromData=null;
  for(let r=hi+1;r<rows.length;r++){
    const row=rows[r]||[];
    let first='', last='';
    if(idx.fullname!==undefined){
      // ชื่อ-สกุล รวมคอลัมน์เดียว → แยก
      const full=stripPrefix(String(row[idx.fullname]==null?'':row[idx.fullname]).trim());
      const parts=full.split(/\s+/);
      first=parts[0]||''; last=parts.slice(1).join(' ');
    } else {
      first=String(row[idx.first]==null?'':row[idx.first]).trim();
      last=idx.last!==undefined?String(row[idx.last]==null?'':row[idx.last]).trim():'';
    }
    if(!first) continue;
    // ข้ามแถวที่เป็น title/ว่าง (เลขที่ไม่ใช่ตัวเลข และไม่มีสกุล)
    const noRaw=idx.no!==undefined?row[idx.no]:null;
    const no=parseInt(noRaw)|| (students.length+1);
    students.push({no, first_name:stripPrefix(first), last_name:last});
    if(!roomFromData && idx.room!==undefined) roomFromData=normRoom(row[idx.room]);
  }
  // ห้อง: 1) คอลัมน์ห้องในไฟล์ 2) ชื่อ sheet
  const room = roomFromData || normRoom(sheetName);
  return { normRoom:room, fromColumn:!!roomFromData, students };
}

// ── อ่านไฟล์รายชื่อ (อาจมีหลาย sheet) → [{normRoom, students, sheetName}] ──
function parseRosterFile(data, fileName){
  const sheets=toSheets(data);
  const results=[];
  for(const sh of sheets){
    const parsed=parseRosterSheet(sh.rows, sh.sheetName);
    if(parsed && parsed.students.length){
      results.push({...parsed, sheetName:sh.sheetName, fileName});
    }
  }
  return results;
}

// backward compat: parseRoster(rows) → 1 sheet
function parseRoster(rows){
  const r=parseRosterSheet(rows, null);
  return r ? {normRoom:r.normRoom, students:r.students} : null;
}

// ตัดคำนำหน้า ด.ช./ด.ญ./เด็กชาย/เด็กหญิง/นาย/นางสาว/นาง/น.ส.
function stripPrefix(name){
  return String(name).replace(/^(ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|นาย|นางสาว|นาง|น\.ส\.|นส\.|ดช\.|ดญ\.)\s*/,'').trim();
}

// ── จับคู่ roster unit → section (confidence) ──
// unit = {fileName, sheetName, normRoom, fromColumn, students}
// label = ชื่อที่แสดง (sheet ถ้ามีหลาย sheet, ไม่งั้นชื่อไฟล์)
function matchRosters(sectionRoomSet, units){
  return units.map(u=>{
    const fromData=u.normRoom;                 // จากคอลัมน์ห้อง หรือ ชื่อ sheet
    const fromFileName=normRoom(u.fileName);
    let matchedRoom=null, confidence='none';
    if(fromData && sectionRoomSet.has(fromData)){ matchedRoom=fromData; confidence='high'; }
    else if(fromFileName && sectionRoomSet.has(fromFileName)){ matchedRoom=fromFileName; confidence='medium'; }
    else if(fromData){ matchedRoom=fromData; confidence='medium'; }
    const label = u.sheetName ? `${u.fileName} › ${u.sheetName}` : u.fileName;
    return { name:label, fileName:u.fileName, sheetName:u.sheetName,
             matchedRoom, confidence, count:u.students.length, students:u.students };
  });
}

// ── MAIN: ประมวลผลทุกไฟล์ → ผลลัพธ์สำหรับ preview ──
// fileList = [{name, rows}] (เดิม) หรือ [{name, sheets:[{sheetName, rows}]}] (ใหม่)
function process(fileList){
  const classified=fileList.map(f=>({...f, type:classifyFile(f.name, f)}));

  // 1) หา timetable
  const ttFile=classified.find(f=>f.type==='timetable');
  let sections={}, schedules=[];
  if(ttFile){
    // timetable ใช้ sheet แรก
    const sh=toSheets(ttFile)[0];
    const r=parseTimetable(sh.rows);
    sections=r.sections; schedules=r.schedules;
  }

  // 2) parse roster ทุกไฟล์ (รวมหลาย sheet) → roster units
  let rosterUnits=[];
  classified.filter(f=>f.type==='roster').forEach(f=>{
    rosterUnits=rosterUnits.concat(parseRosterFile(f, f.name));
  });

  // 3) ถ้าไม่มีตาราง → สร้าง section จาก roster (วิชา/คาบ ว่างไว้ ครูเติมทีหลัง)
  if(!ttFile && rosterUnits.length){
    rosterUnits.forEach(u=>{
      if(u.normRoom && !sections[u.normRoom]){
        sections[u.normRoom]={
          subject:'', room:roomDisplay(u.normRoom), normRoom:u.normRoom,
          level:levelFromNorm(u.normRoom), periods:0, needsSubject:true,
        };
      }
    });
  }

  const sectionList=Object.values(sections);
  const sectionRoomSet=new Set(sectionList.map(s=>s.normRoom).filter(Boolean));

  // 4) match
  const matches=matchRosters(sectionRoomSet, rosterUnits);

  // 5) เติม count นักเรียนเข้า section
  const roomToCount={};
  matches.forEach(m=>{ if(m.matchedRoom) roomToCount[m.matchedRoom]=(roomToCount[m.matchedRoom]||0)+m.count; });
  sectionList.forEach(s=>{ s.studentCount=roomToCount[s.normRoom]||0; s.hasRoster=!!roomToCount[s.normRoom]; });

  return {
    timetableFound:!!ttFile,
    timetableName:ttFile?ttFile.name:null,
    createdFromRoster:!ttFile && sectionList.length>0,
    sections:sectionList,
    schedules,
    matches,
    unknownFiles:classified.filter(f=>f.type==='unknown').map(f=>f.name),
  };
}

const API={ normRoom, roomDisplay, classifyFile, parseTimetable, parseRoster, parseRosterSheet, parseRosterFile, matchRosters, process, stripPrefix, levelFromNorm, findHeaderRow, toSheets };
if(typeof module!=='undefined' && module.exports) module.exports=API;
if(root) root.CKImport=API;

})(typeof window!=='undefined'?window:null);
