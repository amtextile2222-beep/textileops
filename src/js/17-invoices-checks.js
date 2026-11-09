// ─── 💳 שיקים לחשבונית עסקה (08/10/2026) ─────────────────────────────
// כל חשבונית מחזיקה `checks` (מערך במסמך החשבונית) ⇒ יתרה = total פחות סכום השיקים.
// 📷 הצילומים ב-checkImages/{מס' חשבונית}_{מזהה שיק} ונטענים רק בלחיצה — כמו productImages:
// רשימת החשבוניות נטענת שלמה, ו-2 צילומים לשיק היו מנפחים מסמך מעבר ל-1MB.
// ⚠️ זה **אישור קבלת תשלום פנימי**, לא קבלה לצורכי מס (החלטת המשתמש 08/10) — הקבלה/חשבונית
// המס ממשיכות לצאת אצל רואה החשבון. הוספה/מחיקה בטרנזקציה: שני מכשירים שרושמים במקביל לא דורסים.
const CHK_BANKS=['04 יהב','09 בנק הדואר','10 לאומי','11 דיסקונט','12 הפועלים','13 איגוד','14 אוצר החייל','17 מרכנתיל','20 מזרחי טפחות','31 הבינלאומי','34 ערבי ישראלי','46 מסד','52 פאג"י','54 ירושלים'];
const CHK_IMG_MAX=4,CHK_IMG_BYTES=900000; // מסמך Firestore עד 1MB
// _chkNo = מזהה מסמך החשבונית (_id): ברגילה = המספר, בידנית = manual_... (09/10)
let _chkNo='',_chkImgs=[],_chkEdit=null;
const _chkD=()=>_pfList.find(x=>x._id===_chkNo); // _chkEdit = מזהה השיק שבעריכה (מנהל בלבד, החלטת המשתמש 08/10)
// 📒 חשבונית ידנית: עם שיקים — לפי השיקים כמו רגילה; בלי — לפי הסימון "שולם" של המנהל
const pfPaid=d=>d?.manual&&!(d.checks||[]).length?(d.paid?+d.total||0:0):Math.round((d?.checks||[]).reduce((t,c)=>t+(+c.amount||0),0)*100)/100;
const pfLeft=d=>Math.round(((+d?.total||0)-pfPaid(d))*100)/100;
const chkPaid=d=>Math.round((d?.checks||[]).reduce((t,c)=>t+(+c.amount||0),0)*100)/100;
const chkLeft=d=>Math.round(((+d?.total||0)-chkPaid(d))*100)/100;
function pfPayCell(d){
  if(d.manual&&!(d.checks||[]).length)return d.paid?'<span style="color:var(--green-txt,#16a34a);font-weight:700">✅ שולם</span>':'<span style="color:var(--amber-txt)">לא שולם</span>';
  if(!(d.checks||[]).length)return '<span style="color:var(--txt3)">—</span>';
  const left=pfLeft(d);
  if(left<=0.009)return `<span style="color:var(--green-txt,#16a34a);font-weight:700">✅ שולם</span>${left<-0.009?'<div style="font-size:10px;color:var(--txt3)">עודף '+dnMoney(-left)+'</div>':''}`;
  return `<span style="color:var(--amber-txt);font-weight:700">יתרה ${dnMoney(left)}</span>`;
}
function openInvChecks(no){
  if(!_canPricing())return;
  const d=_pfList.find(x=>x._id===String(no));if(!d)return;
  _chkNo=String(no);_chkImgs=[];_chkEdit=null;_taxImgs=[];
  document.getElementById('chk-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='chk-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10002;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  // 🛑 לא נסגר בלחיצה על הרקע — שיק חצי ממולא עם צילום היה הולך לאיבוד (כמו חלון המוצר, 07/10)
  wrap.innerHTML='<div id="chk-box" style="background:var(--card);border-radius:14px;padding:18px;max-width:680px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto"></div>';
  document.body.appendChild(wrap);
  renderInvChecks();
}
function renderInvChecks(){
  const box=document.getElementById('chk-box');if(!box)return;
  const d=_chkD();if(!d)return;
  // בחלון השיקים — תמיד לפי השיקים בלבד: בחשבונית ידנית שסומנה 'שולמה' pfLeft=0, והשיק הראשון קיבל אזהרת 'גבוה מהיתרה (₪0)'
  const isMgr=S.user?.role==='manager',list=d.checks||[],left=chkLeft(d);
  const ed=_chkEdit?list.find(x=>x.id===_chkEdit)||null:null;
  const hd=x=>x?String(x).slice(8,10)+'/'+String(x).slice(5,7)+'/'+String(x).slice(0,4):'—';
  const inp='font-size:14px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--card);color:var(--txt);width:100%';
  box.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
      <div style="font-size:16px;font-weight:800">💳 שיקים — חשבונית עסקה ${+d.no}</div>
      <button class="btn" style="font-size:12px" onclick="document.getElementById('chk-wrap').remove()">סגור</button>
    </div>
    <div style="font-size:13px;line-height:1.8;background:var(--bg);border-radius:8px;padding:8px 10px;margin-bottom:10px">
      ${esc(d.custName||S.customerNames?.[d.cust]||d.cust||'')} · תאריך ${hd(d.date)}<br>
      סה"כ לתשלום <b>${dnMoney(d.total)}</b> · התקבל <b style="color:var(--green-txt,#16a34a)">${dnMoney(chkPaid(d))}</b> ·
      ${left>0.009?`יתרה <b style="color:var(--amber-txt)">${dnMoney(left)}</b>`:left<-0.009?`עודף <b>${dnMoney(-left)}</b>`:'<b style="color:var(--green-txt,#16a34a)">✅ שולם במלואו</b>'}
    </div>
    ${list.length?`<div class="tbl-wrap"><table>
      <thead><tr><th>מס' שיק</th><th>בנק</th><th>סניף</th><th>חשבון</th><th>פירעון</th><th style="text-align:center">סכום</th><th>חשבונית מס</th><th></th></tr></thead>
      <tbody>${list.map(c=>`<tr${ed&&ed.id===c.id?' style="background:var(--amber-bg)"':''}>
        <td><b>${esc(c.chk)}</b><div style="font-size:10px;color:var(--txt3)">${esc(c.by||'')}${c.editedBy?' · ✏️ '+esc(c.editedBy):''}</div></td>
        <td style="font-size:12px">${esc(c.bank||'')}</td><td>${esc(c.branch||'')}</td><td>${esc(c.acct||'')}</td>
        <td style="white-space:nowrap">${hd(c.due)}</td>
        <td style="text-align:center;white-space:nowrap;font-weight:700">${dnMoney(c.amount)}</td>
        <td style="white-space:nowrap;font-size:12px">${chkTaxTag(d,c)}</td>
        <td style="white-space:nowrap;text-align:left">
          ${+c.imgs?`<button class="btn" style="font-size:11px;padding:4px 8px" onclick="chkShowImgs('${escj(c.id)}')">📷 ${+c.imgs}</button>`:''}
          ${isMgr&&!d.void?`<button class="btn" style="font-size:11px;padding:4px 8px" title="עריכה" onclick="editInvCheck('${escj(c.id)}')">✏️</button>`:''}
          ${isMgr?`<button class="btn" style="font-size:11px;padding:4px 8px;color:var(--red-txt)" onclick="delInvCheck('${escj(c.id)}')">🗑</button>`:''}
        </td></tr>`).join('')}</tbody></table></div>
      <button class="btn" style="font-size:12px;margin-top:8px" onclick="printInvChecks()">🖨 אישור קבלת תשלום ללקוח</button>`
    :'<div style="font-size:13px;color:var(--txt3);margin-bottom:6px">עדיין לא נרשמו שיקים לחשבונית הזו.</div>'}
    <div id="tax-box"></div>
    ${d.void?'<div style="margin-top:12px;color:var(--red-txt);font-weight:700;font-size:13px">🚫 החשבונית מבוטלת — אין רישום שיקים חדשים</div>':`
    <div class="sec" id="chk-form-ttl" style="margin-top:16px;margin-bottom:8px">${ed?'✏️ עריכת שיק '+esc(ed.chk):'➕ שיק חדש'}</div>
    <datalist id="chk-banks">${CHK_BANKS.map(b=>`<option value="${esc(b)}">`).join('')}</datalist>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="field" style="margin:0"><label>מספר שיק</label><input id="chk-num" inputmode="numeric" value="${esc(ed?.chk||'')}" style="${inp}"/></div>
      <div class="field" style="margin:0"><label>סכום ₪</label><input id="chk-amt" type="number" step="0.01" min="0" inputmode="decimal" value="${ed?(+ed.amount).toFixed(2):left>0.009?left.toFixed(2):''}" style="${inp}"/></div>
      <div class="field" style="margin:0"><label>בנק</label><input id="chk-bank" list="chk-banks" placeholder="בחר או הקלד" value="${esc(ed?.bank||'')}" style="${inp}"/></div>
      <div class="field" style="margin:0"><label>סניף</label><input id="chk-branch" inputmode="numeric" value="${esc(ed?.branch||'')}" style="${inp}"/></div>
      <div class="field" style="margin:0"><label>מספר חשבון</label><input id="chk-acct" inputmode="numeric" value="${esc(ed?.acct||'')}" style="${inp}"/></div>
      <div class="field" style="margin:0"><label>תאריך פירעון</label><input id="chk-due" type="date" value="${esc(ed?.due||todayStr())}" style="${inp}"/></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button type="button" class="btn" style="font-size:12px" onclick="document.getElementById('chk-cam').click()">📷 צלם שיק</button>
      <button type="button" class="btn" style="font-size:12px" onclick="document.getElementById('chk-file').click()">📁 העלה צילום</button>
      <input id="chk-cam" type="file" accept="image/*" capture="environment" class="hidden" onchange="chkAddImgs(this)">
      <input id="chk-file" type="file" accept="image/*" multiple class="hidden" onchange="chkAddImgs(this)">
    </div>
    <div id="chk-thumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn primary" id="chk-save" style="flex:1;font-size:14px" onclick="saveInvCheck()">${ed?'💾 עדכן שיק':'💾 שמור שיק'}</button>
      ${ed?'<button class="btn" style="font-size:14px" onclick="_chkEdit=null;_chkImgs=[];renderInvChecks()">ביטול עריכה</button>':''}
    </div>`}`;
  renderChkThumbs();
  renderTaxInvs();
}
// ─── 🧾 חשבוניות מס ידניות (09/10/2026) ─────────────────────────────
// חשבונית מס יוצאת **מהפנקס** כשהשיק נפרע — או מוקדם יותר, כשהלקוח מכסה את המע"מ עד מועד
// תשלומו (8/2026: שיק בסכום המע"מ ל-15/10 ⇒ חשבונית מס 0199 על הכל כבר ב-9/9).
// המערכת **לא מפיקה** חשבונית מס — רק רושמת (taxInvs במסמך החשבונית, בטרנזקציה כמו השיקים)
// ומראה על איזה שיק עוד לא הוצאה. שיק "מכוסה" = סומן בחשבונית מס, או שהחשבוניות מכסות את כל הסכום.
const taxSum=d=>Math.round((d?.taxInvs||[]).reduce((t,x)=>t+(+x.total||0),0)*100)/100;
const taxLeft=d=>Math.round(((+d?.total||0)-taxSum(d))*100)/100;
function chkTaxOf(d,c){
  const l=d?.taxInvs||[];
  return l.find(x=>(x.chkIds||[]).includes(c.id))||(l.length&&taxLeft(d)<=0.009?l[l.length-1]:null);
}
// ⚠ חסרה = מועד הפירעון הגיע ואין חשבונית מס — זה מה שצריך להוציא עכשיו
function chkTaxTag(d,c){
  const t=chkTaxOf(d,c);
  if(t)return `<span style="color:var(--green-txt,#16a34a);font-weight:700">🧾 ${esc(String(t.no))}</span>`;
  return (c.due||'')<=todayStr()?'<span style="color:var(--red-txt);font-weight:700">⚠ חסרה</span>':'<span style="color:var(--txt3)">—</span>';
}
function pfTaxCell(d){
  const l=d.taxInvs||[];if(!l.length)return '<span style="color:var(--txt3)">—</span>';
  const nos=l.map(x=>esc(String(x.no))).join(', '),left=taxLeft(d);
  return left<=0.009?`<span style="color:var(--green-txt,#16a34a);font-weight:700">✅ ${nos}</span>`
    :`<span style="color:var(--amber-txt);font-weight:700">${nos}</span><div style="font-size:10px;color:var(--amber-txt)">נשאר ${dnMoney(left)}</div>`;
}
function renderTaxInvs(){
  const box=document.getElementById('tax-box');if(!box)return;
  const d=_chkD();if(!d)return;
  const isMgr=S.user?.role==='manager',list=d.taxInvs||[],left=taxLeft(d);
  const hd=x=>x?String(x).slice(8,10)+'/'+String(x).slice(5,7)+'/'+String(x).slice(0,4):'—';
  const chkNo=id=>(d.checks||[]).find(c=>c.id===id)?.chk||'';
  const open=(d.checks||[]).filter(c=>!chkTaxOf(d,c));
  const inp='font-size:14px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--card);color:var(--txt);width:100%';
  box.innerHTML=`<input id="tx-att" type="file" accept="image/*" multiple class="hidden" onchange="taxAttach(this)">
    <div class="sec" style="margin-top:16px;margin-bottom:6px">🧾 חשבוניות מס</div>
    <div style="font-size:12px;margin-bottom:6px;color:${!list.length?'var(--txt3)':left<=0.009?'var(--green-txt,#16a34a)':'var(--amber-txt)'};font-weight:${list.length?700:400}">${!list.length?'עדיין לא נרשמה חשבונית מס':left<=0.009?'✅ הוצאה חשבונית מס על כל הסכום':'הוצאה על '+dnMoney(taxSum(d))+' · נשאר '+dnMoney(left)}</div>
    ${list.length?`<div class="tbl-wrap"><table>
      <thead><tr><th>מס'</th><th>תאריך</th><th style="text-align:center">לפני מע"מ</th><th style="text-align:center">מע"מ</th><th style="text-align:center">סה"כ</th><th>שיקים</th><th></th></tr></thead>
      <tbody>${list.map(t=>`<tr>
        <td><b>${esc(String(t.no))}</b><div style="font-size:10px;color:var(--txt3)">${esc(t.by||'')}</div></td>
        <td style="white-space:nowrap">${hd(t.date)}</td>
        <td style="text-align:center;white-space:nowrap">${dnMoney(t.net)}</td>
        <td style="text-align:center;white-space:nowrap">${dnMoney(t.vat!=null?t.vat:(+t.total||0)-(+t.net||0))}</td>
        <td style="text-align:center;white-space:nowrap;font-weight:700">${dnMoney(t.total)}</td>
        <td style="font-size:12px">${(t.chkIds||[]).map(chkNo).filter(Boolean).map(esc).join(', ')||'—'}</td>
        <td style="white-space:nowrap;text-align:left">
          ${+t.imgs?`<button class="btn" style="font-size:11px;padding:4px 8px" onclick="chkShowImgs('${escj(t.id)}')">📷 ${+t.imgs}</button>`:''}
          ${!d.void&&(+t.imgs||0)<CHK_IMG_MAX?`<button class="btn" style="font-size:11px;padding:4px 8px" title="צרף צילום של חשבונית המס" onclick="_taxAttId='${escj(t.id)}';document.getElementById('tx-att').click()">📎</button>`:''}
          ${isMgr?`<button class="btn" style="font-size:11px;padding:4px 8px;color:var(--red-txt)" onclick="delTaxInv('${escj(t.id)}')">🗑</button>`:''}
        </td>
      </tr>`).join('')}</tbody></table></div>`:''}
    ${d.void||left<=0.009?'':`<details style="margin-top:8px;border:1px dashed var(--brd);border-radius:8px;padding:6px 9px"${list.length?'':' open'}>
      <summary style="font-size:13px;font-weight:600;cursor:pointer">➕ רישום חשבונית מס מהפנקס</summary>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
        <div class="field" style="margin:0"><label>מספר</label><input id="tx-no" inputmode="numeric" style="${inp}"/></div>
        <div class="field" style="margin:0"><label>תאריך</label><input id="tx-date" type="date" value="${todayStr()}" style="${inp}"/></div>
        <div class="field" style="margin:0"><label>סה"כ כולל מע"מ</label><input id="tx-total" type="number" step="0.01" inputmode="decimal" value="${left.toFixed(2)}" style="${inp}"/></div>
      </div>
      ${open.length?`<div style="font-size:12px;font-weight:600;margin-top:8px">על אילו שיקים? <span style="font-weight:400;color:var(--txt3)">(סימון ממלא את הסכום)</span></div>
      ${open.map(c=>`<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:4px;cursor:pointer"><input type="checkbox" class="tx-chk" value="${esc(c.id)}" data-amt="${+c.amount||0}" onchange="txSyncTotal()" style="width:auto"/> שיק ${esc(c.chk)} · פירעון ${hd(c.due)} · ${dnMoney(c.amount)}</label>`).join('')}`:''}
      <div style="font-size:11px;color:var(--txt3);margin-top:6px">לא מודפס דבר — רק נרשם שחשבונית המס הוצאה. הסכום לפני מע"מ והמע"מ מחושבים מהסה"כ.</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn" style="font-size:12px" onclick="document.getElementById('tx-cam').click()">📷 צלם חשבונית</button>
        <button type="button" class="btn" style="font-size:12px" onclick="document.getElementById('tx-file').click()">📁 העלה צילום</button>
        <input id="tx-cam" type="file" accept="image/*" capture="environment" class="hidden" onchange="taxAddImgs(this)">
        <input id="tx-file" type="file" accept="image/*" multiple class="hidden" onchange="taxAddImgs(this)">
      </div>
      <div id="tax-thumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
      <button class="btn primary" style="width:100%;margin-top:8px" onclick="saveTaxInv()">💾 רשום חשבונית מס</button>
    </details>`}`;
  renderTaxThumbs();
}
// 📷 צילום חשבונית המס — בטופס הרישום (_taxImgs), או 📎 לרשומה קיימת (_taxAttId)
let _taxImgs=[],_taxAttId='';
async function _taxReadImgs(input,max){
  const out=[];
  for(const file of input.files){
    if(out.length>=max)break;
    const raw=await new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(file);});
    out.push(await compressImage(raw,1600,1600,0.6));
  }
  input.value='';
  return out;
}
function renderTaxThumbs(){
  const el=document.getElementById('tax-thumbs');if(!el)return;
  el.innerHTML=_taxImgs.map((s,i)=>`<div style="position:relative"><img src="${s}" style="height:80px;border-radius:6px;border:1px solid var(--brd)"/>
    <button type="button" onclick="_taxImgs.splice(${i},1);renderTaxThumbs()" style="position:absolute;top:2px;left:2px;background:var(--red);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px">✕</button></div>`).join('');
}
async function taxAddImgs(input){
  const room=CHK_IMG_MAX-_taxImgs.length;
  if(room<=0){showToast('⚠ עד '+CHK_IMG_MAX+' צילומים','var(--amber-txt)');input.value='';return;}
  _taxImgs=_taxImgs.concat(await _taxReadImgs(input,room));
  renderTaxThumbs();
}
async function taxAttach(input){
  const d=_chkD(),id=_taxAttId;const t=(d?.taxInvs||[]).find(x=>x.id===id);if(!t){input.value='';return;}
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור','var(--red-txt)');input.value='';return;}
  let cur=[];
  if(+t.imgs)try{const{doc,getDoc}=window._fb;const s=await getDoc(doc(db,'checkImages',_chkNo+'_'+id));cur=s.data()?.imgs||[];}catch(e){}
  const add=await _taxReadImgs(input,CHK_IMG_MAX-cur.length);if(!add.length)return;
  const imgs=cur.concat(add);
  if(imgs.reduce((s,x)=>s+x.length,0)>CHK_IMG_BYTES){showToast('⚠ הצילומים גדולים מדי','var(--red-txt)');return;}
  try{
    await fbSet('checkImages',_chkNo+'_'+id,{imgs,invNo:_chkNo,taxNo:t.no,by:S.user?.name||'',at:Date.now()});
    d.taxInvs=await _chkTx(arr=>arr.map(x=>x.id===id?{...x,imgs:imgs.length}:x),'taxInvs');
    showToast('📷 הצילום נשמר');renderInvChecks();
  }catch(e){showToast('⚠ השמירה נכשלה: '+(e.message||''),'var(--red-txt)');}
}
function txSyncTotal(){
  const s=[...document.querySelectorAll('.tx-chk:checked')].reduce((t,x)=>t+(+x.dataset.amt||0),0);
  const el=document.getElementById('tx-total');if(el)el.value=(s>0?s:taxLeft(_chkD())).toFixed(2);
}
async function saveTaxInv(){
  const d=_chkD();if(!d||d.void)return;
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור — לא נשמר','var(--red-txt)');return;}
  const no=(document.getElementById('tx-no')?.value||'').trim(),date=document.getElementById('tx-date')?.value||'';
  const total=Math.round((parseFloat(document.getElementById('tx-total')?.value)||0)*100)/100;
  if(!no){alert('יש להזין את מספר חשבונית המס');return;}
  if(!date){alert('יש לבחור תאריך');return;}
  if(!(total>0)){alert('יש להזין סכום');return;}
  if(_pfList.some(x=>(x.taxInvs||[]).some(t=>String(t.no)===no))&&!confirm('חשבונית מס '+no+' כבר רשומה. לרשום שוב?'))return;
  const left=taxLeft(d);
  if(total>left+0.009&&!confirm('הסכום ('+dnMoney(total)+') גבוה ממה שנשאר בלי חשבונית מס ('+dnMoney(Math.max(0,left))+'). לרשום בכל זאת?'))return;
  const vatPct=+(d.vatPct??S.settings?.vatPct??18)||0,net=Math.round(total/(1+vatPct/100)*100)/100;
  // המספר כמו שהוקלד — "0200" ולא 200, כמו בפנקס
  const rec={id:'t'+Date.now(),no,date,total,net,vat:Math.round((total-net)*100)/100,vatPct,
    chkIds:[...document.querySelectorAll('.tx-chk:checked')].map(x=>x.value),imgs:_taxImgs.length,by:S.user?.name||'',byId:S.user?.id||'',at:Date.now()};
  if(_taxImgs.reduce((t,x)=>t+x.length,0)>CHK_IMG_BYTES){alert('הצילומים גדולים מדי — הסר צילום אחד ונסה שוב');return;}
  try{
    // 📷 באותו אוסף של צילומי השיקים (checkImages, canPricing) — המזהה {חשבונית}_{t...} לא מתנגש בשיקים (c...)
    if(_taxImgs.length)await fbSet('checkImages',_chkNo+'_'+rec.id,{imgs:_taxImgs,invNo:_chkNo,taxNo:no,by:rec.by,at:rec.at});
    d.taxInvs=await _chkTx(arr=>[...arr,rec],'taxInvs');
  }
  catch(e){showToast('⚠ השמירה נכשלה: '+(e.message||''),'var(--red-txt)',6000);return;}
  _taxImgs=[];
  showToast('🧾 חשבונית מס '+no+' נרשמה — '+dnMoney(total));
  renderInvChecks();renderProformaList();renderChecksReport();
}
async function delTaxInv(id){
  if(S.user?.role!=='manager')return;
  const d=_chkD();const t=(d?.taxInvs||[]).find(x=>x.id===id);if(!t)return;
  if(!await showConfirm('מחיקת רישום','למחוק את רישום חשבונית מס '+t.no+' ('+dnMoney(t.total)+')?\nחשבונית המס עצמה בפנקס לא מושפעת.','מחק','חזור'))return;
  try{d.taxInvs=await _chkTx(arr=>arr.filter(x=>x.id!==id),'taxInvs');if(+t.imgs)try{await fbDel('checkImages',_chkNo+'_'+id);}catch(e){}renderInvChecks();renderProformaList();renderChecksReport();showToast('🗑 נמחק');}
  catch(e){showToast('⚠ המחיקה נכשלה: '+(e.message||''),'var(--red-txt)');}
}
function renderChkThumbs(){
  const el=document.getElementById('chk-thumbs');if(!el)return;
  el.innerHTML=_chkImgs.map((s,i)=>`<div style="position:relative"><img src="${s}" style="height:80px;border-radius:6px;border:1px solid var(--brd)"/>
    <button type="button" onclick="_chkImgs.splice(${i},1);renderChkThumbs()" style="position:absolute;top:2px;left:2px;background:var(--red);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px">✕</button></div>`).join('');
}
async function chkAddImgs(input){
  for(const file of input.files){
    if(_chkImgs.length>=CHK_IMG_MAX){showToast('⚠ עד '+CHK_IMG_MAX+' צילומים לשיק','var(--amber-txt)');break;}
    const raw=await new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(file);});
    // 1600px — מספיק לקרוא מספר שיק/חשבון; ~200KB לצילום
    _chkImgs.push(await compressImage(raw,1600,1600,0.6));
  }
  input.value='';
  renderChkThumbs();
}
// 🔒 הוספה/מחיקה של שיק בטרנזקציה — קוראים את המערך העדכני מהשרת, לא את מה שנטען בפתיחת הרשימה
async function _chkTx(fn,field){
  field=field||'checks'; // גם taxInvs (חשבוניות מס) — אותו מנגנון
  const{doc,runTransaction}=window._fb;let out=null;
  await _pw(runTransaction(db,async tx=>{
    const ref=doc(db,'proformaInvoices',String(_chkNo));
    const s=await tx.get(ref);if(!s.exists())throw new Error('החשבונית לא נמצאה');
    out=fn(s.data()[field]||[]);
    tx.update(ref,{[field]:out});
  }));
  return out;
}
async function saveInvCheck(){
  const d=_chkD();if(!d||d.void)return;
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור — השיק לא נשמר','var(--red-txt)');return;}
  const v=id=>(document.getElementById(id)?.value||'').trim();
  const amount=Math.round((parseFloat(v('chk-amt'))||0)*100)/100;
  // ✏️ עריכה: אותו מזהה, אותו רושם ואותו מועד — רק השדות והצילומים מתחלפים, ונרשם מי ערך
  const ed=_chkEdit?(d.checks||[]).find(x=>x.id===_chkEdit):null;
  if(_chkEdit&&(!ed||S.user?.role!=='manager')){showToast('⚠ השיק לא נמצא','var(--red-txt)');_chkEdit=null;renderInvChecks();return;}
  const f={chk:v('chk-num'),bank:v('chk-bank'),branch:v('chk-branch'),acct:v('chk-acct'),due:v('chk-due'),amount,imgs:_chkImgs.length};
  const c=ed?{...ed,...f,editedBy:S.user?.name||'',editedAt:Date.now()}:{id:'c'+Date.now(),...f,by:S.user?.name||'',byId:S.user?.id||'',at:Date.now()};
  if(!c.chk){alert('יש להזין מספר שיק');return;}
  if(!(amount>0)){alert('יש להזין סכום');return;}
  if(!c.due){alert('יש להזין תאריך פירעון');return;}
  if(_chkImgs.reduce((t,s)=>t+s.length,0)>CHK_IMG_BYTES){alert('הצילומים גדולים מדי — הסר צילום אחד ונסה שוב');return;}
  if((d.checks||[]).some(x=>x.id!==c.id&&x.chk===c.chk&&x.acct===c.acct)&&!confirm('שיק מספר '+c.chk+' כבר רשום בחשבונית הזו. לרשום אותו שוב?'))return;
  const left=chkLeft(d)+(ed?+ed.amount||0:0); // בעריכה — הסכום הקודם של השיק חוזר ליתרה
  if(amount>left+0.009&&!confirm('הסכום ('+dnMoney(amount)+') גבוה מהיתרה בחשבונית ('+dnMoney(Math.max(0,left))+'). לרשום בכל זאת?'))return;
  const btn=document.getElementById('chk-save');if(btn){btn.disabled=true;btn.textContent='⏳ שומר…';}
  try{
    // הצילום קודם: שיק שנרשם עם imgs>0 בלי מסמך צילום היה מציג כפתור 📷 ריק
    if(_chkImgs.length)await fbSet('checkImages',_chkNo+'_'+c.id,{imgs:_chkImgs,invNo:_chkNo,chk:c.chk,by:c.by,at:c.at});
    d.checks=await _chkTx(arr=>{
      if(!ed)return[...arr,c];
      if(!arr.some(x=>x.id===c.id))throw new Error('השיק נמחק בינתיים');
      return arr.map(x=>x.id===c.id?c:x);
    });
    // כל הצילומים הוסרו בעריכה ⇒ מוחקים את המסמך (לא להשאיר צילום יתום של חשבון בנק)
    if(ed&&+ed.imgs&&!_chkImgs.length)try{await fbDel('checkImages',_chkNo+'_'+c.id);}catch(e){}
    _chkImgs=[];_chkEdit=null;
    showToast((ed?'✅ שיק '+c.chk+' עודכן — ':'✅ שיק '+c.chk+' נשמר — ')+dnMoney(amount));
    renderInvChecks();renderProformaList();renderChecksReport();renderDNotes();
  }catch(e){
    showToast('⚠ השמירה נכשלה: '+(e.message||''),'var(--red-txt)',6000);
    if(btn){btn.disabled=false;btn.textContent=ed?'💾 עדכן שיק':'💾 שמור שיק';}
  }
}
// ✏️ טוען את השיק לטופס, כולל הצילומים הקיימים (כדי שאפשר יהיה להסיר/להוסיף ולא רק להחליף)
async function editInvCheck(id){
  if(S.user?.role!=='manager')return;
  const d=_chkD();const c=(d?.checks||[]).find(x=>x.id===id);if(!c||d.void)return;
  let imgs=[];
  if(+c.imgs)try{const{doc,getDoc}=window._fb;const s=await getDoc(doc(db,'checkImages',_chkNo+'_'+id));imgs=s.data()?.imgs||[];}
  catch(e){showToast('⚠ טעינת הצילום נכשלה: '+(e.message||''),'var(--red-txt)');return;}
  _chkEdit=id;_chkImgs=imgs;
  renderInvChecks();
  document.getElementById('chk-form-ttl')?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function delInvCheck(id){
  if(S.user?.role!=='manager')return;
  const d=_chkD();const c=(d?.checks||[]).find(x=>x.id===id);if(!c)return;
  if(!await showConfirm('מחיקת שיק','למחוק את שיק '+c.chk+' ('+dnMoney(c.amount)+') מחשבונית '+d.no+'?','מחק','חזור'))return;
  try{
    d.checks=await _chkTx(arr=>arr.filter(x=>x.id!==id));
    if(_chkEdit===id){_chkEdit=null;_chkImgs=[];}
    if(+c.imgs)try{await fbDel('checkImages',_chkNo+'_'+id);}catch(e){}
    showToast('🗑 השיק נמחק');renderInvChecks();renderProformaList();renderChecksReport();renderDNotes();
  }catch(e){showToast('⚠ המחיקה נכשלה: '+(e.message||''),'var(--red-txt)');}
}
// no — מס' החשבונית כשנפתח מטבלת השיקים (שם _chkNo לא נקבע)
async function chkShowImgs(id,no){
  let imgs=[];
  try{const{doc,getDoc}=window._fb;const s=await getDoc(doc(db,'checkImages',(no!=null&&no!==''?String(no):_chkNo)+'_'+id));imgs=s.data()?.imgs||[];}
  catch(e){showToast('⚠ טעינת הצילום נכשלה: '+(e.message||''),'var(--red-txt)');return;}
  if(!imgs.length){showToast('⚠ לא נמצא צילום','var(--amber-txt)');return;}
  const w=document.createElement('div');
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10003;overflow-y:auto;padding:16px;text-align:center';
  w.onclick=e=>{if(e.target===w)w.remove();}; // צפייה בלבד — אין מה לאבד
  w.innerHTML=`<button class="btn" style="margin-bottom:10px" onclick="this.parentElement.remove()">✕ סגור</button>`+imgs.map(s=>`<img src="${s}" style="display:block;max-width:100%;margin:0 auto 10px;border-radius:8px"/>`).join('');
  document.body.appendChild(w);
}
// 🖨 אישור קבלת תשלום ללקוח — **לא** "קבלה": מסמך פנימי שמפרט את השיקים שהתקבלו על החשבונית
// 📷 09/10: צילומי השיקים מצורפים בעמוד נפרד אחרי החתימות (בקשת המשתמש)
async function printInvChecks(){
  const d=_chkD();if(!d||!(d.checks||[]).length)return;
  const pics=[];
  for(const c of d.checks){
    if(!+c.imgs)continue;
    try{const{doc,getDoc}=window._fb;const s=await getDoc(doc(db,'checkImages',_chkNo+'_'+c.id));const im=s.data()?.imgs||[];if(im.length)pics.push({c,im});}
    catch(e){showToast('⚠ צילום שיק '+c.chk+' לא נטען — יודפס בלעדיו','var(--amber-txt)');}
  }
  const co=S.settings?.company||{},ci=(S.customerInfo||{})[d.cust]||{};
  const hd=x=>x?String(x).slice(8,10)+'/'+String(x).slice(5,7)+'/'+String(x).slice(0,4):'—';
  const left=pfLeft(d);
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/><title>אישור קבלת תשלום — חשבונית ${+d.no}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-size:13px;padding:16mm 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #185FA5;padding-bottom:10px;margin-bottom:14px}
.co{font-size:19px;font-weight:800;color:#185FA5;margin-bottom:3px}
.co-d{font-size:11px;color:#444;line-height:1.6}
.doc{text-align:left;flex-shrink:0;margin-right:16px}
.doc h1{font-size:20px;font-weight:800;margin-bottom:6px}
.doc .dt{font-size:12px;color:#444;margin-top:3px}
.box{border:1px solid #bbb;border-radius:6px;padding:9px 11px;line-height:1.7;margin-bottom:14px}
.box h2{font-size:12px;font-weight:800;color:#185FA5;margin-bottom:5px;border-bottom:1px solid #e2e2e2;padding-bottom:3px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{background:#eef2ff;padding:7px 6px;text-align:right;font-weight:700;border:1px solid #bbb;font-size:12px}
td{padding:6px;border:1px solid #ddd}
td.c,th.c{text-align:center}
td.n{text-align:center;font-weight:800;background:#fafafa;white-space:nowrap}
tfoot td{background:#eef2ff;font-weight:800;font-size:14px;border:1px solid #bbb;padding:9px 6px}
table.sum{width:auto;min-width:42%;margin:16px 0 0 auto}
.sign{display:flex;gap:14px;margin-top:26px}
.sign div{flex:1;border-top:1px solid #666;padding-top:5px;font-size:11px;color:#444}
.sign b{display:block;font-size:12px;color:#000;margin-bottom:16px}
.foot{margin-top:20px;padding-top:8px;border-top:1px solid #e2e2e2;font-size:10px;color:#888;text-align:center}
@media print{body{padding:10mm}}
</style></head><body>
<div class="top">
  <div>
    <div class="co">${esc(co.name||'— שם העסק לא הוגדר —')}</div>
    <div class="co-d">
      ${co.addr?esc(co.addr)+(co.city?', '+esc(co.city):''):''}
      ${co.phone?'<br>טלפון: '+esc(co.phone):''}
      ${co.taxId?'<br>ח.פ./ע.מ.: '+esc(co.taxId):''}
    </div>
  </div>
  <div class="doc">
    <h1>אישור קבלת תשלום</h1>
    <div class="dt">עבור חשבונית עסקה מס' <b>${+d.no}</b> מיום ${hd(d.date)}</div>
    <div class="dt">הופק: ${hd(todayStr())}</div>
  </div>
</div>
<div class="box">
  <h2>התקבל מאת</h2>
  <div style="font-weight:800;font-size:14px">${esc(d.custName||S.customerNames?.[d.cust]||d.cust||'')}</div>
  ${ci.taxId?'<div>ח.פ./ע.מ.: '+esc(ci.taxId)+'</div>':''}
</div>
<table>
  <thead><tr><th class="c">#</th><th>מספר שיק</th><th>בנק</th><th class="c">סניף</th><th class="c">חשבון</th><th class="c">תאריך פירעון</th><th class="c">סכום</th></tr></thead>
  <tbody>${d.checks.map((c,i)=>`<tr><td class="c">${i+1}</td><td>${esc(c.chk)}</td><td>${esc(c.bank||'')}</td><td class="c">${esc(c.branch||'')}</td><td class="c">${esc(c.acct||'')}</td><td class="c">${hd(c.due)}</td><td class="n">${dnMoney(c.amount)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="6" style="text-align:left">סה"כ ${d.checks.length} שיקים</td><td class="n">${dnMoney(pfPaid(d))}</td></tr></tfoot>
</table>
<table class="sum"><tbody>
  <tr><td>סה"כ החשבונית</td><td class="n">${dnMoney(d.total)}</td></tr>
  <tr><td>התקבל</td><td class="n">${dnMoney(pfPaid(d))}</td></tr>
  <tr><td><b>${left<-0.009?'עודף':'יתרה לתשלום'}</b></td><td class="n">${dnMoney(Math.abs(left)<0.01?0:Math.abs(left))}</td></tr>
</tbody></table>
<div style="margin-top:10px;font-size:11px;color:#555;border:1px dashed #999;border-radius:6px;padding:6px 9px">מסמך זה מאשר את קבלת השיקים המפורטים ו<b>אינו קבלה לצורכי מס</b>. התשלום נחשב שולם עם כיבוד השיקים.</div>
<div class="sign">
  <div><b>חתימת המפעל</b><span class="sig-slot"></span>_______________________</div>
  <div><b>חתימת הלקוח</b>_______________________</div>
</div>
${pics.length?`<div style="page-break-before:always"><div class="box" style="margin-bottom:10px"><h2>צילומי השיקים</h2>חשבונית עסקה מס' ${+d.no} · ${esc(d.custName||S.customerNames?.[d.cust]||d.cust||'')}</div>
${pics.map(x=>`<div style="page-break-inside:avoid;margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">שיק ${esc(x.c.chk)} · ${esc(x.c.bank||'')} · פירעון ${hd(x.c.due)} · ${dnMoney(x.c.amount)}</div>${x.im.map(u=>`<img src="${u}" style="display:block;max-width:100%;max-height:115mm;margin-bottom:6px;border:1px solid #ccc;border-radius:4px"/>`).join('')}</div>`).join('')}</div>`:''}
<div class="foot">הופק ממערכת TextileOps · ${esc(co.name||'')}</div>
</body></html>`);
}
// ─── 📅 טבלת שיקים לפי תאריך פירעון (09/10/2026) ─────────────────────
// כל השיקים מכל החשבוניות, ממוינים לפי פירעון, עם סינון לקוח + טווח תאריכי פירעון.
// אין אוסף נפרד — נבנה מ-proformaInvoices.checks (אותה הרשאה: canPricing).
async function openChecksReport(){
  if(!_canPricing()){showToast('⚠ אין הרשאה לשיקים','var(--red-txt)');return;}
  if(!db||!S.fbConnected){showToast('⚠ אין חיבור','var(--red-txt)');return;}
  document.getElementById('chr-wrap')?.remove();
  const wrap=document.createElement('div');wrap.id='chr-wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10001;padding:16px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch';
  const fs='padding:7px 10px;border-radius:8px;border:1px solid var(--brd);background:var(--card);color:var(--txt);font-size:13px';
  wrap.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:1000px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-size:16px;font-weight:800">💳 שיקים לפי תאריך פירעון</div>
      <div style="display:flex;gap:6px">
        <button class="btn" style="font-size:12px" onclick="printChecksReport()">🖨 הדפס</button>
        <button class="btn" style="font-size:12px" onclick="document.getElementById('chr-wrap').remove()">סגור</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
      <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">לקוח</div><select id="chr-cust" onchange="renderChecksReport()" style="${fs}"><option value="">כל הלקוחות</option></select></div>
      <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">פירעון מתאריך</div><input id="chr-from" type="date" onchange="renderChecksReport()" style="${fs}"></div>
      <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">עד תאריך</div><input id="chr-to" type="date" onchange="renderChecksReport()" style="${fs}"></div>
      <div><div style="font-size:11px;color:var(--txt3);margin-bottom:2px">חשבונית מס</div><select id="chr-tax" onchange="renderChecksReport()" style="${fs}"><option value="">הכל</option><option value="missing">⚠ נפרעו ואין חשבונית מס</option><option value="none">בלי חשבונית מס</option><option value="done">🧾 יש חשבונית מס</option></select></div>
      <button class="btn" style="font-size:12px" onclick="chrClear()">נקה</button>
    </div>
    <div id="chr-body" style="font-size:13px;color:var(--txt3)">טוען…</div>
  </div>`;
  document.body.appendChild(wrap);
  try{await _pfLoad();}
  catch(e){const b=document.getElementById('chr-body');if(b)b.innerHTML='<span style="color:var(--red-txt)">⚠ טעינה נכשלה: '+esc(e.message||'')+'</span>';return;}
  const cs={};_pfList.forEach(d=>{if((d.checks||[]).length)cs[d.cust||'']=d.custName||S.customerNames?.[d.cust]||d.cust||'';});
  const sel=document.getElementById('chr-cust');
  if(sel)sel.innerHTML='<option value="">כל הלקוחות</option>'+Object.entries(cs).sort((a,b)=>a[1].localeCompare(b[1],'he')).map(([k,n])=>`<option value="${esc(k)}">${esc(n)}</option>`).join('');
  renderChecksReport();
}
// חודש ההתחשבנות של החשבונית (09/10: "לאיזה חודש שייך השיק"). חשבונית מלפני שדה החודש ⇒ החודש שלפני התאריך
function pfMonthLbl(d){
  let m=d?.month||'';
  if(!m&&d?.date){const x=String(d.date);const pm=new Date(+x.slice(0,4),+x.slice(5,7)-2,1);m=pm.getFullYear()+'-'+pad2(pm.getMonth()+1);}
  return m?m.slice(5,7)+'/'+m.slice(0,4):'—';
}
function chrClear(){['chr-cust','chr-from','chr-to','chr-tax'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});renderChecksReport();}
function _chrRows(){
  const cu=document.getElementById('chr-cust')?.value||'',fr=document.getElementById('chr-from')?.value||'',to=document.getElementById('chr-to')?.value||'';
  const tx=document.getElementById('chr-tax')?.value||'',today=todayStr();
  const out=[];
  _pfList.forEach(d=>(d.checks||[]).forEach(c=>{
    if(cu&&(d.cust||'')!==cu)return;
    if(fr&&(c.due||'')<fr)return;
    if(to&&(c.due||'')>to)return;
    const ht=!!chkTaxOf(d,c);
    if((tx==='done'&&!ht)||(tx==='none'&&ht)||(tx==='missing'&&(ht||(c.due||'')>today)))return;
    out.push({c,d,name:d.custName||S.customerNames?.[d.cust]||d.cust||''});
  }));
  return out.sort((a,b)=>String(a.c.due||'').localeCompare(String(b.c.due||''))||(+a.d.no-+b.d.no));
}
function renderChecksReport(){
  const box=document.getElementById('chr-body');if(!box)return;
  const rows=_chrRows(),today=todayStr();
  if(!rows.length){box.innerHTML='אין שיקים בסינון הזה.';return;}
  const hd=x=>x?String(x).slice(8,10)+'/'+String(x).slice(5,7)+'/'+String(x).slice(0,4):'—';
  const wk=new Date();wk.setDate(wk.getDate()+7);const wks=wk.getFullYear()+'-'+pad2(wk.getMonth()+1)+'-'+pad2(wk.getDate());
  // סימון: מועד הפירעון עבר (אפור) · בשבוע הקרוב (כתום) — כדי לדעת מה להפקיד
  const tag=due=>!due?'':due<today?'<div style="font-size:10px;color:var(--txt3)">עבר</div>':due<=wks?'<div style="font-size:10px;color:var(--amber-txt);font-weight:700">השבוע</div>':'';
  const tot=rows.reduce((t,r)=>t+(+r.c.amount||0),0);
  box.innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>פירעון</th><th>לקוח</th><th>חשבונית</th><th>חודש</th><th>מס' שיק</th><th>בנק</th><th>סניף</th><th>חשבון</th><th style="text-align:center">סכום</th><th>חשבונית מס</th><th></th></tr></thead>
    <tbody>${rows.map(({c,d,name})=>`<tr${(c.due||'')<today?' style="opacity:.6"':''}>
      <td style="white-space:nowrap"><b>${hd(c.due)}</b>${tag(c.due)}</td>
      <td>${esc(name)}</td>
      <td><a href="#" onclick="event.preventDefault();openInvChecks('${escj(d._id)}')" style="color:var(--blue-txt,#1d4ed8);font-weight:700">${d.manual?'📒 ':''}${esc(String(d.no))}</a>${d.void?' <span style="color:var(--red-txt);font-size:10px;font-weight:700">מבוטלת</span>':''}</td>
      <td style="white-space:nowrap">${pfMonthLbl(d)}</td>
      <td><b>${esc(c.chk)}</b></td>
      <td style="font-size:12px">${esc(c.bank||'')}</td><td>${esc(c.branch||'')}</td><td>${esc(c.acct||'')}</td>
      <td style="text-align:center;white-space:nowrap;font-weight:700">${dnMoney(c.amount)}</td>
      <td style="white-space:nowrap;font-size:12px">${chkTaxTag(d,c)}</td>
      <td style="white-space:nowrap;text-align:left">${+c.imgs?`<button class="btn" style="font-size:11px;padding:4px 8px" onclick="chkShowImgs('${escj(c.id)}','${escj(d._id)}')">📷 ${+c.imgs}</button>`:''}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="8" style="text-align:left;font-weight:700">סה"כ ${rows.length} שיקים</td><td style="text-align:center;font-weight:800;white-space:nowrap">${dnMoney(tot)}</td><td colspan="2"></td></tr></tfoot>
  </table></div>
  <div style="font-size:11px;color:var(--txt3);margin-top:8px">לחיצה על מספר החשבונית פותחת את השיקים שלה — שם אפשר לערוך ולמחוק.</div>`;
}
function printChecksReport(){
  const rows=_chrRows();if(!rows.length){showToast('⚠ אין שיקים להדפסה','var(--amber-txt)');return;}
  const co=S.settings?.company||{};
  const hd=x=>x?String(x).slice(8,10)+'/'+String(x).slice(5,7)+'/'+String(x).slice(0,4):'—';
  const cu=document.getElementById('chr-cust'),fr=document.getElementById('chr-from')?.value||'',to=document.getElementById('chr-to')?.value||'';
  const flt=[cu?.value?'לקוח: '+cu.options[cu.selectedIndex].text:'כל הלקוחות',(fr||to)?'פירעון: '+(fr?hd(fr):'…')+' — '+(to?hd(to):'…'):'כל התאריכים'].join(' · ');
  const tot=rows.reduce((t,r)=>t+(+r.c.amount||0),0);
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/><title>שיקים לפי תאריך פירעון</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-size:12.5px;padding:14mm 12mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:18px;margin-bottom:4px}.sub{font-size:12px;color:#444;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th{background:#eef2ff;padding:6px;text-align:right;border:1px solid #bbb;font-size:12px}
td{padding:5px 6px;border:1px solid #ddd}td.n{text-align:center;font-weight:800;white-space:nowrap}
tfoot td{background:#eef2ff;font-weight:800;border:1px solid #bbb}
tr{page-break-inside:avoid}thead{display:table-header-group}
@media print{body{padding:8mm}}
</style></head><body>
<h1>${esc(co.name||'')} — שיקים לפי תאריך פירעון</h1>
<div class="sub">${esc(flt)} · הופק ${hd(todayStr())}</div>
<table><thead><tr><th>פירעון</th><th>לקוח</th><th>חשבונית</th><th>חודש</th><th>מס' שיק</th><th>בנק</th><th>סניף</th><th>חשבון</th><th>סכום</th><th>חשבונית מס</th></tr></thead>
<tbody>${rows.map(({c,d,name})=>`<tr><td>${hd(c.due)}</td><td>${esc(name)}</td><td>${d.manual?'📒 ':''}${esc(String(d.no))}${d.void?' (מבוטלת)':''}</td><td>${pfMonthLbl(d)}</td><td>${esc(c.chk)}</td><td>${esc(c.bank||'')}</td><td>${esc(c.branch||'')}</td><td>${esc(c.acct||'')}</td><td class="n">${dnMoney(c.amount)}</td><td>${(t=>t?esc(String(t.no)):(c.due||'')<=todayStr()?'⚠ חסרה':'—')(chkTaxOf(d,c))}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="8" style="text-align:left">סה"כ ${rows.length} שיקים</td><td class="n">${dnMoney(tot)}</td><td></td></tr></tfoot></table>
</body></html>`);
}
// החלפת הזמנה בבורר — הכמות המתוכננת ושדה הקלט עוברים לרשומה הנבחרת
function shipPickChanged(){
  const p=S.products.find(x=>x.id===document.getElementById('ship-prod-sel')?.value);
  if(!p)return;
  const planned=_prodQty(p)||getTotalQty(p.cust,p.prod)||0;
  const el=document.getElementById('ship-planned');if(el)el.textContent=planned;
  // 📦 חומר האריזה לפי ההזמנה שנבחרה (p.cons) — לפני הכמויות, כדי ש-shipRowsTotal ימלא אותו
  const mw=document.getElementById('ship-mat-rows');
  if(mw)mw.innerHTML=shipMatRowsHtml(p.cust,p);
  // הטבלה נבנית מחדש לרשומה הנבחרת — לכל הזמנה פירוט מידות משלה
  const wrap=document.getElementById('ship-rows-wrap');
  if(wrap){wrap.innerHTML=shipRowsHtml(p);shipRowsTotal();}
  // האריזה וההערה מתאפסות — הן תיארו את ההזמנה הקודמת ולא את זו שנבחרה עכשיו
  const pw=document.getElementById('pack-rows');
  if(pw)pw.innerHTML=shipPackRowsHtml([]);
  const ow=document.getElementById('outer-rows');
  if(ow)ow.innerHTML=shipOuterRowHtml('sack','');
  const nt=document.getElementById('ship-note');
  if(nt)nt.value='';
  const og=document.getElementById('ship-orig');
  if(og)og.value='';
  shipPackTotal();
}
async function confirmShip(){
  // לפי id ייחודי מהבורר — לא לפי לקוח+מוצר, שעמום כשיש כמה הזמנות לאותו דגם
  const p=S.products.find(x=>x.id===document.getElementById('ship-prod-sel')?.value);
  if(!p){closeShipModal();return;}
  const _stk=pstkCalc(); // 📦 היתרות לפני המשלוח — להתראת מלאי נמוך
  const rows=_shipRowsCollect();
  const qty=_shipQtySum();
  const packs=_shipPacksCollect();
  const outer=_shipOuterCollect();
  const mats=_shipMatsCollect();
  const packMode=packModeOf(mats);
  const dnote=(document.getElementById('ship-note')?.value||'').trim();
  const orig=_shipOrigVal();
  const autoPrint=!!document.getElementById('ship-autoprint')?.checked;
  // ♻ שחזור: המספר והתאריך המקוריים · 📅 בדיעבד (09/10, מנהל): תאריך שנבחר, ומספר — הבא בתור או בלי
  let rs=_shipRestore?{..._shipRestore,restore:true}:null;
  const _pd=S.user?.role==='manager'&&document.getElementById('ship-past')?.open?(document.getElementById('ship-past-date')?.value||''):'';
  if(!rs&&document.getElementById('ship-past')?.open&&S.user?.role==='manager'){
    if(!_pd){alert('בחר את התאריך שבו יצא המשלוח');return;}
    if(_pd>todayStr()){alert('תאריך עתידי');return;}
    rs={no:document.getElementById('ship-past-nonum')?.checked?0:null,date:_pd,past:true};
  }
  if(rs&&rs.no>0&&allDeliveryNotes().some(r=>+r.s.no===rs.no)){showToast('⚠ תעודה '+String(rs.no).padStart(4,'0')+' כבר קיימת','var(--red-txt)');closeShipModal();return;}
  if(!Array.isArray(p.stageLog))p.stageLog=[];
  const now=new Date();
  const date=rs?rs.date:now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
  const time=pad2(now.getHours())+':'+pad2(now.getMinutes());
  if(!qty){
    if(!await showConfirm('משלוח ריק','לא הוזנה שום כמות. לרשום בכל זאת?','רשום','ביטול'))return;
  }
  // 📦 פער בין האריזה לכמות שיוצאת **מסומן ולא נחסם** — אבל נשאלת שאלה, כי
  // בדרך כלל זו טעות הקלדה בגודל חבילה ולא אריזה חלקית אמיתית
  if(packs.length&&!_packsMatch(packsUnits(packs),qty)){
    if(!await showConfirm('אריזה לא תואמת','באריזה '+packsUnits(packs)+" יח' ובמשלוח "+qty+" יח'. לרשום בכל זאת?",'רשום','חזור'))return;
  }
  // 📦 חומר האריזה מחויב ללקוח ⇒ משלוח בלי חומר מגיע לדוח בלי החיוב הזה.
  // לא חוסם — יש משלוחים בלי אריזה — אבל שואל, כי לשכוח את זה עולה כסף אמיתי.
  if(!packMode&&!await showConfirm('בלי חומר אריזה','לא הוזנה כמות לאף חומר אריזה, ולכן לא ייכנס חיוב עליו. לאשר בכל זאת?','אשר','חזור'))return;
  const matNoPrice=mats.filter(m=>!m.price&&!m.own&&!packIncl(m.k)).map(m=>packMatName(m.k));
  if(matNoPrice.length&&canSeePackPrice()&&!await showConfirm('חומר בלי מחיר','אין מחיר במחירון ל: '+matNoPrice.join(', ')+'. הכמות תירשם אבל תסומן בדוח כחסרת מחיר. להמשיך?','המשך','חזור'))return;
  // 🚚 **כל אישור יוצר משלוח חדש עם תעודה משלו** — לא דורס את הקודם.
  // ההזמנה יוצאת בפעימות, ולכל פעימה נמסר ללקוח נייר נפרד עם מספר נפרד.
  // packs ו-note נגררים מהמשלוחים הקיימים — בלעדיהם בנייה מחדש של הרשימה הייתה
  // מוחקת בשקט את האריזה וההערה של כל תעודה שכבר נמסרה ללקוח
  // 📦 packMode ו-mats נגררים כאן מאותה סיבה כמו packs ו-note: בנייה מחדש של
  // הרשימה בלעדיהם הייתה מוחקת בשקט את חיוב האריזה של כל תעודה קודמת.
  const list=prodShipments(p).map(s=>({...s,no:+s.no||0,date:s.date||'',at:s.at||'',rows:s.rows||[],total:+s.total||0,packs:Array.isArray(s.packs)?s.packs:[],note:s.note||'',packMode:s.packMode||'',mats:Array.isArray(s.mats)?s.mats:[]}));
  const no=rs&&rs.no!=null?rs.no:await nextDeliveryNoteNo();
  list.push({no:no||0,date,at:now.toISOString(),rows,total:qty,packs,note:dnote,packMode,mats,...(orig?{orig}:{}),...(outer.length?{outer}:{}),
    ...(rs?.restore?{restoredAt:now.toISOString(),restoredBy:S.user?.name||''}:{}),
    ...(rs?.past?{backdatedAt:now.toISOString(),backdatedBy:S.user?.name||''}:{})});
  p.shipments=list;
  // הסך המצטבר נשמר בשדות הוותיקים כדי שדוח הרווח וכל שאר הקוראים לא ישתנו
  p.shippedQty=list.reduce((t,s)=>t+(+s.total||0),0);
  p.shippedRows=mergeShipRows(list);
  if(!rs||!p.shippedAt)p.shippedAt=now.toISOString();
  // בשחזור — dnNo נשאר המספר הגבוה (הוא "התעודה האחרונה" של ההזמנה), והתאריך לא זז אחורה
  if(rs){p.dnNo=Math.max(parseInt(p.dnNo,10)||0,no);if(!p.dnDate)p.dnDate=date;}
  else{p.dnNo=no||p.dnNo;p.dnDate=date;}
  const note='משלוח '+list.length+': '+qty+" יח' · סה\"כ "+p.shippedQty+" יח'";
  const ex=p.stageLog.find(s=>s.id==='shipped');
  if(ex){if(!rs){ex.date=date;ex.time=time;}ex.note=note;ex.auto=true;}
  else p.stageLog.push({id:'shipped',date,time,note,auto:true});
  p.stageLog.sort((a,b)=>PROD_STAGES.findIndex(x=>x.id===a.id)-PROD_STAGES.findIndex(x=>x.id===b.id));
  // העדפת ההדפסה היא **פר מכשיר** ונשמרת מקומית בלבד: במסך מגע ליד הסורק רוצים
  // נייר מיד, ובנייד של המנהל דיאלוג הדפסה בכל סריקה רק מפריע
  S.settings.dnAutoPrint=autoPrint;
  saveLS();
  if(S.fbConnected)try{await fbSet('products',p.id,{...p});}catch(e){}
  pstkAlert(_stk);
  closeShipModal();
  showToast((rs?.restore?'♻ תעודה '+String(no).padStart(4,'0')+' שוחזרה':rs?.past?'📅 משלוח מ-'+date.slice(8,10)+'/'+date.slice(5,7)+(no?' · תעודה '+String(no).padStart(4,'0'):' · בלי מספר'):'✅ תעודת משלוח '+String(no||0).padStart(4,'0'))+' · '+qty+" יח'"+(list.length>1?' (משלוח '+list.length+')':''));
  try{renderDNotes();}catch(e){}
  try{buildStageReport();}catch(e){}
  try{renderProducts();}catch(e){}
  // 🖨 הדפסה מיד אחרי האישור — עד כאן היה צריך לחזור לכרטיס המוצר וללחוץ על
  // הכפתור. ההשהיה נותנת לרינדור ול-toast להסתיים לפני שגיליון ההדפסה חוטף מיקוד.
  if(autoPrint)setTimeout(()=>{try{printDeliveryNote(p.id,list.length-1);}catch(e){}},400);
}
function addStation(d,btn){
  const inp=btn.previousElementSibling;const v=(inp?.value||'').trim();
  if(!v){alert('הזן שם תחנה');return;}
  if(!S.deptStations)S.deptStations={};
  const arr=S.deptStations[d]||(S.deptStations[d]=[]);
  if(arr.includes(v)){alert('תחנה כבר קיימת במחלקה זו');return;}
  arr.push(v);saveDepts();renderAdmin();
}
function delStation(d,st){
  const key=d+'::'+st;
  if(S.workers.some(w=>w.skills&&w.skills[key])){alert('לא ניתן למחוק — יש עובדים עם מיומנות בתחנה זו');return;}
  if(S.products.some(p=>(p.workSteps||[]).some(s=>stepStationKeys(s).includes(key)))){alert('לא ניתן למחוק — יש שלבי מוצר משויכים לתחנה זו (ראשית או נוספת)');return;}
  S.deptStations[d]=(S.deptStations[d]||[]).filter(x=>x!==st);
  saveDepts();renderAdmin();
}
