// ─── 💵 מפרעות ושורות ידניות בתשלום משכורות (11/10/2026) — מנהל בלבד ─────────
// adminSettings/payroll_YYYY-MM = {adv:{key:[{id,d,a}]}, add:{key:[{id,a,note}]}, manual:[{id,name,a,note}]} — key = מזהה עובד
// או 'm_'+id לשורה ידנית. החודש = חודש תאריך ה-"מ-" בדוח. נטען לפי דרישה (לא במאזין) וכל כתיבה
// קוראת קודם מהשרת ⇒ שני מכשירי מנהל לא דורסים זה את זה. setDoc מלא — מחיקה אמיתית של מפרעה.
let _payData={},_payRowsCur=[];
const _payKey=from=>String(from||'').slice(0,7);
async function _payLoad(m,force){
  if(!m)return null;
  if(_payData[m]&&!force)return _payData[m];
  const d={adv:{},add:{},manual:[]};
  if(db&&S.fbConnected){
    try{const{doc,getDoc}=window._fb;const s=await getDoc(doc(db,'adminSettings','payroll_'+m));
      if(s.exists()){const x=s.data();d.adv=x.adv||{};d.add=x.add||{};d.manual=x.manual||[];}}
    catch(e){showToast('⚠️ טעינת המפרעות נכשלה','var(--red-txt)');}
  }
  _payData[m]=d;return d;
}
async function _payMutate(fn){
  if(S.user?.role!=='manager')return false;
  if(!db||!S.fbConnected){showToast('⚠️ אין חיבור לשרת','var(--red-txt)');return false;}
  const m=_payKey(document.getElementById('cost-from')?.value);if(!m)return false;
  const d=await _payLoad(m,true);fn(d);
  try{const{doc,setDoc}=window._fb;
    await setDoc(doc(db,'adminSettings','payroll_'+m),{adv:d.adv,add:d.add||{},manual:d.manual,updatedAt:new Date().toISOString(),updatedBy:S.user?.name||''});}
  catch(e){showToast('⚠️ השמירה נכשלה: '+e.message,'var(--red-txt)',6000);delete _payData[m];renderCostTab();return false;}
  renderCostTab();return true;
}
const _payId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// i = אינדקס שורה בדוח שמוצג; '' = מפרעה לכולם באותו תאריך (כמו בעמודות ה-XL)
function payAdvModal(i){
  const list=i===''?_payRowsCur:[_payRowsCur[i]].filter(Boolean);
  if(!list.length)return;
  document.getElementById('padv-wrap')?.remove();
  const t=todayStr();
  const wrap=document.createElement('div');wrap.id='padv-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:420px;width:100%;margin:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">
    <div style="font-size:16px;font-weight:800;margin-bottom:8px">💵 ${i===''?'מפרעות לכולם':'מפרעה — '+esc(list[0].name)}</div>
    <label style="font-size:12px;color:var(--txt3)">תאריך התשלום <span id="padv-dlbl" style="font-weight:700;color:var(--txt)"></span></label>
    <input type="date" id="padv-date" value="${t}" max="${t}" style="width:100%;font-size:14px;margin:4px 0 10px"/>
    <div style="max-height:55vh;overflow-y:auto">${list.map((r,j)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="flex:1;font-size:13px">${esc(r.name)}</span>
      <input type="number" min="0" step="any" inputmode="decimal" data-j="${j}" class="padv-a" placeholder="₪" style="width:110px;font-size:14px;padding:6px"/></div>`).join('')}</div>
    <div style="font-size:11px;color:var(--txt3);margin:4px 0 10px">שדה ריק = בלי מפרעה. סכום חדש מתווסף למפרעות הקיימות.</div>
    <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" id="padv-ok">💾 שמור</button>
      <button class="btn" style="flex:1" onclick="document.getElementById('padv-wrap').remove()">ביטול</button></div></div>`;
  document.body.appendChild(wrap);
  // התאריך גם בפורמט ישראלי — שדה התאריך של הדפדפן מוצג אצל המשתמש כ-mm/dd/yyyy
  const di=document.getElementById('padv-date'),dl=()=>{document.getElementById('padv-dlbl').textContent=di.value?'('+di.value.slice(8,10)+'/'+di.value.slice(5,7)+'/'+di.value.slice(0,4)+')':'';};
  di.oninput=dl;dl();
  setTimeout(()=>wrap.querySelector('.padv-a')?.focus(),50);
  document.getElementById('padv-ok').onclick=async()=>{
    const d=di.value;if(!d||d>t){alert('בחר תאריך עד היום');return;}
    const items=[...wrap.querySelectorAll('.padv-a')].map(x=>({k:list[+x.dataset.j].key,a:+x.value||0})).filter(x=>x.a>0);
    if(!items.length){alert('לא הוזן אף סכום');return;}
    if(await _payMutate(pd=>{items.forEach(x=>{(pd.adv[x.k]||(pd.adv[x.k]=[])).push({id:_payId(),d,a:x.a});});})){
      wrap.remove();showToast('✅ נרשמו '+items.length+' מפרעות');}
  };
}
async function payAdvDel(i,id){
  const key=_payRowsCur[i]?.key;if(!key)return;
  if(!await showConfirm('מחיקת מפרעה','למחוק את המפרעה?','מחק','ביטול'))return;
  await _payMutate(pd=>{const l=(pd.adv[key]||[]).filter(x=>x.id!==id);if(l.length)pd.adv[key]=l;else delete pd.adv[key];});
}
// ➕ תוספת לשכר (הסעות, עבודה בבית, בונוס...) — סכום + תיאור, כמה לכל עובד
function payAddModal(i){
  const r=_payRowsCur[i];if(!r)return;
  document.getElementById('padd-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='padd-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
    <div style="font-size:16px;font-weight:800;margin-bottom:4px">➕ תוספת — ${esc(r.name)}</div>
    <input type="number" id="padd-a" min="0" step="any" inputmode="decimal" placeholder="סכום ₪" style="width:100%;font-size:14px;padding:8px;margin-top:6px"/>
    <input type="text" id="padd-note" list="padd-sugg" placeholder="תיאור (למשל: הסעות)" style="width:100%;font-size:14px;padding:8px;margin-top:6px"/>
    <datalist id="padd-sugg"><option value="הסעות"><option value="עבודה בבית"><option value="בונוס"><option value="שעות נוספות"><option value="החזר הוצאות"></datalist>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${['הסעות','עבודה בבית','בונוס'].map(s=>`<button class="btn" style="font-size:11px;padding:3px 8px" onclick="document.getElementById('padd-note').value='${s}'">${s}</button>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary" style="flex:1" id="padd-ok">💾 שמור</button>
      <button class="btn" style="flex:1" onclick="document.getElementById('padd-wrap').remove()">ביטול</button></div></div>`;
  document.body.appendChild(wrap);
  setTimeout(()=>document.getElementById('padd-a')?.focus(),50);
  document.getElementById('padd-ok').onclick=async()=>{
    const a=+document.getElementById('padd-a').value||0,note=document.getElementById('padd-note').value.trim();
    if(!(a>0)){alert('הזן סכום');return;}
    if(await _payMutate(pd=>{if(!pd.add)pd.add={};(pd.add[r.key]||(pd.add[r.key]=[])).push({id:_payId(),a,note});})){wrap.remove();showToast('✅ התוספת נרשמה');}
  };
}
async function payAddDel(i,id){
  const key=_payRowsCur[i]?.key;if(!key)return;
  if(!await showConfirm('מחיקת תוספת','למחוק את התוספת?','מחק','ביטול'))return;
  await _payMutate(pd=>{const l=(pd.add?.[key]||[]).filter(x=>x.id!==id);if(l.length)pd.add[key]=l;else if(pd.add)delete pd.add[key];});
}
// 🏷 מדבקות משכורת (11/10/2026) — דף A4 עם 32 מדבקות 52.5×35 מ"מ (4×8). שתי אפשרויות:
// שמות בלבד · חשבון (15/10/2026): שם + "حساب 3391+250" (שכר + תוספות) + "من 1/10/2026 - 10/10/2026" (טווח הדוח)
// + שורה לכל מפרעה "سلفة 2191 · 15/10/2026" + "الباقي 1450" (רק כשיש מפרעות/תוספות).
// "דלג על" = מדבקות שכבר נוצלו בדף — ההדפסה מתחילה מהמקום הפנוי הבא (מימין לשמאל, שורה אחרי שורה).
// השם מודפס כפי שהוא שמור (שמות העובדים במערכת בערבית; בשורה ידנית — כפי שהוקלד).
function payLabelsModal(){
  const rows=_payRowsCur.filter(r=>r.salary||r.addSum||r.advSum);
  if(!rows.length){showToast('אין עובדים להדפסה','var(--red-txt)');return;}
  document.getElementById('plbl-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='plbl-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:420px;width:100%;margin:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">
    <div style="font-size:16px;font-weight:800;margin-bottom:4px">🏷 מדבקות — A4 · 32 מדבקות 52.5×35</div>
    <div style="display:flex;gap:14px;margin:8px 0;font-size:13px">
      <label style="display:flex;gap:5px;align-items:center;cursor:pointer"><input type="radio" name="plbl-mode" value="calc" checked style="width:auto"> חשבון משכורת</label>
      <label style="display:flex;gap:5px;align-items:center;cursor:pointer"><input type="radio" name="plbl-mode" value="name" style="width:auto"> שמות בלבד</label>
    </div>
    <label style="font-size:12px;color:var(--txt3)">לדלג על מדבקות שכבר נוצלו בדף</label>
    <input type="number" id="plbl-skip" min="0" max="31" value="0" style="width:100%;font-size:14px;margin:4px 0 8px"/>
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><b>עובדים</b>
      <span><a href="#" onclick="document.querySelectorAll('.plbl-w').forEach(x=>x.checked=true);return false">הכל</a> · <a href="#" onclick="document.querySelectorAll('.plbl-w').forEach(x=>x.checked=false);return false">אף אחד</a></span></div>
    <div style="max-height:40vh;overflow-y:auto;border:1px solid var(--brd);border-radius:8px;padding:6px">${rows.map(r=>`<label style="display:flex;gap:6px;align-items:center;font-size:13px;padding:2px 0;cursor:pointer">
      <input type="checkbox" class="plbl-w" data-k="${esc(r.key)}" checked style="width:auto"> <span style="flex:1">${esc(r.name)}</span><span style="color:var(--txt3)">₪${(+r.remain).toLocaleString()}</span></label>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary" style="flex:1" id="plbl-ok">🖨 הדפס</button>
      <button class="btn" style="flex:1" onclick="document.getElementById('plbl-wrap').remove()">ביטול</button></div></div>`;
  document.body.appendChild(wrap);
  document.getElementById('plbl-ok').onclick=()=>{
    const mode=wrap.querySelector('input[name="plbl-mode"]:checked')?.value||'calc';
    const skip=Math.max(0,Math.min(31,parseInt(document.getElementById('plbl-skip').value,10)||0));
    const keys=new Set([...wrap.querySelectorAll('.plbl-w:checked')].map(x=>x.dataset.k));
    const sel=rows.filter(r=>keys.has(r.key));
    if(!sel.length){alert('לא נבחר אף עובד');return;}
    wrap.remove();printPayLabels(sel,mode,skip);
  };
}
function printPayLabels(sel,mode,skip){
  const from=document.getElementById('cost-from')?.value||'',to=document.getElementById('cost-to')?.value||'';
  const dmy=d=>d?(parseInt(d.slice(8,10),10)+'/'+parseInt(d.slice(5,7),10)+'/'+d.slice(0,4)):'';
  const mon=from?(parseInt(from.slice(5,7),10)+'/'+from.slice(0,4)):'';
  const rng=from?dmy(from)+' - '+dmy(to||from):'';
  const n=v=>{const x=Math.round((+v||0)*100)/100;return String(x);};
  const sal=r=>n(r.salary)+(r.addSum?'+'+n(r.addSum):'');
  // שם ארוך מוקטן כדי שלא יישבר לשתי שורות ברוחב 52.5 מ"מ
  const fs=(s,big)=>{const l=String(s).length;return big?(l>14?11:l>10?14:17):(l>16?9:l>12?11:13);};
  const cell=r=>mode==='name'
    ?`<div class="lb"><div class="nm" style="font-size:${fs(r.name,true)}pt">${esc(r.name)}</div></div>`
    :`<div class="lb"><div class="nm" style="font-size:${fs(r.name,false)}pt">${esc(r.name)}</div>
       <div class="ln">حساب <span dir="ltr" class="num">${esc(sal(r))}</span></div>
       ${rng?`<div class="ln sm">من <span dir="ltr">${esc(rng)}</span></div>`:''}
       ${(r.adv||[]).map(x=>`<div class="ln sm">سلفة <span dir="ltr" class="num">${esc(n(x.a))}</span> · <span dir="ltr">${esc(dmy(x.d))}</span></div>`).join('')}
       ${(r.addSum||r.advSum)?`<div class="ln">الباقي <span dir="ltr" class="num">${esc(n(r.remain))}</span></div>`:''}</div>`;
  const cells=[...Array(skip).fill('<div class="lb"></div>'),...sel.map(cell)];
  const pages=[];for(let i=0;i<cells.length;i+=32)pages.push(cells.slice(i,i+32));
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>מדבקות משכורת ${esc(mon)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Tahoma,sans-serif;background:#fff;color:#000}
    /* @page margin:0 ⇒ Chrome לא מדפיס כותרת/כתובת/מספר עמוד על רצועת הדף. השוליים העליונים (8.5 מ"מ) כאן */
    .pg{display:grid;grid-template-columns:repeat(4,52.5mm);grid-auto-rows:35mm;width:210mm;padding-top:8.5mm;page-break-after:always;break-after:page}
    .pg:last-child{page-break-after:auto;break-after:auto}
    .lb{width:52.5mm;height:35mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2mm 2mm;gap:.8mm}
    .nm{font-weight:800;line-height:1.15;white-space:nowrap;max-width:100%;overflow:hidden}
    .ln{font-size:11pt;line-height:1.2;white-space:nowrap}
    .num{font-weight:700;font-size:11pt}
    .sm,.sm .num{font-size:8.5pt}
    @media print{@page{size:A4 portrait;margin:0}}
  </style></head><body>${pages.map(p=>`<div class="pg">${p.join('')}</div>`).join('')}</body></html>`);
}
// שורה ידנית — מי שלא בנוכחות (נהגים וכו'). mid ריק = חדשה
function payManualModal(mid){
  const m=_payKey(document.getElementById('cost-from')?.value);
  if(!m)return;
  const cur=mid?(_payData[m]?.manual||[]).find(x=>x.id===mid):null;
  document.getElementById('pman-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='pman-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  const f=(id,ph,v,type)=>`<input type="${type||'text'}" id="${id}" placeholder="${esc(ph)}" value="${esc(v??'')}" style="width:100%;font-size:14px;padding:8px;margin-top:6px"/>`;
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
    <div style="font-size:16px;font-weight:800;margin-bottom:4px">✍ ${cur?'עריכת שורה ידנית':'שורה ידנית'} — ${esc(m)}</div>
    ${f('pman-name','שם',cur?.name)}${f('pman-a','סכום לתשלום ₪',cur?.a,'number')}${f('pman-note','הערה (לא חובה)',cur?.note)}
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary" style="flex:1" id="pman-ok">💾 שמור</button>
      ${cur?`<button class="btn" style="color:var(--red-txt)" id="pman-del">🗑</button>`:''}
      <button class="btn" style="flex:1" onclick="document.getElementById('pman-wrap').remove()">ביטול</button></div></div>`;
  document.body.appendChild(wrap);
  setTimeout(()=>document.getElementById('pman-name')?.focus(),50);
  document.getElementById('pman-ok').onclick=async()=>{
    const name=document.getElementById('pman-name').value.trim(),a=+document.getElementById('pman-a').value||0,note=document.getElementById('pman-note').value.trim();
    if(!name){alert('חסר שם');return;}
    if(await _payMutate(pd=>{if(cur){const x=pd.manual.find(y=>y.id===cur.id);if(x)Object.assign(x,{name,a,note});}else pd.manual.push({id:_payId(),name,a,note});}))wrap.remove();
  };
  if(cur)document.getElementById('pman-del').onclick=async()=>{
    if(!await showConfirm('מחיקת שורה','למחוק את "'+cur.name+'" ואת המפרעות שלה?','מחק','ביטול'))return;
    if(await _payMutate(pd=>{pd.manual=pd.manual.filter(y=>y.id!==cur.id);delete pd.adv['m_'+cur.id];if(pd.add)delete pd.add['m_'+cur.id];}))wrap.remove();
  };
}

function printPayroll(){
  const from=document.getElementById('cost-from')?.value||'';
  const to=document.getElementById('cost-to')?.value||'';
  const tbl=document.getElementById('payroll-table')?.outerHTML||'';
  const now=new Date().toLocaleDateString('he-IL');
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head>
    <meta charset="UTF-8"/><title>תשלום משכורות</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:24px;color:#000;background:#fff;font-size:13px}
      h1{font-size:18px;margin-bottom:4px;color:#185FA5}
      .sub{font-size:12px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f5f5f5;padding:8px;text-align:right;border-bottom:2px solid #ccc;font-weight:700}
      td{padding:7px 8px;border-bottom:1px solid #eee}
      .np{display:none!important}
      @media print{body{padding:10px}}
    </style>
  </head><body>
    <h1>✂️ TextileOps — תשלום משכורות</h1>
    <div class="sub">תקופה: ${from} עד ${to} | הודפס: ${now}</div>
    ${tbl}
  </body></html>`);
}

