// בונה את index.html מהקבצים ב-src/ (09/11/2026). אין שינוי בהתנהגות: הקוד ב-src/js/*.js
// מחובר לפי סדר שמות הקבצים לבלוק <script> אחד — בדיוק כמו קודם (hoisting, _guardReentrant
// ופונקציות שנקראות בטעינה דורשים סקריפט אחד; קבצי <script src> נפרדים היו שוברים אותם בשקט).
//   node tools/build.js           — בונה, בודק תחביר, כותב index.html
//   node tools/build.js --check   — רק בודק ש-index.html תואם ל-src/ (ה-pre-commit hook)
//   node tools/build.js --where N — שורה N ב-index.html (משגיאה בקונסול) ⇒ קובץ:שורה ב-src/
const fs=require('fs'),path=require('path'),vm=require('vm'),os=require('os'),cp=require('child_process');
const R=path.join(__dirname,'..'),SRC=path.join(R,'src'),OUT=path.join(R,'index.html');
const CSS_MARK='/*@@CSS@@*/\n',JS_MARK='//@@JS@@\n';
const rd=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const parts=d=>fs.readdirSync(path.join(SRC,d)).filter(f=>/\.(js|css)$/.test(f)).sort()
  .map(f=>{const t=rd(path.join(SRC,d,f));if(!t.endsWith('\n'))throw new Error(`src/${d}/${f}: חסרה שורה ריקה בסוף`);return{f:`src/${d}/${f}`,t};});
function build(){
  const shell=rd(path.join(SRC,'shell.html'));
  const[a,rest]=shell.split(CSS_MARK),[b,c]=(rest||'').split(JS_MARK);
  if(rest===undefined||c===undefined)throw new Error('src/shell.html: חסר סימון '+(rest===undefined?CSS_MARK:JS_MARK));
  const css=parts('css'),js=parts('js');
  const out=a+css.map(p=>p.t).join('')+b+js.map(p=>p.t).join('')+c;
  // מפה: שורה ב-index.html ⇒ קובץ מקור
  const map=[];let ln=a.split('\n').length;
  css.forEach(p=>{map.push([ln,p.f]);ln+=p.t.split('\n').length-1;});
  map.push([ln,'src/shell.html (אחרי CSS)']);ln+=b.split('\n').length-1;
  const js0=ln;js.forEach(p=>{map.push([ln,p.f]);ln+=p.t.split('\n').length-1;});
  map.push([ln,'src/shell.html (סוף)']);
  return{out,map,js:js.map(p=>p.t).join(''),js0};
}
const where=(map,n)=>{let m=map[0];for(const x of map)if(x[0]<=n)m=x;return m[1].endsWith('.js')||m[1].endsWith('.css')?`${m[1]}:${n-m[0]+1}`:m[1];};
function syntax({out,js,js0,map}){
  try{new vm.Script(js,{filename:'main'});}catch(e){
    const m=/main:(\d+)/.exec(e.stack||'');const n=m?+m[1]+js0-1:0;
    throw new Error('שגיאת תחביר'+(n?' ב-'+where(map,n):'')+': '+e.message);
  }
  const mod=/<script type="module">([\s\S]*?)<\/script>/.exec(out);
  if(mod){const f=path.join(os.tmpdir(),'txops_mod_'+process.pid+'.mjs');fs.writeFileSync(f,mod[1]);
    try{cp.execFileSync(process.execPath,['--check',f],{stdio:'pipe'});}catch(e){throw new Error('שגיאת תחביר בבלוק ה-module: '+e.stderr);}finally{fs.unlinkSync(f);}}
}
const arg=process.argv[2];
try{
  const r=build();
  if(arg==='--where'){console.log(where(r.map,+process.argv[3]));process.exit(0);}
  const cur=fs.existsSync(OUT)?rd(OUT):'';
  if(arg==='--check'){
    if(cur!==r.out){console.error('✗ index.html לא תואם ל-src/ — לערוך רק ב-src/ ולהריץ: node tools/build.js');process.exit(1);}
    console.log('✓ index.html תואם ל-src/');process.exit(0);
  }
  syntax(r);
  if(cur===r.out)console.log('✓ תחביר תקין, index.html כבר מעודכן');
  else{fs.writeFileSync(OUT,r.out);console.log('✓ תחביר תקין, index.html נבנה ('+r.out.split('\n').length+' שורות)');}
}catch(e){console.error('✗ '+e.message);process.exit(1);}
