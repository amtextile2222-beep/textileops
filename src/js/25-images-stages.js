// ─── תמונות מוצר — נטענות לפי דרישה ─────────────────────────────────────
// 🔑 התמונות **אינן** יושבות במסמך המוצר. הן ב-productImages/{id}, ונמשכות רק כשמסתכלים.
//
// למה: מסמכי products שקלו 17 MB, מהם 15.97 MB תמונות base64, והם נטענים ב-onSnapshot
// אצל **כל** משתמש בכל פתיחה — בזמן שלשונית המוצרים היא הרשאת מנהל בלבד. 19 מתוך 20
// המשתמשים הורידו תמונות שאין להם הרשאה לראות. בנוסף saveLS ניסה לכתוב 17 MB
// ל-localStorage (מכסה ~5 MB), נכשל ב-QuotaExceededError שנבלע ב-catch ריק, ולכן
// **המטמון המקומי מעולם לא נשמר** — כל פתיחה הורידה הכל מחדש. משם 15+ השניות.
//
// ⚠️ Firestore מחזיר מסמך שלם ב-onSnapshot — אין דרך לבקש "products בלי images".
// לכן ההפרדה לאוסף נפרד היא הפתרון היחיד ששומר על העדכון החי של כרטיס המוצר.
const _prodImgCache={};
// 📦 מסמך Firestore מוגבל ל-1MB (27/10/2026 — נכשל ב-~8 תמונות): התמונות מתחלקות לחלקים של עד ~900KB.
// productImages/{id} = חלק 0 + parts (כמה חלקים); החלקים הנוספים ב-productImages/{id}__1, __2…
// מסמך ישן בלי parts = חלק אחד — תואם אחורה.
const IMG_PART_MAX=900000;
function _imgChunks(imgs){
  const out=[[]];let sz=0;
  for(const im of imgs){const n=String(im).length;
    if(sz+n>IMG_PART_MAX&&out[out.length-1].length){out.push([]);sz=0;}
    out[out.length-1].push(im);sz+=n;}
  return out;
}
// strict = לפני שמירה: כשל בקריאה (רשת/חלק חסר) זורק במקום להחזיר [] — אחרת השמירה דורסת את התמונות הקיימות (02/11/2026)
async function fetchProdImgs(id,strict){
  if(_prodImgCache[id])return _prodImgCache[id];
  if(!S.fbConnected){if(strict)throw new Error('אין חיבור');return [];}
  try{const d=await fbGet('productImages',String(id));
    let arr=(d&&Array.isArray(d.images))?d.images:[];
    const parts=+(d&&d.parts)||1;
    if(parts>1){const more=await Promise.all(Array.from({length:parts-1},(_,i)=>fbGet('productImages',String(id)+'__'+(i+1))));
      more.forEach(m=>{if(m&&Array.isArray(m.images))arr=arr.concat(m.images);else if(strict)throw new Error('חלק תמונות חסר');});}
    _prodImgCache[id]=arr;return arr;
  }catch(e){if(strict)throw e;return [];}
}
// שמירת כל התמונות של מוצר (מחליפה את הקיימות). החלקים הנוספים נכתבים לפני הראשי (שקובע כמה לקרוא),
// ואחרי — מחיקת חלקים עודפים מהשמירה הקודמת. extra = שדות נוספים למסמך הראשי.
async function saveProdImgs(id,imgs,extra){
  id=String(id);
  let old=1;try{const d=await fbGet('productImages',id);old=+(d&&d.parts)||1;}catch(e){}
  if(!imgs.length){for(let i=0;i<old;i++){try{await fbDel('productImages',i?id+'__'+i:id);}catch(e){}}return;}
  const ch=_imgChunks(imgs);
  for(let i=1;i<ch.length;i++)await fbSet('productImages',id+'__'+i,{images:ch[i],part:i,of:id});
  await fbSet('productImages',id,{...(extra||{}),images:ch[0],count:imgs.length,parts:ch.length});
  for(let i=ch.length;i<old;i++){try{await fbDel('productImages',id+'__'+i);}catch(e){}}
  try{await _prodThumb(id,imgs);}catch(e){}
}
// 🖼 תמונות לדף הלקוח (08/11/2026) — thumbs/{מזהה} = {img (JPEG מוקטן), at}. אוסף נפרד: מסמך המוצר נטען לכל טלפון.
// מוצר: התמונה הראשונה (TH_PX=800px) + products.thumbAt/thumbSig (חתימה של התמונה הראשונה — לא כותבים שוב כשלא השתנתה).
// חומר של לקוח: thumbs/pk_<לקוח>_<פריט> + packStock.imgs['לקוח|פריט']=at (חלון המלאי, מנהל).
// customerTrack ?img= מגיש לדף הלקוח רק תמונה של אותו לקוח. ⚠️ trackThumb בשרת: הזמנה בלי — של הזמנה אחרת של הדגם
function _thumbShrink(src,max){
  return new Promise(res=>{if(!/^data:image\//.test(String(src||''))){res('');return;}
    const im=new Image();im.onerror=()=>res('');
    im.onload=()=>{let w=im.width,h=im.height;const k=Math.min(1,max/Math.max(w,h,1));w=Math.max(1,Math.round(w*k));h=Math.max(1,Math.round(h*k));
      const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);
      try{res(c.toDataURL('image/jpeg',0.75));}catch(e){res('');}};
    im.src=src;});
}
// v2 (08/11/2026): 800px במקום 360 — החתימה כוללת את הגרסה ⇒ תמונה מגרסה קודמת נבנית מחדש (בשמירה / ברקע)
const TH_V='v2',TH_PX=800;
const _thumbSig=src=>{src=String(src||'');return src?TH_V+':'+src.length+':'+src.slice(-40):'';};
async function _prodThumb(id,imgs){
  id=String(id);const p=S.products.find(x=>String(x.id)===id),src=(imgs||[]).find(x=>/^data:image\//.test(String(x||''))),sig=_thumbSig(src);
  if(p&&(p.thumbSig||'')===sig&&(!sig||+p.thumbAt))return;
  const img=sig?await _thumbShrink(src,TH_PX):'';
  let at=0;
  if(img){at=Date.now();await fbSet('thumbs',id,{img,at});}else{try{await fbDel('thumbs',id);}catch(e){}}
  if(p)Object.assign(p,{thumbAt:at,thumbSig:sig});
  await fbUpdateOnly('products',id,{thumbAt:at,thumbSig:sig}); // מוצר חדש עוד לא קיים ⇒ נכשל, ושמירת המוצר (fbSet של p) נושאת את השדות
}
// הזמנות שנשמרו לפני כן: המנהל מכין ברקע תמונה אחת לכל דגם (ההזמנה החדשה ביותר עם תמונות) — דגמים מ-120 הימים האחרונים
const _thumbBfDone=new Set();
async function _thumbBackfill(){
  if(S.user?.role!=='manager'||!S.fbConnected)return;
  const rk=x=>+x.createdAt||parseInt(String(x.id).replace(/\D/g,''))||0,from=Date.now()-120*86400000,mdl={};
  (S.products||[]).forEach(p=>{const k=p.cust+'|'+p.prod;(mdl[k]=mdl[k]||[]).push(p);});
  for(const l of Object.values(mdl)){
    if(!l.some(p=>rk(p)>=from))continue;
    // תמונה מגרסה קודמת ⇒ כל הזמנה שיש לה; בלי אף תמונה ⇒ ההזמנה החדשה ביותר עם תמונות
    const old=l.filter(p=>+p.thumbAt>0&&!String(p.thumbSig||'').startsWith(TH_V+':'));
    const go=old.length?old:l.some(p=>+p.thumbAt>0)?[]:l.filter(x=>prodImgCount(x)>0).sort((a,b)=>rk(b)-rk(a)).slice(0,1);
    for(const p of go){
      if(_thumbBfDone.has(p.id))continue;
      _thumbBfDone.add(p.id);
      try{const imgs=await fetchProdImgs(p.id,true);if(imgs.length)await _prodThumb(p.id,imgs);}catch(e){}
    }
  }
}
// כמה תמונות יש למוצר, בלי להוריד אותן. imgCount נכתב בשמירה; לרשומות שטרם עברו
// מיגרציה נופלים חזרה ל-p.images שעדיין קיים — ולכן הקוד עובד גם לפני שלב הניקוי.
function prodImgCount(p){
  if(p&&Array.isArray(p.images)&&p.images.length)return p.images.length;
  return +(p&&p.imgCount)||0;
}
async function loadProdImgs(id){
  const box=document.getElementById('pimg-'+id);if(!box)return;
  const p=S.products.find(x=>String(x.id)===String(id));
  box.innerHTML='<span style="font-size:11px;color:var(--txt3)">טוען תמונות…</span>';
  let imgs=(p&&Array.isArray(p.images)&&p.images.length)?p.images:await fetchProdImgs(id);
  if(!imgs.length){box.innerHTML='<span style="font-size:11px;color:var(--txt3)">אין תמונות</span>';return;}
  box.innerHTML='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+imgs.map(img=>
    '<img src="'+img+'" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--brd);cursor:pointer" onclick="viewImg('+"'"+String(id)+"'"+',this.src)">').join('')+'</div>';
}
function refreshImgPreview(){
  const el=document.getElementById('prod-img-preview');
  if(!el)return;
  el.innerHTML=_prodImgs.map((img,i)=>`<div style="position:relative"><img src="${img}" title="לחיצה — חיתוך" onclick="recropProdImg(${i})" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--brd);cursor:pointer"><button type="button" onclick="removeProdImg(${i})" style="position:absolute;top:-4px;right:-4px;background:var(--red);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1">✕</button>${i?`<button type="button" title="תמונה ראשית — מוצגת ללקוח בדף המעקב" onclick="mainProdImg(${i})" style="position:absolute;top:-4px;left:-4px;background:#fff;color:#f59e0b;border:1px solid var(--brd);border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1;padding:0">☆</button>`:`<span title="תמונה ראשית — מוצגת ללקוח בדף המעקב" style="position:absolute;top:-4px;left:-4px;background:#f59e0b;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;line-height:20px;text-align:center">⭐</span>`}<button type="button" title="חיתוך" onclick="recropProdImg(${i})" style="position:absolute;bottom:-4px;right:-4px;background:#333;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1">✂</button></div>`).join('');
}

// ⭐ תמונה ראשית (08/11/2026) — הראשונה ברשימה היא תמונת הדגם בדף הלקוח (_prodThumb בשמירה)
function mainProdImg(i){if(i>0&&i<_prodImgs.length){_prodImgs.unshift(..._prodImgs.splice(i,1));refreshImgPreview();}}
function removeProdImg(i){_prodImgs.splice(i,1);refreshImgPreview();}

async function addProdDocs(input){
  for(const file of input.files){
    if(file.size>2*1024*1024){alert(`הקובץ ${file.name} גדול מ-2MB`);continue;}
    const reader=new FileReader();
    await new Promise(res=>{reader.onload=e=>{
      _prodDocs.push({name:file.name,data:e.target.result});res();
    };reader.readAsDataURL(file);});
  }
  input.value='';
  refreshDocPreview();
}

function refreshDocPreview(){
  const el=document.getElementById('prod-doc-preview');
  if(!el)return;
  el.innerHTML=_prodDocs.map((d,i)=>`<div style="display:flex;align-items:center;gap:4px;background:var(--bg2);border-radius:5px;padding:3px 8px;font-size:11px">📄 ${esc(d.name)}<button type="button" onclick="removeProdDoc(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px">✕</button></div>`).join('');
}

function removeProdDoc(i){_prodDocs.splice(i,1);refreshDocPreview();}

// 📷 בטלפון — מצלמת המכשיר עצמה (איכות מלאה, פוקוס/פלאש), כמו בחלון הספירה; במחשב — מצלמת הרשת בתוך החלון
function prodCamBtn(){
  if(matchMedia('(pointer:coarse)').matches)document.getElementById('pm-img-cam').click();else openProdCamera();
}
async function openProdCamera(){
  document.getElementById('pm-camera-wrap').classList.remove('hidden');
  try{
    _prodCamStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    document.getElementById('pm-camera-video').srcObject=_prodCamStream;
  }catch(e){alert('לא ניתן לגשת למצלמה');closeProdCamera();}
}

async function snapProdPhoto(){
  const video=document.getElementById('pm-camera-video');
  const canvas=document.getElementById('pm-camera-canvas');
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  const out=await _imgPipeline(canvas.toDataURL('image/jpeg',0.92)); // ✂️ חיתוך לפני ההוספה
  if(out){_prodImgs.push(out);refreshImgPreview();}
}

function closeProdCamera(){
  if(_prodCamStream){_prodCamStream.getTracks().forEach(t=>t.stop());_prodCamStream=null;}
  const w=document.getElementById('pm-camera-wrap');if(w)w.classList.add('hidden');
}

// ─── PRODUCTION STAGES ───────────────────────────────────────
function renderStagesHtml(p){
  const log=Array.isArray(p?.stageLog)?p.stageLog:[];
  const skipped=Array.isArray(p?.stageSkipped)?p.stageSkipped:[];
  const rows=PROD_STAGES.map((s,i)=>{
    const entry=log.find(e=>e.id===s.id);
    const isSkipped=skipped.includes(s.id);
    const bg=entry?'var(--green-bg)':isSkipped?'var(--bg2)':'var(--card)';
    const txt=entry?'var(--green-txt)':isSkipped?'var(--txt3)':'var(--txt)';
    const dateVal=entry?.date||'';
    const timeVal=entry?.time||'';
    const noteVal=entry?.note||'';
    return `<tr style="border-bottom:1px solid var(--brd)">
      <td style="padding:6px 4px;font-size:12px;color:${txt};background:${bg};border-radius:4px;min-width:140px">${s.label}${s.optional?'<span style="font-size:10px;color:var(--txt3)"> (אופ׳)</span>':''}</td>
      <td style="padding:4px">
        <input type="date" value="${dateVal}" data-sid="${s.id}" data-sf="date" style="font-size:11px;padding:2px 4px;border-radius:5px;border:1px solid var(--brd);background:var(--card);color:var(--txt);width:120px">
      </td>
      <td style="padding:4px">
        <input type="time" value="${timeVal}" data-sid="${s.id}" data-sf="time" style="font-size:11px;padding:2px 4px;border-radius:5px;border:1px solid var(--brd);background:var(--card);color:var(--txt);width:80px">
      </td>
      <td style="padding:4px">
        <input type="text" value="${esc(noteVal)}" data-sid="${s.id}" data-sf="note" placeholder="הערה" style="font-size:11px;padding:2px 4px;border-radius:5px;border:1px solid var(--brd);background:var(--card);color:var(--txt);width:90px">
      </td>
      <td style="padding:4px;white-space:nowrap">
        <button type="button" class="btn" style="font-size:11px;padding:3px 8px" onclick="stageSetNow('${s.id}')">⏱ עכשיו</button>
        ${s.optional?`<button type="button" class="btn" style="font-size:11px;padding:3px 6px;margin-right:2px;opacity:${isSkipped?1:0.5}" onclick="stageToggleSkip('${s.id}')" title="לא רלוונטי">${isSkipped?'↩':'✕'}</button>`:''}
        ${entry?`<button type="button" class="btn warn" style="font-size:11px;padding:3px 6px;margin-right:2px" onclick="stageClear('${s.id}')" title="נקה">🗑</button>`:''}
      </td>
    </tr>`;
  }).join('');
  return `<div class="sec" style="margin-top:14px;margin-bottom:8px">📍 שלב ייצור נוכחי</div>
  <div style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:12px" id="pm-stages-table">
    <thead><tr style="border-bottom:2px solid var(--brd)">
      <th style="padding:5px;text-align:right">שלב</th>
      <th style="padding:5px;text-align:right">תאריך</th>
      <th style="padding:5px;text-align:right">שעה</th>
      <th style="padding:5px;text-align:right">הערה</th>
      <th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function stageSetNow(sid){
  const now=new Date();
  const date=now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
  const time=pad2(now.getHours())+':'+pad2(now.getMinutes());
  const tbl=document.getElementById('pm-stages-table');
  if(!tbl)return;
  tbl.querySelector(`[data-sid="${sid}"][data-sf="date"]`).value=date;
  tbl.querySelector(`[data-sid="${sid}"][data-sf="time"]`).value=time;
}
function stageToggleSkip(sid){
  // toggle ויזואלי — נשמר ב-saveProduct
  const tbl=document.getElementById('pm-stages-table');
  if(!tbl)return;
  const row=tbl.querySelector(`[data-sid="${sid}"][data-sf="date"]`)?.closest('tr');
  if(!row)return;
  const btn=row.querySelector('button[title="לא רלוונטי"]');
  if(!btn)return;
  const isNowSkipped=btn.textContent.trim()==='↩';
  btn.textContent=isNowSkipped?'✕':'↩';
  btn.style.opacity=isNowSkipped?'0.5':'1';
  row.cells[0].style.opacity=isNowSkipped?'1':'0.4';
}
function stageClear(sid){
  const tbl=document.getElementById('pm-stages-table');
  if(!tbl)return;
  tbl.querySelector(`[data-sid="${sid}"][data-sf="date"]`).value='';
  tbl.querySelector(`[data-sid="${sid}"][data-sf="time"]`).value='';
  tbl.querySelector(`[data-sid="${sid}"][data-sf="note"]`).value='';
}
function readStagesFromModal(){
  const tbl=document.getElementById('pm-stages-table');
  if(!tbl)return{stageLog:[],stageSkipped:[]};
  const stageLog=[];
  const stageSkipped=[];
  PROD_STAGES.forEach(s=>{
    const date=tbl.querySelector(`[data-sid="${s.id}"][data-sf="date"]`)?.value||'';
    const time=tbl.querySelector(`[data-sid="${s.id}"][data-sf="time"]`)?.value||'';
    const note=tbl.querySelector(`[data-sid="${s.id}"][data-sf="note"]`)?.value||'';
    if(date||time)stageLog.push({id:s.id,date,time,note});
    if(s.optional){
      const btn=tbl.querySelector(`button[onclick="stageToggleSkip('${s.id}')"]`);
      if(btn&&btn.textContent.trim()==='↩')stageSkipped.push(s.id);
    }
  });
  // השלב האחרון עם תאריך = השלב הנוכחי
  return{stageLog,stageSkipped};
}
// 👕 סימון דגם ראשון בכרטיס המוצר — המחיר הקבוע נכנס לשדה המחיר (ניתן לעריכה)
function pmSampleToggle(cb){
  if(!cb.checked)return;
  const el=document.getElementById('pm-price');
  if(el){el.value=SAMPLE_UNIT_PRICE;syncProfitFields('price');}
}
async function saveProduct(){
  if(_prodImgsLoading==='fail'){alert('התמונות של המוצר לא נטענו — סגור ופתח שוב את החלון. השמירה עכשיו הייתה מוחקת אותן.');return;}
  if(_prodImgsLoading){showToast('⏳ התמונות עדיין נטענות — נסה שוב בעוד רגע','var(--amber-txt)');return;}
  const prod=(document.getElementById('pm-prod')?.value||'').trim().padStart(5,'0').slice(0,5);
  const cust=(document.getElementById('pm-cust')?.value||'').trim().padStart(2,'0').slice(0,2);
  const name=(document.getElementById('pm-name')?.value||'').trim();
  if(!prod||prod==='00000'){alert('יש להזין מספר מוצר');return;}
  // 🔢 08/10: לקוח ריק נשמר כ-'00' ⇒ מספר ההזמנה חושב ללקוח 00 (#001) ונשאר כך גם אחרי תיקון ל-02
  if(!(document.getElementById('pm-cust')?.value||'').trim()){alert('יש להזין מספר לקוח');return;}
  // קמויות
  const quantities=[];
  let szLetters=!!document.getElementById('pm-szlet')?.checked; // 👕 אות שהוקלדה בטבלה מסמנת את ההזמנה כמידות באותיות
  document.querySelectorAll('#pm-qty-body tr').forEach(tr=>{
    const _sz=tr.querySelector('[data-qf="size"]')?.value||'',size=szDigit(_sz);
    if(size!==_sz.trim())szLetters=true;
    const color=tr.querySelector('[data-qf="color"]')?.value||'';
    const qty=parseInt(tr.querySelector('[data-qf="qty"]')?.value)||0;
    if(size||color)quantities.push({size,color,qty});
  });
  closeProdCamera();
  const {stageLog,stageSkipped}=readStagesFromModal();
  // בדיקה: שורת שלב עבודה שמולאה (רמה/תחנה/דקות/מהיר) אך ללא שם — לא לזרוק בשקט
  const _stepRows=[...document.querySelectorAll('#pm-tasksteps-list .ts-row')];
  const _namelessFilled=_stepRows.some(r=>{
    const nm=(r.querySelector('[data-f="name"]')?.value||'').trim();
    const lvl=parseInt(r.querySelector('[data-f="level"]')?.value)||0;
    const stn=r.querySelector('[data-f="station"]')?.value||'';
    const mm=parseFloat(r.querySelector('[data-f="manualMin"]')?.value)||0;
    const qk=!!r.querySelector('[data-f="quick"]')?.checked;
    const mg=!!r.querySelector('[data-f="merge"]')?.checked;
    const ct=!!r.querySelector('[data-f="cut"]')?.checked;
    return !nm&&(lvl||stn||mm||qk||mg||ct);
  });
  if(_namelessFilled){alert('⚠️ יש שלב עבודה ללא שם — מלא שם בשדה הראשון (עברית) או מחק את השורה, ואז שמור שוב.');return;}
  const workSteps=_stepRows.map(r=>({
    name:r.querySelector('[data-f="name"]')?.value.trim()||'',
    nameAr:r.querySelector('[data-f="nameAr"]')?.value.trim()||'',
    level:parseInt(r.querySelector('[data-f="level"]')?.value)||0,
    station:r.querySelector('[data-f="station"]')?.value||'',
    altStations:_rowAltStations(r),
    manualMin:parseFloat(r.querySelector('[data-f="manualMin"]')?.value)||0,
    quick:!!r.querySelector('[data-f="quick"]')?.checked,
    merge:!!r.querySelector('[data-f="merge"]')?.checked,
    cut:!!r.querySelector('[data-f="cut"]')?.checked
  })).filter(s=>s.name);
  workSteps.splice(0,workSteps.length,...sortStepsByDept(workSteps));
  const unitPrice=parseFloat(document.getElementById('pm-price')?.value)||0;
  const targetProfitPct=parseFloat(document.getElementById('pm-profit')?.value)||0;
  const directMaterialsCost=parseFloat(document.getElementById('pm-materials')?.value)||0;
  // 🧵 חומרים בתוספת — הלקוח משלם אותם מעבר למחיר; **לא** נכנסים לחישוב תקציב העבודה
  const extraMatPrice=parseFloat(document.getElementById('pm-extramat')?.value)||0;
  // ✂ מחיר הגזירה — הכנסה נוספת ליחידה, נפרדת ממחיר המכירה, עם **אחוז רווח יעד משלה**.
  // ריק נשמר כ-`null` ולא כ-0: 0 הוא "גזירה בלי רווח", null הוא "לא הוזן ⇒ לפי התפירה".
  const cutPrice=parseFloat(document.getElementById('pm-cutprice')?.value)||0;
  const _cpv=document.getElementById('pm-cutprofit')?.value;
  const cutProfitPct=(_cpv!=null&&_cpv!==''&&isFinite(+_cpv))?Math.max(0,Math.min(99,+_cpv)):null;
  const isSample=!!document.getElementById('pm-sample')?.checked;
  const estQty=Math.max(0,parseInt(document.getElementById('pm-estqty')?.value)||0); // 📏 לצפי בלבד (estQtyOf)
  const cons=pmConsCollect(); // 🧵 צריכה ליחידה — מלאי תפירה/גזירה (pstkCalc)
  if(_editProdId){
    const p=S.products.find(x=>x.id===_editProdId);
    if(p){
      // זהה שלבים חדשים שנוספו — שלח התראה לטלגרם
      const oldStageIds=(p.stageLog||[]).map(s=>s.id);
      const newStages=stageLog.filter(s=>!oldStageIds.includes(s.id));
      if(newStages.length){
        const now=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
        for(const s of newStages){
          const stageName=PROD_STAGES.find(x=>x.id===s.id)?.label||s.id;
          sendTelegram('📦 TextileOps — מוצר עבר שלב ייצור\n🏷 מוצר: '+name+' ('+cust+'-'+prod+')\n📍 שלב: '+stageName+'\n📅 תאריך: '+s.date+' '+s.time+'\n🕐 עודכן: '+now).catch(()=>{});
        }
      }
      // 🔢 מספר ההזמנה שייך ללקוח+מוצר. שינוי שלהם בעריכה, או מספר שכבר תפוס ע"י הזמנה אחרת של
      // אותו דגם (נצפה 08/10: 02-03413 קיבלה #001 כפול) ⇒ מספור מחדש. רשומה בלי מספר (0) — לא נוגעים
      // בכפילות — רק הרשומה **החדשה** מבין השתיים מתמספרת; הישנה שומרת את המספר שעל המדבקות שלה
      const _oNo=parseInt(p.orderNo,10)||0,_rk=x=>+x.createdAt||parseInt(String(x.id).replace(/\D/g,''))||0;
      if(_oNo&&(p.cust!==cust||p.prod!==prod||prodMatches(cust,prod).some(x=>x.id!==p.id&&(parseInt(x.orderNo,10)||0)===_oNo&&_rk(x)<_rk(p)))){
        const{orderNo}=await newProdOrderFields(cust,prod);
        if(orderNo!==_oNo){p.orderNo=orderNo;showToast('🔢 מספר ההזמנה עודכן ל-#'+String(orderNo).padStart(3,'0')+' — אם כבר הודפסו ברקודים, יש להדפיס מחדש','var(--amber-txt)',8000);}
      }
      Object.assign(p,{prod,cust,name,images:_prodImgs,imgCount:_prodImgs.length,docs:_prodDocs,quantities,stageLog,stageSkipped,workSteps,unitPrice,targetProfitPct,directMaterialsCost,cutPrice,cutProfitPct,extraMatPrice,isSample,estQty,cons,szLetters});
    }
  }else{
    const id='p'+Date.now();
    // הקמת מוצר = קבלת סחורה: סימון אוטומטי של שלב 'receive' אם לא הוזן ידנית
    if(!stageLog.some(s=>s.id==='receive')){
      const now=new Date();
      stageLog.unshift({id:'receive',date:now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate()),time:pad2(now.getHours())+':'+pad2(now.getMinutes()),note:'',auto:true});
      stageLog.sort((a,b)=>PROD_STAGES.findIndex(x=>x.id===a.id)-PROD_STAGES.findIndex(x=>x.id===b.id));
    }
    const _ordF=await newProdOrderFields(cust,prod);
    S.products.push({id,createdAt:Date.now(),..._ordF,prod,cust,name,images:_prodImgs,imgCount:_prodImgs.length,docs:_prodDocs,quantities,stageLog,stageSkipped,workSteps,unitPrice,targetProfitPct,directMaterialsCost,cutPrice,cutProfitPct,extraMatPrice,isSample,estQty,cons,szLetters});
  }
  saveLS();
  if(S.fbConnected){
    const p=S.products.find(x=>x.id===(_editProdId||S.products[S.products.length-1].id));
    if(p){
      // 🔑 התמונות נכתבות לאוסף הנפרד, ומסמך המוצר נושא רק את המונה.
      // ⚠️ fbSet הוא setDoc(merge:true) ולכן **אינו מוחק** שדה images קיים —
      // הניקוי של הרשומות הישנות נעשה במיגרציה, לא כאן.
      const imgs=Array.isArray(p.images)?p.images:[];
      try{await saveProdImgs(p.id,imgs,{migratedAt:Date.now(),srcCust:p.cust,srcProd:p.prod});}
      catch(e){alert('שמירת התמונות נכשלה: '+(e.message||e));}
      _prodImgCache[p.id]=imgs;
      const out={...p,imgCount:imgs.length,docs:(p.docs||[]).map(d=>({name:d.name,data:d.data}))};
      delete out.images;
      await fbSet('products',p.id,out);
    }
  }
  closeProdModal();renderProducts();
  _expMap={}; // התמחור אולי השתנה — ניקוי cache של צפי הזמן
  recalcActiveExpected(cust,prod); // עדכון צפי במשימות פעילות של המוצר (אם התמחור/דק' השתנו)
}

async function deleteProduct(id){
  const p=S.products.find(x=>x.id===id);if(!p)return;
  // בדיקה: יש משימות פעילות למוצר זה?
  const activeProd=S.activeTasks.filter(t=>t.cust===p.cust&&t.prod===p.prod);
  if(activeProd.length){
    alert('⛔ לא ניתן למחוק — יש '+activeProd.length+' משימות פעילות למוצר זה.\nסגור את המשימות תחילה.');
    return;
  }
  if(!confirm('למחוק את המוצר "'+p.name+'" ('+p.cust+'-'+p.prod+')?\nהפעולה בלתי הפיכה.'))return;
  S.products=S.products.filter(x=>x.id!==id);
  if(S.fbConnected){
    await fbDel('products',id);
    try{await saveProdImgs(id,[]);}catch(e){} // אחרת נשארות תמונות יתומות (כולל החלקים הנוספים)
    try{await fbDel('productPricing',String(id));}catch(e){} // וגם תמחור יתום
  }
  delete _prodImgCache[id];
  saveLS();renderProducts();
}

// 🔍 תמונה במסך מלא עם זום (24/10/2026): בנייד הדפדפן מגדיל בצביטה, במחשב לא היה שום דרך.
// גלגלת = זום לכיוון העכבר · לחיצה כפולה = ×2.5 / חזרה · גרירה = הזזה כשמוגדל · + − ✕ · Esc.
// לחיצה על הרקע (לא על התמונה) סוגרת, כמו קודם; גרירה שהסתיימה על הרקע לא סוגרת.
function viewImg(prodId,src){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:pinch-zoom';
  const bs='width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:20px;cursor:pointer';
  ov.innerHTML=`<img draggable="false" style="max-width:95vw;max-height:90vh;border-radius:10px;object-fit:contain;transform-origin:0 0;cursor:zoom-in;user-select:none;will-change:transform">
    <div style="position:absolute;top:12px;left:12px;display:flex;gap:8px">
      <button data-z="close" title="סגור (Esc)" style="${bs}">✕</button>
      <button data-z="in" title="הגדל" style="${bs}">+</button>
      <button data-z="out" title="הקטן" style="${bs}">−</button>
    </div>
    <div data-hint style="position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:12px;color:rgba(255,255,255,.6);pointer-events:none">גלגלת או לחיצה כפולה להגדלה · גרירה להזזה</div>`;
  const img=ov.querySelector('img'),hint=ov.querySelector('[data-hint]');img.src=src;
  let s=1,x=0,y=0,drag=null,moved=false;
  const apply=()=>{img.style.transform=`translate(${x}px,${y}px) scale(${s})`;img.style.cursor=s>1?(drag?'grabbing':'grab'):'zoom-in';hint.style.display=s>1?'none':'';};
  // זום סביב נקודה (px,py במסך) — הנקודה שמתחת לעכבר נשארת במקומה
  const zoomAt=(ns,px,py)=>{
    ns=Math.max(1,Math.min(8,ns));
    const r=img.getBoundingClientRect(),ox=r.left-x,oy=r.top-y; // מיקום התמונה בלי ההזזה
    const ix=(px-r.left)/s,iy=(py-r.top)/s;                     // הנקודה בקואורדינטות התמונה
    s=ns;
    if(s===1){x=0;y=0;}else{x=px-ox-ix*s;y=py-oy-iy*s;}
    apply();
  };
  const mid=()=>{const r=img.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];};
  const close=()=>{ov.remove();document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')close();else if(e.key==='+'||e.key==='=')zoomAt(s*1.4,...mid());else if(e.key==='-')zoomAt(s/1.4,...mid());};
  document.addEventListener('keydown',onKey);
  ov.addEventListener('wheel',e=>{e.preventDefault();zoomAt(s*(e.deltaY<0?1.2:1/1.2),e.clientX,e.clientY);},{passive:false});
  img.addEventListener('dblclick',e=>{e.stopPropagation();zoomAt(s>1?1:2.5,e.clientX,e.clientY);});
  img.addEventListener('pointerdown',e=>{if(s<=1||e.pointerType==='touch')return;drag={sx:e.clientX-x,sy:e.clientY-y};moved=false;img.setPointerCapture(e.pointerId);apply();});
  img.addEventListener('pointermove',e=>{if(!drag)return;x=e.clientX-drag.sx;y=e.clientY-drag.sy;moved=true;apply();});
  img.addEventListener('pointerup',()=>{drag=null;apply();});
  img.addEventListener('click',e=>e.stopPropagation());
  ov.querySelectorAll('[data-z]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const z=b.dataset.z;
    if(z==='close')close();else zoomAt(z==='in'?s*1.5:s/1.5,...mid());}));
  ov.addEventListener('click',()=>{if(moved){moved=false;return;}close();});
  document.body.appendChild(ov);
}

