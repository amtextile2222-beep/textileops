// ─── LOCAL STORAGE ──────────────────────────────────────────
// 💾 (13/11/2026) עד היום נשמר כאן עותק של **כל** הנתונים (עובדים, משימות, היסטוריה, מוצרים, נוכחות, עלויות
// ושכר, לקוחות) והוצג בפתיחה עד שהשרת ענה. שלוש בעיות: (1) כשהשמירה נכשלה בשקט (מכסה) העותק נתקע — נראה
// הבזק של 103 מוצרים / 20 עובדים מלפני חודשים; (2) השכר נשאר בדפדפן גם אחרי יציאה; (3) runDailyReset רץ
// בבוקר על רשימת העובדים מהעותק — עותק תקוע יכול לכתוב לאתמול נוכחות של יום ישן (נבדק 13/11: 0 מקרים ב-1,590).
// עכשיו Firestore שומר את הנתונים במכשיר בעצמו (_initDb) ⇒ כאן רק מה שצריך **לפני** הכניסה, כשאין עדיין גישה לשרת:
// _lsHints — רמזי מסך הכניסה (מי עם פנים / ברקוד / מנהל לחירום בלי רשת), ⚠️ **לא** ב-S.workers: autoPunchIn
// ו-waitForWorker היו תופסים את הרשומה המקוצרת ככרטיס עובד וכותבים ממנה. + מונה משימות, צבעים, מה נשלח לטלגרם.
const _LS_HINT_KEYS=['id','user','name','role','dept','faceAuth','faceRegistered','deviceBinding','deviceRegistered'];
let _lsHints=[];
function _hintsOf(ws){return (ws||[]).filter(w=>w&&w.user).map(w=>{const o={};_LS_HINT_KEYS.forEach(k=>{if(w[k]!==undefined)o[k]=w[k];});return o;});}
// מקור לרמזי מסך הכניסה: העובדים החיים אם נטענו, אחרת הרמזים השמורים
function _loginWorkers(){return (S.workers&&S.workers.length)?S.workers:_lsHints;}
function saveLS(){
  try{
    if(S.workers&&S.workers.length)_lsHints=_hintsOf(S.workers);
    const d={hints:_lsHints,nextTId:S.nextTId,customColors:S.customColors,
      tgSentAlerts:S.tgSentAlerts,tgAbsentSig:S.tgAbsentSig};
    localStorage.setItem('txops_v3',JSON.stringify(d));
  }catch(e){}
}
function loadLS(){
  try{
    const raw=localStorage.getItem('txops_v3');
    if(!raw)return;
    const d=JSON.parse(raw);
    // עובדי דמו ישנים (מגרסאות קודמות) — לא לטעון אותם
    const DEMO_USERS=['riva','moha','ester','yosef','ahmad','sara','david'];
    // עותק בפורמט הישן (workers מלא) ⇒ גוזרים ממנו רמזים בלבד, ושאר השדות (שכר, נוכחות...) נמחקים מיד למטה
    _lsHints=_hintsOf(d.hints||d.workers).filter(w=>!DEMO_USERS.includes(w.user));
    if(d.nextTId)S.nextTId=d.nextTId;
    if(d.customColors){S.customColors=d.customColors;Object.assign(COLORS,d.customColors);}
    if(d.tgSentAlerts)S.tgSentAlerts=d.tgSentAlerts;
    if(d.tgAbsentSig)S.tgAbsentSig=d.tgAbsentSig;
    if(d.workers||d.costs||d.products||d.attHistory)saveLS(); // דורס את העותק הישן בגרסה המצומצמת
  }catch(e){}
}
loadLS();

// ─── FIREBASE ───────────────────────────────────────────────
let db=null;
let fbConfig={apiKey:"AIzaSyCN9AlUZFX6tODyClzopC9BrRi-Oj7oSv8",projectId:"textileops-aef4a",appId:"1:570030273525:web:ff4a7d125a40066a4826bc",authDomain:"textileops-aef4a.firebaseapp.com",storageBucket:"textileops-aef4a.firebasestorage.app",messagingSenderId:"570030273525",measurementId:"G-1PRH851WYR"};

function loadFbConfig(){
  try{const c=localStorage.getItem('txops_fb');if(c)fbConfig=JSON.parse(c);}catch(e){}
}
loadFbConfig();

function setFbStatus(st,msg){
  const el=document.getElementById('fb-status');
  el.className=st;el.textContent=msg;
  if(st==='ok')setTimeout(()=>el.classList.add('hidden'),3000);
}

async function connectFirebase(){
  const apiKey=document.getElementById('fb-apikey').value.trim();
  const projectId=document.getElementById('fb-projid').value.trim();
  const appId=document.getElementById('fb-appid').value.trim();
  if(!apiKey||!projectId||!appId){document.getElementById('fb-result').textContent='נא למלא את כל השדות';return;}
  fbConfig={apiKey,projectId,appId,authDomain:`${projectId}.firebaseapp.com`,storageBucket:`${projectId}.appspot.com`,messagingSenderId:'000000000000'};
  localStorage.setItem('txops_fb',JSON.stringify(fbConfig));
  document.getElementById('fb-result').textContent='⏳ מתחבר...';
  try{
    await initFb();
    document.getElementById('fb-result').textContent='✅ התחברות הצליחה! Firebase פעיל.';
  }catch(e){
    document.getElementById('fb-result').textContent='❌ שגיאה: '+e.message;
  }
}

async function initFb(){
  if(!window._fbReady){await new Promise(res=>document.addEventListener('fbSDKReady',res,{once:true}));}
  if(!fbConfig)throw new Error('אין Firebase Config');
  const{initializeApp,getFirestore,getFunctions}=window._fb;
  const app=initializeApp(fbConfig,'txops3');
  db=_initDb(app);
  window._fbApp=app;
  window._fbFunctions=getFunctions(app);
  // שלב 2 אבטחה: אין יותר התחברות אנונימית — טוקן אמיתי (עם role) מתקבל
  // רק אחרי אימות בשרת ב-doLogin; ה-listeners מתחילים אחרי הכניסה
  S.fbConnected=true;
  setFbStatus('ok','✅ Firebase מחובר');
  // השחזור רץ ברגע ש-Firebase מוכן — לפני הכניסה האוטומטית ולפני שהעובדת
  // הספיקה להקליד. אם אין session הוא יוצא מיד ולא עושה כלום.
  _restoreSession();
  _watchAuthLoss();
}

// 💾 מטמון מקומי של Firestore (13/11/2026). עד היום (מטמון בזיכרון) כל פתיחה, רענון, טאב שאייפון הרג
// ו"גרסה חדשה זמינה" קראו מהשרת את **כל** המסמכים של כל המאזינים מחדש — וזה רוב חשבון ה-Firestore.
// עכשיו המסמכים נשמרים בטלפון (IndexedDB) ובפתיחה חוזרת השרת שולח רק מה שהשתנה.
// ⚠️ זה חוסך רק כשהמאזין חוזר תוך ~30 דק' מהניתוק (אחרי זה גוגל גובה כמו שאילתה חדשה) ⇒ הפתיחה
// הראשונה בבוקר עולה כמו קודם; החיסכון — ברענונים במהלך היום ובגל הרענונים אחרי דחיפה.
// ⚠️ שאילתה עם ערך שמשתנה בכל פתיחה (Date.now()) היא שאילתה חדשה כל פעם ⇒ אין חיסכון. לכן חיתוכי
// הזמן במאזינים מעוגלים (histTasks — לחצות, voiceAll — לשעה). מאזין חדש עם תאריך — לעגל גם אותו.
// ⚠️ נתוני מטמון מגיעים קודם (fromCache) — החלטות (ניקוי בוקר, התראות, זומבים) רק מנתוני שרת.
// מאזין שמחכה ל-fromCache=false חייב includeMetadataChanges: אם בשרת לא השתנה כלום מאז, ההודעה
// היחידה היא שינוי metadata — ובלעדיו הוא לא מגיע לעולם (ראה _metaSkip).
// כיבוי בטלפון אחד לבדיקה: localStorage.txops_nocache='1' ⇒ מטמון בזיכרון כמו קודם.
let _dbPersist=false;
function _initDb(app){
  const{getFirestore,initializeFirestore,persistentLocalCache,persistentMultipleTabManager}=window._fb;
  let off=false;try{off=localStorage.getItem('txops_nocache')==='1';}catch(e){}
  if(!off&&initializeFirestore&&persistentLocalCache){
    // בכשל IndexedDB (גלישה פרטית, אייפון ישן) ה-SDK עצמו נופל למטמון בזיכרון; ה-catch — למקרה שזרק
    try{const d=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});_dbPersist=true;return d;}
    catch(e){console.warn('💾 מטמון מקומי לא הופעל:',e&&e.message);}
  }
  return getFirestore(app);
}
// יציאה ⇒ מוחקים את המטמון מהמכשיר (אצל מנהל יש בו עלויות ושכר; בטלפון משותף — נתונים של אחר)
// ומרעננים את הדף (אחרי מחיקה אי אפשר להמשיך עם אותו מופע Firestore). כתיבות פתוחות — עד 3 שנ'.
async function _dbWipeAndReload(){
  if(!_dbPersist||!db){return false;}
  const{terminate,clearIndexedDbPersistence,waitForPendingWrites}=window._fb;
  try{await Promise.race([waitForPendingWrites(db),new Promise(r=>setTimeout(r,3000))]);}catch(e){}
  try{await terminate(db);}catch(e){}
  try{await clearIndexedDbPersistence(db);}catch(e){console.warn('💾 מחיקת המטמון נכשלה (טאב אחר פתוח?):',e&&e.message);}
  _pwSet.clear();
  location.reload();
  return true;
}
// עם includeMetadataChanges מגיעות גם הודעות בלי שום שינוי במסמכים (כתיבה שאושרה בשרת וכו').
// מדלגים עליהן — חוץ מהמעבר מטמון ⇒ שרת, שבשבילו ביקשנו אותן.
const _metaFC={};
function _metaSkip(name,snap){
  const fc=snap.metadata.fromCache,same=_metaFC[name]===fc;_metaFC[name]=fc;
  return same&&snap.docChanges().length===0;
}

// ─── 📡 חיבורים חיים עמידים + מצב סנכרון (25/09/2026) ─────────────────────────
// onSnapshot בלי callback שגיאה: כשהשרת דוחה (הרשאה/טוקן), המאזין נסגר לתמיד ובשקט —
// המסך ממשיך להציג נתונים קפואים עד רענון. בנוסף, יציאה (signOut) הורגת את כל המאזינים,
// ו-_listenersStarted מנע את פתיחתם מחדש בכניסה הבאה באותו טאב ⇒ עובדת שנייה בטלפון
// משותף ראתה נתונים קפואים. _live עוטף כל מאזין: פותח מחדש בהמתנה גדלה, מרענן טוקן
// בשגיאת הרשאה, ומחייה מאזינים מתים בכניסה הבאה (_liveReviveAll ב-startDataListeners).
// ⚠️ ניתוק WiFi רגיל *אינו* שגיאה — Firestore מתחבר מחדש לבד. זה רק לדחיית שרת.
// הרישום לפי שם גם מונע כפילות: listenWorkerMessages/listenMgrInbox נקראות בכל כניסה.
const _liveReg={};
function _live(name,refFn,cb,opts,when){
  const{onSnapshot}=window._fb;
  const st=_liveReg[name]||(_liveReg[name]={fails:0,unsub:null,dead:false,timer:null});
  st.refFn=refFn;st.cb=cb;st.opts=opts;st.when=when;st.dead=false;
  clearTimeout(st.timer);
  try{if(st.unsub)st.unsub();}catch(e){}
  st.unsub=null;
  const next=snap=>{if(st.fails){st.fails=0;_liveBanner();}cb(snap);};
  const onErr=err=>{
    st.unsub=null;
    console.warn('📡 מאזין '+name+' נפל:',err&&err.code,err&&err.message);
    // אחרי יציאה, או כשהמשתמש הנוכחי לא רשאי (when) — לא מנסים; הכניסה הבאה תחייה אם מותר
    if(!S.user||(st.when&&!st.when())){st.dead=true;return;}
    st.fails++;_liveBanner();
    const delay=Math.min(60000,2000*Math.pow(2,st.fails-1));
    st.timer=setTimeout(async()=>{
      if(!S.user||(st.when&&!st.when())){st.dead=true;return;}
      // שגיאת הרשאה = לרוב טוקן שפג/לא רוענן — מרעננים לפני ניסיון חוזר
      if(err&&err.code==='permission-denied'){
        try{const u=window._fb.getAuth(window._fbApp).currentUser;if(u)await u.getIdToken(true);}catch(e){}
      }
      _live(name,st.refFn,st.cb,st.opts,st.when);
    },delay);
  };
  try{st.unsub=opts?onSnapshot(refFn(),opts,next,onErr):onSnapshot(refFn(),next,onErr);}
  catch(e){console.warn('📡 פתיחת מאזין '+name+' נכשלה:',e.message);st.dead=true;}
}
function _liveReviveAll(){
  Object.keys(_liveReg).forEach(n=>{const st=_liveReg[n];if(st.dead&&!st.unsub&&(!st.when||st.when()))_live(n,st.refFn,st.cb,st.opts,st.when);});
}
// פס אדום רק אחרי 3 כשלונות רצופים של מאזין כלשהו — נפילה בודדת נפתרת לבד ברוב המקרים
function _liveBanner(){
  const bad=Object.keys(_liveReg).filter(n=>_liveReg[n].fails>=3);
  let b=document.getElementById('live-banner');
  if(!bad.length){if(b)b.remove();return;}
  if(!b){b=document.createElement('div');b.id='live-banner';
    b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;background:var(--red-bg);color:var(--red-txt);padding:8px 12px;text-align:center;font-size:13px;font-weight:700;cursor:pointer';
    b.onclick=()=>location.reload();document.body.appendChild(b);}
  b.textContent=_syncT().banner;
}
// ── מצב סנכרון: 🟢 מחובר · 🟠 אין קשר לשרת · ⏳N כתיבות שטרם אושרו בשרת ──
// setDoc/updateDoc מחזירים promise שמתממש רק כשהשרת אישר ⇒ מונה מדויק לכתיבות דרך העוטפים.
// ⏳ מוצג רק לכתיבה שממתינה מעל 2 שנ' (או כשאין קשר) — אחרת כל סריקה הייתה מהבהבת.
const _pwSet=new Set();let _syncOnline=true,_syncTimer=null,_syncWatchOn=false;
function _pw(p){const t={ts:Date.now()};_pwSet.add(t);_syncDot();return Promise.resolve(p).finally(()=>{_pwSet.delete(t);_syncDot();});}
function _syncState(){
  const slow=[..._pwSet].some(t=>Date.now()-t.ts>2000);
  if(_pwSet.size&&(slow||!_syncOnline))return 'pend';
  return _syncOnline?'ok':'off';
}
function _syncDot(){
  // הנקודה יושבת על עיגול השם בסרגל העליון (לא תופסת מקום בסרגל הצפוף)
  const d=document.getElementById('sync-dot'),w=document.getElementById('av-wrap');
  if(!d||!w)return;
  const st=_syncState();
  d.className=st;w.classList.toggle('pend',st==='pend');
  const t=_syncT();w.title=st==='ok'?t.ok:st==='off'?t.offShort:t.pendShort(_pwSet.size);
  // כל עוד יש כתיבות פתוחות — בדיקה חוזרת כדי שה-⏳ יופיע אחרי 2 שנ' גם בלי אירוע חדש
  clearTimeout(_syncTimer);if(_pwSet.size)_syncTimer=setTimeout(_syncDot,2100);
}
// טקסטי מצב החיבור בשפת הממשק. עד 25/09 הוצגו עברית+ערבית יחד, והערבית קוצרה ל"אין חיבור" —
// בדיוק בלי החלק שמרגיע ("נשמר במכשיר ויישלח"), שהעובדות קוראות בערבית.
const SYNC_TXT={
  he:{ok:'מחובר ומסונכרן',off:'אין קשר לשרת — מה שנעשה נשמר במכשיר ויישלח כשהחיבור יחזור',
      pend:n=>n+' פעולות ממתינות לשליחה — לא לרענן ולא לסגור את הדף',
      pendShort:n=>'ממתין לשליחה: '+n,offShort:'אין קשר לשרת',
      banner:'⚠ חלק מהנתונים הפסיקו להתעדכן — לחץ כאן לרענון'},
  ar:{ok:'متصل ومتزامن',off:'لا يوجد اتصال بالخادم — ما تقوم به محفوظ في الجهاز وسيُرسل عند عودة الاتصال',
      pend:n=>n+' عمليات بانتظار الإرسال — لا تُحدِّث الصفحة ولا تغلقها',
      pendShort:n=>'بانتظار الإرسال: '+n,offShort:'لا يوجد اتصال بالخادم',
      banner:'⚠ بعض البيانات توقفت عن التحديث — اضغط هنا للتحديث'},
  en:{ok:'Connected and synced',off:'No connection to the server — your actions are saved on the device and will be sent when the connection returns',
      pend:n=>n+' actions waiting to be sent — do not refresh or close the page',
      pendShort:n=>'Waiting to send: '+n,offShort:'No connection to the server',
      banner:'⚠ Some data stopped updating — tap here to refresh'}
};
function _syncT(){return SYNC_TXT[(typeof currentLang!=='undefined'&&SYNC_TXT[currentLang])?currentLang:'he'];}
function _syncDotInfo(){
  const st=_syncState(),t=_syncT();
  if(st==='ok')showToast('🟢 '+t.ok);
  else if(st==='off')showToast('🟠 '+t.off,'var(--amber-txt)',6000);
  else showToast('⏳ '+t.pend(_pwSet.size),'var(--amber-txt)',6000);
}
function _syncWatchStart(){
  if(_syncWatchOn||!db)return;_syncWatchOn=true;
  // מסמך קטן אחד עם includeMetadataChanges: fromCache=true ⇔ אין קשר חי לשרת
  _live('syncWatch',()=>window._fb.doc(db,'appSettings','customColors'),snap=>{_syncOnline=!snap.metadata.fromCache;_syncDot();},{includeMetadataChanges:true});
  window.addEventListener('offline',()=>{_syncOnline=false;_syncDot();});
  window.addEventListener('online',()=>_syncDot());
  // רענון/סגירה עם כתיבות שטרם הגיעו לשרת = איבוד שלהן ⇒ הדפדפן מבקש אישור (לא בלוח הקיר)
  window.addEventListener('beforeunload',e=>{if(_pwSet.size&&!(typeof _kioskOpen!=='undefined'&&_kioskOpen)){e.preventDefault();e.returnValue='';}});
}

// ─── 💲 תמחור מוסתר (25/09/2026) ─────────────────────────────────────────────
// מחיר ללקוח, אחוז רווח, עלות חומרים וגזירה ישבו בתוך מסמכי products — שנטענים לכל טלפון
// (כולל עובדות) בכל פתיחה ונשמרים גם ב-localStorage. ההסתרה במסך לא הייתה הגנה.
// עכשיו: השדות יושבים ב-productPricing/{id} (אותו מזהה), שה-Rules פותחים רק ל-_canPricing.
// אצל מי שמורשה הם ממוזגים חזרה לאובייקט המוצר ב-S.products ⇒ שאר הקוד לא השתנה.
// כתיבה: העוטפים (fbSet וכו') מפצלים אוטומטית כל כתיבה ל-products — השדות לא חוזרים לשם.
// ⚠️ עובדת בלי תמחור עדיין צריכה לדעת "יש למוצר תמחור?" לצפי בסריקה ⇒ הדגל priced
// (כן/לא, בלי מספרים) נשמר במסמך המוצר. ראה _isPriced.
const PRICING_FIELDS=['unitPrice','targetProfitPct','directMaterialsCost','cutPrice','cutProfitPct','extraMatPrice'];
let _pricingMap={};
// ⚠️ חייב להישאר זהה ל-canPricing ב-firestore.rules: מנהל · permissions מפורש עם products/dnotes ·
// אחראי בלי permissions (ברירת המחדל שלו כוללת products; dnotes דורש סימון מפורש — OPTIN_PAGES)
function _canPricing(){
  const u=S.user;if(!u)return false;
  if(u.role==='manager')return true;
  const w=(S.workers||[]).find(x=>x.id===u.id)||u;
  if(Array.isArray(w.permissions))return w.permissions.includes('products')||w.permissions.includes('dnotes');
  return u.role==='supervisor';
}
function _isPriced(p){return !!p&&(+p.unitPrice>0||p.priced===true);}
// מפצל כתיבה למסמך מוצר: שדות התמחור יוצאים ל-productPricing (רק אם מורשה), ו-priced מתעדכן
function _splitPricing(col,id,data){
  if(col!=='products'||!data||typeof data!=='object')return data;
  const out={...data},pr={};let any=false;
  PRICING_FIELDS.forEach(f=>{if(f in out){if(out[f]!==undefined)pr[f]=out[f];delete out[f];any=true;}});
  if(!any)return out;
  if('unitPrice' in pr)out.priced=+pr.unitPrice>0;
  if(_canPricing()&&db&&Object.keys(pr).length){
    const{doc,setDoc}=window._fb;
    _pricingMap[String(id)]={...(_pricingMap[String(id)]||{}),...pr};
    _pw(setDoc(doc(db,'productPricing',String(id)),pr,{merge:true})).catch(e=>console.warn('💲 שמירת תמחור נכשלה:',e.message));
  }
  return out;
}
// ממזג את התמחור לתוך S.products (רק אצל מורשה; אצל אחר — מוודא שאין שאריות)
function _applyPricing(){
  const ok=_canPricing();
  (S.products||[]).forEach(p=>{
    const pr=ok?_pricingMap[String(p.id)]:null;
    if(pr)PRICING_FIELDS.forEach(f=>{if(f in pr)p[f]=pr[f];});
    else if(!ok){
      // לפני המיגרציה המסמך עוד נושא מספרים ואין בו priced — גוזרים את הדגל *לפני* ההסרה,
      // אחרת עובדת מאבדת את הצפי בסריקה עד שהמנהל נכנס ומריץ את המיגרציה
      if(p.priced===undefined&&+p.unitPrice>0)p.priced=true;
      PRICING_FIELDS.forEach(f=>{delete p[f];});
    }
  });
}
function _startPricingListener(){
  if(!db||!_canPricing())return;
  const st=_liveReg.productPricing;if(st&&st.unsub)return;
  const{collection}=window._fb;
  _live('productPricing',()=>collection(db,'productPricing'),snap=>{
    _pricingMap={};snap.docs.forEach(d=>{_pricingMap[d.id]=d.data();});
    _applyPricing();saveLS();
    try{renderProducts();}catch(e){}
    if(document.querySelector('.page.active')?.id==='page-dnotes')try{renderDNotes();}catch(e){}
  },null,_canPricing);
}
// מיגרציה חד-פעמית, מהמכשיר של המנהל: מסמך מוצר שעדיין נושא שדות תמחור ⇒ העתקה ל-productPricing
// **ואז** מחיקת השדות ממנו (בסדר הזה — כשל באמצע משאיר עותק כפול, לא אובדן). רצה על ה-snapshot
// הגולמי מהשרת, לא על S.products הממוזג.
let _pricingMigBusy=false;
async function _migratePricing(docs){
  if(_pricingMigBusy||S.user?.role!=='manager'||!db)return;
  const todo=docs.filter(d=>PRICING_FIELDS.some(f=>f in d.data()));
  if(!todo.length)return;
  _pricingMigBusy=true;
  const{doc,getDoc,setDoc,updateDoc,deleteField}=window._fb;
  let n=0;
  try{
    for(const d of todo){
      const raw=d.data(),pr={},del={};
      PRICING_FIELDS.forEach(f=>{if(f in raw){if(raw[f]!==undefined)pr[f]=raw[f];del[f]=deleteField();}});
      // ערך קיים ב-productPricing (אחראי ששמר מחיר אחרי הפריסה ולפני המיגרציה) גובר על הישן
      // שבמסמך המוצר. נקרא ישירות מהשרת — המאזין של productPricing אולי עוד לא הגיע.
      const curSnap=await getDoc(doc(db,'productPricing',d.id));
      const cur=curSnap.exists()?curSnap.data():{};
      const merged={...pr,...cur};
      await _pw(setDoc(doc(db,'productPricing',d.id),merged,{merge:true}));
      await _pw(updateDoc(doc(db,'products',d.id),{...del,priced:+merged.unitPrice>0}));
      n++;
    }
    console.log('💲 מיגרציית תמחור: '+n+' מוצרים הועברו');
    if(n)showToast('💲 התמחור של '+n+' מוצרים הועבר לאחסון מוגן');
  }catch(e){console.warn('💲 מיגרציית תמחור נעצרה ('+n+' הושלמו):',e.message);}
  finally{_pricingMigBusy=false;}
}

// listeners של נתונים — רק אחרי כניסה מאומתת (יש טוקן עם role)
let _listenersStarted=false;
let _adminListenerStarted=false;
// נדלק אחרי ה-snapshot הראשון של activeTasks שהגיע מהשרת (לא cache) *ואחרי* עיבוד ההשהיה
// האוטומטית שלו. חידוש בחתימת כניסה חייב להמתין לו — אחרת העובדת הראשונה בבוקר
// מסננת רשימה ריקה/ישנה מהזיכרון ומשימותיה נשארות מושהות (ندوه 27/07, 12 דק' אבודות).
let _activeTasksReady=false;
// ⚠️ כמו _activeTasksReady — לעובדים. התראות הטלגרם ממתינות לשניהם (ראה checkAlerts).
let _workersReady=false;
function startDataListeners(){
  // מחמם מראש את שעות הנוכחות בפועל של התקורה לשעה (מנהל בלבד — רק לו יש עלויות)
  setTimeout(()=>{if(S.user?.role==='manager')ohReady();},4000);
  if(!_listenersStarted){
    _listenersStarted=true;
    listenFb();
  }else _liveReviveAll();
  _startPricingListener();
  _startCashboxListener();
  _syncWatchStart();_syncDot();
  // הגדרות רגישות (עלויות) — קריאה מותרת רק למנהל ב-Rules
  if(!_adminListenerStarted&&S.user?.role==='manager'&&db){
    _adminListenerStarted=true;
    const{collection,onSnapshot}=window._fb;
    _live('adminSettings',()=>collection(db,'adminSettings'),snap=>{
      snap.docs.forEach(d=>{
        if(d.id==='costs'){S.costs={...S.costs,...d.data()};saveLS();_pubRateCache();}
        // 📧 מיילים מורשים למעקב הזמנות — בזיכרון בלבד, לא ב-localStorage
        if(d.id==='custLinks'){_custEmails=d.data()?.emails||{};_custLinkRefresh();}
        if(d.id==='custTrackLog'){_custLog=d.data()?.entries||{};_custLinkRefresh();}
        if(d.id==='custDevices'){_custDevs=d.data()?.entries||{};_custLinkRefresh();}
        // 🔔 התראות ללקוח (23/10/2026): שעות שליחה + מכשירים רשומים — נכתבים ע"י customerPush / כאן
        if(d.id==='custNotifyCfg'){_custNotifyCfg=d.data()||{};_custLinkRefresh();}
        if(d.id==='custPush'){_custPushToks=d.data()?.tokens||{};_custLinkRefresh();}
      });
      renderAll();
    });
  }
}

function listenFb(){
  if(!db)return;
  const{collection,onSnapshot,query,orderBy,where}=window._fb;
  // workers
  _live('workers',()=>collection(db,'workers'),snap=>{
    if(snap.empty||_metaSkip('workers',snap))return;
    S.workers=snap.docs.map(d=>({id:d.id,...d.data()}));
    migrateBreaks(!snap.metadata.fromCache);
    if(typeof _vcFab==='function')_vcFab(); // 🎙 המנהל שינה voiceMode — הכפתור מופיע/נעלם מיד
    // אם הנתונים מגיעים מה-cache המקומי — לא לאפס, רק לרנדר
    // (cache עלול להכיל sessions מאתמול ולגרום לאיפוס שגוי)
    if(snap.metadata.fromCache){renderAll();return;}
    // ⚠️ (13/11/2026) _workersReady נדלק רק **אחרי** הניקוי למטה. waitForWorker מחכה לו, ו-autoPunchIn שרץ
    // בזמן שהניקוי עוד ממתין ל-getDoc היה מוסיף כניסה של היום — ואז הניקוי מאפס sessions=[]/status=out
    // על אותו אובייקט וכותב לשרת ⇒ ההחתמה נמחקת. (עד היום waitForWorker לקח את העותק המקומי מיד וזה לא קרה.)
    // נקה sessions ישנות שלא אופסו כי Firebase נטען אחרי checkDailyReset
    const today=todayStr();
    const {getDoc,doc:fsDoc}=window._fb;
    const cleanupPromises=S.workers.map(async w=>{
      if(!w.sessions||!w.sessions.length)return;
      const firstIn=w.sessions[0]?.in;
      if(!firstIn)return;
      const sessionDate=firstIn.slice(0,10);
      if(sessionDate<today){
        const histKey=w.id+'_'+sessionDate;
        try{
          // בדוק ישירות ב-Firebase — S.attHistory עלול להיות ריק עדיין (race condition)
          const existing=await getDoc(fsDoc(db,'attHistory',histKey));
          if(!existing.exists()||!existing.data().checkout){
            // אין רשומה או אין checkout — שמור רק אם באמת חסר
            const existingData=existing.exists()?existing.data():null;
            // אין יציאה — סוגרים את הרשומה בשעת סוף המשמרת של אותו יום (לא ב"עכשיו")
            const _cutISO=shiftEndDate(sessionDate).toISOString();
            const _cl=attCloseSessions(existingData?.sessions||w.sessions,_cutISO);
            const rec={
              workerId:w.id,workerName:w.name,dept:w.dept,date:sessionDate,
              sessions:_cl.sessions,
              checkin:existingData?.checkin||w.sessions[0]?.in||'',
              checkout:_cl.checkout,
              breakStart:w.breakStart||'',breakEnd:w.breakEnd||'',
              breakActive:!!w.breakActive,
              autoClosed:_cl.autoClosed,
              netMs:calcNetWorkCapped(w,sessionDate)
            };
            if(!existing.exists())S.attHistory.unshift(rec);
            fbSet('attHistory',histKey,rec);
          }
        }catch(e){}
        w.status='out';w.checkin=null;w.checkout=null;w.sessions=[];
        // ניקוי שיוך תחנה מאתמול + סגירת רשומת ה-stationLog הפתוחה
        if(w.stationLogId){try{fbSet('stationLog',w.stationLogId,{to:shiftEndDate(sessionDate).toISOString()});}catch(e){}}
        w.currentStation=null;w.stationLogId=null;
        fbSet('workers',w.id,{...attFields(w),currentStation:null,stationLogId:null});
      }
    });
    Promise.all(cleanupPromises).then(()=>{_workersReady=true;renderAll();});
  },{includeMetadataChanges:true});
  // active tasks
  // active tasks
  _live('activeTasks',()=>collection(db,'activeTasks'),snap=>{
    if(_metaSkip('activeTasks',snap))return;
    S.activeTasks=snap.docs.map(d=>{const dd=d.data();return{...dd,id:d.id,startTime:dd.startTime?.toDate?dd.startTime.toDate():new Date(dd.startTime),elapsed:0};});
    // סגור משימות שנשארו פתוחות מימים קודמים — רק מנתוני שרת, לא cache
    if(!snap.metadata.fromCache){
      const today=todayStr();
      const localDate=t=>{const d=t.startTime instanceof Date?t.startTime:new Date(t.startTime);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());};
      const stale=S.activeTasks.filter(t=>localDate(t)<today&&!t.paused);
      stale.forEach(t=>{
        const d=t.startTime instanceof Date?t.startTime:new Date(t.startTime);
        // עוגן ההשהיה: היציאה האחרונה של העובד באותו יום (attHistory), לא חצות —
        // אחרת המשימה צוברת ב-accumulatedSec את כל הערב עד 23:59 כזמן עבודה
        // (כך נולדו משימות עם duration גדול מהחלון שלהן). fallback לחצות אם אין רשומה.
        let pausedAt=new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59);
        const rec=(S.attHistory||[]).find(r=>r.workerId===t.workerId&&r.date===localDate(t));
        const sess=rec?.sessions&&rec.sessions.length?rec.sessions:(rec?.checkin?[{in:rec.checkin,out:rec.checkout||null}]:[]);
        const lastOut=sess.reduce((mx,s)=>{const o=s.out?new Date(s.out).getTime():0;return o>mx?o:mx;},0);
        if(lastOut>d.getTime()&&lastOut<pausedAt.getTime())pausedAt=new Date(lastOut);
        t.paused=true;t.pausedAt=pausedAt.toISOString();
        t.accumulatedSec=(t.accumulatedSec||0)+calcTaskDurSec(d,pausedAt,t.workerId);
        t.elapsed=t.accumulatedSec;
        fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:d.toISOString()});
      });
      if(stale.length){S.activeTasks=S.activeTasks.filter(t=>!stale.includes(t));saveLS();}
      // עובד שסטטוסו 'out' ויש לו משימה פעילה היום — השהה אוטומטית
      S.activeTasks.filter(t=>!t.paused).forEach(t=>{
        const w=S.workers.find(x=>x.id===t.workerId);
        if(w&&w.status==='out'&&w.checkout&&new Date(w.checkout)>new Date(t.startTime)){
          const pausedAt=new Date(w.checkout);
          t.paused=true;t.pausedAt=pausedAt.toISOString();
          t.accumulatedSec=(t.accumulatedSec||0)+calcTaskDurSec(t.startTime,pausedAt,t.workerId);
          t.elapsed=t.accumulatedSec;
          fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime});
        }
      });
      // רק כאן — אחרי שההשהיה האוטומטית עוגנה ל-accumulatedSec. חידוש שירוץ לפני כן
      // יראה משימה של אתמול כ"לא מושהית", ידלג עליה, ואז הלולאה למעלה תשהה אותה ליום שלם.
      _activeTasksReady=true;
    }
    renderAll();
  },{includeMetadataChanges:true});
  // hist tasks — חלון חי של HIST_WINDOW_DAYS ימים אחרונים בלבד (זמן אמת נשמר לחלון הזה).
  // היסטוריה ישנה יותר נשלפת לפי דרישה בדוחות (loadHistRange) — מוזיל דרמטית קריאות Firestore.
  // 💾 מעוגל לחצות — אותה שאילתה כל היום ⇒ המטמון המקומי חוסך (Date.now() היה שאילתה חדשה בכל פתיחה)
  const _histCutoff=(()=>{const d=new Date(Date.now()-HIST_WINDOW_DAYS*86400000);d.setHours(0,0,0,0);return d.toISOString();})();
  _live('histTasks',()=>query(collection(db,'histTasks'),where('endTime','>=',_histCutoff),orderBy('endTime','desc')),snap=>{
    S.histTasks=snap.docs.map(d=>{const dd=d.data();return{...dd,id:d.id,startTime:dd.startTime?.toDate?dd.startTime.toDate():new Date(dd.startTime),endTime:dd.endTime?.toDate?dd.endTime.toDate():new Date(dd.endTime)};});
    renderAll();
  });
  // attendance history — חלון חי של ATT_WINDOW_DAYS ימים אחרונים בלבד.
  // קודם לכן נקרא כל האוסף בכל טעינה. ישן יותר נשלף לפי דרישה (loadAttRange).
  // date הוא מחרוזת YYYY-MM-DD ⇒ השוואה לקסיקוגרפית; אומת ש-950/950 הרשומות נושאות אותו.
  const _attCutoff=new Date(Date.now()-ATT_WINDOW_DAYS*86400000).toISOString().slice(0,10);
  _live('attHistory',()=>query(collection(db,'attHistory'),where('date','>=',_attCutoff),orderBy('date','desc')),snap=>{
    S.attHistory=snap.docs.map(d=>({...d.data()}));
    renderAll();
  });
  // products
  _live('products',()=>collection(db,'products'),snap=>{
    S.products=snap.docs.map(d=>({id:d.id,...d.data()}));
    _applyPricing();
    if(!snap.metadata.fromCache)_migratePricing(snap.docs);
    saveLS();renderProducts();_pubRateCache();
    // 📄 תעודת משלוח נשמרת **בתוך** מסמך המוצר (p.shipments), ולשונית התעודות בונה
    // את הרשימה מ-S.products. המאזין קרא רק ל-renderProducts ⇒ מי שעמד על הלשונית
    // (או צפה בה ממכשיר שני) ראה רשימה קפואה עד ניווט או רענון, בזמן שהנתון כבר הגיע.
    // renderDNotes קוראת את שדות הסינון מה-DOM ולא דורסת אותם — חיפוש/טווח שהוקלדו נשמרים.
    if(document.querySelector('.page.active')?.id==='page-dnotes')renderDNotes();
  });
  // app settings (customerNames, customColors) — עלויות עברו ל-adminSettings (מנהל בלבד)
  _live('appSettings',()=>collection(db,'appSettings'),snap=>{
    snap.docs.forEach(d=>{
      const data=d.data();
      if(d.id==='customerNames'){S.customerNames=data;saveLS();}
      if(d.id==='customerInfo'){S.customerInfo=data;saveLS();}
      if(d.id==='company'){S.settings.company={...(S.settings.company||{}),...data};saveLS();}
      if(d.id==='packPrices'){S.settings.packPrices={...(S.settings.packPrices||{}),...data};saveLS();}
      if(d.id==='breakDefault'&&data.start&&data.end){S.settings.breakDefault={start:data.start,end:data.end};saveLS();}
      if(d.id==='rateW'){S.rateW=data;}
      if(d.id==='packStock'){S.packStock=data;try{pstkBadge();if(document.getElementById('pstk-wrap'))renderPackStock();}catch(e){}}
      // 🕳 יומן הביטולים משותף לכל המכשירים — מי שמחק תעודה בנייד, והמנהל
      // שמסתכל במסך הגדול, חייבים לראות את אותו חור עם אותו הסבר.
      if(d.id==='deliveryVoids'){S.settings.dnVoids=Array.isArray(data.list)?data.list:[];saveLS();
        if(document.querySelector('.page.active')?.id==='page-dnotes')try{renderDNotes();}catch(e){}}
      if(d.id==='customColors'){S.customColors=data;Object.assign(COLORS,data);saveLS();}
      if(d.id==='depts'&&data.list&&data.list.length){S.depts=data.list;S.deptStations=data.stations||S.deptStations||{};S.deptStageMap=data.stageMap||S.deptStageMap||{};saveLS();fillDeptSelects();}
      if(d.id==='telegramSettings'){
        S.settings.factoryIP=data.factoryIP||S.settings.factoryIP;
        if(data.waEnabled!==undefined)S.settings.waEnabled=data.waEnabled;
        if(data.waInterval!==undefined)S.settings.waInterval=data.waInterval;
        if(data.waFrom)S.settings.waFrom=data.waFrom;
        if(data.waTo)S.settings.waTo=data.waTo;
        if(data.waLong!==undefined)S.settings.waLong=data.waLong;
        if(data.waAbsent!==undefined)S.settings.waAbsent=data.waAbsent;
        if(data.thresh!==undefined)S.settings.thresh=data.thresh;
        if(data.absent!==undefined)S.settings.absent=data.absent;
        if(data.shiftStart)S.settings.shiftStart=data.shiftStart;
        if(data.shiftEnd)S.settings.shiftEnd=data.shiftEnd;
        if(data.roundMinutes!==undefined)S.settings.roundMinutes=data.roundMinutes;
        if(data.dnStart!==undefined)S.settings.dnStart=parseInt(data.dnStart,10)||S.settings.dnStart;
        if(data.invStart!==undefined)S.settings.invStart=parseInt(data.invStart,10)||S.settings.invStart;
        if(data.vatPct!==undefined&&isFinite(+data.vatPct))S.settings.vatPct=+data.vatPct;
        // 🔒 מתג האכיפה של נעילת התחנה — מסונכרן לכל המכשירים דרך אותו מסמך הגדרות,
        // כדי שכיבוי חירום מהניהול ישחרר את כל רצפת הייצור מיד ולא מכשיר-מכשיר.
        if(data.stationLock!==undefined)S.settings.stationLock=!!data.stationLock;
        if(data.bcKey!==undefined)S.settings.bcKey=String(data.bcKey||''); // 🔐 ברקוד חתום
        if(data.bcSignOn!==undefined)S.settings.bcSignOn=!!data.bcSignOn;
        try{renderBcSignState();}catch(e){}
        // 🔧 רשימת המחלקות הבלעדיות — שמות מחלקה, ולכן renameDept מעדכן גם אותה.
        if(Array.isArray(data.exclusiveDepts))S.settings.exclusiveDepts=data.exclusiveDepts.slice();
        if(data.stepOrderLock!==undefined)S.settings.stepOrderLock=!!data.stepOrderLock;
        if(data.stepOrderStrict!==undefined)S.settings.stepOrderStrict=!!data.stepOrderStrict;
        if(data.stepOrderStrictFrom!==undefined)S.settings.stepOrderStrictFrom=+data.stepOrderStrictFrom||0;
        // מצב גיבוי — ipBypassStart הוא Timestamp מהשרת; ממירים למספר לתצוגה בלבד
        S.settings.ipBypassMin=Number(data.ipBypassMin)||0;
        const _bs=data.ipBypassStart;
        S.settings.ipBypassStartMs=_bs?(typeof _bs.toMillis==='function'?_bs.toMillis():Number(_bs)||0):0;
        // אם שדות חסרים ב-Firebase — המנהל דוחף את ההגדרות המקומיות שלו
        const missingFields=data.waInterval===undefined||!data.waFrom||!data.shiftStart;
        if(missingFields&&S.user?.role==='manager'){
          fbSet('appSettings','telegramSettings',{
            factoryIP:S.settings.factoryIP,waEnabled:S.settings.waEnabled,
            waInterval:S.settings.waInterval,waFrom:S.settings.waFrom,
            waTo:S.settings.waTo,waLong:S.settings.waLong,waAbsent:S.settings.waAbsent,
            thresh:S.settings.thresh,absent:S.settings.absent,
            shiftStart:S.settings.shiftStart,shiftEnd:S.settings.shiftEnd,
            roundMinutes:S.settings.roundMinutes
          });
        }
        saveLS();loadWaSettings();
        try{renderStationLockState();}catch(e){}
        try{renderStepOrderLockState();}catch(e){}
      }
    });
    renderAll();
  });
  // תחנות עבודה פיזיות (מצלמות/DVR)
  _live('stations',()=>collection(db,'stations'),snap=>{
    S.workStations=snap.docs.map(d=>({id:d.id,...d.data()}));
    saveLS();
    try{renderStationsAdmin();}catch(e){}
  });
  // 💸 עובד/עוזר: רק ההוצאות שלו. ה-Rules דוחים האזנה של עובד לכל האוסף (Rules אינם מסננים),
  // ולכן השאילתה חייבת לשאת את אותו תנאי. refFn נקרא בכל פתיחה ⇒ אחרי יציאה וכניסה של
  // משתמש בתפקיד אחר, ההחייאה בונה את השאילתה המתאימה לו.
  _live('workerExpenses',()=>_expSeeAll()?collection(db,'workerExpenses'):query(collection(db,'workerExpenses'),where('workerId','==',S.user?S.user.id:'-')),snap=>{
    S.workerExpenses=[];
    snap.forEach(d=>{if(d.data().id)S.workerExpenses.push(d.data());});
    S.workerExpenses.sort((a,b)=>b.ts-a.ts);
    renderExpenses();
  });
}
// 🧾 קופה (13/11/2026): נטענת רק למי שרואה את לשונית הקופה. עד היום כל טלפון — גם של עובדת עם נוכחות+סריקה
// בלבד — הוריד את כל תנועות הקופה בכל פתיחה (עלות + פרטיות). ⚠️ חייב להישאר זהה ל-canCashbox ב-firestore.rules:
// מנהל · permissions מפורש שכולל 'cashbox' · בלי permissions = ברירת המחדל של התפקיד (כוללת קופה, כמו applyPerms).
function _canCashbox(){
  const u=S.user;if(!u)return false;
  if(u.role==='manager')return true;
  const w=(S.workers||[]).find(x=>x.id===u.id)||u;
  return Array.isArray(w.permissions)?w.permissions.includes('cashbox'):true;
}
// נקרא בכל כניסה (startDataListeners) — לא מ-listenFb שרץ פעם אחת לטאב: אחרת מנהל שנכנס אחרי עובדת באותו טאב לא היה מקבל קופה
function _startCashboxListener(){
  if(!db)return;
  if(!_canCashbox()){S.cashbox=[];return;}
  const st=_liveReg.cashbox;if(st&&st.unsub)return;
  const{collection}=window._fb;
  _live('cashbox',()=>collection(db,'cashbox'),snap=>{
    S.cashbox=[];
    snap.forEach(d=>{if(d.data().id)S.cashbox.push(d.data());});
    S.cashbox.sort((a,b)=>b.ts-a.ts);
    try{renderCashbox();}catch(e){}
  },null,_canCashbox);
}

async function fbSet(col,id,data){
  if(!db)return;
  const{doc,setDoc}=window._fb;
  await _pw(setDoc(doc(db,col,id),_splitPricing(col,id,data),{merge:true}));
}
async function fbDel(col,id){
  if(!db)return;
  const{doc,deleteDoc}=window._fb;
  await _pw(deleteDoc(doc(db,col,id)));
}
// ─── שומר נגד "משימות רפאים" ────────────────────────────────
// fbSet הוא setDoc(merge) — הוא *יוצר* מסמך שלא קיים. חידוש/השהיה פועלים מעצם
// הגדרתם על משימה קיימת, ולכן טאב ישן שמחזיק בזיכרון משימה שנסגרה במקום אחר
// היה מחיה אותה בשרת (ندوه 00084: נסגרה 16/07, קמה לתחייה שוב ושוב וצברה 227 שע').
// fbUpdateOnly נכשל בשקט כשהמסמך לא קיים — הרפאים פשוט לא נכתבת.
async function fbUpdateOnly(col,id,data){
  if(!db)return false;
  const{doc,updateDoc}=window._fb;
  try{await _pw(updateDoc(doc(db,col,id),_splitPricing(col,id,data)));return true;}
  catch(e){return false;} // not-found ⇒ המשימה כבר נסגרה/נמחקה במקום אחר
}
// משימה שכבר נסגרה (קיימת בהיסטוריה המקומית) לא תיכתב חזרה לפעילות
function _isClosedTask(id){return (S.histTasks||[]).some(h=>String(h.id)===String(id));}

// ─── כתיבת כרטיס עובד: שדות, לא אובייקט שלם ─────────────────
// fbSet הוא setDoc(merge), ולכן כתיבת `w` כולו דורסת *כל* שדה בכרטיס בערך
// שהיה בזיכרון של המכשיר הכותב. כשעובדת חותמת כניסה במכשיר אחד בזמן שמכשיר
// אחר מחזיק עותק בן כמה דקות — החתימה נמחקת בלי שום סימן. בדיוק כך נעלמו
// הכניסות של ندوه (06:19) ו-ميرفت (06:20) ב-27/10: הטלגרם יצא, והכרטיס חזר
// לאחור. מכאן והלאה: נוכחות נכתבת בשדות הנוכחות, והשאר לא נוגע בהם.
const ATT_FIELDS=['sessions','status','checkin','checkout','currentStation','stationLogId'];
function attFields(w){
  return{sessions:w.sessions||[],status:w.status||'out',checkin:w.checkin||null,checkout:w.checkout||null};
}
// כתיבת כרטיס שאינה קשורה לנוכחות (עריכת עובד, דגלים, הפסקות) — בלי שדות הנוכחות
function workerNoAtt(w){
  const out={...w};
  ATT_FIELDS.forEach(k=>delete out[k]);
  return out;
}

// init firebase if config saved
document.addEventListener('fbSDKReady',()=>{
  if(fbConfig)initFb().catch(()=>setFbStatus('err','❌ Firebase — שגיאת חיבור'));
  else setFbStatus('err','⚠ Firebase לא מוגדר — נתונים מקומיים בלבד');
});

