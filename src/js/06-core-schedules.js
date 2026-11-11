// ─── CLOCK ──────────────────────────────────────────────────
function updateClock(){
  const n=new Date();
  const s=pad2(n.getHours())+':'+pad2(n.getMinutes())+':'+pad2(n.getSeconds());
  const el=document.getElementById('att-clk');if(el)el.textContent=s;
  const days=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const months=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const el2=document.getElementById('att-dt');
  if(el2)el2.textContent='יום '+days[n.getDay()]+', '+n.getDate()+' '+months[n.getMonth()]+' '+n.getFullYear();
}
setInterval(updateClock,1000);updateClock();

// ─── SHA-256 (pure-JS, עובד גם ב-file://) ───────────────────
function sha256(str){
  function rr(x,n){return(x>>>n)|(x<<(32-n));}
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const enc=new TextEncoder().encode(str);
  const bits=enc.length*8;
  const padded=new Uint8Array(Math.ceil((enc.length+9)/64)*64);
  padded.set(enc);padded[enc.length]=0x80;
  new DataView(padded.buffer).setUint32(padded.length-4,bits,false);
  let a=0x6a09e667,b=0xbb67ae85,c=0x3c6ef372,d=0xa54ff53a,
      e=0x510e527f,f=0x9b05688c,g=0x1f83d9ab,h=0x5be0cd19;
  const dv=new DataView(padded.buffer);
  for(let i=0;i<padded.length;i+=64){
    const w=Array(64);
    for(let j=0;j<16;j++)w[j]=dv.getUint32(i+j*4,false);
    for(let j=16;j<64;j++){
      const s0=rr(w[j-15],7)^rr(w[j-15],18)^(w[j-15]>>>3);
      const s1=rr(w[j-2],17)^rr(w[j-2],19)^(w[j-2]>>>10);
      w[j]=(w[j-16]+s0+w[j-7]+s1)|0;
    }
    let A=a,B=b,C=c,D=d,E=e,F=f,G=g,H=h;
    for(let j=0;j<64;j++){
      const S1=rr(E,6)^rr(E,11)^rr(E,25),ch=(E&F)^(~E&G);
      const t1=(H+S1+ch+K[j]+w[j])|0;
      const S0=rr(A,2)^rr(A,13)^rr(A,22),maj=(A&B)^(A&C)^(B&C);
      const t2=(S0+maj)|0;
      H=G;G=F;F=E;E=(D+t1)|0;D=C;C=B;B=A;A=(t1+t2)|0;
    }
    a=(a+A)|0;b=(b+B)|0;c=(c+C)|0;d=(d+D)|0;
    e=(e+E)|0;f=(f+F)|0;g=(g+G)|0;h=(h+H)|0;
  }
  return[a,b,c,d,e,f,g,h].map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
}
function hashPass(p){return'$h:'+sha256(p);}
async function getDeviceId(){
  // UUID קבוע ב-localStorage — fingerprint ישן נכשל ב-iOS (כל האייפונים קיבלו אותו hash)
  try{
    let id=localStorage.getItem('txops_device_uuid');
    if(id)return id;
    if(window.crypto&&crypto.randomUUID)id='$u:'+crypto.randomUUID();
    else if(window.crypto&&crypto.getRandomValues){const a=new Uint8Array(16);crypto.getRandomValues(a);id='$u:'+Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');}
    else id='$u:'+Date.now().toString(36)+Math.random().toString(36).slice(2);
    localStorage.setItem('txops_device_uuid',id);
    return id;
  }catch(e){return null;}
}

// ─── TOAST הודעה גלויה תמיד ───────────────────────────────
function showToast(txt,color='var(--green-txt)',dur=3500){
  let t=document.getElementById('_toast');
  if(!t){t=document.createElement('div');t.id='_toast';t.style.cssText='position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--card);border:2px solid currentColor;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;text-align:center;max-width:90vw;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:opacity .3s';document.body.appendChild(t);}
  t.style.color=color;t.textContent=txt;t.style.opacity='1';
  clearTimeout(t._tid);t._tid=setTimeout(()=>t.style.opacity='0',dur);
}
// ─── CONFIRM MODAL (במקום confirm() שנחסם ב-iOS) ───────────
let _cfmResolve=null;
function showConfirm(title,msg,okText='אישור',cancelText='ביטול'){
  return new Promise(res=>{
    _cfmResolve=res;
    document.getElementById('cfm-title').textContent=title;
    document.getElementById('cfm-msg').innerHTML=msg.replace(/\n/g,'<br>');
    document.getElementById('cfm-ok').textContent=okText;
    document.getElementById('cfm-cancel').textContent=cancelText;
    document.getElementById('cfm-wrap').classList.remove('hidden');
  });
}
function _cfmClose(val){if(_cfmResolve){_cfmResolve(val);_cfmResolve=null;}document.getElementById('cfm-wrap').classList.add('hidden');}

// שלב 2 אבטחה: סודות (hash סיסמה/תבניות פנים/מזהה מכשיר) כבר לא נשמרים בדפדפן —
// ניקוי עותקים ישנים מ-localStorage כדי שלא ייכתבו בטעות חזרה ל-Firestore
function migratePasswords(){
  let changed=false;
  S.workers.forEach(w=>{
    ['pass','faceDescriptor','faceDescriptors','deviceId'].forEach(k=>{if(w[k]!==undefined){delete w[k];changed=true;}});
  });
  if(changed)saveLS();
}

// ─── DAILY RESET ─────────────────────────────────────────────
async function runDailyReset(){
  const lastDate=localStorage.getItem('txops3_lastdate');
  const today=todayStr();
  if(lastDate&&lastDate!==today){
    for(const w of S.workers){
      // בדוק אם ל-session יש תאריך ישן (מ-localStorage) — רק אז כותבים ל-Firebase
      const firstIn=w.sessions?.[0]?.in||w.checkin;
      const sessionDay=firstIn?firstIn.slice(0,10):null;
      const hadOldSession=sessionDay&&sessionDay<today;
      if(w.status==='in'&&hadOldSession){
        const sessions=w.sessions&&w.sessions.length?w.sessions:(w.checkin?[{in:w.checkin,out:null}]:[]);
        // אין יציאה מאתמול — חיתוך בסוף המשמרת של יום העבודה (לא ב"עכשיו" של הבוקר שאחרי)
        const _cutISO=shiftEndDate(sessionDay).toISOString();
        const rec={workerId:w.id,workerName:w.name,dept:w.dept,date:lastDate,
          ...attCloseSessions(sessions,_cutISO),checkin:sessions[0]?.in||w.checkin,
          breakStart:w.breakStart||'',breakEnd:w.breakEnd||'',breakActive:!!w.breakActive,netMs:calcNetWorkCapped({...w,sessions},sessionDay)};
        S.attHistory.unshift(rec);
        if(S.fbConnected){
          // בדוק אם קיימת רשומה עם checkout — אם כן, אל תדרוס
          const existRec=await fbGet('attHistory',w.id+'_'+lastDate);
          if(!existRec||!existRec.checkout){fbSet('attHistory',w.id+'_'+lastDate,rec);}
        }
      }
      w.status='out';w.checkin=null;w.checkout=null;w.sessions=[];
      // אל תכתוב ל-Firebase — הטאב עומד להיטען מחדש; הנתונים הטריים יגיעו מהשרת אחרי הרענון
    }
    // יום חדש התגלה — רענון מלא של הדף במקום איפוס-בזיכרון.
    // זה מבטיח שהטאב תמיד טוען את הגרסה העדכנית ביותר, ומונע מצב של טאב פתוח
    // מאתמול שממשיך לרוץ עם קוד ישן וגם עם נתוני localStorage ישנים.
    S.tgSentAlerts={};
    S.tgAbsentSig='';
    saveLS();
    localStorage.setItem('txops3_lastdate',today);
    doAppUpdate(); // דרך doAppUpdate כדי לשמר ?kiosk=1 — אחרת מסך הקיר מאבד את הפתיחה האוטומטית כל בוקר
    return;
  }
  localStorage.setItem('txops3_lastdate',today);
}
// רץ בטעינת הדף (מקרה שהאפליקציה נפתחה אחרי חצות)
runDailyReset();
// ─── טיימר לאיפוס יומי ב-00:01 בלילה ────────────────────────
function scheduleMidnightReset(){
  const now=new Date();
  const nextMidnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,1,0);
  const msUntil=nextMidnight-now;
  setTimeout(()=>{
    runDailyReset();
    scheduleMidnightReset(); // קבע שוב ל-24 שעות הבאות
  },msUntil);
}
scheduleMidnightReset();
// נעילה אטומית ב-Firestore — אותו דפוס כמו _claimDailyReport, מונעת התראה כפולה משני מכשירים
async function _claimEndOfDayAlert(){
  const today=todayStr();
  if(localStorage.getItem('txops_eod_alert_sent')===today)return false;
  if(!S.fbConnected||!db)return false;
  try{
    const{runTransaction,doc}=window._fb;
    await runTransaction(db,async tx=>{
      const ref=doc(db,'appSettings','endOfDayAlert');
      const snap=await tx.get(ref);
      if(snap.exists()&&snap.data().date===today)throw new Error('already-sent');
      tx.set(ref,{date:today});
    });
  }catch(e){return false;}
  localStorage.setItem('txops_eod_alert_sent',today);
  return true;
}
function scheduleEndOfDayAlert(){
  const time=S.settings.endOfDayTime||'15:05';
  const[h,m]=time.split(':').map(Number);
  const now=new Date();
  let next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m,0);
  if(next<=now)next.setDate(next.getDate()+1);
  setTimeout(async()=>{
    // מכשיר שנרדם: setTimeout יורה בהתעוררות, שעות אחרי היעד — לפעול רק בטווח ±10 דק' מסביב לשעת היעד
    const fireDelta=Math.abs(Date.now()-next.getTime());
    const stillIn=S.workers.filter(w=>w.status==='in');
    // הנעילה נתפסת רק כשבאמת יש מה לשלוח — אחרת מכשיר עם רשימה ריקה היה תופס את
    // הנעילה ליום כולו ומשתיק מכשיר אחר שכן רואה עובדים פתוחים
    if(fireDelta<=10*60*1000&&stillIn.length>0&&await _claimEndOfDayAlert()){
      const names=stillIn.map(w=>w.name+' ('+w.dept+')').join(', ');
      sendTelegram(`⚠️ שעת סיום עבודה ${time} — לא חתמו יציאה:\n${names}`).catch(()=>{});
    }
    scheduleEndOfDayAlert();
  },next-now);
}
scheduleEndOfDayAlert();

// ─── דוח נוכחות יומי ב-15:15 ──────────────────────────────
async function sendDailyAttReport(){
  const today=todayStr();
  const dayNames=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const dayName=dayNames[new Date().getDay()];
  const present=S.workers.filter(w=>w.checkin&&w.checkin.slice(0,10)===today);
  const absent=S.workers.filter(w=>w.role!=='manager'&&(!w.checkin||w.checkin.slice(0,10)!==today));
  // יום חופש/חג — אף אחד לא נכח: שורה אחת במקום דוח מלא + CSV
  if(!present.length){
    await sendTelegram('📋 דוח נוכחות — '+today+' יום '+dayName+'\nאין נוכחות היום');
    return;
  }
  const fmtTime=iso=>{if(!iso)return '--:--';const d=new Date(iso);return(d.getHours()+'').padStart(2,'0')+':'+(d.getMinutes()+'').padStart(2,'0');};
  const fmtNet=ms=>{if(!ms||ms<=0)return '';const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);return h+'ש '+m+'ד';};
  // הודעת טקסט
  let msg='📋 דוח נוכחות — '+today+' יום '+dayName+'\n';
  msg+='─────────────────\n';
  msg+='✅ נכחו ('+present.length+'):\n';
  present.forEach(w=>{
    const ci=fmtTime(w.checkin);
    const co=w.checkout?fmtTime(w.checkout):'בתוך';
    const net=fmtNet(calcNetWork(w));
    msg+='• '+w.name+' — '+w.dept+'\n  כניסה '+ci+' יציאה '+co+(net?' ('+net+')':'')+'\n';
  });
  if(absent.length>0){
    msg+='─────────────────\n';
    msg+='❌ נעדרו ('+absent.length+'):\n';
    absent.forEach(w=>msg+='• '+w.name+' — '+w.dept+'\n');
  }
  msg+='─────────────────\n';
  msg+='סה"כ: '+present.length+'/'+(present.length+absent.length)+' עובדים';
  await sendTelegram(msg);
  // שלח קובץ CSV להדפסה
  try{
    // בניית CSV
    const BOM='﻿';
    let csv=BOM+'sep=,\n'+'שם,מחלקה,תפקיד,כניסה,יציאה,שעות נטו,סטטוס\n';
    present.forEach(w=>{
      const ci=fmtTime(w.checkin);
      const co=w.checkout?fmtTime(w.checkout):'בתוך';
      const net=fmtNet(calcNetWork(w));
      const role=w.role==='manager'?'מנהל':w.role==='supervisor'?'אחראי':w.role==='helper'?'עוזר':'עובד';
      csv+='"'+w.name+'","'+w.dept+'","'+role+'","'+ci+'","'+co+'","'+net+'","נכח"\n';
    });
    absent.forEach(w=>{
      const role=w.role==='manager'?'מנהל':w.role==='supervisor'?'אחראי':w.role==='helper'?'עוזר':'עובד';
      csv+='"'+w.name+'","'+w.dept+'","'+role+'","--","--","","נעדר"\n';
    });
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const b64=await blobToB64(blob);
    tgCall({kind:'document',dataB64:b64,filename:'נוכחות_'+today+'.csv',caption:'📎 קובץ נוכחות להדפסה — '+today});
  }catch(e){}
}
// נעילה אטומית ב-Firestore Transaction — מונע דוח כפול גם כששני מכשירים יורים באותה שנייה
async function _claimDailyReport(){
  const today=todayStr();
  if(localStorage.getItem('txops_daily_report_sent')===today)return false;
  // בלי Firebase מחובר אין דוח — מונע דוח ריק/ישן ממכשיר לא מסונכרן
  if(!S.fbConnected||!db)return false;
  try{
    const{runTransaction,doc}=window._fb;
    await runTransaction(db,async tx=>{
      const ref=doc(db,'appSettings','dailyReport');
      const snap=await tx.get(ref);
      if(snap.exists()&&snap.data().date===today)throw new Error('already-sent');
      tx.set(ref,{date:today});
    });
  }catch(e){return false;} // מכשיר אחר זכה בנעילה — לא שולחים
  localStorage.setItem('txops_daily_report_sent',today);
  return true;
}
// 🕒 (24/10/2026, מעבר לשעון חורף) שעת הדוח = סיום המשמרת + 15 דק' (היה 15:15 קבוע; משמרת 15:00).
// התראת אי-יציאה = סיום המשמרת + 45 דק'. שינוי "שעת סיום משמרת" בהגדרות מזיז את שניהם.
function _afterShiftEnd(now,addMin){
  const[h,m]=String(S.settings?.shiftEnd||'15:00').split(':').map(n=>parseInt(n,10)||0);
  return new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m+addMin,0);
}
function scheduleDailyReport(){
  const now=new Date();
  const target=_afterShiftEnd(now,15);
  // אם עברנו 15:15 ועדיין לא נשלח היום — שלח מיד (אחרי 3 שניות לטעינת נתונים + Firebase)
  if(now>=target){
    setTimeout(async()=>{if(await _claimDailyReport())await sendDailyAttReport();},3000);
    target.setDate(target.getDate()+1);
  }
  const msUntil=target-now;
  setTimeout(async()=>{
    if(await _claimDailyReport())await sendDailyAttReport();
    scheduleDailyReport();
  },msUntil);
}
scheduleDailyReport();

// ─── גיבוי אוטומטי יומי ב-17:00 (רק אצל מנהל) ──────────
async function runDailyBackup(){
  if(!S.user||S.user.role!=='manager')return;
  const today=todayStr();
  if(localStorage.getItem('txops_backup_done')===today)return;
  localStorage.setItem('txops_backup_done',today);
  // גיבוי כולל את כל ההיסטוריה השמורה (עד HIST_RETENTION_DAYS), לא רק חלון החי
  const histFull=await loadHistRange('','');
  // 🛑 גיבוי חייב את כל הנוכחות, לא את חלון ה-45 יום — אחרת הגיבוי עצמו חלקי בשקט
  const attFull=await loadAttRange('','');
  const data={
    exportDate:new Date().toISOString(),
    workers:S.workers,
    activeTasks:S.activeTasks,
    histTasks:histFull,
    attHistory:attFull,
    products:S.products||[],
    settings:S.settings
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='textileops_backup_'+today+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
async function manualBackup(){
  if(!S.user||S.user.role!=='manager')return;
  const st=document.getElementById('backup-status');
  const histFull=await loadHistRange('','');
  const attFull=await loadAttRange('','');   // 🛑 כל הנוכחות, לא חלון 45 יום
  const data={exportDate:new Date().toISOString(),workers:S.workers,activeTasks:S.activeTasks,histTasks:histFull,attHistory:attFull,products:S.products||[],settings:S.settings};
  try{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='textileops_backup_'+todayStr()+'_'+new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}).replace(':','-')+'.json';
    a.click();
    URL.revokeObjectURL(a.href);
    st.style.color='var(--green-txt)';st.textContent='✅ גיבוי הורד — '+new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  }catch(e){st.style.color='var(--red-txt)';st.textContent='שגיאה: '+e.message;}
}
function scheduleDailyBackup(){
  const now=new Date();
  const target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),17,0,0);
  if(now>=target)target.setDate(target.getDate()+1);
  setTimeout(()=>{runDailyBackup();scheduleDailyBackup();},target-now);
}
scheduleDailyBackup();

// ─── התראת 15:45 — עובדים שלא החתימו יציאה ─────────────
async function _claimPunchOutAlert(){
  const today=todayStr();
  if(localStorage.getItem('txops_poalert_sent')===today)return false;
  if(!S.fbConnected||!db)return false;
  try{
    const{runTransaction,doc}=window._fb;
    await runTransaction(db,async tx=>{
      const ref=doc(db,'appSettings','punchOutAlert');
      const snap=await tx.get(ref);
      if(snap.exists()&&snap.data().date===today)throw new Error('already-sent');
      tx.set(ref,{date:today});
    });
  }catch(e){return false;}
  localStorage.setItem('txops_poalert_sent',today);
  return true;
}
async function sendPunchOutAlert(){
  const stillIn=S.workers.filter(w=>w.status==='in');
  if(!stillIn.length)return;
  let msg='⏰ TextileOps — עובדים שלא החתימו יציאה:\n';
  stillIn.forEach(w=>{
    const ci=w.checkin?new Date(w.checkin):null;
    msg+='• '+w.name+' — '+w.dept+(ci?' (כניסה '+pad2(ci.getHours())+':'+pad2(ci.getMinutes())+')':'')+'\n';
  });
  msg+='\nלתיקון: ניהול משימות ← ✏️ ליד העובד';
  await sendTelegram(msg);
}
function schedulePunchOutAlert(){
  const now=new Date();
  const target=_afterShiftEnd(now,45);
  // אם עברנו 15:45 וטרם נבדק היום — בדוק עכשיו (אחרי טעינת נתונים)
  if(now>=target){
    setTimeout(async()=>{if(await _claimPunchOutAlert())await sendPunchOutAlert();},5000);
    target.setDate(target.getDate()+1);
  }
  setTimeout(async()=>{
    if(await _claimPunchOutAlert())await sendPunchOutAlert();
    schedulePunchOutAlert();
  },target-now);
}
schedulePunchOutAlert();

migratePasswords();
migrateToSessions();
migrateBreaks(false); // מקור: localStorage — לא אמת שרת, אסור לכתוב ממנו

// ─── PERMISSIONS ────────────────────────────────────────────
function applyPerms(w){
  const fb=document.getElementById('floating-msg-btn');
  if(fb)fb.style.display=w.role==='manager'?'none':'flex';
  document.getElementById('enable-notif-btn')?.classList.toggle('hidden',w.role==='manager');
  // 🤖 עוזר AI — מנהל בלבד (הוחזר 11/11/2026; השרת אוכף את אותו דבר ב-aiChat)
  document.getElementById('ai-chat-btn')?.classList.toggle('hidden',w.role!=='manager');
  if(w.role!=='manager')closeAIChat();
  if(w.role==='manager'){
    [...ALL_SUPERVISOR_PAGE_IDS,'admin','setup','costs','products'].forEach(p=>document.getElementById('nb-'+p)?.classList.remove('hidden'));
  } else {
    ['admin','setup'].forEach(p=>document.getElementById('nb-'+p)?.classList.add('hidden'));
    const availPages=w.role==='supervisor'?ALL_SUPERVISOR_PAGE_IDS:ALL_WORKER_PAGE_IDS; // helper ו-worker מקבלים אותן הרשאות
    const perms=w.permissions||defaultPerms(availPages);
    ALL_SUPERVISOR_PAGE_IDS.forEach(p=>{
      const btn=document.getElementById('nb-'+p);
      if(btn){(availPages.includes(p)&&perms.includes(p))?btn.classList.remove('hidden'):btn.classList.add('hidden');}
    });
  }
  // מסך תצוגה (Kiosk) — למנהל ולאחראי בלבד
  const showKiosk=w.role==='manager'||w.role==='supervisor';
  document.getElementById('nb-kiosk')?.classList.toggle('hidden',!showKiosk);
}

