// ─── 🚛 הובלות (16/11/2026) ─────────────────────────────────────────────
// התחשבנות עם המובילים: מחיר לקולב תלייה, לשק, לקרטון ולגליל — לכל מוביל מחירון משלו.
// יוצא: מתעודות המשלוח — קולבים = חומר האריזה "קולב"/"קולב קליפס" שנרשם בתעודה (גם 👤 של הלקוח),
//   שקים/קרטונים = "אריזה חיצונית" (shipments[].outer). המוביל = shipments[].car (נבחר בחלון המשלוח).
// נכנס: יומן קליטה — אוסף intake/{id} = {id,date,cust,car,hang,sack,carton,roll,note,by,byName,at}
//   (Rules: אחראי/מנהל קוראים ורושמים, מחיקה — מנהל). נטען לפי דרישה לטווח התאריכים — לא מאזין קבוע.
// שמות המובילים: appSettings/carriers.list=[{id,name}] (כולם קוראים — לבחירה בחלון המשלוח; מנהל כותב).
// המחירון: adminSettings/transport.p={מוביל:{hang,sack,carton,roll}} — מנהל בלבד, כמו שאר העלויות.
// אותו מחיר ליחידה ביציאה ובכניסה.
const TR_KINDS=[['hang','קולבים'],['sack','שקים'],['carton','קרטונים'],['roll','גלילים']];
let _trPrices={}; // מ-adminSettings/transport (מנהל)
let _trIntake=[],_trIntakeKey=''; // הקליטה שנטענה לטווח הנוכחי
const _trMgr=()=>S.user?.role==='manager';
const _trCan=()=>_trMgr()||S.user?.role==='supervisor';
const trCarriers=()=>(Array.isArray(S.carriers)?S.carriers:[]).filter(c=>c&&c.id);
function trCarName(id){if(!id)return 'לא נבחר מוביל';const c=trCarriers().find(x=>x.id===id);return c?c.name:'מוביל שנמחק';}
// כמויות ההובלה של תעודה אחת
function trShipQty(s){
  const q={hang:0,sack:0,carton:0,roll:0};
  (s?.mats||[]).forEach(m=>{if(m.k==='hanger'||m.k==='clip')q.hang+=+m.n||0;});
  (s?.outer||[]).forEach(o=>{if(q[o.k]!=null)q[o.k]+=+o.n||0;});
  return q;
}
const _trSum=(a,b)=>{TR_KINDS.forEach(([k])=>a[k]=(a[k]||0)+(+b[k]||0));return a;};
const _trZero=()=>({hang:0,sack:0,carton:0,roll:0});
function _trCost(car,q){const p=_trPrices[car]||{};return TR_KINDS.reduce((t,[k])=>t+(+q[k]||0)*(+p[k]||0),0);}
const _trQtyTxt=(q,kinds)=>(kinds||TR_KINDS.map(x=>x[0])).filter(k=>+q[k]>0).map(k=>q[k]+' '+TR_KINDS.find(x=>x[0]===k)[1]).join(' · ');
const _trDM=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7):'';

// 🚛🚛 (16/11/2026) לרוב ההובלה עוברת דרך שני מובילים — אחד אוסף מהמפעל ומוסר לשני, השני מוביל ללקוח
// (ובקליטה — הפוך). car = הראשון, car2 = השני (לא חובה). כל מוביל נספר על כל הכמות לפי המחירון שלו —
// מוביל שלא מחייב ישירות ⇒ מחירים 0.
const trCarsOf=x=>{const a=[x?.car||'',x?.car2||''].filter(Boolean);return a.filter((c,i)=>a.indexOf(c)===i);};
// ── בחירת מוביל בחלון המשלוח / עריכת תעודה ──
// ברירת מחדל: הזוג של התעודה האחרונה של אותו לקוח
function trLastCars(cust){
  let best=['',''],bt='';const ok=id=>trCarriers().some(c=>c.id===id)?id:'';
  (S.products||[]).forEach(p=>{if(String(p.cust)!==String(cust))return;prodShipments(p).forEach(s=>{if(s.car&&String(s.at||s.date||'')>bt){bt=String(s.at||s.date||'');best=[s.car,s.car2||''];}});});
  return [ok(best[0]),ok(best[1])];
}
function _trOpts(v,none){const l=trCarriers();return `<option value="">${none}</option>${l.map(c=>`<option value="${esc(c.id)}"${c.id===v?' selected':''}>${esc(c.name)}</option>`).join('')}${v&&!l.some(c=>c.id===v)?`<option value="${esc(v)}" selected>מוביל שנמחק</option>`:''}`;}
function trCarSelHtml(cur,cur2,cust){
  if(!trCarriers().length)return _trMgr()?'<div style="font-size:11px;color:var(--txt3);margin-top:8px">🚛 להתחשבנות עם המובילים — הגדר מובילים ב"תעודות משלוח" ← 🚛 הובלות</div>':'';
  const[d1,d2]=cur!=null?[cur,cur2||'']:trLastCars(cust);
  const ss='flex:1;min-width:0;font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  return `<div style="margin-top:9px"><div style="font-size:12px;font-weight:600;margin-bottom:4px">🚛 מובילים <span style="font-weight:400;color:var(--txt3)">— אוסף מהמפעל ⇐ מוסר ללקוח (השני לא חובה)</span></div>
    <div style="display:flex;gap:6px"><select id="ship-car" aria-label="מוביל ראשון" style="${ss}">${_trOpts(d1,'— מוביל —')}</select>
    <select id="ship-car2" aria-label="מוביל שני" style="${ss}">${_trOpts(d2,'— בלי מוביל שני —')}</select></div></div>`;
}
// null = אין שדה (אין מובילים) ⇒ לא נוגעים. שני ריקים/זהים ⇒ מנקים
function _shipCarVal(){const a=document.getElementById('ship-car'),b=document.getElementById('ship-car2');if(!a)return null;
  let car=a.value,car2=b?b.value:'';if(!car&&car2){car=car2;car2='';}if(car2===car)car2='';return{car,car2};}
// קובע car/car2 ברשומה (תעודה / קליטה)
function trApplyCars(r,v){if(!v)return r;if(v.car)r.car=v.car;else delete r.car;if(v.car2)r.car2=v.car2;else delete r.car2;return r;}

// ── חלון ההובלות ──
async function openTransport(){
  if(!_trCan())return;
  document.getElementById('tr-wrap')?.remove();
  const w=document.createElement('div');w.id='tr-wrap';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
  w.onclick=e=>{if(e.target===w)w.remove();};
  const t=todayStr(),from=t.slice(0,8)+'01',fs='font-size:13px;padding:7px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  w.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:860px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><div style="font-size:17px;font-weight:800;flex:1">🚛 הובלות — מה יצא ומה נכנס</div>
      <button class="btn primary" style="font-size:12px" onclick="trIntakeDlg()">➕ קליטת סחורה</button>
      ${_trMgr()?'<button class="btn" style="font-size:12px" onclick="trCarriersDlg()">⚙ מובילים ומחירים</button>':''}
      <button class="btn" style="font-size:12px" onclick="document.getElementById('tr-wrap')?.remove()">✕</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <label style="font-size:12px">מתאריך<br><input id="tr-from" type="date" value="${from}" onchange="renderTransport()" style="${fs}"></label>
      <label style="font-size:12px">עד<br><input id="tr-to" type="date" value="${t}" onchange="renderTransport()" style="${fs}"></label>
      <label style="font-size:12px">מוביל<br><select id="tr-car" onchange="renderTransport()" style="${fs}"><option value="">כל המובילים</option>${trCarriers().map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="_none">לא נבחר מוביל</option></select></label>
    </div>
    <div id="tr-body"><div style="color:var(--txt3);font-size:13px">⏳ טוען…</div></div></div>`;
  document.body.appendChild(w);
  if(_trMgr()&&S.fbConnected)try{const d=await fbGet('adminSettings','transport');_trPrices=d?.p||{};}catch(e){}
  renderTransport();
}
async function _trLoadIntake(from,to,force){
  const key=from+'|'+to;if(!force&&key===_trIntakeKey)return;
  if(!db){_trIntake=[];return;}
  const{collection,getDocs,query,where}=window._fb;
  const sn=await getDocs(query(collection(db,'intake'),where('date','>=',from),where('date','<=',to)));
  _trIntake=sn.docs.map(d=>d.data()).filter(x=>x&&x.id);_trIntakeKey=key;
}
async function renderTransport(force){
  const box=document.getElementById('tr-body');if(!box)return;
  const from=document.getElementById('tr-from')?.value||'0000',to=document.getElementById('tr-to')?.value||'9999',cf=document.getElementById('tr-car')?.value||'';
  try{await _trLoadIntake(from,to,force);}catch(e){box.innerHTML='<div style="color:var(--red-txt)">⚠ לא ניתן לטעון את יומן הקליטה: '+esc(e?.code||e?.message||e)+'</div>';return;}
  const okCar=x=>{const l=trCarsOf(x);return !cf||(cf==='_none'?!l.length:l.includes(cf));};
  const outs=allDeliveryNotes().filter(r=>{const d=String(r.s.date||'').slice(0,10);return d>=from&&d<=to&&okCar(r.s);})
    .map(r=>({...r,q:trShipQty(r.s)})).sort((a,b)=>String(b.s.date||'').localeCompare(String(a.s.date||''))||(+b.s.no||0)-(+a.s.no||0));
  const ins=_trIntake.filter(x=>okCar(x)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||(+b.at||0)-(+a.at||0));
  // סיכום לפי מוביל
  const by={};const g=c=>by[c]||(by[c]={out:_trZero(),in:_trZero(),nOut:0,nIn:0});
  // 🚛🚛 הובלה דרך שני מובילים ⇒ נספרת אצל כל אחד מהם (כל אחד לפי המחירון שלו). בסינון מוביל — רק הוא
  const carsIn=x=>{const l=trCarsOf(x);return !l.length?['']:cf&&cf!=='_none'?l.filter(c=>c===cf):l;};
  outs.forEach(r=>carsIn(r.s).forEach(c=>{const x=g(c);_trSum(x.out,r.q);x.nOut++;}));
  ins.forEach(r=>carsIn(r).forEach(c=>{const x=g(c);_trSum(x.in,r);x.nIn++;}));
  const mg=_trMgr(),th='style="text-align:right;padding:6px 8px;font-size:12px;color:var(--txt3);font-weight:600;border-bottom:1px solid var(--brd)"',td='style="padding:6px 8px;border-bottom:1px solid var(--brd);font-size:13px"';
  const keys=Object.keys(by).sort((a,b)=>(a?0:1)-(b?0:1)||trCarName(a).localeCompare(trCarName(b),'he'));
  let tot=0;
  const sumRows=keys.map(c=>{const x=by[c],all=_trSum(_trSum(_trZero(),x.out),x.in),cost=c?_trCost(c,all):0;tot+=cost;
    const noPrice=mg&&c&&TR_KINDS.some(([k])=>all[k]>0&&!(+(_trPrices[c]||{})[k]));
    return `<tr><td ${td}><b>${esc(trCarName(c))}</b></td>
      <td ${td}>${_trQtyTxt(x.out,['hang','sack','carton'])||'—'}<div style="font-size:11px;color:var(--txt3)">${x.nOut} תעודות</div></td>
      <td ${td}>${_trQtyTxt(x.in)||'—'}<div style="font-size:11px;color:var(--txt3)">${x.nIn} קליטות</div></td>
      ${mg?`<td ${td}>${c?'<b>'+dnMoney(cost)+'</b>'+(noPrice?'<div style="font-size:11px;color:var(--amber-txt)">⚠ חסר מחיר</div>':''):'<span style="font-size:11px;color:var(--txt3)">בחרו מוביל בתעודות</span>'}</td>`:''}</tr>`;}).join('');
  const sum=keys.length?`<table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tr><th ${th}>מוביל</th><th ${th}>יצא ללקוחות</th><th ${th}>נכנס למפעל</th>${mg?`<th ${th}>לתשלום</th>`:''}</tr>${sumRows}
    ${mg&&keys.filter(Boolean).length>1?`<tr><td ${td} colspan="3"><b>סה"כ</b></td><td ${td}><b>${dnMoney(tot)}</b></td></tr>`:''}</table>`
    :'<div style="color:var(--txt3);font-size:13px;margin-bottom:12px">אין הובלות בטווח הזה.</div>';
  // פירוט
  const carSel=(cur,on,none)=>`<select onchange="${on}" style="font-size:12px;padding:3px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt);max-width:130px;display:block;margin:1px 0">${_trOpts(cur,none)}</select>`;
  const outHtml=outs.map(r=>{const p=r.p,s=r.s,qt=_trQtyTxt(r.q,['hang','sack','carton']);
    return `<tr><td ${td}>${_trDM(s.date)}</td><td ${td}>${s.no?String(s.no).padStart(4,'0'):'—'}${s.smp?' <span style="font-size:11px;color:var(--blue-txt)">דגם</span>':''}</td>
      <td ${td}>${esc(custName(p.cust))}<div style="font-size:11px;color:var(--txt3)">${esc(p.name||p.prod||'')} · ${+s.total||0} יח'</div></td>
      <td ${td}>${qt||'<span style="color:var(--amber-txt);font-size:12px">⚠ לא נרשמו קולבים/שקים</span>'}</td>
      <td ${td}>${carSel(s.car||'',`trSetShipCar('${escj(p.id)}',${r.i},'car',this.value)`,'— מוביל —')}${s.car?carSel(s.car2||'',`trSetShipCar('${escj(p.id)}',${r.i},'car2',this.value)`,'+ מוביל שני'):''}</td></tr>`;}).join('');
  const inHtml=ins.map(x=>`<tr><td ${td}>${_trDM(x.date)}</td><td ${td}>${esc(custName(x.cust||''))}${x.note?`<div style="font-size:11px;color:var(--txt3)">${esc(x.note)}</div>`:''}</td>
      <td ${td}>${_trQtyTxt(x)||'—'}</td><td ${td}>${trCarsOf(x).length?trCarsOf(x).map(c=>esc(trCarName(c))).join(' ⇐ '):esc(trCarName(''))}</td>
      <td ${td} style="white-space:nowrap"><button class="btn" style="font-size:11px;padding:3px 7px" onclick="trIntakeDlg('${escj(x.id)}')">✏️</button>${mg?` <button class="btn" style="font-size:11px;padding:3px 7px" onclick="trIntakeDel('${escj(x.id)}')">🗑</button>`:''}</td></tr>`).join('');
  box.innerHTML=sum
    +`<details open style="margin-bottom:10px"><summary style="font-weight:700;cursor:pointer;font-size:14px">📤 יצא ללקוחות (${outs.length})</summary>
      ${outs.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;margin-top:6px"><tr><th ${th}>תאריך</th><th ${th}>תעודה</th><th ${th}>לקוח / דגם</th><th ${th}>הובלה</th><th ${th}>מוביל</th></tr>${outHtml}</table></div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">קולבים — מחומר האריזה שנרשם בתעודה (כולל 👤 של הלקוח). שקים/קרטונים — מ"📦 אריזה" בחלון המשלוח.</div>`:'<div style="font-size:13px;color:var(--txt3)">אין.</div>'}</details>
    <details open><summary style="font-weight:700;cursor:pointer;font-size:14px">📥 נכנס למפעל (${ins.length})</summary>
      ${ins.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;margin-top:6px"><tr><th ${th}>תאריך</th><th ${th}>לקוח</th><th ${th}>מה נכנס</th><th ${th}>מוביל</th><th ${th}></th></tr>${inHtml}</table></div>`:'<div style="font-size:13px;color:var(--txt3)">אין — רשמו ב"➕ קליטת סחורה".</div>'}</details>`;
}
// שיוך מוביל לתעודה קיימת (גם בדיעבד) — רק car/car2, בלי לגעת בשאר התעודה. which = 'car' | 'car2'
async function trSetShipCar(pid,idx,which,car){
  if(!_trCan())return;
  const p=(S.products||[]).find(x=>x.id===pid);if(!p)return;
  const list=prodShipments(p).map(s=>({...s}));const s=list[idx];if(!s)return;
  const v={car:s.car||'',car2:s.car2||''};v[which==='car2'?'car2':'car']=car||'';
  if(!v.car&&v.car2){v.car=v.car2;v.car2='';}if(v.car2===v.car)v.car2='';
  trApplyCars(s,v);
  p.shipments=list;saveLS();
  if(S.fbConnected)try{await fbReplaceFields('products',p.id,{shipments:list});}catch(e){showToast('⚠ השמירה נכשלה','var(--red-txt)');return;}
  showToast('🚛 '+(trCarsOf(s).map(trCarName).join(' ⇐ ')||trCarName(''))+' · תעודה '+(s.no?String(s.no).padStart(4,'0'):''));
  renderTransport();
}

// ── קליטת סחורה ──
function trIntakeDlg(id){
  if(!_trCan())return;
  const x=id?_trIntake.find(r=>r.id===id):null;if(id&&!x)return;
  document.getElementById('tri-wrap')?.remove();
  const w=document.createElement('div');w.id='tri-wrap';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px';
  w.onclick=e=>{if(e.target===w)w.remove();};
  const fs='width:100%;font-size:14px;padding:8px;border-radius:8px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  const custs=Object.keys(S.customerNames||{}).sort();
  const lc=x||_trIntake.slice().sort((a,b)=>(+b.at||0)-(+a.at||0))[0]||{};
  w.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:380px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
    <div style="font-size:16px;font-weight:800;margin-bottom:10px">📥 ${x?'עריכת קליטה':'קליטת סחורה'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label style="font-size:12px;font-weight:600">תאריך<input id="tri-d" type="date" value="${esc(x?x.date:todayStr())}" max="${todayStr()}" style="${fs}"></label>
      <label style="font-size:12px;font-weight:600">לקוח<select id="tri-c" style="${fs}"><option value="">—</option>${custs.map(c=>`<option value="${esc(c)}"${x&&x.cust===c?' selected':''}>${esc(custName(c))}</option>`).join('')}</select></label>
      <label style="font-size:12px;font-weight:600">🚛 מוביל<select id="tri-car" style="${fs}">${_trOpts(lc.car||'','— לא נבחר —')}</select></label>
      <label style="font-size:12px;font-weight:600">🚛 מוביל שני<select id="tri-car2" style="${fs}">${_trOpts(lc.car2||'','— בלי —')}</select></label>
      ${[['sack','שקים'],['carton','קרטונים'],['roll','גלילים'],['hang','קולבי תלייה']].map(([k,l])=>`<label style="font-size:12px;font-weight:600">${l}<input id="tri-${k}" type="number" inputmode="numeric" min="0" value="${x&&+x[k]?+x[k]:''}" placeholder="0" style="${fs}"></label>`).join('')}
      <label style="font-size:12px;font-weight:600;grid-column:1/-1">📝 הערה<input id="tri-n" type="text" maxlength="140" value="${esc(x?.note||'')}" placeholder="למשל: בד להזמנה 00085" style="${fs}"></label>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" style="flex:1;font-size:14px" onclick="trIntakeSave('${x?escj(x.id):''}')">שמור</button>
      <button class="btn" style="flex:1;font-size:14px" onclick="document.getElementById('tri-wrap')?.remove()">ביטול</button></div></div>`;
  document.body.appendChild(w);
}
async function trIntakeSave(id){
  const v=k=>Math.max(0,parseInt(document.getElementById('tri-'+k)?.value)||0);
  const date=document.getElementById('tri-d')?.value||'',cust=document.getElementById('tri-c')?.value||'';let car=document.getElementById('tri-car')?.value||'',car2=document.getElementById('tri-car2')?.value||'';
  if(!car&&car2){car=car2;car2='';}if(car2===car)car2=''; // fbSet = merge ⇒ car2 נשמר כ-'' ולא נמחק
  const q={sack:v('sack'),carton:v('carton'),roll:v('roll'),hang:v('hang')},note=(document.getElementById('tri-n')?.value||'').trim().slice(0,140);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>todayStr()){alert('תאריך לא תקין');return;}
  if(!(q.sack+q.carton+q.roll+q.hang)){alert('רשמו כמה שקים / קרטונים / גלילים / קולבים נכנסו');return;}
  const old=id?_trIntake.find(r=>r.id===id):null;
  const rec={...(old||{}),id:id||('in_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),date,cust,car,car2,...q,note,
    ...(old?{editAt:Date.now(),editBy:S.user?.name||S.user?.user||''}:{at:Date.now(),by:S.user?.id||'',byName:S.user?.name||S.user?.user||''})};
  try{await fbSet('intake',rec.id,rec);}catch(e){alert('השמירה נכשלה: '+(e?.code||e?.message||e));return;}
  document.getElementById('tri-wrap')?.remove();
  showToast('📥 נקלט: '+_trQtyTxt(q));
  _trIntakeKey='';if(document.getElementById('tr-wrap'))renderTransport(true);
}
async function trIntakeDel(id){
  if(!_trMgr())return;const x=_trIntake.find(r=>r.id===id);if(!x)return;
  if(!await showConfirm('מחיקת קליטה','למחוק את הקליטה מ-'+_trDM(x.date)+' ('+_trQtyTxt(x)+')?','מחק','חזור'))return;
  try{await fbDel('intake',id);}catch(e){alert('המחיקה נכשלה: '+(e?.code||e?.message||e));return;}
  _trIntakeKey='';renderTransport(true);
}

// ── מובילים ומחירים (מנהל) ──
function trCarriersDlg(){
  if(!_trMgr())return;
  document.getElementById('trc-wrap')?.remove();
  const w=document.createElement('div');w.id='trc-wrap';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  w.onclick=e=>{if(e.target===w)w.remove();};
  w.innerHTML=`<div style="background:var(--card);border-radius:14px;padding:18px;max-width:640px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);margin:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:2px">⚙ מובילים ומחירים</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:10px">מחיר ליחידה (₪) — אותו מחיר ביציאה ובכניסה. המחירים גלויים למנהל בלבד; שמות המובילים — לכל מי שרושם משלוח.</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse" id="trc-t"><tr style="font-size:12px;color:var(--txt3)"><th style="text-align:right;padding:4px">שם המוביל</th>${TR_KINDS.map(([,l])=>`<th style="text-align:right;padding:4px">${l==='קולבים'?'קולב תלייה':l.replace(/ים$/,'')}</th>`).join('')}<th></th></tr>
      ${trCarriers().map(c=>_trcRow(c,_trPrices[c.id]||{})).join('')}</table></div>
    <button class="btn" style="width:100%;font-size:13px;margin-top:6px" onclick="document.getElementById('trc-t').insertAdjacentHTML('beforeend',_trcRow({id:'',name:''},{}))">➕ מוביל חדש</button>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" style="flex:1;font-size:14px" onclick="trCarriersSave()">שמור</button>
      <button class="btn" style="flex:1;font-size:14px" onclick="document.getElementById('trc-wrap')?.remove()">ביטול</button></div></div>`;
  document.body.appendChild(w);
}
function _trcRow(c,p){
  const fs='width:100%;min-width:60px;font-size:13px;padding:6px;border-radius:6px;border:1px solid var(--brd);background:var(--bg);color:var(--txt)';
  return `<tr class="trc-r" data-id="${esc(c.id)}"><td style="padding:3px"><input class="trc-n" value="${esc(c.name)}" placeholder="שם" style="${fs};min-width:110px"></td>
    ${TR_KINDS.map(([k])=>`<td style="padding:3px"><input class="trc-p" data-k="${k}" type="number" inputmode="decimal" min="0" step="0.01" value="${+p[k]||''}" placeholder="0" style="${fs}"></td>`).join('')}
    <td style="padding:3px"><button class="btn" style="font-size:12px;padding:4px 8px" title="הסר" onclick="this.closest('tr').remove()">🗑</button></td></tr>`;
}
async function trCarriersSave(){
  const rows=[...document.querySelectorAll('#trc-t .trc-r')],list=[],p={};
  for(const r of rows){const name=r.querySelector('.trc-n').value.trim();if(!name)continue;
    const id=r.dataset.id||('car_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5));
    if(list.some(c=>c.name===name)){alert('המוביל "'+name+'" מופיע פעמיים');return;}
    list.push({id,name});p[id]={};r.querySelectorAll('.trc-p').forEach(i=>{p[id][i.dataset.k]=Math.max(0,+i.value||0);});}
  try{await fbSet('appSettings','carriers',{list});await fbSet('adminSettings','transport',{p});}catch(e){alert('השמירה נכשלה: '+(e?.code||e?.message||e));return;}
  S.carriers=list;_trPrices={..._trPrices,...p};saveLS();
  document.getElementById('trc-wrap')?.remove();showToast('🚛 נשמרו '+list.length+' מובילים');
  if(document.getElementById('tr-wrap'))openTransport();
}
