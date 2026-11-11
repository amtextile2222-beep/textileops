// ─── 🤖 עוזר AI — מנהל בלבד (הוחזר 11/11/2026 אחרי הסרה ב-22/10) ───
// הכפתור בסרגל (ai-chat-btn) מוצג ב-applyPerms רק למנהל. השאלה + תמונת מצב של המפעל נשלחות
// ל-Cloud Function aiChat, שאוכפת role=manager וקוראת ל-AnythingLLM ב-Railway (כתובת/מפתח ב-functions:config).
function openAIChat(){
  if(S.user?.role!=='manager')return;
  const p=document.getElementById('ai-chat-panel');if(!p)return;
  p.style.display='flex';
  document.getElementById('ai-chat-input').focus();
  const h=document.getElementById('ai-chat-header');
  if(h&&!h._dragInit){
    h._dragInit=true;
    let ox=0,oy=0;
    h.addEventListener('mousedown',e=>{
      if(e.target.tagName==='BUTTON')return;
      ox=e.clientX-p.getBoundingClientRect().left;
      oy=e.clientY-p.getBoundingClientRect().top;
      const onMove=e=>{
        p.style.left=Math.max(0,Math.min(window.innerWidth-p.offsetWidth,e.clientX-ox))+'px';
        p.style.top=Math.max(0,Math.min(window.innerHeight-p.offsetHeight,e.clientY-oy))+'px';
        p.style.bottom='auto';
      };
      const onUp=()=>{document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);};
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  }
}
function closeAIChat(){const p=document.getElementById('ai-chat-panel');if(p)p.style.display='none';}
function _aiAddMsg(text,role){
  const box=document.getElementById('ai-chat-msgs');
  const div=document.createElement('div');
  div.style.cssText=`padding:8px 10px;border-radius:8px;max-width:90%;word-break:break-word;${role==='user'?'background:var(--blue-bg);color:var(--blue-txt);align-self:flex-end':'background:var(--bg2);color:var(--txt);align-self:flex-start'}`;
  div.textContent=text;
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
  return div;
}
// 📊 הרחבה (11/11/2026): לוח מצב הזמנות (pipeStateOf — אותו חישוב כמו הלוח בדוחות), משימות שחרגו מהצפי,
// ומלאי חומרים חסר/נמוך. הלוח דורש את כל ההיסטוריה (loadHistRange('','')) ⇒ 💰 מטמון 10 דק' כדי לא
// לקרוא אלפי משימות מ-Firestore בכל שאלה.
let _aiPipeCache={at:0,txt:''};
const _aiCust=c=>(S.customerNames?.[c]?S.customerNames[c]+' ('+c+')':'לקוח '+c);
async function _aiPipeText(){
  if(_aiPipeCache.txt&&Date.now()-_aiPipeCache.at<600000)return _aiPipeCache.txt;
  const hist=await loadHistRange('','');
  const byOrder={},oc={};
  for(const t of [...hist,...(S.activeTasks||[])]){const k=t.cust+'|'+t.prod+'|'+taskOrderStamp(t,oc);(byOrder[k]||(byOrder[k]=[])).push(t);}
  const today=Date.now(),lbl=id=>(PIPE_LISTS[PIPE_IDX(id)]?.label||id).replace(/^\S+\s/,'');
  const rows=(S.products||[]).filter(p=>!p.isSample).map(p=>({p,st:pipeStateOf(p,byOrder[p.cust+'|'+p.prod+'|'+prodStampOf(p)]||[]),entry:pipeEntryDate(p)}))
    .filter(r=>r.st.id!=='shipped')
    .sort((a,b)=>String(a.entry||'9999').localeCompare(String(b.entry||'9999')));
  const lines=rows.slice(0,80).map(({p,st,entry})=>{
    const no=parseInt(p.orderNo,10)||0,days=entry?Math.floor((today-new Date(entry).getTime())/864e5):null;
    const where=st.split?Object.entries(st.split).filter(([k,v])=>k!=='main'&&v>0).map(([k,v])=>lbl(k)+' '+v).join(', '):lbl(st.id);
    const low=[...(st.sew?.low||[]),...(st.pack?.low||[])].slice(0,3).join(' · ');
    return `- ${_aiCust(p.cust)} · מוצר ${p.prod}${no?' · הזמנה #'+no:''}${p.name?' · '+p.name:''} — ${where}`+
      ` · כמות ${st.qty||('~'+estQtyOf(p)+' משוער')}${entry?' · נכנס '+entry+(days!=null?' ('+days+' ימים)':''):''}${low?' · שלבים חסרים: '+low:''}`;
  });
  const txt=`=== לוח מצב הזמנות פתוחות (${rows.length}${rows.length>80?', מוצגות 80 הוותיקות':''}) ===\n`+(lines.join('\n')||'אין');
  _aiPipeCache={at:Date.now(),txt};
  return txt;
}
function _aiLateText(){
  const late=(S.activeTasks||[]).filter(t=>+t.expectedMin>0&&(t.elapsed||0)/60>+t.expectedMin)
    .map(t=>`- ${t.workerName||'?'} · ${t.taskType||''} · ${_aiCust(t.cust)} מוצר ${t.prod} — ${Math.round((t.elapsed||0)/60)} דק' מתוך צפי ${Math.round(+t.expectedMin)}${t.paused?' (מושהית)':''}`);
  return `=== משימות פעילות שחרגו מהצפי (${late.length}) ===\n`+(late.join('\n')||'אין');
}
function _aiStockText(){
  try{
    const bal=pstkCalc(),{need}=pstkNeed(),min=(S.packStock||{}).min||{};
    const keys=[...new Set([...pstkShortKeys(bal,need),...pstkLowKeys(bal)])];
    const lines=keys.map(k=>{const[pool,mk]=k.split('|');
      return `- ${pstkKeyName(k)} (${pool===PSTK_F?'מלאי המפעל':'מלאי '+_aiCust(pool)}): יש ${pstkFmt(bal[k])}${pstkUnit(mk)}`+
        (need[k]?`, נדרש להזמנות פתוחות ${pstkFmt(need[k])}`:'')+(+min[k]?`, מינימום ${min[k]}`:'');});
    return `=== מלאי חומרים חסר או מתחת למינימום (${lines.length}) ===\n`+(lines.join('\n')||'אין');
  }catch(e){return '';}
}
// תמונת מצב של המפעל שנשלחת עם כל שאלה: נוכחות היום, משימות פעילות, שעות ומשימות של 7 ימים
function _buildAIContext(){
  const today=todayStr();
  const present=S.workers.filter(w=>w.checkin&&w.checkin.slice(0,10)===today&&w.role!=='manager');
  const absent=S.workers.filter(w=>w.role!=='manager'&&(!w.checkin||w.checkin.slice(0,10)!==today));
  const active=S.activeTasks||[];
  const weekStr=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const weeklyHours={};
  (S.attHistory||[]).filter(r=>r.date>=weekStr).forEach(r=>{
    const w=S.workers.find(x=>x.id===r.workerId);if(!w||w.role==='manager')return;
    weeklyHours[w.name]=(weeklyHours[w.name]||0)+(r.netMs||0)/3600000;
  });
  const weekSummary=Object.entries(weeklyHours).map(([n,h])=>`${n}: ${h.toFixed(1)}ש'`).join(', ')||'אין נתונים';
  const tasksByWorker={};
  (S.histTasks||[]).filter(t=>(t.startTime?String(t.startTime).slice(0,10):'')>=weekStr).forEach(t=>{
    const w=S.workers.find(x=>x.id===t.workerId);if(!w)return;
    tasksByWorker[w.name]=(tasksByWorker[w.name]||0)+1;
  });
  const taskSummary=Object.entries(tasksByWorker).map(([n,c])=>`${n}: ${c} משימות`).join(', ')||'אין נתונים';
  return`נתוני מפעל TextileOps לתאריך ${today}:

=== היום ===
נוכחים (${present.length}): ${present.map(w=>w.name+(w.status==='in'?' [בעבודה]':' [יצא]')).join(', ')||'אין'}
נעדרים (${absent.length}): ${absent.map(w=>w.name).join(', ')||'אין'}
משימות פעילות (${active.length}): ${active.map(t=>{const w=S.workers.find(x=>x.id===t.workerId);return(w?.name||'?')+' — '+taskBc(t);}).join(', ')||'אין'}

=== 7 ימים אחרונים ===
שעות עבודה לעובד: ${weekSummary}
משימות שהושלמו לעובד: ${taskSummary}`;
}
async function sendAIMsg(){
  const input=document.getElementById('ai-chat-input');
  const q=input.value.trim();
  if(!q)return;
  input.value='';
  _aiAddMsg(q,'user');
  const bubble=_aiAddMsg('⏳ חושב...','ai');
  try{
    let pipe='';try{pipe=await _aiPipeText();}catch(e){console.warn('AI pipe:',e);}
    const ctx=[_buildAIContext(),_aiLateText(),_aiStockText(),pipe].filter(Boolean).join('\n\n');
    const message='חשוב: ענה תמיד באותה שפה שבה נשאלת השאלה (עברית/ערבית/אנגלית).\n\n'+ctx+'\n\nשאלה: '+q;
    const{httpsCallable}=window._fb;
    const result=await httpsCallable(window._fbFunctions,'aiChat')({message});
    bubble.textContent=result?.data?.textResponse||'לא התקבלה תשובה';
    document.getElementById('ai-chat-msgs').scrollTop=9999;
  }catch(e){
    console.error('AI error:',e);
    bubble.textContent='⛔ שגיאת חיבור ל-AI: '+(e.message||'');
  }
}
