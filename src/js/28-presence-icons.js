// ─── דופק פר-טאב: מי באמת פתוח עכשיו ─────────────────────────────
// workerWifi מדווח פר *עובד* ורק כשהטאב גלוי (document.hidden ב-11112), ולכן הוא עיוור
// בדיוק לטאב המסוכן — זה שנשכח פתוח ברקע ומחזיק משימות בזיכרון (ندوه 00084: 227 שע').
// כאן: מזהה פר טאב ב-sessionStorage (שורד רענון, לא משותף בין טאבים של אותו דפדפן),
// דיווח גם כשהטאב מוסתר, וספירת המשימות שהטאב מחזיק — הנתון שמזהה מקור לרפאים.
const TAB_BEAT_MS=2*60*1000;         // טאב גלוי
const TAB_BEAT_HIDDEN_MS=10*60*1000; // ברקע — דלילות בכוונה, לחסוך כתיבות
const TAB_LIVE_MS=6*60*1000;         // עד כאן "חי" בתצוגה
const TAB_STALE_MS=60*60*1000;       // מעבר לזה — לא מוצג ומועמד לניקוי
let _tabBeatLast=0;
const _tabOpenedAt=Date.now();
function tabId(){
  let id=sessionStorage.getItem('txops_tab');
  if(!id){id='t'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);sessionStorage.setItem('txops_tab',id);}
  return id;
}
// דגם המכשיר לא זמין לדפדפן — מספיק תיאור קצר שיאפשר לזהות *איזה* מכשיר במפעל
function _tabDevice(){
  const u=navigator.userAgent||'';
  const os=/Android/i.test(u)?'Android':/iPhone|iPad|iPod/i.test(u)?'iOS':/Windows/i.test(u)?'Windows':/Mac OS/i.test(u)?'Mac':'?';
  const br=/EdgA?\//.test(u)?'Edge':/Firefox\//.test(u)?'Firefox':/Chrome\//.test(u)?'Chrome':/Safari\//.test(u)?'Safari':'?';
  const pwa=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches?' · PWA':'';
  return os+' · '+br+pwa;
}
async function tabBeat(force){
  if(!db||!S.fbConnected||!S.user)return; // לפני התחברות אין role claim — הכתיבה תיחסם בכללים
  const hidden=document.hidden;
  const gap=hidden?TAB_BEAT_HIDDEN_MS:TAB_BEAT_MS;
  if(!force&&Date.now()-_tabBeatLast<gap-500)return;
  _tabBeatLast=Date.now();
  // מה שהטאב הזה מחזיק *בזיכרון שלו*, לא מה שיש בשרת — זה בדיוק מה שטאב רפאים כותב בחזרה
  const act=S.activeTasks||[];
  let oldHeld=0,oldIds=[];
  // oldIds — כדי שהפאנל יבחין בין "טאב תקוע שמחזיק משימה שכבר נסגרה" לבין משימה ישנה שבאמת פתוחה בשרת
  try{const st=act.filter(t=>_isStaleTask(t));oldHeld=st.length;oldIds=st.slice(0,50).map(t=>String(t.id));}catch(e){}
  try{
    await fbSet('tabSessions',tabId(),{
      tabId:tabId(),
      workerId:S.user.id||'',workerName:S.user.name||'',role:S.user.role||'',
      ver:_appVerTag?String(_appVerTag.sz):'',verMt:_appVerTag?(_appVerTag.mt||0):0,
      verStale:!!_appVerStale,
      hidden,kiosk:/[?&#]kiosk=1\b/.test(location.href),
      device:_tabDevice(),
      held:act.length,oldHeld,oldIds,
      openedAt:_tabOpenedAt,lastSeen:srvNow().getTime()
    });
  }catch(e){}
}
setInterval(()=>{tabBeat(false);},30*1000);
setTimeout(()=>tabBeat(true),4000);

// ─── מדידה זמנית (22/08/2026): התראת טלגרם כשנפתח טאב שני לאותו עובד ──────
// 🛑 **מדידה בלבד — לא חוסמת, לא משתלטת, לא נוגעת בשום נתון.** הוחלט לאסוף
// כמה ימי נתונים לפני שמחליטים אם בכלל צריך אכיפה. להסרה: למחוק את הפונקציה
// ואת הקריאה היחידה אליה ב-finishLogin.
//
// ⚠️ למה זה לא בדיקה חד-פעמית פשוטה: **טאב שנהרג משאיר רשומה שנראית חיה.**
// pagehide הוא best-effort, ו-iOS/אנדרואיד הורגים טאבים ברקע — עד 5 פעמים
// ביום לאותו עובד (זו הסיבה שנבנה _restoreSession). בדיקה תמימה הייתה מדווחת
// על כל הריגה כאילו נפתח טאב שני, והמדידה הייתה חסרת ערך.
// לכן: קוראים פעמיים ומסווגים לפי האם הדופק **התקדם** בין הקריאות.
//   🟢 חי ומדווח   — lastSeen זז ⇒ טאב פתוח באמת
//   🟡 לא ודאי     — לא זז, אבל צעיר מ-11 דק' ⇒ או גופה שלא נסגרה, או טאב
//                    ברקע (TAB_BEAT_HIDDEN_MS=10 דק') שפשוט טרם דיווח
// מתריע **הטאב החדש ביותר בלבד** — אחרת שני הטאבים היו מתריעים על אותו אירוע.
// פעם אחת לכל טאב: הדגל ב-sessionStorage, ששורד רענון ⇒ רענון אינו אירוע חדש.
// מוחרגים: מסך התצוגה (kiosk=1 רץ כטאב נפרד כל היום) ומנהל (פותח טאבים כשגרה).
const MT_RECHECK_MS=3.5*60*1000;  // חלון אימות — טאב גלוי מדווח כל 2 דק'
const MT_MAYBE_MS=11*60*1000;     // מעבר לזה גם טאב ברקע כבר היה מדווח
async function _checkMultiTab(){
  try{
    if(!db||!S.fbConnected||!S.user)return;
    if(S.user.role==='manager')return;
    if(/[?&#]kiosk=1\b/.test(location.href))return;
    if(sessionStorage.getItem('txops_multitab_sent'))return;
    const{collection,getDocs}=window._fb;
    const mine=tabId(),wid=S.user.id;
    const read=async()=>{
      const snap=await getDocs(collection(db,'tabSessions'));
      const now=srvNow().getTime();
      return snap.docs.map(d=>d.data())
        .filter(r=>r.workerId===wid&&r.tabId!==mine&&!r.kiosk&&now-(r.lastSeen||0)<MT_MAYBE_MS);
    };
    const first=await read();
    if(!first.length)return;
    const seen={};first.forEach(r=>{seen[r.tabId]=r.lastSeen||0;});
    // רק החדש ביותר מתריע. שוויון ב-openedAt (נדיר) נשבר לפי tabId.
    if(first.some(r=>(r.openedAt||0)>_tabOpenedAt||((r.openedAt||0)===_tabOpenedAt&&String(r.tabId)>mine)))return;
    await new Promise(res=>setTimeout(res,MT_RECHECK_MS));
    if(!S.user||S.user.id!==wid)return; // יצא/התחלף בינתיים
    const second=await read();
    if(!second.length)return;
    const now=srvNow().getTime();
    const live=second.filter(r=>(r.lastSeen||0)>(seen[r.tabId]||0));
    const maybe=second.filter(r=>!((r.lastSeen||0)>(seen[r.tabId]||0)));
    if(!live.length&&!maybe.length)return;
    sessionStorage.setItem('txops_multitab_sent','1');
    const line=r=>{
      const ago=Math.round((now-(r.lastSeen||0))/60000);
      const up=Math.round((now-(r.openedAt||now))/60000);
      return '   • '+(r.device||'?')+' — דופק לפני '+(ago<1?"פחות מדקה":ago+" דק'")
        +' · פתוח '+(up<1?"פחות מדקה":up+" דק'")+' · מחזיק '+(r.held||0)+' משימות'
        +((g=>g?' ⚠ '+g+' נשכחו':'')(Array.isArray(r.oldIds)?r.oldIds.filter(id=>!(S.activeTasks||[]).some(t=>String(t.id)===String(id))).length:(r.oldHeld||0)));
    };
    await sendTelegram(
      '📑 TextileOps — יותר מטאב אחד לאותו עובד\n'+
      '👤 '+(S.user.name||'?')+' · '+(S.user.role||'')+'\n'+
      '🆕 נפתח עכשיו: '+_tabDevice()+'\n'+
      (live.length?'\n🟢 פתוחים באמת (הדופק התקדם) — '+live.length+':\n'+live.map(line).join('\n'):'')+
      (maybe.length?'\n🟡 לא ודאי (ייתכן טאב שנהרג ולא נסגר) — '+maybe.length+':\n'+maybe.map(line).join('\n'):'')+
      '\n\nמדידה בלבד — שום דבר לא נחסם.');
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tabBeat(true);});
// סגירת טאב — ניסיון מחיקה מיידי כדי שהרשימה לא תתמלא ברוחות. best-effort בלבד:
// הדפדפן לא מחכה לבקשת רשת בסגירה. הסינון לפי lastSeen הוא הרשת הבטוחה.
window.addEventListener('pagehide',()=>{try{if(db&&S.fbConnected&&S.user)fbDel('tabSessions',tabId());}catch(e){}});

// ─── מסך ניהול: מי פתוח עכשיו, מאיזו גרסה ────────────────────────
// נקרא מהשרת ולא מ-S — זו בדיוק השאלה "מה קורה במכשירים *אחרים*".
async function renderTabSessions(){
  const el=document.getElementById('tab-sessions');if(!el)return;
  const box=(bg,txt,html)=>`<div style="font-size:12px;padding:8px;border-radius:8px;border:1px solid var(--brd);background:var(--${bg});color:var(--${txt})">${html}</div>`;
  el.innerHTML=box('bg2','txt3','טוען…');
  if(!db||!S.fbConnected){el.innerHTML=box('bg2','txt3','אין חיבור לשרת — הרשימה נקראת מהשרת בלבד');return;}
  try{
    const{collection,getDocs}=window._fb;
    const snap=await getDocs(collection(db,'tabSessions'));
    const now=srvNow().getTime();
    const all=snap.docs.map(d=>d.data());
    const rows=all.filter(r=>now-(r.lastSeen||0)<TAB_STALE_MS).sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0));
    if(!rows.length){el.innerHTML=box('bg2','txt3','אין טאבים פעילים'+(all.length?` (${all.length} ישנים — לחץ 🧹)`:''));return;}
    const live=rows.filter(r=>now-(r.lastSeen||0)<TAB_LIVE_MS);
    const perWorker=new Set(rows.map(r=>r.workerId||r.tabId));
    // ריבוי טאבים לאותו עובד הוא הדפוס שיוצר רפאים — טאב אחד סוגר, השני עוד מחזיק
    const dup={};rows.forEach(r=>{if(r.workerId)dup[r.workerId]=(dup[r.workerId]||0)+1;});
    const dupNames=rows.filter(r=>dup[r.workerId]>1).reduce((m,r)=>{m[r.workerName]=dup[r.workerId];return m;},{});
    const vers={};rows.forEach(r=>{const v=r.ver||'?';vers[v]=(vers[v]||0)+1;});
    const verList=Object.entries(vers).sort((a,b)=>b[1]-a[1]);
    // 👻 (13/11/2026) "נשכחו" = משימה ישנה שהטאב מחזיק **ושכבר לא קיימת בשרת** (= רפאים שהוא עלול לכתוב בחזרה).
    // עד היום כל משימה מושהית מעל יומיים סומנה — אחרי חג/סופ"ש כל הטאבים התקינים נצבעו באדום עם אותן משימות.
    // משימות ישנות שבאמת פתוחות בשרת — שורה נפרדת (לטיפול בניהול משימות), לא "טאב תקוע".
    // דיווח מגרסה ישנה (בלי oldIds) — כמו קודם.
    const srvIds=new Set((S.activeTasks||[]).map(t=>String(t.id)));
    const ghostOf=r=>Array.isArray(r.oldIds)?r.oldIds.filter(id=>!srvIds.has(String(id))).length:(r.oldHeld||0);
    rows.forEach(r=>{r.ghost=ghostOf(r);});
    const risk=rows.filter(r=>r.ghost>0);
    let srvStale=0;try{srvStale=(S.activeTasks||[]).filter(t=>_isStaleTask(t)).length;}catch(e){}
    const head=box(risk.length?'amber-bg':'green-bg',risk.length?'amber-txt':'green-txt',
      `📡 <b>${rows.length}</b> טאבים · <b>${live.length}</b> חיים כרגע · <b>${perWorker.size}</b> עובדים`+
      `<div style="margin-top:4px">גרסאות: ${verList.map(([v,n])=>`<code>${esc(v)}</code> ×${n}`).join(' · ')}`+
      (verList.length>1?' <span style="color:var(--red-txt);font-weight:700">← לא כולם על אותה גרסה</span>':' ✅ כולם על אותה גרסה')+`</div>`+
      (Object.keys(dupNames).length?`<div style="margin-top:4px">⚠ יותר מטאב אחד: ${Object.entries(dupNames).map(([n,c])=>esc(n)+' ×'+c).join(' · ')}</div>`:''));
    const warn=risk.length?box('red-bg','red-txt',
      `⛔ <b>${risk.length} טאבים מחזיקים משימות שנשכחו פתוחות</b> (מעל ${STALE_TASK_DAYS} ימים). זה המקור למשימות רפאים — סגור אותם:`+
      `<div style="margin-top:4px">${risk.map(r=>esc(r.workerName||'?')+' — '+r.ghost+' משימות · '+esc(r.device||'')).join('<br>')}</div>`):'';
    const srvNote=srvStale?box('bg2','txt2',`⏸ <b>${srvStale}</b> משימות מושהות מעל ${STALE_TASK_DAYS} ימים קיימות בשרת (אחרי חג/סופ"ש זה צפוי — מתחדשות בסריקה). אם נשכחו — סגור בניהול משימות. זה לא טאב תקוע.`):'';
    el.innerHTML=head+warn+srvNote+`<div style="max-height:320px;overflow:auto;margin-top:6px">${rows.map(r=>{
      const ago=Math.round((now-(r.lastSeen||0))/60000);
      const up=Math.round((now-(r.openedAt||now))/3600000);
      const isLive=now-(r.lastSeen||0)<TAB_LIVE_MS;
      const me=r.tabId===tabId();
      return `<div style="padding:6px 8px;border-bottom:1px solid var(--brd);font-size:12px${r.ghost>0?';background:var(--red-bg)':''}">
        <span style="font-weight:700">${isLive?'🟢':'🟡'} ${esc(r.workerName||'?')}</span>
        <span style="color:var(--txt3)"> · ${esc(r.role||'')} · ${esc(r.device||'')}${r.kiosk?' · 📺 מסך תצוגה':''}${me?' · <b>הטאב הזה</b>':''}</span>
        ${r.hidden?'<span class="badge gray" style="font-size:10px">ברקע</span>':''}
        ${r.verStale?'<span class="badge red" style="font-size:10px">גרסה ישנה</span>':''}
        <div style="margin-top:2px;color:var(--txt2)">
          דיווח לפני ${ago===0?'פחות מדקה':ago+" דק'"} · פתוח ${up<1?'פחות משעה':up+" שע'"} ·
          מחזיק ${r.held||0} משימות${r.ghost>0?` <span style="color:var(--red-txt);font-weight:700">(${r.ghost} נשכחו!)</span>`:''} ·
          <code>${esc(r.ver||'?')}</code>
        </div>
      </div>`;}).join('')}</div>`;
  }catch(e){el.innerHTML=box('bg2','red-txt','❌ '+esc(e.message));}
}
// ניקוי ידני — טאבים שלא דיווחו מעל שעה. אין ניקוי אוטומטי בכוונה: האוסף זעיר,
// ומחיקה אוטומטית הייתה מוחקת ראיה בדיוק כשמחפשים טאב רפאים.
async function cleanTabSessions(){
  if(!db||!S.fbConnected)return;
  try{
    const{collection,getDocs}=window._fb;
    const snap=await getDocs(collection(db,'tabSessions'));
    const now=srvNow().getTime();
    const old=snap.docs.filter(d=>now-((d.data().lastSeen)||0)>TAB_STALE_MS);
    if(!old.length){showToast('אין רשומות ישנות למחיקה');return;}
    if(!await showConfirm('ניקוי מכשירים',`למחוק ${old.length} רשומות של טאבים שלא דיווחו מעל שעה?`))return;
    for(const d of old)await fbDel('tabSessions',d.id);
    showToast(`נמחקו ${old.length} רשומות`);
    renderTabSessions();
  }catch(e){showToast('❌ '+e.message,'var(--red-txt)');}
}

// 🎨 (03/11/2026) אייקונים אחידים — Lucide (ISC, lucide.dev), מוטמעים בקובץ כדי לעבוד גם בלי רשת.
// אמוג'י בתחילת כפתור/לשונית/כותרת (.nb .btn .sec .mlbl .modal-title) מוחלף ב-SVG — גם בתוכן שנבנה אחר כך
// (MutationObserver). אמוג'י שלא במפה נשאר. ↩/✕ לא במפה בכוונה — stageToggleSkip משווה את הטקסט שלהם.
// בלי אמוג'י בהודעות/טלגרם/הדפסות — רק במסך. data-noico על אלמנט = לא לגעת.
const ICO={'layout-dashboard':'<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>','clock':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>','clipboard-list':'<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>','scan-barcode':'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>','camera':'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>','circle-check':'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>','monitor':'<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>','trending-up':'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>','bell':'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>','settings':'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>','briefcase':'<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>','link':'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>','coins':'<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>','banknote':'<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>','receipt':'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>','shirt':'<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>','tag':'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>','file-text':'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>','trash-2':'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>','save':'<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>','plus':'<path d="M5 12h14"/><path d="M12 5v14"/>','refresh-cw':'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>','printer':'<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>','pencil':'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>','nfc':'<path d="M6 8.32a7.43 7.43 0 0 1 0 7.36"/><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58"/><path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8"/><path d="M16.37 2a20.16 20.16 0 0 1 0 20"/>','message-circle':'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>','folder-open':'<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>','package':'<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>','scissors':'<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>','upload':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>','download':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>','truck':'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>','play':'<polygon points="6 3 20 12 6 21 6 3"/>','megaphone':'<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>','credit-card':'<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>','log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>','flask-conical':'<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>','search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>','user':'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>','users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>','square-pen':'<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>','key-round':'<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>','target':'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>','ban':'<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>','mail':'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>','x':'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>','lock-open':'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>','lock':'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>','smartphone':'<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>','cloud':'<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>','calendar':'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>','hard-hat':'<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/>','bot':'<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>','wrench':'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>','factory':'<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>','recycle':'<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>','triangle-alert':'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>','paperclip':'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>','eye':'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>','timer':'<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>','trophy':'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>','landmark':'<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>','map-pin':'<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>','square':'<rect width="18" height="18" x="3" y="3" rx="2"/>','coffee':'<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>','radio':'<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>','palette':'<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>','minus':'<path d="M5 12h14"/>','check':'<path d="M20 6 9 17l-5-5"/>','square-check':'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>','brush':'<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>','notebook':'<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/>','list-checks':'<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>','scan-line':'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>'};
const ICO_EMO={'📊':'layout-dashboard','🕐':'clock','📋':'clipboard-list','📷':'camera','📸':'camera','✅':'circle-check','📺':'monitor','📈':'trending-up','🔔':'bell','⚙':'settings','👔':'briefcase','🔗':'link','💰':'coins','💸':'banknote','🧾':'receipt','👗':'shirt','🏷':'tag','📄':'file-text','🗑':'trash-2','💾':'save','➕':'plus','🔄':'refresh-cw','🖨':'printer','✏':'pencil','✍':'pencil','📶':'nfc','💬':'message-circle','📁':'folder-open','📂':'folder-open','📦':'package','✂':'scissors','📤':'upload','📥':'download','⬇':'download','🚚':'truck','▶':'play','📢':'megaphone','💳':'credit-card','🚪':'log-out','🧪':'flask-conical','🔍':'search','🔎':'search','👤':'user','👥':'users','📝':'square-pen','🔑':'key-round','🎯':'target','🚫':'ban','📩':'mail','✖':'x','🔓':'lock-open','🔒':'lock','📱':'smartphone','📲':'smartphone','☁':'cloud','📅':'calendar','👷':'hard-hat','🤖':'bot','🔧':'wrench','🏭':'factory','♻':'recycle','⚠':'triangle-alert','📎':'paperclip','👁':'eye','⏱':'timer','🏆':'trophy','💵':'banknote','🏦':'landmark','📍':'map-pin','⏹':'square','☕':'coffee','📡':'radio','🎨':'palette','➖':'minus','✔':'check','☑':'square-check','🧹':'brush','📒':'notebook','📻':'radio'};
const ICO_NB={'nb-tasks':'list-checks','nb-scan':'scan-barcode','nb-taskscan':'scan-line'};
function icoSvg(n){const b=ICO[n];return b?'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+b+'</svg>':'';}
const _ICO_SEL='.nb,.btn,.sec,.mlbl,.modal-title,.logo',_ICO_RE=/^\s*(\p{Extended_Pictographic})\uFE0F?\s*/u;
function _icoOne(el){
  if(el.dataset.noico!=null||el.closest('[data-noico]'))return;
  let t=el.firstChild;while(t&&t.nodeType===3&&!t.nodeValue.trim())t=t.nextSibling;
  if(!t||t.nodeType!==3)return;
  const m=t.nodeValue.match(_ICO_RE);if(!m)return;
  const n=ICO_NB[el.id]||ICO_EMO[m[1]];if(!n||!ICO[n])return;
  t.nodeValue=t.nodeValue.slice(m[0].length);
  el.insertBefore(document.createRange().createContextualFragment(icoSvg(n)),t);
}
function decorateIcons(root){
  if(!root||root.nodeType!==1)return;
  if(root.matches(_ICO_SEL))_icoOne(root);
  root.querySelectorAll(_ICO_SEL).forEach(_icoOne);
}
(function(){
  const go=()=>{decorateIcons(document.body);
    new MutationObserver(ms=>{for(const m of ms){
      if(m.target.nodeType===1){const c=m.target.closest(_ICO_SEL);if(c)_icoOne(c);}
      m.addedNodes.forEach(decorateIcons);}}).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
})();
