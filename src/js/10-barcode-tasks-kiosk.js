// ─── BARCODE ────────────────────────────────────────────────
function parseBc(v){
  v=(v||'').replace(/\D/g,'');
  const el=document.getElementById('bc-prev');
  if(v.length<2){el.innerHTML='';bcShowTaskTypeField(true);return;}
  if(isBcLen(v.length)&&isSampleScan(v)){el.innerHTML=sampleScanPreview(v);showSampleMode('bc');return;}
  const c=v.slice(0,2),p=v.slice(2,7),sz=v.slice(7,8),q=v.slice(8,11),col=v.slice(11,13);
  const isTotal=isTotalBc(v);
  const totalQty=isTotal?getTotalQty(c,p,orderNoOf(v)):0;
  el.innerHTML=isTotal
    ?`<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:8px;background:var(--bg2);border-radius:var(--r)">
        <span class="bc-seg bc-c">לקוח: ${c||'__'}</span>
        <span class="bc-seg bc-p">מוצר: ${p.padEnd(5,'_')}</span>${bcOrderChip(v)}
        <span class="bc-seg" style="background:var(--green-bg,#d1fae5);color:var(--green-txt,#065f46);font-weight:700">📦 כל הכמות${totalQty?' — '+totalQty+' יח׳':''}</span>
      </div>`
    :`<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:8px;background:var(--bg2);border-radius:var(--r)">
        <span class="bc-seg bc-c">לקוח: ${c||'__'}</span>
        <span class="bc-seg bc-p">מוצר: ${p.padEnd(5,'_')}</span>${bcOrderChip(v)}
        <span class="bc-seg" style="background:var(--amber-bg);color:var(--amber-txt)">מידה: ${sz?esc(szLblT(c,p,sz)):'_'}</span>
        <span class="bc-seg bc-q">כמות: ${q.padEnd(3,'_')}</span>
        <span class="bc-seg bc-col">צבע: ${COLORS[col]||col||'__'}</span>
      </div>`;
  if(isBcLen(v.length))el.innerHTML+=bcRetiredHtml(v); // 🔒 ברקוד שסיים את תפקידו
  if(isBcLen(v.length)&&isTotalBc(v))el.innerHTML+=countEntryBtnHtml(v)+cutReportBtnHtml(v); // 📝 כמויות ושלבים + ✂️ דוח גזירה מהסורק
  if(isBcLen(v.length)){
    // 🔢 לפי **ההזמנה שבברקוד** ולא לפי הרשומה העדכנית: למוצר יכולות להיות כמה
    // הזמנות עם שלבים שונים, ו-findProd היה מחזיר תמיד את האחרונה (ראה gotcha_duplicate_prod_records).
    const prod=bcOrderProd(v);
    const steps=prod?.workSteps||[];
    if(steps.length){
      bcShowTaskTypeField(false);
      renderStepChecks('bc',c,p,steps,v);updateExpectedTime('bc');
      return;
    }
  }
  bcShowTaskTypeField(true);
}
function bcShowTaskTypeField(show){
  const wrap=document.getElementById('bc-tasktype-wrap');
  const stepsWrap=document.getElementById('bc-steps-wrap');
  if(wrap)wrap.style.display=show?'':'none';
  if(stepsWrap)stepsWrap.style.display=show?'none':'';
  if(show){const ex=document.getElementById('bc-expected');if(ex)ex.innerHTML='';clearStepChecks('bc');}
}
// הגבלת סריקה בעמוד "סריקה" (bc): עד 2 שלבים לברקוד (מנהל — ללא הגבלה) + עדכון צפי זמן
function bcStepToggle(cb){
  if(S.user?.role!=='manager'&&cb.checked){
    const list=document.getElementById('bc-steps-list');
    const nonQuick=[...list.querySelectorAll('input[type="checkbox"]:checked')].filter(x=>!isQuickStep(list?.dataset.cust,list?.dataset.prod,x.dataset.step)).length;
    if(nonQuick>2){cb.checked=false;showToast(LANGS[currentLang].lim_steps||'⚠ ניתן לבחור עד 2 שלבים לכל ברקוד','var(--red-txt)');return;}
  }
  updateExpectedTime('bc');
}
function tryDemo(){
  document.getElementById('bc-inp').value='0710042302503';
  parseBc('0710042302503');
  document.getElementById('bc-inp').focus();
}
async function submitBc(){
  const raw=(document.getElementById('bc-inp').value||'').replace(/\D/g,'');
  const T=LANGS[currentLang];
  if(!raw&&_bcBatch.length){await bcStartBatch();return;} // שדה ריק + סל ממתין = התחל את כל הסל
  if(!isBcLen(raw.length)){alert('ברקוד חייב להיות 13 או 16 ספרות');return;}
  if(!bcSignGate('bc',raw))return;
  if(!S.user){alert('יש להתחבר תחילה');return;}
  if(isShipBc(raw)){openShipModal(raw.slice(0,2),raw.slice(2,7),orderNoOf(raw));document.getElementById('bc-inp').value='';parseBc('');return;} // ברקוד "יצא ללקוח" — לא משימה
  if(isSampleScan(raw)){await bcStartSample(raw);return;} // 👕 דגם ראשון — התחלה מיידית, בלי שלבים ושערים
  const cust=raw.slice(0,2),prod=raw.slice(2,7),size=raw.slice(7,8),col=raw.slice(11,13);
  const isTotal=isTotalBc(raw);
  if(!isTotal&&parseInt(raw.slice(8,11))===0&&productHasDefinedQty(cust,prod)){showToast('⚠ קיים ברקוד עם כמות למוצר זה — השתמש בברקוד הספציפי','var(--red-txt)',6000);return;}
  const qty=isTotal?getTotalQty(cust,prod,orderNoOf(raw)):parseInt(raw.slice(8,11))||0;
  const bcStepsWrap=document.getElementById('bc-steps-wrap');
  const bcUseSteps=bcStepsWrap&&bcStepsWrap.style.display!=='none';
  const bcCheckedSteps=bcUseSteps?[...document.querySelectorAll('#bc-steps-list input[type="checkbox"]:checked')].map(cb=>cb.dataset.step):[];
  const taskType=bcUseSteps?'':((document.getElementById('bc-tasktype').value||'').trim());
  const taskDept=(document.getElementById('bc-dept').value||'').trim();
  const u=S.user;
  const wu=S.workers.find(x=>x.id===u.id);
  if(!wu||wu.status!=='in'){alert('לא ניתן להתחיל משימה — יש להירשם כנוכח תחילה (כניסה לעבודה בלשונית נוכחות)');return;}
  if(bcUseSteps&&!bcCheckedSteps.length){showToast(T.err_sel_step||'⚠ בחר לפחות שלב עבודה אחד','var(--red-txt)');return;}
  // 🔒 שער התחנה — חובת סריקת תחנה + שלב נעול למשפחת התחנה שלו. הסורק האישי מופעל
  // ע"י העובד עצמו ולכן זו חסימה מוחלטת (העקיפה שמורה למנהל/אחראי בסורקי המשימות).
  if(!await passRetiredGate([raw],true))return; // 🔒 ספירה/גזירה אחרי הזנת כמויות · מידה שיצאה כולה
  if(!await passStationGate(wu,cust,prod,bcUseSteps?bcCheckedSteps:[],raw))return;
  // 🔗 שער סדר השלבים — כל השלבים שסומנו בסריקה הזו נחשבים "אותה סריקה"
  if(!await passMergeGate(cust,prod,raw,bcUseSteps?bcCheckedSteps:[taskType],u.id))return;
  // ברקוד שכבר בעבודה אצל עובד אחר באותו שלב — אישור הצטרפות
  const otherSame=S.activeTasks.find(t=>t.workerId!==u.id&&!t.splitId&&taskBc(t)===raw&&(t.taskType||'').trim().toLowerCase()===taskType.toLowerCase());
  if(otherSame&&!await showConfirm(T.cfm_join_title||'הצטרפות למשימה',T.cfm_join_msg+otherSame.workerName+(otherSame.taskType?' ('+otherSame.taskType+')':'')+T.cfm_join_msg2,T.cfm_join_ok||'הצטרף',T.cancel||'ביטול'))return;
  // משימה פעילה קיימת — לסגור את כולן או לעבוד במקביל. נשאל רק בסריקה הראשונה של הסל (ההחלטה תקפה לכולו)
  if(!_bcBatch.length){
    _bcCloseOnStart=[];_bcPauseOnStart=[]; // סל חדש — כוונה מסבב קודם שננטש לא נגררת לכאן
    // ⚠️ מושהיות מוחרגות. שחרור מושהית עובר **בסורק המשימות** (עובד + תחנה + ברקוד
    // ושלב → handlePausedTasks), ולא בסורק האישי. בלי הסינון הזה משימה שהושהתה כ-⏸
    // זמנית הייתה מוצגת כאן כ"פעילה" ונסגרת להיסטוריה בסריקה הבאה של העובדת עצמה.
    const existTasks=S.activeTasks.filter(t=>t.workerId===u.id&&!t.paused);
    if(existTasks.length>0){
      const prev=existTasks[0];
      const msg=existTasks.length>1?existTasks.length+' משימות פעילות — '+existTasks.map(t=>t.prod).join(', ')+T.cfm_existing_msg:'מוצר '+prev.prod+T.cfm_existing_msg;
      const _sm=await askSwapMode({name:u.name},existTasks);
      if(_sm==='pause')_bcPauseOnStart=existTasks.map(t=>String(t.id));
      // ⚠️ לא סוגרים כאן. עד ליצירה בפועל (bcStartBatch) יש שלוש יציאות — "כלום לא נוסף",
      // "➕ סרוק עוד", והשערים שבתוך bcStartBatch — ומעליהן רענון מבאנר העדכון. סגירה מוקדמת
      // בכל אחת מהן משאירה את העובד בלי שום משימה פתוחה והזמן נמחק בלי עקבה (ايمان 08/08:
      // 92 דק'). ⚠️ _bcBatch אינו נשמר ל-localStorage — רענון מוחק את הסל, וסגירה מוקדמת
      // הייתה מוחקת איתו גם את המשימה שרצה. לכן נשמרת כוונה בלבד.
      if(_sm==='close')_bcCloseOnStart=existTasks.map(t=>String(t.id));
    }
  }
  // הגבלת סריקה לאחראי/עובד/עוזר (מנהל — ללא הגבלה): עד 2 שלבים לברקוד ועד 2 ברקודים פעילים (כולל הסל)
  if(u.role!=='manager'){
    const nonQuickSteps=bcUseSteps?bcCheckedSteps.filter(st=>!isQuickStep(cust,prod,st)):[];
    if(bcUseSteps&&nonQuickSteps.length>2){showToast(T.lim_steps||'⚠ ניתן לבחור עד 2 שלבים לכל ברקוד','var(--red-txt)');return;}
    // ברקודים שכל משימותיהם הפעילות הן שלבי ⚡ מהיר אינם נספרים; סריקה כולה-מהירה לא נחסמת
    const addingNonQuick=bcUseSteps?nonQuickSteps.length>0:true;
    // ⚠️ מושהית אינה "ברקוד פעיל". בלי הסינון הזה עובדת שהשהתה שתי משימות (⏸ זמנית)
    // נחסמת מלסרוק בכלל — כלומר גם מלהתחיל את הזמנית שבשבילה השהתה. זה היה הופך
    // את ⏸ למלכודת: הודעת "עד 2 ברקודים" בלי שום רמז לסיבה.
    const nonQuickBc=new Set([
      ...S.activeTasks.filter(t=>t.workerId===u.id&&!t.paused&&!t.isSample&&!isQuickStep(t.cust,t.prod,t.taskType)).map(t=>taskBc(t)),
      ..._bcBatch.filter(b=>!b.isSample&&!isQuickStep(b.cust,b.prod,b.taskType)).map(b=>b.raw)
    ]);
    if(addingNonQuick&&!nonQuickBc.has(raw)&&nonQuickBc.size>=2){showToast(T.lim_bc||'⚠ ניתן לסרוק עד 2 ברקודים','var(--red-txt)');return;}
  }
  try{
    // הוספה לסל עם חסימת סריקה כפולה ([[feature-dup-scan-block]]) — חובה גם כאן, לא רק בסורק המשימות ([[two-scanners-gotcha]])
    const _bcExp=await fetchExpected(cust,prod,u.id,qty||_estQtyBc(raw)); // צפי זמן לפי התמחור (fallback לשרת בקאש-מיס) · 📏 אין כמות ⇒ המשוערת
    const types=bcUseSteps?bcCheckedSteps:[taskType||''];
    const dupSkipped=addStepsToBcCart({raw,cust,prod,size,qty,col,isTotal,taskDept,want:_partWant('bc')},types,_bcExp);
    if(dupSkipped.length)showToast(T.scan_not_added+' '+dupSkipped.join(' · '),'var(--red-txt)',7000);
    if(dupSkipped.length>=types.length){renderBcBatchQueue();return;} // כלום לא נוסף — נשאר במצב הנוכחי
    document.getElementById('bc-inp').value='';parseBc('');
    document.getElementById('bc-tasktype').value='';
    renderBcBatchQueue();
    // שאלה: לצרף עוד משימות לאותו טיימר? (הגבלות 2 ברקודים/2 שלבים נאכפות על כל סריקה נוספת)
    const totExp=_bcBatch.reduce((s,b)=>s+(+b.expMin||0),0);
    const qMsg=`🛒 ${_bcBatch.length} ${T.bc_tasks_in_cart||'משימות בסל'}`+(totExp>0?` · ${T.bc_total_exp||'🎯 צפי כולל'}: ${fmtExpMin(totExp)}`:'')+`\n${T.bc_cart_q_msg||'סרוק עוד ברקוד לאותו טיימר (צפי משותף לכל המשימות), או התחל עכשיו'}`;
    const startNow=await showConfirm(T.bc_cart_q_title||'לצרף עוד משימות?',qMsg,T.bc_start_now||'▶ התחל עכשיו',T.bc_add_more||'➕ סרוק עוד');
    if(!startNow){showToast(T.bc_scan_next||'📷 סרוק את הברקוד הבא');document.getElementById('bc-inp').focus();return;}
    await bcStartBatch();
  }catch(e){showToast('❌ שגיאה בפתיחת משימה: '+e.message,'var(--red-txt)',8000);}
}
// 👕 דגם ראשון בסורק האישי — בלי שלבים, בלי שערי תחנה/סדר, בלי מגבלת 2 ברקודים. נכנס לסל כמו כל
// ברקוד: כמה דגמים (או דגם + מידות) על אותו טיימר = סריקה → "➕ סרוק עוד" → סריקה → "▶ התחל"
// (החלטת המשתמש 12/09 — כמו עבודה על כמה מידות). שאלת ⏸ זמנית / ✅ חדשה נשארת כמו בכל סריקה.
async function bcStartSample(raw){
  const u=S.user;
  const wu=S.workers.find(x=>x.id===u.id);
  if(!wu||wu.status!=='in'){alert('לא ניתן להתחיל משימה — יש להירשם כנוכח תחילה (כניסה לעבודה בלשונית נוכחות)');return;}
  const dup=sampleDupFor(u.id,raw,_bcBatch);
  if(dup){showToast(SAMPLE_STEP+' — '+dup,'var(--red-txt)',6000);return;}
  if(!_bcBatch.length){
    _bcCloseOnStart=[];_bcPauseOnStart=[];
    const existTasks=S.activeTasks.filter(t=>t.workerId===u.id&&!t.paused);
    if(existTasks.length){
      const _sm=await askSwapMode({name:u.name},existTasks);
      if(_sm==='pause')_bcPauseOnStart=existTasks.map(t=>String(t.id));
      else _bcCloseOnStart=existTasks.map(t=>String(t.id));
    }
  }
  _bcBatch.push(sampleBase(raw,(document.getElementById('bc-dept')?.value||'').trim()));
  document.getElementById('bc-inp').value='';parseBc('');
  renderBcBatchQueue();
  // כמו כל ברקוד: לצרף עוד לסל (עוד דגם / עוד מידה) על אותו טיימר, או להתחיל עכשיו.
  // ⚠️ showConfirm מחזיר false גם בלחיצה על הרקע ⇒ "➕ סרוק עוד" — הענף הלא-הרסני, הסל נשמר.
  const T=LANGS[currentLang];
  const totExp=_bcBatch.reduce((s,b)=>s+(+b.expMin||0),0);
  const qMsg=`🛒 ${_bcBatch.length} ${T.bc_tasks_in_cart||'משימות בסל'}`+(totExp>0?` · ${T.bc_total_exp||'🎯 צפי כולל'}: ${fmtExpMin(totExp)}`:'')+`\n${T.bc_cart_q_msg||'סרוק עוד ברקוד לאותו טיימר (צפי משותף לכל המשימות), או התחל עכשיו'}`;
  const startNow=await showConfirm(T.bc_cart_q_title||'לצרף עוד משימות?',qMsg,T.bc_start_now||'▶ התחל עכשיו',T.bc_add_more||'➕ סרוק עוד');
  if(!startNow){showToast(T.bc_scan_next||'📷 סרוק את הברקוד הבא');document.getElementById('bc-inp').focus();return;}
  await bcStartBatch();
}
function fillDeptSelects(){
  const selDept=LANGS[currentLang].sel_dept||'-- בחר מחלקה --';
  const opts=`<option value="">${selDept}</option>`+S.depts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
  ['bc-dept','mgr-dept','ts-dept'].forEach(id=>{const s=document.getElementById(id);if(s){const prev=s.value;s.innerHTML=opts;if(prev)s.value=prev;}});
}
// "מצטבר קודם" לברקוד — מבוסס על חלון החי (HIST_WINDOW_DAYS). לברקוד עם היסטוריה
// ישנה מהחלון הסכום עלול להיות חלקי; זה מידע-עזר בלבד (לא חישוב שכר/דוח).
function totalBcSecs(bc, workerId){
  return S.histTasks.filter(t=>t.bc===bc&&t.workerId===workerId).reduce((s,t)=>s+(t.duration||0),0);
}
function totalBcSessions(bc, workerId){
  return S.histTasks.filter(t=>t.bc===bc&&t.workerId===workerId).length;
}

function renderScanActive(){
  const T=LANGS[currentLang];
  fillDeptSelects();
  const el=document.getElementById('scan-active');if(!el)return;
  // עובד רגיל רואה רק את המשימות שלו
  const isMgr=S.user?.role==='manager'||S.user?.role==='supervisor';
  const vis=isMgr?S.activeTasks:S.activeTasks.filter(t=>t.workerId===S.user?.id);
  if(!vis.length){el.innerHTML=`<div style="text-align:center;padding:2rem;color:var(--txt3)">📭 ${T.dash_no_active_tasks}</div>`;return;}
  el.innerHTML=vis.slice(0,8).map(t=>`
    <div class="task-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div><div style="font-size:13px;font-weight:500;color:var(--txt)">${esc(t.workerName)}</div><div style="font-size:11px;color:var(--txt3)">${esc(t.dept)}</div></div>
        <span class="badge green"><span class="pulse"></span> ${T.active}</span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <span class="bc-seg bc-c">${t.cust}</span><span class="bc-seg bc-p">${t.prod}</span>${t.size?`<span class="bc-seg bc-s">מידה ${esc(szLblT(t.cust,t.prod,t.size))}</span>`:''}<span class="bc-seg bc-q">${t.qty}</span><span class="bc-seg bc-col">${COLORS[t.col]||t.col}</span>
        ${t.taskType?`<span class="badge gray">📋 ${esc(t.taskType)}</span>`:''}
      </div>
    </div>`).join('');
}

// ─── TASKS ──────────────────────────────────────────────────
// קיבוץ משימות שנפתחו יחד (batchId משותף) = קבוצה אחת: טיימר משותף + מסגרת אחת
function _taskGroups(list){
  const groups=[],byKey={};
  list.forEach(t=>{
    const key=t.batchId?('B:'+t.workerId+'|'+t.batchId):('S:'+t.id);
    if(!byKey[key]){byKey[key]={key,tasks:[]};groups.push(byKey[key]);}
    byKey[key].tasks.push(t);
  });
  return groups;
}
// תזמון קבוצה: elapsed = הטיימר המשותף (מקס'); expected = סכום צפי השלבים
function _groupTiming(tasks){
  const elapsedSec=Math.max(0,...tasks.map(t=>t.elapsed||0));
  let expSec=0,hasExp=false;
  tasks.forEach(t=>{if(+t.expectedMin>0){expSec+=(+t.expectedMin)*60;hasExp=true;}});
  return{elapsedSec,expSec:hasExp?expSec:0,hasExp};
}
// מחלקת צבע לטיימר: חום ב-80% מהצפי, אדום ב-100%+. בלי צפי — נופל לסף הגלובלי (משימה ארוכה)
function _tmrClass(elapsedSec,expSec,threshSec){
  if(expSec>0)return elapsedSec>=expSec?'late':(elapsedSec>=expSec*0.8?'warn':'');
  return elapsedSec>threshSec?'over':'';
}
// ספירה לאחור: כמה זמן נותר עד הצפי, או בכמה חרגנו
function fmtCountdown(remainSec){
  return remainSec>=0?'⏳ '+fmtS(remainSec)+' נותרו':'⏱ +'+fmtS(-remainSec)+' חריגה';
}
// כפתורי פעולה למשימה (מנהל/אחראי)
function _taskActions(t){
  const r=S.user?.role;
  if(r==='manager')return`<button class="btn" style="font-size:11px;padding:3px 8px" onclick="openEditTask('${t.id}')" title="עריכת משימה">✏️</button><button class="btn" style="font-size:11px;padding:3px 8px;color:var(--blue-txt)" onclick="transferTask('${t.id}')" title="העבר לעובד אחר">🔄</button><button class="btn danger" style="font-size:11px;padding:3px 8px;opacity:0.7" onclick="deleteActiveTask('${t.id}')" title="מחק משימה בטעות">🗑</button>`;
  if(r==='supervisor')return`<button class="btn" style="font-size:11px;padding:3px 8px;color:var(--blue-txt)" onclick="transferTask('${t.id}')" title="העבר לעובד אחר">🔄</button>`;
  return'';
}
function _prevTotalHtml(t){
  const prev=totalBcSecs(t.bc,t.workerId),ses=totalBcSessions(t.bc,t.workerId);
  return prev>0?`<div style="font-size:11px;color:var(--txt3);margin-top:4px">📊 סה"כ על מוצר זה: <b>${fmtM(prev)}</b> (${ses} ${ses===1?'יום':'ימים'} קודמים)</div>`:'';
}
function renderTasks(){
  const T=LANGS[currentLang];
  // עובד רגיל רואה רק את המשימות שלו; מנהל/אחראי רואים הכל
  const isMgr=S.user?.role==='manager'||S.user?.role==='supervisor';
  const visActive=isMgr?S.activeTasks:S.activeTasks.filter(t=>t.workerId===S.user?.id);
  const visHist=isMgr?S.histTasks:S.histTasks.filter(t=>t.workerId===S.user?.id);
  document.getElementById('tk-act').textContent=visActive.length;
  document.getElementById('tk-done').textContent=visHist.length;
  document.getElementById('tk-units').textContent=sumUnitsDedup(visHist);
  if(visHist.length){
    const avg=Math.round(visHist.reduce((s,t)=>s+(t.duration||0),0)/visHist.length);
    document.getElementById('tk-avg').textContent=fmtM(avg);
  }else{document.getElementById('tk-avg').textContent='—';}
  const fn=document.getElementById('tk-f-name');if(fn)fn.style.display=isMgr?'':'none';
  const pr=document.getElementById('worker-personal-report');if(pr)pr.style.display=isMgr?'none':'';
  const thresh=S.settings.thresh*60;
  const al=document.getElementById('tk-active-list');
  if(!visActive.length){
    const emptyMsg=isMgr?'📷 '+(T.scan_to_start||'סרוק ברקוד להתחלת משימה'):'⏳ '+(T.no_task_worker||'אין משימה פעילה כרגע — המתן עד שהאחראי יפתח לך משימה');
    al.innerHTML=`<div style="text-align:center;padding:3rem 1rem;color:var(--txt3);font-size:14px">${emptyMsg}</div>`;
  }
  else{let _lastDept=null;const _sg=_tkSortGroups(_taskGroups(visActive),isMgr),_oc={},_dtCache={};
    // ⏱ מוקצב מול בפועל של המחלקה לכל הזמנה שרצה בה עכשיו (_liveOrdDeptTime — בלי קריאות שרת)
    const deptTimeHtml=dept=>{
      const dk=_dTimeKey(dept)||_rl('no_dept'),seen=new Set();let h='';
      _sg.filter(g=>g.dept===dept).forEach(g=>{const t=g.tasks[0],st=taskOrderStamp(t,_oc),key=t.cust+'|'+t.prod+'|'+st;
        if(seen.has(key))return;seen.add(key);(_dtArgs??={})[key]=[t.cust,t.prod,st];
        const r=(_dtCache[key]??=_liveOrdDeptTime(t.cust,t.prod,st))?.rows.find(x=>x.k===dk);if(!r)return;
        h+=`<div data-dtk="${esc(key)}" data-dtd="${esc(dk)}" style="font-size:12px;color:var(--txt2);margin:-2px 0 6px;padding:4px 10px;background:var(--bg2);border-radius:8px">⏱ <span class="bc-seg bc-p">${esc(t.prod)}</span>${taskOrderLbl(t)?' <b style="color:var(--green-txt,#16a34a)">#'+taskOrderLbl(t).replace(/^#/,'')+'</b>':''} · <span class="dt-ln">${_deptTimeLine(r)}</span></div>`;});
      return h;};
    al.innerHTML=_sg.map(g=>{
    // 🏭 כותרת מחלקה (מנהל/אחראי) — לפני הקבוצה הראשונה של כל מחלקה
    const dh=isMgr&&g.dept!==_lastDept?`<div class="sec" style="margin:${_lastDept===null?'0':'14px'} 0 6px;font-size:13px">🏭 ${esc(g.dept||_rl('no_dept'))} <span class="badge gray" style="font-size:10px">${g.cnt}</span></div>${deptTimeHtml(g.dept)}`:'';_lastDept=g.dept;
    return dh+_tkCardHtml(g);}).join('');}
  renderTaskHist();
}
// 🏭 סידור המשימות הפעילות: לפי מחלקה (בסדר הייצור) ← מוצר ← סדר השלב במוצר (workSteps) ← עובד.
// קבוצה (כמה שלבים) ממוקמת לפי השלב המוקדם שבה.
function _tkStepIdx(t){
  const p=t.bc?bcOrderProd(t.bc):findProd(t.cust,t.prod);
  const i=(p?.workSteps||[]).findIndex(s=>stepName(s)===t.taskType);
  return i<0?999:i;
}
function _tkSortGroups(groups,byDept){
  if(!byDept)return groups;
  // סדר הייצור: קבלת סחורה ← תפירה ← אריזה (pipeFamOfDept, כמו sortStepsByDept); בתוך משפחה — לפי השם (1 לפני 2)
  const R={recv:0,sew:1,pack:2},di=d=>{const f=R[pipeFamOfDept(d)];return f==null?3:f;};
  groups.forEach(g=>{g.dept=g.tasks[0].dept||'';g.si=Math.min(...g.tasks.map(_tkStepIdx));});
  const cnt={};groups.forEach(g=>cnt[g.dept]=(cnt[g.dept]||0)+1);groups.forEach(g=>g.cnt=cnt[g.dept]);
  return groups.slice().sort((a,b)=>di(a.dept)-di(b.dept)||a.dept.localeCompare(b.dept,undefined,{numeric:true})
    ||String(a.tasks[0].cust+a.tasks[0].prod).localeCompare(String(b.tasks[0].cust+b.tasks[0].prod))||a.si-b.si||String(a.tasks[0].workerName||'').localeCompare(String(b.tasks[0].workerName||'')));
}
function _tkCardHtml(g){
    const T=LANGS[currentLang],thresh=S.settings.thresh*60;
    const tasks=g.tasks,lead=tasks[0],multi=tasks.length>1;
    const allPaused=tasks.every(t=>t.paused);
    const {elapsedSec,expSec,hasExp}=_groupTiming(tasks);
    const cls=allPaused?'':_tmrClass(elapsedSec,expSec,thresh);
    const ids=tasks.map(t=>t.id).join(',');
    const pausedDate=lead.pausedAt?new Date(lead.pausedAt):null;
    const pausedStr=pausedDate?pad2(pausedDate.getDate())+'/'+pad2(pausedDate.getMonth()+1):null;
    const expLabel=hasExp?`<span style="font-size:11px;color:var(--txt3)">🎯 צפי ${fmtExpMin(expSec/60)}</span>`:'';
    // 🔔 תזכורת ידנית (מנהל בלבד — החלטת המשתמש 27/09) — מוצג רק בחריגה מהצפי; ה-tick מציג/מסתיר בזמן אמת (rmd-<id>)
    const remindBtn=S.user?.role==='manager'&&hasExp&&!allPaused?`<button class="btn" id="rmd-${lead.id}" style="font-size:11px;padding:3px 8px;color:var(--red-txt,#dc2626);${cls==='late'?'':'display:none'}" onclick="remindLateTask('${ids}',this)" title="${T.remind_title||'שלח Push תזכורת לעובד ולאחראי'}">🔔 ${T.remind_btn||'תזכורת'}</button>`:'';
    const statusBadge=(cls==='late'?'<span class="badge" style="background:var(--red-bg,#fee2e2);color:var(--red-txt,#dc2626)">🔴 חריגה מהצפי</span>':cls==='warn'?'<span class="badge amber">🟤 מתקרב לצפי</span>':cls==='over'?'<span class="badge amber">⚠ ארוכה</span>':'')+remindBtn;
    // בלוק טיימרים: ספירה עולה + ספירה לאחור עד הצפי
    const timerBlock=allPaused
      ?`<span class="badge" style="background:var(--blue-bg);color:var(--blue-txt);font-size:11px">⏸ ${fmtM(lead.accumulatedSec||0)}</span>`
      :`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <div class="task-tmr ${cls}" id="tmr-${lead.id}" data-ids="${ids}" data-exp="${expSec}">${fmtS(elapsedSec)}</div>
          ${hasExp?`<div class="task-cd ${cls}" id="cd-${lead.id}">${fmtCountdown(expSec-elapsedSec)}</div>`:''}
        </div>`;
    const prodChips=`<span class="bc-seg bc-c">לקוח ${lead.cust}</span><span class="bc-seg bc-p">${lead.prod}</span>${taskOrderLbl(lead)?`<span class="bc-seg" style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-weight:700">הזמנה ${taskOrderLbl(lead)}</span>`:''}${lead.size?`<span class="bc-seg bc-s">מידה ${esc(szLblT(lead.cust,lead.prod,lead.size))}</span>`:''}<span class="bc-seg bc-q">${lead.qty} יח'</span><span class="bc-seg bc-col">${COLORS[lead.col]||lead.col}</span>`;
    const pausedBadge=allPaused?`<span class="badge" style="background:var(--blue-bg);color:var(--blue-txt)">⏸ ${T.task_paused}${pausedStr?' '+pausedStr:''}</span>`:'';
    const header=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div><div style="font-size:13px;font-weight:500;color:var(--txt)">${esc(lead.workerName)}${multi?` <span class="badge gray" style="font-size:10px">${tasks.length} שלבים</span>`:''}</div><div style="font-size:11px;color:var(--txt3)">${esc(lead.dept)}${lead.station?` · <span style="color:var(--green-txt)">📍 ${esc(lead.station)}</span>`:''}</div></div>
        <div style="display:flex;align-items:center;gap:6px">${timerBlock}${multi?'':_taskActions(lead)}</div>
      </div>`;
    if(!multi){
      // משימה בודדת — כרטיס רגיל
      return`<div class="task-card" style="${allPaused?'opacity:.75;background:var(--hover,#f8f8f8)':''}">
        ${header}
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          ${prodChips}${lead.taskType?`<span class="badge gray">📋 ${esc(lead.taskType)}</span>`:''}${expLabel}${pausedBadge}${statusBadge}
        </div>
        ${_prevTotalHtml(lead)}
      </div>`;
    }
    // קבוצה — מסגרת אחת, טיימר משותף, שורת שלב לכל משימה
    return`<div class="task-card" style="${allPaused?'opacity:.75;background:var(--hover,#f8f8f8)':''}">
      ${header}
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">${prodChips}${expLabel}${pausedBadge}${statusBadge}</div>
      <div class="task-group-stages">
        ${tasks.map(t=>`<div class="task-stage-row">
          <span class="badge gray">📋 ${esc(t.taskType||'—')}</span>
          <span style="font-size:11px;color:var(--txt3)">${t.qty} יח'${t.prod!==lead.prod?' · '+esc(t.prod):''}${taskOrderLbl(t)&&taskOrderLbl(t)!==taskOrderLbl(lead)?' · <b style="color:var(--green-txt,#16a34a)">הזמנה '+taskOrderLbl(t)+'</b>':''}</span>
          ${t.size&&t.size!==lead.size?`<span class="bc-seg bc-s">מידה ${esc(szLblT(t.cust,t.prod,t.size))}</span>`:''}${t.col!==lead.col?`<span class="bc-seg bc-col">${COLORS[t.col]||esc(t.col)}</span>`:''}${t.station&&t.station!==lead.station?`<span style="font-size:11px;color:var(--green-txt)">📍 ${esc(t.station)}</span>`:''}
          <div style="margin-inline-start:auto;display:flex;gap:6px">${_taskActions(t)}</div>
        </div>`).join('')}
      </div>
      ${_prevTotalHtml(lead)}
    </div>`;
}

let _tkHistLimit=20;
// חיפוש מורחב (מעבר לחלון החי של HIST_WINDOW_DAYS) — נשלף לפי דרישה בלבד (ראה loadHistRange),
// כדי לא לייקר כל רינדור של הטאב הזה. _tkHistExtra מצטבר בין חיפושים; _tkHistSearchedKey מונע חיפוש חוזר לאותו סינון.
let _tkHistExtra=[],_tkHistSearchedKey=null,_tkHistSearching=false;
function _tkFilterKey(){
  return['tk-f-name','tk-f-prod','tk-f-type','tk-f-date'].map(id=>(document.getElementById(id)?.value||'').trim().toLowerCase()).join('|');
}
async function searchOlderHist(){
  const fDate=(document.getElementById('tk-f-date')?.value||'').trim();
  _tkHistSearching=true;renderTaskHist();
  const from=fDate||new Date(Date.now()-180*86400000).toISOString().slice(0,10);
  const to=fDate||new Date().toISOString().slice(0,10);
  const extra=await loadHistRange(from,to);
  const seen=new Set(_tkHistExtra.map(t=>t.id));
  extra.forEach(t=>{if(!seen.has(t.id)){_tkHistExtra.push(t);seen.add(t.id);}});
  _tkHistSearchedKey=_tkFilterKey();
  _tkHistSearching=false;renderTaskHist();
}
function renderTaskHist(){
  _tkHistLimit=_tkHistLimit||20;
  const fName=(document.getElementById('tk-f-name')?.value||'').trim().toLowerCase();
  const fProd=(document.getElementById('tk-f-prod')?.value||'').trim().toLowerCase();
  const fType=(document.getElementById('tk-f-type')?.value||'').trim().toLowerCase();
  const fDate=(document.getElementById('tk-f-date')?.value||'').trim();
  const hasFilter=!!(fName||fProd||fType||fDate);
  const isMgr=S.user?.role==='manager'||S.user?.role==='supervisor';
  const src=hasFilter&&_tkHistExtra.length?S.histTasks.concat(_tkHistExtra.filter(t=>!S.histTasks.some(h=>h.id===t.id))):S.histTasks;
  const base=isMgr?src:src.filter(t=>t.workerId===S.user?.id);
  const filtered=base.filter(t=>{
    if(fName&&!t.workerName?.toLowerCase().includes(fName))return false;
    if(fProd&&!String(t.prod||'').toLowerCase().includes(fProd))return false;
    if(fType&&!String(t.taskType||'').toLowerCase().includes(fType))return false;
    if(fDate){const d=new Date(t.startTime).toISOString().slice(0,10);if(d!==fDate)return false;}
    return true;
  });
  // קיבוץ זהה למשימות הפעילות: משימה קבוצתית = כרטיס אחד עם שורת שלב לכל משימה,
  // ולא N שורות נפרדות שנראות כמו N משימות. הקיבוץ כולל את **התאריך** ולא רק batchId,
  // כי צביר שנסגר ביותר מיום אחד מייצר רשומה ליום עם אותו batchId — ומיזוגן היה
  // מציג שני ימים ככרטיס אחד ושובר את סדר התצוגה לפי תאריך.
  const hGroups=_histGroups(filtered);
  const shownG=hGroups.slice(0,_tkHistLimit);
  document.getElementById('tk-hist').innerHTML=shownG.map(g=>_histCardHtml(g.tasks)).join('')||(()=>{
    if(_tkHistSearching)return'<div style="color:var(--txt3);font-size:12px;padding:.75rem 0;text-align:center">🔍 מחפש בהיסטוריה ישנה יותר...</div>';
    if(hasFilter&&_tkHistSearchedKey===_tkFilterKey())return'<div style="color:var(--txt3);font-size:12px;padding:.75rem 0;text-align:center">אין היסטוריה — גם בחיפוש המורחב</div>';
    if(hasFilter)return`<div style="text-align:center;padding:.75rem 0">
      <div style="color:var(--txt3);font-size:12px;margin-bottom:6px">אין היסטוריה ב-14 הימים האחרונים</div>
      <button class="btn" style="font-size:11px;padding:4px 10px" onclick="searchOlderHist()">🔍 חפש גם בהיסטוריה ישנה יותר</button>
    </div>`;
    return'<div style="color:var(--txt3);font-size:12px;padding:.75rem 0;text-align:center">אין היסטוריה עדיין</div>';
  })();
  // המונה נספר ב**כרטיסים** ולא במשימות — אחרת "טען עוד (12 נוספות)" לא תואם
  // למה שנראה על המסך אחרי הקיבוץ.
  const more=document.getElementById('tk-hist-more');
  if(more){
    if(hGroups.length>_tkHistLimit){
      more.innerHTML=`<button class="btn" onclick="_tkHistLimit+=20;renderTaskHist()">טען עוד (${hGroups.length-_tkHistLimit} נוספות)</button>`;
    }else{
      more.innerHTML=filtered.length>0&&filtered.length<base.length?`<div style="font-size:11px;color:var(--txt3)">מוצגות ${filtered.length} תוצאות ב-${hGroups.length} כרטיסים</div>`:'';
    }
  }
}
// ─── קיבוץ ורינדור של כרטיס היסטוריה ─────────────────────────────
// מפתח הקבוצה = עובד + batchId + **תאריך**. ראה ההערה ב-renderTaskHist.
function _histGroups(list){
  const groups=[],byKey={};
  (list||[]).forEach(t=>{
    const d=new Date(t.startTime);
    const day=isNaN(d.getTime())?'?':d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
    const key=t.batchId?('B:'+t.workerId+'|'+t.batchId+'|'+day):('S:'+t.id);
    if(!byKey[key]){byKey[key]={key,tasks:[]};groups.push(byKey[key]);}
    byKey[key].tasks.push(t);
  });
  return groups;
}
// "מצטבר קודם" על הברקוד — **בלי האחים של אותה קבוצה**. לפני הקיבוץ כל שורה בצביר
// ספרה את אחיה כ"משימה קודמת" ולכן הוצג "📊 מצטבר קודם: 39 דק' (1 משימה)" על
// משימה שכלל לא הייתה קודמת, אלא אותה סריקה עצמה.
function _histPrevHtml(tasks){
  const own=new Set(tasks.map(t=>String(t.id)));
  const bcs=new Set(tasks.map(t=>taskBc(t)));
  const wid=tasks[0].workerId;
  const prev=S.histTasks.filter(x=>x.workerId===wid&&bcs.has(taskBc(x))&&!own.has(String(x.id)));
  const tot=prev.reduce((s,x)=>s+(x.duration||0),0);
  const ses=prev.length;
  return ses>0?`<div style="font-size:11px;color:var(--blue-txt)">📊 מצטבר קודם: <b>${fmtM(tot)}</b> (${ses} ${ses===1?'משימה':'משימות'})</div>`:'';
}
// ─── ⏱️ זמן חלוקת עבודה — סריקות שעובד ביצע *עבור אחרים* בתוך חלון משימתו ───
// נמדד 18/09/2026 על 6 ימים (500 משימות עם `scannedBy`): محمد סורק 81% מהמשימות,
// ו-**96% מהסריקות שלו עבור אחרות קורות בתוך חלון של משימה שלו עצמו**. התוצאה:
// 95% ממשימותיו מסומנות ⚠ חריגה — מול 70% אצל שאר העובדות.
// 🔑 **הכיול נמדד ברמת הצביר ולא ברמת המשימה** — בצביר כל השורות חולקות חלון שעון
//    אחד, ולכן רגרסיה פר-משימה סופרת את אותה סריקה פעמיים ומחלקת את המקדם בחצי.
//    ברמת הצביר (42 קבוצות, R²=0.68): **4.34 ± 0.93 דק' לסריקה**, וחציון חסין y/k = 4.14
//    ⇒ ברירת המחדל 4.2. התוצאה: חריגה 39/42 → 22/42, חציון ×1.89 → ×1.09.
//    ⚠️ 5 קבוצות בלי אף סריקה חורגות בחציון 10.7 דק' ⇒ יש גם בעיית תקן, לא רק חלוקה.
// 🛑 מנכים מה**בפועל** ולא מוסיפים ל-`expectedMin` — הצפי נצרב בסריקה ואסור לכתוב עליו.
// 🛑 בספר ה**זמן** הדקות פשוט יוצאות ואינן נזקפות לאף מוצר, כי 53% מהן שייכות למוצר
//    אחר מזה שהעובד עמד עליו. רק בספר ה**כסף** הן הולכות למוצר שנסרק.
// 🛑 גנרי לכל עובד, לא רק ל-role=supervisor — מי שלא סורק עבור אחרים מקבל 0.
//    scanMinPerTask=0 מכבה את המנגנון לגמרי.
const SCAN_MIN_DEFAULT=4.2;
function scanMinPer(){const v=S.costs?.scanMinPerTask;return (v===0||v==='0')?0:((+v>0)?+v:SCAN_MIN_DEFAULT);}
let _scanIdx=null,_scanIdxKey='';
// מפתח: workerId → חותמות הזמן של הסריקות שביצע עבור אחרים, ממוינות
function _scanIndex(){
  const key=(S.histTasks?.length||0)+'_'+(S.activeTasks?.length||0);
  if(_scanIdx&&_scanIdxKey===key)return _scanIdx;
  const m={};
  const add=t=>{const by=t.scannedBy;
    if(!by||by===t.workerId)return;                 // סריקה לעצמו אינה חלוקת עבודה
    const ms=+new Date(t.startTime);if(!ms)return;
    (m[by]=m[by]||[]).push(ms);};
  (S.histTasks||[]).forEach(add);(S.activeTasks||[]).forEach(add);
  Object.keys(m).forEach(k=>m[k].sort((a,b)=>a-b));
  _scanIdx=m;_scanIdxKey=key;return m;
}
// מס' הסריקות שבעל המשימה ביצע עבור אחרים בתוך חלון המשימה
function scanCountIn(t,fromMs,toMs){
  if(!t||!t.workerId||!scanMinPer())return 0;
  const a=_scanIndex()[t.workerId];if(!a||!a.length)return 0;
  const s=fromMs!=null?fromMs:+new Date(t.startTime);if(!s)return 0;
  const e=toMs!=null?toMs:(t.endTime?+new Date(t.endTime):Date.now());
  if(!(e>=s))return 0;
  let n=0;for(let i=0;i<a.length;i++){if(a[i]<s)continue;if(a[i]>e)break;n++;}
  return n;
}
// השניות שיש לנכות מהבפועל לפני השוואה לצפי. בלי צפי — אין מה להשוות ואין ניכוי.
// לעולם לא יותר מאורך המשימה עצמה, אחרת הבפועל היה יוצא שלילי.
function scanDeductSec(t,durSec){
  if(!t||!(+t.expectedMin>0))return 0;
  const n=scanCountIn(t);if(!n)return 0;
  const dur=durSec!=null?durSec:(t.endTime?(t.duration||0):(t.elapsed||0));
  return Math.min(n*scanMinPer()*60,Math.max(0,+dur||0));
}
// צביר: החלון הוא איחוד כל השורות, אחרת אותה סריקה נספרת פעם לכל שלב בקבוצה
function scanDeductSecGroup(tasks,durSec){
  if(!tasks||!tasks.length)return 0;
  if(!tasks.some(t=>+t.expectedMin>0))return 0;
  const st=Math.min(...tasks.map(t=>+new Date(t.startTime)||Infinity));
  const ends=tasks.map(t=>t.endTime?+new Date(t.endTime):0).filter(Boolean);
  const en=ends.length?Math.max(...ends):Date.now();
  const n=scanCountIn(tasks[0],st,en);if(!n)return 0;
  return Math.min(n*scanMinPer()*60,Math.max(0,+durSec||0));
}
// תג ההפרש מול הצפי — נקודה משותפת יחידה להיסטוריה ולדוח הפירוט.
// עד 10/08 הוצג רק המשך בפועל, וצבע אדום/כחול אמר *אם* הייתה חריגה אבל לא *בכמה*;
// ההפרש היה קבור ב-title, שלא נגיש בנייד. ▲/▼ בעקבות אותה מוסכמה בדוח הרווח.
// expSec=0 (בלי תמחור / "כמות פתוחה") ⇒ מחזיר מחרוזת ריקה, בדיוק כמו קודם.
// מפת ניכוי פר-משימה על פני רשימה. 🛑 מקבץ לפי `batchId` — בלי זה אותה סריקה
// הייתה מנוכה פעם לכל שלב בצביר, כי כל השלבים חולקים את אותו חלון זמן.
// החלון = איחוד הצביר, והניכוי מתחלק **רק בין השורות שיש להן צפי**, לפי משך.
function scanDeductMap(list){
  const out={};
  if(!scanMinPer())return out;
  const g={};
  (list||[]).forEach(t=>{const k=t.batchId?('b:'+t.batchId):('t:'+t.id);(g[k]=g[k]||[]).push(t);});
  const durOf=t=>t.endTime?(t.duration||0):(t.elapsed||0);
  Object.keys(g).forEach(k=>{
    const arr=g[k];
    const ded=scanDeductSecGroup(arr,arr.reduce((s,t)=>s+durOf(t),0));
    if(ded<=0)return;
    const withExp=arr.filter(t=>+t.expectedMin>0);
    const tot=withExp.reduce((s,t)=>s+durOf(t),0);
    if(!withExp.length)return;
    withExp.forEach(t=>{out[t.id]=tot>0?ded*(durOf(t)/tot):ded/withExp.length;});
  });
  return out;
}
// ⏱️ `deductSec` — דקות חלוקת העבודה שיוצאות מהבפועל לפני ההשוואה (ראה scanDeductSec).
//    השעון עצמו נשאר אמיתי בתצוגה; רק ההשוואה מתוקנת, והניכוי מוצג במפורש.
function _expOver(durSec,expSec,deductSec){
  return (+expSec>0)&&(Math.max(0,(+durSec||0)-Math.max(0,+deductSec||0))>(+expSec));
}
function _expDeltaBadge(durSec,expSec,small,deductSec){
  if(!(+expSec>0))return'';
  const ded=Math.max(0,+deductSec||0);
  const net=Math.max(0,(+durSec||0)-ded);
  const diff=net-(+expSec);
  const dm=Math.round(Math.abs(diff)/60);
  const stl=`font-size:${small?9:10}px;font-weight:700`;
  const base=`צפי ${fmtM(expSec)} · בפועל ${fmtM(durSec)}`+(ded?` · פחות ${fmtM(ded)} חלוקת עבודה ⇒ ${fmtM(net)} נטו`:'');
  const chip=ded?`<span class="badge gray" style="${stl}" title="${esc(base)}">⇄ ${fmtM(net)} נטו</span>`:'';
  // פחות מחצי דקה לכל כיוון — "▲ 0" היה רעש; מציגים שהיא בול על הצפי.
  if(dm===0)return chip+`<span class="badge gray" style="${stl}" title="${esc(base)}">≈ צפי</span>`;
  const over=diff>0;
  const pct=Math.round(Math.abs(diff)/(+expSec)*100);
  return chip+`<span class="badge ${over?'red':'green'}" style="${stl}" title="${esc(base)} · ${over?'חריגה':'חיסכון'} ${dm} ${"דק'"} (${pct}%)">${over?'▲':'▼'} ${dm}</span>`;
}
function _histCardHtml(tasks){
  const lead=tasks[0],multi=tasks.length>1;
  const isMgr=S.user?.role==='manager'||S.user?.role==='supervisor';
  const st=new Date(lead.startTime);
  // הצביר נסגר יחד, אבל שעת הסיום נלקחת כמאוחרת ביותר למקרה של סטייה במילישניות
  const ends=tasks.map(t=>t.endTime?new Date(t.endTime).getTime():0).filter(Boolean);
  const et=ends.length?new Date(Math.max(...ends)):null;
  const stStr=pad2(st.getHours())+':'+pad2(st.getMinutes());
  const etStr=et?pad2(et.getHours())+':'+pad2(et.getMinutes()):'—';
  const dateStr=pad2(st.getDate())+'/'+pad2(st.getMonth()+1)+'/'+st.getFullYear();
  // משך הקבוצה = סכום השורות. closeBatchProportional כבר חילק את השעון המשותף
  // לפי כמות, ולכן הסכום הוא חלון העבודה האמיתי ולא כפל שלו.
  const totDur=tasks.reduce((s,t)=>s+(t.duration||0),0);
  const totExp=tasks.reduce((s,t)=>s+((+t.expectedMin>0)?(+t.expectedMin)*60:0),0);
  const totDed=scanDeductSecGroup(tasks,totDur);
  const over=_expOver(totDur,totExp,totDed);
  // משימה שחודשה מיום קודם: startTime הוא שעת החידוש, לכן מציגים גם את ההתחלה האמיתית
  const _osT=tasks.find(t=>t.origStart&&!isNaN(new Date(t.origStart).getTime()));
  const _os=_osT?new Date(_osT.origStart):null;
  const _multiDay=_os&&(_os.getDate()!==st.getDate()||_os.getMonth()!==st.getMonth()||_os.getFullYear()!==st.getFullYear());
  const acts=t=>isMgr?`<button class="btn" style="font-size:11px;padding:3px 8px" onclick="openEditTask('${escj(String(t.id))}',true)" title="עריכה">✏️</button><button class="btn" style="font-size:11px;padding:3px 8px;background:#dcfce7;color:#16a34a" onclick="restoreHistTask('${escj(String(t.id))}')" title="החזר למשימות פעילות">♻️</button><button class="btn" style="font-size:11px;padding:3px 8px;background:var(--red-bg,#fee2e2);color:var(--red-txt,#dc2626)" onclick="deleteHistTask('${escj(String(t.id))}')" title="מחיקה">🗑️</button>`:'';
  const qtyHtml=q=>q===0?'<span style="color:#d97706;font-weight:700">⏳ כמות פתוחה</span>':q+" יח'";
  const meta=`${dateStr} | לקוח ${esc(lead.cust)} | ${esc(lead.prod)}${taskOrderLbl(lead)?' <b style="color:var(--green-txt,#16a34a)">'+taskOrderLbl(lead)+'</b>':''}${lead.size?' | מידה '+esc(lead.size):''} | ${qtyHtml(lead.qty)}${lead.isTotal?' | <span style="color:#059669;font-weight:700">📦 כל הכמות</span>':' | '+esc(COLORS[lead.col]||lead.col)}`;
  const times=`<div style="font-size:11px;color:var(--txt3)">▶ ${stStr} → ◀ ${etStr}${isMgr?closeInfoHtml(lead):''}${_multiDay?` <span style="color:#d97706;font-weight:600" title="המשימה נמשכה מיום קודם — הזמן שנצבר כלול במשך">📅 התחילה ${pad2(_os.getDate())}/${pad2(_os.getMonth()+1)} ${pad2(_os.getHours())}:${pad2(_os.getMinutes())}</span>`:''}</div>`;
  const durBadge=`<span class="badge ${over?'red':'blue'}">${over?'⚠ ':''}${fmtM(totDur)}</span>${_expDeltaBadge(totDur,totExp,false,totDed)}`;
  if(!multi){
    // משימה בודדת — בדיוק הפריסה הישנה, בלי רגרסיה
    return`<div class="row">
      <div style="flex:1"><div style="font-size:12px;font-weight:500;color:var(--txt)">${esc(lead.workerName)}</div>
      <div style="font-size:11px;color:var(--txt3)">${meta}${lead.taskType?' | 📋 '+esc(lead.taskType):''}${lead.station?' | <span style="color:var(--green-txt)">📍 '+esc(lead.station)+'</span>':''}</div>
      ${times}
      ${_histPrevHtml(tasks)}
      </div>
      <div style="display:flex;align-items:center;gap:6px">${durBadge}${acts(lead)}</div>
    </div>`;
  }
  // קבוצה — מסגרת אחת ושורת שלב לכל משימה, באותו סגנון של הכרטיס הפעיל
  return`<div class="row" style="flex-direction:column;align-items:stretch;gap:4px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--txt)">${esc(lead.workerName)} <span class="badge gray" style="font-size:10px">${tasks.length} שלבים</span></div>
        <div style="font-size:11px;color:var(--txt3)">${meta}${lead.station?' | <span style="color:var(--green-txt)">📍 '+esc(lead.station)+'</span>':''}</div>
        ${times}
      </div>
      <div style="display:flex;align-items:center;gap:6px">${durBadge}</div>
    </div>
    <div class="task-group-stages">
      ${tasks.map(t=>{
        const tExp=(+t.expectedMin>0)?(+t.expectedMin)*60:0;
        const tDed=totDur>0?totDed*((t.duration||0)/totDur):0;
        const tOver=_expOver(t.duration||0,tExp,tDed);
        return`<div class="task-stage-row">
        <span class="badge gray">📋 ${esc(t.taskType||'—')}</span>
        <span style="font-size:11px;color:var(--txt3)">${qtyHtml(t.qty)}${t.prod!==lead.prod?' · '+esc(t.prod):''}</span>
        ${t.size&&t.size!==lead.size?`<span class="bc-seg bc-s">מידה ${esc(szLblT(t.cust,t.prod,t.size))}</span>`:''}${t.col!==lead.col?`<span class="bc-seg bc-col">${esc(COLORS[t.col]||t.col)}</span>`:''}${t.station&&t.station!==lead.station?`<span style="font-size:11px;color:var(--green-txt)">📍 ${esc(t.station)}</span>`:''}
        <span class="badge ${tOver?'red':'blue'}" style="font-size:10px">${tOver?'⚠ ':''}${fmtM(t.duration||0)}</span>${_expDeltaBadge(t.duration||0,tExp,true,tDed)}
        <div style="margin-inline-start:auto;display:flex;gap:6px">${acts(t)}</div>
      </div>`;}).join('')}
    </div>
    ${_histPrevHtml(tasks)}
  </div>`;
}

// ─── KIOSK / מסך תצוגה גדול ──────────────────────────────────
// לוח מסך-מלא למסך גדול במפעל: כל המשימות הפעילות בכרטיסים גדולים, טיימר חי,
// צפי + ספירה לאחור, צבע לפי חריגה. מתעדכן בזמן אמת (renderAll + tick 1 שנ').
let _kioskOpen=false;
function _kioskCls(cls){return cls==='late'?'k-late':(cls==='warn'||cls==='over')?'k-warn':'k-ok';}
function openKiosk(){
  if(!document.getElementById('kiosk-screen'))buildKioskDom();
  const T=LANGS[currentLang];
  const scr=document.getElementById('kiosk-screen');
  document.querySelector('#kiosk-bar .kiosk-brand').textContent=T.kiosk_title||'📺 מסך תצוגה — משימות פעילות';
  document.getElementById('kiosk-exit').textContent=T.kiosk_exit||'✕ יציאה';
  _kioskOpen=true;
  scr.style.display='flex';
  renderKiosk();
  try{scr.requestFullscreen&&scr.requestFullscreen();}catch(e){}
  startKioskScroll();
}
function closeKiosk(){
  _kioskOpen=false;
  stopKioskScroll();
  const scr=document.getElementById('kiosk-screen');if(scr)scr.style.display='none';
  try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}
}
function buildKioskDom(){
  injectKioskCss();
  const d=document.createElement('div');
  d.id='kiosk-screen';d.style.display='none';
  d.innerHTML=`<div id="kiosk-bar">
      <div class="kiosk-brand"></div>
      <div class="kiosk-stats">
        <span id="kiosk-count" class="k-stat">0</span>
        <span id="kiosk-over" class="k-stat">0</span>
        <span id="kiosk-clock" class="k-clock">00:00:00</span>
      </div>
      <button id="kiosk-exit" onclick="closeKiosk()">✕</button>
    </div>
    <div id="kiosk-grid"></div>`;
  document.body.appendChild(d);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_kioskOpen)closeKiosk();});
  const g=document.getElementById('kiosk-grid');
  if(g){g.addEventListener('mouseenter',()=>_kioskHover=true);g.addEventListener('mouseleave',()=>_kioskHover=false);}
}
function renderKiosk(){
  if(!_kioskOpen)return;
  const grid=document.getElementById('kiosk-grid');if(!grid)return;
  const T=LANGS[currentLang];
  const thresh=S.settings.thresh*60;
  const groups=_taskGroups(S.activeTasks);
  if(!groups.length){grid.innerHTML=`<div class="kiosk-empty">🟢 ${T.kiosk_none||'אין משימות פעילות כרגע'}</div>`;updateKioskStats(0,0);return;}
  const dm=_kioskStepDone(); // נבנה פעם אחת לרינדור — לא פר כרטיס
  grid.innerHTML=groups.map(g=>{
    const tasks=g.tasks,lead=tasks[0],multi=tasks.length>1;
    const allPaused=tasks.every(t=>t.paused);
    const {elapsedSec,expSec,hasExp}=_groupTiming(tasks);
    const cls=allPaused?'':_tmrClass(elapsedSec,expSec,thresh);
    const kcls=allPaused?'k-paused':_kioskCls(cls);
    const ids=tasks.map(t=>t.id).join(',');
    const chips=`<span class="k-chip">לקוח ${lead.cust}</span><span class="k-chip k-p">${esc(lead.prod)}</span>${taskOrderLbl(lead)?`<span class="k-chip">${taskOrderLbl(lead)}</span>`:''}${lead.size?`<span class="k-chip k-s">מידה ${esc(szLblT(lead.cust,lead.prod,lead.size))}</span>`:''}<span class="k-chip k-q">${lead.qty} יח'</span><span class="k-chip k-col">${COLORS[lead.col]||esc(lead.col)}</span>`;
    const stepTasks=multi?tasks:(lead.taskType?[lead]:[]);
    const steps=stepTasks.length?`<div class="k-steps">${stepTasks.map(t=>_kStepRow(t,dm)).join('')}</div>`:'';
    const exp=hasExp?`<div class="k-exp">🎯 צפי ${fmtExpMin(expSec/60)}</div>`:'';
    const timer=allPaused
      ?`<div class="k-tmr k-tmr-paused">⏸ ${fmtS(lead.accumulatedSec||0)}</div>`
      :`<div class="k-tmr kiosk-tmr" data-ids="${ids}" data-exp="${expSec}" data-lead="${lead.id}">${fmtS(elapsedSec)}</div>${hasExp?`<div class="k-cd" id="kcd-${lead.id}">${fmtCountdown(expSec-elapsedSec)}</div>`:''}`;
    return`<div class="kiosk-card ${kcls}" id="kcard-${lead.id}">
      <div class="k-head"><div class="k-worker">${esc(lead.workerName)}</div><div class="k-dept">${esc(lead.dept||'')}${multi?` · ${tasks.length} שלבים`:''}${lead.station?`<div class="k-stn">📍 ${esc(lead.station)}</div>`:''}</div></div>
      <div class="k-chips">${chips}</div>
      ${steps}
      <div class="k-timerwrap">${timer}</div>
      ${exp}
    </div>`;
  }).join('')+_kioskProdPanel(dm);
  kioskTick();
}
// ─── כמות שהושלמה לפי שלב עבודה — במסך התצוגה ────────────────
// ⚠️ מבוסס על S.histTasks בלבד = החלון החי בזיכרון (HIST_WINDOW_DAYS=14 יום), אפס קריאות
// Firestore נוספות. מכוון: הלוח רץ כל היום ומתרנדר בכל שינוי נתונים — שליפת היסטוריה מלאה
// כאן (כמו בדוח buildStepQtyReport) הייתה עולה מאות אלפי קריאות ביום. אותה החלטה שהתקבלה
// ל"מצטבר קודם" בסורק. המשמעות: הזמנה שרצה מעל 14 יום תוצג כאן נמוך מהדוח שבלשונית דוחות.
// ⚠️ המפה **פר-הזמנה** (לקוח|מוצר|שלב|חותמת) — כל קריאה חייבת את חותמת ההזמנה של המשימה.
// stepDoneKey בן 3 ארגומנטים מחזיר undefined לכל שלב ומאפס את הלוח כולו בלי שום שגיאה.
// עד 15/09 הלוח כיווץ לרמת הדגם ("ההזמנה החדשה ביותר") — ולכן לא חשף את באג bcOrderStamp.
function _kioskStepDone(){return stepDoneMap(S.histTasks);}
// רשומת ההזמנה לפי חותמת. אין התאמה ⇒ החדשה ביותר, כמו קודם.
function prodByStamp(cust,prod,stamp){
  return (S.products||[]).find(p=>p&&p.cust===cust&&p.prod===prod&&prodStampOf(p)===stamp)||findProd(cust,prod);
}
function _kProgHtml(done,total){
  if(!total)return `<span class="k-progtxt">${done}</span>`;
  const pct=Math.min(100,Math.round(done/total*100));
  return `<span class="k-prog"><span class="k-progbar"><i class="${pct>=100?'k-full':''}" style="width:${pct}%"></i></span><span class="k-progtxt">${done}/${total}</span></span>`;
}
function _kStepRow(t,dm){
  const stamp=taskOrderStamp(t),p=prodByStamp(t.cust,t.prod,stamp);
  const done=dm[stepDoneKey(t.cust,t.prod,t.taskType,stamp)]||0;
  const total=(p&&_prodQty(p))||getTotalQty(t.cust,t.prod,orderNoOf(t.bc||''));
  return `<div class="k-steprow"><span class="k-step">📋 ${esc(t.taskType||'—')}</span>${_kProgHtml(done,total)}</div>`;
}
// רשימת שלבי מוצר לתצוגה = איחוד של שלבי התמחור (כולל כאלה שטרם התחילו) עם כל שלב שנסרק
// בפועל להזמנה הנוכחית. מוצר בלי workSteps מוגדרים (כמו 05345/05132) עדיין מוצג — לפי מה
// שנסרק — במקום להיעלם מהפאנל בשקט.
function _prodStepList(cust,prod,p,stamp){
  const out=[],seen=new Set();
  const add=nm=>{const k=String(nm||'').trim();if(!k||seen.has(k))return;seen.add(k);out.push(k);};
  (p?.workSteps||[]).forEach(s=>add(stepName(s)));
  if(stamp==null)stamp=prodStampFor(cust,prod);
  for(const t of S.histTasks){
    if(t.cust!==cust||t.prod!==prod)continue;
    {const ts=taskStampOf(t);if(ts!=null&&stamp&&ts!==stamp)continue;} // הזמנה קודמת — ראה stepDoneMap
    add(t.taskType);
  }
  for(const t of S.activeTasks)if(t.cust===cust&&t.prod===prod){const ts=taskStampOf(t);if(ts==null||!stamp||ts===stamp)add(t.taskType);}
  return out;
}
// פאנל מסכם: כל מוצר שיש לו עכשיו משימה פעילה — עם כל שלבי העבודה שלו וההתקדמות.
// נכנס כפריט ברוחב מלא בתוך #kiosk-grid כדי שהגלילה האוטומטית תכסה אותו כמו שאר הכרטיסים.
function _kioskProdPanel(dm){
  const T=LANGS[currentLang];
  const seen=new Set(),blocks=[];
  for(const t of S.activeTasks){
    // כרטיס לכל **הזמנה** פעילה — אותו דגם רץ לפעמים בכמה הזמנות במקביל (04335: #002 + #003)
    const stamp=taskOrderStamp(t);
    const key=t.cust+'|'+t.prod+'|'+stamp;
    if(seen.has(key))continue;seen.add(key);
    const p=prodByStamp(t.cust,t.prod,stamp);
    const steps=_prodStepList(t.cust,t.prod,p,stamp);
    if(!steps.length)continue;
    const total=(p&&_prodQty(p))||getTotalQty(t.cust,t.prod,orderNoOf(t.bc||''));
    blocks.push(`<div class="k-pp-card">
      <div class="k-pp-head"><span class="k-chip">${T.kiosk_cust||'לקוח'} ${esc(t.cust)}</span><span class="k-chip k-p">${esc(t.prod)}</span>${p?.name?`<span class="k-pp-nm">${esc(p.name)}</span>`:''}${total?`<span class="k-pp-tot">${total} ${T.kiosk_units||"יח'"}</span>`:''}</div>
      <div class="k-pp-steps">${steps.map(nm=>{
        const done=dm[stepDoneKey(t.cust,t.prod,nm,stamp)]||0;
        return `<div class="k-pp-row"><span class="k-pp-step">${esc(nm)}</span>${_kProgHtml(done,total)}</div>`;
      }).join('')}</div>
      ${(()=>{ // ⏱ מוקצב מול בפועל לפי מחלקה — אותו חישוב כמו בלשונית משימות (בלי קריאות שרת)
        const dt=_liveOrdDeptTime(t.cust,t.prod,stamp);if(!dt||!dt.rows.length)return'';
        return`<div class="k-pp-dt"><div class="k-pp-row"><span class="k-dt-v" style="font-size:12px">⏱ ${_rl('planned')} / <b>${_rl('actual')}</b></span></div>${dt.rows.map(r=>{const l=r.plan-r.act;
          return`<div class="k-pp-row"><span class="k-pp-step">🏭 ${esc(r.k)}</span><span class="k-dt-v">${r.plan>0?fmtExpMin(r.plan):'—'} / <b>${r.act>0?fmtExpMin(r.act):'—'}</b>${r.plan>0?` <b class="${l<0?'k-dt-over':'k-dt-ok'}">${_rl(l<0?'over':'left')} ${fmtExpMin(Math.abs(l))}</b>`:''}</span></div>`;}).join('')}</div>`;
      })()}
    </div>`);
  }
  if(!blocks.length)return '';
  return `<div class="kiosk-prodpanel">
    <div class="k-pp-title">📊 ${T.kiosk_prod_progress||'התקדמות מוצרים פעילים'}<span class="k-pp-note">${T.kiosk_prog_note||'14 הימים האחרונים'}</span></div>
    <div class="k-pp-grid">${blocks.join('')}</div>
  </div>`;
}
function updateKioskStats(active,over){
  const T=LANGS[currentLang];
  const a=document.getElementById('kiosk-count');if(a)a.textContent=active+' '+(T.kiosk_active||'פעילות');
  const o=document.getElementById('kiosk-over');if(o){o.textContent=over+' '+(T.kiosk_over||'חריגות');o.classList.toggle('k-has-over',over>0);}
}
function kioskTick(){
  if(!_kioskOpen)return;
  const now=new Date();
  const ck=document.getElementById('kiosk-clock');if(ck)ck.textContent=pad2(now.getHours())+':'+pad2(now.getMinutes())+':'+pad2(now.getSeconds());
  const thresh=S.settings.thresh*60;
  let over=0;
  document.querySelectorAll('.kiosk-tmr[data-ids]').forEach(el=>{
    const gts=el.dataset.ids.split(',').map(id=>S.activeTasks.find(t=>t.id===id)).filter(Boolean);
    if(!gts.length)return;
    const elapsedSec=Math.max(0,...gts.map(t=>t.elapsed||0));
    const expSec=+el.dataset.exp||0;
    const cls=_tmrClass(elapsedSec,expSec,thresh);
    el.textContent=fmtS(elapsedSec);
    const cd=document.getElementById('kcd-'+el.dataset.lead);
    if(cd)cd.textContent=fmtCountdown(expSec-elapsedSec);
    const card=document.getElementById('kcard-'+el.dataset.lead);
    if(card)card.className='kiosk-card '+_kioskCls(cls);
    if(cls==='late')over++;
  });
  updateKioskStats(document.querySelectorAll('.kiosk-card').length,over);
}
// ─── גלילה אוטומטית ללוח התצוגה ─────────────────────────────
// גולל למטה לאט → משהה בתחתית → חוזר למעלה → משהה למעלה → חוזר חלילה.
// אם הכל נכנס במסך (אין גלישה) — לא גולל. עצירה בזמן ריחוף עכבר (לקריאה).
let _kioskScrollTimer=null,_kioskScrollSt=null,_kioskHover=false;
const _KS_INT=33,_KS_DOWN=1,_KS_UP=5,_KS_PAUSE_TOP=90,_KS_PAUSE_BOT=120; // ~30px/ש' מטה, השהיה ~3ש'/4ש'
function startKioskScroll(){
  stopKioskScroll();
  _kioskScrollSt={phase:'pauseTop',t:0};
  _kioskScrollTimer=setInterval(()=>{
    if(!_kioskOpen){stopKioskScroll();return;}
    const g=document.getElementById('kiosk-grid');if(!g||_kioskHover)return;
    const max=g.scrollHeight-g.clientHeight;
    if(max<=4){g.scrollTop=0;return;} // הכל נכנס במסך — אין צורך לגלול
    const st=_kioskScrollSt;
    switch(st.phase){
      case 'pauseTop':  if(++st.t>=_KS_PAUSE_TOP){st.phase='down';} break;
      case 'down':      g.scrollTop=Math.min(max,g.scrollTop+_KS_DOWN); if(g.scrollTop>=max-1){st.phase='pauseBot';st.t=0;} break;
      case 'pauseBot':  if(++st.t>=_KS_PAUSE_BOT){st.phase='up';} break;
      case 'up':        g.scrollTop=Math.max(0,g.scrollTop-_KS_UP); if(g.scrollTop<=1){st.phase='pauseTop';st.t=0;} break;
    }
  },_KS_INT);
}
function stopKioskScroll(){if(_kioskScrollTimer){clearInterval(_kioskScrollTimer);_kioskScrollTimer=null;}}
function injectKioskCss(){
  if(document.getElementById('kiosk-css'))return;
  const s=document.createElement('style');s.id='kiosk-css';
  s.textContent=`
  #kiosk-screen{position:fixed;inset:0;z-index:9999;background:#0f172a;color:#e2e8f0;display:flex;flex-direction:column;direction:rtl;font-family:inherit}
  #kiosk-bar{display:flex;align-items:center;gap:16px;padding:14px 22px;background:#1e293b;border-bottom:2px solid #334155;flex-wrap:wrap}
  .kiosk-brand{font-size:24px;font-weight:800;color:#fff;flex:1}
  .kiosk-stats{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:700}
  .k-stat{background:#334155;padding:6px 14px;border-radius:10px;font-variant-numeric:tabular-nums}
  #kiosk-over.k-has-over{background:#dc2626;color:#fff;animation:kpulse 1.2s infinite}
  .k-clock{color:#38bdf8;font-variant-numeric:tabular-nums}
  #kiosk-exit{background:#475569;color:#fff;border:none;border-radius:10px;padding:8px 18px;font-size:17px;font-weight:700;cursor:pointer}
  #kiosk-exit:hover{background:#64748b}
  #kiosk-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:18px;align-content:start}
  .kiosk-card{background:#1e293b;border-radius:16px;padding:16px 18px;border:3px solid #334155;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 14px rgba(0,0,0,.35)}
  .kiosk-card.k-ok{border-color:#22c55e}
  .kiosk-card.k-warn{border-color:#f59e0b;background:#2a2410}
  .kiosk-card.k-late{border-color:#ef4444;background:#2a1414;animation:kpulse 1.4s infinite}
  .kiosk-card.k-paused{border-color:#475569;opacity:.6}
  .k-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .k-worker{font-size:26px;font-weight:800;color:#fff;line-height:1.1}
  .k-dept{font-size:14px;color:#94a3b8;text-align:end}
  .k-stn{font-size:15px;font-weight:700;color:#4ade80;margin-top:2px}
  .k-chips{display:flex;flex-wrap:wrap;gap:6px}
  .k-chip{font-size:15px;font-weight:700;padding:3px 10px;border-radius:8px;background:#334155;color:#e2e8f0;font-variant-numeric:tabular-nums}
  .k-chip.k-p{background:#0ea5e9;color:#fff}
  .k-chip.k-s{background:#6366f1;color:#fff}
  .k-chip.k-col{background:#475569}
  .k-steps{display:flex;flex-direction:column;gap:5px}
  .k-steprow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .k-step{font-size:15px;font-weight:700;padding:3px 10px;border-radius:8px;background:#3730a3;color:#e0e7ff}
  .k-prog{display:flex;align-items:center;gap:7px;flex:1;min-width:96px}
  .k-progbar{flex:1;min-width:44px;height:7px;background:#334155;border-radius:4px;overflow:hidden}
  .k-progbar i{display:block;height:100%;background:#38bdf8;border-radius:4px;transition:width .3s}
  .k-progbar i.k-full{background:#22c55e}
  .k-progtxt{font-size:14px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums;white-space:nowrap}
  .k-timerwrap{margin-top:4px}
  .k-tmr{font-size:46px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff;line-height:1.05}
  .kiosk-card.k-warn .k-tmr{color:#fbbf24}
  .kiosk-card.k-late .k-tmr{color:#f87171}
  .k-tmr-paused{color:#94a3b8;font-size:34px}
  .k-cd{font-size:17px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}
  .kiosk-card.k-late .k-cd{color:#fca5a5}
  .k-exp{font-size:14px;color:#94a3b8}
  .kiosk-empty{grid-column:1/-1;text-align:center;font-size:28px;color:#64748b;padding:60px}
  .kiosk-prodpanel{grid-column:1/-1;margin-top:6px;border-top:2px solid #334155;padding-top:14px}
  .k-pp-title{display:flex;align-items:baseline;gap:10px;font-size:22px;font-weight:800;color:#fff;margin-bottom:12px}
  .k-pp-note{font-size:14px;font-weight:600;color:#64748b}
  .k-pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
  .k-pp-card{background:#1e293b;border:2px solid #334155;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:9px}
  .k-pp-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
  .k-pp-nm{font-size:14px;color:#cbd5e1}
  .k-pp-tot{font-size:14px;font-weight:700;color:#94a3b8;margin-inline-start:auto;font-variant-numeric:tabular-nums}
  .k-pp-steps{display:flex;flex-direction:column;gap:7px}
  .k-pp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .k-pp-step{font-size:15px;color:#e2e8f0}
  .k-pp-dt{margin-top:8px;padding-top:6px;border-top:1px solid #334155;display:flex;flex-direction:column;gap:3px}
  .k-dt-v{font-size:14px;color:#94a3b8;margin-inline-start:auto;white-space:nowrap}.k-dt-v b{color:#e2e8f0}
  .k-dt-v .k-dt-over{color:#f87171}.k-dt-v .k-dt-ok{color:#4ade80}
  @keyframes kpulse{0%,100%{opacity:1}50%{opacity:.55}}`;
  document.head.appendChild(s);
}

// ⏱ (08/11/2026) רענון "מוקצב מול בפועל" פעם בדקה — בלי זה השורה זזה רק כשמגיע שינוי מהשרת (סריקה/סגירה),
// ובזמן שקט נשארת קפואה. לשונית משימות: רק שורות המחלקה (data-dtk/data-dtd) — לא כל הרשימה. מסך תצוגה: renderKiosk.
// אפס קריאות Firestore (S.histTasks + S.activeTasks בזיכרון). _dtArgs = [לקוח,מוצר,stamp] לפי מפתח (stamp יכול להיות null).
var _dtArgs=_dtArgs||{}; // var: renderTasks יכול לרוץ לפני השורה הזאת (TDZ)
setInterval(()=>{
  if(document.hidden)return;
  try{
    if(typeof _kioskOpen!=='undefined'&&_kioskOpen){renderKiosk();return;}
    const els=document.querySelectorAll('#page-tasks.active [data-dtk]');if(!els.length)return;
    const c={};els.forEach(el=>{const k=el.dataset.dtk,a=_dtArgs[k];if(!a)return;
      const r=(c[k]??=_liveOrdDeptTime(...a))?.rows.find(x=>x.k===el.dataset.dtd);
      const ln=el.querySelector('.dt-ln');if(r&&ln)ln.innerHTML=_deptTimeLine(r);});
  }catch(e){console.error('dept time refresh:',e);}
},60000);
// ─── TIMER TICK ─────────────────────────────────────────────
setInterval(()=>{
  if(document.hidden)return;
  const thresh=S.settings.thresh*60;
  S.activeTasks.forEach(t=>{
    if(t.paused)return;
    t.elapsed=(t.accumulatedSec||0)+calcTaskDurSec(t.startTime,new Date(),t.workerId);
  });
  // עדכון חי לכל קבוצת טיימר: ספירה עולה + צבע (חום/אדום) + ספירה לאחור
  document.querySelectorAll('.task-tmr[data-ids]').forEach(el=>{
    const gts=el.dataset.ids.split(',').map(id=>S.activeTasks.find(t=>t.id===id)).filter(Boolean);
    if(!gts.length||gts.every(t=>t.paused))return;
    const elapsedSec=Math.max(0,...gts.map(t=>t.elapsed||0));
    const expSec=+el.dataset.exp||0;
    const cls=_tmrClass(elapsedSec,expSec,thresh);
    el.textContent=fmtS(elapsedSec);
    el.className='task-tmr'+(cls?' '+cls:'');
    const cd=document.getElementById('cd-'+el.id.slice(4));
    if(cd){cd.textContent=fmtCountdown(expSec-elapsedSec);cd.className='task-cd'+(cls?' '+cls:'');}
    const rb=document.getElementById('rmd-'+el.id.slice(4));
    if(rb)rb.style.display=cls==='late'?'':'none';
  });
  // live net hours update in attendance
  const tnEl=document.getElementById('att-total-net');
  if(tnEl){const totalNet=S.workers.filter(w=>w.checkin).reduce((s,w)=>s+calcNetWork(w),0);tnEl.textContent=fmtNetH(totalNet)||'—';}
  if(_kioskOpen)kioskTick(); // עדכון חי לטיימרים+שעון במסך התצוגה
  checkAlerts();
},1000);

