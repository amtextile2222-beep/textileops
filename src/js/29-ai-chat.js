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
// 📝 תשובת ה-AI מגיעה ב-Markdown (טבלאות, **מודגש**, ### כותרות, רשימות) — ממיר מצומצם.
// 🔒 קודם esc() לכל הטקסט, ורק אחר כך מוסיפים תגיות משלנו ⇒ שום HTML מהתשובה לא מגיע לדף.
function _aiInline(s){
  return s.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g,'$1<i>$2</i>');
}
function _aiMd(text){
  const L=esc(String(text||'')).split('\n'),out=[];let list=null;
  const closeList=()=>{if(list){out.push('</'+list+'>');list=null;}};
  const cells=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>_aiInline(c.trim()));
  for(let i=0;i<L.length;i++){
    const l=L[i];
    // טבלה: שורת כותרת + שורת |---|
    if(/^\s*\|.*\|\s*$/.test(l)&&/^\s*\|?\s*:?-{2,}/.test(L[i+1]||'')){
      closeList();
      const h=cells(l);i++;const rows=[];
      while(i+1<L.length&&/^\s*\|.*\|\s*$/.test(L[i+1])){i++;rows.push(cells(L[i]));}
      out.push('<div class="ai-tbl"><table><thead><tr>'+h.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+
        rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
      continue;
    }
    let m;
    if((m=l.match(/^\s*(#{1,4})\s+(.*)$/))){closeList();out.push('<div class="ai-h">'+_aiInline(m[2])+'</div>');continue;}
    if(/^\s*(-{3,}|\*{3,})\s*$/.test(l)){closeList();out.push('<hr>');continue;}
    if((m=l.match(/^\s*[-*•]\s+(.*)$/))){if(list!=='ul'){closeList();out.push('<ul>');list='ul';}out.push('<li>'+_aiInline(m[1])+'</li>');continue;}
    if((m=l.match(/^\s*\d+[.)]\s+(.*)$/))){if(list!=='ol'){closeList();out.push('<ol>');list='ol';}out.push('<li>'+_aiInline(m[1])+'</li>');continue;}
    closeList();
    out.push(l.trim()?'<div>'+_aiInline(l)+'</div>':'<div style="height:6px"></div>');
  }
  closeList();
  return out.join('');
}
function _aiAddMsg(text,role){
  const box=document.getElementById('ai-chat-msgs');
  const div=document.createElement('div');
  div.dir='auto';
  div.style.cssText=`padding:8px 10px;border-radius:8px;max-width:${role==='user'?'90%':'100%'};word-break:break-word;${role==='user'?'background:var(--blue-bg);color:var(--blue-txt);align-self:flex-end':'background:var(--bg2);color:var(--txt);align-self:flex-start'}`;
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
  const all=(S.products||[]).filter(p=>!p.isSample).map(p=>({p,st:pipeStateOf(p,byOrder[p.cust+'|'+p.prod+'|'+prodStampOf(p)]||[]),entry:pipeEntryDate(p)}));
  const rows=all.filter(r=>r.st.id!=='shipped')
    .sort((a,b)=>String(a.entry||'9999').localeCompare(String(b.entry||'9999')));
  const lines=rows.slice(0,80).map(({p,st,entry})=>{
    const no=parseInt(p.orderNo,10)||0,days=entry?Math.floor((today-new Date(entry).getTime())/864e5):null;
    const where=st.split?Object.entries(st.split).filter(([k,v])=>k!=='main'&&v>0).map(([k,v])=>lbl(k)+' '+v).join(', '):lbl(st.id);
    const low=[...(st.sew?.low||[]),...(st.pack?.low||[])].slice(0,3).join(' · ');
    return `- ${_aiCust(p.cust)} · מוצר ${p.prod}${no?' · הזמנה #'+no:''}${p.name?' · '+p.name:''} — ${where}`+
      ` · כמות ${st.qty||('~'+estQtyOf(p)+' משוער')}${entry?' · נכנס '+entry+(days!=null?' ('+days+' ימים)':''):''}${low?' · שלבים חסרים: '+low:''}`;
  });
  let txt=`=== לוח מצב הזמנות פתוחות (${rows.length}${rows.length>80?', מוצגות 80 הוותיקות':''}) ===\n`+(lines.join('\n')||'אין');
  // 🚚 (11/11/2026) הזמנות שיצאו ללקוח ב-30 הימים האחרונים — אחרת העוזר לא יודע לענות "כמה נשלחו" (עמודת "יצא ללקוח")
  const from=new Date(today-30*864e5).toISOString().slice(0,10);
  const sh=all.filter(r=>r.st.id==='shipped').map(r=>({...r,d:pipeShipDate(r.p)||''})).filter(r=>r.d>=from).sort((a,b)=>b.d.localeCompare(a.d));
  const shLines=sh.slice(0,60).map(({p,st,d})=>{const no=parseInt(p.orderNo,10)||0;
    return `- ${_aiCust(p.cust)} · מוצר ${p.prod}${no?' · הזמנה #'+no:''}${p.name?' · '+p.name:''} — יצא ${d} · ${st.outU||st.qty||0} יח' מתוך ${st.qty||0}`;});
  txt+=`\n\n=== הזמנות שיצאו ללקוח ב-30 הימים האחרונים (${sh.length}${sh.length>60?', מוצגות 60 האחרונות':''}) ===\n`+(shLines.join('\n')||'אין');
  _aiPipeCache={at:Date.now(),txt,money:_aiMoneyText(rows)};
  return txt;
}
// 💰 (11/11/2026) הכנסות לעוזר — רק עם הרשאת תמחור (העוזר עצמו מנהל בלבד). אותו חישוב כמו לשונית
// התעודות והתקורה: _incShipRows (dnUnitPrice × total + חומר אריזה). פתוחות = (כמות − מה שכבר יצא) × מחיר ליחידה.
// נשלח לפני לוח ההזמנות — הודעה ארוכה נחתכת מהסוף (AI_MSG_MAX), והסכומים חשובים מהרשימות.
function _aiMoneyText(openRows){
  if(typeof _canPricing!=='function'||!_canPricing())return '';
  try{
    const ils=v=>'₪'+Math.round(v).toLocaleString('he-IL');
    const ym=todayStr().slice(0,7),pd=new Date(+ym.slice(0,4),+ym.slice(5,7)-2,1),pym=pd.getFullYear()+'-'+pad2(pd.getMonth()+1);
    const shR=_incShipRows();
    const mon=m=>{const r=shR.filter(x=>x.date.slice(0,7)===m);
      return `${m}: ${r.length} תעודות, ${r.reduce((t,x)=>t+(+x.s.total||0),0)} יח', ${ils(r.reduce((t,x)=>t+x.work+x.pack,0))}`+
        (r.some(x=>x.noPrice)?` (בלי מחיר: ${[...new Set(r.filter(x=>x.noPrice).map(x=>x.p.prod))].join(', ')})`:'');};
    const op=openRows.map(({p,st})=>{const pr=dnUnitPrice(p),q=st.qty||estQtyOf(p),est=!st.qty&&q>0;
      const out=prodShipments(p).reduce((t,s)=>t+(+s.total||0)+shUnsewn(s),0),rem=Math.max(0,q-out);
      return {p,pr,rem,est,v:pr.missing?0:rem*pr.unit};}).filter(o=>o.rem>0);
    const opV=op.reduce((t,o)=>t+o.v,0),noP=op.filter(o=>o.pr.missing);
    const curV=shR.filter(x=>x.date.slice(0,7)===ym).reduce((t,x)=>t+x.work+x.pack,0);
    const lines=op.filter(o=>!o.pr.missing).sort((a,b)=>b.v-a.v).slice(0,30).map(({p,pr,rem,est,v})=>{const no=parseInt(p.orderNo,10)||0;
      return `- ${_aiCust(p.cust)} · מוצר ${p.prod}${no?' #'+no:''}: ${rem} יח'${est?' (משוער)':''} × ${pr.unit.toFixed(2)} = ${ils(v)}`;});
    return `=== הכנסות (₪, לפי המחירים בכרטיסי המוצרים — כמו בתעודות המשלוח: עבודה + חומר אריזה) ===\n`+
      `תעודות משלוח לפי תאריך התעודה — ${mon(ym)}\n${mon(pym)}\n`+
      `הזמנות פתוחות במפעל: ${op.length}, יתרה ${op.reduce((t,o)=>t+o.rem,0)} יח', שווי ${ils(opV)}`+
      (noP.length?` (בלי מחיר — לא נספרו: ${noP.map(o=>o.p.prod).join(', ')})`:'')+
      `\nצפי ${ym} אם כל הפתוחות ייצאו החודש: ${ils(curV+opV)} (יצא ${ils(curV)} + פתוחות ${ils(opV)})\n`+
      (lines.length?'שווי לפי הזמנה פתוחה:\n'+lines.join('\n'):'');
  }catch(e){console.warn('AI money:',e);return '';}
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
const AI_MSG_MAX=8000; // = החיתוך ב-aiChat בשרת. להגדיל רק אחרי פריסת שרת עם גבול גבוה יותר
async function sendAIMsg(){
  const input=document.getElementById('ai-chat-input');
  const q=input.value.trim();
  if(!q)return;
  input.value='';
  _aiAddMsg(q,'user');
  const bubble=_aiAddMsg('⏳ חושב...','ai');
  try{
    let pipe='';try{pipe=await _aiPipeText();}catch(e){console.warn('AI pipe:',e);}
    const ctx=[_buildAIContext(),_aiPipeCache.money||'',_aiLateText(),_aiStockText(),pipe].filter(Boolean).join('\n\n');
    // ✂ (11/11/2026) השאלה גם בראש: השרת חותך את ההודעה (AI_MSG_MAX) — חיתוך יוריד נתונים מהסוף, לא את השאלה
    const head='חשוב: ענה תמיד באותה שפה שבה נשאלת השאלה (עברית/ערבית/אנגלית).\n\nשאלה: '+q+'\n\nנתונים:\n',tail='\n\nשאלה (שוב): '+q;
    const room=AI_MSG_MAX-head.length-tail.length-40;
    const message=head+(ctx.length>room?ctx.slice(0,Math.max(0,room))+'\n…(נקטע)':ctx)+tail;
    const{httpsCallable}=window._fb;
    const result=await httpsCallable(window._fbFunctions,'aiChat')({message});
    bubble.classList.add('ai-md');
    bubble.innerHTML=_aiMd(result?.data?.textResponse||'לא התקבלה תשובה');
    document.getElementById('ai-chat-msgs').scrollTop=9999;
  }catch(e){
    console.error('AI error:',e);
    bubble.textContent='⛔ שגיאת חיבור ל-AI: '+(e.message||'');
  }
}
