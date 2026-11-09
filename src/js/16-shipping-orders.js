// ─── ברקוד "יצא ללקוח": מסמן שלב shipped + עדכון כמות סופית בפועל ───
// כל הרשומות של אותו לקוח+מוצר, החדשה ראשונה — אותו דירוג בדיוק כמו findProd
function prodMatches(cust,prod){
  const rank=p=>+p.createdAt||parseInt(String(p.id).replace(/\D/g,''))||0;
  return (S.products||[]).filter(p=>p.cust===cust&&p.prod===prod).sort((a,b)=>rank(b)-rank(a));
}
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): _prodQty
// 🏷️ סוג הסחורה. לא כל הכמות במידה+צבע יוצאת בהכרח באותה איכות — לכן התעודה
// הידנית מחזיקה שתי שורות לכל צבע. ברירת המחדל היא סוג א; רשומה ישנה בלי
// שדה grade נחשבת סוג א, ולכן הפיצ'ר לא משנה שום נתון קיים.
const GRADE_A='א',GRADE_B='ב';
// ✂ לא תפור (13/10/2026): יחידה שחוזרת ללקוח בלי תפירה (חסר חלק / חלק פגום). נרשמת בשורות
// התעודה (נספרת כ"יצא" — יתרה, סגירת ברקוד) אבל **לא ב-total** ⇒ לא בהתחשבנות, לא ב-shippedQty.
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): GRADE_U, isUnsewn, shUnsewn
// ─── 🚚 מאגר משלוחים ─────────────────────────────────────────
// הזמנה יוצאת ללקוח **בכמה פעימות**: 100 היום, היתרה בשבוע הבא. לכל פעימה תעודה
// ומספר משלה. לפני זה נשמר משלוח אחד בלבד ⇒ הסריקה השנייה דרסה את הראשונה
// והמספר הישן נשאר על שתיהן.
// `shippedQty` נשאר **סכום כל המשלוחים** כדי שדוח הרווח וכל שאר הקוראים לא ישתנו.
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): prodShipments
function shipmentsTotal(p){return prodShipments(p).reduce((t,s)=>t+(+s.total||0),0);}
// כמה כבר יצא לכל מידה+צבע (שני הסוגים יחד) — הבסיס לחישוב היתרה בסריקה הבאה
// exclude = משלוח שלא נספר. נדרש בעריכת תעודה: "כבר יצא" חייב להיות **בלי**
// התעודה שעורכים, אחרת הכמות שלה הייתה נספרת גם כיתרה שנותרה וגם כיתרה שיצאה.
function shippedCellMap(p,exclude){
  const m=new Map();
  prodShipments(p).forEach(s=>{if(exclude&&s===exclude)return;(s.rows||[]).forEach(r=>{
    const k=String(r.size??'')+'|'+String(r.color??'');
    m.set(k,(m.get(k)||0)+(parseInt(r.qty)||0));
  });});
  return m;
}
// איחוד שורות כל המשלוחים — נשמר ב-shippedRows כדי שקורא שמסתכל על המוצר
// ולא על משלוח מסוים יראה את התמונה המצטברת
function mergeShipRows(list){
  const m=new Map();
  list.forEach(s=>(s.rows||[]).forEach(r=>{
    const k=String(r.size??'')+'|'+String(r.color??'')+'|'+(r.grade||GRADE_A);
    m.set(k,(m.get(k)||0)+(parseInt(r.qty)||0));
  }));
  return[...m.entries()].map(([k,qty])=>{const[size,color,grade]=k.split('|');return{size,color,grade,qty};});
}
// ─── שורות יציאה פר מידה/צבע ─────────────────────────────────
// עד כאן היציאה נשמרה כמספר בודד (shippedQty) ⇒ במשלוח חלקי לא היה ידוע **אילו**
// מידות יצאו, ותעודת משלוח מפורטת הייתה בלתי אפשרית. shippedRows מוסיף את הפירוט;
// shippedQty נשאר הסכום כדי שכל הקוראים הקיימים שלו ימשיכו לעבוד ללא שינוי.
// editSh = רשומת משלוח קיימת שעורכים. בלעדיו הטבלה מציעה את **היתרה** למשלוח
// חדש; איתו היא מציגה את הכמויות של אותה תעודה בלבד.
function shipRowsHtml(p,editSh){
  let rows=(p.quantities||[]).filter(q=>parseInt(q.qty)>0);
  // 🛑 מידה/צבע שיש בתעודה אבל כבר לא ברשימת הכמויות של המוצר (הכמויות עודכנו
  // מאז) **חייבים להופיע** — אחרת השמירה הייתה מוחקת אותם מהתעודה בשקט.
  if(editSh){
    const have=new Set(rows.map(q=>String(q.size)+'|'+String(q.color)));
    (editSh.rows||[]).forEach(r=>{const k=String(r.size??'')+'|'+String(r.color??'');
      if(!have.has(k)){have.add(k);rows=rows.concat([{size:r.size,color:r.color,qty:0,_extra:true}]);}});
  }
  // מוצר בלי כמויות ידועות תקין לגמרי — ההזמנה מגיעה בלי כמות ונספרת בדיעבד
  // (ראה gotcha_qty_read_from_newest). במקרה כזה נשארים בשדה סכום בודד.
  if(!rows.length){
    const cur=editSh?(+editSh.total||0):(p.shippedQty!=null?p.shippedQty:(_prodQty(p)||getTotalQty(p.cust,p.prod)||0));
    return `<div style="font-size:11px;color:var(--amber-txt);background:var(--amber-bg);padding:6px 8px;border-radius:8px;margin-bottom:6px">⚠ אין פירוט מידות במוצר — נרשם סכום בלבד</div>
      <input id="ship-qty-inp" type="number" inputmode="numeric" min="0" value="${cur}" oninput="shipRowsTotal()" style="width:100%;font-size:16px;padding:8px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>`;
  }
  // 🏷️ סוג א / סוג ב — **מימד נפרד מהצבע ולא צבע נוסף.** הברקוד מקודד צבע בשתי
  // ספרות ואין בו סוג, ולכן הסוג נקבע רק ברגע היציאה. פתרון של "אפור סוג ב" כקוד
  // צבע נפרד היה מזהם את רשימת הצבעים ושובר את הברקודים.
  // סוג ב הוא **החריג** (בתעודה של 01/09: יחידה אחת מתוך 230), ולכן טבלת סוג ב
  // מוסתרת כברירת מחדל ונפתחת רק כשצריך — או כשכבר יש בה נתונים משמירה קודמת.
  // 🚚 המסך הזה רושם **את המשלוח הנוכחי בלבד**, לא את הסך המצטבר. לכן סוג א
  // מתמלא ב**יתרה** (בהזמנה פחות מה שכבר יצא) ולא בכמות המלאה — אחרת סריקה שנייה
  // הייתה מציעה לשלוח שוב את מה שכבר נמסר.
  const done=shippedCellMap(p,editSh);
  const already=q=>done.get(String(q.size)+'|'+String(q.color))||0;
  const mine=new Map();
  (editSh?.rows||[]).forEach(r=>{const k=String(r.size??'')+'|'+String(r.color??'')+'|'+(r.grade||GRADE_A);
    mine.set(k,(mine.get(k)||0)+(parseInt(r.qty)||0));});
  const val=(q,g)=>editSh?(mine.get(String(q.size)+'|'+String(q.color)+'|'+g)||0)
    :(g===GRADE_A?Math.max(0,(parseInt(q.qty)||0)-already(q)):0);
  const anyPrev=done.size>0;
  // הסכום ההתחלתי מחושב כאן ולא מושאר 0 עד ש-shipRowsTotal יורה ב-setTimeout —
  // אחרת נראה רגע של "סה"כ יוצא 0" בזמן שהשדות כבר מלאים
  const initSum=rows.reduce((s,q)=>s+val(q,GRADE_A)+val(q,GRADE_B),0); // ✂ לא תפור — מחוץ לסכום (לא לחיוב)
  const initU=rows.reduce((s,q)=>s+val(q,GRADE_U),0);
  // data-max = **היתרה** ולא הכמות בהזמנה: אחרי משלוח של 12 מתוך 20, שליחת 10
  // נוספות היא חריגה אמיתית (22 מתוך 20) וצריכה להסתמן ככזו
  const cell=(q,g)=>`<input class="ship-row-inp${g===GRADE_B?' ship-b':g===GRADE_U?' ship-u':' ship-a'}" data-size="${esc(q.size)}" data-color="${esc(q.color)}" data-grade="${esc(g)}" data-max="${Math.max(0,(parseInt(q.qty)||0)-already(q))}" type="number" inputmode="numeric" min="0" value="${val(q,g)}" oninput="${g===GRADE_A?'shipGradeAEdit(this)':g===GRADE_U?'shipUnsewnEdit(this)':'shipGradeBEdit(this)'}" style="width:100%;font-size:14px;padding:5px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>`;
  const banner=editSh
    ?`<div style="font-size:11px;color:var(--blue-txt,#1e40af);background:var(--blue-bg,#dbeafe);padding:6px 8px;border-radius:8px;margin-bottom:6px">✏️ הכמויות שלמטה הן של <b>התעודה הזו בלבד</b>. עמודת "כבר יצא" סופרת את שאר המשלוחים, בלי התעודה שנערכת.</div>`
    :(anyPrev?`<div style="font-size:11px;color:var(--blue-txt,#1e40af);background:var(--blue-bg,#dbeafe);padding:6px 8px;border-radius:8px;margin-bottom:6px">🚚 יצאו כבר ${shipmentsTotal(p)} יח' ב-${prodShipments(p).length} משלוחים. הטבלה מציגה את <b>היתרה</b> — זהו משלוח חדש עם תעודה נפרדת.</div>`:'');
  return `${banner}
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr style="color:var(--txt3)">
      <th style="text-align:right;padding:2px 4px">מידה</th>
      <th style="text-align:right;padding:2px 4px">צבע</th>
      <th style="text-align:left;padding:2px 4px">בהזמנה</th>
      ${anyPrev?'<th style="text-align:left;padding:2px 4px">כבר יצא</th>':''}
      <th style="text-align:center;padding:2px 4px;width:66px">סוג א</th>
      <th style="text-align:center;padding:2px 4px;width:66px">סוג ב</th>
      <th style="text-align:center;padding:2px 4px;width:66px" title="יחידה שחוזרת בלי תפירה — לא נכנסת להתחשבנות">✂ לא תפור</th>
    </tr>
    ${rows.map(q=>`<tr data-rowtotal="${val(q,GRADE_A)+val(q,GRADE_B)+val(q,GRADE_U)}">
        <td style="padding:2px 4px">${esc(szLbl(q.size,p))}</td>
        <td style="padding:2px 4px">${esc(COLORS[q.color]||q.color)}</td>
        <td style="padding:2px 4px;text-align:left;color:var(--txt3)">${q._extra?'<span title="המידה/צבע כבר לא ברשימת הכמויות של המוצר">—</span>':(parseInt(q.qty)||0)}</td>
        ${anyPrev?`<td style="padding:2px 4px;text-align:left;color:var(--blue-txt,#1e40af);font-weight:600">${already(q)||''}</td>`:''}
        <td style="padding:2px 4px">${cell(q,GRADE_A)}</td>
        <td style="padding:2px 4px">${cell(q,GRADE_B)}</td>
        <td style="padding:2px 4px">${cell(q,GRADE_U)}</td>
      </tr>`).join('')}
    <tr style="border-top:1px solid var(--brd)">
      <td colspan="${anyPrev?4:3}" style="padding:6px 4px;font-weight:700">סה"כ במשלוח הזה</td>
      <td id="ship-total" colspan="2" style="padding:6px 4px;font-weight:800;text-align:center;color:var(--green-txt,#16a34a)">${initSum}</td>
      <td id="ship-unsewn" style="padding:6px 4px;font-weight:700;text-align:center;color:var(--amber-txt)">${initU||''}</td>
    </tr>
  </table>
  <div style="font-size:11px;color:var(--txt3);margin-top:4px">✂ לא תפור — חוזר ללקוח בלי תפירה: מודפס בתעודה בשורה נפרדת, לא נכנס לסה"כ ולהתחשבנות</div>
  <div id="ship-over" style="display:none;font-size:11px;font-weight:700;color:var(--amber-txt);background:var(--amber-bg);padding:6px 8px;border-radius:8px;margin-top:6px"></div>`;
}
// ✏️ עריכה ידנית של סוג א = קביעת הכמות שיוצאת בשורה הזו (משלוח חלקי).
// הערך נשמר כ"סך השורה" כדי שהזנת סוג ב אחר כך תגרע ממנו ולא מהכמות שבהזמנה —
// אחרת משלוח חלקי של 15 מתוך 20 היה קופץ בחזרה ל-20 ברגע שמזינים סוג ב.
function shipGradeAEdit(el){
  const tr=el.closest('tr');
  if(tr){
    const b=tr.querySelector('.ship-b'),u=tr.querySelector('.ship-u');
    tr.dataset.rowtotal=Math.max(0,parseInt(el.value)||0)+Math.max(0,parseInt(b?.value)||0)+Math.max(0,parseInt(u?.value)||0);
  }
  shipRowsTotal();
}
// ✏️ הזנת סוג ב **גורעת מסוג א** ומשאירה את סך השורה קבוע: 20 יח' שחור מידה 1,
// הזנת 2 בסוג ב ⇒ סוג א יורד ל-18. זו הדרישה המרכזית — בלעדיה היו נספרות 22.
function shipGradeBEdit(el){
  const tr=el.closest('tr');
  if(tr){
    const a=tr.querySelector('.ship-a');
    const tot=Math.max(0,parseInt(tr.dataset.rowtotal)||0);
    const bq=[...tr.querySelectorAll('.ship-b,.ship-u')].reduce((t,i)=>t+Math.max(0,parseInt(i.value)||0),0);
    if(a)a.value=Math.max(0,tot-bq);
  }
  shipRowsTotal();
}
// ✂ לא תפור גורע מסוג א **רק מה שחורג מהיתרה** (data-max): במשלוח חדש 20 סוג א + 1 ⇒ 19+1.
// בעריכה של תעודה שבה כבר חסרה היחידה (18 א + 1 ב מתוך 20) ⇒ סוג א נשאר 18 והשורה מגיעה ל-20.
// (13/10: גריעה מלאה כמו בסוג ב הורידה את 0698 ל-17 א — יחידה תפורה נעלמה מהחיוב)
function shipUnsewnEdit(el){
  const tr=el.closest('tr');
  if(tr){
    const a=tr.querySelector('.ship-a'),b=tr.querySelector('.ship-b');
    const v=i=>Math.max(0,parseInt(i?.value)||0);
    const max=Math.max(0,parseInt(el.dataset.max)||0);
    if(a&&max)a.value=Math.min(v(a),Math.max(0,max-v(b)-v(el)));
    tr.dataset.rowtotal=v(a)+v(b)+v(el);
  }
  shipRowsTotal();
}
function _shipQtySum(){
  const inps=[...document.querySelectorAll('.ship-row-inp')];
  if(!inps.length)return Math.max(0,parseInt(document.getElementById('ship-qty-inp')?.value)||0);
  return inps.filter(i=>!i.classList.contains('ship-u')).reduce((s,i)=>s+Math.max(0,parseInt(i.value)||0),0); // ✂ לא תפור — לא לחיוב
}
function _shipUnsewnSum(){return [...document.querySelectorAll('.ship-row-inp.ship-u')].reduce((s,i)=>s+Math.max(0,parseInt(i.value)||0),0);}
// אריזה תואמת = שווה ליחידות לחיוב, או לכולל ה"לא תפור" (שגם הוא נארז לפעמים), ועם/בלי הדגם המקורי שחוזר באותה חבילה
const _packsMatchN=(u,q,x,o)=>[q,q+x].some(v=>u===v||u===v+o);
const _packsMatch=(u,q)=>_packsMatchN(u,q,_shipUnsewnSum(),_shipOrigVal());
// 👕 דגם מקורי של הלקוח שחוזר עם הסחורה — מודפס בתעודה בלבד, לא ביחידות ולא בהתחשבנות
const _shipOrigVal=()=>Math.max(0,parseInt(document.getElementById('ship-orig')?.value)||0);
const shipOrigHtml=v=>`<div style="margin-top:9px;display:flex;align-items:center;gap:8px">
      <label style="font-size:12px;font-weight:600;flex:1">👕 דגם מקורי שחוזר ללקוח <span style="font-size:10px;font-weight:400;color:var(--txt3)">(מודפס בתעודה, לא בהתחשבנות)</span></label>
      <input id="ship-orig" type="number" inputmode="numeric" min="0" value="${v||''}" placeholder="0" oninput="shipPackTotal()" style="width:70px;font-size:13px;padding:6px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>
    </div>`;
function _shipRowsCollect(){
  return [...document.querySelectorAll('.ship-row-inp')]
    .map(i=>({size:i.dataset.size,color:i.dataset.color,grade:i.dataset.grade||GRADE_A,qty:Math.max(0,parseInt(i.value)||0)}))
    .filter(r=>r.qty>0);
}
// ─── 📦 אריזה — חבילות × יחידות בחבילה ────────────────────────
// המפעל אורז ב**קבוצות של חבילות זהות** ולא לפי מידה/צבע: 35 חבילות של 5 יח',
// ועוד 3 של 4, ועוד חבילה אחת של 1. לכן האריזה נרשמת כשורות (חבילות × יח')
// ולא כעמודה במטריצת הצבעים — לחבילה אין שום התאמה לשורת צבע או למידה.
function packsUnits(a){return (a||[]).reduce((t,x)=>t+(+x.n||0)*(+x.per||0),0);}
function packsCount(a){return (a||[]).reduce((t,x)=>t+(+x.n||0),0);}
function shipPackRowHtml(n,per){
  const inp='flex:1;min-width:0;font-size:13px;padding:6px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  return `<div class="pack-row" style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
    <input class="pack-n" type="number" inputmode="numeric" min="0" value="${n||''}" placeholder="חבילות" oninput="shipPackTotal()" style="${inp}"/>
    <span style="font-size:13px;color:var(--txt3)">×</span>
    <input class="pack-per" type="number" inputmode="numeric" min="0" value="${per||''}" placeholder="יח' בחבילה" oninput="shipPackTotal()" style="${inp}"/>
    <span class="pack-eq" style="font-size:12px;font-weight:800;min-width:34px;text-align:center;color:var(--txt3)">—</span>
    <button class="btn" style="font-size:11px;padding:4px 7px" onclick="delPackRow(this)">🗑</button>
  </div>`;
}
function shipPackRowsHtml(packs){
  const list=(Array.isArray(packs)&&packs.length)?packs:[{n:'',per:''}];
  return list.map(x=>shipPackRowHtml(x.n,x.per)).join('');
}
function addPackRow(){
  const w=document.getElementById('pack-rows');
  if(!w)return;
  w.insertAdjacentHTML('beforeend',shipPackRowHtml('',''));
  w.lastElementChild?.querySelector('.pack-n')?.focus();
  shipPackTotal();
}
// השורה האחרונה לא נמחקת אלא מתרוקנת — טופס בלי שום שורה נראה שבור
function delPackRow(el){
  const rows=[...document.querySelectorAll('.pack-row')];
  const tr=el.closest('.pack-row');
  if(rows.length<=1){if(tr)tr.querySelectorAll('input').forEach(i=>i.value='');}
  else tr?.remove();
  shipPackTotal();
}
function _shipPacksCollect(){
  return [...document.querySelectorAll('.pack-row')].map(r=>({
    n:Math.max(0,parseInt(r.querySelector('.pack-n')?.value)||0),
    per:Math.max(0,parseInt(r.querySelector('.pack-per')?.value)||0)
  })).filter(x=>x.n>0&&x.per>0);
}
// סכום האריזה מושווה לכמות שיוצאת ומסומן בכתום כשהוא שונה — **בלי לחסום**:
// לפעמים נארזת חבילה חלקית. האזהרה חוזרת גם באישור וגם על התעודה המודפסת.
function shipPackTotal(){
  document.querySelectorAll('.pack-row').forEach(r=>{
    const n=Math.max(0,parseInt(r.querySelector('.pack-n')?.value)||0);
    const per=Math.max(0,parseInt(r.querySelector('.pack-per')?.value)||0);
    const eq=r.querySelector('.pack-eq');
    if(eq){eq.textContent=(n&&per)?String(n*per):'—';eq.style.color=(n&&per)?'var(--txt)':'var(--txt3)';}
  });
  const el=document.getElementById('pack-sum');
  if(!el)return;
  const packs=_shipPacksCollect();
  const ot=outerTxt(_shipOuterCollect());
  if(!packs.length){el.textContent=ot||'לא הוזנה';el.style.color=ot?'var(--txt)':'var(--txt3)';return;}
  const u=packsUnits(packs),q=_shipQtySum();
  el.textContent=packsCount(packs)+' חבילות'+(ot?' '+outerIn(ot):'')+' · '+u+" יח'"+(!_packsMatch(u,q)?' ⚠ במשלוח '+q:'');
  el.style.color=!_packsMatch(u,q)?'var(--amber-txt)':'var(--green-txt,#16a34a)';
}
// ─── 🛍 אריזה חיצונית (23/10/2026) — שקים/קרטונים גדולים שהחבילות יוצאות בהם ───
// sh.outer=[{k:'sack'|'carton',n}] — תצוגה בלבד (סיכום, תעודה, PDF); לא נוגע בכמויות/התחשבנות.
// תעודה ישנה בלי השדה = אין אריזה חיצונית.
const OUTER_KINDS=[['sack','שק','שקים'],['carton','קרטון','קרטונים']];
function outerTxt(a){
  const m={};(Array.isArray(a)?a:[]).forEach(x=>{const n=+x.n||0;if(n>0)m[x.k]=(m[x.k]||0)+n;});
  return OUTER_KINDS.filter(k=>m[k[0]]).map(k=>m[k[0]]===1?k[1]+' אחד':m[k[0]]+' '+k[2]).join(' + ');
}
// "ב-3 שקים" אבל "בשק אחד" — מקף רק לפני מספר
function outerIn(t){return /^\d/.test(t)?'ב-'+t:'ב'+t;}
function shipOuterRowHtml(k,n){
  const inp='font-size:13px;padding:6px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  return `<div class="outer-row" style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
    <input class="outer-n" type="number" inputmode="numeric" min="0" value="${n||''}" placeholder="כמה" oninput="shipPackTotal()" style="flex:1;min-width:0;${inp}"/>
    <select class="outer-k" onchange="shipPackTotal()" style="flex:1;min-width:0;${inp}">${OUTER_KINDS.map(o=>`<option value="${o[0]}"${o[0]===k?' selected':''}>${o[2]}</option>`).join('')}</select>
    <button class="btn" style="font-size:11px;padding:4px 7px" onclick="delOuterRow(this)">🗑</button>
  </div>`;
}
function shipOuterHtml(outer){
  const list=(Array.isArray(outer)&&outer.length)?outer:[{k:'sack',n:''}];
  return `<div style="font-size:12px;font-weight:700;margin:10px 0 5px;padding-top:8px;border-top:1px dashed var(--brd)">🛍 אריזה חיצונית — שקים / קרטונים גדולים</div>
    <div id="outer-rows">${list.map(x=>shipOuterRowHtml(x.k,x.n)).join('')}</div>
    <button class="btn" style="width:100%;font-size:12px;padding:5px;margin-top:4px" onclick="addOuterRow()">➕ עוד סוג</button>`;
}
function addOuterRow(){
  const w=document.getElementById('outer-rows');if(!w)return;
  const used=[...w.querySelectorAll('.outer-k')].map(s=>s.value);
  w.insertAdjacentHTML('beforeend',shipOuterRowHtml((OUTER_KINDS.find(k=>!used.includes(k[0]))||OUTER_KINDS[0])[0],''));
  w.lastElementChild?.querySelector('.outer-n')?.focus();
}
function delOuterRow(el){
  const rows=[...document.querySelectorAll('.outer-row')];
  const tr=el.closest('.outer-row');
  if(rows.length<=1){const i=tr?.querySelector('.outer-n');if(i)i.value='';}
  else tr?.remove();
  shipPackTotal();
}
function _shipOuterCollect(){
  return [...document.querySelectorAll('.outer-row')].map(r=>({
    k:r.querySelector('.outer-k')?.value||'sack',
    n:Math.max(0,parseInt(r.querySelector('.outer-n')?.value)||0)
  })).filter(x=>x.n>0);
}
// 📦 שלושת החומרים מוצגים תמיד — המצב נגזר ממה שמולא, ולא נבחר מראש.
// 👤 חומר "של הלקוח" (23/10/2026): הלקוח סיפק את החומר ⇒ נרשם (לסוג האריזה ולפירוט)
// אבל price=0 ו-own=true — בלי חיוב ובלי אזהרת "בלי מחיר". ברירת המחדל לחומר = מה
// שסומן בתעודה האחרונה של אותו לקוח שבה החומר הזה נרשם.
function custMatOwn(cust,k){
  let best=null;
  (S.products||[]).forEach(p=>{if(p.cust!==cust)return;
    prodShipments(p).forEach(s=>{const m=shipMats(s).find(x=>x.k===k);
      if(m&&(!best||String(s.at||s.date||'')>best.t))best={t:String(s.at||s.date||''),own:!!m.own};});});
  return !!best?.own;
}
// 💰 מחיר חומר האריזה — **למנהל בלבד** (23/10/2026, החלטת המשתמש). אחראי/עובד/עוזר שסורק
// "יצא ללקוח" רושם כמויות בלי לראות מחיר. תצוגה בלבד: המחיר עדיין נצרב על המשלוח.
function canSeePackPrice(){return S.user?.role==='manager';}
// 📦 (25/10/2026) הזמנה שהוגדר לה חומר אריזה בכרטיס המוצר (p.cons עם מפתחות PACK_MATS) — רק החומרים
// שלה מתמלאים: כמות × ליחידה (data-per), "של הלקוח" כפי שהוגדר. בלי הגדרה — כמו קודם (צלופן לפי הכמות).
function shipMatRowsHtml(cust,p){
  const inp='flex:1;min-width:0;font-size:13px;padding:6px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const hid=canSeePackPrice()?'':'display:none;';
  const pc=new Map((Array.isArray(p?.cons)?p.cons:[]).filter(c=>c&&PACK_MATS.some(m=>m.k===c.id)&&(+c.n||0)>0).map(c=>[c.id,c]));
  return PACK_MATS.map(m=>{
    const c=pc.get(m.k),auto=pc.size?!!c:!!m.autoQty;
    const pr=packPrice(m.k),own=c?!!c.own:(cust?custMatOwn(cust,m.k):false);
    return `<div class="mat-row" data-k="${m.k}" data-cust="${esc(cust||'')}" style="margin-bottom:7px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;font-weight:600;min-width:76px">${esc(m.name)}</span>
        <input class="mat-n" type="number" inputmode="numeric" min="0" value="" data-auto="${auto?'1':'0'}" data-per="${c?+c.n:1}"
          placeholder="${auto?(c&&+c.n!==1?'× '+(+c.n)+' לפי הכמות':'לפי הכמות'):'ידני'}" oninput="this.dataset.auto='0';shipMatTotal()" style="${inp}"/>
        <span class="mat-pr" style="${hid}font-size:11px;white-space:nowrap;color:${pr||m.incl?'var(--txt3)':'var(--amber-txt)'}">${m.incl?'כלול בצלופן':'× '+(pr?dnMoney(pr):'אין מחיר')}</span>
        <span class="mat-eq" style="${hid}font-size:12px;font-weight:800;min-width:58px;text-align:left;color:var(--txt3)">—</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:var(--txt3);margin-right:82px;margin-top:1px">
        <span style="flex:1">${esc(m.hint)}<span class="mat-stk" style="display:block;font-weight:700"></span></span>
        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--txt2,var(--txt));white-space:nowrap;cursor:pointer"><input type="checkbox" class="mat-own"${own?' checked':''} onchange="shipMatTotal()" style="width:14px;height:14px;margin:0"/> 👤 של הלקוח</label>
      </div>
    </div>`;
  }).join('');
}
// כמות הצלופן עוקבת אחרי הכמות שיוצאת — בקיפול כל פריט נארז בשק — **עד שנגעו בה**.
// `data-auto` מתאפס ב-oninput, ולכן תיקון ידני לא נדרס בעדכון הבא של הכמויות.
function shipMatSyncAuto(){
  const q=_shipQtySum();
  document.querySelectorAll('.mat-row .mat-n').forEach(i=>{if(i.dataset.auto==='1')i.value=q?Math.ceil(q*(+i.dataset.per||1)):'';});
  shipMatTotal();
}
function _shipMatsCollect(){
  return [...document.querySelectorAll('.mat-row')].map(r=>{
    const own=!!r.querySelector('.mat-own')?.checked;
    return {k:r.dataset.k,n:Math.max(0,parseInt(r.querySelector('.mat-n')?.value)||0),
      price:own?0:packPrice(r.dataset.k),...(own?{own:true}:{})};
  }).filter(x=>x.n>0);
}
function shipMatTotal(){
  let bal={};try{bal=pstkCalc();}catch(e){}
  document.querySelectorAll('.mat-row').forEach(r=>{
    const own=!!r.querySelector('.mat-own')?.checked;
    // 📦 יתרת המלאי הרלוונטי (הלקוח / המפעל) ומה יישאר אחרי המשלוח — רק לחומר שנספר
    const sk=r.querySelector('.mat-stk'),key=(own?r.dataset.cust:PSTK_F)+'|'+r.dataset.k;
    if(sk){const nn=Math.max(0,parseInt(r.querySelector('.mat-n')?.value)||0);
      if(key in bal){const left=bal[key]-nn;sk.textContent='📦 במלאי '+(own?'הלקוח':'המפעל')+': '+bal[key]+(nn?' ← יישארו '+left:'');sk.style.color=left<0?'var(--red-txt)':'var(--txt3)';}
      else sk.textContent='';}
    const n=Math.max(0,parseInt(r.querySelector('.mat-n')?.value)||0),pr=own?0:packPrice(r.dataset.k);
    const eq=r.querySelector('.mat-eq'),ps=r.querySelector('.mat-pr');
    const inc=packIncl(r.dataset.k);
    if(ps){ps.textContent=own?'של הלקוח':inc?'כלול בצלופן':'× '+(pr?dnMoney(pr):'אין מחיר');ps.style.color=own||pr||inc?'var(--txt3)':'var(--amber-txt)';}
    if(eq){eq.textContent=n?(own||inc?'ללא חיוב':dnMoney(n*pr)):'—';eq.style.color=n?'var(--txt)':'var(--txt3)';}
  });
  const el=document.getElementById('mat-sum');
  if(!el)return;
  const mats=_shipMatsCollect();
  const mode=packModeOf(mats);
  if(!mode){el.textContent='לא הוזנה כמות';el.style.color='var(--txt3)';return;}
  // חומר בלי מחיר במחירון **לא חוסם** — הכמות עדיין נרשמת ונצרבת, והדוח יסמן
  // אותה. חסימה כאן הייתה עוצרת משלוח אמיתי בגלל שדה שכחו למלא בניהול.
  const no=mats.filter(m=>!m.price&&!m.own&&!packIncl(m.k)).map(m=>packMatName(m.k));
  const ow=mats.filter(m=>m.own).map(m=>packMatName(m.k));
  if(!canSeePackPrice()){el.textContent=PACK_MODES[mode]+(ow.length?' · 👤 של הלקוח: '+ow.join(', '):'');el.style.color='var(--green-txt,#16a34a)';return;}
  el.textContent=PACK_MODES[mode]+' · '+dnMoney(mats.reduce((t,m)=>t+m.n*m.price,0))
    +(ow.length?' · 👤 של הלקוח: '+ow.join(', '):'')+(no.length?' ⚠ אין מחיר: '+no.join(', '):'');
  el.style.color=no.length?'var(--amber-txt)':'var(--green-txt,#16a34a)';
}
function shipRowsTotal(){
  const t=_shipQtySum(),el=document.getElementById('ship-total');
  {const ue=document.getElementById('ship-unsewn');if(ue)ue.textContent=_shipUnsewnSum()||'';}
  if(el){
    el.textContent=t;
    // חריגה מהכמות שבהזמנה **מסומנת ולא נחסמת** — לפעמים באמת יוצא יותר ממה שתוכנן.
    // ההשוואה היא על **סכום שני הסוגים** לאותה מידה+צבע: 12 סוג א ועוד 1 סוג ב על
    // שורה של 12 היא חריגה אמיתית, אבל כל שדה בנפרד נראה תקין.
    const per=new Map();
    document.querySelectorAll('.ship-row-inp').forEach(i=>{
      const k=i.dataset.size+'|'+i.dataset.color;
      per.set(k,{sum:(per.get(k)?.sum||0)+(parseInt(i.value)||0),max:+i.dataset.max||0});
    });
    const over=[...per.values()].some(v=>v.sum>v.max);
    el.style.color=over?'var(--amber-txt)':'var(--green-txt,#16a34a)';
    // 🟠 חריגה **מותרת ולא נחסמת** — לפעמים באמת יוצא יותר ממה שהוזמן. הצבע הכתום
    // לבדו נקרא כמו שגיאה שחוסמת, ולכן נאמר במפורש כמה עודף יירשם.
    const extra=[...per.values()].reduce((t,v)=>t+Math.max(0,v.sum-v.max),0);
    const ov=document.getElementById('ship-over');
    if(ov){
      ov.style.display=extra?'block':'none';
      if(extra)ov.textContent='⚠ '+extra+" יח' מעל הכמות שנותרה בהזמנה — מותר, יירשם וידפיס כעודף בתעודה";
    }
  }
  try{shipPackTotal();}catch(e){}
  try{shipMatSyncAuto();}catch(e){}
  return t;
}
// ─── מספר הזמנה פר-דגם ────────────────────────────────────────
// המספור הוא **פר לקוח+מוצר** ולא גלובלי: הזמנה חוזרת של אותו דגם היא #002, בלי
// קשר לכמה הזמנות נפתחו בינתיים לדגמים אחרים. 61 הרשומות הקיימות מוספרו ב-24/08.
function nextOrderNo(cust,prod){
  const mx=prodMatches(cust,prod).reduce((m,p)=>Math.max(m,parseInt(p.orderNo,10)||0),0);
  return Math.min(999,mx+1);
}
// החותמת שכל מוצר **חדש** מקבל ברגע ההקמה. bcLen=16 הוא בדיוק הכלל שנקבע:
// "מוצר שיוקם אחרי ההתקנה מקבל 16 ספרות". רשומות קיימות אין להן את השדה ⇒ 13 לנצח,
// והמדבקות שתלויות במפעל ממשיכות לעבוד עד שההזמנות האלה ייצאו ללקוח.
// 🔢 נצפה חי 17/09: שני כרטיסי "דגם ראשון" ל-04191 הוקמו בהפרש 2.5 דקות ושניהם קיבלו #001 —
// המכשיר של השני עוד לא ראה את הראשון ברשימה המקומית. לכן נבדקת גם הרשימה בשרת;
// אופליין או שגיאה ⇒ נופלים לרשימה המקומית כמו קודם
async function newProdOrderFields(cust,prod){
  let orderNo=nextOrderNo(cust,prod);
  if(db&&S.fbConnected)try{
    const{collection,query,where,getDocsFromServer}=window._fb;
    const snap=await getDocsFromServer(query(collection(db,'products'),where('cust','==',cust),where('prod','==',prod)));
    const mx=snap.docs.reduce((m,d)=>Math.max(m,parseInt(d.data().orderNo,10)||0),0);
    orderNo=Math.max(orderNo,Math.min(999,mx+1));
  }catch(e){console.warn('orderNo:',e.message);}
  return{orderNo,bcLen:BC_LEN_NEW};
}
// ברקוד "יצא ללקוח" בן 13 ספרות הוא לקוח+מוצר בלבד — הוא לא מבדיל בין שתי הזמנות של
// אותו מספר דגם. ברקוד בן 16 נושא את מספר ההזמנה ומכריע לבד.
//
// 🔑 שני העולמות מופרדים, וזה מה שסוגר את תקלת 02691:
//   • 16 ספרות ⇒ נבחרת הרשומה שה-orderNo שלה תואם. חד-משמעי.
//   • 13 ספרות ⇒ מדבקה מלפני השינוי, ולכן היא **לא יכולה** להצביע על הזמנה חדשה.
//     המועמדות מצטמצמות לרשומות בלי bcLen. נשארה אחת — נבחרת אוטומטית.
//     נשארו כמה — הוותיקה ביותר שטרם יצאה (ההזמנה שיוצאת היא כמעט תמיד הישנה,
//     וברירת המחדל הישנה "החדשה ביותר" היא בדיוק מה שהפיל את 02691 ב-24/08).
//   • אם הסינון לא הותיר כלום (המדבקה שרדה את מחיקת הרשומה) — נופלים לכל הרשומות
//     ולא חוסמים. עדיף בורר עם כל האפשרויות מאשר מסך מת.
// 02/09366 29/07: הדגל נכתב על רשומת דוגמה בת יחידה אחת במקום על ההזמנה בת 90.
function openShipModal(cust,prod,orderNo){
  const all=prodMatches(cust,prod);
  if(!all.length){showToast('⚠ מוצר לא נמצא: '+cust+'-'+prod,'var(--red-txt)',5000);return;}
  const no=parseInt(orderNo,10)||0;
  let pick=null;
  if(no>0){
    pick=all.find(x=>(parseInt(x.orderNo,10)||0)===no)||null;
    if(!pick)showToast('⚠ הזמנה #'+String(no).padStart(3,'0')+' לא נמצאה — בחר ידנית','var(--amber-txt)',6000);
  }else{
    const legacy=all.filter(x=>x.bcLen!==BC_LEN_NEW);
    const pool=legacy.length?legacy:all;
    if(pool.length===1)pick=pool[0];
    else{
      const open=pool.filter(x=>x.shippedQty==null);
      pick=(open.length?open:pool).slice(-1)[0]; // prodMatches ממוין חדש→ישן, לכן האחרון הוא הוותיק
    }
  }
  const p=pick||all[0];
  // getTotalQty כ-fallback: הוא נופל ל-_bcLastGen כשעדיין אין quantities שמורות (ברקודים שזה עתה נוצרו)
  const planned=_prodQty(p)||getTotalQty(cust,prod)||0;
  const cur=p.shippedQty!=null?p.shippedQty:planned;
  const opts=all.map(x=>{
    const q=_prodQty(x);
    const d=+x.createdAt?new Date(+x.createdAt):null;
    const ds=d?' · נפתחה '+pad2(d.getDate())+'/'+pad2(d.getMonth()+1):'';
    const sh=x.shippedQty!=null?' · כבר יצא '+x.shippedQty:'';
    const on=(parseInt(x.orderNo,10)||0)?'#'+String(x.orderNo).padStart(3,'0')+' ':'';
    return `<option value="${esc(x.id)}"${x.id===p.id?' selected':''}>${on}${esc(x.name||'(בלי שם)')} — ${q} יח'${ds}${sh}</option>`;
  }).join('');
  const multi=all.length>1;
  closeShipModal();
  const wrap=document.createElement('div');
  wrap.id='ship-modal-wrap';
  // 📜 החלון גולל: רשימת צבעים ארוכה (20+ שורות) גלשה מתחת לקצה המסך ואי אפשר
  // היה להגיע לכפתור האישור — בנייד ובמחשב כאחד. הגלילה היא על השכבה, והכרטיס
  // ממורכז ב-margin:auto ולא ב-align-items:center (שחותך את הראש בקונטיינר גולל).
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  // 🛑 09/10: לא נסגר בלחיצה על הרקע — כמויות לפי מידה/צבע שהוזנו הלכו לאיבוד (כמו חלון המוצר)
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:4px">🚚 יצא ללקוח</div>
    <div style="font-size:13px;color:var(--txt3);margin-bottom:12px"><span class="bc-seg bc-c">לקוח ${esc(cust)}</span> <span class="bc-seg bc-p">${esc(prod)}</span> ${multi?'':esc(p.name||'')}</div>
    ${multi?(no>0&&pick
      ?`<div style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-size:12px;font-weight:700;padding:7px 9px;border-radius:8px;margin-bottom:8px">🔢 הברקוד מכיל מספר הזמנה — נבחרה אוטומטית הזמנה #${String(no).padStart(3,'0')}</div>`
      :`<div style="background:var(--amber-bg);color:var(--amber-txt);font-size:12px;font-weight:700;padding:7px 9px;border-radius:8px;margin-bottom:8px">⚠ יש ${all.length} רשומות למספר הדגם הזה — ודא שזו ההזמנה שיצאה</div>`):''}
    <select id="ship-prod-sel" onchange="shipPickChanged()" style="width:100%;font-size:13px;padding:8px;margin-bottom:10px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt);${multi?'':'display:none'}">${opts}</select>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:8px">כמות מתוכננת בהזמנה: <b id="ship-planned" style="color:var(--txt)">${planned}</b> יח'</div>
    <label style="font-size:13px;font-weight:600">כמות בפועל שיצאה — פר מידה וצבע</label>
    <div id="ship-rows-wrap" style="margin-top:6px">${shipRowsHtml(p)}</div>
    <div style="font-size:11px;color:var(--txt3);margin-top:4px">משלוח חלקי: השאר בשורות שלא יצאו 0. הסכום נרשם אוטומטית.</div>
    <details id="ship-pack-det" style="margin-top:10px;border:1px solid var(--brd);border-radius:8px;padding:7px 9px">
      <summary style="font-size:12px;font-weight:700;cursor:pointer">📦 אריזה — <span id="pack-sum" style="font-weight:600;color:var(--txt3)">לא הוזנה</span></summary>
      <div style="font-size:11px;color:var(--txt3);margin:7px 0">כל גודל חבילה בשורה: 35 חבילות × 5 יח'. שורה נוספת לכל גודל אחר.</div>
      <div id="pack-rows">${shipPackRowsHtml([])}</div>
      <button class="btn" style="width:100%;font-size:12px;padding:5px;margin-top:4px" onclick="addPackRow()">➕ עוד גודל חבילה</button>
      ${shipOuterHtml([])}
    </details>
    <div style="margin-top:10px;border:1px solid var(--brd);border-radius:8px;padding:7px 9px">
      <div style="font-size:12px;font-weight:700;margin-bottom:2px">📦 חומר אריזה — <span id="mat-sum" style="font-weight:600;color:var(--txt3)">לא הוזנה כמות</span></div>
      <div style="font-size:11px;color:var(--txt3);margin-bottom:7px">רשום מה נארז בפועל. מצב המשלוח נקבע לפי זה, והחומר מחויב ללקוח בדוח ההתחשבנות.</div>
      <div id="ship-mat-rows">${shipMatRowsHtml(p.cust,p)}</div>
    </div>
    <div style="margin-top:9px">
      <label style="font-size:12px;font-weight:600">📝 הערה לתעודה</label>
      <input id="ship-note" type="text" maxlength="140" placeholder="לא חובה — תודפס בתעודה" style="width:100%;margin-top:4px;font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>
    </div>
    ${shipOrigHtml(0)}
    <label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;margin-top:10px;cursor:pointer">
      <input type="checkbox" id="ship-autoprint"${S.settings?.dnAutoPrint===false?'':' checked'} style="width:16px;height:16px"/>
      🖨 הדפס את התעודה מיד אחרי האישור
    </label>
    ${S.user?.role==='manager'?`<details id="ship-past" style="margin-top:10px;border:1px dashed var(--brd);border-radius:8px;padding:6px 9px">
      <summary style="font-size:12px;font-weight:600;cursor:pointer">📅 משלוח מתאריך קודם (רישום בדיעבד)</summary>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <input id="ship-past-date" type="date" max="${todayStr()}" style="font-size:13px;padding:6px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer"><input id="ship-past-nonum" type="checkbox" style="width:auto"/> בלי מספר תעודה</label>
      </div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">למשלוח שיצא בפועל ולא נרשם. "בלי מספר" — כמו התעודות שלפני המספור; אחרת יינתן המספר הבא בתור.</div>
    </details>`:''}
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn primary" style="flex:1;font-size:14px" onclick="confirmShip()">✅ אשר יציאה</button>
      <button class="btn" style="flex:1;font-size:14px" onclick="closeShipModal()">ביטול</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  setTimeout(()=>{shipRowsTotal();const i=document.getElementById('ship-qty-inp')||document.querySelector('.ship-row-inp');if(i){i.focus();i.select();}},50);
}
function closeShipModal(){document.getElementById('ship-modal-wrap')?.remove();_shipRestore=null;}
// 🚚 "יצא ללקוח" מכרטיס המוצר (09/10/2026) — בלי לסרוק/להקליד ברקוד. נבחרת **הרשומה הזו**
// בבורר, גם כשלדגם כמה הזמנות וגם בהזמנה ישנה בלי מספר (שם הבורר היה בוחר את האחרונה)
function shipFromProduct(id){
  const p=(S.products||[]).find(x=>x.id===id);if(!p)return;
  openShipModal(p.cust,p.prod,parseInt(p.orderNo,10)||0);
  const sel=document.getElementById('ship-prod-sel');
  if(sel&&sel.value!==id&&[...sel.options].some(o=>o.value===id)){sel.value=id;shipPickChanged();}
}
// ♻ שחזור תעודה שנמחקה בטעות (09/10/2026): היומן (dnVoids) שומר רק סיכום — לא מידות/צבעים/אריזה.
// לכן פותחים את חלון "יצא ללקוח" הרגיל, מזינים לפי העותק המודפס, והאישור נרשם **באותו מספר
// ובאותו תאריך** במקום מספר חדש. מספר שחזר לרשומה חיה יוצא מרשימת הבוטלות לבד (dnVoidRows).
let _shipRestore=null;
async function restoreVoidNote(no){
  if(S.user?.role!=='manager')return;
  const v=dnVoidLog().find(x=>+x.no===+no);
  if(!v){showToast('⚠ אין רישום לתעודה הזו','var(--red-txt)');return;}
  if(allDeliveryNotes().some(r=>+r.s.no===+no)){showToast('⚠ תעודה '+String(no).padStart(4,'0')+' כבר קיימת','var(--amber-txt)');return;}
  const hd=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  if(!await showConfirm('♻ שחזור תעודה '+String(no).padStart(4,'0'),'ייפתח חלון "יצא ללקוח" של '+(v.name||v.prod)+'.\nהזן את הכמויות והאריזה לפי העותק המודפס ('+(+v.total||0)+" יח').\nהתעודה תישמר במספר "+String(no).padStart(4,'0')+' ובתאריך '+hd(v.date)+'.','המשך','ביטול'))return;
  openShipModal(v.cust,v.prod,v.orderNo);
  const box=document.getElementById('ship-modal-wrap')?.firstElementChild;
  if(!box)return;
  _shipRestore={no:+v.no,date:v.date||todayStr()};
  box.insertAdjacentHTML('afterbegin',`<div style="background:var(--amber-bg);color:var(--amber-txt);font-size:12px;font-weight:700;padding:8px 10px;border-radius:8px;margin-bottom:10px">♻ שחזור תעודה ${String(no).padStart(4,'0')} מ-${hd(v.date)} — במקור ${+v.total||0} יח'. ודא שנבחרה ההזמנה הנכונה.</div>`);
}
// מונה תעודות משלוח — **בטרנזקציה**. שני מנהלים שמוציאים סחורה באותו רגע חייבים לקבל
// מספרים שונים; מונה מקומי היה מנפיק את אותו מספר פעמיים בשקט. הבסיס נלקח גם מהרשומות
// הקיימות כדי שמונה שאופס בטעות לא ימחזר מספר שכבר הודפס ונמסר ללקוח.
async function nextDeliveryNoteNo(){
  const localMax=()=>(S.products||[]).reduce((m,x)=>Math.max(m,parseInt(x.dnNo,10)||0),0);
  // 🔢 המספור ממשיך את הפנקס הידני ולא מתחיל מ-1. dnStart = **המספר הראשון שיונפק**,
  // ולכן הבסיס הוא dnStart-1. אחרי ההנפקה הראשונה localMax כבר גדול ממנו ומוביל.
  const base=()=>Math.max(localMax(),(parseInt(S.settings?.dnStart,10)||1)-1);
  if(!db||!S.fbConnected)return base()+1;
  try{
    const{doc,runTransaction}=window._fb;
    let out=0;
    await runTransaction(db,async tx=>{
      const ref=doc(db,'appSettings','deliveryNote');
      const s=await tx.get(ref);
      const cur=s.exists()?(parseInt(s.data().last,10)||0):0;
      out=Math.max(cur,base())+1;
      tx.set(ref,{last:out},{merge:true});
    });
    return out;
  }catch(e){console.warn('dnNo:',e.message);return base()+1;}
}
// 🧾 מספר חשבונית עסקה — מונה משותף בטרנזקציה (כמו התעודות), ויומן קצר של מה שהונפק:
// מספר, תאריך, לקוח, תעודות וסכומים — כדי שאפשר יהיה לדעת בדיעבד מה יצא בכל מספר.
async function nextProformaNo(rec){
  const base=()=>Math.max(+S.settings?.invLast||0,(parseInt(S.settings?.invStart,10)||1)-1);
  let out=0;
  if(db&&S.fbConnected){
    try{
      const{doc,runTransaction}=window._fb;
      await runTransaction(db,async tx=>{
        const ref=doc(db,'appSettings','proformaInvoice');
        const d=await tx.get(ref);
        const cur=d.exists()?(parseInt(d.data().last,10)||0):0;
        out=Math.max(cur,base())+1;
        tx.set(ref,{last:out},{merge:true});
        // 🧾 החשבונית נשמרת ב-proformaInvoices/{מספר} — באותה טרנזקציה, כך שאין מספר
        // שננעל בלי רשומה. האוסף פתוח רק ל-canPricing (יש בו מחירים).
        tx.set(doc(db,'proformaInvoices',String(out)),{...rec,no:out,at:Date.now()});
      });
    }catch(e){console.warn('invNo:',e.message);out=0;}
  }
  // 🛑 בלי חיבור לא מנפיקים — מספר שנבחר במכשיר מנותק עלול להתנגש במספר שהונפק במקביל
  if(!out)return 0;
  S.settings.invLast=out;saveLS();
  return out;
}
async function printProforma(onlySel){
  const f=dnFiltered(!!onlySel);
  if(!f.rows.length){showToast('⚠ אין תעודות לחשבונית','var(--red-txt)');return;}
  const custs=dnCustomers(f.rows);
  // חשבונית היא ללקוח אחד — מסמך עם כמה לקוחות אי אפשר למסור לאף אחד מהם
  if(custs.length!==1){showToast('⚠ חשבונית עסקה היא ללקוח אחד — בחר לקוח בבורר הלקוחות','var(--red-txt)',5000);return;}
  if(f.missing){showToast('⚠ '+f.missing+' תעודות בלי מחיר בכרטיס המוצר — יש להזין מחיר לפני הפקת חשבונית','var(--red-txt)',6000);return;}
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור — אי אפשר להנפיק מספר חשבונית','var(--red-txt)');return;}
  // 🛑 09/10: תעודה שכבר בחשבונית לא מבוטלת ⇒ חיוב כפול. נבדק מול רשימה טרייה מהשרת
  try{await _pfLoad();_pfAt=Date.now();}catch(e){}
  const _dup=f.rows.map(r=>dnInvOf(r)).filter(Boolean);
  if(_dup.length&&!await showConfirm('⚠ תעודות שכבר הותחשבנו',_dup.length+' מהתעודות כבר כלולות בחשבונית '+[...new Set(_dup.map(d=>(d.manual?'ידנית ':'')+d.no))].join(', ')+'.\nהפקה נוספת תחייב אותן פעמיים. להפיק בכל זאת?','הפק בכל זאת','חזור'))return;
  const vat=+(S.settings?.vatPct??18)||0;
  const vatAmt=Math.round(f.amount*vat)/100,total=f.amount+vatAmt;
  // 📅 חודש ההתחשבנות — ברירת מחדל: **החודש הקודם** להיום. לא לפי תאריך התעודה האחרונה:
  // תעודות של תחילת החודש (01–03/10) נכנסות לא פעם להתחשבנות של החודש שהסתיים (09).
  const _t=todayStr(),_pm=new Date(+_t.slice(0,4),+_t.slice(5,7)-2,1);
  const meta=await askProformaMeta({month:_pm.getFullYear()+'-'+pad2(_pm.getMonth()+1),title:'🧾 חשבונית עסקה',
    summary:`ללקוח: <b>${esc(custs[0].name)}</b><br>${f.rows.length} תעודות · לפני מע"מ ${dnMoney(f.amount)}<br>מע"מ ${vat}%: ${dnMoney(vatAmt)}<br><b>סה"כ לתשלום: ${dnMoney(total)}</b><br><span style="font-size:11px">יונפק מספר חדש (${Math.max(+S.settings?.invLast||0,(parseInt(S.settings?.invStart,10)||1)-1)+1} או הבא בתור).</span>`,
    ok:'הפק והדפס'});
  if(!meta)return;
  // 📸 תמונת מצב של השורות — הדפסה חוזרת יוצאת זהה גם אם מחיר בכרטיס המוצר השתנה מאז
  const rows=f.rows.map(r=>({no:+r.s.no||0,date:r.s.date||'',cust:r.p.cust||'',name:r.p.name||r.p.prod||'',orderNo:r.p.orderNo||'',
    qty:r.qty,sew:r.pr.sew,cut:r.pr.cut,mat:r.pr.mat||0,pack:r.pack,packMode:r.s.packMode||'',amount:r.amount}));
  const no=await nextProformaNo({date:meta.date,month:meta.month,issuedOn:todayStr(),cust:custs[0].code,custName:custs[0].name,from:f.from||'',to:f.to||'',
    notes:rows.map(r=>r.no).filter(Boolean),rows,units:f.units,work:f.work,pack:f.pack,matList:f.matList.map(m=>({k:m.k,n:m.n,amount:m.amount,...(m.own?{own:true}:{})})),
    net:f.amount,vatPct:vat,vat:vatAmt,total,by:S.user?.name||'',byId:S.user?.id||''});
  if(!no){showToast('⚠ הנפקת המספר נכשלה — נסה שוב','var(--red-txt)');return;}
  _pfEnsure(true); // התעודות מסומנות 🧾 מיד
  printSettlement(onlySel,false,{no,vat,vatAmt,total,date:meta.date,month:meta.month});
}
// היום האחרון בחודש (YYYY-MM ⇒ YYYY-MM-DD)
function monthEnd(ym){const[y,m]=ym.split('-').map(Number);return ym+'-'+pad2(new Date(y,m,0).getDate());}
// 📅 חלון חודש ההתחשבנות + תאריך החשבונית. בחירת חודש ממלאת את התאריך לסוף החודש
// (אפשר לשנות). מחזיר {month,date} או null.
function askProformaMeta(o){
  return new Promise(res=>{
    document.getElementById('pfm-wrap')?.remove();
    const wrap=document.createElement('div');wrap.id='pfm-wrap';
    wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px';
    const m=o.month||todayStr().slice(0,7),d=o.date||monthEnd(m);
    wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-size:16px;font-weight:800;margin-bottom:8px">${o.title||'🧾 חשבונית עסקה'}</div>
      ${o.summary?`<div style="font-size:13px;line-height:1.7;margin-bottom:12px">${o.summary}</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="field" style="margin:0"><label>📅 חודש ההתחשבנות</label><input type="month" id="pfm-month" value="${m}" style="font-size:14px"/></div>
        <div class="field" style="margin:0"><label>תאריך החשבונית</label><input type="date" id="pfm-date" value="${d}" style="font-size:14px"/></div>
      </div>
      <div style="font-size:11px;color:var(--txt3);margin-top:6px">בחירת חודש קובעת את התאריך לסוף החודש. התעודות שבחשבונית לא משתנות.</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn primary" style="flex:1" id="pfm-ok">${o.ok||'שמור'}</button>
        <button class="btn" style="flex:1" id="pfm-no">ביטול</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const done=v=>{wrap.remove();res(v);};
    document.getElementById('pfm-month').onchange=e=>{if(e.target.value)document.getElementById('pfm-date').value=monthEnd(e.target.value);};
    document.getElementById('pfm-ok').onclick=()=>{
      const mm=document.getElementById('pfm-month').value,dd=document.getElementById('pfm-date').value;
      if(!mm||!dd){alert('בחר חודש ותאריך');return;}
      done({month:mm,date:dd});
    };
    document.getElementById('pfm-no').onclick=()=>done(null);
  });
}
// ✏️ תיקון חודש/תאריך של חשבונית שכבר הופקה (מנהל) — המספר והסכומים לא משתנים
async function editProformaDate(no){
  if(S.user?.role!=='manager')return;
  const d=_pfList.find(x=>+x.no===+no);if(!d)return;
  // חשבונית בלי חודש (הופקה לפני 04/10/2026) ⇒ ברירת מחדל: החודש שלפני תאריך ההפקה, ותאריך = סוף אותו חודש
  let _m=d.month,_d=d.date;
  if(!_m){const x=String(d.date||todayStr());const pm=new Date(+x.slice(0,4),+x.slice(5,7)-2,1);_m=pm.getFullYear()+'-'+pad2(pm.getMonth()+1);_d=monthEnd(_m);}
  const meta=await askProformaMeta({month:_m,date:_d,title:'✏️ חשבונית עסקה '+no+' — חודש ותאריך'});
  if(!meta)return;
  try{await fbSet('proformaInvoices',String(no),meta);Object.assign(d,meta);renderProformaList();showToast('✅ עודכן');}
  catch(e){showToast('⚠ העדכון נכשל: '+(e.message||''),'var(--red-txt)');}
}
// 🔁 מתמונת המצב השמורה בחזרה לצורה ש-printSettlement מקבל
function proformaToF(d){
  const rows=(d.rows||[]).map(r=>({p:{cust:r.cust,name:r.name,orderNo:r.orderNo},s:{no:r.no,date:r.date,packMode:r.packMode},
    qty:+r.qty||0,pr:{sew:+r.sew||0,cut:+r.cut||0,mat:+r.mat||0,unit:(+r.sew||0)+(+r.cut||0)+(+r.mat||0),missing:false},pack:+r.pack||0,amount:+r.amount||0}));
  return {rows,units:+d.units||0,work:+d.work||0,pack:+d.pack||0,amount:+d.net||0,missing:0,noPrice:0,
    matList:(d.matList||[]).map(m=>({...m})),from:d.from||'',to:d.to||'',q:'',cust:d.cust||''};
}
// 📜 רשימת חשבוניות העסקה שהופקו
let _pfList=[];
async function _pfLoad(){
  const{collection,getDocs}=window._fb;
  const snap=await getDocs(collection(db,'proformaInvoices'));
  // _id = מזהה המסמך: בחשבונית רגילה = המספר, בחשבונית ידנית (📒) = manual_...
  // הידניות בסוף: כל ה-find(+x.no===no) של החשבוניות הרגילות פוגש קודם את הרגילה גם אם מספר מהפנקס זהה
  _pfList=snap.docs.map(d=>({...d.data(),_id:d.id})).sort((a,b)=>(!!a.manual-!!b.manual)||(+b.no||0)-(+a.no||0));
}
async function openProformaList(){
  if(!_canPricing()){showToast('⚠ אין הרשאה לחשבוניות','var(--red-txt)');return;}
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור','var(--red-txt)');return;}
  document.getElementById('pfl-wrap')?.remove();
  const wrap=document.createElement('div');
  wrap.id='pfl-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:900px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:16px;font-weight:800">🧾 חשבוניות עסקה</div>
      <button class="btn" style="font-size:12px" onclick="document.getElementById('pfl-wrap').remove()">סגור</button>
    </div>
    <div id="pfl-body" style="font-size:13px;color:var(--txt3)">טוען…</div>
  </div>`;
  document.body.appendChild(wrap);
  try{
    await _pfLoad();
  }catch(e){
    const b=document.getElementById('pfl-body');if(b)b.innerHTML='<span style="color:var(--red-txt)">⚠ טעינה נכשלה: '+esc(e.message||'')+'</span>';return;
  }
  renderProformaList();
}
function renderProformaList(){
  const box=document.getElementById('pfl-body');if(!box)return;
  if(!_pfList.length){box.innerHTML='עדיין לא הופקו חשבוניות עסקה.';return;}
  const hd=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  const isMgr=S.user?.role==='manager';
  box.innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>מס'</th><th>תאריך</th><th>חודש</th><th>לקוח</th><th style="text-align:center">תעודות</th><th style="text-align:center">לפני מע"מ</th><th style="text-align:center">סה"כ</th><th>תשלום</th><th>חשבונית מס</th><th>הופק ע"י</th><th></th></tr></thead>
    <tbody>${_pfList.map(d=>`<tr${d.void?' style="opacity:.55"':''}>
      <td><b>${esc(String(d.no))}</b>${d.manual?' <span style="font-size:10px;color:var(--txt3)">📒 ידנית</span>':''}${d.void?' <span style="color:var(--red-txt);font-size:11px;font-weight:700">מבוטלת</span>':''}</td>
      <td style="white-space:nowrap">${hd(d.date)}</td>
      <td style="white-space:nowrap">${d.month?d.month.slice(5,7)+'/'+d.month.slice(0,4):'—'}</td>
      <td>${esc(d.custName||S.customerNames?.[d.cust]||d.cust||'')}</td>
      <td style="text-align:center" title="${esc((d.notes||[]).map(n=>String(n).padStart(4,'0')).join(', '))}">${(d.notes||[]).length+(d.keys||[]).length}</td>
      <td style="text-align:center;white-space:nowrap">${dnMoney(d.net)}</td>
      <td style="text-align:center;white-space:nowrap;font-weight:700${d.void?';text-decoration:line-through':''}">${dnMoney(d.total)}</td>
      <td style="font-size:12px;white-space:nowrap">${pfPayCell(d)}</td>
      <td style="font-size:12px;white-space:nowrap">${pfTaxCell(d)}</td>
      <td style="font-size:12px;color:var(--txt3)">${esc(d.by||'')}${d.void&&d.voidBy?'<div style="font-size:10px">בוטלה ע"י '+esc(d.voidBy)+'</div>':''}</td>
      <td style="white-space:nowrap;text-align:left">${d.manual?`
        ${!d.void||(d.checks||[]).length?`<button class="btn" style="font-size:11px;padding:4px 9px" onclick="openInvChecks('${escj(d._id)}')">💳 שיקים${(d.checks||[]).length?' ('+d.checks.length+')':''}</button>`:''}
        ${isMgr&&!d.void&&!(d.checks||[]).length?`<button class="btn" style="font-size:11px;padding:4px 9px" onclick="pfManualPaid('${escj(d._id)}')">${d.paid?'↩ סמן לא שולם':'✅ סמן שולם'}</button>`:''}
        ${isMgr&&!d.void?`
        <button class="btn" style="font-size:11px;padding:4px 9px;color:var(--red-txt)" onclick="pfManualVoid('${escj(d._id)}')">🚫 בטל</button>`:''}`:`
        ${!d.void||(d.checks||[]).length?`<button class="btn" style="font-size:11px;padding:4px 9px" onclick="openInvChecks('${escj(d._id)}')">💳 שיקים${(d.checks||[]).length?' ('+d.checks.length+')':''}</button>`:''}
        ${d.rows?`<button class="btn" style="font-size:11px;padding:4px 9px" onclick="reprintProforma(${+d.no})">🖨 הדפס שוב</button>`:'<span style="font-size:10px;color:var(--txt3)">אין פירוט שמור</span>'}
        ${isMgr&&!d.void?`<button class="btn" style="font-size:11px;padding:4px 9px" title="חודש ותאריך" onclick="editProformaDate(${+d.no})">✏️</button>`:''}
        ${isMgr&&!d.void?`<button class="btn" style="font-size:11px;padding:4px 9px;color:var(--red-txt)" onclick="voidProforma(${+d.no})">🚫 בטל</button>`:''}`}
      </td></tr>`).join('')}</tbody></table></div>
    <div style="font-size:11px;color:var(--txt3);margin-top:8px">הדפסה חוזרת יוצאת באותו מספר ובאותם סכומים שהיו בהפקה, ומסומנת "העתק". חשבונית מבוטלת נשארת ברשימה — המספר לא חוזר לשימוש.</div>`;
}
function reprintProforma(no){
  const d=_pfList.find(x=>+x.no===+no);if(!d||!d.rows)return;
  printSettlement(false,false,{no:+d.no,vat:+d.vatPct||0,vatAmt:+d.vat||0,total:+d.total||0,f:proformaToF(d),date:d.date,month:d.month,copy:true,void:!!d.void});
}
async function voidProforma(no){
  if(S.user?.role!=='manager')return;
  const d=_pfList.find(x=>+x.no===+no);if(!d)return;
  if(!await showConfirm('ביטול חשבונית עסקה','לבטל את חשבונית עסקה מס\' '+no+' ('+dnMoney(d.total)+')?\nהיא תישאר ברשימה כמבוטלת, והמספר לא יחזור לשימוש.','בטל חשבונית','חזור'))return;
  const upd={void:true,voidBy:S.user?.name||'',voidAt:Date.now()};
  try{await fbSet('proformaInvoices',String(no),upd);Object.assign(d,upd);renderProformaList();renderDNotes();showToast('🚫 חשבונית '+no+' בוטלה');}
  catch(e){showToast('⚠ הביטול נכשל: '+(e.message||''),'var(--red-txt)');}
}
