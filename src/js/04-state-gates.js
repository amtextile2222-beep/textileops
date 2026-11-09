// ─── 🔧 מחלקות שבהן תחנה = מכונה פיזית (אדם אחד עליה) ─────────────
// תחנה במחלקות התפירה היא מכונת תפירה, ועליה יושב אדם אחד בלבד. שאר התחנות
// (קבלה, גימור, אריזה) הן אזורי עבודה שכמה אנשים חולקים בלגיטימיות — ולכן
// הבלעדיות היא **פר-מחלקה** ולא גורפת. ניתן לעריכה בלשונית הניהול.
const DEFAULT_EXCLUSIVE_DEPTS=['قسم الخياطة 1','قسم الخياطة 2'];
// ─── STATE ──────────────────────────────────────────────────
let S={
  user:null,
  // אין עובדי דמו — הרשימה נטענת מ-Firebase בלבד. מכשיר טרי מתחיל ריק עד שהנתונים מגיעים.
  workers:[],
  depts:['חיתוך','תפירה','גימור','איכות','אריזה'],
  deptStations:{},  // {"תפירה":["שרוולים","צווארונים"]} — תחנות פר מחלקה (תמחור שלב א')
  deptStageMap:{},  // {"תפירה":"sewing"} — מיפוי מחלקה→שלב ייצור; סריקה במחלקה מסמנת אוטומטית את השלב
  activeTasks:[],
  histTasks:[],
  alerts:[],
  settings:{thresh:60,absent:5,waEnabled:false,waInterval:60,waFrom:'07:00',waTo:'18:00',waLong:true,waAbsent:true,factoryIP:'188.225.231.120',shiftStart:'06:30',shiftEnd:'15:00',roundMinutes:5,endOfDayTime:'15:05',ipBypassMin:0,ipBypassStartMs:0,stationLock:false,stepOrderLock:false,stepOrderStrict:false,stepOrderStrictFrom:0,exclusiveDepts:DEFAULT_EXCLUSIVE_DEPTS.slice(),
    // 📄 פרטי העסק לתעודת משלוח — ניתנים לעריכה בלשונית ניהול; אלה ברירות המחדל
    company:{name:'א.מ טקסטיל',addr:'באקה אלגרבייה',city:'',phone:'052-3381376',taxId:'066055450',email:''},
    // המספר הראשון שיונפק — ממשיך את הפנקס הידני
    dnStart:645,
    // 🧾 חשבונית עסקה — המספר הראשון שיונפק (ממשיך את הפנקס הידני) ואחוז המע"מ
    invStart:171,vatPct:18,
    // 🕳 יומן תעודות שבוטלו — ראה dnVoidAdd. נשמר כדי שחור ברצף המספור
    // לא ייראה כתעודה שנעלמה מהמערכת.
    dnVoids:[],
    // 📦 מחירון חומר האריזה ₪ ליחידה — נערך בלשונית ניהול. ברירת מחדל 0 ולא מספר
    // מומצא: מחיר שגוי שנצרב על תעודה גרוע ממחיר חסר, שהמערכת צועקת עליו.
    packPrices:{hanger:0,clip:0,nylon:0,cello:0}},
  waLastSent:0,
  wifiAlertSent:{},
  tgSentAlerts:{},
  tgAbsentSig:'',
  nextTId:1,
  fbConnected:false,
  attFilter:'all',
  modalAction:null,
  attHistory:[],  // {workerId, workerName, dept, date, checkin, checkout, breakStart, breakEnd, breakActive}
  products:[],    // {id, prod, cust, name, images:[], docs:[], quantities:[{size,color,qty}]}
  costs:{workerRates:{}, workerUnitRates:{}, oversightPct:{}, oversightDepts:{}, fixedDaily:0, fixedMonthly:0, workDaysMonth:22, fixedAnnual:0, workDaysYear:250, variableExpenses:[],
    // תמחור שלב ג' — שעה עמוסה + תקורה
    workerTransport:{}, workerInsurance:{}, severancePct:8.33, holidayDays:4, giftsAnnual:0, tripAnnual:0, overheadBufferPct:10, costMonths:[],
    difficultyWeights:{1:1,2:1.5,3:2,4:2.5,5:3.5}},
  workerExpenses:[],
  // 🧾 קופת המפעל — מעקב מזומן בלבד. **לא הוצאות**: לא נכנסת לתקורה,
  // לא ל-recordedExpenseSum ולא לשום חישוב עלות או רווח.
  cashbox:[],
  customerNames:{},
  // 📄 פרטי לקוח לתעודת משלוח — כתובת/איש קשר/טלפון/ח.פ.
  // ⚠️ מפה **נפרדת** מ-customerNames בכוונה: customerNames הוא מפת code→string
  // שחמישה צרכנים קוראים כמחרוזת (custName, טלגרם, דוחות, בורר מוצרים). הפיכתו
  // לאובייקט = שינוי חוזה שמתאפס בשקט אצל כל צרכן שלא עודכן. ראה gotcha_shared_map_key_change.
  customerInfo:{},  // {code:{addr,city,contact,phone,taxId}}
  customColors:{},
  costTab:'prod',
  workStations:[], // תחנות עבודה פיזיות (QR STN:{id}) — {id,name,dept,dvrChannel}; שונה מ-deptStations (תמחור)
};

// ─── תחנות, רמות קושי ומיומנויות — תמחור שלב א' ─────────────
const LEVELS={1:{he:'קל',ar:'سهل',en:'Easy'},2:{he:'בינוני',ar:'متوسط',en:'Medium'},3:{he:'מעל בינוני',ar:'فوق المتوسط',en:'Above medium'},4:{he:'קשה',ar:'صعب',en:'Hard'},5:{he:'מורכב',ar:'معقد',en:'Complex'}};
function levelName(l,lang){return LEVELS[l]?(LEVELS[l][lang||currentLang]||LEVELS[l].he):'';}
// שלב עבודה: מחרוזת (פורמט ישן) או {name,nameAr,level,station} — תאימות לאחור
function stepName(s){return typeof s==='string'?s:(s?.name||'');}
function stepDisplay(s){if(typeof s==='string')return s;return(currentLang==='ar'&&s?.nameAr)?s.nameAr:(s?.name||'');}
function stepLevel(s){return(s&&typeof s==='object'&&s.level)?+s.level:0;}
function stepStation(s){return(s&&typeof s==='object'&&s.station)?s.station:'';}
function stepManualMin(s){return(s&&typeof s==='object'&&+s.manualMin>0)?+s.manualMin:0;} // דקות ידניות ליחידה — דורס חישוב אוטומטי
// ✂ שלב גזירה — נמדד מול `cutPrice` ולא מול מחיר המכירה. הסימון **ידני בכרטיס המוצר**
// ולא נגזר מהתחנה: ב-19 משימות הגזירה שבהיסטוריה שדה `station` ריק לחלוטין, ולכן זיהוי
// לפי תחנה בדיעבד מחזיר אפס. ראה gotcha_station_display.
function stepIsCut(s){return!!(s&&typeof s==='object'&&s.cut);}
// ✂ אחוז רווח היעד של הגזירה — שדה נפרד מ-`targetProfitPct` של התפירה. שני העיסוקים
// מתומחרים אחרת ולכן גם הרווח עליהם שונה (החלטת המשתמש 30/08).
// 🛑 כל עוד `cutProfitPct` לא הוזן, החישוב **נופל לאחוז התפירה** — בדיוק ההתנהגות שהייתה
// עד היום. ברירת מחדל אחרת (0%, למשל) הייתה משנה מספרים חיים בשקט בכל מוצר עם `cutPrice`.
// מה שדוחף להזין הוא האזהרה האדומה בכרטיס המוצר, לא שינוי שקט בנתונים.
function cutProfitPctOf(p){
  const v=p&&p.cutProfitPct;
  return(v!=null&&v!==''&&isFinite(+v))?+v:(+(p&&p.targetProfitPct)||0);
}
function hasCutProfitPct(p){const v=p&&p.cutProfitPct;return v!=null&&v!==''&&isFinite(+v);}
function stepBadge(s){const l=stepLevel(s);return(s&&typeof s==='object'&&s.quick?` <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:var(--amber-bg);color:var(--amber-txt);border:1px solid var(--brd)">⚡ מהיר</span>`:'')+(s&&typeof s==='object'&&s.merge?` <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:var(--blue-bg);color:var(--blue-txt);border:1px solid var(--brd)">🔗 מאחד</span>`:'')+(l?` <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:var(--bg2);color:var(--txt3);border:1px solid var(--brd)">${levelName(l)}</span>`:'');}
// שלב "מהיר" ⚡ — פטור מהגבלת 2 שלבים/2 ברקודים בשני הסורקים
function isQuickStep(cust,prod,stepNm){
  const p=findProd(cust,prod);if(!p)return false;
  const s=(p.workSteps||[]).find(w=>stepName(w)===stepNm);
  return!!(s&&typeof s==='object'&&s.quick);
}

// ─── משפחת תחנות ─────────────────────────────────────────────────
// תחנות שנבדלות רק במספר בסוף הן תחנה אחת לצורך נעילת שלב:
// "حبكي 1" / "حبكي 2" / "حبكي 5" → "حبكي".  **חוצה מחלקות** (החלטת המשתמש 03/08):
// אותו שם תחנה בכל מחלקה = אותה משפחה, ולכן حبكي 5 שב-قسم الخياطة 2 מצטרפת ל-حبكي 1-4.
// ⚠ נחתך רק מספר בסוף — "حبكي 5خيطان 6" → "حبكي 5خيطان" ולכן היא **לא** מתמזגת עם "حبكي".
// שם שכולו ספרות נשאר כמו שהוא, כדי ששתי תחנות כאלה לא ייפלו לאותה משפחה ריקה.
function stationFamily(name){
  const raw=String(name||'').trim();
  const fam=raw.replace(/[\s٠-٩۰-۹\d]+$/,'').trim();
  return (fam||raw).toLowerCase();
}
// שם התחנה מתוך מפתח השלב "מחלקה::תחנה" (שלב ישן עשוי לשאת שם חשוף בלי מחלקה)
function stationNameOfKey(key){const i=String(key||'').indexOf('::');return i<0?String(key||''):String(key).slice(i+2);}
function stepFamily(s){const st=stepStation(s);return st?stationFamily(stationNameOfKey(st)):'';}
// ─── 📅 תחנה של אתמול אינה שיוך — היא שריד ────────────────────────
// `functions/index.js` סוגר נוכחות ומשימות בסוף היום אבל **לא נוגע ב-currentStation**
// (השדה מופיע שם פעם אחת, לקריאה בלבד, עבור התראת הטלגרם). לכן עובד שיומו נסגר
// בשרת נכנס למחרת עם התחנה של אתמול, `stationGate` מאשר לו להתחיל משימה בלי
// שסרק כלום, והמשימה נחתמת בתחנה שהוא לא ישב עליה.
// נמדד 21/09: ל-ابوزكي אפס רשומות `stationLog` היום, ובכל זאת המשימה שלו מ-06:30
// נושאת `station:"درزه 1"` — החותמת של אתמול.
// 🔑 בלי `since` נחשב מיושן: הוא נכתב בכל שיוך מאז יולי, ולכן היעדרו = רשומה פגומה,
// ומחיר הטעות הוא סריקה אחת מול שיוך שלם שמבוסס על כלום.
// ⚠️ `since` נשמר ב-ISO (**UTC**) ו-`todayStr()` הוא **מקומי** — השוואת `slice(0,10)`
// ביניהם שגויה בשעות שבהן התאריכים נפרדים (בישראל: מחצות עד 03:00 התאריך ב-UTC
// עדיין אתמול). לכן ממירים ליום מקומי ורק אז משווים.
function _dayKeyLocal(v){
  const t=Date.parse(v);if(!t)return '';
  const d=new Date(t);
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}
function stationStale(cs){
  if(!cs)return false;
  if(!cs.since)return true;
  const k=_dayKeyLocal(cs.since);
  return !k||k!==todayStr();
}
// התחנה **התקפה** של העובד. כל קורא שמסיק ממנה משהו צריך לעבור דרך כאן.
// ⚠️ `stationOccupant` מכוון **לא** עובר דרך כאן — שריד שתופס מכונה צריך להימצא
// ולהשתחרר כשמישהו סורק אותה, אחרת הוא היה נשאר רשום עליה לנצח.
function curStation(w){const cs=w?.currentStation;return stationStale(cs)?null:cs||null;}
function workerFamily(w){return stationFamily(curStation(w)?.name||'');}
// ─── תחנות משניות לשלב (🔀 altStations) ───────────────────────────
// שלב שמתבצע על יותר מסוג מכונה אחד — `4335` נעשה גם ב-درزه וגם ב-مخبلت.
// 🔑 **שדה נפרד ולא הפיכת `station` למערך**: `stepStation` נקרא ב-14 מקומות
// (תמחור, מיומנויות, דוח שיבוץ, הגנת מחיקה, אודיטים) וכולם מצפים למחרוזת.
// הפיכתו למערך = שינוי חוזה שמתאפס בשקט אצל כל צרכן שלא עודכן —
// ראה [[gotcha_shared_map_key_change]]. כך רק שלושה קוראים צריכים להכיר את זה.
// ה-`station` הראשי נשאר מקור האמת לכל השאר, ולכן שלב **חייב** תחנה ראשית גם עכשיו.
function stepAltStations(s){
  const a=(s&&typeof s==='object')?s.altStations:null;
  return Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.trim()):[];
}
// כל מפתחות התחנה המורשים לשלב — הראשי ואחריו המשניות, בלי כפילויות
function stepStationKeys(s){
  const out=[],seen=new Set();
  for(const k of [stepStation(s),...stepAltStations(s)]){
    const t=String(k||'').trim();if(!t||seen.has(t))continue;seen.add(t);out.push(t);
  }
  return out;
}
// כל המשפחות המורשות. ריק = לשלב אין תחנה כלל (וזה מה שהשער חוסם).
function stepFamilies(s){
  const out=[],seen=new Set();
  for(const k of stepStationKeys(s)){
    const f=stationFamily(stationNameOfKey(k));if(!f||seen.has(f))continue;seen.add(f);out.push(f);
  }
  return out;
}
// האם השלב פתוח לעובד לפי התחנה שסרק — **כל אחת** מהמשפחות המורשות מספיקה
function stepAtWorkerStation(s,w){const wf=workerFamily(w);return!!wf&&stepFamilies(s).includes(wf);}

// ─── לוח מצב הזמנות (צנרת ייצור) ─────────────────────────────────
// שמונה רשימות שמשקפות את זרימת העבודה במפעל כפי שהמשתמש תיאר אותה (30/08):
//   הקמת כרטיס → סריקה בקבלה → הזנת כמויות → סריקה בתפירה → סיום שלבי התפירה
//   → סריקה באריזה → סיום שלבי האריזה → ברקוד "יצא ללקוח"
//
// ⚠️ **המנוע כאן הוא המחלקה שנסרקה (`t.dept`) — לא `stageLog`.** `stageLog`/`deptStageMap`
// משרתים את "דוח ייצור לפי שלב", והם מסמנים שלב בסריקה **הראשונה** במחלקה ⇒ אינם יודעים
// להבחין בין "התחיל" ל"סיים", וזו בדיוק ההבחנה שהלוח הזה בנוי סביבה. הדבר היחיד שנלקח
// מ-`stageLog` הוא `shipped` — הוא נקבע בברקוד "יצא ללקוח" ולא בסריקת עובד, ולכן אמין.
// 🛑 אל תמפה את הלוח הזה ל-`deptStageMap`: שם `قسم اريزه` ממופה ל-`iron` ולא ל-`pack`,
//    ו-`قسم الخياطة 2` לא ממופה כלל (89 שלבי עבודה). המיפוי כאן עצמאי ומכסה את שתיהן.
const PIPE_LISTS=[
  {id:'intake',    label:'📥 כניסת הזמנה',   hint:'הכרטיס הוקם, טרם נסרק דבר'},
  {id:'countcut',  label:'🔢 ספירה וגזירה',  hint:'נסרק בקבלת סחורה, הכמות עדיין לא הוזנה'},
  {id:'ready_sew', label:'🧵 מוכן לתפירה',   hint:'הכמות ידועה, התפירה טרם התחילה'},
  {id:'sewing',    label:'🪡 בתפירה',        hint:'נסרק לפחות ברקוד אחד בתפירה'},
  {id:'ready_pack',label:'📦 מוכן לאריזה',   hint:'כל שלבי התפירה הגיעו לכמות המלאה'},
  {id:'packing',   label:'🧥 באריזה',        hint:'נסרק לפחות ברקוד אחד באריזה'},
  {id:'ready_ship',label:'🚚 מוכן ליציאה',   hint:'כל שלבי האריזה הגיעו לכמות המלאה, או שהופקה תעודת משלוח'},
  {id:'shipped',   label:'✅ יצא ללקוח',     hint:'סומן "יצא ללקוח" (הסחורה יצאה מהמפעל)'},
];
const PIPE_IDX=id=>PIPE_LISTS.findIndex(l=>l.id===id);
// התווית בלי האמוג'י — לכפתור הדחיפה, שאחרת נשבר לשתי שורות בתוך כרטיס של 190px
const pipeShortLabel=L=>String(L?.label||'').replace(/^\S+\s*/,'');
// מחלקה → משפחת צנרת. מזוהה לפי מילות מפתח ולא לפי רשימת המחלקות הנוכחית, כי בהיסטוריה
// יש 8 שמות מחלקה שכבר לא קיימים (`قسم الخياطة` בלי מספר — 1,222 משימות · `חיתוך` 534 ·
// `خياطة` 220 · `תפירה` 141 · `فحص` 76 · `אריזה` 41 · `تغليف` 11 · `كوي تغليف` 1).
// נמדד 30/08: 13 מתוך 13 שמות המחלקה שנצפו בנתונים מזוהים, ו-100% מסריקות המוצרים החיים.
// ⚠️ גיהוץ/ניקוי/ביקורת נכנסים ל-`pack` בכוונה — במפעל הם מבוצעים ב-`قسم اريزه`.
function pipeFamOfDept(d){
  const s=String(d||'').toLowerCase();
  if(/استقبال|قص|קבל|חית|גזיר/.test(s))return 'recv';
  if(/خياط|خيط|תפיר/.test(s))return 'sew';
  if(/اريز|تغليف|كوي|فحص|אריז|גיהו|ניקו|ביקור/.test(s))return 'pack';
  return '';
}
function pipeFamOfStep(s){return pipeFamOfDept(String(stepStation(s)||'').split('::')[0]);}
// 🔢 (03/11/2026) סדר שלבי העבודה לפי מחלקה: קבלת סחורה ← תפירה (1 ו-2 = אחת) ← אריזה; בתוך מחלקה — הסדר שהוזן.
// שלב בלי תחנה/מחלקה לא מזוהה נשאר צמוד לשלב שלפניו. מיון יציב — שלב שנשכח ונוסף בסוף עולה למקומו
function sortStepsByDept(steps){
  const R={recv:0,sew:1,pack:2};let prev=0;
  return steps.map((s,i)=>{const f=pipeFamOfStep(s);if(f in R)prev=R[f];return{s,i,r:prev};}).sort((a,b)=>a.r-b.r||a.i-b.i).map(x=>x.s);
}
// מצב הצנרת של רשומת מוצר אחת. `tasks` = כל המשימות **של ההזמנה הזו בלבד** (שויכו ב-taskOrderStamp).
function pipeStateOf(p,tasks){
  const qty=_prodQty(p);
  const scans={recv:0,sew:0,pack:0,none:0};
  for(const t of tasks){const f=pipeFamOfDept(t.dept);if(f)scans[f]++;else scans.none++;}
  // שלבי העבודה מחולקים למשפחות לפי התחנה שלהם
  const steps={recv:[],sew:[],pack:[],none:[]};
  for(const s of (p.workSteps||[])){const nm=stepName(s);if(!nm)continue;(steps[pipeFamOfStep(s)||'none']).push(nm);}
  // כמה יחידות בוצעו בכל שלב — ניכוי ספירה כפולה של אצווה, בדיוק כמו stepDoneMap
  const seen=new Set(),done={};
  for(const t of tasks){
    if(!(t.duration>0))continue;
    const k=coverKey(t);if(seen.has(k))continue;seen.add(k);
    done[String(t.taskType||'').trim()]=(done[String(t.taskType||'').trim()]||0)+taskUnits(t);
  }
  // ✔ שלב שסומן ידנית כגמור (לא כל הברקודים נסרקו) = כל הכמות. ⚠️ זהה ב-trackStates בשרת
  for(const m of (p.stepMarks||[]))if(m&&m.n)done[m.n]=Math.max(done[m.n]||0,qty);
  const fam=f=>{const ss=steps[f];if(!ss.length)return null;
    return{full:ss.filter(nm=>qty>0&&(done[nm]||0)>=qty).length,of:ss.length};};
  const sew=fam('sew'),pack=fam('pack');
  // שלבים שלא הגיעו לכמות — לטולטיפ בכרטיס (כדי לראות מי עוצר את ההזמנה)
  // הנמוך ראשון — הוא צוואר הבקבוק שקובע כמה יחידות מוכנות
  const lowOf=f=>steps[f].filter(nm=>!(qty>0&&(done[nm]||0)>=qty)).sort((a,b)=>(done[a]||0)-(done[b]||0)).map(nm=>nm+' '+Math.min(done[nm]||0,qty)+'/'+qty);
  if(sew)sew.low=lowOf('sew');if(pack)pack.low=lowOf('pack');
  // 🚚 הופקה תעודת משלוח ≠ הסחורה יצאה (10/10/2026): תעודה ⇒ "מוכן ליציאה"; "יצא ללקוח" רק אחרי
  // סימון יציאה (`departedAt`, כפתור בלוח). תעודה מתאריך לפני PIPE_DEPART_FROM = יצאה (לא היה סימון עד אז).
  // ⚠️ זהה ב-trackStates בשרת (functions/index.js) — דף המעקב של הלקוח
  const shipped=(p.stageLog||[]).some(e=>e.id==='shipped')||+p.shippedQty>0;
  // 🚚 משלוח חלקי (20/10/2026): 14771 — יצאו 2 מתוך 135 והכרטיס כולו עבר ל"מוכן ליציאה". עכשיו רק
  // היחידות שיצאו (total + ✂ לא תפור, כמו "יתרה להשלמה") עוברות; היתרה נשארת במצב הייצור שלה.
  // יציאה **פר תעודה**: תעודה שהופקה (at) עד departedAt = יצאה; תעודה מאוחרת יותר = ממתינה לסימון.
  // ⚠️ זהה ב-trackShipInfo בשרת
  const shL=shipped?prodShipments(p):[];
  const shU=s=>(+s.total||0)+shUnsewn(s);
  const depT=p.departedAt?Date.parse(p.departedAt):NaN;
  const shDep=s=>{const d=String(s.date||'').slice(0,10);if(d&&d<PIPE_DEPART_FROM)return true;if(isNaN(depT))return false;
    return !(_shipAtMs(s)>depT);};
  const outU=shL.reduce((t,s)=>t+shU(s),0),depU=shL.reduce((t,s)=>t+(shDep(s)?shU(s):0),0);
  // 🛑 לא חלקי: תעודה אחרונה לפני PIPE_PARTIAL_FROM (הזמנות ישנות שנסגרו בחוסר לא חוזרות ללוח),
  // או שהמנהל דחף ידנית ל"מוכן ליציאה"/הלאה = "סוגרים את ההזמנה בחוסר"
  const lastD=shL.reduce((m,s)=>String(s.date||'')>m?String(s.date||''):m,'');
  const ovShip=!!p.pipeOverride&&PIPE_IDX(p.pipeOverride.list)>=PIPE_IDX('ready_ship');
  const partial=shipped&&qty>0&&shL.length>0&&outU<qty&&lastD>=PIPE_PARTIAL_FROM&&!ovShip;
  const departed=shipped&&!partial&&(shL.length?depU>=outU:(!!p.departedAt||String(pipeDnDate(p)||'9999')<PIPE_DEPART_FROM));
  let id;
  if(departed)                                   id='shipped';
  else if(shipped&&!partial)                     id='ready_ship';
  else if(pack&&pack.of>0&&pack.full===pack.of)  id='ready_ship';
  else if(scans.pack>0)                          id='packing';
  else if(sew&&sew.of>0&&sew.full===sew.of)      id='ready_pack';
  else if(scans.sew>0)                           id='sewing';
  else if(qty>0&&scans.recv>0)                   id='ready_sew';
  else if(scans.recv>0)                          id='countcut';
  else                                           id='intake';
  // 📌 דחיפה ידנית של מנהל. **קדימה בלבד** — אם המצב האמיתי כבר עקף אותה היא נבלעת
  // מעצמה ולא מחזיקה כרטיס אחורה. `shipped` תמיד גובר.
  const nat=id;
  const ov=p.pipeOverride&&PIPE_IDX(p.pipeOverride.list)>=0?p.pipeOverride:null;
  if(ov&&nat!=='shipped'&&PIPE_IDX(ov.list)>PIPE_IDX(nat))id=ov.list;
  // ✂️ פיצול (18/10/2026): ההזמנה מחולקת בין "בתפירה" / "מוכן לאריזה" / "באריזה" לפי יחידות:
  //   sewDone = יחידות שסיימו את **כל** שלבי התפירה = השלב הנמוך ביותר (צוואר הבקבוק)
  //   packIn  = יחידות שנסרקו באריזה (כולל משימות רצות) — השלב עם הכי הרבה
  //   באריזה = packIn · מוכן לאריזה = max(sewDone,packIn)−packIn · בתפירה = השאר.
  // הכרטיס מוצג בכל עמודה שיש בה יחידות (רק כשיותר מאחת). לא בדחיפה ידנית (המנהל קבע את המצב).
  // ⚠️ זהה ב-trackStates בשרת (split + sewPct)
  let split=null,parts=null;
  if(id===nat&&sew&&qty>0&&['sewing','ready_pack','packing'].includes(nat)){
    const sewDone=Math.min(...steps.sew.map(nm=>Math.min(done[nm]||0,qty)));
    const inn={},sn=new Set();
    for(const t of tasks){if(pipeFamOfDept(t.dept)!=='pack')continue;const k=coverKey(t);if(sn.has(k))continue;sn.add(k);
      const nm=String(t.taskType||'').trim();inn[nm]=(inn[nm]||0)+taskUnits(t);}
    const packIn=Math.min(qty,Math.max(0,...Object.values(inn))),reached=Math.max(sewDone,packIn);
    parts={sewing:qty-reached,ready_pack:reached-packIn,packing:packIn};
  }
  // 🚚 משלוח חלקי: היחידות שיצאו יורדות מהעמודה המתקדמת ביותר ועוברות ל"מוכן ליציאה" (תעודה בלי
  // סימון יציאה) / "יצא ללקוח". הזמנה שיצאה כולה בכמה תעודות — חלק יצא וחלק ממתין ⇒ פיצול גם כן.
  if(id===nat&&partial){
    parts=parts||{[nat]:qty};let take=outU;
    for(const k of PIPE_LISTS.map(l=>l.id).reverse()){const d=Math.min(parts[k]||0,take);if(d){parts[k]-=d;take-=d;}}
    parts.ready_ship=(parts.ready_ship||0)+outU-depU;parts.shipped=(parts.shipped||0)+depU;
  }else if(id===nat&&shipped&&!partial&&depU>0&&depU<outU)parts={ready_ship:outU-depU,shipped:depU};
  if(parts){
    const nz=PIPE_LISTS.map(l=>l.id).filter(k=>parts[k]>0);
    // הכפתורים מוצגים בעותק אחד: בעמודת המצב אם יש בה יחידות, אחרת במתקדמת
    if(nz.length>1)split={...parts,main:parts[id]>0?id:nz[nz.length-1]};
  }
  // outPend = יחידות עם תעודה שעוד לא סומנו "יצא ללקוח" — לכפתור 🚚 בכרטיס
  return{id,nat,ov:id===ov?.list?ov:null,qty,scans,steps,sew,pack,shipped,departed,partial,outU,outPend:shL.length?outU-depU:0,split,tasks:tasks.length};
}
const PIPE_DEPART_FROM='2026-10-10';
// מועד התעודה מול departedAt (תעודה ששוחזרה/הוקדמה — לפי התאריך שלה). ⚠️ זהה ב-trackShipInfo בשרת
const _shipAtMs=s=>{const d=String(s.date||'').slice(0,10);return Date.parse((s.restoredAt||s.backdatedAt)?d:(s.at||d));};
const PIPE_PARTIAL_FROM='2026-10-20'; // משלוח חלקי נספר רק מתעודה מהתאריך הזה (ראה pipeStateOf)
// תאריך התעודה (רישום "shipped" בלוג, שנכתב בהפקת תעודה)
function pipeDnDate(p){
  const s=(p.stageLog||[]).find(e=>e.id==='shipped');
  if(s?.date)return s.date;
  return p.shippedAt?String(p.shippedAt).slice(0,10):'';
}
// תאריך הכניסה למפעל: מועד הקמת הכרטיס, ובהיעדרו תאריך "קבלת סחורה" מהלוג.
function pipeEntryDate(p){
  if(+p.createdAt)return new Date(+p.createdAt).toISOString().slice(0,10);
  const r=(p.stageLog||[]).find(e=>e.id==='receive');
  return r?.date||'';
}
// תאריך היציאה: סימון היציאה בלוח, ובהיעדרו — תאריך התעודה (הזמנות מלפני PIPE_DEPART_FROM)
function pipeShipDate(p){
  return p.departedAt?String(p.departedAt).slice(0,10):pipeDnDate(p);
}

// ─── שער התחנה: חובת סריקה + נעילת שלב לתחנה ──────────────────────
// מדיניות (03/08): עובד חייב תחנה סרוקה; שלב מותר רק בתחנה מאותה משפחה;
// **שלב בלי תחנה משויכת = חסום** עד שמשייכים לו תחנה בכרטיס המוצר.
// מנהל/אחראי יכולים לעקוף (אישור מפורש) — עובד לא.
function stationLockOn(){return !!S.settings?.stationLock;}
function stationGate(w,cust,prod,stepNames,bc){
  const T=LANGS[currentLang];
  if(!stationLockOn())return{ok:true}; // 🔌 מתג כיבוי מהניהול — ברירת מחדל כבוי
  if(!(S.workStations||[]).length)return{ok:true}; // אין תחנות מוגדרות כלל — אין מה לאכוף
  // 📅 תחנה של אתמול אינה שיוך — curStation מחזיר null והעובד נחסם עד שיסרוק
  if(!curStation(w))return{ok:false,noStation:true,msg:T.st_need_scan||'📍 חובה לסרוק ברקוד תחנה לפני התחלת משימה'};
  // 🔢 רשומת **ההזמנה שבברקוד**. בלי זה השער בודק את שם השלב ברשומה העדכנית,
  // שיכולה לשאת לאותו שלב תחנה אחרת לגמרי ⇒ חסימה על סמך נתון של הזמנה אחרת.
  const p=bcOrderProd(bc||'')||findProd(cust,prod);
  const steps=p?.workSteps||[];
  if(!steps.length)return{ok:true}; // מוצר בלי שלבים מוגדרים (שלב חופשי) — אין על מה לנעול
  const blocked=[];
  for(const nm of(stepNames||[])){
    if(!nm)continue;
    const s=steps.find(x=>stepName(x)===nm);
    if(!s)continue; // שלב שאינו מהמוצר — לא בסמכות השער הזה
    // ⚠️ `need` הוא **מערך** ולא מחרוזת — `logGateEvent` עושה עליו `.join(' / ')`.
    // עד 21/09 נדחפה כאן מחרוזת, ולכן כל חסימה מסוג "תחנה לא נכונה" הפילה את
    // הרישום ב-TypeError שנבלע ב-try/catch של logGateEvent, והאירוע נעלם בשקט.
    // `mergeGate` תמיד דחף מערך — ולכן ב-gateOverrides היו רק אירועי `order`.
    if(!stepFamilies(s).length)blocked.push({step:nm,need:[]});
    else if(!stepAtWorkerStation(s,w))blocked.push({step:nm,need:stepStationKeys(s).map(stationNameOfKey)});
  }
  if(!blocked.length)return{ok:true};
  const noStn=T.st_no_station||'אין תחנה משויכת';
  // טקסט גולמי בלבד — showToast כותב ב-textContent. ההברחה נעשית רק במסלול showConfirm (innerHTML).
  return{ok:false,blocked,msg:(T.st_locked||'🔒 לא בתחנה הנכונה')+' ('+(curStation(w)?.name||'')+'): '+blocked.map(b=>b.step+' → '+(b.need?.length?b.need.join(' / '):noStn)).join(' · ')};
}
// ─── מי כפוף לשערים ומי מקבל אישור עקיפה ──────────────────────────
// ברירת המחדל היא לפי תפקיד: מנהל/אחראי מאשרים עקיפה, עובד/עוזר נחסמים מוחלט.
// אפשר לגבור עליה **פר-עובד** בכרטיס העובד (stationGateMode/stepOrderGateMode).
// הצורך אמיתי: محمد הוא אחראי ש**עובד על הרצפה** — בלי דריסה פר-עובד הוא היחיד
// מבין העובדים בפועל שפטור מהאכיפה, בלי שהוגדר כך במכוון.
function canOverrideStationGate(){return S.user?.role==='manager'||S.user?.role==='supervisor';}
// ⚠️ S.user הוא עותק קפוא מרגע ההתחברות; S.workers נבנה מחדש בכל onSnapshot.
// קריאה משם היא מה שגורם לשינוי שהמנהל עשה עכשיו לתפוס בלי התחברות מחדש.
function _gateWorker(){return S.workers?.find(x=>x.id===S.user?.id)||S.user||{};}
// 'override' = מקבל מודאל אישור · 'enforce' = חסימה מוחלטת
function gateMode(kind){
  const w=_gateWorker();
  const m=kind==='order'?w.stepOrderGateMode:w.stationGateMode;
  if(m==='enforce'||m==='override')return m;
  return canOverrideStationGate()?'override':'enforce';
}
// ─── יומן שערים ───────────────────────────────────────────────────
// כל חסימה וכל עקיפה נרשמות ב-gateOverrides. בלי היומן אי אפשר לדעת בדיעבד אם
// האכיפה עובדת או שפשוט עוקפים אותה — וזו השאלה שתכריע אם להשאיר אותה דלוקה.
// כתיבה fire-and-forget בכוונה: יומן לא יעכב סריקה על רצפת הייצור, ו-Firestore
// מתור כתיבות במצב אופליין ממילא. האוסף נופל תחת כלל ה-catch-all ב-firestore.rules.
function logGateEvent(kind,result,info){
  try{
    const w=_gateWorker();
    const id=Date.now()+'_'+Math.random().toString(36).slice(2,7);
    fbSet('gateOverrides',id,{id,ts:new Date().toISOString(),kind,result,
      workerId:w.id||'',workerName:w.name||'',role:w.role||'',
      station:curStation(w)?.name||'',
      cust:info.cust||'',prod:info.prod||'',bc:info.bc||'',
      steps:(info.steps||[]).filter(Boolean).join(', '),
      need:(info.blocked||[]).map(b=>b.step+' ← '+(b.need||[]).join(' / ')).join(' · ')
    }).catch(e=>console.warn('logGateEvent:',e));
  }catch(e){console.warn('logGateEvent:',e);}
}
// ─── 🔧 אכיפת "עובד אחד למכונה" גם מחוץ לרגע הסריקה ───────────────
// מכונת תפירה היא אילוץ פיזי: שני אנשים לא יכולים לעבוד עליה, נקודה. לכן לא מספיק
// לבדוק בסריקה — צמד ששויך לאותה מכונה לפני שהאכיפה עלתה לאוויר (או בשתי סריקות
// כמעט-בו-זמנית) היה נשאר חופף לנצח, כי שום דבר לא תיקן חפיפה **קיימת**.
// 🔑 ההכרעה לפי **זמן הסריקה** (`currentStation.since`) ולא לפי מי פעל עכשיו —
// כך כל מכשיר שמבחין בחפיפה מגיע לאותה תוצאה, ואין תלות במי לחץ ראשון.
// מי שסרק אחרון מחזיק במכונה; כל השאר משוחררים והמשימות הרצות שלהם נסגרות,
// באותו היגיון של מסירת מכונה = סיום ([[feature_station_exclusive]]).
async function resolveStationOverlap(w){
  const cs=w?.currentStation;
  const st=cs?.id?stationById(cs.id):null;
  if(!st||!stationExclusive(st))return true;
  const others=(S.workers||[]).filter(x=>x.id!==w.id&&x.status==='in'&&x.currentStation?.id===cs.id);
  if(!others.length)return true;
  const T=LANGS[currentLang];
  const mine=Date.parse(cs.since||'')||0;
  const since=o=>Date.parse(o.currentStation?.since||'')||0;
  const newer=others.filter(o=>since(o)>mine);
  if(newer.length){
    // מישהו סרק את המכונה **אחרי** העובד הזה ⇒ הוא כבר לא עליה, והרישום שלו ישן.
    // משחררים אותו וחוסמים — שיסרוק את המכונה שהוא באמת יושב עליה.
    const closed=await closeRunningTasks(w.id,srvNow(),null,{r:'station_stale',n:st.name+' ← '+newer.map(o=>o.name).join(' / ')});
    await closeWorkerStation(w,srvNow());
    logGateEvent('station_busy','stale',{blocked:[{step:st.name,need:newer.map(o=>o.name)}]});
    showToast('📍 '+st.name+' — '+(T.st_busy_by||'תפוסה ע"י')+' '+newer.map(o=>o.name).join(' / ')+
      (closed?' · 🏁 '+closed+' '+(T.st_tasks_closed||'משימות נסגרו'):'')+
      ' — '+(T.st_rescan||'סרוק את ברקוד המכונה שאתה עליה'),'var(--red-txt)',9000);
    try{renderAll();}catch(e){}
    return false;
  }
  // העובד הזה סרק אחרון ⇒ המכונה שלו. כל השאר ישנים יותר ומשוחררים.
  for(const o of others){
    const closed=await closeRunningTasks(o.id,srvNow(),null,{r:'station_overlap',n:st.name+' ← '+w.name});
    await closeWorkerStation(o,srvNow());
    logGateEvent('station_busy','release',{blocked:[{step:st.name,need:[o.name]}]});
    showToast('🔄 '+o.name+' '+(T.st_released||'שוחרר/ה מ־')+st.name+(closed?' · 🏁 '+closed+' '+(T.st_tasks_closed||'משימות נסגרו'):''),'var(--amber-txt)',6000);
    try{sendPushToWorker(o.id,T.st_push_released||'📍 שוחררת מהתחנה',st.name+' — '+w.name).catch(()=>{});}catch(e){}
  }
  try{renderAll();}catch(e){}
  return true;
}
async function passStationGate(w,cust,prod,stepNames,bc){
  // 🔧 קודם האילוץ הפיזי — אין טעם לבדוק שלבים אם שני אנשים רשומים על אותה מכונה
  if(!await resolveStationOverlap(w))return false;
  const g=stationGate(w,cust,prod,stepNames,bc);
  if(g.ok)return true;
  const T=LANGS[currentLang];
  const info={cust,prod,bc,steps:stepNames,blocked:g.blocked};
  if(gateMode('station')!=='override'){logGateEvent('station','blocked',info);showToast(g.msg,'var(--red-txt)',8000);return false;} // textContent — בלי esc
  // showConfirm מזריק ב-innerHTML (וממיר \n ל-<br>) — כאן חובה esc, ושמות תחנה/שלב מגיעים מקלט משתמש
  const ok=await showConfirm(T.st_override_title||'עקיפת נעילת תחנה',esc(g.msg+'\n\n'+(T.st_override_msg||'להתחיל בכל זאת?')),T.st_override_ok||'התחל בכל זאת',T.cancel||'ביטול');
  logGateEvent('station',ok?'override':'cancel',info);
  return ok;
}

// ─── שער סדר השלבים: 🔗 "שלב מאחד" ────────────────────────────────
// המפעל עובד ב**ענפי הכנה מקבילים שמתכנסים** ("מתחילים כמה שלבים ביחד כי צריך הכנות
// לחלקים לפני שמחברים אותם"), ולכן שרשרת ליניארית נפסלה במדידה: היא הייתה חוסמת
// 85% מ-323 התחלות אמיתיות של שלבי הגימור (25/07–06/08, 1240 משימות).
// כאן נאכף סדר **רק בין נקודות הביקורת**: שלב מסומן 🔗 דורש שכל שלבי ה-🔗 שלפניו
// יסתיימו על אותו ברקוד. שלב רגיל לעולם אינו חוסם — כל ההכנות נשארות חופשיות.
// שלוש ההקלות נמדדו כהכרחיות; בלי אף אחת מהן שיעור החסימות קופץ 22%→36%→51%:
//   1. שלב 🔗 שטרם הסתיים ולו פעם אחת במוצר = לא חוסם. שלבי קבלה/חיתוך אינם נסרקים
//      פר-ברקוד כלל — ב-08307 `عد فتح شغل` (שלב #1) לא נסרק ב-13 יום, 16 ברקודים,
//      263 משימות, והיה חוסם כל שלב 🔗 במוצר לנצח.
//   2. שלב שנפתח **באותה סריקה** אינו חוסם. עובדת בוחרת تنظيف+فحص قبل יחד ושניהם
//      מתחילים באותה מילישנייה; במוצר 02910 זה בכלל שלב אחד בשם `تنظيف+فحص قبل`.
//   3. ברקוד "כל הכמות" מכסה את כל המידות והצבעים (אישור המשתמש 07/08).
// ⚠️ הכלל בודק **סיום**, לא התחלה: שלב 🔗 שקודמו עדיין רץ על אותו ברקוד — נחסם.
// ⚠️ חור ידוע ומכוון (נובע מהקלה 1): **המעבר הראשון בכל נקודת ביקורת חופשי.** כל עוד
// שלב 🔗 מסוים לא הסתיים ולו פעם אחת בהזמנה, הוא נחשב "שלב שלא סורקים" ואינו חוסם —
// ולכן הברקוד הראשון שמגיע ל-تغليف יעבור גם בלי فحص بعد. מהברקוד השני האכיפה תופסת.
// אי אפשר לסגור את זה בלי להבחין בין "לא נסרק" ל"עדיין לא נסרק", והבחנה כזו אינה
// זמינה בזמן אמת. זו הסיבה שהדוח "🔎 סדר שלבים בהיסטוריה" קיים — הוא כן רואה אחורה.
function stepOrderLockOn(){return !!S.settings?.stepOrderLock;}
// 🔗 חסימה מחמירה: מבטלת את הקלת "שלב-רפאים". בלעדיה שלב 🔗 שמעולם לא הסתיים בהזמנה
// אינו חוסם כלום — כך ندوه פתחה فحص قبل ב-07135 בלי ש-تنظيف בוצע (0/216), ואיש לא נחסם.
// ⚠️ חלה **רק על מופעי-מוצר שנפתחו אחרי ההדלקה** (prodStamp ≥ stepOrderStrictFrom).
// בלי הגבלת הזמן הזו, הדלקה באמצע הזמנה מקפיאה אותה מיידית: כל שלב 🔗 שלא נסרק עד היום
// הופך לחוסם רטרואקטיבי על כל הברקודים (ב-07135 נמדד 92%). הזמנה רצה מסיימת בכללים
// שלפיהם התחילה; הזמנה חדשה נאכפת מהברקוד הראשון — שם ממילא אין היסטוריה לשבור.
function stepOrderStrictOn(cust,prod,stamp){
  if(!S.settings?.stepOrderStrict)return false;
  const from=+S.settings.stepOrderStrictFrom||0;
  if(!from)return true;                       // הודלק בלי חותמת (נתון ישן) — חל על הכל
  return ((stamp!=null?stamp:prodStampFor(cust,prod))||0)>=from;
}
function isMergeStep(s){return !!(s&&typeof s==='object'&&s.merge);}
// מה כבר הסתיים במופע-המוצר הנוכחי: פר ברקוד+שלב, פר שלב, ודרך ברקוד "כל הכמות".
// אותו סינון prodStamp כמו stepDoneMap — הזמנה חוזרת לא נשענת על היסטוריה ישנה.
//
// ⚠️ ההיסטוריה לבדה לא מבחינה בין **"דילגת על השלב"** לבין **"אתה באמצע השלב הזה ממש
// עכשיו"** — בשני המצבים אין רשומה ב-histTasks. זה תקע את ميرفت 09/08: היא עברה מ-محطة
// الكي ל-محطة تغليف בעוד كوي פתוחה על אותו ברקוד, ומהסורק שלה לא הייתה שום יציאה.
// לכן משימה **פעילה של אותו עובד** על אותו ברקוד+שלב נחשבת כיסוי (workerId).
// האכיפה לא נחלשת: ברקוד שהשלב הקודם בו לא נגע כלל עדיין נחסם, ועובד *אחר* שקופץ קדימה
// עדיין נחסם — הסריקה שלו לא סוגרת את המשימה הפתוחה של חברתו.
// מושהית נספרת גם היא: היא "באמצע", ובלעדיה עובדת שיצאה להפסקה נתקעת באותה מלכודת.
// ⚠️ נכנס ל-bcStep/totStep בלבד ו**לא** ל-anyStep — anyStep מזין את ההקלה "המעבר הראשון
// בכל נקודת ביקורת חופשי", ומשימה שרק *נפתחה* לא אמורה להפעיל חסימה שטרם הייתה קיימת.
function _mergeCover(cust,prod,workerId,stamp){
  if(stamp==null)stamp=prodStampFor(cust,prod); // ההזמנה שבברקוד הנסרק — ראה bcOrderStamp
  const bcStep=new Set(),anyStep=new Set(),totStep=new Set();
  for(const t of (S.histTasks||[])){
    if(t.cust!==cust||t.prod!==prod||!(t.duration>0))continue;
    {const ts=taskStampOf(t);if(ts!=null&&stamp&&ts!==stamp)continue;}
    const st=String(t.taskType||'').trim().toLowerCase();if(!st)continue;
    anyStep.add(st);bcStep.add(taskBc(t)+'|'+st);
    if(t.isTotal)totStep.add(st);
  }
  if(workerId!=null)for(const t of (S.activeTasks||[])){
    if(String(t.workerId)!==String(workerId)||t.cust!==cust||t.prod!==prod)continue;
    {const ts=taskStampOf(t);if(ts!=null&&stamp&&ts!==stamp)continue;}
    const st=String(t.taskType||'').trim().toLowerCase();if(!st)continue;
    bcStep.add(taskBc(t)+'|'+st);
    if(t.isTotal)totStep.add(st);
  }
  return{bcStep,anyStep,totStep};
}
function mergeGate(cust,prod,bc,stepNames,workerId){
  const T=LANGS[currentLang];
  if(!stepOrderLockOn())return{ok:true}; // 🔌 מתג כיבוי מהניהול — ברירת מחדל כבוי
  const steps=findProd(cust,prod)?.workSteps||[];
  const want=(stepNames||[]).filter(Boolean);
  if(!steps.length||!want.length)return{ok:true};
  const sameScan=new Set(want.map(n=>String(n).trim().toLowerCase())); // הקלה 2
  const stamp=bc?bcOrderStamp(bc):prodStampFor(cust,prod); // ההזמנה שבברקוד — ראה bcOrderStamp
  const cov=_mergeCover(cust,prod,workerId,stamp); // כולל השלבים שהעובד הזה פתוח עליהם כרגע
  const strict=stepOrderStrictOn(cust,prod,stamp); // מבטלת את הקלה 1 — ראה stepOrderStrictOn
  const blocked=[];
  for(const nm of want){
    const idx=steps.findIndex(x=>stepName(x)===nm);
    if(idx<0||!isMergeStep(steps[idx]))continue; // שלב שאינו מהמוצר / אינו 🔗 — חופשי
    const miss=[];
    for(let i=0;i<idx;i++){
      if(!isMergeStep(steps[i]))continue;        // רק 🔗 חוסם 🔗
      const q=stepName(steps[i]);if(!q)continue;
      const k=q.trim().toLowerCase();
      if(sameScan.has(k))continue;
      if(!strict&&!cov.anyStep.has(k))continue;                   // הקלה 1 (מבוטלת במצב מחמיר)
      if(cov.bcStep.has(bc+'|'+k)||cov.totStep.has(k))continue;   // הושלם (הקלה 3)
      miss.push(q);
    }
    if(miss.length)blocked.push({step:nm,need:miss});
  }
  if(!blocked.length)return{ok:true};
  // טקסט גולמי — showToast כותב ב-textContent. ההברחה רק במסלול showConfirm (innerHTML).
  return{ok:false,blocked,msg:(T.so_locked||'🔗 שלב מאחד — יש לסיים קודם')+': '+
    blocked.map(b=>b.step+' → '+b.need.join(', ')).join(' · ')};
}
// אותה מדיניות כמו שער התחנה — כולל הדריסה הפר-עובדת והרישום ביומן.
// workerId = העובד שהמשימה נפתחת **עבורו** (לא בהכרח מי שמפעיל את הסורק) — הוא זה שמשימותיו
// הפתוחות נחשבות כיסוי, כי הסריקה הזו היא שתסגור אותן.
async function passMergeGate(cust,prod,bc,stepNames,workerId){
  const g=mergeGate(cust,prod,bc,stepNames,workerId);
  if(g.ok)return true;
  const T=LANGS[currentLang];
  const info={cust,prod,bc,steps:stepNames,blocked:g.blocked};
  if(gateMode('order')!=='override'){logGateEvent('order','blocked',info);showToast(g.msg,'var(--red-txt)',8000);return false;}
  const ok=await showConfirm(T.so_override_title||'עקיפת סדר שלבים',
    esc(g.msg+'\n\n'+(T.st_override_msg||'להתחיל בכל זאת?')),
    T.st_override_ok||'התחל בכל זאת',T.cancel||'ביטול');
  logGateEvent('order',ok?'override':'cancel',info);
  return ok;
}
// ⏸ ברקוד+שלב שמושהה אצל עובד **אחר** (28/10/2026 — נצפה: هنيه מושהית מ-27/10 על 04323 كسر سحاب,
// ו-ابوزكي פתח את אותו שלב למחרת). stepAlreadyTaken מחריג מושהות כדי שהעובדת עצמה תחדש בסריקה —
// אבל זה פתח את השלב לכולם. עובד/עוזר/אחראי נחסמים — אחראי מעביר דרך 🔄 העברה בכרטיס המשימה
// (החלטת המשתמש); רק מנהל נשאל. חלק (splitId) — כבר קיבל רק את היתרה.
async function passPausedOtherGate(w,items){
  const hits=[];
  for(const b of items){
    if(b.splitId)continue;
    const tt=b.taskType||'';
    const t=(S.activeTasks||[]).find(t=>t.paused&&String(t.workerId)!==String(w.id)&&String(taskBc(t))===String(b.raw)&&(t.taskType||'')===tt&&(()=>{const s=taskStampOf(t);return s==null||s===b.prodStamp;})());
    if(t)hits.push((tt||'—')+' — '+(t.workerName||t.worker||''));
  }
  if(!hits.length)return true;
  const msg='⏸ השלב מושהה אצל עובד אחר · المرحلة موقوفة عند عامل آخر:\n'+hits.join('\n');
  if(S.user?.role!=='manager'){showToast(msg+(S.user?.role==='supervisor'?'\n🔄 להעברה — כפתור ההעברה בכרטיס המשימה בלשונית משימות':''),'var(--red-txt)',9000);return false;}
  return await showConfirm('⏸ מושהה אצל עובד אחר',esc(msg+'\n\nלפתוח בכל זאת ל-'+(w.name||'')+'?'),'פתח בכל זאת','ביטול');
}
// ─── בדיקה חוזרת של כל הסל ברגע ההתחלה ────────────────────────────
// משותף לשלושת הסורקים. הבדיקה בזמן **ההוספה** לסל אינה מספיקה: בין ההוספה
// לבין הלחיצה על "התחל" התחנה יכולה להתחלף, העובד הנבחר יכול להתחלף, והסל עצמו
// שורד רענון דרך localStorage. פעם אחת על כל הסל, ולא פר פריט — אחרת סל של 5
// פריטים מאותו מוצר היה מבקש 5 אישורים על אותה חריגה.
// 👕 דגם ראשון (isSample) מדולג בכוונה — פתוח לכל התחנות ובלי שלבים.
async function passBatchGates(w,batch){
  const items=(batch||[]).filter(b=>b&&!b.isSample);
  if(!items.length)return true;
  if(!await passRetiredGate(items.map(b=>b.raw)))return false; // 🔒 ברקוד שסיים את תפקידו
  if(!await passPausedOtherGate(w,items))return false; // ⏸ מושהה אצל עובד אחר
  // 🔢 קיבוץ לפי **רשומת ההזמנה** ולא לפי לקוח+מוצר: לשתי הזמנות של אותו מוצר
  // יכולים להיות שלבים ותחנות שונים לגמרי, ואיחודן היה בודק אותן מול רשומה אחת.
  // עדיין אישור אחד לכל רשומה, ולא חמישה על אותה חריגה.
  const byProd={};
  for(const b of items){
    const k=b.cust+'|'+b.prod+'|'+orderNoOf(b.raw||'');
    (byProd[k]=byProd[k]||{cust:b.cust,prod:b.prod,raw:b.raw,steps:[]}).steps.push(b.taskType||'');
  }
  for(const g of Object.values(byProd)){
    if(!await passStationGate(w,g.cust,g.prod,g.steps,g.raw))return false;
  }
  // 🔗 שער סדר השלבים — פר **ברקוד** ולא פר מוצר: הכיסוי נמדד למידה/צבע הספציפיים.
  // כל שלבי אותו ברקוד נשלחים יחד ולכן נחשבים "אותה סריקה" ואינם חוסמים זה את זה.
  const byBc={};
  for(const b of items)(byBc[b.raw]=byBc[b.raw]||{cust:b.cust,prod:b.prod,steps:[]}).steps.push(b.taskType||'');
  for(const raw of Object.keys(byBc)){
    const o=byBc[raw];
    if(!await passMergeGate(o.cust,o.prod,raw,o.steps,w.id))return false;
  }
  return true;
}

// ─── מנוע המלצת שיבוץ — תמחור שלב ב' ────────────────────────
// לשלבים שנבחרו: עובד כשיר = מיומנות בתחנה ≥ רמת הקושי לכל שלב.
// מיון: נוכחים תחילה → הרמה הנמוכה ביותר שמספיקה (slack) → הכי פחות משימות פעילות.
function recommendWorkers(prodObj,checkedStepNames){
  const steps=(prodObj?.workSteps||[]).filter(s=>checkedStepNames.includes(stepName(s))&&stepLevel(s)&&stepStation(s));
  if(!steps.length)return null; // אין שלבים עם רמה+תחנה — אין על מה להמליץ
  const recs=[];
  for(const w of S.workers){
    if(w.disabled||w.role==='manager')continue;
    const sk=w.skills||{};let ok=true,slack=0;
    // 🔀 הרמה הגבוהה מבין התחנות המורשות לשלב — עקבי עם _pricingStepRate,
    // שאחרת היה מתמחר לפי מאגר עובדים רחב יותר מזה שההמלצה מציגה
    for(const s of steps){const lvl=Math.max(0,...stepStationKeys(s).map(k=>sk[k]||0));if(lvl<stepLevel(s)){ok=false;break;}slack+=lvl-stepLevel(s);}
    if(!ok)continue;
    const load=S.activeTasks.filter(t=>t.workerId===w.id&&!t.paused).length;
    recs.push({w,slack,load,present:w.status==='in'});
  }
  recs.sort((a,b)=>((b.present?1:0)-(a.present?1:0))||(a.slack-b.slack)||(a.load-b.load));
  return recs;
}
// ─── נעילת רשימת שלבי העבודה לתחנה שנסרקה ─────────────────────────
// שלב מוצר נושא station="מחלקה::תחנה". מ-03/08 ההתאמה היא לפי **משפחת התחנה**
// (stationFamily — שם בלי המספר, חוצה מחלקות) ולא לפי המפתח המדויק, כדי ש-حبكي 1
// תפתח גם את שלבי حبكي 2/3/4. זו נעילה, לא סינון: עובד רואה רק את שלבי תחנתו.
// העובד שלפיו מסננים: בסורק האישי המשתמש המחובר, בסורקי האחראי/מנהל העובד הנבחר.
// תמיד מ-S.workers — S.user הוא עותק מנותק מרגע ההתחברות ו-currentStation שלו לא מתעדכן.
function scanStationWorker(prefix){
  const id=prefix==='bc'?S.user?.id:(document.getElementById(prefix+'-emp-sel')?.value||'');
  return id?(S.workers||[]).find(x=>x.id===id):null;
}
// רינדור ה-checkbox-ים של שלבי העבודה — משותף לשלושת הסורקים (bc / ts / mgr)
// keepMode=true רק מכפתור התצוגה עצמו. כל רינדור אחר (סריקה, החלפת עובד, סריקת תחנה)
// מתחיל מחדש מסונן — אחרת לחיצה אחת על "כל השלבים" נדבקת לכל סריקת מצלמה של אותו ברקוד.
function renderStepChecks(prefix,cust,prod,steps,bc,keepMode){
  const listEl=document.getElementById(prefix+'-steps-list');if(!listEl)return;
  const T=LANGS[currentLang];
  // זהות לפי הברקוד המלא ולא לפי לקוח+מוצר: מידה/צבע אחרים = סריקה חדשה
  const sameBc=!!bc&&listEl.dataset.bc===bc;
  // ברקוד חדש = רשימה נקייה; אותו ברקוד (מעבר בין מסונן/מלא) = שומר על מה שסומן
  const keep=sameBc?new Set([...listEl.querySelectorAll('input[type="checkbox"]:checked')].map(cb=>cb.dataset.step)):new Set();
  if(!keepMode)listEl.dataset.showAll='';
  listEl.dataset.bc=bc||'';
  const w=scanStationWorker(prefix);
  // התאמה לפי **משפחת** התחנה ולא לפי מפתח מדויק: حبكي 1 פותחת גם את שלבי حبكي 2/3/4.
  const fam=workerFamily(w);
  // כשהמתג כבוי — התנהגות הסינון הרכה הישנה (כולם רואים הכל, בלי חסימה)
  const lock=stationLockOn();
  const mayAll=!lock||gateMode('station')==='override'; // "כל השלבים" הוא עקיפה — לפי מדיניות העובד
  // 🔀 שלב עם altStations נפתח בכל אחת מהמשפחות המורשות שלו
  const atStn=fam?steps.filter(s=>stepFamilies(s).includes(fam)):[];
  const showAll=mayAll&&(listEl.dataset.showAll==='1'||(!lock&&!atStn.length));
  // שלב שכבר סומן נשאר גלוי גם בתצוגה המסוננת — אחרת הסימון היה נעלם בשקט
  const shown=showAll?steps:steps.filter(s=>stepFamilies(s).includes(fam)||keep.has(stepName(s)));
  listEl.dataset.cust=cust;listEl.dataset.prod=prod;
  const onch=prefix==='bc'?'bcStepToggle(this)':(prefix==='ts'?'tsStepToggle(this)':"renderStepRecs('mgr')");
  // בלי תחנה סרוקה / בלי שלבים לתחנה — הודעה במקום רשימה שאי אפשר להתחיל ממנה בכל מקרה.
  // למנהל/אחראי הרשימה המלאה עדיין מוצגת (הם היחידים שיכולים לעקוף).
  const note=!lock||!(S.workStations||[]).length?''
    :!curStation(w)?(T.st_need_scan||'📍 חובה לסרוק ברקוד תחנה לפני התחלת משימה')
    :!atStn.length?(T.st_no_steps_here||'אין שלבים לתחנה הזו במוצר — סרוק את התחנה הנכונה'):'';
  const noteHtml=note?`<div style="margin-bottom:6px;padding:7px 9px;border-radius:8px;font-size:12px;background:var(--amber-bg);color:var(--amber-txt);border:1px solid var(--brd)">${esc(note)}</div>`:'';
  const rows=note?(mayAll?steps:[]):shown;
  const bar=curStation(w)&&atStn.length
    ?`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;font-size:12px">
        <span style="color:var(--green-txt);font-weight:700">📍 ${esc(curStation(w)?.name||'')}</span>
        <span style="color:var(--txt3)">${atStn.length} ${esc(T.st_of||'מתוך')} ${steps.length}</span>
        ${mayAll&&atStn.length<steps.length?`<button type="button" class="btn" style="font-size:11px;padding:3px 10px" onclick="toggleStepStationFilter('${escj(prefix)}')">${esc(showAll?(T.st_only||'📍 רק שלבי התחנה'):(T.st_all_steps||'📋 כל השלבים'))}</button>`:''}
      </div>`:'';
  listEl.innerHTML=noteHtml+bar+rows.map(s=>{
    const nm=stepName(s);
    // שלב מחוץ לתחנה מסומן ויזואלית — מוצג רק למנהל/אחראי (עקיפה) או כשכבר היה מסומן
    const off=!!fam&&stepFamily(s)!==fam;
    return`<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;background:var(--bg2);border-radius:8px;cursor:pointer;font-size:13px${off?';opacity:.62':''}"><input type="checkbox" data-step="${esc(nm)}"${keep.has(nm)?' checked':''} style="width:16px;height:16px" onchange="${onch}"> ${esc(stepDisplay(s))}${stepBadge(s)}${off?` <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:var(--amber-bg);color:var(--amber-txt);border:1px solid var(--brd)">🔒 ${esc(stepStationKeys(s).map(stationNameOfKey).join(' / ')||(T.st_no_station||'אין תחנה'))}</span>`:''}</label>`;
  }).join('');
}
function toggleStepStationFilter(prefix){
  const listEl=document.getElementById(prefix+'-steps-list');if(!listEl)return;
  listEl.dataset.showAll=listEl.dataset.showAll==='1'?'':'1';
  // אותה רשומה שממנה נבנתה הרשימה — לפי הברקוד ששמור ב-dataset
  const p=bcOrderProd(listEl.dataset.bc||'')||findProd(listEl.dataset.cust,listEl.dataset.prod);
  renderStepChecks(prefix,listEl.dataset.cust,listEl.dataset.prod,p?.workSteps||[],listEl.dataset.bc,true);
  renderStepRecs(prefix);
}
// החלפת העובד הנבחר בסורק האחראי/המנהל — הרשימה מסוננת מחדש לפי התחנה שלו
function onScanEmpChange(prefix){
  const listEl=document.getElementById(prefix+'-steps-list');
  const p=listEl?.dataset.cust?(bcOrderProd(listEl.dataset.bc||'')||findProd(listEl.dataset.cust,listEl.dataset.prod)):null;
  if(p&&(p.workSteps||[]).length)renderStepChecks(prefix,listEl.dataset.cust,listEl.dataset.prod,p.workSteps,listEl.dataset.bc);
  renderStepRecs(prefix);
}
// ניקוי מלא של רשימת השלבים — שדה הברקוד רוקן, שלא ייגררו סימונים לסריקה הבאה
function clearStepChecks(prefix){
  const listEl=document.getElementById(prefix+'-steps-list');if(!listEl)return;
  listEl.innerHTML='';listEl.dataset.bc='';listEl.dataset.cust='';listEl.dataset.prod='';listEl.dataset.showAll='';
}
function renderStepRecs(prefix){
  const T=LANGS[currentLang];
  updateExpectedTime(prefix);
  const box=document.getElementById(prefix+'-recs');if(!box)return;
  const listEl=document.getElementById(prefix+'-steps-list');
  if(!listEl){box.innerHTML='';return;}
  const checked=[...listEl.querySelectorAll('input[type="checkbox"]:checked')].map(cb=>cb.dataset.step);
  const prodObj=findProd(listEl.dataset.cust,listEl.dataset.prod);
  if(!checked.length||!prodObj){box.innerHTML='';return;}
  const recs=recommendWorkers(prodObj,checked);
  if(!recs){box.innerHTML='';return;}
  const sel=document.getElementById(prefix+'-emp-sel');
  const selId=sel?.value||'';
  const top=recs.filter(r=>r.present);
  const warn=selId&&!recs.some(r=>r.w.id===selId)
    ?`<div style="font-size:11px;color:var(--amber-txt);margin-top:4px">${T.rec_warn||'⚠ לעובד הנבחר אין מיומנות מספיקה לשלבים אלו'}</div>`:'';
  box.innerHTML=(top.length
    ?`<div style="font-size:12px;font-weight:600;margin:8px 0 4px">${T.rec_title||'🎯 מומלצים לשלבים שנבחרו:'}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${top.map((r,i)=>`<span onclick="pickRecWorker('${prefix}','${r.w.id}')" style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;border:1.5px solid ${selId===r.w.id?'var(--green-txt,#065f46)':(i===0?'var(--blue-txt,#1d4ed8)':'var(--brd)')};background:${selId===r.w.id?'var(--green-bg,#d1fae5)':'var(--bg2)'}">${i===0?'⭐ ':''}${esc(r.w.name)}${r.load?` <span style="color:var(--txt3);font-size:10px">· ${r.load} ${T.rec_tasks||'משימות'}</span>`:''}</span>`).join('')}</div>`
    :`<div style="font-size:11px;color:var(--amber-txt);margin-top:8px">${T.rec_none||'⚠ אין עובד נוכח עם מיומנות מתאימה לשלבים שנבחרו'}</div>`)+warn;
}
function pickRecWorker(prefix,id){
  const sel=document.getElementById(prefix+'-emp-sel');
  if(sel)sel.value=id;
  renderStepRecs(prefix);
}
// ─── צפי זמן למשימה — תמחור שלב ד' המשך ─────────────────────
// החישוב בצד שרת (CF calcTaskExpected): שכר העובדים ב-adminSettings שאחראי לא רשאי לקרוא;
// השרת מחזיר דקות בלבד. cache פר לקוח+מוצר+עובד+כמות — נשלחים כל השלבים, מוצג לפי המסומנים.
let _expMap={};
let _expTimer=null;
function taskExpectedKey(cust,prod,workerId,qty){return cust+'|'+prod+'|'+workerId+'|'+qty;}
function fmtExpMin(min){
  if(min>=60)return Math.floor(min/60)+" שע' "+Math.round(min%60)+" דק'";
  return Math.round(min)+" דק'";
}
function updateExpectedTime(prefix){
  const box=document.getElementById(prefix+'-expected');if(!box)return;
  const listEl=document.getElementById(prefix+'-steps-list');
  const sel=document.getElementById(prefix+'-emp-sel');
  // עמוד "סריקה" (bc): קלט הברקוד הוא bc-inp, והעובד הוא המשתמש המחובר עצמו (אין בורר עובד)
  const rawEl=document.getElementById(prefix+'-bc-inp')||(prefix==='bc'?document.getElementById('bc-inp'):null);
  const raw=(rawEl?.value||'').replace(/\D/g,'');
  const workerId=sel?sel.value:(prefix==='bc'?(S.user?.id||''):'');
  const checked=listEl?[...listEl.querySelectorAll('input[type="checkbox"]:checked')].map(cb=>cb.dataset.step):[];
  if(!workerId||!isBcLen(raw.length)||!checked.length||!listEl?.dataset.cust||!S.fbConnected||!window._fbFunctions){box.innerHTML='';return;}
  const cust=raw.slice(0,2),prod=raw.slice(2,7);
  if(cust!==listEl.dataset.cust||prod!==listEl.dataset.prod){box.innerHTML='';return;}
  const prodObj=findProd(cust,prod);
  if(!_isPriced(prodObj)){box.innerHTML='';return;} // אין תמחור — אין צפי (priced: בלי המספרים אצל עובדת)
  let qty=isTotalBc(raw)?getTotalQty(cust,prod,orderNoOf(raw)):parseInt(raw.slice(8,11))||0;
  const est=!qty&&_estQtyBc(raw)>0;if(est)qty=_estQtyBc(raw);
  if(!qty){box.innerHTML='';return;}
  const key=taskExpectedKey(cust,prod,workerId,qty);
  const render=res=>{
    if(!res||!res.ok){box.innerHTML='';return;}
    const parts=checked.filter(n=>res.perStep[n]!=null);
    if(!parts.length){box.innerHTML='';return;}
    const tot=parts.reduce((s,n)=>s+res.perStep[n],0);
    box.innerHTML=`<div style="margin-top:6px;background:var(--blue-bg,#dbeafe);color:var(--blue-txt,#1d4ed8);border-radius:8px;padding:7px 10px;font-size:12px">
      ⏱ צפי לפי תמחור (${est?'~':''}${qty} יח'${est?' משוער':''}):<b style="font-size:13px">${fmtExpMin(tot)}</b>
      ${parts.length>1?`<div style="font-size:11px;margin-top:2px;opacity:.85">${parts.map(n=>esc(n)+': '+fmtExpMin(res.perStep[n])).join(' · ')}</div>`:''}
    </div>`;
  };
  if(_expMap[key]){render(_expMap[key]);return;}
  clearTimeout(_expTimer);
  box.innerHTML='<div style="font-size:11px;color:var(--txt3);margin-top:6px">⏱ מחשב צפי…</div>';
  const allSteps=(prodObj.workSteps||[]).map(s=>stepName(s)).filter(Boolean);
  _expTimer=setTimeout(async()=>{
    try{
      const{httpsCallable}=window._fb;
      const fn=httpsCallable(window._fbFunctions,'calcTaskExpected');
      const r=await fn({cust,prod,workerId,qty,stepNames:allSteps});
      _expMap[key]=r.data||{ok:false};
      render(_expMap[key]);
    }catch(e){console.error('calcTaskExpected:',e);box.innerHTML='';}
  },600);
}
// מחזיר צפי (perStep) לעובד+כמות: קודם מה-cache (_expMap), אחרת מחשב מהשרת ושומר ל-cache.
// חיוני ליצירת משימה בהעברה/סריקה מהירה: _expMap מתאכלס רק מתצוגת התצוגה המקדימה ומתאפס בכל שמירת תמחור,
// אז בלי fallback לשרת משימה מועברת (עובד/כמות חדשים) לא מקבלת expectedMin. שקט בכשל (הרשאה/רשת).
async function fetchExpected(cust,prod,workerId,qty){
  const key=taskExpectedKey(cust,prod,workerId,qty);
  if(_expMap[key])return _expMap[key];
  const prodObj=findProd(cust,prod);
  if(!_isPriced(prodObj)||!workerId||!qty||!S.fbConnected||!window._fbFunctions)return{ok:false};
  const allSteps=(prodObj.workSteps||[]).map(s=>stepName(s)).filter(Boolean);
  try{
    const{httpsCallable}=window._fb;
    const fn=httpsCallable(window._fbFunctions,'calcTaskExpected');
    const r=await fn({cust,prod,workerId,qty,stepNames:allSteps});
    _expMap[key]=r.data||{ok:false};
  }catch(e){console.error('fetchExpected:',e);_expMap[key]={ok:false};}
  return _expMap[key];
}
// עדכון צפי הזמן (expectedMin) למשימות פעילות/בהשהיה של מוצר אחרי שמירת שינוי תמחור/דק' ידני.
// מקבץ קריאות ל-CF לפי עובד+כמות; משימה ללא צפי מקבלת מחיקת expectedMin. שקט בכשל (הרשאה/רשת).
async function recalcActiveExpected(cust,prod){
  if(!S.fbConnected||!window._fbFunctions)return;
  const prodObj=findProd(cust,prod);if(!prodObj)return;
  const affected=S.activeTasks.filter(t=>t.cust===cust&&t.prod===prod);if(!affected.length)return;
  const hasPricing=_isPriced(prodObj);
  const allSteps=(prodObj.workSteps||[]).map(s=>stepName(s)).filter(Boolean);
  const{httpsCallable}=window._fb;
  const fn=httpsCallable(window._fbFunctions,'calcTaskExpected');
  const cache={};let changed=false;
  for(const t of affected){
    let res={ok:false};
    // 📏 ספירה/גזירה שנסרקה בלי כמות: הכמות האמיתית אם כבר הוזנה (taskUnits), אחרת המשוערת
    const q=+t.qty||(t.isTotal?(taskUnits(t)||_estQtyBc(t.bc||'')):0);
    if(hasPricing&&q){
      const key=taskExpectedKey(cust,prod,t.workerId,q);
      if(cache[key]===undefined){
        try{const r=await fn({cust,prod,workerId:t.workerId,qty:q,stepNames:allSteps});cache[key]=r.data||{ok:false};}
        catch(e){console.error('recalcActiveExpected:',e);cache[key]={ok:false};}
      }
      res=cache[key];
    }
    const newExp=(res&&res.ok&&res.perStep&&res.perStep[t.taskType]!=null)?res.perStep[t.taskType]:null;
    let taskChanged=false;
    if(newExp!=null){if(t.expectedMin!==newExp){t.expectedMin=newExp;taskChanged=true;}}
    else if(t.expectedMin!=null){delete t.expectedMin;taskChanged=true;}
    // 🛑 כותבים **רק את הצפי** — לא את כל המשימה. כתיבה של {...t} ממכשיר שמחזיק עותק ישן
    // (משימה שבינתיים הושהתה במכשיר אחר) מחזירה אותה ל'רצה' ומוחקת את הזמן שנצבר.
    if(taskChanged){changed=true;if(S.fbConnected)await fbUpdateOnly('activeTasks',String(t.id),{expectedMin:newExp!=null?newExp:window._fb.deleteField()});}
  }
  if(changed){saveLS();renderTasks();if(typeof renderMgrTasks==='function')renderMgrTasks();}
}
// דוח שיבוץ מתוכנן למוצר — לפני הכנסה לעבודה (כפתור 🎯 בכרטיס המוצר)
function showProductPlan(id){
  const p=S.products.find(x=>x.id===id);if(!p)return;
  document.getElementById('prod-plan-overlay')?.remove();
  const steps=p.workSteps||[];
  const defined=steps.filter(s=>stepLevel(s)&&stepStation(s));
  const noDef=steps.filter(s=>!(stepLevel(s)&&stepStation(s)));
  let gaps=0;
  const rows=defined.map(s=>{
    const recs=recommendWorkers(p,[stepName(s)])||[];
    if(!recs.length)gaps++;
    const stName=stepStation(s).split('::')[1]||stepStation(s);
    return`<div style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:0.5px solid var(--brd);flex-wrap:wrap">
      <div style="flex:1;min-width:140px">
        <div style="font-size:13px;font-weight:500">${esc(stepDisplay(s))}${stepBadge(s)}</div>
        <div style="font-size:11px;color:var(--txt3)">🏷 ${esc(stName)}</div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${
        recs.length?recs.map((r,i)=>`<span style="font-size:11px;padding:3px 9px;border-radius:10px;background:${r.present?'var(--green-bg,#d1fae5)':'var(--bg2)'};color:${r.present?'var(--green-txt,#065f46)':'var(--txt3)'};border:${i===0?'1.5px solid var(--green-txt,#065f46)':'1px solid var(--brd)'}">${i===0?'⭐ ':''}${r.present?'●':'○'} ${esc(r.w.name)}${r.load?` · ${r.load}🔧`:''}</span>`).join('')
        :`<span style="font-size:11px;color:var(--red-txt);font-weight:600">⚠ אין עובד כשיר</span>`}</div>
    </div>`;
  }).join('');
  const gapWarn=gaps?`<div style="font-size:12px;color:var(--red-txt);font-weight:600;margin-bottom:6px;background:var(--red-bg,#fee2e2);padding:6px 10px;border-radius:8px">⚠ ${gaps} שלבים ללא עובד כשיר — צוואר בקבוק אפשרי</div>`:'';
  const noDefHtml=noDef.length?`<div style="font-size:11px;color:var(--txt3);margin-top:10px">שלבים ללא רמה/תחנה (לא בחישוב): ${noDef.map(s=>esc(stepDisplay(s))).join(', ')}</div>`:'';
  const ov=document.createElement('div');
  ov.id='prod-plan-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.innerHTML=`<div style="background:var(--card);border-radius:14px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;padding:16px" dir="rtl">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:15px;font-weight:700;color:var(--txt)">🎯 שיבוץ מומלץ — מוצר ${esc(p.prod)} · לקוח ${esc(p.cust)}</div>
      <button onclick="document.getElementById('prod-plan-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--txt)">✕</button>
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:8px">מוצגים כל העובדים הכשירים לכל שלב · ⭐ = המומלץ ביותר (הרמה המתאימה ביותר, לא עמוס) · ● נוכח עכשיו · ○ לא נוכח · N🔧 = משימות פעילות</div>
    ${gapWarn}
    ${rows||'<div style="color:var(--txt3);font-size:12px;padding:1rem;text-align:center">אין שלבים עם רמת קושי ותחנה</div>'}
    ${noDefHtml}
    <div id="prod-plan-balance"></div>
  </div>`;
  document.body.appendChild(ov);
  fillProductBalance(p);
}
// מאזן תקציב מול בפועל למוצר — בשקלים (חיסכון של עובד זול ≠ חיסכון של עובד יקר).
// מנהל בלבד (דורש שכר מ-adminSettings). עודף משלב לא מתגלגל — נצבר רק במאזן הכולל.
async function fillProductBalance(p){
  const el=document.getElementById('prod-plan-balance');if(!el)return;
  if(S.user?.role!=='manager')return;
  const price=+p.unitPrice||0;if(!price)return;
  const budgetUnit=price*(1-(+p.targetProfitPct||0)/100)-(+p.directMaterialsCost||0);
  if(budgetUnit<=0)return;
  const weights=S.costs.difficultyWeights||{1:1,2:1.5,3:2,4:2.5,5:3.5};
  const lvl=(p.workSteps||[]).filter(s=>stepLevel(s));
  const totW=lvl.reduce((s,x)=>s+(+weights[stepLevel(x)]||1),0);
  if(!totW)return;
  el.innerHTML='<div style="font-size:11px;color:var(--txt3);margin-top:10px">💰 מחשב מאזן…</div>';
  try{
    await ohReady();
    const oh=overheadBreakdown().perHour;
    const rated=_costWorkers().filter(w=>S.costs.workerRates[w.id]);
    const avgAll=rated.length?rated.reduce((s,w)=>s+loadedHourlyRate(w.id),0)/rated.length:0;
    const hist=await loadHistRange('','');
    const done=hist.filter(t=>t.cust===p.cust&&t.prod===p.prod&&(t.duration||0)>0);
    const nd=normalizeBatchDurations(done); // תיקון זמן batch מנופח בקריאה
    let bud=0,act=0,counted=0;
    for(const t of done){
      const st=lvl.find(s=>stepName(s)===t.taskType);
      if(!st)continue;
      const rate=(loadedHourlyRate(t.workerId,_tDay(t))||avgAll)+oh;
      bud+=budgetUnit*(+weights[stepLevel(st)]||1)/totW*(t.qty||0);
      act+=((nd[t.id]||0)/3600)*rate;
      counted++;
    }
    if(!counted){el.innerHTML='<div style="font-size:11px;color:var(--txt3);margin-top:10px">💰 מאזן: טרם הושלמו משימות שלבים למוצר זה</div>';return;}
    const diff=bud-act;
    const ahead=diff>=0;
    el.innerHTML=`<div style="margin-top:10px;background:${ahead?'var(--green-bg,#d1fae5)':'var(--red-bg,#fee2e2)'};border-radius:8px;padding:8px 12px;font-size:12px">
      💰 <b>מאזן תקציב עבודה</b> (${counted} משימות שהושלמו):
      תקציב ₪${bud.toFixed(0)} · בפועל ₪${act.toFixed(0)} ·
      <b style="color:${ahead?'var(--green-txt,#065f46)':'var(--red-txt,#b91c1c)'}">${ahead?'✅ מקדים ב-':'⚠ חורג ב-'}₪${Math.abs(diff).toFixed(0)}</b>
    </div>`;
  }catch(e){console.error('fillProductBalance:',e);el.innerHTML='';}
}

// ─── היסטוריית משימות: חלון חי + שמירה ─────────────────────
// HIST_WINDOW_DAYS — כמה ימי היסטוריה נטענים לזיכרון בזמן אמת (מוזיל קריאות Firestore).
// דוחות/עלויות שולפים טווחים ישנים יותר לפי דרישה (loadHistRange).
// HIST_RETENTION_DAYS — כמה זמן משימות נשמרות ב-Firestore לפני ארכוב+מחיקה (Cloud Function).
const HIST_WINDOW_DAYS=14;
const HIST_RETENTION_DAYS=60;
// ─── היסטוריית נוכחות: חלון חי ──────────────────────────────
// ATT_WINDOW_DAYS — כמה ימי נוכחות נטענים לזיכרון בזמן אמת.
// לפני החלון הזה המאזין קרא את כל האוסף בכל טעינה (950 מסמכים ב-04/09/2026),
// ו-attHistory הוא האוסף היחיד שאף ארכוב לא מקצץ — כלומר הוא גדל לנצח.
// 45 יום ולא 14: דוח השכר מחושב חודשי, ולכן חודש שלם + חיץ חייב להישאר בחלון.
// 🛑 טווח ישן יותר נשלף לפי דרישה דרך loadAttRange — כל דוח שנותן למשתמש
//    לבחור טווח חייב לעבור דרכה, אחרת יחזיר נתונים בחסר בשקט (ובשכר = תשלום בחסר).
const ATT_WINDOW_DAYS=45;

