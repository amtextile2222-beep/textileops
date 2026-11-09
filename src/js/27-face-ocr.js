// ─── FACE AUTH ───────────────────────────────────────────────
let _faceModelsLoaded=false;
let _faceAuthStream=null;
let _faceAuthLoop=null;
let _faceRegStream=null;
let _faceRegWorkerId=null;
let _faceRegSamples=[];
let _faceRegSnaps=[];
async function sendFaceRegPhotos(workerName,snaps){
  if(!snaps.length)return;
  const now=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  for(let i=0;i<snaps.length;i++){
    try{
      // snaps הם dataURL מ-canvas — החלק אחרי הפסיק הוא כבר base64
      const b64=String(snaps[i]).split(',')[1]||'';
      if(!b64)continue;
      await tgCall({kind:'photo',dataB64:b64,caption:i===0?'📸 רישום פנים — '+workerName+' | '+now+'\nדגימה '+(i+1)+'/'+snaps.length:'דגימה '+(i+1)+'/'+snaps.length});
    }catch(e){}
  }
}

// ⚡ (04/11/2026) ספריות כבדות (זיהוי פנים 650KB, יצירת/קריאת PDF ~670KB) נטענות רק כשצריך —
// קודם הן נטענו בכל פתיחה, וזיהוי הפנים בראש הדף חסם את ציור המסך כולו עד שירד
const _LIBS={faceapi:['https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js?v=20260617',()=>window.faceapi],jspdf:['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',()=>window.jspdf],pdfjs:['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',()=>window.pdfjsLib]},_libP={};
function _lib(k){const[u,ok]=_LIBS[k];if(ok())return Promise.resolve();
  return _libP[k]||(_libP[k]=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=u;
    sc.onload=()=>ok()?res():(_libP[k]=null,rej(new Error(k+' לא נטען')));sc.onerror=()=>{_libP[k]=null;sc.remove();rej(new Error(k+' לא נטען — בדוק חיבור ונסה שוב'));};document.head.appendChild(sc);}));}
async function loadFaceModels(){
  if(_faceModelsLoaded)return true;
  const base='https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  try{
    await _lib('faceapi');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(base),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
      faceapi.nets.faceRecognitionNet.loadFromUri(base)
    ]);
    _faceModelsLoaded=true;
    return true;
  }catch(e){return false;}
}

async function startFaceAuth(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('face-auth-screen').classList.remove('hidden');
  document.getElementById('face-auth-msg').textContent='מרכז את פניך במצלמה';
  document.getElementById('face-auth-status').textContent='טוען מודלי זיהוי...';
  const ok=await loadFaceModels();
  if(!ok){
    document.getElementById('face-auth-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('l-err').textContent='שגיאה בטעינת זיהוי פנים — היכנס עם סיסמה';
    return;
  }
  try{
    _faceAuthStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const video=document.getElementById('face-auth-video');
    video.srcObject=_faceAuthStream;
    await new Promise(r=>video.onloadedmetadata=r);
    document.getElementById('face-auth-status').textContent='מזהה פנים...';
    _runFaceAuthLoop();
  }catch(e){
    document.getElementById('face-auth-status').textContent='נא לאפשר גישה למצלמה';
  }
}

// מונה כשלונות פנים לפי משתמש — שורד סגירה/פתיחה של מסך הכניסה.
// (מונה מקומי בתוך הלולאה התאפס בכל פתיחה מחדש → עובד נכשל 9 פעמים בשרת בלי שנשלחה התראה למנהל)
let _faceFailPersist={};
async function _runFaceAuthLoop(){
  // שלב 2 אבטחה: ההשוואה מתבצעת בשרת — הלקוח שולח descriptor חי ומקבל טוקן רק אם יש התאמה
  const video=document.getElementById('face-auth-video');
  const opts=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:0.5});
  const _u=S._pendingUser?.user||'';
  let busy=false;
  // שער איכות: פריים מטושטש/רחוק שנשלח לשרת שורף ניסיון (face-mismatch) — אוספים 2 פריימים
  // טובים ברצף (ציון זיהוי + גודל פנים בפריים), ממצעים את ה-descriptors לניקוי רעש, ורק אז שולחים
  let goodFrames=[];
  const GOOD_NEEDED=2,MIN_SCORE=0.6,MIN_FACE_RATIO=0.22;
  _faceAuthLoop=setInterval(async()=>{
    if(busy||video.readyState<2||!S._pendingUser)return;
    busy=true;
    try{
      const det=await faceapi.detectSingleFace(video,opts).withFaceLandmarks(true).withFaceDescriptor();
      if(!det){goodFrames=[];document.getElementById('face-auth-status').textContent='לא זוהו פנים — קרב/י למצלמה';return;}
      const ratio=(det.detection?.box?.width||0)/(video.videoWidth||1);
      if((det.detection?.score||0)<MIN_SCORE||ratio<MIN_FACE_RATIO){
        goodFrames=[];
        document.getElementById('face-auth-status').textContent=ratio<MIN_FACE_RATIO?'קרב/י את הטלפון לפנים':'החזק/י יציב מול המצלמה';
        return;
      }
      goodFrames.push(Array.from(det.descriptor));
      if(goodFrames.length<GOOD_NEEDED){document.getElementById('face-auth-status').textContent='החזק/י יציב...';return;}
      const avg=goodFrames[0].map((_,i)=>goodFrames.reduce((s,f)=>s+f[i],0)/goodFrames.length);
      goodFrames=[];
      document.getElementById('face-auth-status').textContent='מאמת...';
      const devId=await getDeviceId();
      try{
        const res=await loginCall({user:S._pendingUser.user,faceDescriptor:avg,deviceId:devId||undefined});
        if(res&&res.token){
          delete _faceFailPersist[_u];
          await fbSignInWithToken(res.token);
          _stopFaceAuthUI();
          const w=res.worker;S._pendingUser=null;
          finishLogin(w,true);
        }
      }catch(e){
        const c=_loginErrCode(e);
        if(c==='face-mismatch'){
          _faceFailPersist[_u]=(_faceFailPersist[_u]||0)+1;
          const fc=_faceFailPersist[_u];
          document.getElementById('face-auth-status').textContent='לא זוהית — ניסיון '+Math.min(fc,3)+'/3';
          if(fc>=3){
            delete _faceFailPersist[_u];
            clearInterval(_faceAuthLoop);_faceAuthLoop=null;
            _onFaceAuthFailed();
          }
        }else if(c==='locked'){
          // השרת נעל אחרי כשלונות מצטברים — גם זה חייב להגיע למנהל עם תמונה
          delete _faceFailPersist[_u];
          clearInterval(_faceAuthLoop);_faceAuthLoop=null;
          _onFaceAuthFailed();
        }else{
          _stopFaceAuthUI();
          S._pendingUser=null;
          document.getElementById('login-screen').classList.remove('hidden');
          _loginShowErr(e,'call');
        }
      }
    }finally{busy=false;}
  },600);
}
function _stopFaceAuthUI(){
  clearInterval(_faceAuthLoop);_faceAuthLoop=null;
  if(_faceAuthStream){_faceAuthStream.getTracks().forEach(t=>t.stop());_faceAuthStream=null;}
  document.getElementById('face-auth-screen').classList.add('hidden');
}

async function _onFaceAuthFailed(){
  // צלם תמונה לפני שסוגרים את המצלמה
  let photoB64='';
  try{
    const video=document.getElementById('face-auth-video');
    const c=document.createElement('canvas');
    c.width=video.videoWidth||320;c.height=video.videoHeight||240;
    c.getContext('2d').drawImage(video,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.8));
    if(blob)photoB64=await blobToB64(blob);
  }catch(e){}
  if(_faceAuthStream){_faceAuthStream.getTracks().forEach(t=>t.stop());_faceAuthStream=null;}
  document.getElementById('face-auth-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  const failedWorker=S._pendingUser;
  // אם יש אישור עדכון — שמור את העובד ב-_pendingUser לכפתור
  if(failedWorker?.faceUpdateAllowed){
    // לא מנקים S._pendingUser — הכפתור ישתמש בו
    document.getElementById('l-err').innerHTML='זיהוי פנים נכשל 3 פעמים<br><button class="btn warn" style="margin-top:8px;font-size:13px;width:100%" onclick="_startFaceUpdateAfterFail()">📸 עדכן פנים — מנהל אישר</button>';
  }else{
    S._pendingUser=null;
    document.getElementById('l-err').textContent='זיהוי פנים נכשל 3 פעמים — נשלחה התראה למנהל';
  }
  // התראה + תמונה למנהל דרך פונקציית ה-login בשרת (עוד אין טוקן בשלב זה)
  try{loginCall({user:failedWorker?.user||'',faceFailAlert:true,photoB64});}catch(e){}
}

function _startFaceUpdateAfterFail(){
  const w=S._pendingUser;
  if(!w||!w.faceUpdateAllowed)return;
  // אם הסיסמה כבר הוקלדה במסך הכניסה — משתמשים בה ולא שואלים שוב
  const _lp=(document.getElementById('l-pass')?.value||'').trim();if(_lp)w._pass=_lp;
  document.getElementById('l-err').textContent='';
  _startFaceFirstRegister();
}

function cancelFaceAuth(){
  clearInterval(_faceAuthLoop);_faceAuthLoop=null;
  if(_faceAuthStream){_faceAuthStream.getTracks().forEach(t=>t.stop());_faceAuthStream=null;}
  S._pendingUser=null;
  document.getElementById('face-auth-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('l-err').textContent='';
}

// ─── FACE FIRST REGISTER (מרישום מרחוק בכניסה) ──────────────
async function _startFaceFirstRegister(){
  document.getElementById('login-screen').classList.add('hidden');
  _faceRegWorkerId=S._pendingUser.id;
  document.getElementById('face-reg-title').textContent='רישום פנים — '+esc(S._pendingUser.name);
  document.getElementById('face-reg-status').textContent='';
  // שנה טקסט המסך לרישום ראשוני
  const sub=document.querySelector('#face-reg-screen .login-sub');
  if(sub)sub.textContent='המנהל הפעיל זיהוי פנים לחשבונך. צלם את פניך כדי להמשיך.';
  document.getElementById('face-reg-btn').textContent='📸 צלם פנים';
  document.getElementById('face-reg-btn').disabled=true;
  document.getElementById('face-reg-screen').classList.remove('hidden');
  // הסתר כפתור ביטול — חייב לרשום פנים
  const cancelBtn=document.querySelector('#face-reg-screen .btn:not(.primary)');
  if(cancelBtn)cancelBtn.style.display='none';
  const ok=await loadFaceModels();
  if(!ok){document.getElementById('face-reg-status').textContent='שגיאה בטעינת מודלים';return;}
  try{
    _faceRegStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const video=document.getElementById('face-reg-video');
    video.srcObject=_faceRegStream;
    await new Promise(r=>video.onloadedmetadata=r);
    _faceRegSamples=[];
    document.getElementById('face-reg-status').textContent='מצלמה פעילה — לחץ "צלם דגימה 1/5"';
    document.getElementById('face-reg-btn').textContent='📸 צלם דגימה 1/5';
    document.getElementById('face-reg-btn').disabled=false;
    document.getElementById('face-reg-btn').onclick=_captureAndLogin;
  }catch(e){
    document.getElementById('face-reg-status').innerHTML=
      '⛔ הגישה למצלמה נחסמה.<br>לחץ על 🔒 בשורת הכתובת ← מצלמה ← אפשר, ואז:<br>'+
      '<button class="btn" style="margin-top:8px;font-size:13px" onclick="_startFaceFirstRegister()">🔄 נסה שוב</button>';
  }
}

async function _captureAndLogin(){
  const video=document.getElementById('face-reg-video');
  const statusEl=document.getElementById('face-reg-status');
  const btnEl=document.getElementById('face-reg-btn');
  statusEl.textContent='מזהה פנים...';
  btnEl.disabled=true;
  const opts=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:0.5});
  const det=await faceapi.detectSingleFace(video,opts).withFaceLandmarks(true).withFaceDescriptor();
  if(!det){
    statusEl.textContent='לא זוהו פנים — נסה שוב, קרב לנייד';
    btnEl.disabled=false;
    return;
  }
  _faceRegSamples.push(Array.from(det.descriptor));
  const n=_faceRegSamples.length;
  if(n<5){
    statusEl.textContent='✅ דגימה '+n+'/5 — זוז קצת והמשך';
    btnEl.textContent='📸 צלם דגימה '+(n+1)+'/5';
    btnEl.disabled=false;
    return;
  }
  // 5 דגימות הושלמו — שמירה בצד השרת (credentials) וכניסה
  try{
    const w=S._pendingUser;
    if(!w){
      document.getElementById('face-reg-status').textContent='שגיאה: נסה שוב';
      document.getElementById('face-reg-btn').textContent='📸 צלם דגימה 1/5';
      document.getElementById('face-reg-btn').disabled=false;
      _faceRegSamples=[];
      return;
    }
    const samples=_faceRegSamples.slice();
    let worker=null;
    if(w._authed){
      // כבר מחוברים (סיסמה אומתה) — שמירת הפנים דרך updateCredentials
      const{httpsCallable}=window._fb;
      await httpsCallable(window._fbFunctions,'updateCredentials')({action:'registerFace',targetId:w.id,descriptors:samples});
      worker={...w,faceRegistered:true,faceUpdateAllowed:false};
      delete worker._authed;
    }else{
      // רישום מחדש שאושר ע"י המנהל אחרי כשל זיהוי — דרך login (עוד אין טוקן)
      // 🔒 השרת דורש גם סיסמה (25/09/2026) — אישור המנהל לבדו אינו הזדהות
      if(!w._pass){const p=(prompt('🔒 הזן את הסיסמה שלך כדי לעדכן פנים\nأدخل كلمة المرور لتحديث الوجه')||'').trim();
        if(!p){const e=new Error('missing-pass');throw e;}w._pass=p;}
      const devId=await getDeviceId();
      const res=await loginCall({user:w.user,pass:w._pass,registerDescriptors:samples,deviceId:devId||undefined});
      await fbSignInWithToken(res.token);
      worker=res.worker;
    }
    _faceRegSamples=[];
    // שלח תמונה למנהל בטלגרם (לא חוסם)
    try{
      const snapCanvas=document.createElement('canvas');
      const v2=document.getElementById('face-reg-video');
      snapCanvas.width=v2.videoWidth;snapCanvas.height=v2.videoHeight;
      snapCanvas.getContext('2d').drawImage(v2,0,0);
      snapCanvas.toBlob(async blob=>{
        if(!blob)return;
        const now=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
        const b64=await blobToB64(blob);
        tgCall({kind:'photo',dataB64:b64,caption:'📸 TextileOps — רישום פנים ראשוני\n👤 עובד: '+worker.name+'\n🕐 שעה: '+now});
      },'image/jpeg',0.8);
    }catch(e){}
    document.getElementById('face-reg-screen').classList.add('hidden');
    const cancelBtn=document.querySelector('#face-reg-screen .btn:not(.primary)');
    if(cancelBtn)cancelBtn.style.display='';
    document.getElementById('face-reg-btn').textContent='📸 צלם דגימה 1/5';
    document.getElementById('face-reg-btn').onclick=captureFaceDescriptor;
    S._pendingUser=null;
    finishLogin(worker,true);
  }catch(err){
    // סיסמה שגויה/חסרה — מוחקים אותה כדי שהניסיון הבא ישאל שוב
    const _ec=_loginErrCode(err);
    if(S._pendingUser&&(_ec==='wrong'||_ec==='missing-pass'))delete S._pendingUser._pass;
    document.getElementById('face-reg-status').textContent=(_ec==='wrong'?'⛔ סיסמה שגויה':_ec==='missing-pass'?'⛔ נדרשת סיסמה':'שגיאה: '+err.message)+' — נסה שוב';
    document.getElementById('face-reg-btn').textContent='📸 צלם דגימה 1/5';
    document.getElementById('face-reg-btn').disabled=false;
    _faceRegSamples=[];
  }finally{
    if(_faceRegStream){_faceRegStream.getTracks().forEach(t=>t.stop());_faceRegStream=null;}
  }
}

// ─── RAUMA OCR ───────────────────────────────────────────────
function openRaumaOCR(){
  document.getElementById('rauma-ocr-wrap').classList.remove('hidden');
  document.getElementById('rauma-step1').classList.remove('hidden');
  document.getElementById('rauma-step2').classList.add('hidden');
  document.getElementById('rauma-img-preview').innerHTML='';
  document.getElementById('rauma-results').classList.add('hidden');
  document.getElementById('rauma-confirm-btn').classList.add('hidden');
  document.getElementById('rauma-img-input').value='';
  document.getElementById('rauma-cam-input').value='';
}
function closeRaumaOCR(){
  document.getElementById('rauma-ocr-wrap').classList.add('hidden');
}
async function raumaHandleImage(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  const url=URL.createObjectURL(file);
  document.getElementById('rauma-img-preview').innerHTML=`<img src="${url}" style="max-width:100%;border-radius:8px;max-height:180px;object-fit:contain;margin-top:8px">`;
  document.getElementById('rauma-step2').classList.remove('hidden');
  document.getElementById('rauma-status').textContent='טוען מנוע קריאה...';
  try{
    if(!window.Tesseract){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
        s.onload=res;s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    document.getElementById('rauma-status').textContent='קורא תעודה... 0%';
    const result=await Tesseract.recognize(file,'heb+eng',{
      logger:m=>{
        if(m.status==='recognizing text'){
          document.getElementById('rauma-status').textContent='קורא תעודה... '+Math.round(m.progress*100)+'%';
        }
      }
    });
    raumaParseText(result.data.text);
  }catch(e){
    document.getElementById('rauma-status').textContent='שגיאה בקריאה: '+e.message;
  }
}
function raumaParseText(text){
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  // חיפוש מספר דגם — pattern כמו 012779B33 או 8 ספרות רצופות
  let modelFull='';
  let modelCode='';
  for(const line of lines){
    const m=line.match(/0\d{4,7}[A-Z]\d+/)||line.match(/\b0\d{7,8}\b/);
    if(m){
      modelFull=m[0];
      const digits=modelFull.replace(/[^0-9]/g,'');
      if(digits.length>=6) modelCode='0'+digits.slice(2,6);
      break;
    }
  }
  // חיפוש שורות צבע עם כמויות
  const qtyRows=[];
  const colorNames=Object.values(COLORS);
  const colorKeys=Object.keys(COLORS);
  for(const line of lines){
    let foundKey='';
    for(let i=0;i<colorNames.length;i++){
      if(line.includes(colorNames[i])){foundKey=colorKeys[i];break;}
    }
    if(!foundKey)continue;
    const nums=(line.match(/\b\d{1,3}\b/g)||[]).map(Number).filter(n=>n>0&&n<500);
    if(nums.length>0){
      nums.forEach((qty,si)=>{
        qtyRows.push({size:String(si+1),color:foundKey,qty});
      });
    }
  }
  // מלא טופס
  document.getElementById('rauma-prod').value=modelCode.slice(0,5)||'';
  document.getElementById('rauma-name').value=modelFull||'';
  document.getElementById('rauma-cust').value='02';
  // שורות כמויות
  const container=document.getElementById('rauma-qty-rows');
  container.innerHTML=qtyRows.map(q=>`
    <div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">
      <input type="text" value="${q.size}" maxlength="2" placeholder="מידה" style="width:45px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
      <select style="flex:1;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
        <option value="">--</option>${Object.entries(COLORS).map(([k,v])=>`<option value="${k}" ${q.color===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <input type="number" value="${q.qty}" min="0" style="width:65px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:0 4px">✕</button>
    </div>`).join('');
  document.getElementById('rauma-results').classList.remove('hidden');
  document.getElementById('rauma-confirm-btn').classList.remove('hidden');
  const msg=qtyRows.length>0
    ?`✅ זוהו ${qtyRows.length} שורות — בדוק ותקן לפי הצורך`
    :'⚠️ לא זוהו כמויות — הכנס ידנית';
  document.getElementById('rauma-status').textContent=msg;
}
function raumaAddQtyRow(){
  const div=document.createElement('div');
  div.style.cssText='display:flex;gap:6px;margin-bottom:4px;align-items:center';
  div.innerHTML=`
    <input type="text" maxlength="2" placeholder="מידה" style="width:45px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
    <select style="flex:1;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
      <option value="">--</option>${Object.entries(COLORS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
    </select>
    <input type="number" min="0" value="0" style="width:65px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:0 4px">✕</button>`;
  document.getElementById('rauma-qty-rows').appendChild(div);
}
async function raumaConfirm(){
  const prod=(document.getElementById('rauma-prod').value||'').trim().padStart(5,'0').slice(0,5);
  // ⚠️ ריפוד לשתי ספרות. בלעדיו הקלדת "2" נשמרה כ-cust:'2' בזמן שכל המערכת מחזיקה '02'
  // ⇒ הרשומה לא מתאימה לאף ברקוד (raw.slice(0,2)='02'), לא נמצאת ב-findProd,
  // ולא מתקבצת עם ההזמנות הקודמות של אותו דגם ⇒ גם מספר ההזמנה היה מתחיל מ-#001 מחדש.
  const cust=((document.getElementById('rauma-cust').value||'02').replace(/\D/g,'')||'02').padStart(2,'0').slice(0,2);
  const name=(document.getElementById('rauma-name').value||'').trim();
  if(!prod||prod==='00000'){alert('יש להזין מספר מוצר');return;}
  const quantities=[];
  document.querySelectorAll('#rauma-qty-rows > div').forEach(row=>{
    const inputs=row.querySelectorAll('input');
    const sel=row.querySelector('select');
    const size=inputs[0]?.value||'';
    const color=sel?.value||'';
    const qty=parseInt(inputs[1]?.value)||0;
    if(size||color)quantities.push({size,color,qty});
  });
  const id='p'+Date.now();
  const _ordF=await newProdOrderFields(cust,prod);
  const newProd={id,createdAt:Date.now(),..._ordF,prod,cust,name,images:[],docs:[],quantities,stageLog:[],stageSkipped:[]};
  S.products.push(newProd);
  saveLS();
  if(S.fbConnected)await fbSet('products',id,{...newProd});
  closeRaumaOCR();
  renderProducts();
  alert(`✅ מוצר ${prod} נוצר בהצלחה עם ${quantities.length} שורות`);
}

// ─── FACE REGISTER ───────────────────────────────────────────
async function openFaceRegister(id){
  _faceRegWorkerId=id;
  _faceRegSamples=[];
  document.getElementById('face-reg-btn').textContent='📸 צלם דגימה 1/5';
  document.getElementById('face-reg-btn').onclick=captureFaceDescriptor;
  const w=S.workers.find(x=>x.id===id);
  document.getElementById('face-reg-title').textContent='רישום פנים — '+esc(w?.name||'');
  document.getElementById('face-reg-status').textContent='טוען מודלי זיהוי...';
  document.getElementById('face-reg-btn').disabled=true;
  document.getElementById('face-auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('face-reg-screen').classList.remove('hidden');
  const ok=await loadFaceModels();
  if(!ok){document.getElementById('face-reg-status').textContent='שגיאה בטעינת מודלים';return;}
  try{
    _faceRegStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const video=document.getElementById('face-reg-video');
    video.srcObject=_faceRegStream;
    await new Promise(r=>video.onloadedmetadata=r);
    document.getElementById('face-reg-status').textContent='מצלמה פעילה — לחץ "צלם פנים"';
    document.getElementById('face-reg-btn').disabled=false;
  }catch(e){
    document.getElementById('face-reg-status').innerHTML=
      '⛔ הגישה למצלמה נחסמה.<br>לחץ על 🔒 בשורת הכתובת ← מצלמה ← אפשר, ואז:<br>'+
      '<button class="btn" style="margin-top:8px;font-size:13px" onclick="openFaceRegister(\''+_faceRegWorkerId+'\')">🔄 נסה שוב</button>';
  }
}

async function captureFaceDescriptor(){
  const video=document.getElementById('face-reg-video');
  const statusEl=document.getElementById('face-reg-status');
  const btnEl=document.getElementById('face-reg-btn');
  statusEl.textContent='מזהה פנים...';
  btnEl.disabled=true;
  const opts=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:0.5});
  const det=await faceapi.detectSingleFace(video,opts).withFaceLandmarks(true).withFaceDescriptor();
  if(!det){
    statusEl.textContent='לא זוהו פנים — נסה שוב';
    btnEl.disabled=false;
    return;
  }
  // שמור descriptor זמני והצג תצוגה מקדימה לאישור
  window._pendingDescriptor=Array.from(det.descriptor);
  const canvas=document.getElementById('face-reg-preview-canvas');
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d');
  ctx.save();ctx.scale(-1,1);ctx.drawImage(video,-video.videoWidth,0);ctx.restore();
  document.getElementById('face-reg-preview-box').style.display='';
  document.getElementById('face-reg-capture-box').style.display='none';
  statusEl.textContent='בדוק שהפנים בתמונה הם של העובד הנכון';
}
function faceRegRetake(){
  window._pendingDescriptor=null;
  document.getElementById('face-reg-preview-box').style.display='none';
  document.getElementById('face-reg-capture-box').style.display='flex';
  const btnEl=document.getElementById('face-reg-btn');
  btnEl.disabled=false;
  document.getElementById('face-reg-status').textContent='צלם שוב';
}
async function faceRegConfirm(){
  if(!window._pendingDescriptor)return;
  _faceRegSamples.push(window._pendingDescriptor);
  // שמור את התמונה המאושרת לשליחה בטלגרם
  const previewCanvas=document.getElementById('face-reg-preview-canvas');
  if(previewCanvas)_faceRegSnaps.push(previewCanvas.toDataURL('image/jpeg',0.7));
  window._pendingDescriptor=null;
  document.getElementById('face-reg-preview-box').style.display='none';
  document.getElementById('face-reg-capture-box').style.display='flex';
  const statusEl=document.getElementById('face-reg-status');
  const btnEl=document.getElementById('face-reg-btn');
  const n=_faceRegSamples.length;
  if(n<5){
    statusEl.textContent='✅ דגימה '+n+'/5 — זוז קצת והמשך';
    btnEl.textContent='📸 צלם דגימה '+(n+1)+'/5';
    btnEl.disabled=false;
    return;
  }
  // 5 דגימות הושלמו — הפנה לפונקציית סיום לפי מצב
  if(window._faceRegWorkerMode){window._faceRegWorkerMode=false;await _workerFaceRegDone();return;}
  const video=document.getElementById('face-reg-video');
  const w=S.workers.find(x=>x.id===_faceRegWorkerId);
  if(w){
    try{
      const{httpsCallable}=window._fb;
      await httpsCallable(window._fbFunctions,'updateCredentials')({action:'registerFace',targetId:w.id,descriptors:_faceRegSamples.slice()});
      w.faceRegistered=true;
      saveLS();
      sendFaceRegPhotos(w.name,[..._faceRegSnaps]);
    }catch(e){alert('שגיאה בשמירת פנים: '+e.message);}
  }
  _faceRegSamples=[];_faceRegSnaps=[];
  cancelFaceReg();
  alert('✅ פנים נרשמו בהצלחה עבור '+w?.name);
  renderAdmin();
}

function cancelFaceReg(){
  if(_faceRegStream){_faceRegStream.getTracks().forEach(t=>t.stop());_faceRegStream=null;}
  _faceRegWorkerId=null;
  _faceRegSamples=[];_faceRegSnaps=[];
  const btn=document.getElementById('face-reg-btn');
  btn.textContent='📸 צלם דגימה 1/5';
  btn.onclick=captureFaceDescriptor;
  document.getElementById('face-reg-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
}

/* ── AUTO UPDATE CHECK ── */
// שומר את ?kiosk=1 דרך הרענון — בלעדיו מסך הקיר נטען בלי הדגל, וגם אחרי כניסה מחדש
// הלוח לא נפתח אוטומטית וצריך ללחוץ 📺 ידנית.
function doAppUpdate(){
  const k=/[?&#]kiosk=1\b/.test(location.href)?'&kiosk=1':'';
  window.location.href=window.location.pathname+'?t='+Date.now()+k;
}
let _appVerTag=null;      // הטביעה האחרונה שנצפתה — לדיווח בדופק הטאב
const _appVerBase={};     // בסיס השוואה *נפרד לכל סוג טביעה* — ראה _verFingerprint
let _appVerStale=false;
// שעון שרת: offset מכותרת Date של checkVersion. חותמות זמן קריטיות (נוכחות/משימות) עוברות
// דרך srvNow() כדי ששעון מכשיר שגוי (מוגדר ידני) לא יעוות היסטוריה ודוחות.
let _clockOffsetMs=0;
function srvNow(){return new Date(Date.now()+_clockOffsetMs);}
function showUpdateBanner(){
  const b=document.getElementById('update-banner');if(!b)return;
  const T=typeof LANGS!=='undefined'&&typeof currentLang!=='undefined'?LANGS[currentLang]:{};
  document.getElementById('update-banner-txt').textContent=T.update_available||'🔄 גרסה חדשה זמינה';
  b.querySelector('button').textContent=T.update_btn||'עדכן עכשיו';
  b.classList.remove('hidden');
}
// בודק אם יש גרסה חדשה בשרת. מחזיר true אם זוהתה גרסה ישנה (stale) בטאב הזה.
// HEAD בלבד (~200 בייט) במקום הורדת כל index.html — ה-ETag של GitHub Pages הוא "mtime-size" (הקס).
// ⚠️ ה-mtime שונה ב±1-2 שניות בין רפליקות ה-CDN (נצפה חי: a7 מול a8 לאותו deploy) — השוואת מחרוזת
// תמימה תיצור באנר-שווא כשלקוח קופץ בין שרתים. לכן: גרסה חדשה רק אם ה-size השתנה או ה-mtime זז
// ביותר מ-60 שנ' (deploys מרוחקים דקות; כך נתפס גם deploy נדיר ששומר בדיוק על אותו גודל קובץ).
// W/ (weak ETag) נחתך — Fastly מוסיף אותו רק כשהתשובה דחוסה, אותו קובץ.
// k = *סוג* הטביעה. אסור להשוות בין סוגים שונים: רפליקה אחת של ה-CDN מחזירה ETag והשנייה
// לא, ואז ההשוואה מתהפכת ומדליקה "גרסה חדשה" על לא כלום (08/08 11:13 — באנר בלי שהיה deploy;
// הלחיצה עליו רועננה את הדף באמצע פתיחת משימה ומחקה 92 דק' עבודה). בסיס נפרד לכל סוג.
function _verFingerprint(res){
  const et=(res.headers.get('etag')||'').replace(/^W\//,'').replace(/"/g,'');
  const m=et.match(/^([0-9a-f]+)-([0-9a-f]+)$/);
  if(m)return{k:'et',mt:parseInt(m[1],16),sz:m[2]};
  if(et)return{k:'etx',mt:0,sz:et};
  const cl=res.headers.get('content-length');
  return cl?{k:'cl',mt:0,sz:'cl:'+cl}:null;
}
function hideUpdateBanner(){
  const b=document.getElementById('update-banner');if(b)b.classList.add('hidden');
}
async function checkVersion(){
  try{
    const res=await fetch(location.pathname+'?t='+Date.now(),{method:'HEAD',cache:'no-store'});
    if(!res.ok)return _appVerStale;
    // זמן שרת מכותרת Date — מתקן שעון מכשיר שגוי (עובד עם שעון ידני שמפגר). אפס בקשות נוספות.
    try{const sd=res.headers.get('date');if(sd){const stMs=new Date(sd).getTime();if(stMs)_clockOffsetMs=stMs-Date.now();}}catch(e){}
    const tag=_verFingerprint(res);
    if(!tag)return _appVerStale;
    _appVerTag=tag;
    // סוג טביעה שלא ראינו עדיין = אין מול מה להשוות. "לא יודע" — לא "התיישן".
    const base=_appVerBase[tag.k];
    if(!base){_appVerBase[tag.k]=tag;return _appVerStale;}
    if(tag.sz!==base.sz||(tag.mt&&base.mt&&Math.abs(tag.mt-base.mt)>60)){
      _appVerStale=true;
      // מסך התצוגה = לוח קיר בלי מפעיל: באנר העדכון (z-index 200) מרונדר *מאחורי* ה-overlay
      // של הלוח (z-index 9999) ⇒ בלתי נראה, ואין בלוח כניסה/חתימה/סריקה שהחסימות היו תופסות.
      // בלי זה הלוח נשאר על קוד ישן עד הרענון של יום חדש. הרענון מחזיר למסך כניסה (אין שמירת
      // התחברות) — כמו כל בוקר; ?kiosk=1 נשמר כדי שהלוח ייפתח שוב מיד אחרי הכניסה.
      if(typeof _kioskOpen!=='undefined'&&_kioskOpen){doAppUpdate();return true;}
      showUpdateBanner();
    }else if(_appVerStale){
      // הדגל מאמת מחדש ולא ננעל: כל עוד הוא דלוק, שורות 7590/7909 חוסמות את האחראי מלפתוח
      // *שום* משימה לאף עובד עד רענון ידני (08/08: 92 דק' שבהן ايمان לא הייתה רשומה על כלום).
      // אם ה-HEAD הנוכחי זהה שוב לבסיס — ההתראה הייתה שווא, משחררים.
      _appVerStale=false;
      hideUpdateBanner();
    }
    return _appVerStale;
  }catch(e){return _appVerStale;}
}
(function(){
  const CHECK_INTERVAL=5*60*1000;
  setTimeout(()=>{
    if(!document.hidden)checkVersion();
    setInterval(()=>{if(!document.hidden)checkVersion();},CHECK_INTERVAL);
  },2000);
})();

