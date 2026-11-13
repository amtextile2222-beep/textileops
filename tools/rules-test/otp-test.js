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
  await db.doc('credentials/m1').set({ failCount: 0 }, { merge: true });
  // חירום
  t('קוד חירום שגוי ⇒ emergency-wrong', (await err(login({ emergencyCode: '1', deviceId: 'A' }))) === 'emergency-wrong');
  await db.doc('credentials/_emergency').set({ failCount: 0 }, { merge: true });
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
  // טלגרם נופל
  tgDown = true;
  t('טלגרם לא זמין ⇒ otp-send', (await err(login({ user: 'boss', pass: 'pw', deviceId: 'D' }))) === 'otp-send');
  tgDown = false;
  console.log(`\n══ ${pass} עברו · ${fail} נכשלו ══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
