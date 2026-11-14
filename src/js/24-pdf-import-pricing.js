// ─── PDF IMPORT ──────────────────────────────────────────────
function bcOpenPDF(){document.getElementById('bc-pdf-input')?.click();}

async function bcHandlePDF(input){
  const file=input.files[0];if(!file)return;
  input.value='';
  const msg=document.getElementById('bc-pdf-msg');
  const setMsg=(t,ok)=>{if(msg){msg.textContent=t;msg.style.color=ok?'var(--green-txt)':ok===false?'var(--red-txt)':'var(--txt3)';}};
  setMsg('⏳ מעבד קובץ...',null);
  try{
    await _lib('pdfjs').catch(()=>{});
    if(!window.pdfjsLib){setMsg('⚠ PDF.js לא נטען, נסה שוב',false);return;}
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const ab=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:ab}).promise;
    const page=await pdf.getPage(1);
    const tc=await page.getTextContent();
    const items=tc.items.map(it=>({str:it.str.trim(),x:Math.round(it.transform[4]),y:Math.round(it.transform[5])})).filter(it=>it.str);
    const fullText=items.map(it=>it.str).join(' ');
    let result=null;
    if(fullText.includes('רונן חן')||fullText.includes('RONEN CHEN')){
      result=_parseRonenChen(items);result.custCode='01';result.supplier='רונן חן';
    } else if(fullText.includes('רעומה')||fullText.includes('Rauma')||fullText.includes('RAUMA')){
      result=_parseRauma(items);result.custCode='02';result.supplier='רעומה';
    }
    if(result&&result.product&&result.colors.length){
      _applyPDFResult(result);
      setMsg(`✅ ${result.supplier} | מוצר ${result.product} | ${result.colors.length} צבעים`,true);
    } else {
      setMsg('⚠ לא זוהה פורמט — מלא ידנית',false);
    }
  }catch(e){console.error(e);setMsg('⚠ שגיאה: '+e.message,false);}
}

function _parseRonenChen(items){
  const prodItem=items.find(it=>Math.abs(it.x-399)<30&&Math.abs(it.y-410)<15&&/^\d{4,5}$/.test(it.str));
  const product=prodItem?prodItem.str.padStart(5,'0'):null;
  const headerRow=items.filter(it=>/^[0-7]$/.test(it.str)&&it.x>300&&it.x<680);
  const headerY=headerRow.length?headerRow[0].y:306;
  const colorItems=items.filter(it=>it.y<headerY-5&&it.x>750&&/[א-ת]/.test(it.str));
  const colorYs=[...new Set(colorItems.map(it=>it.y))];
  const colors=colorYs.map(y=>{
    const namePieces=items.filter(it=>Math.abs(it.y-y)<3&&it.x>700);
    const name=namePieces.sort((a,b)=>b.x-a.x).map(it=>it.str).join('').replace(/\d+$/,'').trim();
    const totalItem=items.find(it=>Math.abs(it.y-y)<5&&it.x>260&&it.x<310&&/^\d+$/.test(it.str));
    const total=totalItem?parseInt(totalItem.str):0;
    return{name,total};
  }).filter(c=>c.total>1&&c.name.length>1&&!c.name.includes('סה')&&!c.name.includes('דגם')&&!c.name.includes('מקורי'));
  return{product,colors};
}

function _parseRauma(items){
  // מוצר: מספר 8 ספרות → הסר 2 ראשונות → 4 ספרות → הוסף 0
  const modelItem=items.find(it=>/^\d{7,8}$/.test(it.str));
  let product=null;
  if(modelItem){const raw=modelItem.str.slice(2);product=('0'+raw.slice(0,4)).padStart(5,'0');}
  // שורות צבע: Hebrew text על הצד עם כמות
  const colorItems=items.filter(it=>/[א-ת]/.test(it.str)&&it.x>600);
  const colorYs=[...new Set(colorItems.map(it=>it.y))].slice(0,10);
  const colors=colorYs.map(y=>{
    const namePieces=items.filter(it=>Math.abs(it.y-y)<3&&it.x>500);
    const name=namePieces.sort((a,b)=>b.x-a.x).map(it=>it.str).join('').trim();
    const totalItem=items.find(it=>Math.abs(it.y-y)<5&&it.x<200&&/^\d+$/.test(it.str)&&parseInt(it.str)>1);
    const total=totalItem?parseInt(totalItem.str):0;
    return{name,total};
  }).filter(c=>c.total>1&&c.name.length>1&&!c.name.includes('סה')&&!c.name.includes('עובד')&&!c.name.includes('לקוח'));
  return{product,colors};
}

function _guessColor(name){
  for(const[code,heb]of Object.entries(COLORS)){
    if(name.includes(heb.split('/')[0].trim()))return code;
  }
  return Object.keys(COLORS)[0]||'01';
}

function _applyPDFResult(result){
  if(result.custCode){const el=document.getElementById('bc-gen-cust');if(el)el.value=result.custCode;}
  if(result.product){const el=document.getElementById('bc-gen-prod');if(el)el.value=result.product;}
  const container=document.getElementById('bc-gen-rows');
  if(!container)return;
  container.innerHTML='';
  result.colors.forEach(c=>{
    const colorOpts=Object.entries(COLORS).map(([k,v])=>`<option value="${esc(k)}" ${k===_guessColor(c.name)?'selected':''}>${esc(COLORS_AR[k]||v)} — ${esc(v)}</option>`).join('');
    const div=document.createElement('div');
    div.className='bc-row';
    div.style.cssText='display:grid;grid-template-columns:80px 80px 1fr 36px;gap:8px;align-items:end;margin-bottom:8px;background:var(--bg2);padding:8px;border-radius:8px';
    div.innerHTML=`
      <div><label style="font-size:11px;color:var(--txt3)">מידה</label>
        <input type="text" class="bc-size" maxlength="1" value="0" style="font-size:14px;font-weight:600;text-align:center"/></div>
      <div><label style="font-size:11px;color:var(--txt3)">כמות</label>
        <input type="number" class="bc-qty" min="1" max="999" value="${Math.min(999,c.total)}" style="font-size:14px;font-weight:600;text-align:center"/></div>
      <div><label style="font-size:11px;color:var(--txt3)">${esc(c.name)}</label>
        <select class="bc-col" style="font-size:13px">${colorOpts}</select></div>
      <button onclick="this.closest('.bc-row').remove()" style="background:none;border:none;cursor:pointer;color:var(--red-txt);font-size:20px;padding-bottom:2px">✕</button>`;
    container.appendChild(div);
  });
}
// ─────────────────────────────────────────────────────────────

function bcExportNiimbot(){
  const g=window._bcLastGen;
  if(!g){alert('צור ברקודים תחילה');return;}
  const {cust,prod,items}=g,sfx=g.sfx||'';
  const sel=_bcSelSet();
  const filtered=items.filter((_,i)=>sel.items.has(i));
  if(!filtered.length){alert('בחר לפחות ברקוד אחד לייצוא');return;}
  const BOM='﻿';
  // 🔐 עמודת "ברקוד" = מה שנכנס ל-QR — כולל הסימון (bcQr), אחרת המדבקה מ-NIIMBOT נחסמת באכיפה; "מספר" = הספרות לתצוגה
  const header='ברקוד,לקוח,מוצר,מידה,כמות,קוד_צבע,שם_צבע,מספר\r\n';
  const rows=filtered.map(it=>{
    const code=cust+prod+it.size+it.qty+it.col+sfx;
    const colName=(COLORS[it.col]||it.col).replace(/,/g,' ');
    return `${bcQr(code)},${cust},${prod},${it.lbl||it.size},${parseInt(it.qty)},${it.col},${colName},${code}`;
  }).join('\r\n');
  const csv=BOM+header+rows;
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`niimbot_${prod}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function renderProducts(){
  try{pstkBadge();}catch(e){}
  const q=(document.getElementById('prod-search')?.value||'').trim().toLowerCase();
  const list=S.products.filter(p=>!q||p.prod.includes(q)||p.cust.includes(q)||(p.name||'').toLowerCase().includes(q));
  const el=document.getElementById('products-list');
  if(!el)return;
  if(!list.length){el.innerHTML='<div style="text-align:center;color:var(--txt3);padding:2rem">אין מוצרים. לחץ "+ הוסף מוצר"</div>';return;}
  el.innerHTML=list.map(p=>{
    // תג בלבד — התמונות נמשכות בלחיצה. ראה fetchProdImgs.
    const _ic=prodImgCount(p);
    const imgHtml=_ic
      ?`<div style="margin-top:8px"><button type="button" class="btn" style="font-size:11px;padding:4px 10px" onclick="loadProdImgs('${p.id}')">📷 ${_ic} ${_ic===1?'תמונה':'תמונות'}</button><div id="pimg-${p.id}"></div></div>`:'';
    const qtyRows=p.quantities&&p.quantities.length
      ?`<div style="margin-top:8px;font-size:11px;color:var(--txt3)">${p.quantities.map(q=>`מידה ${esc(szLbl(q.size,p))} | ${COLORS[q.color]||q.color}: <b style="color:var(--txt)">${q.qty}</b>`).join(' &nbsp;·&nbsp; ')}</div>`:'';
    const docHtml=p.docs&&p.docs.length
      ?`<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${p.docs.map((d,i)=>`<a href="${d.data}" download="${d.name}" style="font-size:11px;padding:3px 8px;border-radius:5px;background:var(--bg2);color:var(--blue-txt);text-decoration:none">📄 ${esc(d.name)}</a>`).join('')}</div>`:'';
    // שלב נוכחי — Array.isArray מגן מנתונים ישנים שנשמרו כאובייקט
    const log=Array.isArray(p.stageLog)?p.stageLog:[];
    const skipped=Array.isArray(p.stageSkipped)?p.stageSkipped:[];
    const activeStages=PROD_STAGES.filter(s=>!skipped.includes(s.id));
    const lastDone=activeStages.filter(s=>log.find(e=>e.id===s.id)).pop();
    const nextStage=activeStages.find(s=>!log.find(e=>e.id===s.id));
    const isDone=lastDone?.id==='shipped';
    const stageHtml=lastDone
      ?`<div style="margin-top:6px;font-size:11px">
          <span style="background:${isDone?'var(--green-bg)':'var(--amber-bg)'};color:${isDone?'var(--green-txt)':'var(--amber-txt)'};padding:2px 8px;border-radius:10px;font-weight:600">📍 ${lastDone.label}${isDone&&p.shippedQty!=null?` · ${p.shippedQty} יח'`:''}</span>
          ${nextStage&&!isDone?`<span style="color:var(--txt3);margin-right:6px">← הבא: ${nextStage.label}</span>`:''}
        </div>`
      :'';
    // ✂️ שלבים שנוספו מהסורק (שם בלבד) — מחכים שהמנהל ישלים תחנה וזמן בכרטיס
    const pendSt=(p.workSteps||[]).filter(stepPending);
    const pendHtml=pendSt.length&&S.user?.role!=='worker'&&S.user?.role!=='helper'?`<div style="margin-top:4px;font-size:11px;font-weight:600;color:var(--red-txt)" title="${esc(pendSt.map(stepName).join(' · '))}">⚠ ${pendSt.length===1?'שלב אחד ממתין':pendSt.length+' שלבים ממתינים'} לתחנה וזמן: ${esc(pendSt.slice(0,3).map(stepName).join(' · '))}${pendSt.length>3?' …':''}${p.countBy?' · '+esc(p.countBy):''}</div>`:'';
    // תמחור בכרטיס המוצר — מנהל בלבד (תמחור שלב ה', השלמה משלב ד')
    let pricingHtml='';
    if(S.user?.role==='manager'&&+p.unitPrice){
      const price=+p.unitPrice,pct=+p.targetProfitPct||0,mat=+p.directMaterialsCost||0;
      const budget=price*(1-pct/100)-mat;
      pricingHtml=`<div style="margin-top:6px;font-size:11px;color:var(--txt3)">💰 מחיר <b style="color:var(--txt)">₪${price.toFixed(2)}</b> · רווח יעד ${pct}% (₪${(price*pct/100).toFixed(2)}) · חומרים ₪${mat.toFixed(2)}${+p.extraMatPrice?` · 🧵 בתוספת ₪${(+p.extraMatPrice).toFixed(2)}`:''} · תקציב עבודה <b style="color:${budget>0?'var(--green-txt)':'var(--red-txt)'}">₪${budget.toFixed(2)}</b>${budget<=0?' ⚠':''}</div>`;
    }
    return`<div class="card" style="margin-bottom:10px">
      <div class="pcard-row" style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--txt)">מוצר ${esc(p.prod)} &nbsp;·&nbsp; לקוח ${esc(p.cust)}${(parseInt(p.orderNo,10)||0)?` &nbsp;·&nbsp; <span style="color:var(--green-txt,#16a34a)" title="${p.bcLen===BC_LEN_NEW?'ברקודים בני 16 ספרות':'הזמנה מלפני השינוי — ברקודים בני 13 ספרות'}">הזמנה #${String(p.orderNo).padStart(3,'0')}${p.bcLen===BC_LEN_NEW?'':' <span style="color:var(--txt3);font-weight:400">(13)</span>'}</span>`:''}${p.name?` &nbsp;·&nbsp; <span style="color:var(--txt3)">${esc(p.name)}</span>`:''}${p.isSample?` &nbsp;·&nbsp; <span style="color:var(--blue-txt)">${SAMPLE_STEP}</span>`:''}</div>
          ${stageHtml}${pendHtml}${pricingHtml}${qtyRows}${imgHtml}${docHtml}
        </div>
        <div class="pcard-btns" style="display:flex;gap:6px;flex-shrink:0">
          ${(p.workSteps||[]).some(s=>stepLevel(s)&&stepStation(s))?`<button class="btn" style="font-size:11px;padding:4px 10px;color:var(--blue-txt)" onclick="showProductPlan('${p.id}')">🎯 שיבוץ</button>`:''}
          ${isDone?(prodShipments(p).length>1
            ?`<button class="btn" style="font-size:11px;padding:4px 10px;color:var(--green-txt,#16a34a)" onclick="showShipments('${p.id}')">📄 ${prodShipments(p).length} תעודות</button>`
            :`<button class="btn" style="font-size:11px;padding:4px 10px;color:var(--green-txt,#16a34a)" onclick="printDeliveryNote('${p.id}')">📄 תעודת משלוח</button>`):''}
          <button class="btn" style="font-size:11px;padding:4px 10px" title="פותח את חלון יצא ללקוח של ההזמנה הזו — כמו סריקת ברקוד יצא ללקוח" onclick="shipFromProduct('${p.id}')">🚚 יצא ללקוח</button>
          <button class="btn" style="font-size:11px;padding:4px 10px" onclick="bcFromProduct('${p.id}')">🏷️ ברקודים</button>
          ${canShort()?`<button class="btn" style="font-size:11px;padding:4px 10px" onclick="openCutReport('${p.id}')">✂️ גזירה${p.cutReport?.rolls?.length?' ('+p.cutReport.rolls.length+')':''}</button>`:''}
          <button class="btn" style="font-size:11px;padding:4px 10px" onclick="openProductModal('${p.id}')">✏️ עריכה</button>
          <button class="btn danger" style="font-size:11px;padding:4px 8px;opacity:.7" onclick="deleteProduct('${p.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openProductModal(id){
  _editProdId=id||null;
  const p=id?S.products.find(x=>x.id===id):null;
  document.getElementById('prod-modal-title').textContent=p?`עריכת מוצר ${p.prod}`:'הוספת מוצר';
  const colorOpts=Object.entries(COLORS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  const qRows=p&&p.quantities&&p.quantities.length
    ?p.quantities.map((q,i)=>`<tr>
      <td><input type="text" value="${esc(szLbl(q.size,p))}" maxlength="4" style="width:50px;font-size:12px" data-qi="${i}" data-qf="size"></td>
      <td><select data-qi="${i}" data-qf="color" style="font-size:12px"><option value="">--</option>${Object.entries(COLORS).map(([k,v])=>`<option value="${k}" ${q.color===k?'selected':''}>${v}</option>`).join('')}</select></td>
      <td><input type="number" value="${q.qty}" min="0" style="width:70px;font-size:12px" data-qi="${i}" data-qf="qty"></td>
      <td><button type="button" onclick="this.closest('tr').remove();renderProductPricing()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button></td>
    </tr>`).join(''):'';
  const imgPrev=p&&p.images&&p.images.length
    ?`<div id="prod-img-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${p.images.map((img,i)=>`<div style="position:relative"><img src="${img}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--brd)"><button type="button" onclick="removeProdImg(${i})" style="position:absolute;top:-4px;right:-4px;background:var(--red);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1">✕</button></div>`).join('')}</div>`
    :`<div id="prod-img-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>`;
  const docPrev=p&&p.docs&&p.docs.length
    ?`<div id="prod-doc-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${p.docs.map((d,i)=>`<div style="display:flex;align-items:center;gap:4px;background:var(--bg2);border-radius:5px;padding:3px 8px;font-size:11px">📄 ${esc(d.name)}<button type="button" onclick="removeProdDoc(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px">✕</button></div>`).join('')}</div>`
    :`<div id="prod-doc-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>`;
  document.getElementById('prod-modal-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div class="field"><label>מספר מוצר (5 ספרות)</label><input id="pm-prod" value="${esc(p?.prod||'')}" maxlength="5" placeholder="12345" style="font-size:13px" oninput="pmCheckPrevOrder()"/></div>
      <div class="field"><label>לקוח (2 ספרות)</label><input id="pm-cust" value="${esc(p?.cust||'')}" maxlength="2" placeholder="01" style="font-size:13px" oninput="pmCheckPrevOrder();pmConsRefresh()"/></div>
    </div>
    <!-- הזמנה חוזרת: השלבים והתמחור זהים לקודמת. הכמות **לא** מועתקת — היא נספרת
         במפעל אחרי הגזירה ומוזנת אחר כך. -->
    <div id="pm-prev-order" style="display:none;margin-bottom:10px"></div>
    <div class="field" style="margin-bottom:10px"><label>שם / תיאור (אופציונלי)</label><input id="pm-name" value="${esc(p?.name||'')}" placeholder="לדוגמה: חולצה קיץ" style="font-size:13px"/></div>

    <div class="sec" style="margin-bottom:6px">📸 תמונות דגם</div>
    ${imgPrev}
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button type="button" class="btn" onclick="document.getElementById('pm-img-file').click()" style="font-size:12px">📁 העלה תמונה</button>
      <button type="button" class="btn" onclick="prodCamBtn()" style="font-size:12px">📷 צלם</button>
      <input id="pm-img-file" type="file" accept="image/*" multiple class="hidden" onchange="addProdImages(this)">
      <input id="pm-img-cam" type="file" accept="image/*" capture="environment" class="hidden" onchange="addProdImages(this)">
    </div>
    <div id="pm-camera-wrap" class="hidden" style="margin-bottom:10px">
      <video id="pm-camera-video" autoplay playsinline style="width:100%;border-radius:8px;max-height:220px;background:#000"></video>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button type="button" class="btn primary" onclick="snapProdPhoto()" style="flex:1">📸 צלם תמונה</button>
        <button type="button" class="btn" onclick="closeProdCamera()">סגור</button>
      </div>
      <canvas id="pm-camera-canvas" class="hidden"></canvas>
    </div>

    <div class="sec" style="margin-bottom:6px">📄 מסמכי עבודה / הוראות</div>
    ${docPrev}
    <div style="margin-bottom:12px">
      <button type="button" class="btn" onclick="document.getElementById('pm-doc-file').click()" style="font-size:12px">📁 העלה מסמך</button>
      <input id="pm-doc-file" type="file" accept="image/*,.pdf,.doc,.docx" multiple class="hidden" onchange="addProdDocs(this)">
    </div>

    <div class="sec" style="margin-bottom:6px">📦 כמויות לפי מידה וצבע</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px" id="pm-qty-table">
      <thead><tr style="border-bottom:1px solid var(--brd)">
        <th style="padding:5px;text-align:right">מידה</th>
        <th style="padding:5px;text-align:right">צבע</th>
        <th style="padding:5px;text-align:right">כמות</th>
        <th></th>
      </tr></thead>
      <tbody id="pm-qty-body">${qRows}</tbody>
    </table>
    <button type="button" class="btn" onclick="addQtyRow()" style="font-size:12px">+ הוסף שורה</button>
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin-right:10px;flex-wrap:wrap"><input type="checkbox" id="pm-szlet" ${p?.szLetters?'checked':''}> 👕 מידות באותיות <span style="color:var(--txt3)">XS=0 · S=1 · M=2 · L=3 · XL=4 · XXL=5 · 3XL=6 — אפשר להקליד את האות בטבלה</span></label>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
      <label for="pm-estqty" style="font-size:12px;font-weight:600">📏 כמות משוערת</label>
      <input id="pm-estqty" type="number" min="0" step="1" value="${p?.estQty||''}" placeholder="למשל 200" oninput="renderProductPricing()" style="width:90px;font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)"/>
      <span style="font-size:11px;color:var(--txt3)">עד הספירה/גזירה — לצפי זמן בלבד (ספירה, גזירה, זמן לפי מחלקה). הכמות בטבלה גוברת ברגע שמוזנת</span>
    </div>
    <div style="margin-top:10px;padding:8px;border-radius:8px;border:1px solid var(--brd)">
      <div style="font-size:12px;font-weight:700">🧵 צריכת חומרים ליחידה <span style="font-weight:400;color:var(--txt3)">— יורד מהמלאי בכל תעודת משלוח × היחידות שיצאו</span></div>
      <div id="pm-cons">${pmConsHtml(p?.cust||'',p?.cons)}</div>
    </div>
    <div style="margin-top:10px;padding:8px;background:var(--bg);border-radius:8px;border:1px dashed var(--brd)">
      <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">⚡ מילוי מהיר — אותה כמות לכל המידות</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">
        <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">צבע</div>
          <select id="pm-bulk-color" style="font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
            <option value="">בחר...</option>${Object.entries(COLORS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
          </select></div>
        <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">כמות</div>
          <input id="pm-bulk-qty" type="number" min="0" value="0" style="width:70px;font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)"></div>
        <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">מידה מ</div>
          <input id="pm-bulk-from" type="number" min="0" max="9" value="1" style="width:50px;font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)"></div>
        <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">עד</div>
          <input id="pm-bulk-to" type="number" min="0" max="9" value="6" style="width:50px;font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)"></div>
        <button type="button" class="btn primary" onclick="addQtyBulk()" style="font-size:12px;padding:5px 12px">+ הוסף הכל</button>
      </div>
    </div>
    ${renderStagesHtml(p)}
    <div class="sec" style="margin-top:14px;margin-bottom:8px">🔧 שלבי עבודה (לסורק + תמחור)</div>
    <div id="pm-tasksteps-list" style="margin-bottom:8px" onchange="renderProductPricing()">${(p?.workSteps||[]).map(s=>_stepRowHtml(s)).join('')}</div>
    <button type="button" class="btn" onclick="addTaskStepRow()" style="font-size:12px">+ הוסף שלב עבודה</button>
    <button type="button" class="btn" onclick="printWorkSteps()" style="font-size:12px" title="דף שלבים ותחנות לרצפה — בלי זמן לשלב; למטה הזמן להזמנה לפי מחלקה">🖨 הדפס שלבים</button>
    <button type="button" class="btn" onclick="printWorkSteps(true)" style="font-size:12px" title="אותו דף שלבים כ-PDF — נשלח בוואטסאפ">💬 וואטסאפ</button>

    <div class="sec" style="margin-top:14px;margin-bottom:6px">💰 תמחור ליחידה</div>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:8px;cursor:pointer;flex-wrap:wrap"><input id="pm-sample" type="checkbox" style="width:auto" ${p?.isSample?'checked':''} onchange="pmSampleToggle(this)"/> <b>👕 דגם ראשון</b> <span style="font-size:11px;color:var(--txt3)">₪${SAMPLE_UNIT_PRICE} ליחידה · ברקוד דגם אחד · בלי שלבים, פתוח לכל התחנות · העלות לפי זמן העבודה</span></label>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px;margin-bottom:8px">
      <div class="field"><label>מחיר מכירה ₪</label><input id="pm-price" type="number" min="0" step="0.1" value="${p?.unitPrice||''}" placeholder="0" style="font-size:13px" oninput="syncProfitFields('price')"/></div>
      <div class="field"><label>רווח יעד %</label><input id="pm-profit" type="number" min="0" max="95" step="1" value="${p?.targetProfitPct??''}" placeholder="0" style="font-size:13px" oninput="syncProfitFields('pct')"/></div>
      <div class="field"><label>רווח יעד ₪</label><input id="pm-profit-ils" type="number" min="0" step="0.1" value="${p&&+p.unitPrice&&p.targetProfitPct!=null?((+p.unitPrice)*(+p.targetProfitPct)/100).toFixed(2):''}" placeholder="0" style="font-size:13px" oninput="syncProfitFields('ils')"/></div>
      <div class="field"><label>חומרים ₪ <span style="font-size:10px;color:var(--txt3)">(מתוך המחיר · +אריזה+הובלה)</span></label><input id="pm-materials" type="number" min="0" step="0.1" value="${p?.directMaterialsCost||''}" placeholder="0" title="עלות שהמפעל סופג מתוך מחיר המכירה — יורדת מתקציב העבודה" style="font-size:13px" oninput="renderProductPricing()"/></div>
      <div class="field"><label>🧵 חומרים בתוספת ₪ <span style="font-size:10px;color:var(--txt3)">(מעבר למחיר)</span></label><input id="pm-extramat" type="number" min="0" step="0.1" value="${p?.extraMatPrice||''}" placeholder="0" title="חומרים שהלקוח משלם בנוסף למחיר התפירה והגזירה — נכנסים להתחשבנות, לא יורדים מתקציב העבודה" style="font-size:13px" oninput="renderProductPricing()"/></div>
      <div class="field"><label>✂ עלות גזירה ₪ <span style="font-size:10px;color:var(--txt3)">(ליחידה)</span></label><input id="pm-cutprice" type="number" min="0" step="0.1" value="${p?.cutPrice||''}" placeholder="0" title="מחיר הגזירה ליחידה — נוסף למחיר המכירה. מוזן בהקמת המוצר, לפני שהכמות ידועה. סמן ✂ על שלבי הגזירה כדי שייספרו מולו." style="font-size:13px" oninput="renderProductPricing()"/></div>
      <div class="field"><label>✂ רווח יעד גזירה %</label><input id="pm-cutprofit" type="number" min="0" max="99" step="1" value="${p?.cutProfitPct??''}" placeholder="לפי התפירה" title="אחוז רווח היעד של הגזירה — נפרד מאחוז התפירה. כל עוד ריק, החישוב משתמש באחוז התפירה." style="font-size:13px" oninput="renderProductPricing()"/></div>
    </div>
    <div id="pm-pricing-result" style="margin-bottom:8px"></div>
    ${p&&S.user?.role==='manager'?'<div id="pm-repairs" style="margin-bottom:8px"></div>':''}`;
  document.getElementById('prod-modal-wrap').classList.remove('hidden');
  if(p&&S.user?.role==='manager')_repairsFill(p); // 🔧 תיקונים — מי תיקן ומה עלה
  // התמונות נטענות אסינכרונית; עד שיגיעו _prodImgs ריק והתצוגה מראה "טוען…".
  // ⚠️ אסור לשמור מוצר לפני שהן הגיעו — נשמר דגל שחוסם את saveProduct.
  _prodImgs=p?[...(p.images||[])]:[];
  _prodDocs=p?[...(p.docs||[])]:[];
  _prodImgsLoading=false;
  if(p&&!_prodImgs.length&&prodImgCount(p)){
    _prodImgsLoading=true;
    const _pv=document.getElementById('prod-img-preview');
    if(_pv)_pv.innerHTML='<span style="font-size:11px;color:var(--txt3)">טוען תמונות…</span>';
    // כשל בטעינה ⇒ החלון נשאר חסום לשמירה (_prodImgsLoading='fail'), אחרת השמירה הייתה מוחקת את התמונות
    fetchProdImgs(p.id,true).then(a=>{_prodImgs=[...a];_prodImgsLoading=false;refreshImgPreview();})
      .catch(()=>{_prodImgsLoading='fail';if(_pv)_pv.innerHTML='<span style="font-size:11px;color:var(--red-txt)">⚠ התמונות לא נטענו — סגור ופתח שוב את החלון לפני שמירה</span>';});
  }
  renumberStepRows();
  renderProductPricing();
  pmCheckPrevOrder(); // מוצר חדש שכבר יש לו הזמנה קודמת — להציע העתקה במקום הקלדה מחדש
}

let _prodImgs=[], _prodDocs=[], _prodCamStream=null;
// נעילה בזמן שתמונות בדרך — שמירה באמצע הייתה כותבת מערך ריק ומוחקת אותן
let _prodImgsLoading=false;

function closeProdModal(){
  document.getElementById('prod-modal-wrap').classList.add('hidden');
  closeProdCamera();
  _editProdId=null;_prodImgs=[];_prodDocs=[];
}

function addQtyBulk(){
  const color=document.getElementById('pm-bulk-color')?.value;
  const qty=parseInt(document.getElementById('pm-bulk-qty')?.value)||0;
  const fromVal=document.getElementById('pm-bulk-from')?.value;
  const from=fromVal===''||fromVal==null?1:parseInt(fromVal);
  const toVal=document.getElementById('pm-bulk-to')?.value;
  const to=toVal===''||toVal==null?6:parseInt(toVal);
  if(!color){alert('בחר צבע');return;}
  if(from>to){alert('מידה "מ" חייבת להיות קטנה מ"עד"');return;}
  const colorOpts=Object.entries(COLORS).map(([k,v])=>`<option value="${k}"${k===color?' selected':''}>${v}</option>`).join('');
  for(let s=from;s<=to;s++){
    const i=Date.now()+s;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input type="text" maxlength="4" style="width:50px;font-size:12px" data-qi="${i}" data-qf="size" value="${s}"></td>
      <td><select data-qi="${i}" data-qf="color" style="font-size:12px"><option value="">--</option>${colorOpts}</select></td>
      <td><input type="number" value="${qty}" min="0" style="width:70px;font-size:12px" data-qi="${i}" data-qf="qty"></td>
      <td><button type="button" onclick="this.closest('tr').remove();renderProductPricing()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button></td>`;
    document.getElementById('pm-qty-body').appendChild(tr);
  }
}
function _stationOpts(sel){
  return`<option value="">— תחנה —</option>`+Object.entries(S.deptStations||{}).filter(([,a])=>a&&a.length).map(([d,sts])=>`<optgroup label="${esc(d)}">${sts.map(st=>{const k=d+'::'+st;return`<option value="${esc(k)}" ${sel===k?'selected':''}>${esc(st)}</option>`;}).join('')}</optgroup>`).join('');
}
// 🔀 תחנות נוספות לשלב — בחירה מרובה. בלי `— תחנה —` ריק: ריק כאן = פשוט לא נבחר כלום.
function _stationOptsMulti(sel){
  const set=new Set(Array.isArray(sel)?sel:[]);
  return Object.entries(S.deptStations||{}).filter(([,a])=>a&&a.length).map(([d,sts])=>`<optgroup label="${esc(d)}">${sts.map(st=>{const k=d+'::'+st;return`<option value="${esc(k)}" ${set.has(k)?'selected':''}>${esc(st)}</option>`;}).join('')}</optgroup>`).join('');
}
// קריאת הבחירה המרובה משורת שלב — משותפת למסלול השמירה ולתצוגת התמחור,
// כדי ששניהם לא יוכלו להיפרד (ראה gotcha_client_server_formula_drift)
// 🔀 תקציר הבחירה על ה-summary. בלעדיו אי אפשר לקפל את התיבה בלי לאבד את המידע,
// ולכן היא נשארה פתוחה בכל שורה ותפסה את כל הטופס. עם התקציר — מקופל ועדיין ברור.
// ⚠️ מוצגות **משפחות** ולא שמות: סימון `مخبلت 2` פותח גם את 1 ו-3, והצגת השם המלא
// הייתה מטעה לחשוב שצריך לסמן כל אחת בנפרד.
function _altSumText(keys){
  const fams=[];
  for(const k of (keys||[])){const f=stationNameOfKey(k).replace(/[\s٠-٩۰-۹\d]+$/,'').trim()||stationNameOfKey(k);if(f&&!fams.includes(f))fams.push(f);}
  return fams.length?': '+fams.join(' · '):'';
}
function _altStationsChanged(el){
  try{
    const sum=el.closest('.ts-row')?.querySelector('.alt-sum');
    if(sum)sum.textContent=_altSumText([...el.selectedOptions].map(o=>o.value));
  }catch(e){}
  renderProductPricing();
}
function _rowAltStations(r){
  const el=r.querySelector('[data-f="altStations"]');
  return el?[...el.selectedOptions].map(o=>o.value).filter(Boolean):[];
}
// ─── הזמנה חוזרת: העתקת שלבי העבודה והתמחור מההזמנה הקודמת ─────
// אותו דגם = אותם שלבים ואותו תמחור. להקליד הכל מחדש זה עבודה מיותרת וגם מקור
// לטעויות — שלב שנשכח נופל בשקט מדוח "מוקצב מול בפועל" (ראה gotcha_orphan_tasktype).
// 🛑 **הכמות לא מועתקת בכוונה.** ההזמנה מגיעה למפעל כגזרים לספירה או כבדים לגזירה,
// והכמות נודעת רק אחרי הספירה. זו גם הסיבה שברקוד הספירה/גזירה הוא בלי כמות.
function pmPrevOrderRec(){
  const prod=(document.getElementById('pm-prod')?.value||'').trim().padStart(5,'0').slice(0,5);
  const cust=(document.getElementById('pm-cust')?.value||'').trim().padStart(2,'0').slice(0,2);
  if(!prod||prod==='00000'||cust==='00')return null;
  // ⚠️ **לא לסנן לפי _editProdId בלבד.** הזמנה חוזרת שכבר הוקמה היא בדיוק המקרה
  // שבו ההעתקה נחוצה — 2691C הוקמה 25/08 לפני שהפיצ'ר היה קיים, והתנאי הישן
  // ("עריכה ⇒ אין מה להעתיק") נעל אותה מחוץ לפיצ'ר.
  //
  // 🔑 אבל **רק אחורה בזמן**: בעריכת הזמנה ותיקה אסור להציע להעתיק מהזמנה חדשה
  // ממנה. זה הפוך מ"ההזמנה הקודמת", ולחיצה בטעות הייתה דורסת שלבים נכונים
  // בשלבים חלקיים של הזמנה שרק נפתחה.
  const stampOf=p=>+p.createdAt||parseInt(String(p.id).replace(/\D/g,''))||0;
  const me=_editProdId?(S.products||[]).find(x=>x.id===_editProdId):null;
  const cutoff=me?stampOf(me):Infinity; // מוצר חדש ⇒ כל הרשומות הקיימות קודמות לו
  const recs=prodMatches(cust,prod).filter(x=>
    x.id!==_editProdId&&stampOf(x)<cutoff&&((x.workSteps||[]).length||+x.unitPrice));
  return recs[0]||null; // prodMatches ממוין חדש→ישן ⇒ הקודמת הכי קרובה
}
function pmCheckPrevOrder(){
  const box=document.getElementById('pm-prev-order');
  if(!box)return;
  const p=pmPrevOrderRec();
  if(!p){box.style.display='none';box.innerHTML='';return;}
  const no=(parseInt(p.orderNo,10)||0)?'הזמנה #'+String(p.orderNo).padStart(3,'0'):'ההזמנה הקודמת';
  const ns=(p.workSteps||[]).length;
  box.style.display='';
  box.innerHTML=`<div style="background:var(--amber-bg);border:1px solid var(--amber-txt);border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
    <div style="min-width:0">
      <div style="font-size:13px;font-weight:700;color:var(--amber-txt)">🔁 הזמנה חוזרת לדגם ${esc(p.cust)}-${esc(p.prod)}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:2px">${esc(no)} · ${esc(p.name||'(בלי שם)')} — ${ns} שלבי עבודה${+p.unitPrice?' · מחיר '+(+p.unitPrice).toFixed(2)+'₪':''}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:2px">הכמות <b>לא</b> תועתק — מזינים אותה אחרי הספירה</div>
    </div>
    <button type="button" class="btn" style="font-size:13px;padding:7px 14px;border-color:var(--amber-txt);color:var(--amber-txt);flex-shrink:0" onclick="pmCopyFromPrev('${escj(p.id)}')">📋 העתק שלבים ותמחור</button>
  </div>`;
}
function pmCopyFromPrev(pid){
  const p=(S.products||[]).find(x=>x.id===pid);
  if(!p){showToast('⚠ ההזמנה הקודמת לא נמצאה','var(--red-txt)');return;}
  const list=document.getElementById('pm-tasksteps-list');
  const filled=list?[...list.querySelectorAll('.ts-row')].some(r=>(r.querySelector('[data-f="name"]')?.value||'').trim()):false;
  // showConfirm נסגר בלחיצה על הרקע ומחזיר false — ולכן false ממופה ל"לא לדרוס", הענף הבטוח
  if(filled&&!confirm('כבר יש שלבי עבודה בטופס. להחליף אותם בשלבים של '+(p.name||p.prod)+'?'))return;
  if(list)list.innerHTML=(p.workSteps||[]).map(s=>_stepRowHtml(s)).join('');
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=(v===0||v)?v:'';};
  set('pm-price',+p.unitPrice||'');
  set('pm-profit',p.targetProfitPct!=null?+p.targetProfitPct:'');
  set('pm-materials',+p.directMaterialsCost||'');
  set('pm-extramat',+p.extraMatPrice||'');
  set('pm-cutprice',+p.cutPrice||''); // ✂ מחיר הגזירה הוא חלק מהתמחור ומועתק איתו (הכמות עדיין לא)
  set('pm-cutprofit',hasCutProfitPct(p)?+p.cutProfitPct:''); // ✂ אחוז רווח הגזירה נוסע יחד עם המחיר
  const pr=+p.unitPrice||0,pc=+p.targetProfitPct||0;
  set('pm-profit-ils',pr&&pc?(pr*pc/100).toFixed(2):'');
  try{renderProductPricing();}catch(e){}
  // 🧵 הצריכה ליחידה (תוויות, פלזלין…) זהה בהזמנה חוזרת — מועתקת יחד עם השלבים
  const cb=document.getElementById('pm-cons');if(cb&&Array.isArray(p.cons)&&p.cons.length)cb.innerHTML=pmConsHtml(p.cust,p.cons);
  showToast('✅ הועתקו '+((p.workSteps||[]).length)+' שלבי עבודה והתמחור — הכמות מוזנת אחרי הספירה','var(--green-txt,#16a34a)',6000);
}
function _stepRowHtml(s){
  const name=stepName(s),nameAr=(s&&typeof s==='object'?s.nameAr:'')||'',lvl=stepLevel(s),stn=stepStation(s),mMin=stepManualMin(s),alt=stepAltStations(s);
  return`<div class="ts-row" style="border:1px solid var(--brd);border-radius:8px;padding:6px;margin-bottom:6px;display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;gap:6px;align-items:center">
      <input type="text" data-f="name" value="${esc(name)}" placeholder="שם השלב (עברית)" style="flex:1;min-width:0;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
      <input type="text" data-f="nameAr" value="${esc(nameAr)}" placeholder="الاسم بالعربية" dir="rtl" style="flex:1;min-width:0;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
      <span class="ts-ord" style="font-size:11px;color:var(--txt3);font-weight:700;min-width:18px;text-align:center" title="מיקום השלב בסדר העבודה"></span>
      <button type="button" title="הזז למעלה" onclick="moveStepRow(this,-1)" style="background:none;border:none;color:var(--txt3);cursor:pointer;font-size:14px;padding:0 2px">▲</button>
      <button type="button" title="הזז למטה" onclick="moveStepRow(this,1)" style="background:none;border:none;color:var(--txt3);cursor:pointer;font-size:14px;padding:0 2px">▼</button>
      <button type="button" onclick="this.closest('.ts-row').remove();renumberStepRows();renderProductPricing()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <select data-f="level" style="flex:1;min-width:0;font-size:12px">
        <option value="0">— רמת קושי —</option>${[1,2,3,4,5].map(l=>`<option value="${l}" ${lvl===l?'selected':''}>${levelName(l,'he')} (${l})</option>`).join('')}
      </select>
      <select data-f="station" style="flex:1;min-width:0;font-size:12px">${_stationOpts(stn)}</select>
      <input type="number" data-f="manualMin" min="0" step="0.1" value="${mMin||''}" placeholder="דק' ידני" title="דקות ידניות ליחידה — משאירים ריק לחישוב אוטומטי לפי קושי" style="width:78px;flex:none;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--brd);background:var(--card);color:var(--txt)">
      <label style="display:flex;align-items:center;gap:3px;flex:none;font-size:12px;color:var(--txt3);cursor:pointer;white-space:nowrap" title="שלב מהיר — פטור מהגבלת 2 שלבים / 2 ברקודים לעובד"><input type="checkbox" data-f="quick" ${s&&typeof s==='object'&&s.quick?'checked':''} style="width:15px;height:15px">⚡ מהיר</label>
      <label style="display:flex;align-items:center;gap:3px;flex:none;font-size:12px;color:var(--txt3);cursor:pointer;white-space:nowrap" title="שלב מאחד — ייחסם עד שכל שלבי ה-🔗 שמעליו יסתיימו על אותו ברקוד. שלב רגיל אינו חוסם."><input type="checkbox" data-f="merge" ${s&&typeof s==='object'&&s.merge?'checked':''} style="width:15px;height:15px">🔗 מאחד</label>
      <label style="display:flex;align-items:center;gap:3px;flex:none;font-size:12px;color:var(--txt3);cursor:pointer;white-space:nowrap" title="שלב גזירה — נמדד מול 'עלות גזירה' ולא מול מחיר המכירה. סימון ידני; התחנה אינה קובעת."><input type="checkbox" data-f="cut" ${s&&typeof s==='object'&&s.cut?'checked':''} style="width:15px;height:15px" onchange="renderProductPricing()">✂ גזירה</label>
    </div>
    <details>
      <summary style="font-size:11px;color:var(--txt3);cursor:pointer">🔀 תחנות נוספות<span class="alt-sum" style="color:var(--blue-txt);font-weight:600">${_altSumText(alt)}</span></summary>
      <div style="font-size:10px;color:var(--txt3);margin:3px 0 4px;line-height:1.45">
        השלב יתאפשר גם בתחנות האלה. בחירה מרובה — Ctrl/⌘ או גרירה.
        <b>מספיק תחנה אחת מכל משפחה</b> — סימון مخبلت 2 פותח גם את مخبلت 1 ו-3.
        התחנה הראשית נשארת זו שקובעת את התמחור והדוחות; כאן רק נפתחת הגישה.
      </div>
      <select multiple size="8" data-f="altStations" onchange="_altStationsChanged(this)" style="width:100%;font-size:12px">${_stationOptsMulti(alt)}</select>
    </details>
  </div>`;
}
function addTaskStepRow(){
  document.getElementById('pm-tasksteps-list').insertAdjacentHTML('beforeend',_stepRowHtml(''));
  renumberStepRows();
}
// ─── סדר שלבי העבודה ─────────────────────────────────────────────
// סדר השלבים = סדר השורות ב-DOM (saveProduct קורא אותן ב-querySelectorAll, שמחזיר לפי סדר המסמך),
// ולכן הזזת השורה היא כל מה שצריך — אין שדה order נפרד שאפשר לשכוח לעדכן.
// נחוץ כי שלב שנוסף בדיעבד נכנס אחרון, גם כשמקומו האמיתי באמצע.
function moveStepRow(btn,dir){
  const row=btn.closest('.ts-row');const list=row?.parentElement;if(!list)return;
  if(dir<0){const prev=row.previousElementSibling;if(!prev)return;list.insertBefore(row,prev);}
  else{const next=row.nextElementSibling;if(!next)return;list.insertBefore(next,row);}
  renumberStepRows();
  renderProductPricing();
}
// מספור ויזואלי 1..N — בלעדיו אי אפשר לראות מה הסדר בפועל ברשימה של 24 שלבים
function renumberStepRows(){
  const list=document.getElementById('pm-tasksteps-list');if(!list)return;
  [...list.querySelectorAll('.ts-row')].forEach((r,i)=>{const o=r.querySelector('.ts-ord');if(o)o.textContent=i+1;});
}
// ─── תמחור שלב ד' — תקצוב זמן לשלב לפי מחיר, רווח יעד וחומרים ───
// תקציב עבודה+תקורה ליחידה = מחיר×(1−רווח%) − חומרים.
// חלוקה בין השלבים עם רמת קושי לפי difficultyWeights; דקות לשלב = תקציב_שלב ÷ (שעה עמוסה של הכשירים + תקורה) × 60.
// ממוצע שעה עמוסה של העובדים הכשירים לשלב (בלי סינון נוכחות); fallback: ממוצע כל העובדים עם שכר.
// 🔀 מקבל תחנה אחת או **רשימת תחנות מורשות** (altStations) ולוקח את **איחוד** הכשירים:
// אם השלב באמת מתבצע גם ב-درزه וגם ב-مخبلت, העובדות בשתיהן באמת כשירות לו והאומדן
// צריך לשקף את זה. ⚠️ זה אומדן עלות בלבד — מיומנות אינה חוסמת אף עובד מאף שלב.
function _pricingStepRate(station,level,avgAll){
  const keys=(Array.isArray(station)?station:[station]).filter(Boolean);
  if(keys.length){
    const q=_costWorkers().filter(w=>S.costs.workerRates[w.id]&&keys.some(k=>((w.skills||{})[k]||0)>=level));
    if(q.length)return q.reduce((s,w)=>s+loadedHourlyRate(w.id),0)/q.length;
  }
  return avgAll;
}
// רווח יעד ניתן להזנה גם ב-% וגם ב-₪ — שני השדות מסונכרנים; הנשמר במוצר הוא ה-% (מקור אמת יחיד)
function syncProfitFields(src){
  const priceEl=document.getElementById('pm-price'),pctEl=document.getElementById('pm-profit'),ilsEl=document.getElementById('pm-profit-ils');
  const price=parseFloat(priceEl?.value)||0;
  if(src==='ils'&&pctEl){
    const ils=parseFloat(ilsEl?.value)||0;
    pctEl.value=price>0?+(ils/price*100).toFixed(2):'';
  }else if(ilsEl){
    const pct=parseFloat(pctEl?.value)||0;
    ilsEl.value=price>0&&pctEl?.value!==''?(price*pct/100).toFixed(2):'';
  }
  renderProductPricing();
}
let _pmOrdMin=[]; // דקות ליחידה פר שלב מהחישוב האחרון — להדפסת השלבים (printWorkSteps)
function renderProductPricing(){
  const box=document.getElementById('pm-pricing-result');if(!box)return;
  _pmOrdMin=[];
  const price=parseFloat(document.getElementById('pm-price')?.value)||0;
  const profitPct=parseFloat(document.getElementById('pm-profit')?.value)||0;
  const materials=parseFloat(document.getElementById('pm-materials')?.value)||0;
  if(!price){box.innerHTML='<div style="font-size:11px;color:var(--txt3)">הזן מחיר מכירה כדי לראות תקצוב זמן לשלבים</div>';return;}
  const budget=price*(1-profitPct/100)-materials;
  const profitILS=price*profitPct/100;
  const extraMat=parseFloat(document.getElementById('pm-extramat')?.value)||0;
  const cutP=parseFloat(document.getElementById('pm-cutprice')?.value)||0;
  const head=`<div style="font-size:12px;line-height:1.8">💵 מחיר ₪${price.toFixed(2)} − רווח ${profitPct}% (₪${profitILS.toFixed(2)}) − חומרים ₪${materials.toFixed(2)} = <b>תקציב עבודה+תקורה: ₪${budget.toFixed(2)}</b></div>`
    +(extraMat?`<div style="font-size:12px;color:var(--txt3)">🧵 + חומרים בתוספת ₪${extraMat.toFixed(2)} — לא נוגעים בתקציב · ללקוח ליחידה: <b style="color:var(--txt)">₪${(price+cutP+extraMat).toFixed(2)}</b></div>`:'');
  if(budget<=0){
    box.innerHTML=`<div style="background:var(--red-bg,#fee2e2);border-radius:8px;padding:8px 10px">${head}
      <div style="font-size:12px;color:var(--red-txt);font-weight:700;margin-top:4px">❌ המחיר לא מחזיק את יעד הרווח — לא נשאר תקציב לעבודה</div></div>`;
    return;
  }
  const steps=[...document.querySelectorAll('#pm-tasksteps-list .ts-row')].map(r=>({
    name:r.querySelector('[data-f="name"]')?.value.trim()||'',
    level:parseInt(r.querySelector('[data-f="level"]')?.value)||0,
    station:r.querySelector('[data-f="station"]')?.value||'',
    altStations:_rowAltStations(r),
    manualMin:parseFloat(r.querySelector('[data-f="manualMin"]')?.value)||0,
    cut:!!r.querySelector('[data-f="cut"]')?.checked
  })).filter(s=>s.name);
  // ✂ שלבי הגזירה יוצאים מתקציב התפירה ומקבלים בלוק ותקציב משלהם (30/08).
  const pricedSteps=steps.filter(s=>s.level||s.manualMin>0);
  const shownSteps=pricedSteps.filter(s=>!s.cut);
  const cutPriced=pricedSteps.filter(s=>s.cut);
  if(!pricedSteps.length){
    box.innerHTML=`<div style="background:var(--bg2);border-radius:8px;padding:8px 10px">${head}
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">הגדר רמת קושי לשלבים (או דקות ידני) כדי לחלק את התקציב לדקות עבודה</div></div>`;
    return;
  }
  const weights=S.costs.difficultyWeights||{1:1,2:1.5,3:2,4:2.5,5:3.5};
  // רק שלבים אוטומטיים (עם קושי, בלי override ידני) מתחלקים את התקציב לפי משקל
  const autoSteps=shownSteps.filter(s=>s.level&&!(s.manualMin>0));
  const totW=autoSteps.reduce((s,x)=>s+(+weights[x.level]||1),0);
  const oh=overheadBreakdown().perHour;
  const rated=_costWorkers().filter(w=>S.costs.workerRates[w.id]);
  const avgAll=rated.length?rated.reduce((s,w)=>s+loadedHourlyRate(w.id),0)/rated.length:0;
  if(!avgAll&&!oh){
    box.innerHTML=`<div style="background:var(--bg2);border-radius:8px;padding:8px 10px">${head}
      <div style="font-size:11px;color:var(--amber-txt);margin-top:4px">⚠ אין נתוני עלות שעה — הזן שכר לעובדים בלשונית עלויות</div></div>`;
    return;
  }
  const rates=shownSteps.map(s=>_pricingStepRate(s.station,s.level,avgAll)+oh);
  const mins=shownSteps.map(s=>+s.manualMin>0?+s.manualMin:0);
  const bud=splitStepBudget(mins,shownSteps.map(s=>s.level),rates,budget,weights);
  const allManual=mins.length>0&&mins.every(m=>m>0);
  // ⚠️ בדיקת השפיות "האם הזמנים שהוזנו מחזיקים את המחיר" מחושבת **בנפרד** מ-Σ דקות×תעריף.
  // בחלוקה היחסית סכום ה-₪ שווה תמיד לתקציב, ולכן "רווח בפועל" שנגזר ממנו היה יוצא תמיד
  // שווה ליעד — והאינדיקטור שמראה שהתמחור מחזיק מרווח היה מת בשקט.
  const manualCheckCost=mins.reduce((t,m,i)=>m>0?t+m/60*rates[i]:t,0);
  let totalMin=0,totalCost=0,tooShortCnt=0,derivedMin=0;
  const _ordMin=[]; // דקות ליחידה פר שלב — לבלוק "זמן להזמנה לפי מחלקה"
  const rows=shownSteps.map((s,i)=>{
    const rate=rates[i];
    const manual=s.manualMin>0;
    const share=bud[i].ils;
    const min=manual?s.manualMin:bud[i].min; // בשורה מוצגות הדקות שהוזנו, לא הנגזרות
    derivedMin+=bud[i].min;
    totalMin+=min;totalCost+=share;
    _ordMin.push({station:s.station,min});
    const tooShort=!manual&&min*60<s.level*30; // היוריסטיקה: פחות מ-30 שנ' לרמת קושי = לא ריאלי
    if(tooShort)tooShortCnt++;
    const tag=manual?` <span style="font-size:10px;color:var(--txt3)">✎ ידני</span>`:(s.level?` <span style="font-size:10px;color:var(--txt3)">(${levelName(s.level,'he')})</span>`:'');
    return`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:0.5px solid var(--brd);font-size:12px${tooShort?';color:var(--red-txt)':''}">
      <span style="flex:1;min-width:110px">${esc(s.name)}${tag}</span>
      <span style="color:var(--txt3)">₪${share.toFixed(2)}</span>
      <span style="font-weight:700">${tooShort?'⚠ ':''}${min.toFixed(1)} דק'</span>
    </div>`;
  }).join('');
  const shortWarn=tooShortCnt?`<div style="font-size:12px;color:var(--red-txt);font-weight:600;margin-top:6px;background:var(--red-bg,#fee2e2);padding:6px 10px;border-radius:8px">⚠ ${tooShortCnt} שלבים עם זמן לא ריאלי — המחיר כנראה לא מחזיק את יעד הרווח</div>`:'';
  // רווח בפועל — נגזר מ-manualCheckCost (דקות×תעריף) ולא מ-totalCost, שבחלוקה היחסית
  // שווה תמיד לתקציב. זה האינדיקטור היחיד שאומר אם המחיר מחזיק את הזמנים שהוזנו.
  const checkCost=allManual?manualCheckCost:totalCost;
  const actProfit=price-materials-checkCost;
  const actPct=price>0?actProfit/price*100:0;
  const below=actPct<profitPct-0.05;
  const actualLine=mins.some(m=>m>0)?`<div style="font-size:12px;font-weight:700;margin-top:2px;color:${below?'var(--red-txt)':'var(--green-txt)'}">💰 רווח בפועל לפי הזמנים שהוזנו: ${actPct.toFixed(1)}% (₪${actProfit.toFixed(2)})${below?' — מתחת ליעד':''}</div>`:'';
  // התעריף שמוצג חייב להיות זה שבו הקוד באמת מחלק (ממוצע העובדים הכשירים + תקורה) —
  // הצגת התקורה לבדה יצרה מספר קטן פי שש ממה שהחישוב עושה בפועל.
  const avgRate=rates.length?rates.reduce((a,b)=>a+b,0)/rates.length:0;
  const headLine=allManual
    ? `חלוקת התקציב לפי חלקו היחסי של כל שלב בזמן · ממוצע עלות שעה עמוסה+תקורה ₪${avgRate.toFixed(2)} (מתוכה תקורה ₪${oh.toFixed(2)}):`
    : `תקצוב זמן לשלב (לפי משקל קושי ÷ עלות שעה עמוסה+תקורה ₪${avgRate.toFixed(2)}, מתוכה תקורה ₪${oh.toFixed(2)}):`;
  // ⏱ (09/11/2026) הצפי לעובדת = שווי הדקות שהוזנו (בעלות הממוצעת) ÷ עלות השעה שלה (calcTaskExpected)
  const derivedLine=mins.some(m=>m>0)?`<div style="font-size:12px;color:var(--txt3);margin-top:2px">⏱ הצפי לעובדת בסריקה: בעלות שעה ₪${avgRate.toFixed(2)} — בדיוק הדקות שהוזנו; עובדת יקרה יותר מקבלת פחות זמן, זולה יותר — יותר${allManual?'':' (שלב בלי דקות — לפי משקל הקושי והתקציב)'}</div>`:'';
  // ✂ שורת הגזירה — הכנסה נפרדת ממחיר המכירה, ולכן מוצגת בבלוק משלה ולא מעורבבת בתקציב
  // התפירה. שתי אזהרות ההגדרה כאן הן בדיוק זוג המצבים שמייצר מדידה שקטה ושגויה:
  // מחיר בלי שלבים מסומנים = תקציב שאיש לא נמדד מולו; שלבים בלי מחיר = עבודה בלי הכנסה.
  const cutPrice=parseFloat(document.getElementById('pm-cutprice')?.value)||0;
  const cutSteps=steps.filter(s=>s.cut);
  const cutPctRaw=document.getElementById('pm-cutprofit')?.value;
  const cutPctSet=cutPctRaw!=null&&cutPctRaw!==''&&isFinite(+cutPctRaw);
  const cutPct=cutPctSet?+cutPctRaw:profitPct; // ריק ⇒ נופל לאחוז התפירה, כמו בחישוב
  let cutLine='';
  if(cutPrice>0||cutSteps.length){
    const cutBudget=cutPrice*(1-cutPct/100);
    // פירוט פר-שלב: תקציב הגזירה מתחלק בין שלבי ה-✂ לפי הדקות שהוזנו, בדיוק כמו התפירה
    const cRates=cutPriced.map(s=>_pricingStepRate(s.station,s.level,avgAll)+oh);
    const cBud=splitStepBudget(cutPriced.map(s=>+s.manualMin>0?+s.manualMin:0),cutPriced.map(s=>s.level),cRates,cutBudget,weights);
    let cutMin=0;
    const cutRows=cutPriced.map((s,i)=>{
      const manual=s.manualMin>0,min=manual?s.manualMin:cBud[i].min;
      cutMin+=min;_ordMin.push({station:s.station,min,cut:true});
      return`<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:0.5px solid var(--brd);font-size:12px">
        <span style="flex:1;min-width:110px">✂ ${esc(s.name)}${manual?' <span style="font-size:10px;color:var(--txt3)">✎ ידני</span>':''}</span>
        <span style="color:var(--txt3)">₪${cBud[i].ils.toFixed(2)}</span>
        <span style="font-weight:700">${min.toFixed(1)} דק'</span></div>`;
    }).join('');
    const warns=[
      cutPrice>0&&!cutSteps.length?'הוזן מחיר גזירה אך לא סומן אף שלב ✂ — לא יהיה מול מה למדוד':'',
      !(cutPrice>0)&&cutSteps.length?`${cutSteps.length} שלבי ✂ גזירה בלי מחיר גזירה — העבודה תיספר בלי הכנסה כנגדה`:'',
      cutPrice>0&&!cutPctSet?'לא הוזן אחוז רווח לגזירה — כרגע מחושב לפי אחוז התפירה. הזן אחוז משלה':''
    ].filter(Boolean).map(w=>`<div style="font-size:12px;color:var(--red-txt);font-weight:600;margin-top:4px">⚠ ${w}</div>`).join('');
    cutLine=`<div style="background:var(--bg2);border-radius:8px;padding:8px 10px;margin-top:8px;border:1px solid var(--brd)">
      <div style="font-size:12px;line-height:1.8">✂ גזירה ₪${cutPrice.toFixed(2)} ליח' − רווח <b${cutPctSet?'':' style="color:var(--red-txt)"'}>${cutPct}%</b>${cutPctSet?'':' (של התפירה)'} (₪${(cutPrice*cutPct/100).toFixed(2)}) = <b>תקציב גזירה: ₪${cutBudget.toFixed(2)} ליח'</b></div>
      ${cutRows||(cutSteps.length?`<div style="font-size:11px;color:var(--txt3);margin-top:2px">${cutSteps.length} שלבים מסומנים ללא רמת קושי/דקות: ${cutSteps.map(s=>esc(s.name)).join(' · ')}</div>`:'')}
      ${cutMin>0?`<div style="font-size:13px;font-weight:700;color:var(--green-txt);margin-top:6px">⏱ סה"כ זמן גזירה ליחידה: ${cutMin.toFixed(1)} דק'</div>`:''}
      <div style="font-size:11px;color:var(--txt3);margin-top:2px">✂ נמדד בנפרד מהתפירה — שלבים אלה אינם מקבלים נתח מתקציב התפירה</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:2px">הגזירה נסרקת ללא כמות — ההשוואה מתבצעת בדוח, אחרי שהכמות מוזנת</div>
      ${warns}</div>`;
  }
  box.innerHTML=`<div style="background:var(--bg2);border-radius:8px;padding:8px 10px">${head}
    <div style="font-size:11px;color:var(--txt3);margin:4px 0 2px">${headLine}</div>
    ${rows}
    <div style="font-size:13px;font-weight:700;color:var(--green-txt);margin-top:6px">⏱ סה"כ ${allManual?'זמן שהוזן':'זמן עבודה מתוקצב'} ליחידה${cutPriced.length?' <span style="font-size:11px;font-weight:400;color:var(--txt3)">(תפירה בלבד — הגזירה בנפרד למטה)</span>':''}: ${totalMin.toFixed(1)} דק'</div>
    ${derivedLine}
    ${actualLine}
    ${shortWarn}</div>${cutLine}${_orderDeptTimeHtml(_ordMin)}`;
  _pmOrdMin=_ordMin;
}
// ⏱ זמן העבודה להזמנה כולה, לפי מחלקה (28/09/2026 — בקשת המשתמש: עד היום הוצג רק ליחידה).
// דקות ליחידה של כל שלב × סה"כ היחידות בטבלת הכמויות, מקובץ לפי המחלקה שבמפתח התחנה
// ("מחלקה::תחנה"). אותן דקות בדיוק כמו בשורות שמעל — לא חישוב נפרד. ✂ גזירה בשורה משלה.
function _pmOrderUnits(){
  let n=0;document.querySelectorAll("#pm-qty-body [data-qf=\"qty\"]").forEach(el=>{n+=parseInt(el.value)||0;});
  return n;
}
// 📏 היחידות לחישוב הזמן: הטבלה, ובהיעדרה הכמות המשוערת (est=true לתווית)
function _pmUnitsForTime(){
  const n=_pmOrderUnits();if(n)return{n,est:false};
  const e=Math.max(0,parseInt(document.getElementById('pm-estqty')?.value)||0);
  return{n:e,est:e>0};
}
function _orderDeptAgg(list){
  const by={},order=[];
  for(const x of list){
    // 🧵 (03/11/2026) מחלקות התפירה (1, 2…) — שורה אחת, בלי המספר
    let k=x.station?String(x.station).split("::")[0]:"";if(pipeFamOfDept(k)==='sew')k=k.replace(/\s*\d+\s*$/,'');
    const key=(x.cut?"✂ ":"")+(k||"ללא מחלקה");
    if(!(key in by)){by[key]=0;order.push(key);}
    by[key]+=x.min;
  }
  return{by,order};
}
function _orderDeptTimeHtml(list){
  const{n:units,est}=_pmUnitsForTime();
  if(!list.length)return"";
  if(!units)return`<div style="font-size:11px;color:var(--txt3);margin-top:8px">⏱ זמן להזמנה לפי מחלקה — הזן כמויות בטבלת הכמויות או כמות משוערת</div>`;
  const{by,order}=_orderDeptAgg(list);
  let tot=0;
  const rows=order.map(k=>{const m=by[k]*units;tot+=m;return`<div style="display:flex;gap:8px;padding:3px 0;border-bottom:0.5px solid var(--brd);font-size:12px">
      <span style="flex:1">${esc(k)}</span><span style="color:var(--txt3)">${by[k].toFixed(1)} דק' ליח'</span><b>${fmtExpMin(m)}</b></div>`;}).join("");
  return`<div style="background:var(--bg2);border-radius:8px;padding:8px 10px;margin-top:8px;border:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:700;margin-bottom:4px">⏱ זמן עבודה להזמנה כולה (${est?'~':''}${units} יח'${est?' משוער':''}) — לפי מחלקה</div>
    ${rows}
    <div style="font-size:13px;font-weight:700;color:var(--green-txt);margin-top:6px">סה"כ להזמנה: ${fmtExpMin(tot)}</div></div>`;
}
// 🖨 דף שלבי עבודה לרצפה (19/10/2026 — בקשת המשתמש): שלב + תחנה (ראשית, ונוספות בקטן),
// **בלי זמן לשלב**. למטה — הזמן להזמנה כולה לפי מחלקה, אותו חישוב בדיוק כמו בבלוק שבחלון
// (_pmOrdMin מהרינדור האחרון × היחידות בטבלת הכמויות). נקרא מהחלון הפתוח — כולל שינויים שלא נשמרו.
async function printWorkSteps(share){
  try{renderProductPricing();}catch(_){}
  const v=id=>(document.getElementById(id)?.value||'').trim();
  const steps=[...document.querySelectorAll('#pm-tasksteps-list .ts-row')].map(r=>({
    name:r.querySelector('[data-f="name"]')?.value.trim()||'',
    nameAr:r.querySelector('[data-f="nameAr"]')?.value.trim()||'',
    station:r.querySelector('[data-f="station"]')?.value||'',
    alt:_rowAltStations(r),
    cut:!!r.querySelector('[data-f="cut"]')?.checked
  })).filter(s=>s.name);
  if(!steps.length){showToast('⚠ אין שלבי עבודה להדפסה','var(--red-txt)');return;}
  const stn=k=>k?stationNameOfKey(k):'—';
  const dpt=k=>k?String(k).split('::')[0]||'—':'—'; // 🏭 המחלקה מתוך מפתח התחנה ("מחלקה::תחנה")
  const rows=steps.map((s,i)=>`<tr><td class="n">${i+1}</td><td><b>${s.cut?'✂ ':''}${esc(s.name)}</b>${s.nameAr?`<div class="ar" dir="rtl">${esc(s.nameAr)}</div>`:''}</td>
    <td><b>${esc(stn(s.station))}</b>${s.alt.length?`<div class="alt">+ ${s.alt.map(a=>esc(stn(a))).join(' · ')}</div>`:''}</td>
    <td>${esc(dpt(s.station))}${(()=>{const o=[...new Set(s.alt.map(dpt))].filter(d=>d!==dpt(s.station));return o.length?`<div class="alt">+ ${o.map(esc).join(' · ')}</div>`:'';})()}</td></tr>`).join('');
  const{n:units,est}=_pmUnitsForTime();
  let dept='';
  if(_pmOrdMin.length&&units){
    const{by,order}=_orderDeptAgg(_pmOrdMin);let tot=0;
    dept=`<div class="keep"><h3>⏱ זמן עבודה להזמנה כולה (${est?'~':''}${units} יח'${est?' משוער':''}) — לפי מחלקה</h3><table class="d">${order.map(k=>{const m=by[k]*units;tot+=m;
      return`<tr><td>${esc(k)}</td><td class="t">${fmtExpMin(m)}</td></tr>`;}).join('')}
      <tr class="tot"><td>סה"כ להזמנה</td><td class="t">${fmtExpMin(tot)}</td></tr></table></div>`;
  }else dept=`<div class="note">⏱ זמן לפי מחלקה לא חושב — ${units?'חסרים מחיר / רמות קושי / דקות לשלבים':'לא הוזנו כמויות או כמות משוערת'}</div>`;
  const prod=v('pm-prod'),cust=v('pm-cust'),name=v('pm-name');
  const title=`שלבי עבודה — מוצר ${prod}${cust?' · לקוח '+cust:''}`;
  const html=`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4;margin:0}body{font-family:Arial,sans-serif;color:#000;margin:0;padding:12mm;font-size:13px}
    h2{margin:0 0 2px;font-size:19px}h3{font-size:15px;margin:18px 0 6px}.sub{color:#444;font-size:12px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}td,th{border:1px solid #888;padding:6px 8px;text-align:right;vertical-align:top}
    th{background:#eee}td.n{width:28px;text-align:center;color:#555}.ar{font-size:12px;color:#333;margin-top:2px}.alt{font-size:11px;color:#555;margin-top:2px}
    table.d td.t{width:130px;font-weight:700;white-space:nowrap}tr.tot td{background:#eee;font-weight:700}.note{margin-top:14px;font-size:12px;color:#555}
    tr{page-break-inside:avoid}.keep{page-break-inside:avoid;break-inside:avoid}</style></head><body>
    <h2>${esc(title)}</h2><div class="sub">${name?esc(name)+' · ':''}${steps.length} שלבים · הודפס ${new Date().toLocaleDateString('he-IL')}</div>
    <table><thead><tr><th>#</th><th>שלב</th><th>תחנה</th><th>מחלקה</th></tr></thead><tbody>${rows}</tbody></table>
    ${dept}</body></html>`;
  if(share){ // 💬 (03/11/2026) וואטסאפ — אותו דף כ-PDF
    showToast('⏳ מכין PDF…','var(--txt3)',4000);
    let b;try{b=await _dnPdfBlob(html);}catch(e){alert('הכנת ה-PDF נכשלה: '+(e?.message||e));return;}
    await _waSharePdf(b,'work-steps-'+(prod||'0')+'.pdf',title+(name?' · '+name:''),'');return;
  }
  if(!_isIOS()){printViaIframe(html);return;}
  // 🍎 אייפון: כמו תעודת המשלוח — PDF (עד 15% מעל עמוד מתכווץ לעמוד אחד) ⇒ שיתוף ⇒ הדפסה
  showToast('⏳ מכין PDF…','var(--txt3)',4000);
  let blob;try{blob=await _dnPdfBlob(html);}catch(e){alert('הכנת ה-PDF נכשלה: '+(e?.message||e));return;}
  await _printPdfBlob(blob,'work-steps-'+(prod||'0')+'.pdf');
}
// שינוי כמות בטבלה מעדכן את הבלוק מיד (הטבלה נבנית מחדש בכל פתיחה — האזנה אחת על המסמך)
document.addEventListener("input",e=>{if(e.target?.matches?.("#pm-qty-body [data-qf=\"qty\"]"))try{renderProductPricing();}catch(_){}});
function addQtyRow(){
  const colorOpts=Object.entries(COLORS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  const i=Date.now();
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input type="text" maxlength="4" style="width:50px;font-size:12px" data-qi="${i}" data-qf="size" placeholder="1"></td>
    <td><select data-qi="${i}" data-qf="color" style="font-size:12px"><option value="">--</option>${colorOpts}</select></td>
    <td><input type="number" value="0" min="0" style="width:70px;font-size:12px" data-qi="${i}" data-qf="qty"></td>
    <td><button type="button" onclick="this.closest('tr').remove();renderProductPricing()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button></td>`;
  document.getElementById('pm-qty-body').appendChild(tr);
}

function compressImage(dataUrl, maxW, maxH, quality){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      res(c.toDataURL('image/jpeg',quality||0.7));
    };
    img.src=dataUrl;
  });
}

// ✂️ עורך חיתוך לפני שמירת תמונה (27/10/2026): מסגרת עם 4 פינות לגרירה (מגע ועכבר), גרירת המסגרת כולה,
// 🔄 סיבוב 90°. מחזיר dataURL של החלק שנבחר ברזולוציה המקורית (הדחיסה ל-800 אחרי — כך מסמך שנחתך
// נשאר קריא יותר), או null בביטול. "בלי חיתוך" = התמונה כולה (אחרי סיבוב, אם היה).
function cropImage(dataUrl){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      let src=document.createElement('canvas');src.width=img.width;src.height=img.height;src.getContext('2d').drawImage(img,0,0);
      const ov=document.createElement('div');
      ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10050;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;touch-action:none';
      const bs='font-size:15px;padding:9px 14px;border-radius:10px;border:0;cursor:pointer;font-weight:700';
      ov.innerHTML=`<div style="color:#fff;font-size:14px">✂️ גרור את הפינות לבחירת החלק לשמירה · اسحب الزوايا</div>
        <div id="crp-box" style="position:relative;touch-action:none;user-select:none"><canvas id="crp-cv" style="display:block"></canvas>
          <div id="crp-r" style="position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move"></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button data-a="ok" style="${bs};background:#16a34a;color:#fff">✅ שמור · حفظ</button>
          <button data-a="rot" style="${bs};background:#444;color:#fff">🔄 סובב</button>
          <button data-a="full" style="${bs};background:#444;color:#fff">בלי חיתוך</button>
          <button data-a="no" style="${bs};background:#7f1d1d;color:#fff">ביטול</button></div>`;
      document.body.appendChild(ov);
      const cv=ov.querySelector('#crp-cv'),box=ov.querySelector('#crp-box'),R=ov.querySelector('#crp-r');
      ['nw','ne','sw','se'].forEach(k=>{const h=document.createElement('div');h.dataset.h=k;
        h.style.cssText='position:absolute;width:26px;height:26px;transform:translate(-50%,-50%);background:#fff;border-radius:50%;border:3px solid #16a34a;top:'+(k[0]==='n'?'0':'100%')+';left:'+(k[1]==='w'?'0':'100%');R.appendChild(h);});
      let dw,dh,r;
      const layout=()=>{
        const mw=Math.min(window.innerWidth-30,900),mh=window.innerHeight-170,sc=Math.min(mw/src.width,mh/src.height,1);
        dw=Math.round(src.width*sc);dh=Math.round(src.height*sc);
        cv.width=dw;cv.height=dh;cv.getContext('2d').drawImage(src,0,0,dw,dh);
        r={x:dw*0.05,y:dh*0.05,w:dw*0.9,h:dh*0.9};draw();
      };
      const draw=()=>{Object.assign(R.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});};
      let drag=null;const MIN=30;
      box.addEventListener('pointerdown',e=>{
        const b=box.getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top;
        const h=e.target.dataset?.h;
        if(!h&&e.target!==R)return;
        drag={h:h||'move',px,py,r0:{...r}};box.setPointerCapture(e.pointerId);e.preventDefault();
      });
      box.addEventListener('pointermove',e=>{
        if(!drag)return;
        const b=box.getBoundingClientRect(),dx=e.clientX-b.left-drag.px,dy=e.clientY-b.top-drag.py,o=drag.r0;
        let{x,y,w,h}=o;
        if(drag.h==='move'){x=Math.max(0,Math.min(dw-w,o.x+dx));y=Math.max(0,Math.min(dh-h,o.y+dy));}
        else{
          if(drag.h.includes('w')){const nx=Math.max(0,Math.min(o.x+o.w-MIN,o.x+dx));w=o.w+(o.x-nx);x=nx;}
          if(drag.h.includes('e')){w=Math.max(MIN,Math.min(dw-o.x,o.w+dx));}
          if(drag.h.includes('n')){const ny=Math.max(0,Math.min(o.y+o.h-MIN,o.y+dy));h=o.h+(o.y-ny);y=ny;}
          if(drag.h.includes('s')){h=Math.max(MIN,Math.min(dh-o.y,o.h+dy));}
        }
        r={x,y,w,h};draw();
      });
      box.addEventListener('pointerup',()=>{drag=null;});
      const done=v=>{ov.remove();window.removeEventListener('resize',layout);resolve(v);};
      ov.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{
        const a=b.dataset.a;
        if(a==='no')return done(null);
        if(a==='full')return done(src.toDataURL('image/jpeg',0.92));
        if(a==='rot'){const n=document.createElement('canvas');n.width=src.height;n.height=src.width;const c=n.getContext('2d');
          c.translate(n.width,0);c.rotate(Math.PI/2);c.drawImage(src,0,0);src=n;layout();return;}
        const k=src.width/dw,out=document.createElement('canvas');
        out.width=Math.max(1,Math.round(r.w*k));out.height=Math.max(1,Math.round(r.h*k));
        out.getContext('2d').drawImage(src,r.x*k,r.y*k,r.w*k,r.h*k,0,0,out.width,out.height);
        done(out.toDataURL('image/jpeg',0.92));
      });
      window.addEventListener('resize',layout);
      layout();
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}
const _readFileUrl=file=>new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>res(null);r.readAsDataURL(file);});
// קובץ/צילום ⇒ עורך חיתוך ⇒ דחיסה (800px, כמו קודם). null = בוטל
async function _imgPipeline(dataUrl){
  if(!dataUrl)return null;
  const c=await cropImage(dataUrl);
  return c?await compressImage(c,800,800,0.7):null;
}
async function addProdImages(input){
  const files=[...input.files];input.value='';
  for(const file of files){
    const out=await _imgPipeline(await _readFileUrl(file));
    if(out){_prodImgs.push(out);refreshImgPreview();}
  }
}
// ✂ חיתוך מחדש של תמונה שכבר בטופס (לפני השמירה)
async function recropProdImg(i){
  const out=await _imgPipeline(_prodImgs[i]);
  if(out){_prodImgs[i]=out;refreshImgPreview();}
}

// ─── 🔧 תיקונים בחלון ההזמנה (14/11/2026, מנהל בלבד) ─────────────────────
// כל משימות REPAIR_STEP של ההזמנה (היסטוריה — loadHistProd, + פעילות עכשיו): מי, מתי, מידה/צבע,
// כמות, זמן ועלות. עלות = שעות × (עלות שעה עמוסה של העובדת באותו יום + תקורה) — אותה נוסחה כמו
// דוח הרווח (שבו התיקון כבר נספר כעבודה על ההזמנה). עלות פנימית — לא נכנסת לתעודה.
async function _repairsFill(p){
  const box=document.getElementById('pm-repairs');if(!box)return;
  const stamp=prodStampOf(p),cache={};
  const mine=t=>t.cust===p.cust&&t.prod===p.prod&&isRepairTask(t)&&taskOrderStamp(t,cache)===stamp;
  let hist=[];
  try{hist=(await loadHistProd(p.prod)).filter(mine);}catch(e){hist=(S.histTasks||[]).filter(mine);}
  if(document.getElementById('pm-repairs')!==box)return; // החלון נסגר/נפתח מחדש בינתיים
  const now=Date.now();
  const act=(S.activeTasks||[]).filter(mine).map(t=>({...t,_live:true,duration:t.paused?(t.accumulatedSec||0):(t.accumulatedSec||0)+Math.max(0,(now-new Date(t.startTime).getTime())/1000)}));
  const rows=[...act,...hist];
  if(!rows.length){box.innerHTML=`<div style="font-size:12px;color:var(--txt3);padding:6px 2px">${REPAIR_STEP} — אין תיקונים בהזמנה הזו</div>`;return;}
  const ctx=typeof _pricingCtx==='function'?_pricingCtx():null;
  const rateOf=t=>ctx?((loadedHourlyRate(t.workerId,_tDay(t))||ctx.avgAll)+ctx.oh):0;
  let totSec=0,totCost=0,totQty=0;
  const tr=rows.map(t=>{
    const sec=+t.duration||0,cost=sec/3600*rateOf(t);totSec+=sec;totCost+=cost;totQty+=+t.qty||0;
    const d=new Date(t._live?t.startTime:(t.endTime||t.startTime));
    const when=pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
    const sc=[t.size!==''&&t.size!=null?'מידה '+szLblT(t.cust,t.prod,String(t.size)):'',t.col?(COLORS[t.col]||t.col):''].filter(Boolean).join(' · ')||'—';
    return`<tr style="border-bottom:0.5px solid var(--brd)">
      <td style="padding:5px 4px;white-space:nowrap">${when}${t._live?` <span class="badge green" style="font-size:10px">${t.paused?'⏸':'▶'} פעיל</span>`:''}</td>
      <td style="padding:5px 4px">${esc(t.workerName||'')}</td>
      <td style="padding:5px 4px">${esc(sc)}${repairNoteOf(t)?'<div style="font-size:11px;color:var(--txt2)">'+esc(repairNoteOf(t))+'</div>':''}</td>
      <td style="padding:5px 4px;text-align:center">${+t.qty||0}</td>
      <td style="padding:5px 4px;white-space:nowrap">${fmtM(Math.round(sec))}</td>
      <td style="padding:5px 4px;white-space:nowrap;font-weight:600">${ctx?'₪'+cost.toFixed(2):'—'}</td></tr>`;
  }).join('');
  box.innerHTML=`<div style="background:var(--bg2);border-radius:8px;padding:8px 10px;border:1px solid var(--brd)">
    <div style="font-size:13px;font-weight:700;margin-bottom:4px">${REPAIR_STEP} — ${rows.length} ${rows.length===1?'משימה':'משימות'}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="color:var(--txt3);text-align:right"><th style="padding:3px 4px">מתי</th><th style="padding:3px 4px">עובד/ת</th><th style="padding:3px 4px">מידה/צבע · מה</th><th style="padding:3px 4px">כמות</th><th style="padding:3px 4px">זמן</th><th style="padding:3px 4px">עלות</th></tr></thead>
      <tbody>${tr}</tbody>
      <tfoot><tr style="font-weight:700"><td style="padding:5px 4px" colspan="3">סה"כ</td><td style="padding:5px 4px;text-align:center">${totQty}</td><td style="padding:5px 4px;white-space:nowrap">${fmtM(Math.round(totSec))}</td><td style="padding:5px 4px;white-space:nowrap;color:var(--red-txt)">${ctx?'₪'+totCost.toFixed(2):'—'}</td></tr></tfoot>
    </table></div>
    <div style="font-size:11px;color:var(--txt3);margin-top:4px">עלות = זמן × (עלות שעה עמוסה של העובד/ת + תקורה) · עלות פנימית — כבר נספרת בדוח הרווח של ההזמנה, לא בתעודה${ctx?'':' · ⚠ אין נתוני עלויות — פתח/י את לשונית העלויות'}</div></div>`;
}
