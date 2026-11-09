// ─── שינוי שם מחלקה/תחנה עם העברת כל ההפניות ─────────────────
// השם הוא המזהה: המפתח "מחלקה::תחנה" שמור במיומנויות עובדים (skills),
// בשיוך שלבי מוצרים (workSteps[].station), בשדה dept של עובדים ושל תחנות
// פיזיות (STN) — לכן שינוי שם חייב לעדכן את כולם יחד, אחרת הקישורים מתייתמים.
async function renameDept(oldD){
  const newD=(prompt('שם חדש למחלקה "'+oldD+'":',oldD)||'').trim();
  if(!newD||newD===oldD)return;
  if(S.depts.includes(newD)){alert('מחלקה בשם זה כבר קיימת');return;}
  S.depts=S.depts.map(x=>x===oldD?newD:x);
  if(S.deptStations&&Object.prototype.hasOwnProperty.call(S.deptStations,oldD)){S.deptStations[newD]=S.deptStations[oldD];delete S.deptStations[oldD];}
  if(S.deptStageMap&&Object.prototype.hasOwnProperty.call(S.deptStageMap,oldD)){S.deptStageMap[newD]=S.deptStageMap[oldD];delete S.deptStageMap[oldD];}
  const pre=oldD+'::';
  for(const w of S.workers){
    let ch=false;
    if(w.dept===oldD){w.dept=newD;ch=true;}
    if(w.skills&&Object.keys(w.skills).some(k=>k.startsWith(pre))){
      const ns={};for(const k in w.skills)ns[k.startsWith(pre)?newD+'::'+k.slice(pre.length):k]=w.skills[k];
      w.skills=ns;ch=true;
    }
    if(ch&&S.fbConnected)await fbReplaceFields('workers',w.id,{dept:w.dept,...(w.skills?{skills:w.skills}:{})});
  }
  for(const p of (S.products||[])){
    let ch=false;
    (p.workSteps||[]).forEach(s=>{
      if(s&&typeof s==='object'&&typeof s.station==='string'&&s.station.startsWith(pre)){s.station=newD+'::'+s.station.slice(pre.length);ch=true;}
      // 🔀 אותו טיפול לתחנות המשניות של השלב
      if(s&&typeof s==='object'&&Array.isArray(s.altStations)&&s.altStations.some(k=>typeof k==='string'&&k.startsWith(pre))){
        s.altStations=s.altStations.map(k=>(typeof k==='string'&&k.startsWith(pre))?newD+'::'+k.slice(pre.length):k);ch=true;
      }
    });
    if(ch&&S.fbConnected)await fbSet('products',p.id,{...p});
  }
  for(const st of (S.workStations||[])){
    let sch=false;
    if(st.dept===oldD){st.dept=newD;sch=true;}
    if(typeof st.key==='string'&&st.key.startsWith(pre)){st.key=newD+'::'+st.key.slice(pre.length);sch=true;}
    if(sch&&S.fbConnected)await fbSet('stations',st.id,{dept:st.dept,key:st.key||''});
  }
  // 🔧 רשימת המחלקות הבלעדיות מחזיקה **שמות** — בלי העדכון הזה שינוי שם מחלקה
  // היה מכבה את הבלעדיות בשקט, בלי שאיש יראה שמשהו השתנה.
  const _ex=exclusiveDepts();
  if(_ex.includes(oldD)){
    const nx=_ex.map(x=>x===oldD?newD:x);
    S.settings.exclusiveDepts=nx;
    if(S.fbConnected)await fbSet('appSettings','telegramSettings',{exclusiveDepts:nx});
  }
  saveDepts();try{fillDeptSelects();}catch(e){}
  renderAdmin();
  showToast('✅ שם המחלקה עודכן: '+oldD+' ← '+newD+' (כולל עובדים, מיומנויות ושלבי מוצרים)','var(--green-txt)',4500);
}
async function renameStation(d,oldSt){
  const newSt=(prompt('שם חדש לתחנה "'+oldSt+'" (מחלקת '+d+'):',oldSt)||'').trim();
  if(!newSt||newSt===oldSt)return;
  const arr=S.deptStations?.[d]||[];
  if(arr.includes(newSt)){alert('תחנה בשם זה כבר קיימת במחלקה');return;}
  const oldKey=d+'::'+oldSt,newKey=d+'::'+newSt;
  S.deptStations[d]=arr.map(x=>x===oldSt?newSt:x);
  for(const w of S.workers){
    if(w.skills&&Object.prototype.hasOwnProperty.call(w.skills,oldKey)){
      w.skills[newKey]=w.skills[oldKey];delete w.skills[oldKey];
      if(S.fbConnected)await fbReplaceFields('workers',w.id,{skills:w.skills});
    }
  }
  for(const p of (S.products||[])){
    let ch=false;
    (p.workSteps||[]).forEach(s=>{
      if(s&&typeof s==='object'&&s.station===oldKey){s.station=newKey;ch=true;}
      // 🔀 גם התחנות המשניות נושאות את אותו מפתח — בלי זה שינוי שם תחנה
      // היה מנתק בשקט את ההרשאה הנוספת והשלב היה נסגר למכונה השנייה
      if(s&&typeof s==='object'&&Array.isArray(s.altStations)&&s.altStations.includes(oldKey)){
        s.altStations=s.altStations.map(k=>k===oldKey?newKey:k);ch=true;
      }
    });
    if(ch&&S.fbConnected)await fbSet('products',p.id,{...p});
  }
  for(const st of (S.workStations||[])){
    if(st.key===oldKey||(!st.key&&st.name===oldSt&&(st.dept||'')===d)){
      st.name=newSt;st.key=newKey;
      if(S.fbConnected)await fbSet('stations',st.id,{name:newSt,key:newKey});
    }
  }
  saveDepts();renderAdmin();
  showToast('✅ שם התחנה עודכן: '+oldSt+' ← '+newSt+' (כולל מיומנויות ושלבי מוצרים)','var(--green-txt)',4500);
}
// מפתח משותף: שני שינויי שם לא רצים במקביל — הלולאות האסינכרוניות שלהם משתלבות ומשחיתות מפתחות
_guardReentrant('renameDept','rename');
_guardReentrant('renameStation','rename');

// ─── REFRESH DASH EVERY 5s ──────────────────────────────────
setInterval(()=>{
  if(document.hidden)return; // לא מבזבז משאבים כשהטאב ברקע
  const pg=document.querySelector('.page.active');
  if(pg?.id==='page-dash')renderDash();
},5000);

// עצירת חישובים כשהמשתמש עוזב את הטאב
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&S.user){
    runDailyReset(); // בדיקת איפוס יום כשחוזרים
    renderAll();
  }
});

// ─── CAMERA BARCODE SCANNER ─────────────────────────────────
let camStream=null;let camInterval=null;

async function startCam(){
  const T=LANGS[currentLang];
  const container=document.getElementById('cam-container');
  const video=document.getElementById('cam-video');
  const status=document.getElementById('cam-status');
  const btn=document.getElementById('cam-btn');
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}});
    video.srcObject=camStream;
    container.style.display='block';
    btn.style.display='none';
    status.textContent=T.scan_searching;
    await video.play();
    startDecoding(video,status);
  }catch(e){
    alert('לא ניתן לגשת למצלמה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.');
  }
}

function startDecoding(video,status){
  const T=LANGS[currentLang];
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  camInterval=setInterval(()=>{
    if(video.readyState!==video.HAVE_ENOUGH_DATA)return;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    ctx.drawImage(video,0,0);
    try{
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
      if(code){
        // ברקוד תחנה (STN:) — שיוך העובד המחובר לתחנה, לפני חילוץ הספרות
        if((code.data||'').startsWith('STN:')){
          clearInterval(camInterval);
          status.textContent='📍 '+code.data;
          const _sid=code.data.slice(4).trim();
          setTimeout(()=>stopCam(),400);
          if(S.user)assignWorkerStation(S.user.id,_sid);
          return;
        }
        const text=code.data.replace(/\D/g,'');
        const bc=bcFromScan(text);
        if(bc){
          bcScanMark('bc',code.data,bc);
          document.getElementById('bc-inp').value=bc;
          parseBc(bc);
          status.textContent=(T.sc_scanned||'✅ נסרק: ')+bc;
          clearInterval(camInterval);
          setTimeout(()=>{stopCam();submitBc();},600);
        } else if(text.length>0){
          status.textContent=(T.sc_short||'⚠ קוד קצר מדי (צריך 13 או 16 ספרות): ')+text;
        }
      }
    }catch(e){}
  },150);
}

function stopCam(){
  if(camStream)camStream.getTracks().forEach(t=>t.stop());
  if(camInterval)clearInterval(camInterval);
  camStream=null;camInterval=null;
  const c=document.getElementById('cam-container');if(c)c.style.display='none';
  const b=document.getElementById('cam-btn');if(b)b.style.display='flex';
}

// ─── MULTILINGUAL (i18n) ────────────────────────────────────

let currentLang='he';

function setLang(code){
  if(!LANGS[code])return;
  currentLang=code;
  const rtl=code==='he'||code==='ar';
  document.documentElement.lang=code;
  document.documentElement.dir=rtl?'rtl':'ltr';
  localStorage.setItem('txops_lang',code);
  const dict=LANGS[code];
  // update text nodes
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');
    if(dict[key]!==undefined)el.textContent=dict[key];
  });
  // update placeholders
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
    const key=el.getAttribute('data-i18n-ph');
    if(dict[key]!==undefined)el.placeholder=dict[key];
  });
  // highlight active lang buttons
  ['he','ar','en'].forEach(lc=>{
    const b1=document.getElementById('lb-'+lc);
    const b2=document.getElementById('lb-'+lc+'-login');
    if(b1)b1.classList.toggle('active',lc===code);
    if(b2)b2.classList.toggle('active',lc===code);
  });
  const _lt=document.getElementById('lb-toggle');if(_lt)_lt.textContent=code==='ar'?'🇮🇱':'🇸🇦';
  // עדכן תוכן דינמי בדף הוצאות אם פתוח
  if(document.getElementById('page-expenses')?.classList.contains('active'))renderExpenses();
  _saveMyLang();
}
// שפת הממשק נשמרת בכרטיס העובד (`lang`) — השרת שולח את ה-Push של התזכורת בשפה הזו.
// נקרא בהחלפת שפה ובכניסה; כותב רק כשהשתנה (שדה אחד, merge)
function _saveMyLang(){
  try{
    const u=S.user;if(!u?.id||!db)return;
    const l=currentLang==='ar'?'ar':'he';
    const w=S.workers.find(x=>x.id===u.id);
    if(!w||w.lang===l)return;
    w.lang=l;fbSetMerge('workers',u.id,{lang:l}).catch(()=>{});
  }catch(e){}
}

function toggleLang(){setLang(currentLang==='ar'?'he':'ar');}
// restore on page load
(function(){
  const saved=localStorage.getItem('txops_lang')||'he';
  setLang(saved);
})();

// ─── QR CODE ────────────────────────────────────────────────
(function(){
  const url=location.href.split('?')[0].split('#')[0];
  const canvas=document.getElementById('login-qr');
  if(canvas&&window.QRCode){
    QRCode.toCanvas(canvas,url,{width:120,margin:1,color:{dark:'#1a1a18',light:'#ffffff'}},()=>{});
  } else if(canvas){
    // fallback — נסה שוב אחרי טעינת הספרייה
    window.addEventListener('load',()=>{
      if(window.QRCode)QRCode.toCanvas(canvas,url,{width:120,margin:1,color:{dark:'#1a1a18',light:'#ffffff'}},()=>{});
    });
  }
})();

// ─── CUSTOMERS & COLORS ─────────────────────────────────────
function addCustomerName(){
  const code=(document.getElementById('cust-code').value||'').trim().padStart(2,'0');
  const name=(document.getElementById('cust-name').value||'').trim();
  if(!code||!name){alert('הזן קוד ושם');return;}
  S.customerNames[code]=name;
  document.getElementById('cust-code').value='';
  document.getElementById('cust-name').value='';
  saveLS();
  if(S.fbConnected)fbSet('appSettings','customerNames',S.customerNames);
  renderAdmin();
}
async function delCustomerName(code){
  // 🛑 מחיקה בלי אישור: הכפתור צמוד לכפתור העריכה, ולחיצה אחת בטעות מוחקת שם
  // שמופיע בכל תעודה, בכל דוח ובכל כרטיס של הלקוח הזה
  if(!await showConfirm('מחיקת לקוח','למחוק את "'+(S.customerNames?.[code]||code)+'" (קוד '+code+')?','מחק','ביטול'))return;
  delete S.customerNames[code];
  saveLS();
  if(S.fbConnected)fbSet('appSettings','customerNames',S.customerNames);
  renderAdmin();
}
// ─── 📄 פרטי עסק ולקוח לתעודת משלוח ──────────────────────────
function saveCompanyInfo(){
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const co={name:g('co-name'),addr:g('co-addr'),city:g('co-city'),phone:g('co-phone'),taxId:g('co-taxid'),email:g('co-email')};
  S.settings.company=co;
  const dn=parseInt(g('co-dnstart'),10)||0;
  // 🛑 המספר הבא לא יורד מתחת למה שכבר הודפס ונמסר ללקוח — שני לקוחות עם אותו
  // מספר תעודה הם בלגן חשבונאי שאי אפשר לתקן בדיעבד
  const issued=(S.products||[]).reduce((m,x)=>Math.max(m,parseInt(x.dnNo,10)||0),0);
  if(dn>0&&issued&&dn<=issued){
    alert('כבר הונפקה תעודה מספר '+issued+'.\nהמספר הבא חייב להיות '+(issued+1)+' ומעלה.');
    return;
  }
  if(dn>0)S.settings.dnStart=dn;
  // 🧾 אותו כלל לחשבונית העסקה — המספר הבא לא יורד מתחת למה שכבר הונפק
  const inv=parseInt(g('co-invstart'),10)||0,invLast=+S.settings.invLast||0;
  if(inv>0&&invLast&&inv<=invLast){
    alert('כבר הונפקה חשבונית עסקה מספר '+invLast+'.\nהמספר הבא חייב להיות '+(invLast+1)+' ומעלה.');
    return;
  }
  if(inv>0)S.settings.invStart=inv;
  const _vat=g('co-vat');
  if(_vat!==''&&isFinite(+_vat)&&+_vat>=0&&+_vat<=50)S.settings.vatPct=+_vat;
  // 📦 מחירון האריזה נשמר במסמך משלו — הוא נקרא בכל אישור משלוח, ולכן עדיף לו
  // מסמך קטן שלא נוגע בפרטי העסק ולא בהגדרות הטלגרם
  const num=id=>Math.max(0,parseFloat(document.getElementById(id)?.value)||0);
  const pp={hanger:num('pp-hanger'),clip:num('pp-clip'),nylon:num('pp-nylon'),cello:num('pp-cello')};
  S.settings.packPrices=pp;
  saveLS();
  if(S.fbConnected){fbSet('appSettings','company',co);fbSet('appSettings','telegramSettings',{dnStart:S.settings.dnStart,invStart:S.settings.invStart,vatPct:S.settings.vatPct});fbSet('appSettings','packPrices',pp);}
  showToast('✅ פרטי העסק נשמרו');
  renderAdmin();
}
// ─── ✍ חתימת העסק (05/10/2026) ─────────────────────────────────────────
// נשמרת ב-bizSignature/main: קריאה רק ל-canPricing (מי שמדפיס תעודות/חשבוניות), כתיבה —
// מנהל בלבד (Rules). לא ב-appSettings — שם כל עובד יכול לקרוא ולהעתיק אותה.
let _bizSig; // undefined = לא נטען · null = אין · dataURL
async function bizSigGet(force){
  if(!_canPricing()||!db||!S.fbConnected)return null;
  if(_bizSig!==undefined&&!force)return _bizSig;
  try{const{doc,getDoc}=window._fb;const d=await getDoc(doc(db,'bizSignature','main'));_bizSig=d.data()?.img||null;}
  catch(e){console.warn('sig:',e.message);return null;}
  return _bizSig;
}
async function sigRenderPrev(){
  const el=document.getElementById('co-sig-prev');if(!el)return;
  const b=document.getElementById('co-sig-btns');if(b)b.style.display=S.user?.role==='manager'?'flex':'none';
  const s=await bizSigGet(true);
  el.innerHTML=s?`<img src="${s}" style="max-height:70px;max-width:100%"/>`:'אין חתימה שמורה';
}
// חיתוך לשוליים של הציור + הקטנה ⇒ PNG שקוף
function _sigCrop(cv){
  const ctx=cv.getContext('2d'),{width:w,height:h}=cv,px=ctx.getImageData(0,0,w,h).data;
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(px[(y*w+x)*4+3]>20){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x1<0)return null;
  const pad=6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(w-1,x1+pad);y1=Math.min(h-1,y1+pad);
  const cw=x1-x0+1,ch=y1-y0+1,sc=Math.min(1,500/cw,200/ch);
  const out=document.createElement('canvas');out.width=Math.round(cw*sc);out.height=Math.round(ch*sc);
  out.getContext('2d').drawImage(cv,x0,y0,cw,ch,0,0,out.width,out.height);
  return out.toDataURL('image/png');
}
async function sigSave(img){
  if(S.user?.role!=='manager'){showToast('⚠ מנהל בלבד','var(--red-txt)');return;}
  if(!img){showToast('⚠ החתימה ריקה','var(--red-txt)');return;}
  if(img.length>700000){showToast('⚠ התמונה גדולה מדי — נסה תמונה קטנה יותר','var(--red-txt)');return;}
  try{await fbSet('bizSignature','main',{img,at:Date.now(),by:S.user?.name||''});_bizSig=img;showToast('✅ החתימה נשמרה');sigRenderPrev();}
  catch(e){showToast('⚠ השמירה נכשלה: '+(e.message||''),'var(--red-txt)');}
}
async function sigDelete(){
  if(S.user?.role!=='manager')return;
  if(!await showConfirm('מחיקת חתימה','למחוק את חתימת העסק?\nמסמכים יודפסו בלי חתימה עד שתישמר חדשה.','מחק','ביטול'))return;
  try{await fbDel('bizSignature','main');_bizSig=null;sigRenderPrev();showToast('🗑 נמחקה');}catch(e){showToast('⚠ '+(e.message||''),'var(--red-txt)');}
}
// 📷 תמונה של חתימה/חותמת על דף לבן — הרקע הבהיר הופך לשקוף
function sigUpload(inp){
  const file=inp.files&&inp.files[0];inp.value='';if(!file)return;
  const im=new Image();
  im.onload=()=>{
    const sc=Math.min(1,1200/im.width,1200/im.height);
    const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
    const ctx=cv.getContext('2d');ctx.drawImage(im,0,0,cv.width,cv.height);
    const d=ctx.getImageData(0,0,cv.width,cv.height),p=d.data;
    for(let i=0;i<p.length;i+=4){const l=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];
      if(l>185)p[i+3]=0;else if(l>140)p[i+3]=Math.round(255*(185-l)/45);}
    ctx.putImageData(d,0,0);
    URL.revokeObjectURL(im.src);
    sigSave(_sigCrop(cv));
  };
  im.onerror=()=>showToast('⚠ לא הצלחתי לקרוא את התמונה','var(--red-txt)');
  im.src=URL.createObjectURL(file);
}
// ✍ חתימה על המסך — עכבר / אצבע
function sigDrawOpen(){
  if(S.user?.role!=='manager'){showToast('⚠ מנהל בלבד','var(--red-txt)');return;}
  document.getElementById('sgd-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='sgd-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001;padding:12px';
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:16px;max-width:560px;width:100%">
    <div style="font-size:16px;font-weight:800;margin-bottom:8px">✍ חתום בתוך המסגרת</div>
    <canvas id="sgd-cv" width="520" height="200" style="width:100%;height:auto;background:#fff;border:1px solid #bbb;border-radius:8px;touch-action:none;cursor:crosshair"></canvas>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn primary" style="flex:1" id="sgd-ok">💾 שמור</button>
      <button class="btn" style="flex:1" id="sgd-clr">נקה</button>
      <button class="btn" style="flex:1" id="sgd-no">ביטול</button>
    </div></div>`;
  document.body.appendChild(wrap);
  const cv=document.getElementById('sgd-cv'),ctx=cv.getContext('2d');
  ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#14306b';
  let dn=false;
  const pt=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height];};
  cv.onpointerdown=e=>{dn=true;cv.setPointerCapture(e.pointerId);const[x,y]=pt(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y+.1);ctx.stroke();};
  cv.onpointermove=e=>{if(!dn)return;const[x,y]=pt(e);ctx.lineTo(x,y);ctx.stroke();};
  cv.onpointerup=cv.onpointercancel=()=>{dn=false;};
  document.getElementById('sgd-clr').onclick=()=>ctx.clearRect(0,0,cv.width,cv.height);
  document.getElementById('sgd-no').onclick=()=>wrap.remove();
  document.getElementById('sgd-ok').onclick=()=>{const img=_sigCrop(cv);if(!img){showToast('⚠ לא נחתם כלום','var(--red-txt)');return;}wrap.remove();sigSave(img);};
}
function fillCompanyInfo(){
  try{sigRenderPrev();}catch(e){}
  const co=S.settings?.company||{};
  const s=(id,v)=>{const el=document.getElementById(id);if(el&&document.activeElement!==el)el.value=v||'';};
  s('co-name',co.name);s('co-addr',co.addr);s('co-city',co.city);s('co-phone',co.phone);s('co-taxid',co.taxId);s('co-email',co.email);
  const pp=S.settings?.packPrices||{};
  // 0 מוצג כשדה ריק ולא כ-"0" — "אין מחיר" ו-"מחיר אפס" נראים אז אותו דבר, וזה
  // בדיוק המצב שהדוח מסמן באזהרה
  s('pp-hanger',+pp.hanger||'');s('pp-clip',+pp.clip||'');s('pp-nylon',+pp.nylon||'');s('pp-cello',+pp.cello||'');
  const issued=(S.products||[]).reduce((m,x)=>Math.max(m,parseInt(x.dnNo,10)||0),0);
  s('co-dnstart',Math.max(parseInt(S.settings?.dnStart,10)||1,issued+1));
  const el=document.getElementById('co-dnlast');
  if(el)el.textContent=issued?('התעודה האחרונה שהונפקה במערכת: '+String(issued).padStart(4,'0')):'עדיין לא הונפקה תעודה במערכת';
  s('co-vat',S.settings?.vatPct??18);
  const _invFill=()=>{
    const last=+S.settings?.invLast||0;
    s('co-invstart',Math.max(parseInt(S.settings?.invStart,10)||1,last+1));
    const e2=document.getElementById('co-invlast');
    if(e2)e2.textContent=last?'חשבונית העסקה האחרונה שהונפקה: '+last:'עדיין לא הונפקה חשבונית עסקה במערכת';
  };
  _invFill();
  // המספר האחרון יושב במונה המשותף — נקרא מהשרת כדי שמכשיר אחר לא יציג מספר ישן
  if(db&&S.fbConnected){try{const{doc,getDoc}=window._fb;getDoc(doc(db,'appSettings','proformaInvoice')).then(d=>{const l=parseInt(d.data()?.last,10)||0;if(l>(+S.settings.invLast||0)){S.settings.invLast=l;_invFill();}}).catch(()=>{});}catch(e){}}
}
function editCustomerInfo(code){
  const ci=(S.customerInfo||{})[code]||{};
  const nm=S.customerNames?.[code]||code;
  document.getElementById('cinfo-wrap')?.remove();
  const wrap=document.createElement('div');
  wrap.id='cinfo-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  const fld=(id,ph,v)=>`<input type="text" id="${id}" placeholder="${esc(ph)}" value="${esc(v||'')}" style="width:100%;font-size:13px;padding:8px;margin-top:6px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>`;
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:2px">📍 פרטי לקוח</div>
    <div style="font-size:13px;color:var(--txt3);margin-bottom:10px">קוד <span class="bc-seg bc-c">${esc(code)}</span> — הקוד עצמו לא ניתן לשינוי</div>
    <label style="font-size:12px;font-weight:600;color:var(--txt3)">שם הלקוח</label>
    ${fld('cinfo-name','שם הלקוח',S.customerNames?.[code]||'')}
    <div style="height:10px"></div>
    ${fld('cinfo-addr','רחוב ומספר',ci.addr)}
    ${fld('cinfo-city','עיר',ci.city)}
    ${fld('cinfo-contact','איש קשר',ci.contact)}
    ${fld('cinfo-phone','טלפון',ci.phone)}
    ${fld('cinfo-taxid','ח.פ. / ע.מ.',ci.taxId)}
    ${S.user?.role==='manager'?`<div id="cinfo-link" data-code="${esc(code)}" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--brd)">${_custLinkHtml(code)}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn primary" style="flex:1;font-size:14px" onclick="saveCustomerInfo('${escj(code)}')">💾 שמור</button>
      <button class="btn" style="flex:1;font-size:14px" onclick="document.getElementById('cinfo-wrap').remove()">ביטול</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  // המיקוד על השם: זו הסיבה הנפוצה לפתוח את החלון, והטקסט מסומן כדי שאפשר יהיה
  // גם להחליף אותו וגם להמשיך לכתוב בסופו
  setTimeout(()=>{const el=document.getElementById('cinfo-name');if(el){el.focus();el.select();}},50);
}
// ─── 📧 מעקב הזמנות ללקוח — מיילים מורשים (10/10/2026) — מנהל בלבד ─────────────
// הלקוח נכנס ל-track.html עם קישור שנשלח למייל שלו (פעם אחת למכשיר). Cloud Function customerTrack
// מחזירה את ההזמנות רק אם המייל המאומת מופיע כאן. נשמר ב-adminSettings/custLinks.emails = {קוד: [{e,at}]}
// (מנהל בלבד ב-Rules — לא בפרטי הלקוח, שכל עובד יכול לכתוב). הסרת מייל = חסימה מיידית.
// 🔐 at = מתי נוסף: השרת דוחה כל מכשיר שנכנס **לפני** at ⇒ הוספה מחדש אחרי הסרה מנתקת את כולם.
// 🕘 יומן הכניסות (adminSettings/custTrackLog) נכתב רק בשרת — כאן קריאה בלבד.
// 📱 מכשירים (16/10/2026): max ברשומת המייל (0 = ללא הגבלה). adminSettings/custDevices.entries =
// {devId:{e,cust,dev,at,seen,st}} — השרת (trackDeviceGate) רושם; כאן המנהל מאשר/חוסם/מוחק.
// st: ok | pending (מעל ההגבלה — ממתין לאישור) | blocked. רשומה מלפני הוספת המייל (at) — לא בתוקף.
let _custEmails={},_custLog={},_custDevs={};
const _custEnt=x=>typeof x==='string'?{e:x.toLowerCase(),at:0,max:0}:{e:String(x?.e||'').toLowerCase(),at:+x?.at||0,max:Math.max(0,parseInt(x?.max,10)||0)};
const _custDevsOf=x=>Object.entries(_custDevs).filter(([,d])=>d&&d.e===x.e&&(+d.at||0)>=x.at-120000).sort((a,b)=>(b[1].seen||0)-(a[1].seen||0));
function _custDevHtml(code,x){
  const fmt=ms=>{const d=new Date(ms);return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(2);};
  const devs=_custDevsOf(x),ok=devs.filter(([,d])=>d.st==='ok').length;
  const lbl={ok:['✅','var(--green-txt)','מאושר'],pending:['⏳','var(--amber-txt,#b45309)','ממתין לאישור'],blocked:['⛔','var(--red-txt)','חסום']};
  const b=(t,ti,fn,c)=>`<button class="btn" style="font-size:10px;padding:2px 6px${c?';color:'+c:''}" title="${ti}" onclick="${fn}">${t}</button>`;
  return `<div style="margin:0 8px 8px;padding:6px 8px;border-right:2px solid var(--brd)">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--txt3)">📱 מכשירים
      <select style="font-size:11px;padding:1px 4px;width:auto" onchange="custEmailMax('${escj(code)}','${escj(x.e)}',this.value)">
        ${[0,1,2,3,5].map(n=>`<option value="${n}" ${n===x.max?'selected':''}>${n?'עד '+n:'ללא הגבלה'}</option>`).join('')}</select>
      <span>${ok} מאושרים${x.max?' מתוך '+x.max:''}</span></div>
    ${devs.length?devs.map(([id,d])=>{const L=lbl[d.st]||lbl.ok;return `<div style="display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0">
      <span title="${L[2]}">${L[0]}</span><span style="flex:1;color:${d.st==='ok'?'var(--txt2)':L[1]}">${esc(d.dev||'')} · נרשם ${fmt(d.at)}${d.seen?' · נראה '+fmt(d.seen):''}${d.st==='pending'?' · <b>ממתין לאישור</b>':''}</span>
      ${d.st!=='ok'?b('✅ אשר','אשר את המכשיר',`custDevSet('${escj(code)}','${escj(x.e)}','${escj(id)}','ok')`,'var(--green-txt)'):''}
      ${d.st!=='blocked'?b('⛔','חסום את המכשיר — לא יוכל לראות את ההזמנות',`custDevSet('${escj(code)}','${escj(x.e)}','${escj(id)}','blocked')`,'var(--red-txt)')
        :b('🗑','מחק מהרשימה — בכניסה הבאה ייחשב מכשיר חדש',`custDevSet('${escj(code)}','${escj(x.e)}','${escj(id)}','del')`)}</div>`;}).join('')
      :'<div style="font-size:11px;color:var(--txt3)">עדיין לא נכנסו מאף מכשיר</div>'}</div>`;
}
async function custEmailMax(code,e,v){
  const m={..._custEmails,[code]:_custList(code).map(x=>x.e===e?{...x,max:+v||0}:x)};
  if(await _custEmailSave(m))showToast('✅ נשמר');
}
async function custDevSet(code,e,id,st){
  if(!db||!S.fbConnected){showToast('⚠️ אין חיבור לשרת');return;}
  const x=_custList(code).find(y=>y.e===e);if(!x)return;
  const upd={};
  if(st==='del'){if(!confirm('למחוק את המכשיר מהרשימה? אם ייכנס שוב — ייחשב מכשיר חדש.'))return;upd['entries.'+id]=window._fb.deleteField();}
  else if(st==='blocked'){if(!confirm('לחסום את המכשיר? הוא לא יוכל לראות את ההזמנות עד שתאשר אותו שוב.'))return;upd['entries.'+id+'.st']='blocked';}
  else{
    upd['entries.'+id+'.st']='ok';
    // מעל ההגבלה ⇒ המכשיר המאושר שלא נראה הכי הרבה זמן נחסם (החלפת טלפון)
    const ok=_custDevsOf(x).filter(([k,d])=>k!==id&&d.st==='ok');
    if(x.max&&ok.length>=x.max){
      const drop=ok.slice(x.max-1);
      if(!confirm('מותרים '+x.max+' מכשירים וכולם בשימוש.\nאישור יחסום את: '+drop.map(([,d])=>d.dev).join(', ')+'.\nלהמשיך?'))return;
      drop.forEach(([k])=>{upd['entries.'+k+'.st']='blocked';});
    }
  }
  try{const{doc,updateDoc}=window._fb;await updateDoc(doc(db,'adminSettings','custDevices'),upd);showToast(st==='ok'?'✅ המכשיר אושר':st==='blocked'?'⛔ המכשיר נחסם':'🗑 נמחק');}
  catch(err){showToast('⚠️ השמירה נכשלה');}
}
const _custList=code=>(_custEmails[code]||[]).map(_custEnt);
const _trackUrl=()=>new URL('track.html',location.href).href.split('#')[0].split('?')[0];
function _custLinkHtml(code){
  const list=_custList(code),url=_trackUrl();
  const fmt=ms=>{const d=new Date(ms);return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());};
  const log=Object.values(_custLog).filter(r=>r&&r.cust===code).sort((a,b)=>b.at-a.at).slice(0,8);
  return `<div style="font-size:12px;font-weight:600;color:var(--txt3);margin-bottom:4px">📧 מעקב הזמנות — מיילים מורשים</div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:8px">הלקוח נכנס עם קישור שנשלח למייל שלו ורואה את שלב הייצור של ההזמנות שלו בלבד — בלי מחירים ובלי עובדים.</div>
    ${list.map(x=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span dir="ltr" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border-radius:8px;overflow:hidden;text-overflow:ellipsis">${esc(x.e)}</span>
      <a class="btn" style="font-size:11px;padding:3px 8px;text-decoration:none" target="_blank" rel="noopener" title="שלח בוואטסאפ קישור + המייל הזה" href="https://wa.me/?text=${encodeURIComponent('מעקב אחר ההזמנות שלכם (כניסה עם המייל '+x.e+'. אם המייל לא הגיע — בדקו בספאם): '+url)}">💬</a>
      <button class="btn" style="font-size:11px;padding:3px 8px;color:var(--red-txt)" title="הסר — המייל ייחסם מיד בכל המכשירים" onclick="custEmailDel('${escj(code)}','${escj(x.e)}')">✕</button></div>${_custDevHtml(code,x)}`).join('')}
    <div style="display:flex;gap:6px;margin-top:4px">
      <input type="email" id="cinfo-tmail" dir="ltr" placeholder="name@example.com" style="flex:1;font-size:12px;padding:6px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)" onkeydown="if(event.key==='Enter'){event.preventDefault();custEmailAdd('${escj(code)}')}"/>
      <button class="btn" style="font-size:12px" onclick="custEmailAdd('${escj(code)}')">➕ הוסף</button>
    </div>
    <a class="btn" style="display:block;text-align:center;font-size:12px;margin-top:6px;text-decoration:none" target="_blank" rel="noopener" title="דף המעקב בדיוק כפי שהלקוח רואה אותו — דרך הכניסה שלך כמנהל, בלי מייל" href="${esc(url+'?as='+encodeURIComponent(code))}">👁 תצוגת לקוח</a>
    ${_custNotifyHtml(code)}
    ${list.length?`<div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn" style="flex:1;font-size:12px" onclick="custLinkCopy()">📋 העתק קישור</button>
      <span style="flex:1;font-size:10px;color:var(--txt3);align-self:center">💬 ליד כל מייל — שולח את הקישור עם אותו מייל</span>
    </div>`:''}
    <div style="font-size:12px;font-weight:600;color:var(--txt3);margin:12px 0 4px">🕘 כניסות אחרונות</div>
    ${log.length?log.map(r=>`<div style="display:flex;gap:6px;font-size:11px;color:var(--txt2);padding:3px 0;border-bottom:1px solid var(--brd)">
      <span style="white-space:nowrap">${fmt(r.at)}</span><span dir="ltr" style="flex:1;overflow:hidden;text-overflow:ellipsis;text-align:right">${esc(r.email)}</span><span style="white-space:nowrap;color:var(--txt3)">${esc(r.dev||'')}</span></div>`).join('')
      :'<div style="font-size:11px;color:var(--txt3)">עדיין אין כניסות</div>'}`;
}
function _custLinkRefresh(){const el=document.getElementById('cinfo-link');if(el)el.innerHTML=_custLinkHtml(el.dataset.code);}
// ─── 🔔 שעות שליחת התראות ללקוחות (23/10/2026) — מנהל בלבד ────────────────
// adminSettings/custNotifyCfg = {def:{יום:[מ,עד]}, cust:{קוד:{יום:[מ,עד]}}} — יום = 0 (א') … 6 (ש'),
// יום שחסר = בלי התראות. customerNotify בשרת רץ כל 30 דק' ושולח ללקוח רק בתוך החלון שלו; עדכון
// שקרה מחוץ לשעות לא הולך לאיבוד — נשלח מאוחד בתחילת החלון הבא. NOTIFY_DEF_WIN — בקובץ המשותף.
let _custNotifyCfg={},_custPushToks={};
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): NOTIFY_DEF_WIN
const NOTIFY_DAYS=['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
const _notifyDefWin=()=>_custNotifyCfg.def||NOTIFY_DEF_WIN;
function _notifyWinTxt(w){
  const ds=[0,1,2,3,4,5,6].filter(d=>w&&w[d]);
  if(!ds.length)return 'בלי התראות';
  // ימים רצופים עם אותן שעות מקובצים: "א׳–ה׳ 07:00–18:00 · ו׳ 07:00–13:00"
  const out=[];let i=0;
  while(i<ds.length){let j=i;const h=w[ds[i]].join('–');
    while(j+1<ds.length&&ds[j+1]===ds[j]+1&&w[ds[j+1]].join('–')===h)j++;
    out.push((j>i?NOTIFY_DAYS[ds[i]]+'–'+NOTIFY_DAYS[ds[j]]:NOTIFY_DAYS[ds[i]])+' '+h);i=j+1;}
  return out.join(' · ');
}
function _notifyWinEditor(pfx,w){
  const t='font-size:12px;padding:3px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt);width:auto';
  return [0,1,2,3,4,5,6].map(d=>{const v=w&&w[d];return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0">
    <label style="display:flex;align-items:center;gap:4px;min-width:46px;cursor:pointer"><input type="checkbox" id="${pfx}-d${d}"${v?' checked':''} style="width:14px;height:14px;margin:0"/> ${NOTIFY_DAYS[d]}</label>
    <input type="time" id="${pfx}-f${d}" value="${v?v[0]:'07:00'}" style="${t}"/> – <input type="time" id="${pfx}-t${d}" value="${v?v[1]:'18:00'}" style="${t}"/>
  </div>`;}).join('');
}
function _notifyWinCollect(pfx){
  const w={};
  for(let d=0;d<7;d++){
    if(!document.getElementById(pfx+'-d'+d)?.checked)continue;
    const f=document.getElementById(pfx+'-f'+d)?.value||'',t=document.getElementById(pfx+'-t'+d)?.value||'';
    if(!/^\d\d:\d\d$/.test(f)||!/^\d\d:\d\d$/.test(t)||f>=t){alert('יום '+NOTIFY_DAYS[d]+': שעת ההתחלה חייבת להיות לפני שעת הסיום');return null;}
    w[d]=[f,t];
  }
  return w;
}
// ⚠️ setDoc בלי merge — הסרת לקוח מ-cust (חזרה לברירת המחדל) חייבת למחוק את המפתח בשרת
async function _custNotifySave(cfg){
  if(!db||!S.fbConnected){showToast('⚠️ אין חיבור לשרת');return false;}
  try{const{doc,setDoc}=window._fb;await setDoc(doc(db,'adminSettings','custNotifyCfg'),cfg);_custNotifyCfg=cfg;_custLinkRefresh();return true;}
  catch(e){showToast('⚠️ השמירה נכשלה');return false;}
}
function _custNotifyHtml(code){
  const devs=Object.values(_custPushToks).filter(t=>t&&t.cust===code).length;
  const own=(_custNotifyCfg.cust||{})[code];
  return `<div style="margin-top:12px;padding:8px 10px;border:1px solid var(--brd);border-radius:10px">
    <div style="font-size:12px;font-weight:600;color:var(--txt3)">🔔 התראות ללקוח</div>
    <div style="font-size:11px;color:var(--txt2);margin:3px 0 6px">📱 ${devs?(devs===1?'מכשיר אחד רשום להתראות':devs+' מכשירים רשומים להתראות'):'אף מכשיר עוד לא נרשם (הלקוח לוחץ "קבלו התראות" בדף המעקב)'}</div>
    <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer"><input type="radio" name="cnw-${esc(code)}" ${own?'':'checked'} onchange="custNotifyMode('${escj(code)}',false)" style="width:auto;margin:0"/> ברירת המחדל: <span style="color:var(--txt3)">${esc(_notifyWinTxt(_notifyDefWin()))}</span></label>
    <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;margin-top:3px"><input type="radio" name="cnw-${esc(code)}" ${own?'checked':''} onchange="custNotifyMode('${escj(code)}',true)" style="width:auto;margin:0"/> שעות מיוחדות ללקוח הזה${own?': <span style="color:var(--txt3)">'+esc(_notifyWinTxt(own))+'</span>':''}</label>
    <div id="cnw-ed" style="display:${own?'block':'none'};margin-top:6px">${_notifyWinEditor('cnw',own||_notifyDefWin())}
      <button class="btn" style="width:100%;font-size:12px;margin-top:5px" onclick="custNotifySaveCust('${escj(code)}')">💾 שמור שעות ללקוח</button></div>
    <button class="btn" style="width:100%;font-size:11px;margin-top:6px" onclick="openNotifyDefault()">⚙️ ברירת המחדל לכל הלקוחות</button>
  </div>`;
}
async function custNotifyMode(code,own){
  const ed=document.getElementById('cnw-ed');
  if(own){if(ed)ed.style.display='block';return;}
  if(ed)ed.style.display='none';
  if(!(_custNotifyCfg.cust||{})[code])return;
  const cust={...(_custNotifyCfg.cust||{})};delete cust[code];
  if(await _custNotifySave({..._custNotifyCfg,cust}))showToast('✅ הלקוח חזר לברירת המחדל');
}
async function custNotifySaveCust(code){
  const w=_notifyWinCollect('cnw');if(!w)return;
  if(await _custNotifySave({..._custNotifyCfg,cust:{...(_custNotifyCfg.cust||{}),[code]:w}}))showToast('✅ שעות ההתראות נשמרו: '+_notifyWinTxt(w));
}
function openNotifyDefault(){
  document.getElementById('cnd-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='cnd-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10001;padding:16px;overflow-y:auto';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:340px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:15px;font-weight:800;margin-bottom:4px">🔔 שעות התראות — ברירת מחדל</div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:8px">לכל הלקוחות, חוץ ממי שהוגדרו לו שעות מיוחדות. עדכון שקרה מחוץ לשעות נשלח מאוחד בתחילת השעות הבאות.</div>
    ${_notifyWinEditor('cnd',_notifyDefWin())}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn primary" style="flex:1;font-size:13px" onclick="custNotifySaveDef()">💾 שמור</button>
      <button class="btn" style="flex:1;font-size:13px" onclick="document.getElementById('cnd-wrap').remove()">ביטול</button>
    </div></div>`;
  document.body.appendChild(wrap);
}
async function custNotifySaveDef(){
  const w=_notifyWinCollect('cnd');if(!w)return;
  if(await _custNotifySave({..._custNotifyCfg,def:w})){document.getElementById('cnd-wrap')?.remove();showToast('✅ ברירת המחדל נשמרה: '+_notifyWinTxt(w));}
}
// ⚠️ **בלי merge בכוונה** — מחיקת מפתח ב-setDoc(merge) לא מוחקת אותו בשרת (כמו customerInfo).
// השמירה הראשונה גם מוחקת את tokens של הקישורים הישנים (לפני האימות במייל)
async function _custEmailSave(emails){
  if(!db||!S.fbConnected){showToast('⚠️ אין חיבור לשרת');return false;}
  try{const{doc,setDoc}=window._fb;await setDoc(doc(db,'adminSettings','custLinks'),{emails});_custEmails=emails;_custLinkRefresh();return true;}
  catch(e){showToast('⚠️ השמירה נכשלה');return false;}
}
async function custEmailAdd(code){
  const v=(document.getElementById('cinfo-tmail')?.value||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){showToast('⚠️ כתובת מייל לא תקינה');return;}
  // מייל אחד = לקוח אחד: השרת מזהה את הלקוח לפי המייל
  const other=Object.keys(_custEmails).find(c=>c!==code&&_custList(c).some(x=>x.e===v));
  if(other){showToast('⚠️ המייל כבר משויך ללקוח '+(S.customerNames?.[other]||other));return;}
  if(_custList(code).some(x=>x.e===v)){showToast('המייל כבר ברשימה');return;}
  if(await _custEmailSave({..._custEmails,[code]:[..._custList(code),{e:v,at:Date.now()}]}))showToast('✅ המייל נוסף');
}
async function custEmailDel(code,e){
  if(!confirm('להסיר את '+e+'? הגישה למעקב תיחסם מיד בכל המכשירים. גם אם יתווסף שוב — כל מכשיר יצטרך להיכנס מחדש עם קישור חדש.'))return;
  const m={..._custEmails},l=_custList(code).filter(x=>x.e!==e);
  if(l.length)m[code]=l;else delete m[code];
  if(await _custEmailSave(m))showToast('⛔ המייל הוסר');
}
function custLinkCopy(){
  const url=_trackUrl();
  (navigator.clipboard?.writeText(url)||Promise.reject()).then(()=>showToast('📋 הקישור הועתק')).catch(()=>prompt('העתק את הקישור:',url));
}
function saveCustomerInfo(code){
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const ci={addr:g('cinfo-addr'),city:g('cinfo-city'),contact:g('cinfo-contact'),phone:g('cinfo-phone'),taxId:g('cinfo-taxid')};
  // ✏️ שם הלקוח נערך מכאן — עד כאן הייתה רק הוספה ומחיקה, ותיקון שם (או הוספת
  // מילה לשם קיים) חייב מחיקה והקמה מחדש. שם ריק **לא מוחק** את השם הקיים:
  // מחיקה היא פעולה נפרדת ומכוונת, לא תופעת לוואי של שדה שהתרוקן.
  const newName=g('cinfo-name');
  if(newName&&newName!==(S.customerNames?.[code]||'')){
    if(!S.customerNames)S.customerNames={};
    S.customerNames[code]=newName;
    if(S.fbConnected)fbSet('appSettings','customerNames',S.customerNames);
  }
  if(!S.customerInfo)S.customerInfo={};
  const empty=!Object.values(ci).some(v=>v);
  if(empty)delete S.customerInfo[code]; else S.customerInfo[code]=ci;
  saveLS();
  // ⚠️ **בלי merge בכוונה.** fbSet הוא setDoc(merge:true) ולכן ריקון פרטי לקוח לא היה
  // מוחק את המפתח בשרת אלא משאיר את הכתובת הישנה (gotcha_fbset_merge_mapkeys). המפה
  // כולה יושבת במסמך אחד, ולכן החלפה מלאה היא הכתיבה הנכונה כאן.
  if(S.fbConnected&&db){
    try{const{doc,setDoc}=window._fb;setDoc(doc(db,'appSettings','customerInfo'),S.customerInfo).catch(()=>{});}catch(e){}
  }
  document.getElementById('cinfo-wrap')?.remove();
  renderAdmin();
  showToast('✅ פרטי הלקוח נשמרו');
}
function addCustomColor(){
  let code=(document.getElementById('col-code').value||'').trim();
  if(code.length===1)code='0'+code;
  const name=(document.getElementById('col-name').value||'').trim();
  if(!code||!name){alert('הזן קוד ושם צבע');return;}
  COLORS[code]=name;
  S.customColors[code]=name;
  document.getElementById('col-code').value='';
  document.getElementById('col-name').value='';
  saveLS();
  if(S.fbConnected)fbSet('appSettings','customColors',S.customColors);
  renderAdmin();
}
function delCustomColor(code){
  const builtIn={'01':1,'02':1,'03':1,'04':1,'05':1,'06':1,'07':1,'08':1,'09':1,'10':1,'11':1,'12':1,'13':1,'14':1,'15':1,'16':1,'17':1,'18':1,'19':1,'20':1};
  if(builtIn[code]){alert('לא ניתן למחוק צבע מובנה');return;}
  delete COLORS[code];
  delete S.customColors[code];
  saveLS();
  if(S.fbConnected)fbSet('appSettings','customColors',S.customColors);
  renderAdmin();
}
// הצגת שם לקוח — helper
function custName(code){return S.customerNames[code]?S.customerNames[code]+' ('+code+')':code;}

