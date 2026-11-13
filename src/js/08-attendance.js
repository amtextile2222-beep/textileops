// ─── NAVIGATION ─────────────────────────────────────────────
function goPage(p){
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-'+p)?.classList.add('active');
  document.getElementById('nb-'+p)?.classList.add('active');
  if(p==='dash')renderDash();
  if(p==='att')renderAtt();
  if(p==='scan')renderScanActive();
  if(p==='tasks'){renderTasks();buildPersonalReport();}
  if(p==='reports'){
    // ברירת מחדל: היום בלבד (רשימה קצרה + פחות קריאות Firestore); טווח רחב — ידנית
    const today=todayStr();
    const fi=document.getElementById('rf-from');if(fi&&!fi.value)fi.value=today;
    const ti=document.getElementById('rf-to');if(ti&&!ti.value)ti.value=today;
    buildRep();
  }
  if(p==='alerts'){checkAlerts();renderAlerts();}
  if(p==='admin'){renderAdmin();try{renderTabSessions();}catch(e){}}
  if(p==='mgrtasks')renderMgrTasks();
  if(p==='taskscan')renderTsScan();
  if(p==='barcodes'){
    const rows=document.getElementById('bc-gen-rows');
    if(rows&&!rows.children.length)bcAddRow();
    bcSyncOrderSel(); // הדף לא נכלל ב-renderAll — הבורר מסונכרן בכל פתיחה
    bcFillProductSelect();
    fillDeptSelects();
    renderStationsAdmin();
  }
  if(p==='attrep')initAttRep();
  if(p==='costs')initCostsPage();
  if(p==='products')renderProducts();
  if(p==='dnotes')renderDNotes();
  if(p==='expenses')renderExpenses();
  if(p==='cashbox')renderCashbox();
}

function renderAll(){
  const pg=document.querySelector('.page.active');
  if(!pg)return;
  const id=pg.id.replace('page-','');
  if(id==='dash')renderDash();
  if(id==='att')renderAtt();
  if(id==='scan')renderScanActive();
  if(id==='tasks')renderTasks();
  if(id==='reports')buildRep();
  if(id==='mgrtasks')renderMgrTasks();
  if(id==='taskscan')renderTsScan();
  if(id==='attrep')initAttRep();
  if(id==='alerts'){checkAlerts();renderAlerts();loadWaSettings();loadPushSettings();}
  if(id==='expenses')renderExpenses();
  if(id==='cashbox')renderCashbox();
  if(id==='dnotes')renderDNotes();
  // מסך הניהול מצויר רק ברגע הכניסה אליו (goPage) ולכן נשאר תקוע על העותק שהיה
  // בזיכרון באותו רגע. זה נראה כמו "הכול התאפס" — תחנות, שלב ייצור ורישום פנים
  // נעלמים מהמסך בזמן שב-Firestore הכול שלם. רינדור ישן, לא נזק לנתונים.
  // הדילוג בזמן הקלדה חיוני: renderAdmin דורס את adm-depts, ובתוכו שדה "תחנה חדשה",
  // ו-renderAll נורה בכל חתימת כניסה/יציאה — בלי זה השדה היה מתאפס תוך כדי כתיבה.
  if(id==='admin'&&!document.getElementById('page-admin')?.contains(document.activeElement))renderAdmin();
  if(typeof _kioskOpen!=='undefined'&&_kioskOpen)renderKiosk(); // מסך התצוגה מתעדכן בזמן אמת עם כל שינוי נתונים
}

// ─── ATTENDANCE REPORT ──────────────────────────────────────
const DAYS_HE=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
function initAttRep(){
  const today=todayStr();
  const monthAgo=new Date();monthAgo.setDate(monthAgo.getDate()-30);
  const fromStr=monthAgo.toISOString().slice(0,10);
  const fi=document.getElementById('ar-from');if(fi&&!fi.value)fi.value=fromStr;
  const ti=document.getElementById('ar-to');if(ti&&!ti.value)ti.value=today;
  const sel=document.getElementById('ar-worker');
  if(sel){sel.innerHTML='<option value="">כל העובדים</option>'+S.workers.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');}
  buildAttRep();
}
// 🚪 שעת היציאה של רשומת נוכחות — **היציאה האחרונה מתוך ה-sessions**, לא שדה checkout.
// הסוגר האוטומטי (לילה/בוקר) כתב עד 04/10/2026 checkout = סוף משמרת (15:00) גם לעובדת
// שכבר יצאה ב-10:09 — ה-netMs נשאר נכון אבל עמודת היציאה בדוח הראתה 15:00 לכולן.
// גזירה מה-sessions מתקנת גם את הרשומות הישנות בלי מיגרציה.
function attLastOut(r){
  const ss=(r.sessions||[]).filter(s=>s&&s.in);
  if(ss.length&&ss.every(s=>s.out))return ss.map(s=>s.out).sort().pop();
  return r.checkout||null;
}
// סגירת sessions פתוחות בשעת החיתוך + checkout = היציאה האחרונה בפועל
function attCloseSessions(sessions,cutISO){
  const out=(sessions||[]).map(s=>s.out?s:{...s,out:cutISO});
  const wasOpen=(sessions||[]).some(s=>s&&s.in&&!s.out);
  return {sessions:out,checkout:out.length?out.map(s=>s.out).sort().pop():cutISO,autoClosed:wasOpen};
}
async function buildAttRep(){
  const from=document.getElementById('ar-from')?.value;
  const to=document.getElementById('ar-to')?.value;
  const wid=document.getElementById('ar-worker')?.value;
  // טווח נבחר ⇒ שליפה לפי דרישה. S.attHistory מחזיק רק ATT_WINDOW_DAYS.
  const att=await loadAttRange(from,to);
  // include today's active workers too
  const todayRecs=S.workers.filter(w=>w.checkin&&w.checkin.slice(0,10)===todayStr()).map(w=>({
    workerId:w.id,workerName:w.name,dept:w.dept,date:todayStr(),
    checkin:w.checkin,checkout:w.checkout||null,
    breakStart:w.breakStart||'',breakEnd:w.breakEnd||'',breakActive:!!w.breakActive,
    netMs:calcNetWork(w),live:!w.checkout
  }));
  const hist=att.map(r=>({...r,live:false}));
  // merge — avoid duplicates for today
  const allRecs=[...todayRecs,...hist.filter(r=>r.date!==todayStr())];
  let fl=allRecs;
  if(from)fl=fl.filter(r=>r.date>=from);
  if(to)fl=fl.filter(r=>r.date<=to);
  if(wid)fl=fl.filter(r=>r.workerId===wid);
  fl.sort((a,b)=>b.date.localeCompare(a.date)||(b.checkin||'').localeCompare(a.checkin||''));
  const totalMs=fl.reduce((s,r)=>s+(r.netMs||0),0);
  const uniqueDays=new Set(fl.map(r=>r.date+r.workerId)).size;
  const uniqueWorkers=new Set(fl.map(r=>r.workerId)).size;
  document.getElementById('ar-days').textContent=uniqueDays;
  document.getElementById('ar-total').textContent=fmtNetH(totalMs);
  document.getElementById('ar-avg').textContent=uniqueDays?fmtNetH(totalMs/uniqueDays):'—';
  document.getElementById('ar-workers').textContent=uniqueWorkers;
  const tbody=document.getElementById('ar-body');
  if(!fl.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--txt3);padding:1.5rem">אין נתונים לתקופה זו</td></tr>';return;}
  tbody.innerHTML=fl.map(r=>{
    const ci=r.checkin?new Date(r.checkin):null;
    const _co=r.live?r.checkout:attLastOut(r);
    const co=_co?new Date(_co):null;
    const ciStr=ci?pad2(ci.getHours())+':'+pad2(ci.getMinutes()):'—';
    const coStr=co?pad2(co.getHours())+':'+pad2(co.getMinutes()):r.live?'<span class="badge green" style="font-size:10px">עדיין בעבודה</span>':'—';
    const brkStr=r.breakActive&&r.breakStart?`${r.breakStart}–${r.breakEnd}`:'—';
    const d=new Date(r.date+'T00:00:00');
    const dayName=DAYS_HE[d.getDay()];
    const dateHe=pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear();
    return`<tr>
      <td><strong>${esc(r.workerName)}</strong></td>
      <td>${esc(r.dept)}</td>
      <td>${dateHe}</td>
      <td>${dayName}</td>
      <td>${ciStr}</td>
      <td>${coStr}</td>
      <td style="font-size:11px;color:var(--txt3)">${brkStr}</td>
      <td><strong style="color:var(--blue-txt)">${fmtNetH(r.netMs)}</strong></td>
    </tr>`;
  }).join('');
}
async function exportAttCSV(){
  const from=document.getElementById('ar-from')?.value;
  const to=document.getElementById('ar-to')?.value;
  const wid=document.getElementById('ar-worker')?.value;
  const att=await loadAttRange(from,to);
  const todayRecs=S.workers.filter(w=>w.checkin&&w.checkin.slice(0,10)===todayStr()).map(w=>({workerId:w.id,workerName:w.name,dept:w.dept,date:w.checkin?.slice(0,10)||todayStr(),checkin:w.checkin,checkout:w.checkout||null,breakStart:w.breakStart||'',breakEnd:w.breakEnd||'',breakActive:!!w.breakActive,netMs:calcNetWork(w)}));
  let fl=[...todayRecs,...att.filter(r=>!todayRecs.find(t=>t.date===r.date&&t.workerId===r.workerId))];
  if(from)fl=fl.filter(r=>r.date>=from);
  if(to)fl=fl.filter(r=>r.date<=to);
  if(wid)fl=fl.filter(r=>r.workerId===wid);
  fl.sort((a,b)=>b.date.localeCompare(a.date));
  const rows=[['עובד','מחלקה','תאריך','יום','כניסה','יציאה','הפסקה מ','הפסקה עד','שעות נטו']];
  fl.forEach(r=>{
    const ci=r.checkin?new Date(r.checkin):null;
    const _co=attLastOut(r);
    const co=_co?new Date(_co):null;
    const d=new Date(r.date+'T00:00:00');
    rows.push([r.workerName,r.dept,pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear(),DAYS_HE[d.getDay()],ci?pad2(ci.getHours())+':'+pad2(ci.getMinutes()):'',co?pad2(co.getHours())+':'+pad2(co.getMinutes()):'',r.breakStart||'',r.breakEnd||'',fmtNetH(r.netMs)]);
  });
  const csv='﻿'+'sep=,\n'+rows.map(r=>r.join(',')).join('\n');
  const blob1=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob1);
  a.download='נוכחות_'+new Date().toLocaleDateString('he-IL').replace(/\//g,'-')+'.csv';a.click();URL.revokeObjectURL(a.href);
}

// ─── MSG TO MANAGER ──────────────────────────────────────────
function openMsgModal(){
  const isMgr=S.user?.role==='manager';
  if(isMgr)return;
  document.getElementById('msg-modal-overlay').style.display='flex';
  setTimeout(()=>document.getElementById('msg-modal-txt').focus(),100);
}
function closeMsgModal(){
  document.getElementById('msg-modal-overlay').style.display='none';
  document.getElementById('msg-modal-txt').value='';
  document.getElementById('msg-modal-status').textContent='';
  clearMsgModal();
}
function previewMsgModal(input){
  const file=input.files[0];if(!file)return;
  document.getElementById('msg-modal-preview-img').src=URL.createObjectURL(file);
  document.getElementById('msg-modal-preview').style.display='block';
}
function clearMsgModal(){
  document.getElementById('msg-modal-img').value='';
  document.getElementById('msg-modal-preview').style.display='none';
  document.getElementById('msg-modal-preview-img').src='';
}
// 🔒 (13/11/2026) הכפתור ננעל מהלחיצה עד שהשליחה נגמרת (והחלון נסגר אחרי הצלחה) — לחיצה כפולה שלחה את
// ההודעה פעמיים לטלגרם (MM, 12/11 16:01). כישלון ⇒ משחררים כדי שאפשר יהיה לנסות שוב.
function _msgLock(id,on){const b=document.getElementById(id);if(b){b.disabled=on;b.style.opacity=on?'.5':'';}}
async function sendMsgModal(){
  if(document.getElementById('msg-modal-send')?.disabled)return;
  const txt=document.getElementById('msg-modal-txt').value.trim();
  const imgFile=document.getElementById('msg-modal-img').files[0];
  const st=document.getElementById('msg-modal-status');
  if(!txt&&!imgFile){st.style.color='var(--red-txt)';st.textContent='כתוב הודעה או צרף תמונה';return;}
  const w=S.user;
  const now=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  const caption='💬 הודעה מעובד\n👤 '+w.name+' ('+w.dept+')\n🕐 שעה: '+now+(txt?'\n\n'+txt:'');
  st.style.color='var(--txt2)';st.textContent='שולח...';
  _msgLock('msg-modal-send',true);
  let ok=false;
  try{
    if(imgFile){
      const small=await compressImageFile(imgFile,1000,0.6).catch(()=>null);
      const b64=small?String(small).split(',')[1]:await blobToB64(imgFile);
      ok=await tgCall({kind:'photo',dataB64:b64,caption});
    }else{ok=await sendTelegram(caption);}
  }catch(e){ok=false;}
  if(ok){st.style.color='var(--green-txt)';st.textContent='✅ ההודעה נשלחה למנהל';setTimeout(()=>{closeMsgModal();_msgLock('msg-modal-send',false);},2000);}
  else{st.style.color='var(--red-txt)';st.textContent='שגיאה בשליחה';_msgLock('msg-modal-send',false);}
}
function openMsgToMgr(){
  document.getElementById('msg-to-mgr-box').classList.remove('hidden');
  document.getElementById('msg-to-mgr-txt').focus();
}
function closeMsgToMgr(){
  document.getElementById('msg-to-mgr-box').classList.add('hidden');
  document.getElementById('msg-to-mgr-txt').value='';
  document.getElementById('msg-to-mgr-status').textContent='';
  clearMgrImg();
}
function previewMgrImg(input){
  const file=input.files[0];if(!file)return;
  const prev=document.getElementById('msg-to-mgr-preview');
  const img=document.getElementById('msg-to-mgr-preview-img');
  img.src=URL.createObjectURL(file);
  prev.style.display='block';
}
function clearMgrImg(){
  document.getElementById('msg-to-mgr-img').value='';
  document.getElementById('msg-to-mgr-preview').style.display='none';
  document.getElementById('msg-to-mgr-preview-img').src='';
}
async function sendMsgToMgr(){
  if(document.getElementById('msg-to-mgr-send')?.disabled)return;
  const txt=document.getElementById('msg-to-mgr-txt').value.trim();
  const imgFile=document.getElementById('msg-to-mgr-img').files[0];
  const st=document.getElementById('msg-to-mgr-status');
  if(!txt&&!imgFile){st.style.color='var(--red-txt)';st.textContent='כתוב הודעה או צרף תמונה';return;}
  const w=S.user;
  const now=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  const caption='💬 הודעה מעובד\n👤 '+w.name+' ('+w.dept+')\n🕐 שעה: '+now+(txt?'\n\n'+txt:'');
  st.style.color='var(--txt2)';st.textContent='שולח...';
  _msgLock('msg-to-mgr-send',true);
  let ok=false;
  try{
    if(imgFile){
      const small=await compressImageFile(imgFile,1000,0.6).catch(()=>null);
      const b64=small?String(small).split(',')[1]:await blobToB64(imgFile);
      ok=await tgCall({kind:'photo',dataB64:b64,caption});
    } else {
      ok=await sendTelegram(caption);
    }
  }catch(e){ok=false;}
  if(ok){st.style.color='var(--green-txt)';st.textContent='✅ ההודעה נשלחה למנהל';
    setTimeout(()=>{closeMsgToMgr();_msgLock('msg-to-mgr-send',false);},2000);
  }else{st.style.color='var(--red-txt)';st.textContent='שגיאה בשליחה — בדוק הגדרות טלגרם';_msgLock('msg-to-mgr-send',false);}
}

// המתנה עד שהעובד קיים ב-S.workers (הנתונים מ-Firebase מגיעים כמה שניות אחרי login)
// 💾 (13/11/2026) עם המטמון המקומי של Firestore הרשימה הראשונה יכולה להיות מאתמול (sessions ישנים) ⇒ מחכים
// לנתוני שרת (_workersReady). בלי רשת — אחרי ה-timeout לוקחים מה שיש (כמו קודם).
async function waitForWorker(id,timeoutMs=15000){
  const t0=Date.now();
  while(Date.now()-t0<timeoutMs){
    const w=S.workers.find(x=>x.id===id);
    if(w&&(_workersReady||!db||!S.fbConnected))return w;
    await new Promise(r=>setTimeout(r,300));
  }
  return S.workers.find(x=>x.id===id)||null;
}
// המתנה ל-snapshot הראשון מהשרת של activeTasks. בניגוד ל-waitForWorker, כאן אי אפשר
// להסתפק ב-S.workers: הוא נטען מיידית מ-localStorage ולכן חוזר לפני שהמשימות הגיעו.
// בלי Firebase אין למה להמתין — מחזיר מיד ועובד על מה שיש בזיכרון (התנהגות קודמת).
async function waitForActiveTasks(timeoutMs=10000){
  if(!db||!S.fbConnected)return false;
  const t0=Date.now();
  while(!_activeTasksReady&&Date.now()-t0<timeoutMs)await new Promise(r=>setTimeout(r,200));
  return _activeTasksReady;
}
// כניסה אוטומטית אחרי זיהוי פנים (ללא תלות ב-DOM של דף נוכחות)
async function autoPunchIn(){
  if(!S.user)return;
  const w=await waitForWorker(S.user.id);
  if(!w){showToast('⏳ הנתונים עדיין נטענים — חתום כניסה ידנית בלשונית נוכחות','var(--red-txt)');return;}
  if(!w.sessions)w.sessions=[];
  // נקה sessions מימים קודמים — Firebase עלול לטעון נתונים ישנים לפני שהאיפוס היומי רץ
  const today=todayStr();
  w.sessions=w.sessions.filter(s=>{if(!s.in)return false;const d=new Date(s.in);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())>=today;});
  if(w.sessions.find(s=>!s.out))return; // כבר נכנס
  const now=roundAttTime(srvNow(),true); // עיגול לשעת משמרת — עקביות עם כניסה ידנית (punchIn)
  w.sessions.push({in:now.toISOString(),out:null});
  w.status='in';
  w.checkin=w.sessions[0].in;
  saveLS(); // שמור מקומי תחילה — לא תלוי ב-Firebase
  try{if(S.fbConnected)await fbSet('workers',w.id,attFields(w));}catch(e){}
  if(w.requireFactoryIP&&S.fbConnected){try{const r=await fetch('https://api.ipify.org?format=json');const ip=(await r.json()).ip||'';await fbSet('workerWifi',w.id,{ip,lastSeen:Date.now(),name:w.name,dept:w.dept});}catch(e){}}
  tgPunch(w.name,w.dept,true,now,w.id);
  const autoResumed=await resumeWorkerTasksOnPunchIn(w.id,now);
  if(autoResumed)showToast('▶ '+autoResumed+' '+(LANGS[currentLang].tasks_resumed_msg||'משימות חודשו אוטומטית'),'var(--green-txt)',5000);
  try{renderAdmin();}catch(e){}
  try{renderAtt();}catch(e){}
}

// ─── ATTENDANCE ──────────────────────────────────────────────
function roundAttTime(now, isIn){
  const rm=S.settings.roundMinutes??5;
  if(!rm)return now;
  const ref=isIn?(S.settings.shiftStart||'06:30'):(S.settings.shiftEnd||'15:00');
  const [rh,rm2]=ref.split(':').map(Number);
  const target=new Date(now);
  target.setHours(rh,rm2,0,0);
  const diffMs=now.getTime()-target.getTime();
  const diffMin=diffMs/60000;
  if(Math.abs(diffMin)<=rm)return target;
  return now;
}
async function punchIn(){
  if(!S.user)return;
  if(await checkVersion()){document.getElementById('att-msg').textContent='🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב';return;}
  const w=await waitForWorker(S.user.id,15000);
  if(!w){document.getElementById('att-msg').textContent='⏳ הנתונים עדיין נטענים — נסה שוב בעוד רגע';return;}
  if(!w.sessions)w.sessions=[];
  const today=todayStr();
  w.sessions=w.sessions.filter(s=>{if(!s.in)return false;const d=new Date(s.in);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())>=today;});
  if(w.sessions.find(s=>!s.out)){document.getElementById('att-msg').textContent='כבר רשום/ת כנוכח/ת';return;}
  const nowRaw=srvNow();
  const now=roundAttTime(nowRaw,true);
  const prevSessions=w.sessions.slice(),prevStatus=w.status,prevCheckin=w.checkin;
  w.sessions.push({in:now.toISOString(),out:null});
  w.status='in';
  w.checkin=w.sessions[0].in;
  // סימטרי ל-punchOut: כשל כתיבה מחזיר את המצב המקומי לאחור ואומר את זה. בלי
  // זה העובדת ראתה "✅ כניסה" מול שרת שלא קיבל כלום, והמנהל ראה אותה כנעדרת.
  if(S.fbConnected){
    try{
      await fbSet('workers',w.id,attFields(w));
    }catch(e){
      w.sessions=prevSessions;w.status=prevStatus;w.checkin=prevCheckin;
      console.error('punchIn: fbSet workers failed:',e.message);
      document.getElementById('att-msg').textContent='⚠️ חתימת הכניסה לא נשמרה בשרת — נסה שוב';
      sendTelegram('⚠️ חתימת כניסה נכשלה!\n👤 עובד: '+w.name+'\n🏭 מחלקה: '+w.dept+'\n🕐 שעה: '+pad2(now.getHours())+':'+pad2(now.getMinutes())+'\nשגיאה: '+(e.message||'')).catch(()=>{});
      renderAtt();
      return;
    }
  }
  if(w.requireFactoryIP&&S.fbConnected){try{const r=await fetch('https://api.ipify.org?format=json');const ip=(await r.json()).ip||'';await fbSet('workerWifi',w.id,{ip,lastSeen:Date.now(),name:w.name,dept:w.dept});}catch(e){}}
  tgPunch(w.name,w.dept,true,now,w.id);
  const resumedCount=await resumeWorkerTasksOnPunchIn(w.id,now);
  saveLS();renderAtt();
  const rounded=now.getTime()!==nowRaw.getTime();
  const T2=LANGS[currentLang];
  document.getElementById('att-msg').textContent='✅ כניסה '+(w.sessions.length>1?w.sessions.length+': ':'')+pad2(now.getHours())+':'+pad2(now.getMinutes())+(rounded?' (עוגל)':'')+(resumedCount?' | ▶ '+resumedCount+' '+(T2.tasks_resumed_msg||'משימות חודשו אוטומטית'):'');
}
async function punchOut(){
  if(!S.user)return;
  if(await checkVersion()){document.getElementById('att-msg').textContent='🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב';return;}
  const T=LANGS[currentLang];
  const w=await waitForWorker(S.user.id,15000);
  if(!w){document.getElementById('att-msg').textContent='⏳ הנתונים עדיין נטענים — נסה שוב בעוד רגע';return;}
  if(!w.sessions)w.sessions=[];
  const openIdx=w.sessions.findIndex(s=>!s.out);
  if(openIdx===-1){document.getElementById('att-msg').textContent='כבר רשום/ת כיצא/ה';return;}
  const nowRaw=srvNow();
  const now=roundAttTime(nowRaw,false);
  const prevOut=w.sessions[openIdx].out,prevStatus=w.status,prevCheckout=w.checkout;
  w.sessions[openIdx].out=now.toISOString();
  w.status='out';
  w.checkout=now.toISOString();
  if(S.fbConnected){
    try{
      await fbSet('workers',w.id,attFields(w));
    }catch(e){
      // הכתיבה נדחתה/נכשלה בשרת — לבטל את השינוי המקומי כדי שהמסך לא ישקר שחתמה יציאה בזמן שהשרת עדיין מראה 'נוכח'
      w.sessions[openIdx].out=prevOut;w.status=prevStatus;w.checkout=prevCheckout;
      console.error('punchOut: fbSet workers failed:',e.message);
      document.getElementById('att-msg').textContent='⚠️ '+T.att_out_fail;
      sendTelegram('⚠️ חתימת יציאה נכשלה!\n👤 עובד: '+w.name+'\n🏭 מחלקה: '+w.dept+'\n🕐 שעה: '+pad2(now.getHours())+':'+pad2(now.getMinutes())+'\nשגיאה: '+(e.message||'')).catch(()=>{});
      renderAtt();
      return;
    }
  }
  const pausedCount=await pauseWorkerTasks(w.id,now);
  await closeWorkerStation(w,now); // חתימת יציאה סוגרת את שיוך התחנה
  const netMs=calcNetWork(w);
  const rec={workerId:w.id,workerName:w.name,dept:w.dept,date:todayStr(),sessions:w.sessions,checkin:w.sessions[0]?.in||'',checkout:now.toISOString(),breakStart:w.breakStart||'',breakEnd:w.breakEnd||'',breakActive:!!w.breakActive,netMs};
  S.attHistory.unshift(rec);
  if(S.fbConnected){try{await fbSet('attHistory',w.id+'_'+todayStr(),rec);}catch(e){console.error('punchOut: attHistory save failed:',e.message);}try{await fbDel('workerWifi',w.id);}catch(e){}}
  tgPunch(w.name,w.dept,false,now,w.id);
  saveLS();renderAtt();
  const roundedOut=now.getTime()!==nowRaw.getTime();
  document.getElementById('att-msg').textContent='🚪 '+T.att_out+': '+pad2(now.getHours())+':'+pad2(now.getMinutes())+(roundedOut?' (עוגל)':'')+(pausedCount?' | '+pausedCount+' '+T.tasks_paused_msg:'');
  // חתימת יציאה מסיימת את ה-session. window.close() חסום בטאב וב-PWA, וזו
  // הדרך להשיג את אותה מטרה: ה-session נמחק ⇒ השחזור לא יחזיר אותה פנימה.
  // punchOut היא נקודת מעבר יחידה (הכפתור וגם סריקת הברקוד), ולכן זה סוגר גם
  // טאב נשכח שממשיך להחזיק משימות בזיכרון, ואת הצטברות tabSessions.
  // pauseWorkerTasks כבר רץ למעלה, אז המשימות מושהות בבטחה לפני היציאה.
  setTimeout(async()=>{
    try{await fbDel('tabSessions',tabId());}catch(e){}
    try{const{getAuth,signOut}=window._fb;await signOut(getAuth(window._fbApp));}catch(e){}
    doLogout();
  },3000);
}
// ─── חתימת יציאה בסריקת ברקוד העובד ───
// כאן העובד כבר מאומת (יש טוקן) — הסריקה רק מאשרת שהוא פיזית בתחנה שלו,
// ולכן ההשוואה המקומית מול S.user.id מספיקה; אין כאן הסלמת הרשאות.
let _bcPunchStream=null,_bcPunchInt=null;
async function startBcPunch(){
  if(!S.user||_bcPunchStream)return;
  const video=document.getElementById('att-bc-video');
  const status=document.getElementById('att-bc-status');
  try{
    _bcPunchStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=_bcPunchStream;
    document.getElementById('att-bc-cam').style.display='block';
    status.textContent='מחפש ברקוד...';
    await video.play();
  }catch(e){
    _bcPunchStream=null;
    document.getElementById('att-msg').textContent='⛔ לא ניתן לפתוח את המצלמה — אשר גישה למצלמה בהגדרות';
    return;
  }
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  let busy=false;
  _bcPunchInt=setInterval(async()=>{
    if(busy||!_bcPunchStream||video.readyState<2)return;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    ctx.drawImage(video,0,0);
    let text='';
    try{
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      text=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'})?.data||'';
    }catch(e){return;}
    if(!text)return;
    if(!text.startsWith('EMP:')){status.textContent='⚠ זה לא ברקוד עובד — סרוק את המדבקה שבתחנה שלך';return;}
    if(text.trim()!=='EMP:'+S.user.id){status.textContent='⛔ זה הברקוד של עובד אחר — סרוק את שלך';return;}
    busy=true;
    status.textContent='✅ נסרק — חותם יציאה...';
    stopBcPunch();
    await punchOut();
  },200);
}
// 📶 חתימת יציאה ממדבקת NFC של העובד — אותן בדיקות כמו בסריקה במצלמה
function nfcBcPunch(){
  if(!S.user)return;
  const msg=document.getElementById('att-msg');
  nfcRead(async txt=>{
    txt=(txt||'').trim();
    if(!txt.startsWith('EMP:')){msg.textContent='⚠ זו לא מדבקת עובד — קרב את המדבקה שבתחנה שלך';return;}
    if(txt!=='EMP:'+S.user.id){msg.textContent='⛔ זו המדבקה של עובד אחר — קרב את שלך';return;}
    stopBcPunch();
    await punchOut();
  });
}
function stopBcPunch(){
  if(_bcPunchInt){clearInterval(_bcPunchInt);_bcPunchInt=null;}
  if(_bcPunchStream){_bcPunchStream.getTracks().forEach(t=>t.stop());_bcPunchStream=null;}
  const c=document.getElementById('att-bc-cam');if(c)c.style.display='none';
  const v=document.getElementById('att-bc-video');if(v)v.srcObject=null;
}
// רשומה בלי חתימת יציאה נחתכת בשעת סוף המשמרת של אותו יום — לא ב"עכשיו"
// (חישוב עד "עכשיו" בבוקר שאחרי ניפח רשומות ל-22-30 שעות ועיוות סיכומי שכר)
function shiftEndDate(dateStr){return new Date(dateStr+'T'+(S.settings.shiftEnd||'15:00'));}
function calcNetWorkCapped(w,dateStr){
  const cutoff=shiftEndDate(dateStr).getTime();
  const sessions=w.sessions&&w.sessions.length?w.sessions:(w.checkin?[{in:w.checkin,out:w.checkout||null}]:[]);
  let total=0;
  sessions.forEach(s=>{
    const ci=new Date(s.in).getTime();
    const co=s.out?new Date(s.out).getTime():cutoff;
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
function calcNetWorkRaw(checkin,checkout,breakActive,breakStart,breakEnd,refDate){
  if(!checkin)return 0;
  const ci=new Date(checkin).getTime();
  const co=checkout?new Date(checkout).getTime():Date.now();
  let total=co-ci;
  if(breakActive&&breakStart&&breakEnd){
    const ref=new Date(refDate||checkin).toDateString();
    const bs=new Date(ref+' '+breakStart).getTime();
    const be=new Date(ref+' '+breakEnd).getTime();
    if(be>bs){const os=Math.max(ci,bs);const oe=Math.min(co,be);if(oe>os)total-=(oe-os);}
  }
  return Math.max(0,total);
}
// משך סופי של משימה בסגירה: מושהית → הזמן שנצבר בלבד; רצה → נצבר + הריצה הנוכחית.
// חישוב לפי endTime-startTime ספר גם לילות והפסקות — כך נולדו משימות של 18+ שעות בדוחות.
function taskFinalDur(t,endTime){
  if(t.paused)return _capByAttendance(t,t.accumulatedSec||0);
  return _capByAttendance(t,(t.accumulatedSec||0)+calcTaskDurSec(t.startTime,endTime,t.workerId));
}
// תקרת שפיות: משך משימה לא יכול לעבור את סך הנוכחות של העובד מאז שנפתחה.
// בלי זה משימה שנשכחה פתוחה נסגרת עם מאות שעות ומזהמת את כל הדוחות
// (ندوه 00084: 13,617 דק' על עובדת שנכחה 6,763 דק' באותה תקופה).
function _capByAttendance(t,sec){
  try{
    const w=S.workers.find(x=>x.id===t.workerId);if(!w)return sec;
    const st=t.startTime instanceof Date?t.startTime:new Date(t.startTime);
    // היום המוקדם ביותר שהמשימה יכלה להתחיל בו: ההתחלה המקורית (origStart — לפני שחידוש
    // דרס את startTime), ההשהיה הראשונה, או ההתחלה הנוכחית. בלי origStart משימה שחודשה
    // בבוקר מקבלת fromDate=היום, התקרה = הנוכחות מאז הכניסה בלבד, וכל מה שנצבר אתמול נמחק.
    const cand=[st.getTime()];
    [t.pausedAt,t.origStart].forEach(v=>{if(v){const ms=new Date(v).getTime();if(isFinite(ms))cand.push(ms);}});
    const firstDay=new Date(Math.min(...cand));
    const fromDate=firstDay.getFullYear()+'-'+pad2(firstDay.getMonth()+1)+'-'+pad2(firstDay.getDate());
    let capMs=(S.attHistory||[]).filter(r=>r.workerId===t.workerId&&r.date>=fromDate)
      .reduce((s,r)=>s+(r.netMs||0),0);
    capMs+=calcNetWork(w); // היום הנוכחי עדיין לא בהיסטוריה
    if(capMs>0&&sec>capMs/1000)return Math.round(capMs/1000);
  }catch(e){}
  return sec;
}
function calcActualTaskTime(tasks){
  // זמן עבודה נקי (שניות): מסכם duration מתוקן דרך normalizeBatchDurations —
  // batch מקביל (סריקת אצווה) נספר פעם אחת, והפסקות/לילות/השהיות כבר מנוכים ב-duration.
  // קודם: union של [start,end] = שעון-קיר, שספר גם לילות/הפסקות/סריקות "כל הכמות"
  // שנשארו פתוחות שעות → שעות מנופחות (לא עקבי עם דוחות שלב/רווח/מאזן שכבר על duration נקי).
  const nd=normalizeBatchDurations(tasks);
  return Object.values(nd).reduce((s,v)=>s+(v||0),0);
}
