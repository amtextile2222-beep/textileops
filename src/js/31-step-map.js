// ─── 📍 מפת שלבים על תמונת הדגם (18/11/2026, החלטת המשתמש) ─────────────────────
// על תמונה אחת או שתיים מתמונות המוצר (קדימה / גב) מסמנים נקודה ממוספרת לכל שלב עבודה — איפה בבגד הוא נעשה.
// products.stepMap = {v:[אינדקס תמונה קדימה|null, אינדקס תמונה גב|null], pins:[{s:שם השלב, v:0|1, x, y}]}
// x/y באחוזים מהתמונה ⇒ נכון בכל גודל מסך ובהדפסה. המספר על הנקודה = מספר השלב ברשימה (כמו בדף השלבים).
// • עריכה: חלון המוצר ⇒ "📍 מפת שלבים" (_pmStepMap, נשמר עם המוצר ב"שמור"). מחיקה/החלפת סדר תמונות
//   מעדכנות את האינדקסים (_smRemap מ-mainProdImg/removeProdImg).
// • דף השלבים לרצפה (printWorkSteps): התמונות עם הנקודות, מתחת לטבלה (_smPrintBlock).
// • סריקה: 📍 ליד שלב שיש לו נקודה ⇒ התמונה עם הנקודה של השלב הזה בלבד (showStepPin).
let _pmStepMap={v:[null,null],pins:[]},_smView=0,_smSel='';
const SM_VIEWS=['קדימה · أمام','גב · خلف'];
function _smClone(m){
  const v=Array.isArray(m?.v)?[m.v[0]??null,m.v[1]??null]:[null,null];
  const pins=Array.isArray(m?.pins)?m.pins.filter(p=>p&&p.s&&(p.v===0||p.v===1)).map(p=>({s:String(p.s),v:p.v,x:+p.x||0,y:+p.y||0})):[];
  return{v,pins};
}
// שמות השלבים מהחלון הפתוח (כולל שינויים שלא נשמרו), לפי הסדר
function _smStepNames(){return[...document.querySelectorAll('#pm-tasksteps-list .ts-row')].map(r=>r.querySelector('[data-f="name"]')?.value.trim()||'').filter(Boolean);}
// לשמירה: נקודות של שלבים שנמחקו / תמונה שלא קיימת — נזרקות
function _smClean(names){
  const m=_smClone(_pmStepMap),ok=new Set(names||[]);
  m.v=m.v.map(i=>i!=null&&i>=0&&i<_prodImgs.length?i:null);
  m.pins=m.pins.filter(p=>ok.has(p.s)&&m.v[p.v]!=null);
  return m.pins.length?m:null;
}
// סדר התמונות השתנה בחלון: f(אינדקס ישן) ⇒ חדש / null (נמחקה ⇒ גם הנקודות שעליה)
function _smRemap(f){
  const m=_pmStepMap;if(!m)return;
  m.v=m.v.map(i=>i==null?null:f(i));
  m.pins=m.pins.filter(p=>m.v[p.v]!=null);
}
function _smPinHtml(n,x,y,big,dim){
  const sz=big?34:22;
  return`<div style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);width:${sz}px;height:${sz}px;border-radius:50%;background:${big?'#e11d48':'#1d4ed8'};color:#fff;font:700 ${big?16:12}px Arial;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);${dim?'opacity:.35;':''}pointer-events:none">${n}</div>`;
}
// ── עורך ──
function openStepMap(){
  if(!_prodImgs.length){alert('אין תמונות למוצר — העלה קודם תמונה (קדימה, ואם צריך גם גב)');return;}
  const names=_smStepNames();if(!names.length){alert('אין שלבי עבודה — הוסף שלבים קודם');return;}
  if(!_smSel||!names.includes(_smSel))_smSel=names.find(n=>!_pmStepMap.pins.some(p=>p.s===n))||names[0];
  document.getElementById('sm-ov')?.remove();
  const o=document.createElement('div');o.id='sm-ov';
  o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10060;display:flex;align-items:flex-start;justify-content:center;padding:10px;overflow-y:auto';
  document.body.appendChild(o);_smRender();
}
function _smRender(){
  const o=document.getElementById('sm-ov');if(!o)return;
  const names=_smStepNames(),m=_pmStepMap,vi=m.v[_smView];
  const num=n=>names.indexOf(n)+1;
  const tabs=SM_VIEWS.map((t,i)=>`<button class="btn${i===_smView?' primary':''}" style="flex:1;font-size:13px" onclick="_smView=${i};_smRender()">${t}${m.v[i]!=null?' · '+m.pins.filter(p=>p.v===i).length:''}</button>`).join('');
  let body;
  if(vi==null||!_prodImgs[vi]){
    body=`<div style="font-size:13px;margin:8px 0">בחר תמונה ל"${SM_VIEWS[_smView].split(' ·')[0]}":</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${_prodImgs.map((im,i)=>`<img src="${im}" onclick="_pmStepMap.v[${_smView}]=${i};_smRender()" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:2px solid var(--brd);cursor:pointer">`).join('')}</div>`;
  }else{
    const pins=m.pins.filter(p=>p.v===_smView);
    body=`<div style="font-size:12px;color:var(--txt3);margin:6px 0">בחר שלב ברשימה ולחץ על המקום שלו בתמונה. לחיצה על נקודה = בחירת השלב שלה.</div>
      <div style="position:relative;display:inline-block;max-width:100%;line-height:0;cursor:crosshair" onclick="_smPlace(event,this)">
        <img src="${_prodImgs[vi]}" style="max-width:100%;max-height:58vh;display:block;border-radius:8px;user-select:none" draggable="false">
        ${pins.map(p=>_smPinHtml(num(p.s),p.x,p.y,p.s===_smSel,false)).join('')}
      </div>
      <div style="margin-top:6px"><button class="btn" style="font-size:12px" onclick="if(confirm('להחליף את התמונה? הנקודות על הצד הזה יימחקו'))_pmStepMap.pins=_pmStepMap.pins.filter(p=>p.v!==${_smView}),_pmStepMap.v[${_smView}]=null,_smRender()">🔄 החלף תמונה</button></div>`;
  }
  const list=names.map((n,i)=>{const on=m.pins.filter(p=>p.s===n).map(p=>p.v===0?'ק':'ג').join('+');
    return`<div onclick="_smSel=${JSON.stringify(n).replace(/"/g,'&quot;')};_smRender()" style="display:flex;gap:6px;align-items:center;padding:5px 8px;border-radius:7px;cursor:pointer;font-size:13px;margin-bottom:3px;background:${n===_smSel?'var(--blue-bg,#dbeafe)':'var(--bg2)'};${n===_smSel?'font-weight:700':''}">
      <b style="min-width:22px;text-align:center">${i+1}</b><span style="flex:1">${esc(n)}</span>${on?`<span style="font-size:11px;color:var(--green-txt)">📍${on}</span>`:''}
      ${n===_smSel&&m.pins.some(p=>p.s===n&&p.v===_smView)?`<button class="btn" style="font-size:11px;padding:2px 8px" onclick="event.stopPropagation();_pmStepMap.pins=_pmStepMap.pins.filter(p=>!(p.s===_smSel&&p.v===_smView));_smRender()">🗑</button>`:''}</div>`;}).join('');
  o.innerHTML=`<div style="background:var(--card,#fff);color:var(--txt);border-radius:14px;padding:14px;max-width:760px;width:100%;margin:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:16px">📍 מפת שלבים</b>
      <button class="btn primary" onclick="document.getElementById('sm-ov').remove();showToast('📍 נשמר בחלון — לחץ שמור במוצר','var(--txt2)',3500)">✔ סיום</button></div>
    <div style="display:flex;gap:6px;margin-bottom:6px">${tabs}</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:1 1 320px;min-width:0;text-align:center">${body}</div>
      <div style="flex:1 1 220px;max-height:62vh;overflow-y:auto">${list}</div>
    </div></div>`;
}
function _smPlace(e,box){
  const pinsHere=_pmStepMap.pins.filter(p=>p.v===_smView);
  const r=box.getBoundingClientRect();
  const x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));
  // לחיצה על נקודה קיימת (עד ~3% ממנה) ⇒ בחירת השלב שלה
  const hit=pinsHere.find(p=>Math.hypot((p.x-x)*r.width/100,(p.y-y)*r.height/100)<16);
  if(hit){_smSel=hit.s;_smRender();return;}
  if(!_smSel)return;
  _pmStepMap.pins=_pmStepMap.pins.filter(p=>!(p.s===_smSel&&p.v===_smView));
  _pmStepMap.pins.push({s:_smSel,v:_smView,x:+x.toFixed(1),y:+y.toFixed(1)});
  // ממשיכים לשלב הבא שעוד אין לו נקודה
  const names=_smStepNames(),i=names.indexOf(_smSel);
  _smSel=names.slice(i+1).find(n=>!_pmStepMap.pins.some(p=>p.s===n))||_smSel;
  _smRender();
}
// ── דף השלבים לרצפה: התמונות עם המספרים (names = השלבים לפי סדר הטבלה) ──
function _smPrintBlock(names){
  const m=_smClean(names);if(!m)return'';
  const num=n=>names.indexOf(n)+1;
  const views=[0,1].filter(i=>m.v[i]!=null&&m.pins.some(p=>p.v===i));
  if(!views.length)return'';
  return`<div class="keep" style="margin-top:14px"><h3>📍 מיקום השלבים בדגם</h3><div style="display:flex;gap:10px;justify-content:center">${views.map(i=>
    `<div style="flex:1;text-align:center;max-width:${views.length>1?'49%':'70%'}"><div style="position:relative;display:inline-block;line-height:0">
      <img src="${_prodImgs[m.v[i]]}" style="max-width:100%;max-height:120mm;display:block;border:1px solid #888">
      ${m.pins.filter(p=>p.v===i).map(p=>_smPinHtml(num(p.s),p.x,p.y,false,false)).join('')}</div>
      <div style="font-size:12px;margin-top:3px">${SM_VIEWS[i]}</div></div>`).join('')}</div></div>`;
}
// ── סריקה: 📍 ליד שלב ⇒ התמונה עם הנקודה של השלב הזה ──
const stepHasPin=(p,name)=>!!(p?.stepMap?.pins||[]).some(x=>x.s===name);
async function showStepPin(pid,name){
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p)return;
  const m=_smClone(p.stepMap),pins=m.pins.filter(x=>x.s===name);if(!pins.length)return;
  document.getElementById('sp-ov')?.remove();
  const o=document.createElement('div');o.id='sp-ov';
  o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:10070;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:8px';
  o.onclick=()=>o.remove();
  o.innerHTML=`<div style="color:#fff;font-size:15px">⏳</div>`;document.body.appendChild(o);
  const imgs=await fetchProdImgs(pid);
  const n=(p.workSteps||[]).map(s=>stepName(s)).indexOf(name)+1;
  const views=[...new Set(pins.map(x=>x.v))].filter(v=>m.v[v]!=null&&imgs[m.v[v]]);
  if(!views.length){o.innerHTML='<div style="color:#fff">התמונה לא נמצאה</div>';return;}
  o.innerHTML=`<div style="color:#fff;font-size:17px;font-weight:700;text-align:center">${n?n+'. ':''}${esc(name)}</div>
    <div style="display:flex;gap:8px;justify-content:center;max-width:100%">${views.map(v=>`<div style="text-align:center;flex:1;min-width:0">
      <div style="position:relative;display:inline-block;line-height:0;max-width:100%"><img src="${imgs[m.v[v]]}" style="max-width:100%;max-height:${views.length>1?'70vh':'78vh'};display:block;border-radius:8px">
      ${pins.filter(x=>x.v===v).map(x=>_smPinHtml(n||'📍',x.x,x.y,true,false)).join('')}</div>
      <div style="color:#ddd;font-size:12px;margin-top:4px">${SM_VIEWS[v]}</div></div>`).join('')}</div>
    <div style="color:#aaa;font-size:12px">לחץ לסגירה · اضغط للإغلاق</div>`;
}
