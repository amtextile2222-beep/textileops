// ─── 📦 מלאי חומרים — אריזה / תפירה / גזירה (23/10/2026) ─────────
// appSettings/packStock = {moves:[{id,at,pool,k,t,n,note,by,byName,edits}], min:{'pool|k':n},
//   items:[{id,name,dept,unit,own,cust}]}.
// k = חומר אריזה מובנה (PACK_MATS: hanger/clip/nylon/cello/paper) או מזהה פריט שהמנהל הגדיר (items).
// pool = 'F' (המפעל קנה) או קוד לקוח (חומר שהלקוח סיפק). t: in=קבלה · out=הוצאה ידנית · count=ספירה.
// 🔑 היתרה **מחושבת ולא נשמרת**: תנועות פחות מה שיצא בתעודות, מהתנועה הראשונה של אותו מלאי+חומר
// ואילך ⇒ עריכה/מחיקה של תעודה מתקנת את המלאי לבד. חומר אריזה מובנה — לפי mats בתעודה (own ⇒ מלאי
// הלקוח); פריט — צריכה ליחידה בכרטיס המוצר (p.cons=[{id,n}]) × יחידות התעודה; item.own ⇒ מלאי הלקוח.
// appSettings פתוח לכתיבה לכל מחובר — ההרשאה (מנהל/אחראי) נאכפת במסך בלבד.
// 🔗 החישוב משותף לשרת (דף הלקוח): stockBalances/stockNeed ב-functions/shared/calc.js
const PSTK_F='F';
const PSTK_T={in:'📥 קבלה',out:'📤 הוצאה',count:'🔢 ספירה'};
const PSTK_BTN={pack:'📦 מלאי אריזה',sew:'🧵 מלאי תפירה',cut:'✂️ מלאי גזירה'};
const PSTK_UNITS=["יח'",'מטר','גליל','ק"ג'];
let _pstkDept='pack';
function canPackStock(){return ['manager','supervisor'].includes(S.user?.role);}
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): _shipMs
function pstkPoolName(pool){return pool===PSTK_F?'🏭 המפעל':'👤 '+(S.customerNames?.[pool]||('לקוח '+pool));}
const pstkFmt=n=>String(Math.round((+n||0)*100)/100);
function pstkItems(){return Array.isArray(S.packStock?.items)?S.packStock.items:[];}
function pstkItem(k){return stockItemOf(pstkItems(),k);}
function pstkItemName(k){return pstkItem(k)?.name||k;}
function pstkUnit(k){const u=pstkItem(k)?.unit||"יח'";return u==="יח'"?'':' '+u;}
// 📐 פריט לפי מידה (30/10/2026) — תווית שם+מידה / תווית מידה: i.bySize ⇒ יתרה, מינימום ו"נדרש" לכל מידה
// בנפרד. מפתח = מלאי|פריט|מידה, תנועה נושאת s, וההוצאה בתעודה = הצריכה ליחידה × יחידות **המידה** (שורות
// התעודה בלי "לא תפור"). תעודה ישנה בלי שורות לא יורדת ממלאי לפי מידה.
const pstkBySize=k=>!!pstkItem(k)?.bySize;
const PSTK_SIZES=['0','1','2','3','4','5','6','7','8','9'];
const pstkSizeUnits=stockSizeUnits;
// שם להצגה של מפתח (מלאי|פריט[|מידה])
function pstkKeyName(key){const[,k,z]=String(key).split('|');return pstkItemName(k)+(z!=null?' · מידה '+z:'');}
// אילו חומרים שייכים למלאי: אריזה מובנית — לשניהם (own נקבע בתעודה); פריט שהלקוח מספק (own) — רק
// למלאי לקוח, ורק ללקוח שלו אם הוגדר; פריט שהמפעל קונה — רק למלאי המפעל
function pstkItemsFor(pool,dept){
  const b=dept==='pack'?PACK_MATS.map(m=>pstkItem(m.k)):[];
  return b.concat(pstkItems().filter(i=>i.dept===dept&&(pool===PSTK_F?!i.own:(i.own&&(!i.cust||i.cust===pool)))));
}
// 🔗 החישוב עצמו — stockBalances ב-functions/shared/calc.js (אותו קוד מחשב את המלאי בדף הלקוח)
function pstkCalc(){return stockBalances(S.packStock,S.products);}
// 📋 נדרש להזמנות פתוחות (25/10/2026): לכל הזמנה פתוחה — יחידות שעוד לא יצאו (כמות, או משוערת) ×
// הצריכה ליחידה בכרטיס המוצר (p.cons, כולל חומר אריזה מובנה). פתוחה = נשארו יחידות, לא דגם, ולא נסגרה:
// דחיפה ידנית ל"מוכן ליציאה"/"יצא" (= סגירה בחוסר), או תעודה אחרונה לפני 21 יום. מפתח = מלאי|חומר
function pstkNeed(){return stockNeed(S.packStock,S.products,Date.now());}
// חומר שנספר ואין ממנו מספיק להזמנות הפתוחות
function pstkShortKeys(bal,need){return Object.keys(need).filter(k=>k in bal&&bal[k]<need[k]-0.0001);}
function pstkLowKeys(bal){
  const min=(S.packStock||{}).min||{};
  return Object.keys(min).filter(k=>(+min[k]||0)>0&&k in bal&&bal[k]<+min[k]);
}
// 🔔 נקרא אחרי פעולה שמזיזה מלאי (תעודה / תנועה) עם היתרות שלפניה: מתריע רק על מי
// **שירד עכשיו** מתחת למינימום — המכשיר שביצע את הפעולה שולח, ולכן אין כפילויות.
function pstkAlert(before){
  try{
    const after=pstkCalc(),min=(S.packStock||{}).min||{};
    const fresh=pstkLowKeys(after).filter(k=>!(k in (before||{}))||before[k]>=+min[k]);
    pstkBadge();
    if(!fresh.length)return;
    const lines=fresh.map(k=>{const[pool,mk]=k.split('|');return '• '+pstkKeyName(k)+' — '+pstkPoolName(pool)+': נשארו '+pstkFmt(after[k])+pstkUnit(mk)+' (מינימום '+min[k]+')';});
    showToast('⚠ מלאי נמוך: '+fresh.map(pstkKeyName).join(', '),'var(--amber-txt)',6000);
    sendTelegram('📦 מלאי חומרים נמוך\n'+lines.join('\n'));
  }catch(e){}
}
function pstkBadge(){
  const low={};
  // ⚠ על הכפתור = חומרים מתחת למינימום **או** שאין מהם מספיק להזמנות הפתוחות (כל מפתח פעם אחת)
  try{const bal=pstkCalc();new Set([...pstkLowKeys(bal),...pstkShortKeys(bal,pstkNeed().need)]).forEach(k=>{const d=pstkItem(k.split('|')[1])?.dept;if(d)low[d]=(low[d]||0)+1;});}catch(e){}
  document.querySelectorAll('.pstk-btn').forEach(b=>{
    const d=b.dataset.dept||'pack';
    b.style.display=canPackStock()?'':'none';
    b.textContent=PSTK_BTN[d]+(low[d]?' ⚠ '+low[d]:'');
    b.style.color=low[d]?'var(--amber-txt)':'';
  });
}
async function pstkWrite(fn){
  if(!S.fbConnected||!db){alert('אין חיבור לשרת — המלאי משותף לכל המכשירים ונרשם רק כשיש חיבור');return false;}
  const{doc,runTransaction}=window._fb;const ref=doc(db,'appSettings','packStock');
  try{
    await _pw(runTransaction(db,async tx=>{
      const sn=await tx.get(ref);const d=sn.exists()?sn.data():{};
      const nd=fn({...d,moves:Array.isArray(d.moves)?d.moves.slice():[],min:{...(d.min||{})},items:Array.isArray(d.items)?d.items.slice():[]});
      tx.set(ref,nd);S.packStock=nd;
    }));
    return true;
  }catch(e){alert('השמירה נכשלה: '+(e?.message||e));return false;}
}
// חלון המלאי של מחלקה — יתרות לפי מלאי (המפעל / כל לקוח) + רישום תנועה + 30 התנועות האחרונות
// + (מנהל) ניהול הפריטים. אחראי רושם קבלה בלבד; הוצאה, ספירה, מינימום, פריטים ומחיקה — מנהל.
function openPackStock(dept){
  if(!canPackStock())return;
  _pstkDept=PSTK_BTN[dept]?dept:'pack';
  _pstkEditId=null;
  document.getElementById('pstk-wrap')?.remove();
  const wrap=document.createElement('div');
  wrap.id='pstk-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  const inp='font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const mgr=S.user?.role==='manager';
  const custs=Object.keys(S.customerNames||{}).sort();
  const help=_pstkDept==='pack'
    ?'כל חומר נספר מהרישום הראשון שלו (רצוי ספירה). מאותו רגע כל תעודה מורידה ממנו לבד: חומר שסומן "👤 של הלקוח" יורד ממלאי הלקוח, ושאר החומר יורד ממלאי המפעל.'
    :'כל פריט נספר מהרישום הראשון שלו (רצוי ספירה). מאותו רגע כל תעודת משלוח מורידה ממנו לבד: הצריכה ליחידה שבכרטיס המוצר × היחידות שיצאו. פריט שהלקוח מספק יורד ממלאי הלקוח.';
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:520px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-size:16px;font-weight:800">${PSTK_BTN[_pstkDept]}</div>
      <button class="btn" style="font-size:12px;padding:4px 10px" onclick="document.getElementById('pstk-wrap')?.remove()">✕</button>
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:10px">${help}</div>
    <div id="pstk-bal"></div>
    <div style="margin-top:12px;border:1px solid var(--brd);border-radius:10px;padding:10px">
      <div id="pstk-ftl" style="font-size:13px;font-weight:700;margin-bottom:7px">➕ רישום תנועה</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <select id="pstk-pool" onchange="pstkFillItems()" style="${inp}"><option value="${PSTK_F}">🏭 המפעל (קנינו)</option>${custs.map(c=>`<option value="${esc(c)}">👤 ${esc(S.customerNames[c])} (${esc(c)})</option>`).join('')}</select>
        <select id="pstk-k" onchange="pstkSzShow()" style="${inp}"></select>
        <select id="pstk-s" style="${inp};display:none;grid-column:1/-1"><option value="">📐 בחר מידה…</option>${PSTK_SIZES.map(z=>`<option value="${z}">מידה ${z}</option>`).join('')}</select>
        <select id="pstk-t" style="${inp}">${Object.entries(PSTK_T).filter(([t])=>mgr||t==='in').map(([t,l])=>`<option value="${t}">${l}${t==='count'?' — כמה יש בפועל':''}</option>`).join('')}</select>
        <input id="pstk-n" type="number" inputmode="decimal" min="0" step="any" placeholder="כמות" style="${inp}"/>
      </div>
      <input id="pstk-note" type="text" maxlength="80" placeholder="הערה (לא חובה) — ספק, מספר תעודה של הלקוח…" style="${inp};width:100%;margin-top:6px"/>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button id="pstk-save" class="btn primary" style="flex:1;font-size:14px" onclick="pstkAdd()">💾 רשום</button>
        <button id="pstk-cancel" class="btn" style="font-size:14px;display:none" onclick="pstkEditReset()">ביטול תיקון</button>
      </div>
    </div>
    ${mgr?`<details id="pstk-items-det" style="margin-top:12px;border:1px dashed var(--brd);border-radius:10px;padding:8px 10px"${_pstkDept!=='pack'&&!pstkItems().some(i=>i.dept===_pstkDept)?' open':''}>
      <summary style="font-size:13px;font-weight:700;cursor:pointer">⚙️ פריטים במלאי ${PSTK_BTN[_pstkDept].replace(/^\S+ מלאי /,'')}</summary>
      <div style="font-size:11px;color:var(--txt3);margin:6px 0">לכל פריט: שם, יחידה, ומי מספק אותו. פריט של לקוח אחד בלבד (למשל התווית שלו) — בחר את הלקוח. הצריכה ליחידה נרשמת בכרטיס המוצר.</div>
      <div id="pstk-items"></div>
    </details>`:''}
    <div style="font-size:13px;font-weight:700;margin:12px 0 5px">🕘 תנועות אחרונות</div>
    <div id="pstk-moves"></div>
  </div>`;
  document.body.appendChild(wrap);
  pstkFillItems();
  renderPackStock();
}
// בורר החומר בטופס — לפי המלאי שנבחר (המפעל / לקוח) והמחלקה; שומר את הבחירה כשהיא עדיין קיימת
function pstkFillItems(){
  const sel=document.getElementById('pstk-k');if(!sel)return;
  const pool=document.getElementById('pstk-pool')?.value||PSTK_F,cur=sel.value;
  const list=pstkItemsFor(pool,_pstkDept);
  sel.innerHTML=list.length?list.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}${i.unit&&i.unit!=="יח'"?' ('+esc(i.unit)+')':''}</option>`).join('')
    :`<option value="">— אין פריטים ל${pool===PSTK_F?'מפעל':'לקוח הזה'} —</option>`;
  if(list.some(i=>i.id===cur))sel.value=cur;
  pstkSzShow();
}
// 📐 בורר המידה מוצג רק לפריט לפי מידה
function pstkSzShow(){const el=document.getElementById('pstk-s');if(el)el.style.display=pstkBySize(document.getElementById('pstk-k')?.value)?'':'none';}
function renderPackStock(){
  const box=document.getElementById('pstk-bal'),mv=document.getElementById('pstk-moves');
  if(!box||!mv)return;
  const dept=_pstkDept,mgr=S.user?.role==='manager',st=S.packStock||{},min=st.min||{},bal=pstkCalc();
  const {need,cnt}=pstkNeed();
  const inDept=k=>pstkItem(k)?.dept===dept;
  const custPools=[...new Set([...(st.moves||[]).filter(m=>inDept(m.k)).map(m=>m.pool),
    ...Object.keys(min).filter(k=>inDept(k.split('|')[1])).map(k=>k.split('|')[0]),
    ...Object.keys(need).filter(k=>inDept(k.split('|')[1])).map(k=>k.split('|')[0])].filter(p=>p&&p!==PSTK_F))]; // 📋 גם לקוח שרק נדרש לו
  const pools=[PSTK_F,...custPools].filter(pool=>pstkItemsFor(pool,dept).length);
  box.innerHTML=pools.length?pools.map(pool=>`<div style="border:1px solid var(--brd);border-radius:10px;margin-bottom:8px;overflow:hidden">
    <div style="font-size:13px;font-weight:700;padding:6px 10px;background:var(--bg)">${esc(pstkPoolName(pool))}</div>
    ${pstkItemsFor(pool,dept).flatMap(m=>{
      // 📐 לפי מידה — שורה לכל מידה שנספרה / נדרשת / יש לה מינימום (בלי אף אחת — שורה אחת "לא נספר")
      if(!m.bySize)return [[pool+'|'+m.id,m.name]];
      const pre=pool+'|'+m.id+'|',zs=[...new Set([...Object.keys(bal),...Object.keys(need),...Object.keys(min)].filter(k=>k.startsWith(pre)).map(k=>k.slice(pre.length)))].sort();
      return zs.length?zs.map(z=>[pre+z,m.name+' · מידה '+z]):[[pre+'?',m.name+' (לפי מידה — רשום ספירה לכל מידה)']];
    }).map(([key,label],ri,ra)=>{const m={id:key.split('|')[1]},has=key in bal,b=bal[key],mn=+min[key]||0,nd=need[key]||0,miss=has&&nd>0&&b<nd-0.0001,low=has&&mn>0&&b<mn||miss;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--brd);font-size:13px${low?';background:var(--red-bg,#fee2e2)':''}">
        <span style="flex:1">${esc(label)}${nd>0?`<div style="font-size:11px;font-weight:600;color:${miss?'var(--red-txt)':'var(--txt3)'}">📋 נדרש ${pstkFmt(nd)}${esc(pstkUnit(m.id))} ${cnt[key]===1?'להזמנה פתוחה אחת':'ל-'+cnt[key]+' הזמנות פתוחות'}${miss?' · חסר '+pstkFmt(nd-b):has?' · יש מספיק':''}</div>`:''}</span>
        ${mgr&&pool!==PSTK_F&&(!ri||ra[ri-1][0].split('|')[1]!==m.id)?(()=>{const im=+(st.imgs||{})[pool+'|'+m.id];
          return `<button class="btn" style="font-size:12px;padding:3px 6px${im?';border-color:var(--green-txt)':''}" title="${im?'תמונת החומר בדף הלקוח — הצג / החלף / מחק':'הוסף תמונה — מוצגת ללקוח בדף המעקב'}" onclick="pstkImg('${escj(pool)}','${escj(m.id)}')">${im?'🖼':'📷'}</button>`;})():''}
        <b style="min-width:70px;text-align:center;color:${!has?'var(--txt3)':b<0||low?'var(--red-txt)':'var(--txt)'}">${has?pstkFmt(b)+esc(pstkUnit(m.id)):'לא נספר'}</b>
        <span style="font-size:11px;color:var(--txt3)">מינימום</span>
        ${mgr&&!key.endsWith('|?')?`<input type="number" min="0" step="any" value="${mn||''}" placeholder="—" onchange="pstkSetMin('${escj(key)}',this.value)" style="width:64px;font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>`
          :`<span style="width:40px;text-align:center;font-size:12px">${mn||'—'}</span>`}
      </div>`;}).join('')}
  </div>`).join(''):`<div style="font-size:12px;color:var(--txt3);padding:6px 2px">${mgr?'עדיין לא הוגדרו פריטים במחלקה הזו — הוסף אותם ב"⚙️ פריטים" למטה.':'עדיין לא הוגדרו פריטים במחלקה הזו.'}</div>`;
  const moves=(st.moves||[]).filter(m=>inDept(m.k)).sort((a,b)=>b.at-a.at).slice(0,30);
  const fmt=t=>{const d=new Date(+t);return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());};
  mv.innerHTML=moves.length?moves.map(m=>`<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:5px 2px;border-bottom:1px solid var(--brd)">
      <span style="flex:1">${fmt(m.at)} · ${PSTK_T[m.t]||m.t} <b dir="ltr" style="unicode-bidi:isolate">${m.t==='out'?'−':m.t==='in'?'+':''}${pstkFmt(m.n)}</b>${esc(pstkUnit(m.k))} ${esc(pstkItemName(m.k))}${m.s!=null&&pstkBySize(m.k)?' · מידה '+esc(m.s):''} · ${esc(pstkPoolName(m.pool))}${m.note?' · '+esc(m.note):''}<span style="color:var(--txt3)"> · ${esc(m.byName||'')}</span>${pstkEditTip(m)}</span>
      ${pstkCanEdit(m)?`<button class="btn" style="font-size:11px;padding:3px 7px" title="תיקון" onclick="pstkStartEdit('${escj(m.id)}')">✏️</button>`:''}
      ${mgr?`<button class="btn" style="font-size:11px;padding:3px 7px" onclick="pstkDel('${escj(m.id)}')">🗑</button>`:''}
    </div>`).join(''):'<div style="font-size:12px;color:var(--txt3)">עדיין לא נרשמה שום תנועה. התחל בספירה של מה שיש היום במלאי.</div>';
  renderPstkItems();
}
// 🖼 תמונת חומר של לקוח (08/11/2026) — מוצגת ליד החומר בדף המעקב. thumbs/pk_<לקוח>_<פריט> + packStock.imgs (ראה _prodThumb)
async function pstkImg(pool,id){
  if(S.user?.role!=='manager')return;
  if(!S.fbConnected){alert('אין חיבור לשרת');return;}
  const ik=pool+'|'+id,tid='pk_'+pool+'_'+id,nm=pstkItemName(id);
  if(+((S.packStock||{}).imgs||{})[ik]){
    const c=await showConfirm3('🖼 '+nm,'התמונה מוצגת ל'+pstkPoolName(pool).replace(/^\S+ /,'')+' בדף המעקב, ליד החומר.','👁 הצג','📷 החלף','🗑 מחק');
    if(c===0){const d=await fbGet('thumbs',tid).catch(()=>null);if(d?.img)viewImg(null,d.img);else alert('התמונה לא נמצאה');return;}
    if(c===2){if(!await showConfirm('מחיקת תמונה','למחוק את התמונה של "'+nm+'"? הלקוח לא יראה אותה יותר.','מחק','ביטול'))return;
      try{await fbDel('thumbs',tid);}catch(e){}
      if(await pstkWrite(d=>{const imgs={...(d.imgs||{})};delete imgs[ik];return {...d,imgs};})){showToast('🗑 התמונה נמחקה');renderPackStock();}
      return;}
  }
  const fi=document.createElement('input');fi.type='file';fi.accept='image/*';
  fi.onchange=async()=>{const file=fi.files?.[0];if(!file)return;
    let img='';try{img=await compressImageFile(file,800,0.75);}catch(e){}
    if(!img){alert('לא הצלחתי לקרוא את התמונה');return;}
    const at=Date.now();
    try{await fbSet('thumbs',tid,{img,at});}catch(e){alert('שמירת התמונה נכשלה: '+(e?.message||e));return;}
    if(await pstkWrite(d=>({...d,imgs:{...(d.imgs||{}),[ik]:at}}))){showToast('✅ התמונה נשמרה — הלקוח יראה אותה ליד "'+nm+'"');renderPackStock();}};
  fi.click();
}
// ⚙️ ניהול הפריטים (מנהל): כל שינוי נשמר מיד. פריט שנמחק — גם התנועות והמינימום שלו נמחקים
function renderPstkItems(){
  const box=document.getElementById('pstk-items');if(!box)return;
  const custs=Object.keys(S.customerNames||{}).sort();
  const sl='font-size:12px;padding:5px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const custSel=(v,on)=>`<select ${on} style="${sl};flex:1;min-width:0"><option value="">כל הלקוחות</option>${custs.map(c=>`<option value="${esc(c)}"${c===v?' selected':''}>${esc(S.customerNames[c])}</option>`).join('')}</select>`;
  // 📐 שם בשורה מלאה משלו: ב-flex ליד <select> שדה השם נדחס לרוחב 0 (נצפה 23/10 — "הזן שם לפריט" בלי שדה גלוי)
  const unitSel=(v,on)=>`<select ${on} style="${sl};flex:0 0 auto;width:90px">${PSTK_UNITS.map(u=>`<option${u===v?' selected':''}>${esc(u)}</option>`).join('')}</select>`;
  const list=pstkItems().filter(i=>i.dept===_pstkDept);
  box.innerHTML=list.map(i=>`<div style="border-bottom:1px solid var(--brd);padding:6px 0">
      <div style="display:flex;gap:5px;align-items:center">
        <input value="${esc(i.name)}" onchange="pstkItemSet('${escj(i.id)}','name',this.value)" style="${sl};flex:1 1 auto;min-width:120px;width:100%"/>
        ${unitSel(i.unit,`onchange="pstkItemSet('${escj(i.id)}','unit',this.value)"`)}
        <button class="btn" style="font-size:11px;padding:3px 7px;flex:0 0 auto" onclick="pstkItemDel('${escj(i.id)}')">🗑</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px;font-size:12px">
        <label style="display:flex;align-items:center;gap:3px;white-space:nowrap;cursor:pointer"><input type="checkbox"${i.own?' checked':''} onchange="pstkItemSet('${escj(i.id)}','own',this.checked)" style="width:14px;height:14px;margin:0"/> 👤 הלקוח מספק</label>
        ${i.own?custSel(i.cust||'',`onchange="pstkItemSet('${escj(i.id)}','cust',this.value)"`):'<span style="color:var(--txt3)">🏭 המפעל קונה</span>'}
      </div>
      <label style="display:flex;align-items:center;gap:3px;margin-top:4px;font-size:12px;cursor:pointer"><input type="checkbox"${i.bySize?' checked':''} onchange="pstkItemSet('${escj(i.id)}','bySize',this.checked)" style="width:14px;height:14px;margin:0"/> 📐 לפי מידה <span style="color:var(--txt3)">(תווית מידה / שם+מידה — יתרה לכל מידה)</span></label>
    </div>`).join('')+`<div style="padding-top:8px">
      <div style="font-size:12px;font-weight:700;margin-bottom:4px">➕ פריט חדש</div>
      <input id="pstk-ni-name" placeholder="שם הפריט — למשל תווית ראשית" style="${sl};display:block;width:100%;box-sizing:border-box;font-size:13px;padding:7px"/>
      <div style="display:flex;gap:5px;align-items:center;margin-top:4px;font-size:12px">
        <span style="color:var(--txt3)">יחידה</span>${unitSel("יח'",'id="pstk-ni-unit"')}
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px;font-size:12px">
        <label style="display:flex;align-items:center;gap:3px;white-space:nowrap;cursor:pointer"><input id="pstk-ni-own" type="checkbox" checked style="width:14px;height:14px;margin:0"/> 👤 הלקוח מספק</label>
        ${custSel('','id="pstk-ni-cust"')}
      </div>
      <label style="display:flex;align-items:center;gap:3px;margin-top:4px;font-size:12px;cursor:pointer"><input id="pstk-ni-sz" type="checkbox" style="width:14px;height:14px;margin:0"/> 📐 לפי מידה <span style="color:var(--txt3)">(תווית מידה / שם+מידה)</span></label>
      <button class="btn" style="width:100%;margin-top:6px;font-size:13px" onclick="pstkItemAdd()">➕ הוסף פריט</button>
    </div>`;
}
async function pstkItemAdd(){
  if(S.user?.role!=='manager')return;
  const name=(document.getElementById('pstk-ni-name')?.value||'').trim();
  if(!name){alert('הזן שם לפריט');return;}
  const own=!!document.getElementById('pstk-ni-own')?.checked;
  const it={id:'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name,dept:_pstkDept,
    unit:document.getElementById('pstk-ni-unit')?.value||"יח'",own,cust:own?(document.getElementById('pstk-ni-cust')?.value||''):'',
    ...(document.getElementById('pstk-ni-sz')?.checked?{bySize:true}:{})};
  if(await pstkWrite(d=>({...d,items:d.items.concat([it])}))){showToast('✅ נוסף: '+name);pstkFillItems();renderPackStock();}
}
async function pstkItemSet(id,f,v){
  if(S.user?.role!=='manager')return;
  if(f==='name'&&!String(v).trim()){renderPackStock();return;}
  if(f==='bySize'&&((S.packStock||{}).moves||[]).some(m=>m.k===id)
    &&!await showConfirm('ספירה לפי מידה',v?'לפריט כבר יש תנועות בלי מידה — הן לא ייספרו בספירה לפי מידה. אחרי השינוי רשום ספירה לכל מידה. להמשיך?':'התנועות לפי מידה יתחברו ליתרה אחת. להמשיך?','המשך','ביטול')){renderPackStock();return;}
  if(f==='own'&&((S.packStock||{}).moves||[]).some(m=>m.k===id)
    &&!await showConfirm('שינוי מי מספק','לפריט כבר יש תנועות במלאי '+(v?'המפעל':'הלקוח')+'. אחרי השינוי הוא ייספר במלאי '+(v?'הלקוח':'המפעל')+', והתנועות הקודמות יישארו בצד. להמשיך?','המשך','ביטול')){renderPackStock();return;}
  if(await pstkWrite(d=>({...d,items:d.items.map(i=>i.id!==id?i:{...i,[f]:f==='name'?String(v).trim():v,...(f==='own'&&!v?{cust:''}:{})})}))){pstkFillItems();renderPackStock();}
}
async function pstkItemDel(id){
  if(S.user?.role!=='manager')return;
  const it=pstkItem(id),nMv=((S.packStock||{}).moves||[]).filter(m=>m.k===id).length;
  if(!await showConfirm('מחיקת פריט','למחוק את "'+(it?.name||'')+'"?'+(nMv?' יימחקו גם '+nMv+' התנועות שלו.':'')+' הצריכה שהוגדרה במוצרים תפסיק להיספר.','מחק','ביטול'))return;
  if(await pstkWrite(d=>{const min={...d.min};Object.keys(min).forEach(k=>{if(k.split('|')[1]===id)delete min[k];});
    return {...d,items:d.items.filter(i=>i.id!==id),moves:d.moves.filter(m=>m.k!==id),min};})){pstkFillItems();renderPackStock();pstkBadge();}
}
// ✏️ תיקון תנועה: מנהל — כל תנועה; אחראי — רק קבלה שהוא עצמו רשם היום (טעות הקלדה מיידית).
// הזמן (at) לא משתנה ⇒ התנועה נשארת במקומה ביחס לתעודות. edits = יומן תיקונים (מה היה, מי תיקן)
let _pstkEditId=null;
function pstkCanEdit(m){
  if(S.user?.role==='manager')return true;
  return S.user?.role==='supervisor'&&m.t==='in'&&m.by===S.user?.id&&new Date(+m.at).toDateString()===new Date().toDateString();
}
function pstkEditTip(m){
  const e=Array.isArray(m.edits)?m.edits:[];if(!e.length)return '';
  const l=e[e.length-1];
  return ` <span title="${esc('תוקן'+(e.length>1?' '+e.length+' פעמים':'')+' · היה '+pstkFmt(l.n)+' '+pstkItemName(l.k)+(l.byName?' · '+l.byName:''))}" style="color:var(--amber-txt)">✏️</span>`;
}
function pstkStartEdit(id){
  const m=((S.packStock||{}).moves||[]).find(x=>x.id===id);
  if(!m||!pstkCanEdit(m))return;
  _pstkEditId=id;
  const set=(i,v)=>{const el=document.getElementById(i);if(el)el.value=v;};
  set('pstk-pool',m.pool);pstkFillItems();set('pstk-k',m.k);pstkSzShow();set('pstk-s',m.s??'');set('pstk-t',m.t);set('pstk-n',+m.n||0);set('pstk-note',m.note||'');
  document.getElementById('pstk-ftl').textContent='✏️ תיקון תנועה מ-'+new Date(+m.at).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'});
  document.getElementById('pstk-save').textContent='💾 שמור תיקון';
  document.getElementById('pstk-cancel').style.display='';
  document.getElementById('pstk-n')?.focus();
}
function pstkEditReset(){
  _pstkEditId=null;
  const ftl=document.getElementById('pstk-ftl');if(ftl)ftl.textContent='➕ רישום תנועה';
  const sv=document.getElementById('pstk-save');if(sv)sv.textContent='💾 רשום';
  const cn=document.getElementById('pstk-cancel');if(cn)cn.style.display='none';
  ['pstk-n','pstk-note'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
}
async function pstkAdd(){
  const pool=document.getElementById('pstk-pool')?.value||PSTK_F,k=document.getElementById('pstk-k')?.value,t=document.getElementById('pstk-t')?.value||'in';
  const n=Math.round(Math.max(0,parseFloat(document.getElementById('pstk-n')?.value)||0)*1000)/1000,note=(document.getElementById('pstk-note')?.value||'').trim();
  if(t!=='in'&&S.user?.role!=='manager')return;
  if(!k||!pstkItem(k)){alert('בחר חומר');return;}
  const sz=pstkBySize(k)?(document.getElementById('pstk-s')?.value||''):null;
  if(sz==='')return alert('בחר מידה — הפריט נספר לפי מידה');
  // תיקון ל-0 = התנועה כולה נרשמה בטעות ⇒ מציעים למחוק אותה (גם אחראי — רק את מה שמותר לו לתקן)
  if(!n&&t!=='count'&&_pstkEditId){
    const id=_pstkEditId,old=((S.packStock||{}).moves||[]).find(x=>x.id===id);
    if(!old||!pstkCanEdit(old)){pstkEditReset();return;}
    if(!await showConfirm('תיקון ל-0','כמות 0 = התנועה לא הייתה. למחוק את התנועה ('+PSTK_T[old.t]+' '+pstkFmt(old.n)+' '+pstkItemName(old.k)+')?','מחק','חזור'))return;
    const before=pstkCalc();
    if(!await pstkWrite(d=>({...d,moves:d.moves.filter(m=>m.id!==id)})))return;
    pstkEditReset();showToast('🗑 התנועה נמחקה');renderPackStock();pstkAlert(before);
    return;
  }
  if(!n&&t!=='count'){alert('הזן כמות');return;}
  const before=pstkCalc();
  if(_pstkEditId){
    const id=_pstkEditId,old=((S.packStock||{}).moves||[]).find(x=>x.id===id);
    if(!old||!pstkCanEdit(old)){pstkEditReset();return;}
    const ed={at:Date.now(),by:S.user?.id||'',byName:S.user?.name||'',pool:old.pool,k:old.k,t:old.t,n:+old.n||0,...(old.s!=null?{s:old.s}:{})};
    if(!await pstkWrite(d=>({...d,moves:d.moves.map(m=>{
      if(m.id!==id)return m;
      const x={...m,pool,k,t,n,edits:(Array.isArray(m.edits)?m.edits:[]).concat([ed]).slice(-10)};
      if(sz!=null)x.s=sz;else delete x.s;
      if(note)x.note=note;else delete x.note;
      return x;})})))return;
    pstkEditReset();
    showToast('✅ התנועה תוקנה · '+pstkFmt(old.n)+' ← '+pstkFmt(n)+' '+pstkItemName(k));
    renderPackStock();pstkAlert(before);
    return;
  }
  const mv={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:Date.now(),pool,k,t,n,
    ...(sz!=null?{s:sz}:{}),...(note?{note}:{}),by:S.user?.id||'',byName:S.user?.name||''};
  if(!await pstkWrite(d=>({...d,moves:d.moves.concat([mv])})))return;
  document.getElementById('pstk-n').value='';document.getElementById('pstk-note').value='';
  showToast('✅ '+PSTK_T[t]+' · '+pstkFmt(n)+pstkUnit(k)+' '+pstkItemName(k)+(sz!=null?' · מידה '+sz:'')+' · '+pstkPoolName(pool));
  renderPackStock();pstkAlert(before);
}
async function pstkDel(id){
  if(S.user?.role!=='manager')return;
  if(!await showConfirm('מחיקת תנועה','למחוק את התנועה? היתרה תחושב מחדש.','מחק','ביטול'))return;
  if(await pstkWrite(d=>({...d,moves:d.moves.filter(m=>m.id!==id)}))){if(_pstkEditId===id)pstkEditReset();renderPackStock();}
}
async function pstkSetMin(key,v){
  if(S.user?.role!=='manager')return;
  const n=Math.max(0,parseFloat(v)||0);
  if(await pstkWrite(d=>{const min={...d.min};if(n)min[key]=n;else delete min[key];return {...d,min};})){renderPackStock();pstkBadge();}
}
// 🧵 צריכה ליחידה בכרטיס המוצר — פריטי המלאי שרלוונטיים ללקוח (כלליים + של הלקוח הזה).
// נשמר כ-p.cons=[{id,n}] (מערך ולא map: fbSet ממזג maps, ופריט שנמחק מהמפה היה נשאר במסמך)
// 📦 (25/10/2026) גם חומרי האריזה המובנים (PACK_MATS) — {id:'hanger',n,own}: לא יורדים מהמלאי לפי
// הצריכה (הם יורדים לפי mats בתעודה — אחרת ספירה כפולה; pstkCalc מדלג עליהם), אלא משמשים ל:
// מילוי מראש של חלון "יצא ללקוח" (כמות × ליחידה, "של הלקוח") ולחישוב "נדרש להזמנות" בחלון המלאי.
// own של חומר מובנה — ברירת מחדל לפי התעודה האחרונה של הלקוח (custMatOwn).
function pmConsHtml(cust,cons){
  const its=pstkItems().filter(i=>!i.cust||i.cust===cust);
  const cur=new Map((Array.isArray(cons)?cons:[]).map(c=>[c.id,c]));
  const inp='width:70px;font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)';
  const packRows=PACK_MATS.map(m=>{const c=cur.get(m.k),own=c?!!c.own:custMatOwn(cust,m.k);
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px">
      <span style="flex:1">${esc(m.name)}</span>
      <label style="display:flex;align-items:center;gap:3px;font-size:11px;white-space:nowrap;cursor:pointer"><input type="checkbox" class="pm-cons-own" data-id="${m.k}"${own?' checked':''} style="width:13px;height:13px;margin:0"/> 👤 של הלקוח</label>
      <input class="pm-cons" data-id="${m.k}" type="number" min="0" step="any" value="${c?(+c.n||''):''}" placeholder="0" style="${inp}"/>
      <span style="color:var(--txt3);min-width:60px">יח' ליחידה</span>
    </div>`;}).join('');
  const rowsOf=l=>l.map(i=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px">
      <span style="flex:1">${esc(i.name)}${i.own?' <span style="color:var(--txt3)">👤</span>':''}${i.bySize?' <span style="color:var(--txt3)" title="נספר לפי מידה">📐</span>':''}</span>
      <input class="pm-cons" data-id="${esc(i.id)}" type="number" min="0" step="any" value="${cur.get(i.id)?(+cur.get(i.id).n||''):''}" placeholder="0" style="${inp}"/>
      <span style="color:var(--txt3);min-width:60px">${esc(i.unit||"יח'")} ליחידה</span>
    </div>`).join('');
  const sec=t=>`<div style="font-size:11px;font-weight:700;color:var(--txt3);margin:6px 0 3px">${t}</div>`;
  return sec('📦 אריזה — חומר האריזה של ההזמנה (קיפול = צלופן + נייר A4 כשצריך · תלייה = קולב/קליפס + ניילון)')+packRows
    +['cut','sew','pack'].map(d=>{const l=its.filter(i=>i.dept===d);return l.length?sec(PSTK_BTN[d].replace('מלאי ','')+(d==='pack'?' — פריטים נוספים':''))+rowsOf(l):'';}).join('')
    +(!its.length&&S.user?.role==='manager'?'<div style="font-size:11px;color:var(--txt3);margin-top:4px">פריטי גזירה/תפירה (תוויות, פלזלין…) מגדירים בחלון "🧵 מלאי תפירה" / "✂️ מלאי גזירה" ← ⚙️ פריטים.</div>':'');
}
function pmConsCollect(){
  const own=new Set([...document.querySelectorAll('.pm-cons-own:checked')].map(i=>i.dataset.id));
  return [...document.querySelectorAll('.pm-cons')].map(i=>{const id=i.dataset.id,n=Math.round(Math.max(0,parseFloat(i.value)||0)*10000)/10000;
    return PACK_MATS.some(m=>m.k===id)?{id,n,own:own.has(id)}:{id,n};}).filter(c=>c.n>0);
}
// לקוח שהוקלד בחלון המוצר השתנה ⇒ רשימת הפריטים מתעדכנת; ערכים שכבר הוזנו נשמרים
function pmConsRefresh(){
  const box=document.getElementById('pm-cons');if(!box)return;
  const cust=(document.getElementById('pm-cust')?.value||'').trim().padStart(2,'0');
  box.innerHTML=pmConsHtml(cust,pmConsCollect());
}
// ─── 🧾 התחשבנות עם לקוח ──────────────────────────────────────
// מחיר העבודה ליחידה כפי שהוא רשום בכרטיס המוצר **היום**. ⚠ המחיר לא נצרב על
// רשומת המשלוח (`p.shipments[]` מחזיק no/date/rows/total בלבד) ⇒ עדכון מחיר לדגם
// משנה גם את ההתחשבנות של תעודות ישנות שלו. הוחלט להשאיר כך (20/09) — מי שמעדכן
// מחיר באמצע הזמנה צריך לדעת שזה רטרואקטיבי.
function dnUnitPrice(p){
  let sew=+p?.unitPrice||0;
  // 👕 דגם ראשון: הסימון בכרטיס ממלא SAMPLE_UNIT_PRICE, אבל דגם שסומן לפני שהפיצ'ר
  // נבנה (או שהמחיר נמחק ממנו) נשאר עם 0 — בלי הנפילה הזו הוא נספר כאפס בשקט.
  if(!sew&&p?.isSample)sew=SAMPLE_UNIT_PRICE;
  const cut=+p?.cutPrice||0;
  // ✂ הגזירה מתומחרת בנפרד מהתפירה ([[feature_cut_price]]) — הלקוח משלם את שתיהן,
  // ולכן שתי עמודות + סכום, ולא מספר אחד מאוחד שמסתיר ממה הוא מורכב.
  // 🧵 חומרים בתוספת — הלקוח משלם אותם מעבר לתפירה+גזירה. כמו שאר המחיר — מהכרטיס של היום.
  const mat=+p?.extraMatPrice||0;
  return {sew,cut,mat,unit:sew+cut+mat,missing:!sew};
}
function dnMoney(v){return '₪'+(+v||0).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2});}
// הלקוחות שיש להם בפועל תעודות — בורר שמציע לקוח בלי אף משלוח רק מבלבל.
function dnCustomers(rows){
  const codes=[...new Set(rows.map(r=>r.p.cust).filter(Boolean))].sort();
  return codes.map(c=>({code:c,name:S.customerNames?.[c]||('לקוח '+c)}));
}
// ☑ תעודות שסומנו בטבלה להדפסה. המפתח = מוצר|מיקום המשלוח במוצר (לא מספר התעודה —
// משלוח ותיק עדיין בלי מספר). הבחירה נשמרת בין רינדורים ומתנקה ממפתחות שכבר לא קיימים.
let _dnSel=new Set();
const dnKey=r=>r.p.id+'|'+r.i;
// שורות הדוח אחרי סינון — משותף לטבלה ולהדפסה, כדי שהנייר יהיה **בדיוק** מה שבמסך.
// `onlySel` ⇒ רק מה שסומן (ועדיין בתוך הסינון — תעודה מסומנת שהסינון מסתיר לא תודפס בהפתעה).
function dnFiltered(onlySel){
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const q=g('dn-search').toLowerCase(),cust=g('dn-cust'),from=g('dn-from'),to=g('dn-to'),pay=_canPricing()?g('dn-pay'):'';
  // משלוח בלי תאריך לא נופל מהסינון — עדיף להראות אותו מאשר להעלים תעודה שקיימת
  const rows=allDeliveryNotes().filter(r=>{
    if(onlySel&&!_dnSel.has(dnKey(r)))return false;
    const d=r.s.date||'';
    if(cust&&r.p.cust!==cust)return false;
    if(from&&d&&d<from)return false;
    if(to&&d&&d>to)return false;
    if(pay&&dnPayState(r)!==pay)return false;
    if(!q)return true;
    const hay=[String(r.s.no||''),String(r.s.no||'').padStart(4,'0'),r.p.cust||'',S.customerNames?.[r.p.cust]||'',
      r.p.prod||'',r.p.name||'',String(parseInt(r.p.orderNo,10)||'')].join(' ').toLowerCase();
    return hay.includes(q);
  });
  let units=0,work=0,pack=0,missing=0,noPrice=0;
  // 📦 פירוט החומרים מצטבר על פני כל התעודות בסינון — זה מה שהלקוח רוצה לאמת
  // ("כמה קולבים בכלל יצאו החודש"), ולא סכום אחד בלי ממה הוא מורכב.
  const mats=new Map();
  rows.forEach(r=>{
    r.pr=dnUnitPrice(r.p);
    r.qty=+r.s.total||0;
    // מחיר עבודה חסר ⇒ 0 ומסומן. חומר האריזה **כן** נספר גם אז — הכמות והמחיר
    // שלו נצרבו על התעודה ולכן הם ידועים בוודאות, בלי קשר לכרטיס המוצר.
    r.work=r.pr.missing?0:r.pr.unit*r.qty;
    r.mats=shipMats(r.s);
    r.pack=shipPackCost(r.s);
    r.amount=r.work+r.pack;
    // 👤 חומר של הלקוח — שורה נפרדת (own), בלי סכום ובלי "בלי מחיר"
    r.mats.forEach(m=>{
      const key=m.k+(m.own?'|own':'');
      const e=mats.get(key)||{k:m.k,n:0,amount:0,...(m.own?{own:true}:{})};
      e.n+=+m.n||0;if(!m.own)e.amount+=(+m.n||0)*(+m.price||0);
      if(!m.own&&!(+m.price)&&!packIncl(m.k))e.noPrice=true;
      mats.set(key,e);
    });
    if(r.mats.some(m=>!m.own&&!(+m.price)&&!packIncl(m.k)))noPrice++;
    units+=r.qty;work+=r.work;pack+=r.pack;
    if(r.pr.missing)missing++;
  });
  const matList=PACK_MATS.filter(d=>!d.incl).flatMap(d=>[mats.get(d.k),mats.get(d.k+'|own')]).filter(Boolean);
  return {rows,units,work,pack,amount:work+pack,missing,noPrice,matList,q,cust,from,to,pay};
}
function renderDNotes(){
  const box=document.getElementById('dnotes-list');
  if(!box)return;
  // בורר הלקוח נבנה מחדש בכל רינדור (נוספו תעודות ⇒ אולי נוסף לקוח), אבל **שומר
  // את הבחירה** — אחרת כל onSnapshot היה מאפס את הסינון תחת היד של המשתמש.
  const sel=document.getElementById('dn-cust');
  if(sel){
    const keep=sel.value;
    const opts=dnCustomers(allDeliveryNotes());
    const html='<option value="">כל הלקוחות</option>'+opts.map(c=>`<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
    if(sel.innerHTML!==html)sel.innerHTML=html;
    sel.value=opts.some(c=>c.code===keep)?keep:'';
  }
  const cp=_canPricing();
  const ps=document.getElementById('dn-pay');if(ps)ps.style.display=cp?'':'none';
  _pfEnsure();
  const f=dnFiltered(),rows=f.rows,voids=dnVoidRows(f);
  const packs=rows.reduce((t,r)=>t+packsCount(r.s.packs),0);
  // ☑ ניקוי בחירה של תעודות שנמחקו בינתיים
  const _live=new Set(allDeliveryNotes().map(dnKey));
  _dnSel=new Set([..._dnSel].filter(k=>_live.has(k)));
  const selVis=rows.filter(r=>_dnSel.has(dnKey(r))).length;
  dnSelLabel(selVis);
  const sum=document.getElementById('dn-sum');
  if(sum)sum.innerHTML=(rows.length===1?'תעודה אחת':rows.length+' תעודות')+' · '+f.units+" יח'"
    +(packs?' · '+packs+' חבילות':'')
    +' · <b style="color:var(--txt)">'+dnMoney(f.amount)+'</b>'
    +(f.pack?` <span style="color:var(--txt3)">(📦 ${dnMoney(f.pack)})</span>`:'')
    +(f.missing?` · <b style="color:var(--red-txt)">⚠ ${f.missing} בלי מחיר</b>`:'')
    +(voids.length?` · <span style="color:var(--txt3)">🕳 ${voids.length===1?'תעודה אחת בוטלה':voids.length+' תעודות בוטלו'}</span>`:'')
    +(selVis?` · <b style="color:var(--blue-txt)">☑ ${selVis} מסומנות</b> <a href="#" onclick="dnSelClear();return false" style="font-size:11px">נקה סימון</a>`:'');
  const heDate=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  if(!rows.length&&!voids.length){
    box.innerHTML=`<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;padding:18px">אין תעודות תואמות</div>`;
    return;
  }
  box.innerHTML=`<div class="card" style="padding:0"><div class="tbl-wrap"><table>
    <thead><tr>
      <th style="width:28px;text-align:center"><input type="checkbox" title="סמן / בטל את כל התעודות שבסינון" ${rows.length&&selVis===rows.length?'checked':''} onchange="dnSelAll(this.checked)" style="width:16px;height:16px;cursor:pointer"></th>
      <th>תעודה</th><th>תאריך</th><th>לקוח</th><th>דגם</th><th>הזמנה</th>
      <th style="text-align:center">יח'</th>
      <th style="text-align:center">תפירה</th><th style="text-align:center">✂ גזירה</th>
      <th style="text-align:center">📦 אריזה</th><th style="text-align:center">סכום</th>
      <th style="text-align:center">חבילות</th>${cp?'<th>🧾 התחשבנות</th>':''}<th></th>
    </tr></thead>
    <tbody>${dnRowsWithVoids(rows,voids,r=>{
      const pk=packsCount(r.s.packs);
      // 🔴 מוצר בלי מחיר לא מוצג כ-₪0: דוח התחשבנות שמקטין את עצמו בשקט גרוע
      // מדוח שצועק. הסכום שלו גם לא נכנס לסה"כ.
      const work=r.pr.missing
        ? `<td colspan="2" style="text-align:center;color:var(--red-txt);font-weight:700">⚠ חסר מחיר בכרטיס המוצר</td>`
        : `<td style="text-align:center;white-space:nowrap">${dnMoney(r.pr.sew)}${r.p.isSample&&!(+r.p.unitPrice)?'<span title="👕 דגם ראשון — מחיר קבוע" style="font-size:10px;color:var(--txt3)"> 👕</span>':''}${r.pr.mat?`<div style="font-size:10px;color:var(--txt3)">+🧵 חומרים ${dnMoney(r.pr.mat)}</div>`:''}</td>
           <td style="text-align:center;white-space:nowrap;color:var(--txt3)">${r.pr.cut?dnMoney(r.pr.cut):'—'}</td>`;
      // מצב האריזה + החומרים בטולטיפ — הטבלה צרה מכדי לפרט קולב/ניילון בעמודה,
      // אבל בלי הפירוט אי אפשר לבדוק סכום שנראה מוזר בלי לפתוח את התעודה
      const matTip=r.mats.map(m=>packMatName(m.k)+' '+(+m.n||0)+(m.own?' (של הלקוח)':packIncl(m.k)?' (כלול בצלופן)':'×'+dnMoney(m.price))).join(' · ');
      const money=`${work}
        <td style="text-align:center;white-space:nowrap;color:var(--txt3)"${matTip?` title="${esc((PACK_MODES[r.s.packMode]||'')+(matTip?' — '+matTip:''))}"`:''}>${r.pack?dnMoney(r.pack)+(r.mats.some(m=>!m.own&&!(+m.price)&&!packIncl(m.k))?' <span style="color:var(--amber-txt)">⚠</span>':''):r.mats.some(m=>m.own)?'👤':'—'}</td>
        <td style="text-align:center;white-space:nowrap;font-weight:700">${dnMoney(r.amount)}</td>`;
      const _k=dnKey(r);
      return `<tr${_dnSel.has(_k)?' style="background:rgba(24,95,165,.08)"':''}>
        <td style="text-align:center"><input type="checkbox" ${_dnSel.has(_k)?'checked':''} onchange="dnSelToggle('${escj(_k)}',this.checked)" style="width:16px;height:16px;cursor:pointer"></td>
        <td><span class="bc-seg" style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-weight:700">${r.s.no?String(r.s.no).padStart(4,'0'):'—'}</span>${shipEditMark(r.s)}${r.count>1?`<span style="font-size:10px;color:var(--txt3)"> ${r.i+1}/${r.count}</span>`:''}</td>
        <td style="white-space:nowrap">${heDate(r.s.date)}</td>
        <td>${esc(S.customerNames?.[r.p.cust]||('לקוח '+(r.p.cust||'')))}</td>
        <td>${esc(r.p.name||r.p.prod||'')}${r.s.note?`<span title="${esc(r.s.note)}"> 📝</span>`:''}</td>
        <td style="color:var(--txt3)">${(parseInt(r.p.orderNo,10)||0)?'#'+String(r.p.orderNo).padStart(3,'0'):'—'}</td>
        <td style="text-align:center;font-weight:700">${r.qty}</td>
        ${money}
        <td style="text-align:center">${pk||''}</td>
        ${cp?'<td style="white-space:nowrap">'+dnPayCell(r)+'</td>':''}
        <td style="white-space:nowrap;text-align:left">
          <button class="btn" style="font-size:11px;padding:4px 8px" title="עריכת כמויות, אריזה והערה — המספר והתאריך לא משתנים" onclick="editShipment('${escj(r.p.id)}',${r.i})">✏️</button>
          <button class="btn" style="font-size:11px;padding:4px 8px" title="עריכת חומר אריזה (קולב/ניילון/צלופן)" onclick="editShipMats('${escj(r.p.id)}',${r.i})">📦</button>
          <button class="btn" style="font-size:11px;padding:4px 9px" onclick="printDeliveryNote('${escj(r.p.id)}',${r.i})">📄 הדפס</button>
          <button class="btn" style="font-size:11px;padding:4px 8px" title="שלח את התעודה כ-PDF בוואטסאפ" onclick="shareDeliveryNote('${escj(r.p.id)}',${r.i})">💬</button>
          <button class="btn" style="font-size:11px;padding:4px 9px" onclick="showShipments('${escj(r.p.id)}')">🚚 משלוחים</button>
          ${S.user?.role==='manager'&&prodMatches(r.p.cust,r.p.prod).length>1?`<button class="btn" style="font-size:11px;padding:4px 8px" title="העבר את התעודה להזמנה אחרת של אותו דגם" onclick="moveShipment('${escj(r.p.id)}',${r.i})">↔</button>`:''}
        </td>
      </tr>`;
    })}</tbody>
    <tfoot><tr style="background:var(--bg2,var(--card));font-weight:800">
      <td colspan="6" style="text-align:left">סה"כ</td>
      <td style="text-align:center">${f.units}</td>
      <td colspan="2" style="text-align:center;font-weight:600;color:var(--txt3);font-size:11px">עבודה ${dnMoney(f.work)}</td>
      <td style="text-align:center;white-space:nowrap">${f.pack?dnMoney(f.pack):'—'}</td>
      <td style="text-align:center;white-space:nowrap">${dnMoney(f.amount)}</td>
      <td colspan="${cp?3:2}">${f.missing?`<span style="color:var(--red-txt);font-size:11px">⚠ ${f.missing} תעודות ללא מחיר עבודה</span>`:''}</td>
    </tr></tfoot>
  </table></div>
  ${f.matList.length?`<div style="padding:9px 12px;border-top:1px solid var(--brd);font-size:12px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center">
    <span style="font-weight:700">📦 חומר אריזה:</span>
    ${f.matList.map(m=>m.own?`<span>${esc(packMatName(m.k))} <b>${m.n}</b> · <span style="color:var(--txt3)">👤 של הלקוח — ללא חיוב</span></span>`:`<span>${esc(packMatName(m.k))} <b>${m.n}</b> × ${m.n?dnMoney(m.amount/m.n):'—'} = <b>${dnMoney(m.amount)}</b>${m.noPrice?' <span style="color:var(--amber-txt)">⚠ בלי מחיר</span>':''}</span>`).join('')}
  </div>`:''}</div>`;
}
// 🧾 הדפסת ההתחשבנות. הנייר מורכב מ-`dnFiltered()` בדיוק כמו המסך — אם המסך מסנן
// לקוח וטווח, זה מה שיודפס, ואין מסלול חישוב שני שיכול להיפרד ממנו.
// noPrice ⇒ "רשימת תעודות" בלי שום סכום — כמויות, חבילות וסוג אריזה, למסירה לנהג/למחסן
// inv ⇒ "חשבונית עסקה": אותה טבלה + מספר מסמך ושורות מע"מ וסה"כ לתשלום (מ-printProforma)
function printSettlement(onlySel,noPrice,inv){
  // הדפסה חוזרת של חשבונית ⇒ מתמונת המצב השמורה, לא מהמסך
  const f=inv?.f||dnFiltered(!!onlySel);
  if(!f.rows.length){showToast('⚠ אין תעודות בסינון הנוכחי','var(--red-txt)');return;}
  const co=S.settings?.company||{};
  const custs=dnCustomers(f.rows);
  // לקוח אחד ⇒ כותרת אישית + פרטי הלקוח. כמה לקוחות ⇒ עמודת לקוח נשארת בטבלה,
  // כי דף בלי הבחנה בין לקוחות אי אפשר למסור לאף אחד מהם.
  const one=custs.length===1?custs[0]:null;
  const ci=one?((S.customerInfo||{})[one.code]||{}):{};
  const heDate=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  const period=(f.from||f.to)?`${f.from?heDate(f.from):'תחילת הרישום'} — ${f.to?heDate(f.to):'היום'}`:'כל התקופה';
  const line=(lbl,val)=>val?`<div><span class="l">${esc(lbl)}</span> ${esc(val)}</div>`:'';
  const body=f.rows.slice().sort((a,b)=>String(a.s.date||'').localeCompare(String(b.s.date||''))||((+a.s.no||0)-(+b.s.no||0))).map(r=>`<tr>
    <td class="c">${r.s.no?String(r.s.no).padStart(4,'0'):'—'}</td>
    <td class="c">${heDate(r.s.date)}</td>
    ${one?'':`<td>${esc(S.customerNames?.[r.p.cust]||('לקוח '+(r.p.cust||'')))}</td>`}
    <td>${esc(r.p.name||r.p.prod||'')}${(parseInt(r.p.orderNo,10)||0)?` <span class="ord">#${String(r.p.orderNo).padStart(3,'0')}</span>`:''}</td>
    <td class="n">${r.qty}</td>
    ${noPrice?`<td class="c">${packsCount(r.s.packs)||'—'}</td><td class="c">${esc(packModeName(r.s.packMode))||'—'}</td><td>${esc(r.s.note||'')}</td>`
    :`${r.pr.missing
      ? `<td class="c miss" colspan="2">⚠ חסר מחיר</td>`
      : `<td class="c">${dnMoney(r.pr.sew)}${r.pr.mat?`<div class="pm">+ חומרים ${dnMoney(r.pr.mat)}</div>`:''}</td><td class="c">${r.pr.cut?dnMoney(r.pr.cut):'—'}</td>`}
    <td class="c">${r.pack?dnMoney(r.pack):'—'}${r.s.packMode?`<div class="pm">${esc(packModeName(r.s.packMode))}</div>`:''}</td>
    <td class="n">${dnMoney(r.amount)}</td>`}
  </tr>`).join('');
  const packsTot=f.rows.reduce((t,r)=>t+packsCount(r.s.packs),0);
  const cols=one?8:9;
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/><title>${inv?'חשבונית עסקה '+inv.no:noPrice?'רשימת תעודות':'התחשבנות'} ${esc(one?one.name:'')}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-size:13px;padding:16mm 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #185FA5;padding-bottom:10px;margin-bottom:14px}
.co{font-size:19px;font-weight:800;color:#185FA5;margin-bottom:3px}
.co-d{font-size:11px;color:#444;line-height:1.6}
.doc{text-align:left;flex-shrink:0;margin-right:16px}
.doc h1{font-size:20px;font-weight:800;margin-bottom:6px}
.doc .dt{font-size:12px;color:#444;margin-top:3px}
.box{border:1px solid #bbb;border-radius:6px;padding:9px 11px;line-height:1.7;margin-bottom:14px}
.box h2{font-size:12px;font-weight:800;color:#185FA5;margin-bottom:5px;border-bottom:1px solid #e2e2e2;padding-bottom:3px}
.box .l{color:#666;font-size:11px;display:inline-block;min-width:62px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{background:#eef2ff;padding:7px 6px;text-align:right;font-weight:700;border:1px solid #bbb;font-size:12px}
td{padding:6px;border:1px solid #ddd}
td.c,th.c{text-align:center}
td.n,th.n{text-align:center;font-weight:800;background:#fafafa;white-space:nowrap}
td.miss,.miss{color:#b91c1c;font-weight:700}
td.miss{background:#fef2f2}
.ord{color:#888;font-size:10px}
.pm{font-size:9px;color:#888;font-weight:400}
table.mat{width:auto;min-width:52%;margin-top:16px}
table.mat th[colspan]{background:#eef2ff;text-align:center;font-size:12px}
tfoot td{background:#eef2ff;font-weight:800;font-size:14px;border:1px solid #bbb;padding:9px 6px}
tr{page-break-inside:avoid}
thead{display:table-header-group}
.warn{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:7px 9px;font-size:11px;font-weight:700;margin:10px 0}
.sign{display:flex;gap:14px;margin-top:26px}
.sign div{flex:1;border-top:1px solid #666;padding-top:5px;font-size:11px;color:#444}
.sign b{display:block;font-size:12px;color:#000;margin-bottom:16px}
.foot{margin-top:20px;padding-top:8px;border-top:1px solid #e2e2e2;font-size:10px;color:#888;text-align:center}
@media print{body{padding:10mm}}
</style></head><body>
<div class="top">
  <div>
    <div class="co">${esc(co.name||'— שם העסק לא הוגדר —')}</div>
    <div class="co-d">
      ${co.addr?esc(co.addr)+(co.city?', '+esc(co.city):''):''}
      ${co.phone?'<br>טלפון: '+esc(co.phone):''}
      ${co.taxId?'<br>ח.פ./ע.מ.: '+esc(co.taxId):''}
      ${co.email?'<br>'+esc(co.email):''}
    </div>
  </div>
  <div class="doc">
    <h1>${inv?'חשבונית עסקה מס\' '+inv.no:noPrice?'רשימת תעודות משלוח':'דוח התחשבנות'}</h1>
    <div class="dt">${inv?.month?'עבור חודש: <b>'+inv.month.slice(5,7)+'/'+inv.month.slice(0,4)+'</b>':'תקופה: '+esc(period)}</div>
    <div class="dt">${inv?'תאריך':'הופק'}: ${heDate(inv?.date||new Date().toISOString().slice(0,10))}</div>${inv?`<div class="dt" style="font-weight:700">${inv.copy?'העתק':'מקור'}</div>`:''}${inv?.void?'<div class="dt" style="font-weight:800;color:#b91c1c;font-size:15px">🚫 מבוטלת</div>':''}
  </div>
</div>
<div class="box">
  <h2>${one?'לכבוד':'לקוחות בדוח'}</h2>
  ${one?`<div style="font-weight:800;font-size:14px;margin-bottom:3px">${esc(one.name)}</div>
    ${line('קוד לקוח:',one.code)}
    ${line('כתובת:',[ci.addr,ci.city].filter(Boolean).join(', '))}
    ${line('איש קשר:',ci.contact)}
    ${line('טלפון:',ci.phone)}
    ${line('ח.פ./ע.מ.:',ci.taxId)}`
   :`<div style="font-weight:700">${esc(custs.map(c=>c.name).join(' · '))}</div>
     <div style="font-size:11px;color:#666;margin-top:4px">הדוח כולל כמה לקוחות — לסינון ללקוח אחד בחר אותו בבורר הלקוחות.</div>`}
</div>
${!noPrice&&f.missing?`<div class="warn">⚠ ${f.missing} תעודות בדוח שייכות לדגם שאין לו מחיר בכרטיס המוצר. הן מסומנות בטבלה ו<u>לא נכללו בסה"כ</u> — יש להזין את המחיר ולהפיק מחדש.</div>`:''}
<table>
  <thead><tr>
    <th class="c">תעודה</th><th class="c">תאריך</th>${one?'':'<th>לקוח</th>'}<th>דגם</th>
    <th class="c">כמות</th>${noPrice?'<th class="c">חבילות</th><th class="c">אריזה</th><th>הערה</th>'
      :'<th class="c">תפירה ליח\'</th><th class="c">גזירה ליח\'</th><th class="c">📦 אריזה</th><th class="c">סכום</th>'}
  </tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr>
    <td colspan="${cols-5}" style="text-align:left">סה"כ ${f.rows.length} תעודות</td>
    <td class="c">${f.units}</td>
    ${noPrice?`<td class="c">${packsTot||'—'}</td><td colspan="2"></td>`
    :`<td colspan="2" class="c" style="font-weight:600;font-size:11px">עבודה ${dnMoney(f.work)}</td>
    <td class="c">${f.pack?dnMoney(f.pack):'—'}</td>
    <td class="n" style="font-size:15px">${dnMoney(f.amount)}</td>`}
  </tr></tfoot>
</table>
${!noPrice&&f.matList.length?`<table class="mat"><thead><tr><th colspan="4">📦 פירוט חומר אריזה</th></tr>
  <tr><th>חומר</th><th class="c">כמות</th><th class="c">מחיר ליח'</th><th class="c">סכום</th></tr></thead>
  <tbody>${f.matList.map(m=>`<tr>
    <td>${esc(packMatName(m.k))}${m.own?' (של הלקוח)':''}</td><td class="c">${m.n}</td>
    ${m.own?'<td class="c">ללא חיוב</td><td class="n">—</td></tr>':`<td class="c">${m.n?dnMoney(m.amount/m.n):'—'}${m.noPrice?' <span class="miss">⚠ בלי מחיר</span>':''}</td>
    <td class="n">${dnMoney(m.amount)}</td></tr>`}`).join('')}</tbody>
  <tfoot><tr><td colspan="3" style="text-align:left">סה"כ חומר אריזה</td><td class="n">${dnMoney(f.pack)}</td></tr></tfoot>
</table>`:''}
${inv?`<table class="mat" style="margin-right:auto;margin-left:0;min-width:42%">
  <tbody>
    <tr><td>סה"כ לפני מע"מ</td><td class="n">${dnMoney(f.amount)}</td></tr>
    <tr><td>מע"מ ${inv.vat}%</td><td class="n">${dnMoney(inv.vatAmt)}</td></tr>
  </tbody>
  <tfoot><tr><td style="text-align:left">סה"כ לתשלום</td><td class="n" style="font-size:16px">${dnMoney(inv.total)}</td></tr></tfoot>
</table>
<div style="margin-top:10px;font-size:11px;color:#555;border:1px dashed #999;border-radius:6px;padding:6px 9px">מסמך זה הוא חשבונית עסקה (דרישת תשלום) ו<b>אינו חשבונית מס</b>. חשבונית מס תופק עם קבלת התשלום.</div>`:''}
<div class="sign">
  <div><b>חתימת המפעל</b><span class="sig-slot"></span>_______________________</div>
  <div><b>${noPrice?'שם המקבל וחתימה':'אישור הלקוח'}</b>_______________________</div>
</div>
<div class="foot">הופק ממערכת TextileOps · ${esc(co.name||'')}</div>
</body></html>`);
}
// בניית ה-HTML מופרדת מההדפסה כדי שאפשר יהיה לרנדר ולבדוק אותה בלי לפתוח גיליון הדפסה
function deliveryNoteHtml(p,sh,idx,count){
  const list=prodShipments(p);
  if(!sh)sh=list[list.length-1]||null;
  if(idx==null)idx=Math.max(0,list.indexOf(sh));
  if(count==null)count=list.length||1;
  const co=S.settings?.company||{};
  const ci=(S.customerInfo||{})[p.cust]||{};
  const cname=S.customerNames?.[p.cust]||'';
  const detailed=!!(sh&&Array.isArray(sh.rows)&&sh.rows.length);
  const rows=detailed?sh.rows:(p.quantities||[]).filter(q=>parseInt(q.qty)>0);
  const rowSum=rows.reduce((s,r)=>s+(isUnsewn(r)?0:(parseInt(r.qty)||0)),0);
  const total=sh?(+sh.total||0):rowSum;
  const unsewn=detailed?shUnsewn(sh):0;
  // מאזן ההזמנה **עד המשלוח הזה כולל** — תעודה ישנה חייבת להראות את המצב בזמנה
  // ולא את המצב היום, אחרת הדפסה חוזרת של תעודה מלפני חודש תסתור את מה שנמסר
  const ordered=_prodQty(p)||0;
  const upto=list.slice(0,idx+1).reduce((t,s)=>t+(+s.total||0)+shUnsewn(s),0); // ✂ לא תפור יצא — לא "יתרה להשלמה"
  const balance=ordered?Math.max(0,ordered-upto):0;
  // יצא יותר ממה שהוזמן: "יתרה להשלמה: 0" הסתיר את העובדה. העודף מוצג במפורש,
  // ולפי המצב **באותו משלוח** — כמו כל שאר המספרים על התעודה.
  const surplus=ordered?Math.max(0,upto-ordered):0;
  const dDate=(sh&&sh.date)||p.dnDate||(p.shippedAt?String(p.shippedAt).slice(0,10):'');
  // 🕐 שעת ההפקה (10/10/2026) — מ-sh.at. בתעודה בדיעבד/משוחזרת at = רגע הרישום ולא שעת התעודה ⇒ בלי שעה
  const dnTime=sh&&sh.at&&!sh.backdatedAt&&!sh.restoredAt?(()=>{const d=new Date(sh.at);return isNaN(d)?'':pad2(d.getHours())+':'+pad2(d.getMinutes());})():'';
  const heDate=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
  const orderTxt=(parseInt(p.orderNo,10)||0)?'#'+String(p.orderNo).padStart(3,'0'):'—';
  const line=(lbl,val)=>val?`<div><span class="l">${esc(lbl)}</span> ${esc(val)}</div>`:'';
  // התעודה מציגה **דגם בלבד** (p.name) כמו התעודה שהמפעל מוציא היום — מספר המוצר
  // בן 5 הספרות הוא מזהה פנימי, ואצל חלק מהלקוחות הוא גזור ממספר הדגם שלהם ולכן
  // לא זהה לשום דבר שרשום אצלם. p.prod נשאר רק כגיבוי למוצר בלי שם, כדי שהתעודה
  // לא תצא בלי שום מזהה מוצר בכלל.
  // 📦 האריזה וההערה שמורות על **המשלוח עצמו** ולא על המוצר ⇒ הדפסה חוזרת של
  // תעודה ישנה מציגה את האריזה שנמסרה באותו יום, לא את זו של המשלוח האחרון
  const packs=(sh&&Array.isArray(sh.packs))?sh.packs.filter(x=>(+x.n||0)>0&&(+x.per||0)>0):[];
  const packUnits=packsUnits(packs),packCount=packsCount(packs);
  const outer=outerTxt(sh&&sh.outer); // 🛍 שקים/קרטונים — ריק בתעודה ישנה
  const dnote=(sh&&sh.note)||'';
  const mtx=dnMatrix(rows);
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/><title>תעודת משלוח ${p.dnNo||''}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-size:13px;padding:16mm 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #185FA5;padding-bottom:10px;margin-bottom:14px}
.co{font-size:19px;font-weight:800;color:#185FA5;margin-bottom:3px}
.co-d{font-size:11px;color:#444;line-height:1.6}
.doc{text-align:left;flex-shrink:0;margin-right:16px}
.doc h1{font-size:20px;font-weight:800;margin-bottom:6px}
.doc .no{font-size:15px;font-weight:800;color:#b91c1c}
.doc .dt{font-size:12px;color:#444;margin-top:3px}
.boxes{display:flex;gap:12px;margin-bottom:14px}
.box{flex:1;border:1px solid #bbb;border-radius:6px;padding:9px 11px;line-height:1.7}
.box h2{font-size:12px;font-weight:800;color:#185FA5;margin-bottom:5px;border-bottom:1px solid #e2e2e2;padding-bottom:3px}
.box .l{color:#666;font-size:11px;display:inline-block;min-width:52px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px}
thead th{background:#eef2ff;padding:8px;text-align:right;font-weight:700;border:1px solid #bbb}
td{padding:7px 8px;border:1px solid #ddd}
td.n,th.n{text-align:center;font-weight:800;width:64px;background:#fafafa}
td.c,th.c{text-align:center}
th.sz{font-size:12px;padding:5px 4px}
td.hd,th.hd{text-align:right;font-weight:700;min-width:110px}
td.z{color:#ccc}
tfoot td{background:#f6f6f6;font-weight:800;font-size:14px;border:1px solid #bbb}
tr{page-break-inside:avoid}
.warn{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:7px 9px;font-size:11px;font-weight:700;margin-bottom:10px}
.sign{display:flex;gap:14px;margin-top:26px}
.sign div{flex:1;border-top:1px solid #666;padding-top:5px;font-size:11px;color:#444}
.sign b{display:block;font-size:12px;color:#000;margin-bottom:16px}
.foot{margin-top:20px;padding-top:8px;border-top:1px solid #e2e2e2;font-size:10px;color:#888;text-align:center}
table.pk{width:auto;min-width:54%;margin-top:14px}
table.pk th.ttl{background:#eef2ff;font-size:12px;text-align:center}
.note{margin-top:14px;border:1px solid #bbb;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.6}
.note b{color:#185FA5}
/* @page margin:0 ⇒ Chrome לא מדפיס כותרת/כתובת/מספר עמוד (13/10/2026). השוליים — ב-padding */
@media print{@page{size:A4 portrait;margin:0}body{padding:10mm}}
</style></head><body>
<div class="top">
  <div>
    <div class="co">${esc(co.name||'— שם העסק לא הוגדר —')}</div>
    <div class="co-d">
      ${co.addr?esc(co.addr)+(co.city?', '+esc(co.city):''):''}
      ${co.phone?'<br>טלפון: '+esc(co.phone):''}
      ${co.taxId?'<br>ח.פ./ע.מ.: '+esc(co.taxId):''}
      ${co.email?'<br>'+esc(co.email):''}
    </div>
  </div>
  <div class="doc">
    <h1>תעודת משלוח</h1>
    <div class="no">מס' ${sh&&sh.no?String(sh.no).padStart(4,'0'):'—'}</div>
    ${count>1?`<div class="dt" style="font-weight:700">משלוח ${idx+1} מתוך ${count}</div>`:''}
    <div class="dt">תאריך: ${esc(heDate(dDate)||'—')}</div>
  </div>
</div>
<div class="boxes">
  <div class="box">
    <h2>לכבוד</h2>
    <div style="font-weight:800;font-size:14px;margin-bottom:3px">${esc(cname||('לקוח '+p.cust))}</div>
    ${line('קוד לקוח:',p.cust)}
    ${line('כתובת:',[ci.addr,ci.city].filter(Boolean).join(', '))}
    ${line('איש קשר:',ci.contact)}
    ${line('טלפון:',ci.phone)}
    ${line('ח.פ./ע.מ.:',ci.taxId)}
  </div>
  <div class="box">
    <h2>פרטי ההזמנה</h2>
    ${line('דגם:',p.name||p.prod)}
    ${line('הזמנה:',orderTxt)}
    ${line('תאריך:',heDate(dDate))}
    ${line('שעה:',dnTime)}
    ${ordered?line('כמות בהזמנה:',ordered+" יח'"):''}
    ${ordered?(surplus?line('עודף מעל ההזמנה:',surplus+" יח'"):line('יתרה להשלמה:',balance+" יח'")):''}
    ${unsewn?line('לא תפור:',unsewn+" יח' (לא לחיוב)"):''}
    ${+sh?.orig?line('דגם מקורי:',(+sh.orig)+" יח' הוחזר"):''}
    ${packCount?line('חבילות:',packCount+(outer?' '+outerIn(outer):'')):line('אריזה:',outer)}
    ${line('סוג אריזה:',packModeName(sh&&sh.packMode))}
  </div>
</div>
${detailed?'':'<div class="warn">⚠ אין פירוט יציאה פר מידה למשלוח הזה — הטבלה מציגה את פירוט ההזמנה. סמן שוב "יצא ללקוח" כדי לרשום את הפירוט בפועל.</div>'}
${detailed&&rowSum!==total?`<div class="warn">⚠ סכום השורות (${rowSum}) שונה מהכמות הרשומה כיוצאת (${total}).</div>`:''}
${mtx.colorRows.length?`<table>
  <thead>
    <tr>
      <th rowspan="2" class="hd">צבע</th>
      <th colspan="${mtx.sizes.length}" class="c">מידות</th>
      <th rowspan="2" class="n">כמות</th>
    </tr>
    <tr>${mtx.sizes.map(s=>`<th class="c sz">${esc(szLbl(s,p))||'—'}</th>`).join('')}</tr>
  </thead>
  <tbody>${mtx.colorRows.map(r=>`<tr${r.u?' style="font-style:italic;color:#92400e"':''}>
      <td class="hd">${esc(r.label)}</td>
      ${r.cells.map(v=>`<td class="c${v?'':' z'}">${v||''}</td>`).join('')}
      <td class="n">${r.total}</td>
    </tr>`).join('')}</tbody>
  <tfoot>
    <tr><td class="hd">סה"כ</td>${mtx.sizeTotals.map(v=>`<td class="c">${v||''}</td>`).join('')}<td class="n">${mtx.grand}</td></tr>
    ${detailed?'':`<tr><td colspan="${mtx.sizes.length+1}" style="font-weight:700">מתוך זה יצא בפועל</td><td class="n">${total}</td></tr>`}
  </tfoot>
</table>`:`<table><tbody><tr><td style="text-align:center;color:#888;padding:14px">אין פירוט מידות — סה"כ ${total} יח'</td></tr></tbody></table>`}
${packs.length?`<table class="pk">
  <thead>
    <tr><th colspan="3" class="ttl">פירוט אריזה</th></tr>
    <tr><th class="c">מס' חבילות</th><th class="c">יח' בחבילה</th><th class="n">סה"כ יח'</th></tr>
  </thead>
  <tbody>${packs.map(x=>`<tr><td class="c">${+x.n}</td><td class="c">${+x.per}</td><td class="n">${(+x.n)*(+x.per)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td class="c">${packCount} חבילות</td><td class="c">—</td><td class="n">${packUnits}</td></tr>
    ${outer?`<tr><td colspan="3" class="c">🛍 ארוז ${esc(outerIn(outer))}</td></tr>`:''}</tfoot>
</table>
${!_packsMatchN(packUnits,total,unsewn,+sh?.orig||0)?`<div class="warn">⚠ סכום האריזה (${packUnits}) שונה מהכמות שיצאה במשלוח (${total}).</div>`:''}`:''}
${dnote?`<div class="note"><b>הערות:</b> ${esc(dnote)}</div>`:''}
<div class="sign">
  <div><b>שם וחתימת המוסר</b><span class="sig-slot"></span>____________________</div>
  <div><b>שם וחתימת המקבל</b>____________________</div>
  <div><b>תאריך קבלה</b>____________________</div>
</div>
<div class="foot">הופק ממערכת TextileOps · ${esc(heDate(new Date().toISOString().slice(0,10)))}</div>
</body></html>`;
}
// ☑️ תיבת בחירה על כרטיס ברקוד — מאפשרת להדפיס/לייצא ברקוד בודד בלבד (למשל
// כשמדבקה אחת התקלקלה) במקום לכפות הדפסת כל הסט. מסומן כברירת מחדל, כדי
// ש"הדפס הכל" הישן ימשיך לעבוד בלי לגעת.
function _bcSelCheckbox(){
  const cb=document.createElement('input');
  cb.type='checkbox';cb.className='bc-sel';cb.checked=true;
  cb.title='בחר להדפסה/ייצוא';
  cb.style.cssText='position:absolute;top:6px;left:6px;width:20px;height:20px;cursor:pointer;z-index:5';
  return cb;
}
function _bcToggleSel(containerId,cls,check){
  document.querySelectorAll('#'+containerId+' .'+cls).forEach(cb=>cb.checked=check);
}
// קורא את מצב הסימון הנוכחי מה-DOM (bc-print-area) — total/sample + אילו אינדקסים ב-items נבחרו
function _bcSelSet(){
  const area=document.getElementById('bc-print-area');
  const sel={total:true,sample:true,repair:true,items:new Set()};
  if(!area)return sel;
  const totalCb=area.querySelector('.bc-card[data-idx="total"] .bc-sel');
  if(totalCb)sel.total=totalCb.checked;
  const sampleCb=area.querySelector('.bc-card[data-idx="sample"] .bc-sel');
  if(sampleCb)sel.sample=sampleCb.checked;
  const repairCb=area.querySelector('.bc-card[data-idx="repair"] .bc-sel'); // 🔧
  if(repairCb)sel.repair=repairCb.checked;
  area.querySelectorAll('.bc-card[data-idx]').forEach(c=>{
    const idx=c.dataset.idx;
    if(idx==='total'||idx==='sample'||idx==='repair')return;
    const cb=c.querySelector('.bc-sel');
    if(!cb||cb.checked)sel.items.add(parseInt(idx));
  });
  return sel;
}
function bcPrint(mode){
  const labels=mode==='labels'; // מצב מדבקות: רשת 105×56 מ"מ קבועה (TW-2510), 10 בדף A4, בלי מרווח/כותרות
  const area=document.getElementById('bc-print-area');
  if(!area)return;
  // קבץ לפי צבע (למצב רגיל) + רשימה רציפה של כל הכרטיסים (למצב מדבקות) — רק כרטיסים מסומנים
  const byColor=new Map();const allCards=[];
  [...area.querySelectorAll('.bc-card')].forEach(card=>{
    const cb=card.querySelector('.bc-sel');
    if(cb&&!cb.checked)return;
    const col=card.dataset.col||'00';
    const clone=card.cloneNode(true);
    clone.querySelector('.bc-sel')?.remove();
    clone.querySelector('.bc-nfc')?.remove();   // 📶 כפתור מסך בלבד — לא מודפס
    const origCanvas=card.querySelector('canvas');
    const cloneCanvas=clone.querySelector('canvas');
    if(origCanvas&&cloneCanvas){
      const img=document.createElement('img');
      img.src=origCanvas.toDataURL('image/png');
      img.style.cssText='width:150px;height:150px';
      cloneCanvas.replaceWith(img);
    }
    if(!byColor.has(col))byColor.set(col,[]);
    byColor.get(col).push(clone.outerHTML);
    allCards.push(clone.outerHTML);
  });
  if(!allCards.length){alert('בחר לפחות ברקוד אחד להדפסה');return;}
  // ברקוד "יצא ללקוח" — כרטיס בודד
  let shipCard='';
  const g=window._bcLastGen;
  if(g){
    const shipCode=g.cust+g.prod+'900099'+(g.sfx||'');
    const tmp=document.createElement('div');
    new QRCode(tmp,{text:bcQr(shipCode),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    const cv=tmp.querySelector('canvas');
    if(cv)shipCard=`<div class="bc-card" style="border-width:3px;grid-column:1/-1">
        <img src="${cv.toDataURL('image/png')}" style="width:150px;height:150px;flex-shrink:0"/>
        <div style="text-align:right;line-height:2.2;flex:1">
          <div style="font-size:16px;font-weight:800;color:#000">🚚 יצא ללקוח</div>
          <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${g.cust}</div>
          <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${g.prod}</div>
          <div style="font-size:12px;color:#555">✅ סמן יציאה + עדכן כמות סופית</div>
          <div style="font-size:11px;color:#555;margin-top:4px">${shipCode}</div>
        </div>
      </div>`;
  }
  let body;
  if(labels){
    // רשת אחת רציפה — 10 מדבקות בדיוק בדף A4 (TW-2510). כרטיס "יצא ללקוח" לא נכלל כאן
    // כדי לא לגלוש לגיליון מדבקות שני; מדפיסים אותו דרך "הדפס הכל" הרגיל.
    body=`<div class="grid">${allCards.join('')}</div>`;
  }else{
    // ─── חלוקה מפורשת לדפים ─────────────────────────────────────
    // ⚠️ **לא לסמוך על break-inside:avoid.** הכרטיסים היו פריטי CSS grid, וכרום
    // לא מכבד שם את הכלל ⇒ הכרטיס האחרון בדף נחתך באמצע ("כמות/צבע/מספר הברקוד"
    // נדחפו מתחת לשולי ההדפסה ונחתכו ע"י כותרת התחתית של הדפדפן — נצפה 25/08).
    // כאן סופרים מ"מ ומחלקים לדפים בעצמנו, כך שהתוצאה לא תלויה בדפדפן.
    const PAGE_MM=281,HDR_MM=13,ROW_MM=48; // A4 פחות שוליים 8 מ"מ · כותרת צבע · שורת כרטיסים
    const items=[]; // כל פריט = שורה שלמה, כדי שלעולם לא ייחתך באמצע
    [...byColor.entries()].forEach(([col,cards])=>{
      const colName=(COLORS_AR[col]||COLORS[col]||col);
      const wide=col==='total'||col==='sample'||col==='repair'; // "כל הכמות" / 👕 דגם / 🔧 תיקון — בלי כותרת צבע, שורה שלמה
      const hdr=wide?'':`<div class="colhdr">צבע: ${col} · ${colName} — ${cards.length} יחידות</div>`;
      const per=wide?1:2; // כרטיס "כל הכמות" תופס שורה שלמה
      for(let i=0;i<cards.length;i+=per){
        const row=`<div class="grid">${cards.slice(i,i+per).join('')}</div>`;
        // הכותרת נצמדת לשורה הראשונה — כדי שלא תישאר לבדה בתחתית דף
        items.push(i===0&&hdr?{h:HDR_MM+ROW_MM,html:hdr+row}:{h:ROW_MM,html:row});
      }
    });
    if(shipCard)items.push({h:ROW_MM,html:`<div class="grid">${shipCard}</div>`});
    const pgs=[];let cur=[],used=0;
    items.forEach(it=>{
      if(used+it.h>PAGE_MM&&cur.length){pgs.push(cur);cur=[];used=0;}
      cur.push(it.html);used+=it.h;
    });
    if(cur.length)pgs.push(cur);
    body=pgs.map((p,i)=>`<div class="page"${i<pgs.length-1?' style="page-break-after:always"':''}>${p.join('')}</div>`).join('');
  }
  // במצב מדבקות: !important גובר על ה-inline של הכרטיסים (padding/border/grid-column) כדי לקבע גודל תא
  const style=labels
    ?`body{margin:0;font-family:Arial,sans-serif;background:#fff}
      .grid{display:grid!important;grid-template-columns:repeat(2,105mm)!important;gap:0!important;padding:0!important}
      .bc-card{width:105mm!important;height:56mm!important;box-sizing:border-box!important;padding:0!important;border:none!important;border-radius:0!important;grid-column:auto!important;overflow:hidden!important;display:block!important;position:relative!important}
      /* QR ממורכז במרכז המדבקה — היסט מדפסת לא חותך אותו; הטקסט בעמודה מימין */
      .bc-card>div:first-child{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:32mm!important;height:32mm!important;overflow:hidden!important}
      .bc-card img{width:32mm!important;height:32mm!important}
      .bc-card>div:last-child{position:absolute!important;right:5mm!important;top:50%!important;transform:translateY(-50%)!important;width:29mm!important;flex:none!important;text-align:right!important;line-height:1.8!important}
      @media print{@page{size:A4 portrait;margin:8.5mm 0}}`
    :`body{margin:0;font-family:Arial,sans-serif;background:#fff}
      /* ⚠️ **לא CSS grid כאן.** כרום לא מכבד break-inside:avoid על פריטי grid בפיצול
         לעמודים — הכרטיס האחרון בדף נחתך באמצע (נצפה 25/08: "כמות/צבע/מספר הברקוד"
         נדחפו מתחת לשולי ההדפסה ונחתכו ע"י כותרת התחתית של הדפדפן).
         inline-block כן מכובד: הדפדפן מזיז את כל הכרטיס לדף הבא במקום לשבור אותו.
         font-size:0 על המכל מבטל את רווח הרווח-הלבן שבין שני inline-block. */
      .page{padding:0 8px}
      .colhdr{text-align:right;padding:4px 4px 3px;font-size:14px;font-weight:700;color:#333;height:13mm;box-sizing:border-box}
      .grid{display:block;font-size:0}
      /* !important — הכרטיסים נושאים display:flex ו-padding ב-style inline, והם גוברים על גיליון הסגנון.
         גובה קבוע 46 מ"מ ⇒ 5 שורות (240 מ"מ) נכנסות בנוחות ב-281, וגם עם כותרת צבע. */
      .bc-card{border:2px solid #333;border-radius:6px;padding:6px 8px!important;display:inline-flex!important;align-items:center;gap:10px;
        width:calc(50% - 10px);height:46mm;box-sizing:border-box;vertical-align:top;margin:0 4px 2mm;font-size:13px;overflow:hidden;
        break-inside:avoid!important;page-break-inside:avoid!important}
      .bc-card[data-col="total"],.bc-card[data-col="sample"],.bc-card[data-col="repair"]{width:calc(100% - 8px)}
      /* line-height מכווץ בהדפסה בלבד — 7 שורות טקסט (כולל "הזמנה #NNN") נכנסות ב-46 מ"מ */
      .bc-card>div:last-child{line-height:1.5!important}
      .bc-card img{width:38mm;height:38mm}
      @media print{@page{size:A4 portrait;margin:8mm}}`;
  printViaIframe(`<html dir="rtl"><head><title>QR קודים למשימות</title>
    <style>${style}</style></head><body>
    ${body}
    </body></html>`);
}
// ─── ייצוא PDF מדבקות (A4 מדויק, 105×56 מ"מ) ─────────────────
// מייצר PDF בגודל אמיתי כדי שאפשר להדפיס גם מהנייד (AirPrint מכווץ HTML, אבל PDF מודפס בגודל מקורי).
function _bcQRCanvas(text,px){
  try{const tmp=document.createElement('div');
    new QRCode(tmp,{text:bcQr(text),width:px,height:px,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    return tmp.querySelector('canvas');
  }catch(e){return null;}
}
function _bcPdfCell(card){
  const s=11.81; // px למ"מ (~300dpi)
  const W=Math.round(105*s),H=Math.round(56*s);
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const qmm=32,qx=(105-qmm)/2,qy=(56-qmm)/2; // QR ממורכז במרכז המדבקה — היסט מדפסת לא חותך אותו
  const qr=_bcQRCanvas(card.qr,440);
  if(qr)ctx.drawImage(qr,Math.round(qx*s),Math.round(qy*s),Math.round(qmm*s),Math.round(qmm*s));
  ctx.direction='rtl';ctx.textAlign='right';ctx.textBaseline='alphabetic';
  // הטקסט בעמודה שמימין ל-QR; maxW מכווץ שורה ארוכה כדי שלא תיכנס לתוך ה-QR
  const rightX=Math.round(99*s),maxW=Math.round((99-(qx+qmm+2))*s),lineMm=6.6,totalMm=card.lines.length*lineMm;
  let y=(56-totalMm)/2;
  card.lines.forEach(ln=>{
    ctx.font=(ln.bold?'bold ':'')+Math.round(ln.mm*s)+'px Arial, sans-serif';
    ctx.fillStyle=ln.color;
    ctx.fillText(ln.t,rightX,Math.round((y+lineMm*0.75)*s),maxW);
    y+=lineMm;
  });
  return cv;
}
// share=true (26/10/2026) — אותו PDF בדיוק, נשלח בוואטסאפ במקום להישמר (bcSharePDF)
async function bcDownloadPDF(share){
  const g=window._bcLastGen;
  if(!g){alert('צור ברקודים תחילה');return;}
  await _lib('jspdf').catch(()=>{});const J=window.jspdf&&window.jspdf.jsPDF;
  if(!J){alert('ספריית PDF עדיין נטענת — נסה שוב עוד רגע');return;}
  if(!window.QRCode){alert('ספריית QR לא נטענה');return;}
  const {cust,prod,items}=g,sfx=g.sfx||'';
  const sel=_bcSelSet();
  const totalQty=items.reduce((s,it)=>s+(parseInt(it.qty)||0),0);
  const totalCode=cust+prod+'900000'+sfx;
  const cards=[];
  if(g.sample){
    if(sel.sample)cards.push({qr:g.sample.code,lines:[
      {t:SAMPLE_STEP,mm:4,bold:true,color:'#1d4ed8'},
      {t:'לקוח: '+cust,mm:3.6,bold:true,color:'#000'},
      {t:'מוצר: '+prod,mm:3.6,bold:true,color:'#000'},
      ...(sfx?[{t:'🔢 הזמנה #'+sfx,mm:3.6,bold:true,color:'#059669'}]:[]),
      {t:'כמות: '+g.sample.qty+' יח׳',mm:4,bold:true,color:'#1d4ed8'},
      {t:g.sample.code,mm:2.8,bold:false,color:'#555'}]});
  } else if(sel.total){
    cards.push({qr:totalCode,lines:[
      {t:'📦 כל הכמות',mm:4,bold:true,color:'#059669'},
      {t:'לקוח: '+cust,mm:3.6,bold:true,color:'#000'},
      {t:'מוצר: '+prod,mm:3.6,bold:true,color:'#000'},
      ...(sfx?[{t:'🔢 הזמנה #'+sfx,mm:3.6,bold:true,color:'#059669'}]:[]),
      {t:'סה"כ: '+totalQty+' יח׳',mm:4,bold:true,color:'#059669'},
      {t:totalCode,mm:2.8,bold:false,color:'#555'}]});
  }
  items.forEach((it,i)=>{
    if(!sel.items.has(i))return;
    const code=cust+prod+it.size+it.qty+it.col+sfx;
    const colName=(COLORS_AR[it.col]||COLORS[it.col]||it.col);
    cards.push({qr:code,lines:[
      {t:'לקוח: '+cust,mm:3.6,bold:true,color:'#000'},
      {t:'מוצר: '+prod,mm:3.6,bold:true,color:'#000'},
      ...(sfx?[{t:'🔢 הזמנה #'+sfx,mm:3.6,bold:true,color:'#059669'}]:[]),
      {t:'מידה: '+(it.lbl||it.size),mm:3.6,bold:true,color:'#000'},
      {t:'כמות: '+parseInt(it.qty),mm:3.6,bold:true,color:'#000'},
      {t:'צבע: '+it.col+' · '+colName,mm:3.6,bold:true,color:'#000'},
      {t:code,mm:2.8,bold:false,color:'#555'}]});
  });
  if(g.repair&&sel.repair)cards.push({qr:g.repair.code,lines:[ // 🔧 תיקון
    {t:REPAIR_STEP,mm:4,bold:true,color:'#b45309'},
    {t:'לקוח: '+cust,mm:3.6,bold:true,color:'#000'},
    {t:'מוצר: '+prod,mm:3.6,bold:true,color:'#000'},
    ...(sfx?[{t:'🔢 הזמנה #'+sfx,mm:3.6,bold:true,color:'#059669'}]:[]),
    {t:'מידה/צבע/כמות — בסריקה',mm:3,bold:false,color:'#555'},
    {t:g.repair.code,mm:2.8,bold:false,color:'#555'}]});
  if(!cards.length){alert('בחר לפחות ברקוד אחד להדפסה');return;}
  const doc=new J({unit:'mm',format:'a4',orientation:'portrait',compress:true}); // 🗜 (26/10/2026) דחיסה — 3.2 מ"ב ⇒ ~40 ק"ב ל-4 מדבקות, אותם פיקסלים
  const CW=105,CH=56,TOP=(297-5*CH)/2; // 8.5 מ"מ שוליים עליון/תחתון, 0 בצדדים
  cards.forEach((card,i)=>{
    const pos=i%10;
    if(i>0&&pos===0)doc.addPage();
    const row=Math.floor(pos/2),col=pos%2;
    const x=col===0?CW:0; // RTL: הכרטיס הראשון בצד ימין
    const y=TOP+row*CH;
    doc.addImage(_bcPdfCell(card).toDataURL('image/png'),'PNG',x,y,CW,CH,undefined,'FAST');
  });
  if(!share){doc.save('מדבקות_'+cust+'_'+prod+'.pdf');return;}
  // 💬 שם קובץ באנגלית — וואטסאפ במחשב מציג שם עברי כג'יבריש (כמו בתעודת המשלוח, 13/10)
  const name='labels-'+cust+'-'+prod+(sfx?'-'+sfx:'')+'.pdf';
  const text='מדבקות ברקוד · לקוח '+cust+' · מוצר '+prod+(sfx?' · הזמנה #'+sfx:'')+' · '+(cards.length===1?'מדבקה אחת':cards.length+' מדבקות');
  await _waSharePdf(doc.output('blob'),name,text,'');
}
function bcSharePDF(){return bcDownloadPDF(true);}
// 💬 שליחת PDF בוואטסאפ — משותף לתעודת המשלוח ולמדבקות: חלון השיתוף של המערכת (נייד / Windows עם
// אפליקציית וואטסאפ), ואם אין — הקובץ יורד ונפתחת שיחת וואטסאפ (wa.me, לטלפון אם ידוע) לגרירת הקובץ
async function _waSharePdf(blob,name,text,phone){
  const file=new File([blob],name,{type:'application/pdf'});
  const canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));
  if(!await showConfirm('💬 '+esc(name),canShare?'ה-PDF מוכן. בחלון השיתוף בחר וואטסאפ ואת איש הקשר.'
      :'ה-PDF יירד למחשב ותיפתח שיחת וואטסאפ'+(phone?' עם הלקוח':'')+' — גרור את הקובץ לשיחה.','💬 שלח','ביטול'))return;
  if(canShare){
    try{await navigator.share({files:[file],text});return;}
    catch(e){if(e?.name==='AbortError')return;} // נכשל ⇒ נופלים להורדה
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000);
  window.open('https://wa.me/'+(phone||'')+'?text='+encodeURIComponent(text),'_blank','noopener');
  showToast('📎 ה-PDF ירד — גרור אותו לשיחת הוואטסאפ','var(--green-txt)',8000);
}
