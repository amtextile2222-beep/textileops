// ─── PERSONAL REPORT ────────────────────────────────────────
function setPrRange(range){
  const today=todayStr();
  const d=new Date();
  if(range==='week'){
    const day=d.getDay();
    const mon=new Date(d);mon.setDate(d.getDate()-day+1);
    document.getElementById('pr-from').value=mon.toISOString().slice(0,10);
    document.getElementById('pr-to').value=today;
  }else if(range==='month'){
    document.getElementById('pr-from').value=d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-01';
    document.getElementById('pr-to').value=today;
  }else{
    document.getElementById('pr-from').value='';
    document.getElementById('pr-to').value='';
  }
  buildPersonalReport();
}
// שליפת משימות היסטוריות לפי טווח תאריכים — לפי דרישה (דוחות/עלויות/גיבוי), מעבר לחלון החי.
// fromD/toD בפורמט YYYY-MM-DD (ריק = ללא גבול). מסנן לפי endTime עם ריווח יום לכל צד כדי
// לכלול משימות שחצו חצות; הקוראים ממילא מסננים שוב במדויק לפי startTime.
// cache קצר (30 שנ') לפי טווח — buildRep נקרא מ-renderAll בכל עדכון real-time,
// והמטמון מונע שליפת רשת חוזרת. שינוי טווח תאריכים → מפתח חדש → שליפה טרייה.
let _histRangeCache={key:'',ts:0,data:null};
async function loadHistRange(fromD,toD){
  const key=(fromD||'')+'|'+(toD||'');
  if(_histRangeCache.key===key&&_histRangeCache.data&&Date.now()-_histRangeCache.ts<30000)return _histRangeCache.data;
  if(!db||!S.fbConnected)return S.histTasks.slice();
  try{
    const{collection,query,where,orderBy,getDocs}=window._fb;
    const fromISO=fromD?new Date(new Date(fromD+'T00:00:00').getTime()-86400000).toISOString():'0000';
    const toISO=toD?new Date(new Date(toD+'T23:59:59').getTime()+86400000).toISOString():'9999';
    const qy=query(collection(db,'histTasks'),where('endTime','>=',fromISO),where('endTime','<=',toISO),orderBy('endTime','desc'));
    const snap=await getDocs(qy);
    const data=snap.docs.map(d=>{const dd=d.data();return{...dd,id:d.id,startTime:dd.startTime?.toDate?dd.startTime.toDate():new Date(dd.startTime),endTime:dd.endTime?.toDate?dd.endTime.toDate():new Date(dd.endTime)};});
    _histRangeCache={key,ts:Date.now(),data};
    return data;
  }catch(e){console.error('loadHistRange:',e);return S.histTasks.slice();}
}
// 📦 (08/11/2026 — בקשת המשתמש) מוצר נבחר בדוחות ⇒ **כל** המשימות של המוצר, בלי קשר לתאריכים,
// כדי שהזמן/היחידות/הרווח יהיו של המוצר כולו. שאילתת שוויון על prod (אינדקס שדה יחיד) — קוראת רק את
// משימות המוצר, לא את כל האוסף. מטמון 30 שנ' כמו loadHistRange (buildRep נקרא בכל עדכון חי).
let _histProdCache={key:'',ts:0,data:null};
async function loadHistProd(prod){
  if(_histProdCache.key===prod&&_histProdCache.data&&Date.now()-_histProdCache.ts<30000)return _histProdCache.data;
  if(!db||!S.fbConnected)return S.histTasks.filter(t=>t.prod===prod);
  try{
    const{collection,query,where,getDocs}=window._fb;
    const snap=await getDocs(query(collection(db,'histTasks'),where('prod','==',prod)));
    const data=snap.docs.map(d=>{const dd=d.data();return{...dd,id:d.id,startTime:dd.startTime?.toDate?dd.startTime.toDate():new Date(dd.startTime),endTime:dd.endTime?.toDate?dd.endTime.toDate():new Date(dd.endTime)};})
      .sort((a,b)=>new Date(b.endTime)-new Date(a.endTime));
    _histProdCache={key:prod,ts:Date.now(),data};
    return data;
  }catch(e){console.error('loadHistProd:',e);return S.histTasks.filter(t=>t.prod===prod);}
}
// שליפת נוכחות לפי טווח תאריכים — לפי דרישה, מעבר לחלון החי (ATT_WINDOW_DAYS=45).
// date הוא מחרוזת YYYY-MM-DD ⇒ השוואה ישירה, בלי המרות ISO כמו ב-loadHistRange.
// ריק = ללא גבול. אינדקס: שדה יחיד (date) ⇒ אין צורך באינדקס מורכב.
// 🛑 כל דוח שנותן למשתמש לבחור טווח תאריכים חייב לעבור דרך כאן. שימוש ישיר
//    ב-S.attHistory לטווח נבחר יחזיר בחסר בשקט ברגע שהטווח חורג מ-45 יום.
// var ולא let — מוצהר מתחת לפונקציות שמשתמשות בו (runDailyBackup וכו'), ו-let היה TDZ.
var _attRangeCache={key:'',ts:0,data:null};
async function loadAttRange(fromD,toD){
  const key=(fromD||'')+'|'+(toD||'');
  if(_attRangeCache.key===key&&_attRangeCache.data&&Date.now()-_attRangeCache.ts<30000)return _attRangeCache.data;
  if(!db||!S.fbConnected)return (S.attHistory||[]).slice();
  try{
    const{collection,query,where,orderBy,getDocs}=window._fb;
    const cs=[];
    if(fromD)cs.push(where('date','>=',fromD));
    if(toD)cs.push(where('date','<=',toD));
    cs.push(orderBy('date','desc'));
    const snap=await getDocs(query(collection(db,'attHistory'),...cs));
    const data=snap.docs.map(d=>({...d.data()}));
    _attRangeCache={key,ts:Date.now(),data};
    return data;
  }catch(e){console.error('loadAttRange:',e);return (S.attHistory||[]).slice();}
}
async function buildPersonalReport(){
  const el=document.getElementById('pr-body');if(!el)return;
  const isMgr=S.user?.role==='manager'||S.user?.role==='supervisor';
  if(isMgr){el.innerHTML='';return;}
  const uid=S.user?.id;if(!uid)return;
  const fromD=document.getElementById('pr-from')?.value||'';
  const toD=document.getElementById('pr-to')?.value||'';
  const hist=await loadHistRange(fromD,toD);
  const myTasks=hist.filter(t=>{
    if(t.workerId!==uid)return false;
    const d=new Date(t.startTime).toISOString().slice(0,10);
    return(!fromD||d>=fromD)&&(!toD||d<=toD);
  });
  if(!myTasks.length){el.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:1rem 0;text-align:center">אין נתונים בטווח הנבחר</div>';return;}
  // סה"כ שעות אמיתיות
  const totalSecs=calcActualTaskTime(myTasks);
  const totalUnits=myTasks.reduce((s,t)=>s+(t.qty||0),0);
  // קיבוץ לפי מוצר
  const byProd={};
  myTasks.forEach(t=>{
    const key=t.prod+'_'+(t.size||'');
    if(!byProd[key])byProd[key]={prod:t.prod,cust:t.cust,size:t.size||'',taskType:t.taskType||'',tasks:[]};
    byProd[key].tasks.push(t);
  });
  const prodRows=Object.values(byProd).map(p=>{
    const secs=calcActualTaskTime(p.tasks);
    const units=p.tasks.reduce((s,t)=>s+(t.qty||0),0);
    return{prod:p.prod,cust:p.cust,size:p.size,taskType:p.taskType,secs,units};
  }).sort((a,b)=>b.secs-a.secs);
  const T=LANGS[currentLang];
  // סה"כ שעות נוכחות מ-attHistory + היום
  // טווח נבחר ⇒ שליפה לפי דרישה; S.attHistory מחזיק רק ATT_WINDOW_DAYS.
  const _attPR=await loadAttRange(fromD,toD);
  let totalAttMs=0;
  (_attPR||[]).forEach(rec=>{
    if(rec.workerId!==uid)return;
    const d=rec.date||'';
    if(fromD&&d<fromD)return;
    if(toD&&d>toD)return;
    totalAttMs+=rec.netMs||0;
  });
  const todayWx=(S.workers||[]).find(w=>w.id===uid);
  if(todayWx){
    const td=todayStr();
    const inHist=(S.attHistory||[]).some(r=>r.workerId===uid&&r.date===td);
    if(!inHist&&(!fromD||td>=fromD)&&(!toD||td<=toD)&&todayWx.checkin){
      totalAttMs+=calcNetWork(todayWx);
    }
  }
  const totalAttH=(totalAttMs/3600000).toFixed(1);
  el.innerHTML=`
    <div class="g4" style="margin-bottom:1rem">
      <div class="card"><div class="mlbl">${T.rep_time||'זמן משימות'}</div><div class="mval">${(totalSecs/3600).toFixed(1)} ${T.hours||"שע'"}</div></div>
      <div class="card"><div class="mlbl">שעות נוכחות</div><div class="mval">${totalAttH} ${T.hours||"שע'"}</div></div>
      <div class="card"><div class="mlbl">${T.rep_units||'יחידות'}</div><div class="mval">${totalUnits}</div></div>
      <div class="card"><div class="mlbl">${T.rep_total||'סה"כ משימות'}</div><div class="mval">${myTasks.length}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid var(--b)">
        <th style="text-align:right;padding:6px 8px">${T.th_product||'מוצר'}</th>
        <th style="text-align:right;padding:6px 8px">${T.th_task_type||'סוג משימה'}</th>
        <th style="text-align:right;padding:6px 8px">${T.tasks_units||'יחידות'}</th>
        <th style="text-align:right;padding:6px 8px">${T.rep_time||'שעות'}</th>
      </tr></thead>
      <tbody>${prodRows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)">
        <td style="padding:7px 8px"><span class="bc-seg bc-p">${r.prod}</span>${r.size?` <span class="bc-seg bc-s">מידה ${esc(szLblT(r.cust,r.prod,r.size))}</span>`:''} <span style="font-size:11px;color:var(--txt3)">לקוח ${r.cust}</span></td>
        <td style="padding:7px 8px;color:var(--txt2)">${esc(r.taskType||'—')}</td>
        <td style="padding:7px 8px">${r.units}</td>
        <td style="padding:7px 8px"><span class="badge blue">${(r.secs/3600).toFixed(1)} ${T.hours||"שע'"}</span></td>
      </tr>`).join('')}</tbody>
    </table>
    ${buildAttDayTable(uid,fromD,toD,T,_attPR)}`;
}
// att — הנוכחות של הטווח שכבר נשלפה ב-buildPersonalReport (loadAttRange).
// בלעדיה הטבלה נופלת לחלון 45 יום ומציגה פחות ימים בשקט.
function buildAttDayTable(uid,fromD,toD,T,att){
  // build attendance by day from attHistory + today's sessions
  const rows=[];
  // historical days
  (att||S.attHistory||[]).forEach(rec=>{
    if(rec.workerId!==uid)return;
    const d=rec.date||'';
    if(fromD&&d<fromD)return;
    if(toD&&d>toD)return;
    const ses=rec.sessions||[];
    const firstIn=ses.length?ses[0].in:rec.checkin||null;
    const lastOut=ses.length?ses[ses.length-1].out:rec.checkout||null;
    const netH=rec.netMs?rec.netMs/3600000:0;
    rows.push({date:d,firstIn,lastOut,netH});
  });
  // today's live sessions — only if not already in attHistory
  const todayW=(S.workers||[]).find(w=>w.id===uid);
  if(todayW){
    const td=todayStr();
    const alreadyHave=rows.some(r=>r.date===td);
    if(!alreadyHave&&(!fromD||td>=fromD)&&(!toD||td<=toD)){
      const ses=todayW.sessions||[];
      const firstIn=ses.length?ses[0].in:todayW.checkin||null;
      const lastOut=ses.length?ses[ses.length-1].out:todayW.checkout||null;
      const netMs=calcNetWork(todayW); // already in ms
      if(firstIn)rows.push({date:td,firstIn,lastOut,netH:netMs/3600000,isToday:true});
    }
  }
  if(!rows.length)return'';
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  const fmtTime=iso=>{if(!iso)return'—';const d=new Date(iso);return pad2(d.getHours())+':'+pad2(d.getMinutes());};
  const fmtDate=d=>{const[y,m,dd]=d.split('-');return dd+'/'+m+'/'+y;};
  return`<div style="margin-top:1.5rem">
    <div style="font-weight:600;font-size:13px;margin-bottom:.5rem;color:var(--txt)">🕐 ${T.att_by_day||'נוכחות לפי יום'}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid var(--b)">
        <th style="text-align:right;padding:6px 8px">${T.th_date||'תאריך'}</th>
        <th style="text-align:right;padding:6px 8px">כניסה</th>
        <th style="text-align:right;padding:6px 8px">יציאה</th>
        <th style="text-align:right;padding:6px 8px">שעות</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)${r.isToday?';background:var(--bg2)':''}">
        <td style="padding:7px 8px">${fmtDate(r.date)}${r.isToday?' <span style="font-size:10px;color:var(--blue-txt)">(היום)</span>':''}</td>
        <td style="padding:7px 8px">${fmtTime(r.firstIn)}</td>
        <td style="padding:7px 8px">${fmtTime(r.lastOut)||'<span style="color:var(--amber-txt)">בעבודה</span>'}</td>
        <td style="padding:7px 8px"><span class="badge${r.isToday?' blue':''}">${r.netH>0?r.netH.toFixed(1)+' שע\'':'—'}</span></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}
// ─── REPORTS ────────────────────────────────────────────────
// 🌐 תוויות התוספות של 07-08/11/2026 (מחלקות במשימות, מוצר/הזמנה בדוחות, מוקצב מול בפועל לפי מחלקה)
const RL_LBL={
  he:{prod_note:'📦 מוצר נבחר — מוצגות כל המשימות שלו, בלי קשר לתאריכים',all_orders:'כל ההזמנות',order:'הזמנה',cust:'לקוח',
    dept:'מחלקה',units:"יח'",planned:'מוקצב',actual:'בפועל',left:'נותר',over:'חריגה',no_dept:'ללא מחלקה',cplan:'עלות מתוכננת',cact:'עלות בפועל',cdiff:'הפרש ₪',cplan_t:'הדקות שהוזנו לשלבים × תעריף השלב (ממוצע העובדות הכשירות + תקורה) × היחידות',cact_t:'השעות נטו של כל משימה × תעריף העובדת שעשתה אותה + תקורה',over_cost:'עלות החריגות',over_cost_t:'סכום העלות מעבר לעלות המתוכננת בכל מחלקה שחרגה (לפי תעריף כל עובדת)',profit_loss:'הפסד ברווח',profit_loss_t:'רק החלק שעבר את התקציב של המחלקה (המחיר פחות רווח היעד) — עד התקציב הרווח עוד לא נפגע',target_profit:'רווח יעד להזמנה',exp_profit:'נשאר',of_target:'מהיעד',no_loss:'אין חריגה בעלות — העבודה בתוך העלות המתוכננת',clock:'שעון',clock_t:'בפועל = דקות שעון × תעריף העובדת ÷ התעריף הממוצע של המוצר'},
  ar:{prod_note:'📦 منتج محدد — تُعرض كل مهامه بغض النظر عن التواريخ',all_orders:'كل الطلبيات',order:'طلبية',cust:'زبون',
    dept:'القسم',units:'قطعة',planned:'المخصص',actual:'الفعلي',left:'متبقٍ',over:'تجاوز',no_dept:'بدون قسم',cplan:'التكلفة المخططة',cact:'التكلفة الفعلية',cdiff:'الفرق ₪',cplan_t:'الدقائق المدخلة للمراحل × أجر المرحلة + المصاريف × عدد القطع',cact_t:'ساعات كل مهمة × أجر العاملة التي نفذتها + المصاريف',over_cost:'تكلفة التجاوزات',over_cost_t:'التكلفة الزائدة عن المخطط في كل قسم تجاوز (حسب أجر كل عاملة)',profit_loss:'خسارة في الربح',profit_loss_t:'فقط ما تجاوز ميزانية القسم (السعر ناقص الربح المستهدف)',target_profit:'الربح المستهدف للطلبية',exp_profit:'المتبقي',of_target:'من الهدف',no_loss:'لا تجاوز في التكلفة — العمل ضمن التكلفة المخططة',clock:'الساعة',clock_t:'الفعلي = دقائق الساعة × أجر العاملة ÷ متوسط أجر المنتج'},
  en:{prod_note:'📦 Product selected — all its tasks are shown, regardless of dates',all_orders:'All orders',order:'Order',cust:'Customer',
    dept:'Department',units:'pcs',planned:'Planned',actual:'Actual',left:'Left',over:'Over',no_dept:'No department',cplan:'Planned cost',cact:'Actual cost',cdiff:'Diff ₪',cplan_t:'Entered step minutes × step rate (+overhead) × units',cact_t:'Net hours of each task × the worker rate + overhead',over_cost:'Overrun cost',over_cost_t:'Cost above plan in each department that overran (by each worker rate)',profit_loss:'Profit loss',profit_loss_t:'Only what exceeded the department budget (price minus target profit)',target_profit:'Order target profit',exp_profit:'Left',of_target:'of target',no_loss:'No cost overrun — within planned cost',clock:'clock',clock_t:'Actual = clock minutes × worker rate ÷ product average rate'}
};
const _rl=k=>(RL_LBL[currentLang]||RL_LBL.he)[k]??RL_LBL.he[k];
// 🏭 מוקצב לפי מחלקה — נקודת אמת אחת לדוח "רווח מול יעד", ללשונית משימות ולמסך התצוגה.
// מפתח המחלקה = המחלקה שבתחנה הראשית של השלב; מחלקות התפירה (1, 2…) — שורה אחת, כמו בחלון המוצר.
function _dTimeKey(st){let k=st?String(st).split('::')[0]:'';if(pipeFamOfDept(k)==='sew')k=k.replace(/\s*\d+\s*$/,'');return k;}
// דקות ליחידה פר מחלקה. מנהל עם תמחור ⇒ בדיוק כמו הדוח (שהוזנו, ובלי — הנגזרות מהתקציב, _prodBudget);
// אחרת (אחראי — אין לו עלויות) ⇒ רק הדקות שהוזנו ידנית בשלבים.
function _ordDeptPlan(p,ctx){
  const stepKey={},plan={},ord=[],pc={},bc={},add=k=>{if(!(k in plan)){plan[k]=0;pc[k]=0;bc[k]=0;ord.push(k);}};
  const pb=ctx&&p&&+p.unitPrice?_prodBudget(p,ctx):null,mins={},sc={};
  // 💸 pc = עלות מתוכננת ₪/יח' (דקות שהוזנו × תעריף השלב+תקורה), bc = התקציב ₪/יח' (חלק השלב מתקציב המחיר)
  if(pb){pb.lvl.forEach((s,i)=>{const b=pb.stepBud[i],m=b.typed>0?b.typed:b.min;mins[stepName(s)]=m;sc[stepName(s)]=[m*pb.rates[i]/60,b.ils];});
    pb.cutLvl.forEach((s,i)=>{const b=pb.cutStepBud[i],m=b.typed>0?b.typed:b.min;mins[stepName(s)]=m;sc[stepName(s)]=[m*pb.cutRates[i]/60,b.ils];});}
  (p?.workSteps||[]).forEach(s=>{const n=stepName(s);if(!n||n in stepKey)return;const k=(stepIsCut(s)?'✂ ':'')+(_dTimeKey(stepStation(s))||_rl('no_dept'));
    stepKey[n]=k;add(k);plan[k]+=pb?(mins[n]||0):stepManualMin(s);if(sc[n]){pc[k]+=sc[n][0];bc[k]+=sc[n][1];}});
  return{stepKey,plan,ord,add,pc,bc};
}
// מוקצב מול בפועל לפי מחלקה להזמנה פעילה — ללשונית משימות ולמסך התצוגה. ⚠️ **אפס קריאות Firestore**:
// S.histTasks (החלון החי, HIST_WINDOW_DAYS) + המשימות הרצות עכשיו — אותה החלטה כמו _kioskProdPanel,
// כי שני המסכים מתרנדרים כל היום. הזמנה שרצה מעל 14 יום תראה כאן פחות מהדוח (שם — כל ההיסטוריה).
// רצה ⇒ elapsed מחולק בין המשימות הרצות במקביל של אותו עובד (אותה שעת שעון); מושהית ⇒ accumulatedSec.
function _liveOrdDeptTime(cust,prod,stamp){
  const p=prodByStamp(cust,prod,stamp);if(!p)return null;
  const units=Math.max(_prodQty(p),+p.shippedQty||0)||(+p.estQty||0);if(!units)return null;
  const d=_ordDeptPlan(p,_pricingCtx()),act={},clk={},oc={};
  const mine=t=>t.cust===cust&&t.prod===prod&&taskOrderStamp(t,oc)===stamp;
  const keyOf=t=>{const k=d.stepKey[t.taskType]||_dTimeKey(t.dept)||_rl('no_dept');d.add(k);return k;};
  // ⚖ בפועל = דקות שעון × מקדם העובדת (_rwOf) — עובדת יקרה "צורכת" יותר מהמוקצב; clk = שעון נטו לתצוגה
  const addT=(t,min)=>{const k=keyOf(t);clk[k]=(clk[k]||0)+min;act[k]=(act[k]||0)+min*_rwOf(t.workerId,p,k.startsWith('✂ '));};
  const done=S.histTasks.filter(t=>mine(t)&&(t.duration||0)>0),nd=normalizeBatchDurations(done);
  done.forEach(t=>addT(t,(nd[t.id]||0)/60));
  const runN={};S.activeTasks.forEach(t=>{if(!t.paused)runN[t.workerId]=(runN[t.workerId]||0)+1;});
  S.activeTasks.forEach(t=>{if(!mine(t))return; // elapsed ריק אחרי snapshot עד ה-tick הבא ⇒ מחשבים כאן (אחרת קפיצה זמנית למטה)
    const sec=t.paused?(t.accumulatedSec||0):(t.elapsed>0?t.elapsed:(t.accumulatedSec||0)+calcTaskDurSec(t.startTime,new Date(),t.workerId))/(runN[t.workerId]||1);addT(t,sec/60);});
  const rows=d.ord.filter(k=>d.plan[k]>0||act[k]>0).map(k=>({k,plan:d.plan[k]*units,act:act[k]||0,clk:clk[k]||0}));
  return{p,units,rows};
}
// שורת מחלקה אחת: "מוקצב X · בפועל Y · נותר/חריגה Z"
function _deptTimeLine(r){
  const l=r.plan-r.act,c=l<0?'var(--red-txt)':'var(--green-txt,#16a34a)';
  const ck=r.clk>0&&Math.abs(r.clk-r.act)>=1?` <span style="opacity:.65;font-weight:400" title="${esc(_rl('clock_t'))}">(${_rl('clock')} ${fmtExpMin(r.clk)})</span>`:'';
  return`${_rl('planned')} ${r.plan>0?fmtExpMin(r.plan):'—'} · ${_rl('actual')} <b>${r.act>0?fmtExpMin(r.act):'—'}</b>${ck}${r.plan>0?` · <b style="color:${c}">${_rl(l<0?'over':'left')} ${fmtExpMin(Math.abs(l))}</b>`:''}`;
}
// 🔢 (08/11/2026) בחירת הזמנה של המוצר הנבחר — מוצג רק כשלמוצר יותר מהזמנה אחת. השיוך משימה⇒הזמנה
// דרך taskOrderStamp (נקודת האמת היחידה, כמו בדוח הרווח). מחזיר {cust,st} של ההזמנה הנבחרת או null.
function _rfOrderSel(pf,cf){
  const sel=document.getElementById('rf-o');if(!sel)return null;
  const recs=pf?S.products.filter(p=>p.prod===pf&&(!cf||p.cust===cf)).sort((a,b)=>prodStampOf(a)-prodStampOf(b)):[];
  if(sel.dataset.pf!==pf+'|'+cf){sel.dataset.pf=pf+'|'+cf;sel.value='';} // מוצר/לקוח אחר ⇒ חוזרים ל"כל ההזמנות"
  const cur=sel.value;
  sel.style.display=recs.length>1?'':'none';
  sel.innerHTML=`<option value="">${_rl('all_orders')}</option>`+recs.map(p=>{const v=p.cust+'|'+prodStampOf(p);
    return`<option value="${v}" ${v===cur?'selected':''}>${p.orderNo?_rl('order')+' #'+esc(String(p.orderNo).padStart(3,'0'))+' · ':''}${esc(p.name||'')}${!cf&&new Set(recs.map(r=>r.cust)).size>1?' · '+_rl('cust')+' '+p.cust:''}</option>`;}).join('');
  if(recs.length<2||!cur||!recs.some(p=>p.cust+'|'+prodStampOf(p)===cur)){sel.value='';return null;}
  const[c,s]=cur.split('|');return{cust:c,st:+s};
}
async function buildRep(){
  const T=LANGS[currentLang];
  const wf=document.getElementById('rf-w').value;
  const cf=document.getElementById('rf-c').value;
  const pf=document.getElementById('rf-p').value;
  // 📦 מוצר נבחר ⇒ התאריכים לא חלים (loadHistProd) — הזמן הוא של המוצר כולו
  const fromD=pf?'':document.getElementById('rf-from')?.value||'';
  const toD=pf?'':document.getElementById('rf-to')?.value||'';
  const rfn=document.getElementById('rf-prod-note');if(rfn){rfn.style.display=pf?'':'none';rfn.textContent=_rl('prod_note');}
  const hist=pf?await loadHistProd(pf):await loadHistRange(fromD,toD);
  const all=[...S.activeTasks.map(t=>({...t,done:false})),...hist.map(t=>({...t,done:true}))];
  const of=_rfOrderSel(pf,cf),_oc={};
  const fl=all.filter(t=>{
    const d=new Date(t.startTime).toISOString().slice(0,10);
    return(!wf||t.workerName===wf)&&(!cf||t.cust===cf)&&(!pf||t.prod===pf)&&(!fromD||d>=fromD)&&(!toD||d<=toD)
      &&(!of||(t.cust===of.cust&&taskOrderStamp(t,_oc)===of.st));
  });
  document.getElementById('rp-tot').textContent=fl.length;
  const totalS=calcActualTaskTime(fl);
  document.getElementById('rp-time').textContent=(totalS/3600).toFixed(1)+" שע'";
  document.getElementById('rp-units').textContent=sumUnitsDedup(fl);
  const done=fl.filter(t=>t.done).length;
  document.getElementById('rp-eff').textContent=fl.length?Math.round(done/fl.length*100)+'%':'—';
  const _rpDed=scanDeductMap(fl);
  document.getElementById('rp-body').innerHTML=fl.map(t=>{
    const st=new Date(t.startTime);
    const stStr=pad2(st.getHours())+':'+pad2(st.getMinutes());
    const et=t.endTime?new Date(t.endTime):null;
    const etStr=et?pad2(et.getHours())+':'+pad2(et.getMinutes()):'—';
    const expSec=(+t.expectedMin>0)?(+t.expectedMin)*60:0;
    const _ded=_rpDed[t.id]||0;
    const over=_expOver(t.done?(t.duration||0):(t.elapsed||0),expSec,_ded);
    return`<tr><td>${esc(t.workerName)}</td><td>${esc(t.dept)}</td>
    <td>${esc(t.taskType||'—')}</td>
    <td><span class="bc-seg bc-c">${t.cust}</span></td>
    <td><span class="bc-seg bc-p">${t.prod}</span></td>
    <td>${t.size?`<span class="bc-seg bc-s">${t.size}</span>`:'—'}</td>
    <td>${t.qty}</td><td>${COLORS[t.col]||t.col}</td>
    <td>${stStr}</td><td>${etStr}</td>
    <td>${t.done?`<span class="badge ${over?'red':'blue'}">${over?'⚠ ':''}${fmtM(t.duration||0)}</span>${_expDeltaBadge(t.duration||0,expSec,true,_ded)}`:`<span class="badge ${over?'red':'amber'}"${over?` title="חריגה מהצפי (${fmtM(expSec)})"`:''}>${over?'⚠ ':''}${fmtS(t.elapsed||0)}</span>`}</td>
    <td><span class="badge ${t.done?'green':'blue'}">${t.done?T.completed:T.active}</span></td></tr>`;
  }).join('');
  // update filters
  const wOpts=[...new Set(all.map(t=>t.workerName))];
  const cOpts=[...new Set([...all.map(t=>t.cust),...S.products.map(p=>p.cust).filter(Boolean)])].sort();
  // 📦 (08/11/2026) גם כל המוצרים שבכרטיסים (לפי הלקוח הנבחר) — אחרת אפשר היה לבחור רק מוצר עם משימות בטווח
  // התאריכים, ואחרי בחירה הרשימה הצטמצמה למוצר הנבחר + הרצים (14771 שלא נסרק היום לא הופיע)
  const pOpts=[...new Set([...all.map(t=>t.prod),...S.products.filter(p=>p.prod&&(!cf||p.cust===cf)).map(p=>String(p.prod))])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const rfw=document.getElementById('rf-w');const rfc=document.getElementById('rf-c');const rfp=document.getElementById('rf-p');
  rfw.innerHTML='<option value="">כל העובדים</option>'+wOpts.map(w=>`<option value="${esc(w)}" ${w===wf?'selected':''}>${esc(w)}</option>`).join('');
  rfc.innerHTML='<option value="">כל הלקוחות</option>'+cOpts.map(c=>`<option value="${c}" ${c===cf?'selected':''}>לקוח ${c}</option>`).join('');
  rfp.innerHTML='<option value="">כל המוצרים</option>'+pOpts.map(p=>`<option value="${p}" ${p===pf?'selected':''}>מוצר ${p}</option>`).join('');
  buildPipelineReport();
  buildSummaryReport(fl);
  buildExpectedByProduct(fl);
  buildStageReport();
  buildStepQtyReport(cf,pf);
  buildBudgetReport(fl);
  buildCutReport(fl);
  buildProfitReport(fl);
  buildRealProfitReport(false); // לא תלוי ב-fl — שולף את כל ההיסטוריה בעצמו, ורק כשהכרטיס פתוח
}
function buildSummaryReport(fl){
  const el=document.getElementById('rp-summary-body');if(!el)return;
  if(!fl.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">אין נתונים</div>';return;}
  // קיבוץ לפי עובד — זמן אמיתי (union intervals)
  const workers={};
  fl.forEach(t=>{if(!workers[t.workerId])workers[t.workerId]={name:t.workerName,dept:t.dept,tasks:[]};workers[t.workerId].tasks.push(t);});
  // עלות עבודה — מנהל בלבד (שכר אסור לאחראי). עמוסה + תקורה מפעלית לשעה.
  const showCost=S.user?.role==='manager';
  const oh=showCost?overheadBreakdown().perHour:0;
  const rows=Object.entries(workers).map(([wid,w])=>{
    const secs=calcActualTaskTime(w.tasks);
    const units=w.tasks.reduce((s,t)=>s+(t.qty||0),0);
    // עמוסה + תקורה — לפי התעריף שהיה בתוקף **בכל יום** (📅 היסטוריית עלויות)
    let cost=null;
    if(showCost){
      const byD={};w.tasks.forEach(t=>{(byD[_tDay(t)]=byD[_tDay(t)]||[]).push(t);});
      for(const dd in byD){const rate=loadedHourlyRate(wid,dd);if(rate>0)cost=(cost||0)+calcActualTaskTime(byD[dd])/3600*(rate+oh);}
    }
    return{name:w.name,dept:w.dept,secs,units,cost};
  }).sort((a,b)=>b.secs-a.secs);
  const grandSecs=rows.reduce((s,r)=>s+r.secs,0);
  const grandUnits=rows.reduce((s,r)=>s+r.units,0);
  const grandCost=rows.reduce((s,r)=>s+(r.cost||0),0);
  const costHead=showCost?'<th style="text-align:right;padding:6px 8px">עלות עבודה</th>':'';
  const costCell=r=>showCost?`<td style="padding:7px 8px">${r.cost!=null?`<span class="badge amber">₪${r.cost.toFixed(2)}</span>`:'<span style="color:var(--txt3)">—</span>'}</td>`:'';
  el.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:1px solid var(--b)">
      <th style="text-align:right;padding:6px 8px">עובד</th>
      <th style="text-align:right;padding:6px 8px">מחלקה</th>
      <th style="text-align:right;padding:6px 8px">יחידות</th>
      <th style="text-align:right;padding:6px 8px">שעות עבודה</th>
      ${costHead}
    </tr></thead>
    <tbody>
    ${rows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)">
      <td style="padding:7px 8px;font-weight:500">${esc(r.name)}</td>
      <td style="padding:7px 8px;color:var(--txt2)">${esc(r.dept)}</td>
      <td style="padding:7px 8px">${r.units}</td>
      <td style="padding:7px 8px"><span class="badge blue">${(r.secs/3600).toFixed(1)} שע'</span></td>
      ${costCell(r)}
    </tr>`).join('')}
    </tbody>
    <tfoot><tr style="border-top:1.5px solid var(--b);font-weight:600;background:var(--bg2)">
      <td style="padding:8px 8px" colspan="2">סה"כ</td>
      <td style="padding:8px 8px">${grandUnits}</td>
      <td style="padding:8px 8px"><span class="badge green">${(grandSecs/3600).toFixed(1)} שע'</span></td>
      ${showCost?`<td style="padding:8px 8px"><span class="badge green">₪${grandCost.toFixed(2)}</span></td>`:''}
    </tr></tfoot>
  </table>${showCost?`<div style="font-size:11px;color:var(--txt3);margin-top:6px">עלות עבודה = שעות בפועל × (עלות שעה עמוסה + תקורה מפעלית ₪${oh.toFixed(2)}/שעה)</div>`:''}`;
}
// ─── 🎯 בפועל מול צפי — לפי מוצר ─────────────────────────────
// שורה לכל לקוח+מוצר, במסננים ובטווח התאריכים של לשונית הדוחות (עובד · לקוח · מוצר · מ-/עד).
// ⚠️ הצפי (`expectedMin`) **נצרב על המשימה בזמן הסריקה** ואינו מחושב מחדש — שלב עם רמת
// קושי ובלי דקות ידניות בולע 100% מתקציב ההזמנה ומייצר צפי אבסורדי (00205 `سيرت` 517 דק').
// נמדד 27/08: 30 רשומות באוגוסט, 228 שע' "חיסכון" מדומה. **החלטת המשתמש: להציג כמו שהן,
// מסומנות ⚠** — הדוח לא מסנן ולא מתקן, רק מראה איפה המספר לא אמין.
const EXP_SUSPECT_MIN=120;    // דק' — סף מוחלט, מתחתיו לא מסמנים כלל
const EXP_SUSPECT_RATIO=3;    // וגם: הצפי גדול מפי-כך מהזמן שבפועל
function _expSuspect(actSec,expSec){return expSec>EXP_SUSPECT_MIN*60&&expSec>actSec*EXP_SUSPECT_RATIO;}
let _expProdRows=[];  // נבנה כאן ונקרא ב-exportCSV — כדי שה-CSV וההצגה לא יתפצלו לשתי נוסחאות
function buildExpectedByProduct(fl){
  const el=document.getElementById('rp-expprod-body');if(!el)return;
  _expProdRows=[];
  const done=fl.filter(t=>t.done);
  const openCnt=fl.length-done.length;
  if(!done.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">אין משימות שהושלמו בטווח</div>';return;}
  // פעם אחת על כל הקבוצה, לא פר-מוצר: כך סכום השורות שווה בדיוק ל"זמן כולל" שלמעלה
  const nd=normalizeBatchDurations(done);
  // ⏱️ דקות חלוקת העבודה יוצאות מהבפועל לפני ההשוואה לצפי.
  // 🛑 הן **אינן נזקפות למוצר אחר** — נמדד 18/09: 53% מהסריקות שבתוך משימה שייכות
  //    למוצר אחר מזה שהעובד עמד עליו. בספר הזמן הן דלי נפרד; רק בספר הכסף
  //    (calcCosts) הן נוחתות על המוצר שנסרק.
  const _epDed=scanDeductMap(done);
  const g={};
  done.forEach(t=>{
    const k=t.cust+'|'+t.prod;
    const r=g[k]||(g[k]={cust:t.cust,prod:t.prod,tasks:[],act:0,exp:0,over:0,under:0,noExp:0,noExpSec:0,susp:0,suspSec:0,suspList:[],scan:0,scanN:0});
    const s=nd[t.id]||0;
    r.tasks.push(t);r.act+=s;
    const e=(+t.expectedMin>0)?(+t.expectedMin)*60:0;
    if(!e){r.noExp++;r.noExpSec+=s;return;}
    // הניכוי לעולם לא גדול מהמשך המנורמל — nd עשוי להיות קטן מ-duration הגולמי
    const ded=Math.min(_epDed[t.id]||0,s);
    const sNet=s-ded;
    if(ded>0){r.scan+=ded;r.scanN++;}
    r.exp+=e;
    const d=sNet-e;if(d>0)r.over+=d;else r.under+=-d;
    if(_expSuspect(sNet,e)){r.susp++;r.suspSec+=(e-sNet);
      if(r.suspList.length<8)r.suspList.push((t.taskType||'—')+' — צפי '+fmtM(e)+' מול '+fmtM(sNet)+' בפועל');}
  });
  const H=s=>(s/3600).toFixed(1)+" שע'";
  const rows=Object.values(g).map(r=>{
    r.units=sumUnitsDedup(r.tasks);
    r.actExp=r.act-r.noExpSec-r.scan;       // הזמן שיש מולו צפי, פחות זמן חלוקת עבודה
    r.gap=r.over-r.under;                   // = actExp − exp, ולכן תמיד סוגר עם שתי העמודות
    r.eff=r.actExp>0?Math.round(r.exp/r.actExp*100):null;
    // ⚠️ הקיבוץ כאן הוא **לפי מוצר** (החלטת המשתמש), אבל `findProd` מחזיר תמיד את רשומת
    // המוצר החדשה — כלומר את שם ההזמנה האחרונה. שורה שמאגדת כמה הזמנות תציג שם של
    // הזמנה אחת, וזו בדיוק הטעות שדוח הרווח עשה. לכן סופרים חותמות ומסמנים במפורש.
    r.orders=new Set(r.tasks.map(t=>taskStampOf(t)||0)).size;
    r.name=findProd(r.cust,r.prod)?.name||'';
    return r;
  }).sort((a,b)=>b.act-a.act);
  _expProdRows=rows;
  const T2={act:0,exp:0,over:0,under:0,units:0,n:0,noExp:0,noExpSec:0,susp:0,suspSec:0,actExp:0,scan:0,scanN:0};
  rows.forEach(r=>{T2.act+=r.act;T2.exp+=r.exp;T2.over+=r.over;T2.under+=r.under;T2.units+=r.units;
    T2.n+=r.tasks.length;T2.noExp+=r.noExp;T2.noExpSec+=r.noExpSec;T2.susp+=r.susp;T2.suspSec+=r.suspSec;T2.actExp+=r.actExp;T2.scan+=r.scan;T2.scanN+=r.scanN;});
  const totGap=T2.over-T2.under,totEff=T2.actExp>0?Math.round(T2.exp/T2.actExp*100):null;
  const cell=(v,cls,ttl)=>`<td style="padding:7px 8px">${v?`<span class="badge ${cls}"${ttl?` title="${esc(ttl)}"`:''}>${v}</span>`:'<span style="color:var(--txt3)">—</span>'}</td>`;
  el.innerHTML=`
  <div class="g4" style="margin-bottom:.75rem">
    <div class="card" style="padding:.6rem .8rem"><div class="mlbl">צפי מצטבר</div><div class="mval" style="font-size:20px">${H(T2.exp)}</div></div>
    <div class="card" style="padding:.6rem .8rem"><div class="mlbl">▲ מעל הצפי</div><div class="mval" style="font-size:20px;color:var(--red)">${H(T2.over)}</div></div>
    <div class="card" style="padding:.6rem .8rem"><div class="mlbl">▼ מתחת לצפי</div><div class="mval" style="font-size:20px;color:var(--green)">${H(T2.under)}</div></div>
    <div class="card" style="padding:.6rem .8rem"><div class="mlbl">פער נטו</div><div class="mval" style="font-size:20px;color:${totGap>0?'var(--red)':'var(--green)'}">${totGap>0?'+':''}${H(totGap)}</div></div>
  </div>
  <div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:1px solid var(--b)">
      <th style="text-align:right;padding:6px 8px">מוצר</th>
      <th style="text-align:right;padding:6px 8px">משימות</th>
      <th style="text-align:right;padding:6px 8px">יחידות</th>
      <th style="text-align:right;padding:6px 8px">בפועל</th>
      <th style="text-align:right;padding:6px 8px" title="זמן שבעל המשימה הקדיש לסריקה עבור עובדים אחרים — הוצא מההשוואה לצפי">⇄ חלוקה</th>
      <th style="text-align:right;padding:6px 8px">צפי</th>
      <th style="text-align:right;padding:6px 8px">פער</th>
      <th style="text-align:right;padding:6px 8px">▲ מעל</th>
      <th style="text-align:right;padding:6px 8px">▼ מתחת</th>
      <th style="text-align:right;padding:6px 8px">יעילות</th>
    </tr></thead><tbody>
    ${rows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)${r.susp?';background:rgba(245,158,11,.07)':''}">
      <td style="padding:7px 8px;white-space:nowrap">
        <span class="bc-seg bc-c">${r.cust}</span> <span class="bc-seg bc-p">${r.prod}</span>
        ${r.name?`<span style="color:var(--txt2);font-size:12px"> ${esc(r.name)}</span>`:''}
        ${r.orders>1?`<span class="badge gray" style="font-size:9px" title="${esc('השורה מאגדת '+r.orders+' הזמנות של אותו מוצר. השם שמוצג הוא של רשומת המוצר החדשה ביותר.')}">${r.orders} הזמנות</span>`:''}
        ${r.susp?`<span class="badge amber" style="font-size:9px;font-weight:700" title="${esc('צפי חשוד — '+r.susp+" רשומות שהצפי שלהן מנופח ומזרים "+H(r.suspSec)+' חיסכון מדומה:\n'+r.suspList.join('\n'))}">⚠ ${r.susp} צפי חשוד</span>`:''}
      </td>
      <td style="padding:7px 8px">${r.tasks.length}${r.noExp?`<span class="badge gray" style="font-size:9px;margin-inline-start:4px" title="${esc(r.noExp+' משימות בלי צפי כלל ('+H(r.noExpSec)+') — לא נכנסו להשוואה')}">${r.noExp} בלי צפי</span>`:''}</td>
      <td style="padding:7px 8px">${r.units}</td>
      <td style="padding:7px 8px"><span class="badge blue">${H(r.act)}</span></td>
      ${cell(r.scan?H(r.scan):'','gray',r.scanN+' משימות שבהן בעל המשימה סרק עבור אחרים — הזמן הזה הוצא מההשוואה לצפי ואינו נזקף למוצר אחר')}
      ${cell(r.exp?H(r.exp):'','gray')}
      ${cell(r.exp?((r.gap>0?'+':'')+H(r.gap)):'',r.gap>0?'red':'green','פער = מעל פחות מתחת, על המשימות שיש להן צפי')}
      ${cell(r.over?H(r.over):'','red')}
      ${cell(r.under?H(r.under):'','green')}
      ${cell(r.eff!=null?r.eff+'%':'',r.eff==null?'gray':(r.eff>=100?'green':'red'),'יעילות = צפי חלקי בפועל. מעל 100% = מהר מהצפי')}
    </tr>`).join('')}
    </tbody>
    <tfoot><tr style="border-top:1.5px solid var(--b);font-weight:600;background:var(--bg2)">
      <td style="padding:8px 8px">סה"כ ${rows.length} מוצרים</td>
      <td style="padding:8px 8px">${T2.n}</td>
      <td style="padding:8px 8px">${T2.units}</td>
      <td style="padding:8px 8px"><span class="badge blue">${H(T2.act)}</span></td>
      <td style="padding:8px 8px">${T2.scan?`<span class="badge gray">${H(T2.scan)}</span>`:'<span style="color:var(--txt3)">—</span>'}</td>
      <td style="padding:8px 8px"><span class="badge gray">${H(T2.exp)}</span></td>
      <td style="padding:8px 8px"><span class="badge ${totGap>0?'red':'green'}">${totGap>0?'+':''}${H(totGap)}</span></td>
      <td style="padding:8px 8px"><span class="badge red">${H(T2.over)}</span></td>
      <td style="padding:8px 8px"><span class="badge green">${H(T2.under)}</span></td>
      <td style="padding:8px 8px"><span class="badge ${totEff!=null&&totEff>=100?'green':'red'}">${totEff!=null?totEff+'%':'—'}</span></td>
    </tr></tfoot>
  </table></div>
  <div style="font-size:11px;color:var(--txt3);margin-top:6px;line-height:1.6">
    בפועל = <b>duration</b> נקי (הפסקות, לילות והשהיות כבר מנוכים; סריקת אצווה נספרת פעם אחת).
    ההשוואה רצה רק על משימות שיש להן צפי.
    ${openCnt?`<br>${openCnt} משימות פעילות שטרם נסגרו אינן נספרות כאן.`:''}
    ${T2.noExp?`<br>${T2.noExp} משימות (${H(T2.noExpSec)}) בלי צפי כלל — נספרות ב"בפועל" ולא בהשוואה.`:''}
    ${T2.scan?`<br>⇄ <b>${H(T2.scan)}</b> ב-${T2.scanN} משימות הוקדשו לסריקה עבור עובדים אחרים (${scanMinPer()} דק' לסריקה) — הוצאו מההשוואה לצפי. הזמן הזה אינו נזקף כזמן ייצור לאף מוצר; העלות שלו נזקפת למוצר שנסרק.`:''}
    ${T2.susp?`<br><b style="color:var(--amber,#b45309)">⚠ ${T2.susp} רשומות עם צפי חשוד</b> מזרימות ${H(T2.suspSec)} של "חיסכון" מדומה. הצפי נצרב בסריקה ולא תוקן — השורות מסומנות בצהוב.`:''}
  </div>`;
}
// ─── לוח מצב הזמנות ──────────────────────────────────────────
// כמו buildStepQtyReport — טוען היסטוריה **מלאה** ומתעלם מטווח התאריכים של הדוחות
// במכוון: זהו מצב נוכחי מצטבר, ולא אמור "להיעלם" כשמסננים לשבוע. שני הדוחות קוראים
// לאותו loadHistRange('','') באותה קריאת buildRep ולכן חולקים את המטמון (30 שנ').
let _pipeRows=null;
let _pipeShip={from:null,to:''};   // from===null ⇒ טרם אותחל, נקבע ל-30 יום אחורה
function pipeShipRange(k,v){_pipeShip[k]=v;buildPipelineReport();}
async function buildPipelineReport(){
  const el=document.getElementById('rp-pipe-body');if(!el)return;
  const prods=S.products||[];
  if(!prods.length){el.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:8px">אין מוצרים</div>';return;}
  el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">⏳ טוען…</div>';
  const hist=await loadHistRange('','');
  if(!document.getElementById('page-reports')?.classList.contains('active'))return; // המשתמש עזב בזמן הטעינה
  // שיוך כל משימה להזמנה שלה — אותה נקודת אמת כמו דוח הכמות ודוח הרווח
  const byOrder={},oldCache={};
  for(const t of [...hist,...(S.activeTasks||[])]){
    const k=t.cust+'|'+t.prod+'|'+taskOrderStamp(t,oldCache);
    (byOrder[k]||(byOrder[k]=[])).push(t);
  }
  const rows=prods.map(p=>({p,st:pipeStateOf(p,byOrder[p.cust+'|'+p.prod+'|'+prodStampOf(p)]||[]),
                            entry:pipeEntryDate(p),ship:pipeShipDate(p)}));
  _pipeRows=rows;
  // "יצא ללקוח" — 30 יום אחורה כברירת מחדל, עם בוררי תאריך משלו.
  // ⚠️ הטווח נשמר ב-`_pipeShip` ולא נקרא מה-DOM: בקריאה הראשונה שדות התאריך עדיין לא
  // קיימים (הם נוצרים ב-innerHTML בסוף הפונקציה), ולכן ברירת המחדל נבלעה והוצגו כל 53.
  if(_pipeShip.from===null)_pipeShip.from=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const sFrom=_pipeShip.from||'',sTo=_pipeShip.to||'';
  const isMgr=S.user?.role==='manager';
  const B=(v,c)=>`<span class="badge ${c}">${v}</span>`;
  const prog=(f,lbl)=>!f?'':`<span class="badge ${f.full===f.of?'green':'gray'}" style="font-size:9px" title="${esc(lbl+': '+f.full+' מתוך '+f.of+' שלבים הגיעו לכמות המלאה'+(f.low&&f.low.length?'\nחסר: '+f.low.join(' · '):''))}">${lbl} ${f.full}/${f.of}</span>`;

  let hidden=0;
  const cols=PIPE_LISTS.map((L,li)=>{
    // ✂️ הזמנה מפוצלת (st.split) מופיעה בכל עמודה שיש בה ממנה יחידות, עם הכמות שם
    let list=rows.filter(r=>r.st.split?r.st.split[L.id]>0:r.st.id===L.id);
    const uOf=r=>r.st.split?r.st.split[L.id]:r.st.qty;
    if(L.id==='shipped'){
      const before=list.length;
      list=list.filter(r=>(!sFrom||(r.ship&&r.ship>=sFrom))&&(!sTo||(r.ship&&r.ship<=sTo)));
      hidden=before-list.length;
    }
    // סדר הכניסה למפעל — הוותיק ראשון. "יצא ללקוח" ממוין לפי תאריך היציאה, החדש ראשון.
    list.sort((a,b)=>L.id==='shipped'?String(b.ship).localeCompare(String(a.ship))
                                     :String(a.entry||'9999').localeCompare(String(b.entry||'9999')));
    const units=list.reduce((s,r)=>s+uOf(r),0);
    const estU=list.reduce((s,r)=>s+(r.st.qty?0:estQtyOf(r.p)),0); // 📏 הזמנות בלי כמות — המשוערת, בנפרד
    const cards=list.map(r=>{
      const p=r.p,st=r.st;
      const sp=!!st.split,spSew=sp&&L.id!==st.split.main; // spSew = עותק משני — בלי כפתורים
      // 🧾 תעודה שממתינה לסימון יציאה — בפיצול רק כשיש יחידות כאלה (לא "מוכן ליציאה" של הייצור עצמו)
      const shipHere=L.id==='ready_ship'&&st.shipped&&(!sp||st.outPend>0);
      const nxt=PIPE_LISTS[li+1];
      return `<div style="border:1px solid var(--b);border-radius:8px;padding:6px 8px;margin-bottom:6px;background:var(--bg)">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span class="bc-seg bc-c">${p.cust}</span><span class="bc-seg bc-p">${p.prod}</span>
          ${(parseInt(p.orderNo,10)||0)?`<span class="bc-seg" style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-weight:700">#${String(p.orderNo).padStart(3,'0')}</span>`:''}
          ${st.ov?`<span class="badge amber" style="font-size:9px" title="${esc('הועבר ידנית על ידי '+(st.ov.by||'—')+' ב-'+(st.ov.at||'').slice(0,10)+'. המצב האמיתי: '+(PIPE_LISTS[PIPE_IDX(st.nat)]?.label||st.nat))}">📌 ידני</span>`:''}
        </div>
        <div style="font-size:12px;color:var(--txt2);margin:2px 0">${esc(p.name||'—')}</div>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:10px;color:var(--txt3)">
          <span>${L.id==='shipped'?('יצא '+(r.ship||'—')):('נכנס '+(r.entry||'—'))}</span>
          <span>·</span><span>${st.qty?st.qty+" יח'":estQtyOf(p)?`<span style="color:var(--amber-txt,#b45309)" title="כמות משוערת — עד הספירה/גזירה">~${estQtyOf(p)} יח' משוער</span>`:'<span style="color:var(--red-txt)">אין כמות</span>'}</span>
          ${sp?`<span class="badge amber" style="font-size:9px" title="${esc('ההזמנה מחולקת: '+PIPE_LISTS.filter(x=>st.split[x.id]>0).map(x=>pipeShortLabel(x)+' '+st.split[x.id]).join(' · '))}">✂️ ${st.split[L.id]} מתוך ${st.qty}</span>`:''}
          ${prog(st.sew,'תפירה')}${prog(st.pack,'אריזה')}
          ${(()=>{ // השלבים שעוצרים את ההזמנה — על הכרטיס עצמו (גם בטלפון, בלי ריחוף). עד 3 + "עוד N"
            const f=['sewing','ready_pack'].includes(L.id)?st.sew:L.id==='packing'?st.pack:null;
            if(!f||!f.low||!f.low.length||f.low.length===f.of)return '';
            return `<div style="width:100%;font-size:10px;color:var(--amber-txt,#b45309)">⏳ ${esc(f.low.slice(0,3).join(' · '))}${f.low.length>3?' · +'+(f.low.length-3):''}</div>`;})()}
          ${shipHere?`<span class="badge blue" style="font-size:9px" title="${esc('הופקה תעודת משלוח '+(pipeDnDate(p)||'')+' — ממתין לסימון יציאה')}">🧾 תעודה הופקה</span>`:''}
        </div>
        ${(()=>{ // ⚠ חוסרים פתוחים — על הכרטיס, וכפתור לחלון החוסרים (מנהל/אחראי)
          const op=shortOpen(p);
          return (op.length?`<div style="font-size:10px;color:var(--red-txt);font-weight:600;margin-top:3px">⚠ ${esc(op.slice(0,2).map(x=>pipeShortLabel(PIPE_LISTS[x.st]||{})+': '+x.txt).join(' · '))}${op.length>2?' · +'+(op.length-2):''}</div>`:'')
            +(canShort()?`<div style="margin-top:3px"><button class="btn" style="font-size:10px;padding:2px 6px${op.length?';color:var(--red-txt);border-color:var(--red-txt)':''}" onclick="openShortages('${escj(p.id)}')">⚠ חוסרים${op.length?' ('+op.length+')':''}</button></div>`:'');})()}
        ${isMgr&&L.id==='shipped'&&p.departedAt?`<div style="margin-top:4px"><button class="btn" style="font-size:10px;padding:2px 6px" onclick="pipeDepart('${escj(p.id)}',false)" title="${esc('סומן ע״י '+(p.departedBy||'—'))}">↺ בטל יציאה</button></div>`:''}
        ${isMgr&&nxt&&L.id!=='shipped'&&(!spSew||shipHere)?`<div style="margin-top:4px;display:flex;gap:4px">
          ${shipHere
            ?`<button class="btn" style="font-size:10px;padding:2px 6px;white-space:nowrap" onclick="pipeDepart('${escj(p.id)}',true)" title="הסחורה יצאה פיזית מהמפעל">🚚 יצא ללקוח</button>`
            :`<button class="btn" style="font-size:10px;padding:2px 6px;white-space:nowrap" onclick="pipePush('${escj(p.id)}','${nxt.id}')" title="${esc('העבר ידנית ל'+nxt.label+' — לשימוש כשהמונה נתקע')}">➜ ${esc(pipeShortLabel(nxt))}</button>`}
          ${st.ov?`<button class="btn" style="font-size:10px;padding:2px 6px" onclick="pipePush('${escj(p.id)}','')">↺ בטל</button>`:''}
        </div>`:''}
      </div>`;
    }).join('')||'<div style="color:var(--txt3);font-size:11px;padding:6px 2px">—</div>';
    // עמודה ריקה מצטמצמת ל-110px — כך כל 8 הרשימות נכנסות למסך 1366 בלי גלילה כשחלקן ריקות,
    // והן נשארות גלויות (המשתמש צריך לראות ש"מוכן לאריזה" ריקה, לא שהיא נעלמה).
    return `<div style="flex:0 0 auto;width:${list.length?190:110}px;background:var(--bg2);border-radius:10px;padding:8px">
      <div style="font-size:12px;font-weight:700;margin-bottom:2px">${L.label}</div>
      <div style="font-size:10px;color:var(--txt3);margin-bottom:6px">${list.length} הזמנות · ${units} יח'${estU?` <span style="color:var(--amber-txt,#b45309)" title="כמות משוערת של הזמנות שעוד לא נספרו/נגזרו">+ ~${estU} משוער</span>`:''}<br>${esc(L.hint)}</div>
      ${cards}
    </div>`;
  }).join('');

  el.innerHTML=`
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--txt2)">
    <span>🚚 טווח "יצא ללקוח":</span>
    <input type="date" id="pipe-ship-from" value="${esc(sFrom)}" style="font-size:11px;width:auto" onchange="pipeShipRange('from',this.value)"/>
    <span>עד</span>
    <input type="date" id="pipe-ship-to" value="${esc(sTo)}" style="font-size:11px;width:auto" onchange="pipeShipRange('to',this.value)"/>
    <button class="btn" style="font-size:11px;padding:2px 8px" onclick="pipeShipAll()">הצג הכל</button>
    ${hidden?`<span style="color:var(--txt3)">(${hidden} הזמנות מחוץ לטווח)</span>`:''}
  </div>
  <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;align-items:flex-start">${cols}</div>
  <div style="font-size:11px;color:var(--txt3);margin-top:8px;line-height:1.6">
    המעבר בין הרשימות נקבע לפי <b>המחלקה שבה נסרקה המשימה</b>, הכמות בכרטיס וברקוד "יצא ללקוח" — לא לפי סימוני "דוח ייצור לפי שלב".
    <br>⚠️ <b>"מוכן לאריזה" ו"מוכן ליציאה" דורשים שכל שלבי המשפחה יגיעו לכמות המלאה.</b> בפועל שלבים מהירים וממוזגים לא תמיד נסרקים עד הסוף, ולכן הרשימות האלה כמעט תמיד ריקות והכרטיס קופץ ישירות לרשימה הבאה בסריקה. המונה <span class="badge gray" style="font-size:9px">תפירה 13/20</span> על כל כרטיס מראה את המצב האמיתי${isMgr?', והכפתור ➜ דוחף ידנית קדימה כשנתקע':''}.
  </div>`;
}
// להדפסה הלוח נפרש לטבלה אחת ולא כעמודות flex — כרום שובר עמודות flex בין דפים
// (אותה משפחת בעיות כמו break-inside:avoid על CSS grid, ראה gotcha ההדפסה).
function pipePrintHtml(){
  if(!_pipeRows)return '<div>הדוח טרם נטען</div>';
  const sFrom=_pipeShip.from||'',sTo=_pipeShip.to||'';
  let out='';
  for(const L of PIPE_LISTS){
    let list=_pipeRows.filter(r=>r.st.id===L.id);
    if(L.id==='shipped')list=list.filter(r=>(!sFrom||(r.ship&&r.ship>=sFrom))&&(!sTo||(r.ship&&r.ship<=sTo)));
    list.sort((a,b)=>L.id==='shipped'?String(b.ship).localeCompare(String(a.ship))
                                     :String(a.entry||'9999').localeCompare(String(b.entry||'9999')));
    const units=list.reduce((s,r)=>s+r.st.qty,0);
    out+=`<div style="margin-top:10px"><div style="font-weight:700;font-size:13px">${L.label} — ${list.length} הזמנות · ${units} יח'</div>`;
    out+=list.length?`<table><thead><tr><th>לקוח / מוצר</th><th>שם</th><th>${L.id==='shipped'?'יצא':'נכנס'}</th><th>יח'</th><th>תפירה</th><th>אריזה</th></tr></thead><tbody>${
      list.map(r=>`<tr><td>${r.p.cust} / ${r.p.prod}${(parseInt(r.p.orderNo,10)||0)?' #'+String(r.p.orderNo).padStart(3,'0'):''}${r.st.ov?' 📌':''}</td>
        <td>${esc(r.p.name||'—')}</td><td>${(L.id==='shipped'?r.ship:r.entry)||'—'}</td><td>${r.st.qty||'—'}</td>
        <td>${r.st.sew?r.st.sew.full+'/'+r.st.sew.of:'—'}</td><td>${r.st.pack?r.st.pack.full+'/'+r.st.pack.of:'—'}</td></tr>`).join('')
    }</tbody></table>`:'<div style="font-size:11px;color:#666">—</div>';
    out+='</div>';
  }
  return out;
}
function pipeShipAll(){_pipeShip={from:'',to:''};buildPipelineReport();}
// ─── ⚠ הערות חוסרים לפי שלב (25/10/2026) ────────────────────────
// products.shortages = [{id, st, txt, at, by, byName, res, resBy}] — st = אינדקס השלב ב-PIPE_LISTS (0 כניסה … 7 יצא),
// res = מתי סומן "נפתר" (0 = פתוח). נכתב ע"י מנהל/אחראי מלוח מצב הזמנות; מחיקה — מנהל. מוצג ללקוח בדף המעקב
// (customerTrack ⇒ short): שלב עם חוסר פתוח אדום (גם שלב עתידי), שלב שעבר ירוק, השלב הנוכחי כחול.
// customerNotify שולח ללקוח התראה על חוסר חדש. מערך ⇒ fbSet מחליף אותו כולו (מחיקה נשמרת).
const canShort=()=>['manager','supervisor'].includes(S.user?.role);
const shortList=p=>Array.isArray(p?.shortages)?p.shortages.filter(x=>x&&x.txt):[];
const shortOpen=p=>shortList(p).filter(x=>!x.res);
async function _shortSave(p,list){
  p.shortages=list;saveLS();
  if(S.fbConnected){try{await fbSet('products',p.id,{shortages:list});}catch(e){showToast('שמירה נכשלה: '+e.message,'var(--red-txt)',6000);return false;}}
  try{buildPipelineReport();}catch(e){}
  return true;
}
function openShortages(pid){
  if(!canShort())return;
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p)return;
  document.getElementById('shrt-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='shrt-wrap';wrap.dataset.pid=p.id;
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:16px;overflow-y:auto';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  document.body.appendChild(wrap);
  renderShortages();
}
function renderShortages(){
  const wrap=document.getElementById('shrt-wrap');if(!wrap)return;
  const p=(S.products||[]).find(x=>String(x.id)===String(wrap.dataset.pid));if(!p){wrap.remove();return;}
  const mgr=S.user?.role==='manager';
  // השלב הנוכחי — מהרינדור האחרון של הלוח (_pipeRows מחושב שם עם המשימות של ההזמנה בלבד)
  const cur=Math.max(0,PIPE_IDX((_pipeRows||[]).find(r=>String(r.p.id)===String(p.id))?.st?.id||'intake'));
  const fmt=ms=>{const d=new Date(+ms);return pad2(d.getDate())+'/'+pad2(d.getMonth()+1);};
  const list=shortList(p).slice().sort((a,b)=>(!!a.res-!!b.res)||(b.at-a.at));
  const inp='font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:440px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:16px;font-weight:800">⚠ חוסרים — ${esc(p.cust)}/${esc(p.prod)}${(parseInt(p.orderNo,10)||0)?' #'+String(p.orderNo).padStart(3,'0'):''}</div>
      <button class="btn" style="font-size:12px;padding:4px 10px" onclick="document.getElementById('shrt-wrap')?.remove()">✕</button>
    </div>
    <div style="font-size:12px;color:var(--txt3);margin:2px 0 10px">${esc(p.name||'')} · הלקוח רואה את ההערות בדף המעקב, והשלב נצבע באדום עד שמסמנים "נפתר".</div>
    ${list.length?list.map(x=>`<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--brd);font-size:13px;${x.res?'color:var(--txt3)':''}">
      <div style="flex:1"><b style="color:${x.res?'var(--txt3)':'var(--red-txt)'}">${x.res?'✓':'⚠'} ${esc(pipeShortLabel(PIPE_LISTS[x.st]||{})||'')}</b> — ${esc(x.txt)}
        <div style="font-size:11px;color:var(--txt3)">${fmt(x.at)} · ${esc(x.byName||'')}${x.res?' · נפתר '+fmt(x.res)+(x.resBy?' · '+esc(x.resBy):''):''}</div></div>
      ${x.res?'':`<button class="btn" style="font-size:11px;padding:3px 8px;color:var(--green-txt)" onclick="shortResolve('${escj(x.id)}')">✅ נפתר</button>`}
      ${mgr?`<button class="btn" style="font-size:11px;padding:3px 7px" onclick="shortDel('${escj(x.id)}')">🗑</button>`:''}
    </div>`).join(''):'<div style="font-size:12px;color:var(--txt3);padding:6px 0;border-top:1px solid var(--brd)">אין הערות חוסרים להזמנה הזו.</div>'}
    <div style="margin-top:10px;border:1px solid var(--brd);border-radius:10px;padding:10px">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px">➕ חוסר חדש</div>
      <select id="shrt-st" style="${inp};width:100%">${PIPE_LISTS.map((L,i)=>`<option value="${i}"${i===cur?' selected':''}>${esc(L.label)}${i===cur?' (השלב הנוכחי)':''}</option>`).join('')}</select>
      <input id="shrt-txt" maxlength="160" placeholder="מה חסר — למשל: חסרים כפתורים במידה 3" style="${inp};width:100%;margin-top:6px" onkeydown="if(event.key==='Enter')shortAdd()"/>
      <button class="btn primary" style="width:100%;margin-top:8px;font-size:14px" onclick="shortAdd()">💾 הוסף</button>
    </div>
  </div>`;
}
const _shortP=()=>(S.products||[]).find(x=>String(x.id)===String(document.getElementById('shrt-wrap')?.dataset.pid));
async function shortAdd(){
  const p=_shortP();if(!p||!canShort())return;
  const txt=(document.getElementById('shrt-txt')?.value||'').trim();
  if(!txt){alert('כתוב מה חסר');return;}
  const st=Math.max(0,Math.min(PIPE_LISTS.length-1,parseInt(document.getElementById('shrt-st')?.value,10)||0));
  const x={id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),st,txt,at:Date.now(),by:S.user?.id||'',byName:S.user?.name||'',res:0};
  if(await _shortSave(p,shortList(p).concat([x]))){showToast('⚠ החוסר נרשם');renderShortages();}
}
async function shortResolve(id){
  const p=_shortP();if(!p||!canShort())return;
  if(await _shortSave(p,shortList(p).map(x=>x.id===id?{...x,res:Date.now(),resBy:S.user?.name||''}:x))){showToast('✅ סומן כנפתר');renderShortages();}
}
async function shortDel(id){
  const p=_shortP();if(!p||S.user?.role!=='manager')return;
  if(!await showConfirm('מחיקת הערה','למחוק את הערת החוסר? (עדיף "נפתר" — כך נשארת היסטוריה)','מחק','ביטול'))return;
  if(await _shortSave(p,shortList(p).filter(x=>x.id!==id)))renderShortages();
}
// 📌 דחיפה ידנית קדימה. list ריק = ביטול. נשמר על מסמך המוצר בשדה pipeOverride.
async function pipePush(pid,list){
  if(S.user?.role!=='manager')return;
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p)return;
  const L=PIPE_LISTS[PIPE_IDX(list)];
  const ok=await showConfirm(list?'העברה ידנית':'ביטול העברה ידנית',
    list?`להעביר את ${p.cust}/${p.prod} לרשימת "${L.label}"?\n\nההעברה היא סימון ידני בלבד — היא לא משנה משימות, כמויות או זמנים, והיא נבלעת מאליה ברגע שהסריקות עוקפות אותה.`
        :`לבטל את ההעברה הידנית של ${p.cust}/${p.prod} ולהחזיר אותו לרשימה לפי הסריקות?`);
  if(!ok)return; // ⚠️ showConfirm מחזיר false גם בלחיצה על הרקע — לכן היציאה, לא ענף אחר
  // ⚠️ הביטול כותב `null` ולא מוחק את השדה: `fbSet`=setDoc(merge:true) לא מוחק מפתחות,
  // ו-`deleteField` לא מיוצא ב-`window._fb`. הקורא בודק truthiness ⇒ `null` מתנהג כמו היעדר.
  p.pipeOverride=list?{list,at:new Date().toISOString(),by:S.user?.name||''}:null;
  saveLS();
  if(S.fbConnected){
    try{await fbSet('products',p.id,{pipeOverride:p.pipeOverride});}
    catch(e){showToast('שמירה נכשלה: '+e.message,'var(--red-txt)',6000);return;}
  }
  showToast(list?('הועבר ל'+L.label):'ההעברה הידנית בוטלה','var(--green-txt)',3000);
  await buildPipelineReport();
}
// 🚚 סימון יציאה פיזית מהמפעל (10/10/2026) — הפקת תעודה בלבד משאירה ב"מוכן ליציאה". on=false = ביטול.
// ⚠️ null ולא מחיקה — אותו נימוק כמו ב-pipePush (fbSet ממזג)
async function pipeDepart(pid,on){
  if(S.user?.role!=='manager')return;
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p)return;
  // כמה תעודות ממתינות לסימון (A251: 0710 יצאה, 0711 עוד במפעל) ⇒ בחירה: רק הישנה או כולן.
  // "רק הישנה" = departedAt על מועד התעודה הזו — יציאה נקבעת פר תעודה לפי at ≤ departedAt (pipeStateOf)
  let cut=on?new Date().toISOString():null;
  const depT=p.departedAt?Date.parse(p.departedAt):NaN;
  const pend=on?prodShipments(p).filter(s=>{const d=String(s.date||'').slice(0,10);if(d&&d<PIPE_DEPART_FROM)return false;return isNaN(depT)||_shipAtMs(s)>depT;})
    .sort((a,b)=>(_shipAtMs(a)||0)-(_shipAtMs(b)||0)):[];
  if(pend.length>1&&!isNaN(_shipAtMs(pend[0]))){
    const u=s=>(+s.total||0)+shUnsewn(s),no=s=>String(s.no||'').padStart(4,'0');
    const c=await showConfirm3('יצא ללקוח',`ל-${p.cust}/${p.prod} ${p.name||''} יש ${pend.length} תעודות שעוד לא סומנו כיציאה. מה יצא מהמפעל?`,
      `🚚 רק תעודה ${no(pend[0])} (${u(pend[0])} יח')`,`🚚 כל ${pend.length} התעודות (${pend.reduce((t,s)=>t+u(s),0)} יח')`,'ביטול');
    if(c!==0&&c!==1)return;
    if(c===0)cut=new Date(_shipAtMs(pend[0])).toISOString();
  }else{
    const ok=await showConfirm(on?'יצא ללקוח':'ביטול יציאה',
      on?`לסמן ש-${p.cust}/${p.prod} ${p.name||''} יצא מהמפעל?\n\nהלקוח יראה "נשלח" בדף המעקב.`
        :`לבטל את סימון היציאה של ${p.cust}/${p.prod}? ההזמנה תחזור ל"מוכן ליציאה".`);
    if(!ok)return;
  }
  p.departedAt=cut;
  p.departedBy=on?(S.user?.name||''):null;
  saveLS();
  if(S.fbConnected){
    try{await fbSet('products',p.id,{departedAt:p.departedAt,departedBy:p.departedBy});}
    catch(e){showToast('שמירה נכשלה: '+e.message,'var(--red-txt)',6000);return;}
  }
  showToast(on?'🚚 סומן: יצא ללקוח':'↺ סימון היציאה בוטל','var(--green-txt)',3000);
  await buildPipelineReport();
}
// ✔ סימון ידני "השלב גמור" (18/10/2026) — כשלא כל הברקודים של השלב נסרקו וההזמנה נתקעת בלוח.
// products.stepMarks = [{n:שם שלב, by, at}] — רשומת ההזמנה בלבד. נחשב כ"כל הכמות" בלוח מצב הזמנות,
// בדף הלקוח (trackStates בשרת) ובדוח "כמות שהושלמה לפי שלב". לא נוגע במשימות/בשכר/בזמנים.
const stepMarkOf=(p,nm)=>(p?.stepMarks||[]).find(m=>m&&m.n===String(nm||'').trim())||null;
async function stepMark(pid,nm,on){
  if(S.user?.role!=='manager')return;
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p)return;
  nm=String(nm||'').trim();if(!nm)return;
  const ok=await showConfirm(on?'סימון שלב כגמור':'ביטול סימון',
    on?`לסמן את השלב "${nm}" ב-${p.cust}/${p.prod} כגמור לכל הכמות (${_prodQty(p)} יח')?\n\nלשימוש כשהשלב הסתיים בפועל אבל לא כל הברקודים נסרקו. לא משנה משימות, שכר או זמנים.`
      :`לבטל את הסימון הידני של "${nm}"? השלב יחזור לכמות שנסרקה בפועל.`);
  if(!ok)return;
  const rest=(p.stepMarks||[]).filter(m=>m&&m.n!==nm);
  p.stepMarks=on?rest.concat([{n:nm,by:S.user?.name||'',at:new Date().toISOString()}]):rest;
  saveLS();
  if(S.fbConnected){
    try{await fbSet('products',p.id,{stepMarks:p.stepMarks});}
    catch(e){showToast('שמירה נכשלה: '+e.message,'var(--red-txt)',6000);return;}
  }
  showToast(on?'✔ השלב סומן כגמור':'↺ הסימון בוטל','var(--green-txt)',3000);
  buildStepQtyReport(document.getElementById('rf-c')?.value||'',document.getElementById('rf-p')?.value||'');
  await buildPipelineReport();
}
// 📅 (13/11/2026, בקשת המשתמש) רק מוצרים עם פעילות ב-14 הימים האחרונים (שבועיים); יותר — בבורר "מ-" בכרטיס.
// פעילות = השלב האחרון שסומן או תאריך פתיחת המוצר (המאוחר מביניהם). ריק = הכל.
const STAGE_REP_DAYS=14;
let _stgFrom=null; // null ⇒ טרם אותחל ⇒ היום פחות STAGE_REP_DAYS
function stageRepFrom(v){_stgFrom=v||'';buildStageReport();}
function _ymd(ms){const d=new Date(ms);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function buildStageReport(){
  const T=LANGS[currentLang];
  const el=document.getElementById('rp-stages-body');if(!el)return;
  if(_stgFrom===null)_stgFrom=_ymd(Date.now()-STAGE_REP_DAYS*864e5);
  const actOf=p=>{let a=prodStampOf(p)?_ymd(prodStampOf(p)):'';(p.stageLog||[]).forEach(e=>{const d=String(e.date||'').slice(0,10);if(d>a)a=d;});return a;};
  const all=S.products||[];
  const prods=_stgFrom?all.filter(p=>actOf(p)>=_stgFrom):all;
  const hidden=all.length-prods.length;
  const bar=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:var(--txt2)">
    📅 פעילות מ-<input type="date" value="${_stgFrom||''}" onchange="stageRepFrom(this.value)" style="width:auto;padding:4px 6px;font-size:12px">
    ${hidden?`<span style="color:var(--txt3)">(${hidden} מוצרים ישנים יותר מוסתרים)</span>`:''}
    ${_stgFrom?`<button class="btn" style="padding:3px 8px;font-size:11px" onclick="stageRepFrom('')">הצג הכל</button>`:`<button class="btn" style="padding:3px 8px;font-size:11px" onclick="_stgFrom=null;buildStageReport()">${STAGE_REP_DAYS} יום אחרונים</button>`}
  </div>`;
  if(!prods.length){el.innerHTML=bar+'<div style="color:var(--txt3);font-size:13px;padding:8px">אין מוצרים בטווח</div>';return;}
  // לכל מוצר — מצא את השלב האחרון שהושלם
  const rows=prods.map(p=>{
    const log=p.stageLog||[];
    // השלב הנוכחי = המתקדם ביותר לפי סדר PROD_STAGES (עמיד לסימון אוטומטי לא-מסודר)
    let cur=null,curIdx=-1;
    log.forEach(e=>{const i=PROD_STAGES.findIndex(s=>s.id===e.id);if(i>=curIdx){curIdx=i;cur=e;}});
    const lastStage=cur?PROD_STAGES.find(s=>s.id===cur.id):null;
    const lastDate=cur?cur.date:'—';
    const isAuto=!!cur?.auto;
    const totalStages=PROD_STAGES.filter(s=>!p.stageSkipped?.includes(s.id)).length;
    const doneStages=log.length;
    const pct=totalStages?Math.round(doneStages/totalStages*100):0;
    const isDone=lastStage?.id===PROD_STAGES[PROD_STAGES.length-1].id;
    // מפתח מיון: 0=יצא מהמפעל, 1=בתהליך (מתקדם קודם), 2=טרם התחיל
    const grp=isDone?0:doneStages>0?1:2;
    return{grp,curIdx,pct,html:`<tr>
      <td><span class="bc-seg bc-c">${p.cust}</span> <span class="bc-seg bc-p">${p.prod}</span></td>
      <td style="font-size:13px">${esc(p.name||'—')}</td>
      <td>${lastStage?esc(lastStage.label):'טרם התחיל'}${isAuto?' <span title="עודכן אוטומטית מסריקת עובד" style="font-size:10px">🤖</span>':''}</td>
      <td>${lastDate}</td>
      <td style="min-width:120px">
        <div style="background:var(--bg2);border-radius:4px;height:8px;overflow:hidden">
          <div style="background:${isDone?'var(--green)':'var(--blue)'};width:${pct}%;height:100%;border-radius:4px;transition:width .3s"></div>
        </div>
        <div style="font-size:10px;color:var(--txt3);margin-top:2px">${doneStages}/${totalStages} שלבים (${pct}%)</div>
      </td>
      <td><span class="badge ${isDone?'green':doneStages>0?'blue':'red'}">${isDone?T.completed:doneStages>0?T.status_in_progress:T.status_not_started}</span></td>
    </tr>`};
  }).sort((a,b)=>a.grp-b.grp||b.curIdx-a.curIdx||b.pct-a.pct).map(r=>r.html).join('');
  el.innerHTML=bar+`<div class="tbl-wrap"><table>
    <thead><tr><th>לקוח / מוצר</th><th>שם</th><th>שלב נוכחי</th><th>תאריך</th><th>התקדמות</th><th>סטטוס</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
// כמות שהושלמה לכל שלב עבודה (מהתמחור) מול הכמות שהוזמנה — לכל מוצר. טוען היסטוריה מלאה (לא תלוי בטווח התאריכים של הדוחות)
// כי התקדמות ייצור מצטברת ולא אמורה "להיעלם" כשמסננים לטווח קצר.
async function buildStepQtyReport(cf,pf){
  const el=document.getElementById('rp-stepqty-body');if(!el)return;
  // 🎯 (13/11/2026, בקשת המשתמש) רק המוצר שנבחר בבורר "כל המוצרים" בראש הדף. עד היום הוצגו כל המוצרים,
  // וכל הצגה קראה את **כל** היסטוריית המשימות (~12,600 מסמכים, שוב כל 30 שנ' כשהלשונית פתוחה).
  // עכשיו רק משימות המוצר (loadHistProd — שאילתה על prod).
  if(!pf){el.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:8px">בחר מוצר בבורר "כל המוצרים" בראש הדף כדי לראות כמה הושלם בכל שלב.</div>';return;}
  // מכבד את בוררי לקוח/מוצר של לשונית הדוחות (טווח תאריכים במכוון לא — התקדמות מצטברת)
  const prods=S.products.filter(p=>(p.workSteps||[]).some(s=>stepName(s))&&(!cf||p.cust===cf)&&(!pf||p.prod===pf));
  if(!prods.length){el.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:8px">אין מוצרים עם שלבי עבודה מוגדרים</div>';return;}
  el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">⏳ טוען…</div>';
  const hist=await loadHistProd(pf);
  const dm=stepDoneMap(hist),isMgr=S.user?.role==='manager';
  const cards=prods.map(p=>{
    const steps=(p.workSteps||[]).map(s=>stepName(s)).filter(Boolean);
    // ⚠️ פר-רשומה. getTotalQty מחזיר תמיד את ההזמנה **החדשה** ⇒ כרטיס של הזמנה א' הציג
    // את הסכום של הזמנה ב', וכשלחדשה אין quantities הוא נפל ל-_bcLastGen — שארית בזיכרון
    // מהברקוד האחרון שהופק בדפדפן. ככה הוצג "סה״כ 1 יח'" ל-180 יחידות ב-02691 (24/08).
    const total=_prodQty(p);
    const rows=steps.map(stepNm=>{
      // תקרה בתצוגה (החלטת המשתמש 26/08): שלב לא יציג יותר מהכמות שהוזמנה. נדרש כי
      // `taskUnits` של ברקוד "כל הכמות" בן 13 ספרות מחזיר orderNo=0 ⇒ הכמות נקראת
      // מהרשומה החדשה. נמדד: 02691 #001 הציג 265 על הזמנה של 180.
      const raw=dm[stepDoneKey(p.cust,p.prod,stepNm,prodStampOf(p))]||0;
      const mk=stepMarkOf(p,stepNm); // ✔ סומן ידנית כגמור ⇒ כל הכמות
      const done=total?(mk?total:Math.min(raw,total)):raw;
      const pct=total?Math.min(100,Math.round(done/total*100)):0;
      return{stepNm,done,pct,mk,raw};
    });
    const anyProgress=rows.some(r=>r.done>0);
    return{p,total,rows,anyProgress};
  }).sort((a,b)=>(b.anyProgress?1:0)-(a.anyProgress?1:0));
  if(!document.getElementById('page-reports')?.classList.contains('active'))return; // המשתמש עזב את הדף בזמן הטעינה
  el.innerHTML=cards.map(c=>`
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px"><span class="bc-seg bc-c">${c.p.cust}</span> <span class="bc-seg bc-p">${c.p.prod}</span>${(parseInt(c.p.orderNo,10)||0)?` <span class="bc-seg" style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-weight:700">הזמנה #${String(c.p.orderNo).padStart(3,'0')}</span>`:''} ${esc(c.p.name||'')} <span style="color:var(--txt3);font-weight:400">(סה"כ ${c.total||'?'} יח')</span></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>שלב</th><th>בוצע</th><th>התקדמות</th>${isMgr?'<th></th>':''}</tr></thead>
        <tbody>${c.rows.map(r=>`<tr>
          <td style="font-size:12px">${esc(r.stepNm)}</td>
          <td>${r.done}${c.total?'/'+c.total:''}${r.mk?`<div style="font-size:10px;color:var(--txt3)" title="${esc('נסרקו בפועל '+Math.min(r.raw,c.total||r.raw)+' · סומן ע״י '+(r.mk.by||'—')+' ב-'+String(r.mk.at||'').slice(0,10))}">✔ סומן ידנית</div>`:''}</td>
          <td style="min-width:140px">
            ${c.total?`<div style="background:var(--bg2);border-radius:4px;height:8px;overflow:hidden">
              <div style="background:${r.pct>=100?'var(--green)':'var(--blue)'};width:${r.pct}%;height:100%;border-radius:4px"></div>
            </div>
            <div style="font-size:10px;color:var(--txt3);margin-top:2px">${r.pct}%</div>`:'<span style="color:var(--txt3);font-size:11px">אין כמות מוגדרת</span>'}
          </td>
          ${isMgr?`<td style="white-space:nowrap">${r.mk?`<button class="btn" style="font-size:10px;padding:2px 6px" onclick="stepMark('${escj(c.p.id)}','${escj(r.stepNm)}',false)">↺ בטל סימון</button>`
            :c.total&&r.pct<100?`<button class="btn" style="font-size:10px;padding:2px 6px" onclick="stepMark('${escj(c.p.id)}','${escj(r.stepNm)}',true)" title="השלב הסתיים בפועל אבל לא כל הברקודים נסרקו">✔ סמן כגמור</button>`:''}</td>`:''}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`).join('');
}
// ─── תמחור שלב ה': דוחות מוקצב מול בפועל + רווח מול יעד ─────
// מנהל בלבד: החישוב דורש שכר עובדים מ-adminSettings/costs שאחראי לא רשאי לקרוא.
function _pricingCtx(){
  if(S.user?.role!=='manager')return null;
  const oh=overheadBreakdown().perHour;
  const rated=_costWorkers().filter(w=>S.costs.workerRates[w.id]);
  if(!rated.length&&!oh)return null;
  const avgAll=rated.length?rated.reduce((s,w)=>s+loadedHourlyRate(w.id),0)/rated.length:0;
  return{oh,avgAll,weights:S.costs.difficultyWeights||{1:1,2:1.5,3:2,4:2.5,5:3.5}};
}
// ⚠️ שתי שיטות לחלק את תקציב היחידה בין השלבים. איזו פועלת נקבע לפי סוג התמחור:
//
// • **כל השלבים ידניים** → כל שלב מקבל את **חלקו היחסי בזמן**: `תקציב × (דקות השלב ÷ סה"כ דקות)`.
//   הדקות שהוזנו הן משקל יחסי, לא תקן מוחלט; הכסף שנגזר מהן מומר חזרה לדקות **לפי תעריף
//   העובד**, ולכן הצפי תלוי בשכר בדיוק כמו במסלול האוטומטי. הסכום מתכנס בדיוק לתקציב.
//   (14717: `قص` 0.2 מתוך 17.4 = 1.15% ⇒ ₪5.44×1.15% = ₪0.0625)
//   ⚠️ המשמעות: `Σ ils` שווה תמיד ל-`budgetUnit`, ולכן "רווח בפועל" המחושב ממנו יוצא תמיד
//   שווה ליעד. מי שרוצה את בדיקת השפיות "האם הזמנים מחזיקים את המחיר" חייב לחשב אותה
//   בנפרד מ-`Σ דקות×תעריף` — ראה `manualCheckCost` בפאנל התמחור.
//
// • **יש לפחות שלב אוטומטי אחד** → ההתנהגות הישנה: ידני = דקות×תעריף, ועלותו יורדת מהתקציב
//   לפני שהשאר מתחלק לאוטומטיים לפי משקל קושי. במפעל 339 שלבים ידניים מול 2 אוטומטיים,
//   ולכן זה נתיב נדיר שנשאר כמו שהיה **בכוונה** — אין כלל מובן מאליו לערבוב השניים.
//
// mins/levels/rates מקבילים באינדקס. משותף ל-_prodBudget, לפאנל התמחור ולדוח היעילות.
function splitStepBudget(mins,levels,rates,budgetUnit,weights){
  const allManual=mins.length>0&&mins.every(m=>m>0);
  const totMin=mins.reduce((s,m)=>s+(m>0?m:0),0);
  if(allManual&&totMin>0&&budgetUnit>0){
    return mins.map((m,i)=>{const ils=budgetUnit*(m/totMin);return{ils,min:rates[i]>0?ils/rates[i]*60:0,typed:m,prop:m/totMin};});
  }
  const totW=levels.reduce((s,l,i)=>s+((l&&!(mins[i]>0))?(+weights[l]||1):0),0);
  const manualCost=mins.reduce((t,m,i)=>m>0?t+m/60*rates[i]:t,0);
  const autoBudget=Math.max(budgetUnit-manualCost,0);
  return mins.map((m,i)=>{
    if(m>0)return{ils:m/60*rates[i],min:m,typed:m,prop:0};
    const ils=totW>0?autoBudget*(+weights[levels[i]]||1)/totW:0;
    return{ils,min:rates[i]>0?ils/rates[i]*60:0,typed:0,prop:0};
  });
}
function _prodBudget(p,ctx){
  const price=+p.unitPrice||0;if(!price)return null;
  const priced=(p.workSteps||[]).filter(s=>stepLevel(s)||stepManualMin(s)>0);if(!priced.length)return null;
  // ✂ הפרדת הגזירה מהתפירה (30/08): שלבי ✂ **יוצאים מ-`lvl`** ולכן אינם מקבלים עוד נתח
  // מתקציב התפירה. עד היום הם קיבלו 0.5%–5.9% ממנו (ממוצע 3.3%) **וגם** תקציב גזירה
  // משלהם = כפל תשלום. `lvl` הוא מעכשיו "שלבי תפירה בלבד", וכל הצרכנים שמאנדקסים אותו
  // (דוח היעילות, דוח בפועל-מול-צפי) נעשים אוטומטית נכונים מול `unitPrice`.
  // ⚠️ המשמעות: הצפי של שלבי התפירה **עולה** ב-~3.3% — אותו תקציב, פחות שלבים.
  const lvl=priced.filter(s=>!stepIsCut(s));
  const cutLvl=priced.filter(s=>stepIsCut(s));
  const budgetUnit=price*(1-(+p.targetProfitPct||0)/100)-(+p.directMaterialsCost||0);
  // רק שלבים אוטומטיים (קושי בלי override ידני) מתחלקים את התקציב לפי משקל
  const totW=lvl.filter(s=>stepLevel(s)&&!(stepManualMin(s)>0)).reduce((s,x)=>s+(+ctx.weights[stepLevel(x)]||1),0);
  const rates=lvl.map(s=>_pricingStepRate(stepStationKeys(s),stepLevel(s),ctx.avgAll)+ctx.oh);
  const mins=lvl.map(s=>stepManualMin(s));
  const allManual=mins.length>0&&mins.every(m=>m>0);
  const manualCost=lvl.reduce((t,s,i)=>stepManualMin(s)>0?t+stepManualMin(s)/60*rates[i]:t,0);
  const autoBudget=Math.max(budgetUnit-manualCost,0);
  const stepBud=splitStepBudget(mins,lvl.map(s=>stepLevel(s)),rates,budgetUnit,ctx.weights);
  const budMinUnit=stepBud.reduce((t,b)=>t+b.min,0);
  // ⏱ הזמן **שהוזן** ליחידה (24/10/2026) — הדקות שהוקלדו לשלבים (שלב בלי דקות — הנגזר), בדיוק
  // "סה"כ זמן שהוזן ליחידה" בחלון המוצר. budMinUnit = הזמן **שהתקציב מאפשר** בעלות שעה ממוצעת.
  const plannedMinUnit=stepBud.reduce((t,b)=>t+(b.typed>0?b.typed:b.min),0);
  const budCostUnit=(+p.directMaterialsCost||0)+stepBud.reduce((t,b)=>t+b.ils,0);
  // ✂ הגזירה מתומחרת בנפרד ממחיר המכירה: `cutPrice` הוא הכנסה נוספת ליחידה, **ואחוז רווח
  // היעד שלה נפרד** (`cutProfitPct`) — עיסוק אחר, מרווח אחר. ראה cutProfitPctOf.
  // שמות שלבי הגזירה נלקחים מ-`p.workSteps` **המלא** ולא מ-`cutLvl`, כי שלב גזירה עשוי לא
  // לשאת רמת קושי או דקות ידניות ובכל זאת נסרק ונמדד בדוח.
  // תקציב הגזירה מתחלק בין שלבי ה-✂ **לפי הדקות שהוזנו** — אותו splitStepBudget של התפירה.
  // 🛑 זה עדיין לא נותן `expectedMin` פר-משימת גזירה: הגזירה נסרקת בברקוד ספירה ללא כמות
  // (13 מ-19 המשימות `qty=0`), ואין במה להכפיל. המדידה נשארת ברמת ההזמנה ב-buildCutReport.
  const cutPrice=+p.cutPrice||0;
  const cutPct=cutProfitPctOf(p);
  const cutNames=(p.workSteps||[]).filter(s=>stepIsCut(s)).map(s=>stepName(s)).filter(Boolean);
  const cutBudgetUnit=cutPrice>0?cutPrice*(1-cutPct/100):0;
  const cutRates=cutLvl.map(s=>_pricingStepRate(stepStationKeys(s),stepLevel(s),ctx.avgAll)+ctx.oh);
  const cutStepBud=splitStepBudget(cutLvl.map(s=>stepManualMin(s)),cutLvl.map(s=>stepLevel(s)),cutRates,cutBudgetUnit,ctx.weights);
  const cutMinUnit=cutStepBud.reduce((t,b)=>t+b.min,0);
  const cutCostUnit=cutStepBud.reduce((t,b)=>t+b.ils,0);
  return{price,budgetUnit,autoBudget,totW,allManual,lvl,rates,stepBud,budMinUnit,plannedMinUnit,budCostUnit,materials:+p.directMaterialsCost||0,targetPct:+p.targetProfitPct||0,
    cutPrice,cutPct,cutHasPct:hasCutProfitPct(p),cutBudgetUnit,cutNames,cutLvl,cutRates,cutStepBud,cutMinUnit,cutCostUnit};
}
function buildBudgetReport(fl){
  const card=document.getElementById('rp-budget-card'),el=document.getElementById('rp-budget-body');
  if(!card||!el)return;
  const ctx=_pricingCtx();
  if(!ctx){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  const nd=normalizeBatchDurations(fl); // תיקון זמן batch מנופח בקריאה
  // איחוד לפי עובד+מוצר+שלב: העובד סורק מידות במקובץ ולא בזמן-אמת, לכן חישוב פר-סריקה
  // מייצר יעילות מעוותת. מסכמים את כל הסריקות של אותו שלב-מוצר לשורה הוגנת אחת.
  const grp={};
  for(const t of fl){
    if(!t.done||!(t.duration>0))continue;
    const p=findProd(t.cust,t.prod);if(!p)continue;
    const pb=_prodBudget(p,ctx);if(!pb||pb.budgetUnit<=0)continue;
    // ✂ שלבי הגזירה אינם ב-`lvl` יותר — הם נמדדים מול תקציב הגזירה ולא מול תקציב התפירה.
    // בפועל רוב משימות הגזירה נסרקות בלי כמות ⇒ `units=0` ⇒ alloc=0 ⇒ הן נושרות מהדוח
    // כמו קודם. הענף כאן קיים כדי שמשימת גזירה שכן נושאת כמות תימדד מול המספר הנכון.
    let si=pb.lvl.findIndex(s=>stepName(s)===t.taskType),isCut=false;
    if(si<0){si=pb.cutLvl.findIndex(s=>stepName(s)===t.taskType);if(si<0)continue;isCut=true;}
    const st=isCut?pb.cutLvl[si]:pb.lvl[si];
    // מוקצב: עדיף חישוב מהתמחור הנוכחי (מתעדכן רטרואקטיבית אם נוספו/הוסרו שלבים למוצר
    // אחרי שהמשימה נפתחה — אחרת שלב שהיה לבד בזמן הפתיחה "בולע" את כל התקציב).
    // ליפול לצפי השמור במשימה רק אם אין תעריף שעה זמין לחישוב.
    let alloc=0;
    const mm=stepManualMin(st);
    const units=taskUnits(t); // "כמות פתוחה" = כל ההזמנה, אחרת alloc=0 והמשימה נזרקת בשקט
    // ⚠️ התעריף הוא של **העובד שביצע**, לא הממוצע שב-stepBud — הצפי במשימה נקבע כך
    // ב-calcTaskExpected, וחישוב אחר כאן היה מייצר "חריגה" מול מספר שהעובדת מעולם לא ראתה.
    const rate=(loadedHourlyRate(t.workerId,_tDay(t))||ctx.avgAll)+ctx.oh;
    // ⏱ (09/11/2026, החלטת המשתמש) שלב עם דקות שהוזנו ⇒ מוקצב = הדקות × הכמות ÷ מקדם העובדת (_rwOf = עלות
    // השעה שלה+תקורה ÷ הממוצע של המוצר): עובדת בעלות הממוצעת = הדקות שהוזנו, יקרה — פחות, זולה — יותר.
    // כמו calcTaskExpected בשרת. רק שלב בלי דקות (רמת קושי) נגזר מהתקציב ומהתעריף.
    if(mm>0){alloc=mm*units/_rwOf(t.workerId,p,isCut);}
    else if(isCut){alloc=0;} // ✂ גזירה בלי דקות — אין צפי (גם בשרת)
    else{
      alloc=rate>0&&pb.totW>0?(pb.autoBudget*(+ctx.weights[stepLevel(st)]||1)/pb.totW*units)/rate*60:0;
    }
    if(!(alloc>0))alloc=+t.expectedMin;
    if(!(alloc>0))continue;
    const actual=(nd[t.id]||0)/60;
    const key=t.workerId+'|'+t.cust+'|'+t.prod+'|'+t.taskType;
    const g=grp[key]||(grp[key]={workerName:t.workerName,taskType:t.taskType,cust:t.cust,prod:t.prod,qty:0,alloc:0,actual:0,scan:new Set(),old:0});
    g.qty+=units;g.alloc+=alloc;g.actual+=actual;
    // רק סורק **אחר** מעניין: סריקה עצמית היא ברירת המחדל ואינה ממצא. משימה בלי השדה = לפני 10/09.
    if(t.scannedByName===undefined)g.old++;else if(t.scannedByName&&t.scannedByName!==t.workerName)g.scan.add(t.scannedByName);
  }
  const rows=Object.values(grp).map(g=>({...g,eff:g.actual>0?g.alloc/g.actual*100:0}));
  if(!rows.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">אין משימות שהושלמו עם תמחור בטווח הנבחר</div>';return;}
  rows.sort((a,b)=>a.eff-b.eff);
  const totAlloc=rows.reduce((s,r)=>s+r.alloc,0),totAct=rows.reduce((s,r)=>s+r.actual,0);
  const overCnt=rows.filter(r=>r.actual>r.alloc).length;
  const effBadge=e=>`<span class="badge ${e>=100?'green':e>=80?'amber':'red'}">${Math.round(e)}%</span>`;
  el.innerHTML=`<div style="font-size:11px;color:var(--txt3);margin-bottom:6px">יעילות = מוקצב ÷ בפועל · מעל 100% = מהיר מהמוקצב · <b>מי סרק</b> = מי הפעיל את הסורק כשהסורק אינו העובד עצמו (נרשם מ-10/09/2026; ‎—‎ = רשומה ישנה) · ${overCnt?`<b style="color:var(--red-txt)">${overCnt} משימות חרגו</b>`:'✅ אין חריגות'}</div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>עובד</th><th>שלב</th><th>מוצר</th><th>כמות</th><th>מוקצב</th><th>בפועל</th><th>יעילות</th><th>מי סרק</th></tr></thead>
    <tbody>${rows.map(r=>`<tr${r.actual>r.alloc?' style="background:var(--red-bg,#fee2e2)"':''}>
      <td>${esc(r.workerName)}</td><td style="font-size:12px">${esc(r.taskType||'—')}</td>
      <td><span class="bc-seg bc-c">${r.cust}</span> <span class="bc-seg bc-p">${r.prod}</span></td>
      <td>${r.qty||0}</td><td>${fmtExpMin(r.alloc)}</td><td>${fmtExpMin(r.actual)}</td>
      <td>${effBadge(r.eff)}</td>
      <td style="font-size:11px">${r.scan.size?`<span class="badge amber">${esc([...r.scan].join(' · '))}</span>`:(r.old?'<span style="color:var(--txt3)">—</span>':'<span style="color:var(--txt3)">עצמי</span>')}</td></tr>`).join('')}</tbody>
    <tfoot><tr style="border-top:1.5px solid var(--b);font-weight:600;background:var(--bg2)">
      <td colspan="4">סה"כ (${rows.length} משימות)</td>
      <td>${fmtExpMin(totAlloc)}</td><td>${fmtExpMin(totAct)}</td>
      <td>${effBadge(totAct>0?totAlloc/totAct*100:0)}</td><td></td></tr></tfoot>
  </table></div>`;
}
// ✂ גזירה — תקציב מול בפועל, פר הזמנה ופר עובד.
//
// למה זה כרטיס נפרד ולא עמודה בדוח הרווח: הגזירה נסרקת **בברקוד ספירה+גזירה שאין בו כמות**
// (13 מ-19 משימות הגזירה בהיסטוריה נושאות qty=0), ולכן `calcTaskExpected` מחזיר `missing`
// ואף משימת גזירה לא מקבלת `expectedMin`. אי אפשר להשוות פר-משימה — אין במה להכפיל.
// מה שכן אפשר: הכמות מוזנת בכרטיס המוצר **אחרי** שהגזירה נגמרה, והעובד והזמן נרשמו על כל
// סריקה. לכן ההשוואה נעשית כאן, ברמת ההזמנה, ומחושבת מחדש מהתמחור הנוכחי — בלי לגעת
// בהיסטוריה ובלי לצרוב ערך. ראה gotcha_expectedmin_frozen.
//
// 🛑 הכמות היא התנאי: כל עוד לא הוזנה (`base=0`) השורה מציגה "ממתין לכמות" ולא מספר.
// חלוקה באפס כאן הייתה מייצרת בדיוק את סוג הצפי האבסורדי שנסגר ב-00239.
function buildCutReport(fl){
  const card=document.getElementById('rp-cut-card'),el=document.getElementById('rp-cut-body');
  if(!card||!el)return;
  const ctx=_pricingCtx();
  if(!ctx){card.classList.add('hidden');return;}
  const done=fl.filter(t=>t.done&&(t.duration||0)>0);
  const nd=normalizeBatchDurations(done);
  const stampCache={};
  const rows=[];
  for(const p of (S.products||[])){
    const pb=_prodBudget(p,ctx);
    const cutNames=pb?pb.cutNames:((p.workSteps||[]).filter(s=>stepIsCut(s)).map(s=>stepName(s)));
    const cutPrice=+p.cutPrice||0;
    if(!cutPrice&&!cutNames.length)continue;
    const pst=prodStampOf(p);
    const ts=done.filter(t=>t.cust===p.cust&&t.prod===p.prod&&
      taskOrderStamp(t,stampCache)===pst&&cutNames.indexOf(t.taskType)>=0);
    if(!cutPrice&&!ts.length)continue;
    // בסיס הכמות: מה שיצא ללקוח, ואם טרם יצא — הכמות שהוזנה בכרטיס
    const shipped=p.shippedQty!=null?Math.max(0,+p.shippedQty||0):null;
    const base=shipped!=null&&shipped>0?shipped:_prodQty(p);
    const cutPct=pb?pb.cutPct:cutProfitPctOf(p);
    const budget=(pb?pb.cutBudgetUnit:cutPrice*(1-cutPct/100))*base;
    let actual=0,hrs=0;const byW={};
    for(const t of ts){
      const h=(nd[t.id]||0)/3600;
      const c=h*((loadedHourlyRate(t.workerId,_tDay(t))||ctx.avgAll)+ctx.oh);
      actual+=c;hrs+=h;
      const g=byW[t.workerName||'—']||(byW[t.workerName||'—']={h:0,c:0,n:0});
      g.h+=h;g.c+=c;g.n++;
    }
    rows.push({p,cutPrice,cutPct,cutNames,n:ts.length,base,budget,actual,hrs,byW,
      waiting:!(base>0),noSteps:cutPrice>0&&!cutNames.length,noPrice:!cutPrice&&cutNames.length>0,
      noPct:cutPrice>0&&!(pb?pb.cutHasPct:hasCutProfitPct(p))});
  }
  if(!rows.length){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  rows.sort((a,b)=>(b.actual-b.budget)-(a.actual-a.budget));
  const meas=rows.filter(r=>!r.waiting&&r.n>0);
  const totB=meas.reduce((s,r)=>s+r.budget,0),totA=meas.reduce((s,r)=>s+r.actual,0);
  const totH=meas.reduce((s,r)=>s+r.hrs,0);
  const badge=(b,a)=>{const e=a>0?b/a*100:0;
    return`<span class="badge ${e>=100?'green':e>=80?'amber':'red'}">${Math.round(e)}%</span>`;};
  el.innerHTML=`<div style="font-size:11px;color:var(--txt3);margin-bottom:6px">
      תקציב גזירה = עלות גזירה ליח' × (1 − <b>רווח גזירה%</b>) × הכמות · בפועל = שעות שלבי ה-✂ × עלות שעה עמוסה+תקורה ·
      יעילות = תקציב ÷ בפועל, מעל 100% = זול מהתקציב<br>
      ✂ הגזירה מתומחרת ונמדדת בנפרד מהתפירה — שלבי ה-✂ אינם מקבלים עוד נתח מתקציב התפירה</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>מוצר</th><th>₪/יח'</th><th>רווח%</th><th>כמות</th><th>תקציב</th><th>בפועל</th><th>שעות</th><th>יעילות</th><th>מי גזר</th></tr></thead>
      <tbody>${rows.map(r=>{
        const over=!r.waiting&&r.n>0&&r.actual>r.budget;
        const who=Object.entries(r.byW).sort((a,b)=>b[1].h-a[1].h)
          .map(([k,v])=>`${esc(k)} ${v.h.toFixed(1)}שע'`).join(' · ')||'<span style="color:var(--txt3)">אין סריקות</span>';
        const note=(r.noSteps?'<div style="font-size:11px;color:var(--red-txt)">⚠ אין שלב ✂ מסומן</div>':'')
          +(r.noPrice?'<div style="font-size:11px;color:var(--red-txt)">⚠ אין מחיר גזירה</div>':'')
          +(r.noPct?'<div style="font-size:11px;color:var(--red-txt)">⚠ לא הוזן אחוז רווח לגזירה — מחושב לפי אחוז התפירה</div>':'');
        return`<tr${over?' style="background:var(--red-bg,#fee2e2)"':''}>
          <td><span class="bc-seg bc-c">${r.p.cust}</span> <span class="bc-seg bc-p">${r.p.prod}</span>${r.p.orderNo?` <span style="font-size:10px;color:var(--txt3)">#${r.p.orderNo}</span>`:''}${note}</td>
          <td>${r.cutPrice?'₪'+r.cutPrice.toFixed(2):'—'}</td>
          <td${r.noPct?' style="color:var(--red-txt)"':''}>${r.cutPct.toFixed(0)}%${r.noPct?' ⚠':''}</td>
          <td>${r.waiting?'<span style="color:var(--amber-txt)">ממתין לכמות</span>':r.base}</td>
          <td>${r.waiting?'—':'₪'+r.budget.toFixed(0)}</td>
          <td>${r.n?'₪'+r.actual.toFixed(0):'—'}</td>
          <td>${r.n?r.hrs.toFixed(1):'—'}</td>
          <td>${r.waiting||!r.n?'—':badge(r.budget,r.actual)}</td>
          <td style="font-size:11px">${who}</td></tr>`;}).join('')}</tbody>
      ${meas.length?`<tfoot><tr style="border-top:1.5px solid var(--b);font-weight:600;background:var(--bg2)">
        <td colspan="4">סה"כ (${meas.length} הזמנות נמדדות)</td>
        <td>₪${totB.toFixed(0)}</td><td>₪${totA.toFixed(0)}</td><td>${totH.toFixed(1)}</td>
        <td>${badge(totB,totA)}</td><td></td></tr></tfoot>`:''}
    </table></div>`;
}
function buildProfitReport(fl){
  const card=document.getElementById('rp-profit-card'),el=document.getElementById('rp-profit-body');
  if(!card||!el)return;
  const ctx=_pricingCtx();
  if(!ctx){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  const done=fl.filter(t=>t.done&&(t.duration||0)>0);
  const nd=normalizeBatchDurations(done); // תיקון זמן batch מנופח בקריאה
  const prods=S.products.filter(p=>+p.unitPrice&&(p.workSteps||[]).some(s=>stepLevel(s)||stepManualMin(s)>0));
  const blocks=[],stampCache={};
  for(const p of prods){
    const pb=_prodBudget(p,ctx);if(!pb||pb.budgetUnit<=0)continue;
    // 🔴 הקיבוץ היה לפי לקוח+מוצר בלבד ⇒ **כל כרטיס הזמנה קיבל את משימות כל
    // ההזמנות של הדגם.** נמדד 26/08: 6 כרטיסים מעוותים, והגרוע — 2691C, הזמנה
    // שהתחילה בה משימה אחת בת 43 דקות, הציגה 197 שע' 50 דק' "בפועל" ו"נותר 7 שע'
    // 12 דק'" — 100% מהעבודה של 2691A. הסטייה ב-₪/יחידה הייתה דו-כיוונית, −77%
    // עד +56%, ולכן לא ניתן היה להתייחס אליה כשמרנית.
    // כרטיס בלי משימות משלו נופל למוקצב (actPU!=null?actPU:budPU) — תקציב במקום
    // מספרים של הזמנה אחרת.
    const pst=prodStampOf(p);
    const pTasks=done.filter(t=>t.cust===p.cust&&t.prod===p.prod&&taskOrderStamp(t,stampCache)===pst);
    if(!pTasks.length)continue;
    let costUnit=pb.materials,withData=0;
    const actMinTot=pTasks.reduce((s,t)=>s+(nd[t.id]||0)/60,0); // כל שעות העבודה על המוצר בטווח
    // ✂ שלבי הגזירה **אינם** ב-`pb.lvl` ולכן אינם נכנסים ל-`costUnit`: הם נמדדים מול
    // `cutPrice` ולא מול `unitPrice`. עד 30/08 הם כן נספרו כאן ⇒ עלות הגזירה נזקפה לחובת
    // מחיר התפירה בזמן שההכנסה שלה כלל לא נספרה, והרווח המוצג יצא נמוך מדי.
    const cutRows=pb.cutLvl.map((s,i)=>{
      const ts=pTasks.filter(t=>t.taskType===stepName(s));
      const units=ts.reduce((sum,t)=>sum+taskUnits(t),0);
      const min=ts.reduce((sum,t)=>sum+(nd[t.id]||0)/60,0);
      return{name:stepName(s),budPU:pb.cutStepBud[i].ils,units,min,n:ts.length};
    });
    const cutActMin=cutRows.reduce((s,r)=>s+r.min,0);
    const stepRows=pb.lvl.map((s,i)=>{
      const budPU=pb.stepBud[i].ils; // מהמנוע המשותף — מכבד דקות ידניות ותעריף לפי תחנה
      const ts=pTasks.filter(t=>t.taskType===stepName(s));
      const units=ts.reduce((sum,t)=>sum+taskUnits(t),0); // כולל "כמות פתוחה" — אחרת actPU נופל לתקציב
      let actPU=null;
      if(units>0){
        const cost=ts.reduce((sum,t)=>sum+((nd[t.id]||0)/3600)*((loadedHourlyRate(t.workerId,_tDay(t))||ctx.avgAll)+ctx.oh),0);
        actPU=cost/units;withData++;
      }
      costUnit+=actPU!=null?actPU:budPU;
      return{name:stepName(s),budPU,actPU,units};
    });
    const profit=pb.price-costUnit;
    const profitPct=pb.price>0?profit/pb.price*100:0;
    // כמות שיצאה בפועל (מברקוד "יצא ללקוח") — לרווח האמיתי של ההזמנה: הכנסה רק על מה שיצא
    const shipped=p.shippedQty!=null?Math.max(0,+p.shippedQty||0):null;
    const planned=_prodQty(p); // פר-רשומה — אותו באג בדיוק כמו בדוח "כמות שהושלמה לפי שלב"
    // 🏭 (08/11/2026 — בקשת המשתמש) מוקצב מול בפועל **לפי מחלקה**: המוקצב = הדקות ליחידה של כל שלב
    // (שהוזנו, ובלי — הנגזרות; כמו "זמן להזמנה לפי מחלקה" בחלון המוצר) לפי המחלקה שבתחנה הראשית;
    // הבפועל = זמן המשימות לפי המחלקה של השלב שלהן (שלב לא מוכר ⇒ מחלקת העובד).
    const dp=_ordDeptPlan(p,ctx),dAct={},dClk={},dCost={}; // אותו חישוב מוקצב כמו בלשונית משימות ובמסך התצוגה
    // 💸 dCost = עלות אמיתית: שעות נטו של כל משימה × (תעריף העובדת ביום המשימה + תקורה) — כמו actPU בשורות השלבים
    pTasks.forEach(t=>{const k=dp.stepKey[t.taskType]||_dTimeKey(t.dept)||_rl('no_dept');dp.add(k);const m=(nd[t.id]||0)/60;dClk[k]=(dClk[k]||0)+m;dAct[k]=(dAct[k]||0)+m*_rwOf(t.workerId,p,k.startsWith('✂ '));
      dCost[k]=(dCost[k]||0)+m/60*((loadedHourlyRate(t.workerId,_tDay(t))||ctx.avgAll)+ctx.oh);});
    const deptRows=dp.ord.filter(k=>dp.plan[k]>0||dAct[k]>0).map(k=>({k,planU:dp.plan[k],act:dAct[k]||0,clk:dClk[k]||0,pcU:dp.pc[k]||0,bcU:dp.bc[k]||0,cost:dCost[k]||0}));
    blocks.push({p,pb,stepRows,cutRows,cutActMin,withData,profit,profitPct,shipped,planned,actMinTot,deptRows});
  }
  if(!blocks.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">אין מוצרים מתומחרים עם משימות שהושלמו בטווח הנבחר</div>';return;}
  el.innerHTML=`<div style="font-size:11px;color:var(--txt3);margin-bottom:6px">רווח בפועל ליחידה = מחיר − חומרים − עלות עבודה+תקורה בפועל · שלבים בלי נתונים מחושבים לפי המוקצב · 🚚 אמיתי = הכנסה רק על הכמות שיצאה ללקוח בפועל</div>`+blocks.map(b=>{
    const ok=b.profitPct>=b.pb.targetPct-1;
    return`<details style="border-bottom:0.5px solid var(--brd);padding:6px 0">
      <summary style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;list-style:none">
        <span style="font-weight:600;font-size:13px"><span class="bc-seg bc-c">${b.p.cust}</span> <span class="bc-seg bc-p">${b.p.prod}</span>${b.p.name?' '+esc(b.p.name):''}</span>
        <span style="font-size:12px;color:var(--txt3)">מחיר ₪${b.pb.price.toFixed(2)} · יעד ${b.pb.targetPct}%</span>
        ${(()=>{ // רווח מתוקצב לפי הזמנים שהוזנו (ידני) — מוצג רק כשהוא סוטה מהיעד
          const budProfit=b.pb.price-b.pb.budCostUnit,budPct=b.pb.price>0?budProfit/b.pb.price*100:0;
          if(Math.abs(budPct-b.pb.targetPct)<0.1)return'';
          return`<span class="badge ${budPct>=b.pb.targetPct-1?'gray':'amber'}" title="הרווח שנשאר אחרי תקצוב הזמנים שהוזנו ידנית לשלבים">מתוקצב ${budPct.toFixed(1)}% (₪${budProfit.toFixed(2)})</span>`;
        })()}
        <span class="badge ${ok?'green':'red'}">בפועל ${b.profitPct.toFixed(1)}% (₪${b.profit.toFixed(2)})</span>
        ${(()=>{ // סה"כ זמן להזמנה = כמות המוצר × דקות ליחידה לפי התמחור, מול מה שנעבד עד היום
          const base=Math.max(b.planned,b.shipped||0);
          const totBud=b.pb.budMinUnit*base;
          if(!(totBud>0))return'';
          // ✂ שעות הגזירה יורדות מ"בפועל" של התפירה — התקציב כאן הוא תקציב התפירה בלבד.
          const sewAct=Math.max(0,b.actMinTot-b.cutActMin);
          const left=totBud-sewAct;
          const noCut=b.cutActMin>0?`, ללא ${fmtExpMin(b.cutActMin)} גזירה`:'';
          // ⏱ (24/10/2026) שני זמנים: מה **שהוזן** בשלבים (= דף השלבים / חלון המוצר) ומה **שהתקציב
          // מאפשר** (מחיר − רווח − חומרים ÷ עלות שעה ממוצעת), כל אחד עם החריגה שלו. זהים ⇒ שורה אחת כמו קודם
          const totPlan=(b.pb.plannedMinUnit||0)*base,leftP=totPlan-sewAct;
          const lr=(l,lbl)=>`<b style="color:${l<0?'var(--red-txt)':'var(--green-txt,#16a34a)'}">${l<0?'חריגה':'נותר'} ${fmtExpMin(Math.abs(l))}</b> מול ${lbl}`;
          if(!(totPlan>0)||Math.abs(totPlan-totBud)<=Math.max(1,totBud*0.005))
            return`<span style="font-size:12px;font-weight:600;color:${left<0?'var(--red-txt)':'var(--txt2)'}" title="${base} יח' × ${b.pb.budMinUnit.toFixed(1)} דק'/יח' — תפירה בלבד${noCut}">⏱ תפירה להזמנה ${fmtExpMin(totBud)} · בפועל ${fmtExpMin(sewAct)} · ${left<0?'חריגה ':'נותר '}${fmtExpMin(Math.abs(left))}</span>`;
          return`<span style="font-size:12px;font-weight:600;color:var(--txt2);line-height:1.7" title="${base} יח' — תפירה בלבד${noCut}">⏱ תפירה להזמנה: <span title="${base} × ${b.pb.plannedMinUnit.toFixed(1)} דק' שהוזנו בשלבים">מתוכנן ${fmtExpMin(totPlan)}</span> · <span title="${base} × ${b.pb.budMinUnit.toFixed(1)} דק' — (מחיר − רווח יעד − חומרים) ÷ עלות שעה ממוצעת">התקציב מאפשר ${fmtExpMin(totBud)}</span> · בפועל ${fmtExpMin(sewAct)}
            <br>${lr(leftP,'המתוכנן')} · ${lr(left,'התקציב')}</span>`;
        })()}
        ${(()=>{ // רווח אמיתי לפי כמות שיצאה: הכנסה על מה שיצא בלבד, עלות על כל מה שיוצר (המקסימום מתוכנן/יצא)
          if(b.shipped==null)return'';
          const base=Math.max(b.planned,b.shipped);
          if(!(b.shipped>0)||!(base>0)||b.shipped>=base)return`<span class="badge gray">🚚 יצא ${b.shipped}${b.planned?'/'+b.planned:''} יח'</span>`;
          const effPU=(b.pb.price*b.shipped-(b.pb.price-b.profit)*base)/b.shipped;
          const effPct=b.pb.price>0?effPU/b.pb.price*100:0;
          return`<span class="badge gray">🚚 יצא ${b.shipped}/${b.planned}</span><span class="badge ${effPct>=b.pb.targetPct-1?'green':'red'}" title="הכנסה על ${b.shipped} יח' שיצאו · עלות על ${base} יח' שיוצרו">אמיתי ${effPct.toFixed(1)}% (₪${effPU.toFixed(2)} ליח')</span>`;
        })()}
        ${b.pb.cutPrice>0?`<span class="badge gray" title="הגזירה מתומחרת בנפרד עם אחוז רווח משלה ונמדדת בכרטיס '✂ גזירה — תקציב מול בפועל'. הרווח שמוצג כאן הוא על מחיר המכירה בלבד, ללא שעות הגזירה.">✂ +₪${b.pb.cutPrice.toFixed(2)}/יח' · רווח ${b.pb.cutPct.toFixed(0)}%${b.pb.cutHasPct?'':' ⚠'} — נמדד בנפרד</span>`:''}
        <span style="font-size:11px;color:var(--txt3)">${b.withData}/${b.stepRows.length} שלבים עם נתונים</span>
        ${(()=>{ // 🏭 מוקצב מול בפועל לפי מחלקה — יחידות = המקסימום מתוכנן/יצא, כמו בשורת הזמן
          const base=Math.max(b.planned,b.shipped||0);
          if(!b.deptRows.length||!(base>0))return'';
          const td='padding:3px 8px;text-align:right';
          return`<div style="flex-basis:100%;margin-top:4px"><table style="border-collapse:collapse;font-size:12px;min-width:min(100%,460px)">
            <thead><tr style="color:var(--txt3);border-bottom:1px solid var(--brd)"><th style="${td}">🏭 ${_rl('dept')} (${base} ${_rl('units')})</th><th style="${td}">${_rl('planned')}</th><th style="${td}">${_rl('actual')}</th><th style="${td}"></th><th style="${td}" title="${esc(_rl('cplan_t'))}">${_rl('cplan')}</th><th style="${td}" title="${esc(_rl('cact_t'))}">${_rl('cact')}</th><th style="${td}">${_rl('cdiff')}</th></tr></thead>
            <tbody>${b.deptRows.map(r=>{const pl=r.planU*base,l=pl-r.act,cp=r.pcU*base,cd=cp-r.cost,ils=v=>'₪'+Math.round(v).toLocaleString();
              return`<tr style="border-bottom:0.5px dashed var(--brd)"><td style="${td}">${esc(r.k)}</td><td style="${td}">${pl>0?fmtExpMin(pl):'—'}</td><td style="${td};font-weight:600">${r.act>0?fmtExpMin(r.act):'—'}${r.clk>0&&Math.abs(r.clk-r.act)>=1?`<div style="font-size:10px;font-weight:400;color:var(--txt3)" title="${esc(_rl('clock_t'))}">${_rl('clock')} ${fmtExpMin(r.clk)}</div>`:''}</td>
                <td style="${td};font-weight:700;color:${l<0?'var(--red-txt)':'var(--green-txt,#16a34a)'}">${pl>0?_rl(l<0?'over':'left')+' '+fmtExpMin(Math.abs(l)):''}</td>
                <td style="${td}">${cp>0?ils(cp):'—'}</td><td style="${td};font-weight:600">${r.cost>0?ils(r.cost):'—'}</td>
                <td style="${td};font-weight:700;color:${cd<0?'var(--red-txt)':'var(--green-txt,#16a34a)'}">${cp>0&&r.cost>0?(cd<0?_rl('over')+' ':_rl('left')+' ')+ils(Math.abs(cd)):''}</td></tr>`;}).join('')}</tbody></table>
            ${(()=>{ // 💸 סיכום: עלות החריגות (מול הזמנים שהוזנו) + ההפסד ברווח (רק מה שעבר את תקציב המחלקה — עד שם הרווח עוד מוגן)
              const oc=b.deptRows.reduce((t,r)=>t+Math.max(0,r.cost-r.pcU*base),0);
              const loss=b.deptRows.reduce((t,r)=>t+Math.max(0,r.cost-r.bcU*base),0);
              const hasCut=b.deptRows.some(r=>r.k.startsWith('✂ ')&&(r.cost>0||r.bcU>0));
              const tp=base*(b.pb.price*b.pb.targetPct/100+(hasCut&&b.pb.cutPrice>0?b.pb.cutPrice*b.pb.cutPct/100:0));
              if(!(oc>0)&&!(loss>0))return`<div style="font-size:12px;margin-top:4px;color:var(--green-txt,#16a34a);font-weight:600">💰 ${_rl('no_loss')}</div>`;
              const ils=v=>'₪'+Math.round(v).toLocaleString(),left=tp-loss;
              return`<div style="font-size:12px;margin-top:6px;line-height:1.8">
                <span style="font-weight:700;color:var(--red-txt)" title="${esc(_rl('over_cost_t'))}">💸 ${_rl('over_cost')}: ${ils(oc)}</span>
                · <span style="font-weight:700;color:${loss>0?'var(--red-txt)':'var(--green-txt,#16a34a)'}" title="${esc(_rl('profit_loss_t'))}">📉 ${_rl('profit_loss')}: ${ils(loss)}</span>
                ${tp>0?`· <span style="color:var(--txt2)">${_rl('target_profit')} ${ils(tp)} ⇐ <b style="color:${left<tp?'var(--red-txt)':'inherit'}">${_rl('exp_profit')} ${ils(left)} (${(left/tp*100).toFixed(0)}% ${_rl('of_target')})</b></span>`:''}</div>`;
            })()}</div>`;
        })()}
      </summary>
      <div style="padding:6px 8px 2px">${b.stepRows.map(s=>{
        const has=s.actPU!=null;
        const leak=has?s.actPU-s.budPU:0;
        return`<div style="display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 0;border-bottom:0.5px dashed var(--brd)${has&&leak>0?';color:var(--red-txt)':''}">
          <span style="flex:1;min-width:110px">${esc(s.name)}</span>
          <span style="color:var(--txt3)">מוקצב ₪${s.budPU.toFixed(2)}</span>
          <span style="font-weight:600">${has?`בפועל ₪${s.actPU.toFixed(2)} (${s.units} יח')`:'— אין נתונים'}</span>
          ${has?`<span style="font-weight:700">${leak>0?'▲ +':'▼ '}₪${Math.abs(leak).toFixed(2)}</span>`:''}
        </div>`;}).join('')}${b.cutRows.length?`
        <div style="margin-top:6px;padding-top:5px;border-top:1px solid var(--brd)">
          <div style="font-size:11px;color:var(--txt3);margin-bottom:2px">✂ גזירה — נמדד מול ₪${b.pb.cutPrice.toFixed(2)}/יח' ברווח ${b.pb.cutPct.toFixed(0)}%, לא מול מחיר התפירה</div>
          ${b.cutRows.map(s=>`<div style="display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 0;border-bottom:0.5px dashed var(--brd)">
            <span style="flex:1;min-width:110px">✂ ${esc(s.name)}</span>
            <span style="color:var(--txt3)">מוקצב ₪${s.budPU.toFixed(2)}/יח'</span>
            <span style="font-weight:600">${s.n?`בפועל ${fmtExpMin(s.min)}${s.units?` (${s.units} יח')`:' <span style="color:var(--txt3)">ללא כמות</span>'}`:'— לא נסרק'}</span>
          </div>`).join('')}
        </div>`:''}</div>
    </details>`;}).join('');
}

// ─── 💵 רווח אמיתי — הזמנות שיצאו ללקוח ────────────────────────
// המנהל מסמן הזמנות שיצאו ומקבל עלות ייצור ורווח אמיתי למה שסומן.
//   הכנסה = (מחיר יחידה + מחיר גזירה) × הכמות שיצאה בפועל (shippedQty)
//   עלות  = **כל** שעות העבודה על ההזמנה × (שעה עמוסה של העובד + תקורה) + חומרים
// זו השיטה של מדידות 28/08 ו-02/09 (pricing_real_profit_method). שונה מ"רווח בפועל מול יעד"
// בשלושה דברים, כולם במכוון:
// • לא תלוי בטווח התאריכים של הדוחות — הזמנה שנעבדה ביולי ויצאה בספטמבר חייבת את כל שעותיה.
// • כל משימות ההזמנה, גם אלה ש-taskType שלהן לא בתמחור (אחרת נופלות בשקט — gotcha_orphan_tasktype).
// • ההכנסה מ-shippedQty ולא מנתח פר-שלב: שלבי קבלה/חיתוך לא נסרקים, והנתח שלהם היה חסר (−7.2%).
// ✂ הגזירה נכנסת לשני הצדדים יחד — שעות הגזירה בעלות ו-cutPrice בהכנסה. רק צד אחד = רווח מעוות.
// 🛑 archiveOldTasks מוחק היסטוריה מעל 60 יום ⇒ הזמנה ותיקה מאבדת שעות ושומרת הכנסה ⇒ רווח
//    מנופח בשקט. לכן הזמנה שנפתחה לפני המשימה הוותיקה ביותר שנשארה **מסומנת**, לא מוסתרת.
// נטען רק כשפותחים את הכרטיס: שליפת כל ההיסטוריה היא אלפי קריאות Firestore.
var _rr={open:false,rows:[],sel:new Set(),ts:0,offline:false};
function rrToggleOpen(){
  const w=document.getElementById('rp-real-wrap'),b=document.getElementById('rr-toggle');if(!w)return;
  _rr.open=!w.classList.toggle('hidden');
  if(b)b.textContent=_rr.open?'הסתר':'📂 פתח';
  if(_rr.open)buildRealProfitReport(false);
}
async function buildRealProfitReport(force){
  const card=document.getElementById('rp-real-card'),el=document.getElementById('rp-real-body');
  if(!card||!el)return;
  const ctx=_pricingCtx();
  if(!ctx){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  if(!_rr.open)return;
  await ohReady();
  if(!force&&_rr.ts&&Date.now()-_rr.ts<5*60000){rrRender();return;}
  el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">טוען את כל היסטוריית המשימות...</div>';
  if(force)_histRangeCache.ts=0;
  const hist=await loadHistRange('','');
  const done=hist.filter(t=>(t.duration||0)>0);
  const nd=normalizeBatchDurations(done); // פעם אחת על כל הקבוצה — batch חוצה הזמנות
  let oldest=Infinity;
  for(const t of hist){const e=+new Date(t.endTime);if(e>0&&e<oldest)oldest=e;}
  const cache={},byOrder={},openBy={};
  const okey=t=>t.cust+'|'+t.prod+'|'+taskOrderStamp(t,cache);
  for(const t of done){const k=okey(t);(byOrder[k]||(byOrder[k]=[])).push(t);}
  for(const t of (S.activeTasks||[])){const k=okey(t);openBy[k]=(openBy[k]||0)+1;}
  _rr.rows=(S.products||[]).filter(p=>+p.shippedQty>0).map(p=>{
    const pst=prodStampOf(p),k=p.cust+'|'+p.prod+'|'+pst;
    const ts=byOrder[k]||[];
    let hrs=0,labor=0;
    for(const t of ts){const h=(nd[t.id]||0)/3600;hrs+=h;labor+=h*(loadedHourlyRate(t.workerId,_tDay(t))||ctx.avgAll);}
    const shipped=+p.shippedQty||0,planned=_prodQty(p);
    const price=+p.unitPrice||0,cutPrice=+p.cutPrice||0;
    const extraMat=+p.extraMatPrice||0; // 🧵 מחויב ללקוח ונקנה ע"י המפעל — נכנס להכנסה ולעלות
    const income=(price+cutPrice+extraMat)*shipped;
    const overhead=hrs*ctx.oh;
    const materials=(+p.directMaterialsCost||0)*Math.max(planned,shipped)+extraMat*shipped; // נקנה לכל מה שיוצר
    const cost=labor+overhead+materials;
    return{p,shipped,planned,price,cutPrice,income,hrs,labor,overhead,materials,cost,profit:income-cost,
      n:ts.length,open:openBy[k]||0,at:String(p.shippedAt||p.dnDate||'').slice(0,10),
      archived:pst>1e12&&isFinite(oldest)&&pst<oldest-86400000};
  }).sort((a,b)=>b.at.localeCompare(a.at));
  _rr.ts=Date.now();
  _rr.offline=!db||!S.fbConnected;
  rrRender();
}
function rrShown(){
  const q=(document.getElementById('rr-q')?.value||'').trim().toLowerCase();
  const f=document.getElementById('rr-from')?.value||'',to=document.getElementById('rr-to')?.value||'';
  return _rr.rows.filter(r=>{
    if(f&&!(r.at&&r.at>=f))return false;
    if(to&&!(r.at&&r.at<=to))return false;
    if(!q)return true;
    const p=r.p;
    return[p.cust,p.prod,p.name,p.orderNo,(S.customerNames||{})[p.cust]].some(v=>String(v??'').toLowerCase().includes(q));
  });
}
function rrSelectShown(){for(const r of rrShown())if(r.price>0)_rr.sel.add(r.p.id);rrRender();}
function rrClear(){_rr.sel.clear();rrRender();}
function rrToggle(id,on){on?_rr.sel.add(id):_rr.sel.delete(id);rrRender();}
function rrRender(){
  const el=document.getElementById('rp-real-body'),sm=document.getElementById('rr-sum');if(!el||!sm)return;
  const ils=v=>(v<0?'−':'')+'₪'+Math.round(Math.abs(v)).toLocaleString('he-IL');
  const pct=(p,i)=>i>0?(p/i*100).toFixed(1)+'%':'—';
  const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(2,4):'—';
  const note=(t,c)=>`<div style="font-size:11px;color:var(${c||'--amber-txt'})">${t}</div>`;
  if(!_rr.rows.length){sm.innerHTML='';el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:.5rem 0">אין הזמנות שיצאו ללקוח</div>';return;}
  const sel=_rr.rows.filter(r=>r.price>0&&_rr.sel.has(r.p.id));
  const T={shipped:0,income:0,hrs:0,labor:0,overhead:0,materials:0,cost:0,profit:0,arch:0,part:0,open:0,none:0};
  for(const r of sel){
    T.shipped+=r.shipped;T.income+=r.income;T.hrs+=r.hrs;T.labor+=r.labor;T.overhead+=r.overhead;
    T.materials+=r.materials;T.cost+=r.cost;T.profit+=r.profit;
    if(r.archived)T.arch++;if(r.shipped<r.planned)T.part++;if(r.open)T.open++;if(!r.n)T.none++;
  }
  const tile=(lbl,val,sub,color)=>`<div style="background:var(--bg2);border-radius:var(--r,8px);padding:8px 10px;min-width:120px;flex:1">
    <div style="font-size:11px;color:var(--txt3)">${lbl}</div>
    <div style="font-size:18px;font-weight:700${color?';color:var('+color+')':''}">${val}</div>
    ${sub?`<div style="font-size:11px;color:var(--txt3)">${sub}</div>`:''}</div>`;
  sm.innerHTML=(_rr.offline?note('⚠ אין חיבור לשרת — מחושב רק מהמשימות שבמכשיר, השעות חסרות והרווח מוצג גבוה מדי','--red-txt'):'')
    +`<div style="font-size:11px;color:var(--txt3);margin-bottom:6px">הכנסה = (מחיר + מחיר ✂ גזירה) × הכמות שיצאה · עלות = כל שעות העבודה על ההזמנה × (שעה עמוסה + תקורה) + חומרים · לא תלוי בטווח התאריכים של הדוחות</div>`
    +(sel.length?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
      ${tile('הזמנות שנבחרו',sel.length,T.shipped.toLocaleString('he-IL')+" יח' יצאו")}
      ${tile('הכנסה',ils(T.income),'₪'+(T.income/T.shipped).toFixed(2)+" ליח'")}
      ${tile('עלות ייצור',ils(T.cost),`עבודה ${ils(T.labor)} · תקורה ${ils(T.overhead)}${T.materials?' · חומרים '+ils(T.materials):''} · ${T.hrs.toFixed(1)} שע'`)}
      ${tile("עלות ליח'",'₪'+(T.cost/T.shipped).toFixed(2),(T.hrs*60/T.shipped).toFixed(1)+" דק' עבודה ליח'")}
      ${tile('רווח אמיתי',ils(T.profit)+' · '+pct(T.profit,T.income),'₪'+(T.profit/T.shipped).toFixed(2)+" ליח'",T.profit<0?'--red-txt':'--green-txt')}
    </div>`
      +(T.arch?note(`⚠ ${T.arch} מההזמנות שנבחרו נפתחו לפני המשימה הוותיקה שנשארה בהיסטוריה — ייתכן שחלק מהשעות שלהן נמחקו בארכוב החודשי, והרווח מוצג גבוה מדי`,'--red-txt'):'')
      +(T.part?note(`🚚 ${T.part} הזמנות יצאו חלקית — השעות כוללות גם עבודה על היתרה שעוד לא יצאה, ולכן הרווח שלהן נמוך מהסופי`):'')
      +(T.open?note(`⏳ ב-${T.open} הזמנות יש משימות פתוחות — הזמן שלהן עוד לא נספר`):'')
      +(T.none?note(`⚠ ${T.none} הזמנות בלי אף משימה רשומה — עלות 0`,'--red-txt'):'')
    :`<div style="font-size:12px;color:var(--txt2);padding:4px 0 8px">סמן הזמנות ברשימה (או "✅ בחר את המוצגים") כדי לחשב עלות ייצור ורווח</div>`);
  const shown=rrShown();
  el.innerHTML=`<div style="font-size:11px;color:var(--txt3);margin-bottom:4px">מוצגות ${shown.length} מתוך ${_rr.rows.length} הזמנות שיצאו</div>
    <div class="tbl-wrap"><table>
    <thead><tr><th></th><th style="min-width:150px">הזמנה</th><th>יצא</th><th>כמות</th><th>רווח</th><th>רווח %</th><th>הכנסה</th><th>עלות ייצור</th><th>עלות ליח'</th><th>שעות</th></tr></thead>
    <tbody>${shown.map(r=>{
      const p=r.p,on=_rr.sel.has(p.id)&&r.price>0;
      const notes=(!r.price?note('⚠ אין מחיר יחידה — לא ניתן לחשב','--red-txt'):'')
        +(r.archived?note('⚠ ייתכן שחסרות שעות (ארכוב)','--red-txt'):'')
        +(r.shipped<r.planned?note(`🚚 יצא ${r.shipped} מתוך ${r.planned}`):'')
        +(r.open?note(`⏳ ${r.open} משימות פתוחות`):'')
        +(!r.n?note('⚠ אין משימות רשומות','--red-txt'):'')
        +(r.cutPrice>0?note(`כולל ✂ ₪${r.cutPrice.toFixed(2)}/יח'`,'--txt3'):'')
        +(p.isSample?note(SAMPLE_STEP+' · העלות לפי זמן העבודה','--blue-txt'):'');
      const cust=(S.customerNames||{})[p.cust];
      return`<tr${on?' style="background:var(--blue-bg)"':''}>
        <td><input type="checkbox" style="width:auto" ${on?'checked':''} ${r.price>0?'':'disabled'} onchange="rrToggle('${escj(p.id)}',this.checked)"/></td>
        <td><span class="bc-seg bc-c">${esc(p.cust)}</span> <span class="bc-seg bc-p">${esc(p.prod)}</span>${p.orderNo?` <span style="font-size:10px;color:var(--txt3)">#${esc(p.orderNo)}</span>`:''}
          ${p.name||cust?`<div style="font-size:11px;color:var(--txt2)">${esc(p.name||'')}${p.name&&cust?' · ':''}${esc(cust||'')}</div>`:''}${notes}</td>
        <td style="white-space:nowrap">${dmy(r.at)}</td>
        <td>${r.shipped}</td>
        <td style="font-weight:600;color:var(${r.profit<0?'--red-txt':'--green-txt'})">${r.price?ils(r.profit):'—'}</td>
        <td>${r.price?`<span class="badge ${r.profit<0?'red':'green'}">${pct(r.profit,r.income)}</span>`:'—'}</td>
        <td>${r.price?ils(r.income):'—'}</td>
        <td>${ils(r.cost)}</td>
        <td>₪${(r.cost/r.shipped).toFixed(2)}</td>
        <td>${r.hrs.toFixed(1)}</td>
      </tr>`;}).join('')}</tbody></table></div>`;
}

async function exportCSV(){
  const wf=document.getElementById('rf-w').value;
  const cf=document.getElementById('rf-c').value;
  const pf=document.getElementById('rf-p').value;
  const fromD=pf?'':document.getElementById('rf-from')?.value||''; // מוצר נבחר ⇒ כל התאריכים (כמו buildRep)
  const toD=pf?'':document.getElementById('rf-to')?.value||'';
  const hist=pf?await loadHistProd(pf):await loadHistRange(fromD,toD);
  const allRaw=[...S.activeTasks.map(t=>({...t,done:false})),...hist.map(t=>({...t,done:true}))];
  const of=_rfOrderSel(pf,cf),_oc={}; // 🔢 הזמנה נבחרת (כמו buildRep)
  const all=allRaw.filter(t=>{
    const d=new Date(t.startTime).toISOString().slice(0,10);
    return(!wf||t.workerName===wf)&&(!cf||t.cust===cf)&&(!pf||t.prod===pf)&&(!fromD||d>=fromD)&&(!toD||d<=toD)
      &&(!of||(t.cust===of.cust&&taskOrderStamp(t,_oc)===of.st));
  });
  const rows=[['עובד','מחלקה','לקוח','מוצר','מידה','כמות','צבע','שעת התחלה','שעת סיום','משך (דק)','סטטוס','תאריך']];
  all.forEach(t=>{
    const d=new Date(t.startTime);
    const et=t.endTime?new Date(t.endTime):null;
    const stStr=pad2(d.getHours())+':'+pad2(d.getMinutes());
    const etStr=et?pad2(et.getHours())+':'+pad2(et.getMinutes()):'—';
    rows.push([t.workerName,t.dept,t.cust,t.prod,t.size||'',t.qty,COLORS[t.col]||t.col,stStr,etStr,t.done?Math.round((t.duration||0)/60):Math.round((t.elapsed||0)/60),t.done?'הושלם':'פעיל',d.toLocaleDateString('he-IL')]);
  });
  // 🎯 הבלוק המרוכז נלקח מ-_expProdRows שנבנה ב-buildExpectedByProduct — נקודת חישוב אחת
  // לתצוגה, להדפסה ול-CSV. אם הלשונית עוד לא נבנתה בטווח הנוכחי, בונים אותה עכשיו.
  if(!_expProdRows.length)try{buildExpectedByProduct(all);}catch(e){}
  if(_expProdRows.length){
    const h1=s=>(s/3600).toFixed(1);
    rows.push([]);
    rows.push(['🎯 בפועל מול צפי — לפי מוצר']);
    rows.push(['לקוח','מוצר','שם','משימות','יחידות','בפועל (שעות)','חלוקת עבודה (שעות)','צפי (שעות)','פער (שעות)','מעל הצפי (שעות)','מתחת לצפי (שעות)','יעילות %','בלי צפי','צפי חשוד']);
    const G={act:0,exp:0,over:0,under:0,units:0,n:0,noExp:0,susp:0,actExp:0,scan:0};
    _expProdRows.forEach(r=>{
      G.act+=r.act;G.exp+=r.exp;G.over+=r.over;G.under+=r.under;G.units+=r.units;
      G.n+=r.tasks.length;G.noExp+=r.noExp;G.susp+=r.susp;G.actExp+=r.actExp;G.scan+=(r.scan||0);
      rows.push([r.cust,r.prod,String(r.name||'').replace(/,/g,' '),r.tasks.length,r.units,h1(r.act),r.scan?h1(r.scan):'',r.exp?h1(r.exp):'',r.exp?h1(r.gap):'',
        h1(r.over),h1(r.under),r.eff!=null?r.eff:'',r.noExp||'',r.susp||'']);
    });
    rows.push(['סה"כ','','',G.n,G.units,h1(G.act),G.scan?h1(G.scan):'',h1(G.exp),h1(G.over-G.under),h1(G.over),h1(G.under),
      G.actExp>0?Math.round(G.exp/G.actExp*100):'',G.noExp||'',G.susp||'']);
  }
  const csv='﻿'+'sep=,\n'+rows.map(r=>r.join(',')).join('\n');
  const blob2=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob2);
  a.download='TextileOps_'+new Date().toLocaleDateString('he-IL').replace(/\//g,'-')+'.csv';a.click();URL.revokeObjectURL(a.href);
}

