// בודק שכל פונקציה שמשתמשת ב-T.xxx (מילון תרגום) מגדירה את T בעצמה
// (כפרמטר או const T=LANGS[currentLang]) — מונע את באג "T is not defined"
// שחזר על עצמו 8 פעמים בקוד הזה.
// הרצה: node check-t-declarations.js
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const html = fs.readFileSync(path, 'utf8');

// קח רק את בלוק ה-<script> הראשי (לא ה-module של Firebase)
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => ({ full: m[0], body: m[1] }))
  .filter(s => !/type=["']module["']/.test(s.full));
if (!scripts.length) { console.error('לא נמצא <script> ראשי'); process.exit(1); }
const src = scripts[scripts.length - 1].body;

function findMatchingBrace(str, openIdx) {
  let depth = 0, i = openIdx;
  let inStr = null, inTemplate = false, inLineComment = false, inBlockComment = false;
  for (; i < str.length; i++) {
    const c = str[i], prev = str[i - 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '/' && prev === '*') inBlockComment = false; continue; }
    if (inStr) { if (c === inStr && prev !== '\\') inStr = null; continue; }
    if (inTemplate) { if (c === '`' && prev !== '\\') inTemplate = false; continue; }
    if (c === '/' && str[i + 1] === '/') { inLineComment = true; continue; }
    if (c === '/' && str[i + 1] === '*') { inBlockComment = true; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '`') { inTemplate = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const fnRe = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
let m, issues = [];
while ((m = fnRe.exec(src))) {
  const [full, name, params] = m;
  const openIdx = m.index + full.length - 1;
  const closeIdx = findMatchingBrace(src, openIdx);
  if (closeIdx === -1) continue;
  const body = src.slice(openIdx + 1, closeIdx);
  const usesT = /[^.\w]T\.[a-zA-Z_]/.test(' ' + body);
  if (!usesT) { fnRe.lastIndex = closeIdx; continue; }
  const hasParamT = params.split(',').map(p => p.trim().split('=')[0].trim()).includes('T');
  const declaresT = /(?:const|let|var)\s+T\s*=/.test(body);
  if (!hasParamT && !declaresT) {
    const lineNum = src.slice(0, m.index).split('\n').length;
    issues.push({ name, line: lineNum });
  }
  fnRe.lastIndex = closeIdx;
}

if (issues.length) {
  console.error(`❌ נמצאו ${issues.length} פונקציות שמשתמשות ב-T.xxx בלי להגדיר T:`);
  issues.forEach(i => console.error(`   - ${i.name} (שורה ~${i.line})`));
  process.exit(1);
} else {
  console.log('✅ כל הפונקציות שמשתמשות ב-T מגדירות אותה כראוי');
  process.exit(0);
}
