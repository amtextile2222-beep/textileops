// 👕 בדיקת אישור דגם מדף הלקוח (customerTrack POST approve) מול אמולטור Firestore — טלגרם מדומה.
// הרצה: cd tools/rules-test && npm run smp   (דורש Java, כמו test.js)
process.env.GCLOUD_PROJECT = 'demo-test';
process.env.TELEGRAM_TOKEN = 'fake';
process.env.TELEGRAM_CHATID = '1';
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('api.telegram.org')) { sent.push(JSON.parse(opt.body).text); return { json: async () => ({ ok: true }) }; }
  return realFetch(url, opt);
};
const fns = require('../../functions/index.js');
const admin = require('../../functions/node_modules/firebase-admin');
const db = admin.firestore();
// הטוקן = JSON גלוי (האימות האמיתי דורש חשבון שירות)
admin.auth().verifyIdToken = async t => JSON.parse(t);
const custTok = { uid: 'c1', email: 'a@x.com', email_verified: true, auth_time: Math.floor(Date.now() / 1000) };
const call = (method, tok, body, q = {}) => new Promise(resolve => {
  const h = { authorization: 'Bearer ' + JSON.stringify(tok), 'x-dev': 'dev-12345678', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' };
  const req = { method, query: q, body, headers: h, get: k => h[String(k).toLowerCase()], socket: {} };
  const res = { _s: 200, set() { return res; }, status(s) { res._s = s; return res; }, json(j) { resolve({ s: res._s, j }); }, send(x) { resolve({ s: res._s, j: x }); } };
  fns.customerTrack(req, res);
});
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };
(async () => {
  await db.doc('adminSettings/custLinks').set({ emails: { '01': [{ e: 'a@x.com', at: 0, max: 0 }], '02': [{ e: 'b@x.com', at: 0, max: 0 }] } });
  await db.doc('appSettings/customerNames').set({ '01': 'Ronen & Co' });
  const smpSh = { no: 708, date: '2026-10-20', at: '2026-10-20T10:00:00Z', rows: [], total: 2, smp: true };
  await db.doc('products/p1').set({ cust: '01', prod: '14771', name: 'Shirt', orderNo: 1, quantities: [{ qty: 135 }], stageLog: [], shipments: [smpSh], createdAt: Date.now() - 86400000 });
  await db.doc('products/p2').set({ cust: '01', prod: '14775', name: 'NoSample', quantities: [{ qty: 10 }], stageLog: [], createdAt: Date.now() - 86400000 });
  await db.doc('products/p3').set({ cust: '02', prod: '07155', name: 'Other', quantities: [{ qty: 10 }], stageLog: [], shipments: [smpSh], createdAt: Date.now() - 86400000 });

  let r = await call('GET', custTok);
  const o1 = (r.j.orders || []).find(o => o.pid === 'p1');
  t('GET ⇒ הזמנה עם smp', r.s === 200 && o1 && o1.smp.length === 1 && o1.smp[0].n === 2 && o1.smp[0].d === '2026-10-20' && o1.smpOk === '');
  t('דגם בלבד ⇒ לא "יצא"/"מוכן ליציאה"', o1 && o1.stage < 6 && !o1.out);
  const o2 = (r.j.orders || []).find(o => o.pid === 'p2');
  t('הזמנה בלי דגם ⇒ בלי smp', o2 && !('smp' in o2));

  r = await call('POST', custTok, { approve: 'p2' });
  t('אישור הזמנה בלי דגם ⇒ 404', r.s === 404);
  r = await call('POST', custTok, { approve: 'p3' });
  t('אישור הזמנה של לקוח אחר ⇒ 404', r.s === 404 && !(await db.doc('products/p3').get()).data().smpOk);
  r = await call('POST', custTok, { approve: '../x' });
  t('מזהה לא תקין ⇒ 400', r.s === 400);
  r = await call('POST', { uid: 'm', role: 'manager' }, { approve: 'p1' }, { cust: '01' });
  t('תצוגת מנהל ⇒ 403', r.s === 403 && !(await db.doc('products/p1').get()).data().smpOk);

  const n0 = sent.length;
  r = await call('POST', custTok, { approve: 'p1' });
  const ok = (await db.doc('products/p1').get()).data().smpOk;
  t('אישור ⇒ 200 + smpOk במוצר', r.s === 200 && r.j.ok && ok && ok.via === 'cust' && ok.by === 'a@x.com' && +ok.at > 0);
  t('טלגרם: הלקוח אישר', sent.length === n0 + 1 && /אישר את הדגם/.test(sent[sent.length - 1]) && /&amp;/.test(sent[sent.length - 1]));
  r = await call('GET', custTok);
  t('GET מהמטמון ⇒ smpOk מעודכן', (r.j.orders || []).find(o => o.pid === 'p1').smpOk === r.j.orders.find(o => o.pid === 'p1').smpOk && !!r.j.orders.find(o => o.pid === 'p1').smpOk);
  r = await call('POST', custTok, { approve: 'p1' });
  t('אישור שני ⇒ 200 בלי טלגרם נוסף ובלי שינוי', r.s === 200 && sent.length === n0 + 1 && (await db.doc('products/p1').get()).data().smpOk.at === ok.at);

  // ↩ חזר למפעל — b בדף הלקוח (לקוח 02: עוד לא במטמון)
  await db.doc('products/p3').update({ shipments: [{ ...smpSh, back: { at: Date.parse('2026-10-25T09:00:00Z'), by: 'm' }, note: 'בדקו <מידות>' }] });
  r = await call('GET', { ...custTok, uid: 'c2', email: 'b@x.com' });
  const ob = (r.j.orders || []).find(o => o.pid === 'p3');
  t('חזר למפעל ⇒ b בתאריך החזרה', ob && ob.smp[0].b === '2026-10-25' && ob.smp[0].d === '2026-10-20');
  t('הערת התעודה ⇒ t', ob && ob.smp[0].t === 'בדקו <מידות>');
  // ✖ לא אושר
  await db.doc('products/p5').set({ cust: '01', prod: '14755', name: 'Rej', orderNo: 1, quantities: [{ qty: 5 }], stageLog: [], shipments: [smpSh], createdAt: Date.now() - 86400000 });
  r = await call('POST', custTok, { reject: 'p5' });
  t('לא אושר בלי סיבה ⇒ 400', r.s === 400 && !(await db.doc('products/p5').get()).data().smpNo);
  const n1 = sent.length;
  r = await call('POST', custTok, { reject: 'p5', why: 'צבע <כהה> מדי' });
  const sn = (await db.doc('products/p5').get()).data().smpNo;
  t('לא אושר ⇒ smpNo + why', r.s === 200 && sn && sn.why === 'צבע <כהה> מדי' && sn.via === 'cust');
  t('לא אושר ⇒ תשובה sd=no, so=false', r.j.sd && r.j.sd.k === 'no' && r.j.so === false && r.j.smpOk === '');
  t('טלגרם: לא אישר + הסיבה מוגנת', sent.length === n1 + 1 && /לא אישר/.test(sent[sent.length - 1]) && /&lt;כהה&gt;/.test(sent[sent.length - 1]));
  r = await call('POST', custTok, { approve: 'p5' });
  t('אחרי החלטה (בלי דגם חדש) ⇒ אישור לא נכתב', r.s === 200 && !(await db.doc('products/p5').get()).data().smpOk && sent.length === n1 + 1);
  const calc = require('../../functions/shared/calc.js');
  const pp = (await db.doc('products/p5').get()).data();
  pp.shipments = pp.shipments.concat([{ ...smpSh, no: 999, date: '2099-01-01', at: '2099-01-01T10:00:00Z' }]);
  const st = calc.smpState(pp);
  t('דגם מתוקן אחרי "לא אושר" ⇒ שוב פתוח', st.open && st.dec.k === 'no');
  pp.smpOk = { at: Date.parse('2099-02-01T00:00:00Z') };
  t('אישור אחרי הדגם המתוקן ⇒ סגור, אושר', !calc.smpState(pp).open && calc.smpState(pp).dec.k === 'ok');
  // 🔄 trackBump: שינוי במוצר ⇒ כל העותקים בונים מחדש
  await call('GET', custTok); // מטמון טרי ללקוח 01
  const before = (await db.doc('products/p2').get()).data();
  const after = { ...before, shipments: [smpSh] };
  await db.doc('products/p2').set(after);
  r = await call('GET', custTok);
  t('בלי bump ⇒ המטמון הישן', !(r.j.orders.find(o => o.pid === 'p2').smp));
  const snap = (d, ex = true) => ({ exists: ex, data: () => d });
  await new Promise(res => setTimeout(res, 5));
  await fns.trackBumpOnProduct.run({ before: snap({ ...before, stageLog: [1] }), after: snap({ ...before, stageLog: [1, 2] }) }, {});
  t('שינוי stageLog בלבד ⇒ בלי bump', !((await db.doc('adminSettings/trackBump').get()).data() || {})['01']);
  await fns.trackBumpOnProduct.run({ before: snap(before), after: snap(after) }, {});
  t('שינוי תעודות ⇒ bump ללקוח', +((await db.doc('adminSettings/trackBump').get()).data() || {})['01'] > 0);
  r = await call('GET', custTok);
  const o2b = r.j.orders.find(o => o.pid === 'p2');
  t('אחרי bump ⇒ נבנה מחדש (הדגם מופיע)', o2b && o2b.smp && o2b.smp.length === 1);
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
