// ─── BATCH STATE ─────────────────────────────────────────────
let _tsBatch=[];  // {raw,cust,prod,size,qty,col,isTotal,taskType,taskDept,prodStamp}
let _mgrBatch=[];
let _bcBatch=[];  // סל הסורק האישי (bc) — כמו _tsBatch + expMin לתצוגת צפי כולל
// מזהי המשימות שהעובד ביקש לסגור כשיתחיל את הסל. *כוונה* בלבד — הסגירה עצמה מתבצעת
// ב-bcStartBatch רק אחרי שנוצרה משימה חדשה במקומן. ראה ההסבר ב-submitBc.
let _bcCloseOnStart=[];
// כוונת **השהיה** (⏸ משימה זמנית) — אותה מכניקה בדיוק כמו _bcCloseOnStart: נשמרת
// כוונה בלבד, ומופעלת ב-bcStartBatch רק אחרי שנוצרה משימה חדשה במקומן.
let _bcPauseOnStart=[];
// ─── חסימת סריקה כפולה של אותו שלב (ברקוד+שלב) ─────────────────
// חותמת מופע-מוצר = תאריך הקמת המוצר (הרשומה העדכנית ביותר ללקוח+מוצר).
// הזמנה חדשה נכנסת כרשומת מוצר חדשה עם תאריך חדש ⇒ אינה נחסמת מול היסטוריה ישנה.
// חותמת של רשומת מוצר בודדת. `createdAt` הוא מקור האמת; ה-fallback ל-id קיים כי לרשומות
// הוותיקות ביותר אין את השדה, וה-id שלהן הוא חותמת זמן.
function prodStampOf(p){return +p.createdAt||parseInt(String(p.id).replace(/\D/g,''))||0;}
function prodStampFor(cust,prod){
  let mx=0;
  for(const p of (S.products||[])){
    if(p.cust!==cust||p.prod!==prod)continue;
    const c=prodStampOf(p);
    if(c>mx)mx=c;
  }
  return mx;
}
// ההזמנה **הראשונה** של הדגם — שם נוחתות משימות בלי prodStamp. ראה stepDoneMap.
function prodStampOldest(cust,prod){
  let mn=Infinity;
  for(const p of (S.products||[])){
    if(p.cust!==cust||p.prod!==prod)continue;
    const c=prodStampOf(p);
    if(c<mn)mn=c;
  }
  return isFinite(mn)?mn:0;
}
// האם ברקוד+שלב כבר פעיל (לא מושהה) או כבר בוצע עבור אותו מופע-מוצר.
// מושהות מוחרגות — הן מיועדות לחידוש בסריקה חוזרת. היסטוריה ישנה בלי חותמת נחסמת תמיד.
function stepAlreadyTaken(raw,taskType,stamp){
  const tt=taskType||'';
  const same=t=>t.bc===raw&&(t.taskType||'')===tt;
  if(S.activeTasks.some(t=>same(t)&&!t.paused))return 'active';
  if(S.histTasks.some(t=>{if(!same(t))return false;const s=taskStampOf(t);return s==null||s===stamp;}))return 'done';
  return '';
}
// ─── חסימת כפילות חוצת-מכשירים ────────────────────────────────
// כל הבדיקות שמעל קוראות את S.activeTasks — עותק *פר-מכשיר*. שני מכשירים שפותחים
// את אותה משימה בהפרש שניות לא רואים זה את זה, ומזהה המסמך אקראי (Date.now+random)
// ⇒ גם שתי הכתיבות ל-Firestore לא מתנגשות. נצפה חי 21/07: هنيه · 0114695105514 ·
// تركيب عيبود נפתחה פעמיים בהפרש 4.2 שנ' (offset שעון +801ms מול +7ms = שני מכשירים).
// שכבה 1 — קריאת שרת טרייה לפני הפתיחה: סוגרת בעירות cache של שניות.
// שכבה 2 — טרנזקציה על taskGuards במזהה דטרמיניסטי: אטומית גם למרוץ מילישניות.
// חלון חסד לשומר שנתפס אך מסמך המשימה שלו טרם נכתב (ראה claimTaskGuard).
// גדול בהרבה מסטיית שעון שנמדדה בין מכשירים (~0.8 שנ'), וקצר מכדי לתקוע עובד.
const GUARD_GRACE_MS=20000;
function _dupHash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return h.toString(36);}
// מזהה מסמך חוקי תמיד (שם שלב בערבית עלול להכיל '/' שאסור במזהה Firestore)
function taskGuardKey(workerId,bc,taskType,stamp){
  return 'g'+_dupHash(String(workerId)+'|'+String(bc)+'|'+String(taskType||'')+'|'+String(stamp||0));
}
// המשימות הפעילות של העובד ישירות מהשרת (לא מה-cache). כשל רשת ⇒ null = לא חוסמים.
async function serverActiveTasks(workerId){
  if(!db||!S.fbConnected)return null;
  try{
    const{collection,query,where,getDocsFromServer}=window._fb;
    const snap=await getDocsFromServer(query(collection(db,'activeTasks'),where('workerId','==',workerId)));
    return snap.docs.map(d=>({...d.data(),id:d.id}));
  }catch(e){return null;} // fail-open: תקלת רשת לא תעצור עבודה במפעל
}
function findDupIn(list,bc,taskType){
  if(!list)return null;
  const tt=String(taskType||'');
  return list.find(t=>!t.paused&&String(taskBc(t))===String(bc)&&String(t.taskType||'')===tt)||null;
}
// "תופס" את הצמד עובד+ברקוד+שלב בטרנזקציה. מחזיר {ok:false} רק כשקיימת משימה חיה ולא מושהית.
// אין סכנת "נעילה תקועה": השומר תקף רק כל עוד המשימה שהוא מצביע עליה קיימת —
// ברגע שהיא נסגרת/נמחקת הוא מיושן ונדרס מאליו, ולכן גם אין צורך לנקות שומרים.
async function claimTaskGuard(task){
  if(!db||!S.fbConnected)return{ok:true};
  const{doc,runTransaction}=window._fb;
  const key=taskGuardKey(task.workerId,task.bc,task.taskType,task.prodStamp);
  try{
    await runTransaction(db,async tx=>{
      const gRef=doc(db,'taskGuards',key);
      const g=await tx.get(gRef); // כל הקריאות לפני הכתיבה — דרישת Firestore
      const prevId=g.exists()?g.data().taskId:null;
      if(prevId&&String(prevId)!==String(task.id)){
        const prev=await tx.get(doc(db,'activeTasks',String(prevId)));
        // מסמך המשימה נכתב *אחרי* תפיסת השומר. בלי חלון החסד הזה, מרוץ אמיתי של
        // מילישניות היה רואה שומר טרי בלי משימה מאחוריו, פוסל אותו כמיושן ומכניס כפילות.
        const fresh=Date.now()-(+g.data().at||0)<GUARD_GRACE_MS;
        // שומר שהמשימה שלו הועברה לעובד אחר (transferTask) מיושן — העובד שבמפתח כבר לא הבעלים
        if(prev.exists()?(!prev.data().paused&&String(prev.data().workerId)===String(task.workerId)):fresh){const e=new Error('dup-active');e.code='dup-active';throw e;}
      }
      tx.set(gRef,{taskId:task.id,workerId:task.workerId,bc:task.bc,taskType:task.taskType||'',prodStamp:task.prodStamp||0,at:Date.now()});
    });
    return{ok:true};
  }catch(e){
    if(e&&e.code==='dup-active')return{ok:false};
    return{ok:true}; // כל תקלה אחרת (רשת/הרשאה) — fail-open, כמו שאר המערכת
  }
}
// ─── נעילת ריצה כפולה (re-entrancy) ───────────────────────────
// הכפתורים קוראים ישירות לפונקציות async, והשורה הראשונה בהן היא checkVersion()
// שמוריד את כל הדף (~665KB). על Wi-Fi איטי זה נתקע שניות *בלי שום חיווי* — אין
// ספינר ואין כפתור מושבת — המשתמש מסיק שהלחיצה לא נקלטה ולוחץ שוב, ושתי הריצות
// עוברות את בדיקת הכפילות לפני שאחת מהן הספיקה ליצור משימה.
// נצפה חי 21/07: האחראי פתח ל-هنيه את אותה משימה פעמיים מסורק המשימות (הפרש 4.2 שנ').
// claimTaskGuard תופס את זה בשרת, אבל כאן זה נחסם במקור — בלי round-trip מיותר.
const _busyOps={};
function _guardReentrant(fnName,key){
  const orig=window[fnName];
  if(typeof orig!=='function')return;
  window[fnName]=async function(...a){
    if(_busyOps[key]){ // הלחיצה השנייה: להגיד למשתמש שזה בעבודה, לא להתעלם בשקט
      try{showToast(LANGS[currentLang].busy_wait||'⏳ כבר מתחיל — רגע','var(--amber-txt)',2500);}catch(e){}
      return;
    }
    _busyOps[key]=true;
    try{return await orig.apply(this,a);}
    finally{delete _busyOps[key];}
  };
}
// מפתח נפרד לכל מסלול: submitBc קורא ל-bcStartBatch, ומפתח משותף היה חוסם את הקריאה הפנימית
_guardReentrant('tsStartTask','ts');
_guardReentrant('mgrStartTask','mgr');
_guardReentrant('submitBc','submitBc');
_guardReentrant('bcStartBatch','bcStartBatch');
// 🚚 נצפה חי 16/09: שלוש תעודות (0662-0664) לאותה הזמנה, 176 יח' כל אחת — החלון נשאר
// פתוח בזמן מונה המספור והשמירה, וכל לחיצה נוספת על "אשר יציאה" הוסיפה משלוח ומספר חדש
_guardReentrant('confirmShip','confirmShip');
// ✏️ אותו סיפור בשמירת תיקון — לחיצה כפולה הייתה רושמת שתי שורות תיקון
_guardReentrant('saveShipEdit','saveShipEdit');
// ─── התנגשות "כל הכמות" מול מידה בודדת, לאותו שלב ────────────
// ברקוד "כל הכמות" (size='9', col='00') מייצג את *כל* יחידות ההזמנה לשלב. סריקת מידה בודדת
// לאותו שלב סופרת שוב יחידות שכבר נכללות בו — וגם ההפך. chk: stepAlreadyTaken חוסם רק ברקוד
// זהה, ולשני אלה ברקוד שונה ⇒ שניהם עברו. נצפה חי 16/07: تحضير لسنات הראה 252/216 =
// 216 ("כל הכמות", رائده) + 18 + 18 (מידות, ايمان) — אותן יחידות נספרו פעמיים.
// מחזיר 'total' (נחסם ע"י "כל הכמות" קיים) / 'sizes' (נחסם ע"י מידות קיימות) / '' (תקין).
const _taskIsTotal=t=>t.isTotal!=null?!!t.isTotal:isTotalBc(t.bc||taskBc(t));
// לאיזו **הזמנה** שייך ברקוד. אותו לקוח+מוצר יכול להיות כמה הזמנות במקביל (הזמנה
// חוזרת = רשומת מוצר חדשה), והברקוד אינו נושא מזהה הזמנה — רק מידה+כמות+צבע. לכן
// מזהים לפי שורת הכמויות שתואמת **בדיוק**, ומחזירים את חותמת הרשומה.
// ⚠️ ברקוד "כל הכמות" (מידה 9, צבע 00) **זהה לחלוטין בין ההזמנות** — שם מזהים לפי סך
// היחידות של המשימה, ואם אינו מכריע נופלים לרשומה החדשה ביותר, כמו getTotalQty.
// '' = לא ניתן להכריע ⇒ המתקשר חייב לנהוג שמרנית (להתייחס כאותה הזמנה).
// מוצר עם רשומה אחת בלבד מחזיר '' מיידית — אפס שינוי התנהגות ל-45 מתוך 46 הצירופים.
function _orderStampOf(cust,prod,size,col,qty,isTot){
  const recs=(S.products||[]).filter(p=>p&&p.cust===cust&&p.prod===prod);
  if(recs.length<2)return '';
  const stampOf=p=>+p.createdAt||parseInt(String(p.id).replace(/\D/g,''))||0;
  const totOf=p=>(p.quantities||[]).reduce((s,x)=>s+(parseInt(x.qty)||0),0);
  const q=parseInt(qty)||0;
  if(isTot){
    const m=q>0?recs.filter(p=>totOf(p)===q):[];
    return m.length===1?String(stampOf(m[0])):String(Math.max(...recs.map(stampOf)));
  }
  const m=recs.filter(p=>(p.quantities||[]).some(x=>
    String(x.size)===String(size)&&String(x.color)===String(col)&&(parseInt(x.qty)||0)===q));
  return m.length===1?String(stampOf(m[0])):'';
}
function totalScanConflict(base,taskType,stamp,cart){
  const tt=taskType||'';
  const live=t=>{const s=taskStampOf(t);return s==null||s===stamp;};
  // 🔴 prodStamp לבדו **אינו מפריד בין שתי הזמנות פעילות של אותו מוצר** — prodStampFor
  // מחזיר תמיד את חותמת הרשומה החדשה ביותר. בלי ההפרדה כאן, סריקת "כל הכמות" בהזמנה
  // אחת נעלה את השלב בכל ההזמנות: 05215 ב-11/08/2026 — رهام סרקה כל-הכמות להזמנת
  // ה-30 יח', והזמנת ה-81 נחסמה לגמרי ל`طبق بطانه` בלי שום מסלול עוקף.
  const myOrder=_orderStampOf(base.cust,base.prod,base.size,base.col,base.qty,base.isTotal);
  const sameOrder=t=>{
    if(!myOrder)return true;
    const k=_orderStampOf(t.cust,t.prod,t.size,t.col,taskUnits(t),_taskIsTotal(t));
    return !k||k===myOrder;
  };
  const rel=t=>t.cust===base.cust&&t.prod===base.prod&&(t.taskType||'')===tt&&sameOrder(t);
  const peers=[
    ...S.activeTasks.filter(t=>rel(t)&&!t.paused&&live(t)),
    ...S.histTasks.filter(t=>rel(t)&&live(t)),
    ...(cart||[]).filter(b=>rel(b))
  ];
  if(!peers.length)return '';
  return base.isTotal?(peers.some(t=>!_taskIsTotal(t))?'sizes':''):(peers.some(t=>_taskIsTotal(t))?'total':'');
}
// ─── 🔢 כמות חלקית בסריקה (19/10/2026) ──────────────────────────
// שדה "כמות" ליד הברקוד בשלושת הסורקים: ריק = כל מה שנותר בברקוד לשלב. כמות קטנה יותר ⇒ המשימה
// מקבלת splitId (כמו העברה חלקית) כדי שהחלקים ייספרו בנפרד ב-coverKey/unitKey. סריקה חוזרת של
// אותו ברקוד+שלב לא נחסמת כל עוד נשארה יתרה — ומציעה את היתרה. כשאין יתרה — חסימה כמו קודם.
// ברקוד "כל הכמות" ודגם ראשון — בלי חלוקה.
// יחידות שכבר נלקחו לברקוד+שלב בהזמנה (פעילות כולל מושהות + היסטוריה), בלי כפילות (coverKey)
function bcTakenUnits(raw,tt,stamp){
  const seen=new Set();let n=0;
  for(const t of [...S.activeTasks,...S.histTasks]){
    if(String(taskBc(t))!==String(raw)||(t.taskType||'')!==tt)continue;
    const s=taskStampOf(t);if(s!=null&&s!==stamp)continue;
    const k=coverKey(t);if(seen.has(k))continue;seen.add(k);n+=+t.qty||0;
  }
  return n;
}
// הכמות שהוזנה בשדה של הסורק (pfx = bc/ts/mgr) ומנקה אותו. 0 = ריק
function _partWant(pfx){const el=document.getElementById(pfx+'-part');if(!el)return 0;const v=parseInt(el.value)||0;el.value='';return v>0?v:0;}
// מחליט את הכמות לפריט: null = אין יתרה (לחסום) · {qty} = רגיל · {qty,splitId,of} = חלק
function _partPick(base,tt,stamp){
  const full=+base.qty||0,want=+base.want||0;
  if(base.isTotal||base.isSample||!(full>0))return{qty:base.qty};
  const taken=bcTakenUnits(base.raw,tt,stamp),rem=full-taken;
  if(taken>0&&rem<=0)return null;
  const q=want>0?Math.min(want,rem):rem;
  if(taken===0&&q>=full)return{qty:full};
  return{qty:q,splitId:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),of:full};
}
const _partLbl=b=>b.of?` (${b.qty} מתוך ${b.of})`:'';
// מוסיף שלבים לסל עם חסימת כפילויות (בסל / פעיל / בוצע / התנגשות "כל הכמות"). מחזיר תיאורי הנחסמים.
function addStepsToBatch(batch,base,types){
  const T=LANGS[currentLang];
  // ההזמנה **שבברקוד**, לא החדשה ביותר של הדגם — ראה bcOrderStamp
  const stamp=base.raw?bcOrderStamp(base.raw):prodStampFor(base.cust,base.prod);
  const skipped=[];
  for(const t of types){
    const tt=t||'';const label=tt||T.scan_dup_no_step;
    if(batch.some(b=>b.raw===base.raw&&(b.taskType||'')===tt)){skipped.push(label+' — '+T.scan_dup_in_cart);continue;}
    const st=stepAlreadyTaken(base.raw,tt,stamp);
    const pk=_partPick(base,tt,stamp); // 🔢 נשארה יתרה ⇒ לא נחסם, מקבל את היתרה
    if(st==='active'&&!pk?.splitId){skipped.push(label+' — '+T.scan_dup_active);continue;}
    if(st==='done'&&!pk?.splitId){skipped.push(label+' — '+T.scan_dup_done);continue;}
    const tc=totalScanConflict(base,tt,stamp,batch);
    if(tc){skipped.push(label+' — '+(tc==='total'?T.scan_dup_total:T.scan_dup_sizes));continue;}
    const e={...base,taskType:tt,prodStamp:stamp,...pk};delete e.want;
    batch.push(e);
    if(e.of)showToast(`🔢 ${label}: ${e.qty} מתוך ${e.of} יח'`,'var(--blue-txt,#1d4ed8)',4000);
  }
  return skipped;
}

function genBatchId(){return 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}

function renderTsBatchQueue(){
  const el=document.getElementById('ts-batch-queue');if(!el)return;
  const T=LANGS[currentLang];
  if(!_tsBatch.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="background:var(--card);border:1px solid var(--brd);border-radius:8px;padding:8px;font-size:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--txt)">${T.scan_cart} (${_tsBatch.length} ${T.scan_barcodes}):</div>
    ${_tsBatch.map((b,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--brd)">
      <span style="color:var(--txt)">${b.prod} · ${b.qty} יח'${_partLbl(b)} · ${COLORS[b.col]||b.col}${b.taskType?' · '+b.taskType:''}</span>
      <button onclick="_tsBatch.splice(${i},1);renderTsBatchQueue()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:14px;padding:0 4px">✕</button>
    </div>`).join('')}
  </div>`;
}
function renderMgrBatchQueue(){
  const el=document.getElementById('mgr-batch-queue');if(!el)return;
  const T=LANGS[currentLang];
  if(!_mgrBatch.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="background:var(--card);border:1px solid var(--brd);border-radius:8px;padding:8px;font-size:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--txt)">${T.scan_cart} (${_mgrBatch.length} ${T.scan_barcodes}):</div>
    ${_mgrBatch.map((b,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--brd)">
      <span style="color:var(--txt)">${b.prod} · ${b.qty} יח'${_partLbl(b)} · ${COLORS[b.col]||b.col}${b.taskType?' · '+b.taskType:''}</span>
      <button onclick="_mgrBatch.splice(${i},1);renderMgrBatchQueue()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:14px;padding:0 4px">✕</button>
    </div>`).join('')}
  </div>`;
}
// סל הסורק האישי (bc): כמו addStepsToBatch אבל בסמנטיקת bc — כפילות "פעיל" נבדקת רק אצל אותו עובד
// (עובד אחר על אותו שלב = הצטרפות מותרת דרך אישור otherSame), ושומר צפי לשלב (expMin) לתצוגת סה"כ.
function addStepsToBcCart(base,types,exp){
  const T=LANGS[currentLang];
  const stamp=base.raw?bcOrderStamp(base.raw):prodStampFor(base.cust,base.prod); // ראה bcOrderStamp
  const skipped=[];
  for(const t of types){
    const tt=t||'';const label=tt||T.scan_dup_no_step;
    if(_bcBatch.some(b=>b.raw===base.raw&&(b.taskType||'')===tt)){skipped.push(label+' — '+T.scan_dup_in_cart);continue;}
    // 🔢 נשארה יתרה בברקוד לשלב ⇒ לא "בוצע" — חלק חדש עם היתרה. null = אין יתרה
    // (נלקח כולו). עובדת אחרת על כל הכמות ⇒ pk=null בלי היסטוריה = הצטרפות כמו קודם (כמות מלאה)
    const pk=_partPick(base,tt,stamp);
    if(!pk?.splitId&&S.histTasks.some(x=>{if(x.bc!==base.raw||(x.taskType||'')!==tt)return false;const s=taskStampOf(x);return s==null||s===stamp;})){skipped.push(label+' — '+T.scan_dup_done);continue;}
    if(S.activeTasks.some(x=>x.workerId===S.user?.id&&taskBc(x)===base.raw&&(x.taskType||'')===tt&&!x.paused)){skipped.push(label+' — '+T.scan_dup_active);continue;}
    const tc=totalScanConflict(base,tt,stamp,_bcBatch);
    if(tc){skipped.push(label+' — '+(tc==='total'?T.scan_dup_total:T.scan_dup_sizes));continue;}
    const entry={...base,taskType:tt,prodStamp:stamp,...pk};delete entry.want;
    // צפי לפי התמחור מחושב לכמות המלאה — בחלק הוא יחסי
    if(exp?.ok&&exp.perStep?.[tt]!=null)entry.expMin=pk?.of?Math.round(exp.perStep[tt]*pk.qty/pk.of*10)/10:exp.perStep[tt];
    _bcBatch.push(entry);
    if(entry.of)showToast(`🔢 ${label}: ${entry.qty} מתוך ${entry.of} יח'`,'var(--blue-txt,#1d4ed8)',4000);
  }
  return skipped;
}
function renderBcBatchQueue(){
  const el=document.getElementById('bc-batch-queue');if(!el)return;
  const T=LANGS[currentLang];
  if(!_bcBatch.length){el.innerHTML='';return;}
  const totExp=_bcBatch.reduce((s,b)=>s+(+b.expMin||0),0);
  el.innerHTML=`<div style="background:var(--card);border:1px solid var(--brd);border-radius:8px;padding:8px;font-size:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--txt)">${T.scan_cart} (${_bcBatch.length} ${T.bc_tasks_in_cart||'משימות בסל'})${totExp>0?` · <span style="font-weight:400;color:var(--txt3)">${T.bc_total_exp||'🎯 צפי כולל'}: ${fmtExpMin(totExp)}</span>`:''}</div>
    ${_bcBatch.map((b,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--brd)">
      <span style="color:var(--txt)">${b.prod}${b.size?' · מידה '+esc(b.size):''} · ${b.qty} יח'${_partLbl(b)} · ${COLORS[b.col]||b.col}${b.taskType?' · '+esc(b.taskType):''}${b.expMin?` · 🎯 ${fmtExpMin(+b.expMin)}`:''}</span>
      <button onclick="_bcBatch.splice(${i},1);renderBcBatchQueue()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:14px;padding:0 4px">✕</button>
    </div>`).join('')}
    <button class="btn primary full" style="margin-top:8px" onclick="bcStartBatch()">${T.bc_start_all||'▶ התחל את כל המשימות'}</button>
  </div>`;
}
// התחלת כל משימות הסל בבת אחת: batchId משותף = טיימר אחד + צפי מסוכם בכרטיס הקבוצתי
// (כמו שקורה בסורק המשימות) — במקום 5 טיימרים מקביליים שכל אחד "חורג" מצפי של משימה בודדת.
async function bcStartBatch(){
  const T=LANGS[currentLang];
  if(!_bcBatch.length)return;
  // ברקוד שנסרק אך לא נוסף לסל — לא לזרוק בשקט. מזהיר ומחזיר, כדי שהמשתמש יוסיף/ינקה קודם.
  const pend=(document.getElementById('bc-inp')?.value||'').replace(/\D/g,'');
  if(isBcLen(pend.length)){showToast(T.bc_pending_scan||'⚠ יש ברקוד סרוק שטרם נוסף לסל — לחץ "התחל / משימה" כדי להוסיפו, או נקה את השדה','var(--red-txt)',7000);document.getElementById('bc-inp')?.focus();return;}
  const u=S.user;if(!u)return;
  const wu=S.workers.find(x=>x.id===u.id);
  if(!wu||wu.status!=='in'){alert('לא ניתן להתחיל משימה — יש להירשם כנוכח תחילה (כניסה לעבודה בלשונית נוכחות)');return;}
  const items=_bcBatch.slice();
  // 🔒 בדיקה חוזרת ברגע ההתחלה — אותה פונקציה בדיוק כמו בסורקי האחראי/המנהל,
  // כדי ששלושת המסלולים לא יוכלו להיפרד שוב. ראה two_scanners_gotcha.
  if(!await passBatchGates(wu,items))return;
  try{
    const bcBatchId=items.length>1?genBatchId():null; // כמה משימות יחד = קבוצה אחת (טיימר משותף + מסגרת אחת)
    const bcStart=srvNow();
    const dupSkip=[];let created=0;
    const srvActive=await serverActiveTasks(u.id); // קריאה אחת לכל הסל, לא לכל פריט
    for(const b of items){
      // חסימה חוזרת ברגע הפתיחה (לא רק בהוספה לסל): סוגר מרוץ של סריקה כפולה מהירה —
      // סריקה שנייה שעברה את בדיקת הסל לפני שהמשימה הראשונה נוצרה. אותו עובד+ברקוד+שלב פעיל = דילוג.
      if(S.activeTasks.some(x=>x.workerId===u.id&&taskBc(x)===b.raw&&(x.taskType||'')===(b.taskType||'')&&!x.paused)){dupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
      if(findDupIn(srvActive,b.raw,b.taskType)){dupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
      // wu ולא u: S.user הוא עותק מרגע ההתחברות — currentStation שלו לא מתעדכן בסריקת תחנה
      const newTask={id:String(Date.now())+Math.random().toString(36).slice(2,6),workerId:u.id,workerName:u.name,scannedBy:S.user?.id||'',scannedByName:S.user?.name||'',dept:b.taskDept||effDept(wu),station:curStation(wu)?.name||'',cust:b.cust,prod:b.prod,size:b.size,qty:b.qty,col:b.col,taskType:b.taskType,bc:b.raw,isTotal:b.isTotal||false,startTime:bcStart,elapsed:0,prodStamp:b.prodStamp,...(b.splitId?{splitId:b.splitId}:{})};
      if(bcBatchId)newTask.batchId=bcBatchId;
      if(b.expMin!=null)newTask.expectedMin=b.expMin;
      if(b.isSample)newTask.isSample=true;
      if(!(await claimTaskGuard(newTask)).ok){dupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
      S.activeTasks.unshift(newTask);created++;
      if(S.fbConnected)await fbSet('activeTasks',newTask.id,{...newTask,startTime:bcStart.toISOString()});
      tgTask(newTask,true);
      if(!b.isSample)await autoStampStage(b.cust,b.prod,b.taskDept||effDept(wu)); // עדכון אוטומטי של שלב הייצור (דגם — לא מזיז שלב)
    }
    // סגירת המשימות הקודמות — רק עכשיו, כשידוע שנוצרה משימה חדשה שתחליף אותן.
    // endTime=bcStart (רגע פתיחת החדשות) ⇒ אין חפיפה ואין חור בציר הזמן.
    if(created>0&&_bcCloseOnStart.length){
      const toClose=S.activeTasks.filter(t=>_bcCloseOnStart.includes(String(t.id)));
      if(toClose.length)await closeTasksBatchAware(toClose,bcStart,'new_task');
    }else if(!created&&_bcCloseOnStart.length){
      showToast('⚠ לא נפתחה משימה חדשה — המשימה הקודמת נשארה פעילה','var(--amber-txt)',7000);
    }
    // ⏸ משימה זמנית — השהיה במקום סגירה. onlyIds חובה: בלי זה גם המשימה שזה עתה
    // נוצרה נכנסת לסינון "כל מה שלא מושהה של העובד" ומושהית מיד.
    if(created>0&&_bcPauseOnStart.length){
      const n=await pauseWorkerTasks(u.id,bcStart,_bcPauseOnStart);
      if(n)showToast(`⏸ ${n} משימות הושהו — לחזרה אליהן סרוק אותן בסורק המשימות`,'var(--amber-txt)',7000);
    }
    _bcCloseOnStart=[];_bcPauseOnStart=[];
    _bcBatch=[];renderBcBatchQueue();
    document.getElementById('bc-inp').value='';parseBc('');
    document.getElementById('bc-tasktype').value='';
    document.getElementById('bc-dept').value='';
    saveLS();renderScanActive();renderTasks();goPage('tasks');
    if(dupSkip.length)showToast((T.scan_not_added||'לא נוסף')+' '+dupSkip.join(' · '),'var(--red-txt)',7000);
    if(created>0)showToast('✅ '+(created>1?created+' משימות הותחלו':'משימה הותחלה'));
    // מדיניות רכה: התחלת משימה בלי שיוך תחנה — תזכורת בלבד, לא חסימה
    if(!curStation(wu)&&(S.workStations||[]).length)setTimeout(()=>showToast(T.st_reminder||'📍 תזכורת: סרוק ברקוד תחנה כדי לשייך אותך לעמדה','var(--amber-txt)',5000),1800);
  }catch(e){showToast('❌ שגיאה בפתיחת משימה: '+e.message,'var(--red-txt)',8000);}
}

// סגירת batch עם חלוקת זמן יחסית לפי כמות.
// baseSec = הזמן המשותף של כל ה-batch (טיימר אחד) — מתחלק בין המשימות לפי כמות.
// כל האחיות של הצביר — פעילות **וגם** היסטוריות. מנהל שעורך שורה-שורה מעביר כל שורה
// ל-histTasks מיד, ומכנה שסופר רק את הפעילות מתכווץ בכל עריכה (10/40, 10/30, 10/20, 10/10
// = 208% מהחלון). המכנה חייב להיות קבוע לאורך כל העריכות.
function _batchSiblings(t){
  if(!t||!t.batchId)return t?[t]:[];
  const same=x=>x&&x.batchId===t.batchId&&x.workerId===t.workerId;
  const seen=new Set(),out=[];
  [...(S.activeTasks||[]).filter(same),...(S.histTasks||[]).filter(same)].forEach(x=>{
    const k=String(x.id);if(!seen.has(k)){seen.add(k);out.push(x);}
  });
  // t עצמה עשויה כבר לא להיות באף רשימה (הוסרה מ-activeTasks לפני שנכתבה להיסטוריה)
  if(!seen.has(String(t.id)))out.push(t);
  return out;
}
// חלקה היחסי של משימה בטיימר המשותף של הצביר. משימה בודדת = 1 (בלי שינוי התנהגות).
function _batchShare(t){
  const sibs=_batchSiblings(t);
  if(sibs.length<2)return 1;
  const tot=sibs.reduce((s,x)=>s+(x.qty||0),0);
  return tot>0?((t.qty||0)/tot):(1/sibs.length);
}
// 🏷 מי סגר ולמה — נכתב על כל משימה שהלקוח מעביר להיסטוריה (28/09/2026: ايمان 07:54 —
// 4 משימות נסגרו והתחנה נמחקה בלי שום עקבה ביומן). why = קוד או {r:קוד, n:פרט}.
// בלי why ⇒ 'other' — מסלול סגירה שלא סומן, כדי שיבלוט ולא ייבלע.
// משימה בלי closeReason בכלל = נסגרה בשרת (הסוגר הלילי) או לפני 28/09.
function _closeMeta(why){
  const w=typeof why==='string'?{r:why}:(why||{});
  const ua=navigator.userAgent||'';
  return{closeReason:w.r||'other',closeNote:w.n||null,closedBy:S.user?.id||null,closedByName:S.user?.name||null,
    closedDev:/iPhone|iPad/i.test(ua)?'iOS':/Android/i.test(ua)?'Android':'PC'};
}
const CLOSE_LBL={
  he:{manual_end:'סיום ידני',new_task:'נפתחה משימה חדשה',swap_new:'הוחלפה במשימה חדשה',resume_paused:'חזרה למשימה מושהית',
    paused_new:'מושהית — נפתחה חדשה',paused_done:'מושהית — סומנה כהושלמה',station_handover:'המכונה נמסרה ל־',
    station_stale:'מישהו אחר סרק את המכונה',station_overlap:'חפיפת מכונה — שוחרר/ה',station_audit:'ניקוי חפיפות',edit_end:'זמן סיום בעריכה',other:'לא ידוע'},
  ar:{manual_end:'إنهاء يدوي',new_task:'فُتحت مهمة جديدة',swap_new:'استُبدلت بمهمة جديدة',resume_paused:'عودة لمهمة موقوفة',
    paused_new:'موقوفة — فُتحت جديدة',paused_done:'موقوفة — اكتملت',station_handover:'سُلّمت الماكينة لـ',
    station_stale:'شخص آخر مسح الماكينة',station_overlap:'تداخل ماكينة — تم التحرير',station_audit:'تنظيف التداخلات',edit_end:'وقت انتهاء بالتعديل',other:'غير معروف'}
};
function closeInfoHtml(t){
  if(!t||!t.closeReason)return'';
  const L=CLOSE_LBL[currentLang]||CLOSE_LBL.he;
  const lbl=(L[t.closeReason]||CLOSE_LBL.he[t.closeReason]||t.closeReason)+(t.closeNote?(t.closeReason==='station_handover'?'':' · ')+t.closeNote:'');
  return` <span style="color:var(--txt2)" title="${esc((t.closedDev||'')+(t.closedBy?' · '+t.closedBy:''))}">· 🏁 ${esc(lbl)}${t.closedByName?' · '+esc(t.closedByName):''}</span>`;
}
async function closeBatchProportional(tasks,endTime,why){
  const lead=tasks[0];
  const baseSec=_capByAttendance(lead,lead.paused?(lead.accumulatedSec||0):(lead.accumulatedSec||0)+calcTaskDurSec(lead.startTime,endTime,lead.workerId));
  for(const t of tasks){
    // המכנה נלקח מכל האחיות (כולל כאלה שכבר נסגרו בעריכה ידנית), לא רק מ-tasks שנשלחו לכאן
    const proportion=_batchShare(t);
    const duration=Math.round(baseSec*proportion);
    const done={...t,endTime,duration,..._closeMeta(why)};
    delete done.paused;delete done.pausedAt;delete done.accumulatedSec;
    S.histTasks.unshift(done);
    S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);
    if(S.fbConnected){
      await fbDel('activeTasks',String(t.id));
      await fbSet('histTasks',String(t.id),{...done,startTime:done.startTime instanceof Date?done.startTime.toISOString():done.startTime,endTime:endTime.toISOString()});
    }
  }
}
// סוגר אוסף משימות עם חלוקת זמן נכונה: משימות שחולקות batchId (עבדו במקביל על טיימר אחד)
// מתחלקות יחסית; משימות בודדות נסגרות עם הזמן המלא שלהן. כל מסלולי הסגירה עוברים דרך כאן.
async function closeTasksBatchAware(tasks,endTime,why){
  const groups={};
  const singles=[];
  tasks.forEach(t=>{if(t.batchId){(groups[t.workerId+'|'+t.batchId]=groups[t.workerId+'|'+t.batchId]||[]).push(t);}else singles.push(t);});
  for(const g of Object.values(groups)){
    if(g.length>1)await closeBatchProportional(g,endTime,why);else singles.push(g[0]);
  }
  for(const t of singles){
    const done={...t,endTime,duration:taskFinalDur(t,endTime),..._closeMeta(why)};
    delete done.paused;delete done.pausedAt;delete done.accumulatedSec;
    S.histTasks.unshift(done);
    S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);
    if(S.fbConnected){await fbDel('activeTasks',String(t.id));await fbSet('histTasks',String(t.id),{...done,startTime:done.startTime instanceof Date?done.startTime.toISOString():done.startTime,endTime:endTime instanceof Date?endTime.toISOString():endTime});}
  }
}
// נרמול הגנתי בקריאה: מחזיר מפה id→שניות מתוקנות. משימות batch שנשמרו מנופחות
// (הזמן המלא על כל משימה) מזוהות לפי סכום duration >> הזמן המשותף ומתוקנות יחסית לכמות.
// batch שכבר חולק נכון נשאר כמו שהוא. משמש את הדוחות/מאזן/עלויות כדי שמספרים יהיו נכונים
// גם על נתונים ישנים, ללא תלות בתיקון השרת.
function normalizeBatchDurations(tasks){
  const out={};const groups={};
  tasks.forEach(t=>{if(t.batchId)(groups[t.workerId+'|'+t.batchId]=groups[t.workerId+'|'+t.batchId]||[]).push(t);else out[t.id]=t.duration||0;});
  for(const g of Object.values(groups)){
    if(g.length<2){out[g[0].id]=g[0].duration||0;continue;}
    // משימה שחודשה מיום קודם (origStart): ה-duration כולל את הזמן שנצבר בימים קודמים
    // ולכן גדול מחלון [start,end] הנראה — זה תקין, לא ניפוח. הכיווץ למטה היה מוחק אותו.
    if(g.some(t=>t.origStart)){g.forEach(t=>{out[t.id]=t.duration||0;});continue;}
    const start=Math.min(...g.map(t=>new Date(t.startTime).getTime()));
    const end=Math.max(...g.map(t=>t.endTime?new Date(t.endTime).getTime():start));
    const clock=Math.max(0,(end-start)/1000);
    const sumDur=g.reduce((s,t)=>s+(t.duration||0),0);
    if(clock>0&&sumDur>clock*1.5){ // מנופח: הזמן המלא נשמר על כל משימה
      const totQ=g.reduce((s,t)=>s+(t.qty||0),0);
      g.forEach(t=>{out[t.id]=totQ>0?Math.round(clock*(t.qty||0)/totQ):Math.round(clock/g.length);});
    }else g.forEach(t=>{out[t.id]=t.duration||0;}); // כבר חולק נכון
  }
  // שלב ב': משימות חופפות של אותו עובד גם בלי batchId משותף — עובד שפתח כמה
  // משימות במקביל (סריקות נפרדות) צובר את אותו זמן שעון על כל אחת. מקבצים חלונות
  // [start,end] חופפים (טרנזיטיבית) פר-עובד; אם סכום ה-duration בצביר עולה על זמן
  // השעון של החלון המאוחד — מכווצים את כולן יחסית. משימה שהושהתה וחודשה
  // (duration>חלון של עצמה, כי startTime מתאפס בחידוש) אינה חופפת אחרות ולכן לא
  // נפגעת; רשומות בלי endTime תקין (או endTime<startTime) לא משתתפות.
  const byW={};
  tasks.forEach(t=>{
    const s=new Date(t.startTime).getTime(),e=t.endTime?new Date(t.endTime).getTime():NaN;
    if(!isFinite(s)||!isFinite(e)||e<=s)return;
    // משימה מחודשת מוחרגת מהכיווץ: ה-duration שלה כולל ימים קודמים ולעולם יגדל
    // מהחלון של הצביר, כך שהיא הייתה גוררת למטה גם את המשימות שחופפות לה.
    // התקרה ב-_capByAttendance היא מה שחוסם אותה מלברוח.
    if(t.origStart)return;
    (byW[t.workerId]=byW[t.workerId]||[]).push({id:t.id,w:t.workerId,s,e});
  });
  for(const arr of Object.values(byW)){
    if(arr.length<2)continue;
    arr.sort((a,b)=>a.s-b.s);
    let cl=[arr[0]],clEnd=arr[0].e;
    const clip=()=>{
      if(cl.length<2)return;
      const clock=_clusterClock(cl[0].s,Math.max(...cl.map(x=>x.e)),cl[0].w);
      const sum=cl.reduce((s2,x)=>s2+(out[x.id]||0),0);
      if(clock>0&&sum>clock){const f=clock/sum;cl.forEach(x=>{out[x.id]=Math.round((out[x.id]||0)*f);});}
    };
    for(let i=1;i<arr.length;i++){
      const x=arr[i];
      if(x.s<clEnd){cl.push(x);clEnd=Math.max(clEnd,x.e);}
      else{clip();cl=[x];clEnd=x.e;}
    }
    clip();
  }
  return out;
}

// זמן שעון אפקטיבי לצביר משימות חופפות: חיתוך החלון [ws,we] עם רצפי הנוכחות של
// העובד (attHistory + היום מ-S.workers, בניכוי הפסקה) — צביר שנמשך ללילה (משימות
// שנשארו פתוחות ונסגרו למחרת) לא מזכה בשעות שהעובד לא היה נוכח בהן.
// אין נתוני נוכחות חופפים לחלון → fallback לשעון קיר (calcTaskDurSec).
function _clusterClock(ws,we,wid){
  const w=S.workers.find(x=>x.id===wid);
  const sess=[];const seen=new Set();
  const addRec=r=>{
    const ss=r.sessions&&r.sessions.length?r.sessions:(r.checkin?[{in:r.checkin,out:r.checkout||null}]:[]);
    ss.forEach(s=>{if(s.in&&!seen.has(s.in)){seen.add(s.in);sess.push(s);}});
  };
  (S.attHistory||[]).forEach(r=>{if(r.workerId===wid)addRec(r);});
  if(w)addRec(w);
  let tot=0,found=false;
  for(const s of sess){
    const si=new Date(s.in).getTime();
    // session פתוח (אין out): נספר עד עכשיו אבל לא מעבר לסוף היום שלו — יש רשומות
    // עזובות עם out:null מלפני שבועות שאחרת היו "נמשכות" עד היום ומנפחות כל חלון.
    const di=new Date(s.in);const eod=new Date(di.getFullYear(),di.getMonth(),di.getDate(),23,59,59).getTime();
    const so=s.out?new Date(s.out).getTime():Math.min(Date.now(),eod);
    const os=Math.max(si,ws),oe=Math.min(so,we);
    if(oe<=os)continue;
    found=true;let ms=oe-os;
    if(w&&w.breakActive&&w.breakStart&&w.breakEnd){
      const ref=new Date(s.in).toDateString();
      const bs=new Date(ref+' '+w.breakStart).getTime(),be=new Date(ref+' '+w.breakEnd).getTime();
      if(be>bs){const bo=Math.max(os,bs),bo2=Math.min(oe,be);if(bo2>bo)ms-=(bo2-bo);}
    }
    tot+=ms;
  }
  return found?Math.round(tot/1000):calcTaskDurSec(new Date(ws),new Date(we),wid);
}

// השהיית כל המשימות הפעילות של עובד
// תיקון שעת היציאה במסך הנוכחות = תיקון של מתי העובד באמת עזב, ולכן המשימות חייבות לזוז
// איתה **בשני הכיוונים**: קיצור מוריד מהזמן שנצבר, הארכה מוסיפה. הן נשארות **מושהות**
// ולא נסגרות, כדי שיתחדשו אוטומטית בחתימת הכניסה למחרת.
// עד 07/08/2026 המסלול הזה קרא ל-closeTasksBatchAware: המשימות נסגרו, וה-duration נשאר
// מדוד עד שעת החתימה המקורית מול endTime מתוקן ומוקדם יותר. הסתירה הזו היא בדיוק מה
// שהסוגר הלילי מחפש — והוא קיצץ אותה (هديل 06/08: נחתם 15:14, תוקן ל-15:00).
async function reanchorWorkerTasks(workerId,newOutAt){
  const tasks=S.activeTasks.filter(t=>t.workerId===workerId&&!_isClosedTask(t.id));
  for(const t of tasks){
    const anchor=t.paused&&t.pausedAt?new Date(t.pausedAt):null;
    let acc=t.accumulatedSec||0;
    if(anchor&&!isNaN(anchor.getTime())){
      // כבר מושהית — מזיזים את העוגן מהשעה הישנה לחדשה. calcTaskDurSec מנכה הפסקה
      // ומחזיר 0 על טווח שלילי, ולכן שני הכיוונים בטוחים.
      if(newOutAt>anchor)acc+=calcTaskDurSec(anchor,newOutAt,workerId);
      else acc-=calcTaskDurSec(newOutAt,anchor,workerId);
    }else{
      acc+=calcTaskDurSec(t.startTime,newOutAt,workerId); // עדיין רצה — כמו pauseWorkerTasks
    }
    t.paused=true;
    t.pausedAt=newOutAt.toISOString();
    t.accumulatedSec=Math.max(0,acc);
    t.elapsed=t.accumulatedSec;
    if(S.fbConnected){
      const ok=await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime});
      if(!ok)S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);
    }
  }
  return tasks.length;
}
// onlyIds (אופציונלי): להשהות רק את המשימות האלה. חובה כשמשהים בנקודת ההחלפה בסורק —
// בלעדיו הסינון "כל מה שלא מושהה של העובד" תופס גם את המשימה החדשה שזה עתה נוצרה
// ומשהה אותה מיד. שני הקוראים הישנים (חתימת יציאה) לא מעבירים כלום ולא מושפעים.
async function pauseWorkerTasks(workerId,pausedAt,onlyIds){
  // הרשימה חייבת להיות מהשרת — מסך שנפתח זה עתה מחזיק עדיין את העותק מ-localStorage,
  // ומשימה שנפתחה במכשיר אחר לא תהיה בו ולא תושהה (שהנאז 01/10 — יציאה בלי השהיה).
  await waitForActiveTasks(8000);
  const only=onlyIds?new Set(onlyIds.map(String)):null;
  const tasks=S.activeTasks.filter(t=>t.workerId===workerId&&!t.paused&&!_isClosedTask(t.id)&&(!only||only.has(String(t.id))));
  for(const t of tasks){
    const addSec=calcTaskDurSec(t.startTime,pausedAt,t.workerId);
    t.paused=true;
    t.pausedAt=pausedAt.toISOString();
    t.accumulatedSec=(t.accumulatedSec||0)+addSec;
    t.elapsed=t.accumulatedSec;
    // עדכון-בלבד: משימה שנסגרה במקום אחר לא תיווצר מחדש (ראה fbUpdateOnly)
    if(S.fbConnected){
      const ok=await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime});
      if(!ok)S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id); // נסגרה בשרת — נקה מהזיכרון המקומי
    }
  }
  return tasks.length;
}

// ─── נקודת ההחלפה: משימה זמנית מול משימה חדשה ─────────────────────────────
// עובדת שנקראת לעבודה אחרת באמצע משימה. עד היום המשימה הפעילה נסגרה **בשקט**
// להיסטוריה, ומשם סריקה חוזרת נחסמה כ-'כבר בוצע' (stepAlreadyTaken → 'done').
//   ⏸ זמנית  — המשימה מושהית ונשארת ב-activeTasks. השחרור: סורק המשימות —
//              בחירת העובד + סריקת התחנה (passStationGate) + הברקוד והשלב.
//              אז handlePausedTasks מחדש אותה **וסוגר את הזמנית להיסטוריה**.
//   ✅ חדשה   — ההתנהגות הקיימת: הישנה נסגרת להיסטוריה.
// 🛑 האפשרות השלישית "⇄ עבודה במקביל" **הוסרה 23/08/2026** בהחלטת המשתמש — כסידור, לא
// כתיקון. שתי משימות פתוחות בו-זמנית רושמות **כל אחת את הזמן המלא**: ندوه 03/08 עבדה
// 480 דק' ונרשמו 729. זו ספירה כפולה שהמערכת נאלצת לנחש בדיעבד ב-normalizeBatchDurations.
// מדידה על 4,777 רשומות: מ-09/08 ואילך **אפס שימוש** ב-⇄ (1,526 רשומות, החפיפה היחידה
// היא 04380 שחודשה מהיסטוריה). להחזרה: כפתור שלישי כאן + ענף 'parallel' ב-applySwapMode.
// ⚠️ הסל בסורק האישי (batchId משותף) **אינו** ⇄ — closeBatchProportional מחלק שם את
// הזמן ולא מכפיל אותו, והוא נשאר כמו שהוא.
// מוחזרת **כוונה בלבד** — הפעולה מתבצעת ב-applySwapMode רק אחרי שנוצרה משימה חדשה.
// כל סגירה מוקדמת בין ההחלטה ליצירה מוחקת זמן עבודה בלי עקבה (ايمان 08/08: 92 דק').
async function askSwapMode(w,activeCurrent){
  if(!activeCurrent||!activeCurrent.length)return 'close';
  const names=[...new Set(activeCurrent.map(t=>t.prod+(t.taskType?' · '+t.taskType:'')))].join('\n');
  const ch=await showConfirm3(
    LANGS[currentLang].swap_title||'יש משימה פעילה',
    `${w.name}\n${names}\n\nמה לעשות איתה?`,
    '⏸ משימה זמנית — השהה וחזור אליה','✅ משימה חדשה — סגור את הישנה');
  return ch===0?'pause':'close';
}
// הפעלת הכוונה. נקראת רק אחרי שנוצרה לפחות משימה חדשה אחת.
async function applySwapMode(mode,workerId,activeCurrent,swapTime){
  if(!activeCurrent||!activeCurrent.length)return;
  if(mode==='pause'){
    // onlyIds חובה — בלעדיו גם המשימה החדשה שזה עתה נוצרה הייתה מושהית מיד
    const n=await pauseWorkerTasks(workerId,swapTime,activeCurrent.map(t=>t.id));
    if(n)showToast(`⏸ ${n} משימות הושהו — סרוק אותן שוב בסורק המשימות כדי לחזור אליהן`,'var(--amber-txt)',7000);
    return;
  }
  // ⚠️ **רשימה מפורשת**, לא "כל מה שרץ" — בנקודה הזו המשימה החדשה כבר נוצרה
  // והיא רצה. סינון לפי עובד היה סוגר גם אותה מיד אחרי שנפתחה.
  await closeTaskList(activeCurrent,swapTime,'swap_new');
}
// סגירת רשימת משימות מפורשת להיסטוריה, מקובצות לפי batchId — אותה מכניקה בדיוק
// כמו נקודת ההחלפה בסורקים, כולל closeBatchProportional לצביר.
// ⚠️ הנוסחה כאן זהה לזו שבסורקים (accumulatedSec + calcTaskDurSec) ובמכוון **בלי**
// _capByAttendance — הוספת תקרה כאן תחתוך משימות רב-יומיות אמיתיות. ראה gotcha התקרה.
async function closeTaskList(tasks,endTime,why){
  const list=(tasks||[]).filter(t=>!_isClosedTask(t.id));
  if(!list.length)return 0;
  const batches={};list.forEach(t=>{const bid=t.batchId||t.id;if(!batches[bid])batches[bid]=[];batches[bid].push(t);});
  for(const bTasks of Object.values(batches)){
    if(bTasks.length>1)await closeBatchProportional(bTasks,endTime,why);
    else{const t=bTasks[0];const done={...t,endTime,duration:(t.accumulatedSec||0)+calcTaskDurSec(t.startTime,endTime,t.workerId),..._closeMeta(why)};S.histTasks.unshift(done);S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);if(S.fbConnected){await fbDel('activeTasks',String(t.id));await fbSet('histTasks',String(t.id),{...done,startTime:done.startTime instanceof Date?done.startTime.toISOString():done.startTime,endTime:endTime.toISOString()});}}
  }
  return list.length;
}
// סגירת המשימות ה**רצות** של העובד. exceptIds מחריג משימות שאסור לסגור — בשחרור
// מושהית זו המשימה שזה עתה חודשה, שכבר `paused=false` ולכן הייתה נסגרת מיד אחרי החידוש.
async function closeRunningTasks(workerId,endTime,exceptIds,why){
  const skip=exceptIds?new Set(exceptIds.map(String)):null;
  return closeTaskList(S.activeTasks.filter(t=>t.workerId===workerId&&!t.paused&&!_isClosedTask(t.id)&&(!skip||!skip.has(String(t.id)))),endTime,why);
}
// חידוש משימה מושהית: startTime נדרס לשעת החידוש (כך נמדדת הריצה החדשה), אבל ההתחלה
// המקורית נשמרת ב-origStart. בלי זה משימה רב-יומית נראית בהיסטוריה כאילו התחילה ביום
// הסגירה, ו-_capByAttendance מחשב את התקרה לפי יום החידוש בלבד — כלומר חותך את כל מה
// שנצבר בימים הקודמים (ندوه 03/08/2026: 1:47 שע' מאתמול נרשמו כ-5 דק').
function _resumeTask(t,now){
  if(!t.origStart)t.origStart=t.startTime instanceof Date?t.startTime.toISOString():t.startTime;
  t.paused=false;t.pausedAt=null;t.startTime=now;
}
// חידוש אוטומטי של המשימות המושהות בחתימת כניסה — במקום לסרוק את הברקוד מחדש בבוקר.
// עובד שלא הגיע: אין חתימת כניסה ⇒ המשימה נשארת מושהית (או שמנהל מעביר בכפתור 🔄).
// אותה מכניקה כמו "📅 המשך" ב-handlePausedTasks: startTime מהכניסה, הנצבר נשמר ב-accumulatedSec.
// ההשלמה נשארת דרך הזרימה הקיימת: סריקת המשימה הבאה סוגרת את הרצות (כולל המחודשות).
// waitMs: החתמה קבוצתית ממתינה פעם אחת לפני הלולאה ומעבירה 0, אחרת המתנה כפול מספר העובדים.
async function resumeWorkerTasksOnPunchIn(workerId,now,waitMs){
  // חובה לפני הסינון: 300ms אחרי ההתחברות S.activeTasks עדיין ריק/ישן מ-localStorage.
  await waitForActiveTasks(waitMs);
  const all=S.activeTasks.filter(t=>t.workerId===workerId&&t.paused&&!_isClosedTask(t.id));
  // משימה שנשכחה פתוחה ימים לא תתחדש לבד — אחרת היא צוברת שעון-קיר לנצח
  // (ندوه 00084 צברה 227 שע'). המנהל מקבל התראה ומחליט: לסגור, למחוק או לחדש ידנית.
  const paused=all.filter(t=>!_isStaleTask(t));
  const stale=all.filter(t=>_isStaleTask(t));
  for(const t of paused){
    _resumeTask(t,now);
    if(S.fbConnected){
      const ok=await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:now.toISOString()});
      if(!ok)S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);
    }
  }
  if(stale.length)_alertStaleTasks(stale);
  if(paused.length){saveLS();try{renderTasks();}catch(e){}}
  return paused.length;
}
// משימה מושהית מעל STALE_TASK_DAYS ימים = נשכחה פתוחה, לא עבודה אמיתית שנמשכת
const STALE_TASK_DAYS=2;
function _isStaleTask(t){
  const ref=t.pausedAt?new Date(t.pausedAt):(t.startTime instanceof Date?t.startTime:new Date(t.startTime));
  return (Date.now()-ref.getTime())>STALE_TASK_DAYS*86400000;
}
// התראה חד-פעמית ליום למנהל, לא לעובד — כדי שלא תרוץ בכל סריקה
function _alertStaleTasks(tasks){
  const today=todayStr();
  if(localStorage.getItem('txops_stale_alert')===today)return;
  localStorage.setItem('txops_stale_alert',today);
  const lines=tasks.map(t=>{
    const d=t.pausedAt?new Date(t.pausedAt):new Date(t.startTime);
    return `• ${t.workerName} — ${t.prod} ${t.taskType||''} (מושהית מ-${pad2(d.getDate())}/${pad2(d.getMonth()+1)}, ${fmtM(t.accumulatedSec||0)} נצברו)`;
  }).join('\n');
  sendTelegram(`⚠️ TextileOps — משימות תקועות שלא התחדשו אוטומטית\nהן פתוחות מעל ${STALE_TASK_DAYS} ימים. סגור או מחק אותן בניהול משימות:\n${lines}`).catch(()=>{});
}

// בדיקת משימות מושהות כשפותחים משימה חדשה לעובד
// newBarcodes: מחרוזות ברקוד, או {raw,taskType} כדי להפריד בין כמה מושהות על **אותו
// ברקוד בשלבים שונים**. שחרור מושהית = בחירת העובד + התחנה (passStationGate) + הברקוד
// והשלב — ולכן ההתאמה חייבת לרדת לרזולוציית השלב, אחרת הקבוצה הלא-נכונה מתחדשת.
async function handlePausedTasks(workerId,newBarcodes){
  const T=LANGS[currentLang];
  const paused=S.activeTasks.filter(t=>t.workerId===workerId&&t.paused);
  if(!paused.length)return true;
  // קבץ לפי batchId
  const batches={};
  paused.forEach(t=>{const bid=t.batchId||t.id;if(!batches[bid])batches[bid]=[];batches[bid].push(t);});
  // התאמה דו-שלבית: קודם ברקוד+שלב; אם אף קבוצה לא נתפסה כך — ברקוד בלבד, כדי לא לשנות
  // את ההתנהגות הקיימת כשסורקים שלב **חדש** על מוצר שכבר מושהה (אז זו באמת משימה חדשה).
  const _raw=x=>typeof x==='string'?x:((x&&x.raw)||'');
  const _tt=x=>typeof x==='string'?null:((x&&x.taskType)||'');
  const hitStep=new Set(),hitBc=new Set();
  for(const [bid,bTasks] of Object.entries(batches))
    for(const nb of (newBarcodes||[])){
      const raw=_raw(nb),tt=_tt(nb);
      if(!bTasks.some(t=>taskBc(t)===raw))continue;
      hitBc.add(bid);
      if(tt!==null&&bTasks.some(t=>taskBc(t)===raw&&(t.taskType||'')===tt))hitStep.add(bid);
    }
  const matched=hitStep.size?hitStep:hitBc;
  for(const [bid,bTasks] of Object.entries(batches)){
    const sameBC=matched.has(bid);
    if(sameBC){
      // אותו ברקוד — המשך
      const resumed=await showConfirm(T.resume_title,
        `נמצאה משימה מושהית: ${bTasks.map(t=>t.prod).join(', ')} (${fmtM(bTasks[0].accumulatedSec||0)} נצברו)`,
        T.resume_yes,T.resume_new);
      if(resumed===null)return false;
      if(resumed){
        // חידוש — עדכן startTime לעכשיו
        const now=srvNow();
        let okCount=0;
        for(const t of bTasks){
          _resumeTask(t,now);
          if(S.fbConnected){
            const ok=await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:now.toISOString()});
            if(!ok)S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);else okCount++;
          }else okCount++;
        }
        // המשימה הזמנית נסגרת להיסטוריה — חזרה למושהית פירושה שהזמנית הסתיימה.
        // ⚠️ קודם מחדשים ורק אז סוגרים: אם החידוש נכשל (המשימה נסגרה במכשיר אחר),
        // סגירת הזמנית הייתה משאירה את העובדת בלי שום משימה פתוחה — הלקח של ايمان 08/08.
        // ⚠️ המשימות שחודשו מוחרגות מהסגירה, אחרת הן נסגרות מיד אחרי שחודשו.
        const closed=okCount?await closeRunningTasks(workerId,now,bTasks.map(t=>t.id),'resume_paused'):0;
        saveLS();renderTasks();
        showToast(closed?`▶ המשימה חודשה · ${closed} זמניות נסגרו`:'▶ המשימה חודשה');
        return false; // לא לפתוח חדשה
      }else{
        // חדשה — סגור את המושהות
        const closeTime=new Date(bTasks[0].pausedAt||srvNow());
        if(bTasks.length>1&&bTasks[0].batchId)await closeBatchProportional(bTasks,closeTime,'paused_new');
        else{for(const t of bTasks){const dur=(t.accumulatedSec||0);const done={...t,endTime:closeTime,duration:dur,..._closeMeta('paused_new')};delete done.paused;delete done.pausedAt;delete done.accumulatedSec;S.histTasks.unshift(done);S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);if(S.fbConnected){await fbDel('activeTasks',String(t.id));await fbSet('histTasks',String(t.id),{...done,startTime:done.startTime instanceof Date?done.startTime.toISOString():done.startTime,endTime:closeTime.toISOString()});}}}
      }
    }else{
      // ברקוד שונה — הושלמה / הועברה
      const choice=await showConfirm3('מה לעשות עם המשימות המושהות?',
        `${bTasks.map(t=>t.prod+' ('+fmtM(t.accumulatedSec||0)+')').join(', ')}`,
        '✅ הושלמו','🔄 הועברו לעובד אחר','⏭ השאר מושהות');
      if(choice===0){
        const closeTime=new Date(bTasks[0].pausedAt||srvNow());
        if(bTasks.length>1&&bTasks[0].batchId)await closeBatchProportional(bTasks,closeTime,'paused_done');
        else{for(const t of bTasks){const dur=(t.accumulatedSec||0);const done={...t,endTime:closeTime,duration:dur,..._closeMeta('paused_done')};delete done.paused;delete done.pausedAt;delete done.accumulatedSec;S.histTasks.unshift(done);S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);if(S.fbConnected){await fbDel('activeTasks',String(t.id));await fbSet('histTasks',String(t.id),{...done,startTime:done.startTime instanceof Date?done.startTime.toISOString():done.startTime,endTime:closeTime.toISOString()});}}}
      }else if(choice===1){
        const eligible=S.workers.filter(w=>w.status==='in'&&w.id!==workerId);
        if(!eligible.length){showToast('אין עובדים פנויים להעברה','var(--red-txt)');continue;}
        const opts=eligible.map((w,i)=>`${i+1}. ${w.name}`).join('\n');
        const sel=prompt('בחר עובד להעברה:\n'+opts);
        const idx=parseInt(sel)-1;
        if(isNaN(idx)||!eligible[idx])continue;
        const newW=eligible[idx];
        const now=srvNow();
        for(const t of bTasks){
          t.workerId=newW.id;t.workerName=newW.name;t.dept=newW.dept;_resumeTask(t,now);
          if(S.fbConnected)await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:now.toISOString()});
        }
        showToast(`✅ הועבר ל-${newW.name}`);
      }
      // choice===2: השאר מושהות — לא עושים כלום
    }
  }
  saveLS();renderTasks();
  return true;
}

// showConfirm עם 2-3 אפשרויות
// btn3 אופציונלי — בלעדיו מוצג דיאלוג דו-כפתורי. ⚠️ **לא** להחליף ב-showConfirm הרגיל
// כשהבחירה הרסנית: ל-showConfirm יש סגירה בלחיצה על הרקע (_cfmClose(false)) ולכאן אין,
// ולכן אי אפשר "לבטל" בטעות לתוך ענף שסוגר משימה רצה להיסטוריה.
function showConfirm3(title,msg,btn1,btn2,btn3){
  return new Promise(res=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML=`<div style="background:var(--card);border-radius:12px;padding:20px;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px;color:var(--txt)">${esc(title)}</div>
      <div style="font-size:13px;color:var(--txt2);margin-bottom:16px">${esc(msg)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn success" onclick="this.closest('div[style*=fixed]').remove();window._c3res(0)">${btn1}</button>
        <button class="btn" onclick="this.closest('div[style*=fixed]').remove();window._c3res(1)">${btn2}</button>
        ${btn3?`<button class="btn" style="opacity:.7" onclick="this.closest('div[style*=fixed]').remove();window._c3res(2)">${btn3}</button>`:''}
      </div></div>`;
    window._c3res=res;
    document.body.appendChild(ov);
  });
}

function calcTaskDurSec(startTime,endTime,workerId){
  const st=startTime instanceof Date?startTime:new Date(startTime);
  let et=endTime instanceof Date?endTime:(endTime?new Date(endTime):srvNow());
  // 🛑 קטע עבודה רץ לא חוצה את סוף יום העבודה שלו (06/10/2026). משימה שלא הושהתה
  // בסוף היום (מכשיר עם עותק ישן, השהיה שלא נשמרה) נעצרה רק ב-05/10 — ונספרו לה
  // 5,697 דק' של לילות וסופ"ש (شهناز, תאסיסי עיבוד). חידוש מתחיל קטע חדש עם startTime
  // של אותו יום, ולכן קטע לגיטימי אף פעם לא עובר לילה. החיתוך כמו בשרת (attendanceCloser):
  // יציאת העובד באותו יום אם ידועה, אחרת סוף המשמרת.
  if(!isNaN(st)&&!isNaN(et)&&et.toDateString()!==st.toDateString()){
    const d=st.getFullYear()+'-'+pad2(st.getMonth()+1)+'-'+pad2(st.getDate());
    let cut=shiftEndDate(d);
    const rec=(S.attHistory||[]).find(r=>r.workerId===workerId&&r.date===d);
    const co=rec?(attLastOut(rec)||rec.checkout):null;
    if(co&&!isNaN(new Date(co)))cut=new Date(co);
    if(et>cut)et=cut<st?st:cut;
  }
  const w=S.workers.find(x=>x.id===workerId);
  let ms=et-st;
  if(w&&w.breakActive&&w.breakStart&&w.breakEnd){
    const ref=st.toDateString();
    const bs=new Date(ref+' '+w.breakStart).getTime();
    const be=new Date(ref+' '+w.breakEnd).getTime();
    if(be>bs){const os=Math.max(st.getTime(),bs);const oe=Math.min(et.getTime(),be);if(oe>os)ms-=(oe-os);}
  }
  return Math.round(Math.max(0,ms)/1000);
}
function calcNetWork(w){
  const sessions=w.sessions&&w.sessions.length?w.sessions:
    (w.checkin?[{in:w.checkin,out:w.checkout||null}]:[]);
  if(!sessions.length)return 0;
  let total=0;
  sessions.forEach(s=>{
    const ci=new Date(s.in).getTime();
    const co=s.out?new Date(s.out).getTime():Date.now();
    let dur=co-ci;
    if(w.breakActive&&w.breakStart&&w.breakEnd){
      const ref=new Date(s.in).toDateString();
      const bs=new Date(ref+' '+w.breakStart).getTime();
      const be=new Date(ref+' '+w.breakEnd).getTime();
      if(be>bs){const os=Math.max(ci,bs);const oe=Math.min(co,be);if(oe>os)dur-=(oe-os);}
    }
    total+=Math.max(0,dur);
  });
  return total;
}
// מיגרציה: עובדים ישנים ללא sessions
function migrateToSessions(){
  S.workers.forEach(w=>{
    if(!w.sessions){
      w.sessions=w.checkin?[{in:w.checkin,out:w.checkout||null}]:[];
    }
  });
}
// canWrite=false כשהמקור הוא cache/localStorage — ברירות המחדל נקבעות בזיכרון
// בלבד. קודם נכתב כאן אובייקט העובד *כולו*, לכל העובדים, גם מ-snapshot של
// ה-cache: עובד אחד ישן בלי שדה הפסקה הספיק כדי שמכשיר שנפתח עם cache בן כמה
// דקות יחזיר את כל כרטיסי העובדים לאחור וימחק חתימות כניסה טריות ממכשירים
// אחרים. עכשיו נכתבים שדות ההפסקה בלבד, ורק לעובד שבאמת חסרים לו.
function migrateBreaks(canWrite){
  const fixed=[];
  S.workers.forEach(w=>{
    let fix=false;
    if(!w.breakStart){w.breakStart=defBreakStart();fix=true;}
    if(!w.breakEnd){w.breakEnd=defBreakEnd();fix=true;}
    if(w.breakActive===undefined||w.breakActive===null){w.breakActive=true;fix=true;}
    if(fix)fixed.push(w);
  });
  if(!canWrite||!fixed.length||!S.fbConnected)return;
  fixed.forEach(w=>fbSet('workers',w.id,{breakStart:w.breakStart,breakEnd:w.breakEnd,breakActive:w.breakActive}));
}
function fmtNetH(ms){
  if(!ms)return '—';
  const mins=Math.floor(ms/60000);
  if(mins<60)return mins+"'";
  return Math.floor(mins/60)+':'+(mins%60).toString().padStart(2,'0');
}
function fAtt(f){S.attFilter=f;renderAtt();}
function renderAtt(){
  // הצג/הסתר כפתור עדכון פנים לעובד המחובר
  const faceBox=document.getElementById('att-face-update-box');
  if(faceBox&&S.user){
    const me=S.workers.find(x=>x.id===S.user.id);
    faceBox.classList.toggle('hidden',!(me&&me.faceUpdateAllowed));
  }
  // סריקת ברקוד ליציאה — רק לעובד שנכנס במסלול הברקוד (בלי פנים, עם נעילת מכשיר) וכרגע נוכח
  const bcBox=document.getElementById('att-bc-box');
  if(bcBox){
    const me=S.user?S.workers.find(x=>x.id===S.user.id):null;
    const show=!!(me&&me.status==='in'&&_bcLoginEligible(me.user||''));
    bcBox.style.display=show?'':'none';
    if(!show)stopBcPunch();
  }
  const inW=S.workers.filter(w=>w.status==='in');
  const outW=S.workers.filter(w=>w.status==='out');
  document.getElementById('att-in').textContent=inW.length;
  document.getElementById('att-out').textContent=outW.length;
  const totalNet=S.workers.filter(w=>w.checkin).reduce((s,w)=>s+calcNetWork(w),0);
  const tnEl=document.getElementById('att-total-net');
  if(tnEl)tnEl.textContent=fmtNetH(totalNet)||'—';
  const list=S.attFilter==='all'?S.workers:S.attFilter==='in'?inW:outW;
  document.getElementById('att-list').innerHTML=list.map(w=>{
    const sessions=w.sessions&&w.sessions.length?w.sessions:(w.checkin?[{in:w.checkin,out:w.checkout||null}]:[]);
    const netMs=calcNetWork(w);
    const netStr=fmtNetH(netMs);
    const brkStr=w.breakActive?`${w.breakStart||''}–${w.breakEnd||''}`:null;
    const roleLabel=w.role==='manager'?'<span class="badge blue" style="font-size:10px">מנהל</span>':w.role==='supervisor'?'<span class="badge amber" style="font-size:10px">אחראי</span>':'';
    const sessionsHtml=sessions.map((s,i)=>{
      const ci=new Date(s.in);const co=s.out?new Date(s.out):null;
      return`<span style="font-size:10px;color:var(--txt3)">${i+1}. ▶${pad2(ci.getHours())}:${pad2(ci.getMinutes())} ${co?'◀'+pad2(co.getHours())+':'+pad2(co.getMinutes()):'<span style="color:var(--green-txt)">בעבודה</span>'}</span>`;
    }).join('<br/>');
    return`<div class="row">
      <div class="av" style="width:30px;height:30px;font-size:10px">${esc(w.name.split(' ').map(n=>n[0]).join(''))}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:var(--txt)">${esc(w.name)} ${roleLabel}</div>
        <div style="font-size:11px;color:var(--txt3)">${esc(w.dept)}${brkStr?` · הפסקה ${brkStr}`:''}</div>
        ${sessions.length>1?`<div style="margin-top:3px;line-height:1.8">${sessionsHtml}</div>`:''}
      </div>
      <div style="text-align:center;min-width:110px">
        <span class="badge ${w.status==='in'?'green':'red'}">${w.status==='in'?'<span class="pulse"></span> בעבודה':'יצא/ה'}</span>
        ${sessions.length===1?`<div style="font-size:11px;color:var(--txt3);margin-top:3px;display:flex;gap:6px;justify-content:center">
          <span>▶ ${pad2(new Date(sessions[0].in).getHours())}:${pad2(new Date(sessions[0].in).getMinutes())}</span>
          <span>◀ ${sessions[0].out?pad2(new Date(sessions[0].out).getHours())+':'+pad2(new Date(sessions[0].out).getMinutes()):'—'}</span>
        </div>`:`<div style="font-size:10px;color:var(--txt2);margin-top:2px">${sessions.length} כניסות</div>`}
        <div style="font-size:11px;color:var(--blue-txt);font-weight:500;margin-top:2px">⏱ ${netStr}</div>
      </div></div>`;
  }).join('');
}

