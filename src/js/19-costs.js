// ─── COSTS MODULE ────────────────────────────────────────────

function initCostsPage(){
  const today=todayStr();
  const monthAgo=new Date();monthAgo.setDate(monthAgo.getDate()-30);
  const fi=document.getElementById('cost-from');
  const ti=document.getElementById('cost-to');
  if(fi&&!fi.value)fi.value=monthAgo.toISOString().slice(0,10);
  if(ti&&!ti.value)ti.value=today;
  document.getElementById('cost-fixed').value=S.costs.fixedDaily||0;
  document.getElementById('cost-fixed-monthly').value=S.costs.fixedMonthly||0;
  document.getElementById('cost-workdays-month').value=S.costs.workDaysMonth||22;
  document.getElementById('cost-fixed-annual').value=S.costs.fixedAnnual||0;
  document.getElementById('cost-workdays-year').value=S.costs.workDaysYear||250;
  document.getElementById('cost-tax-pct').value=S.costs.taxPct||0;
  document.getElementById('cost-bank-pct').value=S.costs.bankPct||0;
  // שעה עמוסה + תקורה (שלב ג')
  const lhSev=document.getElementById('lh-sev');if(lhSev)lhSev.value=S.costs.severancePct??8.33;
  const lhHol=document.getElementById('lh-hol');if(lhHol)lhHol.value=S.costs.holidayDays??4;
  const lhGifts=document.getElementById('lh-gifts');if(lhGifts)lhGifts.value=S.costs.giftsAnnual||0;
  const lhTrip=document.getElementById('lh-trip');if(lhTrip)lhTrip.value=S.costs.tripAnnual||0;
  const lhBuf=document.getElementById('lh-buffer');if(lhBuf)lhBuf.value=S.costs.overheadBufferPct??10;
  const lhWin=document.getElementById('lh-months-win');if(lhWin)lhWin.value=String(Math.max(1,Math.min(3,parseInt(S.costs.overheadMonthsWindow)||3)));
  const cmMonth=document.getElementById('cm-month');if(cmMonth&&!cmMonth.value){const d=new Date();d.setMonth(d.getMonth()-1);cmMonth.value=d.toISOString().slice(0,7);}
  renderWorkerRates();
  renderVarExpList();
  ensureAutoCostMonths();
  renderLoadedHourTable();
  renderCostMonths();
  renderOverheadResult();
  calcCosts();
}

function setCostRange(r){
  const today=new Date();
  const fi=document.getElementById('cost-from');
  const ti=document.getElementById('cost-to');
  ti.value=todayStr();
  if(r==='today'){fi.value=todayStr();}
  else if(r==='week'){const d=new Date();d.setDate(d.getDate()-7);fi.value=d.toISOString().slice(0,10);}
  else if(r==='month'){const d=new Date();d.setDate(d.getDate()-30);fi.value=d.toISOString().slice(0,10);}
  calcCosts();
}

// אוסף את המחלקות המסומנות לעובד. תיבות סימון ולא select multiple — האחרון
// דורש Ctrl+לחיצה ובנייד אי אפשר לבחור בו יותר ממחלקה אחת.
function _ovDeptToggle(wid){
  if(!S.costs.oversightDepts)S.costs.oversightDepts={};
  S.costs.oversightDepts[wid]=Array.from(
    document.querySelectorAll('input[data-ovw="'+wid+'"]:checked')).map(x=>x.value);
}
// ⏱️ שינוי מיידי — משפיע גם על דוח היעילות וגם על העלות, ולכן נשמר ומרענן על המקום.
function setScanMinPerTask(v){
  S.costs.scanMinPerTask=(v===''||v==null)?null:(parseFloat(v)||0);
  saveLS();
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  try{calcCosts();}catch(e){}
}
// 📸 הערכים כפי שהוצגו — כדי לזהות בשמירה מה השתנה (השדות כותבים ל-S.costs תוך כדי הקלדה)
let _wcSnap={};
function renderWorkerRates(){
  const el=document.getElementById('cost-worker-rates');
  if(!el)return;
  _wcSnap={};S.workers.forEach(w=>{_wcSnap[w.id]=_wcCur(w.id);});
  // ⏱️ הגדרה גלובלית אחת — כמה דקות עולה סריקה אחת עבור עובד אחר.
  // המקור: רגרסיה על 58 משימות של האחראי (18/09/2026) — 2.4 דק' לסריקה.
  // 0 = המנגנון כבוי לגמרי (גם הניכוי בזמן וגם העלות שנזקפת למוצר).
  el.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:8px;background:var(--bg2);border-radius:var(--r);flex-wrap:wrap">
    <span style="font-size:12px;font-weight:600;color:var(--txt)">⇄ עלות סריקה עבור עובד אחר</span>
    <input type="number" min="0" step="0.1" placeholder="4.2" value="${S.costs.scanMinPerTask!=null?esc(String(S.costs.scanMinPerTask)):''}"
      style="width:80px;font-size:13px;text-align:left;padding:5px 8px"
      title="כמה דקות נזקפות לכל סריקה שעובד מבצע עבור עובד אחר. הזמן מנוכה מהבפועל שלו בהשוואה לצפי, והעלות נזקפת למוצר שנסרק. ריק = 4.2 (ברירת מחדל שנמדדה). 0 = כבוי."
      onchange="setScanMinPerTask(this.value)"/>
    <span style="font-size:11px;color:var(--txt3)">דק' לסריקה · ריק = 4.2 · 0 = כבוי</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    ${S.workers.map(w=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg2);border-radius:var(--r)">
        <div class="av" style="width:30px;height:30px;font-size:11px;flex-shrink:0">${esc(w.name.split(' ').map(n=>n[0]).join(''))}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.name)}</div>
          <div style="font-size:10px;color:var(--txt3)">${esc(w.dept)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <input type="number" min="0" placeholder="0" value="${S.costs.workerRates[w.id]||''}"
            style="width:80px;font-size:13px;text-align:left;padding:5px 8px"
            onchange="S.costs.workerRates['${w.id}']=parseFloat(this.value)||0"
            oninput="S.costs.workerRates['${w.id}']=parseFloat(this.value)||0"/>
          <div style="font-size:10px;color:var(--txt3)">₪/יום</div>
          <input type="number" min="0" step="0.01" placeholder="0" value="${S.costs.workerUnitRates?.[w.id]||''}"
            style="width:80px;font-size:13px;text-align:left;padding:5px 8px;border-color:var(--green-txt)"
            onchange="if(!S.costs.workerUnitRates)S.costs.workerUnitRates={};S.costs.workerUnitRates['${w.id}']=parseFloat(this.value)||0"
            oninput="if(!S.costs.workerUnitRates)S.costs.workerUnitRates={};S.costs.workerUnitRates['${w.id}']=parseFloat(this.value)||0"/>
          <div style="font-size:10px;color:var(--green-txt)">₪/יחידה</div>
          <input type="number" min="0" placeholder="0" value="${S.costs.workerTransport?.[w.id]||''}"
            style="width:80px;font-size:13px;text-align:left;padding:5px 8px;border-color:var(--blue-txt)"
            onchange="if(!S.costs.workerTransport)S.costs.workerTransport={};S.costs.workerTransport['${w.id}']=parseFloat(this.value)||0"
            oninput="if(!S.costs.workerTransport)S.costs.workerTransport={};S.costs.workerTransport['${w.id}']=parseFloat(this.value)||0"/>
          <div style="font-size:10px;color:var(--blue-txt)">🚌 הסעה ₪/יום</div>
          <input type="number" min="0" placeholder="0" value="${S.costs.workerInsurance?.[w.id]||''}"
            style="width:80px;font-size:13px;text-align:left;padding:5px 8px;border-color:var(--amber-txt)"
            onchange="if(!S.costs.workerInsurance)S.costs.workerInsurance={};S.costs.workerInsurance['${w.id}']=parseFloat(this.value)||0"
            oninput="if(!S.costs.workerInsurance)S.costs.workerInsurance={};S.costs.workerInsurance['${w.id}']=parseFloat(this.value)||0"/>
          <div style="font-size:10px;color:var(--amber-txt)">🛡 ביטוח ₪/שנה</div>
          <input type="number" min="0" placeholder="כללי" value="${S.costs.workerGiftsTrip?.[w.id]??''}"
            title="עלות שנתית למתנות + טיול לעובד הזה. ריק = לפי ההגדרה הכללית בכרטיס &quot;שעה עמוסה&quot;"
            style="width:80px;font-size:13px;text-align:left;padding:5px 8px;border-color:var(--amber-txt)"
            oninput="setWorkerGiftsTrip('${w.id}',this.value)"/>
          <div style="font-size:10px;color:var(--amber-txt)">🎁 מתנות+טיול ₪/שנה</div>
          ${(S.costs.workerHist?.[w.id]||[]).length>1?`<a href="#" onclick="showWorkerCostHist('${escj(w.id)}');return false" style="font-size:10px;color:var(--blue-txt)">📅 היסטוריה (${S.costs.workerHist[w.id].length-1} שינויים)</a>`:''}
          <input type="number" min="0" max="100" placeholder="0" value="${S.costs.oversightPct?.[w.id]||''}"
            style="width:80px;font-size:13px;text-align:left;padding:5px 8px;border-color:var(--purple-txt,var(--blue-txt))"
            title="תקרת אחוז: כמה מיום העבודה מותר לזקוף כפיקוח. 0 = המנגנון כבוי לעובד הזה."
            onchange="if(!S.costs.oversightPct)S.costs.oversightPct={};S.costs.oversightPct['${w.id}']=parseFloat(this.value)||0"
            oninput="if(!S.costs.oversightPct)S.costs.oversightPct={};S.costs.oversightPct['${w.id}']=parseFloat(this.value)||0"/>
          <div style="font-size:10px;color:var(--purple-txt,var(--blue-txt))">🎯 תקרת פיקוח %</div>
          <div style="width:140px;max-height:70px;overflow-y:auto;border:1px solid var(--brd);border-radius:4px;padding:3px;background:var(--bg)"
            title="על אילו מחלקות הוא אחראי — לשם יתחלק זמן הפיקוח. אפשר לסמן כמה. בלי בחירה המנגנון לא פועל.">
            ${S.depts.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:10px;cursor:pointer;padding:1px 0">
              <input type="checkbox" data-ovw="${esc(w.id)}" value="${esc(d)}" ${((S.costs.oversightDepts?.[w.id])||[]).includes(d)?'checked':''}
                style="width:13px;height:13px;flex-shrink:0;margin:0" onchange="_ovDeptToggle('${escj(w.id)}')"/>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d)}</span>
            </label>`).join('')}
          </div>
          <div style="font-size:10px;color:var(--purple-txt,var(--blue-txt))">אחראי על מחלקות (אפשר כמה)</div>
        </div>
      </div>`).join('')}
  </div>`;
}

// חודש השיוך של הוצאה משתנה: `month` אם הוזן, אחרת החודש של תאריך התשלום.
// רשומות ישנות נשמרו בלי `month` ולכן נופלות לתאריך — התנהגות זהה לקודם.
function vexpMonth(e){return (e&&e.month)||String(e&&e.date||'').slice(0,7);}
function renderVarExpList(){
  const el=document.getElementById('vexp-list');
  if(!el)return;
  const exps=S.costs.variableExpenses||[];
  if(!exps.length){el.innerHTML='<div style="font-size:11px;color:var(--txt3);text-align:center;padding:8px">אין הוצאות משתנות</div>';return;}
  el.innerHTML=exps.slice().reverse().map((e,ri)=>{
    const i=exps.length-1-ri;
    const shifted=e.month&&e.month!==String(e.date||'').slice(0,7);
    return`<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:0.5px solid var(--b);font-size:12px">
      <span style="color:var(--txt3);width:80px;flex-shrink:0">${esc(e.date||'')}</span>
      <span style="font-weight:600;color:var(--blue-txt);width:60px;flex-shrink:0">₪${Number(e.amount).toLocaleString()}</span>
      <span style="flex:1;color:var(--txt2)">${esc(e.desc||'')}${shifted?` <span class="badge gray" style="font-size:10px" title="ההוצאה נזקפת לחודש הזה ולא לחודש התשלום">↩ נזקף ל-${esc(e.month)}</span>`:''}</span>
      <button onclick="delVarExp(${i})" style="background:none;border:none;color:var(--red-txt);cursor:pointer;font-size:14px;padding:0 4px">×</button>
    </div>`;
  }).join('');
}

function addVarExp(){
  const date=document.getElementById('vexp-date').value||todayStr();
  const month=document.getElementById('vexp-month')?.value||'';
  const amount=parseFloat(document.getElementById('vexp-amount').value)||0;
  const desc=(document.getElementById('vexp-desc').value||'').trim();
  if(!amount){alert('הזן סכום');return;}
  // חודש שיוך נשמר רק אם הוא באמת שונה מחודש התשלום — אחרת רק רעש במסמך
  const rec={date,amount,desc};
  if(month&&month!==date.slice(0,7))rec.month=month;
  S.costs.variableExpenses.push(rec);
  document.getElementById('vexp-amount').value='';
  document.getElementById('vexp-desc').value='';
  if(document.getElementById('vexp-month'))document.getElementById('vexp-month').value='';
  saveLS();
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  renderVarExpList();renderCostMonths();
}

function delVarExp(i){
  S.costs.variableExpenses.splice(i,1);
  saveLS();
  // נשמר מיד ולא ממתין לכפתור "שמור" — הרשימה הזאת מזינה את סה"כ החודש
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  renderVarExpList();renderCostMonths();
}

// ─── הוצאות עובדים ───────────────────────────────────────────
function previewExpensePhoto(input){
  const prev=document.getElementById('exp-photo-preview');
  if(!prev)return;
  const f=input.files[0];
  if(!f){prev.innerHTML='';return;}
  compressImageFile(f,400,0.6).then(b64=>{
    prev.innerHTML=`<img src="${b64}" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid var(--border)"/>`;
  }).catch(()=>{prev.innerHTML='';});
}

function compressImageFile(file,maxPx,quality){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width,h=img.height;
        if(w>maxPx||h>maxPx){if(w>h){h=Math.round(h*maxPx/w);w=maxPx;}else{w=Math.round(w*maxPx/h);h=maxPx;}}
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',quality));
      };
      img.onerror=reject;
      img.src=e.target.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

async function submitExpense(){
  if(!S.user)return;
  const T=LANGS[currentLang]||LANGS.he;
  const amountEl=document.getElementById('exp-amount');
  const descEl=document.getElementById('exp-desc');
  const msgEl=document.getElementById('exp-msg');
  const amount=parseFloat(amountEl?.value);
  const desc=(descEl?.value||'').trim();
  if(!amount||amount<=0){if(msgEl){msgEl.style.color='var(--danger)';msgEl.textContent=T.exp_err_amount;} return;}
  if(!desc){if(msgEl){msgEl.style.color='var(--danger)';msgEl.textContent=T.exp_err_desc;} return;}
  const photoFile=document.getElementById('exp-photo')?.files[0];
  let photo='';
  if(photoFile){try{photo=await compressImageFile(photoFile,800,0.5);}catch(e){}}
  const id='exp_'+Date.now()+'_'+S.user.id;
  const now=new Date();
  const time=pad2(now.getHours())+':'+pad2(now.getMinutes());
  const exp={id,workerId:S.user.id,workerName:S.user.name,dept:S.user.dept||'',
    amount,desc,photo,date:todayStr(),time,ts:Date.now()};
  S.workerExpenses.unshift(exp);
  if(S.fbConnected&&db)fbSet('workerExpenses',id,exp);
  amountEl.value='';descEl.value='';
  document.getElementById('exp-photo').value='';
  document.getElementById('exp-photo-preview').innerHTML='';
  if(msgEl){msgEl.style.color='green';msgEl.textContent=T.exp_sent;}
  setTimeout(()=>{if(msgEl)msgEl.textContent='';},3000);
  renderExpenses();
}

function clearExpFilter(){
  const f=document.getElementById('exp-from');const t=document.getElementById('exp-to');
  if(f)f.value='';if(t)t.value='';
  renderExpenses();
}

// אחראי ומנהל רואים את כל ההוצאות; עובד/עוזר — רק את שלו (נאכף גם ב-firestore.rules)
function _expSeeAll(){return !!S.user&&(S.user.role==='manager'||S.user.role==='supervisor');}
function renderExpenses(){
  const listEl=document.getElementById('exp-list');
  if(!listEl)return;
  const T=LANGS[currentLang]||LANGS.he;
  const isManager=S.user?.role==='manager';
  const fromVal=document.getElementById('exp-from')?.value||'';
  const toVal=document.getElementById('exp-to')?.value||'';
  let exps=[...S.workerExpenses];
  // גם בזיכרון — הגנה מפני שאריות ממשתמש קודם באותו טאב עד שהשאילתה החדשה חוזרת
  if(!_expSeeAll())exps=exps.filter(e=>S.user&&e.workerId===S.user.id);
  if(fromVal)exps=exps.filter(e=>(e.date||'')>=fromVal);
  if(toVal)exps=exps.filter(e=>(e.date||'')<=toVal);
  const titleEl=document.getElementById('exp-list-title');
  if(titleEl)titleEl.textContent=(_expSeeAll()?T.exp_all_list:(T.exp_my_list||T.exp_all_list))+' ('+exps.length+')';
  const total=exps.reduce((s,e)=>s+Number(e.amount||0),0);
  const badge=document.getElementById('exp-total-badge');
  if(badge)badge.textContent=exps.length?T.exp_total+': ₪'+total.toFixed(2):'';
  if(!exps.length){listEl.innerHTML='<div style="color:var(--txt3);text-align:center;padding:20px">'+T.exp_empty+'</div>';return;}
  listEl.innerHTML=exps.map(e=>`
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:16px;color:var(--primary)">₪${Number(e.amount).toFixed(2)}</div>
        <div style="font-size:13px;color:var(--txt2);margin-top:2px;word-break:break-word">${esc(e.desc)}</div>
        <div style="font-size:12px;color:var(--txt3);margin-top:3px">👤 ${esc(e.workerName||'')} — ${esc(e.dept||'')}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px">📅 ${e.date||''}${e.time?' ⏰ '+e.time:''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0">
        ${e.photo?`<button class="btn" onclick="viewExpensePhoto('${e.id}')" style="font-size:11px;padding:3px 8px">${T.exp_view_receipt}</button>`:''}
        ${isManager?`<button class="btn danger" onclick="deleteExpense('${e.id}')" style="font-size:11px;padding:3px 8px">🗑</button>`:''}
      </div>
    </div>`).join('');
}

function closeExpensePhoto(){const o=document.getElementById('exp-photo-overlay');if(o)o.remove();}
function viewExpensePhoto(id){
  const exp=S.workerExpenses.find(e=>e.id===id);
  if(!exp?.photo)return;
  // חלון-על בתוך הדף (לא window.open) — ב-PWA במסך הבית אין סרגל דפדפן ואי אפשר לסגור חלון חדש
  closeExpensePhoto();
  const ov=document.createElement('div');
  ov.id='exp-photo-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px';
  ov.onclick=closeExpensePhoto;
  const cap='👤 '+esc(exp.workerName||'')+' · '+esc(exp.desc||'')+' · '+esc(exp.date||'')+' · ₪'+Number(exp.amount).toFixed(2);
  ov.innerHTML=`<button onclick="closeExpensePhoto()" style="position:absolute;top:12px;left:12px;background:#fff;color:#111;border:none;border-radius:999px;width:44px;height:44px;font-size:22px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)">✕</button>
    <p style="color:#eee;font-size:13px;text-align:center;margin:0;max-width:92vw">${cap}</p>
    <img src="${exp.photo}" style="max-width:96vw;max-height:80vh;border-radius:6px" onclick="event.stopPropagation()"/>
    <button onclick="closeExpensePhoto()" style="background:#fff;color:#111;border:none;border-radius:8px;padding:10px 28px;font-size:15px;font-weight:600;cursor:pointer">✕ ${(LANGS[currentLang]||LANGS.he).close||'סגור'}</button>`;
  document.body.appendChild(ov);
}

async function deleteExpense(id){
  const T=LANGS[currentLang]||LANGS.he;
  if(!confirm(T.exp_delete_confirm))return;
  S.workerExpenses=S.workerExpenses.filter(e=>e.id!==id);
  if(S.fbConnected&&db)await fbDel('workerExpenses',id);
  renderExpenses();
}
// ─────────────────────────────────────────────────────────────

// ─── 🧾 קופת המפעל ────────────────────────────────────────────
// מעקב מזומן בלבד. **אינה הוצאה**: לא נכנסת ל-recordedExpenseSum, לא ל-costMonths,
// לא לתקורה ולא לדוחות הרווח. הכסף שנלקח מהקופה משמש לתשלומים שכבר נרשמים
// במקומם הנכון (לשונית הוצאות / הוצאות משתנות) — ספירה כאן תהיה ספירה כפולה.
// `type`: 'in' = הכנסת כסף (מנהל בלבד) · 'out' = לקיחה (כל בעל גישה).
function previewCashPhoto(input){
  const prev=document.getElementById('cash-photo-preview');
  if(!prev)return;
  const f=input.files[0];
  if(!f){prev.innerHTML='';return;}
  compressImageFile(f,400,0.6).then(b64=>{
    prev.innerHTML=`<img src="${b64}" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid var(--brd)"/>`;
  }).catch(()=>{prev.innerHTML='';});
}
function cashIsMgr(){return S.user?.role==='manager';}
function _cashMsg(el,txt,ok){const m=document.getElementById(el);if(!m)return;
  m.style.color=ok?'green':'var(--danger)';m.textContent=txt;
  if(ok)setTimeout(()=>{if(m)m.textContent='';},3000);}

async function _addCashEntry(type,amount,desc,photo,msgEl){
  const T=LANGS[currentLang]||LANGS.he;
  const id='cash_'+Date.now()+'_'+S.user.id;
  const now=new Date();
  const rec={id,type,workerId:S.user.id,workerName:S.user.name,dept:S.user.dept||'',
    amount,desc,photo:photo||'',date:todayStr(),
    time:pad2(now.getHours())+':'+pad2(now.getMinutes()),ts:Date.now()};
  S.cashbox.unshift(rec);
  if(S.fbConnected&&db){
    try{await fbSet('cashbox',id,rec);}
    catch(e){
      // חוק Firestore דוחה הפקדה שאינה ממנהל — מסירים מהמצב המקומי כדי
      // שהיתרה לא תשקר עד לרענון
      S.cashbox=S.cashbox.filter(x=>x.id!==id);
      _cashMsg(msgEl,T.cash_err_denied||'הפעולה נדחתה',false);
      renderCashbox();return false;
    }
  }
  _cashMsg(msgEl,T.cash_saved||'✅ נרשם',true);
  renderCashbox();return true;
}
async function submitCashIn(){
  if(!S.user)return;
  const T=LANGS[currentLang]||LANGS.he;
  if(!cashIsMgr()){_cashMsg('cash-in-msg',T.cash_err_mgr||'מנהל בלבד',false);return;}
  const amount=parseFloat(document.getElementById('cash-in-amount')?.value);
  if(!amount||amount<=0){_cashMsg('cash-in-msg',T.exp_err_amount,false);return;}
  const desc=(document.getElementById('cash-in-desc')?.value||'').trim();
  if(await _addCashEntry('in',amount,desc,'','cash-in-msg')){
    document.getElementById('cash-in-amount').value='';
    document.getElementById('cash-in-desc').value='';
  }
}
async function submitCashOut(){
  if(!S.user)return;
  const T=LANGS[currentLang]||LANGS.he;
  const amount=parseFloat(document.getElementById('cash-out-amount')?.value);
  const desc=(document.getElementById('cash-out-desc')?.value||'').trim();
  if(!amount||amount<=0){_cashMsg('cash-out-msg',T.exp_err_amount,false);return;}
  if(!desc){_cashMsg('cash-out-msg',T.exp_err_desc,false);return;}
  const photoFile=document.getElementById('cash-photo')?.files[0];
  let photo='';
  if(photoFile){try{photo=await compressImageFile(photoFile,800,0.5);}catch(e){}}
  if(await _addCashEntry('out',amount,desc,photo,'cash-out-msg')){
    document.getElementById('cash-out-amount').value='';
    document.getElementById('cash-out-desc').value='';
    document.getElementById('cash-photo').value='';
    document.getElementById('cash-photo-preview').innerHTML='';
  }
}
function clearCashFilter(){
  const f=document.getElementById('cash-from'),t=document.getElementById('cash-to');
  if(f)f.value='';if(t)t.value='';
  renderCashbox();
}
async function deleteCashEntry(id){
  const T=LANGS[currentLang]||LANGS.he;
  if(!cashIsMgr())return;
  if(!confirm(T.cash_delete_confirm||'למחוק את הרשומה?'))return;
  S.cashbox=S.cashbox.filter(e=>e.id!==id);
  if(S.fbConnected&&db)await fbDel('cashbox',id);
  renderCashbox();
}
function renderCashbox(){
  const listEl=document.getElementById('cash-list');
  if(!listEl)return;
  const T=LANGS[currentLang]||LANGS.he;
  document.getElementById('cash-in-card')?.classList.toggle('hidden',!cashIsMgr());
  const all=S.cashbox||[];
  // 🔑 היתרה תמיד על **כל** ההיסטוריה — סינון התאריכים משנה רק את הרשימה.
  // יתרה שמסתננת לפי טווח היא מספר חסר משמעות.
  const sum=(a,t)=>a.filter(e=>e.type===t).reduce((s,e)=>s+Number(e.amount||0),0);
  const cin=sum(all,'in'),cout=sum(all,'out');
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('cash-in-total','₪'+cin.toLocaleString(undefined,{maximumFractionDigits:2}));
  set('cash-out-total','₪'+cout.toLocaleString(undefined,{maximumFractionDigits:2}));
  const bal=cin-cout,balEl=document.getElementById('cash-balance');
  if(balEl){balEl.textContent='₪'+bal.toLocaleString(undefined,{maximumFractionDigits:2});
    balEl.style.color=bal<0?'var(--red-txt)':'var(--txt)';}

  const from=document.getElementById('cash-from')?.value||'';
  const to=document.getElementById('cash-to')?.value||'';
  let rows=[...all];
  if(from)rows=rows.filter(e=>(e.date||'')>=from);
  if(to)rows=rows.filter(e=>(e.date||'')<=to);
  const tEl=document.getElementById('cash-list-title');
  if(tEl)tEl.textContent=(T.cash_list||'📋 תנועות הקופה')+' ('+rows.length+')';
  const rBadge=document.getElementById('cash-range-badge');
  if(rBadge)rBadge.textContent=(from||to)
    ? '+₪'+sum(rows,'in').toLocaleString()+' / −₪'+sum(rows,'out').toLocaleString() : '';

  if(!rows.length){listEl.innerHTML='<div style="font-size:12px;color:var(--txt3);text-align:center;padding:14px">'+(T.cash_empty||'אין תנועות')+'</div>';return;}
  listEl.innerHTML=rows.map(e=>{
    const out=e.type==='out';
    const col=out?'var(--red-txt)':'var(--green-txt)';
    return`<div style="border-bottom:0.5px solid var(--brd);padding:8px 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;color:${col}">${out?'−':'+'}₪${Number(e.amount||0).toLocaleString(undefined,{maximumFractionDigits:2})}</div>
          <div style="font-size:13px;color:var(--txt2);word-break:break-word">${esc(e.desc||'')}</div>
          <div style="font-size:11px;color:var(--txt3);margin-top:2px">👤 ${esc(e.workerName||'')}${e.dept?' — '+esc(e.dept):''}</div>
          <div style="font-size:11px;color:var(--txt3)">📅 ${esc(e.date||'')} 🕐 ${esc(e.time||'')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <span class="badge ${out?'red':'green'}" style="font-size:10px">${out?(T.cash_tag_out||'לקיחה'):(T.cash_tag_in||'הכנסה')}</span>
          ${e.photo?`<button class="btn" style="font-size:11px;padding:3px 8px" onclick="showCashPhoto('${escj(e.id)}')">🧾</button>`:''}
          ${cashIsMgr()?`<button class="btn danger" style="font-size:11px;padding:3px 8px" onclick="deleteCashEntry('${escj(e.id)}')">🗑</button>`:''}
        </div>
      </div>
    </div>`;}).join('');
}
// חלון-על בתוך הדף (לא window.open) — ב-PWA במסך הבית אין סרגל דפדפן לסגירה
function closeCashPhoto(){const o=document.getElementById('cash-photo-overlay');if(o)o.remove();}
function showCashPhoto(id){
  const e=(S.cashbox||[]).find(x=>x.id===id);
  if(!e?.photo)return;
  closeCashPhoto();
  const ov=document.createElement('div');
  ov.id='cash-photo-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px';
  ov.onclick=closeCashPhoto;
  const cap='👤 '+esc(e.workerName||'')+' · '+esc(e.desc||'')+' · '+esc(e.date||'')+' · ₪'+Number(e.amount).toFixed(2);
  ov.innerHTML=`<button onclick="closeCashPhoto()" style="position:absolute;top:12px;left:12px;background:#fff;color:#111;border:none;border-radius:999px;width:44px;height:44px;font-size:22px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)">✕</button>
    <p style="color:#eee;font-size:13px;text-align:center;margin:0;max-width:92vw">${cap}</p>
    <img src="${e.photo}" style="max-width:96vw;max-height:80vh;border-radius:6px" onclick="event.stopPropagation()"/>
    <button onclick="closeCashPhoto()" style="background:#fff;color:#111;border:none;border-radius:8px;padding:10px 28px;font-size:15px;font-weight:600;cursor:pointer">✕ ${(LANGS[currentLang]||LANGS.he).close||'סגור'}</button>`;
  document.body.appendChild(ov);
}
// ─────────────────────────────────────────────────────────────

// חלון "בתוקף מתאריך" — מחזיר YYYY-MM-DD או null (ביטול)
function askEffectiveDate(names){
  return new Promise(res=>{
    document.getElementById('wcd-wrap')?.remove();
    const t=todayStr();
    const wrap=document.createElement('div');wrap.id='wcd-wrap';
    wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px';
    wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:380px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">📅 מאיזה תאריך השינוי בתוקף?</div>
      <div style="font-size:12px;color:var(--txt3);margin-bottom:10px">השתנו עלויות של: <b style="color:var(--txt)">${esc(names.join(', '))}</b><br>ימי עבודה <b>לפני</b> התאריך יישארו מחושבים לפי הערכים הקודמים.</div>
      <input type="date" id="wcd-date" value="${t}" max="${t}" style="width:100%;font-size:14px"/>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn primary" style="flex:1" id="wcd-ok">💾 שמור</button>
        <button class="btn" style="flex:1" id="wcd-no">ביטול</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const done=v=>{wrap.remove();res(v);};
    document.getElementById('wcd-ok').onclick=()=>{const v=document.getElementById('wcd-date').value;if(!v||v>t){alert('בחר תאריך עד היום');return;}done(v);};
    document.getElementById('wcd-no').onclick=()=>done(null);
  });
}
// מעדכן את המפות "הנוכחיות" לפי הרשומה האחרונה בהיסטוריה (שינוי עם תאריך ישן
// שנכנס לפני שינוי מאוחר יותר לא דורס את מה שבתוקף היום)
function _wcApplyLatest(wid){
  const h=S.costs.workerHist?.[wid];if(!h||!h.length)return;
  const e=h[h.length-1],c=S.costs;
  ['workerRates','workerUnitRates','workerTransport','workerInsurance','workerGiftsTrip'].forEach(k=>{if(!c[k])c[k]={};});
  c.workerRates[wid]=+e.daily||0;c.workerUnitRates[wid]=+e.unit||0;c.workerTransport[wid]=+e.transport||0;c.workerInsurance[wid]=+e.insurance||0;
  if(e.giftsTrip==null)delete c.workerGiftsTrip[wid];else c.workerGiftsTrip[wid]=+e.giftsTrip||0;
}
// רושם בהיסטוריה את מה שהשתנה מאז הרינדור. מחזיר false אם בוטל.
async function _wcRecordChanges(){
  const changed=S.workers.filter(w=>{const a=_wcSnap[w.id],b=_wcCur(w.id);return a&&WC_FIELDS.some(f=>(a[f]??null)!==(b[f]??null));});
  if(!changed.length)return true;
  const d=await askEffectiveDate(changed.map(w=>w.name));
  if(!d){ // ביטול ⇒ חזרה לערכים שהיו
    changed.forEach(w=>{const a=_wcSnap[w.id],c=S.costs;c.workerRates[w.id]=a.daily;(c.workerUnitRates||(c.workerUnitRates={}))[w.id]=a.unit;
      (c.workerTransport||(c.workerTransport={}))[w.id]=a.transport;(c.workerInsurance||(c.workerInsurance={}))[w.id]=a.insurance;
      if(a.giftsTrip==null)delete (c.workerGiftsTrip||{})[w.id];else (c.workerGiftsTrip||(c.workerGiftsTrip={}))[w.id]=a.giftsTrip;});
    renderWorkerRates();return false;
  }
  if(!S.costs.workerHist)S.costs.workerHist={};
  changed.forEach(w=>{
    const old=_wcSnap[w.id],nv=_wcCur(w.id);
    const fields=WC_FIELDS.filter(f=>(old[f]??null)!==(nv[f]??null));
    let h=(S.costs.workerHist[w.id]||[]).slice();
    if(!h.length)h.push({from:'2000-01-01',...old}); // מה שהיה עד עכשיו
    // 🔑 רק השדות שהשתנו, ומהתאריך והלאה: הסעה שהשתנתה מ-01/09 לא מעתיקה לספטמבר
    // שכר יומי שהשתנה רק ב-01/10. הבסיס = מה שהיה בתוקף ביום d לפי ההיסטוריה.
    let base=h[0];for(const x of h){if(x.from<=d)base=x;else break;}
    const ent={...base,from:d};fields.forEach(f=>{ent[f]=nv[f];});
    h=h.filter(x=>x.from!==d).map(x=>{if(x.from>d){const y={...x};fields.forEach(f=>{y[f]=nv[f];});return y;}return x;});
    h=h.concat([ent]).sort((x,y)=>x.from.localeCompare(y.from));
    S.costs.workerHist[w.id]=h;
    _wcApplyLatest(w.id);
  });
  return true;
}
function showWorkerCostHist(wid){
  const w=S.workers.find(x=>x.id===wid);const h=S.costs.workerHist?.[wid]||[];
  document.getElementById('wch-wrap')?.remove();
  const hd=d=>d==='2000-01-01'?'עד השינוי הראשון':String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4);
  const v=x=>x==null?'כללי':'₪'+(+x).toLocaleString();
  const wrap=document.createElement('div');wrap.id='wch-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:640px;width:100%;margin:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:16px;font-weight:800">📅 היסטוריית עלויות — ${esc(w?.name||wid)}</div>
      <button class="btn" style="font-size:12px" onclick="document.getElementById('wch-wrap').remove()">סגור</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>בתוקף מ-</th><th>₪/יום</th><th>₪/יחידה</th><th>🚌 הסעה/יום</th><th>🛡 ביטוח/שנה</th><th>🎁 מתנות+טיול</th><th></th></tr></thead>
    <tbody>${h.slice().reverse().map((x,i)=>`<tr>
      <td style="white-space:nowrap;font-weight:600">${hd(x.from)}${i===0?' <span style="font-size:10px;color:var(--green-txt)">· היום</span>':''}</td>
      <td>${v(x.daily)}</td><td>${x.unit?v(x.unit):'—'}</td><td>${v(x.transport)}</td><td>${v(x.insurance)}</td><td>${v(x.giftsTrip)}</td>
      <td>${x.from!=='2000-01-01'?`<button class="btn" style="font-size:11px;padding:3px 8px;color:var(--red-txt)" onclick="delWorkerCostHist('${escj(wid)}','${x.from}')">🗑</button>`:''}</td></tr>`).join('')}</tbody></table></div>
    <div style="font-size:11px;color:var(--txt3);margin-top:8px">מחיקת שינוי מחזירה את התקופה שלו לערכים שלפניו. כדי לשנות ערך — ערוך בכרטיס העובד ושמור עם התאריך הרצוי.</div>
  </div>`;
  document.body.appendChild(wrap);
}
async function delWorkerCostHist(wid,from){
  if(!await showConfirm('מחיקת שינוי','למחוק את השינוי שבתוקף מ-'+from+'?\nהתקופה שלו תחושב לפי הערכים שלפניו.','מחק','ביטול'))return;
  const h=(S.costs.workerHist?.[wid]||[]).filter(x=>x.from!==from);
  S.costs.workerHist[wid]=h;
  if(h.length)_wcApplyLatest(wid);
  if(h.length<=1)S.costs.workerHist[wid]=[]; // נשאר רק הבסיס ⇒ אין היסטוריה, הערכים חזרו אליו
  saveLS();if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  renderWorkerRates();showWorkerCostHist(wid);try{calcCosts();}catch(e){}
}
async function saveCostSettings(){
  const btn=event?.target;
  if(!await _wcRecordChanges())return;
  S.costs.fixedDaily=parseFloat(document.getElementById('cost-fixed').value)||0;
  S.costs.fixedMonthly=parseFloat(document.getElementById('cost-fixed-monthly').value)||0;
  S.costs.workDaysMonth=parseInt(document.getElementById('cost-workdays-month').value)||22;
  S.costs.fixedAnnual=parseFloat(document.getElementById('cost-fixed-annual').value)||0;
  S.costs.workDaysYear=parseInt(document.getElementById('cost-workdays-year').value)||250;
  const _pctIn=id=>{const el=document.getElementById(id);return el?Math.max(0,Math.min(100,parseFloat(el.value)||0)):0;};
  S.costs.taxPct=_pctIn('cost-tax-pct');
  S.costs.bankPct=_pctIn('cost-bank-pct');
  saveLS();
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  // שני כפתורים קוראים לפונקציה (שמור / 💾 שמור הגדרות) — מחזירים לכל אחד את הכיתוב שלו
  if(btn){const _lbl=btn.dataset.lbl||(btn.dataset.lbl=btn.textContent);
  btn.textContent='✅ נשמר';btn.classList.add('success');
  setTimeout(()=>{btn.textContent=_lbl;},1500);}
  renderWorkerRates();
  renderLoadedHourTable();renderOverheadResult();
  calcCosts();
}

// ─── שעה עמוסה + תקורה — תמחור שלב ג' ───────────────────────
// עובדים שנכנסים לחישובי עלות (לא מנהל, לא מושעים)
function _costWorkers(){return S.workers.filter(w=>w.role!=='manager'&&!w.disabled);}
// פירוט שעה עמוסה לעובד (₪/שעה) — לפי התוכנית: שכר+הסעה+פיצויים+חגים+מתנות+טיול+ביטוח
// ─── 📅 היסטוריית עלויות עובד (04/10/2026) ───────────────────────────────
// כל שינוי בעלויות של עובד (שכר יומי, ליחידה, הסעה, ביטוח, מתנות+טיול) נרשם עם
// "בתוקף מתאריך" ב-`S.costs.workerHist[wid]` = [{from,daily,unit,transport,insurance,giftsTrip}]
// ממוין עולה. הרשומה הראשונה (from 2000-01-01) היא מה שהיה לפני השינוי הראשון.
// הדוחות שואלים "מה היה בתוקף ביום d" ⇒ שינוי היום לא משכתב חודשים שעברו.
// המפות הישנות (workerRates וכו') נשארות = הערכים שבתוקף היום — משם קוראים התמחור,
// הצפי בשרת (calcTaskExpected) וכל חישוב שאינו מתוארך.
const WC_FIELDS=['daily','unit','transport','insurance','giftsTrip'];
function _wcCur(wid){
  const c=S.costs;const g=c.workerGiftsTrip?.[wid];
  return {daily:+(c.workerRates||{})[wid]||0,unit:+(c.workerUnitRates||{})[wid]||0,transport:+(c.workerTransport||{})[wid]||0,
    insurance:+(c.workerInsurance||{})[wid]||0,giftsTrip:(g==null||g==='')?null:(+g||0)};
}
// הערכים שבתוקף ביום d (YYYY-MM-DD). בלי d / בלי היסטוריה ⇒ הנוכחיים.
function wCostAt(wid,d){
  const h=d&&S.costs.workerHist?.[wid];
  if(!h||!h.length)return _wcCur(wid);
  let e=null,last=false;for(let i=0;i<h.length;i++){if(h[i].from<=d){e=h[i];last=i===h.length-1;}else break;}
  // התקופה האחרונה = המפות הנוכחיות (זהות לרשומה האחרונה; אם נערכו בלי שמירה מתוארכת —
  // ההתנהגות הישנה, ולא התעלמות מהשינוי)
  return last?_wcCur(wid):(e||h[0]);
}
function wRate(wid,d){return +wCostAt(wid,d).daily||0;}
function wUnitRate(wid,d){return +wCostAt(wid,d).unit||0;}
// יום (מקומי) של משימה — לתעריף שהיה בתוקף כשבוצעה
function _tDay(t){
  const v=t?.startTime||t?.endTime;if(!v)return '';
  const x=v instanceof Date?v:new Date(v);if(isNaN(x))return '';
  return x.getFullYear()+'-'+pad2(x.getMonth()+1)+'-'+pad2(x.getDate());
}
function loadedHourBreakdown(wid,d){
  const c=S.costs;
  const wc=wCostAt(wid,d);
  const daily=+wc.daily||0;
  if(!daily)return null;
  const wdy=c.workDaysYear||250;
  const nW=_costWorkers().length||1;
  const base=daily/8;
  const transport=(+wc.transport||0)/8;
  const severance=daily*((c.severancePct??8.33)/100)/8;
  const holidays=daily*((c.holidayDays??4)/wdy)/8;
  // 🎁 מתנות+טיול: סכום שנתי לעובד מכרטיס העובד; בלי סכום משלו ⇒ ההגדרה הכללית
  //    (הטיול הכללי מתחלק רק בין העובדים שאין להם סכום משלהם)
  const own=_ownGiftsTrip(wid,d);
  const nGen=own==null?(_costWorkers().filter(w=>_ownGiftsTrip(w.id,d)==null).length||nW):1;
  const gifts=own!=null?own/wdy/8:(c.giftsAnnual||0)/wdy/8;
  const trip=own!=null?0:(c.tripAnnual||0)/nGen/wdy/8;
  const insurance=(+wc.insurance||0)/wdy/8;
  const loaded=base+transport+severance+holidays+gifts+trip+insurance;
  return {base,transport,severance,holidays,gifts,trip,insurance,loaded};
}
function loadedHourlyRate(wid,d){return loadedHourBreakdown(wid,d)?.loaded||0;}
// סכום שנתי למתנות+טיול שהוזן לעובד (null = לא הוזן ⇒ כללי). 0 שהוזן = באמת 0.
function _ownGiftsTrip(wid,d){const v=wCostAt(wid,d).giftsTrip;return v==null||v===''?null:+v||0;}
function setWorkerGiftsTrip(wid,val){
  if(!S.costs.workerGiftsTrip)S.costs.workerGiftsTrip={};
  if(String(val).trim()==='')delete S.costs.workerGiftsTrip[wid];
  else S.costs.workerGiftsTrip[wid]=Math.max(0,parseFloat(val)||0);
}
// תקורה מפעלית לשעה: (קבועות חודשיות + מקדם משתנות משוער) ÷ שעות עבודה חודשיות
function overheadBreakdown(){
  const c=S.costs;
  const fixedMonthly=(c.fixedDaily||0)*(c.workDaysMonth||22)+(c.fixedMonthly||0)+(c.fixedAnnual||0)/12;
  const win=Math.max(1,Math.min(3,parseInt(c.overheadMonthsWindow)||3));
  const months=(c.costMonths||[]).slice().sort((a,b)=>b.month.localeCompare(a.month)).slice(0,win);
  const varAvg=months.length?months.reduce((s,m)=>s+(m.variableTotal||0),0)/months.length:0;
  const buffer=(c.overheadBufferPct??10)/100;
  const varEst=varAvg*(1+buffer);
  // 🏦 מסים + עמלות בנק = אחוז מההכנסות ⇒ ממוצע ההכנסות של **אותם חודשים** של ממוצע המשתנות
  //    (אין חודשים סגורים ⇒ החודשים המלאים האחרונים). הכנסה = משלוחים × (מחיר + מחיר גזירה).
  const tbPct=(+c.taxPct||0)+(+c.bankPct||0);
  let incMonths=months.map(m=>m.month);
  if(!incMonths.length){const d=new Date();for(let i=1;i<=win;i++){const x=new Date(d.getFullYear(),d.getMonth()-i,1);incMonths.push(x.getFullYear()+'-'+pad2(x.getMonth()+1));}}
  const incAvg=tbPct?incMonths.reduce((s,m)=>s+_incomeOfMonth(m),0)/incMonths.length:0;
  const taxBank=incAvg*tbPct/100;
  // 🕐 המכנה = **שעות הנוכחות בפועל** (נטו, בלי מנהלים) — ממוצע של אותם חודשים.
  //    השעות נטענות ברקע (_ensureOhHours); עד שנטענו — הערכה תיאורטית (עובדים × ימים × 8).
  const theo=_costWorkers().length*(c.workDaysMonth||22)*8;
  const actOk=incMonths.every(m=>_ohAttH[m]!=null);
  const actAvg=actOk?incMonths.reduce((s,m)=>s+_ohAttH[m],0)/incMonths.length:0;
  if(!actOk)_ensureOhHours(incMonths);
  const actual=actAvg>0;
  const hours=actual?actAvg:theo;
  const perHour=hours?(fixedMonthly+varEst+taxBank)/hours:0;
  return {fixedMonthly,varAvg,varEst,monthsUsed:months.length,win,hours,perHour,tbPct,incAvg,taxBank,incMonths,actual,theo};
}
// שעות נוכחות נטו בפועל לחודש (YYYY-MM), בלי מנהלים — המכנה של התקורה לשעה. נטען פעם אחת לחודש.
var _ohAttH={}, _ohAttP=null;
// 💱 (08/11/2026) עלות השעה של כל עובד + התקורה **כפי שהלקוח מחשב אותן** ⇒ adminSettings/costs.rateCache,
// ו-calcTaskExpected בשרת משתמש בהן. עד היום השרת חישב בנוסחה ישנה (בלי מתנות/טיול לעובד, בלי מסים
// ועמלות בתקורה, תקורה לפי שעות תיאורטיות) ⇒ שעה זולה ב-~22% והצפי בסריקה גבוה ב-~28% מהדוחות
// (אימאן: ₪15.54 בשרת מול ₪19.99 כאן). נכתב רק כשהתקורה מחושבת משעות הנוכחות בפועל (ob.actual)
// ורק כשמשהו השתנה — אחרת כל פתיחה של המנהל הייתה כותבת. מנהל בלבד (adminSettings).
// ⚖ (08/11/2026) מקדם עלות לשורת "מוקצב מול בפועל" לפי מחלקה: דקת שעון של עובדת × (תעריף שלה+תקורה) ÷
// הממוצע של המוצר (אותו ₪20.44 שבחלון המוצר — ממוצע השלבים של _pricingStepRate+תקורה; ✂ גזירה בנפרד).
// אחראי/מסך תצוגה לא קוראים שכר ⇒ המנהל מפרסם יחסים בלבד ל-appSettings/rateW: w={עובד: (תעריף+תקורה)/R},
// p={מוצר:[תפירה/R, גזירה/R]}, R=ממוצע כללי+תקורה. מקדם = w/p; חסר ⇒ 1 (זמן שעון).
function _rateWCalc(){
  const ctx=_pricingCtx();if(!ctx)return null;
  const R=(ctx.avgAll+ctx.oh)||0;if(!(R>0))return null;
  const r3=v=>Math.round(v*1000)/1000,w={},p={};
  _costWorkers().forEach(x=>{const r=loadedHourlyRate(x.id);if(r>0)w[x.id]=r3((r+ctx.oh)/R);});
  const avg=a=>a.length?a.reduce((s,x)=>s+_pricingStepRate(stepStationKeys(x),stepLevel(x),ctx.avgAll)+ctx.oh,0)/a.length/R:0;
  S.products.forEach(pr=>{const st=(pr.workSteps||[]).filter(s=>stepLevel(s)||stepManualMin(s)>0);if(!st.length)return;
    const sw=r3(avg(st.filter(s=>!stepIsCut(s)))),ct=r3(avg(st.filter(stepIsCut)));if(sw||ct)p[pr.id]=[sw,ct];});
  return Object.keys(w).length?{w,p}:null;
}
function _pubRateW(){
  try{
    if(S.user?.role!=='manager'||!S.fbConnected||!S.costs)return;
    const v=_rateWCalc();if(!v)return;
    const pv=S.rateW||{},eq=(a,b)=>{a=a||{};b=b||{};const ka=Object.keys(a);return ka.length===Object.keys(b).length&&ka.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));};
    if(eq(v.w,pv.w)&&eq(v.p,pv.p))return;
    S.rateW={...v,at:Date.now()};
    // updateDoc ולא merge (merge משאיר מפתחות של עובדים/מוצרים שהוסרו ⇒ השוואה שלא מתייצבת); מסמך חדש ⇒ fbSet
    fbReplaceFields('appSettings','rateW',S.rateW).catch(()=>fbSet('appSettings','rateW',S.rateW)).catch(e=>console.error('_pubRateW:',e));
  }catch(e){console.error('_pubRateW:',e);}
}
// מקדם לעובד במשימה של מוצר p (cut = שלב גזירה)
function _rwOf(wid,p,cut){const d=S.rateW;const a=+d?.w?.[wid],b=+(d?.p?.[p?.id]||[])[cut?1:0];return a>0&&b>0?a/b:1;}
let _rcT=null;
function _pubRateCache(){clearTimeout(_rcT);_rcT=setTimeout(_pubRateCacheNow,3000);}
function _pubRateCacheNow(){
  _pubRateW();
  _crBackfill().catch(()=>{});
  _thumbBackfill().catch(()=>{});
  try{
    if(S.user?.role!=='manager'||!S.fbConnected||!S.costs)return;
    const ob=overheadBreakdown();if(!ob.actual||!(ob.perHour>=0))return;
    const r2=v=>Math.round(v*100)/100,w={};
    _costWorkers().forEach(x=>{const r=loadedHourlyRate(x.id);if(r>0)w[x.id]=r2(r);});
    if(!Object.keys(w).length)return;
    const oh=r2(ob.perHour),prev=S.costs.rateCache||{},pw=prev.w||{};
    const same=prev.oh===oh&&Object.keys(w).length===Object.keys(pw).length&&Object.keys(w).every(k=>pw[k]===w[k]);
    if(same)return;
    S.costs.rateCache={oh,w,at:Date.now()};
    // updateDoc ולא merge: merge משאיר בתוך w עובדים שהוסרו ⇒ ההשוואה למעלה לא הייתה מתייצבת (כתיבה כל 3 שנ')
    fbReplaceFields('adminSettings','costs',{rateCache:S.costs.rateCache}).catch(e=>console.error('_pubRateCache:',e));
  }catch(e){console.error('_pubRateCache:',e);}
}
function _ensureOhHours(months){
  const miss=(months||[]).filter(m=>_ohAttH[m]==null);
  if(!miss.length)return Promise.resolve();
  if(_ohAttP)return _ohAttP;
  if(!db||!S.fbConnected)return Promise.resolve();   // בלי שרת — נשארים בהערכה התיאורטית
  const s=miss.slice().sort(), from=s[0]+'-01', to=s[s.length-1]+'-31';
  _ohAttP=loadAttRange(from,to).then(recs=>{
    const mgr={};(S.workers||[]).forEach(w=>{if(w.role==='manager')mgr[w.id]=1;});
    const h={};miss.forEach(m=>h[m]=0);
    (recs||[]).forEach(r=>{const m=String(r.date||'').slice(0,7);if(m in h&&!mgr[r.workerId])h[m]+=(r.netMs||0)/3600000;});
    Object.assign(_ohAttH,h);
  }).catch(e=>console.error('_ensureOhHours:',e)).finally(()=>{
    _ohAttP=null;
    try{renderOverheadResult();renderLoadedHourTable();}catch(e){}
    _pubRateCache(); // שעות הנוכחות נטענו ⇒ התקורה עכשיו בפועל — לעדכן את השרת
  });
  return _ohAttP;
}
// לקוראים אסינכרוניים: מוודא שהשעות בפועל נטענו לפני חישוב התקורה
function ohReady(){return _ensureOhHours(overheadBreakdown().incMonths);}
// 🧾 הכנסה של תעודה (06/11/2026) = **בדיוק כמו בלשונית תעודות משלוח** (dnFiltered): עבודה
// (dnUnitPrice × total; בלי מחיר תפירה ⇒ 0) + חומר אריזה שנצרב על התעודה (shipPackCost).
// 📅 חודש ההכנסה = **חודש ההתחשבנות**: תעודה שבחשבונית עסקה ⇒ החודש של החשבונית (pfMonth) —
// תעודות 01–04/10 נכנסות להתחשבנות 09, תעודה מ-02/11 ל-10. בלי חשבונית ⇒ לפי תאריך התעודה.
function _pfMonth(d){
  if(d?.month)return d.month;
  const x=String(d?.date||'');if(!x)return '';
  const pm=new Date(+x.slice(0,4),+x.slice(5,7)-2,1);return pm.getFullYear()+'-'+pad2(pm.getMonth()+1);
}
function _incShipRows(){
  const out=[];
  (S.products||[]).forEach(p=>{
    const pr=dnUnitPrice(p);
    prodShipments(p).forEach((s,i)=>{
      const qty=+s.total||0,pack=shipPackCost(s),work=pr.missing?0:pr.unit*qty;
      if(!(qty>0)&&!pack)return;
      const inv=_pfList.length?dnInvOf({p,s,i}):null;
      const date=String(s.date||'').slice(0,10);
      out.push({p,s,date,month:(inv&&_pfMonth(inv))||date.slice(0,7),inv:!!inv,work,pack,noPrice:pr.missing&&qty>0});
    });
  });
  return out;
}
// הכנסות חודש התחשבנות (YYYY-MM) — עבודה + אריזה. משמש את ממוצע ההכנסות של התקורה (מסים+בנק).
function _incomeOfMonth(ym){
  return _incShipRows().reduce((t,r)=>t+(r.month===ym?r.work+r.pack:0),0);
}
function saveLoadedHourSettings(){
  const c=S.costs;
  c.severancePct=parseFloat(document.getElementById('lh-sev')?.value);if(isNaN(c.severancePct))c.severancePct=8.33;
  c.holidayDays=parseInt(document.getElementById('lh-hol')?.value)||0;
  c.giftsAnnual=parseFloat(document.getElementById('lh-gifts')?.value)||0;
  c.tripAnnual=parseFloat(document.getElementById('lh-trip')?.value)||0;
  c.overheadBufferPct=parseFloat(document.getElementById('lh-buffer')?.value);if(isNaN(c.overheadBufferPct))c.overheadBufferPct=10;
  c.overheadMonthsWindow=parseInt(document.getElementById('lh-months-win')?.value)||3;
  saveLS();
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  renderLoadedHourTable();renderOverheadResult();
  showToast('✅ נשמר');
}
function renderLoadedHourTable(){
  const el=document.getElementById('lh-table');if(!el)return;
  const oh=overheadBreakdown();
  const rows=_costWorkers().filter(w=>S.costs.workerRates[w.id]).map(w=>{
    const b=loadedHourBreakdown(w.id);
    const pct=b.base?((b.loaded/b.base-1)*100):0;
    const detail=`רגילה ₪${b.base.toFixed(2)} + הסעה ₪${b.transport.toFixed(2)} + פיצויים ₪${b.severance.toFixed(2)} + חגים ₪${b.holidays.toFixed(2)} + מתנות ₪${b.gifts.toFixed(2)} + טיול ₪${b.trip.toFixed(2)} + ביטוח ₪${b.insurance.toFixed(2)}`;
    return`<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:0.5px solid var(--brd);flex-wrap:wrap" title="${detail}">
      <span style="flex:1;min-width:90px;font-size:13px;font-weight:500">${esc(w.name)}</span>
      <span style="font-size:12px;color:var(--txt3)">רגילה ₪${b.base.toFixed(2)}</span>
      <span style="font-size:13px;font-weight:700;color:var(--blue-txt)">עמוסה ₪${b.loaded.toFixed(2)}</span>
      <span style="font-size:11px;color:var(--amber-txt)">+${pct.toFixed(0)}%</span>
      <span style="font-size:12px;font-weight:600;color:var(--green-txt)">+ תקורה = ₪${(b.loaded+oh.perHour).toFixed(2)}</span>
    </div>`;
  }).join('');
  el.innerHTML=rows||'<div style="font-size:12px;color:var(--txt3);text-align:center;padding:8px">הזן שכר יומי לעובדים בכרטיס למעלה כדי לראות חישוב</div>';
}
// חודשים שנאספו חלקית ולכן לא נכתבו — מוצגים כאזהרה. מוגדר כאן ולא ליד
// autoFillCostMonth כדי שלא ייכנס ל-TDZ אם renderCostMonths תרוץ לפניו.
var _partialCostMonths=[];
// מסמן חודש שנאסף חלקית — הכריע ידנית במקום שהמערכת תכתוב סכום שגוי
function pickCostMonth(mo){
  const el=document.getElementById('cm-month');
  if(el){el.value=mo;el.scrollIntoView({behavior:'smooth',block:'center'});}
}
function renderCostMonths(){
  const el=document.getElementById('cm-list');if(!el)return;
  ensureAutoCostMonths();   // מרענן את רשימת הממתינים — לא כותב כלום
  const warn=(_partialCostMonths||[]).map(p=>`
    <div style="background:var(--bg2);border:1px solid ${p.low?'var(--red-txt)':'var(--brd)'};border-radius:var(--r);padding:8px 10px;margin-bottom:6px;font-size:11px;line-height:1.8">
      <b style="font-size:12px">⏳ ${esc(p.month)} — ממתין לסגירה</b>
      <br>📄 הוצאות משתנות: <b>₪${Math.round(p.vars).toLocaleString()}</b>${p.shifted>0?` <span class="badge gray" style="font-size:10px">כולל ₪${Math.round(p.shifted).toLocaleString()} שנזקפו מחודש אחר</span>`:''}
      <br>💸 הוצאות יומיות: <b>₪${Math.round(p.wexp).toLocaleString()}</b>
      <br>סה"כ נרשם: <b style="color:var(--blue-txt);font-size:12px">₪${Math.round(p.total).toLocaleString()}</b>
      ${p.low?`<br><span style="color:var(--red-txt)">🔴 נמוך מ-${Math.round(PARTIAL_MONTH_RATIO*100)}% מממוצע החודשים הסגורים (₪${Math.round(p.avg).toLocaleString()}) — בדוק שכל חשבוניות סוף החודש הוזנו.</span>`:''}
      <br><button class="btn success" style="font-size:11px;padding:4px 8px;margin-top:4px" onclick="approveCostMonth('${escj(p.month)}')">✅ אשר וסגור את ${esc(p.month)}</button>
      <button class="btn" style="font-size:11px;padding:4px 8px;margin-top:4px" onclick="pickCostMonth('${escj(p.month)}')">✏️ להזנה ידנית</button>
    </div>`).join('');
  const months=(S.costs.costMonths||[]).slice().sort((a,b)=>b.month.localeCompare(a.month));
  if(!months.length){el.innerHTML=warn+'<div style="font-size:11px;color:var(--txt3);text-align:center;padding:8px">אין חודשים מוזנים — התקורה תחושב מהקבועות בלבד</div>';return;}
  el.innerHTML=warn+months.map(m=>`
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--brd);font-size:12px">
      <span style="width:70px;color:var(--txt2)">${esc(m.month)}</span>
      <span style="font-weight:600;color:var(--blue-txt)">₪${Number(m.variableTotal||0).toLocaleString()}</span>
      <span style="flex:1;font-size:11px;color:var(--txt3)">${m.source==='auto'?'🤖 אוטומטי':'📝 ידני'}</span>
      <button onclick="delCostMonth('${escj(m.month)}')" style="background:none;border:none;color:var(--red-txt);cursor:pointer;font-size:14px">×</button>
    </div>`).join('');
}
function _upsertCostMonth(month,amount,source){
  if(!S.costs.costMonths)S.costs.costMonths=[];
  const ex=S.costs.costMonths.find(m=>m.month===month);
  if(ex){ex.variableTotal=amount;ex.source=source;}
  else S.costs.costMonths.push({month,variableTotal:amount,source});
  saveLS();
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  renderCostMonths();renderOverheadResult();renderLoadedHourTable();
}
function addCostMonth(){
  const month=document.getElementById('cm-month')?.value;
  const amount=parseFloat(document.getElementById('cm-amount')?.value)||0;
  if(!month){alert('בחר חודש');return;}
  if(!amount){alert('הזן סכום');return;}
  _upsertCostMonth(month,amount,'manual');
  document.getElementById('cm-amount').value='';
}
// ─── איסוף הוצאות החודש — שני מקורות ───
// יש שני מאגרי הוצאות נפרדים, ושניהם אמיתיים:
//   `S.costs.variableExpenses` — מה שהמנהל מזין ידנית בדף העלויות
//   `S.workerExpenses`         — לשונית 💸 שהעובדים מגישים (עם קבלה)
// עד 02/09 נאסף רק הראשון ⇒ הכפתור "חשב מההוצאות הרשומות" החזיר סכום חלקי בשקט.
// 🛑 המשתנות נספרות לפי **חודש השיוך** (`vexpMonth`) ולא לפי תאריך התשלום —
// חשבונית הובלה של אוגוסט שמשולמת ב-03/09 שייכת לאוגוסט. הוצאות הלשונית הן
// יומיות מעצם טבען ולכן נספרות לפי התאריך שלהן.
function recordedExpenseSum(month){
  const ve=(S.costs.variableExpenses||[]).filter(e=>vexpMonth(e)===month);
  const vars=ve.reduce((s,e)=>s+Number(e.amount||0),0);
  const wexp=(S.workerExpenses||[]).filter(e=>(e.date||'').slice(0,7)===month)
    .reduce((s,e)=>s+Number(e.amount||0),0);
  const shifted=ve.filter(e=>e.month&&e.month!==String(e.date||'').slice(0,7))
    .reduce((s,e)=>s+Number(e.amount||0),0);
  return {vars,wexp,shifted,total:vars+wexp};
}
// ממוצע החודשים שכבר אושרו — הבסיס להשוואה מול סכום שנאסף אוטומטית
function knownMonthsAvg(exclude){
  const ms=(S.costs.costMonths||[]).filter(m=>m.month!==exclude&&Number(m.variableTotal)>0);
  return ms.length?ms.reduce((s,m)=>s+Number(m.variableTotal||0),0)/ms.length:0;
}
// 🛑 ההוצאות הרשומות במערכת הן בדרך כלל **חלק** מההוצאות האמיתיות של החודש
// (שכר דירה, חשבונות, רו"ח ומיסים לא עוברים בלשונית) ⇒ סכום נמוך משמעותית
// מהחודשים הידועים הוא סימן לאיסוף חלקי, לא לחודש זול.
const PARTIAL_MONTH_RATIO=0.6;
function autoFillCostMonth(){
  const month=document.getElementById('cm-month')?.value;
  if(!month){alert('בחר חודש');return;}
  const r=recordedExpenseSum(month);
  if(!r.total){alert('לא נמצאו הוצאות רשומות בחודש '+month);return;}
  const ex=(S.costs.costMonths||[]).find(m=>m.month===month);
  const avg=knownMonthsAvg(month);
  let msg='הוצאות שנרשמו במערכת בחודש '+month+':\n'
    +'  📄 הוצאות משתנות: ₪'+r.vars.toLocaleString()
    +(r.shifted>0?' (מהן ₪'+Math.round(r.shifted).toLocaleString()+' חשבוניות שנזקפו לחודש הזה)':'')+'\n'
    +'  💸 הוצאות יומיות: ₪'+r.wexp.toLocaleString()+'\n'
    +'  ────────────────\n'
    +'  סה"כ: ₪'+r.total.toLocaleString()+'\n\n';
  if(ex)msg+='⚠️ החודש כבר מוזן: ₪'+Number(ex.variableTotal||0).toLocaleString()
    +' ('+(ex.source==='auto'?'אוטומטי':'ידני')+') — הערך יידרס.\n\n';
  if(avg>0&&r.total<avg*PARTIAL_MONTH_RATIO)
    msg+='🔴 הסכום נמוך מ-'+Math.round(PARTIAL_MONTH_RATIO*100)+'% מממוצע החודשים המוזנים (₪'
      +Math.round(avg).toLocaleString()+').\nסביר שחסרות הוצאות שלא נרשמות במערכת (שכר דירה, חשבונות, רו"ח).\n'
      +'שמירה כזו תוריד את התקורה ותנפח את הרווח בכל הדוחות.\n\n';
  msg+='לשמור כסה"כ החודש?';
  if(!confirm(msg))return;
  _upsertCostMonth(month,r.total,'auto');
}
function delCostMonth(month){
  S.costs.costMonths=(S.costs.costMonths||[]).filter(m=>m.month!==month);
  saveLS();
  if(S.fbConnected)fbSet('adminSettings','costs',S.costs);
  renderCostMonths();renderOverheadResult();renderLoadedHourTable();
}
function renderOverheadResult(){
  const el=document.getElementById('overhead-result');if(!el)return;
  const oh=overheadBreakdown();
  el.innerHTML=`<div style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;font-size:12px;line-height:1.9">
    <div>🏢 קבועות לחודש: <b>₪${oh.fixedMonthly.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>
    <div>📊 ממוצע משתנות (${oh.monthsUsed||0}/${oh.win} חודשים): <b>₪${oh.varAvg.toLocaleString(undefined,{maximumFractionDigits:0})}</b> ← עם מרווח ${S.costs.overheadBufferPct??10}%: <b>₪${oh.varEst.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>
    ${oh.tbPct?`<div>🏦 מסים + עמלות בנק (${oh.tbPct}% × ממוצע הכנסות ₪${oh.incAvg.toLocaleString(undefined,{maximumFractionDigits:0})} ב-${oh.incMonths.join(', ')}): <b>₪${oh.taxBank.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>`:''}
    <div>🕐 ${oh.actual?`שעות עבודה בפועל לחודש (ממוצע נוכחות נטו ב-${oh.incMonths.join(', ')})`:`שעות עבודה חודשיות — הערכה (${_costWorkers().length} עובדים × ${S.costs.workDaysMonth||22} ימים × 8) · שעות בפועל נטענות…`}: <b>${Math.round(oh.hours).toLocaleString()}</b></div>
    <div style="font-size:14px;font-weight:700;color:var(--green-txt);border-top:0.5px solid var(--brd);margin-top:4px;padding-top:6px">💰 תוספת תקורה לשעת עבודה: ₪${oh.perHour.toFixed(2)}</div>
  </div>`;
  renderReconciliation();
}
// ─── תמחור שלב ה': התחשבנות חודשית + מעבר לאיסוף אוטומטי ───
// לכל חודש מוזן: מה המקדם היה צופה (ממוצע עד 3 חודשים שלפניו + מרווח) מול מה שיצא בפועל.
function renderReconciliation(){
  const el=document.getElementById('recon-list');if(!el)return;
  const months=(S.costs.costMonths||[]).slice().sort((a,b)=>a.month.localeCompare(b.month));
  const buffer=(S.costs.overheadBufferPct??10)/100;
  const rows=[];
  for(let i=0;i<months.length;i++){
    const prev=months.slice(Math.max(0,i-3),i);
    if(!prev.length)continue;
    const est=prev.reduce((s,m)=>s+(m.variableTotal||0),0)/prev.length*(1+buffer);
    const act=months[i].variableTotal||0;
    rows.push({month:months[i].month,est,act,gap:act-est,src:months[i].source});
  }
  const autoCnt=months.slice(-3).filter(m=>m.source==='auto').length;
  const status=`<div style="font-size:11px;margin-top:8px;color:var(--txt3)">מצב איסוף: ${autoCnt>=3?'<b style="color:var(--green-txt)">🤖 אוטומטי מלא</b> (3 חודשים אחרונים נאספו אוטומטית)':`📝 ${autoCnt}/3 חודשים אחרונים אוטומטיים`} · חודש שהסתיים מתווסף אוטומטית מההוצאות המשתנות הרשומות (תיקון ידני תמיד אפשרי)</div>`;
  if(!rows.length){el.innerHTML='<div style="font-size:11px;color:var(--txt3);text-align:center;padding:8px">צריך לפחות 2 חודשים מוזנים כדי להשוות משוער מול בפועל</div>'+status;return;}
  rows.reverse();
  el.innerHTML=rows.slice(0,6).map(r=>{
    const over=r.gap>0;
    const pct=r.est>0?Math.abs(r.gap)/r.est*100:0;
    return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--brd);font-size:12px;flex-wrap:wrap">
      <span style="width:70px;color:var(--txt2)">${esc(r.month)}</span>
      <span style="color:var(--txt3)">משוער ₪${r.est.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
      <span style="font-weight:600">בפועל ₪${r.act.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
      <span class="badge ${over?'red':'green'}">${over?'▲ חריגה':'▼ חיסכון'} ₪${Math.abs(r.gap).toLocaleString(undefined,{maximumFractionDigits:0})} (${pct.toFixed(0)}%)</span>
    </div>`;}).join('')+status;
}
// מזהה חודשים שהסתיימו וחסרים ב-costMonths, ומכין להם סכום מההוצאות הרשומות
// (משתנות לפי חודש שיוך + לשונית ההוצאות היומיות).
// 🛑 **אף פעם לא כותב לבד.** חשבוניות סוף חודש מגיעות באיחור, ולכן כל סכום
// שנאסף לפני שהמנהל אישר הוא חלקי בהגדרה. כתיבה שקטה כאן מורידה את התקורה
// ומנפחת את הרווח בכל הדוחות בלי שאיש רואה שקרה משהו.
function ensureAutoCostMonths(){
  if(S.user?.role!=='manager')return;
  _partialCostMonths=[];
  const now=new Date();
  for(let k=1;k<=3;k++){
    const d=new Date(now.getFullYear(),now.getMonth()-k,1);
    const mo=d.getFullYear()+'-'+pad2(d.getMonth()+1);
    if((S.costs.costMonths||[]).find(m=>m.month===mo))continue;
    const r=recordedExpenseSum(mo);
    if(!(r.total>0))continue;
    const avg=knownMonthsAvg(mo);
    _partialCostMonths.push({month:mo,...r,avg,low:avg>0&&r.total<avg*PARTIAL_MONTH_RATIO});
  }
}
// אישור המנהל — רק כאן החודש באמת נסגר ונכנס לתקורה
function approveCostMonth(mo){
  const p=(_partialCostMonths||[]).find(x=>x.month===mo);
  if(!p){alert('החודש כבר נסגר או שאין לו הוצאות רשומות');return;}
  let msg='לסגור את '+mo+' בסך ₪'+Math.round(p.total).toLocaleString()+'?\n\n'
    +'  📄 הוצאות משתנות: ₪'+Math.round(p.vars).toLocaleString()
    +(p.shifted>0?' (מהן ₪'+Math.round(p.shifted).toLocaleString()+' חשבוניות שנזקפו לחודש הזה)':'')+'\n'
    +'  💸 הוצאות יומיות: ₪'+Math.round(p.wexp).toLocaleString()+'\n\n';
  if(p.low)msg+='🔴 הסכום נמוך מ-'+Math.round(PARTIAL_MONTH_RATIO*100)+'% מממוצע החודשים הסגורים (₪'
    +Math.round(p.avg).toLocaleString()+').\nבדוק שכל חשבוניות סוף החודש כבר הוזנו.\n\n';
  msg+='הסכום ייכנס לחישוב התקורה ולכל הדוחות.';
  if(!confirm(msg))return;
  _upsertCostMonth(mo,p.total,'auto');
  _partialCostMonths=_partialCostMonths.filter(x=>x.month!==mo);
  renderCostMonths();
}

function showCostTab(tab){
  S.costTab=tab;
  ['prod','cust','day','exp','worker','payroll'].forEach(t=>{
    const b=document.getElementById('ctab-'+t);
    if(!b)return;
    if(t==='payroll'){b.style.background=t===tab?'var(--green)':'';b.style.color=t===tab?'#fff':'';}
    b.className=t===tab?'btn primary':'btn';
  });
  renderCostTab();
}

// נוכחות של טווח העלויות הנוכחי, נטענת ב-calcCosts ונצרכת ב-renderCostTab הסינכרונית.
// var ולא let: renderCostTab עשויה לרוץ מ-showCostTab לפני שהשורה הזאת הוערכה ⇒ TDZ.
// null = טרם חושב; הצרכנים נופלים חזרה ל-S.attHistory כדי לא לקרוס.
var _costAtt=null;
async function calcCosts(){
  const from=document.getElementById('cost-from')?.value;
  const to=document.getElementById('cost-to')?.value;
  if(!from||!to)return;

  // סינון משימות בטווח — שליפה לפי דרישה (טווח יכול לחרוג מחלון החי)
  const hist=await loadHistRange(from,to);
  const tasks=hist.filter(t=>{
    const d=t.startTime instanceof Date?t.startTime:new Date(t.startTime);
    const ds=d.toISOString().slice(0,10);
    return ds>=from&&ds<=to&&t.duration>0;
  });

  if(!tasks.length){
    document.getElementById('cost-total').textContent='—';
    document.getElementById('cost-wages').textContent='—';
    document.getElementById('cost-overhead').textContent='—';
    document.getElementById('cost-avg').textContent='—';
    const _fEl=document.getElementById('cost-full');if(_fEl)_fEl.innerHTML='';
    document.getElementById('cost-result-content').innerHTML=
      '<div style="text-align:center;padding:2rem;color:var(--txt3)">אין משימות בטווח הנבחר</div>';
    return;
  }

  // סה"כ זמן משימות לפי יום
  const byDay={};
  tasks.forEach(t=>{
    const d=(t.startTime instanceof Date?t.startTime:new Date(t.startTime)).toISOString().slice(0,10);
    if(!byDay[d])byDay[d]={totalSec:0};
    byDay[d].totalSec+=(t.duration||0);
  });

  // הוצאות משתנות לפי יום
  const varByDay={};
  (S.costs.variableExpenses||[]).forEach(e=>{
    if(e.date>=from&&e.date<=to){
      varByDay[e.date]=(varByDay[e.date]||0)+Number(e.amount);
    }
  });
  // הוצאות שהוגשו ע"י עובדים
  (S.workerExpenses||[]).forEach(e=>{
    if(e.date>=from&&e.date<=to){
      varByDay[e.date]=(varByDay[e.date]||0)+Number(e.amount||0);
    }
  });

  // הוצאות קבועות אחידות ליום
  // ⚠️ מספר ימי העבודה משתנה מחודש לחודש (שישי חופש, חגים) — לכן החודשיות + 1/12 מהשנתיות
  //    מתחלקות על ימי העבודה **של אותו חודש**, ולא על "ימי עבודה בחודש" הקבוע מההגדרות:
  //    חודש שכולו בטווח וכבר נגמר ⇒ הימים שהיו בהם משימות בפועל (נזקף בדיוק הסכום החודשי).
  //    חודש חלקי / נוכחי ⇒ ימי הלוח בלי שישי (הערכה — עוד לא ידוע כמה ימים יעבדו בו).
  const _mFix=(S.costs.fixedMonthly||0)+(S.costs.fixedAnnual||0)/12;
  const _today=todayStr(), _daysByM={}, _mDen={};
  Object.keys(byDay).forEach(d=>{const m=d.slice(0,7);_daysByM[m]=(_daysByM[m]||0)+1;});
  Object.keys(_daysByM).forEach(m=>{
    const [y,mo]=m.split('-').map(Number), last=new Date(y,mo,0).getDate();
    const mEnd=m+'-'+pad2(last);
    let cal=0;for(let i=1;i<=last;i++)if(new Date(y,mo-1,i).getDay()!==5)cal++;
    const full=from<=m+'-01'&&to>=mEnd&&mEnd<_today;
    _mDen[m]={den:full?_daysByM[m]:cal,days:_daysByM[m],full};
  });
  const dayFixedOf=d=>(S.costs.fixedDaily||0)+(_mFix&&_mDen[d.slice(0,7)]?_mFix/_mDen[d.slice(0,7)].den:0);

  // 🧾 פירוט ההוצאות ללשונית "פירוט הוצאות" — אותם כללים בדיוק כמו totalOverhead:
  // נזקף רק יום שיש בו משימות (ההוצאה מתחלקת על משימות היום); יום בלי משימות — מוצג בנפרד.
  const _expItems=[];
  (S.costs.variableExpenses||[]).forEach(e=>{
    if(e.date>=from&&e.date<=to)_expItems.push({date:e.date,desc:e.desc||'',amount:Number(e.amount)||0,src:'var',on:!!byDay[e.date]});
  });
  (S.workerExpenses||[]).forEach(e=>{
    if(e.date>=from&&e.date<=to)_expItems.push({date:e.date,desc:e.desc||'',who:e.workerName||'',amount:Number(e.amount||0),src:'wrk',on:!!byDay[e.date]});
  });
  _expItems.sort((a,b)=>a.date.localeCompare(b.date));
  S._costExp={fixDaily:S.costs.fixedDaily||0,mFix:_mFix,
    months:Object.keys(_mDen).sort().map(m=>({m,..._mDen[m],tot:_mDen[m].days*dayFixedOf(m+'-01')})),items:_expItems};

  // ─── שעות נוכחות לכל עובד לפי יום ───
  // 🛑 טווח העלויות נבחר ע"י המשתמש ויכול לחרוג מחלון ה-45 יום ⇒ שליפה לפי דרישה.
  // נשמר ל-_costAtt כי renderCostTab סינכרונית וצורכת את אותם נתונים.
  _costAtt=await loadAttRange(from,to);
  const attByWorkerDay={}; // key: workerId+'_'+date → netMs
  _costAtt.forEach(rec=>{
    const d=rec.date;
    if(d<from||d>to)return;
    const k=rec.workerId+'_'+d;
    attByWorkerDay[k]=(attByWorkerDay[k]||0)+(rec.netMs||0);
  });

  // ─── עובדים ללא משימות (עוזרים / מנהלים / אחראים) ───
  const taskWorkersByDay={};
  tasks.forEach(t=>{
    const d=(t.startTime instanceof Date?t.startTime:new Date(t.startTime)).toISOString().slice(0,10);
    if(!taskWorkersByDay[d])taskWorkersByDay[d]=new Set();
    taskWorkersByDay[d].add(t.workerId);
  });

  // שעות משימות לכל עובד לפי יום (לחלוקה פרופורציונלית)
  const taskSecByWorkerDay={};
  tasks.forEach(t=>{
    const d=(t.startTime instanceof Date?t.startTime:new Date(t.startTime)).toISOString().slice(0,10);
    const k=t.workerId+'_'+d;
    taskSecByWorkerDay[k]=(taskSecByWorkerDay[k]||0)+(t.duration||0);
  });

  // ─── מחלקת המשימה לצורך הקצאת פיקוח ─────────────────────────────
  // ⚠️ במכוון **לא** t.dept: השדה שנשמר על המשימה נושא 20 ערכים חופשיים מלפני
  // הסטנדרטיזציה (`قسم الخياطة`, `חיתוך`, `תפירה`...) ורובם אינם ב-S.depts.
  //
  // הקובע הוא **התחנה שבה בוצעה העבודה**, ולא המחלקה שאליה העובד משויך:
  // עובדת הרשומה ב-`قسم الخياطة 1` שעבדה ב-`حبكي 5` ביצעה עבודה של `قسم الخياطة 2`.
  // נמדד 14/08: 33% מהמשימות עם תחנה שייכות למחלקה אחרת משיוך העובד, ול-
  // `قسم الخياطة 2` יש 150 משימות לפי תחנה מול **0** עובדים משויכים.
  // נפילה למחלקת העובד רק כשאין תחנה — היסטוריה בלבד: אכיפת התחנות נדלקה 07/08
  // והכיסוי מאז 09/08 הוא 100% בכל יום (יוני 0% · יולי 18% · אוגוסט 91%).
  const _wDept={};(S.workers||[]).forEach(w=>{_wDept[w.id]=w.dept||'';});
  const _stDept={};Object.keys(S.deptStations||{}).forEach(d=>
    (S.deptStations[d]||[]).forEach(s=>{_stDept[s]=d;}));
  const _taskDept=t=>_stDept[t.station]||_wDept[t.workerId]||'';
  const _ovDepts=w=>((S.costs.oversightDepts||{})[w]||[]).filter(Boolean);
  const _ovCap=w=>Math.max(0,Math.min(100,+((S.costs.oversightPct||{})[w])||0))/100;
  // עובד בתשלום-ליחידה אינו מקור פיקוח: שכרו אינו נגזר משעות, ואין ממה להפחית.
  const _isOv=w=>_ovCap(w)>0&&_ovDepts(w).length>0&&!((S.costs.workerUnitRates||{})[w]>0);

  // ─── 💎 עלות מלאה — אותן שעות שהשכר הגולמי מכסה, בתעריף של שאר הדוחות ───
  // שעה עמוסה (פיצויים/חגים/מתנות/טיול/הסעה/ביטוח) + תקורה לשעה — כמו ברווח האמיתי ובתמחור.
  // ⚠️ התקורה **מחליפה** את ההוצאות הרשומות בטווח ולא מתווספת להן: היא כבר כוללת את
  //    הקבועות ואת ממוצע המשתנות החודשי ⇒ חיבור שניהם היה סופר את אותן הוצאות פעמיים.
  // ⚠️ תקורה רק על שעות של לא-מנהל: המכנה שלה (_costWorkers) אינו סופר מנהלים.
  await ohReady();   // התקורה מחולקת בשעות בפועל — לוודא שנטענו
  const _oh=overheadBreakdown().perHour;
  const _mgr={};(S.workers||[]).forEach(w=>{if(w.role==='manager')_mgr[w.id]=1;});
  const _ohOf=wid=>_mgr[wid]?0:_oh;
  let fullLoaded=0, fullOh=0;
  // 🧾 רכיבי השעה העמוסה (מעבר לשכר הרגיל) — על אותן שעות שנכנסות ל-fullLoaded, לפירוט בלבד
  const _ld={transport:0,severance:0,holidays:0,gifts:0,trip:0,insurance:0};
  const _addLd=(wid,h,d)=>{const b=loadedHourBreakdown(wid,d);if(!b||!(h>0))return;for(const k in _ld)_ld[k]+=h*b[k];};

  // ─── ⇄ עלות חלוקת עבודה — לפי **מספר הסריקות בפועל**, לא לפי אחוז ──────────
  // החלטת המשתמש 18/09/2026: הכמות נקבעת ממספר הסריקות שהעובד ביצע עבור אחרים
  // כפול `scanMinPerTask` — **לא** תקרת אחוז שרירותית. הגבול היחיד הוא שעות
  // הנוכחות שלו באותו יום; אי אפשר להעביר יותר ממה שהשתכר.
  // 🔑 **העלות נזקפת למוצר, לא לעובד** — היא אינה נכנסת ל-wage של אף משימה ואינה
  //    מופיעה בלשונית "לפי עובד". רק במוצר, בלקוח וביום.
  // 🔑 מפתח החלוקה = **מספר הסריקות פר מוצר**, כי מעשה החלוקה עולה אותו דבר בין
  //    אם המשימה שנסרקה ארוכה או קצרה. זו הסיבה שלא משתמשים ב-taskRatio.
  // ⚠️ דורש `scannedBy` על המשימה ⇒ פועל רק מ-12/09/2026. לתאריכים קודמים
  //    אין נתוני סריקה והמנגנון הישן (oversightPct) ממשיך לטפל ביום כרגיל.
  // 🔑 **עובד בלי משימות משלו באותו יום** — הסריקות עדיין נזקפות למוצרים שנסרקו;
  //    ההפרש בלבד הולך ל-`nonTaskWageByDay` ומתפזר על הכל. בלי הפיצול הזה כל יומו
  //    היה נמרח על כל המוצרים לפי משך, ודווקא המוצרים שהוא חילק בהם לא היו מסומנים.
  //    🛑 שתי הדרכים לא יכולות לרוץ על אותן שעות — משם הגריעה ב-`_scanHrs`.
  const scanFrac={}, _scanHrs={};               // workerId_date → החלק / השעות שהועברו
  const scanCostByProd={}, scanCostByDay={}, scanNByProd={};
  let totalScanCost=0;
  if(scanMinPer()>0){
    const byWD={};                              // workerId_date → המשימות שהוא סרק לאחרים
    tasks.forEach(t=>{
      const by=t.scannedBy;
      if(!by||by===t.workerId)return;
      const d=(t.startTime instanceof Date?t.startTime:new Date(t.startTime)).toISOString().slice(0,10);
      if(d<from||d>to)return;
      (byWD[by+'_'+d]=byWD[by+'_'+d]||[]).push(t);
    });
    Object.keys(byWD).forEach(k=>{
      const _i=k.lastIndexOf('_'), wid=k.slice(0,_i), d=k.slice(_i+1);
      const dailyRate=wRate(wid,d);if(!dailyRate)return;
      if(wUnitRate(wid,d)>0)return;   // תשלום ליחידה — אין שעות להפחית
      const attH=(attByWorkerDay[k]||0)/3600000;if(attH<=0)return;
      const list=byWD[k];
      const hrs=Math.min(list.length*scanMinPer()/60,attH);
      if(hrs<=0)return;
      _scanHrs[k]=hrs;
      // יש לו משימות משלו ⇒ הגריעה דרך ovCut. אין ⇒ הגריעה מ-nonTaskWageByDay.
      if(taskSecByWorkerDay[k]>0)scanFrac[k]=hrs/attH;
      const wage=(dailyRate/8)*hrs;
      totalScanCost+=wage;
      scanCostByDay[d]=(scanCostByDay[d]||0)+wage;
      list.forEach(t=>{
        const pk=(t.cust||'—')+'_'+(t.prod||'—');
        scanCostByProd[pk]=(scanCostByProd[pk]||0)+wage/list.length;
        scanNByProd[pk]=(scanNByProd[pk]||0)+1;
      });
      fullLoaded+=hrs*loadedHourlyRate(wid,d);fullOh+=hrs*_ohOf(wid);_addLd(wid,hrs,d);
    });
  }


  // שכר עוזרים/מנהלים/אחראים ללא משימות — יתחלק על המוצרים
  const nonTaskWageByDay={};
  _costAtt.forEach(rec=>{
    const d=rec.date;
    if(d<from||d>to)return;
    if(_isOv(rec.workerId))return;   // מסומן — עובר במסלול הפיקוח למטה, לא כאן
    if(taskWorkersByDay[d]?.has(rec.workerId))return;
    const dailyRate=wRate(rec.workerId,d);
    if(!dailyRate)return;
    // ⇄ שעות שכבר נזקפו למוצרים שנסרקו לא נמרחות שוב על כל המפעל
    const hoursWorked=Math.max(0,(rec.netMs||0)/3600000-(_scanHrs[rec.workerId+'_'+d]||0));
    const wage=(dailyRate/8)*hoursWorked;
    nonTaskWageByDay[d]=(nonTaskWageByDay[d]||0)+wage;
    // 💎 רק ביום עם משימות — ביום בלי משימות גם הגולמי לא מתחלק לשום מקום
    if(byDay[d]){fullLoaded+=hoursWorked*loadedHourlyRate(rec.workerId,d);fullOh+=hoursWorked*_ohOf(rec.workerId);_addLd(rec.workerId,hoursWorked,d);}
  });

  // ─── 🎯 הקצאת זמן פיקוח ──────────────────────────────────────────
  // אחראי מסומן חולק חלק משכר יומו על משימות המחלקות שהוא אחראי עליהן.
  // המקור = הזמן שאינו מכוסה במשימות שלו באותו יום, חסום בתקרת האחוז הידנית.
  // ⚠️ **העברה בלבד** — סך העלות אינו משתנה: מה שיורד ממשימותיו עולה אצל המקבלים.
  // ⚠️ המקבלים מקבלים **עלות בלבד** — הצפי/הזמן שלהם לא נוגעים, אחרת היינו
  //    הופכים אותם לחריגים ורק מזיזים את הבעיה.
  // ⚠️ אם אין לאן לחלק (אף משימה מתאימה באותו יום) — לא מפחיתים ממנו כלום,
  //    אחרת השכר היה נעלם.
  // ⇄ יום שכבר טופל במסלול הסריקות לא עובר גם במסלול האחוז הישן —
  //    אחרת אותו עובד היה מעביר פעמיים באותו יום.
  const ovFrac={};                              // workerId_date → החלק שהועבר
  const ovByIdx=new Array(tasks.length).fill(0);
  Object.keys(attByWorkerDay).forEach(k=>{
    const _i=k.lastIndexOf('_');
    const wid=k.slice(0,_i), d=k.slice(_i+1);
    if(_scanHrs[k]>0)return;                    // ⇄ מטופל במסלול הסריקות
    if(!_isOv(wid))return;
    const dailyRate=wRate(wid,d);if(!dailyRate)return;
    const attSec=(attByWorkerDay[k]||0)/1000;if(attSec<=0)return;
    const mySec=taskSecByWorkerDay[k]||0;
    // בלי משימות כלל ⇒ כל היום פיקוח (אחרת שאר שכרו לא ייספר בשום מקום)
    const frac=mySec>0?Math.min(Math.max(0,1-mySec/attSec),_ovCap(wid)):1;
    if(frac<=0)return;
    const depts=_ovDepts(wid);
    const elig=[];let tot=0;
    tasks.forEach((t,ix)=>{
      if(t.workerId===wid)return;               // לא מחזירים לו את ההקצאה של עצמו
      const td=(t.startTime instanceof Date?t.startTime:new Date(t.startTime)).toISOString().slice(0,10);
      if(td!==d)return;
      if(!depts.includes(_taskDept(t)))return;
      elig.push(ix);tot+=(t.duration||0);
    });
    if(!elig.length||tot<=0)return;
    ovFrac[k]=frac;
    const wage=(dailyRate/8)*(attSec/3600)*frac;
    elig.forEach(ix=>{ovByIdx[ix]+=wage*((tasks[ix].duration||0)/tot);});
    const _ovH=(attSec/3600)*frac;
    fullLoaded+=_ovH*loadedHourlyRate(wid,d);fullOh+=_ovH*_ohOf(wid);_addLd(wid,_ovH,d);
  });

  // חישוב עלות לכל משימה
  let totalWages=0, totalOverhead=0, totalNonTaskWage=0;
  // מוצרים שנעשה בהם שימוש בברקוד "כל הכמות" — לא לספור גם את הברקודים הפרטניים
  const _totalBcProds=new Set();
  tasks.forEach(t=>{if(isTotalBc(t.bc))_totalBcProds.add(t.cust+'_'+t.prod);});
  const _unitSeen=new Set();
  const _prodCounted=new Set();
  const enriched=tasks.map((t,_tix)=>{
    const d=(t.startTime instanceof Date?t.startTime:new Date(t.startTime)).toISOString().slice(0,10);
    const dayTotalSec=byDay[d]?.totalSec||1;
    const taskRatio=(t.duration||0)/dayTotalSec;

    // שכר עובד: לפי יחידות (אם יש תעריף ליחידה וכמות>0) או לפי זמן
    const dailyRate=wRate(t.workerId,d);
    const unitRate=wUnitRate(t.workerId,d);
    const attMs=attByWorkerDay[t.workerId+'_'+d]||0;
    const attHours=attMs/3600000;
    const workerTotalTaskSec=taskSecByWorkerDay[t.workerId+'_'+d]||1;
    const taskShare=(t.duration||0)/workerTotalTaskSec;
    const byUnit=unitRate>0&&(t.qty||0)>0;
    // חלק הפיקוח שהועבר מהעובד הזה ביום הזה יורד משכרו על משימותיו שלו.
    // ⇄ וגם חלק חלוקת העבודה — אחרת אותן שעות היו נספרות פעמיים: פעם על
    //   משימותיו שלו ופעם כעלות המוצר שנסרק.
    const ovCut=Math.max(0,1-(ovFrac[t.workerId+'_'+d]||0)-(scanFrac[t.workerId+'_'+d]||0));
    const wage=byUnit?(unitRate*(t.qty||0)):(dailyRate/8)*attHours*taskShare*ovCut;
    // 💎 אותן שעות בתעריף מלא. ליחידה: השכר כמו שהוא (אין שעה להעמיס) + תקורה על השעות
    const _hrs=attHours*taskShare*(byUnit?1:ovCut);
    if(byUnit){fullLoaded+=wage;fullOh+=_hrs*_ohOf(t.workerId);}
    else if(dailyRate){fullLoaded+=_hrs*loadedHourlyRate(t.workerId,d);fullOh+=_hrs*_ohOf(t.workerId);_addLd(t.workerId,_hrs,d);}

    // חלק מהוצאות קבועות + משתנות
    const dayVar=varByDay[d]||0;
    const overhead=(dayFixedOf(d)+dayVar)*taskRatio;

    // חלק משכר עוזרים/מנהלים ללא משימות
    const nonTaskShare=(nonTaskWageByDay[d]||0)*taskRatio;
    // חלק מזמן הפיקוח של אחראי המחלקה שלה שייכת המשימה
    const oversightShare=ovByIdx[_tix]||0;

    totalWages+=wage+nonTaskShare+oversightShare;
    totalOverhead+=overhead;
    if(nonTaskShare)totalNonTaskWage+=nonTaskShare;

    // ספירת יחידות פיזיות: אם מוצר השתמש ב"כל הכמות" — נספור רק אותו, לא ברקודים פרטניים
    const prodKey=t.cust+'_'+t.prod;
    let unitCounted=false;
    if(_totalBcProds.has(prodKey)){
      if(isTotalBc(t.bc)&&!_prodCounted.has(prodKey)){unitCounted=true;_prodCounted.add(prodKey);}
    }else{
      const ukey=t.cust+'_'+t.prod+'_'+(t.size||'0');
      if(!_unitSeen.has(ukey)){unitCounted=true;_unitSeen.add(ukey);}
    }
    return{...t,wage,nonTaskShare,oversightShare,overhead,total:wage+nonTaskShare+oversightShare+overhead,date:d,taskRatio,unitCounted,byUnit};
  });

  // ⇄ עלות חלוקת העבודה נספרת בסך השכר, אך אינה יושבת על אף משימה —
  //    היא נזקפת למוצר. סך העלות אינו משתנה: מה שירד מ-ovCut חוזר כאן.
  totalWages+=totalScanCost;
  S._costScanByProd=scanCostByProd;S._costScanByDay=scanCostByDay;
  S._costScanN=scanNByProd;S._costScanTotal=totalScanCost;
  const grandTotal=totalWages+totalOverhead;

  document.getElementById('cost-total').textContent='₪'+Math.round(grandTotal).toLocaleString();
  document.getElementById('cost-wages').textContent='₪'+Math.round(totalWages).toLocaleString();
  document.getElementById('cost-overhead').textContent='₪'+Math.round(totalOverhead).toLocaleString();
  document.getElementById('cost-avg').textContent=enriched.length?'₪'+Math.round(grandTotal/enriched.length).toLocaleString():'—';
  const fEl=document.getElementById('cost-full');
  if(fEl){
    const full=fullLoaded+fullOh;
    fEl.innerHTML=`<div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--b,#ddd)" title="אותן שעות עבודה, בתעריף של דוחות הרווח והתמחור: שעה עמוסה (פיצויים, חגים, מתנות, טיול, הסעה, ביטוח) + תקורה ₪${_oh.toFixed(2)} לשעה. התקורה מחליפה את ההוצאות הרשומות — לא מתווספת להן.">
      <div style="font-size:11px;color:var(--txt2,#666)">עלות מלאה</div>
      <div style="font-size:18px;font-weight:700;color:var(--blue-txt,#1d4ed8)">₪${Math.round(full).toLocaleString()}</div>
      <div class="msub">שכר עמוס ₪${Math.round(fullLoaded).toLocaleString()} + תקורה ₪${Math.round(fullOh).toLocaleString()}</div>
    </div>`;
  }

  // 🧾 הכנסות בטווח — עבודה + חומר אריזה, כמו בלשונית תעודות משלוח (_incShipRows).
  // טווח של חודשים שלמים (1 עד סוף חודש) ⇒ לפי **חודש ההתחשבנות** של כל תעודה;
  // טווח חלקי (יום/שבוע) ⇒ לפי תאריך התעודה. הבסיס למסים ולעמלות הבנק באחוזים.
  if(_canPricing()&&db&&S.fbConnected&&Date.now()-_pfAt>60000){try{await _pfLoad();_pfAt=Date.now();}catch(e){console.warn('pf:',e.message);}}
  const _eom=d=>{const x=new Date(+d.slice(0,4),+d.slice(5,7),0);return d.slice(0,8)+pad2(x.getDate());};
  const bySettle=from.slice(8,10)==='01'&&to===_eom(to);
  const fm=from.slice(0,7),tm=to.slice(0,7);
  let income=0, incWork=0, incPack=0, incShip=0, noPrice=0, noInv=0;
  _incShipRows().forEach(r=>{
    if(bySettle){if(!r.month||r.month<fm||r.month>tm)return;}
    else if(!r.date||r.date<from||r.date>to)return;
    if(r.noPrice)noPrice++;
    if(!r.inv)noInv++;
    incWork+=r.work;incPack+=r.pack;incShip++;
  });
  income=incWork+incPack;
  Object.assign(S._costExp||(S._costExp={}),{ld:_ld,income,incWork,incPack,incShip,noPrice,noInv,bySettle});

  S._costData=enriched;
  renderCostTab();
}

function renderCostTab(){
  const tab=S.costTab||'prod';
  const enriched=S._costData||[];
  const el=document.getElementById('cost-result-content');
  if(!el)return;

  if(!enriched.length){
    el.innerHTML='<div style="text-align:center;padding:2rem;color:var(--txt3)">אין נתונים</div>';
    return;
  }

  if(tab==='prod'){
    // קיבוץ לפי מוצר
    const map={};
    enriched.forEach(t=>{
      const k=t.prod||'—';
      if(!map[k])map[k]={prod:k,tasks:0,wage:0,overhead:0,total:0,qty:0,custs:new Set(),hasOpenQty:false,hasUnitCalc:false};
      map[k].tasks++;map[k].wage+=t.wage;map[k].overhead+=t.overhead;map[k].total+=t.total;map[k].qty+=t.unitCounted?(t.qty||0):0;map[k].custs.add(t.cust);
      if((t.qty||0)===0)map[k].hasOpenQty=true;
      if(t.byUnit)map[k].hasUnitCalc=true;
    });
    // ⇄ עלות חלוקת העבודה — שורה ברמת המוצר, לא על העובד. המפתח הוא cust_prod,
    //    והקיבוץ כאן לפי prod בלבד, ולכן מסכמים את כל הלקוחות של אותו מוצר.
    const _scP=S._costScanByProd||{}, _scN=S._costScanN||{};
    Object.keys(_scP).forEach(pk=>{
      const p=pk.slice(pk.indexOf('_')+1)||'—';
      if(!map[p])map[p]={prod:p,tasks:0,wage:0,overhead:0,total:0,qty:0,custs:new Set(),hasOpenQty:false,hasUnitCalc:false};
      map[p].scan=(map[p].scan||0)+_scP[pk];
      map[p].scanN=(map[p].scanN||0)+(_scN[pk]||0);
      map[p].total+=_scP[pk];
    });
    const rows=Object.values(map).sort((a,b)=>b.total-a.total);
    el.innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right">
        <th style="padding:8px 6px">מוצר</th>
        <th style="padding:8px 6px">יחידות</th>
        <th style="padding:8px 6px">משימות</th>
        <th style="padding:8px 6px">שכר</th>
        <th style="padding:8px 6px" title="עלות זמן חלוקת העבודה — הסריקות שאחראי ביצע עבור העובדים על המוצר הזה. נזקפת למוצר ולא לעובד.">⇄ חלוקה</th>
        <th style="padding:8px 6px">הוצאות</th>
        <th style="padding:8px 6px;color:var(--blue-txt)">סה"כ עלות</th>
        <th style="padding:8px 6px;color:var(--green-txt)">לפי יחידה</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)">
        <td style="padding:7px 6px;font-weight:500">${esc(r.prod)}${r.hasOpenQty?'<span style="font-size:10px;color:#d97706;margin-right:4px"> ⏳</span>':''}${r.hasUnitCalc?'<span style="font-size:10px;color:var(--green-txt);margin-right:2px"> ✂️</span>':''}</td>
        <td style="padding:7px 6px;color:var(--txt2)">${r.qty||'—'}</td>
        <td style="padding:7px 6px;color:var(--txt2)">${r.tasks}</td>
        <td style="padding:7px 6px">₪${Math.round(r.wage).toLocaleString()}</td>
        <td style="padding:7px 6px;color:var(--txt2)"${r.scanN?` title="${esc(r.scanN+' סריקות חלוקת עבודה × '+scanMinPer()+" דק'")}"`:''}>${r.scan?'₪'+Math.round(r.scan).toLocaleString():'—'}</td>
        <td style="padding:7px 6px">₪${Math.round(r.overhead).toLocaleString()}</td>
        <td style="padding:7px 6px;font-weight:600;color:var(--blue-txt)">₪${Math.round(r.total).toLocaleString()}</td>
        <td style="padding:7px 6px;font-weight:600;color:var(--green-txt)">${r.qty?'₪'+Math.round(r.total/r.qty).toLocaleString():'—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;

  } else if(tab==='cust'){
    const map={};
    enriched.forEach(t=>{
      const k=t.cust||'—';
      if(!map[k])map[k]={cust:k,tasks:0,wage:0,overhead:0,total:0,qty:0,prods:new Set()};
      map[k].tasks++;map[k].wage+=t.wage;map[k].overhead+=t.overhead;map[k].total+=t.total;map[k].qty+=t.unitCounted?(t.qty||0):0;map[k].prods.add(t.prod);
    });
    // ⇄ עלות חלוקת העבודה נספרת גם כאן, אחרת סך הלקוחות קטן מסך העלות
    Object.keys(S._costScanByProd||{}).forEach(pk=>{
      const c=pk.slice(0,pk.indexOf('_'))||'—';
      if(!map[c])map[c]={cust:c,tasks:0,wage:0,overhead:0,total:0,qty:0,prods:new Set()};
      map[c].total+=S._costScanByProd[pk];
    });
    const rows=Object.values(map).sort((a,b)=>b.total-a.total);
    el.innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right">
        <th style="padding:8px 6px">לקוח</th>
        <th style="padding:8px 6px">מוצרים</th>
        <th style="padding:8px 6px">יחידות</th>
        <th style="padding:8px 6px">שכר</th>
        <th style="padding:8px 6px">הוצאות</th>
        <th style="padding:8px 6px;color:var(--blue-txt)">סה"כ עלות</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)">
        <td style="padding:7px 6px;font-weight:500"><span class="bc-seg bc-c">${esc(r.cust)}</span>${S.customerNames[r.cust]?` <span style="font-size:12px;color:var(--txt);margin-right:4px">${esc(S.customerNames[r.cust])}</span>`:''}</td>
        <td style="padding:7px 6px;color:var(--txt2)">${r.prods.size}</td>
        <td style="padding:7px 6px;color:var(--txt2)">${r.qty}</td>
        <td style="padding:7px 6px">₪${Math.round(r.wage).toLocaleString()}</td>
        <td style="padding:7px 6px">₪${Math.round(r.overhead).toLocaleString()}</td>
        <td style="padding:7px 6px;font-weight:600;color:var(--blue-txt)">₪${Math.round(r.total).toLocaleString()}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;

  } else if(tab==='exp'){
    const X=S._costExp||{months:[],items:[]};
    const fmt=v=>'₪'+Math.round(v).toLocaleString();
    const fixTot=(X.months||[]).reduce((s,m)=>s+m.tot,0);
    // פירוט הקבועות לפי חודש: כמה ימים נזקפו מתוך כמה ימי עבודה בחודש
    const fixSub=(X.months||[]).map(m=>`${m.m}: ${m.days}${m.full?'':'/'+m.den} ימים${m.full?' — חודש מלא':' — הערכה (ימי לוח בלי שישי)'}`).join('<br>')
      +(X.fixDaily?`<br>כולל ₪${X.fixDaily} ליום`:'');
    const on=X.items.filter(i=>i.on), off=X.items.filter(i=>!i.on);
    const sum=a=>a.reduce((s,i)=>s+i.amount,0);
    const varTot=sum(on.filter(i=>i.src==='var')), wrkTot=sum(on.filter(i=>i.src==='wrk'));
    const th='padding:8px 6px', td='padding:7px 6px';
    const rowsOf=a=>a.map(i=>`<tr style="border-bottom:0.5px solid var(--b)">
        <td style="${td};white-space:nowrap">${i.date}</td>
        <td style="${td}">${i.src==='wrk'?'🧾 עובד':'📄 משתנה'}</td>
        <td style="${td}">${esc(i.desc)}${i.who?` <span style="color:var(--txt3);font-size:11px">· ${esc(i.who)}</span>`:''}</td>
        <td style="${td};font-weight:600">${fmt(i.amount)}</td></tr>`).join('');
    const tbl=(a,emp)=>a.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right">
        <th style="${th}">תאריך</th><th style="${th}">סוג</th><th style="${th}">תיאור</th><th style="${th}">סכום</th>
      </tr></thead><tbody>${rowsOf(a)}</tbody></table></div>`
      :`<div style="font-size:12px;color:var(--txt3);text-align:center;padding:8px">${emp}</div>`;
    // 👷 עלויות עובד נלוות — רכיבי השעה העמוסה, נכללים ב"עלות מלאה" (לא ב"עלות הוצאות")
    // מתנות וטיול בכרטיס אחד — סכום אישי לעובד נשמר כולו תחת gifts
    const ld={...(X.ld||{})};ld.gifts=(ld.gifts||0)+(ld.trip||0);
    const LDL=[['transport','🚌 הסעות'],['severance','📑 פיצויים'],['holidays','🎉 חגים'],['gifts','🎁 מתנות וטיול'],['insurance','🛡 ביטוח']];
    const ldTot=LDL.reduce((s,[k])=>s+(ld[k]||0),0);
    // 🏦 מסים ועמלות בנק — אחוז מההכנסות בטווח
    const taxPct=+S.costs.taxPct||0, bankPct=+S.costs.bankPct||0, inc=X.income||0;
    const tax=inc*taxPct/100, bank=inc*bankPct/100;
    const card=(l,v,sub,c)=>`<div style="background:var(--bg2);border-radius:var(--r);padding:8px 10px"><div style="font-size:11px;color:var(--txt3)">${l}</div><div style="font-weight:700${c?';color:var('+c+')':''}">${v}</div>${sub?`<div style="font-size:11px;color:var(--txt3)">${sub}</div>`:''}</div>`;
    const grid='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:1rem';
    const extra=`
      <div class="sec" style="font-size:13px;margin-top:1.25rem">👷 עלויות עובד נלוות</div>
      <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">לפי שעות העבודה בטווח והגדרות "שעה עמוסה". נכללות ב"עלות מלאה" (שכר עמוס) — לא ב"עלות הוצאות".</div>
      <div style="${grid}">${LDL.map(([k,l])=>card(l,fmt(ld[k]||0))).join('')}${card('סה"כ נלוות',fmt(ldTot),'','--blue-txt')}</div>
      <div class="sec" style="font-size:13px">🏦 מסים ועמלות בנק</div>
      <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">הכנסות = תעודות משלוח: עבודה (מחיר יחידה + גזירה) + חומר אריזה — כמו בלשונית תעודות משלוח. ${X.bySettle?'חודש שלם ⇒ לפי <b>חודש ההתחשבנות</b> של החשבונית (תעודה בלי חשבונית — לפי תאריכה).':'טווח חלקי ⇒ לפי תאריך התעודה.'} האחוזים נקבעים בכרטיס "הוצאות קבועות".</div>
      <div style="${grid}">
        ${card('💵 הכנסות '+(X.bySettle?'בהתחשבנות':'בטווח'),fmt(inc),(X.incShip||0)+' תעודות · עבודה '+fmt(X.incWork||0)+' + אריזה '+fmt(X.incPack||0))}
        ${card('🧮 מסים',fmt(tax),taxPct+'% מההכנסות')}
        ${card('🏦 עמלות בנק',fmt(bank),bankPct+'% מההכנסות')}
        ${card('סה"כ',fmt(tax+bank),'','--blue-txt')}
      </div>
      ${X.noPrice?`<div style="font-size:11px;color:var(--amber-txt)">⚠️ ${X.noPrice} תעודות בטווח של הזמנות בלי מחיר — העבודה שלהן לא נכנסה להכנסות.</div>`:''}
      ${X.bySettle&&X.noInv?`<div style="font-size:11px;color:var(--amber-txt)">⏳ ${X.noInv} תעודות עוד בלי חשבונית עסקה — שויכו לפי תאריך התעודה; אחרי הפקת החשבונית יעברו לחודש ההתחשבנות שלה.</div>`:''}
      ${!taxPct&&!bankPct?`<div style="font-size:11px;color:var(--txt3)">לא הוזנו אחוזים — הזן בכרטיס "הוצאות קבועות" ולחץ שמור.</div>`:''}`;
    el.innerHTML=`
      <div class="sec" style="font-size:13px">📋 הוצאות רשומות (= "עלות הוצאות")</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:1rem">
        <div style="background:var(--bg2);border-radius:var(--r);padding:8px 10px"><div style="font-size:11px;color:var(--txt3)">⚙️ קבועות</div><div style="font-weight:700">${fmt(fixTot)}</div><div style="font-size:11px;color:var(--txt3)">${fixSub}</div></div>
        <div style="background:var(--bg2);border-radius:var(--r);padding:8px 10px"><div style="font-size:11px;color:var(--txt3)">📄 משתנות (ידני)</div><div style="font-weight:700">${fmt(varTot)}</div></div>
        <div style="background:var(--bg2);border-radius:var(--r);padding:8px 10px"><div style="font-size:11px;color:var(--txt3)">🧾 הוצאות עובדים</div><div style="font-weight:700">${fmt(wrkTot)}</div></div>
        <div style="background:var(--bg2);border-radius:var(--r);padding:8px 10px"><div style="font-size:11px;color:var(--txt3)">סה"כ הוצאות</div><div style="font-weight:700;color:var(--blue-txt)">${fmt(fixTot+varTot+wrkTot)}</div></div>
      </div>
      <div class="sec" style="font-size:13px">הוצאות שנזקפו (${on.length})</div>
      ${tbl(on,'אין הוצאות משתנות בטווח')}
      ${off.length?`<div class="sec" style="font-size:13px;margin-top:1rem;color:var(--amber-txt)">⚠️ לא נזקפו — יום בלי משימות (${fmt(sum(off))})</div>
      <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">ההוצאות מתחלקות על משימות היום, וביום בלי משימות אין על מה לחלק — לכן אינן בסה"כ למעלה.</div>
      ${tbl(off,'')}`:''}${extra}`;
  } else if(tab==='day'){
    const map={};
    enriched.forEach(t=>{
      const k=t.date;
      if(!map[k])map[k]={date:k,tasks:0,wage:0,overhead:0,total:0,workers:new Set()};
      map[k].tasks++;map[k].wage+=t.wage;map[k].overhead+=t.overhead;map[k].total+=t.total;map[k].workers.add(t.workerId);
    });
    // ⇄ עלות חלוקת העבודה — לפי היום שבו בוצעו הסריקות
    Object.keys(S._costScanByDay||{}).forEach(d=>{
      if(!map[d])map[d]={date:d,tasks:0,wage:0,overhead:0,total:0,workers:new Set()};
      map[d].total+=S._costScanByDay[d];
    });
    const rows=Object.keys(map).sort((a,b)=>b.localeCompare(a)).map(k=>map[k]);
    el.innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right">
        <th style="padding:8px 6px">תאריך</th>
        <th style="padding:8px 6px">עובדים</th>
        <th style="padding:8px 6px">משימות</th>
        <th style="padding:8px 6px">שכר</th>
        <th style="padding:8px 6px">הוצאות</th>
        <th style="padding:8px 6px;color:var(--blue-txt)">סה"כ</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr style="border-bottom:0.5px solid var(--b)">
        <td style="padding:7px 6px;font-weight:500">${r.date}</td>
        <td style="padding:7px 6px;color:var(--txt2)">${r.workers.size}</td>
        <td style="padding:7px 6px;color:var(--txt2)">${r.tasks}</td>
        <td style="padding:7px 6px">₪${Math.round(r.wage).toLocaleString()}</td>
        <td style="padding:7px 6px">₪${Math.round(r.overhead).toLocaleString()}</td>
        <td style="padding:7px 6px;font-weight:600;color:var(--blue-txt)">₪${Math.round(r.total).toLocaleString()}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;

  } else if(tab==='worker'){
    // עובדים עם משימות
    const from=document.getElementById('cost-from')?.value||'';
    const to=document.getElementById('cost-to')?.value||'';
    const map={};
    enriched.forEach(t=>{
      const k=t.workerId||'—';
      if(!map[k])map[k]={id:k,name:t.workerName||k,tasks:0,wage:0,totalSec:0,attMs:0};
      map[k].tasks++;map[k].wage+=t.wage;map[k].totalSec+=(t.duration||0);
    });
    // שעות נוכחות אמיתיות מ-attHistory — הטווח נטען ב-calcCosts (חורג מ-45 יום)
    (_costAtt||S.attHistory||[]).forEach(rec=>{
      if(rec.date<from||rec.date>to)return;
      if(!map[rec.workerId])return;
      map[rec.workerId].attMs+=(rec.netMs||0);
    });
    const rows=Object.values(map).sort((a,b)=>b.wage-a.wage);

    // עובדים ללא משימות (עוזרים/מנהלים/אחראים) מתוך attHistory
    const taskWorkerIds=new Set(enriched.map(t=>t.workerId));
    const nonTaskMap={};
    (_costAtt||S.attHistory||[]).forEach(rec=>{
      if(rec.date<from||rec.date>to)return;
      if(taskWorkerIds.has(rec.workerId))return;
      const dailyRate=wRate(rec.workerId,rec.date);
      if(!dailyRate)return;
      const k=rec.workerId;
      if(!nonTaskMap[k])nonTaskMap[k]={id:k,name:rec.workerName||k,netMs:0,wage:0};
      nonTaskMap[k].netMs+=(rec.netMs||0);
      nonTaskMap[k].wage+=(dailyRate/8)*((rec.netMs||0)/3600000);
    });
    const nonTaskRows=Object.values(nonTaskMap);
    const w=S.workers;
    const roleLabel=id=>{const ww=w.find(x=>x.id===id);return ww?.role==='helper'?'עוזר':ww?.role==='manager'?'מנהל':ww?.role==='supervisor'?'אחראי':'עובד';};

    el.innerHTML=`<div style="overflow-x:auto">
      <div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:6px">עובדים עם משימות</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:1rem">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right">
        <th style="padding:8px 6px">עובד</th>
        <th style="padding:8px 6px">תפקיד</th>
        <th style="padding:8px 6px">משימות</th>
        <th style="padding:8px 6px">שעות</th>
        <th style="padding:8px 6px">תעריף יומי</th>
        <th style="padding:8px 6px;color:var(--green-txt)">שכר</th>
      </tr></thead>
      <tbody>${rows.map(r=>{
        const dailyRate=wRate(r.id,to);
        return`<tr style="border-bottom:0.5px solid var(--b)">
          <td style="padding:7px 6px;font-weight:500">${esc(r.name)}</td>
          <td style="padding:7px 6px;color:var(--txt2)">${roleLabel(r.id)}</td>
          <td style="padding:7px 6px;color:var(--txt2)">${r.tasks}</td>
          <td style="padding:7px 6px">${(r.attMs/3600000).toFixed(1)}</td>
          <td style="padding:7px 6px;color:var(--txt2)">${dailyRate?'₪'+dailyRate.toLocaleString():'—'}</td>
          <td style="padding:7px 6px;font-weight:600;color:var(--green-txt)">₪${Math.round(r.wage).toLocaleString()}</td>
        </tr>`;}).join('')}</tbody>
      </table>
      ${nonTaskRows.length?`
      <div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:6px">עוזרים / מנהלים / אחראים (ללא משימות — שכר מחולק על המוצרים)</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right">
        <th style="padding:8px 6px">עובד</th>
        <th style="padding:8px 6px">תפקיד</th>
        <th style="padding:8px 6px">שעות נוכחות</th>
        <th style="padding:8px 6px">תעריף יומי</th>
        <th style="padding:8px 6px;color:var(--amber-txt)">שכר (מחולק)</th>
      </tr></thead>
      <tbody>${nonTaskRows.map(r=>{
        const dailyRate=wRate(r.id,to);
        return`<tr style="border-bottom:0.5px solid var(--b)">
          <td style="padding:7px 6px;font-weight:500">${esc(r.name)}</td>
          <td style="padding:7px 6px;color:var(--txt2)">${roleLabel(r.id)}</td>
          <td style="padding:7px 6px">${(r.netMs/3600000).toFixed(1)}</td>
          <td style="padding:7px 6px;color:var(--txt2)">${dailyRate?'₪'+dailyRate.toLocaleString():'—'}</td>
          <td style="padding:7px 6px;font-weight:600;color:var(--amber-txt)">₪${Math.round(r.wage).toLocaleString()}</td>
        </tr>`;}).join('')}</tbody>
      </table>`:''}
    </div>`;

  } else if(tab==='payroll'){
    const from=document.getElementById('cost-from')?.value||'';
    const to=document.getElementById('cost-to')?.value||'';
    // קיבוץ לפי עובד מ-attHistory — 🛑 שכר: הטווח חייב להיות מלא, לא חלון 45 יום
    const pMap={};
    (_costAtt||S.attHistory||[]).forEach(rec=>{
      if(rec.date<from||rec.date>to)return;
      const k=rec.workerId;
      if(!pMap[k])pMap[k]={id:k,name:rec.workerName||k,days:0,netMs:0,pay:0};
      pMap[k].days++;
      pMap[k].netMs+=(rec.netMs||0);
      pMap[k].pay+=(wRate(k,rec.date)/8)*((rec.netMs||0)/3600000); // 📅 תעריף של אותו יום
    });
    // עובדים ללא היסטוריה שקיימים במערכת עם תעריף
    S.workers.forEach(w=>{
      if(!pMap[w.id]&&S.costs.workerRates[w.id]){
        pMap[w.id]={id:w.id,name:w.name,days:0,netMs:0,pay:0};
      }
    });
    const roleLabel2=id=>{const ww=S.workers.find(x=>x.id===id);return ww?.role==='helper'?'עוזר':ww?.role==='manager'?'מנהל':ww?.role==='supervisor'?'אחראי':'עובד';};
    const rows=Object.values(pMap).map(r=>{
      const dailyRate=wRate(r.id,to);
      const hours=r.netMs/3600000;
      const salary=Math.round(r.pay||0);
      return{...r,key:r.id,dailyRate,hours,salary};
    }).sort((a,b)=>b.salary-a.salary);
    // 💵 מפרעות + שורות ידניות — נשמרים לפי חודש ה-"מ-" (adminSettings/payroll_YYYY-MM, מנהל בלבד)
    const pm=_payKey(from),pd=_payData[pm];
    if(pm&&!pd){el.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:12px">⏳ טוען מפרעות…</div>';_payLoad(pm).then(()=>{if(S.costTab==='payroll')renderCostTab();});return;}
    (pd?.manual||[]).forEach(x=>rows.push({key:'m_'+x.id,mid:x.id,name:x.name,note:x.note||'',manual:true,days:'',hours:null,dailyRate:0,salary:Math.round(+x.a||0)}));
    const advOf=k=>(pd?.adv?.[k]||[]).slice().sort((a,b)=>String(a.d).localeCompare(String(b.d)));
    // ➕ תוספות (הסעות, עבודה בבית...) — מתווספות לשכר; מפרעות — יורדות ממנו
    rows.forEach(r=>{r.adv=advOf(r.key);r.advSum=r.adv.reduce((s,x)=>s+(+x.a||0),0);
      r.add=(pd?.add?.[r.key]||[]);r.addSum=r.add.reduce((s,x)=>s+(+x.a||0),0);
      r.remain=Math.round((r.salary+r.addSum-r.advSum)*100)/100;});
    const totalSalary=rows.reduce((s,r)=>s+r.salary,0);
    const totalAdd=rows.reduce((s,r)=>s+r.addSum,0);
    const totalAdv=rows.reduce((s,r)=>s+r.advSum,0);
    const totalRemain=Math.round((totalSalary+totalAdd-totalAdv)*100)/100;
    const dm=d=>String(d).slice(8,10)+'/'+String(d).slice(5,7);
    const byDate={};rows.forEach(r=>r.adv.forEach(x=>{byDate[x.d]=(byDate[x.d]||0)+(+x.a||0);}));
    const multiMonth=from&&to&&from.slice(0,7)!==to.slice(0,7);
    _payRowsCur=rows.map(r=>({key:r.key,name:r.name,salary:r.salary,addSum:r.addSum,advSum:r.advSum,remain:r.remain,adv:r.adv}));
    el.innerHTML=`<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;font-weight:700;color:var(--txt)">💰 תשלום משכורות — ${from||'—'} עד ${to||'—'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div style="background:var(--green);color:#fff;padding:6px 14px;border-radius:10px;font-size:14px;font-weight:700">נשאר לתשלום: ₪${totalRemain.toLocaleString()}</div>
          <button class="btn" onclick="payAdvModal('')" style="font-size:12px">➕ מפרעות</button>
          <button class="btn" onclick="payManualModal('')" style="font-size:12px">➕ שורה ידנית</button>
          <button class="btn" onclick="printPayroll()" style="font-size:12px">🖨 הדפס</button>
          <button class="btn" onclick="payLabelsModal()" style="font-size:12px">🏷 מדבקות</button>
        </div>
      </div>
      ${multiMonth?`<div style="font-size:12px;color:var(--amber-txt);margin-bottom:8px">⚠️ הטווח חוצה חודשים — המפרעות והשורות הידניות שייכות לחודש ${pm}</div>`:''}
      ${Object.keys(byDate).length?`<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">💵 מפרעות לפי תאריך: ${Object.keys(byDate).sort().map(d=>`<b>${dm(d)}</b> ₪${byDate[d].toLocaleString()}`).join(' · ')}</div>`:''}
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px" id="payroll-table">
      <thead><tr style="border-bottom:1.5px solid var(--b);text-align:right;background:var(--bg2)">
        <th style="padding:9px 8px">עובד</th>
        <th style="padding:9px 8px">תפקיד</th>
        <th style="padding:9px 8px">ימי נוכחות</th>
        <th style="padding:9px 8px">שעות נטו</th>
        <th style="padding:9px 8px">תעריף יומי</th>
        <th style="padding:9px 8px">שכר</th>
        <th style="padding:9px 8px">תוספות</th>
        <th style="padding:9px 8px">מפרעות</th>
        <th style="padding:9px 8px;color:var(--green-txt)">נשאר לתשלום</th>
        <th style="padding:9px 8px">אישור תשלום</th>
      </tr></thead>
      <tbody>${rows.map((r,i)=>`<tr style="border-bottom:0.5px solid var(--b)${r.manual?';background:var(--bg2)':''}">
        <td style="padding:8px 8px;font-weight:600">${esc(r.name)}${r.manual&&r.note?`<div style="font-size:10px;color:var(--txt3);font-weight:400">${esc(r.note)}</div>`:''}</td>
        <td style="padding:8px 8px;color:var(--txt3)">${r.manual?`✍ ידני <a href="#" class="np" onclick="payManualModal('${escj(r.mid)}');return false" style="font-size:11px">✏️</a>`:roleLabel2(r.id)}</td>
        <td style="padding:8px 8px;text-align:center">${r.days}</td>
        <td style="padding:8px 8px;text-align:center">${r.hours==null?'':r.hours.toFixed(1)}</td>
        <td style="padding:8px 8px;color:var(--txt3)">${r.dailyRate?'₪'+r.dailyRate.toLocaleString():'—'}</td>
        <td style="padding:8px 8px;font-weight:600">₪${r.salary.toLocaleString()}</td>
        <td style="padding:6px 8px;font-size:12px">${r.add.map(x=>`<div style="white-space:nowrap">₪${(+x.a).toLocaleString()}${x.note?` · ${esc(x.note)}`:''} <a href="#" class="np" title="מחק תוספת" onclick="payAddDel(${i},'${escj(x.id)}');return false" style="color:var(--red-txt);text-decoration:none">✕</a></div>`).join('')}<a href="#" class="np" onclick="payAddModal(${i});return false" style="font-size:11px">➕</a></td>
        <td style="padding:6px 8px;font-size:12px">${r.adv.map(x=>`<div style="white-space:nowrap">${dm(x.d)} · ₪${(+x.a).toLocaleString()} <a href="#" class="np" title="מחק מפרעה" onclick="payAdvDel(${i},'${escj(x.id)}');return false" style="color:var(--red-txt);text-decoration:none">✕</a></div>`).join('')}<a href="#" class="np" onclick="payAdvModal(${i});return false" style="font-size:11px">➕</a></td>
        <td style="padding:8px 8px;font-weight:700;font-size:15px;color:${r.remain<0?'var(--red-txt)':'var(--green-txt)'}">₪${r.remain.toLocaleString()}</td>
        <td style="padding:8px 8px"><label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" style="width:16px;height:16px"> שולם</label></td>
      </tr>`).join('')}
      <tr style="border-top:2px solid var(--b);background:var(--bg2)">
        <td colspan="5" style="padding:9px 8px;font-weight:700">סה"כ</td>
        <td style="padding:9px 8px;font-weight:700">₪${totalSalary.toLocaleString()}</td>
        <td style="padding:9px 8px;font-weight:700">₪${totalAdd.toLocaleString()}</td>
        <td style="padding:9px 8px;font-weight:700">₪${totalAdv.toLocaleString()}</td>
        <td style="padding:9px 8px;font-weight:700;color:var(--green-txt);font-size:16px">₪${totalRemain.toLocaleString()}</td>
        <td></td>
      </tr></tbody>
      </table></div>
      <div style="font-size:11px;color:var(--txt3);margin-top:8px">⚡ שכר: שעות נוכחות נטו × (תעריף יומי ÷ 8) · נשאר לתשלום = שכר + תוספות − מפרעות</div>
    </div>`;
  }
}

