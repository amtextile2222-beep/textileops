// ─── 🔗 חישובים משותפים לאפליקציה ולשרת (09/11/2026) ─────────────────
// קובץ אחד, שני צרכנים — במקום שני העתקים שצריך לזכור לשנות יחד ("⚠️ זהה ב-trackStates בשרת"):
//   • האפליקציה: tools/build.js מכניס אותו לראש בלוק ה-<script> ב-index.html ⇒ הכל כאן גלובלי, כמו קודם.
//   • השרת (functions/index.js): require('./shared/calc') — דף מעקב הלקוח (customerTrack).
// ⚠️ שינוי כאן = גם `node tools/build.js` + push (אפליקציה) **וגם** פריסת customerTrack (שרת).
// 🛑 רק JS טהור: בלי S, בלי DOM, בלי window, בלי Firebase — הכל מגיע כפרמטר. סגנון: script רגיל (לא module).

// ─── לוח מצב הזמנות: 8 השלבים (התוויות — PIPE_LISTS באפליקציה, באותו סדר) ───
const PIPE_IDS=['intake','countcut','ready_sew','sewing','ready_pack','packing','ready_ship','shipped'];
// תעודה מתאריך לפני זה = יצאה (לא היה סימון יציאה עד אז)
const PIPE_DEPART_FROM='2026-10-10';
const PIPE_PARTIAL_FROM='2026-10-20'; // משלוח חלקי נספר רק מתעודה מהתאריך הזה (ראה pipeShipInfo)

// ─── מוצר / הזמנה ───
function prodStampOf(p){return +p.createdAt||parseInt(String(p.id).replace(/\D/g,''))||0;}
function _prodQty(p){return (p.quantities||[]).reduce((s,q)=>s+(parseInt(q.qty)||0),0);}
// 📏 כמות משוערת — לצפי זמן ול"נדרש" במלאי בלבד (ראה CLAUDE.md)
function estQtyOf(p){return Math.max(0,parseInt(p?.estQty)||0);}
// מספר ההזמנה מתוך הברקוד (16 ספרות = BC_LEN_NEW). 0 = ברקוד ישן בלי מספר ⇒ אסור להסיק ממנו כלום.
function orderNoOf(raw){
  const s=String(raw||'');
  return s.length>=16?(parseInt(s.slice(13,16),10)||0):0;
}
const taskBc=t=>t.bc||String(t.cust)+String(t.prod)+String(t.size||'0')+String(t.qty).padStart(3,'0')+String(t.col);
// אילו יחידות כוסו = ברקוד+שלב (+splitId). בלי היום — בכוונה (ראה stepDoneKey באפליקציה)
const coverKey=t=>taskBc(t)+'|'+String(t.taskType||'').trim().toLowerCase()+(t.splitId?'|'+t.splitId:'');
function stepName(s){return typeof s==='string'?s:(s?.name||'');}
function stepStation(s){return(s&&typeof s==='object'&&s.station)?s.station:'';}

// מחלקה → משפחת צנרת, לפי מילות מפתח (גם שמות מחלקה ישנים שכבר לא קיימים).
// ⚠️ גיהוץ/ניקוי/ביקורת נכנסים ל-`pack` בכוונה — במפעל הם מבוצעים ב-`قسم اريزه`.
function pipeFamOfDept(d){
  const s=String(d||'').toLowerCase();
  if(/استقبال|قص|קבל|חית|גזיר/.test(s))return 'recv';
  if(/خياط|خيط|תפיר/.test(s))return 'sew';
  if(/اريز|تغليف|كوي|فحص|אריז|גיהו|ניקו|ביקור/.test(s))return 'pack';
  return '';
}
function pipeFamOfStep(s){return pipeFamOfDept(String(stepStation(s)||'').split('::')[0]);}

// ─── משלוחים ───
const GRADE_U='לא תפור';
const isUnsewn=r=>(r&&r.grade)===GRADE_U;
const shUnsewn=sh=>((sh&&sh.rows)||[]).reduce((t,r)=>t+(isUnsewn(r)?(parseInt(r.qty)||0):0),0);
// כל המשלוחים של רשומה. רשומה מלפני המאגר — משוחזרת כמשלוח בודד מהשדות הישנים, בלי לגעת בנתון
function prodShipments(p){
  if(!p)return[];
  if(Array.isArray(p.shipments)&&p.shipments.length)return p.shipments;
  if(p.shippedQty!=null)return[{no:parseInt(p.dnNo,10)||0,date:p.dnDate||(p.shippedAt?String(p.shippedAt).slice(0,10):''),at:p.shippedAt||'',rows:Array.isArray(p.shippedRows)?p.shippedRows:[],total:Math.max(0,+p.shippedQty||0)}];
  return[];
}
// חומרי האריזה שנרשמו בתעודה (רק עם כמות)
function shipMats(s){return (Array.isArray(s?.mats)?s.mats:[]).filter(m=>m&&(+m.n||0)>0);}
// מועד התעודה מול departedAt (תעודה ששוחזרה/הוקדמה — לפי התאריך שלה)
const _shipAtMs=s=>{const d=String(s.date||'').slice(0,10);return Date.parse((s.restoredAt||s.backdatedAt)?d:(s.at||d));};
// מועד התעודה למלאי: at, ובלעדיו צהרי יום התעודה
function _shipMs(s){const t=Date.parse(s?.at||'');return isNaN(t)?(Date.parse((s?.date||'')+'T12:00:00')||0):t;}
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
// 🚚 הופקה תעודת משלוח ≠ הסחורה יצאה (10/10/2026): תעודה ⇒ "מוכן ליציאה"; "יצא ללקוח" רק אחרי סימון
// יציאה (`departedAt`). 🚚 משלוח חלקי (20/10/2026): רק היחידות שיצאו (total + ✂ לא תפור) עוברות; היתרה
// נשארת במצב הייצור. יציאה **פר תעודה**: תעודה שהופקה (at) עד departedAt = יצאה.
// 🛑 לא חלקי: תעודה אחרונה לפני PIPE_PARTIAL_FROM, או דחיפה ידנית ל"מוכן ליציאה"/הלאה (= סגירה בחוסר)
function pipeShipInfo(p,qty){
  const shipped=(p.stageLog||[]).some(e=>e.id==='shipped')||+p.shippedQty>0;
  const shL=shipped?prodShipments(p):[];
  const shU=s=>(+s.total||0)+shUnsewn(s);
  const depT=p.departedAt?Date.parse(p.departedAt):NaN;
  const shDep=s=>{const d=String(s.date||'').slice(0,10);if(d&&d<PIPE_DEPART_FROM)return true;if(isNaN(depT))return false;
    return !(_shipAtMs(s)>depT);};
  const outU=shL.reduce((t,s)=>t+shU(s),0),depU=shL.reduce((t,s)=>t+(shDep(s)?shU(s):0),0);
  const lastD=shL.reduce((m,s)=>String(s.date||'')>m?String(s.date||''):m,'');
  const ovShip=!!p.pipeOverride&&PIPE_IDS.indexOf(p.pipeOverride.list)>=PIPE_IDS.indexOf('ready_ship');
  const partial=shipped&&qty>0&&shL.length>0&&outU<qty&&lastD>=PIPE_PARTIAL_FROM&&!ovShip;
  const departed=shipped&&!partial&&(shL.length?depU>=outU:(!!p.departedAt||String(pipeDnDate(p)||'9999')<PIPE_DEPART_FROM));
  return{shL,shipped,partial,departed,outU,depU};
}

// ─── מצב ההזמנה בלוח (pipeStateOf באפליקציה, trackStates בשרת) ───
// ⚠️ **המנוע הוא המחלקה שנסרקה (`t.dept`) — לא `stageLog`** (ראה pipeStateOf).
// tasks = המשימות **של ההזמנה הזו בלבד**; units(t) = יחידות המשימה (taskUnits באפליקציה — כמות "כל
// הכמות" נקראת מהמוצר בדיעבד). כל צד מוסיף מעל זה את מה שרק הוא מציג (פיצול לעמודות / תאריכים ללקוח).
function pipeCore(p,tasks,units){
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
    const nm=String(t.taskType||'').trim();done[nm]=(done[nm]||0)+units(t);
  }
  // ✔ שלב שסומן ידנית כגמור (products.stepMarks) = כל הכמות
  for(const m of (p.stepMarks||[]))if(m&&m.n)done[m.n]=Math.max(done[m.n]||0,qty);
  // full/of קובעים את המצב; pct = יחידות שבוצעו מתוך כמות×שלבים (לתצוגת הלקוח)
  const fam=f=>{const ss=steps[f];if(!ss.length)return null;
    return{full:ss.filter(nm=>qty>0&&(done[nm]||0)>=qty).length,of:ss.length,
      pct:qty>0?Math.round(100*ss.reduce((s,nm)=>s+Math.min(done[nm]||0,qty),0)/(qty*ss.length)):0};};
  const sew=fam('sew'),pack=fam('pack');
  const sh=pipeShipInfo(p,qty);
  let id;
  if(sh.departed)                                id='shipped';
  else if(sh.shipped&&!sh.partial)               id='ready_ship';
  else if(pack&&pack.of>0&&pack.full===pack.of)  id='ready_ship';
  else if(scans.pack>0)                          id='packing';
  else if(sew&&sew.of>0&&sew.full===sew.of)      id='ready_pack';
  else if(scans.sew>0)                           id='sewing';
  else if(qty>0&&scans.recv>0)                   id='ready_sew';
  else if(scans.recv>0)                          id='countcut';
  else                                           id='intake';
  // 📌 דחיפה ידנית של מנהל. **קדימה בלבד**; `shipped` תמיד גובר
  const nat=id;
  const ovList=p.pipeOverride&&PIPE_IDS.indexOf(p.pipeOverride.list)>=0?p.pipeOverride.list:null;
  if(ovList&&nat!=='shipped'&&PIPE_IDS.indexOf(ovList)>PIPE_IDS.indexOf(nat))id=ovList;
  // ✂️ פיצול (18/10/2026): sewDone = יחידות שסיימו את **כל** שלבי התפירה (השלב הנמוך);
  // packIn = יחידות שנסרקו באריזה (כולל משימות רצות) — השלב עם הכי הרבה
  let sewDone=0,packIn=0;
  if(sew&&qty>0){
    sewDone=Math.min(...steps.sew.map(nm=>Math.min(done[nm]||0,qty)));
    const inn={},sn=new Set();
    for(const t of tasks){if(pipeFamOfDept(t.dept)!=='pack')continue;const k=coverKey(t);if(sn.has(k))continue;sn.add(k);
      const nm=String(t.taskType||'').trim();inn[nm]=(inn[nm]||0)+units(t);}
    packIn=Math.min(qty,Math.max(0,...Object.values(inn)));
  }
  return{qty,scans,steps,done,sew,pack,...sh,id,nat,ovList,sewDone,packIn};
}

// ─── 📦 מלאי חומרים (pstkCalc/pstkNeed באפליקציה, trackPackStock בשרת) ───
// חומרי אריזה מובנים. mode/autoQty/incl/hint — לחלון התעודה באפליקציה
const PACK_MATS=[
  {k:'hanger',name:'קולב',      mode:'hang',hint:'רק כשהקולבים שלנו — הלקוח מספק ברוב המקרים'},
  // 🧷 קולב קליפס (25/10/2026) — למכנסיים וחצאיות. תלייה כמו קולב רגיל, עם מחיר משלו
  {k:'clip'  ,name:'קולב קליפס',mode:'hang',hint:'מכנסיים וחצאיות — רק כשהקולבים שלנו'},
  {k:'nylon' ,name:'ניילון',    mode:'hang',hint:'תלייה — לא כל פריט נארז בניילון, כמות ידנית'},
  {k:'cello' ,name:'ניילון צלופן',mode:'fold',autoQty:true,hint:'קיפול — כל פריט בשק, עוקב אחרי הכמות שיוצאת'},
  // 📄 נייר A4 (03/11/2026) — בהזמנות בקיפול (לא כל הלקוחות). incl = המחיר כלול בצלופן: בלי מחיר, בלי חיוב
  // ובלי "אין מחיר" — נרשם בתעודה רק בשביל המלאי
  {k:'paper' ,name:'נייר A4',   mode:'fold',incl:true,hint:'קיפול — רק בהזמנות שצריך · המחיר כלול בצלופן'}
];
// פריט לפי מפתח: חומר מובנה (builtin) או פריט שהמנהל הגדיר (packStock.items). null = נמחק
function stockItemOf(items,k){
  const m=PACK_MATS.find(x=>x.k===k);
  if(m)return {id:k,name:m.name,dept:'pack',unit:"יח'",builtin:true};
  return (Array.isArray(items)?items:[]).find(x=>x.id===k)||null;
}
// יחידות התעודה לפי מידה (בלי "לא תפור") — להוצאה של פריט לפי מידה
function stockSizeUnits(rows){const m={};(rows||[]).forEach(r=>{if(isUnsewn(r))return;const q=parseInt(r.qty)||0;if(q>0){const z=String(r.size??'');m[z]=(m[z]||0)+q;}});return m;}
// 🔑 היתרה **מחושבת ולא נשמרת**: תנועות (in/out/count) פחות מה שיצא בתעודות, מהתנועה הראשונה של אותו
// מלאי+חומר ואילך. מפתח = מלאי|חומר[|מידה]; מלאי = 'F' (המפעל) או קוד לקוח.
// חומר מובנה — לפי mats בתעודה (own ⇒ מלאי הלקוח); פריט — p.cons × יחידות התעודה; item.own ⇒ מלאי הלקוח.
function stockBalances(ps,prods){
  ps=ps||{};const items=Array.isArray(ps.items)?ps.items:[];
  const itemOf=k=>stockItemOf(items,k),bySz=k=>!!itemOf(k)?.bySize;
  const moves=(Array.isArray(ps.moves)?ps.moves:[]).filter(m=>m&&m.pool&&m.k);
  const mk=m=>m.pool+'|'+m.k+(bySz(m.k)?'|'+(m.s??''):'');
  const start={};moves.forEach(m=>{const key=mk(m);if(start[key]==null||m.at<start[key])start[key]=+m.at||0;});
  const ev=moves.map(m=>({at:+m.at||0,key:mk(m),t:m.t,n:+m.n||0}));
  const its=new Map(items.map(i=>[i.id,i]));
  (prods||[]).forEach(p=>{
    const cons=(Array.isArray(p.cons)?p.cons:[]).filter(c=>c&&its.has(c.id)&&(+c.n||0)>0);
    prodShipments(p).forEach(s=>{const at=_shipMs(s),u=+s.total||0,su=cons.some(c=>its.get(c.id).bySize)?stockSizeUnits(s.rows):null;
      shipMats(s).forEach(m=>{const key=(m.own?p.cust:'F')+'|'+m.k;
        if(start[key]!=null&&at>=start[key])ev.push({at,key,t:'use',n:+m.n||0});});
      if(u)cons.forEach(c=>{const it=its.get(c.id),base=(it.own?p.cust:'F')+'|'+c.id;
        if(it.bySize){Object.entries(su).forEach(([z,q])=>{const key=base+'|'+z;if(start[key]!=null&&at>=start[key])ev.push({at,key,t:'use',n:(+c.n)*q});});return;}
        if(start[base]!=null&&at>=start[base])ev.push({at,key:base,t:'use',n:(+c.n)*u});});
    });
  });
  // באותו רגע — התנועה הידנית קודם (ספירה שנרשמה לפני היציאה)
  ev.sort((a,b)=>a.at-b.at||(a.t==='use')-(b.t==='use'));
  const bal={};
  ev.forEach(e=>{if(e.t==='count')bal[e.key]=e.n;else bal[e.key]=(bal[e.key]||0)+(e.t==='in'?e.n:-e.n);});
  Object.keys(bal).forEach(k=>{bal[k]=Math.round(bal[k]*1000)/1000;});
  return bal;
}
// 📋 נדרש להזמנות פתוחות (25/10/2026): לכל הזמנה פתוחה — יחידות שעוד לא יצאו (כמות, או משוערת) ×
// הצריכה ליחידה בכרטיס המוצר (p.cons, כולל חומר אריזה מובנה). פתוחה = נשארו יחידות, לא דגם, ולא נסגרה:
// דחיפה ידנית ל"מוכן ליציאה"/"יצא" (= סגירה בחוסר), או תעודה אחרונה לפני 21 יום. מפתח = מלאי|חומר[|מידה]
function stockNeed(ps,prods,now){
  const items=Array.isArray((ps||{}).items)?ps.items:[];
  const need={},cnt={},cut=now-21*864e5;
  (prods||[]).forEach(p=>{
    if(p.isSample)return;
    const cons=(Array.isArray(p.cons)?p.cons:[]).filter(c=>c&&(+c.n||0)>0);if(!cons.length)return;
    const sh=prodShipments(p),out=sh.reduce((t,s)=>t+(+s.total||0),0),last=sh.reduce((m,s)=>Math.max(m,_shipMs(s)),0);
    const ov=p.pipeOverride?.list;
    if(ov==='ready_ship'||ov==='shipped'||(out>0&&last&&last<cut))return;
    const rem=Math.max(0,(_prodQty(p)||estQtyOf(p))-out);if(!rem)return;
    let remSz=null; // 📐 לפי מידה: כמות לכל מידה פחות מה שיצא בה (בלי כמות לפי מידה — לא נספר)
    cons.forEach(c=>{
      const it=stockItemOf(items,c.id);if(!it)return;
      const own=it.builtin?!!c.own:!!it.own,key=(own?p.cust:'F')+'|'+c.id;
      // 🔢 (09/11/2026, החלטת המשתמש) חומר שנספר ביחידות — עיגול **למעלה בכל הזמנה** (אין חצי ניילון:
      // 133 יח' × 0.2 = 26.6 ⇒ 27). מטר/ק"ג/גליל נשארים מדויקים. 1e-9 — שגיאת נקודה צפה (0.2×5) לא מעגלת
      const q=v=>(it.unit||"יח'")==="יח'"?Math.ceil(v-1e-9):v;
      if(it.bySize){
        if(!remSz){remSz={};(p.quantities||[]).forEach(q=>{const z=String(q.size??''),n=parseInt(q.qty)||0;if(n>0)remSz[z]=(remSz[z]||0)+n;});
          sh.forEach(s=>Object.entries(stockSizeUnits(s.rows)).forEach(([z,n])=>{if(z in remSz)remSz[z]-=n;}));}
        Object.entries(remSz).forEach(([z,n])=>{if(n>0){const kz=key+'|'+z;need[kz]=(need[kz]||0)+q((+c.n)*n);cnt[kz]=(cnt[kz]||0)+1;}});
        return;
      }
      need[key]=(need[key]||0)+q((+c.n)*rem);cnt[key]=(cnt[key]||0)+1;
    });
  });
  return {need,cnt};
}

// ─── 🔔 שעות שליחת התראות ללקוחות — ברירת מחדל. יום 0=א'…6=ש': א'-ה' 07:00-18:00, ו' 07:00-13:00 ───
const NOTIFY_DEF_WIN={0:['07:00','18:00'],1:['07:00','18:00'],2:['07:00','18:00'],3:['07:00','18:00'],4:['07:00','18:00'],5:['07:00','13:00']};

if(typeof module==='object'&&module&&module.exports)module.exports={PIPE_IDS,PIPE_DEPART_FROM,PIPE_PARTIAL_FROM,prodStampOf,_prodQty,estQtyOf,
  orderNoOf,taskBc,coverKey,stepName,stepStation,pipeFamOfDept,pipeFamOfStep,GRADE_U,isUnsewn,shUnsewn,prodShipments,shipMats,_shipAtMs,_shipMs,
  pipeDnDate,pipeEntryDate,pipeShipDate,pipeShipInfo,pipeCore,PACK_MATS,stockItemOf,stockSizeUnits,stockBalances,stockNeed,NOTIFY_DEF_WIN};
