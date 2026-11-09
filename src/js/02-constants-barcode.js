// ─── CONSTANTS ─────────────────────────────────────────────
let COLORS={'01':'לבן','02':'שחור','03':'אדום','04':'כחול','05':'ירוק','06':'צהוב','07':'אפור','08':'ורוד','09':'חום','10':'כתום','11':'נייבי','12':'בז\'','13':'טורקיז','14':'בורדו','15':'זית','16':'לילך','17':'קרם','18':'כסוף','19':'זהב','20':'שחור מלנג\''};
const COLORS_AR={'01':'أبيض','02':'أسود','03':'أحمر','04':'أزرق','05':'أخضر','06':'أصفر','07':'رمادي','08':'وردي','09':'بني','10':'برتقالي','11':'كحلي','12':'بيج','13':'تركواز','14':'بوردو','15':'زيتي','16':'ليلكي','17':'كريمي','18':'فضي','19':'ذهبي','20':'أسود مخلوط'};
const WORKER_PAGES=[
  {id:'dash',label:'לוח בקרה'},
  {id:'att',label:'נוכחות'},
  {id:'scan',label:'סריקה'},
  {id:'tasks',label:'משימות'},
  {id:'reports',label:'דוחות'},
  {id:'alerts',label:'התראות'},
  {id:'taskscan',label:'סורק משימות'},
  {id:'expenses',label:'💸 הוצאות'},
  {id:'cashbox',label:'🧾 קופה'},
  {id:'dnotes',label:'📄 תעודות משלוח'},
];
const SUPERVISOR_EXTRA_PAGES=[
  {id:'mgrtasks',label:'ניהול משימות'},
  {id:'attrep',label:'דוח נוכחות'},
  {id:'products',label:'מוצרים'},
  {id:'barcodes',label:'מחולל ברקודים'},
];
// 🔓 עמודים שנפתחים **רק בסימון מפורש** של המנהל ואף פעם לא בברירת מחדל.
// עובד ותיק שנשמר בלי שדה permissions נופל לרשימת העמודים המלאה של התפקיד שלו,
// ובלי החריג הזה תעודות המשלוח (עם שמות, כתובות וטלפונים של לקוחות) היו נפתחות
// לכולם בשקט ברגע שהעמוד נוסף.
const OPTIN_PAGES=['dnotes'];
const defaultPerms=avail=>avail.filter(p=>!OPTIN_PAGES.includes(p));
const ALL_WORKER_PAGE_IDS=WORKER_PAGES.map(p=>p.id);
// הפסקת ברירת מחדל לעובד חדש. 19/09/2026: הייתה 13:00–13:45 בזמן שכל 10 העובדות
// בפועל יוצאות להפסקה 10:30–11:00 ⇒ עובדת חדשה (ام يوسف) קיבלה 45 ד' במקום 30 ד',
// והרשומה של היום הראשון שלה נצרבה עם המספר השגוי (7:45 נטו במקום 8:00).
const DEF_BREAK_START='10:30';
const DEF_BREAK_END='11:00';
// ☕ (24/10/2026) ברירת המחדל להפסקה נשמרת ב-appSettings/breakDefault ({start,end}) — נקבעת ב"החל על
// כל העובדים" (שעון קיץ/חורף). DEF_BREAK_* = רק כשעוד לא נקבעה. משמש לעובד חדש / עובד בלי הפסקה.
const defBreakStart=()=>S.settings?.breakDefault?.start||DEF_BREAK_START;
const defBreakEnd=()=>S.settings?.breakDefault?.end||DEF_BREAK_END;
// ✏️ מה שהוקלד בשורות "לכולם" (הפסקה / שעות גישה) — renderMgrTasks/renderAdmin רצים שוב כל כמה שניות
// (מאזינים), ובלי זה ההקלדה הוחלפה בערך הישן לפני הלחיצה (24/10: הוקלד 10:00–10:30, הוחל 10:30–11:00).
// מוגדר כאן, בראש הקובץ — רינדור שרץ בזמן הטעינה לא ייפול על let שעוד לא אותחל.
let _brkDraft={},_awDraft={};
const ALL_SUPERVISOR_PAGE_IDS=[...ALL_WORKER_PAGE_IDS,...SUPERVISOR_EXTRA_PAGES.map(p=>p.id)];
const pad2=n=>String(n).padStart(2,'0');
// עיגול למטה: צפי עם שבר (66.1 דק') הציג "00:23:18.0000000000000455"
const fmtS=s=>(s=Math.floor(s),pad2(Math.floor(s/3600))+':'+pad2(Math.floor(s/60)%60)+':'+pad2(s%60));
const fmtM=s=>Math.round(s/60)+' '+(window.T?.dash_min||"דק'");
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());};
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// לְברוח מחרוזת שנכנסת כארגומנט JS בתוך onclick='...' — קודם גרש+בקסלאש ל-JS, אח"כ esc ל-HTML. שם עם גרש (ג'מאל) לא ישבור את הקוד.
const escj=s=>esc(String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): taskBc — ברקוד מלא של משימה (תאימות למשימות ישנות בלי שדה bc)
// ─── אורך הברקוד: 13 (ישן) או 16 (עם מספר הזמנה) ─────────────
// מבנה: לקוח(2) מוצר(5) מידה(1) כמות(3) צבע(2) [ מספר-הזמנה(3) ]
// 🔑 מספר ההזמנה נוסף **בסוף** בכוונה: כל ה-slice הקיימים — slice(0,2)/(2,7)/(7,8)/
// (8,11)/(11,13) — נשארים נכונים לשני האורכים. מדבקה בת 13 שתלויה במפעל ממשיכה לעבוד
// בדיוק כמו קודם, ומקבלת orderNo=0 = "הזמנה מלפני השינוי".
const BC_LEN_OLD=13,BC_LEN_NEW=16;
const isBcLen=n=>n===BC_LEN_OLD||n===BC_LEN_NEW;
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): orderNoOf — מספר ההזמנה מתוך הברקוד
// צ'יפ "הזמנה #NNN" לתצוגת מקדימה בשלושת הסורקים. ריק לברקוד ישן — אין מה להציג.
const bcOrderChip=v=>{
  const n=orderNoOf(v);
  return n?`<span class="bc-seg" style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-weight:700">הזמנה #${String(n).padStart(3,'0')}</span>`:'';
};
// חילוץ ברקוד מקריאת מצלמה. ⚠️ הקוד הישן עשה תמיד slice(0,13) — ברקוד 16 ספרות היה
// נקטם **בשקט** ל-13 ומתפרש כברקוד אחר לגמרי (ספירה כפולה). מעדיפים 16 כשיש 16.
// '' = לא ברקוד משימה.
function bcFromScan(text){
  const d=String(text||'').replace(/\D/g,'');
  if(d.length>=BC_LEN_NEW)return d.slice(0,BC_LEN_NEW);
  if(d.length>=BC_LEN_OLD)return d.slice(0,BC_LEN_OLD);
  return '';
}
// 🔐 ברקוד חתום (01/11/2026) — רק מדבקה שהאפליקציה הדפיסה עוברת בסורק. ה-QR = הספרות + '-' + 6 אותיות
// (sha256 של מפתח+ספרות). אותיות בלבד ⇒ כל מסלול שמוריד את מה שאינו ספרה (bcFromScan וכו') מקבל את
// אותן ספרות כמו קודם. המפתח והמתג ב-telegramSettings (bcKey/bcSignOn — כתיבה מנהל, קריאה לכולם).
// אכיפה: עובד/אחראי — רק ברקוד שנסרק (מצלמה/NFC) עם חתימה תקינה. הקלדה ידנית / מדבקה ישנה / QR
// שהוכן בחוץ — מנהל בלבד. מדבקה שהודפסה לפני יצירת המפתח — להדפיס מחדש. ⚠️ החלפת מפתח = כל המדבקות נפסלות.
function bcSig(d){const k=S.settings?.bcKey;if(!k)return '';const h=sha256(k+'|'+d);let r='';for(let i=0;i<6;i++)r+=String.fromCharCode(65+parseInt(h.slice(i*4,i*4+4),16)%26);return r;}
function bcQr(code){const c=String(code??'');if(!/^\d{13}(\d{3})?$/.test(c))return c;const g=bcSig(c);return g?c+'-'+g:c;}
const _bcOk={}; // שדה (bc/ts/mgr) ⇒ הספרות האחרונות שנסרקו עם חתימה תקינה
function bcScanMark(f,text,bc){const m=String(text||'').match(/-([A-Z]{6})\s*$/);_bcOk[f]=m&&bc&&m[1]===bcSig(bc)?bc:'';}
function bcSignOn(){return !!(S.settings?.bcSignOn&&S.settings?.bcKey);}
function bcSignGate(f,raw){
  if(!bcSignOn()||S.user?.role==='manager'||(raw&&_bcOk[f]===raw))return true;
  const T=LANGS[currentLang]||{};
  showToast(T.bc_unsigned||'⛔ ברקוד לא מוכר — סרוק מדבקה שהודפסה מהאפליקציה (הקלדה ידנית — מנהל בלבד)','var(--red-txt)',7000);
  return false;
}
// ─── 📶 מדבקות NFC — חלופה לברקוד המודפס, לא במקומו ─────────────────────
// המדבקה מכילה רשומת NDEF טקסט עם **אותן ספרות** של הברקוד — אין טבלת שיוך ב-Firebase.
// הקריאה נכנסת בדיוק למסלול של המצלמה (bcFromScan → parseBc/submitBc וכו').
// Web NFC קיים רק ב-Chrome באנדרואיד ⇒ בלי תמיכה (אייפון/מחשב) הכפתורים לא מוצגים כלל.
function nfcOk(){return 'NDEFReader' in window;}
let _nfcAbort=null;
function nfcStop(){try{_nfcAbort?.abort();}catch(e){}_nfcAbort=null;document.getElementById('nfc-ov')?.remove();}
function _nfcOv(title,sub){
  let ov=document.getElementById('nfc-ov');
  if(!ov){ov=document.createElement('div');ov.id='nfc-ov';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(ov);}
  ov.innerHTML=`<div style="background:var(--card,#fff);color:var(--txt,#000);border-radius:12px;padding:20px;max-width:340px;width:100%;text-align:center">
    <div style="font-size:42px">📶</div>
    <div style="font-size:16px;font-weight:700;margin:6px 0">${title}</div>
    <div style="font-size:13px;color:var(--txt2,#555);line-height:1.7">${sub||''}</div>
    <button class="btn full" style="margin-top:14px" onclick="nfcStop()">ביטול</button></div>`;
}
function _nfcErr(e){
  if(e?.name==='NotAllowedError')return 'אין הרשאת NFC — אשר את ההרשאה בדפדפן ונסה שוב';
  if(e?.name==='NotSupportedError'||e?.name==='NotReadableError')return 'ה-NFC כבוי — הפעל NFC בהגדרות הטלפון ונסה שוב';
  return 'שגיאת NFC: '+(e?.message||e);
}
function _nfcText(rec){
  try{
    if(rec.recordType==='text')return new TextDecoder(rec.encoding||'utf-8').decode(rec.data);
    if(rec.recordType==='url'||rec.recordType==='absolute-url')return new TextDecoder().decode(rec.data);
  }catch(e){}
  return '';
}
// סיום בלי לשחרר מיד את ה-NFC: אם המדבקה עדיין צמודה כשהסריקה נעצרת, אנדרואיד
// פותח את מסך המערכת "התגית החדשה נסרקה". מחזיקים את הסריקה עוד 3 שנ' (בלי חלון).
function _nfcLinger(ac){
  document.getElementById('nfc-ov')?.remove();
  setTimeout(()=>{if(_nfcAbort===ac)nfcStop();},3000);
}
// קריאה אחת: מחכה למדבקה, מעביר את הטקסט שלה ל-cb ונסגר
async function nfcRead(cb){
  if(!nfcOk())return;
  nfcStop();
  const ac=new AbortController();_nfcAbort=ac;
  let done=false;
  _nfcOv('קרב את הטלפון למדבקה','החזק את גב הטלפון צמוד למדבקה');
  const r=new NDEFReader();
  r.onreadingerror=()=>{if(_nfcAbort===ac&&!done)_nfcOv('קרב את הטלפון למדבקה','⚠ לא הצלחתי לקרוא — נסה שוב');};
  r.onreading=e=>{
    if(_nfcAbort!==ac||done)return;
    done=true;
    const txt=(e.message?.records||[]).map(_nfcText).find(Boolean)||'';
    _nfcLinger(ac);
    if(navigator.vibrate)navigator.vibrate(80);
    cb(txt);
  };
  try{await r.scan({signal:ac.signal});}
  catch(e){nfcStop();if(e.name!=='AbortError')alert(_nfcErr(e));}
}
// קריאה לעמוד סריקה — ממלא את אותו שדה וקורא לאותן פונקציות כמו המצלמה
// מדבקת עובד (EMP:) / תחנה (STN:) — אותה התנהגות כמו במצלמה של אותו עמוד
function nfcScanTo(where){
  nfcRead(txt=>{
    const T=LANGS[currentLang];
    txt=(txt||'').trim();
    if(txt.startsWith('STN:')){
      const sid=txt.slice(4).trim();
      const empId=where==='bc'?S.user?.id:document.getElementById(where+'-emp-sel')?.value;
      if(empId)assignWorkerStation(empId,sid);
      else showToast(T.st_sel_worker||'⚠ בחר עובד לפני סריקת תחנה','var(--red-txt)');
      return;
    }
    if(txt.startsWith('EMP:')){
      const empId=txt.slice(4).trim(),w=S.workers.find(x=>x.id===empId);
      const sel=where==='bc'?null:document.getElementById(where+'-emp-sel');
      if(!sel){showToast('⚠ זו מדבקת עובד — כאן סורקים מדבקת משימה או תחנה','var(--red-txt)');return;}
      if(!w){showToast(T.sc_emp_notfound||'⚠ עובד לא נמצא','var(--red-txt)');return;}
      if(sel.disabled){showToast('⚠ אי אפשר להחליף עובד כאן','var(--red-txt)');return;}
      sel.value=empId;
      if(where==='ts')renderStepRecs('ts');else onScanEmpChange('mgr');
      showToast((T.sc_emp_ok||'✅ עובד זוהה: ')+w.name,'var(--green-txt)');
      return;
    }
    const bc=bcFromScan(txt);
    if(!bc){showToast('⚠ המדבקה ריקה או שאינה ברקוד משימה','var(--red-txt)');return;}
    bcScanMark(where,txt,bc);
    if(where==='bc'){
      try{stopCam();}catch(e){}
      document.getElementById('bc-inp').value=bc;parseBc(bc);
      showToast('✅ נקרא: '+bc,'var(--green-txt)');
      setTimeout(()=>submitBc(),300);
    }else if(where==='ts'){
      try{tsStopCam();}catch(e){}
      document.getElementById('ts-bc-inp').value=bc;tsParseBc(bc);
      showToast('✅ נקרא: '+bc,'var(--green-txt)');
    }else if(where==='mgr'){
      try{mgrStopCam();}catch(e){}
      document.getElementById('mgr-bc-inp').value=bc;parseMgrBc(bc);
      showToast('✅ נקרא: '+bc,'var(--green-txt)');
    }
  });
}
// כפתור 📶 על כרטיס ברקוד במחולל — מסך בלבד (bcPrint מסיר .bc-nfc מההדפסה)
function _bcNfcBtn(card,code,lbl){
  card.dataset.code=code;card.dataset.nfcLbl=lbl||'';
  if(!nfcOk())return;
  const b=document.createElement('button');
  b.type='button';b.className='btn bc-nfc';b.textContent='📶';b.title='כתוב למדבקת NFC';
  b.style.cssText='position:absolute;bottom:6px;left:6px;padding:4px 8px;font-size:14px;z-index:5';
  b.onclick=()=>bcNfcWriteOne(code,lbl);
  card.appendChild(b);
}
async function bcNfcWriteOne(code,lbl){
  if(!nfcOk())return;
  nfcStop();
  const ac=new AbortController();_nfcAbort=ac;
  _nfcOv('קרב את הטלפון למדבקה',(lbl?esc(lbl)+'<br>':'')+'<b>'+code+'</b>');
  try{
    // סריקה במקביל לכתיבה — כדי שאנדרואיד לא יפתח את מסך המערכת על המדבקה (ראה _nfcLinger)
    const r=new NDEFReader();r.onreading=()=>{};r.scan({signal:ac.signal}).catch(()=>{});
    await r.write({records:[{recordType:'text',lang:'en',data:bcQr(code)}]},{signal:ac.signal});
    _nfcLinger(ac);
    if(navigator.vibrate)navigator.vibrate(80);
    showToast('✅ נכתב למדבקה: '+code,'var(--green-txt)');
  }catch(e){nfcStop();if(e.name!=='AbortError')alert(_nfcErr(e));}
}
// ✍ כתיבה ברצף של כל הכרטיסים המסומנים. 🛑 הגנה מדריסה: מדבקה עם אותו מספר סידורי כמו
// הקודמת לא נכתבת שוב — אחרת טלפון שנשאר/חזר על אותה מדבקה היה דורס אותה בברקוד הבא.
async function bcNfcWriteAll(){
  if(!nfcOk())return;
  const area=document.getElementById('bc-print-area');if(!area)return;
  const cards=[...area.querySelectorAll('.bc-card')].filter(c=>{
    const cb=c.querySelector('.bc-sel');return c.dataset.code&&(!cb||cb.checked);});
  // 📦 עותקים — אותו ברקוד לכמה חבילות של אותה מידה (כמו להדפיס אותו כמה פעמים)
  const n=Math.min(20,Math.max(1,parseInt(document.getElementById('bc-nfc-copies')?.value)||1));
  _nfcWriteSeq(cards,'הדבק כל מדבקה על החבילה שלה מיד אחרי הכתיבה',n);
}
// מדבקות עובדים/תחנות: הכרטיסים המסומנים בלוח (data-code/data-nfc-lbl על הכרטיס)
function nfcWriteSelCards(outId,cls){
  const cards=[...document.querySelectorAll('#'+outId+' .'+cls)].filter(cb=>cb.checked).map(cb=>cb.parentElement).filter(c=>c.dataset.code);
  _nfcWriteSeq(cards,'הדבק כל מדבקה במקום שלה מיד אחרי הכתיבה');
}
async function _nfcWriteSeq(cards,hint,copies){
  if(!nfcOk())return;
  if(!cards.length){alert('בחר לפחות ברקוד אחד');return;}
  copies=copies||1;
  const seq=cards.flatMap(c=>Array.from({length:copies},(_,k)=>({c,k})));
  nfcStop();
  const ac=new AbortController();_nfcAbort=ac;
  let i=0,last='',busy=false;
  const show=msg=>_nfcOv(`מדבקה ${i+1} מתוך ${seq.length}`,
    esc(seq[i].c.dataset.nfcLbl||'')+'<br><b>'+seq[i].c.dataset.code+'</b>'
    +(copies>1?`<br><b style="color:var(--blue-txt,#1d4ed8)">עותק ${seq[i].k+1} מתוך ${copies}</b>`:'')
    +(msg?`<br><span style="color:var(--amber-txt,#b45309)">${msg}</span>`:'')
    +'<br><span style="font-size:11px">'+hint+'</span>');
  show();
  const r=new NDEFReader();
  r.onreadingerror=()=>{if(_nfcAbort===ac&&!busy&&i<seq.length)show('⚠ לא הצלחתי לקרוא את המדבקה — נסה שוב');};
  r.onreading=async e=>{
    if(_nfcAbort!==ac||busy||i>=seq.length)return;
    const sn=e.serialNumber||'';
    if(sn&&sn===last){show('זו המדבקה הקודמת — קרב מדבקה חדשה');return;}
    busy=true;
    const c=seq[i].c;
    try{
      await r.write({records:[{recordType:'text',lang:'en',data:bcQr(c.dataset.code)}]},{signal:ac.signal});
      last=sn;c.style.outline='3px solid #16a34a';
      if(navigator.vibrate)navigator.vibrate(80);
      i++;
      if(i>=seq.length){_nfcLinger(ac);showToast('✅ נכתבו '+seq.length+' מדבקות','var(--green-txt)');return;}
      show(seq[i].c!==c?'✅ נכתב — עוברים לברקוד הבא, קרב מדבקה חדשה':'✅ נכתב — הרחק את הטלפון וקרב את המדבקה הבאה');
    }catch(err){if(err.name!=='AbortError'&&_nfcAbort===ac)show('⚠ הכתיבה נכשלה — קרב שוב את אותה מדבקה');}
    finally{busy=false;}
  };
  try{await r.scan({signal:ac.signal});}
  catch(e){nfcStop();if(e.name!=='AbortError')alert(_nfcErr(e));}
}
// כפתורי 📶 בעמודי הסריקה מוסתרים כברירת מחדל — מוצגים רק במכשיר שתומך ב-NFC
(function(){const go=()=>{if(nfcOk())document.querySelectorAll('.nfc-only').forEach(e=>e.style.display='');};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',go):go();})();
// ברקוד "כל הכמות": size='9', col='00'
function isTotalBc(raw){return !!raw&&isBcLen(raw.length)&&raw.slice(7,8)==='9'&&raw.slice(11,13)==='00';}
// ברקוד "יצא ללקוח": size='9', col='99' (הצבעים 01-30 בלבד — אין התנגשות). מבנה: לקוח+מוצר+9+000+99
function isShipBc(raw){return !!raw&&isBcLen(raw.length)&&raw.slice(7,8)==='9'&&raw.slice(11,13)==='99';}
