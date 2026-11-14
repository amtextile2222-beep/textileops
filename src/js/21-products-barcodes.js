// ─── PRODUCTS ────────────────────────────────────────────────
let _editProdId=null;

// ─── BARCODE GENERATOR ───────────────────────────────────────
// 🔢 מספר ההזמנה בברקוד — 3 ספרות בסוף, רק להזמנות שהוקמו אחרי השינוי.
//
// הכלל שנקבע: **מוצר שיוקם אחרי ההתקנה מקבל 16 ספרות; כל הקיימים נשארים 13 לנצח.**
// המימוש הוא השדה bcLen שנחתם ב-saveProduct ברגע ההקמה — לא השוואת שעונים ולא
// שאילתת היסטוריה. הוא **דביק**: הדפסה חוזרת של מדבקה שנקרעה תפיק תמיד בדיוק
// את אותה מחרוזת, ולכן אי אפשר לערבב 13 ו-16 על אותה הזמנה.
const bcSuffixFor=p=>(p&&p.bcLen===BC_LEN_NEW)?String(Math.min(999,Math.max(0,parseInt(p.orderNo,10)||0))).padStart(3,'0'):'';
// שורת "הזמנה #NNN" על גבי המדבקה עצמה. נגזרת מהקוד המודפס, ולכן נכונה גם במסך וגם
// בהדפסה וגם ב-PDF. ריקה למדבקה בת 13 — שם אין מספר, וכך היא נשארת זהה למה שהודפס קודם.
const bcOrderLbl=raw=>{
  const n=orderNoOf(raw);
  return n?`<div style="font-size:13px;font-weight:800;color:#059669">🔢 הזמנה #${String(n).padStart(3,'0')}</div>`:'';
};
// הרשומה שהמחולל מפיק עבורה. ⚠️ בלי הבורר הזה findProd היה מחזיר תמיד את הרשומה
// החדשה, והדפסה חוזרת להזמנה ותיקה הייתה מקבלת את המספר של החדשה.
let _bcGenPid=null;
function bcGenCustProd(){
  return{
    cust:(document.getElementById('bc-gen-cust')?.value||'').replace(/\D/g,'').padStart(2,'0').slice(0,2),
    prod:(document.getElementById('bc-gen-prod')?.value||'').replace(/\D/g,'').padStart(5,'0').slice(0,5)
  };
}
function bcGenTarget(){
  const{cust,prod}=bcGenCustProd();
  const all=prodMatches(cust,prod);
  if(!all.length)return null;
  const pid=document.getElementById('bc-gen-order')?.value||_bcGenPid;
  return all.find(x=>x.id===pid)||all[0];
}
// ממלא את בורר ההזמנה ומציג אותו רק כשיש באמת יותר מרשומה אחת.
function bcSyncOrderSel(){
  const wrap=document.getElementById('bc-gen-order-wrap');
  const sel=document.getElementById('bc-gen-order');
  const note=document.getElementById('bc-gen-order-note');
  if(!wrap||!sel)return;
  const{cust,prod}=bcGenCustProd();
  const all=prodMatches(cust,prod);
  if(all.length>1){
    sel.innerHTML=all.map(x=>{
      const d=+x.createdAt?new Date(+x.createdAt):null;
      const ds=d?' · נפתחה '+pad2(d.getDate())+'/'+pad2(d.getMonth()+1):'';
      const sh=x.shippedQty!=null?' · כבר יצא':'';
      const no=x.bcLen===BC_LEN_NEW?'הזמנה #'+bcSuffixFor(x):'הזמנה ישנה (13 ספרות)';
      return `<option value="${esc(x.id)}">${no} — ${esc(x.name||'(בלי שם)')} — ${_prodQty(x)} יח'${ds}${sh}</option>`;
    }).join('');
    if(_bcGenPid&&all.some(x=>x.id===_bcGenPid))sel.value=_bcGenPid;
    wrap.style.display='';
  }else{
    sel.innerHTML='';wrap.style.display='none';
  }
  if(note){
    const t=bcGenTarget();
    const{cust:c0,prod:p0}=bcGenCustProd();
    // ⚠️ בלי רשומת מוצר אין מספר הזמנה, והברקודים ייצאו 13 ספרות בשקט. זו בדיוק
    // הטעות שתקרה אם מדפיסים מדבקות לפני שמקימים את כרטיס המוצר.
    note.innerHTML=(!t&&c0!=='00'&&p0!=='00000')
      ?`<span style="color:var(--red-txt);font-weight:700">⚠ אין כרטיס מוצר ל-${esc(c0)}-${esc(p0)} — הברקודים יהיו 13 ספרות בלי מספר הזמנה. הקם קודם את המוצר.</span>`
      :!t?''
      :(bcSuffixFor(t)
        ?`<span style="color:var(--green-txt,#16a34a);font-weight:700">🔢 הזמנה #${bcSuffixFor(t)} — הברקודים יהיו 16 ספרות</span>`
        :`ℹ️ הזמנה מלפני השינוי — הברקודים יהיו 13 ספרות, כמו המדבקות שכבר תלויות במפעל`);
  }
}
function bcOrderPicked(){_bcGenPid=document.getElementById('bc-gen-order')?.value||null;bcSyncOrderSel();}
function bcFromProduct(pid){
  const p=S.products.find(x=>x.id===pid);if(!p)return;
  goPage('barcodes');
  setTimeout(()=>{
    _bcGenPid=p.id; // המחולל יפיק עבור הרשומה שנבחרה, לא עבור החדשה ביותר
    document.getElementById('bc-gen-cust').value=p.cust||'';
    document.getElementById('bc-gen-prod').value=p.prod||'';
    const container=document.getElementById('bc-gen-rows');
    if(!container)return;
    container.innerHTML='';
    const qty=p.quantities||[];
    if(qty.length){
      qty.forEach(q=>{
        bcAddRow();
        const rows=container.querySelectorAll('.bc-row');
        const row=rows[rows.length-1];
        if(row){
          const sizeEl=row.querySelector('.bc-size');
          const qtyEl=row.querySelector('.bc-qty');
          const colEl=row.querySelector('.bc-col');
          if(sizeEl)sizeEl.value=szLbl(q.size,p)||'0';
          if(qtyEl)qtyEl.value=q.qty||1;
          if(colEl){colEl.value=q.color||'00';colEl.style.color=q.color==='00'?'var(--txt3)':'var(--txt)';}
        }
      });
    } else {bcAddRow();}
    bcSyncOrderSel();
    bcGenerate();
  },100);
}
function bcFillProductSelect(){
  const sel=document.getElementById('bc-prod-select');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">📦 טען ממוצר קיים...</option>';
  S.products.forEach(p=>{
    const custName=S.customerNames?.[p.cust]||'';
    const label=`${p.prod} · ${p.cust}${custName?' ('+custName+')':''}${p.name?' — '+p.name:''}`;
    const opt=document.createElement('option');
    opt.value=p.id;opt.textContent=label;
    sel.appendChild(opt);
  });
  if(cur)sel.value=cur;
}
function bcLoadFromProduct(){
  const sel=document.getElementById('bc-prod-select');
  if(!sel||!sel.value){alert('בחר מוצר תחילה');return;}
  const p=S.products.find(x=>x.id===sel.value);
  if(!p){alert('מוצר לא נמצא');return;}
  _bcGenPid=p.id; // הרשומה שנבחרה מהרשימה היא היעד, גם אם היא לא החדשה ביותר
  document.getElementById('bc-gen-cust').value=p.cust||'';
  document.getElementById('bc-gen-prod').value=p.prod||'';
  const container=document.getElementById('bc-gen-rows');
  if(!container)return;
  container.innerHTML='';
  const qty=p.quantities||[];
  if(qty.length){
    qty.forEach(q=>{
      bcAddRow();
      const rows=container.querySelectorAll('.bc-row');
      const row=rows[rows.length-1];
      if(row){
        const sizeEl=row.querySelector('.bc-size');
        const qtyEl=row.querySelector('.bc-qty');
        const colEl=row.querySelector('.bc-col');
        if(sizeEl)sizeEl.value=szLbl(q.size,p)||'0';
        if(qtyEl)qtyEl.value=q.qty||1;
        // מצא קוד צבע לפי שם
        if(colEl){
          const colorCode=Object.entries(COLORS).find(([k,v])=>v===q.color||k===q.color)?.[0]||'00';
          colEl.value=colorCode;
          colEl.style.color=colorCode==='00'?'var(--txt3)':'var(--txt)';
        }
      }
    });
  } else {
    bcAddRow();
  }
  bcSyncOrderSel();
  alert(`✅ נטען: מוצר ${p.prod} · לקוח ${p.cust}${qty.length?' · '+qty.length+' שורות':''}`);
}
function bcAddRow(){
  const container=document.getElementById('bc-gen-rows');
  if(!container)return;
  const colorOpts=Object.entries(COLORS).map(([k,v])=>`<option value="${k}">${COLORS_AR[k]||v} — ${v}</option>`).join('');
  const div=document.createElement('div');
  div.className='bc-row';
  div.style.cssText='display:grid;grid-template-columns:80px 80px 1fr 36px;gap:8px;align-items:end;margin-bottom:8px;background:var(--bg2);padding:8px;border-radius:8px';
  div.innerHTML=`
    <div><label style="font-size:11px;color:var(--txt3)">מידה</label>
      <input type="text" class="bc-size" maxlength="4" placeholder="1" style="font-size:14px;font-weight:600;text-align:center"/></div>
    <div><label style="font-size:11px;color:var(--txt3)">כמות</label>
      <input type="number" class="bc-qty" min="1" max="999" value="1" style="font-size:14px;font-weight:600;text-align:center"/></div>
    <div><label style="font-size:11px;color:var(--txt3)">צבע</label>
      <select class="bc-col" style="font-size:13px">${colorOpts}</select></div>
    <button onclick="this.closest('.bc-row').remove()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:20px;padding-bottom:2px">✕</button>`;
  container.appendChild(div);
}
// שם המוצר ותאריך הקמת הכרטיס — לשורה מתחת לברקוד בהדפסה (ספירה/גזירה + יצא ללקוח).
// לוקח מהרשומה שהמחולל מפיק עבורה (bcGenTarget), לא מהחדשה ביותר, כמו כל שדה אחר על הברקוד.
function _bcProdMeta(t){
  return{name:t?.name||'',date:t?.createdAt?new Date(+t.createdAt).toLocaleDateString('he-IL'):''};
}
const _bcProdMetaLine=(name,date)=>(name||date)?`<div style="font-size:11px;color:#666;margin-top:2px">${name?'📦 '+esc(name):''}${name&&date?' · ':''}${date?'📅 '+esc(date):''}</div>`:'';
function bcGenerateOpenQty(){
  const cust=(document.getElementById('bc-gen-cust')?.value||'').replace(/\D/g,'').padStart(2,'0').slice(0,2);
  const prod=(document.getElementById('bc-gen-prod')?.value||'').replace(/\D/g,'').padStart(5,'0').slice(0,5);
  if(cust==='00'||prod==='00000'){alert('הזן מספר לקוח ומספר מוצר');return;}
  const _t=bcGenTarget();
  const sfx=bcSuffixFor(_t); // 3 ספרות מספר הזמנה, או '' להזמנה ותיקה
  const code=cust+prod+'900000'+sfx;
  const {name:pname,date:pdate}=_bcProdMeta(_t);
  const out=document.getElementById('bc-gen-output');
  if(!out)return;
  out.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn" onclick="bcPrintOpenQty('${cust}','${prod}','${code}','${escj(pname)}','${escj(pdate)}')" style="font-size:13px">🖨️ הדפס</button>
      <button class="btn" onclick="bcPrintOpenQty('${cust}','${prod}','${code}','${escj(pname)}','${escj(pdate)}',true)" style="font-size:13px">💬 שלח בוואטסאפ</button>
    </div>
    <div id="bc-openqty-card" style="background:#fff;border:3px solid var(--amber-txt);border-radius:8px;padding:14px;display:flex;align-items:center;gap:14px;max-width:400px">
      <div id="bc-openqty-qr" style="flex-shrink:0;width:150px;height:150px"></div>
      <div style="line-height:2">
        <div style="font-size:14px;font-weight:800;color:var(--amber-txt)">✂️ ספירה / גזירה</div>
        <div style="font-size:13px;font-weight:700">לקוח: ${cust}</div>
        <div style="font-size:13px;font-weight:700">מוצר: ${prod}</div>
        ${bcOrderLbl(code)}
        <div style="font-size:12px;color:var(--txt3)">⏳ כמות פתוחה</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:4px">${code}</div>
        ${_bcProdMetaLine(pname,pdate)}
      </div>
    </div>`;
  new QRCode(document.getElementById('bc-openqty-qr'),{text:bcQr(code),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  _qrOne(document.getElementById('bc-openqty-qr'));
}
function bcPrintOpenQty(cust,prod,code,pname,pdate,share){
  const canvas=document.querySelector('#bc-openqty-qr canvas');
  const img=canvas?`<img src="${canvas.toDataURL('image/png')}" style="width:150px;height:150px"/>`:'';
  _bcCardOut(share,'count-barcode',cust,prod,code,'ברקוד ספירה/גזירה',`<html dir="rtl"><head><title>ברקוד ספירה/גזירה</title>
    <style>body{margin:20px;font-family:Arial,sans-serif;background:#fff}
    .card{border:3px solid #d97706;border-radius:8px;padding:16px;display:inline-flex;align-items:center;gap:16px}
    @media print{@page{size:A4 portrait;margin:10mm}}</style></head><body>
    <div class="card">
      ${img}
      <div style="line-height:2.2">
        <div style="font-size:16px;font-weight:800;color:#d97706">✂️ ספירה / גזירה</div>
        <div style="font-size:14px;font-weight:700">לקוח: ${cust}</div>
        <div style="font-size:14px;font-weight:700">מוצר: ${prod}</div>
        ${bcOrderLbl(code)}
        <div style="font-size:13px;color:#666">⏳ כמות פתוחה</div>
        <div style="font-size:11px;color:#999;margin-top:4px">${code}</div>
        ${_bcProdMetaLine(pname,pdate)}
      </div>
    </div></body></html>`);
}
// 💬 (03/11/2026) ברקוד ספירה/יציאה ודף שלבים בוואטסאפ — אותו HTML של ההדפסה ⇒ PDF (_dnPdfBlob) ⇒ _waSharePdf
async function _bcCardOut(share,kind,cust,prod,code,label,html){
  if(!share){printViaIframe(html);return;}
  showToast('⏳ מכין PDF…','var(--txt3)',4000);
  let blob;try{blob=await _dnPdfBlob(html);}catch(e){alert('הכנת ה-PDF נכשלה: '+(e?.message||e));return;}
  const no=String(code).slice(13);
  await _waSharePdf(blob,kind+'-'+cust+'-'+prod+(no?'-'+no:'')+'.pdf',label+' · לקוח '+cust+' · מוצר '+prod+(no?' · הזמנה #'+no:''),'');
}
// ברקוד "יצא ללקוח": לקוח+מוצר+9+000+99 (col='99' שמור). סריקתו מסמנת shipped + פותחת עדכון כמות
function bcGenerateShip(){
  const cust=(document.getElementById('bc-gen-cust')?.value||'').replace(/\D/g,'').padStart(2,'0').slice(0,2);
  const prod=(document.getElementById('bc-gen-prod')?.value||'').replace(/\D/g,'').padStart(5,'0').slice(0,5);
  if(cust==='00'||prod==='00000'){alert('הזן מספר לקוח ומספר מוצר');return;}
  const _t=bcGenTarget();
  const sfx=bcSuffixFor(_t); // מספר ההזמנה בברקוד היציאה = הבורר יידע לאיזו רשומה לעדכן את הכמות
  const code=cust+prod+'900099'+sfx;
  const {name:pname,date:pdate}=_bcProdMeta(_t);
  const out=document.getElementById('bc-gen-output');
  if(!out)return;
  out.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn" onclick="bcPrintShip('${cust}','${prod}','${code}','${escj(pname)}','${escj(pdate)}')" style="font-size:13px">🖨️ הדפס</button>
      <button class="btn" onclick="bcPrintShip('${cust}','${prod}','${code}','${escj(pname)}','${escj(pdate)}',true)" style="font-size:13px">💬 שלח בוואטסאפ</button>
    </div>
    <div id="bc-ship-card" style="background:#fff;border:3px solid var(--green-txt,#16a34a);border-radius:8px;padding:14px;display:flex;align-items:center;gap:14px;max-width:400px">
      <div id="bc-ship-qr" style="flex-shrink:0;width:150px;height:150px"></div>
      <div style="line-height:2">
        <div style="font-size:14px;font-weight:800;color:var(--green-txt,#16a34a)">🚚 יצא ללקוח</div>
        <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${cust}</div>
        <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${prod}</div>
        ${bcOrderLbl(code)}
        <div style="font-size:12px;color:#666">✅ סמן יציאה + עדכן כמות סופית</div>
        <div style="font-size:11px;color:#999;margin-top:4px">${code}</div>
        ${_bcProdMetaLine(pname,pdate)}
      </div>
    </div>`;
  new QRCode(document.getElementById('bc-ship-qr'),{text:bcQr(code),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  _qrOne(document.getElementById('bc-ship-qr'));
}
// qrcodejs מצייר canvas וגם img, ואחרי בדיקת data-URI (אסינכרונית) מסתיר את ה-canvas ומציג img. ההסתרה הישנה של
// ה-img אחרי 50ms נפלה לפעמים **אחרי** ההחלפה ⇒ שניהם מוסתרים, כרטיס בלי QR (נצפה 01/11). משאירים תמיד את ה-canvas
// (ההדפסה וה-PDF לוקחים ממנו) — כמה פעמים, כדי לנצח את ההחלפה גם כשהיא מאחרת.
function _qrOne(el){const f=()=>{const c=el?.querySelector('canvas'),im=el?.querySelector('img');if(c){c.style.display='block';if(im)im.style.display='none';}};f();[50,300,1500].forEach(t=>setTimeout(f,t));}
function bcPrintShip(cust,prod,code,pname,pdate,share){
  const canvas=document.querySelector('#bc-ship-qr canvas');
  const img=canvas?`<img src="${canvas.toDataURL('image/png')}" style="width:150px;height:150px"/>`:'';
  _bcCardOut(share,'ship-barcode',cust,prod,code,'ברקוד יצא ללקוח',`<html dir="rtl"><head><title>ברקוד יצא ללקוח</title>
    <style>body{margin:20px;font-family:Arial,sans-serif;background:#fff}
    .card{border:3px solid #16a34a;border-radius:8px;padding:16px;display:inline-flex;align-items:center;gap:16px}
    @media print{@page{size:A4 portrait;margin:10mm}}</style></head><body>
    <div class="card">
      ${img}
      <div style="line-height:2.2">
        <div style="font-size:16px;font-weight:800;color:#16a34a">🚚 יצא ללקוח</div>
        <div style="font-size:14px;font-weight:700">לקוח: ${cust}</div>
        <div style="font-size:14px;font-weight:700">מוצר: ${prod}</div>
        ${bcOrderLbl(code)}
        <div style="font-size:13px;color:#666">✅ סמן יציאה + עדכן כמות סופית</div>
        <div style="font-size:11px;color:#999;margin-top:4px">${code}</div>
        ${_bcProdMetaLine(pname,pdate)}
      </div></div></body></html>`);
}
function bcGenerate(){
  const cust=(document.getElementById('bc-gen-cust')?.value||'').replace(/\D/g,'').padStart(2,'0').slice(0,2);
  const prod=(document.getElementById('bc-gen-prod')?.value||'').replace(/\D/g,'').padStart(5,'0').slice(0,5);
  if(cust==='00'||prod==='00000'){alert('הזן מספר לקוח ומספר מוצר');return;}
  // 👕 הזמנה שסומנה "דגם ראשון" — ברקוד דגם אחד במקום "כל הכמות" + ברקוד לכל מידה/צבע
  const _st=bcGenTarget();
  if(_st?.isSample){bcGenerateSample(cust,prod,_st);return;}
  const rows=[...document.querySelectorAll('.bc-row')];
  if(!rows.length){alert('הוסף לפחות שורה אחת');return;}
  const items=rows.map(r=>({
    size:szDigit(r.querySelector('.bc-size')?.value||'0').replace(/\D/g,'').slice(0,1)||'0',
    qty:String(Math.min(999,Math.max(1,parseInt(r.querySelector('.bc-qty')?.value)||1))).padStart(3,'0'),
    col:r.querySelector('.bc-col')?.value||'00'
  }));
  const out=document.getElementById('bc-gen-output');
  if(!out)return;
  const _t=bcGenTarget(),sfx=bcSuffixFor(_t);
  items.forEach(it=>{it.lbl=szLbl(it.size,_t);}); // 👕 מידה באותיות — על המדבקה בלבד
  // sfx נשמר יחד עם הפריטים — bcPrint / bcDownloadPDF / bcExportNiimbot בונים את
  // המחרוזות מחדש מ-_bcLastGen, ובלעדיו הם היו מפיקים 13 ספרות בזמן שהמסך מציג 16.
  window._bcLastGen={cust,prod,items,sfx,pid:_t?.id||null};
  const totalQtyAll=items.reduce((s,it)=>s+(parseInt(it.qty)||0),0);
  const totalCode=cust+prod+'9'+'000'+'00'+sfx;
  // בניית HTML עם canvas לכל ברקוד
  out.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <div style="font-size:14px;font-weight:600">${items.length} קודים נוצרו — לקוח ${cust} · מוצר ${prod}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn success" onclick="bcExportNiimbot()" style="font-size:13px">📥 ייצא ל-NIIMBOT</button>
        <button class="btn" onclick="bcPrint()" style="font-size:13px">🖨️ הדפס נבחרים</button>
        <button class="btn" onclick="bcPrint('labels')" style="font-size:13px" title="רשת 105×56 מ&quot;מ (TW-2510), 10 מדבקות בדף A4">🏷️ הדפס למדבקות</button>
        <button class="btn success" onclick="bcDownloadPDF()" style="font-size:13px" title="קובץ PDF מדויק A4 (105×56 מ&quot;מ) — להדפסה מהנייד בגודל נכון">📄 הורד PDF מדבקות</button>
        <button class="btn" onclick="bcSharePDF()" style="font-size:13px" title="אותו PDF של המדבקות המסומנות — נשלח בוואטסאפ">💬 שלח בוואטסאפ</button>
        ${nfcOk()?`<button class="btn primary" onclick="bcNfcWriteAll()" style="font-size:13px" title="כותב את הברקודים המסומנים למדבקות NFC אחד אחרי השני">📶 כתוב נבחרים למדבקות NFC</button>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px" title="כמה מדבקות לכל ברקוד — למשל מידה שמחולקת ל-3 חבילות">עותקים <input id="bc-nfc-copies" type="number" min="1" max="20" value="1" inputmode="numeric" style="width:52px;font-size:13px;padding:4px;border-radius:6px;border:1px solid var(--brd)"></label>`:''}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;color:var(--txt3)">
      <span>☑️ סמן/הסר ברקוד בודד — למשל להדפיס מחדש רק ברקוד אחד שהתקלקל</span>
      <button class="btn" style="font-size:11px;padding:3px 8px" onclick="_bcToggleSel('bc-print-area','bc-sel',true)">בחר הכל</button>
      <button class="btn" style="font-size:11px;padding:3px 8px" onclick="_bcToggleSel('bc-print-area','bc-sel',false)">נקה הכל</button>
    </div>
    <div id="bc-print-area" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
    </div>`;
  // צור QR canvas לכל פריט
  const printArea=document.getElementById('bc-print-area');
  // כרטיס "כל הכמות" — ברקוד אחד לכל המוצר
  (()=>{
    const div=document.createElement('div');
    div.className='bc-card';
    div.dataset.col='total';
    div.dataset.idx='total';
    div.style.cssText='background:#fff;border:3px solid #059669;border-radius:6px;padding:10px;display:flex;align-items:center;gap:12px;break-inside:avoid;grid-column:1/-1;position:relative';
    const qrWrap=document.createElement('div');
    qrWrap.style.cssText='flex-shrink:0;width:150px;height:150px;overflow:hidden';
    const infoDiv=document.createElement('div');
    infoDiv.style.cssText='text-align:right;line-height:2;flex:1';
    infoDiv.innerHTML=`
      <div style="font-size:15px;font-weight:800;color:#059669;margin-bottom:4px">📦 כל הכמות</div>
      <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${cust}</div>
      <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${prod}</div>
      ${bcOrderLbl(totalCode)}
      <div style="font-size:16px;font-weight:800;color:#059669">סה"כ: ${totalQtyAll} יח׳</div>
      <div style="font-size:11px;color:#555;margin-top:4px">${totalCode}</div>`;
    div.appendChild(qrWrap);
    div.appendChild(infoDiv);
    div.appendChild(_bcSelCheckbox());
    _bcNfcBtn(div,totalCode,'📦 כל הכמות · '+totalQtyAll+' יח׳');
    printArea.appendChild(div);
    new QRCode(qrWrap,{text:bcQr(totalCode),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    _qrOne(qrWrap);
  })();
  items.forEach((it,idx)=>{
    const code=cust+prod+it.size+it.qty+it.col+sfx;
    const colName=(COLORS_AR[it.col]||COLORS[it.col]||it.col);
    const div=document.createElement('div');
    div.className='bc-card';
    div.dataset.col=it.col;
    div.dataset.idx=String(idx);
    div.style.cssText='background:#fff;border:2px solid #333;border-radius:6px;padding:10px;display:flex;align-items:center;gap:12px;break-inside:avoid;position:relative';
    const qrWrap=document.createElement('div');
    qrWrap.style.cssText='flex-shrink:0;width:150px;height:150px;overflow:hidden';
    const infoDiv=document.createElement('div');
    infoDiv.style.cssText='text-align:right;line-height:2;flex:1';
    infoDiv.innerHTML=`
      <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${cust}</div>
      <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${prod}</div>
      ${bcOrderLbl(code)}
      <div style="font-size:13px;font-weight:700;color:#000">מידה: ${esc(it.lbl||it.size)}</div>
      <div style="font-size:13px;font-weight:700;color:#000">כמות: ${parseInt(it.qty)}</div>
      <div style="font-size:13px;font-weight:700;color:#000">צבע: ${it.col} · ${colName}</div>
      <div style="font-size:11px;color:#555;margin-top:4px">${code}</div>`;
    div.appendChild(qrWrap);
    div.appendChild(infoDiv);
    div.appendChild(_bcSelCheckbox());
    _bcNfcBtn(div,code,'מידה '+(it.lbl||it.size)+' · '+parseInt(it.qty)+' יח׳ · '+colName);
    printArea.appendChild(div);
    new QRCode(qrWrap,{text:bcQr(code),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    _qrOne(qrWrap);
  });
  _bcRepairCard(printArea,cust,prod,sfx);
}
// 🔧 כרטיס ברקוד תיקון — בכל הזמנה (רגילה ודגם). מסומן כברירת מחדל כמו השאר; bcPrint מדפיס מה-DOM,
// bcDownloadPDF מ-_bcLastGen.repair. בלי מידה/צבע/כמות — נבחרים בסריקה (repairPick).
function _bcRepairCard(area,cust,prod,sfx){
  if(!area)return;
  const code=repairCodeOf(cust,prod,sfx);
  if(window._bcLastGen)window._bcLastGen.repair={code};
  const div=document.createElement('div');
  div.className='bc-card';div.dataset.col='repair';div.dataset.idx='repair';
  div.style.cssText='background:#fff;border:3px solid #b45309;border-radius:6px;padding:10px;display:flex;align-items:center;gap:12px;break-inside:avoid;grid-column:1/-1;position:relative';
  const qrWrap=document.createElement('div');
  qrWrap.style.cssText='flex-shrink:0;width:150px;height:150px;overflow:hidden';
  const info=document.createElement('div');
  info.style.cssText='text-align:right;line-height:2;flex:1';
  info.innerHTML=`
    <div style="font-size:15px;font-weight:800;color:#b45309;margin-bottom:4px">${REPAIR_STEP}</div>
    <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${cust}</div>
    <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${prod}</div>
    ${bcOrderLbl(code)}
    <div style="font-size:12px;color:#555">מידה, צבע וכמות — בוחרים בסריקה</div>
    <div style="font-size:11px;color:#555;margin-top:4px">${code}</div>`;
  div.appendChild(qrWrap);div.appendChild(info);div.appendChild(_bcSelCheckbox());
  _bcNfcBtn(div,code,REPAIR_STEP);
  area.appendChild(div);
  new QRCode(qrWrap,{text:bcQr(code),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  _qrOne(qrWrap);
}
// 👕 כרטיס ברקוד דגם בודד. הכמות מהמוצר (מקור האמת), ובהיעדרה מהשורות במחולל.
// items ריק + sample ⇒ bcPrint/bcDownloadPDF מדפיסים רק אותו (וכרטיס "יצא ללקוח" כרגיל).
function bcGenerateSample(cust,prod,t){
  const out=document.getElementById('bc-gen-output');if(!out)return;
  const sfx=bcSuffixFor(t);
  const prodQty=(t.quantities||[]).reduce((s,x)=>s+(parseInt(x.qty)||0),0);
  const rowsQty=[...document.querySelectorAll('.bc-row')].reduce((s,r)=>s+(parseInt(r.querySelector('.bc-qty')?.value)||0),0);
  const qty=Math.min(999,Math.max(1,prodQty||rowsQty||1));
  const code=cust+prod+'9'+String(qty).padStart(3,'0')+'88'+sfx;
  window._bcLastGen={cust,prod,items:[],sfx,pid:t.id||null,sample:{code,qty}};
  out.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:14px;font-weight:600">${SAMPLE_STEP} — לקוח ${cust} · מוצר ${prod}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="bcPrint()" style="font-size:13px">🖨️ הדפס הכל</button>
        <button class="btn" onclick="bcPrint('labels')" style="font-size:13px">🏷️ הדפס למדבקות</button>
        <button class="btn success" onclick="bcDownloadPDF()" style="font-size:13px">📄 הורד PDF מדבקות</button>
        <button class="btn" onclick="bcSharePDF()" style="font-size:13px">💬 שלח בוואטסאפ</button>
      </div>
    </div>
    <div id="bc-print-area" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px"></div>`;
  const div=document.createElement('div');
  div.className='bc-card';div.dataset.col='sample';div.dataset.idx='sample';
  div.style.cssText='background:#fff;border:3px solid #1d4ed8;border-radius:6px;padding:10px;display:flex;align-items:center;gap:12px;break-inside:avoid;grid-column:1/-1;position:relative';
  const qrWrap=document.createElement('div');
  qrWrap.style.cssText='flex-shrink:0;width:150px;height:150px;overflow:hidden';
  const info=document.createElement('div');
  info.style.cssText='text-align:right;line-height:2;flex:1';
  info.innerHTML=`
    <div style="font-size:15px;font-weight:800;color:#1d4ed8;margin-bottom:4px">${SAMPLE_STEP}</div>
    <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${cust}</div>
    <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${prod}</div>
    ${bcOrderLbl(code)}
    <div style="font-size:16px;font-weight:800;color:#1d4ed8">כמות: ${qty} יח׳</div>
    <div style="font-size:11px;color:#555;margin-top:4px">${code}</div>`;
  div.appendChild(qrWrap);div.appendChild(info);div.appendChild(_bcSelCheckbox());
  _bcNfcBtn(div,code,SAMPLE_STEP+' · '+qty+' יח׳');
  document.getElementById('bc-print-area').appendChild(div);
  new QRCode(qrWrap,{text:bcQr(code),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  _qrOne(qrWrap);
  _bcRepairCard(document.getElementById('bc-print-area'),cust,prod,sfx);
}
// הדפסה דרך iframe נסתר במקום window.open — ב-PWA במסך הבית (standalone) window.open נתקע על דף ההדפסה ואי אפשר לסגור אותו אלא בסגירת האפליקציה כולה
// ✍ מסמך עם מקום לחתימת העסק (sig-slot) ⇒ שואלים אם לחתום, ומכניסים את התמונה.
// בלי חתימה שמורה / בלי הרשאה — המקום פשוט נמחק והמסמך יוצא כרגיל.
function printViaIframe(html){
  if(html.includes('<span class="sig-slot"></span>')){_sigPrint(html);return;}
  _printViaIframe(html);
}
async function _sigPrint(html){
  let img=null;
  try{const sig=await bizSigGet();if(sig&&await showConfirm('✍ חתימה','להפיק את המסמך עם חתימת העסק?','✍ עם חתימה','בלי חתימה'))img=sig;}catch(e){}
  html=html.split('<span class="sig-slot"></span>').join(img?`<img src="${img}" alt="" style="display:block;max-height:58px;max-width:180px;margin:-6px 0 -20px"/>`:'');
  _printViaIframe(html);
}
function _printViaIframe(html){
  const old=document.getElementById('print-iframe');if(old)old.remove();
  const f=document.createElement('iframe');
  f.id='print-iframe';
  f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc=f.contentWindow.document;
  doc.open();doc.write(html);doc.close();
  const go=()=>{
    if(f.dataset.printed)return;f.dataset.printed='1';
    try{f.contentWindow.focus();f.contentWindow.print();}catch(e){window.print();}
    setTimeout(()=>{const el=document.getElementById('print-iframe');if(el)el.remove();},60000);
  };
  // התמונות הן data-URL ומוכנות מיד; שהות קצרה לוודא רינדור לפני פתיחת גיליון ההדפסה + fallback אם onload לא נורה
  f.onload=()=>setTimeout(go,300);
  setTimeout(go,600);
}
// 🔧 ברקוד תיקון בודד — כרטיס מהיר ליד ספירה/גזירה ויצא ללקוח (14/11/2026). אותו ברקוד כמו הכרטיס
// שנוסף ל"צור" של המידות (repairCodeOf); מידה, צבע וכמות — נבחרים בסריקה (repairPick).
function bcGenerateRepair(){
  const cust=(document.getElementById('bc-gen-cust')?.value||'').replace(/\D/g,'').padStart(2,'0').slice(0,2);
  const prod=(document.getElementById('bc-gen-prod')?.value||'').replace(/\D/g,'').padStart(5,'0').slice(0,5);
  if(cust==='00'||prod==='00000'){alert('הזן מספר לקוח ומספר מוצר');return;}
  const _t=bcGenTarget(),code=repairCodeOf(cust,prod,bcSuffixFor(_t));
  const {name:pname,date:pdate}=_bcProdMeta(_t);
  const out=document.getElementById('bc-gen-output');if(!out)return;
  out.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn" onclick="bcPrintRepair('${cust}','${prod}','${code}','${escj(pname)}','${escj(pdate)}')" style="font-size:13px">🖨️ הדפס</button>
      <button class="btn" onclick="bcPrintRepair('${cust}','${prod}','${code}','${escj(pname)}','${escj(pdate)}',true)" style="font-size:13px">💬 שלח בוואטסאפ</button>
    </div>
    <div style="background:#fff;border:3px solid #b45309;border-radius:8px;padding:14px;display:flex;align-items:center;gap:14px;max-width:400px">
      <div id="bc-repair-qr" style="flex-shrink:0;width:150px;height:150px"></div>
      <div style="line-height:2">
        <div style="font-size:14px;font-weight:800;color:#b45309">${REPAIR_STEP}</div>
        <div style="font-size:13px;font-weight:700;color:#000">לקוח: ${cust}</div>
        <div style="font-size:13px;font-weight:700;color:#000">מוצר: ${prod}</div>
        ${bcOrderLbl(code)}
        <div style="font-size:12px;color:#666">מידה, צבע וכמות — בוחרים בסריקה</div>
        <div style="font-size:11px;color:#999;margin-top:4px">${code}</div>
        ${_bcProdMetaLine(pname,pdate)}
      </div>
    </div>`;
  new QRCode(document.getElementById('bc-repair-qr'),{text:bcQr(code),width:150,height:150,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  _qrOne(document.getElementById('bc-repair-qr'));
}
function bcPrintRepair(cust,prod,code,pname,pdate,share){
  const canvas=document.querySelector('#bc-repair-qr canvas');
  const img=canvas?`<img src="${canvas.toDataURL('image/png')}" style="width:150px;height:150px"/>`:'';
  _bcCardOut(share,'repair-barcode',cust,prod,code,'ברקוד תיקון',`<html dir="rtl"><head><title>ברקוד תיקון</title>
    <style>body{margin:20px;font-family:Arial,sans-serif;background:#fff}
    .card{border:3px solid #b45309;border-radius:8px;padding:16px;display:inline-flex;align-items:center;gap:16px}
    @media print{@page{size:A4 portrait;margin:10mm}}</style></head><body>
    <div class="card">
      ${img}
      <div style="line-height:2.2">
        <div style="font-size:16px;font-weight:800;color:#b45309">${REPAIR_STEP}</div>
        <div style="font-size:14px;font-weight:700">לקוח: ${cust}</div>
        <div style="font-size:14px;font-weight:700">מוצר: ${prod}</div>
        ${bcOrderLbl(code)}
        <div style="font-size:13px;color:#666">מידה, צבע וכמות — בוחרים בסריקה</div>
        <div style="font-size:11px;color:#999;margin-top:4px">${code}</div>
        ${_bcProdMetaLine(pname,pdate)}
      </div></div></body></html>`);
}
