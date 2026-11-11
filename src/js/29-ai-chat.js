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
    const message='חשוב: ענה תמיד באותה שפה שבה נשאלת השאלה (עברית/ערבית/אנגלית).\n\n'+_buildAIContext()+'\n\nשאלה: '+q;
    const{httpsCallable}=window._fb;
    const result=await httpsCallable(window._fbFunctions,'aiChat')({message});
    bubble.textContent=result?.data?.textResponse||'לא התקבלה תשובה';
    document.getElementById('ai-chat-msgs').scrollTop=9999;
  }catch(e){
    console.error('AI error:',e);
    bubble.textContent='⛔ שגיאת חיבור ל-AI: '+(e.message||'');
  }
}
