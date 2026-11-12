// ─── 📄 תעודת משלוח ──────────────────────────────────────────
// סדר מידות: מספריות לפי ערך, ואחריהן אותיות לפי סדר מידות מקובל (S<M<L<XL).
// בלי זה המיון היה לקסיקוגרפי — "10" לפני "2", ו-"XL" לפני "M".
const DN_SIZES=['XXS','XS','S','M','L','XL','XXL','2XL','XXXL','3XL','4XL'];
function dnSizeRank(s){
  const u=String(s??'').toUpperCase().trim();
  const n=parseFloat(u);
  if(!isNaN(n)&&/^[\d.]+$/.test(u))return n;
  const i=DN_SIZES.indexOf(u);
  return i>=0?1000+i:2000;
}
// מטריצת צבעים×מידות — **המבנה שהמפעל כבר מוציא היום ללקוחות**: צבע בשורה,
// מידה בעמודה. רשימה שטוחה של שורה לכל צירוף הייתה נותנת 24 שורות ל-6 מידות
// ו-4 צבעים; כאן זה 4 שורות, וזה גם מה שהלקוח כבר מכיר ויודע לקרוא.
function dnMatrix(rows){
  const sizes=[...new Set(rows.map(r=>String(r.size??'')))].sort((a,b)=>dnSizeRank(a)-dnSizeRank(b)||String(a).localeCompare(String(b)));
  const at=new Map(rows.map(r=>[String(r.size??'')+'|'+String(r.color??'')+'|'+(r.grade||GRADE_A),parseInt(r.qty)||0]));
  const cell=(c,g,s)=>at.get(s+'|'+c+'|'+g)||0;
  // 🏷️ שורה לכל **צבע × סוג** — כמו בתעודה הידנית ("אפור סוג א" / "אפור סוג ב").
  // שורת סוג ב מודפסת רק כשיש בה כמות: ברוב המשלוחים היא ריקה, ושורה ריקה על
  // מסמך שנמסר ללקוח רק מבלבלת.
  const colors=[...new Set(rows.map(r=>String(r.color??'')))];
  const colorRows=[];
  colors.forEach(c=>{
    [GRADE_A,GRADE_B].forEach(g=>{
      const cells=sizes.map(s=>cell(c,g,s));
      const total=cells.reduce((t,v)=>t+v,0);
      if(g===GRADE_B&&!total)return;
      colorRows.push({color:c,grade:g,label:(COLORS[c]||c||'—')+' סוג '+g,cells,total});
    });
  });
  // ✂ לא תפור — שורות בסוף, **מחוץ לסה"כ** (הסה"כ = מה שמחויב)
  colors.forEach(c=>{
    const cells=sizes.map(s=>cell(c,GRADE_U,s)),total=cells.reduce((t,v)=>t+v,0);
    if(total)colorRows.push({color:c,grade:GRADE_U,u:true,label:(COLORS[c]||c||'—')+' — ✂ לא תפור',cells,total});
  });
  const billed=colorRows.filter(r=>!r.u);
  return{
    sizes,
    colorRows,
    sizeTotals:sizes.map((s,i)=>billed.reduce((t,r)=>t+r.cells[i],0)),
    grand:billed.reduce((t,r)=>t+r.total,0)
  };
}
// נבנית מ-shippedRows (מה ש**באמת** יצא). מוצר שסומן כיצא לפני שהפיצול לשורות
// נוסף שמור רק כסכום — ואז מוצג פירוט ההזמנה עם הערה גלויה שאין פירוט יציאה,
// כדי שלא תיווצר תעודה שנראית מדויקת אבל מתארת את המתוכנן ולא את הנשלח.
// טבלה ולא grid בכוונה: כרום מתעלם מ-break-inside:avoid על פריטי grid וחותך
// את השורה האחרונה בדף (ראה gotcha_print_grid_pagebreak); ל-thead יש חזרה מובנית.
// idx = איזה משלוח להדפיס (ברירת מחדל: האחרון). כל משלוח = תעודה עם מספר משלו.
// 🍎 אייפון/אייפד: Safari מתעלם מ-@page margin:0 — מוסיף כתובת/תאריך ומפצל לשני עמודים (נצפה 13/10).
// שם ההדפסה עוברת דרך אותו PDF של וואטסאפ (עמוד אחד, נקי) ⇒ חלון השיתוף ⇒ "הדפסה".
const _isIOS=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
async function printDeliveryNote(pid,idx){
  if(_isIOS()){await shareDeliveryNote(pid,idx,true);return;}
  const r=await dnEnsureNo(pid,idx);
  if(r)printViaIframe(deliveryNoteHtml(r.p,r.list[r.i],r.i,r.list.length));
}
// ─── 💬 תעודת משלוח בוואטסאפ (13/10/2026) ─────────────────────────
// אותו HTML בדיוק כמו בהדפסה (deliveryNoteHtml) ⇒ צילום ב-html2canvas ⇒ PDF ב-jsPDF.
// טלפון/מחשב עם Web Share (קבצים) — חלון השיתוף של המערכת ⇒ וואטסאפ. אחרת: ה-PDF יורד
// ונפתח wa.me לטלפון הלקוח (פרטי לקוח) עם הודעה מוכנה — את הקובץ גוררים לשיחה.
// ⚠️ navigator.share דורש לחיצה "טרייה": הצילום לוקח שניות, ולכן השיתוף יוצא מכפתור
// בחלון אישור **אחרי** שה-PDF מוכן ולא מהלחיצה הראשונה (בלי זה אייפון דוחה בשקט).
let _h2cP=null;
function _loadH2C(){
  if(window.html2canvas)return Promise.resolve();
  return _h2cP=_h2cP||new Promise((ok,no)=>{const sc=document.createElement('script');
    sc.integrity='sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H';sc.crossOrigin='anonymous';
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    sc.onload=ok;sc.onerror=()=>{_h2cP=null;no(new Error('html2canvas לא נטען'));};document.head.appendChild(sc);});
}
const _waPhone=ph=>{let d=String(ph||'').replace(/\D/g,'');if(d.startsWith('0'))d='972'+d.slice(1);return d.length>=11?d:'';};
// html = מסמך אחד או מערך מסמכים (💬 כמה תעודות — 31/10/2026): כל מסמך מתחיל בעמוד חדש באותו PDF
async function _dnPdfBlob(html){
  await _loadH2C();
  await _lib('jspdf').catch(()=>{});const J=window.jspdf&&window.jspdf.jsPDF;if(!J)throw new Error('ספריית PDF עדיין נטענת — נסה שוב עוד רגע');
  const doc=new J({unit:'mm',format:'a4',orientation:'portrait'});
  let pages=0;const add=(...a)=>{if(pages++)doc.addPage();doc.addImage(...a);};
  for(const one of [].concat(html)){
    const fr=document.createElement('iframe');
    fr.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
    document.body.appendChild(fr);
    try{
      const d=fr.contentWindow.document;d.open();d.write(one);d.close();
      await new Promise(ok=>setTimeout(ok,500));
      d.body.style.padding='10mm'; // כמו בהדפסה (@media print)
      const cv=await html2canvas(d.body,{scale:2,backgroundColor:'#ffffff',windowWidth:794,useCORS:true});
      const pagePx=Math.floor(cv.width*297/210); // גובה עמוד A4 בפיקסלים של הצילום
      // 📱 באייפון הצילום יוצא מעט גבוה מעמוד (גובה ה-iframe/ריפוד) ⇒ נוצר עמוד 2 ריק (נצפה 13/10 ב-0698).
      // עד 15% מעל עמוד — מכווצים לעמוד אחד; פרוסה אחרונה של פחות מ-8% (שוליים לבנים) — מדלגים.
      if(cv.height<=pagePx*1.15){
        const w=Math.min(210,297*cv.width/cv.height);
        add(cv.toDataURL('image/jpeg',0.92),'JPEG',(210-w)/2,0,w,w*cv.height/cv.width);
        continue;
      }
      for(let y=0,pg=0;y<cv.height;y+=pagePx,pg++){
        const h=Math.min(pagePx,cv.height-y);
        if(pg&&h<pagePx*0.08)break;
        const c=document.createElement('canvas');c.width=cv.width;c.height=h;
        const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,h);x.drawImage(cv,0,y,cv.width,h,0,0,cv.width,h);
        add(c.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,h*210/cv.width);
      }
    }finally{fr.remove();}
  }
  return doc.output('blob');
}
// 🍎 הדפסה באייפון — Safari מתעלם מ-@page (כתובת + עמודים מיותרים) ⇒ PDF ⇒ חלון השיתוף ⇒ "הדפסה";
// בלי שיתוף — פותחים את ה-PDF בלשונית. משותף לתעודת משלוח ולדף שלבי העבודה.
async function _printPdfBlob(blob,name){
  const file=new File([blob],name,{type:'application/pdf'});
  const canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));
  if(!await showConfirm('🖨 '+esc(name),canShare?'ה-PDF מוכן. בחלון השיתוף בחר "הדפסה".':'ה-PDF ייפתח בלשונית חדשה — הדפס משם.','🖨 הדפס','ביטול'))return;
  if(canShare){try{await navigator.share({files:[file]});return;}catch(e){if(e?.name==='AbortError')return;}}
  const u=URL.createObjectURL(blob);window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),120000);
}
async function shareDeliveryNote(pid,idx,forPrint){
  const r=await dnEnsureNo(pid,idx);if(!r)return;
  const p=r.p,sh=r.list[r.i];
  let html=deliveryNoteHtml(p,sh,r.i,r.list.length);
  const slot='<span class="sig-slot"></span>';
  if(html.includes(slot)){ // ✍ חתימת העסק — אותה שאלה כמו בהדפסה (_sigPrint)
    let img=null;
    try{const sig=await bizSigGet();if(sig&&await showConfirm('✍ חתימה','להפיק את המסמך עם חתימת העסק?','✍ עם חתימה','בלי חתימה'))img=sig;}catch(e){}
    html=html.split(slot).join(img?`<img src="${img}" alt="" style="display:block;max-height:58px;max-width:180px;margin:-6px 0 -20px"/>`:'');
  }
  showToast('⏳ מכין PDF…','var(--txt3)',4000);
  let blob;
  try{blob=await _dnPdfBlob(html);}catch(e){alert('הכנת ה-PDF נכשלה: '+(e?.message||e));return;}
  const no=String(sh.no||0).padStart(4,'0');
  // שם קובץ באנגלית בלבד: וואטסאפ במחשב הציג שם עברי כג'יבריש (×ª×¢...) — נצפה 13/10
  const name='delivery-note-'+no+'.pdf';
  const text='תעודת משלוח '+no+' · '+(p.name||p.prod)+' · '+(+sh.total||0)+" יח'";
  if(forPrint){await _printPdfBlob(blob,name);return;}
  await _waSharePdf(blob,name,text,_waPhone((S.customerInfo||{})[p.cust]?.phone));
}
// מחזיר {p,list,i} של משלוח מוכן להדפסה — ואם אין לו עדיין מספר, מקצה ושומר.
async function dnEnsureNo(pid,idx){
  const p=(S.products||[]).find(x=>x.id===pid);
  if(!p){showToast('⚠ מוצר לא נמצא','var(--red-txt)');return null;}
  let list=prodShipments(p);
  if(!list.length){showToast('⚠ למוצר הזה לא נרשמה יציאה','var(--red-txt)');return null;}
  const i=(idx==null||idx<0||idx>=list.length)?list.length-1:idx;
  // משלוח שנרשם לפני המספור (או לפני מאגר המשלוחים) מקבל מספר בהדפסה הראשונה ונשמר
  if(!list[i].no){
    const n=await nextDeliveryNoteNo();
    if(n){
      list=list.map((s,k)=>k===i?{...s,no:n,date:s.date||new Date().toISOString().slice(0,10)}:s);
      p.shipments=list;p.dnNo=n;p.dnDate=p.dnDate||list[i].date;
      saveLS();
      if(S.fbConnected)try{await fbSet('products',p.id,{...p});}catch(e){}
      try{renderProducts();}catch(e){}
    }
  }
  return {p,list,i};
}
// 🖨 כמה תעודות בהדפסה אחת — כל תעודה בעמוד משלה. כל תעודה נבנית ב-deliveryNoteHtml
// כמו בהדפסה בודדת (אין מסלול שני שיכול להיפרד ממנה); לוקחים את ה-<style> מהראשונה
// ואת גוף כל אחת עוטפים ב-.pg. הריפוד עובר מ-body ל-.pg — אחרת רק העמוד הראשון מרופד.
async function printDeliveryNotes(rows){
  if(!rows.length){showToast('⚠ לא סומנו תעודות','var(--red-txt)');return;}
  const sorted=rows.slice().sort((a,b)=>((+a.s.no||1e9)-(+b.s.no||1e9))||String(a.s.date||'').localeCompare(String(b.s.date||'')));
  const parts=[];
  // ברצף ולא במקביל — תעודות בלי מספר מקבלות מספרים עוקבים לפי הסדר
  for(const r of sorted){
    const x=await dnEnsureNo(r.p.id,r.i);
    if(x)parts.push(deliveryNoteHtml(x.p,x.list[x.i],x.i,x.list.length));
  }
  if(!parts.length)return;
  const style=(parts[0].match(/<style>[\s\S]*?<\/style>/)||[''])[0];
  const bodies=parts.map(h=>'<div class="pg">'+((h.match(/<body>([\s\S]*)<\/body>/)||[])[1]||'')+'</div>').join('');
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/><title>תעודות משלוח (${parts.length})</title>${style}<style>
body{padding:0!important}
.pg{padding:16mm 14mm;break-after:page;page-break-after:always}
.pg:last-child{break-after:auto;page-break-after:auto}
@media print{.pg{padding:10mm}}
</style></head><body>${bodies}</body></html>`);
  try{renderDNotes();}catch(e){}
}
// 💬 כמה תעודות בוואטסאפ (31/10/2026) — PDF אחד, כל תעודה בעמוד משלה (אותו סדר ומספור כמו בהדפסה).
// חתימת העסק — שאלה אחת לכולן; לקוח אחד בלבד ⇒ wa.me לטלפון שלו
async function shareDeliveryNotes(rows){
  if(!rows.length){showToast('⚠ לא סומנו תעודות','var(--red-txt)');return;}
  const sorted=rows.slice().sort((a,b)=>((+a.s.no||1e9)-(+b.s.no||1e9))||String(a.s.date||'').localeCompare(String(b.s.date||'')));
  const got=[];
  for(const r of sorted){const x=await dnEnsureNo(r.p.id,r.i);if(x)got.push(x);}
  if(!got.length)return;
  let parts=got.map(x=>deliveryNoteHtml(x.p,x.list[x.i],x.i,x.list.length));
  const slot='<span class="sig-slot"></span>';
  if(parts.some(h=>h.includes(slot))){
    let img=null;
    try{const sig=await bizSigGet();if(sig&&await showConfirm('✍ חתימה','להפיק את התעודות עם חתימת העסק?','✍ עם חתימה','בלי חתימה'))img=sig;}catch(e){}
    parts=parts.map(h=>h.split(slot).join(img?`<img src="${img}" alt="" style="display:block;max-height:58px;max-width:180px;margin:-6px 0 -20px"/>`:''));
  }
  showToast('⏳ מכין PDF ('+parts.length+' תעודות)…','var(--txt3)',6000);
  let blob;
  try{blob=await _dnPdfBlob(parts);}catch(e){alert('הכנת ה-PDF נכשלה: '+(e?.message||e));return;}
  try{renderDNotes();}catch(e){}
  const nos=got.map(x=>String(x.list[x.i].no||0).padStart(4,'0'));
  const name=parts.length===1?'delivery-note-'+nos[0]+'.pdf':'delivery-notes-'+nos[0]+'-'+nos[nos.length-1]+'.pdf';
  const units=got.reduce((t,x)=>t+(+x.list[x.i].total||0),0);
  const text=(parts.length===1?'תעודת משלוח ':'תעודות משלוח ')+nos.join(', ')+' · '+units+" יח'";
  const custs=[...new Set(got.map(x=>x.p.cust))];
  await _waSharePdf(blob,name,text,custs.length===1?_waPhone((S.customerInfo||{})[custs[0]]?.phone):'');
}
// חלון ההדפסה בלשונית תעודות משלוח: תעודות מסומנות (כל אחת בעמוד) / התחשבנות.
function dnPrintDialog(){
  document.getElementById('dnp-wrap')?.remove();
  const all=dnFiltered().rows.length,sel=dnFiltered(true).rows.length;
  const b=(on,ic,t,sub,dis)=>`<button class="btn${dis?'':' primary'}" ${dis?'disabled style="opacity:.5;cursor:default;':'style="'}width:100%;text-align:right;padding:10px 12px;margin-bottom:8px;font-size:14px" onclick="${on}"><b>${ic} ${t}</b><div style="font-size:11px;font-weight:400;opacity:.85;margin-top:2px">${sub}</div></button>`;
  const wrap=document.createElement('div');
  wrap.id='dnp-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:4px">🖨 הדפסה</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:12px">${sel?`סומנו <b style="color:var(--txt)">${sel}</b> תעודות מתוך ${all} שבסינון`:'לא סומנו תעודות — סמן ☑ בטבלה כדי להדפיס כמה תעודות יחד'}</div>
    ${b("document.getElementById('dnp-wrap')?.remove();printDeliveryNotes(dnFiltered(true).rows)",'📄',sel?`הדפס ${sel===1?'תעודה אחת':sel+' תעודות'} מסומנות`:'הדפס תעודות מסומנות','כל תעודה בעמוד נפרד, בהדפסה אחת',!sel)}
    ${b("document.getElementById('dnp-wrap')?.remove();shareDeliveryNotes(dnFiltered(true).rows)",'💬',sel?`שלח ${sel===1?'תעודה אחת':sel+' תעודות'} מסומנות בוואטסאפ`:'שלח תעודות מסומנות בוואטסאפ','PDF אחד — כל תעודה בעמוד משלה',!sel)}
    ${b("document.getElementById('dnp-wrap')?.remove();printSettlement(true)",'🧾','התחשבנות — רק המסומנות','דוח אחד עם שורה לכל תעודה מסומנת',!sel)}
    ${b("document.getElementById('dnp-wrap')?.remove();printSettlement()",'🧾','התחשבנות — כל התעודות שבסינון',all+' תעודות לפי הסינון במסך',!all)}
    ${b(`document.getElementById('dnp-wrap')?.remove();printProforma(${sel?'true':'false'})`,'🧾','חשבונית עסקה'+(sel?' — רק המסומנות':' — כל שבסינון'),'מספר חשבונית + מע"מ '+(S.settings?.vatPct??18)+'% · ללקוח אחד',!(sel||all))}
    ${b(`document.getElementById('dnp-wrap')?.remove();printSettlement(${sel?'true':'false'},true)`,'📋','רשימה בלי מחירים'+(sel?' — רק המסומנות':' — כל שבסינון'),'כמויות, חבילות ואריזה — לנהג / למחסן',!(sel||all))}
    <button class="btn" style="width:100%;font-size:14px;margin-top:4px" onclick="document.getElementById('dnp-wrap')?.remove()">ביטול</button>
  </div>`;
  document.body.appendChild(wrap);
}
// מחיקת משלוח שנרשם בטעות. **המספר לא ממוחזר** — ייתכן שהנייר כבר נמסר ללקוח,
// ומספר שחוזר על שני משלוחים שונים הוא בלגן שאי אפשר לתקן בדיעבד.
async function delShipment(pid,idx){
  const p=(S.products||[]).find(x=>x.id===pid);
  if(!p)return;
  const list=prodShipments(p);
  const s=list[idx];
  if(!s)return;
  if(!await showConfirm('מחיקת משלוח','למחוק את תעודה '+String(s.no||0).padStart(4,'0')+' ('+s.total+" יח')?\nהמספר לא יוחזר לשימוש, והתעודה תסומן כבוטלה ברשימת התעודות.",'מחק','ביטול'))return;
  // 🕳 הביטול נרשם **לפני** ההסרה מהמערך — אחרי שהמשלוח יורד אין מאיפה לקחת
  // את הלקוח, הדגם והכמות, והחור ברצף היה נשאר בלי שם.
  dnVoidAdd({no:+s.no||0,date:s.date||'',at:new Date().toISOString(),cust:p.cust||'',
    prod:p.prod||'',name:p.name||'',orderNo:parseInt(p.orderNo,10)||0,total:+s.total||0,
    by:S.user?.id||'',byName:S.user?.name||S.user?.user||''});
  const left=list.filter((_,k)=>k!==idx);
  p.shipments=left;
  p.shippedQty=left.reduce((t,x)=>t+(+x.total||0),0);
  p.shippedRows=mergeShipRows(left);
  p.dnNo=left.length?left[left.length-1].no:0;
  if(!left.length){delete p.shippedAt;p.shippedQty=null;p.stageLog=(p.stageLog||[]).filter(e=>e.id!=='shipped');}
  saveLS();
  if(S.fbConnected)try{await fbReplaceFields('products',p.id,{shipments:left,shippedQty:p.shippedQty,shippedRows:p.shippedRows,dnNo:p.dnNo,stageLog:p.stageLog||[]});}catch(e){}
  showToast('🗑 המשלוח נמחק');
  try{buildStageReport();}catch(e){}
  try{renderProducts();}catch(e){}
  try{renderDNotes();}catch(e){}
}
// ↔ העברת תעודה להזמנה אחרת של אותו דגם (09/10/2026, מנהל). לפני מספרי ההזמנה, משלוח נרשם
// על ההזמנה **האחרונה** של הדגם (5215: ה-81 של #002 נרשמו על #003). התעודה עוברת כמו שהיא —
// מספר, תאריך, כמויות, אריזה — ושתי ההזמנות מחושבות מחדש. לא נרשם ביטול: המספר לא נשרף.
// ⚠️ תעודה בלי מספר מזוהה בחשבונית ידנית לפי מוצר|מיקום — להעביר **לפני** סימון החשבונית.
function _shipRecalc(p,list){
  p.shipments=list;
  p.shippedQty=list.length?list.reduce((t,x)=>t+(+x.total||0),0):null;
  p.shippedRows=mergeShipRows(list);
  p.dnNo=list.reduce((m,x)=>Math.max(m,+x.no||0),0);
  if(!Array.isArray(p.stageLog))p.stageLog=[];
  if(!list.length){delete p.shippedAt;p.stageLog=p.stageLog.filter(e=>e.id!=='shipped');return;}
  const last=list.reduce((a,x)=>String(x.date||'')>String(a.date||'')?x:a,list[0]);
  if(!p.shippedAt)p.shippedAt=last.at||new Date().toISOString();
  const note='משלוח '+list.length+': '+(+list[list.length-1].total||0)+" יח' · סה\"כ "+p.shippedQty+" יח'";
  const ex=p.stageLog.find(e=>e.id==='shipped');
  if(ex){ex.note=note;ex.auto=true;}
  else{p.stageLog.push({id:'shipped',date:last.date||todayStr(),time:'',note,auto:true});
    p.stageLog.sort((a,b)=>PROD_STAGES.findIndex(x=>x.id===a.id)-PROD_STAGES.findIndex(x=>x.id===b.id));}
}
async function moveShipment(pid,idx){
  if(S.user?.role!=='manager')return;
  const p=(S.products||[]).find(x=>x.id===pid);if(!p)return;
  const list=prodShipments(p),s=list[idx];if(!s)return;
  const others=prodMatches(p.cust,p.prod).filter(x=>x.id!==p.id);
  if(!others.length){showToast('⚠ אין הזמנה אחרת לדגם הזה','var(--amber-txt)');return;}
  const lbl=x=>((parseInt(x.orderNo,10)||0)?'#'+String(x.orderNo).padStart(3,'0')+' ':'')+(x.name||x.prod)+' — הוזמנו '+_prodQty(x)+(x.shippedQty!=null?' · יצאו '+x.shippedQty:'');
  const hd=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  const to=await new Promise(res=>{
    const w=document.createElement('div');
    w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px';
    w.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:440px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-size:16px;font-weight:800;margin-bottom:8px">↔ העברת תעודה להזמנה אחרת</div>
      <div style="font-size:13px;line-height:1.7;margin-bottom:10px">תעודה <b>${s.no?String(s.no).padStart(4,'0'):'בלי מספר'}</b> מ-${hd(s.date)} · <b>${+s.total||0} יח'</b><br>כרגע על: ${esc(lbl(p))}</div>
      <label style="font-size:12px;font-weight:600">להעביר אל:</label>
      <select id="mv-to" style="width:100%;font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt);margin-top:4px">${others.map(x=>`<option value="${esc(x.id)}">${esc(lbl(x))}</option>`).join('')}</select>
      <div style="font-size:11px;color:var(--txt3);margin-top:6px">המספר, התאריך, הכמויות והאריזה עוברים כמו שהם.</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn primary" style="flex:1" id="mv-ok">העבר</button>
        <button class="btn" style="flex:1" id="mv-no">ביטול</button>
      </div></div>`;
    document.body.appendChild(w);
    const done=v=>{w.remove();res(v);};
    w.querySelector('#mv-ok').onclick=()=>done(w.querySelector('#mv-to').value);
    w.querySelector('#mv-no').onclick=()=>done(null);
  });
  if(!to)return;
  const q=(S.products||[]).find(x=>x.id===to);if(!q)return;
  // ⚠️ שתי הרשימות נבנות מ-prodShipments — שדות ותיקים (shippedRows בלבד) הופכים למערך shipments
  const from=list.filter((_,k)=>k!==idx);
  const dest=prodShipments(q).concat([{...s,movedFrom:p.id,movedAt:new Date().toISOString(),movedBy:S.user?.name||''}]);
  _shipRecalc(p,from);_shipRecalc(q,dest);
  saveLS();
  if(S.fbConnected)try{
    await fbReplaceFields('products',p.id,{shipments:p.shipments,shippedQty:p.shippedQty,shippedRows:p.shippedRows,dnNo:p.dnNo,stageLog:p.stageLog||[]});
    await fbReplaceFields('products',q.id,{shipments:q.shipments,shippedQty:q.shippedQty,shippedRows:q.shippedRows,dnNo:q.dnNo,stageLog:q.stageLog||[],shippedAt:q.shippedAt||null});
  }catch(e){showToast('⚠ השמירה נכשלה: '+(e.message||''),'var(--red-txt)',6000);return;}
  showToast('↔ התעודה הועברה ל'+lbl(q));
  try{buildStageReport();}catch(e){}
  try{renderProducts();}catch(e){}
  try{renderDNotes();}catch(e){}
}
// ─── ✏️ עריכת חומר האריזה של תעודה קיימת ──────────────────────
// חומר האריזה נוסף למערכת אחרי שכבר הונפקו תעודות, ולכן לכל המשלוחים הישנים אין
// אריזה ואי אפשר לחייב עליה. כאן מזינים אותה בדיעבד. **רק האריזה נערכת** —
// המספר, התאריך והכמויות לא ניתנים לשינוי מכאן, כי הנייר כבר אצל הלקוח.
// 🔑 גם המחיר נערך, ולא רק הכמות: המחיר נצרב על המשלוח, ובתעודה ישנה הוא או חסר
// או נצרב לפי מחירון שהשתנה מאז — בלי שדה מחיר אי אפשר היה לתקן אותו בכלל.
// ─── ✏️ עריכת תעודת משלוח שכבר הונפקה ────────────────────────
// עד כאן תעודה עם טעות הייתה חייבת להימחק ולהיות מונפקת מחדש — והמספר נשרף
// (ראה dnVoidAdd). זה יצר חור ברצף על כל טעות הקלדה. כאן מתקנים במקום:
// **המספר והתאריך לא משתנים**, כי הנייר אצל הלקוח נושא אותם; משתנים רק
// הכמויות, האריזה וההערה. חומר האריזה נערך בחלון הנפרד שלו (editShipMats).
// 🛑 המאזן המודפס ("יתרה להשלמה") מחושב מסכום כל המשלוחים **עד לתעודה הזו
// כולל**, ולכן עריכת תעודה שאינה האחרונה מזיזה את היתרה בכל התעודות שאחריה.
// זה לא נחסם — אבל נאמר במפורש לפני השמירה.
function editShipment(pid,idx){
  const p=(S.products||[]).find(x=>x.id===pid);
  const list=p?prodShipments(p):[];
  const s=list[idx];
  if(!p||!s)return;
  document.getElementById('shl-wrap')?.remove();
  document.getElementById('esh-wrap')?.remove();
  const hd=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  const after=list.length-1-idx;
  const wrap=document.createElement('div');
  wrap.id='esh-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:2px">✏️ עריכת תעודת משלוח</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:9px">תעודה <b style="color:var(--txt)">${s.no?String(s.no).padStart(4,'0'):'—'}</b> · ${hd(s.date)} · ${esc(p.name||p.prod||'')}</div>
    <div style="font-size:11px;color:var(--blue-txt,#1e40af);background:var(--blue-bg,#dbeafe);padding:6px 8px;border-radius:8px;margin-bottom:8px">🔒 <b>המספר והתאריך לא משתנים</b> — הנייר שכבר נמסר ללקוח נושא אותם. מתקנים רק כמויות, אריזה והערה.</div>
    ${after?`<div style="font-size:11px;font-weight:700;color:var(--amber-txt);background:var(--amber-bg);padding:6px 8px;border-radius:8px;margin-bottom:8px">⚠ זו אינה התעודה האחרונה — יש ${after} תעודות אחריה. שינוי הכמות כאן מזיז את שורת "יתרה להשלמה" בכולן.</div>`:''}
    <label style="font-size:13px;font-weight:600">כמות בתעודה הזו — פר מידה וצבע</label>
    <div id="ship-rows-wrap" style="margin-top:6px">${shipRowsHtml(p,s)}</div>
    <details id="ship-pack-det" style="margin-top:10px;border:1px solid var(--brd);border-radius:8px;padding:7px 9px"${packsCount(s.packs)||outerTxt(s.outer)?' open':''}>
      <summary style="font-size:12px;font-weight:700;cursor:pointer">📦 אריזה — <span id="pack-sum" style="font-weight:600;color:var(--txt3)">לא הוזנה</span></summary>
      <div style="font-size:11px;color:var(--txt3);margin:7px 0">כל גודל חבילה בשורה: 35 חבילות × 5 יח'. שורה נוספת לכל גודל אחר.</div>
      <div id="pack-rows">${shipPackRowsHtml(s.packs)}</div>
      <button class="btn" style="width:100%;font-size:12px;padding:5px;margin-top:4px" onclick="addPackRow()">➕ עוד גודל חבילה</button>
      ${shipOuterHtml(s.outer)}
    </details>
    <div style="margin-top:9px">
      <label style="font-size:12px;font-weight:600">📝 הערה לתעודה</label>
      <input id="ship-note" type="text" maxlength="140" value="${esc(s.note||'')}" placeholder="לא חובה — תודפס בתעודה" style="width:100%;margin-top:4px;font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)"/>
    </div>
    ${shipOrigHtml(+s.orig||0)}
    <label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;margin-top:10px;cursor:pointer">
      <input type="checkbox" id="esh-print" checked style="width:16px;height:16px"/>
      🖨 הדפס את התעודה המתוקנת אחרי השמירה
    </label>
    <div style="font-size:11px;color:var(--txt3);margin-top:6px">📦 חומר האריזה (קולב/ניילון/צלופן) נערך בכפתור 📦 הנפרד — המחיר שלו נצרב על התעודה.</div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn primary" style="flex:1;font-size:14px" onclick="saveShipEdit('${escj(pid)}',${idx})">שמור תיקון</button>
      <button class="btn" style="flex:1;font-size:14px" onclick="document.getElementById('esh-wrap')?.remove()">ביטול</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  setTimeout(()=>{try{shipRowsTotal();}catch(e){}},50);
}
async function saveShipEdit(pid,idx){
  const p=(S.products||[]).find(x=>x.id===pid);
  const cur=p?prodShipments(p):[];
  const old=cur[idx];
  if(!p||!old)return;
  const rows=_shipRowsCollect();
  const qty=_shipQtySum();
  const packs=_shipPacksCollect();
  const outer=_shipOuterCollect();
  const note=(document.getElementById('ship-note')?.value||'').trim();
  const orig=_shipOrigVal();
  const doPrint=!!document.getElementById('esh-print')?.checked;
  const prev=+old.total||0;
  if(!qty&&!await showConfirm('תעודה ריקה','לא נותרה שום כמות בתעודה. לשמור בכל זאת?','שמור','חזור'))return;
  // 📦 אותה אזהרה כמו באישור המשלוח — פער בין האריזה לכמות **מסומן ולא נחסם**
  if(packs.length&&!_packsMatch(packsUnits(packs),qty)
    &&!await showConfirm('אריזה לא תואמת','סכום החבילות '+packsUnits(packs)+" יח' אבל בתעודה "+qty+" יח'. לשמור בכל זאת?",'שמור','חזור'))return;
  const after=cur.length-1-idx;
  if(prev!==qty&&after
    &&!await showConfirm('תעודה שאינה האחרונה','הכמות משתנה מ-'+prev+' ל-'+qty+" יח'.\nשורת \"יתרה להשלמה\" תשתנה גם ב-"+after+' התעודות שאחריה. להמשיך?','המשך','חזור'))return;
  // 🛑 בנייה מחדש של הרשימה **חייבת לגרור** at/packMode/mats — בדיוק כמו ב-confirmShip.
  // בלי זה תיקון של כמות היה מוחק בשקט את חיוב האריזה של אותה תעודה.
  const list=cur.map((x,k)=>{
    const base={...x,no:+x.no||0,date:x.date||'',at:x.at||'',rows:x.rows||[],total:+x.total||0,
      packs:Array.isArray(x.packs)?x.packs:[],note:x.note||'',packMode:x.packMode||'',
      mats:Array.isArray(x.mats)?x.mats:[],edits:Array.isArray(x.edits)?x.edits:[]};
    if(k!==idx)return base;
    // 🔒 no/date/at לא נגזרים מחדש — הם מזהים את הנייר שאצל הלקוח
    return {...base,rows,total:qty,packs,note,orig,outer,
      edits:base.edits.concat([{at:new Date().toISOString(),by:S.user?.id||'',
        byName:S.user?.name||S.user?.user||'',prevTotal:prev,newTotal:qty}]).slice(-20)};
  });
  p.shipments=list;
  p.shippedQty=list.reduce((t,x)=>t+(+x.total||0),0);
  p.shippedRows=mergeShipRows(list);
  // שורת היומן בכרטיס המוצר מתארת את המשלוח האחרון ואת הסך — שניהם זזו
  const lastSh=list[list.length-1]||{};
  const ex=(p.stageLog||[]).find(x=>x.id==='shipped');
  if(ex)ex.note='משלוח '+list.length+': '+(+lastSh.total||0)+" יח' · סה\"כ "+p.shippedQty+" יח'";
  saveLS();
  if(S.fbConnected)try{await fbReplaceFields('products',p.id,{shipments:list,shippedQty:p.shippedQty,shippedRows:p.shippedRows,stageLog:p.stageLog||[]});}catch(e){}
  document.getElementById('esh-wrap')?.remove();
  showToast('✅ תעודה '+String(old.no||0).padStart(4,'0')+' תוקנה · '+prev+' ← '+qty+" יח'",'var(--green-txt)',4000);
  try{buildStageReport();}catch(e){}
  try{renderProducts();}catch(e){}
  try{renderDNotes();}catch(e){}
  if(doPrint)setTimeout(()=>{try{printDeliveryNote(p.id,idx);}catch(e){}},400);
}
// ✏️ סימון "תוקנה" — **במסך בלבד ולא על הנייר** (הוחלט 21/09/2026): הלקוח מקבל
// תעודה שנראית רגילה, והמפעל רואה בלשונית ובחלון המשלוחים שהיא עברה תיקון.
function shipEditMark(s){
  const e=Array.isArray(s?.edits)?s.edits:[];
  if(!e.length)return '';
  const l=e[e.length-1];
  const hd=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7):'';
  const tip=(e.length===1?'התעודה תוקנה':'התעודה תוקנה '+e.length+' פעמים')+' · '+hd(String(l.at||'').slice(0,10))
    +' · '+(+l.prevTotal||0)+' ← '+(+l.newTotal||0)+" יח'"+(l.byName?' · '+l.byName:'');
  return `<span title="${esc(tip)}" style="font-size:11px;color:var(--amber-txt)"> ✏️</span>`;
}
function editShipMats(pid,idx){
  const p=(S.products||[]).find(x=>x.id===pid);
  const s=prodShipments(p)[idx];
  if(!p||!s)return;
  document.getElementById('shl-wrap')?.remove();
  document.getElementById('esm-wrap')?.remove();
  const cur=new Map(shipMats(s).map(m=>[m.k,m]));
  const inp='width:100%;font-size:13px;padding:6px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  // 💰 לא-מנהל: שדה המחיר נשאר (מוסתר) כדי שהמחיר הצרוב יישמר כמו שהוא
  const hid=canSeePackPrice()?'':'display:none;';
  const wrap=document.createElement('div');
  wrap.id='esm-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:380px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:2px">✏️ עריכת חומר אריזה</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:12px">תעודה <b style="color:var(--txt)">${s.no?String(s.no).padStart(4,'0'):'—'}</b> · ${esc(p.name||p.prod)} · <b style="color:var(--txt)">${+s.total||0}</b> יח'</div>
    <div style="display:flex;gap:6px;font-size:10px;color:var(--txt3);padding:0 2px 3px">
      <span style="min-width:76px"></span><span style="flex:1">כמות</span><span style="${hid}flex:1">מחיר ליח'</span><span style="${hid}min-width:60px;text-align:left">סכום</span>
    </div>
    ${PACK_MATS.map(m=>{
      const e=cur.get(m.k);
      // מחיר קיים נשמר כמו שהוא; חומר שלא היה על התעודה מקבל את המחירון של היום
      const own=e?!!e.own:custMatOwn(p.cust,m.k);
      const price=e?(+e.price||0):(own?0:packPrice(m.k));
      return `<div class="esm-row" data-k="${m.k}" style="margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;font-weight:600;min-width:76px">${esc(m.name)}</span>
          <input class="esm-n" type="number" inputmode="numeric" min="0" value="${e?(+e.n||0):''}" placeholder="0" oninput="esmTotal()" style="${inp};flex:1"/>
          <input class="esm-p" type="number" min="0" step="0.01" value="${price||''}" placeholder="0" oninput="esmTotal()" style="${inp};flex:1;${hid}"${own||m.incl?' disabled':''}/>
          <span class="esm-eq" style="${hid}font-size:12px;font-weight:800;min-width:60px;text-align:left;color:var(--txt3)">—</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:var(--txt3);margin-right:82px;margin-top:1px">
          <span style="flex:1">${esc(m.hint)}</span>
          <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--txt2,var(--txt));white-space:nowrap;cursor:pointer"><input type="checkbox" class="esm-own"${own?' checked':''} onchange="esmOwnToggle(this,'${m.k}')" style="width:14px;height:14px;margin:0"/> 👤 של הלקוח</label>
        </div>
      </div>`;
    }).join('')}
    <div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--bg);font-size:12px;font-weight:700">
      <span id="esm-sum">—</span>
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-top:7px">סוג האריזה נקבע לפי הכמויות, ויודפס בתעודה בהדפסה הבאה שלה.</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn primary" style="flex:1;font-size:14px" onclick="saveShipMats('${escj(pid)}',${idx})">💾 שמור</button>
      <button class="btn" style="flex:1;font-size:14px" onclick="document.getElementById('esm-wrap').remove()">ביטול</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  esmTotal();
}
// 👤 סימון "של הלקוח" מאפס ונועל את המחיר; ביטול הסימון מחזיר את המחירון של היום
function esmOwnToggle(cb,k){
  const pi=cb.closest('.esm-row')?.querySelector('.esm-p');
  if(pi){pi.disabled=cb.checked||packIncl(k);pi.value=cb.checked?'':(packPrice(k)||'');}
  esmTotal();
}
function _esmCollect(){
  return [...document.querySelectorAll('.esm-row')].map(r=>{
    const own=!!r.querySelector('.esm-own')?.checked;
    return {k:r.dataset.k,n:Math.max(0,parseInt(r.querySelector('.esm-n')?.value)||0),
      price:own?0:Math.max(0,parseFloat(r.querySelector('.esm-p')?.value)||0),...(own?{own:true}:{})};
  }).filter(x=>x.n>0);
}
function esmTotal(){
  document.querySelectorAll('.esm-row').forEach(r=>{
    const own=!!r.querySelector('.esm-own')?.checked;
    const n=Math.max(0,parseInt(r.querySelector('.esm-n')?.value)||0);
    const pr=own?0:Math.max(0,parseFloat(r.querySelector('.esm-p')?.value)||0);
    const eq=r.querySelector('.esm-eq');
    if(eq){eq.textContent=n?(own||packIncl(r.dataset.k)?'ללא חיוב':dnMoney(n*pr)):'—';eq.style.color=n?'var(--txt)':'var(--txt3)';}
  });
  const el=document.getElementById('esm-sum');
  if(!el)return;
  const mats=_esmCollect(),mode=packModeOf(mats);
  if(!mode){el.textContent='בלי חומר אריזה — לא ייכנס חיוב';el.style.color='var(--txt3)';return;}
  const no=mats.filter(m=>!m.price&&!m.own&&!packIncl(m.k)).map(m=>packMatName(m.k));
  const ow=mats.filter(m=>m.own).map(m=>packMatName(m.k));
  if(!canSeePackPrice()){el.textContent=PACK_MODES[mode]+(ow.length?' · 👤 של הלקוח: '+ow.join(', '):'');el.style.color='var(--green-txt,#16a34a)';return;}
  el.textContent=PACK_MODES[mode]+' · '+dnMoney(mats.reduce((t,m)=>t+m.n*m.price,0))+(ow.length?' · 👤 של הלקוח: '+ow.join(', '):'')+(no.length?' ⚠ בלי מחיר: '+no.join(', '):'');
  el.style.color=no.length?'var(--amber-txt)':'var(--green-txt,#16a34a)';
}
async function saveShipMats(pid,idx){
  const p=(S.products||[]).find(x=>x.id===pid);
  if(!p)return;
  // 🛑 `prodShipments` עלול להחזיר משלוח **משוחזר** משדות ישנים ולא את המערך עצמו.
  // כתיבה חייבת לעבור דרך מערך אמיתי, אחרת העריכה נשמרת לאובייקט זמני ונעלמת.
  const list=prodShipments(p).map(x=>({...x}));
  if(!list[idx]){document.getElementById('esm-wrap')?.remove();return;}
  const mats=_esmCollect();
  const _stk=pstkCalc();
  list[idx].mats=mats;
  list[idx].packMode=packModeOf(mats);
  p.shipments=list;
  saveLS();
  // fbReplaceFields ולא merge — merge לא מוחק פריט שהוסר מהמערך
  if(S.fbConnected)try{await fbReplaceFields('products',p.id,{shipments:list});}catch(e){}
  pstkAlert(_stk);
  document.getElementById('esm-wrap')?.remove();
  showToast(mats.length?'✅ האריזה עודכנה'+(canSeePackPrice()?' · '+dnMoney(mats.reduce((t,m)=>t+m.n*m.price,0)):''):'✅ האריזה נוקתה');
  try{renderProducts();}catch(e){}
  try{renderDNotes();}catch(e){}
}
// רשימת המשלוחים של הזמנה — הדפסה חוזרת של כל תעודה, ומחיקה של רישום שגוי
function showShipments(pid){
  const p=(S.products||[]).find(x=>x.id===pid);
  if(!p)return;
  const list=prodShipments(p);
  document.getElementById('shl-wrap')?.remove();
  const wrap=document.createElement('div');
  wrap.id='shl-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  const heDate=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:2px">🚚 משלוחים</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:10px">${esc(p.name||p.prod)} · סה"כ יצא ${shipmentsTotal(p)} מתוך ${_prodQty(p)||'?'} יח'</div>
    ${list.map((s,i)=>`<div class="row" style="align-items:center">
      <span class="bc-seg" style="background:var(--green-bg,#dcfce7);color:var(--green-txt,#16a34a);font-weight:700;flex-shrink:0">${s.no?String(s.no).padStart(4,'0'):'—'}</span>
      <span style="flex:1;font-size:12px;margin-right:8px">${shipEditMark(s)}${heDate(s.date)} · <b>${s.total}</b> יח'${packsCount(s.packs)?' · 📦 '+packsCount(s.packs):''}${outerTxt(s.outer)?' · 🛍 '+esc(outerTxt(s.outer)):''}${s.note?' · 📝':''}${shipPackCost(s)&&canSeePackPrice()?' · <span style="color:var(--green-txt,#16a34a);font-weight:700">'+dnMoney(shipPackCost(s))+'</span>':''}</span>
      <button class="btn" style="font-size:11px;padding:4px 8px" title="עריכת כמויות, אריזה והערה — המספר והתאריך לא משתנים" onclick="editShipment('${escj(pid)}',${i})">✏️</button>
      <button class="btn" style="font-size:11px;padding:4px 8px" title="עריכת חומר אריזה (קולב/ניילון/צלופן)" onclick="editShipMats('${escj(pid)}',${i})">📦</button>
      <button class="btn" style="font-size:11px;padding:4px 9px" onclick="printDeliveryNote('${escj(pid)}',${i})">📄 הדפס</button>
      <button class="btn" style="font-size:11px;padding:4px 8px" title="שלח את התעודה כ-PDF בוואטסאפ" onclick="shareDeliveryNote('${escj(pid)}',${i})">💬</button>
      <button class="btn danger" style="font-size:11px;padding:4px 8px" onclick="document.getElementById('shl-wrap').remove();delShipment('${escj(pid)}',${i})">🗑</button>
    </div>`).join('')}
    <button class="btn" style="width:100%;margin-top:12px;font-size:13px" onclick="document.getElementById('shl-wrap').remove()">סגור</button>
  </div>`;
  document.body.appendChild(wrap);
}
// ─── 📄 לשונית תעודות משלוח ───────────────────────────────────
// עד כאן תעודה הייתה נגישה **רק דרך כרטיס המוצר שלה**: לקוח שהתקשר עם מספר
// תעודה ביד לא היה דרך למצוא אותה בלי לנחש איזו הזמנה זו. כאן כל התעודות
// יחד, ממוינות לפי מספר יורד, עם חיפוש וטווח תאריכים.
function allDeliveryNotes(){
  const out=[];
  (S.products||[]).forEach(p=>{
    const list=prodShipments(p);
    list.forEach((s,i)=>out.push({p,s,i,count:list.length}));
  });
  // מיון לפי מספר התעודה יורד. משלוח ותיק שעדיין בלי מספר (נרשם לפני המספור)
  // נשאר ברשימה ונופל למטה — הוא מקבל מספר רק בהדפסה הראשונה שלו.
  return out.sort((a,b)=>((+b.s.no||0)-(+a.s.no||0))||String(b.s.date||'').localeCompare(String(a.s.date||'')));
}
// ─── 🕳 תעודות שבוטלו ─────────────────────────────────────────
// מספר תעודה **נשרף במחיקה** ולא חוזר לשימוש — הנייר כבר עלול להיות אצל הלקוח,
// ושתי תעודות באותו מספר גרועות בהרבה מחור ברצף. בלי סימון, החור נראה כמו תעודה
// שנעלמה, ובבדיקה חשבונאית אי אפשר להבחין בין "בוטלה" לבין "אבדה". שתי שכבות:
//   1. **יומן ביטולים** — כל מחיקה מהיום והלאה נרשמת עם לקוח, דגם, כמות ומי מחק.
//   2. **גזירה מהרצף** — כל מספר חסר בין הנמוך לגבוה מסומן גם בלי רישום, וכך
//      תעודות שנמחקו לפני הפיצ'ר (0663/0664 מהלחיצה הכפולה, 0673) עדיין מופיעות.
// שכבה 2 היא רשת הביטחון: היומן עלול לפספס מחיקה אופליין, החור ברצף לא.
function dnVoidLog(){return Array.isArray(S.settings?.dnVoids)?S.settings.dnVoids:[];}
async function dnVoidAdd(rec){
  if(!rec||!(+rec.no))return;
  const mk=l=>l.filter(v=>(+v.no||0)!==(+rec.no||0)).concat([rec]).sort((a,b)=>(+b.no||0)-(+a.no||0)).slice(0,500);
  // תקרה רכה — היומן גדל לאט (בודדים בשנה), אבל הוא יושב ב-localStorage יחד עם
  // כל השאר ואסור לו לדחוף החוצה את המוצרים.
  S.settings.dnVoids=mk(dnVoidLog());
  saveLS();
  if(!db||!S.fbConnected)return;
  // טרנזקציה ולא כתיבה מלאה: שני מנהלים שמוחקים תעודות שונות באותו רגע היו
  // דורסים זה את הרישום של זה, והחור שנשאר היה חוזר להיות אנונימי.
  try{
    const{doc,runTransaction}=window._fb;
    await runTransaction(db,async tx=>{
      const ref=doc(db,'appSettings','deliveryVoids');
      const s=await tx.get(ref);
      const cur=Array.isArray(s.data()?.list)?s.data().list:[];
      tx.set(ref,{list:mk(cur)},{merge:true});
    });
  }catch(e){console.warn('dnVoid:',e.message);}
}
// שורות הרפאים לטבלה — יומן + חורים ברצף, אחרי אותו סינון של הטבלה עצמה.
function dnVoidRows(f){
  const used=new Set();
  let min=Infinity,max=0;
  allDeliveryNotes().forEach(r=>{const k=+r.s.no||0;if(k>0){used.add(k);if(k<min)min=k;if(k>max)max=k;}});
  const logged=new Map();
  // מספר שחזר לשימוש (תעודה שנמחקה והוקלדה מחדש) כבר אינו חור — הרשומה החיה
  // מנצחת את היומן, אחרת הייתה מוצגת שורת רפאים על תעודה שקיימת בפועל.
  dnVoidLog().forEach(v=>{const k=+v.no||0;if(k>0&&!used.has(k))logged.set(k,{...v,known:true});});
  const out=[...logged.values()];
  // 🔒 תקרה על הסריקה — פנקס עם קפיצה חריגה לא ייצר אלפי שורות רפאים
  if(max&&min<=max&&max-min<=3000){
    for(let k=min;k<=max;k++)if(!used.has(k)&&!logged.has(k))out.push({no:k,known:false});
  }
  const q=(f?.q||'').trim(),cust=f?.cust||'',from=f?.from||'',to=f?.to||'';
  if(f?.pay)return []; // סינון לפי מצב תשלום — לתעודה שבוטלה אין מצב
  return out.filter(v=>{
    // חור בלי רישום הוא מספר ותו לא — אין לו לקוח ואין לו תאריך, ולכן סינון לפי
    // לקוח או טווח תאריכים **מסתיר אותו** במקום לנחש שהוא מתאים לסינון.
    if(!v.known&&(cust||from||to))return false;
    if(cust&&v.cust!==cust)return false;
    const d=v.date||'';
    if(from&&d&&d<from)return false;
    if(to&&d&&d>to)return false;
    if(!q)return true;
    return [String(v.no),String(v.no).padStart(4,'0'),v.cust||'',S.customerNames?.[v.cust]||'',v.prod||'',v.name||''].join(' ').toLowerCase().includes(q);
  }).sort((a,b)=>(+b.no||0)-(+a.no||0));
}
function dnVoidTr(v){
  const hd=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
  const who=v.byName?' · נמחקה ע"י '+esc(v.byName):'';
  // שתי נוסחאות: מה שנרשם ביומן מספר מה היה בתעודה שבוטלה, ומה שנגזר מהרצף
  // אומר רק שהמספר לא בשימוש — **בלי להמציא** שמישהו ביטל אותו, כי ייתכן שהוא
  // נשרף בהנפקה שנכשלה באמצע ולא במחיקה.
  const lbl=v.known?'בוטלה':'מספר לא בשימוש';
  const what=v.known
    ? esc(S.customerNames?.[v.cust]||('לקוח '+(v.cust||'')))+' · '+esc(v.name||v.prod||'')+(+v.total?' · '+(+v.total)+" יח'":'')+who
    : 'אין תעודה במספר הזה — בוטלה, או שההנפקה לא הושלמה';
  return `<tr style="opacity:.62">
    <td></td>
    <td><span class="bc-seg" style="background:var(--bg2,#f1f5f9);color:var(--txt3);font-weight:700;text-decoration:line-through">${String(v.no).padStart(4,'0')}</span></td>
    <td style="white-space:nowrap;color:var(--txt3)">${hd(v.date)}</td>
    <td colspan="${_canPricing()?11:10}" style="color:var(--txt3);font-size:12px">🕳 <b>${lbl}</b> — ${what} <span style="opacity:.8">· המספר לא חוזר לשימוש</span>${v.known&&S.user?.role==='manager'?` <button class="btn" style="font-size:11px;padding:3px 9px;margin-right:6px" title="שחזור באותו מספר ותאריך — מזינים את הכמויות לפי העותק המודפס" onclick="restoreVoidNote(${+v.no})">♻ שחזר</button>`:''}</td>
  </tr>`;
}
// מיזוג לפי מספר יורד — שורת הרפאים יושבת **במקומה ברצף** ולא בסוף הטבלה,
// אחרת אי אפשר לראות בעין שהחור הוא בדיוק בין 0672 ל-0674.
function dnRowsWithVoids(rows,voids,fn){
  return rows.map(r=>({n:+r.s.no||0,html:fn(r)}))
    .concat(voids.map(v=>({n:+v.no||0,html:dnVoidTr(v)})))
    .sort((x,y)=>y.n-x.n).map(x=>x.html).join('');
}
function dnSelToggle(k,on){on?_dnSel.add(k):_dnSel.delete(k);renderDNotes();}
function dnSelAll(on){dnFiltered().rows.forEach(r=>on?_dnSel.add(dnKey(r)):_dnSel.delete(dnKey(r)));renderDNotes();}
function dnSelClear(){_dnSel.clear();renderDNotes();}
function dnSelLabel(n){const b=document.getElementById('dn-print-btn');if(b)b.textContent=n?`🖨 הדפסה (${n} מסומנות)…`:'🖨 הדפסה…';}
// ─── 🧾 סטטוס התחשבנות לתעודה (09/10/2026) ────────────────────────────
// **נגזר, לא מסומן ידנית:** תעודה שמספרה ב-notes של חשבונית עסקה לא מבוטלת = הותחשבנה;
// "שולם" = יתרת החשבונית 0 לפי השיקים. מספרי התעודות רצים במונה משותף ⇒ ייחודיים.
// החשבוניות נטענות לפי דרישה (getDocs, לא מאזין) — ומתרעננות לכל היותר פעם בדקה.
let _pfAt=0,_pfBusy=false;
function _pfEnsure(force){
  if(!_canPricing()||!db||!S.fbConnected||_pfBusy||(!force&&Date.now()-_pfAt<60000))return;
  _pfBusy=true;
  _pfLoad().then(()=>{_pfAt=Date.now();_pfBusy=false;renderDNotes();}).catch(e=>{console.warn('pf:',e.message);_pfAt=Date.now();_pfBusy=false;});
}
// תעודה עם מספר ⇒ לפי notes. תעודה ותיקה בלי מספר ⇒ לפי המפתח שלה (keys) — קיים רק בחשבונית ידנית
function dnInvOf(r){
  const no=+r?.s?.no||0,k=no?'':dnKey(r);
  return _pfList.find(d=>!d.void&&(no?(d.notes||[]).some(n=>+n===no):(d.keys||[]).includes(k)))||null;
}
function dnPayState(r){const d=dnInvOf(r);return !d?'none':pfLeft(d)<=0.009?'paid':'inv';}
function dnPayCell(r){
  const d=dnInvOf(r);
  if(!d)return '<span style="color:var(--txt3);font-size:11px">⏳ טרם</span>';
  if(d.manual)return `<a href="#" onclick="event.preventDefault();openInvChecks('${escj(d._id)}')" title="חשבונית ידנית מהפנקס${d.month?' · חודש '+d.month.slice(5,7)+'/'+d.month.slice(0,4):''}" style="color:var(--blue-txt,#1d4ed8);font-weight:700;font-size:12px">📒 ${esc(String(d.no))}</a><div style="font-size:11px">${pfPayCell(d)}</div>`;
  const left=pfLeft(d),paid=pfPaid(d);
  const st=left<=0.009?'<span style="color:var(--green-txt,#16a34a);font-weight:700">✅ שולם</span>'
    :paid>0?'<span style="color:var(--amber-txt);font-weight:700">💳 חלקי</span>'
    :'<span style="color:var(--amber-txt)">לא שולם</span>';
  return `<a href="#" onclick="event.preventDefault();openInvChecks('${escj(d._id)}')" title="פתח את השיקים של החשבונית" style="color:var(--blue-txt,#1d4ed8);font-weight:700;font-size:12px">🧾 ${+d.no}</a><div style="font-size:11px">${st}</div>`;
}
// 📒 חשבונית ידנית (09/10/2026): תעודות שחויבו בפנקס לפני שהמערכת הפיקה חשבוניות — נרשמות
// כמסמך ב-proformaInvoices עם manual:true, כדי שיסומנו כ"הותחשבנו" ושה-🛑 של החיוב הכפול יכיר אותן.
// מזהה manual_... ולא המספר — מספרי הפנקס עלולים להתנגש במספרים שהמערכת מנפיקה.
async function dnManualInvoice(){
  if(!_canPricing()){showToast('⚠ אין הרשאה','var(--red-txt)');return;}
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור','var(--red-txt)');return;}
  const f=dnFiltered(true);
  if(!f.rows.length){showToast('⚠ סמן ☑ קודם את התעודות שחויבו בחשבונית הידנית','var(--amber-txt)',5000);return;}
  const custs=dnCustomers(f.rows);
  if(custs.length!==1){showToast('⚠ חשבונית היא ללקוח אחד — סמן תעודות של לקוח אחד בלבד','var(--red-txt)',5000);return;}
  try{await _pfLoad();_pfAt=Date.now();}catch(e){}
  const dup=f.rows.filter(r=>dnInvOf(r));
  if(dup.length){showToast('⚠ '+dup.length+' מהתעודות המסומנות כבר בחשבונית — בטל את הסימון שלהן','var(--red-txt)',6000);return;}
  const vat=+(S.settings?.vatPct??18)||0;
  const _t=todayStr(),_pm=new Date(+_t.slice(0,4),+_t.slice(5,7)-2,1);
  const meta=await new Promise(res=>{
    const w=document.createElement('div');
    w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px';
    w.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-size:16px;font-weight:800;margin-bottom:8px">📒 חשבונית ידנית מהפנקס</div>
      <div style="font-size:13px;line-height:1.7;margin-bottom:12px">ללקוח: <b>${esc(custs[0].name)}</b><br>${f.rows.length} תעודות · לפי המערכת: לפני מע"מ <b>${dnMoney(f.amount)}</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="field" style="margin:0"><label>מספר החשבונית בפנקס</label><input id="mi-no" inputmode="numeric" style="font-size:14px"/></div>
        <div class="field" style="margin:0"><label>📅 חודש</label><input id="mi-month" type="month" value="${_pm.getFullYear()+'-'+pad2(_pm.getMonth()+1)}" style="font-size:14px"/></div>
        <div class="field" style="margin:0;grid-column:1/-1"><label>סכום לפני מע"מ — כמו שכתוב בחשבונית</label><input id="mi-net" type="number" step="0.01" inputmode="decimal" value="${f.amount.toFixed(2)}" style="font-size:14px"/></div>
      </div>
      <div id="mi-tot" style="font-size:12px;color:var(--txt3);margin-top:4px"></div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;cursor:pointer"><input id="mi-paid" type="checkbox" style="width:auto"/> ✅ החשבונית כבר שולמה</label>
      <div style="font-size:11px;color:var(--txt3);margin-top:6px">לא מודפס דבר — רק מסמן שהתעודות כבר חויבו.</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn primary" style="flex:1" id="mi-ok">שמור</button>
        <button class="btn" style="flex:1" id="mi-cancel">ביטול</button>
      </div></div>`;
    document.body.appendChild(w);
    const done=v=>{w.remove();res(v);};
    // הסכום בפנקס קובע (ממנו נגזרת היתרה מול השיקים); המערכת מציגה את שלה רק להשוואה
    const net=()=>Math.round((parseFloat(w.querySelector('#mi-net').value)||0)*100)/100;
    const tot=()=>{const n=net(),t=n+Math.round(n*vat)/100;w.querySelector('#mi-tot').innerHTML=`מע"מ ${vat}%: ${dnMoney(t-n)} · <b>סה"כ כולל מע"מ ${dnMoney(t)}</b>${Math.abs(n-f.amount)>0.009?' · <span style="color:var(--amber-txt)">שונה מהמערכת ב-'+dnMoney(n-f.amount)+'</span>':''}`;};
    w.querySelector('#mi-net').oninput=tot;tot();
    w.querySelector('#mi-ok').onclick=()=>{
      const no=(w.querySelector('#mi-no').value||'').trim(),month=w.querySelector('#mi-month').value;
      if(!no){alert('יש להזין את מספר החשבונית');return;}
      if(!month){alert('יש לבחור חודש');return;}
      if(!(net()>0)){alert('יש להזין את הסכום');return;}
      done({no,month,net:net(),paid:w.querySelector('#mi-paid').checked});
    };
    w.querySelector('#mi-cancel').onclick=()=>done(null);
  });
  if(!meta)return;
  const id='manual_'+meta.no.replace(/[^\w-]/g,'')+'_'+Date.now().toString(36);
  const rec={manual:true,no:/^\d+$/.test(meta.no)?+meta.no:meta.no,month:meta.month,date:monthEnd(meta.month),
    cust:custs[0].code,custName:custs[0].name,notes:f.rows.map(r=>+r.s.no||0).filter(Boolean),keys:f.rows.filter(r=>!(+r.s.no)).map(dnKey),
    net:meta.net,sysNet:f.amount,vatPct:vat,vat:Math.round(meta.net*vat)/100,total:meta.net+Math.round(meta.net*vat)/100,paid:meta.paid,by:S.user?.name||'',byId:S.user?.id||'',at:Date.now(),issuedOn:todayStr()};
  try{await fbSet('proformaInvoices',id,rec);}
  catch(e){showToast('⚠ השמירה נכשלה: '+(e.message||''),'var(--red-txt)',6000);return;}
  _pfList.push({...rec,_id:id});
  dnSelClear();
  showToast('📒 '+f.rows.length+' תעודות סומנו כמחויבות בחשבונית ידנית '+meta.no);
}
async function pfManualPaid(id){
  if(S.user?.role!=='manager')return;
  const d=_pfList.find(x=>x._id===id);if(!d)return;
  try{await fbSet('proformaInvoices',id,{paid:!d.paid});d.paid=!d.paid;renderProformaList();renderDNotes();}
  catch(e){showToast('⚠ העדכון נכשל: '+(e.message||''),'var(--red-txt)');}
}
// אין מחיקה ב-proformaInvoices (Rules) ⇒ ביטול = void, והתעודות חוזרות ל"⏳ טרם"
async function pfManualVoid(id){
  if(S.user?.role!=='manager')return;
  const d=_pfList.find(x=>x._id===id);if(!d)return;
  if(!await showConfirm('ביטול חשבונית ידנית','לבטל את הסימון של חשבונית ידנית '+d.no+'?\nהתעודות שלה יחזרו ל"טרם הותחשבנו".','בטל','חזור'))return;
  const upd={void:true,voidBy:S.user?.name||'',voidAt:Date.now()};
  try{await fbSet('proformaInvoices',id,upd);Object.assign(d,upd);renderProformaList();renderDNotes();showToast('🚫 בוטל');}
  catch(e){showToast('⚠ הביטול נכשל: '+(e.message||''),'var(--red-txt)');}
}
function dnClearFilter(){
  ['dn-search','dn-cust','dn-from','dn-to','dn-pay'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderDNotes();
}
// ─── 📦 חומר אריזה ────────────────────────────────────────────
// הסחורה יוצאת ללקוח **בתלייה או בקיפול**, ולכל מצב חומרים משלו. החומר מחויב
// ללקוח ⇒ הוא שורה בהתחשבנות, לא עלות של המפעל. "ניילון צלופן" הוא פריט אחד.
const PACK_MODES={hang:'🧷 תלייה',fold:'📦 קיפול',mixed:'🧷📦 תלייה וקיפול'};
// 🔑 **מצב האריזה לא נבחר — הוא נגזר ממה שמולא.** שלושת החומרים מוצגים תמיד יחד,
// כי זה מה שקורה בפועל ליד הסורק: מסתכלים על הסחורה ורושמים מה נארז בה.
// `autoQty` = כל פריט נארז בו ⇒ הכמות עוקבת אחרי הכמות שיוצאת. רק לצלופן:
// בקיפול כל פריט נכנס לשק, אבל בתלייה לא כל פריט מקבל ניילון, והקולבים לרוב
// של הלקוח — ולכן שתי הכמויות האלה ידניות, ומילוי אוטומטי שלהן היה מחייב את
// הלקוח בשקט על מה שלא סיפקנו.
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): PACK_MATS
const PACK_GROUP=k=>PACK_MATS.find(m=>m.k===k)?.mode||'';
// מצב האריזה נגזר מהחומרים שנרשמו בפועל. שני הצדדים יחד = משלוח מעורב, וזה קורה:
// חלק מהסחורה יוצא בתלייה וחלק מקופל. עדיף להגיד את זה מאשר לבחור צד שרירותית.
function packModeOf(mats){
  const has=g=>(mats||[]).some(m=>(+m.n||0)>0&&PACK_GROUP(m.k)===g);
  const h=has('hang'),f=has('fold');
  return h&&f?'mixed':h?'hang':f?'fold':'';
}
// שם נקי בלי אמוג'י — לנייר המודפס, שבו האמוג'י רק מלכלך שורת פרטים
function packModeName(k){return ({hang:'תלייה',fold:'קיפול',mixed:'תלייה וקיפול'})[k]||'';}
function packMatName(k){return PACK_MATS.find(m=>m.k===k)?.name||k;}
const packIncl=k=>!!PACK_MATS.find(m=>m.k===k)?.incl;
function packPrice(k){return packIncl(k)?0:+((S.settings?.packPrices||{})[k])||0;}
// 🔑 הכמות **והמחיר** נצרבים על רשומת המשלוח באישור. זה בכוונה **הפוך** ממחיר
// העבודה (`dnUnitPrice`), שנקרא מכרטיס המוצר כפי שהוא היום: כאן הכמות מוזנת
// ידנית בכל משלוח ממילא, ועדכון מחירון לא אמור לשכתב תעודה שכבר נמסרה ללקוח.
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): shipMats
function shipPackCost(s){return shipMats(s).reduce((t,m)=>t+(m.own?0:(+m.n||0)*(+m.price||0)),0);}
