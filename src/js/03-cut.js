// ─── 👕 דגם ראשון ──────────────────────────────────────────────
// ברקוד הדגם: size='9', col='88' (הצבעים 01-30 — אין התנגשות עם '00' כל-הכמות / '99' יצא ללקוח).
// מבנה: לקוח+מוצר+9+כמות(3)+88[+הזמנה]. עובד **הפוך** מברקוד רגיל: אין שלבים, אין שער תחנה
// ואין שער סדר, ואין חסימת "כבר בוצע" — כל עובד בכל מחלקה סורק את אותו ברקוד אחרי שהקודם
// סיים, והמשימה מתחילה מיד. העלות = שעות העבודה בפועל (דוח הרווח האמיתי), המחיר ₪100 ליחידה.
// 🛑 נשארת חסימה אחת: אותו עובד שכבר פתוח על אותו דגם — זו כפילות אמיתית, לא עבודה.
const SAMPLE_STEP='👕 דגם ראשון';
const SAMPLE_UNIT_PRICE=100;
function isSampleBc(raw){return !!raw&&isBcLen(raw.length)&&raw.slice(7,8)==='9'&&raw.slice(11,13)==='88';}
// רשומת ההזמנה של ברקוד — לפי מספר ההזמנה כשיש (16 ספרות), אחרת העדכנית.
function bcOrderProd(raw){
  const c=String(raw).slice(0,2),p=String(raw).slice(2,7);
  return prodByOrderNo(c,p,orderNoOf(raw))||findProd(c,p);
}
// דגם = ברקוד הדגם עצמו, **או** כל ברקוד של הזמנה שסומנה 👕 בכרטיס המוצר — מדבקות רגילות
// שהודפסו לפני הסימון ממשיכות לעבוד כדגם.
function isSampleScan(raw){
  if(!raw||!isBcLen(raw.length)||isShipBc(raw))return false;
  return isSampleBc(raw)||!!bcOrderProd(raw)?.isSample;
}
function sampleQtyOf(raw){
  const q=parseInt(String(raw).slice(8,11))||0;if(q)return q;
  return (bcOrderProd(raw)?.quantities||[]).reduce((s,x)=>s+(parseInt(x.qty)||0),0)||1;
}
// פריט סל של דגם. ⚠️ החותמת נלקחת מרשומת ההזמנה של הברקוד ולא מ-prodStampFor, שבוחר תמיד
// את החדשה ביותר: הזמנת ייצור של אותו דגם שנפתחה בינתיים הייתה בולעת את שעות הדגם.
function sampleBase(raw,taskDept){
  const p=bcOrderProd(raw),sb=isSampleBc(raw),cust=raw.slice(0,2),prod=raw.slice(2,7);
  return{raw,cust,prod,size:sb?'':raw.slice(7,8),qty:sampleQtyOf(raw),col:sb?'':raw.slice(11,13),
    isTotal:false,taskDept:taskDept||'',taskType:SAMPLE_STEP,isSample:true,
    prodStamp:p?prodStampOf(p):prodStampFor(cust,prod)};
}
// '' = מותר. חוסם רק כפילות בסל, או אותו עובד שכבר פתוח (לא מושהה) על אותו ברקוד דגם.
function sampleDupFor(workerId,raw,cart){
  const T=LANGS[currentLang];
  if((cart||[]).some(b=>b.raw===raw&&b.taskType===SAMPLE_STEP))return T.scan_dup_in_cart||'כבר בסל';
  if(S.activeTasks.some(t=>t.workerId===workerId&&taskBc(t)===raw&&t.taskType===SAMPLE_STEP&&!t.paused))return T.scan_dup_active||'פעיל כעת';
  return '';
}
function sampleScanPreview(v){
  const T=LANGS[currentLang];
  return `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:8px;background:var(--bg2);border-radius:var(--r)">
      <span class="bc-seg bc-c">לקוח: ${esc(v.slice(0,2))}</span>
      <span class="bc-seg bc-p">מוצר: ${esc(v.slice(2,7))}</span>${bcOrderChip(v)}
      <span class="bc-seg" style="background:var(--blue-bg,#dbeafe);color:var(--blue-txt,#1d4ed8);font-weight:700">${T.smp_label||SAMPLE_STEP} — ${sampleQtyOf(v)} יח׳</span>
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-top:4px">${T.smp_hint||'בלי שלבים · פתוח לכל המחלקות והתחנות · אפשר לצרף לסל עוד דגם'}</div>`;
}
// מצב דגם בסורק: מסתיר גם את רשימת השלבים וגם את שדה סוג המשימה החופשי
function showSampleMode(prefix){
  ['-tasktype-wrap','-steps-wrap'].forEach(s=>{const e=document.getElementById(prefix+s);if(e)e.style.display='none';});
  clearStepChecks(prefix);
  ['-expected','-recs'].forEach(s=>{const e=document.getElementById(prefix+s);if(e)e.innerHTML='';});
}
// 🔒 ברקוד שסיים את תפקידו (13/10/2026, החלטת המשתמש) — שלא ייסרק בטעות על הזמנה שנגמרה:
//   • ספירה/גזירה (= "כל הכמות", מידה 9 צבע 00) — נסגר ברגע שהוזנו כמויות בהזמנה **שבברקוד**.
//     ⚠️ זה אותו קוד בדיוק כמו כרטיס "📦 כל הכמות" בדף המידות — גם הוא נסגר (אושר).
//   • מידה+צבע — נסגר כשכל הכמות שלו בהזמנה יצאה בתעודות (shippedCellMap). משלוח חלקי — פתוח.
// דגם / "יצא ללקוח" / הזמנה לא מוכרת ⇒ '' (פתוח). משימה שכבר רצה לא נעצרת — נבדקות רק פתיחות.
// עובד/אחראי נחסם; מנהל מקבל שאלה (passRetiredGate).
function bcRetiredWhy(raw){
  raw=String(raw||'');
  if(!isBcLen(raw.length)||isShipBc(raw)||isSampleScan(raw))return '';
  const p=bcOrderProd(raw);if(!p)return '';
  // ✂️ (26/10/2026) נסגר כשההזמנה **נכנסה לתפירה** — לא כשהוזנה כמות: הסופר מזין כמות מהסורק לפני הגזירה,
  // והברקוד חייב להישאר פתוח לגוזר. orderInSewing — משימה במחלקת תפירה על ההזמנה הזו, או שלב מתקדם יותר
  if(isTotalBc(raw))return orderInSewing(p)?'cut':'';
  const sz=raw.slice(7,8),col=raw.slice(11,13);
  const ord=(p.quantities||[]).filter(q=>String(q.size)===sz&&String(q.color)===col).reduce((t,q)=>t+(parseInt(q.qty)||0),0);
  if(!(ord>0))return '';
  return (shippedCellMap(p).get(sz+'|'+col)||0)>=ord?'ship':'';
}
// ─── ✂️ הזנת כמויות ושלבים מהסורק (26/10/2026) ──────────────────────
// מי שסורק ברקוד ספירה/גזירה (כל תפקיד) מקבל כפתור "📝 כמויות ושלבים" — בלי להיכנס ללשונית המוצרים:
// • כמויות: ממלא שורות מידה+צבע שהמנהל הקים בלי כמות, ומוסיף מידה/צבע שחסרים. שורה עם כמות — קריאה בלבד.
// • שלבים: רואה את הקיימים ומוסיף שלבים **בשם בלבד** (בלי תחנה/רמה/דקות) — המנהל משלים בכרטיס המוצר
//   (stepPending: שלב בלי תחנה, רמה ודקות ⇒ "⚠ ממתין לתחנה וזמן" בכרטיס).
// כתיבה: fbUpdateOnly של quantities/workSteps בלבד (Rules: products update פתוח לכל מחובר) + טלגרם למנהל.
// ⚠️ ברגע שהוזנה כמות, ברקוד הספירה/גזירה "נסגר" (bcRetiredWhy 'cut') — כמו היום, כשהמנהל מזין כמות.
const stepPending=s=>!stepStation(s)&&!(stepManualMin(s)>0)&&!stepLevel(s);
// ההזמנה בתפירה ומעלה: משימה במחלקת תפירה/אריזה על **ההזמנה הזו** (activeTasks + histTasks של 14 יום — נטענים
// בכל מכשיר), או סימון ידני/משלוח שאחרי התפירה (הזמנה ישנה שהמשימות שלה כבר מחוץ לחלון)
function orderInSewing(p){
  if(!p)return false;
  if(+p.shippedQty>0||(Array.isArray(p.shipments)&&p.shipments.length))return true;
  const ov=p.pipeOverride?.list;if(ov&&PIPE_IDX(ov)>=PIPE_IDX('sewing'))return true;
  const log=Array.isArray(p.stageLog)?p.stageLog:[],si=PROD_STAGES.findIndex(s=>s.id==='sewing');
  if(log.some(e=>PROD_STAGES.findIndex(s=>s.id===e.id)>=si&&si>=0))return true;
  const st=prodStampOf(p),cache={};
  return [...(S.activeTasks||[]),...(S.histTasks||[])].some(t=>t&&t.cust===p.cust&&t.prod===p.prod&&['sew','pack'].includes(pipeFamOfDept(t.dept))&&taskOrderStamp(t,cache)===st);
}
// הכפתור רק כשהברקוד עדיין פתוח — הזמנה שכבר בתפירה לא נפתחת לסופר (נצפה 26/10 ב-03017 #002)
const countEntryBtnHtml=v=>bcOrderProd(v)&&!bcRetiredWhy(v)?`<button class="btn" style="width:100%;margin-top:6px;font-size:14px;font-weight:700;border-color:var(--amber-txt);color:var(--amber-txt)" onclick="openCountEntry('${escj(v)}')">📝 כמויות ושלבים · الكميات والمراحل</button>`:'';
let _ceRows=[],_ceSteps=[],_ceImgs=[];
// 📷 (27/10/2026) צילום/העלאה מהסורק — עובר בעורך החיתוך, ובשמירה מצטרף לתמונות המוצר (productImages)
async function ceAddImgs(input){
  const files=[...input.files];input.value='';
  for(const f of files){const out=await _imgPipeline(await _readFileUrl(f));if(out){_ceImgs.push(out);renderCountEntry();}}
}
function openCountEntry(raw){
  const p=bcOrderProd(raw);if(!p){showToast('⚠ ההזמנה לא נמצאה','var(--red-txt)');return;}
  // fromMgr = שורה שהמנהל הקים — מידה וצבע קבועים, רק הכמות נפתחת. lock = כבר יש כמות — קריאה בלבד
  _ceRows=(p.quantities||[]).map(q=>({size:String(q.size||''),color:String(q.color||''),qty:parseInt(q.qty)||0,lock:(parseInt(q.qty)||0)>0,fromMgr:true}));
  _ceSteps=[];_ceImgs=[];
  document.getElementById('ce-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='ce-wrap';wrap.dataset.pid=p.id;
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:12px;overflow-y:auto';
  document.body.appendChild(wrap);
  renderCountEntry();
}
function renderCountEntry(){
  const wrap=document.getElementById('ce-wrap');if(!wrap)return;
  const p=(S.products||[]).find(x=>String(x.id)===String(wrap.dataset.pid));if(!p){wrap.remove();return;}
  const inp='font-size:14px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const colOpts=c=>`<option value="">--</option>`+Object.entries(COLORS).map(([k,v])=>`<option value="${k}"${k===c?' selected':''}>${k} · ${esc(COLORS_AR?.[k]||v)}</option>`).join('');
  const tot=_ceRows.reduce((t,r)=>t+(+r.qty||0),0);
  const steps=(p.workSteps||[]).map(s=>stepDisplay(s)||stepName(s)).filter(Boolean);
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:16px;max-width:460px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:16px;font-weight:800">📝 ${esc(p.cust)}/${esc(p.prod)}${(parseInt(p.orderNo,10)||0)?' #'+String(p.orderNo).padStart(3,'0'):''}</div>
      <button class="btn" style="font-size:12px;padding:4px 10px" onclick="document.getElementById('ce-wrap')?.remove()">✕</button>
    </div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:10px">${esc(p.name||'')}</div>
    <div style="font-size:14px;font-weight:700;margin-bottom:6px">📦 כמויות · الكميات <span style="font-weight:400;color:var(--txt3);font-size:12px">— סה"כ <span id="ce-tot">${tot}</span></span></div>
    ${_ceRows.map((r,i)=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px">
      <span style="font-size:12px;color:var(--txt3);min-width:34px">מידה</span>
      ${r.lock||r.fromMgr?`<b style="min-width:30px;text-align:center">${esc(r.size)}</b>`:`<input value="${esc(r.size)}" maxlength="1" inputmode="numeric" oninput="_ceRows[${i}].size=this.value.replace(/\\D/g,'')" style="${inp};width:44px;text-align:center"/>`}
      ${r.lock||r.fromMgr?`<span style="flex:1;font-size:13px">${esc(r.color)} · ${esc(COLORS_AR?.[r.color]||COLORS[r.color]||'')}</span>`:`<select onchange="_ceRows[${i}].color=this.value" style="${inp};flex:1;min-width:0">${colOpts(r.color)}</select>`}
      ${r.lock?`<b style="min-width:70px;text-align:center">${r.qty}</b>`:`<input type="number" min="0" inputmode="numeric" value="${r.qty||''}" placeholder="כמות" oninput="_ceRows[${i}].qty=Math.max(0,parseInt(this.value)||0);renderCountEntryTot()" style="${inp};width:80px"/>`}
    </div>`).join('')||'<div style="font-size:12px;color:var(--txt3)">אין שורות — הוסף מידה וצבע</div>'}
    <button class="btn" style="width:100%;font-size:13px;margin-top:2px" onclick="_ceRows.push({size:'',color:'',qty:0});renderCountEntry()">➕ מידה / צבע · مقاس / لون</button>
    <div style="font-size:14px;font-weight:700;margin:14px 0 6px">✂️ שלבי עבודה · مراحل العمل</div>
    <div style="font-size:12px;color:var(--txt2);margin-bottom:6px">${steps.length?steps.map(n=>esc(n)).join(' · '):'<span style="color:var(--txt3)">אין עדיין שלבים</span>'}</div>
    ${_ceSteps.map((n,i)=>`<div style="display:flex;gap:6px;margin-bottom:5px"><input value="${esc(n)}" oninput="_ceSteps[${i}]=this.value" placeholder="שם השלב · اسم المرحلة" style="${inp};flex:1;min-width:0"/>
      <button class="btn" style="font-size:12px" onclick="_ceSteps.splice(${i},1);renderCountEntry()">✕</button></div>`).join('')}
    <button class="btn" style="width:100%;font-size:13px" onclick="_ceSteps.push('');renderCountEntry()">➕ שלב חדש · مرحلة جديدة</button>
    <div style="font-size:11px;color:var(--txt3);margin-top:4px">רק שם השלב — התחנה והזמן מושלמים אחר כך במשרד.</div>
    <div style="font-size:14px;font-weight:700;margin:14px 0 6px">📷 תמונות · صور <span style="font-weight:400;color:var(--txt3);font-size:12px">— ${prodImgCount(p)?prodImgCount(p)+' כבר בכרטיס':'אין עדיין בכרטיס'}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${_ceImgs.map((im,i)=>`<div style="position:relative"><img src="${im}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--brd)"><button onclick="_ceImgs.splice(${i},1);renderCountEntry()" style="position:absolute;top:-5px;right:-5px;background:var(--red);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer">✕</button></div>`).join('')}</div>
    <div style="display:flex;gap:6px">
      <label class="btn" style="flex:1;font-size:13px;justify-content:center;cursor:pointer">📷 צלם · تصوير<input type="file" accept="image/*" capture="environment" onchange="ceAddImgs(this)" style="display:none"/></label>
      <label class="btn" style="flex:1;font-size:13px;justify-content:center;cursor:pointer">📁 העלה · رفع<input type="file" accept="image/*" multiple onchange="ceAddImgs(this)" style="display:none"/></label>
    </div>
    <button class="btn primary" style="width:100%;margin-top:14px;font-size:15px" onclick="saveCountEntry()">💾 שמור · حفظ</button>
  </div>`;
}
function renderCountEntryTot(){const el=document.getElementById('ce-tot');if(el)el.textContent=_ceRows.reduce((t,r)=>t+(+r.qty||0),0);}
async function saveCountEntry(){
  const wrap=document.getElementById('ce-wrap');
  const p=(S.products||[]).find(x=>String(x.id)===String(wrap?.dataset.pid));if(!p)return;
  const rows=_ceRows.filter(r=>r.size||r.color);
  if(rows.some(r=>!/^\d$/.test(r.size)||!r.color)){alert('לכל שורה צריך מידה (ספרה אחת) וצבע · لكل سطر مقاس ولون');return;}
  const keys=rows.map(r=>r.size+'|'+r.color);
  if(new Set(keys).size!==keys.length){alert('מידה+צבע כפולים · مقاس ولون مكرر');return;}
  const newSteps=[...new Set(_ceSteps.map(s=>String(s||'').trim()).filter(Boolean))];
  const have=new Set((p.workSteps||[]).map(s=>stepName(s)));
  const addSteps=newSteps.filter(n=>!have.has(n));
  const quantities=rows.map(r=>({size:r.size,color:r.color,qty:+r.qty||0}));
  const before=_prodQty(p);
  const qChanged=JSON.stringify(quantities)!==JSON.stringify((p.quantities||[]).map(q=>({size:String(q.size||''),color:String(q.color||''),qty:parseInt(q.qty)||0})));
  const nImg=_ceImgs.length;
  if(!qChanged&&!addSteps.length&&!nImg){wrap.remove();return;}
  const workSteps=(p.workSteps||[]).concat(addSteps.map(n=>({name:n,nameAr:'',level:0,station:'',altStations:[],manualMin:0,quick:false,merge:false,cut:false})));
  const upd={...(qChanged?{quantities}:{}),...(addSteps.length?{workSteps}:{}),countBy:S.user?.name||'',countAt:Date.now()};
  // 📷 התמונות מצטרפות לקיימות ב-productImages (נקרא קודם מהשרת — לא לדרוס תמונות שהמנהל העלה)
  if(nImg){
    if(!S.fbConnected){alert('אין חיבור — התמונות לא נשמרו · لا يوجد اتصال');return;}
    try{
      delete _prodImgCache[p.id];
      const imgs=(await fetchProdImgs(p.id,true)).concat(_ceImgs);
      await saveProdImgs(p.id,imgs,{srcCust:p.cust,srcProd:p.prod});
      _prodImgCache[p.id]=imgs;upd.imgCount=imgs.length;
    }catch(e){alert('שמירת התמונות נכשלה · فشل حفظ الصور: '+(e.message||e));return;}
  }
  if(S.fbConnected&&!await fbUpdateOnly('products',p.id,upd)){alert('השמירה נכשלה — בדוק חיבור · فشل الحفظ');return;}
  Object.assign(p,upd);saveLS();
  wrap.remove();
  const after=_prodQty(p);
  showToast('✅ נשמר · تم الحفظ'+(after?' · '+after+" יח'":'')+(addSteps.length?' · '+addSteps.length+' שלבים':'')+(nImg?' · '+(nImg===1?'תמונה אחת':nImg+' תמונות'):''),'var(--green-txt)',4000);
  try{renderProducts();}catch(e){}
  sendTelegram('📝 ספירה/גזירה — '+(S.user?.name||'')+'\n🏷 '+p.cust+'/'+p.prod+((parseInt(p.orderNo,10)||0)?' #'+String(p.orderNo).padStart(3,'0'):'')+' '+(p.name||'')
    +(qChanged?'\n📦 כמות: '+before+' ← '+after+" יח'":'')
    +(addSteps.length?'\n✂️ '+addSteps.length+' שלבים חדשים ממתינים לתחנה וזמן: '+addSteps.join(', '):'')
    +(nImg?'\n📷 '+(nImg===1?'תמונה אחת נוספה':nImg+' תמונות נוספו')+' לכרטיס':'')).catch(()=>{});
}
// ─── ✂️ דוח גזירה (27/10/2026 — במקום הדף הידני של הגוזר) ──────────────────────
// ציור אחד עם **מדרגות** (הבהרת המשתמש): פריסה באורך המלא מכסה את כל המידות; פריסה קצרה יותר (עד מדרגה)
// מכסה רק את המידות שנכנסות עד שם. כל מדרגה = אורך במטרים + המידות שבה (לרוב 1 מכל מידה, לפעמים 2).
// גלילים: צבע, מס' גליל, אצווה, מטרים ומשקל לפי המדבקה, וכמה פרסות מכל מדרגה.
// מחושב: מטרים שנוצלו (פרסות × אורך המדרגה), שארית, ויחידות לפי מידה+צבע (פרסות × כמות המידה במדרגה).
// השדה נקרא markers מהגרסה הראשונה (ציורים נפרדים) — כל איבר הוא מדרגה.
// 🎀 סרט מהבד (צווארון / פס / צברון) — strips:[{id,name,w,per}]: רוחב הסרט בס"מ, ורצועה אחת מספיקה ל-per יח'.
// לכל גליל: ⌈יח' של הגליל ÷ per⌉ × רוחב ÷ 100 = מטרים שנוצלו לסרט (63 יח' × 3.2 ס"מ = 2.016 מ').
// ⚠ בד סוג ב (rolls[].bad, מטרים) — פגום בגליל: יורד מהשארית ומוצג בנפרד, לא נספר כבד שנוצל לגזירה.
// products.cutReport = {markers:[{id,len,sz:[{s,n}]}], rolls:[{id,color,no,batch,m,kg,lay:[{k,n}]}], by,byName,at}
// ⚠️ מערכים ולא מפות — שמירת כרטיס המוצר היא fbSet (merge) שממזג מפות ולא מוחק מפתח שהוסר.
// בשמירה טבלת הכמויות מתעדכנת: לכל צבע שנגזר — כל מידה = מה שחושב (מידה שלא נגזרה = 0); צבע שעוד לא נגזר — לא נוגעים.
let _cr=null;
const _crId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function _crCalc(r){
  const L={};r.markers.forEach(m=>L[m.id]=m);
  const units={},rolls=r.rolls.map(o=>{let used=0;const u={};
    (o.lay||[]).forEach(x=>{const m=L[x.k],n=+x.n||0;if(!m||n<=0)return;used+=n*(+m.len||0);
      (m.sz||[]).forEach(z=>{if(+z.n>0)u[z.s]=(u[z.s]||0)+n*z.n;});});
    if(o.color)Object.entries(u).forEach(([s,n])=>{const k=s+'|'+o.color;units[k]=(units[k]||0)+n;});
    const tot=Object.values(u).reduce((a,b)=>a+b,0);
    const strip=(r.strips||[]).reduce((a,t)=>a+(+t.w>0&&tot?Math.ceil(tot/Math.max(1,+t.per||1))*(+t.w)/100:0),0);
    used+=strip;
    const bad=+o.bad||0,raw=(+o.m||0)-used-bad;
    // ✅ הגליל נגמר (fin) — לא נשאר בד: השארית 0, ומה שהחישוב השאיר = חוסר מול המדבקה (short; שלילי = יצא יותר מהמדבקה)
    const fin=!!o.fin&&+o.m>0;
    return{used,strip,bad,fin,left:fin?0:raw,short:fin?raw:0,units:u,tot};});
  return{rolls,units};
}
// בסורק — גם אחרי שברקוד הספירה נסגר: הגזירה ממשיכה בצבעים אחרים כשהתפירה כבר התחילה
const cutReportBtnHtml=v=>bcOrderProd(v)?`<button class="btn" style="width:100%;margin-top:6px;font-size:14px;font-weight:700;border-color:var(--blue-txt);color:var(--blue-txt)" onclick="openCutReport('${escj(String(bcOrderProd(v).id))}')">✂️ דוח גזירה · تقرير القص</button>`:'';
function openCutReport(pid){
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p){showToast('⚠ ההזמנה לא נמצאה','var(--red-txt)');return;}
  _cr=_crState(p);
  if(!_cr.markers.length)_cr.markers.push({id:_crId(),len:'',sz:[]});
  if(!_cr.rolls.length)_cr.rolls.push(_crNewRoll(p));
  document.getElementById('cr-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='cr-wrap';wrap.dataset.pid=p.id;
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:12px;overflow-y:auto';
  document.body.appendChild(wrap);
  renderCutReport();
}
// מצב החלון מהדוח השמור (גם ל-_crPublish — בלי חלון)
function _crState(p){
  const r=p.cutReport||{};
  const c={markers:JSON.parse(JSON.stringify(r.markers||[])),rolls:JSON.parse(JSON.stringify(r.rolls||[])),strips:JSON.parse(JSON.stringify(r.strips||[])),baseAt:+r.at||0,extra:{}};
  (r.extra||[]).forEach(x=>{if(+x.m>0)c.extra[x.c]=+x.m;});
  const sz=new Set((p.quantities||[]).map(q=>String(q.size||'')).filter(s=>/^\d$/.test(s)));
  c.markers.forEach(m=>(m.sz||[]).forEach(z=>sz.add(String(z.s))));
  c.sizes=[...sz].sort();if(!c.sizes.length)c.sizes=['1','2','3','4','5'];
  c.markers.sort((a,b)=>(+b.len||0)-(+a.len||0)); // הארוכה (הציור המלא) ראשונה
  // 🎯 כמה צריך — נשמר בדוח (טבלת הכמויות מוחלפת בשמירה במה שנגזר, אז היא לא יכולה להיות היעד). בפתיחה ראשונה — מטבלת הכמויות
  c.need=Array.isArray(r.need)?JSON.parse(JSON.stringify(r.need)):(p.quantities||[]).filter(q=>+q.qty>0&&q.color&&/^\d$/.test(String(q.size))).map(q=>({c:String(q.color),s:String(q.size),n:+q.qty}));
  c.pcols=[...new Set((p.quantities||[]).map(q=>String(q.color||'')).filter(Boolean))];
  return c;
}
// 📦 דוח גזירה בדף הלקוח (08/11/2026): בכל שמירה — אותו דף הדפסה נשמר ב-cutPrints/{מזהה מוצר} = {html,at,cust,prod},
// ו-cutReport.pAt = at מסמן שהעותק עדכני. customerTrack מציג שורה "דוח גזירה" רק כשיש pAt, וטוען את ה-html בלחיצה.
// דוח שנשמר לפני כן / בגרסה ישנה (pAt ≠ at) — המנהל מפרסם ברקע (_crBackfill)
async function _crPublish(p,st){
  const at=+p.cutReport?.at||0;if(!at)return false;
  const keep=_cr;_cr=st||_crState(p);
  let html;try{html=_crHtml(p,'עודכן '+new Date(at).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}));}finally{_cr=keep;}
  try{await fbSet('cutPrints',String(p.id),{html,at,cust:String(p.cust||''),prod:String(p.prod||'')});}catch(e){return false;}
  return true;
}
const _crBfDone=new Set();
async function _crBackfill(){
  if(S.user?.role!=='manager'||!S.fbConnected)return;
  for(const p of (S.products||[])){const r=p.cutReport;
    if(!r||!+r.at||+r.pAt===+r.at||!(r.rolls||[]).length||_crBfDone.has(p.id+'_'+r.at))continue;
    _crBfDone.add(p.id+'_'+r.at);
    if(await _crPublish(p))await fbUpdateOnly('products',String(p.id),{'cutReport.pAt':+r.at});}
}
function _crNewRoll(p){
  const last=_cr?.rolls?.[_cr.rolls.length-1];
  const col=last?.color||((p?.quantities||[]).map(q=>String(q.color||'')).find(Boolean))||'';
  return{id:_crId(),color:col,no:'',batch:'',m:'',kg:'',bad:'',lay:[]};
}
const _crSzN=(m,s)=>+((m.sz||[]).find(z=>String(z.s)===String(s))?.n)||0;
function _crSetSz(mi,s,v){const m=_cr.markers[mi];const n=Math.max(0,parseInt(v)||0);
  m.sz=(m.sz||[]).filter(z=>String(z.s)!==String(s));if(n)m.sz.push({s:String(s),n});m.sz.sort((a,b)=>a.s.localeCompare(b.s));crCalcView();}
// לחיצה על מידה במדרגה: 0 ⇒ 1 ⇒ 2 ⇒ 0
function crTogSz(mi,s){const n=(_crSzN(_cr.markers[mi],s)+1)%3;_crSetSz(mi,s,n);renderCutReport();}
// "0–5" / "2–3" / "1,3,5" (+ ×2 למידה שמופיעה פעמיים)
function _crSzTxt(m){const z=(m.sz||[]).filter(x=>+x.n>0).map(x=>({s:+x.s,n:+x.n})).sort((a,b)=>a.s-b.s);if(!z.length)return '';
  const run=z.every((x,i)=>!i||x.s===z[i-1].s+1)&&z.every(x=>x.n===1);
  return run&&z.length>1?z[0].s+'–'+z[z.length-1].s:z.map(x=>x.s+(x.n>1?'×'+x.n:'')).join(',');}
const _crLayN=(o,k)=>+((o.lay||[]).find(x=>x.k===k)?.n)||0;
function _crSetLay(ri,k,v){const o=_cr.rolls[ri];const n=Math.max(0,parseInt(v)||0);
  o.lay=(o.lay||[]).filter(x=>x.k!==k);if(n)o.lay.push({k,n});crCalcView();}
function crAddSize(){
  const s=(prompt('מספר המידה (ספרה אחת) · رقم المقاس')||'').trim();
  if(!/^\d$/.test(s)){if(s)alert('מידה = ספרה אחת · المقاس رقم واحد');return;}
  if(!_cr.sizes.includes(s)){_cr.sizes.push(s);_cr.sizes.sort();}
  renderCutReport();
}
const _crM=n=>(Math.round(n*100)/100).toFixed(2);
const _crColName=c=>c?esc(c)+' · '+esc(COLORS[c]||'')+(COLORS_AR?.[c]?' · '+esc(COLORS_AR[c]):''):'—';
const _crNum=v=>v===''||v==null?'':esc(v);
function renderCutReport(){
  const wrap=document.getElementById('cr-wrap');if(!wrap||!_cr)return;
  const p=(S.products||[]).find(x=>String(x.id)===String(wrap.dataset.pid));if(!p){wrap.remove();return;}
  const inp='font-size:14px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const fld=inp+';width:100%;box-sizing:border-box';
  const box='border:1px solid var(--brd);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--bg2)';
  const lbl='font-size:11px;color:var(--txt3)';
  const colOpts=c=>`<option value="">-- צבע · لون --</option>`+Object.entries(COLORS).map(([k,v])=>`<option value="${k}"${k===c?' selected':''}>${k} · ${esc(v)} · ${esc(COLORS_AR?.[k]||'')}</option>`).join('');
  const markers=_cr.markers.map((m,mi)=>`<div style="${box}">
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <b style="font-size:13px;min-width:60px">${mi?'מדרגה '+mi+' · درجة':'ציור מלא · كاملة'}</b>
      <span style="font-size:12px;color:var(--txt3);white-space:nowrap">אורך</span>
      <input type="number" step="0.01" min="0" inputmode="decimal" value="${_crNum(m.len)}" placeholder="מטר" oninput="_cr.markers[${mi}].len=this.value===''?'':(+this.value||0);crCalcView()" style="${inp};width:90px"/>
      <span style="font-size:12px;color:var(--txt3)">מ'</span>
      <span style="flex:1"></span>
      ${_cr.markers.length>1?`<button class="btn" style="font-size:12px" onclick="crDelMarker(${mi})">✕</button>`:''}
    </div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:4px">המידות שנכנסות · المقاسات <bdi dir="ltr" style="color:var(--txt)">${_crSzTxt(m)}</bdi> <span style="font-size:11px">(לחיצה נוספת = ×2)</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${_cr.sizes.map(s=>{const n=_crSzN(m,s);return`<button type="button" onclick="crTogSz(${mi},'${s}')" style="min-width:42px;padding:8px 4px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;border:1px solid ${n?'var(--green-txt)':'var(--brd)'};background:${n?'var(--green-bg)':'var(--bg)'};color:${n?'var(--green-txt)':'var(--txt3)'}">${esc(s)}${n>1?'<sup>×'+n+'</sup>':''}</button>`;}).join('')}</div>
  </div>`).join('');
  const rolls=_cr.rolls.map((o,ri)=>`<div style="${box}">
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <b style="font-size:14px">🧵 גליל ${ri+1} · رول ${ri+1}</b><span style="flex:1"></span>
      <button class="btn" style="font-size:12px" onclick="crDelRoll(${ri})">✕</button>
    </div>
    <select onchange="_cr.rolls[${ri}].color=this.value;crCalcView()" style="${fld};margin-bottom:6px">${colOpts(o.color)}</select>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
      <label style="${lbl}">מס' גליל · رقم الرول<input value="${esc(o.no||'')}" oninput="_cr.rolls[${ri}].no=this.value" style="${fld}"/></label>
      <label style="${lbl}">אצווה · Batch<input value="${esc(o.batch||'')}" oninput="_cr.rolls[${ri}].batch=this.value" style="${fld}"/></label>
      <label style="${lbl}">מטר במדבקה · متر<input type="number" step="0.01" min="0" inputmode="decimal" value="${_crNum(o.m)}" oninput="_cr.rolls[${ri}].m=this.value===''?'':(+this.value||0);crCalcView()" style="${fld}"/></label>
      <label style="${lbl}">משקל ק"ג · وزن<input type="number" step="0.01" min="0" inputmode="decimal" value="${_crNum(o.kg)}" oninput="_cr.rolls[${ri}].kg=this.value===''?'':(+this.value||0)" style="${fld}"/></label>
      <label style="${lbl}">⚠ בד סוג ב (מ') · قماش معيوب<input type="number" step="0.01" min="0" inputmode="decimal" value="${_crNum(o.bad)}" oninput="_cr.rolls[${ri}].bad=this.value===''?'':(+this.value||0);crCalcView()" style="${fld}"/></label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:8px;border:1px solid var(--brd);border-radius:8px;cursor:pointer"><input type="checkbox"${o.fin?' checked':''} onchange="_cr.rolls[${ri}].fin=this.checked;crCalcView()" style="width:18px;height:18px"/>הגליל נגמר — לא נשאר בד · خلص الرول</label>
    </div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:4px">כמה פרסות בכל אורך · عدد الطبقات لكل طول</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${_cr.markers.map((m,mi)=>`<label style="display:flex;flex-direction:column;align-items:center;font-size:12px;color:var(--txt3)"><b style="color:var(--txt)" id="cr-ml-${ri}-${mi}"></b><bdi dir="ltr" style="font-size:11px">${_crSzTxt(m)||'—'}</bdi>
      <input type="number" min="0" inputmode="numeric" value="${_crLayN(o,m.id)||''}" placeholder="0" oninput="_crSetLay(${ri},'${m.id}',this.value)" style="${inp};width:60px;text-align:center"/></label>`).join('')}</div>
    <div id="cr-rc-${ri}" style="font-size:12px;margin-top:6px"></div>
  </div>`).join('');
  const at=p.cutReport?.at?' · נשמר '+new Date(p.cutReport.at).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+(p.cutReport.byName?' — '+esc(p.cutReport.byName):''):'';
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:16px;max-width:520px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:16px;font-weight:800">✂️ דוח גזירה · ${esc(p.cust)}/${esc(p.prod)}${(parseInt(p.orderNo,10)||0)?' #'+String(p.orderNo).padStart(3,'0'):''}</div>
      <span style="display:flex;gap:6px"><button class="btn" style="font-size:12px;padding:4px 10px" onclick="openMrkMap('${escj(String(p.id))}')">🧵 מפת פריסה${p.mrkMap?' ✓':''}</button>
      <button class="btn" style="font-size:12px;padding:4px 10px" onclick="crClose()">✕</button></span>
    </div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:10px">${esc(p.name||'')}${at}</div>
    <div style="font-size:14px;font-weight:700">🎯 כמה צריך לגזור · المطلوب</div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">לפי ההזמנה — מכל מידה, בכל צבע.</div>
    ${_crCols().map(col=>`<div style="${box}"><div style="font-size:13px;font-weight:700;margin-bottom:4px">${_crColName(col)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${_cr.sizes.map(s=>`<label style="display:flex;flex-direction:column;align-items:center;font-size:12px;color:var(--txt3)">${esc(s)}
        <input type="number" min="0" inputmode="numeric" value="${_crNeed(col,s)||''}" placeholder="0" oninput="_crSetNeed('${col}','${s}',this.value)" style="${inp};width:46px;padding:7px 2px;text-align:center"/></label>`).join('')}</div></div>`).join('')}
    <select onchange="crAddNeedCol(this.value)" style="${fld};margin-bottom:12px"><option value="">➕ צבע · لون</option>${Object.entries(COLORS).filter(([k])=>!_crCols().includes(k)).map(([k,v])=>`<option value="${k}">${k} · ${esc(v)} · ${esc(COLORS_AR?.[k]||'')}</option>`).join('')}</select>
    <div style="font-size:14px;font-weight:700">📐 ציור ומדרגות · الرسمة والدرجات</div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">אורך מלא = כל המידות. פריסה קצרה יותר = רק המידות עד המדרגה.</div>
    ${markers}
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <button class="btn" style="flex:1;font-size:13px" onclick="_cr.markers.push({id:_crId(),len:'',sz:[]});renderCutReport()">➕ מדרגה · درجة</button>
      <button class="btn" style="font-size:13px" onclick="crAddSize()">➕ מידה · مقاس</button>
    </div>
    <div style="font-size:14px;font-weight:700">🎀 סרט מהבד · شريط من القماش</div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">בד שנשאר לתפירה (צווארון, פס…): רוחב הסרט ליחידה, ולכמה יח' מספיקה רצועה אחת.</div>
    ${(_cr.strips||[]).map((t,ti)=>`<div style="${box};display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap">
      <label style="${lbl};flex:1;min-width:110px">שם · الاسم<input value="${esc(t.name||'')}" placeholder="צווארון" oninput="_cr.strips[${ti}].name=this.value" style="${fld}"/></label>
      <label style="${lbl};width:80px">רוחב ס"מ · عرض<input type="number" step="0.1" min="0" inputmode="decimal" value="${_crNum(t.w)}" oninput="_cr.strips[${ti}].w=this.value===''?'':(+this.value||0);crCalcView()" style="${fld}"/></label>
      <label style="${lbl};width:80px">יח' לרצועה · قطع<select onchange="_cr.strips[${ti}].per=+this.value;crCalcView()" style="${fld}">${[1,2,3,4].map(n=>`<option value="${n}"${(+t.per||1)===n?' selected':''}>${n}</option>`).join('')}</select></label>
      <button class="btn" style="font-size:12px" onclick="_cr.strips.splice(${ti},1);renderCutReport()">✕</button>
    </div>`).join('')}
    <button class="btn" style="width:100%;font-size:13px;margin-bottom:12px" onclick="_cr.strips.push({id:_crId(),name:'',w:'',per:1});renderCutReport()">➕ סרט · شريط</button>
    <div style="font-size:14px;font-weight:700;margin-bottom:6px">📋 מה נשאר לפרוס · ما تبقى للفرد</div>
    <div id="cr-plan"></div>
    <div style="font-size:14px;font-weight:700;margin:12px 0 2px">🧮 בד שנשאר — כמה עוד אפשר · القماش الباقي</div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">אחרי שהגעתם לכמות ההזמנה: כמה מטר בד נשאר מהצבע — החישוב מחלק את היחידות לפי היחס של ההזמנה.</div>
    ${_crCols().filter(col=>_cr.sizes.some(s=>_crNeed(col,s)>0)).map(col=>`<div style="${box}">
      <div style="display:flex;gap:6px;align-items:center"><b style="font-size:13px;flex:1">${_crColName(col)}</b>
        <input type="number" step="0.01" min="0" inputmode="decimal" value="${_crNum(_cr.extra[col])}" placeholder="מטר" oninput="if(this.value==='')delete _cr.extra['${col}'];else _cr.extra['${col}']=+this.value||0;crCalcView()" style="${inp};width:90px"/><span style="font-size:12px;color:var(--txt3)">מ'</span></div>
      <div id="cr-ex-${col}" style="font-size:12px;margin-top:6px"></div></div>`).join('')||'<div style="font-size:12px;color:var(--txt3);margin-bottom:6px">הזן קודם כמה צריך מכל מידה</div>'}
    <div style="font-size:14px;font-weight:700;margin:12px 0 6px">🧵 גלילים · الرولات</div>
    ${rolls}
    <button class="btn" style="width:100%;font-size:13px;margin-bottom:12px" onclick="crAddRoll()">➕ גליל · رول</button>
    <div id="cr-sum"></div>
    <div style="font-size:11px;color:var(--txt3);margin-top:6px">בשמירה טבלת הכמויות של ההזמנה מתעדכנת לפי מה שנגזר (רק בצבעים שנגזרו).</div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="btn primary" style="flex:1;font-size:15px" onclick="saveCutReport()">💾 שמור · حفظ</button>
      <button class="btn" style="font-size:14px" onclick="printCutReport()">🖨 הדפס · طباعة</button>
    </div>
  </div>`;
  crCalcView();
}
function crDelMarker(mi){const m=_cr.markers[mi];if(_cr.rolls.some(o=>_crLayN(o,m.id))&&!confirm('למדרגה יש פרסות בגלילים — למחוק? · حذف؟'))return;
  _cr.markers.splice(mi,1);_cr.rolls.forEach(o=>o.lay=(o.lay||[]).filter(x=>x.k!==m.id));renderCutReport();}
function crDelRoll(ri){const o=_cr.rolls[ri];if(((o.lay||[]).length||o.m||o.no)&&!confirm('למחוק את גליל '+(ri+1)+'? · حذف الرول؟'))return;_cr.rolls.splice(ri,1);renderCutReport();}
function crAddRoll(){const p=(S.products||[]).find(x=>String(x.id)===String(document.getElementById('cr-wrap')?.dataset.pid));_cr.rolls.push(_crNewRoll(p));renderCutReport();}
function crClose(){if(confirm('לסגור בלי לשמור? · إغلاق بدون حفظ؟')){document.getElementById('cr-wrap')?.remove();_cr=null;}}
// עדכון החישובים בלבד (בלי לבנות מחדש — הפוקוס נשאר בשדה)
const _crNeed=(c,s)=>+(_cr.need.find(x=>x.c===c&&x.s===s)?.n)||0;
function _crSetNeed(c,s,v){const n=Math.max(0,parseInt(v)||0);_cr.need=_cr.need.filter(x=>!(x.c===c&&x.s===s));if(n)_cr.need.push({c,s,n});crCalcView();}
function _crCols(){return [...new Set([..._cr.pcols,..._cr.need.map(x=>x.c),..._cr.rolls.map(o=>o.color)].filter(Boolean))];}
function crAddNeedCol(c){if(c&&!_cr.pcols.includes(c))_cr.pcols.push(c);renderCutReport();}
// 📋 תוכנית פריסה לצבע: מה שנשאר (צריך − נגזר) מחולק למדרגות מהארוכה לקצרה — בכל מדרגה פורסים
// כמה שאפשר בלי לחרוג מאף מידה שבה (מינימום של נשאר÷כמות). מה שלא מתחלק — אין מדרגה שמתאימה בדיוק.
function _crPlan(col,c){
  const rem={};_cr.sizes.forEach(s=>{rem[s]=Math.max(0,_crNeed(col,s)-(c.units[s+'|'+col]||0));});
  return _crPlanRem(rem,col);
}
// rem = {מידה: כמה יח'} — מתעדכן למה שלא נכנס לאף מדרגה
function _crPlanRem(rem,col){
  const steps=[..._cr.markers].filter(m=>+m.len>0&&(m.sz||[]).some(z=>+z.n>0)).sort((a,b)=>(+b.len)-(+a.len));
  const rows=steps.map(m=>{const z=(m.sz||[]).filter(x=>+x.n>0);
    const n=Math.max(0,Math.min(...z.map(x=>Math.floor((rem[x.s]||0)/x.n))));
    z.forEach(x=>rem[x.s]=(rem[x.s]||0)-n*x.n);
    const done=col==null?0:_cr.rolls.filter(o=>o.color===col).reduce((a,o)=>a+_crLayN(o,m.id),0);
    return{m,n,done};});
  return{rows,rem};
}
// 🧮 בד שנשאר אחרי שהגיעו לכמות ההזמנה (28/10/2026): כמה עוד יח' אפשר להוציא מ-meters מטר, ביחס של ההזמנה (כמה צריך).
// לכל N: מחלקים N יח' לפי היחס (שארית גדולה), מתכננים פריסה במדרגות (כמו "מה נשאר לפרוס") + סרט — לוקחים את ה-N הגדול שנכנס במטרים.
function _crExtra(col,meters){
  const sz=_cr.sizes.filter(s=>_crNeed(col,s)>0),T=sz.reduce((a,s)=>a+_crNeed(col,s),0);
  if(!T||!(meters>0))return null;
  const strip=u=>(_cr.strips||[]).reduce((a,t)=>a+(+t.w>0&&u?Math.ceil(u/Math.max(1,+t.per||1))*(+t.w)/100:0),0);
  let best=null;
  for(let N=1;N<=5000;N++){
    const raw=sz.map(s=>N*_crNeed(col,s)/T),fl=raw.map(Math.floor);
    raw.map((x,i)=>[x-fl[i],i]).sort((a,b)=>b[0]-a[0]).slice(0,N-fl.reduce((a,b)=>a+b,0)).forEach(([,i])=>fl[i]++);
    const rem={};sz.forEach((s,i)=>rem[s]=fl[i]);
    const{rows}=_crPlanRem(rem,null);
    const units={};sz.forEach((s,i)=>{const n=fl[i]-(rem[s]||0);if(n)units[s]=n;});
    const u=Object.values(units).reduce((a,b)=>a+b,0);
    const len=rows.reduce((a,x)=>a+x.n*(+x.m.len),0)+strip(u);
    if(len>meters){if(len>meters*1.5+7)break;continue;}
    if(u&&(!best||u>best.u))best={u,units,rows:rows.filter(x=>x.n),len};
  }
  return best;
}
function crCalcView(){
  if(!_cr)return;
  const c=_crCalc(_cr);
  c.rolls.forEach((x,ri)=>{
    _cr.markers.forEach((m,mi)=>{const l=document.getElementById('cr-ml-'+ri+'-'+mi);if(l)l.textContent=+m.len?_crM(+m.len):'?';});
    const el=document.getElementById('cr-rc-'+ri);if(!el)return;
    const o=_cr.rolls[ri],hasM=o.m!==''&&+o.m>0;
    el.innerHTML=x.used||x.tot?`נוצל · مستعمل <b>${_crM(x.used)} מ'</b>${x.strip?` <span style="color:var(--txt3)">(כולל סרט ${(Math.round(x.strip*1000)/1000).toFixed(3)} מ')</span>`:''}${hasM?(x.fin?` · <b>✅ נגמר · خلص</b>${x.short>0?` · חסר מהמדבקה · ناقص <b style="color:var(--red-txt)">${_crM(x.short)} מ'</b>`:x.short<0?` · יותר מהמדבקה · زيادة <b style="color:var(--amber-txt)">${_crM(-x.short)} מ'</b>`:''}`:` · שארית · باقي <b style="color:${x.left<0?'var(--red-txt)':'var(--green-txt)'}">${_crM(x.left)} מ'</b>${x.left<0?' ⚠ יותר מהמדבקה':''}`):''}${x.bad?` · סוג ב · معيوب <b style="color:var(--amber-txt)">${_crM(x.bad)} מ'</b>`:''}
      <br>יח' · قطع <b>${x.tot}</b>${x.tot?' — '+Object.entries(x.units).sort().map(([s,n])=>'מידה '+esc(s)+': '+n).join(' · '):''}${!o.color?' <b style="color:var(--red-txt)">· בחר צבע</b>':''}`:'<span style="color:var(--txt3)">עוד אין פרסות</span>';});
  const cols=[...new Set(Object.keys(c.units).map(k=>k.split('|')[1]))];
  const sizes=[...new Set(Object.keys(c.units).map(k=>k.split('|')[0]))].sort();
  const used=c.rolls.reduce((a,x)=>a+x.used,0),tot=Object.values(c.units).reduce((a,b)=>a+b,0);
  const left=_cr.rolls.reduce((a,o,i)=>a+(o.m!==''&&+o.m>0?c.rolls[i].left:0),0),bad=c.rolls.reduce((a,x)=>a+x.bad,0),short=c.rolls.reduce((a,x)=>a+Math.max(0,x.short),0);
  const pl=document.getElementById('cr-plan');
  if(pl){const cols=_crCols().filter(col=>_cr.sizes.some(s=>_crNeed(col,s)>0));
    pl.innerHTML=cols.map(col=>{const{rows,rem}=_crPlan(col,c);
      const sz=_cr.sizes.filter(s=>_crNeed(col,s)>0||(c.units[s+'|'+col]||0)>0).map(s=>{const nd=_crNeed(col,s),ct=c.units[s+'|'+col]||0,d=ct-nd;
        return`<span style="white-space:nowrap">מידה ${esc(s)}: <b>${ct}</b> מתוך ${nd}${d<0?` <span style="color:var(--red-txt)">(חסר ${-d})</span>`:d>0?` <span style="color:var(--amber-txt)">(+${d})</span>`:' ✅'}</span>`;}).join(' · ');
      const left=Object.entries(rem).filter(([s,n])=>n>0);
      const todo=rows.reduce((a,x)=>a+x.n,0);
      return`<div style="border:1px solid var(--blue-txt);border-radius:10px;padding:10px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${_crColName(col)} — ${todo?`נשאר לפרוס · باقي <b>${todo}</b> פרסות`:'<span style="color:var(--green-txt)">✅ אין מה לפרוס</span>'}</div>
        ${rows.filter(x=>x.n||x.done).map(x=>`<div style="display:flex;gap:6px;font-size:13px;padding:3px 0;border-top:1px solid var(--brd)">
          <b style="min-width:44px">${_crM(+x.m.len)}</b><bdi dir="ltr" style="color:var(--txt3);min-width:40px">${_crSzTxt(x.m)}</bdi>
          <span style="flex:1">נפרס · تم <b>${x.done}</b></span><span>נשאר · باقي <b style="color:${x.n?'var(--blue-txt)':'var(--green-txt)'}">${x.n}</b></span></div>`).join('')}
        <div style="font-size:12px;margin-top:4px;color:var(--txt2)">נגזר · مقصوص: ${sz}</div>
        ${left.length?`<div style="font-size:11px;color:var(--red-txt);margin-top:2px">⚠ אין מדרגה מתאימה ל: ${left.map(([s,n])=>'מידה '+esc(s)+' × '+n).join(' · ')}</div>`:''}
      </div>`;}).join('')||'<div style="font-size:12px;color:var(--txt3)">הזן כמה צריך מכל מידה כדי לראות תוכנית פריסה</div>';}
  Object.keys(_cr.extra).concat(_crCols()).forEach(col=>{const ex=document.getElementById('cr-ex-'+col);if(!ex)return;
    const m=+_cr.extra[col]||0;
    const rl=_cr.rolls.reduce((a,o,i)=>a+(o.color===col&&+o.m>0&&!o.fin&&c.rolls[i].left>0?c.rolls[i].left:0),0);
    if(!m){ex.innerHTML=`<span style="color:var(--txt3)">הזן כמה מטר נשאר${rl?` · לפי הגלילים ~${_crM(rl)} מ'`:''}</span>`;return;}
    const r=_crExtra(col,m);
    ex.innerHTML=r?`אפשר עוד · ممكن <b style="font-size:14px;color:var(--green-txt)">${r.u}</b> יח' — ${Object.entries(r.units).sort().map(([s,n])=>'מידה '+esc(s)+': <b>'+n+'</b>').join(' · ')}
      <br>פריסה · الفرد: ${r.rows.map(x=>`<b>${_crM(+x.m.len)}</b> <bdi dir="ltr" style="color:var(--txt3)">${_crSzTxt(x.m)}</bdi> × <b>${x.n}</b>`).join(' · ')}
      <br><span style="color:var(--txt3)">נוצל ~${_crM(r.len)} מ' · נשאר ~${_crM(m-r.len)} מ'</span>`
      :'<span style="color:var(--red-txt)">הבד לא מספיק אפילו לפריסה אחת · القماش لا يكفي</span>';});
  const el=document.getElementById('cr-sum');if(!el)return;
  const th='padding:3px 6px';
  el.innerHTML=tot?`<div style="border:1px solid var(--green-txt);border-radius:10px;padding:10px">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px">📊 סיכום · الملخص</div>
    <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;width:100%"><tr><th style="text-align:right;${th}">צבע</th>${sizes.map(s=>`<th style="${th}">${esc(s)}</th>`).join('')}<th style="${th}">סה"כ</th></tr>
    ${cols.map(col=>{let t=0;return`<tr style="border-top:1px solid var(--brd)"><td style="${th};white-space:nowrap">${_crColName(col)}</td>${sizes.map(s=>{const n=c.units[s+'|'+col]||0;t+=n;return`<td style="text-align:center;${th}">${n||'—'}</td>`;}).join('')}<td style="text-align:center;${th}"><b>${t}</b></td></tr>`;}).join('')}</table></div>
    <div style="font-size:13px;margin-top:6px">סה"כ <b>${tot}</b> יח' · נוצל <b>${_crM(used)} מ'</b> · <b>${_crM(used/tot)}</b> מ' ליחידה${left?` · שארית <b>${_crM(left)} מ'</b>`:''}${bad?` · סוג ב <b style="color:var(--amber-txt)">${_crM(bad)} מ'</b>`:''}${short?` · חסר מהמדבקות <b style="color:var(--red-txt)">${_crM(short)} מ'</b>`:''}</div></div>`:'';
}
// 🖨 הדפסת הדוח (27/10/2026) — מהחלון הפתוח, כולל שינויים שלא נשמרו. A4; באייפון PDF ⇒ שיתוף, כמו דף השלבים
async function printCutReport(){
  const p=(S.products||[]).find(x=>String(x.id)===String(document.getElementById('cr-wrap')?.dataset.pid));if(!p||!_cr)return;
  const html=_crHtml(p,'הודפס '+new Date().toLocaleString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}));
  if(!_isIOS()){printViaIframe(html);return;}
  showToast('⏳ מכין PDF…','var(--txt3)',4000);
  let blob;try{blob=await _dnPdfBlob(html);}catch(e){alert('הכנת ה-PDF נכשלה: '+(e?.message||e));return;}
  await _printPdfBlob(blob,'cut-report-'+(p.prod||'0')+'.pdf');
}
// דף ההדפסה מ-_cr (החלון הפתוח, או מצב שמור ב-_crPublish). sub = "הודפס …" / "עודכן …"
function _crHtml(p,sub){
  const c=_crCalc(_cr),steps=_cr.markers.filter(m=>+m.len>0),cn=c=>esc((COLORS[c]||c)+'');
  const sizes=[...new Set([...Object.keys(c.units).map(k=>k.split('|')[0]),..._cr.need.map(x=>x.s)])].sort();
  const cols=[...new Set([...Object.keys(c.units).map(k=>k.split('|')[1]),..._cr.need.filter(x=>+x.n>0).map(x=>x.c)])];
  const ord=(parseInt(p.orderNo,10)||0)?' · הזמנה #'+String(p.orderNo).padStart(3,'0'):'';
  const title='דוח גזירה — מוצר '+p.prod+' · לקוח '+p.cust+ord;
  const stepTbl=steps.length?`<h3>ציור ומדרגות</h3><table><tr><th>אורך (מ')</th><th>מידות</th></tr>${steps.map((m,i)=>`<tr><td>${_crM(+m.len)}${i?'':' (מלא)'}</td><td dir="ltr" style="text-align:right">${_crSzTxt(m)}</td></tr>`).join('')}</table>`:'';
  const strips=(_cr.strips||[]).filter(t=>+t.w>0);
  const stripTxt=strips.length?`<div class="note">סרט מהבד: ${strips.map(t=>esc(t.name||'סרט')+' — '+t.w+' ס"מ, רצועה ל-'+(+t.per||1)+" יח'").join(' · ')}</div>`:'';
  const rolls=_cr.rolls.map((o,i)=>({o,x:c.rolls[i],i})).filter(r=>r.x.tot||r.o.m!==''||r.o.no);
  const hasFin=rolls.some(r=>r.x.fin);
  const rollTbl=rolls.length?`<h3>גלילים</h3><table><tr><th>#</th><th>צבע</th><th>מס' גליל</th><th>אצווה</th><th>מטר</th><th>ק"ג</th>${steps.map(m=>`<th>${_crM(+m.len)}</th>`).join('')}<th>נוצל</th><th>סוג ב</th><th>שארית</th>${hasFin?'<th>חסר מהמדבקה</th>':''}<th>יח'</th></tr>
    ${rolls.map(({o,x,i})=>`<tr><td>${i+1}</td><td>${cn(o.color)}</td><td>${esc(o.no||'')}</td><td>${esc(o.batch||'')}</td><td>${o.m===''?'':_crM(+o.m)}</td><td>${o.kg===''||o.kg==null?'':esc(o.kg)}</td>
      ${steps.map(m=>`<td>${_crLayN(o,m.id)||''}</td>`).join('')}<td><b>${_crM(x.used)}</b>${x.strip?`<div class="s">סרט ${x.strip.toFixed(3)}</div>`:''}</td><td>${x.bad?_crM(x.bad):''}</td>
      <td${x.left<0?' class="neg"':''}>${x.fin?'נגמר':o.m!==''&&+o.m>0?_crM(x.left):''}</td>${hasFin?`<td${x.short>0?' class="neg"':''}>${x.fin&&x.short?(x.short<0?'+':'')+_crM(Math.abs(x.short)):''}</td>`:''}<td><b>${x.tot}</b></td></tr>`).join('')}</table>`:'';
  let gt=0,gn=0;
  const sumTbl=cols.length?`<h3>סיכום לפי צבע ומידה (נגזר / צריך)</h3><table><tr><th>צבע</th>${sizes.map(s=>`<th>${esc(s)}</th>`).join('')}<th>סה"כ</th></tr>
    ${cols.map(col=>{let t=0,tn=0;const tds=sizes.map(s=>{const n=c.units[s+'|'+col]||0,nd=_crNeed(col,s);t+=n;tn+=nd;
      return`<td${nd&&n<nd?' class="neg"':''}>${n}${nd?`<span class="s"> / ${nd}</span>`:''}</td>`;}).join('');gt+=t;gn+=tn;
      return`<tr><td>${cn(col)}</td>${tds}<td><b>${t}</b>${tn?`<span class="s"> / ${tn}</span>`:''}</td></tr>`;}).join('')}</table>`:'';
  const used=c.rolls.reduce((a,x)=>a+x.used,0),bad=c.rolls.reduce((a,x)=>a+x.bad,0),short=c.rolls.reduce((a,x)=>a+Math.max(0,x.short),0);
  const left=_cr.rolls.reduce((a,o,i)=>a+(o.m!==''&&+o.m>0?c.rolls[i].left:0),0);
  const plan=cols.map(col=>({col,rows:_crPlan(col,c).rows})).filter(x=>x.rows.some(r=>r.n));
  const ex=Object.entries(_cr.extra).filter(([,m])=>+m>0).map(([col,m])=>({col,m:+m,r:_crExtra(col,+m)}));
  const exTbl=ex.length?`<h3>בד שנשאר — כמה עוד אפשר (לפי יחס ההזמנה)</h3><table><tr><th>צבע</th><th>מטר שנשאר</th><th>עוד יח'</th><th>לפי מידה</th><th>פריסה</th></tr>${ex.map(({col,m,r})=>`<tr><td>${cn(col)}</td><td>${_crM(m)}</td><td><b>${r?r.u:0}</b></td><td>${r?Object.entries(r.units).sort().map(([s,n])=>esc(s)+': '+n).join(' · '):'—'}</td><td>${r?r.rows.map(x=>_crM(+x.m.len)+' × '+x.n).join(' · '):'—'}</td></tr>`).join('')}</table>`:'';
  const html=`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4;margin:0}body{font-family:Arial,sans-serif;color:#000;margin:0;padding:12mm;font-size:12px}
    h2{margin:0 0 2px;font-size:18px}h3{font-size:14px;margin:14px 0 5px}.sub{color:#444;font-size:12px;margin-bottom:6px}
    table{width:100%;border-collapse:collapse}td,th{border:1px solid #888;padding:4px 5px;text-align:center;vertical-align:top}th{background:#eee}
    .s{font-size:10px;color:#555}.neg{color:#b91c1c;font-weight:700}.note{margin-top:6px;font-size:12px}.tot{margin-top:10px;font-size:13px;font-weight:700}
    tr{page-break-inside:avoid}</style></head><body>
    <h2>${esc(title)}</h2><div class="sub">${p.name?esc(p.name)+' · ':''}${sub}${p.cutReport?.byName?' · נשמר ע"י '+esc(p.cutReport.byName):''}</div>
    ${stepTbl}${stripTxt}${rollTbl}${sumTbl}
    <div class="tot">סה"כ ${Object.values(c.units).reduce((a,b)=>a+b,0)} יח'${gn?' מתוך '+gn:''} · נוצל ${_crM(used)} מ'${gt?' · '+_crM(used/gt)+" מ' ליחידה":''}${left?' · שארית '+_crM(left)+" מ'":''}${bad?' · סוג ב '+_crM(bad)+" מ'":''}${short?' · חסר מהמדבקות '+_crM(short)+" מ'":''}</div>
    ${exTbl}
    ${plan.length?`<h3>נשאר לפרוס (פרסות)</h3><table><tr><th>צבע</th>${steps.map(m=>`<th>${_crM(+m.len)}</th>`).join('')}</tr>${plan.map(x=>`<tr><td>${cn(x.col)}</td>${steps.map(m=>{const r=x.rows.find(y=>y.m.id===m.id);return`<td>${r&&r.n?'<b>'+r.n+'</b>':''}</td>`;}).join('')}</tr>`).join('')}</table>`:''}
    </body></html>`;
  return html;
}
async function saveCutReport(){
  const wrap=document.getElementById('cr-wrap');
  const p=(S.products||[]).find(x=>String(x.id)===String(wrap?.dataset.pid));if(!p||!_cr)return;
  if(_cr.markers.some(m=>_cr.rolls.some(o=>_crLayN(o,m.id))&&(!(+m.len>0)||!(m.sz||[]).length))){alert('לכל מדרגה עם פרסות צריך אורך ומידות · لكل درجة طول ومقاسات');return;}
  const c=_crCalc(_cr);
  if(_cr.rolls.some((o,i)=>c.rolls[i].tot&&!o.color)){alert('לכל גליל עם פרסות צריך צבע · لكل رول لون');return;}
  if(!S.fbConnected){alert('אין חיבור — לא נשמר · لا يوجد اتصال');return;}
  // 🛡 שמירה מעותק ישן (חלון שנפתח לפני שמישהו אחר שמר / מכשיר אחר) דורסת גלילים — כך נמחקו גלילים 3-4 ב-14775 (28/10/2026)
  let srv=null;try{srv=(await fbGet('products',String(p.id)))?.cutReport||null;}catch(e){}
  if(srv&&(+srv.at||0)!==_cr.baseAt){
    const t=new Date(+srv.at).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    if(!confirm('⚠ הדוח נשמר בינתיים ('+t+(srv.byName?' — '+srv.byName:'')+', '+((srv.rolls||[]).length)+' גלילים).\nשמירה עכשיו תדרוס אותו עם '+_cr.rolls.length+' גלילים מהחלון הזה.\n\nלדרוס בכל זאת? (ביטול = לסגור ולפתוח מחדש)\nتم حفظ التقرير من قبل — الحفظ سيمحو التغييرات'))return;
  }
  const markers=_cr.markers.filter(m=>+m.len>0||(m.sz||[]).length).map(m=>({id:m.id,len:+m.len||0,sz:(m.sz||[]).map(z=>({s:String(z.s),n:+z.n}))}));
  const ids=new Set(markers.map(m=>m.id));
  const rolls=_cr.rolls.filter(o=>(o.lay||[]).length||o.m!==''||o.no||o.batch||+o.bad||o.fin).map(o=>({id:o.id,color:o.color||'',no:String(o.no||''),batch:String(o.batch||''),m:o.m===''?'':+o.m,kg:o.kg===''?'':+o.kg,bad:o.bad===''||o.bad==null?'':+o.bad,fin:!!o.fin,lay:(o.lay||[]).filter(x=>ids.has(x.k)).map(x=>({k:x.k,n:+x.n}))}));
  // כמויות: צבע שנגזר — לפי הדוח (מידה שלא נגזרה = 0); צבע שלא נגזר — כמו שהיה; מידה+צבע חדשים — נוספים
  const cut=new Set(Object.keys(c.units).map(k=>k.split('|')[1]));
  const quantities=(p.quantities||[]).map(q=>{const s=String(q.size||''),col=String(q.color||'');
    return{size:s,color:col,qty:cut.has(col)?(c.units[s+'|'+col]||0):(parseInt(q.qty)||0)};});
  Object.entries(c.units).forEach(([k,n])=>{const[s,col]=k.split('|');if(!quantities.some(q=>q.size===s&&q.color===col))quantities.push({size:s,color:col,qty:n});});
  const before=_prodQty(p);
  const strips=(_cr.strips||[]).filter(t=>+t.w>0).map(t=>({id:t.id,name:String(t.name||''),w:+t.w,per:Math.max(1,+t.per||1)}));
  const need=_cr.need.filter(x=>+x.n>0).map(x=>({c:x.c,s:x.s,n:+x.n}));
  const extra=Object.entries(_cr.extra||{}).filter(([,m])=>+m>0).map(([c,m])=>({c,m:+m}));
  const upd={cutReport:{markers,rolls,strips,need,extra,by:S.user?.id||'',byName:S.user?.name||'',at:Date.now()},quantities};
  // 📦 העותק לדף הלקוח — לפני שמירת המוצר; נכשל ⇒ בלי pAt, והמנהל יפרסם ברקע
  if(rolls.length&&await _crPublish({...p,...upd},_cr))upd.cutReport.pAt=upd.cutReport.at;
  if(!await fbUpdateOnly('products',p.id,upd)){alert('השמירה נכשלה — בדוק חיבור · فشل الحفظ');return;}
  Object.assign(p,upd);saveLS();
  wrap.remove();_cr=null;
  const after=_prodQty(p),used=c.rolls.reduce((a,x)=>a+x.used,0),cutN=Object.values(c.units).reduce((a,b)=>a+b,0);
  showToast('✅ דוח גזירה נשמר · '+after+" יח'",'var(--green-txt)',4000);
  try{renderProducts();}catch(e){}
  sendTelegram('✂️ דוח גזירה — '+(S.user?.name||'')+'\n🏷 '+p.cust+'/'+p.prod+((parseInt(p.orderNo,10)||0)?' #'+String(p.orderNo).padStart(3,'0'):'')+' '+(p.name||'')
    +'\n🧵 '+rolls.length+' גלילים · '+_crM(used)+" מ' נוצלו"+(cutN?' · '+cutN+" יח' · "+_crM(used/cutN)+" מ' ליח'":'')
    +'\n📦 כמות: '+before+' ← '+after+" יח'").catch(()=>{});
}
// ─── 🧵 מפת פריסה לפסים (04/11/2026) ──────────────────────────────────────────
// קובץ MRK של Optitex: בתחילתו XML קריא — אורך/רוחב הציור, ולכל חלק: מידה, מידות המלבן שלו, מרכז, זווית והיפוך.
// קווי המתאר נמצאים בחלק הבינארי (פורמט סגור) — לכן החלקים מצוירים כמלבנים. ציר X = אורך הציור; פס לרוחב הבד = קו ב-X קבוע.
// התאמה: חלקים מאותה קבוצה (ברירת מחדל קדמי+גב, שרוולים) באותה מידה חייבים להתחיל באותו מקום של הפס —
// ההפרש בין "תחילת החלק" (הקצה שהיה בצד אחד לפני סיבוב 180°) מודולו חזרת הפס ≤ סובלנות. בלי חזרת פס — ההפרש עצמו.
// products.mrkMap = {name,date,len,wid,rep,off,tol,grp,plt,pcs:[{s,n,x,X,y,Y,a,f,o}],by,at} (o = צורה מקובץ הפלוטר) — אובייקטים (Firestore לא שומר מערך בתוך מערך)
let _mm=null;
function _mrkParse(buf){
  const u=new Uint8Array(buf);let t='';for(let i=0;i<u.length&&i<600000;i++)t+=String.fromCharCode(u[i]);
  const a=t.indexOf('<MARKER>'),b=t.indexOf('</MARKER>');
  if(a<0||b<0)throw new Error('זה לא קובץ MRK של Optitex · ليس ملف MRK');
  const x=new DOMParser().parseFromString(t.slice(a,b+9),'text/xml');
  if(x.querySelector('parsererror'))throw new Error('הקובץ פגום · الملف تالف');
  // שמות בעברית שמורים בקידוד Windows-1255 (à..ú) ⇒ א..ת
  const heb=v=>String(v||'').replace(/[à-ú]/g,c=>String.fromCharCode(0x5d0+c.charCodeAt(0)-0xe0)).trim();
  const kid=(el,n)=>{for(const c of el.children)if(c.tagName===n)return c;return null;};
  const txt=(el,n)=>kid(el,n)?.textContent||'';
  const root=x.documentElement,k=/inch/i.test(kid(root,'UNITS')?.getAttribute('LINEAR')||'')?2.54:1,r2=v=>Math.round(v*k*100)/100,pcs=[];
  root.querySelectorAll('SIZE').forEach(sz=>{const sn=heb(txt(sz,'NAME'));
    sz.querySelectorAll('PIECE').forEach(pc=>{const n=heb(txt(pc,'NAME')),g=kid(pc,'GEOM_INFO');if(!g)return;
      const w=+g.getAttribute('SIZE_X')||0,h=+g.getAttribute('SIZE_Y')||0;
      pc.querySelectorAll('PLACED > POSITION').forEach(ps=>{const cx=+ps.getAttribute('X-CENTER'),cy=+ps.getAttribute('Y-CENTER');
        const q=((Math.round((+ps.getAttribute('ANGLE')||0)/90)%4)+4)%4,ww=q%2?h:w,hh=q%2?w:h,fl=ps.getAttribute('FLIP')||'no';
        pcs.push({s:sn,n,x:r2(cx-ww/2),X:r2(cx+ww/2),y:r2(cy-hh/2),Y:r2(cy+hh/2),a:q*90,f:fl==='no'?'':fl});});});});
  const len=r2(+txt(root,'LENGTH')||0),wid=r2(+txt(root,'WIDTH')||0);
  if(!len||!pcs.length)throw new Error('לא נמצאו חלקים בקובץ · لا توجد قطع');
  return{name:heb(txt(root,'NAME')),date:txt(root,'DATE'),len,wid,pcs};
}
// 🔒 מסמכי מוצר פתוחים לכתיבה לכל מחובר — שדות שמוצגים בלי esc (מספרים, נקודות הצורה) מנוקים כאן,
// כדי שערך שנכתב ישירות ל-Firestore לא ירוץ כקוד אצל המנהל (05/11/2026)
const _mmN=v=>{v=+v;return isFinite(v)?v:0;};
function _mmClean(m){
  if(!m||typeof m!=='object')return null;
  const r={...m};['len','wid','rep','off'].forEach(k=>r[k]=_mmN(m[k]));if(m.tol!=null)r.tol=_mmN(m.tol);
  r.plt=m.plt?1:0;r.pcs=(Array.isArray(m.pcs)?m.pcs:[]).map(q=>{const c={s:typeof q?.s==='number'?q.s:String(q?.s??''),n:String(q?.n??''),f:String(q?.f||'').replace(/[^a-z_]/gi,'')};
    ['x','X','y','Y','a'].forEach(k=>c[k]=_mmN(q?.[k]));if(q?.o)c.o=String(q.o).replace(/[^0-9.,| -]/g,'');return c;});
  return r;
}
function openMrkMap(pid){
  const p=(S.products||[]).find(x=>String(x.id)===String(pid));if(!p)return;
  const m=_mmClean(p.mrkMap);
  _mm={pid:p.id,map:m,rep:m?.rep||'',off:m?.off||'',tol:m?.tol??0.3,grp:m?.grp||'FR+BK, SL',dirty:false};
  document.getElementById('mm-wrap')?.remove();
  const w=document.createElement('div');w.id='mm-wrap';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:12px;overflow-y:auto';
  document.body.appendChild(w);renderMrkMap();
}
function mmLoad(inp){const f=inp.files?.[0];inp.value='';if(!f)return;
  f.arrayBuffer().then(b=>{try{const r=_mrkParse(b);_mm.map=r;_mm.dirty=true;renderMrkMap();showToast('✅ '+r.pcs.length+' חלקים נקראו');}catch(e){alert('⚠ '+e.message);}});}
function mmSet(k,v){_mm[k]=v;_mm.dirty=!!_mm.map;renderMrkMap();}
// 📐 קובץ פלוטר HP-GL (HPG/PLT) של אותו ציור — הצורות האמיתיות. 40 יח' = 1 מ"מ (אחרת — קנה מידה לפי אורך הציור).
// עט החיתוך = העט עם הכי הרבה קווים ארוכים (שאר העטים = טקסט). כל קו משויך לחלק הקטן ביותר שהמלבן שלו מכיל את מרכז הקו.
// נשמר בחלק: o = "x,y x,y|..." יחסית לפינת המלבן, 0.01 ס"מ, אחרי פישוט (Douglas-Peucker 0.05 ס"מ)
function _hpglParse(t){
  let pen=0,cur=null;const out=[],flush=()=>{if(cur&&cur.p.length>1)out.push(cur);cur=null;};
  t.split(/[;\r\n]+/).forEach(c=>{c=c.trim();if(!c)return;const op=c.slice(0,2).toUpperCase(),v=c.slice(2).split(/[ ,]+/).filter(Boolean).map(Number);
    if(op==='SP'){flush();pen=v[0]||0;}
    else if(op==='PU'){flush();if(v.length>=2)cur={pen,p:[[v[v.length-2],v[v.length-1]]]};}
    else if(op==='PD'){if(!cur)cur={pen,p:[]};for(let i=0;i+1<v.length;i+=2)cur.p.push([v[i],v[i+1]]);}});
  flush();return out;
}
function _dp(p,e){
  if(p.length<3)return p;const a=p[0],b=p[p.length-1],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);let mi=0,md=0;
  for(let i=1;i<p.length-1;i++){const d=L<1e-9?Math.hypot(p[i][0]-a[0],p[i][1]-a[1]):Math.abs(dy*p[i][0]-dx*p[i][1]+b[0]*a[1]-b[1]*a[0])/L;if(d>md){md=d;mi=i;}}
  return md>e?_dp(p.slice(0,mi+1),e).slice(0,-1).concat(_dp(p.slice(mi),e)):[a,b];
}
const _bb=pts=>{let a=1e12,b=-1e12,c=1e12,d=-1e12;pts.forEach(([x,y])=>{if(x<a)a=x;if(x>b)b=x;if(y<c)c=y;if(y>d)d=y;});return[a,b,c,d];};
function _mmAttachPlt(m,t){
  const ls=_hpglParse(t);if(!ls.length)throw new Error('לא נמצאו קווים בקובץ · لا توجد خطوط');
  const big={};ls.forEach(q=>{const b=_bb(q.p);if(b[1]-b[0]>8000||b[3]-b[2]>8000)big[q.pen]=(big[q.pen]||0)+1;});
  const cut=+(Object.entries(big).sort((a,b)=>b[1]-a[1])[0]||[])[0];
  let mx=0;ls.forEach(q=>{if(q.pen===cut)q.p.forEach(p=>{if(p[0]>mx)mx=p[0];});});
  const k=Math.abs(mx/400-m.len)<3?400:mx/m.len,acc=m.pcs.map(()=>[]);
  ls.filter(q=>q.pen===cut).forEach(q=>{const pts=q.p.map(p=>[p[0]/k,p[1]/k]),b=_bb(pts),cx=(b[0]+b[1])/2,cy=(b[2]+b[3])/2;
    let bi=-1,ba=1e12;m.pcs.forEach((p,i)=>{if(cx>=p.x-0.5&&cx<=p.X+0.5&&cy>=p.y-0.5&&cy<=p.Y+0.5){const a=(p.X-p.x)*(p.Y-p.y);if(a<ba){ba=a;bi=i;}}});
    if(bi>=0)acc[bi].push(_dp(pts,0.05));});
  const n=acc.filter(a=>a.length).length;
  if(n<m.pcs.length/2)throw new Error('הקווים לא מתאימים לחלקים ('+n+'/'+m.pcs.length+') — האם זה אותו ציור? · الملف لا يطابق الرسم');
  const r1=v=>Math.round(v*100)/100;
  m.pcs.forEach((p,i)=>{if(acc[i].length)p.o=acc[i].map(l=>l.map(([x,y])=>r1(x-p.x)+','+r1(y-p.y)).join(' ')).join('|');else delete p.o;});
  m.plt=1;return n;
}
const _mmOl=p=>String(p.o||'').split('|').filter(Boolean).map(l=>l.split(' ').map(v=>{const[a,b]=v.split(',');return[p.x+(+a),p.y+(+b)];}));
// קו המכפלת/החפת: הקצה (שמאל/ימין) שבו הקו הישר האנכי הארוך יותר — בכתף/בראש השרוול הקצה מעוגל וקצר
// ✂ קו התפר הצדדי (04/11/2026 — הערת המשתמש: הבדיקה לפי קצה החלק תפסה את מרכז המכפלת המעוגלת/ראש הכתף,
// והגב לפעמים ארוך יותר בכתף בכוונה). הפסים צריכים להיפגש בתפר הצד — לכן משווים שתי נקודות עליו:
// פינת המכפלת (איפה שהתפר מתחיל) ובית השחי (איפה שהוא נגמר ומתחיל קו הבית-יד). קצה המכפלת = הקצה שאין בו
// שקע באמצע (הצוואר/ראש השרוול). לכל אחד משני הצדדים: הקצה החיצוני לפי מרחק מהמכפלת, קו ישר מותאם על
// 1..35% מהאורך; פינה = הנקודה הראשונה על הקו (0.3 ס"מ), בית שחי = הראשונה אחרי 30% שנכנסת פנימה 0.5 ס"מ.
// חלקים זהים (אותו שם, למשל שני שרוולים) — רק הפינה: בית השחי שלהם נגזר מאותו אורך, ובשרוול ראש השרוול נפתח בהדרגה
// ולכן הזיהוי שלו לא יציב (1.7 ס"מ הפרש בין שרוולים זהים של 14775).
const _mmFC=new Map();
function _mmFeat(p){
  const key=p.x+'|'+p.y+'|'+(p.o||'');if(_mmFC.has(key))return _mmFC.get(key);
  let r=null;const ol=_mmOl(p),pts=[];
  ol.forEach(l=>{for(let i=0;i<l.length-1;i++){const a=l[i],b=l[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/0.1));for(let k=0;k<n;k++)pts.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);}pts.push(l[l.length-1]);});
  if(pts.length>20){
    const[mnx,mxx,mny,mxy]=_bb(pts),H=mxy-mny,L=mxx-mnx,mid=pts.filter(q=>q[1]>mny+H*.4&&q[1]<mny+H*.6);
    if(mid.length&&L>5){
      const dLo=Math.min(...mid.map(q=>q[0]))-mnx,dHi=mxx-Math.max(...mid.map(q=>q[0])),lo=dLo<=dHi,hem=lo?mnx:mxx,dir=lo?1:-1;
      const B=0.2,N=Math.ceil(L/B)+2,ylo=new Array(N).fill(Infinity),yhi=new Array(N).fill(-Infinity);
      pts.forEach(([x,y])=>{const i=Math.round((x-hem)*dir/B);if(i<0||i>=N)return;if(y<ylo[i])ylo[i]=y;if(y>yhi[i])yhi[i]=y;});
      const side=(arr,sg)=>{const P=[];arr.forEach((y,i)=>{if(isFinite(y))P.push([i*B,y]);});const F=P.filter(q=>q[0]>1&&q[0]<L*.35);if(F.length<5)return null;
        const n=F.length,sx=F.reduce((a,q)=>a+q[0],0),sy=F.reduce((a,q)=>a+q[1],0),sxx=F.reduce((a,q)=>a+q[0]*q[0],0),sxy=F.reduce((a,q)=>a+q[0]*q[1],0);
        const m=(n*sxy-sx*sy)/((n*sxx-sx*sx)||1),b=(sy-m*sx)/n,fy=d=>m*d+b;
        const hc=P.find(q=>Math.abs(q[1]-fy(q[0]))<0.3),ua=P.find(q=>q[0]>L*.3&&(q[1]-fy(q[0]))*sg>0.5);return hc&&ua?[hc[0],ua[0]]:null;};
      const S=[side(ylo,1),side(yhi,-1)].filter(Boolean);
      if(S.length){const av=k=>S.reduce((t,v)=>t+v[k],0)/S.length;r={hc:hem+dir*av(0),ua:hem+dir*av(1)};}
    }
  }
  _mmFC.set(key,r);return r;
}
function _mmHem(p){
  const pts=_mmOl(p).flat();if(pts.length<4)return null;const[mn,mx]=_bb(pts);
  const sp=v=>{let a=1e9,b=-1e9;pts.forEach(q=>{if(Math.abs(q[0]-v)<0.6){if(q[1]<a)a=q[1];if(q[1]>b)b=q[1];}});return b>a?b-a:0;};
  return sp(mn)>=sp(mx)?mn:mx;
}
function mmLoadPlt(inp){const f=inp.files?.[0];inp.value='';if(!f||!_mm)return;
  if(!_mm.map){alert('טען קודם את קובץ ה-MRK · حمّل ملف MRK أولاً');return;}
  f.text().then(t=>{try{const n=_mmAttachPlt(_mm.map,t);_mm.dirty=true;renderMrkMap();showToast('✅ צורות נטענו ל-'+n+' חלקים');}catch(e){alert('⚠ '+e.message);}});}
const _MM_COL=['#e5484d','#3e8ef7','#30a46c','#f5a524','#8e4ec6','#12a594','#d6409f','#7c6f5a'];
// הקצה שהיה בצד ההתחלה של החלק לפני הסיבוב — סיבוב 180° או היפוך ימין/שמאל מעבירים אותו לצד השני
const _mmStart=q=>(q.a===180)!==/left|right|hor/i.test(q.f||'')?q.X:q.x;
function _mmChecks(){
  const m=_mm.map;if(!m)return[];const rp=+_mm.rep||0,tol=+_mm.tol||0;
  const grps=String(_mm.grp||'').split(',').map(g=>g.split('+').map(t=>t.trim().toUpperCase()).filter(Boolean)).filter(g=>g.length);
  const out=[];
  [...new Set(m.pcs.map(q=>q.s))].forEach(s=>grps.forEach(g=>{
    const it=m.pcs.filter(q=>q.s===s&&g.includes(String(q.n).toUpperCase()));if(it.length<2)return;
    const ft=it.map(_mmFeat),sd=ft.every(Boolean),one=new Set(it.map(q=>String(q.n).toUpperCase())).size===1,dv=d=>{const ph=rp>0?((d%rp)+rp)%rp:Math.abs(d);return rp>0?Math.min(ph,rp-ph):ph;};
    const st=q=>_mmHem(q)??_mmStart(q),rot=!sd&&it.some(q=>q.a%180&&!q.o),r0=sd?ft[0].hc:st(it[0]);let mx=0,mh=0,mu=0;
    const rows=it.map((q,i)=>{const d=(sd?ft[i].hc:st(q))-r0,du=sd?ft[i].ua-ft[0].ua:0,eh=dv(d),eu=sd&&!one?dv(du):0;mh=Math.max(mh,eh);mu=Math.max(mu,eu);mx=Math.max(mx,eh,eu);return{q,d,du,dev:Math.max(eh,eu)};});
    out.push({s,g:g.join('+'),rows,sd,one,dh:mh,du:mu,x0:Math.min(...it.map(q=>q.x)),x1:Math.max(...it.map(q=>q.X)),dev:mx,rot,bad:rot||(rp>0&&mx>tol+1e-9)});}));
  return out.sort((a,b)=>a.x0-b.x0);
}
// prn=true — בלי min-width (לחלון ההדפסה)
function _mmSvg(p,ck,prn){
  const m=_mm.map,L=m.len,W=m.wid,rp=+_mm.rep||0,off=+_mm.off||0,sizes=[...new Set(m.pcs.map(q=>q.s))];
  const bad=new Set(),inG=new Set();ck.forEach(c=>c.rows.forEach(r=>{inG.add(r.q);if(c.bad)bad.add(r.q);}));
  let g='';
  if(rp>=0.3&&L/rp<=4000)for(let x=((off%rp)+rp)%rp;x<=L;x+=rp)g+='<line x1="'+x+'" y1="0" x2="'+x+'" y2="'+W+'" stroke="#9fb7bd" stroke-width="0.15"/>';
  for(let x=0;x<=L;x+=50)g+='<line x1="'+x+'" y1="'+W+'" x2="'+x+'" y2="'+(W+(x%100?3:5))+'" stroke="#555" stroke-width="0.3"/>'+(x%100?'':'<text x="'+x+'" y="'+(W+11)+'" font-size="6" text-anchor="middle" fill="#555">'+(x/100)+'m</text>');
  m.pcs.forEach(q=>{const c=_MM_COL[sizes.indexOf(q.s)%_MM_COL.length],b=bad.has(q),w=q.X-q.x,h=q.Y-q.y,fs=Math.max(2.5,Math.min(7,w/4,h/3)),ol=_mmOl(q),st=ol.length?_mmHem(q):_mmStart(q);
    const P=l=>l.map(v=>v[0]+','+v[1]).join(' '),main=ol.reduce((a,l)=>l.length>a.length?l:a,[]);
    g+=(ol.length?'<polygon points="'+P(main)+'" fill="'+c+'" fill-opacity=".35" stroke="none"/>'+ol.map(l=>'<polyline points="'+P(l)+'" fill="none" stroke="'+(b?'#d00':'#333')+'" stroke-width="'+(b?0.8:0.3)+'"/>').join('')
      :'<rect x="'+q.x+'" y="'+q.y+'" width="'+w+'" height="'+h+'" fill="'+c+'" fill-opacity=".35" stroke="'+(b?'#d00':c)+'" stroke-width="'+(b?1.2:0.4)+'"/>')
      +(inG.has(q)?(()=>{const ft=ol.length&&_mmFeat(q),ln=(x,da)=>'<line x1="'+x+'" y1="'+q.y+'" x2="'+x+'" y2="'+q.Y+'" stroke="'+(b?'#d00':'#222')+'" stroke-width="0.7"'+(da?' stroke-dasharray="1.5 1"':'')+'/>';
        return ft?ln(ft.hc)+ln(ft.ua,1):ln(st);})():'')
      +'<text x="'+(q.x+w/2)+'" y="'+(q.y+h/2+fs/3)+'" font-size="'+fs+'" text-anchor="middle" fill="#222">'+esc(q.n)+' '+esc(szLbl(q.s,p))+'</text>';});
  return '<svg viewBox="-2 -2 '+(L+4)+' '+(W+16)+'" xmlns="http://www.w3.org/2000/svg" style="'+(prn?'width:100%;':'width:'+100*(_mm.z||1)+'%;min-width:'+Math.round(L*1.4*(_mm.z||1))+'px;')+'height:auto;display:block;background:#fff">'
    +'<rect x="0" y="0" width="'+L+'" height="'+W+'" fill="#fafafa" stroke="#333" stroke-width="0.5"/>'+g+'</svg>';
}
const _mmCm=v=>(Math.round(v*10)/10).toFixed(1);
function _mmTable(p,ck){
  const rp=+_mm.rep||0;if(!ck.length)return '<div style="font-size:12px;color:#888">אין חלקים שמתאימים לקבוצות ההתאמה</div>';
  const td='border:1px solid #ccc;padding:4px 6px;color:#222'; // צבע קבוע — הרקע לבן גם במצב כהה
  return '<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:6px;color:#222"><tr style="background:#eef3f4">'
    +['איפה בציור · المكان','מידה · المقاس','חלקים · القطع',rp?'סטייה מהפס · الانحراف':'הפרש · الفرق',''].map(h=>'<th style="'+td+';text-align:right">'+h+'</th>').join('')+'</tr>'
    +ck.map(c=>'<tr style="background:'+(c.bad?'#fdecec':'#fff')+'"><td style="'+td+'" dir="ltr">'+_crM(c.x0/100)+'–'+_crM(c.x1/100)+' m</td>'
      +'<td style="'+td+';font-weight:700">'+esc(szLbl(c.s,p))+'</td>'
      +'<td style="'+td+'" dir="ltr">'+c.rows.map(r=>esc(r.q.n)+(r.d?' <span style="color:#888">('+(r.d>0?'+':'')+_mmCm(r.d)+')</span>':'')).join(' · ')+'</td>'
      +'<td style="'+td+'">'+(c.sd?(c.one?'חפת/מכפלת '+_mmCm(c.dh):'מכפלת '+_mmCm(c.dh)+' · בית שחי '+_mmCm(c.du)):_mmCm(c.dev))+' ס"מ</td>'
      +'<td style="'+td+';font-weight:700;color:'+(c.bad?'#c00':'#0a7a4a')+'">'+(c.rot?'⚠ מסובב 90° — לבדוק ביד':!rp?'<span style="color:#888;font-weight:400">הזן חזרת פס</span>':c.bad?'⚠ לא על אותו פס':'✓')+'</td></tr>').join('')+'</table>';
}
function renderMrkMap(){
  const w=document.getElementById('mm-wrap');if(!w||!_mm)return;
  const p=(S.products||[]).find(x=>String(x.id)===String(_mm.pid));if(!p){w.remove();return;}
  const m=_mm.map,inp='font-size:14px;padding:6px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const lbl='font-size:11px;color:var(--txt3);display:flex;flex-direction:column;gap:2px';
  const ck=_mmChecks(),nb=ck.filter(c=>c.bad).length,sizes=m?[...new Set(m.pcs.map(q=>q.s))]:[];
  const ob=document.getElementById('mm-box'),sc=ob?[ob.scrollLeft,ob.scrollTop]:null;
  w.innerHTML='<div style="background:var(--card);border-radius:14px;padding:16px;max-width:1100px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">'
    +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">'
    +'<div style="font-size:16px;font-weight:800;flex:1;min-width:180px">🧵 מפת פריסה · خريطة الفرش · '+esc(p.cust)+'/'+esc(p.prod)+'</div>'
    +'<label class="btn" style="font-size:12px;cursor:pointer">📂 '+(m?'קובץ אחר':'טען קובץ MRK')+'<input type="file" accept=".mrk,.MRK" style="display:none" onchange="mmLoad(this)"></label>'
    +(m?'<label class="btn" style="font-size:12px;cursor:pointer">📐 '+(m.plt?'קובץ פלוטר אחר':'קובץ פלוטר (HPG/PLT)')+'<input type="file" accept=".hpg,.plt,.hpgl,.HPG,.PLT" style="display:none" onchange="mmLoadPlt(this)"></label>':'')
    +(m&&_mm.dirty?'<button class="btn primary" style="font-size:12px" onclick="mmSave()">💾 שמור · حفظ</button>':'')
    +(m?'<button class="btn" style="font-size:12px" onclick="mmPrint()">🖨 הדפס</button>':'')
    +'<button class="btn" style="font-size:12px;padding:4px 10px" onclick="mmClose()">✕</button></div>'
    +(!m?'<div style="padding:24px;text-align:center;color:var(--txt3);font-size:14px">טען את קובץ הציור (MRK של Optitex) — יוצגו כל החלקים לפי מידה, ובדיקה שהקדמי והגב (והשרוולים) נופלים על אותו פס.<br>حمّل ملف الرسم (MRK) لعرض القطع وفحص تطابق الخطوط.</div>'
    :'<div style="font-size:12px;color:var(--txt3);margin-bottom:8px">'+esc(m.name||'')+(m.date?' · '+esc(m.date):'')+' · אורך <b style="color:var(--txt)">'+_crM(m.len/100)+' מ\'</b> · רוחב <b style="color:var(--txt)">'+m.wid+' ס"מ</b> · '+m.pcs.length+' חלקים'+(m.plt?' · 📐 צורות מקובץ הפלוטר':'')
      +(p.mrkMap?.at&&!_mm.dirty?' · נשמר '+new Date(p.mrkMap.at).toLocaleDateString('he-IL')+(p.mrkMap.by?' — '+esc(p.mrkMap.by):''):'')+'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:flex-end">'
      +'<label style="'+lbl+'">חזרת הפס (ס"מ) · تكرار الخط<input type="number" step="0.1" min="0" inputmode="decimal" value="'+esc(String(_mm.rep))+'" placeholder="למשל 2.5" onchange="mmSet(\'rep\',this.value)" style="'+inp+';width:110px"></label>'
      +'<label style="'+lbl+'">סובלנות (ס"מ) · السماح<input type="number" step="0.1" min="0" inputmode="decimal" value="'+esc(String(_mm.tol))+'" onchange="mmSet(\'tol\',this.value)" style="'+inp+';width:80px"></label>'
      +'<label style="'+lbl+'">הזזת קווי הפס (ס"מ)<input type="number" step="0.1" inputmode="decimal" value="'+esc(String(_mm.off))+'" onchange="mmSet(\'off\',this.value)" style="'+inp+';width:90px"></label>'
      +'<label style="'+lbl+';flex:1;min-width:160px">קבוצות התאמה · مجموعات (FR+BK, SL)<input value="'+esc(_mm.grp)+'" onchange="mmSet(\'grp\',this.value)" dir="ltr" style="'+inp+'"></label></div>'
    +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><button class="btn" style="font-size:14px;padding:2px 10px" onclick="mmZoom(1.4)">＋</button><button class="btn" style="font-size:14px;padding:2px 10px" onclick="mmZoom(1/1.4)">－</button><button class="btn" style="font-size:12px;padding:3px 8px" onclick="mmZoom(0)">מלא</button>'
      +'<span style="font-size:11px;color:var(--txt3)">גלגלת העכבר = זום · גרירה = הזזה · عجلة الفأرة = تكبير</span></div>'
    +'<div id="mm-box" dir="ltr" style="overflow:auto;max-height:70vh;border:1px solid var(--brd);border-radius:8px;cursor:grab;touch-action:pan-x pan-y">'+_mmSvg(p,ck)+'</div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;margin:6px 0">'+sizes.map((s,i)=>'<span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;background:'+_MM_COL[i%_MM_COL.length]+'"></span> מידה '+esc(szLbl(s,p))+'</span>').join('')
      +'<span style="color:var(--txt3)">· '+(m.plt?'קו שחור = פינת המכפלת בתפר הצד · מקווקו = בית השחי':'קו שחור = תחילת החלק לבדיקה')+' · אדום = לא מתאים</span></div>'
    +'<div style="font-size:14px;font-weight:700;margin-top:8px">'+(!+_mm.rep?'הזן את חזרת הפס כדי לבדוק התאמה · أدخل تكرار الخط':nb?'⚠ '+nb+' בדיקות לא מתאימות':'✓ כל החלקים בקבוצות על אותו פס')
      +(+_mm.rep?'':' <span style="font-size:12px;font-weight:400;color:var(--txt3)">— בינתיים מוצג ההפרש בין החלקים</span>')+'</div>'
    +_mmTable(p,ck)
    +'<div style="font-size:11px;color:var(--txt3);margin-top:8px">'+(m.plt?'הצורות מקובץ הפלוטר. ההשוואה בתפר הצד: פינת המכפלת ובית השחי של כל חלק (לא ראש הכתף — הגב יכול להיות ארוך יותר שם בכוונה).':'החלקים מצוירים כמלבן — טען את קובץ הפלוטר (HPG/PLT) של אותו ציור לצורות המדויקות. ההשוואה לפי קצה המלבן.')+'</div>')
    +'</div>';
  const box=document.getElementById('mm-box');if(!box)return;
  if(sc){box.scrollLeft=sc[0];box.scrollTop=sc[1];}
  box.addEventListener('wheel',e=>{e.preventDefault();mmZoom(e.deltaY<0?1.25:1/1.25,e);},{passive:false});
  // גרירה בעכבר = הזזה (במגע — הגלילה הרגילה של הדפדפן)
  box.addEventListener('mousedown',e=>{if(e.button)return;const x0=e.clientX,y0=e.clientY,l0=box.scrollLeft,t0=box.scrollTop;box.style.cursor='grabbing';
    const mv=ev=>{box.scrollLeft=l0-(ev.clientX-x0);box.scrollTop=t0-(ev.clientY-y0);};
    const up=()=>{box.style.cursor='grab';removeEventListener('mousemove',mv);removeEventListener('mouseup',up);};
    addEventListener('mousemove',mv);addEventListener('mouseup',up);e.preventDefault();});
}
// 🔍 זום סביב נקודת העכבר (בלי ev — סביב המרכז; f=0 — חזרה לגודל מלא). משנה רק את רוחב ה-SVG, בלי לצייר מחדש
function mmZoom(f,ev){
  const box=document.getElementById('mm-box'),sv=box?.querySelector('svg');if(!sv||!_mm?.map)return;
  const z=f?Math.min(12,Math.max(1,(_mm.z||1)*f)):1;if(z===(_mm.z||1)&&f)return;
  const r=box.getBoundingClientRect(),px=ev?ev.clientX-r.left:box.clientWidth/2,py=ev?ev.clientY-r.top:box.clientHeight/2;
  const fx=(box.scrollLeft+px)/sv.clientWidth,fy=(box.scrollTop+py)/sv.clientHeight;
  _mm.z=z;sv.style.width=100*z+'%';sv.style.minWidth=Math.round(_mm.map.len*1.4*z)+'px';
  box.scrollLeft=fx*sv.clientWidth-px;box.scrollTop=fy*sv.clientHeight-py;
}
async function mmSave(){
  const p=(S.products||[]).find(x=>String(x.id)===String(_mm?.pid));if(!p||!_mm.map)return;
  if(!S.fbConnected){alert('אין חיבור — לא נשמר · لا يوجد اتصال');return;}
  const mrkMap={..._mm.map,rep:+_mm.rep||0,off:+_mm.off||0,tol:+_mm.tol||0,grp:String(_mm.grp||''),by:S.user?.name||'',at:Date.now()};
  if(!await fbUpdateOnly('products',p.id,{mrkMap})){alert('השמירה נכשלה — בדוק חיבור · فشل الحفظ');return;}
  p.mrkMap=mrkMap;saveLS();_mm.dirty=false;showToast('✅ מפת הפריסה נשמרה','var(--green-txt)');renderMrkMap();
}
function mmClose(){if(_mm?.dirty&&!confirm('לסגור בלי לשמור? · إغلاق بدون حفظ؟'))return;document.getElementById('mm-wrap')?.remove();_mm=null;}
function mmPrint(){
  const p=(S.products||[]).find(x=>String(x.id)===String(_mm?.pid));if(!p||!_mm.map)return;
  const ck=_mmChecks(),m=_mm.map;
  // דרך iframe — window.open נתקע ב-PWA במסך הבית (אין איך לסגור את דף ההדפסה)
  printViaIframe('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>מפת פריסה '+esc(p.cust+'/'+p.prod)+'</title><style>body{font-family:Arial,sans-serif;margin:8mm}@page{size:A4 landscape}</style></head><body>'
    +'<h3 style="margin:0 0 4px">🧵 מפת פריסה · '+esc(p.cust)+'/'+esc(p.prod)+' '+esc(p.name||'')+'</h3>'
    +'<div style="font-size:12px;margin-bottom:6px">'+esc(m.name||'')+' · אורך '+_crM(m.len/100)+' מ\' · רוחב '+m.wid+' ס"מ'+(+_mm.rep?' · חזרת פס '+_mm.rep+' ס"מ':'')+'</div>'
    +'<div dir="ltr">'+_mmSvg(p,ck,true)+'</div>'+_mmTable(p,ck)+'</body></html>');
}
const bcRetiredMsg=why=>{const T=LANGS[currentLang];return why==='cut'?T.bc_ret_cut:T.bc_ret_ship;};
// שורה אדומה בתצוגה המקדימה של שלושת הסורקים — העובד רואה מיד, לא רק בלחיצה על "התחל"
const bcRetiredHtml=v=>{const w=bcRetiredWhy(v);return w?`<div style="margin-top:6px;padding:8px;border-radius:8px;background:var(--red-bg,#fee2e2);color:var(--red-txt);font-size:13px;font-weight:700">${esc(bcRetiredMsg(w))}</div>`:'';};
// שער לפני פתיחת משימה. raws = כל הברקודים שנפתחים (סל שלם = שאלה אחת למנהל).
// early = בדיקה בזמן ההוספה לסל: עובד נחסם כבר כאן; מנהל נשאל רק פעם אחת — ב-passBatchGates.
async function passRetiredGate(raws,early){
  if(early&&S.user?.role==='manager')return true;
  const bad=[...new Set((raws||[]).filter(Boolean))].map(r=>({r,w:bcRetiredWhy(r)})).filter(x=>x.w);
  if(!bad.length)return true;
  const T=LANGS[currentLang];
  const msg=[...new Set(bad.map(x=>bcRetiredMsg(x.w)))].join('\n')+'\n'+bad.map(x=>x.r).join(', ');
  const info={cust:bad[0].r.slice(0,2),prod:bad[0].r.slice(2,7),bc:bad.map(x=>x.r).join(','),blocked:[{step:'🔒',need:bad.map(x=>x.w==='cut'?'ספירה/גזירה':'יצא בתעודה')}]};
  if(S.user?.role!=='manager'){logGateEvent('retired','blocked',info);showToast(msg,'var(--red-txt)',8000);return false;}
  const ok=await showConfirm('🔒',esc(msg+'\n\n'+(T.bc_ret_ovr||'לפתוח משימה בכל זאת?')),T.st_override_ok||'התחל בכל זאת',T.cancel||'ביטול');
  logGateEvent('retired',ok?'override':'cancel',info);
  return ok;
}
function productHasDefinedQty(cust,prod){
  const p=findProd(cust,prod);
  return p&&p.quantities&&p.quantities.some(q=>parseInt(q.qty)>0);
}
// הרשומה של הזמנה מסוימת לפי מספרה. '' / 0 ⇒ null (ברקוד ישן — אין מה להסיק).
function prodByOrderNo(cust,prod,orderNo){
  const no=parseInt(orderNo,10)||0;
  if(!no)return null;
  return (S.products||[]).find(p=>p&&p.cust===cust&&p.prod===prod&&(parseInt(p.orderNo,10)||0)===no)||null;
}
// 🔑 לאיזו הזמנה שייכת סריקה — **לפי מספר ההזמנה שבברקוד** (16 ספרות), אחרת החדשה ביותר.
// 🔴 עד 15/09/2026 כל סריקה נחתמה ב-prodStampFor = ההזמנה **החדשה ביותר** של הדגם, גם כשהברקוד
// נשא מספר הזמנה אחר. נמדד חי ב-02/04335 (5 הזמנות): 66 משימות של #003 ו-26 של #002 נחתמו על
// #005 ⇒ דוח הכמות הציג את העבודה על #005 ו-#003 נשארה 0/95, ודוח הרווח ייחס אליה את השעות.
// ברקוד 13 ספרות / מספר הזמנה בלי רשומה ⇒ ההתנהגות הקודמת בדיוק.
function bcOrderStamp(raw){
  const s=String(raw||''),c=s.slice(0,2),p=s.slice(2,7);
  const rec=prodByOrderNo(c,p,orderNoOf(s));
  return rec?prodStampOf(rec):prodStampFor(c,p);
}
// החותמת האפקטיבית של משימה: מספר ההזמנה שבברקוד **גובר** על prodStamp השמור — כך גם משימות
// שכבר נחתמו שגוי חוזרות להזמנה הנכונה בלי לגעת בנתונים. אחרת prodStamp השמור (null = משימה
// ותיקה בלי חותמת; כל מתקשר ממשיך להתייחס אליה כמו קודם).
// מספר ההזמנה של משימה לתצוגה: מהברקוד (16), אחרת מהחותמת השמורה. 0 = לא ידוע ⇒ לא מציגים.
// דגם עם כמה הזמנות פתוחות (04335 עם 5) — בלי זה אי אפשר לדעת על איזו הזמנה עובדים עכשיו
function taskOrderNo(t){
  const no=orderNoOf(t?.bc||'');
  if(no)return no;
  if(t?.prodStamp==null)return 0;
  const rec=(S.products||[]).find(p=>p.cust===t.cust&&p.prod===t.prod&&prodStampOf(p)===+t.prodStamp);
  return parseInt(rec?.orderNo,10)||0;
}
const taskOrderLbl=t=>{const n=taskOrderNo(t);return n?'#'+String(n).padStart(3,'0'):'';};
function taskStampOf(t){
  const no=orderNoOf(t?.bc||'');
  if(no){const rec=prodByOrderNo(t.cust,t.prod,no);if(rec)return prodStampOf(rec);}
  return t?t.prodStamp:null;
}
// ⚠️ סך היחידות של ההזמנה. **`orderNo` הוא ארגומנט קריטי, לא נוחות.**
//
// ההזמנה מגיעה למפעל בלי כמות ידועה — או גזרים שצריך לספור, או בדים שצריך לגזור
// ואז לספור. לכן ברקוד הספירה/גזירה נסרק כש-qty=0, והכמות נקראת מהמוצר **בדיעבד**.
// בלי מספר ההזמנה נלקחת תמיד הרשומה **החדשה ביותר** ⇒ ברגע שנפתחת הזמנה חוזרת,
// משימת הספירה של ההזמנה הקודמת מתחילה להציג את הכמות של החדשה.
// נצפה חי 25/08: הקמת 2691C העבירה את משימת הספירה של 2691A מ-180 יח' ל-0.
//
// 🔑 ברקוד בן 13 מחזיר orderNo=0 ⇒ **נופל בדיוק להתנהגות של היום**, בלי שינוי.
// התיקון חל אך ורק על ברקודי 16 ספרות = הזמנות שהוקמו אחרי השינוי.
function getTotalQty(cust,prod,orderNo){
  const byNo=prodByOrderNo(cust,prod,orderNo);
  if(byNo)return (byNo.quantities||[]).reduce((s,q)=>s+(parseInt(q.qty)||0),0);
  const p=findProd(cust,prod);
  if(p&&p.quantities&&p.quantities.length)return p.quantities.reduce((s,q)=>s+(parseInt(q.qty)||0),0);
  if(window._bcLastGen&&window._bcLastGen.cust===cust&&window._bcLastGen.prod===prod)
    return window._bcLastGen.items.reduce((s,it)=>s+(parseInt(it.qty)||0),0);
  return 0;
}
// 📏 כמות משוערת (20/10/2026): עד הספירה/גזירה ההזמנה בלי כמות ⇒ אין צפי לשלבים הראשונים.
// `products.estQty` משמש **רק לצפי זמן** (סריקה, משימות פעילות, זמן לפי מחלקה). המשימה נשמרת עם
// qty=0 כמו היום, ו-taskUnits/דוחות ממשיכים לקחת את הכמות האמיתית בדיעבד — לא לערבב.
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): estQtyOf
function _estQtyBc(raw){
  if(!isTotalBc(raw||''))return 0;
  const c=raw.slice(0,2),pr=raw.slice(2,7);
  return estQtyOf(prodByOrderNo(c,pr,orderNoOf(raw))||findProd(c,pr));
}
// ספירת יחידות בלי כפילויות: אותו ברקוד + אותו שלב + אותו יום = נספר פעם אחת
// (שני עובדים שחולקים ברקוד באותו שלב לא מכפילים את הכמות)
function unitKey(t){
  const d=t.startTime instanceof Date?t.startTime:new Date(t.startTime);
  // splitId: משימה שפוצלה בהעברה חלקית מקבלת מזהה ייחודי כדי ששני חלקי הכמות ייספרו בנפרד
  // (בלי splitId — שני עובדים על אותו ברקוד+שלב עדיין נספרים פעם אחת, כמקודם)
  return taskBc(t)+'|'+(t.taskType||'').trim().toLowerCase()+'|'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+(t.splitId?'|'+t.splitId:'');
}
function sumUnitsDedup(tasks){
  const seen=new Set();let total=0;
  tasks.forEach(t=>{const k=unitKey(t);if(seen.has(k))return;seen.add(k);total+=(t.qty||0);});
  return total;
}
// כמות שהושלמה פר לקוח|מוצר|שלב-עבודה. משותף לדוח "כמות שהושלמה לפי שלב" ולמסך התצוגה.
//
// coverKey = "אילו יחידות כוסו" = ברקוד+שלב (+splitId, כי פיצול כמות מחלק את היחידות בין
// שני עובדים ושני החלקים נספרים בנפרד). ⚠️ **בלי היום** — בכוונה, וזה ההבדל מ-unitKey:
// unitKey כולל את היום כי הוא נועד ל"יחידות שנעשו ביום X" בדוחות. להתקדמות מצטברת זה שגוי —
// משימה שנמשכת כמה ימים (השהיה/חידוש) נשמרת כרשומה נפרדת ליום, וכל אחת נושאת את הכמות
// המלאה של הברקוד ⇒ אותן יחידות נספרות שוב בכל יום.
// נצפה בנתונים: 00243 / تنظيف وفحص — 5 רשומות של אותו ברקוד ב-27-29/06, כולן qty=225,
// היו נספרות 675 מתוך הזמנה של 225.
// ⚠️ `stamp` = חותמת ההזמנה. **בלעדיו המפתח הוא ברמת הדגם** — וזה מכוון: מסך התצוגה
// מציג התקדמות ברמת הדגם (החלטה קיימת) וקורא בלי חותמת, הדוח קורא עם חותמת.
const stepDoneKey=(cust,prod,stepNm,stamp)=>cust+'|'+prod+'|'+String(stepNm||'').trim()+(stamp!=null?'|'+stamp:'');
// 🔗 עבר ל-functions/shared/calc.js (משותף לשרת): coverKey
// ⚠️ הכמות האפקטיבית של משימה. ברקוד "כל הכמות" שנסרק **לפני** שהוזנו הכמויות לפי מידה
// נשמר עם qty=0 — זו ה"כמות הפתוחה" — אבל העבודה בוצעה על ההזמנה כולה. נמדד: 24 משימות,
// 44 שעות עבודה, ובהן **כל 10 רשומות `عد فتح شغل` במפעל** וכל משפחת הפרישה/חיתוך.
//
// זו נקודה משותפת אחת לכל חישוב שנשען על כמות **בדיעבד**, כי כל דוח נשבר אחרת בלעדיה:
//   • "כמות שהושלמה לפי שלב" — הציג 0/N לנצח, כאילו השלב לא בוצע
//   • "מוקצב מול בפועל"      — alloc=0 ⇒ המשימה נזרקה מהדוח בשקט
//   • דוח רווח               — units=0 ⇒ עלות היחידה נלקחה מהתקציב במקום מהמציאות
// הכמות נקראת מהמוצר בזמן ההצגה ולא בזמן הסריקה, כי בזמן הסריקה היא לא הייתה ידועה —
// וזו בדיוק הסיבה שנשמר 0. חיפוש המוצר קורה רק בנתיב הנדיר (isTotal + qty=0), 24 מתוך 4,007.
// כפילות מול סריקת מידה לאותו שלב חסומה כבר בקלט (3e162b6), ולכן אין סיכון לספירה כפולה.
function taskUnits(t){
  const q=+t?.qty||0;
  if(q>0)return q;
  // orderNoOf(t.bc): משימה שנסרקה מברקוד 16 ספרות יודעת לאיזו הזמנה היא שייכת.
  // משימה ישנה (13) מחזירה 0 ⇒ אותה התנהגות כמו קודם.
  return t&&t.isTotal?(getTotalQty(t.cust,t.prod,orderNoOf(t.bc||''))||0):0;
}
// כל משימה נספרת **בדלי של ההזמנה שלה**, לא ברמת הדגם.
//
// 🔴 הגרסה הקודמת עשתה שני דברים שהיו נכונים יחד ושגויים יחד: המפתח היה לקוח|מוצר|שלב
// (בלי ממד הזמנה), ולכן היה חייב סינון ל-prodStamp של ההזמנה **החדשה** — אחרת היסטוריית
// ההזמנה הקודמת הייתה מתנפחת אל תוך הכמות של החדשה. זה עבד כל עוד הדוח הציג כרטיס אחד
// לדגם. מרגע ש-`getTotalQty`→`_prodQty` (25/08) גרם לו להציג **כרטיס נפרד לכל הזמנה**,
// הסינון הפך למסתיר: נמדד 26/08 — **267 משימות שהושלמו נזרקו**, מהן 209 על 02691 שהציגה
// 0/180 למרות 27 שלבים שבוצעו. הפתרון הוא לא להסיר את הסינון אלא **להעביר את התפקיד שלו
// למפתח**: כשלכל הזמנה יש דלי משלה אין למה להתנפח, וכל משימה נמדדת מול היעד של ההזמנה שלה.
//
// משימה בלי `prodStamp` משויכת ל**הזמנה הוותיקה ביותר** של הדגם (החלטת המשתמש 26/08).
// המדידה: כל 141 המשימות חסרות-החותמת בדגמים רב-הזמנתיים קדמו בחודש ויותר להקמת הרשומה
// החדשה — 07155 (13-21/06 מול 21/07) · 09358 (23-28/06 מול 21/07) · 03413 (17-18/06 מול
// 30/07). שיוכן לחדשה היה משמר ניפוח שכבר מוצג: `كوي` הראה 582 יח' על הזמנה של 90.
// ⚠️ **לאיזו הזמנה שייכת המשימה — נקודת אמת אחת.** מוגדר פעם אחת כי גם דוח הכמות
// וגם דוח הרווח נשענים עליו, ושתי נוסחאות נפרדות מתיישנות בשקט אחת מהשנייה
// (זה בדיוק מה שקרה לנוסחאות התמחור בין הלקוח לשרת).
//
// `cache` שייך לקורא ולא גלובלי — במכוון. מפה גלובלית הייתה מתיישנת מול S.products
// בלי שאיש ישים לב, וזו משפחת באגים שכבר נשרפנו בה (_expMap).
function taskOrderStamp(t,cache){
  // מספר ההזמנה שבברקוד גובר על prodStamp השמור — ראה bcOrderStamp
  const no=orderNoOf(t.bc||'');
  if(no){
    const nk=t.cust+'|'+t.prod+'|#'+no;
    let v=cache&&(nk in cache)?cache[nk]:undefined;
    if(v===undefined){const rec=prodByOrderNo(t.cust,t.prod,no);v=rec?prodStampOf(rec):null;if(cache)cache[nk]=v;}
    if(v!=null)return v;
  }
  if(t.prodStamp!=null)return t.prodStamp;
  const k=t.cust+'|'+t.prod;
  if(cache&&(k in cache))return cache[k];
  const v=prodStampOldest(t.cust,t.prod);
  if(cache)cache[k]=v;
  return v;
}
function stepDoneMap(tasks){
  const seen=new Set(),map={},oldCache={};
  for(const t of tasks){
    if(!(t.duration>0))continue;
    const ps=taskOrderStamp(t,oldCache);
    const k=coverKey(t);if(seen.has(k))continue;seen.add(k);
    const mk=stepDoneKey(t.cust,t.prod,t.taskType,ps);
    map[mk]=(map[mk]||0)+taskUnits(t);
  }
  return map;
}
