// ─── ALERTS ─────────────────────────────────────────────────
function checkAlerts(){
  const thresh=(parseInt(document.getElementById('al-thresh')?.value)||60)*60;
  const absThresh=parseInt(document.getElementById('al-absent')?.value)||5;
  S.alerts=[];
  S.activeTasks.forEach(t=>{
    // משימה מושהית אינה "רצה הרבה זמן" — עד 26/09 נספרה עם כל הזמן שצברה
    if(!t.paused&&t.elapsed>thresh)S.alerts.push({type:'long',key:'long:'+t.id,hasExp:+t.expectedMin>0,msg:`${t.workerName} — ${fmtM(t.elapsed)} על לקוח ${t.cust} מוצר ${t.prod}`,sev:'warn'});
  });
  const absW=S.workers.filter(w=>w.status==='out');
  const abs=absW.length;
  if(abs>=absThresh)S.alerts.push({type:'absent',sig:absW.map(w=>w.id).sort().join(','),msg:`${abs} עובדים נעדרים היום: ${absW.map(w=>w.name).join(', ')}`,sev:'err'});
  const cnt=S.alerts.length;
  const el=document.getElementById('al-cnt');
  if(el){el.textContent=cnt;cnt>0?el.classList.remove('hidden'):el.classList.add('hidden');}
  const s=document.getElementById('al-sum');if(s)s.textContent=cnt;
  const lg=document.getElementById('al-long');if(lg)lg.textContent=S.alerts.filter(a=>a.type==='long').length;
  const ab=document.getElementById('al-abs');if(ab)ab.textContent=S.alerts.filter(a=>a.type==='absent').length;
  // 📨 שליחה לטלגרם. עד 26/09 כל מכשיר זכר לבד (localStorage) מה נשלח ⇒ כל מכשיר שנפתח
  // (כולל החתמת כניסה) שלח שוב את כל הרשימה; ומכשיר שלא נפתח מאז חמישי שלח מהזיכרון
  // המקומי משימות ישנות ("2861 דק'") ו"21 נעדרים" — לפני שנתוני השרת הגיעו. עכשיו:
  // • ממתינים ל-_activeTasksReady ו-_workersReady (נתונים מהשרת, לא cache)
  // • רישום משותף appSettings/tgAlertLog בטרנזקציה — רק המכשיר שתפס את ההתראה שולח
  // • משימה עם צפי מהתמחור — השרת (longTaskMonitor) כבר שולח "חריגה מזמן מתוקצב"
  // S.tgSentAlerts/tgAbsentSig נשארו כמסנן מקומי מהיר (checkAlerts רץ כל שנייה) — לא כהכרעה.
  const ws=S.settings;
  if(ws.waEnabled&&cnt>0&&waInWorkingHours()&&_activeTasksReady&&_workersReady&&!_tgClaimBusy&&db){
    const longs=ws.waLong?S.alerts.filter(a=>a.type==='long'&&!a.hasExp&&!S.tgSentAlerts[a.key]):[];
    longs.forEach(a=>{S.tgSentAlerts[a.key]=true;});
    const absAlert=ws.waAbsent?S.alerts.find(a=>a.type==='absent'&&a.sig!==S.tgAbsentSig):null;
    if(absAlert)S.tgAbsentSig=absAlert.sig;
    if(longs.length||absAlert){
      _tgClaimBusy=true;
      _tgClaimAlerts(longs.map(a=>a.key),absAlert?absAlert.sig:null).then(r=>{
        const lines=longs.filter(a=>r.keys.includes(a.key)).map(a=>'⏰ '+a.msg);
        if(r.abs)lines.push('👤 '+absAlert.msg);
        if(!lines.length)return;
        return sendTelegram('TextileOps — התראות:\n'+lines.join('\n')).then(ok=>{
          if(ok){S.waLastSent=Date.now();saveLS();const st=document.getElementById('wa-status');if(st){st.textContent='✅ נשלח '+new Date().toLocaleTimeString('he-IL');st.style.color='var(--green-txt)';}}
          else _tgReleaseAlerts(r.keys,r.abs);
        });
      }).catch(e=>console.warn('📨 רישום התראות נכשל:',e.message)).finally(()=>{_tgClaimBusy=false;});
    }
  }
}
// רישום משותף של התראות שנשלחו — מפתח לכל משימה ('long:'+id) + חתימת רשימת הנעדרים של היום.
// הטרנזקציה מבטיחה שרק מכשיר אחד "תופס" כל התראה. מפתחות מעל 3 ימים נמחקים בכל כתיבה.
let _tgClaimBusy=false;
async function _tgClaimAlerts(keys,absSig){
  const{doc,runTransaction}=window._fb;const ref=doc(db,'appSettings','tgAlertLog');
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);const d=snap.exists()?snap.data():{};
    const now=Date.now(),cut=now-3*864e5,sent={};
    Object.entries(d.sent||{}).forEach(([k,ts])=>{if(ts>cut)sent[k]=ts;});
    const got=keys.filter(k=>!sent[k]);got.forEach(k=>{sent[k]=now;});
    const day=todayStr();const abs=!!absSig&&!(d.absDay===day&&d.absSig===absSig);
    tx.set(ref,{sent,absSig:abs?absSig:(d.absSig||''),absDay:abs?day:(d.absDay||'')});
    return{keys:got,abs};
  });
}
// שליחה לטלגרם נכשלה ⇒ משחררים את מה שנתפס, כדי שמכשיר אחר (או הבא) ישלח
async function _tgReleaseAlerts(keys,abs){
  keys.forEach(k=>{delete S.tgSentAlerts[k];});
  if(abs)S.tgAbsentSig='';
  try{
    const{doc,runTransaction}=window._fb;const ref=doc(db,'appSettings','tgAlertLog');
    await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);if(!snap.exists())return;const d=snap.data();
      const sent={...(d.sent||{})};keys.forEach(k=>{delete sent[k];});
      tx.set(ref,{sent,absSig:abs?'':(d.absSig||''),absDay:abs?'':(d.absDay||'')});
    });
  }catch(e){console.warn('📨 שחרור התראות נכשל:',e.message);}
}
function renderAlerts(){
  const el=document.getElementById('alerts-list');if(!el)return;
  if(!S.alerts.length){el.innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--txt3)">✅ אין התראות פעילות</div>';return;}
  el.innerHTML=S.alerts.map(a=>`<div class="al-item ${a.sev}"><div style="font-size:20px">${a.type==='long'?'⏰':'👤'}</div><div style="font-size:13px;font-weight:500;color:var(--txt)">${esc(a.msg)}</div></div>`).join('');
}
function saveSettings(){
  S.settings.thresh=parseInt(document.getElementById('al-thresh').value)||60;
  S.settings.absent=parseInt(document.getElementById('al-absent').value)||5;
  S.settings.waEnabled=document.getElementById('wa-enabled')?.checked||false;
  S.settings.waInterval=parseInt(document.getElementById('wa-interval')?.value)||60;
  S.settings.waFrom=document.getElementById('wa-from')?.value||'07:00';
  S.settings.waTo=document.getElementById('wa-to')?.value||'18:00';
  S.settings.waLong=document.getElementById('wa-long')?.checked??true;
  S.settings.waAbsent=document.getElementById('wa-absent')?.checked??true;
  S.settings.factoryIP=document.getElementById('factory-ip')?.value||'188.225.231.120';
  S.settings.shiftStart=document.getElementById('st-shift-start')?.value||'06:30';
  S.settings.shiftEnd=document.getElementById('st-shift-end')?.value||'15:00';
  S.settings.roundMinutes=parseInt(document.getElementById('st-round-min')?.value)||5;
  S.settings.endOfDayTime=document.getElementById('al-endofday')?.value||'15:05';
  const rp=document.getElementById('st-round-preview');if(rp)rp.textContent=S.settings.roundMinutes;
  const rp2=document.getElementById('st-round-preview2');if(rp2)rp2.textContent=S.settings.roundMinutes;
  document.querySelectorAll('.st-ss-lbl').forEach(e=>e.textContent=S.settings.shiftStart);
  document.querySelectorAll('.st-se-lbl').forEach(e=>e.textContent=S.settings.shiftEnd);
  saveLS();
  // שמור הגדרות טלגרם + IP ב-Firebase כדי שכל מכשיר יקבל אותם
  if(S.fbConnected){
    fbSet('appSettings','telegramSettings',{
      factoryIP:S.settings.factoryIP,
      waEnabled:S.settings.waEnabled,
      waInterval:S.settings.waInterval,
      waFrom:S.settings.waFrom,
      waTo:S.settings.waTo,
      waLong:S.settings.waLong,
      waAbsent:S.settings.waAbsent,
      thresh:S.settings.thresh,
      absent:S.settings.absent,
      shiftStart:S.settings.shiftStart,
      shiftEnd:S.settings.shiftEnd,
      roundMinutes:S.settings.roundMinutes
    });
  }
}
// ─── מצב גיבוי לבדיקת IP המפעל ───────────────────────────────
// משהה את בדיקת ה-IP לחלון קצוב במקום למחוק את factoryIP: הכתובת נשארת שמורה
// וההגנה חוזרת לבד בתום הזמן. האכיפה האמיתית היא בשרת (login + wifiMonitor)
// מול שעון השרת; כאן זה תצוגה והשתקת ההתראות של מנטר המנהל בדפדפן בלבד.
function ipBypassLeftMs(){
  const mins=Number(S.settings.ipBypassMin)||0;
  const st=Number(S.settings.ipBypassStartMs)||0;
  if(!mins||!st)return 0;
  return Math.max(0,st+mins*60000-Date.now());
}
function _fmtBypassLeft(ms){
  const tot=Math.ceil(ms/60000),h=Math.floor(tot/60),m=tot%60;
  return (h?h+' שע\' ':'')+m+' דק\'';
}
function renderIpBypass(){
  const box=document.getElementById('ipbp-status');if(!box)return;
  const left=ipBypassLeftMs(),on=left>0;
  const wrap=document.getElementById('ipbp-wrap');
  if(wrap)wrap.style.background=on?'var(--red-bg)':'var(--bg2)';
  if(on){
    const until=new Date(Date.now()+left).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
    box.innerHTML='<strong style="color:var(--red-txt)">🔓 מצב גיבוי פעיל</strong> — בדיקת ה-IP מושהית עד '+until+' (נותרו '+_fmtBypassLeft(left)+')';
  }else{
    box.innerHTML='<strong style="color:var(--green-txt)">🔒 בדיקת IP פעילה</strong> — עובדים עם 🏭 חייבים להיות ברשת המפעל';
  }
  const b1=document.getElementById('ipbp-start'),b2=document.getElementById('ipbp-cancel');
  if(b1)b1.style.display=on?'none':'';
  if(b2)b2.style.display=on?'':'none';
}
async function startIpBypass(){
  if(S.user?.role!=='manager'){showToast('רק מנהל יכול להפעיל מצב גיבוי','var(--red-txt)');return;}
  const h=parseInt(document.getElementById('ipbp-h')?.value)||0;
  const m=parseInt(document.getElementById('ipbp-m')?.value)||0;
  const mins=h*60+m;
  if(mins<1){showToast('בחר משך — לפחות דקה אחת','var(--red-txt)');return;}
  if(mins>72*60){showToast('משך מקסימלי — 72 שעות','var(--red-txt)');return;}
  if(!confirm('להשהות את בדיקת IP המפעל ל-'+_fmtBypassLeft(mins*60000)+'?\nבזמן הזה עובדים יוכלו להיכנס מכל רשת. ההגנה תחזור לבד בתום הזמן.'))return;
  try{
    const{serverTimestamp}=window._fb;
    await fbSet('appSettings','telegramSettings',{ipBypassMin:mins,ipBypassStart:serverTimestamp(),ipBypassEnded:false});
    showToast('🔓 מצב גיבוי הופעל ל-'+_fmtBypassLeft(mins*60000),'var(--green-txt)',5000);
    sendTelegram('🔓 TextileOps — מצב גיבוי הופעל\n🏭 בדיקת IP המפעל מושהית ל-'+_fmtBypassLeft(mins*60000)+'\n👤 הופעל ע"י: '+(S.user?.name||'מנהל')+'\n🕐 שעה: '+new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})+'\nההגנה תחזור לפעול לבד בתום הזמן.');
  }catch(e){showToast('❌ שמירה נכשלה: '+e.message,'var(--red-txt)',5000);}
}
async function cancelIpBypass(){
  if(S.user?.role!=='manager')return;
  if(!confirm('להחזיר את בדיקת ה-IP עכשיו?'))return;
  try{
    await fbSet('appSettings','telegramSettings',{ipBypassMin:0,ipBypassEnded:true});
    showToast('🔒 מצב גיבוי בוטל — בדיקת IP פעילה','var(--green-txt)',4000);
    sendTelegram('🔒 TextileOps — מצב גיבוי בוטל ידנית\n🏭 בדיקת IP המפעל פעילה שוב\n🕐 שעה: '+new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}));
  }catch(e){showToast('❌ ביטול נכשל: '+e.message,'var(--red-txt)',5000);}
}
// רענון הספירה לאחור בזמן שהלשונית פתוחה
setInterval(()=>{try{renderIpBypass();}catch(e){}},30000);

function loadWaSettings(){
  const s=S.settings;
  const set=(id,v)=>{const el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=v;else el.value=v;};
  set('wa-enabled',s.waEnabled||false);
  set('wa-interval',s.waInterval||60);
  set('wa-from',s.waFrom||'07:00');
  set('wa-to',s.waTo||'18:00');
  set('wa-long',s.waLong??true);
  set('wa-absent',s.waAbsent??true);
  set('factory-ip',s.factoryIP||'188.225.231.120');
  set('st-shift-start',s.shiftStart||'06:30');
  set('st-shift-end',s.shiftEnd||'15:00');
  set('st-round-min',s.roundMinutes??5);
  const rp=document.getElementById('st-round-preview');if(rp)rp.textContent=s.roundMinutes??5;
  const rp2=document.getElementById('st-round-preview2');if(rp2)rp2.textContent=s.roundMinutes??5;
  document.querySelectorAll('.st-ss-lbl').forEach(e=>e.textContent=s.shiftStart||'06:30');
  document.querySelectorAll('.st-se-lbl').forEach(e=>e.textContent=s.shiftEnd||'15:00');
  set('al-thresh',s.thresh||60);
  set('al-absent',s.absent||5);
  set('al-endofday',s.endOfDayTime||'15:05');
  renderIpBypass();
}
/* ── PUSH NOTIFICATIONS (FCM) ── */
async function workerEnableNotif(){
  const w=S.user;
  if(!w)return;
  document.getElementById('worker-notif-bar').style.display='none';
  await initWorkerFCM(w.id);
  if(Notification.permission==='granted')showToast('✅ התראות הופעלו!','var(--green-txt)',3000);
  else showToast('❌ לא אושרו התראות','var(--red-txt)',3000);
}
async function initWorkerFCM(workerId){
  try{
    if(!('Notification' in window)||!('serviceWorker' in navigator))return;
    // בקש הרשאה קודם — חייב להיות ישירות מ-user gesture
    const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(perm!=='granted')return;
    // המתן ל-Firebase עד 5 שניות
    for(let i=0;i<10;i++){if(window._fbApp&&window._fbFunctions)break;await new Promise(r=>setTimeout(r,500));}
    if(!window._fbApp||!window._fbFunctions)return;
    const pushSnap=await fbGet('appSettings','pushSettings');
    if(!pushSnap?.vapidKey)return;
    const swReg=await navigator.serviceWorker.register('/textileops/firebase-messaging-sw.js');
    const{getMessaging,getToken,onMessage}=window._fb;
    const messaging=getMessaging(window._fbApp);
    const token=await getToken(messaging,{vapidKey:pushSnap.vapidKey,serviceWorkerRegistration:swReg});
    if(token){
      const{doc,setDoc}=window._fb;
      await setDoc(doc(db,'workers',workerId),{fcmToken:token},{merge:true});
      console.log('FCM worker token saved ✅');
      showToast('✅ התראות הופעלו!','var(--green-txt)',3000);
    }else{
      console.warn('FCM: getToken returned null');
      showToast('❌ לא הצלחנו לקבל טוקן','var(--red-txt)',3000);
    }
    onMessage(messaging,payload=>{
      const t=payload.notification?.title||'TextileOps';
      const b=payload.notification?.body||'';
      showToast('🔔 '+t+(b?'\n'+b:''),'var(--blue-txt)',5000);
    });
  }catch(e){console.error('initWorkerFCM error:',e);showToast('❌ שגיאה: '+e.message,'var(--red-txt)',5000);}
}
async function sendPushToWorker(workerId,title,body){
  try{
    if(!window._fbFunctions)return;
    const{httpsCallable}=window._fb;
    const fn=httpsCallable(window._fbFunctions,'sendPushToWorker');
    await fn({workerId,title,body});
  }catch(e){console.error('sendPushToWorker error:',e);}
}
// 🔔 תזכורת על משימה שחרגה — השרת (remindLateTask) שולח לעובד + לאחראי, עם הגבלה של פעם בדקה
async function remindLateTask(ids,btn){
  const T=LANGS[currentLang];
  if(!window._fbFunctions){showToast('❌ '+(T.remind_offline||'אין חיבור לשרת'),'var(--red-txt)');return;}
  if(btn)btn.disabled=true;
  try{
    const{httpsCallable}=window._fb;
    // הדקות כמו בטיימר שעל המסך (בלי ההפסקה) — השרת סופר שעון קיר ולכן היה מראה יותר
    const gts=ids.split(',').map(id=>S.activeTasks.find(t=>t.id===id)).filter(Boolean);
    const elapsedMin=gts.length?Math.round(Math.max(0,...gts.map(t=>t.elapsed||0))/60):null;
    const r=(await httpsCallable(window._fbFunctions,'remindLateTask')({taskIds:ids.split(','),elapsedMin})).data||{};
    if(r.reason==='cooldown')showToast('⏳ '+(T.remind_wait||'תזכורת כבר נשלחה — אפשר שוב בעוד')+' '+r.waitSec+' '+(T.remind_sec||"שנ'"),'var(--amber-txt)');
    else if(r.reason==='gone')showToast('ℹ️ '+(T.remind_gone||'המשימה כבר נסגרה'),'var(--amber-txt)');
    else if(!r.worker&&!(r.sups||[]).length)showToast('⚠️ '+(T.remind_none||'לא נשלח — אין טלפון רשום לעובד או לאחראי'),'var(--red-txt)',5000);
    else showToast('🔔 '+(T.remind_sent||'נשלחה תזכורת')+(r.worker?' '+(T.remind_to_worker||'לעובד'):'')+(r.sups.length?' · '+(T.remind_to_sups||'לאחראי')+': '+r.sups.map(esc).join(', '):''),'var(--green-txt)',5000);
  }catch(e){console.error('remindLateTask error:',e);showToast('❌ '+(e.message||e),'var(--red-txt)',5000);}
  finally{if(btn)setTimeout(()=>{btn.disabled=false;},3000);}
}
// מחזירה true רק כשהטוקן נשמר ב-pushSettings; אחרת מחרוזת עם הסיבה (לכפתור 🔔 — לא להציג "הופעלו" על כישלון)
async function initFCM(){
  try{
    if(!('Notification' in window)||!('serviceWorker' in navigator))return 'הדפדפן לא תומך בהתראות — באייפון: פתח מאייקון האפליקציה במסך הבית';
    if(!window._fbApp||!window._fbFunctions)return 'אין חיבור לשרת';
    const pushSnap=await fbGet('appSettings','pushSettings');
    if(!pushSnap?.enabled)return 'התראות Push כבויות בהגדרות המנהל';
    const vapidKey=pushSnap.vapidKey||'';
    if(!vapidKey){console.warn('FCM: vapidKey חסר בהגדרות');return 'חסר VAPID key בהגדרות';}
    const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(perm!=='granted')return 'ההרשאה להתראות לא אושרה';
    const swReg=await navigator.serviceWorker.register('/textileops/firebase-messaging-sw.js');
    const{getMessaging,getToken,onMessage}=window._fb;
    const messaging=getMessaging(window._fbApp);
    const token=await getToken(messaging,{vapidKey,serviceWorkerRegistration:swReg});
    if(token){
      // מפתח לפי **עובד + מזהה מכשיר קבוע**, לא לפי הטוקן.
      // FCM מחליף טוקנים מעצמו מדי כמה ימים, ומפתח שנגזר מהטוקן יצר רשומה
      // חדשה בכל החלפה במקום לדרוס — 35 רשומות הצטברו על שם אדם אחד, וכל
      // התראה נשלחה שוב ושוב לאותו אדם. txops_device_uuid לא משתנה.
      const _devUuid=await getDeviceId();
      const deviceKey='dev_'+String(S.user?.id||'anon').replace(/[^a-zA-Z0-9]/g,'')+'_'+
        String(_devUuid||token.slice(-12)).replace(/[^a-zA-Z0-9]/g,'').slice(-10);
      const tokens=(pushSnap.tokens||{});
      const deviceName=S.user?.name||deviceKey;
      const isMobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
      const deviceType=isMobile?'📱 נייד':'🖥 מחשב';
      tokens[deviceKey]={token,name:deviceName,type:deviceType,role:S.user?.role||'',workerId:S.user?.id||'',registeredAt:new Date().toISOString()};
      await fbSetMerge('appSettings','pushSettings',{tokens,lastRegistered:new Date().toISOString()});
      console.log('FCM: טוקן נרשם ✅');
    }
    // הודעות בזמן שהאפליקציה פתוחה — מאזין אחד בלבד (לחיצה חוזרת על 🔔 הוסיפה עוד אחד ⇒ הודעה כפולה)
    if(!window._fcmMsgOn){window._fcmMsgOn=true;
      onMessage(messaging,payload=>{
        const t=payload.notification?.title||'TextileOps';
        const b=payload.notification?.body||'';
        playAlertSound();
        showToast('🔔 '+t+(b?'\n'+b:''),'var(--blue-txt)',5000);
      });
    }
    return token?true:'הטלפון לא החזיר מזהה התראות (token) — סגור ופתח את האפליקציה ונסה שוב';
  }catch(e){console.error('initFCM error:',e);return 'שגיאה: '+(e.code||e.message||e);}
}
async function sendPush(title,body,alertType){
  try{
    if(!window._fbFunctions)return;
    const{httpsCallable}=window._fb;
    const fn=httpsCallable(window._fbFunctions,'sendPush');
    await fn({title,body,alertType});
  }catch(e){console.error('sendPush error:',e);}
}
async function fbSetMerge(col,docId,data){
  if(!db)return;
  const{doc,setDoc}=window._fb;
  await _pw(setDoc(doc(db,col,docId),_splitPricing(col,docId,data),{merge:true}));
}
async function fbGet(col,docId){
  if(!db)return null;
  const{doc,getDoc}=window._fb;
  const snap=await getDoc(doc(db,col,docId));
  return snap.exists()?snap.data():null;
}
// שליחת טלגרם — דרך Cloud Function tgSend; ה-token בצד השרת בלבד (הוסר מהלקוח ומ-Firestore)
async function tgCall(payload){
  if(!S.fbConnected||!window._fbFunctions)return false;
  try{
    const{httpsCallable}=window._fb;
    const fn=httpsCallable(window._fbFunctions,'tgSend');
    const res=await fn(payload);
    return !!(res&&res.data&&res.data.ok);
  }catch(e){console.error('tgCall:',e.message);return false;}
}
function blobToB64(blob){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result).split(',')[1]||'');
    r.onerror=reject;
    r.readAsDataURL(blob);
  });
}
async function sendTelegram(message){
  return tgCall({kind:'message',text:message});
}
// כפתור "הפעל התראות" לעובד/אחראי — מקשר את המכשיר ומפעיל קבלת התראות (לחיצה ישירה = user gesture)
async function enableMyNotifications(){
  const w=S.user;if(!w)return;
  if(typeof Notification==='undefined'){showToast('הדפדפן לא תומך בהתראות','var(--red-txt)');return;}
  if(Notification.permission==='denied'){showToast('❌ התראות חסומות בדפדפן — פתח הגדרות אתר (אייקון ליד הכתובת) ואפשר התראות','var(--red-txt)',7000);return;}
  showToast('מפעיל התראות...','var(--blue-txt)',2000);
  if(w.role==='supervisor'){const r=await initFCM();
    if(r===true)showToast('✅ התראות ניהול הופעלו','var(--green-txt)',3000);
    else showToast('❌ ההתראות לא הופעלו — '+r,'var(--red-txt)',7000);}
  else{await initWorkerFCM(w.id);}
}
function tgPunch(name,dept,isIn,time,workerId){
  const ts=pad2(time.getHours())+':'+pad2(time.getMinutes());
  const title=isIn?'✅ כניסה לעבודה':'🚪 יציאה מהעבודה';
  // הטלגרם נשאר בעברית (המנהל קורא אותו); ההתראה לנייד דו-לשונית —
  // רוב האחראים והעובדים קוראים ערבית, והכותרות היו קשיחות בעברית בלבד.
  const pTitle=isIn?'✅ כניסה לעבודה · تسجيل حضور':'🚪 יציאה מהעבודה · تسجيل انصراف';
  sendTelegram(title+'\n👤 עובד: '+name+'\n🏭 מחלקה: '+dept+'\n🕐 שעה: '+ts).catch(()=>{});
  sendPush(pTitle,name+' · '+dept+' · '+ts, isIn?'punch_in':'punch_out').catch(()=>{});
  // התראה אישית לעובד על הפעילות שלו עצמו (רק אם המנהל הפעיל לו במפורש)
  const wk=workerId?S.workers.find(x=>x.id===workerId):null;
  const pk=isIn?'own_checkin':'own_checkout';
  if(wk&&wk.pushPrefs&&wk.pushPrefs[pk]===true)sendPushToWorker(workerId,pTitle,dept+' · '+ts).catch(()=>{});
}
function tgTask(task,isStart,endTime){
  const custName=(S.customerNames&&S.customerNames[task.cust])||task.cust;
  const colName=COLORS[task.col]||task.col;
  const st=task.startTime instanceof Date?task.startTime:new Date(task.startTime);
  const ts=isStart?(pad2(st.getHours())+':'+pad2(st.getMinutes())):(pad2(endTime.getHours())+':'+pad2(endTime.getMinutes()));
  let msg=(isStart?'🔧 התחלת משימה':'✅ סיום משימה')+'\n👤 עובד: '+task.workerName+'\n🏭 מחלקה: '+task.dept+'\n🏷 לקוח: '+custName+'\n📦 מוצר: '+task.prod+'\n📏 מידה: '+task.size+'\n🎨 צבע: '+colName+'\n📊 כמות: '+task.qty+' יח\'';
  if(task.taskType)msg+='\n📋 סוג: '+task.taskType;
  msg+='\n🕐 שעה: '+ts;
  if(!isStart&&endTime){const dur=Math.round((endTime-st)/60000);msg+='\n⏱ משך: '+dur+' דק\'';}
  sendTelegram(msg).catch(()=>{});
  // דו-לשוני: אותה התראה נשלחת למנהל (עברית) ולאחראים (ערבית) כאחד
  const title=isStart?'🔧 התחלת משימה · بدء مهمة':'✅ סיום משימה · إنهاء مهمة';
  const pushBody=task.workerName+' · '+task.prod+(task.taskType?' · '+task.taskType:'')+' · '+ts;
  sendPush(title,pushBody,isStart?'task_start':'task_end').catch(()=>{});
  // התראה אישית לעובד על המשימה שלו עצמו (רק אם המנהל הפעיל לו במפורש)
  const wk=S.workers.find(x=>x.id===task.workerId);
  const pk=isStart?'own_task_start':'own_task_end';
  if(wk&&wk.pushPrefs&&wk.pushPrefs[pk]===true)sendPushToWorker(task.workerId,title,pushBody).catch(()=>{});
}
async function savePushSettings(){
  if(window._loadingPushSettings)return;
  const enabled=document.getElementById('push-enabled')?.checked||false;
  const vapidKey=(document.getElementById('push-vapid')?.value||'').trim();
  const alertTypes=['punch_in','punch_out','task_start','task_end','task_long','wifi_out'];
  const alertPrefs={};
  alertTypes.forEach(t=>{alertPrefs[t]=document.getElementById('push-'+t)?.checked||false;});
  if(S.fbConnected){
    const updateData={enabled,alertPrefs,updatedAt:new Date().toISOString()};
    if(vapidKey)updateData.vapidKey=vapidKey;
    await fbSetMerge('appSettings','pushSettings',updateData);
  }
  const st=document.getElementById('push-status');
  if(st){st.textContent='✅ נשמר';st.style.color='var(--green-txt)';setTimeout(()=>st.textContent='',2000);}
}
async function loadPushSettings(){
  if(!S.fbConnected){setTimeout(loadPushSettings,1500);return;}
  const data=await fbGet('appSettings','pushSettings');
  if(!data)return;
  window._loadingPushSettings=true;
  try{
    const set=(id,val)=>{const el=document.getElementById(id);if(el)el.checked=!!val;};
    const setVal=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||'';};
    set('push-enabled',data.enabled);
    setVal('push-vapid',data.vapidKey||'');
    const prefs=data.alertPrefs||{};
    ['punch_in','punch_out','task_start','task_end','task_long','wifi_out'].forEach(t=>set('push-'+t,prefs[t]!==false));
    // הצג מספר מכשירים רשומים
    const tokens=data.tokens||{};
    const devCount=Object.keys(tokens).length;
    const devEl=document.getElementById('push-devices');
    if(devEl)devEl.textContent=devCount>0?'📱 '+devCount+' מכשיר'+(devCount>1?'ים':'')+' רשום'+(devCount>1?'ים':''):'';
    // רשימת מכשירים עם כפתור מחיקה
    const listEl=document.getElementById('push-devices-list');
    if(listEl){
      if(devCount===0){listEl.innerHTML='';}
      else{
        listEl.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--txt2)">מכשירים רשומים:</div>'+
          Object.entries(tokens).map(([key,tok])=>{
            const name=tok?.name||key;
            const type=tok?.type||'';
            const date=tok?.registeredAt?new Date(tok.registeredAt).toLocaleDateString('he-IL'):'';
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;margin-bottom:4px;background:var(--card-bg);border-radius:8px;border:0.5px solid var(--b)">
              <span style="font-size:12px;color:var(--txt2)">${type||'📱'} ${name}${date?' ('+date+')':''}</span>
              <button class="btn" style="font-size:11px;padding:3px 8px;background:var(--red-bg,#ffebee);color:var(--red-txt,#c62828)" onclick="removeDevice('${key}','${name}')">🗑 הסר</button>
            </div>`;
          }).join('');
      }
    }
  }finally{
    window._loadingPushSettings=false;
  }
}
async function removeDevice(deviceKey,deviceName){
  if(!confirm('להסיר מכשיר '+(deviceName||deviceKey)+'?'))return;
  const data=await fbGet('appSettings','pushSettings');
  if(!data)return;
  const tokens=data.tokens||{};
  delete tokens[deviceKey];
  await fbSetMerge('appSettings','pushSettings',{tokens});
  showToast('✅ מכשיר הוסר','var(--green-txt)');
  loadPushSettings();
}
async function testPush(){
  const st=document.getElementById('push-status');
  if(st){st.textContent='שולח...';st.style.color='var(--amber-txt)';}
  try{
    await sendPush('🧪 בדיקת TextileOps','Push Notifications עובד! ✅','test');
    if(st){st.textContent='✅ נשלח!';st.style.color='var(--green-txt)';setTimeout(()=>st.textContent='',3000);}
  }catch(e){
    if(st){st.textContent='❌ שגיאה: '+e.message;st.style.color='var(--red-txt)';}
  }
}
async function testWhatsApp(){
  saveSettings();
  const st=document.getElementById('wa-status');
  st.textContent='שולח...';st.style.color='var(--amber-txt)';
  const ok=await sendTelegram('✅ TextileOps — הודעת בדיקה. החיבור עובד!');
  st.textContent=ok?'✅ נשלח בהצלחה':'❌ שגיאה — בדוק Token ו-Chat ID';
  st.style.color=ok?'var(--green-txt)':'var(--red-txt)';
  setTimeout(()=>st.textContent='',5000);
}
function waInWorkingHours(){
  const now=new Date();
  const cur=pad2(now.getHours())+':'+pad2(now.getMinutes());
  const from=S.settings.waFrom||'07:00';
  const to=S.settings.waTo||'18:00';
  return cur>=from&&cur<=to;
}

// ─── DASHBOARD ──────────────────────────────────────────────
function renderDash(){
  const T=LANGS[currentLang];
  const inW=S.workers.filter(w=>w.status==='in');
  document.getElementById('d-active').textContent=inW.length;
  const today=todayStr();
  document.getElementById('d-total-sub').textContent=T.dash_of+' '+S.workers.filter(w=>w.role!=='manager').length+' '+T.dash_workers_lbl;
  document.getElementById('d-tasks').textContent=S.activeTasks.length;
  // משימות שהושלמו היום
  const doneToday=S.histTasks.filter(t=>{try{return new Date(t.endTime||t.startTime).toISOString().slice(0,10)===today;}catch(e){return false;}});
  document.getElementById('d-done').textContent=doneToday.length;
  // 1 — יעד יומי אוטומטי (ממוצע 7 ימים אחרונים)
  const days7={};
  S.histTasks.forEach(t=>{try{const d=new Date(t.endTime||t.startTime).toISOString().slice(0,10);if(d<today)days7[d]=(days7[d]||0)+1;}catch(e){}});
  const vals=Object.values(days7);
  const autoGoal=vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length):0;
  const goalPct=autoGoal?Math.min(100,Math.round(doneToday.length/autoGoal*100)):0;
  document.getElementById('d-goal').textContent=doneToday.length+(autoGoal?' / '+autoGoal:'');
  document.getElementById('d-goal-bar').style.width=goalPct+'%';
  // מחלקות
  const dc={};S.depts.forEach(d=>{dc[d]={in:0,total:0}});
  S.workers.forEach(w=>{if(dc[w.dept]){dc[w.dept].total++;if(w.status==='in')dc[w.dept].in++;}});
  document.getElementById('d-depts').innerHTML=S.depts.map(d=>`
    <div class="row">
      <span style="width:7px;height:7px;border-radius:50%;background:${dc[d].in>0?'#1D9E75':'#E24B4A'};display:inline-block;flex-shrink:0"></span>
      <span style="flex:1;font-size:13px">${esc(d)}</span>
      <span style="font-size:12px;color:var(--txt2)">${dc[d].in}/${dc[d].total}</span>
      <div class="pbar" style="width:60px;margin:0"><div class="pfill" style="width:${dc[d].total?Math.round(dc[d].in/dc[d].total*100):0}%"></div></div>
    </div>`).join('');
  checkAlerts();
  const dp=document.getElementById('d-alerts-prev');
  if(!S.alerts.length)dp.innerHTML='<div style="color:var(--green-txt);font-size:13px;padding:.5rem 0">✅ אין התראות</div>';
  else dp.innerHTML=S.alerts.slice(0,3).map(a=>`<div class="al-item ${a.sev}" style="margin-bottom:4px"><div>${a.type==='long'?'⏰':'👤'}</div><div style="font-size:12px">${esc(a.msg)}</div></div>`).join('');
  // 2 — ממוצע זמן משימה היום vs אתמול
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const doneTodayDur=doneToday.filter(t=>t.duration>0);
  const avgToday=doneTodayDur.length?Math.round(doneTodayDur.reduce((s,t)=>s+(t.duration||0),0)/doneTodayDur.length/60):0;
  const doneYest=S.histTasks.filter(t=>{try{return new Date(t.endTime||t.startTime).toISOString().slice(0,10)===yesterday&&t.duration>0;}catch(e){return false;}});
  const avgYest=doneYest.length?Math.round(doneYest.reduce((s,t)=>s+(t.duration||0),0)/doneYest.length/60):0;
  const avgDiff=avgYest&&avgToday?avgToday-avgYest:0;
  document.getElementById('d-avg-time').textContent=avgToday?avgToday+' '+T.dash_min:'—';
  document.getElementById('d-avg-sub').textContent=avgYest?(avgDiff===0?T.dash_same_yesterday:avgDiff>0?'▲ '+avgDiff+' '+T.dash_min+' '+T.dash_than_yesterday:'▼ '+Math.abs(avgDiff)+' '+T.dash_min+' '+T.dash_than_yesterday):'';
  // 3 — מוצרים בייצור
  const prodsInProg=(S.products||[]).filter(p=>{const log=p.stageLog||[];if(!log.length)return false;return log[log.length-1].id!==PROD_STAGES[PROD_STAGES.length-1].id;});
  document.getElementById('d-prods-active').textContent=prodsInProg.length;
  document.getElementById('d-prods-sub').textContent=T.dash_of+' '+(S.products||[]).length+' '+T.dash_products_lbl;
  const stagesEl=document.getElementById('d-prods-stages');
  const stagesCard=document.getElementById('d-prods-stages-card');
  if(stagesEl){
    if(!prodsInProg.length){if(stagesCard)stagesCard.style.display='none';}
    else{
      if(stagesCard)stagesCard.style.display='';
      stagesEl.innerHTML=prodsInProg.slice(0,6).map(p=>{
        const log=p.stageLog||[];
        const lastStage=log.length?PROD_STAGES.find(s=>s.id===log[log.length-1].id):null;
        const totalS=PROD_STAGES.filter(s=>!p.stageSkipped?.includes(s.id)).length;
        const pct=totalS?Math.round(log.length/totalS*100):0;
        return`<div class="row" style="margin-bottom:8px"><div style="flex:1">
          <div style="font-size:13px;font-weight:500">${esc(p.name||p.prod)}</div>
          <div style="font-size:11px;color:var(--txt3)">${lastStage?esc(lastStage.label):T.status_not_started}</div>
          <div style="background:var(--bg2);border-radius:3px;height:5px;margin-top:4px;overflow:hidden"><div style="background:var(--blue);width:${pct}%;height:100%"></div></div>
        </div><span style="font-size:11px;color:var(--txt3);margin-right:8px">${pct}%</span></div>`;
      }).join('');
    }
  }
  // 4 — עובד הכי פרודוקטיבי היום
  const workerCount={};
  doneToday.forEach(t=>{workerCount[t.workerName]=(workerCount[t.workerName]||0)+1;});
  const topEntry=Object.entries(workerCount).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('d-top-worker').textContent=topEntry?topEntry[0]:'—';
  document.getElementById('d-top-sub').textContent=topEntry?topEntry[1]+' '+T.dash_tasks_today:'';
  // 5 — התראה ויזואלית: עובדים שלא נכנסו אחרי 09:00
  const alertEl=document.getElementById('d-absent-alert');
  if(alertEl){
    const hour=new Date().getHours();
    if(hour>=9){
      const notIn=S.workers.filter(w=>w.role!=='manager'&&w.status!=='in');
      if(notIn.length){alertEl.style.display='';alertEl.innerHTML='⚠️ '+notIn.length+' '+T.dash_not_in_warn+': '+notIn.map(w=>esc(w.name)).join(', ');}
      else{alertEl.style.display='none';}
    }else{alertEl.style.display='none';}
  }
  // פעילות אחרונה
  const recent=[...doneToday.slice(0,3),...S.activeTasks.slice(0,2)].slice(0,4);
  document.getElementById('d-recent').innerHTML=recent.length?recent.map(t=>`
    <div class="row">
      <div style="flex:1"><span style="font-size:13px;font-weight:500">${esc(t.workerName)}</span>
      <span class="badge ${t.endTime?'green':'blue'}" style="margin-right:6px">${t.endTime?T.completed:T.active}</span>
      <div style="font-size:11px;color:var(--txt3)">לקוח ${t.cust} · מוצר ${t.prod}${taskOrderLbl(t)?' '+taskOrderLbl(t):''}${t.size?' · מידה '+t.size:''} · ${t.qty===0?'<span style="color:#d97706;font-weight:700">⏳ כמות פתוחה</span>':t.qty+' יח\''}${t.isTotal?' · <span style="color:#059669;font-weight:700">📦 כל הכמות</span>':' · '+(COLORS[t.col]||t.col)}</div></div>
      <span style="font-size:12px;color:var(--txt2)">${t.endTime?fmtM(t.duration||0):fmtS(t.elapsed||0)}</span>
    </div>`).join(''):`<div style="color:var(--txt3);font-size:13px;padding:.5rem 0">${T.dash_no_activity}</div>`;
}

