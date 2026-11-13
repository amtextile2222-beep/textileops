// ─── PRINT ───────────────────────────────────────────────────
function showPrintChoice(){
  const p=document.getElementById('print-choice-panel');
  p.classList.toggle('hidden');
}
function doPrintChoice(){
  const val=document.querySelector('input[name="print-choice"]:checked')?.value||'all';
  document.getElementById('print-choice-panel').classList.add('hidden');
  const now=new Date().toLocaleDateString('he-IL');
  let html='';
  if(val==='pipe'||val==='all'){
    html+=`<div class="card"><div class="sec">🏭 לוח מצב הזמנות</div>${pipePrintHtml()}</div>`;
  }
  if(val==='detail'||val==='all'){
    html+=`<div class="card"><div class="sec">פירוט לפי לקוח ומוצר</div><div class="tbl-wrap"><table><thead><tr><th>עובד</th><th>מחלקה</th><th>סוג משימה</th><th>לקוח</th><th>מוצר</th><th>מידה</th><th>כמות</th><th>צבע</th><th>התחלה</th><th>סיום</th><th>משך</th><th>סטטוס</th></tr></thead><tbody>${document.getElementById('rp-body')?.innerHTML||''}</tbody></table></div></div>`;
  }
  if(val==='summary'||val==='all'){
    html+=`<div class="card" style="margin-top:12px"><div class="sec">👥 דוח מרוכז — שעות לפי עובד</div>${document.getElementById('rp-summary-body')?.innerHTML||''}</div>`;
  }
  if(val==='expprod'||val==='all'){
    html+=`<div class="card" style="margin-top:12px"><div class="sec">🎯 בפועל מול צפי — לפי מוצר</div>${document.getElementById('rp-expprod-body')?.innerHTML||''}</div>`;
  }
  if(val==='stages'||val==='all'){
    html+=`<div class="card" style="margin-top:12px"><div class="sec">📦 דוח ייצור לפי שלב</div>${document.getElementById('rp-stages-body')?.innerHTML||''}</div>`;
  }
  if(val==='stepqty'||val==='all'){
    html+=`<div class="card" style="margin-top:12px"><div class="sec">🧵 כמות שהושלמה לפי שלב עבודה</div>${document.getElementById('rp-stepqty-body')?.innerHTML||''}</div>`;
  }
  if(val==='profit'||val==='all'){
    // details נסגרים בהדפסה — פותחים את כולם כדי שפירוט השלבים יודפס
    const body=(document.getElementById('rp-profit-body')?.innerHTML||'').replace(/<details/g,'<details open');
    if(body)html+=`<div class="card" style="margin-top:12px"><div class="sec">💰 רווח בפועל מול יעד — לפי מוצר</div>${body}</div>`;
  }
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/><title>דוח משימות</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:18px;margin-bottom:4px;color:#185FA5}.print-date{font-size:11px;color:#666;margin-bottom:16px}.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin-bottom:12px}.sec{font-size:14px;font-weight:700;margin-bottom:8px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f0f0f0;padding:7px 8px;text-align:right;font-weight:600;border-bottom:2px solid #ddd}td{padding:6px 8px;border-bottom:1px solid #eee}.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid #ccc}.badge.green{background:#dcfce7;color:#166534}.badge.red{background:#fee2e2;color:#b91c1c}.badge.amber{background:#fef3c7;color:#92400e}.badge.gray{background:#f0f0f0;color:#555}.badge.blue{background:#dbeafe;color:#1e40af}.bc-seg{display:inline-block;padding:1px 6px;border-radius:6px;background:#eef2ff;font-weight:700;font-size:11px}.g4{display:flex;gap:8px;margin-bottom:10px}.g4 .card{flex:1;padding:8px 10px;margin-bottom:0}.mlbl{font-size:10px;color:#666}.mval{font-size:15px;font-weight:700}summary{list-style:none}details{page-break-inside:avoid}@media print{body{padding:10px}}</style></head><body><h1>TextileOps — דוח משימות</h1><div class="print-date">${now}</div>${html}</body></html>`);
}
function printPage(pageId, title){
  const content=document.getElementById(pageId)?.innerHTML||'';
  const now=new Date().toLocaleDateString('he-IL');
  printViaIframe(`<!DOCTYPE html><html dir="rtl" lang="he"><head>
    <meta charset="UTF-8"/>
    <title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;font-size:13px}
      h1{font-size:18px;margin-bottom:4px;color:#185FA5}
      .print-date{font-size:11px;color:#666;margin-bottom:16px}
      .card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin-bottom:12px}
      .sec{font-size:14px;font-weight:700;margin-bottom:8px;color:#000}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f0f0f0;padding:7px 8px;text-align:right;font-weight:600;border-bottom:2px solid #ddd}
      td{padding:6px 8px;border-bottom:1px solid #eee}
      tr:last-child td{border-bottom:none}
      .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
      .g2,.g3,.g4{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
      .mval{font-size:20px;font-weight:700}
      .mlbl{font-size:11px;color:#666;margin-bottom:2px}
      .msub{font-size:11px;color:#999}
      .btn,.nb,.topbar,#nb-print-hide{display:none!important}
      @media print{body{padding:10px}}
    </style>
  </head><body>
    <h1>✂️ TextileOps — ${title}</h1>
    <div class="print-date">תאריך הדפסה: ${now}</div>
    ${content}
  </body></html>`);
}

// ─── EMERGENCY LOGIN PROTECTION ──────────────────────────────
let _logoClickCount=0;
let _logoClickTimer=null;
function handleLogoClick(){
  _logoClickCount++;
  clearTimeout(_logoClickTimer);
  _logoClickTimer=setTimeout(()=>{_logoClickCount=0;},2000);
  if(_logoClickCount>=5){
    _logoClickCount=0;
    document.getElementById('emrg-box').classList.remove('hidden');
    document.getElementById('l-emergency').value='';
    // התראת טלגרם — דרך login ולא sendTelegram: כאן עוד אין משתמש מחובר ו-tgSend דוחה קריאה לא מאומתת
    if(window._fbFunctions)loginCall({emergencyPanel:true}).catch(()=>{});
  }
}

// ─── WIFI MONITOR ────────────────────────────────────────────
// עובד/אחראי בפנים עם 🏭: כל 5 דקות (כשהטאב גלוי) מבקש מהשרת לרשום את ה-IP שלו.
// השרת לוקח את הכתובת מהבקשה עצמה (wifiPing) — הטלפון לא כותב ל-workerWifi (Rules חוסמים).
// ההתראות נשלחות רק מהשרת (wifiMonitor). הבדיקה הכפולה במחשב המנהל הוסרה 13/11/2026.
async function _wifiPing(wid){
  if(!window._fbFunctions||!S.fbConnected)return;
  try{const{httpsCallable}=window._fb;await httpsCallable(window._fbFunctions,'wifiPing')({wid});}catch(e){}
}
setInterval(()=>{
  if(document.hidden)return;
  const u=S.user;
  if(!u||u.role==='manager')return;
  const w=S.workers.find(x=>x.id===u.id);
  if(w&&w.status==='in'&&w.requireFactoryIP)_wifiPing(w.id);
},5*60*1000);

// ─── FACTORY IP CHECK ────────────────────────────────────────
// checkFactoryIP הוסר — בדיקת ה-IP עברה ל-Cloud Function login (בצד שרת, לא ניתנת לעקיפה)

