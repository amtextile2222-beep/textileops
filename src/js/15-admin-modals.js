// ─── ADMIN ──────────────────────────────────────────────────
// ⏰ שעות גישה לכל העובדים המוגבלים בבת אחת (24/10/2026, שעון חורף). רק שעות מ/עד — הימים של כל
// עובד נשמרים. ערך ההתחלה בשדות = השעות הנפוצות ביותר כרגע. נאכף בשרת (login) — שדה מנהל בלבד ב-Rules.
function _awAllHtml(){
  const lim=S.workers.filter(w=>w.accessWindow?.enabled);
  if(!lim.length)return '';
  const cnt={};lim.forEach(w=>{const k=(w.accessWindow.from||'')+'|'+(w.accessWindow.to||'');cnt[k]=(cnt[k]||0)+1;});
  const [f,t]=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0].split('|');
  return `<div class="row" style="flex-wrap:wrap;gap:6px;background:var(--bg2);border-radius:8px;padding:8px;margin-bottom:6px">
    <div style="min-width:150px;font-size:13px;font-weight:700">⏰ שעות גישה ל-${lim.length} המוגבלים</div>
    <label style="font-size:11px;color:var(--txt2)">מ-</label><input type="time" id="aw-all-f" value="${esc(_awDraft.f||f||'06:00')}" oninput="_awDraft.f=this.value" style="width:95px;font-size:12px"/>
    <label style="font-size:11px;color:var(--txt2)">עד-</label><input type="time" id="aw-all-t" value="${esc(_awDraft.t||t||'16:00')}" oninput="_awDraft.t=this.value" style="width:95px;font-size:12px"/>
    <button class="btn primary" style="font-size:11px;padding:4px 10px" onclick="admAccessAll()">החל על כולם</button>
    <span style="font-size:11px;color:var(--txt3);flex-basis:100%">הימים של כל עובד לא משתנים. עובד בלי הגבלה לא מושפע.</span>
  </div>`;
}
async function admAccessAll(){
  if(S.user?.role!=='manager')return;
  const f=document.getElementById('aw-all-f')?.value||'',t=document.getElementById('aw-all-t')?.value||'';
  if(!/^\d\d:\d\d$/.test(f)||!/^\d\d:\d\d$/.test(t)||f>=t){alert('שעת ההתחלה חייבת להיות לפני שעת הסיום');return;}
  if(!S.fbConnected){alert('אין חיבור לשרת');return;}
  const lim=S.workers.filter(w=>w.accessWindow?.enabled);
  if(!await showConfirm('⏰ שעות גישה','לקבוע גישה '+f+'–'+t+' ל-'+lim.length+' העובדים עם הגבלת שעות? הימים של כל אחד נשארים.','החל','ביטול'))return;
  let ok=0;
  for(const w of lim){
    const aw={...w.accessWindow,from:f,to:t};
    if(await fbUpdateOnly('workers',w.id,{accessWindow:aw})){w.accessWindow=aw;ok++;}
  }
  _awDraft={};saveLS();renderAdmin();
  showToast('⏰ שעות הגישה עודכנו ל-'+f+'–'+t+' אצל '+ok+' עובדים',ok===lim.length?'var(--green-txt)':'var(--amber-txt)',5000);
}
function renderAdmin(){
  if(S.user?.role!=='manager')return;
  document.getElementById('adm-workers').innerHTML=_awAllHtml()+S.workers.map(w=>`
    <div class="row">
      <div class="av" style="width:28px;height:28px;font-size:10px">${esc(w.name.split(' ').map(n=>n[0]).join(''))}</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:500">${esc(w.name)}</div>
      <div style="font-size:11px;color:var(--txt3)">${esc(w.dept)} · ${w.role==='manager'?'מנהל':w.role==='supervisor'?'אחראי':w.role==='helper'?'עוזר':'עובד'} · @${esc(w.user)}</div></div>
      ${w.requireFactoryIP?`<span title="חייב WiFi מפעל" style="font-size:16px">🏭</span>`:''}
      ${w.accessWindow?.enabled?`<span title="הגבלת ימים/שעות פעילה" style="font-size:16px">⏰</span>`:''}
      ${w.disabled?`<span title="גישה מושעית" style="font-size:16px">🚫</span>`:''}
      ${(w.stationGateMode||w.stepOrderGateMode)?`<span title="אכיפה מוגדרת ידנית — ${w.stationGateMode==='enforce'?'🔒 חל':w.stationGateMode==='override'?'🔒 פטור':'🔒 לפי תפקיד'} · ${w.stepOrderGateMode==='enforce'?'🔗 חל':w.stepOrderGateMode==='override'?'🔗 פטור':'🔗 לפי תפקיד'}" style="font-size:16px">${(w.stationGateMode==='enforce'||w.stepOrderGateMode==='enforce')?'🔒':'🔓'}</span>`:''}
      ${w.deviceBinding?`<span title="${(w.deviceRegistered||w.deviceId)?'מכשיר רשום ונעול':'נעילת מכשיר — טרם נרשם'}" style="font-size:16px">${(w.deviceRegistered||w.deviceId)?'📱🔒':'📱⚪'}</span>`:''}
      ${w.deviceBinding&&(w.deviceRegistered||w.deviceId)?`<button class="btn warn" style="font-size:11px;padding:4px 8px" title="אפס מכשיר — יאפשר כניסה ממכשיר חדש" onclick="resetDeviceBinding('${w.id}')">🔄</button>`:''}
      ${w.faceAuth?`<span title="${(w.faceRegistered||w.faceDescriptor||w.faceDescriptors&&Object.keys(w.faceDescriptors).length)?'זיהוי פנים פעיל':'זיהוי פנים — פנים לא רשומים'}" style="font-size:16px">${(w.faceRegistered||w.faceDescriptor||w.faceDescriptors&&Object.keys(w.faceDescriptors).length)?'🟢':'🟡'}</span>`:''}
      ${w.faceAuth?`<button class="btn ${w.faceUpdateAllowed?'success':''}\" style="font-size:11px;padding:4px 8px" title="${w.faceUpdateAllowed?'עדכון פנים מאושר — לחץ לביטול':'אפשר לעובד לעדכן פנים מהטלפון'}" onclick="toggleFaceUpdate('${w.id}')">${w.faceUpdateAllowed?'📸✅':'📸'}</button>`:''}
      <button class="btn" style="font-size:11px;padding:4px 8px" onclick="openModal('edit-worker','${w.id}')">✏</button>
      <button class="btn warn" style="font-size:11px;padding:4px 8px" onclick="resetPass('${w.id}')">🔑</button>
      <button class="btn danger" style="font-size:11px;padding:4px 8px" onclick="delWorker('${w.id}')">🗑</button>
    </div>`).join('');
  document.getElementById('adm-depts').innerHTML=S.depts.map(d=>{
    const sts=S.deptStations?.[d]||[];
    return`
    <div style="border-bottom:0.5px solid var(--brd);padding:4px 0">
      <div class="row" style="border-bottom:none"><span style="flex:1;font-size:13px;font-weight:600">${esc(d)}</span>
      <select title="שלב ייצור שהסריקה במחלקה זו מסמנת אוטומטית" onchange="setDeptStage('${escj(d)}',this.value)" style="font-size:11px;padding:3px 6px;border-radius:8px;border:1px solid var(--brd);background:var(--card);color:var(--txt);max-width:170px">
        <option value="">🔗 שלב ייצור — אין</option>
        ${PROD_STAGES.map(s=>`<option value="${s.id}" ${(S.deptStageMap?.[d])===s.id?'selected':''}>${esc(s.label)}</option>`).join('')}
      </select>
      <button class="btn" style="font-size:11px;padding:4px 8px" title="שנה שם מחלקה — מעדכן גם עובדים, מיומנויות ושלבי מוצרים" onclick="renameDept('${escj(d)}')">✏</button>
      <button class="btn danger" style="font-size:11px;padding:4px 8px" onclick="delDept('${escj(d)}')">🗑</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:0 8px 6px">
        ${sts.map(st=>`<span style="font-size:11px;background:var(--bg2);border:1px solid var(--brd);border-radius:10px;padding:2px 8px;display:inline-flex;align-items:center;gap:5px">🏷 ${esc(st)}<span title="שנה שם תחנה — מעדכן גם מיומנויות ושלבי מוצרים" onclick="renameStation('${escj(d)}','${escj(st)}')" style="cursor:pointer">✏</span><span onclick="delStation('${escj(d)}','${escj(st)}')" style="cursor:pointer;color:var(--red-txt);font-weight:700">✕</span></span>`).join('')}
        <span style="display:inline-flex;gap:4px;align-items:center">
          <input placeholder="תחנה חדשה" style="width:100px;font-size:11px;padding:3px 8px;border-radius:10px;border:1px solid var(--brd);background:var(--card);color:var(--txt)" onkeydown="if(event.key==='Enter')addStation('${escj(d)}',this.nextElementSibling)">
          <button class="btn" style="font-size:11px;padding:3px 8px" onclick="addStation('${escj(d)}',this)">+</button>
        </span>
      </div>
    </div>`;
  }).join('');
  // לקוחות
  const custEl=document.getElementById('adm-customers');
  if(custEl){
    const entries=Object.entries(S.customerNames);
    custEl.innerHTML=entries.length?entries.sort((a,b)=>a[0].localeCompare(b[0])).map(([code,name])=>{
      const hasInfo=!!(S.customerInfo?.[code]&&Object.values(S.customerInfo[code]).some(v=>String(v||'').trim()));
      return `<div class="row"><span class="bc-seg bc-c" style="flex-shrink:0">${esc(code)}</span>
      <span style="flex:1;font-size:13px;margin-right:8px">${esc(name)}</span>
      <button class="btn" style="font-size:11px;padding:4px 8px;${hasInfo?'color:var(--green-txt,#16a34a)':'color:var(--txt3)'}" title="שם, כתובת ואיש קשר לתעודת משלוח" onclick="editCustomerInfo('${escj(code)}')">✏️ ערוך${hasInfo?'':' · חסרים פרטים'}</button>
      <button class="btn danger" style="font-size:11px;padding:4px 8px" onclick="delCustomerName('${escj(code)}')">🗑</button></div>`;}).join('')
      :'<div style="font-size:12px;color:var(--txt3);text-align:center;padding:8px">אין לקוחות מוגדרים</div>';
  }
  // 📄 פרטי העסק לתעודת משלוח
  fillCompanyInfo();
  // צבעים
  const colEl=document.getElementById('adm-colors');
  if(colEl){
    colEl.innerHTML=Object.entries(COLORS).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,name])=>`
      <div class="row" style="padding:5px 0">
        <span class="bc-seg bc-col" style="flex-shrink:0;font-family:monospace">${esc(code)}</span>
        <span style="flex:1;font-size:13px;margin-right:8px">${esc(name)}</span>
        <button class="btn danger" style="font-size:11px;padding:3px 7px" onclick="delCustomColor('${escj(code)}')">🗑</button>
      </div>`).join('');
  }
}

// ─── MODAL HELPERS ──────────────────────────────────────────
function updatePermBoxes(role){
  const box=document.getElementById('mf-perms-box');
  const supBox=document.getElementById('mf-supervisor-perms');
  if(role==='manager'){box.style.display='none';}
  else{
    box.style.display='block';
    if(supBox)supBox.style.display=role==='supervisor'?'contents':'none';
  }
}

// ─── EDIT ATTENDANCE ────────────────────────────────────────
function _attSessionsHtml(sessions){
  if(!sessions||!sessions.length)return'';
  return sessions.map(s=>{
    const ci=new Date(s.in);const co=s.out?new Date(s.out):null;
    const ciV=pad2(ci.getHours())+':'+pad2(ci.getMinutes());
    const coV=co?pad2(co.getHours())+':'+pad2(co.getMinutes()):'';
    return`<div class="sess-row" style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;background:var(--bg2);padding:8px;border-radius:var(--r)">
      <div style="flex:1"><label style="font-size:11px;color:var(--txt3)">כניסה</label><input type="time" class="sess-in" value="${ciV}" style="font-size:13px;width:100%"/></div>
      <div style="flex:1"><label style="font-size:11px;color:var(--txt3)">יציאה (ריק=בעבודה)</label><input type="time" class="sess-out" value="${coV}" style="font-size:13px;width:100%"/></div>
      <button onclick="this.closest('.sess-row').remove()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:18px;padding-bottom:6px">✕</button>
    </div>`;
  }).join('');
}
function loadAttSessionsForDate(wId,date){
  const w=S.workers.find(x=>x.id===wId);if(!w)return;
  const today=todayStr();
  let sessions;
  if(date===today){
    sessions=w.sessions&&w.sessions.length?w.sessions:(w.checkin?[{in:w.checkin,out:w.checkout||null}]:[]);
  } else {
    const rec=S.attHistory.find(r=>r.workerId===wId&&r.date===date);
    sessions=rec?.sessions&&rec.sessions.length?rec.sessions:
      (rec?.checkin?[{in:rec.checkin,out:rec.checkout||null}]:[]);
  }
  const container=document.getElementById('sessions-container');
  if(!container)return;
  if(sessions&&sessions.length){
    container.innerHTML=_attSessionsHtml(sessions);
  } else {
    // אין נתונים — הצג שורה ריקה עם הנחיה
    container.innerHTML=`<div style="font-size:11px;color:var(--amber-txt);margin-bottom:6px">⚠️ אין רשומה לתאריך זה — הזן שעות כניסה/יציאה</div>`;
    addSessRow();
  }
}
function mgrEditAtt(wId){
  const w=S.workers.find(x=>x.id===wId);if(!w)return;
  S.modalAction='edit-att:'+wId;
  document.getElementById('modal-wrap').classList.remove('hidden');
  document.getElementById('modal-title').textContent='עריכת נוכחות — '+w.name;
  const today=todayStr();
  const sessions=w.sessions&&w.sessions.length?w.sessions:(w.checkin?[{in:w.checkin,out:w.checkout||null}]:[]);
  const noData=!sessions.length;
  const dateVal=today;
  document.getElementById('modal-body').innerHTML=`
    <div class="field"><label>תאריך</label><input type="date" id="mf-att-date" value="${dateVal}" onchange="loadAttSessionsForDate('${wId}',this.value)" style="font-size:13px"/></div>
    <div style="font-size:12px;color:var(--txt2);margin-bottom:8px;font-weight:500">כניסות/יציאות:</div>
    ${noData?'<div style="font-size:11px;color:var(--amber-txt);margin-bottom:6px">⚠️ אין רשומה לתאריך זה — הזן שעות כניסה/יציאה</div>':''}
    <div id="sessions-container">${_attSessionsHtml(sessions)}</div>
    <button onclick="addSessRow()" class="btn primary" style="font-size:12px;width:100%;justify-content:center;margin-top:4px">+ הוסף כניסה/יציאה</button>`;
}
function addSessRow(){
  const container=document.getElementById('sessions-container');if(!container)return;
  const div=document.createElement('div');
  div.className='sess-row';
  div.style.cssText='display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;background:var(--bg2);padding:8px;border-radius:8px';
  div.innerHTML=`
    <div style="flex:1"><label style="font-size:11px;color:var(--txt3)">כניסה</label><input type="time" class="sess-in" style="font-size:13px;width:100%"/></div>
    <div style="flex:1"><label style="font-size:11px;color:var(--txt3)">יציאה (ריק=בעבודה)</label><input type="time" class="sess-out" style="font-size:13px;width:100%"/></div>
    <button onclick="this.closest('.sess-row').remove()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:18px;padding-bottom:6px">✕</button>`;
  container.appendChild(div);
}

// ─── EDIT TASK ───────────────────────────────────────────────
async function deleteHistTask(taskId){
  if(!confirm('למחוק משימה זו מההיסטוריה?'))return;
  S.histTasks=S.histTasks.filter(t=>t.id!==taskId);
  if(S.fbConnected){try{await fbDel('histTasks',String(taskId));}catch(e){}}
  saveLS();renderTaskHist();
}
// החזרה מהיסטוריה = משימה **מושהית** שנושאת ב-accumulatedSec את הזמן שכבר נעשה.
// קודם: elapsed בלבד נקבע (שדה תצוגה), accumulatedSec נשאר 0 — הסגירה מוחקת אותו
// (delete done.accumulatedSec) — ו-startTime נשאר המקורי. לכן ההשהיה/סגירה הבאה חישבה
// 0 + שעון(מההתחלה המקורית → עכשיו) וספרה גם את כל הזמן שהמשימה ישבה בהיסטוריה.
// קרה חי ב-20/08/2026: שלוש משימות של 04380 תפחו מ-79/40/40 ד' ל-301/300/300 ד'.
// paused:true מוביל את ההחזרה דרך הנתיבים הבטוחים הקיימים: taskFinalDur למושהית מחזיר
// accumulatedSec בלבד, ו-_resumeTask דורס את startTime לרגע החידוש — חתימת כניסה
// (resumeWorkerTasksOnPunchIn) או "📅 המשך" ב-handlePausedTasks כשהעובדת סורקת.
// origStart מסמן שההתחלה האמיתית מוקדמת יותר: _capByAttendance מחשב תקרה מהיום הנכון,
// והמשימה מוחרגת מאשכול החפיפה ב-normalizeBatchDurations ולכן לא גוררת למטה עבודה
// אמיתית שחופפת לה (ב-20/08 הכיווץ הזה אכל 223 ד' של 00239 אצל ابوزكي ו-رشديه).
async function restoreHistTask(taskId){
  const t=S.histTasks.find(x=>x.id===taskId);
  if(!t){showToast('משימה לא נמצאה','var(--red-txt)');return;}
  const accSec=Math.max(0,Math.round(t.duration||0));
  if(!confirm(`להחזיר משימה זו למשימות פעילות?\n\n${t.prod} ${t.taskType||''}\nתחזור ⏸ מושהית עם ${fmtM(accSec)} שכבר נצברו.\nהספירה תתחדש בחתימת הכניסה הבאה או בסריקה — לא מעכשיו.`))return;
  const st=t.startTime instanceof Date?t.startTime:new Date(t.startTime);
  const restored={...t,startTime:st,
    origStart:t.origStart||st.toISOString(),
    accumulatedSec:accSec,elapsed:accSec,
    paused:true,pausedAt:srvNow().toISOString()};
  delete restored.endTime;delete restored.duration;
  S.activeTasks.push(restored);
  S.histTasks=S.histTasks.filter(x=>x.id!==taskId);
  if(S.fbConnected){
    try{await fbSet('activeTasks',String(restored.id),{...restored,startTime:restored.startTime.toISOString()});}catch(e){}
    try{await fbDel('histTasks',String(taskId));}catch(e){}
  }
  saveLS();renderTasks();renderTaskHist();
  showToast(`✅ הוחזרה ⏸ מושהית עם ${fmtM(accSec)}`,'var(--green-txt,#16a34a)');
}
// ממלא מחדש את שדה הצפי בדיאלוג העריכה לפי התמחור **הנוכחי**.
// זו הדרך היחידה לתקן expectedMin שנצרב על רשומה שכבר בהיסטוריה: recalcActiveExpected
// עוברת רק על S.activeTasks, ולכן תיקון בכרטיס המוצר לא נוגע ברשומות סגורות.
// קורא את לקוח/מוצר/כמות/שלב **מהשדות בדיאלוג** כדי לכבד עריכה שעוד לא נשמרה.
async function recalcEditExpected(taskId,isHist){
  const t=(isHist?S.histTasks:S.activeTasks).find(x=>String(x.id)===String(taskId));
  const el=document.getElementById('mf-t-exp');
  if(!t||!el)return;
  const cust=(document.getElementById('mf-t-cust')?.value||t.cust||'').padStart(2,'0').slice(0,2);
  const prod=(document.getElementById('mf-t-prod')?.value||t.prod||'').padStart(5,'0').slice(0,5);
  const qty=Math.max(0,parseInt(document.getElementById('mf-t-qty')?.value)||0);
  const tt=document.getElementById('mf-t-type')?.value||t.taskType||'';
  const ph=el.placeholder;el.disabled=true;el.placeholder='מחשב…';
  let r={ok:false};
  try{r=await fetchExpected(cust,prod,t.workerId,qty);}catch(e){console.error('recalcEditExpected:',e);}
  el.disabled=false;el.placeholder=ph;
  const v=(r&&r.ok&&r.perStep&&r.perStep[tt]!=null)?r.perStep[tt]:null;
  if(v==null){el.value='';showToast('אין תמחור לשלב הזה — הצפי נוקה','var(--amber-txt)',4000);return;}
  el.value=v;
  showToast('🎯 צפי מחושב: '+v+" דק'",'var(--green-txt)',3000);
}
function openEditTask(taskId, isHist){
  const t=isHist?S.histTasks.find(x=>x.id===taskId):S.activeTasks.find(x=>x.id===taskId);
  if(!t)return;
  S.modalAction=(isHist?'edit-hist-task:':'edit-task:')+taskId;
  document.getElementById('modal-wrap').classList.remove('hidden');
  document.getElementById('modal-title').textContent='עריכת משימה — '+t.workerName;
  const st=new Date(t.startTime);
  const stLocal=st.getFullYear()+'-'+pad2(st.getMonth()+1)+'-'+pad2(st.getDate())+'T'+pad2(st.getHours())+':'+pad2(st.getMinutes());
  const et=t.endTime?new Date(t.endTime):null;
  const etLocal=et?et.getFullYear()+'-'+pad2(et.getMonth()+1)+'-'+pad2(et.getDate())+'T'+pad2(et.getHours())+':'+pad2(et.getMinutes()):'';
  const colorOpts=Object.entries(COLORS).map(([k,v])=>`<option value="${k}" ${t.col===k?'selected':''}>${v}</option>`).join('');
  document.getElementById('modal-body').innerHTML=`
    <div class="field"><label>לקוח (2 ספרות)</label><input id="mf-t-cust" value="${t.cust}" maxlength="2" style="font-size:13px"/></div>
    <div class="field"><label>מוצר (5 ספרות)</label><input id="mf-t-prod" value="${t.prod}" maxlength="5" style="font-size:13px"/></div>
    <div class="field"><label>מידה</label><input id="mf-t-size" value="${esc(t.size||'')}" maxlength="1" placeholder="מידה (ספרה אחת)" style="font-size:13px"/></div>
    <div class="field"><label>כמות ${t.qty===0?'<span style="color:var(--amber-txt);font-size:11px">⏳ כמות פתוחה — עדכן לאחר ספירה/גזירה</span>':''}</label><input type="number" inputmode="numeric" id="mf-t-qty" value="${t.qty}" min="0" style="font-size:13px"/></div>
    <div class="field"><label>צבע</label><select id="mf-t-col" style="font-size:13px">${colorOpts}</select></div>
    <div class="field"><label>סוג משימה</label><input id="mf-t-type" value="${esc(t.taskType||'')}" style="font-size:13px"/></div>
    <div class="field"><label>🎯 צפי (דק') <span style="color:var(--txt3);font-size:11px">— ריק = בלי צפי</span></label>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="number" step="0.1" min="0" inputmode="decimal" id="mf-t-exp" value="${t.expectedMin!=null&&t.expectedMin!==''?esc(String(t.expectedMin)):''}" placeholder="ללא" style="font-size:13px;flex:1"/>
        <button type="button" class="btn" style="font-size:12px;white-space:nowrap;padding:6px 10px" onclick="recalcEditExpected('${escj(String(t.id))}',${isHist?'true':'false'})">🎯 חשב מהתמחור</button>
      </div>
      <div style="font-size:11px;color:var(--txt3);margin-top:3px">הצפי נצרב על המשימה בזמן הסריקה. שינוי תמחור מאוחר יותר <b>לא</b> מעדכן רשומה שכבר נסגרה.</div>
    </div>
    <div class="field"><label>מחלקה</label><select id="mf-t-dept" style="font-size:13px">${S.depts.map(d=>`<option value="${esc(d)}" ${(t.dept||'')=== d?'selected':''}>${esc(d)}</option>`).join('')}</select></div>
    <div class="field"><label>זמן התחלה</label><input type="datetime-local" lang="he" id="mf-t-start" value="${stLocal}" style="font-size:13px"/></div>
    <div class="field"><label>זמן סיום ${isHist?'':'(ריק = עדיין פעיל)'}</label><input type="datetime-local" lang="he" id="mf-t-end" value="${etLocal}" style="font-size:13px"/></div>`;
}

// ─── MODAL ──────────────────────────────────────────────────
function closeModal(){
  document.getElementById('modal-wrap').classList.add('hidden');
  S.modalAction=null;
}
function openModal(action,id){
  S.modalAction=action+(id?':'+id:'');
  const el=document.getElementById('modal-wrap');el.classList.remove('hidden');
  if(action==='add-worker'||action.startsWith('edit-worker')){
    const w=id?S.workers.find(x=>x.id===id):null;
    document.getElementById('modal-title').textContent=w?'עריכת עובד':'הוספת עובד חדש';
    const dOpts=S.depts.map(d=>`<option value="${esc(d)}" ${w?.dept===d?'selected':''}>${esc(d)}</option>`).join('');
    const wRole=w?.role||'worker';
    const wPerms=w?.permissions||defaultPerms(wRole==='supervisor'?ALL_SUPERVISOR_PAGE_IDS:ALL_WORKER_PAGE_IDS);
    const allPermPages=[...WORKER_PAGES,...SUPERVISOR_EXTRA_PAGES];
    const deptsWithSt=Object.entries(S.deptStations||{}).filter(([,a])=>a&&a.length);
    const skillsHtml=deptsWithSt.length?`
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:600;color:var(--txt);margin-bottom:4px">🎯 מיומנויות לפי תחנה (לשיבוץ ותמחור)</div>
        <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">— ללא — = העובד לא עובד בתחנה זו</div>
        ${deptsWithSt.map(([d,sts])=>`<div style="font-size:11px;color:var(--txt3);font-weight:600;margin:8px 0 3px">${esc(d)}</div>`+sts.map(st=>{
          const key=d+'::'+st;const cur=w?.skills?.[key]||0;
          return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="flex:1;font-size:13px;color:var(--txt)">${esc(st)}</span>
            <select class="mf-skill" data-skill="${esc(key)}" style="width:140px;font-size:12px">
              <option value="0">— ללא —</option>
              ${[1,2,3,4,5].map(l=>`<option value="${l}" ${cur===l?'selected':''}>${levelName(l,'he')} (${l})</option>`).join('')}
            </select>
          </div>`;
        }).join('')).join('')}
      </div>`:'';
    document.getElementById('modal-body').innerHTML=`
      <div class="field"><label>שם מלא</label><input id="mf-name" value="${esc(w?.name||'')}"/></div>
      <div class="field"><label>מחלקה</label><select id="mf-dept">${dOpts}</select></div>
      ${skillsHtml}
      <div class="field"><label>תפקיד</label><select id="mf-role" onchange="updatePermBoxes(this.value)">
        <option value="worker" ${wRole==='worker'?'selected':''}>עובד</option>
        <option value="helper" ${wRole==='helper'?'selected':''}>עוזר</option>
        <option value="supervisor" ${wRole==='supervisor'?'selected':''}>אחראי</option>
        <option value="manager" ${wRole==='manager'?'selected':''}>מנהל</option>
      </select></div>
      <div class="field"><label>שם משתמש</label><input id="mf-user" value="${esc(w?.user||'')}"/></div>
      <div class="field"><label>סיסמה ${w?'(ריק = ללא שינוי)':''}</label><input id="mf-pass" type="password" placeholder="${w?'...':'סיסמה'}"/></div>
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--txt)">
          <input type="checkbox" id="mf-require-ip" ${w?.requireFactoryIP?'checked':''} style="width:auto;cursor:pointer"/>
          🏭 חייב WiFi מפעל בכניסה
        </label>
        <div style="font-size:11px;color:var(--txt3);margin-top:4px">IP מפעל: ${S.settings.factoryIP||'188.225.231.120'}</div>
      </div>
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px;${w?.disabled?'border:2px solid var(--red-txt)':''}">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--txt)">
          <input type="checkbox" id="mf-disabled" ${w?.disabled?'checked':''} style="width:auto;cursor:pointer"/>
          🚫 השעיית גישה זמנית
        </label>
        <div style="font-size:11px;color:var(--txt3);margin-top:4px">העובד לא יוכל להיכנס עד שתבטל</div>
      </div>
      ${(()=>{const aw=w?.accessWindow||{};const days=Array.isArray(aw.days)?aw.days:[0,1,2,3,4];const dn=['א','ב','ג','ד','ה','ו','ש'];return `
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--txt)">
          <input type="checkbox" id="mf-aw-enabled" ${aw.enabled?'checked':''} style="width:auto;cursor:pointer" onchange="document.getElementById('mf-aw-body').style.display=this.checked?'block':'none'"/>
          ⏰ הגבלת גישה לפי ימים ושעות
        </label>
        <div id="mf-aw-body" style="display:${aw.enabled?'block':'none'};margin-top:8px">
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
            ${dn.map((d,i)=>`<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--txt2);cursor:pointer"><span>${d}</span><input type="checkbox" class="mf-aw-day" data-day="${i}" ${days.includes(i)?'checked':''} style="width:auto;cursor:pointer"/></label>`).join('')}
          </div>
          <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--txt2)">
            <span>משעה</span><input type="time" id="mf-aw-from" value="${aw.from||'06:00'}" style="font-size:12px;width:auto"/>
            <span>עד</span><input type="time" id="mf-aw-to" value="${aw.to||'16:00'}" style="font-size:12px;width:auto"/>
          </div>
          <div style="font-size:11px;color:var(--txt3);margin-top:4px">מחוץ לימים/שעות שנבחרו — כניסה תיחסם (מנהל פטור). מי שכבר מחובר ממשיך.</div>
        </div>
      </div>`;})()}
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--txt)">
          <input type="checkbox" id="mf-device-binding" ${w?.deviceBinding?'checked':''} style="width:auto;cursor:pointer"/>
          📱 נעילת מכשיר — כניסה ממכשיר קבוע בלבד
        </label>
        ${(w?.deviceRegistered||w?.deviceId)?`<div style="font-size:11px;color:var(--green-txt);margin-top:4px">✅ מכשיר רשום</div>`:(w?'<div style="font-size:11px;color:var(--txt3);margin-top:4px">⚪ מכשיר לא רשום עדיין — יירשם בכניסה הראשונה</div>':'')}
        ${w&&w.deviceBinding&&(w.deviceRegistered||w.deviceId)&&!w.faceAuth?`<div style="font-size:11px;color:var(--green-txt);margin-top:4px">🏷️ כניסה בסריקת ברקוד פעילה — העובד סורק את המדבקה שבתחנה שלו במקום סיסמה</div>`:''}
        ${w&&!w.deviceBinding&&!w.faceAuth?`<div style="font-size:11px;color:var(--txt3);margin-top:4px">💡 הפעל נעילת מכשיר כדי לאפשר לעובד להיכנס בסריקת הברקוד שלו במקום סיסמה</div>`:''}
      </div>
      ${(()=>{const gm=[['','ברירת מחדל (לפי תפקיד)'],['enforce','חל — חסימה מוחלטת'],['override','פטור — אישור עקיפה']];
        const sel=(id,cur)=>`<select id="${id}" style="font-size:12px;width:auto;flex:1">${gm.map(([v,l])=>`<option value="${v}" ${(cur||'')===v?'selected':''}>${l}</option>`).join('')}</select>`;
        const dflt=(wRole==='manager'||wRole==='supervisor')?'פטור — אישור עקיפה':'חל — חסימה מוחלטת';return `
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
        <div style="font-size:13px;color:var(--txt);font-weight:600;margin-bottom:8px">🔒🔗 על מי חלה האכיפה</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span style="font-size:12px;color:var(--txt2);min-width:104px">🔒 נעילת תחנה</span>${sel('mf-gate-station',w?.stationGateMode)}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;color:var(--txt2);min-width:104px">🔗 סדר שלבים</span>${sel('mf-gate-order',w?.stepOrderGateMode)}
        </div>
        <div style="font-size:11px;color:var(--txt3);margin-top:6px;line-height:1.5">
          ברירת המחדל לתפקיד הנוכחי: <b>${dflt}</b>. שנה כאן כדי לגבור עליה — למשל אחראי שעובד על הרצפה ואמור להיחסם כמו כל עובד.
          פעיל רק כשמתג האכיפה עצמו דלוק. <b>כל עקיפה וכל חסימה נרשמות ביומן</b> (לשונית 🏷️ ברקודים ← "📝 יומן שערים").
        </div>
      </div>`;})()}
      ${wRole==='manager'?'':(()=>{const vto=w?.voiceTo||[],others=S.workers.filter(x=>x.id!==w?.id&&!x.disabled),
        deps=[...new Set(others.map(x=>x.dept||'—'))];return `
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:13px;color:var(--txt);font-weight:600;min-width:104px">🎙 מכשיר קשר</span>
          <select id="mf-voice" onchange="document.getElementById('mf-vto').style.display=this.value==='open'?'block':'none'" style="font-size:12px;width:auto;flex:1;min-width:0;max-width:100%">${[['','רק תשובה'],['open','פתוח — לנמענים שבחרתי'],['off','האזנה בלבד']].map(([v,l])=>`<option value="${v}" ${(w?.voiceMode||'')===v?'selected':''}>${l}</option>`).join('')}</select>
        </div>
        <div id="mf-vto" style="display:${(w?.voiceMode||'')==='open'?'block':'none'};margin-top:8px;max-height:220px;overflow:auto;border:0.5px solid var(--b);border-radius:8px;padding:6px 8px;background:var(--bg)">
          <div style="font-size:11px;color:var(--txt3);margin-bottom:4px">למי מותר לו/לה לפנות (בלי סימון — מנהלים ואחראים):</div>
          ${deps.map(d=>`<div style="margin-top:6px"><label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" style="width:auto" onchange="this.closest('div').querySelectorAll('.mf-vto').forEach(c=>c.checked=this.checked)"> 🏭 ${esc(d)}</label>
            <div style="display:flex;flex-wrap:wrap;gap:4px 12px;padding-right:20px">${others.filter(x=>(x.dept||'—')===d).map(x=>`<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" class="mf-vto" data-id="${esc(x.id)}" style="width:auto" ${vto.includes(x.id)?'checked':''}>${x.role==='manager'?'👑 ':x.role==='supervisor'?'⭐ ':''}${esc(x.name)}</label>`).join('')}</div></div>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--txt3);margin-top:6px">רק המנהל פתוח לכולם ושומע את כל השיחות. גם אחראי — רק למי שמסומן כאן. "רק תשובה" = משיב/ה למי שפנה אליו/ה.</div>
      </div>`;})()}
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--txt)">
          <input type="checkbox" id="mf-face-auth" ${w?.faceAuth?'checked':''} style="width:auto;cursor:pointer"/>
          דרוש זיהוי פנים בכניסה
        </label>
        ${w?`<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--txt3)">${(w.faceRegistered||w.faceDescriptor||w.faceDescriptors&&Object.keys(w.faceDescriptors).length)?'✅ פנים רשומים':'⚠️ פנים לא רשומים'}</span>
          <button type="button" class="btn" style="font-size:11px;padding:4px 10px" onclick="closeModal();allowFaceUpdateByAdmin('${w.id}')">📸 ${(w.faceRegistered||w.faceDescriptor||w.faceDescriptors&&Object.keys(w.faceDescriptors).length)?'אשר עדכון פנים לעובד':'אשר רישום פנים לעובד'}</button>
        </div>`:'<div style="font-size:11px;color:var(--txt3);margin-top:6px">שמור עובד תחילה, אחר כך רשום פנים</div>'}
      </div>
      <div class="field" style="background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-top:8px" id="mf-push-box">
        <div style="font-size:12px;font-weight:600;color:var(--txt);margin-bottom:8px">🔔 התראות Push ${wRole==='supervisor'?'— מה האחראי מקבל על כל העובדים':'לעובד זה'}</div>
        ${wRole==='supervisor'?`<div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-ov-punch_in" ${(w?.oversightPrefs?.punch_in!==false)?'checked':''} style="width:auto;cursor:pointer"/> 🟢 כניסות עובדים</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-ov-punch_out" ${(w?.oversightPrefs?.punch_out!==false)?'checked':''} style="width:auto;cursor:pointer"/> 🔴 יציאות עובדים</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-ov-task_start" ${(w?.oversightPrefs?.task_start!==false)?'checked':''} style="width:auto;cursor:pointer"/> 🔧 התחלות משימה</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-ov-task_end" ${(w?.oversightPrefs?.task_end!==false)?'checked':''} style="width:auto;cursor:pointer"/> ✅ סיומי משימה</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-ov-worker_msg" ${(w?.oversightPrefs?.worker_msg!==false)?'checked':''} style="width:auto;cursor:pointer"/> 💬 הודעות עבודה מעובדים</label>
          <div style="font-size:11px;color:var(--txt3)">משימה ארוכה + WiFi נשלטים ברשימה הראשית (משותף עם המנהל)</div>
        </div>`:''}
        <div style="display:${wRole==='supervisor'?'none':'flex'};flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-long" ${(w?.pushPrefs?.task_long!==false)?'checked':''} style="width:auto;cursor:pointer"/>
            ⚠️ התראה על משימה ארוכה
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-msg" ${(w?.pushPrefs?.manager_msg!==false)?'checked':''} style="width:auto;cursor:pointer"/>
            💬 הודעה ממנהל
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-task" ${(w?.pushPrefs?.task_assigned!==false)?'checked':''} style="width:auto;cursor:pointer"/>
            📋 שיוך משימה חדשה
          </label>
          <div style="border-top:0.5px solid var(--b);margin:2px 0"></div>
          <div style="font-size:11px;color:var(--txt3)">התראות על הפעילות שלו עצמו (ברירת מחדל כבוי):</div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-checkin" ${(w?.pushPrefs?.own_checkin===true)?'checked':''} style="width:auto;cursor:pointer"/>
            🟢 כניסה שלו
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-checkout" ${(w?.pushPrefs?.own_checkout===true)?'checked':''} style="width:auto;cursor:pointer"/>
            🔴 יציאה שלו
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-tstart" ${(w?.pushPrefs?.own_task_start===true)?'checked':''} style="width:auto;cursor:pointer"/>
            🔧 התחלת משימה שלו
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer">
            <input type="checkbox" id="mf-push-tend" ${(w?.pushPrefs?.own_task_end===true)?'checked':''} style="width:auto;cursor:pointer"/>
            ✅ סיום משימה שלו
          </label>
        </div>
        <div id="mf-push-reg">${_mfPushRegHtml(!!w?.fcmToken)}</div>
      </div>
      <div class="field" id="mf-perms-box" style="display:${wRole==='manager'?'none':'block'}">
        <label>הרשאות גישה</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
          ${WORKER_PAGES.map(p=>`<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-perm-${p.id}" ${wPerms.includes(p.id)?'checked':''} style="width:auto;cursor:pointer"/> ${p.label}</label>`).join('')}
          <div id="mf-supervisor-perms" style="display:${wRole==='supervisor'?'contents':'none'}">
            ${SUPERVISOR_EXTRA_PAGES.map(p=>`<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--txt);cursor:pointer"><input type="checkbox" id="mf-perm-${p.id}" ${wPerms.includes(p.id)?'checked':''} style="width:auto;cursor:pointer"/> ${p.label}</label>`).join('')}
          </div>
        </div>
      </div>`;
    if(w)_mfPushRegCheck(w.id);
  }
}
// ✅/⚪ טלפון רשום (11/11/2026): לא רק fcmToken הישן — גם מכשיר ב-pushSettings.tokens עם workerId שלו (כך נרשמים היום)
function _mfPushRegHtml(ok,n){return ok?`<div style="font-size:11px;color:var(--green-txt);margin-top:6px">✅ טלפון רשום לקבלת Push${n>1?` (${n} מכשירים)`:''}</div>`:'<div style="font-size:11px;color:var(--txt3);margin-top:6px">⚪ טלפון לא רשום עדיין</div>';}
async function _mfPushRegCheck(id){
  try{const d=await fbGet('appSettings','pushSettings');
    const n=Object.values(d?.tokens||{}).filter(t=>t&&t.token&&String(t.workerId)===String(id)).length;
    const w=S.workers.find(x=>String(x.id)===String(id)),el=document.getElementById('mf-push-reg');
    if(el)el.innerHTML=_mfPushRegHtml(n>0||!!w?.fcmToken,n);
  }catch(e){}
}
async function allowFaceUpdateByAdmin(id){
  const w=S.workers.find(x=>x.id===id);if(!w)return;
  w.faceUpdateAllowed=true;
  if(S.fbConnected)await fbSet('workers',w.id,{faceUpdateAllowed:true});
  saveLS();renderAdmin();
  alert('✅ '+w.name+' יכול עכשיו לעדכן פנים מהטלפון שלו\nהעובד יראה כפתור "עדכן פנים" במסך הכניסה');
}
async function resetDeviceBinding(id){
  const w=S.workers.find(x=>x.id===id);if(!w)return;
  if(!confirm('לאפס מכשיר של '+w.name+'?\nבכניסה הבאה יירשם מכשיר חדש.'))return;
  try{
    const{httpsCallable}=window._fb;
    await httpsCallable(window._fbFunctions,'updateCredentials')({action:'resetDevice',targetId:id});
    w.deviceRegistered=false;delete w.deviceId;
    saveLS();renderAdmin();
    showToast('✅ מכשיר '+w.name+' אופס — יכול להיכנס ממכשיר חדש');
  }catch(e){alert('שגיאה באיפוס מכשיר: '+e.message);}
}
async function toggleFaceUpdate(id){
  const w=S.workers.find(x=>x.id===id);if(!w)return;
  w.faceUpdateAllowed=!w.faceUpdateAllowed;
  if(S.fbConnected)await fbSet('workers',w.id,{faceUpdateAllowed:w.faceUpdateAllowed});
  saveLS();renderAdmin();
}
async function workerUpdateFace(){
  if(!S.user)return;
  const w=S.workers.find(x=>x.id===S.user.id);
  if(!w||!w.faceUpdateAllowed){alert('אין אישור לעדכון פנים');return;}
  _faceRegWorkerId=w.id;
  _faceRegSamples=[];
  const btn=document.getElementById('face-reg-btn');
  btn.textContent='📸 צלם דגימה 1/5';
  btn.onclick=_workerCaptureFace;
  document.getElementById('face-reg-title').textContent='עדכון פנים — '+esc(w.name);
  document.getElementById('face-reg-status').textContent='טוען מודלי זיהוי...';
  btn.disabled=true;
  document.querySelector('#face-reg-screen .btn:not(.primary)').style.display='none';
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('face-reg-screen').classList.remove('hidden');
  const ok=await loadFaceModels();
  if(!ok){document.getElementById('face-reg-status').textContent='שגיאה בטעינת מודלים';return;}
  try{
    _faceRegStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const video=document.getElementById('face-reg-video');
    video.srcObject=_faceRegStream;
    await new Promise(r=>video.onloadedmetadata=r);
    document.getElementById('face-reg-status').textContent='מצלמה פעילה — לחץ "צלם דגימה 1/5"';
    btn.disabled=false;
  }catch(e){
    document.getElementById('face-reg-status').innerHTML='⛔ הגישה למצלמה נחסמה.<br><button class="btn" style="margin-top:8px;font-size:13px" onclick="workerUpdateFace()">🔄 נסה שוב</button>';
  }
}
async function _workerCaptureFace(){
  const video=document.getElementById('face-reg-video');
  const statusEl=document.getElementById('face-reg-status');
  const btnEl=document.getElementById('face-reg-btn');
  statusEl.textContent='מזהה פנים...';
  btnEl.disabled=true;
  const opts=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:0.5});
  const det=await faceapi.detectSingleFace(video,opts).withFaceLandmarks(true).withFaceDescriptor();
  if(!det){statusEl.textContent='לא זוהו פנים — נסה שוב';btnEl.disabled=false;return;}
  // תצוגה מקדימה לאישור
  window._pendingDescriptor=Array.from(det.descriptor);
  window._faceRegWorkerMode=true;
  const canvas=document.getElementById('face-reg-preview-canvas');
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d');
  ctx.save();ctx.scale(-1,1);ctx.drawImage(video,-video.videoWidth,0);ctx.restore();
  document.getElementById('face-reg-preview-box').style.display='';
  document.getElementById('face-reg-capture-box').style.display='none';
  statusEl.textContent='בדוק שהפנים בתמונה הם של העובד הנכון';
  return;
  // המשך ב-faceRegConfirm()
}
async function _workerFaceRegDone(){
  const video=document.getElementById('face-reg-video');
  // 5 דגימות — שמירה ב-credentials דרך Cloud Function
  const w=S.workers.find(x=>x.id===_faceRegWorkerId);
  if(w){
    try{
      const{httpsCallable}=window._fb;
      await httpsCallable(window._fbFunctions,'updateCredentials')({action:'registerFace',targetId:w.id,descriptors:_faceRegSamples.slice()});
      w.faceRegistered=true;w.faceUpdateAllowed=false;
      saveLS();
      sendFaceRegPhotos(w.name,[..._faceRegSnaps]);
    }catch(e){alert('שגיאה בשמירת פנים: '+e.message);}
  }
  _faceRegSamples=[];_faceRegSnaps=[];
  if(_faceRegStream){_faceRegStream.getTracks().forEach(t=>t.stop());_faceRegStream=null;}
  document.getElementById('face-reg-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.querySelector('#face-reg-screen .btn:not(.primary)').style.display='';
  document.getElementById('face-reg-btn').textContent='📸 צלם דגימה 1/5';
  document.getElementById('face-reg-btn').onclick=captureFaceDescriptor;
  alert('✅ פנים עודכנו בהצלחה!');
  renderAtt();
}
// שלב 2 אבטחה: סיסמאות נשמרות רק ב-credentials דרך Cloud Function — לא בדפדפן ולא ב-workers
async function _setWorkerPassword(id,pass){
  const{httpsCallable}=window._fb;
  await httpsCallable(window._fbFunctions,'updateCredentials')({action:'setPassword',targetId:id,newPass:pass});
}
async function resetPass(id){
  const w=S.workers.find(x=>x.id===id);if(!w)return;
  const newPass=prompt(`איפוס סיסמה עבור ${w.name}\nהזן סיסמה חדשה:`);
  if(!newPass||!newPass.trim()){return;}
  try{
    await _setWorkerPassword(w.id,newPass.trim());
    alert(`✅ סיסמה עודכנה עבור ${w.name}`);
  }catch(e){alert('שגיאה בעדכון סיסמה: '+e.message);}
}
// 🎙 רשימת הנמענים שסומנו בכרטיס — נשמרת רק כשהמצב "פתוח" (אחרת ריקה)
const _mfVoiceTo=()=>document.getElementById('mf-voice')?.value==='open'?[...document.querySelectorAll('.mf-vto:checked')].map(c=>c.dataset.id):[];
async function confirmModal(){
  // edit-att
  if(S.modalAction?.startsWith('edit-att:')){
    const wId=S.modalAction.split(':')[1];
    const w=S.workers.find(x=>x.id===wId);if(!w){closeModal();return;}
    const date=document.getElementById('mf-att-date')?.value||todayStr();
    const rows=document.querySelectorAll('#sessions-container .sess-row');
    const newSessions=[];
    rows.forEach(row=>{
      const inEl=row.querySelector('.sess-in');
      const outEl=row.querySelector('.sess-out');
      if(inEl?.value)newSessions.push({in:new Date(date+'T'+inEl.value).toISOString(),out:outEl?.value?new Date(date+'T'+outEl.value).toISOString():null});
    });
    const today=todayStr();
    if(date===today){
      // עדכון נוכחות היום
      w.sessions=newSessions;
      const openSess=newSessions.find(s=>!s.out);
      w.status=openSess?'in':'out';
      w.checkin=newSessions[0]?.in||null;
      w.checkout=!openSess&&newSessions.length?newSessions[newSessions.length-1].out:null;
      // העובד יצא — להשהות את המשימות לשעה שהוקלדה (לא לסגור). ראה reanchorWorkerTasks
      if(!openSess){
        const checkoutTime=w.checkout?new Date(w.checkout):new Date();
        await reanchorWorkerTasks(w.id,checkoutTime);
      }
      if(S.fbConnected)await fbSet('workers',w.id,attFields(w));
    } else {
      // עדכון רשומה היסטורית — שמור נתוני הפסקה מקוריים
      const idx=S.attHistory.findIndex(r=>r.workerId===wId&&r.date===date);
      const orig=idx>=0?S.attHistory[idx]:null;
      // עדיפות להגדרות העובד הנוכחיות
      const brkActive=w.breakActive??orig?.breakActive??false;
      const brkStart=w.breakStart||orig?.breakStart||'';
      const brkEnd=w.breakEnd||orig?.breakEnd||'';
      // חישוב netMs עם ניכוי הפסקה
      const netMs=newSessions.reduce((sum,s)=>{
        if(!s.in)return sum;
        const ci=new Date(s.in).getTime();
        const co=s.out?new Date(s.out).getTime():ci;
        let dur=co-ci;
        if(brkActive&&brkStart&&brkEnd){
          const ref=new Date(s.in).toDateString();
          const bs=new Date(ref+' '+brkStart).getTime();
          const be=new Date(ref+' '+brkEnd).getTime();
          if(be>bs){const os=Math.max(ci,bs);const oe=Math.min(co,be);if(oe>os)dur-=(oe-os);}
        }
        return sum+Math.max(0,dur);
      },0);
      const rec={workerId:w.id,workerName:w.name,dept:w.dept,date,
        sessions:newSessions,checkin:newSessions[0]?.in||null,
        checkout:newSessions[newSessions.length-1]?.out||null,
        breakStart:brkStart,breakEnd:brkEnd,breakActive:brkActive,netMs};
      if(idx>=0)S.attHistory[idx]=rec;else S.attHistory.unshift(rec);
      if(S.fbConnected)await fbSet('attHistory',w.id+'_'+date,rec);
      saveLS();renderAtt();renderMgrTasks();
      // הצג אישור בתוך החלון ואל תסגור — אפשר להמשיך לתאריך אחר
      const fb=document.createElement('div');
      fb.style.cssText='color:var(--green-txt);font-size:12px;font-weight:600;margin-top:8px;text-align:center';
      fb.textContent='✅ נשמר — שנה תאריך לעריכת יום אחר';
      document.getElementById('modal-body')?.appendChild(fb);
      setTimeout(()=>fb.remove(),3000);
      return;
    }
    saveLS();closeModal();renderAtt();renderMgrTasks();return;
  }
  // edit-task (פעיל)
  if(S.modalAction?.startsWith('edit-task:')){
    const taskId=S.modalAction.split(':')[1];
    const t=S.activeTasks.find(x=>x.id===taskId);if(!t){closeModal();return;}
    t.cust=(document.getElementById('mf-t-cust')?.value||'').padStart(2,'0').slice(0,2);
    t.prod=(document.getElementById('mf-t-prod')?.value||'').padStart(5,'0').slice(0,5);
    t.size=document.getElementById('mf-t-size')?.value||t.size||'';
    const _qtyVal=document.getElementById('mf-t-qty')?.value;t.qty=_qtyVal!==''&&_qtyVal!==undefined?Math.max(0,parseInt(_qtyVal)||0):t.qty;
    t.col=document.getElementById('mf-t-col')?.value||t.col;
    t.taskType=document.getElementById('mf-t-type')?.value||'';
    t.dept=document.getElementById('mf-t-dept')?.value||t.dept||'';
    // צפי ידני. ריק/0 = הסרת הצפי — **null ולא delete**, כי fbSet הוא merge:true ואינו
    // מוחק שדה בשרת (אותו שיקול כמו origStart למטה). `+null>0` שקר ⇒ אין תג ואין התראת חריגה.
    const _expVal=document.getElementById('mf-t-exp')?.value;
    if(_expVal!==undefined)t.expectedMin=(parseFloat(_expVal)>0)?parseFloat(_expVal):null;
    const stVal=document.getElementById('mf-t-start')?.value;
    // מנהל שהזין התחלה ידנית = מקור האמת; מאפסים את origStart (null ולא delete — merge:true
    // בשרת לא מוחק שדה) כדי שלא יוצג "התחילה ביום X" סותר ושהתקרה תחושב מהערך הידני
    if(stVal){t.startTime=new Date(stVal);t.origStart=null;}
    const etVal=document.getElementById('mf-t-end')?.value;
    if(etVal){
      // יש זמן סיום — העבר להיסטוריה
      const endTime=new Date(etVal);
      if(endTime.getTime()-Date.now()>3600000){
        if(!await showConfirm('⚠ זמן סיום עתידי','זמן הסיום שהזנת (' +pad2(endTime.getHours())+':'+pad2(endTime.getMinutes())+ ') רחוק מהשעה הנוכחית ביותר משעה. להמשיך בכל זאת?','כן, שמור','בטל'))return;
      }
      // צביר = טיימר אחד משותף. בלי החלוקה כל שורה נושאת את הזמן המלא (רائده 03/08: 4 שורות
      // × 14,825 שנ' = 16.5 שע' בחלון של 4.1), והסוגר הלילי מנרמל אותן ב-23:30 במקומנו.
      const _dur=Math.round(taskFinalDur(t,endTime)*_batchShare(t));
      // ⚠️ elapsed חייב ללכת עם החלון הידני. הסוגר הלילי (functions/index.js:990/993) מעדיף
      // את elapsed/accumulatedSec כשהם קטנים מ-duration, ולכן תיקון ידני שלא עדכן אותם נמחק
      // ב-23:30 בשקט (ايمان: duration 5580 מול elapsed 36 ⇒ חיתוך ל-36 שניות). וגם:
      // origStart מאופס שתי שורות מעל, ולכן `if (t.origStart) continue` (שורה 988) *לא* מדלג.
      const done={...t,endTime,duration:_dur,elapsed:_dur,..._closeMeta('edit_end')};
      delete done.paused;delete done.pausedAt;delete done.accumulatedSec;
      S.histTasks.unshift(done);
      S.activeTasks=S.activeTasks.filter(x=>x.id!==t.id);
      if(S.fbConnected){await fbDel('activeTasks',t.id);await fbSet('histTasks',t.id,{...done,startTime:done.startTime instanceof Date?done.startTime.toISOString():done.startTime,endTime:endTime.toISOString()});}
    } else {
      if(S.fbConnected)await fbUpdateOnly('activeTasks',t.id,{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime});
    }
    saveLS();closeModal();renderTasks();renderMgrTasks();return;
  }
  // edit-hist-task (שהסתיים)
  if(S.modalAction?.startsWith('edit-hist-task:')){
    const taskId=S.modalAction.split(':')[1];
    const t=S.histTasks.find(x=>x.id===taskId);if(!t){closeModal();return;}
    t.cust=(document.getElementById('mf-t-cust')?.value||'').padStart(2,'0').slice(0,2);
    t.prod=(document.getElementById('mf-t-prod')?.value||'').padStart(5,'0').slice(0,5);
    t.size=document.getElementById('mf-t-size')?.value||t.size||'';
    const _qtyVal=document.getElementById('mf-t-qty')?.value;t.qty=_qtyVal!==''&&_qtyVal!==undefined?Math.max(0,parseInt(_qtyVal)||0):t.qty;
    t.col=document.getElementById('mf-t-col')?.value||t.col;
    t.taskType=document.getElementById('mf-t-type')?.value||'';
    t.dept=document.getElementById('mf-t-dept')?.value||t.dept||'';
    // צפי ידני. ריק/0 = הסרת הצפי — **null ולא delete**, כי fbSet הוא merge:true ואינו
    // מוחק שדה בשרת (אותו שיקול כמו origStart למטה). `+null>0` שקר ⇒ אין תג ואין התראת חריגה.
    const _expVal=document.getElementById('mf-t-exp')?.value;
    if(_expVal!==undefined)t.expectedMin=(parseFloat(_expVal)>0)?parseFloat(_expVal):null;
    const stVal=document.getElementById('mf-t-start')?.value;
    // מנהל שהזין התחלה ידנית = מקור האמת; מאפסים את origStart (null ולא delete — merge:true
    // בשרת לא מוחק שדה) כדי שלא יוצג "התחילה ביום X" סותר ושהתקרה תחושב מהערך הידני
    if(stVal){t.startTime=new Date(stVal);t.origStart=null;}
    const etVal=document.getElementById('mf-t-end')?.value;
    if(etVal){
      const newEnd=new Date(etVal);
      if(newEnd.getTime()-Date.now()>3600000){
        if(!await showConfirm('⚠ זמן סיום עתידי','זמן הסיום שהזנת (' +pad2(newEnd.getHours())+':'+pad2(newEnd.getMinutes())+ ') רחוק מהשעה הנוכחית ביותר משעה. להמשיך בכל זאת?','כן, שמור','בטל'))return;
      }
      // גם כאן החלון הידני הוא של הצביר כולו, לא של שורה בודדת — ראה _batchShare
      t.endTime=newEnd;t.duration=Math.round(((t.endTime-new Date(t.startTime))/1000)*_batchShare(t));
      // elapsed נגרר לחלון הידני — אחרת הסוגר הלילי מחזיר את הערך הישן ב-23:30 (ראה edit-task)
      t.elapsed=t.duration;
    }
    if(S.fbConnected)await fbSet('histTasks',t.id,{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime,endTime:t.endTime instanceof Date?t.endTime.toISOString():t.endTime});
    saveLS();closeModal();renderTasks();renderMgrTasks();buildRep();return;
  }
  const name=document.getElementById('mf-name')?.value.trim();
  const dept=document.getElementById('mf-dept')?.value;
  const role=document.getElementById('mf-role')?.value;
  const user=document.getElementById('mf-user')?.value.trim();
  const pass=document.getElementById('mf-pass')?.value.trim();
  if(!name||!user){alert('שם ושם משתמש הם שדות חובה');return;}
  const perms=role==='manager'?ALL_SUPERVISOR_PAGE_IDS:[...ALL_WORKER_PAGE_IDS,...SUPERVISOR_EXTRA_PAGES.map(p=>p.id)].filter(id=>document.getElementById('mf-perm-'+id)?.checked);
  // מיומנויות לפי תחנה — נאספות רק אם יש תחנות מוגדרות (אחרת ה-selects לא קיימים)
  const skillEls=document.querySelectorAll('.mf-skill');
  let skills=null;
  if(skillEls.length){skills={};skillEls.forEach(s=>{const v=parseInt(s.value)||0;if(v)skills[s.dataset.skill]=v;});}
  if(S.modalAction==='add-worker'){
    if(!pass){alert('סיסמה חובה לעובד חדש');return;}
    if(!S.fbConnected){alert('אין חיבור לשרת — לא ניתן להוסיף עובד');return;}
    const nw={id:'w'+Date.now(),name,dept,role,user,status:'out',checkin:null,permissions:perms,faceAuth:false,breakStart:defBreakStart(),breakEnd:defBreakEnd(),breakActive:true,skills:skills||{},
      stationGateMode:document.getElementById('mf-gate-station')?.value||'',
      stepOrderGateMode:document.getElementById('mf-gate-order')?.value||'',
      voiceMode:document.getElementById('mf-voice')?.value||'',voiceTo:_mfVoiceTo()};
    S.workers.push(nw);
    await fbSet('workers',nw.id,nw);
    try{await _setWorkerPassword(nw.id,pass);}catch(e){alert('העובד נוצר אך שמירת הסיסמה נכשלה: '+e.message);}
  } else if(S.modalAction?.startsWith('edit-worker:')){
    const id=S.modalAction.split(':')[1];
    const w=S.workers.find(x=>x.id===id);
    if(w){w.name=name;w.dept=dept;w.role=role;w.user=user;w.permissions=perms;
    if(skills!==null)w.skills=skills;
    w.disabled=!!document.getElementById('mf-disabled')?.checked;
    w.requireFactoryIP=!!document.getElementById('mf-require-ip')?.checked;
    if(document.getElementById('mf-aw-enabled')?.checked){
      w.accessWindow={enabled:true,days:[...document.querySelectorAll('.mf-aw-day:checked')].map(x=>+x.dataset.day),from:document.getElementById('mf-aw-from')?.value||'06:00',to:document.getElementById('mf-aw-to')?.value||'16:00'};
    }else{w.accessWindow={enabled:false};}
    w.deviceBinding=!!document.getElementById('mf-device-binding')?.checked;
    w.stationGateMode=document.getElementById('mf-gate-station')?.value||'';
    w.stepOrderGateMode=document.getElementById('mf-gate-order')?.value||'';
    if(document.getElementById('mf-voice')){w.voiceMode=document.getElementById('mf-voice').value;w.voiceTo=_mfVoiceTo();}
    w.faceAuth=!!document.getElementById('mf-face-auth')?.checked;
    if(w.role==='supervisor'){
      w.oversightPrefs={punch_in:!!document.getElementById('mf-ov-punch_in')?.checked,punch_out:!!document.getElementById('mf-ov-punch_out')?.checked,task_start:!!document.getElementById('mf-ov-task_start')?.checked,task_end:!!document.getElementById('mf-ov-task_end')?.checked,worker_msg:!!document.getElementById('mf-ov-worker_msg')?.checked};
    }else{
      w.pushPrefs={task_long:!!document.getElementById('mf-push-long')?.checked,manager_msg:!!document.getElementById('mf-push-msg')?.checked,task_assigned:!!document.getElementById('mf-push-task')?.checked,own_checkin:!!document.getElementById('mf-push-checkin')?.checked,own_checkout:!!document.getElementById('mf-push-checkout')?.checked,own_task_start:!!document.getElementById('mf-push-tstart')?.checked,own_task_end:!!document.getElementById('mf-push-tend')?.checked};
    }
    if(pass){try{await _setWorkerPassword(w.id,pass);}catch(e){alert('שמירת הסיסמה נכשלה: '+e.message);}}
    if(S.fbConnected)await fbSet('workers',w.id,workerNoAtt(w));}
  }
  saveLS();closeModal();renderAdmin();
}
async function delWorker(id){
  const hasActive=S.activeTasks.some(t=>t.workerId===id);
  if(hasActive){alert('לא ניתן למחוק עובד עם משימה פעילה — סיים את המשימה תחילה');return;}
  const w=S.workers.find(x=>x.id===id);
  if(!confirm(`למחוק את ${w?.name||'העובד'}? פעולה זו אינה הפיכה.`))return;
  S.workers=S.workers.filter(w=>w.id!==id);
  if(S.fbConnected)await fbDel('workers',id);
  saveLS();renderAdmin();
}
function saveDepts(){
  saveLS();
  // setDoc בלי merge: fbSet (merge) משאיר מפתחות מחלקה ישנים בתוך המפות stations/stageMap אחרי שינוי שם
  if(S.fbConnected&&db){const{doc,setDoc}=window._fb;setDoc(doc(db,'appSettings','depts'),{list:S.depts,stations:S.deptStations||{},stageMap:S.deptStageMap||{}}).catch(e=>console.error('saveDepts:',e.message));}
}
// עדכון שדות ספציפיים עם החלפה מלאה של ערכם (updateDoc) — בניגוד ל-fbSet (merge:true)
// שממזג מפות ומשאיר בהן מפתחות ישנים. חובה בשינוי שם: מפת skills חייבת החלפה, לא מיזוג.
async function fbReplaceFields(col,id,fields){
  if(!db)return;
  const{doc,updateDoc}=window._fb;
  await _pw(updateDoc(doc(db,col,id),_splitPricing(col,id,fields)));
}
function addDept(){
  const v=document.getElementById('new-dept').value.trim();
  if(!v||S.depts.includes(v)){alert(!v?'הזן שם מחלקה':'מחלקה כבר קיימת');return;}
  S.depts.push(v);document.getElementById('new-dept').value='';
  saveDepts();renderAdmin();
}
function delDept(d){
  if(S.workers.some(w=>w.dept===d)){alert('לא ניתן למחוק מחלקה שיש בה עובדים');return;}
  S.depts=S.depts.filter(x=>x!==d);
  if(S.deptStations)delete S.deptStations[d];
  if(S.deptStageMap)delete S.deptStageMap[d];
  saveDepts();renderAdmin();
}
// מיפוי מחלקה→שלב ייצור: סריקה במחלקה זו תסמן אוטומטית את השלב בדוח "ייצור לפי שלב"
function setDeptStage(d,stageId){
  if(!S.deptStageMap)S.deptStageMap={};
  if(stageId)S.deptStageMap[d]=stageId;else delete S.deptStageMap[d];
  saveDepts();
}
// עדכון אוטומטי של שלב הייצור כשעובד סורק משימה במחלקה ממופה
async function autoStampStage(cust,prod,dept){
  const stageId=S.deptStageMap?.[dept];
  if(!stageId)return;
  const p=findProd(String(cust),String(prod));
  if(!p)return;
  if(!Array.isArray(p.stageLog))p.stageLog=[];
  if(p.stageLog.some(s=>s.id===stageId))return; // השלב כבר מסומן — לא לדרוס תאריך ידני
  const now=new Date();
  const date=now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
  const time=pad2(now.getHours())+':'+pad2(now.getMinutes());
  p.stageLog.push({id:stageId,date,time,note:'',auto:true});
  // שמירה על סדר PROD_STAGES כדי ש"השלב הנוכחי" (האחרון) יהיה המתקדם ביותר
  p.stageLog.sort((a,b)=>PROD_STAGES.findIndex(x=>x.id===a.id)-PROD_STAGES.findIndex(x=>x.id===b.id));
  saveLS();
  if(S.fbConnected)try{await fbSet('products',p.id,{...p});}catch(e){}
}
