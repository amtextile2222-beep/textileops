// ─── LOGIN ──────────────────────────────────────────────────
let loginAttempts=0;let loginLocked=false;let loginLockTimer=null;
// ⏱ הנעילה המקומית = הנעילה בשרת (login: 5 ניסיונות ⇒ דקה). עד 12/11/2026 המסך אמר 30 שניות והשתחרר אחרי 30,
// בזמן שהשרת המשיך לדחות עוד חצי דקה
const LOGIN_LOCK_MS=60000;
// כניסת חירום — למנהלים בלבד, מוגן ב-hash
const _EMRG_H='$h:f434da0ecb3e3968e92503d17e29177511eb65394ff0d232f51a5f33a6ce9613';
// ─── שלב 2 אבטחה: כל האימות עובר דרך Cloud Function login ───
async function loginCall(payload){
  const{httpsCallable}=window._fb;
  const fn=httpsCallable(window._fbFunctions,'login');
  const res=await fn(payload);
  const r=(res&&res.data)||{};
  // 🔐 מנהל ממכשיר שהשרת לא מכיר ⇒ קוד בטלגרם; שולחים שוב את אותה בקשה עם otp (כל מסלולי הכניסה)
  return r.needOtp?_otpFlow(fn,payload):r;
}
// ─── 🔐 קוד חד-פעמי בטלגרם למכשיר מנהל חדש (13/11/2026) ───
// השרת (mgrDeviceGate) מחזיר needOtp ושולח קוד; אחרי קוד נכון המכשיר נרשם ולא יישאל שוב.
// ביטול ⇒ שגיאה 'otp-cancel' (לולאת הפנים נעצרת ולא פותחת את החלון שוב ושוב).
function _otpAsk(msg){
  return new Promise(res=>{
    document.getElementById('otp-ov')?.remove();
    const o=document.createElement('div');o.id='otp-ov';
    o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    o.innerHTML=`<div style="background:var(--bg2,#fff);color:var(--txt,#111);border-radius:14px;padding:20px;max-width:340px;width:100%;text-align:center;direction:rtl;box-shadow:0 8px 30px rgba(0,0,0,.3)">
      <div style="font-size:32px">🔐</div><div style="font-weight:700;font-size:16px;margin:6px 0">כניסת מנהל ממכשיר חדש</div>
      <div id="otp-msg" style="font-size:13px;margin-bottom:12px;line-height:1.5">${msg}</div>
      <input id="otp-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="------" style="font-size:26px;letter-spacing:8px;text-align:center;width:100%;padding:8px;box-sizing:border-box;direction:ltr"/>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-primary" id="otp-ok" style="flex:1">אישור</button><button class="btn" id="otp-no" style="flex:1">ביטול</button></div></div>`;
    document.body.appendChild(o);
    const inp=o.querySelector('#otp-in'),done=v=>{o.remove();res(v);};
    o.querySelector('#otp-ok').onclick=()=>done(inp.value.replace(/\D/g,''));
    o.querySelector('#otp-no').onclick=()=>done(null);
    inp.onkeydown=e=>{if(e.key==='Enter')done(inp.value.replace(/\D/g,''));};
    setTimeout(()=>inp.focus(),50);
  });
}
async function _otpFlow(fn,payload){
  let msg='נשלח קוד בן 6 ספרות לטלגרם שלך.<br>הזן אותו כדי לאשר את המכשיר הזה (פעם אחת).';
  for(let i=0;i<8;i++){
    const code=await _otpAsk(msg);
    if(!code)throw new Error('otp-cancel');
    try{
      const r=((await fn({...payload,otp:code}))||{}).data||{};
      if(!r.needOtp)return r;
      msg='נשלח קוד חדש לטלגרם';
    }catch(e){
      const c=_loginErrCode(e);
      if(c==='otp-wrong'){msg='⛔ קוד שגוי — נסה שוב';continue;}
      if(c==='otp-expired'){ // פג / יותר מדי ניסיונות ⇒ קוד חדש (השרת מאמת שוב את הסיסמה/הפנים)
        const r=((await fn(payload))||{}).data||{};
        if(!r.needOtp)return r;
        msg='⏱ הקוד פג — נשלח קוד חדש לטלגרם';continue;
      }
      throw e;
    }
  }
  throw new Error('otp-cancel');
}
async function fbSignInWithToken(token){
  const{getAuth,signInWithCustomToken}=window._fb;
  await signInWithCustomToken(getAuth(window._fbApp),token);
}
function _loginErrCode(e){
  const m=String((e&&e.message)||'').trim();
  return['wrong','missing-pass','disabled','locked','ip','time-window','device','device-unknown','face-mismatch','no-face-update','emergency-wrong','no-session','session-expired','barcode-wrong','barcode-not-allowed','barcode-needs-setup','otp-wrong','otp-expired','otp-send','otp-cancel'].includes(m)?m:'network';
}
function _loginErrMsg(code){
  return{
    'wrong':'שם משתמש או סיסמה שגויים',
    'missing-pass':'נא למלא שם משתמש וסיסמה',
    'disabled':'⛔ הגישה הושעתה זמנית — פנה למנהל',
    'locked':'יותר מדי ניסיונות — נסה שוב בעוד דקה',
    'ip':'⛔ כניסה נחסמה — חייב להיות מחובר ל-WiFi המפעל',
    'time-window':'⛔ כניסה מחוץ לימים/שעות המותרים — פנה למנהל',
    'device':'⛔ מכשיר לא מורשה — פנה למנהל',
    'device-unknown':'⛔ לא ניתן לזהות את המכשיר — גישה נדחית',
    'face-mismatch':'זיהוי פנים נכשל',
    'no-face-update':'אין אישור לעדכון פנים — פנה למנהל',
    'emergency-wrong':'קוד חירום שגוי',
    'no-session':'נא להיכנס למערכת',
    'session-expired':'⏰ החיבור פג — נא להיכנס מחדש',
    'barcode-wrong':'⛔ הברקוד שסרקת שייך לעובד אחר — סרוק את הברקוד שבתחנה שלך',
    'barcode-not-allowed':'⛔ כניסה בברקוד לא מופעלת עבורך — פנה למנהל',
    'barcode-needs-setup':'הכניסה הראשונה במכשיר הזה חייבת להיות עם סיסמה — הזן סיסמה פעם אחת, ומהפעם הבאה תיכנס בסריקה',
    'otp-wrong':'⛔ קוד הטלגרם שגוי',
    'otp-expired':'⏱ קוד הטלגרם פג — נסה להיכנס שוב',
    'otp-send':'⛔ לא ניתן לשלוח קוד לטלגרם — נסה שוב, או היכנס מהמכשיר הרגיל שלך',
    'otp-cancel':'הכניסה בוטלה — נדרש קוד מהטלגרם'
  }[code]||'שגיאת חיבור לשרת — נסה שוב';
}
// ─── מה *באמת* נכשל בכניסה ─────────────────────────────────────────────────
// כל שגיאה שאינה אחת ממילות הקוד של השערים התגלגלה ל'network' והוצגה כ"שגיאת
// חיבור לשרת". כך תקלת שרת, טוקן פסול או קריסה אחרי האימות נראו כולן כאינטרנט
// תקול — והמנהל נשאר מול מסך כניסה בלי שום רמז מה לתקן. כאן אומרים את האמת.
function _loginErrTech(e){
  const raw=String((e&&e.message)||'').trim();
  const msg=raw.startsWith('srv:')?raw.slice(4):raw;  // 'srv:' = תקלה שהשרת עצמו דיווח
  const code=(e&&e.code)?String(e.code):'';
  if(code&&msg&&msg!==code)return code+' — '+msg;
  return code||msg||(e&&e.name)||'שגיאה לא ידועה';
}
// stage: איפה נפלנו — call (הקריאה לשרת), token (כניסה עם הטוקן), finish (בניית המסך)
function _loginFailMsg(e,stage){
  const c=_loginErrCode(e);
  if(c!=='network')return _loginErrMsg(c);
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return '⛔ אין חיבור לאינטרנט — התחבר לרשת ונסה שוב';
  const srv=String((e&&e.message)||'').trim().startsWith('srv:');
  const head=srv?'⛔ תקלה בשרת הכניסה':({
    call:'⛔ השרת לא השלים את הכניסה',
    token:'⛔ הזיהוי אושר אך פתיחת החיבור נכשלה',
    finish:'⛔ הכניסה אושרה אך טעינת המסך נכשלה'
  }[stage]||'⛔ שגיאת כניסה');
  return head+' — '+_loginErrTech(e);
}
function _loginShowErr(e,stage){
  console.error('login ['+stage+']:',e);
  const el=document.getElementById('l-err');
  if(el)el.textContent=_loginFailMsg(e,stage);
}
// מונה הסיסמאות השגויות — משותף לכניסה רגילה ולכל מסלול אחר
function _loginWrongPass(){
  loginAttempts++;
  if(loginAttempts>=5){
    loginLocked=true;
    document.getElementById('l-err').textContent='יותר מדי ניסיונות — חשבון נעול לדקה';
    document.getElementById('l-user').disabled=true;
    document.getElementById('l-pass').disabled=true;
    loginLockTimer=setTimeout(()=>{loginLocked=false;loginAttempts=0;document.getElementById('l-user').disabled=false;document.getElementById('l-pass').disabled=false;document.getElementById('l-err').textContent='';},LOGIN_LOCK_MS);
  } else {
    document.getElementById('l-err').textContent='שם משתמש או סיסמה שגויים ('+loginAttempts+'/5)';
  }
}
// ─── שחזור session אחרי טעינה מחדש ──────────────────────────────────────
// S.user חי בזיכרון בלבד (saveLS לא שומר אותו), ולכן כל הריגה של הטאב ע"י
// הדפדפן/iOS החזירה את העובדת למסך כניסה — נמדד: עד 5 פתיחות ביום לאותו עובד.
// ה-session של Firebase דווקא שורד (IndexedDB); onAuthStateChanged היה מיובא
// מאז ומעולם ולא נקרא אף פעם. כאן שואלים אותו, והשרת מאמת בשערים שהעובדת
// עדיין רשאית להיכנס עכשיו לפני שהיא נכנסת.
let _restoreBusy=false,_restoreDone=false;
function _restoreOverlay(on){
  let el=document.getElementById('_restore-ov');
  if(!on){if(el)el.remove();return;}
  if(el)return;
  el=document.createElement('div');
  el.id='_restore-ov';
  el.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:var(--bg);color:var(--txt);font-size:15px';
  el.innerHTML='<div style="font-size:38px">✂️</div><div>משחזר חיבור…</div>';
  document.body.appendChild(el);
}
async function _restoreSession(){
  if(_restoreBusy||_restoreDone||S.user)return;
  if(!window._fb||!window._fbApp||!window._fbFunctions)return;
  _restoreBusy=true;
  let code='no-session';
  try{
    const{getAuth,onAuthStateChanged,signOut,httpsCallable}=window._fb;
    const auth=getAuth(window._fbApp);
    // הקריאה מ-IndexedDB אינה מיידית — ממתינים פעם אחת למצב ההתחלתי
    const user=await new Promise(res=>{
      let settled=false;
      const fin=u=>{if(settled)return;settled=true;try{un&&un();}catch(e){}res(u);};
      const un=onAuthStateChanged(auth,fin,()=>fin(null));
      setTimeout(()=>fin(null),4000);
    });
    if(!user){_restoreBusy=false;_restoreDone=true;_startAutoLogin();return;}
    _restoreOverlay(true);
    const devId=await getDeviceId();
    const fn=httpsCallable(window._fbFunctions,'resumeSession');
    // 6 שניות ואז נופלים למסך כניסה רגיל — אסור להשאיר עובדת מול ספינר
    const res=await Promise.race([
      fn({deviceId:devId||undefined}).then(r=>(r&&r.data)||{}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('network')),6000))
    ]);
    if(!res||!res.worker)throw new Error('network');
    if(res.token)await fbSignInWithToken(res.token);
    _restoreOverlay(false);_restoreBusy=false;_restoreDone=true;
    // ⚠ autoPunch=false קריטי: שחזור אינו חתימת כניסה. autoPunchIn הוא שמפעיל
    // את resumeWorkerTasksOnPunchIn, ולכן שחזור שיחתים כניסה היה מייצר רישום
    // נוכחות שקרי *ומחדש משימות מושהות* בכל הריגה של האפליקציה.
    finishLogin(res.worker,false);
    return;
  }catch(e){
    code=_loginErrCode(e);
  }
  _restoreOverlay(false);_restoreBusy=false;_restoreDone=true;
  // כשל שער = ה-session כבר לא תקף. מוחקים אותו, אחרת ננסה שוב בכל טעינה
  // ונציף את הטלגרם בהתראות על אותה עובדת.
  if(code!=='network'){
    try{const{getAuth,signOut}=window._fb;await signOut(getAuth(window._fbApp));}catch(e){}
  }
  const msg=_loginErrMsg(code);
  const el=document.getElementById('l-err');
  if(el&&code!=='no-session'&&code!=='network'&&msg)el.textContent=msg;
  // אחרי חסימת שער לא מפעילים כניסה אוטומטית — היא תיפול על אותו שער ותדרוס
  // את ההודעה שמסבירה לעובדת למה היא בחוץ.
  if(code==='no-session'||code==='network')_startAutoLogin();
}
// ─── טאב שאיבד את ה-session מגלה זאת מיד ─────────────────────────────
// Firebase שומר session אחד לכל אתר, משותף לכל הטאבים באותו מכשיר. לחיצה על
// ↩ יציאה בטאב אחד — או חתימת יציאה — מוחקת אותו לכולם. בלי המאזין הזה הטאב
// השני נשאר עם ממשק מלא ובלי טוקן: נראה תקין לגמרי, וכל כתיבה שלו נדחית
// ב-Missing or insufficient permissions. זה בדיוק מה שקרה ל-محمد 22/08 —
// הוא לחץ خروج בטאב ישן, וה-PWA שלו הפסיק לשמור בלי שום סימן על המסך.
let _authWatchOn=false;
function _watchAuthLoss(){
  if(_authWatchOn||!window._fb||!window._fbApp)return;
  _authWatchOn=true;
  const{getAuth,onAuthStateChanged}=window._fb;
  const auth=getAuth(window._fbApp);
  onAuthStateChanged(auth,u=>{
    if(u||!S.user||_restoreBusy)return;
    // המתנה קצרה: החלפת טוקן בשחזור עוברת רגע דרך null, וזו אינה יציאה
    setTimeout(()=>{
      if(auth.currentUser||!S.user||_restoreBusy)return;
      _restoreDone=true;              // יציאה מכוונת — לא לנסות לשחזר אחריה
      doLogout(true);
      const el=document.getElementById('l-err');
      if(el)el.textContent='⚠ החיבור נסגר בחלון אחר — נא להיכנס מחדש';
    },1500);
  });
}
// סיום כניסה מוצלחת — משותף לסיסמה/פנים/חירום
function finishLogin(w,autoPunch){
  S.user=w;
  // "זכור אותי": שם המשתמש נשמר במכשיר — בבוקר הבא ממולא מראש ולעובד-פנים הכניסה מתחילה לבד
  try{if(w.user)localStorage.setItem('txops_last_user',w.user);}catch(e){}
  if(w.role!=='manager'){
    // עותקי עלויות ישנים לא נשארים במכשירי עובדים
    S.costs={workerRates:{},workerUnitRates:{},oversightPct:{},oversightDepts:{},fixedDaily:0,fixedMonthly:0,workDaysMonth:22,fixedAnnual:0,workDaysYear:250,variableExpenses:[],workerTransport:{},workerInsurance:{},severancePct:8.33,holidayDays:4,giftsAnnual:0,tripAnnual:0,overheadBufferPct:10,costMonths:[],difficultyWeights:{1:1,2:1.5,3:2,4:2.5,5:3.5}};
    saveLS();
  }
  startDataListeners();
  // מדידת ריבוי טאבים — 9 שנ' כדי שהדופק הראשון של הטאב הזה (4 שנ') כבר ייכתב.
  // כאן ולא ב-tabBeat: זו הנקודה שבה בוודאות יש S.user, והיא משותפת לכניסה ולשחזור.
  setTimeout(()=>{_checkMultiTab();},9000);
  listenWorkerMessages();
  listenMgrInbox();
  listenVoice();
  setTimeout(_saveMyLang,5000); // אחרי שכרטיסי העובדים נטענו
  if(w.role==='worker'||w.role==='helper')document.getElementById('worker-send-msg-bar').style.display='block';
  if(w.role!=='manager'&&w.role!=='supervisor'){
    if(typeof Notification!=='undefined'&&Notification.permission==='granted'){initWorkerFCM(w.id);}
    else if(typeof Notification!=='undefined'&&Notification.permission==='default'){setTimeout(()=>initWorkerFCM(w.id),2000);}
  }else{
    // מנהל + אחראי מקבלים את התראות הניהול (ערוץ השידור המשותף)
    initFCM();
  }
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('top-name').textContent=w.name;
  document.getElementById('top-role').textContent=w.role==='manager'?'מנהל':w.role==='supervisor'?'אחראי':w.role==='helper'?'עוזר':'עובד';
  document.getElementById('top-av').textContent=w.name.split(' ').map(n=>n[0]||'').join('');
  applyPerms(w);
  setTimeout(loadWaSettings,100);
  document.getElementById('l-err').textContent='';
  const firstPage=(w.permissions&&w.permissions.length)?w.permissions[0]:'dash';
  goPage(w.role==='manager'?'dash':firstPage);
  if(autoPunch)setTimeout(autoPunchIn,300);
  // כתובת שפותחת ישר את לוח התצוגה (למסך הקיר / התאוששות מהפסקת חשמל): ?kiosk=1
  if((w.role==='manager'||w.role==='supervisor')&&/[?&#]kiosk=1\b/.test(location.href))setTimeout(openKiosk,500);
}
async function emergencyLogin(){
  const code=document.getElementById('l-emergency').value.trim();
  if(!code)return;
  document.getElementById('l-err').textContent='בודק...';
  try{
    const _dv=await getDeviceId();
    const res=await loginCall(_dv?{emergencyCode:code,deviceId:_dv}:{emergencyCode:code});
    await fbSignInWithToken(res.token);
    document.getElementById('l-emergency').value='';
    finishLogin(res.worker,false);
    goPage('admin');
  }catch(e){
    const c=_loginErrCode(e);
    if(c==='network'&&hashPass(code)===_EMRG_H){
      // אין קשר לשרת — כניסת חירום מקומית (נתונים מקומיים בלבד, בלי Firestore)
      const _lw=_loginWorkers(),mgr=_lw.find(w=>w.role==='manager')||_lw[0];
      if(!mgr){document.getElementById('l-err').textContent='אין חיבור לשרת ואין נתונים מקומיים';return;}
      document.getElementById('l-emergency').value='';
      finishLogin({...mgr,role:'manager'},false);
      goPage('admin');
      return;
    }
    _loginShowErr(e,'call');
  }
}
// כשיר לכניסה בסריקת ברקוד: אין לו זיהוי פנים, יש נעילת מכשיר, והמכשיר כבר נרשם.
// רמז מקומי מה-cache בלבד — השרת אוכף את אותם תנאים בעצמו (ראה exports.login).
function _bcLoginEligible(u){
  const w=_loginWorkers().find(x=>x.user===u.trim());
  if(!w||w.role==='manager')return null;
  // זיהוי פנים דלוק (גם בלי פנים רשומות) ⇒ לא ברקוד: סיסמה ואז רישום פנים (needFaceRegister בשרת)
  if(w.faceAuth)return null;
  if(!w.deviceBinding||!(w.deviceRegistered||w.deviceId))return null;
  return w;
}
function onUserInput(u){
  // רמז מקומי בלבד (מה-cache): לעובד עם פנים רשומות מוסתר שדה הסיסמה. ההכרעה האמיתית בשרת.
  const w=_loginWorkers().find(x=>x.user===u.trim()&&x.faceAuth&&(x.faceRegistered||x.faceDescriptor||x.faceDescriptors&&Object.keys(x.faceDescriptors).length));
  const bcw=w?null:_bcLoginEligible(u);
  document.getElementById('l-pass-wrap').style.display=(w||bcw)?'none':'';
  document.getElementById('l-face-hint').style.display=w?'block':'none';
  document.getElementById('l-bc-hint').style.display=bcw?'block':'none';
  if(!bcw)stopBcLogin();
  if(w)loadFaceModels(); // טעינה מוקדמת ברקע — שהמודלים יהיו מוכנים כשהעובד ילחץ כניסה
}
// טעינה מוקדמת בעליית הדף אם יש בכלל עובדים עם זיהוי פנים (מה-cache המקומי) — במקום להטעין כשהעובד כבר עומד מול המצלמה
// + "זכור אותי": השם האחרון ממולא מראש; לעובד עם פנים רשומות הכניסה מתחילה לבד (אפס הקלדה)
window.addEventListener('load',()=>{setTimeout(()=>{
  if(_loginWorkers().some(x=>x.faceAuth))loadFaceModels();
  _startAutoLogin();
},1500);});
// מושהית כל עוד שחזור ה-session רץ: אחרת המצלמה נדלקת לרגע מתחת לאוברליי
// ושתי כניסות מתחרות על אותו מסך. _restoreSession קורא לה בעצמו כשאין מה לשחזר.
function _startAutoLogin(){
  if(S.user||_restoreBusy)return;
  const lu=localStorage.getItem('txops_last_user')||'';
  const inp=document.getElementById('l-user');
  if(lu&&inp&&!inp.value.trim()){
    inp.value=lu;
    onUserInput(lu);
    document.getElementById('l-switch-user').style.display='';
    _autoFaceLogin(lu);
    _autoBcLogin(lu);
  }
}
function switchUser(){
  try{localStorage.removeItem('txops_last_user');}catch(e){}
  stopBcLogin();
  document.getElementById('l-user').value='';
  document.getElementById('l-pass').value='';
  onUserInput('');
  document.getElementById('l-switch-user').style.display='none';
  document.getElementById('l-err').textContent='';
}
// כניסה אוטומטית רק כשהשם השמור שייך לעובד עם פנים רשומות (לפי ה-cache) — מחכה לחיבור לשרת ואז doLogin.
// בטוח מהבית: השרת ממילא אוכף Wi-Fi מפעל/חלון גישה לעובדים; כשל בבדיקות = נשאר מסך כניסה רגיל.
function _autoFaceLogin(u){
  const w=_loginWorkers().find(x=>x.user===u&&x.faceAuth&&(x.faceRegistered||x.faceDescriptor||x.faceDescriptors&&Object.keys(x.faceDescriptors).length));
  if(!w)return;
  let tries=0;
  const t=setInterval(()=>{
    const ls=document.getElementById('login-screen');
    if(S.user||!ls||ls.classList.contains('hidden')){clearInterval(t);return;}
    if(S.fbConnected&&window._fbFunctions){clearInterval(t);doLogin();}
    else if(++tries>20)clearInterval(t); // ~10 שנ' בלי חיבור — ממשיכים ידנית כרגיל
  },500);
}
// ─── כניסה בסריקת ברקוד העובד (מסלול חלופי לעובד בלי זיהוי פנים) ───
// מצלמה אחורית → EMP:{id} → loginCall({user,empBarcode,deviceId}) → כניסה + החתמת כניסה.
// הברקוד אינו סוד (מודבק בתחנה); ההגנה היא נעילת המכשיר + Wi-Fi מפעל, שנאכפות בשרת.
let _bcLoginStream=null,_bcLoginInt=null;
async function startBcLogin(){
  const u=document.getElementById('l-user').value.trim();
  if(!u){document.getElementById('l-err').textContent='נא למלא שם משתמש';return;}
  if(_bcLoginStream)return; // כבר פתוח
  // אותן חסימות כמו doLogin — לא לפתוח מצלמה על גרסה ישנה או חשבון נעול
  if(loginLocked){document.getElementById('l-err').textContent='חשבון נעול לדקה עקב ניסיונות כושלים';return;}
  if(await checkVersion()){document.getElementById('l-err').textContent='🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב';return;}
  const video=document.getElementById('l-bc-video');
  const status=document.getElementById('l-bc-status');
  const err=document.getElementById('l-err');
  err.textContent='';
  try{
    _bcLoginStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=_bcLoginStream;
    document.getElementById('l-bc-hint').style.display='none';
    document.getElementById('l-bc-cam').style.display='block';
    status.textContent='מחפש ברקוד...';
    await video.play();
  }catch(e){
    _bcLoginStream=null;
    err.textContent='⛔ לא ניתן לפתוח את המצלמה — אשר גישה למצלמה בהגדרות';
    return;
  }
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  let busy=false;
  _bcLoginInt=setInterval(async()=>{
    if(busy||!_bcLoginStream||video.readyState<2)return;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    ctx.drawImage(video,0,0);
    let text='';
    try{
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      text=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'})?.data||'';
    }catch(e){return;}
    if(!text)return;
    if(!text.startsWith('EMP:')){status.textContent='⚠ זה לא ברקוד עובד — סרוק את המדבקה שבתחנה שלך';return;}
    busy=true;
    status.textContent='✅ נסרק — מאמת...';
    await _bcLoginWith(u,text);
  },200);
}
// 📶 אותה כניסה ממדבקת NFC של העובד (EMP:) — אותן חסימות ואותה קריאה לשרת
async function nfcBcLogin(){
  const u=document.getElementById('l-user').value.trim();
  const err=document.getElementById('l-err');
  if(!u){err.textContent='נא למלא שם משתמש';return;}
  if(loginLocked){err.textContent='חשבון נעול לדקה עקב ניסיונות כושלים';return;}
  if(await checkVersion()){err.textContent='🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב';return;}
  err.textContent='';
  nfcRead(async txt=>{
    txt=(txt||'').trim();
    if(!txt.startsWith('EMP:')){err.textContent='⚠ זו לא מדבקת עובד — קרב את המדבקה שבתחנה שלך';return;}
    showToast('✅ נקרא — מאמת...','var(--green-txt)');
    await _bcLoginWith(u,txt);
  });
}
async function _bcLoginWith(u,text){
    try{
      const devId=await getDeviceId();
      const res=await loginCall({user:u,empBarcode:text.trim(),deviceId:devId||undefined});
      if(res.needFace){ // המנהל הפעיל זיהוי פנים בינתיים — נופלים חזרה לפנים
        stopBcLogin();
        S._pendingUser={user:u,name:res.name,faceUpdateAllowed:!!res.faceUpdateAllowed};
        startFaceAuth();
        return;
      }
      await fbSignInWithToken(res.token);
      stopBcLogin();
      finishLogin(res.worker,true); // כניסה + החתמת כניסה אוטומטית
    }catch(e){
      const c=_loginErrCode(e);
      stopBcLogin();
      // מסלול הברקוד חסום לעובד הזה — מחזירים את שדה הסיסמה כדי שלא ייתקע בלי דרך להיכנס
      if(c==='barcode-not-allowed'||c==='barcode-needs-setup'){
        document.getElementById('l-pass-wrap').style.display='';
        document.getElementById('l-bc-hint').style.display='none';
      }
      _loginShowErr(e,'call');
    }
}
function stopBcLogin(){
  if(_bcLoginInt){clearInterval(_bcLoginInt);_bcLoginInt=null;}
  if(_bcLoginStream){_bcLoginStream.getTracks().forEach(t=>t.stop());_bcLoginStream=null;}
  const c=document.getElementById('l-bc-cam');if(c)c.style.display='none';
  const v=document.getElementById('l-bc-video');if(v)v.srcObject=null;
  // מחזירים את כפתור הסריקה כל עוד העובד כשיר — אחרת סריקה שנכשלה משאירה מסך בלי שום דרך להיכנס
  const h=document.getElementById('l-bc-hint');
  if(h&&!S.user)h.style.display=_bcLoginEligible(document.getElementById('l-user')?.value||'')?'block':'none';
}
// "זכור אותי" לעובד ברקוד: מחכה לחיבור ופותח את המצלמה לבד — העובד רק מכוון אותה למדבקה.
function _autoBcLogin(u){
  if(!_bcLoginEligible(u))return;
  let tries=0;
  const t=setInterval(()=>{
    const ls=document.getElementById('login-screen');
    if(S.user||!ls||ls.classList.contains('hidden')){clearInterval(t);return;}
    if(S.fbConnected&&window._fbFunctions){clearInterval(t);startBcLogin();}
    else if(++tries>20)clearInterval(t); // ~10 שנ' בלי חיבור — ממשיכים ידנית
  },500);
}
async function doLogin(){
  if(loginLocked){document.getElementById('l-err').textContent='חשבון נעול לדקה עקב ניסיונות כושלים';return;}
  if(await checkVersion()){document.getElementById('l-err').textContent='🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב';return;}
  const u=document.getElementById('l-user').value.trim();
  // 🛑 שדה הסיסמה **מוסתר** לעובד עם פנים/ברקוד, אבל הערך שהוקלד בו קודם נשאר. בלי הבדיקה הזו
  // הוא נשלח לשרת, חזרה 'wrong' (n/5) והמצלמה לא נפתחה אף פעם (רהאם 10/11/2026).
  const _pw=document.getElementById('l-pass-wrap');
  const p=(_pw&&_pw.style.display==='none')?'':document.getElementById('l-pass').value.trim();
  if(!u){document.getElementById('l-err').textContent='נא למלא שם משתמש וסיסמה';return;}
  if(!S.fbConnected||!window._fbFunctions){document.getElementById('l-err').textContent='⛔ אין חיבור לשרת — בדוק אינטרנט ונסה שוב';return;}
  document.getElementById('l-err').textContent='מאמת...';
  const devId=await getDeviceId();
  // שלושה שלבים נפרדים בכוונה: עד היום כל השלושה חלקו catch אחד, ולכן קריסה
  // *אחרי* שהשרת כבר אישר את הסיסמה הוצגה כ"שגיאת חיבור לשרת".
  let res;
  try{
    // האימות כולו בצד השרת: סיסמה, השעיה, WiFi מפעל, נעילת מכשיר, נעילת ניסיונות
    // 🛑 בלי סיסמה — לא שולחים את המפתח בכלל: ה-SDK של callable הופך undefined ל-null,
    // והשרת קרא את null כסיסמה "null" ⇒ 'wrong' (n/5) במקום לפתוח מצלמה (רהאם 10/11/2026).
    const payload={user:u};
    if(p)payload.pass=p;
    if(devId)payload.deviceId=devId;
    res=await loginCall(payload);
  }catch(e){
    if(_loginErrCode(e)==='wrong'){_loginWrongPass();return;}
    _loginShowErr(e,'call');
    return;
  }
  if(res.needFace){
    // לעובד הזה נדרש זיהוי פנים — השרת יאמת את הפנים ויחזיר טוקן
    S._pendingUser={user:u,name:res.name,faceUpdateAllowed:!!res.faceUpdateAllowed};
    startFaceAuth();
    return;
  }
  loginAttempts=0;
  try{
    await fbSignInWithToken(res.token);
  }catch(e){
    _loginShowErr(e,'token');
    return;
  }
  if(res.needFaceRegister){
    // סיסמה אומתה אך פנים טרם נרשמו — רישום ראשוני ואז כניסה
    S._pendingUser={...res.worker,_authed:true};
    try{_startFaceFirstRegister();}catch(e){_loginShowErr(e,'finish');}
    return;
  }
  try{
    finishLogin(res.worker,false);
  }catch(e){
    _loginShowErr(e,'finish');
  }
}
function doLogout(noWipe){
  // בלי signOut ה-session של Firebase שורד את היציאה, והשחזור בטעינה הבאה
  // היה מחזיר את העובדת פנימה — כלומר אי אפשר היה לצאת בכלל.
  try{const{getAuth,signOut}=window._fb;signOut(getAuth(window._fbApp)).catch(()=>{});}catch(e){}
  _restoreDone=true;
  // 🎙 מכשיר הקשר לא נשאר על מסך הכניסה: סוגרים חלון, משחררים מיקרופון, מנקים את התיבה של המשתמש שיצא
  if(typeof closeVoice==='function'){closeVoice();document.getElementById('vc-pop')?.remove();
    if(_vcPlaying){_vcPlaying.pause();_vcPlaying=null;}_vcQ=[];_vcIn=[];_vcOut=[];_vcOther=[];}
  S.user=null;
  document.getElementById('vc-fab')?.style.setProperty('display','none');
  if(typeof _kioskOpen!=='undefined'&&_kioskOpen)closeKiosk();
  document.getElementById('nb-kiosk')?.classList.add('hidden');
  [...ALL_WORKER_PAGE_IDS,'admin','mgrtasks','attrep','setup','costs'].forEach(p=>document.getElementById('nb-'+p)?.classList.add('hidden'));
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('l-user').value='';
  document.getElementById('l-pass').value='';
  document.getElementById('l-err').textContent='';
  // השם הזכור נשאר ממולא גם אחרי התנתקות — בלי כניסה אוטומטית (התנתקות = בחירה מפורשת לצאת)
  const _lu=localStorage.getItem('txops_last_user')||'';
  if(_lu){document.getElementById('l-user').value=_lu;onUserInput(_lu);document.getElementById('l-switch-user').style.display='';}
  // 💾 מוחקים את המטמון המקומי של Firestore מהמכשיר ומרעננים (הדף חוזר למסך הכניסה, השם הזכור נשאר)
  // noWipe = החיבור נסגר בטאב אחר (_watchAuthLoss): משאירים את ההודעה על המסך; הטאב שיצא מוחק
  if(!noWipe&&typeof _dbWipeAndReload==='function')_dbWipeAndReload();
}


