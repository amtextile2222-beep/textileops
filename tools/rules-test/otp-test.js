// 🔐 בדיקת שער מכשיר המנהל (mgrDeviceGate) מול אמולטור Firestore — טלגרם מדומה (fetch מיורט).
// הרצה: cd tools/rules-test && npm run otp   (דורש Java, כמו test.js)
process.env.GCLOUD_PROJECT = 'demo-test';
process.env.TELEGRAM_TOKEN = 'fake';
process.env.TELEGRAM_CHATID = '1';
const crypto = require('crypto');
process.env.APP_EMERGENCYHASH = '$h:' + crypto.createHash('sha256').update('9999', 'utf8').digest('hex');
const sent = []; let tgDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('api.telegram.org')) {
    const b = JSON.parse(opt.body); sent.push(b.text);
    return { json: async () => (tgDown ? { ok: false, error_code: 500 } : { ok: true }) };
  }
  return realFetch(url, opt);
};
const fns = require('../../functions/index.js');
const admin = require('../../functions/node_modules/firebase-admin');
const db = admin.firestore();
// הטוקן עצמו לא נבדק כאן (דורש חשבון שירות) — רק מתי הוא מונפק
admin.auth().createCustomToken = async (uid, c) => 'tok:' + uid + ':' + c.role;
const ctx = { rawRequest: { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} } };
const login = d => fns.login.run(d, ctx);
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };
const err = async p => { try { await p; return ''; } catch (e) { return e.message; } };
const lastCode = () => { const m = /<code>(\d{6})<\/code>/.exec(sent[sent.length - 1] || ''); return m && m[1]; };
(async () => {
  await db.doc('workers/m1').set({ user: 'boss', role: 'manager', name: 'Boss' });
  await db.doc('credentials/m1').set({ pass: 'pw' });
  await db.doc('workers/w1').set({ user: 'wk', role: 'worker', name: 'Wk' });
  await db.doc('credentials/w1').set({ pass: 'pw' });

  let r = await login({ user: 'boss', pass: 'pw', deviceId: 'A' });
  t('מנהל ממכשיר חדש ⇒ needOtp בלי טוקן', r.needOtp && !r.token);
  const c1 = lastCode(); t('נשלח קוד בטלגרם', !!c1);
  t('failCount לא עלה', !((await db.doc('credentials/m1').get()).data().failCount > 0));
  const n1 = sent.length;
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A' });
  t('שוב תוך דקה ⇒ needOtp בלי קוד חדש', r.needOtp && sent.length === n1);
  t('סיסמה שגויה + קוד ⇒ wrong', (await err(login({ user: 'boss', pass: 'x', deviceId: 'A', otp: c1 }))) === 'wrong');
  t('קוד שגוי ⇒ otp-wrong', (await err(login({ user: 'boss', pass: 'pw', deviceId: 'A', otp: c1 === '000000' ? '111111' : '000000' }))) === 'otp-wrong');
  t('הקוד ממכשיר אחר ⇒ otp-expired', (await err(login({ user: 'boss', pass: 'pw', deviceId: 'B', otp: c1 }))) === 'otp-expired');
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A', otp: c1 });
  t('קוד נכון ⇒ טוקן', !!r.token);
  t('טלגרם: מכשיר אושר', /אושר/.test(sent[sent.length - 1]));
  t('אותו קוד לא עובד פעמיים', (await err(login({ user: 'boss', pass: 'pw', deviceId: 'B', otp: c1 }))) === 'otp-expired');
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A' });
  t('מכשיר מוכר ⇒ טוקן ישר', !!r.token && !r.needOtp);
  t('בלי deviceId ⇒ device-unknown', (await err(login({ user: 'boss', pass: 'pw' }))) === 'device-unknown');
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'B' });
  t('מכשיר B ⇒ needOtp', r.needOtp);
  // 5 קודים שגויים ⇒ הקוד נשרף
  for (let i = 0; i < 5; i++) await err(login({ user: 'boss', pass: 'pw', deviceId: 'B', otp: '000001' }));
  const cB = lastCode();
  t('אחרי 5 שגויים — גם הקוד הנכון נדחה', (await err(login({ user: 'boss', pass: 'pw', deviceId: 'B', otp: cB }))) !== '');
  await db.doc('credentials/m1').set({ failCount: 0, lockLevel: 0, lockUntil: 0 }, { merge: true });
  // חירום
  t('קוד חירום שגוי ⇒ emergency-wrong', (await err(login({ emergencyCode: '1', deviceId: 'A' }))) === 'emergency-wrong');
  await db.doc('credentials/_emergency').set({ failCount: 0, lockLevel: 0, lockUntil: 0 }, { merge: true });
  r = await login({ emergencyCode: '9999', deviceId: 'A' });
  t('קוד חירום ממכשיר מוכר ⇒ טוקן', !!r.token);
  r = await login({ emergencyCode: '9999', deviceId: 'C' });
  t('קוד חירום ממכשיר חדש ⇒ needOtp', r.needOtp && !r.token);
  r = await login({ emergencyCode: '9999', deviceId: 'C', otp: lastCode() });
  t('קוד חירום + קוד טלגרם ⇒ טוקן', !!r.token);
  // עובד רגיל — בלי שינוי
  r = await login({ user: 'wk', pass: 'pw', deviceId: 'Z' });
  t('עובד: כניסה רגילה בלי קוד', !!r.token && !r.needOtp);
  // ניתוק מכשירים
  t('עובד לא יכול לנתק מכשירי מנהל', (await err(fns.updateCredentials.run({ action: 'resetMgrDevices', targetId: 'm1' }, { auth: { uid: 'w1', token: { role: 'worker' } } }))) !== '');
  await fns.updateCredentials.run({ action: 'resetMgrDevices', targetId: 'm1' }, { auth: { uid: 'm1', token: { role: 'manager' } } });
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A' });
  t('אחרי ניתוק — מכשיר A שוב needOtp', r.needOtp);
  // 📱 רשימה וביטול מכשיר אחד
  const mctx = { auth: { uid: 'm1', token: { role: 'manager' } } };
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A', devLabel: 'iPhone · Safari <b>' });
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A', otp: lastCode(), devLabel: 'iPhone · Safari <b>' });
  t('אישור עם שם מכשיר', !!r.token && /📱 iPhone · Safari b/.test(sent[sent.length - 1]));
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'E' });
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'E', otp: lastCode() });
  let lst = (await fns.updateCredentials.run({ action: 'listMgrDevices', targetId: 'm1', deviceId: 'A' }, mctx)).list;
  t('רשימה: 2 מכשירים, A מסומן כנוכחי עם שם', lst.length === 2 && lst.some(x => x.cur && x.label === 'iPhone · Safari b'));
  t('רשימה לא חושפת את ה-UUID', !JSON.stringify(lst).includes('"A"') && lst.every(x => /^[0-9a-f]{32}$/.test(x.k)));
  t('עובד לא יכול לראות רשימה', (await err(fns.updateCredentials.run({ action: 'listMgrDevices', targetId: 'm1' }, { auth: { uid: 'w1', token: { role: 'worker' } } }))) !== '');
  const kE = lst.find(x => !x.cur).k;
  await fns.updateCredentials.run({ action: 'removeMgrDevice', targetId: 'm1', devKey: kE }, mctx);
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'E' });
  t('מכשיר שבוטל ⇒ needOtp', r.needOtp);
  r = await login({ user: 'boss', pass: 'pw', deviceId: 'A' });
  t('המכשיר השני לא נפגע', !!r.token);
  lst = (await fns.updateCredentials.run({ action: 'listMgrDevices', targetId: 'm1' }, mctx)).list;
  t('נראה לאחרונה מתעדכן', lst.length === 1 && lst[0].last >= lst[0].at);
  t('מפתח לא תקין נדחה', (await err(fns.updateCredentials.run({ action: 'removeMgrDevice', targetId: 'm1', devKey: 'x' }, mctx))) !== '');
  // טלגרם נופל
  tgDown = true;
  t('טלגרם לא זמין ⇒ otp-send', (await err(login({ user: 'boss', pass: 'pw', deviceId: 'D' }))) === 'otp-send');
  tgDown = false;
  // ⏫ נעילה מתארכת (14/11/2026): 1 → 5 → 15 → 60 דק', details לספירה לאחור, הצלחה מאפסת
  const errD = async p => { try { await p; return {}; } catch (e) { return { m: e.message, d: e.details || {} }; } };
  const cw = () => db.doc('credentials/w1');
  await cw().set({ failCount: 0, lockLevel: 0, lockUntil: 0 }, { merge: true });
  let e4; for (let i = 0; i < 4; i++) e4 = await errD(login({ user: 'wk', pass: 'x', deviceId: 'Z' }));
  t('ניסיון 4 ⇒ wrong עם n=4', e4.m === 'wrong' && e4.d.n === 4 && !e4.d.lockMs);
  const nTg = sent.length;
  let e5 = await errD(login({ user: 'wk', pass: 'x', deviceId: 'Z' }));
  t('ניסיון 5 ⇒ wrong + lockMs דקה', e5.m === 'wrong' && e5.d.lockMs === 60000);
  t('טלגרם: ננעל לדקה', sent.length === nTg + 1 && /ננעל לדקה/.test(sent[sent.length - 1]));
  let e6 = await errD(login({ user: 'wk', pass: 'pw', deviceId: 'Z' }));
  t('בזמן נעילה גם סיסמה נכונה ⇒ locked + leftMs', e6.m === 'locked' && e6.d.leftMs > 50000 && e6.d.leftMs <= 60000);
  const expire = () => cw().set({ lockUntil: Date.now() - 1 }, { merge: true });
  await expire(); for (let i = 0; i < 5; i++) e5 = await errD(login({ user: 'wk', pass: 'x', deviceId: 'Z' }));
  t('נעילה שנייה ⇒ 5 דק\'', e5.d.lockMs === 5 * 60000 && /ל-5 דקות/.test(sent[sent.length - 1]));
  await expire(); for (let i = 0; i < 5; i++) e5 = await errD(login({ user: 'wk', pass: 'x', deviceId: 'Z' }));
  t('נעילה שלישית ⇒ 15 דק\'', e5.d.lockMs === 15 * 60000);
  await expire(); for (let i = 0; i < 5; i++) e5 = await errD(login({ user: 'wk', pass: 'x', deviceId: 'Z' }));
  t('נעילה רביעית ⇒ שעה', e5.d.lockMs === 60 * 60000 && /לשעה/.test(sent[sent.length - 1]));
  await expire(); r = await login({ user: 'wk', pass: 'pw', deviceId: 'Z' });
  const cAfter = (await cw().get()).data();
  t('הצלחה ⇒ טוקן ואיפוס רמה', !!r.token && cAfter.lockLevel === 0 && cAfter.failCount === 0);
  for (let i = 0; i < 5; i++) e5 = await errD(login({ user: 'wk', pass: 'x', deviceId: 'Z' }));
  t('אחרי הצלחה — שוב דקה', e5.d.lockMs === 60000);
  // רשומה ישנה (לפני 14/11: בלי lockUntil) — החלון הישן מ-lastFail
  await cw().set({ failCount: 5, lastFail: Date.now() - 20000, lockUntil: admin.firestore.FieldValue.delete() }, { merge: true });
  e6 = await errD(login({ user: 'wk', pass: 'pw', deviceId: 'Z' }));
  t('רשומה ישנה ⇒ עדיין נעול (~40 שנ\')', e6.m === 'locked' && e6.d.leftMs > 30000 && e6.d.leftMs <= 40000);
  await cw().set({ failCount: 0, lockLevel: 0, lockUntil: 0 }, { merge: true });
  // 📱🔐 (14/11/2026) עובד עם נעילת מכשיר — מכשיר ראשון רק עם קוד מהמנהל
  await db.doc('workers/w2').set({ user: 'nw', role: 'worker', name: 'New', deviceBinding: true });
  await db.doc('credentials/w2').set({ pass: 'pw' });
  const cw2 = () => db.doc('credentials/w2');
  r = await login({ user: 'nw', pass: 'pw', deviceId: 'P1', devLabel: 'Galaxy' });
  t('עובד חדש ⇒ needOtp + devApprove, בלי טוקן', r.needOtp && r.devApprove && !r.token);
  t('טלגרם למנהל: בקשת רישום עם שם וקוד', /מבקש לרשום מכשיר/.test(sent[sent.length - 1]) && /New/.test(sent[sent.length - 1]) && !!lastCode());
  t('המכשיר עוד לא נרשם', !(await cw2().get()).data().deviceId);
  t('failCount לא עלה', !((await cw2().get()).data().failCount > 0));
  const wc = lastCode();
  t('סיסמה שגויה + קוד ⇒ wrong', (await err(login({ user: 'nw', pass: 'x', deviceId: 'P1', otp: wc }))) === 'wrong');
  t('קוד שגוי ⇒ otp-wrong', (await err(login({ user: 'nw', pass: 'pw', deviceId: 'P1', otp: wc === '000000' ? '111111' : '000000' }))) === 'otp-wrong');
  t('הקוד מטלפון אחר ⇒ otp-expired', (await err(login({ user: 'nw', pass: 'pw', deviceId: 'P2', otp: wc }))) === 'otp-expired');
  t('קוד המנהל לא עובד לעובד', (await err(login({ user: 'nw', pass: 'pw', deviceId: 'P1', otp: c1 === wc ? '123456' : c1 }))) !== '');
  await cw2().set({ failCount: 0 }, { merge: true });
  r = await login({ user: 'nw', pass: 'pw', deviceId: 'P1', otp: wc });
  t('קוד נכון ⇒ טוקן ומכשיר נרשם', !!r.token && (await cw2().get()).data().deviceId === 'P1' && (await db.doc('workers/w2').get()).data().deviceRegistered === true);
  t('טלגרם: מכשיר עובד נרשם', /מכשיר עובד נרשם/.test(sent[sent.length - 1]));
  r = await login({ user: 'nw', pass: 'pw', deviceId: 'P1' });
  t('כניסה חוזרת מאותו טלפון ⇒ בלי קוד', !!r.token && !r.needOtp);
  t('טלפון אחר ⇒ device (לא קוד)', (await err(login({ user: 'nw', pass: 'pw', deviceId: 'P2' }))) === 'device');
  // איפוס מכשיר ע"י המנהל ⇒ שוב קוד
  await fns.updateCredentials.run({ action: 'resetDevice', targetId: 'w2' }, mctx);
  r = await login({ user: 'nw', pass: 'pw', deviceId: 'P2' });
  t('אחרי איפוס ⇒ שוב needOtp', r.needOtp && r.devApprove);
  tgDown = true; await cw2().set({ devOtp: admin.firestore.FieldValue.delete() }, { merge: true });
  t('טלגרם לא זמין ⇒ otp-send', (await err(login({ user: 'nw', pass: 'pw', deviceId: 'P3' }))) === 'otp-send');
  tgDown = false;
  // רישום פנים (faceUpdateAllowed) ממכשיר לא רשום — הקוד לפני שמירת הפנים, והבקשה החוזרת עוברת
  await fns.updateCredentials.run({ action: 'resetDevice', targetId: 'w2' }, mctx);
  await db.doc('workers/w2').set({ faceAuth: true, faceUpdateAllowed: true }, { merge: true });
  await cw2().set({ devOtp: admin.firestore.FieldValue.delete(), failCount: 0 }, { merge: true });
  const fv = Array.from({ length: 128 }, (_, i) => i / 1000);
  r = await login({ user: 'nw', pass: 'pw', deviceId: 'P4', registerDescriptors: [fv] });
  t('רישום פנים ממכשיר חדש ⇒ needOtp, פנים לא נשמרו', r.needOtp && !(await cw2().get()).data().faceDescriptors && (await db.doc('workers/w2').get()).data().faceUpdateAllowed === true);
  r = await login({ user: 'nw', pass: 'pw', deviceId: 'P4', registerDescriptors: [fv], otp: lastCode() });
  t('קוד נכון ⇒ טוקן, פנים נשמרו, מכשיר נרשם', !!r.token && !!(await cw2().get()).data().faceDescriptors && (await cw2().get()).data().deviceId === 'P4');
  // עובד בלי נעילת מכשיר — בלי שינוי
  r = await login({ user: 'wk', pass: 'pw', deviceId: 'Q' });
  t('עובד בלי נעילת מכשיר ⇒ בלי קוד', !!r.token && !r.needOtp);
  console.log(`\n══ ${pass} עברו · ${fail} נכשלו ══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
