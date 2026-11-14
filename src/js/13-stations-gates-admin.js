// ─── MANAGER TASKS ──────────────────────────────────────────
function renderMgrTasks(){
  if(S.user?.role!=='manager')return;
  const T=LANGS[currentLang];
  fillDeptSelects();
  // נוכחות עובדים
  const al=document.getElementById('mgr-att-list');
  if(al){
    const bulk=window._mgrBulkMode||false;
    al.innerHTML=S.workers.map(w=>{
      const isIn=w.status==='in';
      const ci=w.checkin?new Date(w.checkin):null;
      const co=w.checkout?new Date(w.checkout):null;
      const ciStr=ci?pad2(ci.getHours())+':'+pad2(ci.getMinutes()):'—';
      const coStr=co?pad2(co.getHours())+':'+pad2(co.getMinutes()):'—';
      const netMs=calcNetWork(w);
      const chk=bulk&&!isIn?`<input type="checkbox" id="bchk-${esc(w.id)}" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--green-txt)" onchange="mgrBulkCount()">`:'';
      return`<div class="row" style="flex-wrap:wrap;gap:8px;${bulk&&isIn?'opacity:.45':''}">
        ${chk}
        <div class="av" style="width:30px;height:30px;font-size:10px;flex-shrink:0">${esc(w.name.split(' ').map(n=>n[0]).join(''))}</div>
        <div style="flex:1;min-width:100px">
          <div style="font-size:13px;font-weight:500">${esc(w.name)}</div>
          <div style="font-size:11px;color:var(--txt3)">${esc(w.dept)} · ▶${ciStr} ◀${coStr} · <span style="color:var(--blue-txt)">${netMs?fmtNetH(netMs):''}</span>${isIn&&curStation(w)?.name?` · <span style="color:var(--green-txt)">📍 ${esc(curStation(w).name)}</span>`:''}</div>
        </div>
        ${!bulk?`<span class="badge ${isIn?'green':'red'}" style="align-self:center">${isIn?'<span class="pulse"></span> בעבודה':'יצא/ה'}</span>`:''}
        ${!bulk&&!isIn?`<button class="btn success" style="font-size:11px;padding:5px 12px" onclick="mgrPunchIn('${w.id}')">✅ כניסה</button>`:''}
        ${!bulk&&isIn?`<button class="btn danger" style="font-size:11px;padding:5px 12px" onclick="mgrPunchOut('${w.id}')">🚪 יציאה</button>`:''}
        ${!bulk&&isIn?`<button class="btn" style="font-size:11px;padding:5px 10px" onclick="mgrSendMsg('${w.id}','${escj(w.name)}')" title="שלח הודעה לעובד">📢</button>`:''}
        <button class="btn" style="font-size:11px;padding:5px 10px" onclick="mgrEditAtt('${w.id}')" title="עריכת שעות">✏️</button>
      </div>`;
    }).join('');
  }
  // populate worker select
  const sel=document.getElementById('mgr-emp-sel');
  if(sel){
    const prev=sel.value;
    const selW=LANGS[currentLang].sel_worker||'בחר עובד...';
    sel.innerHTML=`<option value="">${selW}</option>`+S.workers.filter(w=>w.status==='in').map(w=>`<option value="${esc(w.id)}">${esc(w.name)} (${esc(w.dept)})</option>`).join('');
    if(prev)sel.value=prev;
  }
  // active tasks list
  const el=document.getElementById('mgr-active-tasks-list');
  if(el){
    if(!S.activeTasks.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:1rem 0;text-align:center">אין משימות פעילות</div>';}
    else{el.innerHTML=S.activeTasks.map(t=>`
      <div class="row">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${esc(t.workerName)}</div>
          <div style="font-size:11px;color:var(--txt3)">לקוח ${t.cust} | ${t.prod}${taskOrderLbl(t)?' '+taskOrderLbl(t):''}${t.size?' | מידה '+t.size:''} | ${t.qty} יח'</div>
          <div style="font-size:11px;color:var(--txt3)">▶ ${(()=>{const d=new Date(t.startTime);return pad2(d.getHours())+':'+pad2(d.getMinutes());})()}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn" style="font-size:11px;padding:4px 10px" onclick="openEditTask('${t.id}')">✏️ ערוך</button>
          <button class="btn" style="font-size:11px;padding:4px 10px;color:var(--blue-txt)" onclick="transferTask('${t.id}')">🔄 ${T.tr_btn}</button>
          <button class="btn danger" style="font-size:11px;padding:4px 10px" onclick="mgrEndTask('${t.id}')">${T.btn_end_task}</button>
          <button class="btn danger" style="font-size:11px;padding:4px 8px;opacity:0.7" onclick="deleteActiveTask('${t.id}')" title="מחק משימה שנפתחה בטעות">🗑</button>
        </div>
      </div>`).join('');}
  }
  // breaks list
  const bl=document.getElementById('mgr-breaks-list');
  if(bl){
    // ☕ שינוי לכולם בבת אחת (שעון קיץ/חורף) — מנהל בלבד; עובד עם הפסקה שונה ניתן לתקן אחר כך בשורה שלו
    const bulk=S.user?.role==='manager'?`<div class="row" style="flex-wrap:wrap;gap:6px;background:var(--bg2);border-radius:8px;padding:8px">
        <div style="min-width:120px;font-size:13px;font-weight:700">☕ לכל העובדים</div>
        <label style="font-size:11px;color:var(--txt2)">מ-</label>
        <input type="time" id="brk-all-s" value="${_brkDraft.s||defBreakStart()}" oninput="_brkDraft.s=this.value" style="width:95px;font-size:12px"/>
        <label style="font-size:11px;color:var(--txt2)">עד-</label>
        <input type="time" id="brk-all-e" value="${_brkDraft.e||defBreakEnd()}" oninput="_brkDraft.e=this.value" style="width:95px;font-size:12px"/>
        <button class="btn primary" style="font-size:11px;padding:4px 10px" onclick="mgrBreakAll()">החל על כולם</button>
      </div>`:'';
    bl.innerHTML=bulk+S.workers.map(w=>`
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <div style="min-width:120px"><div style="font-size:13px;font-weight:500">${esc(w.name)}</div><div style="font-size:11px;color:var(--txt3)">${esc(w.dept)}</div></div>
        <label style="font-size:11px;color:var(--txt2)">מ-</label>
        <input type="time" value="${w.breakStart||defBreakStart()}" style="width:95px;font-size:12px" onchange="mgrUpdateBreak('${w.id}','breakStart',this.value)"/>
        <label style="font-size:11px;color:var(--txt2)">עד-</label>
        <input type="time" value="${w.breakEnd||defBreakEnd()}" style="width:95px;font-size:12px" onchange="mgrUpdateBreak('${w.id}','breakEnd',this.value)"/>
        <button class="btn ${w.breakActive?'warn':''}  " style="font-size:11px;padding:4px 10px" onclick="mgrToggleBreak('${w.id}')">${w.breakActive?'☕ פעיל':'○ כבוי'}</button>
      </div>`).join('');
  }
}
function parseMgrBc(v){
  v=(v||'').replace(/\D/g,'');
  const el=document.getElementById('mgr-bc-prev');if(!el)return;
  if(v.length<2){el.innerHTML='';mgrShowTaskTypeField(true);return;}
  if(isBcLen(v.length)&&isSampleScan(v)){el.innerHTML=sampleScanPreview(v);showSampleMode('mgr');return;}
  const c=v.slice(0,2),p=v.slice(2,7),sz=v.slice(7,8),q=v.slice(8,11),col=v.slice(11,13);
  const isTotal=isTotalBc(v);const totalQty=isTotal?getTotalQty(c,p,orderNoOf(v)):0;
  el.innerHTML=isTotal
    ?`<div style="display:flex;gap:5px;flex-wrap:wrap;padding:6px;background:var(--bg2);border-radius:var(--r)">
        <span class="bc-seg bc-c">לקוח: ${c||'__'}</span><span class="bc-seg bc-p">מוצר: ${p.padEnd(5,'_')}</span>${bcOrderChip(v)}
        <span class="bc-seg" style="background:var(--green-bg,#d1fae5);color:var(--green-txt,#065f46);font-weight:700">📦 כל הכמות${totalQty?' — '+totalQty+' יח׳':''}</span></div>`
    :`<div style="display:flex;gap:5px;flex-wrap:wrap;padding:6px;background:var(--bg2);border-radius:var(--r)">
        <span class="bc-seg bc-c">לקוח: ${c||'__'}</span><span class="bc-seg bc-p">מוצר: ${p.padEnd(5,'_')}</span>${bcOrderChip(v)}
        <span class="bc-seg" style="background:var(--amber-bg);color:var(--amber-txt)">מידה: ${sz?esc(szLblT(c,p,sz)):'_'}</span>
        <span class="bc-seg bc-q">כמות: ${q.padEnd(3,'_')}</span><span class="bc-seg bc-col">צבע: ${COLORS[col]||col||'__'}</span></div>`;
  if(isBcLen(v.length))el.innerHTML+=bcRetiredHtml(v); // 🔒 ברקוד שסיים את תפקידו
  if(isBcLen(v.length)&&isTotalBc(v))el.innerHTML+=countEntryBtnHtml(v)+cutReportBtnHtml(v); // 📝 כמויות ושלבים + ✂️ דוח גזירה מהסורק
  if(isBcLen(v.length)){
    // 🔢 לפי **ההזמנה שבברקוד** ולא לפי הרשומה העדכנית: למוצר יכולות להיות כמה
    // הזמנות עם שלבים שונים, ו-findProd היה מחזיר תמיד את האחרונה (ראה gotcha_duplicate_prod_records).
    const prod=bcOrderProd(v);
    const steps=prod?.workSteps||[];
    if(steps.length){
      mgrShowTaskTypeField(false);
      renderStepChecks('mgr',c,p,steps,v);renderStepRecs('mgr');
      return;
    }
  }
  mgrShowTaskTypeField(true);
}
function mgrShowTaskTypeField(show){
  const wrap=document.getElementById('mgr-tasktype-wrap');
  const stepsWrap=document.getElementById('mgr-steps-wrap');
  if(wrap)wrap.style.display=show?'':'none';
  if(stepsWrap)stepsWrap.style.display=show?'none':'';
  if(show){const r=document.getElementById('mgr-recs');if(r)r.innerHTML='';clearStepChecks('mgr');}
}

let mgrCamStream=null;let mgrCamInterval=null;
async function mgrStartCam(){
  const T=LANGS[currentLang];
  const container=document.getElementById('mgr-cam-container');
  const video=document.getElementById('mgr-cam-video');
  const status=document.getElementById('mgr-cam-status');
  const btn=document.getElementById('mgr-cam-btn');
  try{
    mgrCamStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}});
    video.srcObject=mgrCamStream;
    container.style.display='block';
    btn.style.display='none';
    status.textContent=T.scan_searching;
    await video.play();
    mgrStartDecoding(video,status);
  }catch(e){
    alert('לא ניתן לגשת למצלמה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.');
  }
}
function mgrStartDecoding(video,status){
  const T=LANGS[currentLang];
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  mgrCamInterval=setInterval(()=>{
    if(video.readyState!==video.HAVE_ENOUGH_DATA)return;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    ctx.drawImage(video,0,0);
    try{
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
      if(code){
        // ברקוד תחנה (STN:) — שיוך העובד הנבחר לתחנה
        if((code.data||'').startsWith('STN:')){
          clearInterval(mgrCamInterval);
          const _sid=code.data.slice(4).trim();
          const _empId=document.getElementById('mgr-emp-sel')?.value;
          setTimeout(()=>mgrStopCam(),400);
          if(_empId)assignWorkerStation(_empId,_sid);
          else showToast(LANGS[currentLang].st_sel_worker||'⚠ בחר עובד לפני סריקת תחנה','var(--red-txt)');
          return;
        }
        const text=code.data.replace(/\D/g,'');
        const bc=bcFromScan(text);
        if(bc){
          bcScanMark('mgr',code.data,bc);
          document.getElementById('mgr-bc-inp').value=bc;
          parseMgrBc(bc);
          status.textContent=(T.sc_scanned||'✅ נסרק: ')+bc;
          clearInterval(mgrCamInterval);
          setTimeout(()=>mgrStopCam(),600);
        } else if(text.length>0){
          status.textContent=(T.sc_short||'⚠ קוד קצר מדי (צריך 13 או 16 ספרות): ')+text;
        }
      }
    }catch(e){}
  },150);
}
// ─── TASK SCAN PAGE ──────────────────────────────────────────
let tsCamStream=null;let tsCamInterval=null;
let tsEmpCamStream=null;let tsEmpCamInterval=null;
async function tsStartWorkerCam(){
  const T=LANGS[currentLang];
  const container=document.getElementById('ts-emp-cam-container');
  const video=document.getElementById('ts-emp-cam-video');
  const status=document.getElementById('ts-emp-cam-status');
  const btn=document.getElementById('ts-emp-cam-btn');
  try{
    tsEmpCamStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}});
    video.srcObject=tsEmpCamStream;container.style.display='block';btn.style.display='none';
    status.textContent=T.scan_searching_worker;await video.play();
    const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
    tsEmpCamInterval=setInterval(async()=>{
      if(!tsEmpCamStream||video.readyState<2)return;
      canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0);
      try{
        const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
        const result=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'attemptBoth'});
        const text=result?.data||'';
        // ברקוד תחנה (STN:) נסרק בטעות במצלמת העובד — שיוך העובד הנבחר אם יש
        if(text.startsWith('STN:')){
          const _empId=document.getElementById('ts-emp-sel')?.value;
          if(_empId){
            clearInterval(tsEmpCamInterval);setTimeout(()=>tsStopWorkerCam(),600);
            assignWorkerStation(_empId,text.slice(4).trim());
          }else{
            status.textContent=T.st_sel_worker||'⚠ בחר עובד לפני סריקת תחנה';
          }
          return;
        }
        if(text.startsWith('EMP:')){
          const empId=text.slice(4);
          const sel=document.getElementById('ts-emp-sel');
          const w=S.workers.find(x=>x.id===empId);
          if(sel)sel.value=empId;
          if(w){
            status.textContent=(T.sc_emp_ok||'✅ עובד זוהה: ')+w.name;
            showToast((T.sc_emp_ok||'✅ עובד זוהה: ')+w.name,'var(--green-txt)');
            clearInterval(tsEmpCamInterval);
            setTimeout(()=>{tsStopWorkerCam();tsStartCam();},800);// עבור אוטומטית לסריקת מוצר
          }else{
            status.textContent=T.sc_emp_notfound||'⚠ עובד לא נמצא';
            showToast(T.sc_emp_notfound||'⚠ עובד לא נמצא','var(--red-txt)');
            clearInterval(tsEmpCamInterval);setTimeout(()=>tsStopWorkerCam(),800);
          }
        }
      }catch(e){}
    },150);
  }catch(e){alert('לא ניתן לגשת למצלמה.');}
}
function tsStopWorkerCam(){
  if(tsEmpCamStream)tsEmpCamStream.getTracks().forEach(t=>t.stop());
  if(tsEmpCamInterval)clearInterval(tsEmpCamInterval);
  tsEmpCamStream=null;tsEmpCamInterval=null;
  const c=document.getElementById('ts-emp-cam-container');if(c)c.style.display='none';
  const b=document.getElementById('ts-emp-cam-btn');if(b)b.style.display='';
}
function renderWorkerBarcodes(){
  const out=document.getElementById('worker-bc-output');if(!out)return;
  const workers=S.workers.filter(w=>w.role!=='manager');
  if(!workers.length){out.innerHTML='<div style="color:var(--txt3);font-size:13px">אין עובדים</div>';return;}
  out.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--txt3)">
    <span>☑️ סמן/הסר עובד בודד — למשל להדפיס מחדש רק ברקוד אחד שהתקלקל</span>
    <button class="btn" style="font-size:11px;padding:3px 8px" onclick="_bcToggleSel('worker-bc-output','wbc-sel',true)">בחר הכל</button>
    <button class="btn" style="font-size:11px;padding:3px 8px" onclick="_bcToggleSel('worker-bc-output','wbc-sel',false)">נקה הכל</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:12px">
    ${workers.map(w=>`<div data-code="EMP:${esc(String(w.id))}" data-nfc-lbl="${esc(w.name)}" style="background:var(--bg2);border:0.5px solid var(--b);border-radius:var(--rl);padding:12px;text-align:center;break-inside:avoid;position:relative">
      ${nfcOk()?`<button type="button" class="btn" title="כתוב למדבקת NFC" onclick="bcNfcWriteOne(this.parentElement.dataset.code,this.parentElement.dataset.nfcLbl)" style="position:absolute;top:4px;right:4px;padding:3px 7px;font-size:13px">📶</button>`:''}
      <input type="checkbox" class="wbc-sel" data-id="${esc(String(w.id))}" checked title="בחר להדפסה" style="position:absolute;top:6px;left:6px;width:18px;height:18px;cursor:pointer">
      <div id="worker-qr-${w.id}" style="display:flex;justify-content:center"></div>
      <div style="font-size:13px;font-weight:600;margin-top:6px">${esc(w.name)}</div>
      <div style="font-size:11px;color:var(--txt3)">${esc(w.dept||'')} · ${w.role==='supervisor'?'אחראי':w.role==='helper'?'עוזר':'עובד'}</div>
      <div style="font-size:10px;color:var(--txt3);font-family:monospace;margin-top:3px">EMP:${w.id}</div>
    </div>`).join('')}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" style="font-size:13px" onclick="printWorkerBarcodes()">🖨️ הדפס נבחרים</button>
    <button class="btn" style="font-size:13px;border-color:var(--amber-txt);color:var(--amber-txt)" title="רשת 105×56 מ&quot;מ (TW-2510), 10 מדבקות בדף A4 — אותן מדבקות של ברקודי המשימות" onclick="printWorkerBarcodes('labels')">🏷️ הדפס למדבקות</button>
    <button class="btn success" style="font-size:13px" title="קובץ PDF מדויק A4 (105×56 מ&quot;מ) — להדפסה מהנייד בגודל נכון" onclick="workerBcDownloadPDF()">📄 הורד PDF מדבקות</button>
    ${nfcOk()?`<button class="btn primary" style="font-size:13px" title="כותב את העובדים המסומנים למדבקות NFC אחד אחרי השני" onclick="nfcWriteSelCards('worker-bc-output','wbc-sel')">📶 כתוב נבחרים למדבקות NFC</button>`:''}
  </div>`;
  workers.forEach(w=>{
    const el=document.getElementById('worker-qr-'+w.id);
    if(el&&window.QRCode){new QRCode(el,{text:'EMP:'+w.id,width:120,height:120,correctLevel:QRCode.CorrectLevel.M});}
  });
}
// roleName — אותו ניסוח בכל נתיבי ההדפסה של ברקודי העובדים
function _wbRole(w){return w.role==='supervisor'?'אחראי':w.role==='helper'?'עוזר':'עובד';}
// mode==='labels' — רשת TW-2510 (105×56 מ"מ, 10 בדף A4), אותן מדבקות של ברקודי המשימות.
// מבנה הכרטיס ומחלקות ה-CSS זהים ל-bcPrint('labels') בכוונה, כדי שהמדבקה תיפול
// בדיוק באותו מקום פיזי שהמדפסת כבר מכוילת אליו.
// ☑️ אילו checkbox-י בחירה מסומנים בלוח ברקודי העובדים כרגע (לפי id, כמחרוזת)
// null = אין checkboxes ב-DOM כלל (למשל נקרא לפני רינדור) ⇒ לא לצמצם, כל העובדים
function _wbcSelectedIds(){
  const boxes=[...document.querySelectorAll('#worker-bc-output .wbc-sel')];
  if(!boxes.length)return null;
  return new Set(boxes.filter(cb=>cb.checked).map(cb=>cb.dataset.id));
}
function printWorkerBarcodes(mode){
  const labels=mode==='labels';
  const selIds=_wbcSelectedIds();
  const workers=S.workers.filter(w=>w.role!=='manager'&&(!selIds||selIds.has(String(w.id))));
  if(!workers.length){alert(selIds?'בחר לפחות עובד אחד להדפסה':'אין עובדים');return;}
  if(!window.QRCode){alert('ספריית QR לא נטענה');return;}
  // יצור QR לכל עובד בתוך ה-DOM הנוכחי, קרא canvas.toDataURL, ואז פתח חלון
  const tmpWrap=document.createElement('div');
  tmpWrap.style.cssText='position:fixed;top:-9999px;left:-9999px;visibility:hidden';
  document.body.appendChild(tmpWrap);
  const divs=workers.map(w=>{
    const d=document.createElement('div');
    tmpWrap.appendChild(d);
    // במצב מדבקות ה-QR נמתח ל-32 מ"מ (~378px ב-300dpi) — מקור 130px היה מטושטש ונסרק גרוע
    const qpx=labels?400:130;
    new QRCode(d,{text:'EMP:'+w.id,width:qpx,height:qpx,correctLevel:QRCode.CorrectLevel.M});
    return d;
  });
  // המתן שה-QR יסיים לצייר (canvas/img נוצרים סינכרונית בספרייה זו, אבל img.src טוען async)
  setTimeout(()=>{
    const items=workers.map((w,i)=>{
      const canvas=divs[i].querySelector('canvas');
      const src=canvas?canvas.toDataURL('image/png'):'';
      return {name:w.name,dept:w.dept||'',role:_wbRole(w),id:w.id,src};
    });
    document.body.removeChild(tmpWrap);
    if(labels){
      // אותו CSS בדיוק כמו bcPrint('labels') — QR ממורכז 32 מ"מ, טקסט בעמודה מימין
      const body=`<div class="grid">${items.map(w=>`<div class="bc-card">
        <div>${w.src?`<img src="${w.src}"/>`:''}</div>
        <div>
          <div style="font-size:15px;font-weight:800;color:#000">${w.name}</div>
          <div style="font-size:11px;color:#555">${w.dept}</div>
          <div style="font-size:11px;color:#555">${w.role}</div>
        </div>
      </div>`).join('')}</div>`;
      printViaIframe(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>מדבקות עובדים</title>
      <style>
        body{margin:0;font-family:Arial,sans-serif;background:#fff}
        .grid{display:grid!important;grid-template-columns:repeat(2,105mm)!important;gap:0!important;padding:0!important}
        .bc-card{width:105mm!important;height:56mm!important;box-sizing:border-box!important;padding:0!important;border:none!important;border-radius:0!important;overflow:hidden!important;display:block!important;position:relative!important}
        .bc-card>div:first-child{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:32mm!important;height:32mm!important;overflow:hidden!important}
        .bc-card img{width:32mm!important;height:32mm!important}
        .bc-card>div:last-child{position:absolute!important;right:5mm!important;top:50%!important;transform:translateY(-50%)!important;width:29mm!important;text-align:right!important;line-height:1.8!important}
        @media print{@page{size:A4 portrait;margin:8.5mm 0}}
      </style></head><body>${body}</body></html>`);
      return;
    }
    printViaIframe(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>ברקודים עובדים</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#fff;padding:10px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .card{border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center;break-inside:avoid}
      .card img{width:120px;height:120px;display:block;margin:0 auto}
      .name{font-size:13px;font-weight:700;margin-top:5px}
      .sub{font-size:11px;color:#666}
      .code{font-size:9px;color:#999;font-family:monospace;margin-top:2px}
      @media print{@page{margin:10mm}body{padding:0}}
    </style></head><body>
    <div class="grid">
      ${items.map(w=>`<div class="card">
        ${w.src?`<img src="${w.src}"/>`:''}
        <div class="name">${w.name}</div>
        <div class="sub">${w.dept} · ${w.role}</div>
      </div>`).join('')}
    </div>
    </body></html>`);
  },300);
}
// ─── PDF מדבקות עובדים (A4 מדויק, 105×56 מ"מ) ───
// אותו מנוע של מדבקות המשימות (_bcPdfCell) — להדפסה מהנייד, שם AirPrint מכווץ HTML
async function workerBcDownloadPDF(){
  const selIds=_wbcSelectedIds();
  const workers=S.workers.filter(w=>w.role!=='manager'&&(!selIds||selIds.has(String(w.id))));
  if(!workers.length){alert(selIds?'בחר לפחות עובד אחד להדפסה':'אין עובדים');return;}
  await _lib('jspdf').catch(()=>{});const J=window.jspdf&&window.jspdf.jsPDF;
  if(!J){alert('ספריית PDF עדיין נטענת — נסה שוב עוד רגע');return;}
  if(!window.QRCode){alert('ספריית QR לא נטענה');return;}
  const cards=workers.map(w=>({qr:'EMP:'+w.id,lines:[
    {t:w.name,mm:5,bold:true,color:'#000'},
    {t:w.dept||'',mm:3.4,bold:false,color:'#555'},
    {t:_wbRole(w),mm:3.4,bold:false,color:'#555'}]}));
  const doc=new J({unit:'mm',format:'a4',orientation:'portrait',compress:true}); // 🗜 (26/10/2026) דחיסה — 3.2 מ"ב ⇒ ~40 ק"ב ל-4 מדבקות, אותם פיקסלים
  const CW=105,CH=56,TOP=(297-5*CH)/2; // 8.5 מ"מ שוליים עליון/תחתון, 0 בצדדים
  cards.forEach((card,i)=>{
    const pos=i%10;
    if(i>0&&pos===0)doc.addPage();
    const row=Math.floor(pos/2),col=pos%2;
    const x=col===0?CW:0; // RTL: הכרטיס הראשון בצד ימין
    doc.addImage(_bcPdfCell(card).toDataURL('image/png'),'PNG',x,TOP+row*CH,CW,CH,undefined,'FAST');
  });
  doc.save('מדבקות_עובדים.pdf');
}
// ─── תחנות עבודה פיזיות (QR STN:{id}) — שיוך עובד↔תחנה למצלמות DVR ─────
function stationById(id){return (S.workStations||[]).find(s=>s.id===id);}
// המחלקה האפקטיבית: תחנה סרוקה גוברת זמנית על מחלקת הבית (עד סריקה אחרת/יציאה)
function effDept(w){return curStation(w)?.dept||w?.dept||'';}
// ─── 🔧 בלעדיות מכונה ──────────────────────────────────────────────
// נמדד ב-stationLog לפני המימוש: ב-18/08 محمد ו-ابوزكي החזיקו את `حبكي 4` במקביל
// 58 דקות, וב-19/08 هنيه נכנסה אליה שלוש פעמים בזמן ש-ندوه החזיקה אותה עד סגירת
// היום. שתי רשומות כאלה לא יכולות להיות נכונות יחד — אחת מהן היא זמן שנרשם על
// מכונה שאיש לא ישב עליה. הבלעדיות פותרת את זה בבנייה.
function exclusiveDepts(){const a=S.settings?.exclusiveDepts;return Array.isArray(a)?a:DEFAULT_EXCLUSIVE_DEPTS;}
function stationExclusive(st){return exclusiveDepts().includes(String(st?.dept||'').trim());}
// ⚠️ תמיד מ-S.workers — S.user הוא עותק קפוא ו-currentStation שלו לא מתעדכן.
// status==='in' בכוונה: עובד שחתם יציאה כבר שוחרר ע"י closeWorkerStation.
function stationOccupant(stationId,exceptId){
  return (S.workers||[]).find(x=>x.id!==exceptId&&x.status==='in'&&x.currentStation?.id===stationId);
}
function _hhmm(iso){try{return new Date(iso).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}
async function assignWorkerStation(workerId,stationId){
  const T=LANGS[currentLang];
  const st=stationById(stationId);
  if(!st){showToast(T.st_unknown||'⚠ תחנה לא מוכרת','var(--red-txt)');return false;}
  const w=S.workers.find(x=>x.id===workerId);
  if(!w){showToast(T.st_sel_worker||'⚠ בחר עובד לפני סריקת תחנה','var(--red-txt)');return false;}
  const now=new Date().toISOString();
  if(w.currentStation?.id===st.id){showToast((T.st_scanned||'📍 תחנה נקלטה: ')+st.name);return true;}
  // 🔧 מכונת תפירה = אדם אחד. **"הסריקה האחרונה מנצחת"** ולא חסימה: הברקוד מודבק על
  // המכונה עצמה, ולכן מי שסרק אחרון באמת עומד שם. חסימה נפסלה כי היא יוצרת תיקו —
  // שתי עובדות שמחליפות מכונה חוסמות זו את זו ואף אחת לא יכולה לזוז ראשונה.
  // השחרור האוטומטי גם משאיר את הקודם **בלי תחנה**, ולכן המשימה הבאה שלו נחסמת
  // ע"י stationGate עד שיסרוק — וזה בדיוק הנכון, הוא כבר לא על המכונה.
  if(stationExclusive(st)){
    const occ=stationOccupant(st.id,w.id);
    if(occ){
      // האחראי מסתובב בין מכונות של עובדות כדי לחלק עבודה (محمد: עשרות מעברים ביום
      // ב-stationLog). סריקה שלו **לעצמו** על מכונה תפוסה היא לרוב חלוקת עבודה ולא
      // תפיסת המכונה — ולכן שואלים אותו במקום לזרוק את העובדת בשקט.
      if(workerId===S.user?.id&&canOverrideStationGate()){
        // showConfirm מחזיר false גם בלחיצה על הרקע — ולכן false ממופה לענף **הלא-הרסני**
        // ("רק חלוקת עבודה", אף שיוך לא משתנה). ראה gotcha_showconfirm_dismiss.
        const take=await showConfirm(T.st_busy_title||'התחנה תפוסה',
          esc(st.name+' — '+(T.st_busy_by||'תפוסה ע"י')+' '+occ.name+' '+(T.st_since||'מאז')+' '+_hhmm(occ.currentStation?.since))+
          '\n\n'+esc(T.st_busy_ask||'אתה עובד על המכונה הזו עכשיו?'),
          T.st_busy_take||'🔧 אני עובד עליה',T.st_busy_visit||'📋 רק חלוקת עבודה');
        logGateEvent('station_busy',take?'override':'cancel',{blocked:[{step:st.name,need:[occ.name]}]});
        if(!take){showToast('📋 '+(T.st_busy_kept||'השיוך לא שונה')+' — '+occ.name+' @ '+st.name,'var(--amber-txt)',4500);return false;}
      }else{
        logGateEvent('station_busy','release',{blocked:[{step:st.name,need:[occ.name]}]});
      }
      // 🏁 מסירת המכונה = **סיום המשימה** של מי שישבה עליה (החלטת המשתמש):
      // אי אפשר למסור מכונה באמצע תפירה, ולכן עובדת אחרת שנכנסת אליה מעידה שהקודמת
      // סיימה. נסגר דרך closeRunningTasks — אותה נוסחה (accumulatedSec + הצביר
      // היחסי) כמו כל נקודת סגירה אחרת, ולא חישוב מקומי משלנו.
      const closed=await closeRunningTasks(occ.id,new Date(now),null,{r:'station_handover',n:w.name+' · '+st.name});
      await closeWorkerStation(occ,new Date(now));
      showToast('🔄 '+occ.name+' '+(T.st_released||'שוחרר/ה מ־')+st.name+(closed?' · 🏁 '+closed+' '+(T.st_tasks_closed||'משימות נסגרו'):''),'var(--amber-txt)',6000);
      try{sendPushToWorker(occ.id,T.st_push_released||'📍 שוחררת מהתחנה',st.name+' — '+w.name+(closed?' · '+(T.st_tasks_closed||'משימות נסגרו')+': '+closed:'')).catch(()=>{});}catch(e){}
    }
  }
  try{
    // סריקת תחנה חדשה סוגרת את השיוך הקודם
    if(w.stationLogId&&S.fbConnected){try{await fbSet('stationLog',w.stationLogId,{to:now});}catch(e){}}
    const logId=w.id+'_'+Date.now().toString(36);
    // dept על השיוך: סריקת תחנה מחליפה זמנית את המחלקה (עד סריקה אחרת/יציאה)
    w.currentStation={id:st.id,name:st.name,dept:st.dept||'',since:now};
    w.stationLogId=logId;
    if(S.fbConnected){
      await fbSet('stationLog',logId,{workerId:w.id,workerName:w.name,stationId:st.id,stationName:st.name,dept:st.dept||'',dvrChannel:st.dvrChannel||'',from:now,to:null});
      await fbSet('workers',w.id,{currentStation:w.currentStation,stationLogId:logId});
    }
    saveLS();
    showToast((T.st_scanned||'📍 תחנה נקלטה: ')+st.name+(st.dvrChannel?' · 📹 '+st.dvrChannel:''));
    try{renderMgrTasks();}catch(e){}
    // ברקוד שכבר נסרק לפני התחנה — רשימת השלבים מצטמצמת עכשיו, בלי לסרוק אותו שוב
    try{['bc','ts','mgr'].forEach(p=>onScanEmpChange(p));}catch(e){}
    return true;
  }catch(e){showToast('❌ '+e.message,'var(--red-txt)');return false;}
}
// חתימת יציאה סוגרת את שיוך התחנה (וגם הניקוי היומי)
async function closeWorkerStation(w,when){
  if(!w||(!w.currentStation&&!w.stationLogId))return;
  const iso=(when instanceof Date?when:new Date()).toISOString();
  const logId=w.stationLogId;
  w.currentStation=null;w.stationLogId=null;
  if(S.fbConnected){
    if(logId){try{await fbSet('stationLog',logId,{to:iso});}catch(e){}}
    try{await fbSet('workers',w.id,{currentStation:null,stationLogId:null});}catch(e){}
  }
}
function renderStationsAdmin(){
  try{renderBcSignState();}catch(e){}
  renderStationLockState(); // לפני ה-return המוקדם — המתג מוצג גם כשעדיין אין תחנות
  renderStepOrderLockState();
  renderStationExclusive();
  const el=document.getElementById('stn-list');if(!el)return;
  if(!(S.workStations||[]).length){el.innerHTML='<div style="color:var(--txt3);font-size:12px">אין תחנות מוגדרות — לחץ "🔄 סנכרן תחנות מלשונית הניהול"</div>';return;}
  el.innerHTML=S.workStations.map(s=>`<div class="row" style="gap:8px">
    <div style="flex:1;min-width:0">
      <span style="font-size:13px;font-weight:600">${esc(s.name)}</span>
      <span style="font-size:11px;color:var(--txt3)">${s.dept?' · '+esc(s.dept):''}</span>
      <span style="font-size:10px;color:var(--txt3);font-family:monospace"> · STN:${esc(s.id)}</span>
      ${s.key&&!_stationKeyValid(s.key)?'<span style="font-size:10px;color:var(--red-txt)"> · ⚠ לא ברשימת הניהול</span>':''}
    </div>
    <label style="font-size:11px;color:var(--txt3);display:inline-flex;align-items:center;gap:4px">📹 ערוץ
      <input value="${esc(String(s.dvrChannel||''))}" inputmode="numeric" style="width:46px;font-size:12px;padding:3px 6px;border-radius:8px;border:1px solid var(--brd);background:var(--card);color:var(--txt)" onchange="setStationDvr('${escj(s.id)}',this.value)"></label>
    <button class="btn danger" style="font-size:11px;padding:4px 10px" onclick="delWorkStation('${escj(s.id)}')">🗑</button>
  </div>`).join('');
}
// ─── מתג האכיפה 🔒 ───────────────────────────────────────────────
// נשמר ב-appSettings/telegramSettings ומגיע לכל המכשירים ב-onSnapshot,
// כדי שכיבוי חירום ישחרר את כל רצפת הייצור מיד. ברירת מחדל: כבוי.
async function setStationLock(on){
  const el=document.getElementById('stn-lock');
  // הדלקה בזמן שיש שלבים בלי תחנה = חסימה מיידית של עבודה קיימת — מאשרים במפורש
  if(on){
    let missing=0;
    for(const p of (S.products||[]))missing+=(p.workSteps||[]).filter(s=>stepName(s)&&!stepStation(s)).length;
    const noStn=S.workers.filter(w=>w.status==='in'&&!w.currentStation).length;
    const warn=[];
    if(missing)warn.push('• '+missing+' שלבי עבודה בלי תחנה משויכת — ייחסמו');
    if(noStn)warn.push('• '+noStn+' עובדים נוכחים כרגע בלי תחנה סרוקה — ייחסמו');
    if(warn.length&&!await showConfirm('הדלקת אכיפת תחנה',esc('להדליק את האכיפה עכשיו?\n\n'+warn.join('\n')+'\n\nהאכיפה חלה מיד על כל המכשירים.'),'הדלק','ביטול')){
      if(el)el.checked=false;return;
    }
  }
  S.settings.stationLock=!!on;
  try{
    if(S.fbConnected)await fbSet('appSettings','telegramSettings',{stationLock:!!on});
    saveLS();renderStationLockState();
    showToast(on?'🔒 אכיפת תחנה הופעלה':'🔓 אכיפת תחנה כובתה',on?'var(--amber-txt)':'var(--green-txt)',5000);
    try{['bc','ts','mgr'].forEach(p=>onScanEmpChange(p));}catch(e){}
  }catch(e){
    S.settings.stationLock=!on;if(el)el.checked=!on;
    showToast('❌ '+e.message,'var(--red-txt)');
  }
}
// 🔐 ברקוד חתום — שלב 1: יצירת מפתח (מכאן כל הדפסה מסומנת); שלב 2: אכיפה (אחרי הדפסה מחדש של המדבקות בייצור)
function renderBcSignState(){
  const el=document.getElementById('bcsign-box');if(!el)return;
  const mgr=S.user?.role==='manager',key=!!S.settings?.bcKey,on=bcSignOn();
  if(!key){el.innerHTML=mgr?`<button class="btn primary" style="width:100%;justify-content:center;font-size:14px" onclick="bcSignInit()">🔑 התחל לסמן ברקודים</button>
    <div style="font-size:11px;color:var(--txt3);margin-top:6px">מהרגע הזה כל מדבקה שתודפס תהיה מסומנת. אחרי שתדפיס מחדש את המדבקות של ההזמנות שבייצור — הפעל את האכיפה.</div>`
    :'<div style="font-size:12px;color:var(--txt3)">לא הופעל</div>';return;}
  el.innerHTML=`<div style="font-size:12px;color:var(--green-txt);font-weight:700;margin-bottom:8px">✅ המדבקות שמודפסות מסומנות</div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600">
      <input type="checkbox" id="bcsign-on" style="width:17px;height:17px" ${on?'checked':''} ${mgr?'':'disabled'} onchange="setBcSign(this.checked)">
      🔐 אכיפה: עובד/אחראי — רק מדבקה מסומנת
    </label>
    <div style="font-size:12px;font-weight:700;margin-top:6px;color:${on?'var(--amber-txt)':'var(--txt3)'}">${on?'🔒 האכיפה פעילה — מדבקה בלי סימון והקלדה ידנית: מנהל בלבד':'🔓 האכיפה כבויה — כל ברקוד עובד כמו קודם'}</div>`;
}
async function bcSignInit(){
  if(S.user?.role!=='manager'||S.settings?.bcKey)return;
  if(!S.fbConnected){alert('אין חיבור לשרת');return;}
  if(!await showConfirm('🔑 סימון ברקודים',esc('מעכשיו כל מדבקה שתודפס תהיה מסומנת.\n\nמדבקות שכבר הודפסו לא מסומנות — לפני הפעלת האכיפה צריך להדפיס מחדש את המדבקות של ההזמנות שבייצור.'),'🔑 התחל','ביטול'))return;
  const a=new Uint8Array(16);crypto.getRandomValues(a);
  const k=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
  try{await fbSet('appSettings','telegramSettings',{bcKey:k});S.settings.bcKey=k;saveLS();renderBcSignState();showToast('🔑 מעכשיו המדבקות מסומנות','var(--green-txt)',5000);}
  catch(e){showToast('❌ '+e.message,'var(--red-txt)');}
}
async function setBcSign(on){
  if(S.user?.role!=='manager'){renderBcSignState();return;}
  if(on&&!await showConfirm('🔐 אכיפת ברקוד מסומן',esc('להפעיל עכשיו?\n\nעובד ואחראי לא יוכלו להתחיל משימה ממדבקה שהודפסה לפני הסימון או מהקלדה ידנית. ודא שהמדבקות של ההזמנות שבייצור הודפסו מחדש.'),'🔐 הפעל','ביטול')){renderBcSignState();return;}
  const prev=!!S.settings.bcSignOn;S.settings.bcSignOn=!!on;
  try{await fbSet('appSettings','telegramSettings',{bcSignOn:!!on});saveLS();showToast(on?'🔒 אכיפת ברקוד מסומן הופעלה':'🔓 האכיפה כובתה',on?'var(--amber-txt)':'var(--green-txt)',5000);}
  catch(e){S.settings.bcSignOn=prev;showToast('❌ '+e.message,'var(--red-txt)');}
  renderBcSignState();
}
function renderStationLockState(){
  const cb=document.getElementById('stn-lock');if(cb)cb.checked=!!S.settings?.stationLock;
  const el=document.getElementById('stn-lock-state');if(!el)return;
  const on=!!S.settings?.stationLock;
  el.textContent=on?'🔒 האכיפה פעילה':'🔓 האכיפה כבויה — הכל עובד כרגיל';
  el.style.color=on?'var(--amber-txt)':'var(--txt3)';
}
// ─── 🔧 בחירת המחלקות הבלעדיות ────────────────────────────────────
// רשימת המחלקות נלקחת מ**התחנות עצמן** ולא מ-S.depts: מחלקה בלי אף תחנה אינה
// רלוונטית לבלעדיות, ומחלקה שיש לה תחנות תופיע גם אם נמחקה מרשימת המחלקות.
function renderStationExclusive(){
  const el=document.getElementById('stn-excl');if(!el)return;
  const sel=exclusiveDepts();
  const depts=[...new Set((S.workStations||[]).map(s=>String(s.dept||'').trim()).filter(Boolean))].sort();
  if(!depts.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px">אין תחנות מוגדרות</div>';return;}
  el.innerHTML=depts.map(d=>{
    const n=(S.workStations||[]).filter(s=>String(s.dept||'').trim()===d).length;
    return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;padding:3px 0">
      <input type="checkbox" ${sel.includes(d)?'checked':''} style="width:16px;height:16px" onchange="toggleExclusiveDept('${escj(d)}',this.checked)">
      <span style="font-weight:600">${esc(d)}</span><span style="color:var(--txt3)">· ${n} תחנות</span>
    </label>`;
  }).join('');
}
// ─── 🔧 סריקת כל החפיפות הקיימות ופתרונן בבת אחת ──────────────────
// `resolveStationOverlap` רץ רק כשעובד מתחיל משימה. צמד ששויך לאותה מכונה לפני
// שהאכיפה עלתה יכול לשבת ככה כל היום בלי שאיש יתחיל משימה — וזה בדיוק מה שקרה
// ב-21/09 עם ابوزكي ו-رائده על `درزه 1`. הכפתור הזה סוגר את הפער ידנית.
// אותה הכרעה בדיוק: מי שסרק אחרון מחזיק, השאר משוחררים והמשימות שלהם נסגרות.
async function auditStationOverlaps(){
  const byStation={};
  for(const w of (S.workers||[])){
    const id=w.status==='in'?w.currentStation?.id:null;if(!id)continue;
    const st=stationById(id);if(!st||!stationExclusive(st))continue;
    (byStation[id]=byStation[id]||{st,ws:[]}).ws.push(w);
  }
  const over=Object.values(byStation).filter(x=>x.ws.length>1);
  if(!over.length){showToast('✅ אין חפיפות — עובד אחד לכל מכונה','var(--green-txt)',5000);return;}
  const since=w=>Date.parse(w.currentStation?.since||'')||0;
  const lines=over.map(({st,ws})=>{
    const sorted=[...ws].sort((a,b)=>since(b)-since(a));
    return st.name+': '+sorted.map((w,i)=>w.name+(i?'':' ✅')).join(' · ');
  });
  if(!await showConfirm('חפיפות תחנה',
    esc(over.length+' מכונות עם יותר מעובד אחד:\n\n'+lines.join('\n')+
      '\n\n✅ = סרק אחרון ונשאר. השאר ישוחררו והמשימות הרצות שלהם ייסגרו.'),
    'שחרר','ביטול'))return;
  let rel=0,closed=0;
  for(const {st,ws} of over){
    const sorted=[...ws].sort((a,b)=>since(b)-since(a));
    for(const o of sorted.slice(1)){
      closed+=await closeRunningTasks(o.id,srvNow(),null,{r:'station_audit',n:st.name});
      await closeWorkerStation(o,srvNow());
      rel++;
      logGateEvent('station_busy','audit',{blocked:[{step:st.name,need:[o.name]}]});
      try{sendPushToWorker(o.id,LANGS[currentLang].st_push_released||'📍 שוחררת מהתחנה',st.name).catch(()=>{});}catch(e){}
    }
  }
  saveLS();try{renderAll();}catch(e){}
  showToast('🔧 '+rel+' עובדים שוחררו'+(closed?' · 🏁 '+closed+' משימות נסגרו':''),'var(--amber-txt)',7000);
}
async function toggleExclusiveDept(dept,on){
  const prev=exclusiveDepts().slice();
  const cur=prev.filter(x=>x!==dept);
  if(on)cur.push(dept);
  // ⚠️ מערך ולא מפה: fbSet שולח את המערך המלא ולכן הוא נדרס כולו, וזה הרצוי כאן.
  S.settings.exclusiveDepts=cur;
  try{
    if(S.fbConnected)await fbSet('appSettings','telegramSettings',{exclusiveDepts:cur});
    showToast(on?('🔧 '+dept+' — עובד אחד לתחנה'):('🔓 '+dept+' — כמה עובדים לתחנה'),'var(--green-txt)');
  }catch(e){
    S.settings.exclusiveDepts=prev; // הכתיבה נכשלה — חוזרים למצב שהיה, אחרת המסך משקר
    showToast('❌ '+e.message,'var(--red-txt)');
  }
  renderStationExclusive();
}
// ─── מתג האכיפה 🔗 (סדר שלבים) ───────────────────────────────────
async function setStepOrderLock(on){
  const el=document.getElementById('so-lock');
  // הדלקה בלי ששום שלב סומן 🔗 = מתג שלא עושה כלום; הדלקה עם סימון = חסימה מיידית.
  if(on){
    let marked=0;
    for(const p of (S.products||[]))marked+=(p.workSteps||[]).filter(s=>isMergeStep(s)).length;
    const msg=marked
      ?'להדליק את אכיפת הסדר?\n\n• '+marked+' שלבים מסומנים 🔗 — הם ייחסמו עד שקודמיהם יסתיימו על אותו ברקוד.\n\nהאכיפה חלה מיד על כל המכשירים.'
      :'אף שלב לא מסומן 🔗 — המתג לא ישפיע על כלום.\n\nסמן שלבים בכרטיס המוצר קודם. להדליק בכל זאת?';
    if(!await showConfirm('הדלקת אכיפת סדר שלבים',esc(msg),'הדלק','ביטול')){if(el)el.checked=false;return;}
  }
  S.settings.stepOrderLock=!!on;
  try{
    if(S.fbConnected)await fbSet('appSettings','telegramSettings',{stepOrderLock:!!on});
    saveLS();renderStepOrderLockState();
    showToast(on?'🔗 אכיפת סדר שלבים הופעלה':'🔓 אכיפת סדר שלבים כובתה',on?'var(--amber-txt)':'var(--green-txt)',5000);
  }catch(e){
    S.settings.stepOrderLock=!on;if(el)el.checked=!on;
    showToast('❌ '+e.message,'var(--red-txt)');
  }
}
function renderStepOrderLockState(){
  const cb=document.getElementById('so-lock');if(cb)cb.checked=!!S.settings?.stepOrderLock;
  const el=document.getElementById('so-lock-state');
  const on=!!S.settings?.stepOrderLock;
  let marked=0;for(const p of (S.products||[]))marked+=(p.workSteps||[]).filter(s=>isMergeStep(s)).length;
  if(el){
    el.textContent=on?('🔗 האכיפה פעילה · '+marked+' שלבים מסומנים'):('🔓 האכיפה כבויה · '+marked+' שלבים מסומנים 🔗');
    el.style.color=on?'var(--amber-txt)':'var(--txt3)';
  }
  renderStepOrderStrictState();
}
// מציג בדיוק **על אילו מוצרים** המצב המחמיר כבר חל — בלי זה המנהל לא יכול לדעת
// למה הזמנה אחת נחסמת והשנייה לא (ההבדל הוא תאריך פתיחת רשומת המוצר).
function renderStepOrderStrictState(){
  const cb=document.getElementById('so-strict');if(cb)cb.checked=!!S.settings?.stepOrderStrict;
  const el=document.getElementById('so-strict-state');if(!el)return;
  const on=!!S.settings?.stepOrderStrict;
  if(!on){el.textContent='🔓 מצב מחמיר כבוי — שלב שלא נסרק מעולם אינו חוסם';el.style.color='var(--txt3)';return;}
  const from=+S.settings?.stepOrderStrictFrom||0;
  const withMerge=(S.products||[]).filter(p=>(p.workSteps||[]).some(isMergeStep));
  const covered=withMerge.filter(p=>(+p.createdAt||0)>=from);
  const dt=from?new Date(from).toLocaleDateString('he-IL'):'תמיד';
  el.textContent='🔗 מחמיר פעיל מ-'+dt+' · חל על '+covered.length+' מתוך '+withMerge.length+
    ' מוצרים עם שלבי 🔗'+(withMerge.length-covered.length?' ('+(withMerge.length-covered.length)+' הזמנות ותיקות ממשיכות בכללים הישנים)':'');
  el.style.color='var(--amber-txt)';
}
async function setStepOrderStrict(on){
  const el=document.getElementById('so-strict');
  if(on&&!S.settings?.stepOrderLock){
    showToast('⚠ קודם הדלק את אכיפת סדר השלבים למעלה','var(--red-txt)',5000);
    if(el)el.checked=false;return;
  }
  if(on){
    const msg='מכאן והלאה, שלב 🔗 ייחסם גם אם השלב שלפניו **מעולם לא נסרק** באף ברקוד.\n\n'+
      '• חל רק על הזמנות שנפתחות מעכשיו — הזמנות שכבר רצות לא ייעצרו.\n'+
      '• ודא ששלבי ה-🔗 שמוגדרים במוצר באמת נסרקים בפועל. שלב שמוגדר ולא נסרק יחסום את כל מה שאחריו.';
    if(!await showConfirm('הדלקת חסימה מחמירה',esc(msg),'הדלק','ביטול')){if(el)el.checked=false;return;}
  }
  const prevOn=!!S.settings.stepOrderStrict,prevFrom=+S.settings.stepOrderStrictFrom||0;
  S.settings.stepOrderStrict=!!on;
  // החותמת נקבעת **בהדלקה בלבד** ולא מתאפסת בכיבוי — כיבוי והדלקה חוזרת לא אמורים
  // לגרור לתוך האכיפה הזמנות שכבר רצו כשהמצב היה כבוי.
  if(on&&!prevFrom)S.settings.stepOrderStrictFrom=srvNow().getTime();
  try{
    if(S.fbConnected)await fbSet('appSettings','telegramSettings',
      {stepOrderStrict:!!on,stepOrderStrictFrom:+S.settings.stepOrderStrictFrom||0});
    saveLS();renderStepOrderStrictState();
    showToast(on?'🔗 חסימה מחמירה הופעלה — להזמנות חדשות':'🔓 חסימה מחמירה כובתה',
      on?'var(--amber-txt)':'var(--green-txt)',5000);
  }catch(e){
    S.settings.stepOrderStrict=prevOn;S.settings.stepOrderStrictFrom=prevFrom;
    if(el)el.checked=prevOn;
    showToast('❌ '+e.message,'var(--red-txt)');
  }
}
// ─── ביקורת יבשה: מה **היה** נחסם ─────────────────────────────────
// מריצה את mergeGate על ההיסטוריה כאילו האכיפה דלוקה, בלי לחסום כלום.
// זו הדרך היחידה לדעת אם הסימון שנבחר הגיוני לפני שמדליקים על רצפת הייצור —
// במדידה של 07/08 המודל הליניארי היה חוסם 85% מהעבודה האמיתית.
function auditStepOrder(){
  const el=document.getElementById('so-audit');if(!el)return;
  const byProd={};
  for(const t of (S.histTasks||[])){
    if(!t.cust||!t.prod||!t.bc)continue;
    (byProd[t.cust+'|'+t.prod]=byProd[t.cust+'|'+t.prod]||[]).push(t);
  }
  const rows=[];let tot=0,hit=0,hitStrict=0;
  for(const key of Object.keys(byProd)){
    const i=key.indexOf('|'),cust=key.slice(0,i),prod=key.slice(i+1);
    const steps=findProd(cust,prod)?.workSteps||[];
    if(!steps.some(isMergeStep))continue; // מוצר בלי סימוני 🔗 — אין מה לבדוק
    const stamp=prodStampFor(cust,prod);
    const list=byProd[key].filter(t=>{if(!(t.duration>0))return false;const s=taskStampOf(t);return s==null||!stamp||s===stamp;})
      .slice().sort((a,b)=>new Date(a.startTime)-new Date(b.startTime));
    // כיסוי מצטבר לפי סדר הזמן — "מה היה ידוע ברגע ההתחלה"
    const bcStep=new Set(),anyStep=new Set(),totStep=new Set();
    for(const t of list){
      const nm=String(t.taskType||'').trim(),k=nm.toLowerCase();
      const idx=steps.findIndex(x=>stepName(x)===nm);
      if(idx>0&&isMergeStep(steps[idx])){
        tot++;
        const miss=[],missStrict=[];
        for(let j=0;j<idx;j++){
          if(!isMergeStep(steps[j]))continue;
          const q=stepName(steps[j]);if(!q)continue;
          const qk=q.trim().toLowerCase();
          if(qk===k)continue; // אותה סריקה בפועל לא ניתנת לשחזור מההיסטוריה — לפחות לא מול עצמו
          if(bcStep.has(taskBc(t)+'|'+qk)||totStep.has(qk))continue;
          missStrict.push(q);              // מחמיר: גם שלב שמעולם לא נסרק נחשב חסר
          if(!anyStep.has(qk))continue;    // הקלה 1 — במצב הרגיל שלב-רפאים אינו חוסם
          miss.push(q);
        }
        if(missStrict.length)hitStrict++;
        if(miss.length){hit++;rows.push({cust,prod,bc:taskBc(t),step:nm,worker:t.workerName||'',
          when:new Date(t.startTime),need:miss});}
      }
      anyStep.add(k);bcStep.add(taskBc(t)+'|'+k);if(t.isTotal)totStep.add(k);
    }
  }
  if(!tot){el.innerHTML='<div style="font-size:12px;color:var(--txt3);padding:8px;background:var(--bg2);border-radius:8px">אין שלבים מסומנים 🔗 בהיסטוריה — סמן שלבים בכרטיס המוצר ואז הרץ שוב</div>';return;}
  const pct=(hit/tot*100).toFixed(0);
  const good=hit===0;
  rows.sort((a,b)=>b.when-a.when);
  el.innerHTML=`<div style="font-size:12px;padding:8px;border-radius:8px;border:1px solid var(--brd);background:${good?'var(--green-bg)':'var(--amber-bg)'};color:${good?'var(--green-txt)':'var(--amber-txt)'}">
      ${good?'✅':'⚠'} ${hit} מתוך ${tot} התחלות של שלבי 🔗 בהיסטוריה היו נחסמות (${pct}%).
      ${good?'הסימון בטוח להדלקה.':'ככל שהאחוז גבוה — כך יותר עבודה אמיתית תיתקע. שקול להוריד סימוני 🔗.'}
      <div style="margin-top:5px;padding-top:5px;border-top:1px solid var(--brd)">
        🔗 <b>במצב מחמיר</b> (גם שלב שלא נסרק מעולם חוסם): <b>${hitStrict}</b> מתוך ${tot} (${(hitStrict/tot*100).toFixed(0)}%).
        ${hitStrict>hit?'ההפרש (' +(hitStrict-hit)+ ') הוא שלבים שמוגדרים 🔗 אך לא נסרקים בפועל — במצב מחמיר הם יחסמו את כל מה שאחריהם.':'אין שלבי 🔗 שלא נסרקים — המצב המחמיר לא יוסיף חסימות.'}
      </div>
    </div>
    ${rows.length?`<div style="max-height:260px;overflow:auto;margin-top:6px">${rows.slice(0,120).map(r=>`
      <div style="padding:6px 8px;border-bottom:1px solid var(--brd);font-size:12px">
        <span style="font-weight:700">${esc(r.cust)}/${esc(r.prod)}</span>
        <span style="color:var(--txt3)"> · ${esc(r.bc)} · ${esc(r.worker)} · ${pad2(r.when.getDate())}/${pad2(r.when.getMonth()+1)} ${pad2(r.when.getHours())}:${pad2(r.when.getMinutes())}</span>
        <div style="margin-top:2px">🔗 ${esc(r.step)} <span style="color:var(--red-txt)">← חסר: ${esc(r.need.join(', '))}</span></div>
      </div>`).join('')}</div>`:''}`;
}
// ─── יומן שערים: מי נחסם, מי עקף ─────────────────────────────────
// נקרא מהשרת ולא מ-S: זו רשומת ביקורת, וקריאה מ-cache מקומי הייתה מראה רק את
// מה שהמכשיר הזה עשה. 200 האחרונים — מספיק לכמה שבועות בקצב הנוכחי.
async function renderGateLog(){
  const el=document.getElementById('gate-log');if(!el)return;
  const box=(bg,txt,html)=>`<div style="font-size:12px;padding:8px;border-radius:8px;border:1px solid var(--brd);background:var(--${bg});color:var(--${txt})">${html}</div>`;
  el.innerHTML=box('bg2','txt3','טוען…');
  if(!db||!S.fbConnected){el.innerHTML=box('bg2','txt3','אין חיבור לשרת — היומן נקרא מהשרת בלבד');return;}
  try{
    const{collection,query,orderBy,limit,getDocs}=window._fb;
    const snap=await getDocs(query(collection(db,'gateOverrides'),orderBy('ts','desc'),limit(200)));
    const rows=snap.docs.map(d=>d.data());
    if(!rows.length){el.innerHTML=box('green-bg','green-txt','✅ אין רשומות ביומן — אף אחד לא נחסם ואף אחד לא עקף מאז שהרישום הופעל');return;}
    const ov=rows.filter(r=>r.result==='override').length;
    const bl=rows.filter(r=>r.result==='blocked').length;
    const ca=rows.filter(r=>r.result==='cancel').length;
    // ריכוז לפי עובד — "מי עוקף" היא השאלה שבגללה היומן נבנה
    const per={};
    for(const r of rows){const k=r.workerName||r.workerId||'?';(per[k]=per[k]||{ov:0,bl:0})[r.result==='override'?'ov':'bl']++;}
    const top=Object.entries(per).filter(([,v])=>v.ov).sort((a,b)=>b[1].ov-a[1].ov).slice(0,6);
    el.innerHTML=box('amber-bg','amber-txt',
        `📝 ${rows.length} רשומות אחרונות · <b>${ov}</b> עקיפות · <b>${bl}</b> חסימות · ${ca} ביטולים`+
        (top.length?`<div style="margin-top:4px">עוקפים: ${top.map(([n,v])=>esc(n)+' ×'+v.ov).join(' · ')}</div>`:''))+
      `<div style="max-height:280px;overflow:auto;margin-top:6px">${rows.map(r=>{
        const d=new Date(r.ts);
        const tag=r.result==='override'?'<span style="color:var(--amber-txt);font-weight:700">⚠ עקף</span>'
                 :r.result==='blocked'?'<span style="color:var(--red-txt);font-weight:700">⛔ נחסם</span>'
                 :'<span style="color:var(--txt3)">↩ ביטל</span>';
        return `<div style="padding:6px 8px;border-bottom:1px solid var(--brd);font-size:12px">
          <span style="font-weight:700">${r.kind==='order'?'🔗':r.kind==='retired'?'📦':'🔒'} ${esc(r.workerName||'')}</span>
          <span style="color:var(--txt3)"> · ${esc(r.role||'')}${r.station?' · '+esc(r.station):''} · ${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}</span>
          ${tag}
          <div style="margin-top:2px;color:var(--txt2)">${esc(r.cust||'')}/${esc(r.prod||'')}${r.bc?' · '+esc(r.bc):''} · ${esc(r.steps||'')}</div>
          ${r.need?`<div style="margin-top:2px;color:var(--red-txt)">חסר: ${esc(r.need)}</div>`:''}
        </div>`;}).join('')}</div>`;
  }catch(e){el.innerHTML=box('bg2','red-txt','❌ '+esc(e.message));}
}
// ─── ביקורת: שלבים בלי תחנה משויכת ───────────────────────────────
// מאז 03/08 שלב בלי תחנה **חסום** בסורקים, ולכן צריך לראות את הרשימה לפני שנתקעים
// מול עובדת בבוקר. מוצג רק על מוצרים פעילים (עם שלבים), עם קישור לפתיחת המוצר.
function auditStepsWithoutStation(){
  const el=document.getElementById('stn-audit');if(!el)return;
  const rows=[];
  for(const p of (S.products||[])){
    const miss=(p.workSteps||[]).map((s,i)=>({s,i})).filter(x=>stepName(x.s)&&!stepStation(x.s));
    if(miss.length)rows.push({p,miss});
  }
  if(!rows.length){el.innerHTML='<div style="font-size:12px;color:var(--green-txt);padding:8px;background:var(--green-bg);border-radius:8px">✅ לכל שלבי העבודה יש תחנה משויכת</div>';return;}
  const totalSteps=rows.reduce((s,r)=>s+r.miss.length,0);
  el.innerHTML=`<div style="font-size:12px;padding:8px;background:var(--amber-bg);color:var(--amber-txt);border-radius:8px;border:1px solid var(--brd)">
      ⚠ ${totalSteps} שלבים ב-${rows.length} מוצרים בלי תחנה — הם <b>חסומים</b> בסורקים עד שתשייך להם תחנה
    </div>
    <div style="max-height:260px;overflow:auto;margin-top:6px">${rows.map(r=>`
      <div style="padding:6px 8px;border-bottom:1px solid var(--brd);font-size:12px">
        <a href="#" onclick="openProductModal('${escj(r.p.id)}');return false" style="font-weight:700;color:var(--blue-txt);text-decoration:none">${esc(r.p.cust)}/${esc(r.p.prod)}</a>
        <span style="color:var(--txt3)"> · ${esc(r.p.name||'')}</span>
        <div style="color:var(--txt3);margin-top:2px">${r.miss.map(x=>'#'+(x.i+1)+' '+esc(stepName(x.s))).join(' · ')}</div>
      </div>`).join('')}</div>`;
}
function _stationKeyValid(key){
  const i=key.indexOf('::');if(i<0)return false;
  return ((S.deptStations||{})[key.slice(0,i)]||[]).includes(key.slice(i+2));
}
// סנכרון התחנות הפיזיות (QR) מרשימת המחלקות/תחנות של לשונית הניהול —
// הגדרה אחת בניהול, ברקוד וערוץ DVR כאן. קישור עמיד לפי key="מחלקה::תחנה";
// ה-id של הברקוד נשאר קבוע גם בשינוי שם (הברקודים המודפסים ממשיכים לעבוד).
async function syncStationsFromDepts(){
  if(!S.fbConnected){showToast('⚠ אין חיבור Firebase','var(--red-txt)');return;}
  let created=0,linked=0;
  for(const[d,sts]of Object.entries(S.deptStations||{})){
    for(const st of(sts||[])){
      const key=d+'::'+st;
      let doc=(S.workStations||[]).find(x=>x.key===key);
      if(!doc){
        // קישור רשומה ישנה שנוצרה ידנית לפי שם+מחלקה
        doc=(S.workStations||[]).find(x=>!x.key&&x.name===st&&(x.dept||'')===d);
        if(doc){await fbSet('stations',doc.id,{key});linked++;continue;}
        const id='st'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
        await fbSet('stations',id,{name:st,dept:d,key,dvrChannel:'',createdAt:new Date().toISOString()});
        created++;
      }
    }
  }
  showToast('✅ סנכרון תחנות: '+created+' נוצרו'+(linked?', '+linked+' קושרו':'')+' — הגדר ערוצי DVR ולחץ "צור ברקודי תחנות"','var(--green-txt)',5000);
}
async function setStationDvr(id,val){
  try{await fbSet('stations',id,{dvrChannel:String(val||'').trim()});showToast('📹 ערוץ עודכן');}
  catch(e){showToast('❌ '+e.message,'var(--red-txt)');}
}
_guardReentrant('syncStationsFromDepts','syncStations');
async function delWorkStation(id){
  const st=stationById(id);
  if(!await showConfirm('מחיקת תחנה','למחוק את התחנה "'+(st?.name||id)+'"? ברקודים מודפסים שלה יפסיקו לעבוד.','מחק','ביטול'))return;
  try{await fbDel('stations',id);showToast('🗑 תחנה נמחקה');}catch(e){showToast('❌ '+e.message,'var(--red-txt)');}
}
function renderStationBarcodes(){
  const out=document.getElementById('station-bc-output');if(!out)return;
  const sts=S.workStations||[];
  if(!sts.length){out.innerHTML='<div style="color:var(--txt3);font-size:13px">אין תחנות מוגדרות</div>';return;}
  out.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--txt3)">
    <span>☑️ סמן/הסר תחנה בודדת — למשל להדפיס מחדש רק ברקוד אחד שהתקלקל</span>
    <button class="btn" style="font-size:11px;padding:3px 8px" onclick="_bcToggleSel('station-bc-output','stnbc-sel',true)">בחר הכל</button>
    <button class="btn" style="font-size:11px;padding:3px 8px" onclick="_bcToggleSel('station-bc-output','stnbc-sel',false)">נקה הכל</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:12px">
    ${sts.map(s=>`<div data-code="STN:${esc(String(s.id))}" data-nfc-lbl="${esc(s.name)}" style="background:var(--bg2);border:0.5px solid var(--b);border-radius:var(--rl);padding:12px;text-align:center;break-inside:avoid;position:relative">
      ${nfcOk()?`<button type="button" class="btn" title="כתוב למדבקת NFC" onclick="bcNfcWriteOne(this.parentElement.dataset.code,this.parentElement.dataset.nfcLbl)" style="position:absolute;top:4px;right:4px;padding:3px 7px;font-size:13px">📶</button>`:''}
      <input type="checkbox" class="stnbc-sel" data-id="${esc(String(s.id))}" checked title="בחר להדפסה" style="position:absolute;top:6px;left:6px;width:18px;height:18px;cursor:pointer">
      <div id="station-qr-${esc(s.id)}" style="display:flex;justify-content:center"></div>
      <div style="font-size:13px;font-weight:600;margin-top:6px">${esc(s.name)}</div>
      <div style="font-size:11px;color:var(--txt3)">${esc(s.dept||'')}${s.dvrChannel?' · 📹 ערוץ '+esc(String(s.dvrChannel)):''}</div>
      <div style="font-size:10px;color:var(--txt3);font-family:monospace;margin-top:3px">STN:${esc(s.id)}</div>
    </div>`).join('')}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" style="font-size:13px" onclick="printStationBarcodes()">🖨️ הדפס נבחרים</button>
    <button class="btn" style="font-size:13px;border-color:var(--amber-txt);color:var(--amber-txt)" title="רשת 105×56 מ&quot;מ (TW-2510), 10 מדבקות בדף A4 — אותן מדבקות של ברקודי המשימות" onclick="printStationBarcodes('labels')">🏷️ הדפס למדבקות</button>
    <button class="btn success" style="font-size:13px" title="קובץ PDF מדויק A4 (105×56 מ&quot;מ) — להדפסה מהנייד בגודל נכון" onclick="stationBcDownloadPDF()">📄 הורד PDF מדבקות</button>
    ${nfcOk()?`<button class="btn primary" style="font-size:13px" title="כותב את התחנות המסומנות למדבקות NFC אחת אחרי השנייה" onclick="nfcWriteSelCards('station-bc-output','stnbc-sel')">📶 כתוב נבחרים למדבקות NFC</button>`:''}
  </div>`;
  sts.forEach(s=>{
    const el=document.getElementById('station-qr-'+s.id);
    if(el&&window.QRCode){new QRCode(el,{text:'STN:'+s.id,width:120,height:120,correctLevel:QRCode.CorrectLevel.M});}
  });
}
// mode==='labels' — רשת TW-2510 (105×56 מ"מ, 10 בדף A4), אותן מדבקות של ברקודי המשימות.
// מבנה הכרטיס ומחלקות ה-CSS זהים ל-bcPrint('labels') בכוונה, כדי שהמדבקה תיפול
// בדיוק באותו מקום פיזי שהמדפסת כבר מכוילת אליו.
// ☑️ אילו checkbox-י בחירה מסומנים בלוח ברקודי התחנות כרגע (לפי id, כמחרוזת)
// null = אין checkboxes ב-DOM כלל (למשל נקרא לפני רינדור) ⇒ לא לצמצם, כל התחנות
function _stnbcSelectedIds(){
  const boxes=[...document.querySelectorAll('#station-bc-output .stnbc-sel')];
  if(!boxes.length)return null;
  return new Set(boxes.filter(cb=>cb.checked).map(cb=>cb.dataset.id));
}
function printStationBarcodes(mode){
  const labels=mode==='labels';
  const selIds=_stnbcSelectedIds();
  const sts=(S.workStations||[]).filter(s=>!selIds||selIds.has(String(s.id)));
  if(!sts.length){alert(selIds?'בחר לפחות תחנה אחת להדפסה':'אין תחנות מוגדרות');return;}
  if(!window.QRCode){alert('ספריית QR לא נטענה');return;}
  const tmpWrap=document.createElement('div');
  tmpWrap.style.cssText='position:fixed;top:-9999px;left:-9999px;visibility:hidden';
  document.body.appendChild(tmpWrap);
  const divs=sts.map(s=>{
    const d=document.createElement('div');
    tmpWrap.appendChild(d);
    // במצב מדבקות ה-QR נמתח ל-32 מ"מ (~378px ב-300dpi) — מקור 130px היה מטושטש ונסרק גרוע
    const qpx=labels?400:130;
    new QRCode(d,{text:'STN:'+s.id,width:qpx,height:qpx,correctLevel:QRCode.CorrectLevel.M});
    return d;
  });
  setTimeout(()=>{
    const items=sts.map((s,i)=>{
      const canvas=divs[i].querySelector('canvas');
      const src=canvas?canvas.toDataURL('image/png'):'';
      return {name:s.name,dept:s.dept||'',ch:s.dvrChannel||'',src};
    });
    document.body.removeChild(tmpWrap);
    if(labels){
      // אותו CSS בדיוק כמו bcPrint('labels') — QR ממורכז 32 מ"מ, טקסט בעמודה מימין
      const body=`<div class="grid">${items.map(s=>`<div class="bc-card">
        <div>${s.src?`<img src="${s.src}"/>`:''}</div>
        <div>
          <div style="font-size:15px;font-weight:800;color:#000">${s.name}</div>
          <div style="font-size:11px;color:#555">${s.dept}</div>
          ${s.ch?`<div style="font-size:11px;color:#555">📹 ערוץ ${s.ch}</div>`:''}
        </div>
      </div>`).join('')}</div>`;
      printViaIframe(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>מדבקות תחנות</title>
      <style>
        body{margin:0;font-family:Arial,sans-serif;background:#fff}
        .grid{display:grid!important;grid-template-columns:repeat(2,105mm)!important;gap:0!important;padding:0!important}
        .bc-card{width:105mm!important;height:56mm!important;box-sizing:border-box!important;padding:0!important;border:none!important;border-radius:0!important;overflow:hidden!important;display:block!important;position:relative!important}
        .bc-card>div:first-child{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:32mm!important;height:32mm!important;overflow:hidden!important}
        .bc-card img{width:32mm!important;height:32mm!important}
        .bc-card>div:last-child{position:absolute!important;right:5mm!important;top:50%!important;transform:translateY(-50%)!important;width:29mm!important;text-align:right!important;line-height:1.8!important}
        @media print{@page{size:A4 portrait;margin:8.5mm 0}}
      </style></head><body>${body}</body></html>`);
      return;
    }
    printViaIframe(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>ברקודי תחנות</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#fff;padding:10px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .card{border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center;break-inside:avoid}
      .card img{width:120px;height:120px;display:block;margin:0 auto}
      .name{font-size:13px;font-weight:700;margin-top:5px}
      .sub{font-size:11px;color:#666}
      @media print{@page{margin:10mm}body{padding:0}}
    </style></head><body>
    <div class="grid">
      ${items.map(s=>`<div class="card">
        ${s.src?`<img src="${s.src}"/>`:''}
        <div class="name">🏭 ${s.name}</div>
        <div class="sub">${s.dept}${s.ch?' · 📹 ערוץ '+s.ch:''}</div>
      </div>`).join('')}
    </div>
    </body></html>`);
  },300);
}
// ─── PDF מדבקות תחנות (A4 מדויק, 105×56 מ"מ) ───
// אותו מנוע של מדבקות המשימות (_bcPdfCell) — להדפסה מהנייד, שם AirPrint מכווץ HTML
async function stationBcDownloadPDF(){
  const selIds=_stnbcSelectedIds();
  const sts=(S.workStations||[]).filter(s=>!selIds||selIds.has(String(s.id)));
  if(!sts.length){alert(selIds?'בחר לפחות תחנה אחת להדפסה':'אין תחנות מוגדרות');return;}
  await _lib('jspdf').catch(()=>{});const J=window.jspdf&&window.jspdf.jsPDF;
  if(!J){alert('ספריית PDF עדיין נטענת — נסה שוב עוד רגע');return;}
  if(!window.QRCode){alert('ספריית QR לא נטענה');return;}
  const cards=sts.map(s=>{
    const lines=[
      {t:s.name,mm:5,bold:true,color:'#000'},
      {t:s.dept||'',mm:3.4,bold:false,color:'#555'}];
    if(s.dvrChannel)lines.push({t:'📹 ערוץ '+s.dvrChannel,mm:3.4,bold:false,color:'#555'});
    return {qr:'STN:'+s.id,lines};
  });
  const doc=new J({unit:'mm',format:'a4',orientation:'portrait',compress:true}); // 🗜 (26/10/2026) דחיסה — 3.2 מ"ב ⇒ ~40 ק"ב ל-4 מדבקות, אותם פיקסלים
  const CW=105,CH=56,TOP=(297-5*CH)/2; // 8.5 מ"מ שוליים עליון/תחתון, 0 בצדדים
  cards.forEach((card,i)=>{
    const pos=i%10;
    if(i>0&&pos===0)doc.addPage();
    const row=Math.floor(pos/2),col=pos%2;
    const x=col===0?CW:0; // RTL: הכרטיס הראשון בצד ימין
    doc.addImage(_bcPdfCell(card).toDataURL('image/png'),'PNG',x,TOP+row*CH,CW,CH,undefined,'FAST');
  });
  doc.save('מדבקות_תחנות.pdf');
}
function tsParseBc(v){
  v=(v||'').replace(/\D/g,'');
  const el=document.getElementById('ts-bc-prev');if(!el)return;
  if(v.length<2){
    el.innerHTML='';
    tsShowTaskTypeField(true);
    return;
  }
  if(isBcLen(v.length)&&isSampleScan(v)){el.innerHTML=sampleScanPreview(v);showSampleMode('ts');return;}
  const c=v.slice(0,2),p=v.slice(2,7),sz=v.slice(7,8),q=v.slice(8,11),col=v.slice(11,13);
  const isTotal=isTotalBc(v);const totalQty=isTotal?getTotalQty(c,p,orderNoOf(v)):0;
  el.innerHTML=isTotal
    ?`<div style="display:flex;gap:5px;flex-wrap:wrap;padding:6px;background:var(--bg2);border-radius:var(--r)">
        <span class="bc-seg bc-c">לקוח: ${c||'__'}</span><span class="bc-seg bc-p">מוצר: ${p.padEnd(5,'_')}</span>${bcOrderChip(v)}
        <span class="bc-seg" style="background:var(--green-bg,#d1fae5);color:var(--green-txt,#065f46);font-weight:700">📦 כל הכמות${totalQty?' — '+totalQty+' יח׳':''}</span></div>`
    :`<div style="display:flex;gap:5px;flex-wrap:wrap;padding:6px;background:var(--bg2);border-radius:var(--r)">
        <span class="bc-seg bc-c">לקוח: ${c||'__'}</span><span class="bc-seg bc-p">מוצר: ${p.padEnd(5,'_')}</span>${bcOrderChip(v)}
        <span class="bc-seg" style="background:var(--amber-bg);color:var(--amber-txt)">מידה: ${sz?esc(szLblT(c,p,sz)):'_'}</span>
        <span class="bc-seg bc-q">כמות: ${q.padEnd(3,'_')}</span><span class="bc-seg bc-col">צבע: ${COLORS[col]||col||'__'}</span></div>`;
  if(isBcLen(v.length))el.innerHTML+=bcRetiredHtml(v); // 🔒 ברקוד שסיים את תפקידו
  if(isBcLen(v.length)&&isTotalBc(v))el.innerHTML+=countEntryBtnHtml(v)+cutReportBtnHtml(v); // 📝 כמויות ושלבים + ✂️ דוח גזירה מהסורק
  // אם המוצר מוגדר עם שלבי עבודה — הצג checkboxes
  if(isBcLen(v.length)){
    // 🔢 לפי **ההזמנה שבברקוד** ולא לפי הרשומה העדכנית: למוצר יכולות להיות כמה
    // הזמנות עם שלבים שונים, ו-findProd היה מחזיר תמיד את האחרונה (ראה gotcha_duplicate_prod_records).
    const prod=bcOrderProd(v);
    const steps=prod?.workSteps||[];
    if(steps.length){
      tsShowTaskTypeField(false);
      renderStepChecks('ts',c,p,steps,v);renderStepRecs('ts');
      return;
    }
  }
  tsShowTaskTypeField(true);
}
function tsShowTaskTypeField(show){
  const wrap=document.getElementById('ts-tasktype-wrap');
  const stepsWrap=document.getElementById('ts-steps-wrap');
  if(wrap)wrap.style.display=show?'':'none';
  if(stepsWrap)stepsWrap.style.display=show?'none':'';
  if(show){const r=document.getElementById('ts-recs');if(r)r.innerHTML='';clearStepChecks('ts');}
}
// הגבלת סריקה לאחראי/עובד/עוזר: עד 2 שלבים לכל ברקוד ועד 2 ברקודים בסל (מנהל — ללא הגבלה)
function tsStepToggle(cb){
  if(S.user?.role!=='manager'&&cb.checked){
    const list=document.getElementById('ts-steps-list');
    const nonQuick=[...list.querySelectorAll('input[type="checkbox"]:checked')].filter(x=>!isQuickStep(list?.dataset.cust,list?.dataset.prod,x.dataset.step)).length;
    if(nonQuick>2){cb.checked=false;showToast(LANGS[currentLang].lim_steps||'⚠ ניתן לבחור עד 2 שלבים לכל ברקוד','var(--red-txt)');return;}
  }
  renderStepRecs('ts');
}
function tsScanLimitsOk(raw,checkedSteps){
  if(S.user?.role==='manager')return true;
  const T=LANGS[currentLang];
  const cust=raw.slice(0,2),prod=raw.slice(2,7);
  const nonQuickSteps=(checkedSteps||[]).filter(st=>!isQuickStep(cust,prod,st));
  if(nonQuickSteps.length>2){showToast(T.lim_steps||'⚠ ניתן לבחור עד 2 שלבים לכל ברקוד','var(--red-txt)');return false;}
  // ברקוד שכל שלביו בסל הם ⚡ מהיר אינו נספר; סריקה כולה-מהירה לא נחסמת
  const addingNonQuick=(checkedSteps&&checkedSteps.length)?nonQuickSteps.length>0:true;
  const nonQuickBc=new Set(_tsBatch.filter(b=>!b.isSample&&(!b.taskType||!isQuickStep(b.cust,b.prod,b.taskType))).map(b=>b.raw));
  if(addingNonQuick&&!nonQuickBc.has(raw)&&nonQuickBc.size>=2){showToast(T.lim_bc||'⚠ ניתן לסרוק עד 2 ברקודים','var(--red-txt)');return false;}
  return true;
}
// מצלמה מאוחדת: מזהה אוטומטית עובד (EMP:), תחנה (STN:) או משימה (13 או 16 ספרות).
// עובד/תחנה — המצלמה נשארת פתוחה כדי להמשיך לסרוק; משימה — סוגרת לבחירת שלבים.
async function tsStartCam(){
  const T=LANGS[currentLang];
  const container=document.getElementById('ts-cam-container');
  const video=document.getElementById('ts-cam-video');
  const status=document.getElementById('ts-cam-status');
  const btn=document.getElementById('ts-cam-btn');
  let lastCode='',lastTs=0; // דה-באונס: אותו QR בפריים לא יעובד שוב ושוב
  try{
    tsCamStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}});
    video.srcObject=tsCamStream;container.style.display='block';btn.style.display='none';
    status.textContent=T.scan_searching;await video.play();
    const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
    tsCamInterval=setInterval(async()=>{
      if(!tsCamStream||video.readyState<2)return;
      canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0);
      try{
        const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
        const result=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'attemptBoth'});
        const text=result?.data||'';
        if(!text)return;
        const nowMs=Date.now();
        if(text===lastCode&&nowMs-lastTs<3000)return; // אותו קוד עדיין בפריים — התעלם
        lastCode=text;lastTs=nowMs;
        // עובד (EMP:) — בחירת העובד; המצלמה נשארת פתוחה
        if(text.startsWith('EMP:')){
          const empId=text.slice(4);
          const sel=document.getElementById('ts-emp-sel');
          const w=S.workers.find(x=>x.id===empId);
          if(w){
            if(sel&&!sel.disabled){sel.value=empId;renderStepRecs('ts');}
            status.textContent=(T.sc_emp_ok||'✅ עובד זוהה: ')+w.name+' — '+(T.sc_emp_next||'סרוק תחנה או משימה');
            showToast((T.sc_emp_ok||'✅ עובד זוהה: ')+w.name,'var(--green-txt)');
          }else{
            status.textContent=T.sc_emp_notfound||'⚠ עובד לא נמצא';showToast(T.sc_emp_notfound||'⚠ עובד לא נמצא','var(--red-txt)');
          }
          return;
        }
        // תחנה (STN:) — שיוך העובד הנבחר; המצלמה נשארת פתוחה
        if(text.startsWith('STN:')){
          const _empId=document.getElementById('ts-emp-sel')?.value;
          if(_empId){
            assignWorkerStation(_empId,text.slice(4).trim());
            status.textContent=T.sc_st_next||'📍 תחנה שויכה — סרוק ברקוד משימה';
          }else{
            status.textContent=T.st_sel_worker||'⚠ בחר עובד לפני סריקת תחנה';
            lastCode=''; // אפשר לנסות שוב מיד אחרי בחירת עובד
          }
          return;
        }
        // משימה (13 או 16 ספרות) — ממלא את השדה וסוגר לבחירת שלבים/כמות
        const digits=text.replace(/\D/g,'');
        if(isBcLen(digits.length)){
          bcScanMark('ts',text,digits);document.getElementById('ts-bc-inp').value=digits;tsParseBc(digits);
          status.textContent=(T.sc_scanned||'✅ נסרק: ')+digits;
          clearInterval(tsCamInterval);setTimeout(()=>tsStopCam(),600);
        }
      }catch(e){}
    },150);
  }catch(e){alert('לא ניתן לגשת למצלמה.');}
}
function tsStopCam(){
  if(tsCamStream)tsCamStream.getTracks().forEach(t=>t.stop());
  if(tsCamInterval)clearInterval(tsCamInterval);
  tsCamStream=null;tsCamInterval=null;
  const c=document.getElementById('ts-cam-container');if(c)c.style.display='none';
  const b=document.getElementById('ts-cam-btn');if(b)b.style.display='flex';
}
async function tsAddToBatch(){
  const empId=document.getElementById('ts-emp-sel').value;
  const raw=(document.getElementById('ts-bc-inp').value||'').replace(/\D/g,'');
  const T=LANGS[currentLang];
  if(!empId){showToast(T.err_sel_worker||'⚠ בחר עובד','var(--red-txt)');return;}
  if(!isBcLen(raw.length)){showToast(T.err_barcode_13||'⚠ ברקוד חייב להיות 13 או 16 ספרות','var(--red-txt)');return;}
  if(!bcSignGate('ts',raw))return;
  if(isShipBc(raw)){openShipModal(raw.slice(0,2),raw.slice(2,7),orderNoOf(raw));document.getElementById('ts-bc-inp').value='';return;} // ברקוד "יצא ללקוח"
  if(isSampleScan(raw)){
    // 👕 דגם ראשון — נכנס לסל כמשימת דגם (בלי שלבים ובלי שערים). כמה דגמים בסל = טיימר משותף.
    // ⚠️ בלי הענף הזה רשימת השלבים מוסתרת (מצב דגם) ⇒ נכנסה לסל משימה רגילה עם שלב ריק.
    document.getElementById('ts-bc-inp').value='';document.getElementById('ts-bc-prev').innerHTML='';tsShowTaskTypeField(true);
    const item=await openScanItem(empId,raw,_tsBatch,(document.getElementById('ts-dept')?.value||'').trim()); // 🔧 תיקון ⇒ חלון בחירה
    if(!item)return;
    _tsBatch.push(item);
    renderTsBatchQueue();showToast(T.scan_added_cart);
    return;
  }
  const cust=raw.slice(0,2),prod=raw.slice(2,7),size=raw.slice(7,8),col=raw.slice(11,13);
  const isTotal=isTotalBc(raw);
  const qty=isTotal?getTotalQty(cust,prod,orderNoOf(raw)):parseInt(raw.slice(8,11))||0;
  const stepsWrap=document.getElementById('ts-steps-wrap');
  const useSteps=stepsWrap&&stepsWrap.style.display!=='none';
  const checkedSteps=useSteps?[...document.querySelectorAll('#ts-steps-list input[type="checkbox"]:checked')].map(cb=>cb.dataset.step):[];
  if(useSteps&&!checkedSteps.length){showToast(T.err_sel_step||'⚠ בחר לפחות שלב עבודה אחד','var(--red-txt)');return;}
  const taskType=useSteps?'':((document.getElementById('ts-tasktype').value||'').trim());
  const taskDept=(document.getElementById('ts-dept').value||'').trim();
  const types=useSteps?checkedSteps:[taskType||''];
  if(!tsScanLimitsOk(raw,checkedSteps))return;
  const _sk=addStepsToBatch(_tsBatch,{raw,cust,prod,size,qty,col,isTotal,taskDept,want:_partWant('ts')},types);
  document.getElementById('ts-bc-inp').value='';
  document.getElementById('ts-bc-prev').innerHTML='';
  document.getElementById('ts-tasktype').value='';
  renderTsBatchQueue();
  if(_sk.length)showToast(T.scan_not_added+' '+_sk.join(' · '),'var(--red-txt)',7000);
  else showToast(T.scan_added_cart);
}
async function tsStartTask(){
  const empId=document.getElementById('ts-emp-sel').value;
  const raw=(document.getElementById('ts-bc-inp').value||'').replace(/\D/g,'');
  const T=LANGS[currentLang];
  if(await checkVersion()){showToast('🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב','var(--red-txt)',6000);return;}
  if(!empId){showToast(T.err_sel_worker||'⚠ בחר עובד','var(--red-txt)');return;}
  const w=S.workers.find(x=>x.id===empId);
  if(!w||w.status!=='in'){showToast(T.cfm_worker_not_in||'⚠ העובד לא נמצא בעבודה — וודא שחתם כניסה','var(--red-txt)',5000);return;}
  // אם יש ברקוד בשדה — הוסף לסל
  if(isBcLen(raw.length)&&!bcSignGate('ts',raw))return; // 🔐
  if(isBcLen(raw.length)&&isSampleScan(raw)){
    // 👕 דגם ראשון — בלי שלבים, בלי שערי תחנה/סדר ובלי מגבלות הסל
    const item=await openScanItem(w.id,raw,_tsBatch,(document.getElementById('ts-dept')?.value||'').trim()); // 🔧 תיקון ⇒ חלון בחירה
    if(item===null)return; // בוטל
    if(item)_tsBatch.push(item);else if(!_tsBatch.length)return; // כפילות — מתחילים את מה שכבר בסל
  }else if(isBcLen(raw.length)){
    if(!isTotalBc(raw)&&parseInt(raw.slice(8,11))===0&&productHasDefinedQty(raw.slice(0,2),raw.slice(2,7))){showToast('⚠ קיים ברקוד עם כמות למוצר זה','var(--red-txt)',6000);return;}
    const cust=raw.slice(0,2),prod=raw.slice(2,7),size=raw.slice(7,8),col=raw.slice(11,13);
    const isTotal=isTotalBc(raw);const qty=isTotal?getTotalQty(cust,prod,orderNoOf(raw)):parseInt(raw.slice(8,11))||0;
    const stepsWrap=document.getElementById('ts-steps-wrap');const useSteps=stepsWrap&&stepsWrap.style.display!=='none';
    const checkedSteps=useSteps?[...document.querySelectorAll('#ts-steps-list input[type="checkbox"]:checked')].map(cb=>cb.dataset.step):[];
    if(useSteps&&!checkedSteps.length){showToast(T.err_sel_step||'⚠ בחר לפחות שלב עבודה אחד','var(--red-txt)');return;}
    // 🔒 שער התחנה (w = העובד שהמשימה נפתחת עבורו; העקיפה נקבעת לפי מי שמפעיל את הסורק)
    if(!await passRetiredGate([raw],true))return; // 🔒 ברקוד שסיים את תפקידו
    if(!await passStationGate(w,cust,prod,useSteps?checkedSteps:[],raw))return;
    // 🔗 שער סדר השלבים — נבדק על הברקוד שנסרק, לפני ההוספה לסל
    if(!await passMergeGate(cust,prod,raw,useSteps?checkedSteps:[(document.getElementById('ts-tasktype').value||'').trim()],w.id))return;
    const taskType=useSteps?'':((document.getElementById('ts-tasktype').value||'').trim());
    const taskDept=(document.getElementById('ts-dept').value||'').trim();
    const types=useSteps?checkedSteps:[taskType||''];
    if(!tsScanLimitsOk(raw,checkedSteps))return;
    const _sk=addStepsToBatch(_tsBatch,{raw,cust,prod,size,qty,col,isTotal,taskDept,want:_partWant('ts')},types);
    if(_sk.length){showToast(T.scan_not_added+' '+_sk.join(' · '),'var(--red-txt)',7000);if(!_tsBatch.length)return;}
  }
  if(!_tsBatch.length){showToast(T.err_scan_one||'⚠ סרוק לפחות ברקוד אחד','var(--red-txt)');return;}
  // 🔒 בדיקה חוזרת על **כל הסל** ברגע ההתחלה — כמו ב-bcStartBatch. בלעדיה השערים רצו
  // רק בענף שמוסיף ברקוד לסל, ולחיצה שנייה על "התחל" עם שדה ריק יצרה את כל המשימות
  // בלי שום בדיקה. שני מסלולים אמיתיים נפתחו כך: (1) החלפת העובד ב-ts-emp-sel אחרי
  // מילוי הסל — השער עבר על עובד א' והמשימות נפתחו לעובד ב'; (2) _tsBatch נשמר ב-
  // localStorage ולכן סל מאתמול נפתח היום בלי תחנה סרוקה.
  if(!await passBatchGates(w,_tsBatch))return;
  // בדיקת משימות מושהות — עם השלב, כדי להפריד בין כמה מושהות על אותו ברקוד
  const newBcs=_tsBatch.map(b=>({raw:b.raw,taskType:b.taskType||''}));
  const canProceed=await handlePausedTasks(w.id,newBcs);
  if(!canProceed){_tsBatch=[];renderTsBatchQueue();saveLS();return;}
  // ⚠️ קודם יוצרים, ורק אז סוגרים. הסגירה נכתבת ל-Firestore באופן סופי, וכל יציאה מהלולאה
  // שאחריה — רענון מבאנר העדכון באמצע הלולאה, או אחד משלושת ה-continue (כפילות מקומית /
  // כפילות בשרת / claimTaskGuard) — הותירה את העובדת בלי שום משימה פתוחה, והזמן נמחק בלי
  // עקבה (ايمان 08/08: 92 דקות ריקות). לכן: לא נסגר כלום עד שנוצרה לפחות משימה אחת.
  // תוצאת לוואי מכוונת: סריקה חוזרת של אותו ברקוד+שלב נחסמת כפילות ⇒ created===0 ⇒
  // המשימה הקיימת ממשיכה לרוץ במקום להיסגר לריק.
  const activeCurrent=S.activeTasks.filter(t=>t.workerId===w.id&&!t.paused);
  const swapMode=await askSwapMode(w,activeCurrent); // ⏸ זמנית / ✅ חדשה — כוונה בלבד
  const swapTime=srvNow(); // רגע אחד לסגירה ולפתיחה — בלי חפיפה ביניהן
  try{
    const batchId=_tsBatch.length>1?genBatchId():null;
    const startTime=swapTime;
    let created=0;
    const tsDupSkip=[];
    const tsSrvActive=await serverActiveTasks(w.id); // קריאה אחת לכל הסל, לא לכל פריט
    for(const b of _tsBatch){
      // חסימה חוזרת ברגע הפתיחה — סוגר מרוץ של פתיחה כפולה של אותה משימה (עובד+ברקוד+שלב פעיל)
      if(!b.isRepair&&S.activeTasks.some(x=>x.workerId===w.id&&taskBc(x)===b.raw&&(x.taskType||'')===(b.taskType||'')&&!x.paused))continue;
      if(!b.isRepair&&findDupIn(tsSrvActive,b.raw,b.taskType)){tsDupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
      // scannedBy/scannedByName — **מי הפעיל את הסורק**, להבדיל מ-workerId שהוא **למי** המשימה.
      // האחראי محمد פותח משימות עבור עובדות אחרות, ולכן startTime הוא רגע חלוקת העבודה ולא
      // רגע ההתחלה בפועל. בלי השדה הזה אי אפשר להפריד קצב עבודה מזמן חלוקה. נוסף 10/09/2026
      // בכל ארבע נקודות היצירה (5197 עצמי · כאן · 9268 מנהל · 9322 פיצול); רשומות ישנות בלעדיו.
      const task={id:String(Date.now())+Math.random().toString(36).slice(2,6),workerId:w.id,workerName:w.name,scannedBy:S.user?.id||'',scannedByName:S.user?.name||'',dept:b.taskDept||effDept(w),station:curStation(w)?.name||'',cust:b.cust,prod:b.prod,size:b.size,qty:b.qty,col:b.col,taskType:b.taskType,bc:b.raw,isTotal:b.isTotal||false,startTime,elapsed:0,accumulatedSec:0,prodStamp:b.prodStamp,...(b.splitId?{splitId:b.splitId}:{})};
      const exp=b.isSample?null:await fetchExpected(b.cust,b.prod,w.id,b.qty||_estQtyBc(b.raw)); // 👕 דגם — אין צפי · 📏 אין כמות ⇒ המשוערת
      if(exp?.ok&&exp.perStep?.[b.taskType]!=null)task.expectedMin=exp.perStep[b.taskType];
      if(b.isSample)task.isSample=true;if(b.isRepair)task.isRepair=true; // 🔧
      if(batchId)task.batchId=batchId;
      if(!(await claimTaskGuard(task)).ok){tsDupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
      S.activeTasks.push(task);created++;
      if(S.fbConnected)await fbSet('activeTasks',String(task.id),{...task,startTime:task.startTime.toISOString()});
      tgTask(task,true);
      if(w.pushPrefs?.task_assigned!==false)sendPushToWorker(w.id,'📋 משימה חדשה',`${task.prod}${task.taskType?' · '+task.taskType:''} · ${task.qty} יח'`).catch(()=>{});
      if(!b.isSample)await autoStampStage(b.cust,b.prod,b.taskDept||effDept(w)); // עדכון אוטומטי של שלב הייצור
    }
    // טיפול במשימות הקודמות — רק עכשיו, כשידוע שיש משימה חדשה שתחליף אותן
    if(created>0&&activeCurrent.length>0)await applySwapMode(swapMode,w.id,activeCurrent,swapTime);
    if(tsDupSkip.length)showToast((T.scan_not_added||'לא נוסף')+' '+tsDupSkip.join(' · '),'var(--red-txt)',7000);
    if(created>0)showToast('✅ '+created+' משימות התחילו עבור '+w.name);
    else if(activeCurrent.length)showToast('⚠ לא נפתחה משימה חדשה — המשימה הקודמת נשארה פעילה','var(--amber-txt)',7000);
    // מדיניות רכה: התחלת משימה בלי שיוך תחנה — תזכורת בלבד, לא חסימה
    if(!w.currentStation&&(S.workStations||[]).length)setTimeout(()=>showToast(T.st_reminder||'📍 תזכורת: סרוק ברקוד תחנה כדי לשייך אותך לעמדה','var(--amber-txt)',5000),1800);
    _tsBatch=[];renderTsBatchQueue();
    document.getElementById('ts-bc-inp').value='';document.getElementById('ts-bc-prev').innerHTML='';
    document.getElementById('ts-tasktype').value='';tsShowTaskTypeField(true);
    saveLS();renderTasks();goPage('tasks');
  }catch(e){showToast('❌ שגיאה: '+e.message,'var(--red-txt)',8000);}
}
function renderTsScan(){
  const sel=document.getElementById('ts-emp-sel');if(!sel)return;
  // עובד/עוזר פותח משימה לעצמו בלבד — בחירה אוטומטית ונעולה (וכך גם צפי הזמן מקבל workerId)
  const isSelf=S.user&&(S.user.role==='worker'||S.user.role==='helper');
  const cur=isSelf?S.user.id:sel.value;
  const selW=LANGS[currentLang].sel_worker||'בחר עובד...';
  let opts=S.workers.filter(w=>w.status==='in');
  if(isSelf&&!opts.some(w=>w.id===S.user.id))opts=[{id:S.user.id,name:S.user.name},...opts];
  sel.innerHTML=`<option value="">${selW}</option>`+opts.map(w=>`<option value="${w.id}" ${w.id===cur?'selected':''}>${esc(w.name)}</option>`).join('');
  if(isSelf){sel.value=S.user.id;sel.disabled=true;renderStepRecs('ts');}else{sel.disabled=false;}
  fillDeptSelects();
}

function mgrStopCam(){
  if(mgrCamStream)mgrCamStream.getTracks().forEach(t=>t.stop());
  if(mgrCamInterval)clearInterval(mgrCamInterval);
  mgrCamStream=null;mgrCamInterval=null;
  const c=document.getElementById('mgr-cam-container');if(c)c.style.display='none';
  const b=document.getElementById('mgr-cam-btn');if(b)b.style.display='flex';
}
