// ─── הודעות מנהל לעובד ───────────────────────────────────────
async function mgrSendMsg(wId,wName){
  const msg=prompt('הודעה ל'+wName+':');
  if(!msg||!msg.trim())return;
  if(!S.fbConnected){showToast('⚠ Firebase לא מחובר','var(--red-txt)');return;}
  const from=S.user?.name||'מנהל';
  try{
    await fbSet('workerMessages',wId,{msg:msg.trim(),from,ts:Date.now(),read:false});
    const wData=S.workers.find(x=>x.id===wId);
    if(wData?.pushPrefs?.manager_msg!==false)sendPushToWorker(wId,'📢 הודעה מהמנהל',msg.trim()).catch(()=>{});
    showToast('✅ הודעה נשלחה ל'+wName,'var(--green-txt)');
  }catch(e){showToast('❌ שגיאה בשליחה','var(--red-txt)');}
}
function playAlertSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [0,200,400].forEach(delay=>{
      const o=ctx.createOscillator();const g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.frequency.value=880;g.gain.setValueAtTime(0.3,ctx.currentTime+delay/1000);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay/1000+0.2);
      o.start(ctx.currentTime+delay/1000);o.stop(ctx.currentTime+delay/1000+0.2);
    });
  }catch(e){}
}
function showWorkerMsgPopup(msg,from){
  // הסר popup קודם אם יש
  document.getElementById('worker-msg-popup')?.remove();
  const div=document.createElement('div');
  div.id='worker-msg-popup';
  div.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  div.innerHTML=`<div style="background:var(--bg);border-radius:var(--rl);padding:24px;max-width:340px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">
    <div style="font-size:36px;margin-bottom:12px">📢</div>
    <div style="font-size:13px;color:var(--txt3);margin-bottom:8px">הודעה מ${esc(from)}</div>
    <div style="font-size:17px;font-weight:600;color:var(--txt);margin-bottom:20px;line-height:1.5">${esc(msg)}</div>
    <button class="btn primary" style="width:100%;padding:10px;font-size:14px" onclick="markWorkerMsgRead();document.getElementById('worker-msg-popup').remove()">✅ הבנתי</button>
  </div>`;
  document.body.appendChild(div);
  playAlertSound();
}
let _workerMsgLastTs=0;
function markWorkerMsgRead(){
  if(!S.fbConnected||!db||!S.user)return;
  const{doc,setDoc}=window._fb;
  setDoc(doc(db,'workerMessages',S.user.id),{ts:_workerMsgLastTs,read:true},{merge:true});
}
function listenWorkerMessages(){
  if(!S.fbConnected||!db||!S.user||S.user.role==='manager')return;
  const{doc,onSnapshot}=window._fb;
  // המזהה נקרא בכל פתיחה — אחרי החייאה בכניסה של עובד אחר, מאזינים להודעות *שלו*
  _live('workerMessages',()=>doc(db,'workerMessages',S.user.id),snap=>{
    if(!snap.exists())return;
    const data=snap.data();
    if(!data.ts||data.ts<=_workerMsgLastTs||data.read)return;
    _workerMsgLastTs=data.ts;
    showWorkerMsgPopup(data.msg,data.from||'מנהל');
  });
}
// ─── הודעות עובד/אחראי → מנהל ───────────────────────────────
async function workerSendMsg(){
  const msg=prompt('הודעה למנהל/אחראי:');
  if(!msg||!msg.trim())return;
  if(!S.fbConnected){showToast('⚠ Firebase לא מחובר','var(--red-txt)');return;}
  try{
    const{collection,addDoc}=window._fb;
    await addDoc(collection(db,'mgrInbox'),{fromId:S.user.id,fromName:S.user.name,msg:msg.trim(),ts:Date.now(),read:false});
    sendPush('📢 הודעה מ'+S.user.name,msg.trim(),'worker_msg').catch(()=>{});
    showToast('✅ הודעה נשלחה','var(--green-txt)');
  }catch(e){showToast('❌ שגיאה בשליחה','var(--red-txt)');}
}
async function tsSendMsgToWorker(){
  const empId=document.getElementById('ts-emp-sel').value;
  if(!empId){showToast('⚠ בחר עובד תחילה','var(--red-txt)');return;}
  const w=S.workers.find(x=>x.id===empId);
  if(!w)return;
  const msg=prompt('הודעה ל'+w.name+':');
  if(!msg||!msg.trim())return;
  if(!S.fbConnected){showToast('⚠ Firebase לא מחובר','var(--red-txt)');return;}
  try{
    await fbSet('workerMessages',empId,{msg:msg.trim(),from:S.user.name,ts:Date.now(),read:false});
    if(w.pushPrefs?.manager_msg!==false)sendPushToWorker(empId,'📢 הודעה מ'+S.user.name,msg.trim()).catch(()=>{});
    showToast('✅ הודעה נשלחה ל'+w.name,'var(--green-txt)');
  }catch(e){showToast('❌ שגיאה','var(--red-txt)');}
}
let _mgrInboxLastTs=0;
function listenMgrInbox(){
  if(!S.fbConnected||!db||!S.user)return;
  if(S.user.role!=='manager'&&S.user.role!=='supervisor')return;
  const{collection,query,where,onSnapshot,orderBy,limit}=window._fb;
  _live('mgrInbox',()=>query(collection(db,'mgrInbox'),where('read','==',false)),snap=>{
    snap.docChanges().forEach(change=>{
      if(change.type!=='added')return;
      const d=change.doc.data();
      if(d.ts<=_mgrInboxLastTs)return;
      _mgrInboxLastTs=d.ts;
      showMgrInboxPopup(d.msg,d.fromName||'עובד',change.doc.id);
    });
  });
}
function showMgrInboxPopup(msg,fromName,docId){
  document.getElementById('mgr-inbox-popup')?.remove();
  const div=document.createElement('div');
  div.id='mgr-inbox-popup';
  div.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  div.innerHTML=`<div style="background:var(--bg);border-radius:var(--rl);padding:24px;max-width:340px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">
    <div style="font-size:36px;margin-bottom:12px">📨</div>
    <div style="font-size:13px;color:var(--txt3);margin-bottom:8px">הודעה מ${esc(fromName)}</div>
    <div style="font-size:17px;font-weight:600;color:var(--txt);margin-bottom:20px;line-height:1.5">${esc(msg)}</div>
    <div style="display:flex;gap:8px">
      <button class="btn success" style="flex:1;padding:10px;font-size:14px" onclick="markMgrInboxRead('${docId}');document.getElementById('mgr-inbox-popup').remove()">✅ הבנתי</button>
      <button class="btn primary" style="flex:1;padding:10px;font-size:14px" onclick="replyToWorker('${escj(fromName)}');document.getElementById('mgr-inbox-popup').remove();markMgrInboxRead('${docId}')">↩ השב</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  playAlertSound();
}
function markMgrInboxRead(docId){
  if(!S.fbConnected||!db)return;
  const{doc,updateDoc}=window._fb;
  updateDoc(doc(db,'mgrInbox',docId),{read:true}).catch(()=>{});
}
function replyToWorker(workerName){
  const w=S.workers.find(x=>x.name===workerName);
  if(!w){showToast('⚠ עובד לא נמצא','var(--red-txt)');return;}
  mgrSendMsg(w.id,w.name);
}
// ─── 🎙 מכשיר קשר — הודעות קוליות (06/11/2026) ───────────────────────
// voiceMsgs/{id} = {from,fromName,to:[ids],toLbl,aud(data URL),mime,dur,at,heard:{uid:ms},replyTo?}
// מנהל שולח לכל אחד ושומע את כל השיחות. כל השאר (גם אחראי) לפי workers.voiceMode שהמנהל קובע: '' = רק תשובה
// למי ששלח לו, 'open' = יכול גם להתחיל — לנמענים ב-workers.voiceTo, 'off' = רק שומע. נאכף ב-Rules. נמחקות אחרי 3 ימים (voiceCleanup).
// Push לנמענים — voicePush בשרת. מי שהאפליקציה פתוחה אצלו שומע מיד (אם הדפדפן חוסם ניגון אוטומטי — חלון עם ▶).
let _vcIn=[],_vcOut=[],_vcSince=0,_vcBoot=false,_vcRec=null,_vcStream=null,_vcQ=[],_vcPlaying=null,_vcTarget='';
const _vcMax=45000;
// (06/11/2026 — בקשת המנהל) רק המנהל פתוח לכולם ושומע את כל השיחות. אחראי — כמו עובד: לפי voiceMode,
// ו-'open' = רק לנמענים ב-voiceTo שהמנהל בחר בכרטיס (רשימה ריקה = מנהלים/אחראים, ההתנהגות הקודמת).
const _vcMgr=()=>S.user&&S.user.role==='manager';
const _vcMeW=()=>S.workers.find(w=>w.id===S.user?.id)||S.user||{};
const _vcMode=()=>_vcMgr()?'all':(_vcMeW().voiceMode||'');
const _vcCanReply=()=>_vcMgr()||_vcMode()!=='off';
const _vcName=id=>(S.workers.find(w=>w.id===id)||{}).name||'?';
let _vcOther=[],_vcMon=false;try{_vcMon=localStorage.getItem('vc_mon')==='1';}catch(e){}
const _vcSort=docs=>docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.at>Date.now()-3*864e5).sort((a,b)=>b.at-a.at);
// הודעות חדשות ששייכות לי (נמען) ⇒ ניגון; מנהל עם "האזנה לכל השיחות" ⇒ גם שיחות של אחרים
function _vcOnSnap(snap){
  const me=S.user.id,mine=m=>(m.to||[]).includes(me)&&m.from!==me&&!(m.heard||{})[me];
  snap.docChanges().forEach(c=>{if(c.type!=='added')return;const m={id:c.doc.id,...c.doc.data()};
    if(m.at<=_vcSince-5000)return;
    if(mine(m))_vcArrive(m);else if(_vcMgr()&&_vcMon&&m.from!==me&&!(m.to||[]).includes(me))_vcArrive(m);});
  // פתיחה מהתראת Push: הודעות מ-15 הדקות האחרונות שלא נשמעו מוצעות מיד (מהישנה לחדשה) —
  // אחרת הן רק חיכו עם נקודה כחולה. פעם אחת לכל כניסה, רק מהשרת (לא מה-cache)
  if(!_vcBoot&&!snap.metadata.fromCache){_vcBoot=true;
    _vcIn.filter(m=>m.at>Date.now()-15*60e3&&m.at<=_vcSince-5000&&mine(m)).reverse().forEach(_vcArrive);}
}
function listenVoice(){
  if(!S.fbConnected||!db||!S.user)return;
  const{collection,query,where}=window._fb;
  _vcSince=Date.now();_vcIn=[];_vcOut=[];_vcOther=[];_vcBoot=false;
  if(_vcMgr()){
    // מנהל: מאזין אחד לכל השיחות של 3 הימים האחרונים ⇒ מתחלק ל"התקבלו" / "נשלחו" / "בין אחרים"
    _live('voiceAll',()=>query(collection(db,'voiceMsgs'),where('at','>=',Math.floor((Date.now()-3*864e5)/36e5)*36e5)),snap=>{
      if(!S.user||_metaSkip('voiceAll',snap))return; // עדכון שהגיע אחרי יציאה
      const all=_vcSort(snap.docs),me=S.user.id;
      _vcIn=all.filter(m=>(m.to||[]).includes(me));_vcOut=all.filter(m=>m.from===me);
      _vcOther=all.filter(m=>m.from!==me&&!(m.to||[]).includes(me));
      _vcOnSnap(snap);_vcFab();_vcRender();
    },{includeMetadataChanges:true}); // 💾 _vcOnSnap מחכה לנתוני שרת (_vcBoot) — ראה _metaSkip
  }else{
    _live('voiceIn',()=>query(collection(db,'voiceMsgs'),where('to','array-contains',S.user.id)),snap=>{
      if(!S.user||_metaSkip('voiceIn',snap))return;_vcIn=_vcSort(snap.docs);_vcOnSnap(snap);_vcFab();_vcRender();
    },{includeMetadataChanges:true});
    _live('voiceOut',()=>query(collection(db,'voiceMsgs'),where('from','==',S.user.id)),snap=>{if(!S.user)return;_vcOut=_vcSort(snap.docs);_vcRender();});
  }
  _vcFab();
}
function vcMonToggle(on){_vcMon=!!on;try{localStorage.setItem('vc_mon',on?'1':'0');}catch(e){}_vcRender();}
function _vcFab(){
  let b=document.getElementById('vc-fab');
  const show=S.user&&(_vcMgr()||_vcMode()==='open'||_vcIn.length);
  if(!show){if(b)b.style.display='none';return;}
  if(!b){b=document.createElement('button');b.id='vc-fab';b.onclick=openVoice;b.title='מכשיר קשר · جهاز اتصال';
    b.style.cssText='position:fixed;bottom:84px;left:16px;z-index:9001;width:54px;height:54px;border-radius:50%;border:none;background:var(--blue-txt);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    document.body.appendChild(b);}
  const n=_vcIn.filter(m=>!(m.heard||{})[S.user.id]).length;
  b.style.display='block';
  b.innerHTML='🎙'+(n?'<span style="position:absolute;top:-4px;right:-4px;background:#e11;color:#fff;border-radius:999px;font-size:11px;min-width:20px;height:20px;line-height:20px;font-weight:700">'+n+'</span>':'');
}
// הודעה חדשה: צפצוף קצר ⇒ ניגון. ניגון אוטומטי חסום (אייפון בלי לחיצה) ⇒ חלון עם ▶
function _vcArrive(m){
  try{navigator.vibrate&&navigator.vibrate([150,80,150]);}catch(e){}
  _vcQ.push(m);if(!_vcPlaying)_vcNext();
}
// 🔓 נגן אחד לכל ההודעות (06/11/2026): אייפון חוסם play() של כל נגן חדש שלא נוצר מלחיצה —
// ולכן כל הודעה נכנסת הקפיצה "▶ השמע". נגן שהופעל פעם אחת מלחיצה (צליל שקט בלחיצה הראשונה
// באפליקציה) נשאר "פתוח", וכל ההודעות הבאות מתנגנות דרכו לבד.
const _vcA=new Audio();let _vcUnl=false;
const _vcSilent=(()=>{let u=null;return()=>{if(u)return u;const n=800,b=new ArrayBuffer(44+n),v=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);
  for(let i=0;i<n;i++)v.setUint8(44+i,128);return u=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));};})();
function _vcUnlock(){
  if(_vcUnl||_vcPlaying)return;_vcUnl=true;
  try{_vcA.onended=_vcA.onerror=null;_vcA.src=_vcSilent();_vcA.play().then(()=>{if(_vcPlaying!==_vcA)_vcA.pause();document.removeEventListener('pointerdown',_vcUnlock,true);}).catch(()=>{_vcUnl=false;});}catch(e){_vcUnl=false;}
}
document.addEventListener('pointerdown',_vcUnlock,true);
function _vcNext(){
  const m=_vcQ.shift();if(!m){_vcPlaying=null;return;}
  if(_vcRec){_vcQ.unshift(m);setTimeout(_vcNext,1500);return;} // לא מנגנים באמצע הקלטה
  _vcMicOff(); // אייפון: השמעה בזמן שהמיקרופון פתוח "מרדימה" אותו ⇒ התשובה לא נקלטה עד שהשתחרר. סוגרים, ובהקלטה הבאה נפתח מחדש
  const a=_vcA;a.pause();a.src=m.aud;_vcPlaying=a;
  a.onended=a.onerror=()=>{_vcPlaying=null;setTimeout(_vcNext,300);};
  a.play().then(()=>{_vcHeard(m);showToast('🎙 '+(m.fromName||_vcName(m.from)),'var(--blue-txt)',2500);})
    .catch(()=>{_vcPlaying=null;_vcPopup(m);});
}
function _vcPopup(m){
  document.getElementById('vc-pop')?.remove();
  const d=document.createElement('div');d.id='vc-pop';
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML='<div style="background:var(--bg);border-radius:var(--rl);padding:22px;max-width:320px;width:100%;text-align:center">'
    +'<div style="font-size:40px">🎙</div><div style="font-size:14px;color:var(--txt2);margin:6px 0 16px">הודעה קולית מ'+esc(m.fromName||_vcName(m.from))+' · رسالة صوتية</div>'
    +'<button class="btn primary" style="width:100%;padding:12px;font-size:16px" onclick="document.getElementById(\'vc-pop\').remove();vcPlay(\''+escj(m.id)+'\')">▶ השמע · تشغيل</button>'
    +'<button class="btn" style="width:100%;margin-top:8px" onclick="document.getElementById(\'vc-pop\').remove();_vcNext()">אחר כך</button></div>';
  document.body.appendChild(d);playAlertSound();
}
function _vcHeard(m){
  if(!m||(m.heard||{})[S.user.id]||!(m.to||[]).includes(S.user.id))return;
  m.heard={...(m.heard||{}),[S.user.id]:Date.now()};
  const{doc,updateDoc}=window._fb;updateDoc(doc(db,'voiceMsgs',m.id),{['heard.'+S.user.id]:Date.now()}).catch(()=>{});
  _vcFab();
}
function vcPlay(id){
  const m=_vcIn.find(x=>x.id===id)||_vcOut.find(x=>x.id===id)||_vcOther.find(x=>x.id===id);if(!m)return;
  if(_vcPlaying){_vcPlaying.pause();_vcPlaying=null;}
  _vcMicOff();const a=_vcA;a.pause();a.src=m.aud;_vcPlaying=a;_vcUnl=true;a.onended=a.onerror=()=>{_vcPlaying=null;_vcRender();setTimeout(_vcNext,300);};
  a.play().then(()=>{_vcHeard(m);_vcRender();}).catch(e=>{_vcPlaying=null;showToast('⚠ לא ניתן לנגן: '+e.message,'var(--red-txt)');});
}
// נמענים לבחירה: מנהל — נוכחים עכשיו / כולם / מחלקה / עובד; אחר "פתוח" — רק מי שברשימה שלו (voiceTo),
// בלי רשימה — מנהלים ואחראים (ההתנהגות הקודמת)
const _vcList=()=>{const L=_vcMeW().voiceTo||[];return S.workers.filter(w=>L.includes(w.id)&&w.id!==S.user.id&&!w.disabled);};
function _vcTargets(){
  const me=S.user.id,act=S.workers.filter(w=>w.id!==me&&!w.disabled);
  if(!_vcMgr()){const L=_vcList(),nm=w=>(w.role==='manager'?'👑 ':'')+w.name+(w.status==='in'?' 🟢':'');
    if(!(_vcMeW().voiceTo||[]).length)return act.filter(w=>w.role==='manager'||w.role==='supervisor').map(w=>['w:'+w.id,nm(w)]);
    return[...(L.length>1?[['list','👥 כל הרשימה שלי · كل قائمتي ('+L.length+')']]:[]),...L.map(w=>['w:'+w.id,nm(w)])];}
  const deps=[...new Set(act.map(w=>w.dept).filter(Boolean))];
  return[['in','🟢 כל הנוכחים עכשיו · الحاضرون'],['all','👥 כולם · الجميع'],...deps.map(d=>['d:'+d,'🏭 '+d]),...act.map(w=>['w:'+w.id,w.name+(w.status==='in'?' 🟢':'')])];
}
function _vcResolve(k){
  const me=S.user.id,act=S.workers.filter(w=>w.id!==me&&!w.disabled);
  if(k==='list')return _vcList().map(w=>w.id);
  if(k==='in')return act.filter(w=>w.status==='in').map(w=>w.id);
  if(k==='all')return act.map(w=>w.id);
  if(k.startsWith('d:'))return act.filter(w=>w.dept===k.slice(2)).map(w=>w.id);
  if(k.startsWith('w:'))return[k.slice(2)];
  return[];
}
function openVoice(){
  document.getElementById('vc-modal')?.remove();
  const w=document.createElement('div');w.id='vc-modal';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:flex-end;justify-content:center';
  w.onclick=e=>{if(e.target===w)closeVoice();};
  document.body.appendChild(w);_vcRender();
}
function closeVoice(){
  if(_vcRec)vcUp(true);
  document.getElementById('vc-modal')?.remove();
  _vcMicOff();
}
// 🎙 שחרור המיקרופון (הנקודה הכתומה באייפון): 30 שנ' אחרי ההקלטה האחרונה, ביציאה מהאפליקציה/נעילה,
// ובסגירת החלון. בינתיים נשאר פתוח — כדי שהקלטה ברצף לא תשאל כל פעם "לאפשר מיקרופון?"
let _vcIdleT=null;
function _vcMicOff(){clearTimeout(_vcIdleT);_vcIdleT=null;if(_vcRec)return;
  if(_vcStream){_vcStream.getTracks().forEach(t=>t.stop());_vcStream=null;}}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(_vcRec)vcUp(true);_vcMicOff();}});
const _vcT=at=>{const d=new Date(at),t=pad2(d.getHours())+':'+pad2(d.getMinutes());return d.toDateString()===new Date().toDateString()?t:d.getDate()+'/'+(d.getMonth()+1)+' '+t;};
// כפתור "לחץ ודבר": מחזיקים — מקליט, משחררים — נשלח. talk = 'new' או מזהה ההודעה שמשיבים לה
const _vcTalk=(talk,lbl,big)=>'<button class="btn '+(big?'primary':'')+'" style="'+(big?'width:100%;padding:16px;font-size:17px;':'padding:6px 10px;font-size:13px;')+'touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none" oncontextmenu="return false" onpointerdown="vcDown(event,\''+escj(talk)+'\')">'+lbl+'</button>';
function _vcRender(){
  const w=document.getElementById('vc-modal');if(!w||!S.user)return;
  const me=S.user.id,mode=_vcMode(),canNew=_vcMgr()||mode==='open',tg=canNew?_vcTargets():[];
  if(canNew&&!tg.some(t=>t[0]===_vcTarget))_vcTarget=tg[0]?.[0]||'';
  const row=(m,out)=>{const h=Object.keys(m.heard||{}),unh=!out&&!(m.heard||{})[me];
    return'<div style="display:flex;gap:8px;align-items:center;padding:8px 4px;border-bottom:0.5px solid var(--b)">'
      +'<button class="btn" style="font-size:16px;padding:6px 12px" onclick="vcPlay(\''+escj(m.id)+'\')">▶</button>'
      +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:'+(unh?800:500)+';color:var(--txt)">'+(unh?'🔵 ':'')+(out?'⬅ <bdi>'+esc(m.toLbl||(m.to||[]).map(_vcName).join(', '))+'</bdi>':'<bdi>'+esc(m.fromName||_vcName(m.from))+'</bdi>')+(m.replyTo?' <span style="color:var(--txt3);font-weight:400">↩</span>':'')+'</div>'
      +'<div style="font-size:11px;color:var(--txt3)">'+_vcT(m.at)+' · '+Math.max(1,Math.round((m.dur||0)/1000))+' שנ\''
      +(out?' · <span title="'+esc(h.map(_vcName).join(', '))+'">שמעו '+h.length+'/'+(m.to||[]).length+'</span>':'')+'</div></div>'
      +(!out&&_vcCanReply()?_vcTalk(m.id,'↩ החזק להשיב',false):'')+'</div>';};
  const rec='<div id="vc-rec" style="text-align:center;color:#e11;font-weight:700;margin:8px 0">'+_vcRecTxt()+'</div>';
  w.innerHTML='<div style="background:var(--bg);border-radius:16px 16px 0 0;padding:16px;width:100%;max-width:520px;max-height:85vh;overflow:auto;box-shadow:0 -4px 24px rgba(0,0,0,.3)">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="font-size:17px;font-weight:800;flex:1">🎙 מכשיר קשר · جهاز اتصال</div><button class="btn" onclick="closeVoice()">✕</button></div>'
    +(canNew?'<select id="vc-target" onchange="_vcTarget=this.value" style="width:100%;margin-bottom:8px;font-size:14px">'+tg.map(([k,l])=>'<option value="'+esc(k)+'"'+(k===_vcTarget?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'
      +_vcTalk('new','🎙 החזק ודבר · اضغط وتكلم',true)
      :'<div style="font-size:12px;color:var(--txt3);margin-bottom:8px">'+(mode==='off'?'האזנה בלבד · استماع فقط':'אפשר להשיב להודעה שקיבלת · يمكنك الرد على رسالة وصلتك')+'</div>')
    +rec
    +'<div style="font-size:13px;font-weight:700;margin:14px 0 4px">📥 התקבלו · الواردة</div>'
    +(_vcIn.length?_vcIn.map(m=>row(m,false)).join(''):'<div style="font-size:12px;color:var(--txt3)">אין הודעות ב-3 הימים האחרונים</div>')
    +(_vcOut.length?'<div style="font-size:13px;font-weight:700;margin:14px 0 4px">📤 נשלחו · المرسلة</div>'+_vcOut.slice(0,30).map(m=>row(m,true)).join(''):'')
    // 👂 מנהל: כל השיחות בין אחרים (שולח ⬅ נמענים), עם אפשרות האזנה חיה
    +(_vcMgr()?'<div style="display:flex;align-items:center;gap:8px;margin:14px 0 4px"><div style="font-size:13px;font-weight:700;flex:1">👂 שיחות בין אחרים · محادثات الآخرين</div>'
      +'<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" style="width:auto" '+(_vcMon?'checked':'')+' onchange="vcMonToggle(this.checked)"> 🔊 השמע אוטומטית</label></div>'
      +(_vcOther.length?_vcOther.slice(0,40).map(m=>{const h=Object.keys(m.heard||{});
        return'<div style="display:flex;gap:8px;align-items:center;padding:8px 4px;border-bottom:0.5px solid var(--b)">'
          +'<button class="btn" style="font-size:16px;padding:6px 12px" onclick="vcPlay(\''+escj(m.id)+'\')">▶</button>'
          +'<div style="flex:1;min-width:0"><div dir="rtl" style="font-size:13px;color:var(--txt)"><bdi>'+esc(m.fromName||_vcName(m.from))+'</bdi> ⬅ <bdi>'+esc(m.toLbl||(m.to||[]).map(_vcName).join(', '))+'</bdi>'+(m.replyTo?' <span style="color:var(--txt3)">↩</span>':'')+'</div>'
          +'<div style="font-size:11px;color:var(--txt3)">'+_vcT(m.at)+' · '+Math.max(1,Math.round((m.dur||0)/1000))+' שנ\' · <span title="'+esc(h.map(_vcName).join(', '))+'">שמעו '+h.length+'/'+(m.to||[]).length+'</span></div></div></div>';}).join('')
        :'<div style="font-size:12px;color:var(--txt3)">אין שיחות ב-3 הימים האחרונים</div>'):'')
    +'</div>';
}
const _vcRecTxt=()=>_vcRec?'🔴 מקליט… '+Math.round((Date.now()-_vcRec.t0)/1000)+' שנ\' — '+(_vcRec.toggle?'לחץ שוב על הכפתור לשליחה · اضغط مرة أخرى للإرسال':'שחרר לשליחה · أفلت للإرسال'):'';
// בזמן הקלטה מעדכנים רק את השורה הזאת — ציור מחדש של כל החלון היה מחליף את הכפתור שמתחת לאצבע
function _vcTick(){const e=document.getElementById('vc-rec');if(e)e.textContent=_vcRecTxt();}
let _vcBusy=false;
function _vcMime(){
  if(typeof MediaRecorder==='undefined')return null;
  // mp4/AAC קודם — מתנגן גם באייפון וגם באנדרואיד; webm רק אם אין ברירה
  return['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
}
async function vcDown(ev,talk){
  ev.preventDefault();if(_vcRec){if(_vcRec.toggle)vcUp();return;}if(_vcBusy)return;clearTimeout(_vcIdleT);
  const mime=_vcMime();if(mime===null){alert('המכשיר לא תומך בהקלטה · الجهاز لا يدعم التسجيل');return;}
  let to,lbl,replyTo='';
  if(talk==='new'){to=_vcResolve(_vcTarget);lbl=(_vcTargets().find(t=>t[0]===_vcTarget)||[])[1]||'';}
  else{const m=_vcIn.find(x=>x.id===talk);if(!m)return;to=[m.from];lbl=m.fromName||_vcName(m.from);replyTo=m.id;}
  if(!to.length){showToast('⚠ אין נמענים · لا يوجد مستلمون','var(--red-txt)');return;}
  let up=false;const early=()=>{up=true;};addEventListener('pointerup',early,{once:true});_vcBusy=true;
  // מיקרופון "פתוח" שהמערכת השתיקה/סגרה (השמעה, שיחת טלפון) — לא מקליטים שקט: פותחים מחדש
  if(_vcStream&&!_vcStream.getAudioTracks().every(t=>t.readyState==='live'&&!t.muted&&t.enabled)){_vcStream.getTracks().forEach(t=>t.stop());_vcStream=null;}
  try{if(!_vcStream||!_vcStream.active)_vcStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e){_vcBusy=false;removeEventListener('pointerup',early);alert('אין הרשאה למיקרופון · لا يوجد إذن للميكروفون');return;}
  _vcBusy=false;removeEventListener('pointerup',early);
  // שחררו לפני שהמיקרופון עלה (חלון ההרשאה, או אייפון שמפעיל מיקרופון שוחרר — לוקח רגע):
  // לא מאבדים את הלחיצה — מתחילים להקליט במצב "לחיצה": לחיצה נוספת על הכפתור = שליחה (06/11/2026)
  if(_vcPlaying){_vcPlaying.pause();_vcPlaying=null;}
  const mr=new MediaRecorder(_vcStream,mime?{mimeType:mime,audioBitsPerSecond:32000}:{audioBitsPerSecond:32000}),chunks=[];
  mr.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  const r={mr,chunks,t0:Date.now(),to,lbl,replyTo,cancel:false,toggle:up,tick:setInterval(_vcTick,500),lim:setTimeout(()=>vcUp(),_vcMax)};_vcRec=r;
  mr.onstop=()=>_vcSend(r);
  mr.start();try{navigator.vibrate&&navigator.vibrate(40);}catch(e){}
  if(!up){addEventListener('pointerup',()=>{if(_vcRec===r)vcUp();},{once:true});addEventListener('pointercancel',()=>{if(_vcRec===r)vcUp(true);},{once:true});}
  _vcRender();
}
function vcUp(cancel){
  const r=_vcRec;if(!r)return;_vcRec=null;
  clearInterval(r.tick);clearTimeout(r.lim);r.dur=Date.now()-r.t0;
  if(cancel||r.dur<700){r.cancel=true;if(!cancel)showToast('החזק את הכפתור בזמן הדיבור · اضغط مطولاً أثناء الكلام','var(--amber-txt)',2500);}
  try{r.mr.stop();}catch(e){}
  clearTimeout(_vcIdleT);_vcIdleT=setTimeout(_vcMicOff,30000);
  _vcRender();
}
async function _vcSend(r){
  if(!r||r.cancel||!r.chunks.length){setTimeout(_vcNext,300);return;}
  const blob=new Blob(r.chunks,{type:r.mr.mimeType||r.chunks[0].type||'audio/mp4'});
  const aud=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>res('');fr.readAsDataURL(blob);});
  if(!aud||aud.length>880000){showToast('⚠ ההקלטה ארוכה מדי · التسجيل طويل جداً','var(--red-txt)');return;}
  const{collection,addDoc}=window._fb;
  const d={from:S.user.id,fromName:S.user.name||'',to:r.to,toLbl:r.lbl,aud,mime:blob.type,dur:r.dur,at:Date.now(),heard:{}};
  if(r.replyTo)d.replyTo=r.replyTo;
  try{await addDoc(collection(db,'voiceMsgs'),d);showToast('✅ נשלח ל'+r.lbl+' · تم الإرسال','var(--green-txt)',2000);}
  catch(e){showToast('❌ לא נשלח'+(String(e.code||'').includes('permission')?' — אין הרשאה · لا يوجد إذن':': '+e.message),'var(--red-txt)',5000);}
  setTimeout(_vcNext,300);
}
function mgrBulkToggle(){
  window._mgrBulkMode=!window._mgrBulkMode;
  const bar=document.getElementById('mgr-bulk-bar');
  if(bar)bar.style.display=window._mgrBulkMode?'flex':'none';
  if(window._mgrBulkMode){
    const now=roundAttTime(srvNow(),true); // ⏱ השעה המוצעת כבר מעוגלת (06:32 ⇒ 06:30)
    const ti=document.getElementById('mgr-bulk-time');
    if(ti)ti.value=pad2(now.getHours())+':'+pad2(now.getMinutes());
  }
  renderMgrTasks();
  mgrBulkCount();
}
function mgrBulkCancel(){
  window._mgrBulkMode=false;
  const bar=document.getElementById('mgr-bulk-bar');
  if(bar)bar.style.display='none';
  renderMgrTasks();
}
function mgrBulkCount(){
  const cnt=S.workers.filter(w=>{const c=document.getElementById('bchk-'+w.id);return c&&c.checked;}).length;
  const el=document.getElementById('mgr-bulk-count');
  if(el)el.textContent=cnt?cnt+' עובדים נבחרו':'';
}
async function mgrBulkPunchIn(){
  const timeVal=document.getElementById('mgr-bulk-time')?.value;
  if(!timeVal){alert('בחר שעת כניסה');return;}
  const [hh,mm]=timeVal.split(':').map(Number);
  const selected=S.workers.filter(w=>{
    const chk=document.getElementById('bchk-'+w.id);
    return chk&&chk.checked&&w.status!=='in';
  });
  if(!selected.length){alert('לא נבחרו עובדים');return;}
  const today=todayStr();
  let bulkResumed=0;
  await waitForActiveTasks(); // פעם אחת לכולם — בלולאה מעבירים 0 כדי לא להכפיל את ההמתנה
  for(const w of selected){
    if(!w.sessions)w.sessions=[];
    // ⏱ גם כניסה קבוצתית עוברת עיגול — עד 04/10/2026 היא דילגה עליו, וכל הקבוצה נרשמה 06:32
    const dt=roundAttTime(new Date(today+'T'+pad2(hh)+':'+pad2(mm)+':00'),true);
    w.sessions.push({in:dt.toISOString(),out:null});
    w.status='in';w.checkin=w.sessions[0].in;
    if(S.fbConnected)await fbSet('workers',w.id,attFields(w));
    bulkResumed+=await resumeWorkerTasksOnPunchIn(w.id,dt,0);
  }
  if(bulkResumed)showToast('▶ '+bulkResumed+' '+(LANGS[currentLang].tasks_resumed_msg||'משימות חודשו אוטומטית'),'var(--green-txt)',5000);
  saveLS();
  mgrBulkCancel();
  renderMgrTasks();renderAtt();
}
async function mgrPunchIn(wId){
  const w=S.workers.find(x=>x.id===wId);if(!w)return;
  if(!w.sessions)w.sessions=[];
  if(w.sessions.find(s=>!s.out)){alert(w.name+' כבר רשום/ת כנוכח/ת');return;}
  const now=roundAttTime(srvNow(),true);
  w.sessions.push({in:now.toISOString(),out:null});
  w.status='in';w.checkin=w.sessions[0].in;
  if(S.fbConnected)await fbSet('workers',w.id,attFields(w));
  tgPunch(w.name,w.dept,true,now,w.id);
  const mgrResumed=await resumeWorkerTasksOnPunchIn(w.id,now);
  if(mgrResumed)showToast('▶ '+mgrResumed+' '+(LANGS[currentLang].tasks_resumed_msg||'משימות חודשו אוטומטית'),'var(--green-txt)',5000);
  saveLS();renderMgrTasks();renderAtt();
}
async function mgrPunchOut(wId){
  const w=S.workers.find(x=>x.id===wId);if(!w)return;
  if(!w.sessions)w.sessions=[];
  const openIdx=w.sessions.findIndex(s=>!s.out);
  if(openIdx===-1){alert(w.name+' כבר רשום/ת כיצא/ה');return;}
  const now=roundAttTime(srvNow(),false);
  w.sessions[openIdx].out=now.toISOString();
  w.status='out';w.checkout=now.toISOString();
  await pauseWorkerTasks(w.id,now);
  await closeWorkerStation(w,now); // חתימת יציאה סוגרת את שיוך התחנה
  const netMs=calcNetWork(w);
  const rec={workerId:w.id,workerName:w.name,dept:w.dept,date:todayStr(),sessions:w.sessions,checkin:w.sessions[0]?.in||'',checkout:now.toISOString(),breakStart:w.breakStart||'',breakEnd:w.breakEnd||'',breakActive:!!w.breakActive,netMs};
  S.attHistory.unshift(rec);
  if(S.fbConnected){await fbSet('workers',w.id,attFields(w));await fbSet('attHistory',w.id+'_'+todayStr(),rec);try{await fbDel('workerWifi',w.id);}catch(e){}}
  tgPunch(w.name,w.dept,false,now,w.id);
  saveLS();renderMgrTasks();renderAtt();
}
function mgrAddToBatch(){
  const empId=document.getElementById('mgr-emp-sel').value;
  const raw=(document.getElementById('mgr-bc-inp').value||'').replace(/\D/g,'');
  const T=LANGS[currentLang];
  if(!empId){showToast(T.err_sel_worker||'⚠ בחר עובד','var(--red-txt)');return;}
  if(!isBcLen(raw.length)){showToast(T.err_barcode_13||'⚠ ברקוד חייב להיות 13 או 16 ספרות','var(--red-txt)');return;}
  if(!bcSignGate('mgr',raw))return;
  if(isShipBc(raw)){openShipModal(raw.slice(0,2),raw.slice(2,7),orderNoOf(raw));document.getElementById('mgr-bc-inp').value='';parseMgrBc('');return;} // ברקוד "יצא ללקוח"
  if(isSampleScan(raw)){ // 👕 דגם ראשון — לסל כמשימת דגם, כמו ב-tsAddToBatch
    const dup=sampleDupFor(empId,raw,_mgrBatch);
    document.getElementById('mgr-bc-inp').value='';parseMgrBc('');
    if(dup){showToast(SAMPLE_STEP+' — '+dup,'var(--red-txt)',6000);return;}
    _mgrBatch.push(sampleBase(raw,(document.getElementById('mgr-dept')?.value||'').trim()));
    renderMgrBatchQueue();showToast(T.scan_added_cart);
    return;
  }
  const cust=raw.slice(0,2),prod=raw.slice(2,7),size=raw.slice(7,8),col=raw.slice(11,13);
  const isTotal=isTotalBc(raw);const qty=isTotal?getTotalQty(cust,prod,orderNoOf(raw)):parseInt(raw.slice(8,11))||0;
  const mgrStepsWrap=document.getElementById('mgr-steps-wrap');const mgrUseSteps=mgrStepsWrap&&mgrStepsWrap.style.display!=='none';
  const mgrCheckedSteps=mgrUseSteps?[...document.querySelectorAll('#mgr-steps-list input[type="checkbox"]:checked')].map(cb=>cb.dataset.step):[];
  if(mgrUseSteps&&!mgrCheckedSteps.length){showToast(T.err_sel_step||'⚠ בחר לפחות שלב עבודה אחד','var(--red-txt)');return;}
  const taskType=mgrUseSteps?'':((document.getElementById('mgr-tasktype').value||'').trim());
  const taskDept=(document.getElementById('mgr-dept').value||'').trim();
  const types=mgrUseSteps?mgrCheckedSteps:[taskType||''];
  const _sk=addStepsToBatch(_mgrBatch,{raw,cust,prod,size,qty,col,isTotal,taskDept,want:_partWant('mgr')},types);
  document.getElementById('mgr-bc-inp').value='';parseMgrBc('');
  document.getElementById('mgr-tasktype').value='';document.getElementById('mgr-dept').value='';
  renderMgrBatchQueue();
  if(_sk.length)showToast(T.scan_not_added+' '+_sk.join(' · '),'var(--red-txt)',7000);
  else showToast(T.scan_added_cart);
}
async function mgrStartTask(){
  const empId=document.getElementById('mgr-emp-sel').value;
  const raw=(document.getElementById('mgr-bc-inp').value||'').replace(/\D/g,'');
  const T=LANGS[currentLang];
  if(await checkVersion()){showToast('🔄 יש גרסה חדשה — לחץ "עדכן עכשיו" למעלה ונסה שוב','var(--red-txt)',6000);return;}
  if(!empId){showToast(T.err_sel_worker||'⚠ בחר עובד','var(--red-txt)');return;}
  const w=S.workers.find(x=>x.id===empId);
  if(!w||w.status!=='in'){showToast(T.cfm_worker_not_in||'⚠ העובד לא נמצא בעבודה','var(--red-txt)',5000);return;}
  if(isBcLen(raw.length)&&!bcSignGate('mgr',raw))return; // 🔐
  if(isBcLen(raw.length)&&isSampleScan(raw)){
    // 👕 דגם ראשון — בלי שלבים ובלי שערי תחנה/סדר
    const dup=sampleDupFor(empId,raw,_mgrBatch);
    if(dup){showToast(SAMPLE_STEP+' — '+dup,'var(--red-txt)',6000);if(!_mgrBatch.length)return;}
    else _mgrBatch.push(sampleBase(raw,(document.getElementById('mgr-dept')?.value||'').trim()));
  }else if(isBcLen(raw.length)){
    if(!isTotalBc(raw)&&parseInt(raw.slice(8,11))===0&&productHasDefinedQty(raw.slice(0,2),raw.slice(2,7))){showToast('⚠ קיים ברקוד עם כמות למוצר זה','var(--red-txt)',6000);return;}
    const cust=raw.slice(0,2),prod=raw.slice(2,7),size=raw.slice(7,8),col=raw.slice(11,13);
    const isTotal=isTotalBc(raw);const qty=isTotal?getTotalQty(cust,prod,orderNoOf(raw)):parseInt(raw.slice(8,11))||0;
    const mgrStepsWrap=document.getElementById('mgr-steps-wrap');const mgrUseSteps=mgrStepsWrap&&mgrStepsWrap.style.display!=='none';
    const mgrCheckedSteps=mgrUseSteps?[...document.querySelectorAll('#mgr-steps-list input[type="checkbox"]:checked')].map(cb=>cb.dataset.step):[];
    if(mgrUseSteps&&!mgrCheckedSteps.length){showToast(T.err_sel_step||'⚠ בחר לפחות שלב עבודה אחד','var(--red-txt)');return;}
    // 🔒 שער התחנה (w = העובד שהמשימה נפתחת עבורו; העקיפה נקבעת לפי מי שמפעיל את הסורק)
    if(!await passRetiredGate([raw],true))return; // 🔒 ברקוד שסיים את תפקידו
    if(!await passStationGate(w,cust,prod,mgrUseSteps?mgrCheckedSteps:[],raw))return;
    // 🔗 שער סדר השלבים — נבדק על הברקוד שנסרק, לפני ההוספה לסל
    if(!await passMergeGate(cust,prod,raw,mgrUseSteps?mgrCheckedSteps:[(document.getElementById('mgr-tasktype').value||'').trim()],w.id))return;
    const taskType=mgrUseSteps?'':((document.getElementById('mgr-tasktype').value||'').trim());
    const taskDept=(document.getElementById('mgr-dept').value||'').trim();
    const types=mgrUseSteps?mgrCheckedSteps:[taskType||''];
    const _sk=addStepsToBatch(_mgrBatch,{raw,cust,prod,size,qty,col,isTotal,taskDept,want:_partWant('mgr')},types);
    if(_sk.length){showToast(T.scan_not_added+' '+_sk.join(' · '),'var(--red-txt)',7000);if(!_mgrBatch.length)return;}
  }
  if(!_mgrBatch.length){showToast(T.err_scan_one||'⚠ סרוק לפחות ברקוד אחד','var(--red-txt)');return;}
  // 🔒 בדיקה חוזרת על כל הסל — ראה ההסבר המלא ב-tsStartTask
  if(!await passBatchGates(w,_mgrBatch))return;
  // עם השלב, כדי להפריד בין כמה מושהות על אותו ברקוד
  const newBcs=_mgrBatch.map(b=>({raw:b.raw,taskType:b.taskType||''}));
  const canProceed=await handlePausedTasks(w.id,newBcs);
  if(!canProceed){_mgrBatch=[];renderMgrBatchQueue();saveLS();return;}
  // ⚠️ קודם יוצרים, ורק אז סוגרים — ראה ההסבר המלא ב-tsStartTask. סגירה מוקדמת + יציאה
  // מהלולאה (רענון/כפילות בשרת/claimTaskGuard) = העובדת בלי משימה פתוחה והזמן נמחק.
  const activeCurrent=S.activeTasks.filter(t=>t.workerId===empId&&!t.paused);
  const swapMode=await askSwapMode(w,activeCurrent); // ⏸ זמנית / ✅ חדשה — כוונה בלבד
  const swapTime=srvNow(); // רגע אחד לסגירה ולפתיחה — בלי חפיפה ביניהן
  const batchId=_mgrBatch.length>1?genBatchId():null;
  const startTime=swapTime;
  const mgrDupSkip=[];let mgrCreated=0;
  const mgrSrvActive=await serverActiveTasks(empId); // קריאה אחת לכל הסל, לא לכל פריט
  for(const b of _mgrBatch){
    // המסלול הזה סוגר קודם את המשימות הפעילות שב-cache המקומי — אבל משימה שנפתחה
    // ממכשיר אחר לא נמצאת שם כלל, ולכן לא נסגרה ולא נחסמה. כאן היא נתפסת.
    if(findDupIn(mgrSrvActive,b.raw,b.taskType)){mgrDupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
    const newTask={id:String(Date.now())+Math.random().toString(36).slice(2,6),workerId:empId,workerName:w.name,scannedBy:S.user?.id||'',scannedByName:S.user?.name||'',dept:b.taskDept||effDept(w),station:curStation(w)?.name||'',cust:b.cust,prod:b.prod,size:b.size,qty:b.qty,col:b.col,taskType:b.taskType,bc:b.raw,isTotal:b.isTotal||false,startTime,elapsed:0,accumulatedSec:0,prodStamp:b.prodStamp,...(b.splitId?{splitId:b.splitId}:{})};
    const expM=b.isSample?null:await fetchExpected(b.cust,b.prod,empId,b.qty||_estQtyBc(b.raw)); // 👕 דגם — אין צפי · 📏 אין כמות ⇒ המשוערת
    if(expM?.ok&&expM.perStep?.[b.taskType]!=null)newTask.expectedMin=expM.perStep[b.taskType];
    if(b.isSample)newTask.isSample=true;
    if(batchId)newTask.batchId=batchId;
    if(!(await claimTaskGuard(newTask)).ok){mgrDupSkip.push((b.taskType||b.prod)+' — '+(T.scan_dup_active||'פעיל כעת'));continue;}
    S.activeTasks.unshift(newTask);mgrCreated++;
    if(S.fbConnected)await fbSet('activeTasks',newTask.id,{...newTask,startTime:newTask.startTime.toISOString()});
    tgTask(newTask,true);
    if(!b.isSample)await autoStampStage(b.cust,b.prod,b.taskDept||effDept(w)); // עדכון אוטומטי של שלב הייצור
  }
  // טיפול במשימות הקודמות — רק עכשיו, כשידוע שיש משימה חדשה שתחליף אותן
  if(mgrCreated>0&&activeCurrent.length>0)await applySwapMode(swapMode,empId,activeCurrent,swapTime);
  if(mgrDupSkip.length)showToast((T.scan_not_added||'לא נוסף')+' '+mgrDupSkip.join(' · '),'var(--red-txt)',7000);
  if(mgrCreated>0)showToast('✅ '+mgrCreated+' משימות התחילו עבור '+w.name);
  else if(activeCurrent.length)showToast('⚠ לא נפתחה משימה חדשה — המשימה הקודמת נשארה פעילה','var(--amber-txt)',7000);
  _mgrBatch=[];renderMgrBatchQueue();
  document.getElementById('mgr-bc-inp').value='';parseMgrBc('');
  document.getElementById('mgr-tasktype').value='';document.getElementById('mgr-dept').value='';
  saveLS();renderMgrTasks();
}
async function deleteActiveTask(taskId){
  const t=S.activeTasks.find(x=>x.id===taskId);if(!t)return;
  if(!confirm(`למחוק את המשימה של ${t.workerName}?\nהמשימה תימחק לחלוטין ולא תישמר בהיסטוריה.`))return;
  S.activeTasks=S.activeTasks.filter(x=>x.id!==taskId);
  // עדכן סטטוס העובד
  const w=S.workers.find(x=>x.id===t.workerId);
  if(w&&w.activeTaskId===taskId){w.activeTaskId=null;}
  if(S.fbConnected)await fbDel('activeTasks',String(taskId));
  saveLS();renderTasks();renderMgrTasks();renderDash();
}
async function transferTask(taskId){
  const T=LANGS[currentLang];
  const t=S.activeTasks.find(x=>x.id===taskId);if(!t)return;
  const eligible=S.workers.filter(w=>w.status==='in'&&w.id!==t.workerId);
  if(!eligible.length){alert(T.tr_no_workers);return;}
  const opts=eligible.map(w=>`<option value="${esc(w.id)}">${esc(w.name)} (${esc(w.dept)})</option>`).join('');
  const totalQty=t.qty||0;
  const sel=`<select id="transfer-sel" style="width:100%;padding:8px;font-size:14px;border-radius:6px;border:1px solid #ccc;margin-top:8px">${opts}</select>
    <input id="transfer-qty" type="number" min="1" max="${Math.max(1,totalQty-1)}" placeholder="${esc(T.tr_qty_label)}" style="width:100%;padding:8px;font-size:14px;border-radius:6px;border:1px solid #ccc;margin-top:8px">
    <div style="font-size:11px;color:var(--txt3);margin-top:4px">${esc(T.tr_qty_hint)}</div>`;
  const ok=await showConfirm(T.tr_title,`${T.tr_of_worker} <b>${esc(t.workerName)}</b> — ${T.tr_product} ${esc(t.prod)} (${totalQty})<br>${sel}`,T.tr_btn,T.tr_cancel);
  if(!ok)return;
  const newWorkerId=document.getElementById('transfer-sel')?.value;
  const newWorker=S.workers.find(w=>w.id===newWorkerId);
  if(!newWorker){return;}
  const qtyRaw=(document.getElementById('transfer-qty')?.value||'').trim();
  let partQty=qtyRaw===''?0:parseInt(qtyRaw);
  if(qtyRaw!==''&&(isNaN(partQty)||partQty<1)){showToast(T.tr_invalid_qty,'var(--red-txt)');return;}
  if(partQty>=totalQty)partQty=0;  // כמות מלאה או יותר = העברה רגילה
  const tt=t.taskType||'';
  if(partQty>0){
    // ── פיצול כמות: משימה חדשה לעובד הנבחר, המקורי נשאר עם היתרה (שני עובדים במקביל = עוזר) ──
    const splitId='sp'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    // dept/station נלקחים מהעובד המקבל — בלי זה ה-spread משאיר את התחנה של העובד
    // הקודם על המשימה, והלוח מראה אותה יושבת במקום הלא נכון
    const newTask={...t,id:String(Date.now())+Math.random().toString(36).slice(2,6),workerId:newWorker.id,workerName:newWorker.name,scannedBy:S.user?.id||'',scannedByName:S.user?.name||'',dept:effDept(newWorker),station:curStation(newWorker)?.name||'',qty:partQty,startTime:srvNow(),elapsed:0,accumulatedSec:0,splitId};
    delete newTask.batchId;
    // לעובד היעד כבר יש משימה חיה על אותו ברקוד+שלב ⇒ הפיצול ייצור כפילות
    if(!(await claimTaskGuard(newTask)).ok){showToast((tt||t.prod)+' — '+(T.scan_dup_active||'פעיל כעת'),'var(--red-txt)');return;}
    const expN=await fetchExpected(t.cust,t.prod,newWorker.id,partQty);
    if(expN?.ok&&expN.perStep?.[tt]!=null)newTask.expectedMin=expN.perStep[tt];else delete newTask.expectedMin;
    t.qty=totalQty-partQty;
    const expO=await fetchExpected(t.cust,t.prod,t.workerId,t.qty);
    if(expO?.ok&&expO.perStep?.[tt]!=null)t.expectedMin=expO.perStep[tt];else delete t.expectedMin;
    S.activeTasks.unshift(newTask);
    if(S.fbConnected){
      await fbSet('activeTasks',newTask.id,{...newTask,startTime:newTask.startTime.toISOString()});
      await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime});
    }
    tgTask(newTask,true);
    saveLS();renderTasks();renderMgrTasks();
    showToast(`${T.tr_done_split} ${partQty} → ${newWorker.name}`);
    return;
  }
  // ── העברה מלאה (התנהגות קיימת) ──
  // תפיסת שומר על צמד עובד-היעד+ברקוד+שלב לפני שינוי הבעלות; השומר הישן של העובד
  // הקודם מתיישן מאליו (בדיקת workerId ב-claimTaskGuard)
  if(!(await claimTaskGuard({...t,workerId:newWorker.id})).ok){showToast((tt||t.prod)+' — '+(T.scan_dup_active||'פעיל כעת'),'var(--red-txt)');return;}
  t.workerId=newWorker.id;
  t.workerName=newWorker.name;
  t.dept=effDept(newWorker);
  t.station=curStation(newWorker)?.name||'';
  // חשב מחדש צפי לעובד החדש (שכר שונה); בכשל שרת — משאירים את הצפי הקיים כדי לא למחוק צפי תקין
  const expF=await fetchExpected(t.cust,t.prod,newWorker.id,t.qty);
  if(expF?.ok&&expF.perStep?.[tt]!=null)t.expectedMin=expF.perStep[tt];
  if(S.fbConnected)await fbUpdateOnly('activeTasks',String(t.id),{...t,startTime:t.startTime instanceof Date?t.startTime.toISOString():t.startTime});
  saveLS();renderTasks();renderMgrTasks();
  showToast(`${T.tr_done_all}${newWorker.name}`);
}
async function mgrEndTask(taskId){
  const t=S.activeTasks.find(x=>x.id===taskId);if(!t)return;
  const endTime=srvNow();
  // אם המשימה חלק מ-batch (עבדו במקביל) — סוגר את כל ה-batch יחד כדי שהזמן יתחלק נכון
  const group=t.batchId?S.activeTasks.filter(x=>x.batchId===t.batchId&&x.workerId===t.workerId):[t];
  await closeTasksBatchAware(group,endTime,'manual_end');
  tgTask(t,false,endTime);
  saveLS();renderMgrTasks();renderTasks();
}
async function mgrUpdateBreak(wId,field,val){
  const w=S.workers.find(x=>x.id===wId);if(!w)return;
  w[field]=val;
  if(S.fbConnected)await fbSet('workers',w.id,{[field]:val});
  saveLS();
}
// ☕ החלפת שעות ההפסקה לכל העובדים + ברירת המחדל לעובדים חדשים (appSettings/breakDefault).
// fbUpdateOnly — רק שני השדות, בלי לדרוס שדות אחרים במסמך העובד שהשתנו במכשיר אחר.
async function mgrBreakAll(){
  if(S.user?.role!=='manager')return;
  const s=document.getElementById('brk-all-s')?.value||'',e=document.getElementById('brk-all-e')?.value||'';
  if(!/^\d\d:\d\d$/.test(s)||!/^\d\d:\d\d$/.test(e)||s>=e){alert('שעת תחילת ההפסקה חייבת להיות לפני הסיום');return;}
  if(!S.fbConnected){alert('אין חיבור לשרת');return;}
  if(!await showConfirm('☕ הפסקה לכל העובדים','לקבוע הפסקה '+s+'–'+e+' לכל '+S.workers.length+' העובדים, וכברירת מחדל לעובדים חדשים?','החל','ביטול'))return;
  S.settings.breakDefault={start:s,end:e};
  try{await fbSetMerge('appSettings','breakDefault',{start:s,end:e});}catch(err){}
  let ok=0;
  for(const w of S.workers){
    if(await fbUpdateOnly('workers',w.id,{breakStart:s,breakEnd:e})){w.breakStart=s;w.breakEnd=e;ok++;}
  }
  _brkDraft={};saveLS();renderMgrTasks();
  showToast('☕ ההפסקה עודכנה ל-'+s+'–'+e+' אצל '+ok+' עובדים',ok===S.workers.length?'var(--green-txt)':'var(--amber-txt)',5000);
}
async function mgrToggleBreak(wId){
  const w=S.workers.find(x=>x.id===wId);if(!w)return;
  w.breakActive=!w.breakActive;
  if(S.fbConnected)await fbSet('workers',w.id,{breakActive:w.breakActive});
  saveLS();renderMgrTasks();
}

