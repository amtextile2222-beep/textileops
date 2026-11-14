// בדיקת firestore.rules מול אמולטור Firestore — פרויקט demo-test בלבד (לא נוגע בנתונים האמיתיים).
// חובה לפני כל פרסום של Rules (CLAUDE.md). דורש Java (Temurin 21) ו-firebase-tools.
//   cd tools/rules-test ; npm install ; npm test
// הפלט מסתיים ב-"N עברו · 0 נכשלו". שורות PERMISSION_DENIED בדרך הן הדחיות שהבדיקה מצפה להן.
// הבדיקות מדמות את הכתיבות של האפליקציה לפי תפקיד: עובד, עוזר, עובד עם הרשאת תעודות, אחראי, מנהל,
// משתמש בלי role (לקוח במעקב הזמנות) ולא מחובר. חוק חדש / אוסף חדש ⇒ להוסיף כאן שורת ok ושורת no.
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, orderBy, runTransaction } = require('firebase/firestore');

// emulators:exec מריץ מהשורש (firebase.json של הפרויקט) ומעביר את כתובת האמולטור במשתנה הסביבה
const EMU = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-test', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: EMU[0], port: +EMU[1] } });
  const ctx = (uid, role) => env.authenticatedContext(uid, role ? { role } : {}).firestore();
  const mgr = ctx('m1', 'manager'), sup = ctx('s1', 'supervisor'), wrk = ctx('w1', 'worker'), wdn = ctx('w2', 'worker'), hlp = ctx('h1', 'helper');
  const cust = ctx('c1', ''), anon = env.unauthenticatedContext().firestore();
  const JPG = 'data:image/jpeg;base64,' + 'A'.repeat(300000);

  const seed = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
      const d = c.firestore(), s = (p, v) => setDoc(doc(d, p), v);
      await s('workers/m1', { name: 'mgr', role: 'manager', user: 'm' });
      await s('workers/s1', { name: 'sup', role: 'supervisor', user: 's' });
      await s('workers/w1', { name: 'wrk', role: 'worker', user: 'w', status: 'out', sessions: [] });
      await s('workers/w2', { name: 'wdn', role: 'worker', user: 'w2', permissions: ['scan', 'dnotes'] });
      await s('workers/h1', { name: 'hlp', role: 'helper', user: 'h' });
      await s('appSettings/pushSettings', { enabled: true, alertPrefs: { punch_in: true }, tokens: { dev_m1_a: { token: 'ta', role: 'manager', workerId: 'm1' }, dev_s9_a: { token: 'tb', role: 'supervisor', workerId: 's9' } } });
      await s('appSettings/telegramSettings', { factoryIP: '1.2.3.4', shiftEnd: '15:00', bcKey: 'k' });
      await s('appSettings/packStock', { moves: [], min: {}, items: [] });
      await s('appSettings/customerNames', { '01': 'a' });
      await s('appSettings/rateW', { w: {}, p: {} });
      await s('appSettings/tgAlertLog', { sent: {} });
      await s('appSettings/deliveryNote', { last: 5 });
      await s('appSettings/proformaInvoice', { last: 5 });
      await s('thumbs/p1', { img: 'data:image/jpeg;base64,AAAA', at: 1 });
      await s('workerMessages/w1', { msg: 'hi', from: 'mgr', ts: 1, read: false });
      await s('workerMessages/h1', { msg: 'hi', from: 'mgr', ts: 1, read: false });
      await s('mgrInbox/i1', { fromId: 'w1', fromName: 'wrk', msg: 'x', ts: 1, read: false });
      await s('gateOverrides/g1', { id: 'g1', kind: 'station', result: 'blocked' });
      await s('workerWifi/h1', { ip: '9.9.9.9', lastSeen: 1 });
      await s('taskAlerts/a1', { sent: true });
      await s('wifiAlerts/w1', { sent: true });
      await s('activeTasks/t1', { workerId: 'w1', bc: '0100001001001' });
      await s('histTasks/h1', { workerId: 'w1', endTime: '2026-11-01T10:00:00.000Z' });
      await s('attHistory/w1_2026-11-01', { workerId: 'w1', date: '2026-11-01' });
      await s('products/p1', { cust: '01', prod: '00001', priced: true });
      await s('cashbox/cb1', { id: 'cb1', type: 'in', workerId: 'm1', amount: 100, ts: 1 });
      await s('workers/w3', { name: 'wcb', role: 'worker', user: 'w3', permissions: ['att', 'scan', 'cashbox'] });
      await s('workers/s2', { name: 'sup2', role: 'supervisor', user: 's2', permissions: ['att', 'scan', 'tasks'] });
      await s('productPricing/p1', { unitPrice: 10 });
      await s('adminSettings/costs', { workerRates: {} });
      await s('credentials/w1', { pass: 'x' });
      await s('cutPrints/p1', { html: '<b>x</b>', at: 1 });
      await s('productImages/p1', { images: [], count: 0, parts: 1 });
    });
  };

  let pass = 0; const fails = [];
  const ok = async (name, p) => { try { await assertSucceeds(p); pass++; } catch (e) { fails.push('✗ אמור לעבור: ' + name + ' — ' + String(e.code || e.message).slice(0, 90)); } };
  const no = async (name, p) => { try { await assertFails(p); pass++; } catch (e) { fails.push('✗ אמור להידחות: ' + name); } };
  const D = (db, p) => doc(db, p);

  await seed();

  // ═══ מנהל / אחראי — כל הנוכחות ═══
  for (const [nm, db] of [['מנהל', mgr], ['אחראי', sup]]) {
    await ok(nm + ': קריאת attHistory של כולם', getDocs(query(collection(db, 'attHistory'), where('date', '>=', '2026-10-01'), orderBy('date', 'desc'))));
    await ok(nm + ': attHistory כל הטווח (דוח נוכחות)', getDocs(query(collection(db, 'attHistory'), orderBy('date', 'desc'))));
  }
  await no('בלי role: קריאת attHistory', getDocs(query(collection(cust, 'attHistory'), where('workerId', '==', 'c1'))));

  // ═══ עובד / עוזר — פעולות רגילות חייבות להמשיך לעבוד ═══
  for (const [nm, db, uid] of [['עובד', wrk, 'w1'], ['עוזר', hlp, 'h1']]) {
    await ok(nm + ': קריאת workers', getDocs(collection(db, 'workers')));
    await ok(nm + ': קריאת activeTasks', getDocs(collection(db, 'activeTasks')));
    await ok(nm + ': קריאת products', getDocs(collection(db, 'products')));
    await ok(nm + ': קריאת appSettings (כל האוסף)', getDocs(collection(db, 'appSettings')));
    await ok(nm + ': קריאת histTasks חלון', getDocs(query(collection(db, 'histTasks'), where('endTime', '>=', '2026-10-01'))));
    // 👤 נוכחות לפי עובדת (14/11/2026): שאילתה רק על עצמו; get של רשומה בודדת (גם של אחר) פתוח
    await no(nm + ': קריאת attHistory של כולם', getDocs(query(collection(db, 'attHistory'), where('date', '>=', '2026-10-01'))));
    await ok(nm + ': קריאת attHistory שלו', getDocs(query(collection(db, 'attHistory'), where('workerId', '==', uid), where('date', '>=', '2026-10-01'), orderBy('date', 'desc'))));
    await ok(nm + ': attHistory שלו בלי תאריך (דוח אישי)', getDocs(query(collection(db, 'attHistory'), where('workerId', '==', uid), orderBy('date', 'desc'))));
    await no(nm + ': attHistory של עובדת אחרת (שאילתה)', getDocs(query(collection(db, 'attHistory'), where('workerId', '==', 'zz'), where('date', '>=', '2026-10-01'))));
    await ok(nm + ': get רשומת נוכחות של אחרת (ניקוי בוקר)', getDoc(D(db, 'attHistory/w1_2026-11-01')));
    await ok(nm + ': get רשומה שלא קיימת', getDoc(D(db, 'attHistory/zz_2026-11-02')));
    await ok(nm + ': כתיבת נוכחות של אחרת (ניקוי בוקר)', setDoc(D(db, 'attHistory/zz_2026-11-03'), { workerId: 'zz', date: '2026-11-03' }, { merge: true }));
    await ok(nm + ': קריאת stations', getDocs(collection(db, 'stations')));
    await ok(nm + ': קריאת cashbox', getDocs(collection(db, 'cashbox')));
    await ok(nm + ': פתיחת משימה', setDoc(D(db, 'activeTasks/n_' + uid), { workerId: uid, bc: '1' }, { merge: true }));
    await ok(nm + ': עדכון משימה', updateDoc(D(db, 'activeTasks/n_' + uid), { paused: true }));
    await ok(nm + ': סגירה להיסטוריה', setDoc(D(db, 'histTasks/n_' + uid), { workerId: uid, endTime: '2026-11-12T08:00:00.000Z' }, { merge: true }));
    await ok(nm + ': מחיקת משימה פעילה', deleteDoc(D(db, 'activeTasks/n_' + uid)));
    await ok(nm + ': החתמת נוכחות (כרטיס)', setDoc(D(db, 'workers/' + uid), { status: 'in', sessions: [{ in: 'x', out: null }], checkin: 'x', checkout: null }, { merge: true }));
    await ok(nm + ': רשומת נוכחות', setDoc(D(db, 'attHistory/' + uid + '_2026-11-12'), { workerId: uid, date: '2026-11-12' }, { merge: true }));
    await ok(nm + ': דופק טאב', setDoc(D(db, 'tabSessions/t_' + uid), { tabId: 't', workerId: uid, lastSeen: 1 }, { merge: true }));
    await ok(nm + ': מחיקת דופק טאב', deleteDoc(D(db, 'tabSessions/t_' + uid)));
    await ok(nm + ': שיוך תחנה', setDoc(D(db, 'stationLog/l_' + uid), { workerId: uid, from: 'x', to: null }, { merge: true }));
    await ok(nm + ': taskGuards בטרנזקציה', runTransaction(db, async tx => { const r = D(db, 'taskGuards/k_' + uid); await tx.get(r); tx.set(r, { by: uid, ts: 1 }); }));
    await ok(nm + ': tgAlertLog בטרנזקציה', runTransaction(db, async tx => { const r = D(db, 'appSettings/tgAlertLog'); const s = await tx.get(r); tx.set(r, { ...(s.data() || {}), ['k' + uid]: 1 }); }));
    await ok(nm + ': נעילת דוח יומי', runTransaction(db, async tx => { const r = D(db, 'appSettings/dailyReport'); await tx.get(r); tx.set(r, { date: '2026-11-12', by: uid }); }));
    await ok(nm + ': נעילת punchOutAlert', setDoc(D(db, 'appSettings/punchOutAlert'), { date: '2026-11-12' }, { merge: true }));
    await ok(nm + ': נעילת endOfDayAlert', setDoc(D(db, 'appSettings/endOfDayAlert'), { date: '2026-11-12' }, { merge: true }));
    await ok(nm + ': מונה תעודות משלוח', runTransaction(db, async tx => { const r = D(db, 'appSettings/deliveryNote'); const s = await tx.get(r); tx.set(r, { last: (s.data().last || 0) + 1 }, { merge: true }); }));
    await no(nm + ': כתיבת IP שלו (רק השרת)', setDoc(D(db, 'workerWifi/' + uid), { ip: '1.1.1.1', lastSeen: 1 }, { merge: true }));
    await ok(nm + ': קריאת ה-IP שלו', getDoc(D(db, 'workerWifi/' + uid)));
    await ok(nm + ': מחיקת ה-IP שלו (יציאה)', deleteDoc(D(db, 'workerWifi/' + uid)));
    await ok(nm + ': הודעה למנהל', addDoc(collection(db, 'mgrInbox'), { fromId: uid, fromName: nm, msg: 'm', ts: 1, read: false }));
    await ok(nm + ': רישום ביומן השערים', setDoc(D(db, 'gateOverrides/e_' + uid), { id: 'e', kind: 'k', result: 'r', workerId: uid }, { merge: true }));
    await ok(nm + ': קריאת ההודעה שלו', getDoc(D(db, 'workerMessages/' + uid)));
    await ok(nm + ': סימון ההודעה כנקראה', setDoc(D(db, 'workerMessages/' + uid), { ts: 1, read: true }, { merge: true }));
    await ok(nm + ': תמונת מוצר ממוזערת (300KB)', setDoc(D(db, 'thumbs/th_' + uid), { img: JPG, at: 1 }, { merge: true }));
    await ok(nm + ': קריאת תמונה ממוזערת', getDoc(D(db, 'thumbs/p1')));
    await ok(nm + ': מחיקת תמונה ממוזערת', deleteDoc(D(db, 'thumbs/th_' + uid)));
    await ok(nm + ': תמונות מוצר', setDoc(D(db, 'productImages/px_' + uid), { images: ['x'], count: 1, parts: 1 }, { merge: true }));
    await ok(nm + ': דף הדפסת גזירה', setDoc(D(db, 'cutPrints/px_' + uid), { html: '<b>y</b>', at: 2 }, { merge: true }));
    await ok(nm + ': עדכון מוצר (דוח גזירה/כמויות)', setDoc(D(db, 'products/p1'), { cutReport: { at: 2 } }, { merge: true }));
    await ok(nm + ': לקיחה מהקופה', setDoc(D(db, 'cashbox/c_' + uid), { id: 'c', type: 'out', workerId: uid, amount: 5 }));
    await ok(nm + ': הוצאה שלו', setDoc(D(db, 'workerExpenses/e_' + uid), { id: 'e', workerId: uid, amount: 5 }));

    // ── מה שנסגר ──
    await no(nm + ': תמונה עם הזרקה', setDoc(D(db, 'thumbs/bad_' + uid), { img: 'x" onerror="alert(1)', at: 1 }));
    await no(nm + ': תמונה — עדכון להזרקה', setDoc(D(db, 'thumbs/p1'), { img: 'data:image/jpeg;base64,AA" onerror="x' }, { merge: true }));
    await no(nm + ': תמונה בלי img', setDoc(D(db, 'thumbs/bad2_' + uid), { at: 1 }));
    await no(nm + ': pushSettings — רישום עצמי', setDoc(D(db, 'appSettings/pushSettings'), { tokens: { ['dev_' + uid]: { token: 'z', role: 'manager', workerId: uid } } }, { merge: true }));
    await no(nm + ': pushSettings — כיבוי', setDoc(D(db, 'appSettings/pushSettings'), { enabled: false }, { merge: true }));
    await no(nm + ': packStock', setDoc(D(db, 'appSettings/packStock'), { moves: [{ id: 1 }], min: {}, items: [] }));
    await no(nm + ': customerNames', setDoc(D(db, 'appSettings/customerNames'), { '09': 'x' }, { merge: true }));
    await no(nm + ': depts', setDoc(D(db, 'appSettings/depts'), { list: [] }));
    await no(nm + ': rateW', setDoc(D(db, 'appSettings/rateW'), { w: { [uid]: 1 } }, { merge: true }));
    await no(nm + ': breakDefault', setDoc(D(db, 'appSettings/breakDefault'), { start: '10:00', end: '12:00' }, { merge: true }));
    await no(nm + ': telegramSettings', setDoc(D(db, 'appSettings/telegramSettings'), { factoryIP: '' }, { merge: true }));
    await no(nm + ': מסמך הגדרות חדש', setDoc(D(db, 'appSettings/whatever'), { a: 1 }));
    await no(nm + ': מונה חשבוניות', setDoc(D(db, 'appSettings/proformaInvoice'), { last: 99 }, { merge: true }));
    await no(nm + ': מחיקת מסמך הגדרות', deleteDoc(D(db, 'appSettings/tgAlertLog')));
    await no(nm + ': IP של עובד אחר — כתיבה', setDoc(D(db, 'workerWifi/s1'), { ip: '1.2.3.4', lastSeen: 1 }));
    await no(nm + ': IP של עובד אחר — קריאה', getDoc(D(db, 'workerWifi/s1')));
    await no(nm + ': קריאת תיבת המנהל', getDocs(query(collection(db, 'mgrInbox'), where('read', '==', false))));
    await no(nm + ': הודעה למנהל בשם אחר', addDoc(collection(db, 'mgrInbox'), { fromId: 's1', msg: 'm', ts: 1, read: false }));
    await no(nm + ': סימון הודעה בתיבת המנהל', updateDoc(D(db, 'mgrInbox/i1'), { read: true }));
    await no(nm + ': קריאת יומן השערים', getDocs(collection(db, 'gateOverrides')));
    await no(nm + ': שינוי ביומן השערים', updateDoc(D(db, 'gateOverrides/g1'), { result: 'ok' }));
    await no(nm + ': מחיקה מיומן השערים', deleteDoc(D(db, 'gateOverrides/g1')));
    await no(nm + ': קריאת הודעה של אחר', getDoc(D(db, 'workerMessages/s1')));
    await no(nm + ': כתיבת הודעה לאחר', setDoc(D(db, 'workerMessages/s1'), { msg: 'x', from: 'x', ts: 1, read: false }));
    await no(nm + ': שינוי תוכן ההודעה שלו', setDoc(D(db, 'workerMessages/' + uid), { msg: 'fake', from: 'מנהל' }, { merge: true }));
    await no(nm + ': taskAlerts קריאה', getDoc(D(db, 'taskAlerts/a1')));
    await no(nm + ': taskAlerts מחיקה', deleteDoc(D(db, 'taskAlerts/a1')));
    await no(nm + ': wifiAlerts כתיבה', setDoc(D(db, 'wifiAlerts/' + uid), { sent: true }));
    await no(nm + ': adminSettings', getDoc(D(db, 'adminSettings/costs')));
    await no(nm + ': credentials', getDoc(D(db, 'credentials/w1')));
    await no(nm + ': productPricing', getDoc(D(db, 'productPricing/p1')));
    await no(nm + ': שינוי תפקיד לעצמו', updateDoc(D(db, 'workers/' + uid), { role: 'manager' }));
  }

  // ═══ עובד עם הרשאת תעודות משלוח ═══
  await ok('עובד+תעודות: מונה חשבוניות', runTransaction(wdn, async tx => { const r = D(wdn, 'appSettings/proformaInvoice'); const s = await tx.get(r); tx.set(r, { last: (s.data().last || 0) + 1 }, { merge: true }); }));
  await ok('עובד+תעודות: יומן ביטולים', setDoc(D(wdn, 'appSettings/deliveryVoids'), { list: [{ no: 1 }] }, { merge: true }));
  await ok('עובד+תעודות: תמחור', getDoc(D(wdn, 'productPricing/p1')));
  await no('עובד+תעודות: pushSettings', setDoc(D(wdn, 'appSettings/pushSettings'), { enabled: false }, { merge: true }));
  await no('עובד+תעודות: rateW', setDoc(D(wdn, 'appSettings/rateW'), { w: {} }));

  // ═══ אחראי ═══
  await ok('אחראי: מלאי בטרנזקציה', runTransaction(sup, async tx => { const r = D(sup, 'appSettings/packStock'); const s = await tx.get(r); tx.set(r, { ...s.data(), moves: [{ id: 1, n: 5 }] }); }));
  await ok('אחראי: שם לקוח', setDoc(D(sup, 'appSettings/customerNames'), { '03': 'c' }, { merge: true }));
  await ok('אחראי: פרטי לקוח (החלפה מלאה)', setDoc(D(sup, 'appSettings/customerInfo'), { '03': { tel: '1' } }));
  await ok('אחראי: צבע', setDoc(D(sup, 'appSettings/customColors'), { '21': 'x' }, { merge: true }));
  await ok('אחראי: מחלקות', setDoc(D(sup, 'appSettings/depts'), { list: ['a'], stations: {}, stageMap: {} }));
  await ok('אחראי: יומן ביטולים', setDoc(D(sup, 'appSettings/deliveryVoids'), { list: [] }, { merge: true }));
  await ok('אחראי: מונה חשבוניות', setDoc(D(sup, 'appSettings/proformaInvoice'), { last: 8 }, { merge: true }));
  await ok('אחראי: רישום מכשיר ל-Push (fbSetMerge עם כל המפה)', setDoc(D(sup, 'appSettings/pushSettings'), { tokens: { dev_m1_a: { token: 'ta', role: 'manager', workerId: 'm1' }, dev_s9_a: { token: 'tb', role: 'supervisor', workerId: 's9' }, dev_s1_x: { token: 'ts', name: 'sup', role: 'supervisor', workerId: 's1' } }, lastRegistered: 'now' }, { merge: true }));
  await ok('אחראי: רענון הטוקן של אותו מכשיר', setDoc(D(sup, 'appSettings/pushSettings'), { tokens: { dev_s1_x: { token: 'ts2', name: 'sup', role: 'supervisor', workerId: 's1' } }, lastRegistered: 'now2' }, { merge: true }));
  await ok('אחראי: קריאת תיבת המנהל', getDocs(query(collection(sup, 'mgrInbox'), where('read', '==', false))));
  await ok('אחראי: סימון הודעה כנקראה', updateDoc(D(sup, 'mgrInbox/i1'), { read: true }));
  await ok('אחראי: יומן השערים', getDocs(collection(sup, 'gateOverrides')));
  await ok('אחראי: רישום ביומן השערים', setDoc(D(sup, 'gateOverrides/e_s1'), { id: 'e', kind: 'k' }, { merge: true }));
  await ok('אחראי: הודעה לעובד', setDoc(D(sup, 'workerMessages/w1'), { msg: 'yo', from: 'sup', ts: 2, read: false }, { merge: true }));
  await no('אחראי: כתיבת IP של עובד (רק השרת)', setDoc(D(sup, 'workerWifi/w1'), { ip: '1.1.1.1', lastSeen: 1 }, { merge: true }));
  await ok('אחראי: מחיקת IP של עובד (יציאה)', deleteDoc(D(sup, 'workerWifi/w1')));
  await ok('אחראי: מחיקת היסטוריית משימה', deleteDoc(D(sup, 'histTasks/h1')));
  await ok('אחראי: תמחור', getDoc(D(sup, 'productPricing/p1')));
  await ok('אחראי: תמונת חומר', setDoc(D(sup, 'thumbs/pk_01_x'), { img: 'data:image/jpeg;base64,BBBB', at: 3 }, { merge: true }));
  await no('אחראי: pushSettings — כיבוי התראות', setDoc(D(sup, 'appSettings/pushSettings'), { enabled: false }, { merge: true }));
  await no('אחראי: pushSettings — שינוי alertPrefs', setDoc(D(sup, 'appSettings/pushSettings'), { alertPrefs: { punch_in: false } }, { merge: true }));
  await no('אחראי: pushSettings — שני מכשירים בבת אחת', setDoc(D(sup, 'appSettings/pushSettings'), { tokens: { a1: { token: '1' }, a2: { token: '2' } } }, { merge: true }));
  await no('אחראי: pushSettings — הסרת מכשיר', updateDoc(D(sup, 'appSettings/pushSettings'), { tokens: { dev_s1_x: { token: 'ts2' } } }));
  await no('אחראי: rateW', setDoc(D(sup, 'appSettings/rateW'), { w: {} }));
  await no('אחראי: telegramSettings', setDoc(D(sup, 'appSettings/telegramSettings'), { bcKey: 'zz' }, { merge: true }));
  await no('אחראי: breakDefault', setDoc(D(sup, 'appSettings/breakDefault'), { start: '1', end: '2' }));
  await no('אחראי: company', setDoc(D(sup, 'appSettings/company'), { name: 'x' }, { merge: true }));
  await no('אחראי: מחיקה מיומן השערים', deleteDoc(D(sup, 'gateOverrides/g1')));
  await no('אחראי: taskAlerts', getDoc(D(sup, 'taskAlerts/a1')));
  await no('אחראי: adminSettings', getDoc(D(sup, 'adminSettings/costs')));
  await no('אחראי: תמונה עם הזרקה', setDoc(D(sup, 'thumbs/zz'), { img: 'javascript:alert(1)', at: 1 }));

  // ═══ מנהל ═══
  await ok('מנהל: pushSettings — הגדרות', setDoc(D(mgr, 'appSettings/pushSettings'), { enabled: false, alertPrefs: { punch_in: false }, vapidKey: 'v' }, { merge: true }));
  await ok('מנהל: pushSettings — הסרת מכשיר', updateDoc(D(mgr, 'appSettings/pushSettings'), { tokens: { dev_m1_a: { token: 'ta' } } }));
  await ok('מנהל: telegramSettings', setDoc(D(mgr, 'appSettings/telegramSettings'), { bcKey: 'new', stationLock: true }, { merge: true }));
  await ok('מנהל: rateW', setDoc(D(mgr, 'appSettings/rateW'), { w: { w1: 1 }, p: {} }));
  await ok('מנהל: breakDefault', setDoc(D(mgr, 'appSettings/breakDefault'), { start: '10:30', end: '11:00' }, { merge: true }));
  await ok('מנהל: company + packPrices', Promise.all([setDoc(D(mgr, 'appSettings/company'), { name: 'x' }, { merge: true }), setDoc(D(mgr, 'appSettings/packPrices'), { hanger: 1 }, { merge: true })]));
  await ok('מנהל: מלאי', setDoc(D(mgr, 'appSettings/packStock'), { moves: [], min: {}, items: [] }));
  await ok('מנהל: adminSettings', setDoc(D(mgr, 'adminSettings/costs'), { rateCache: {} }, { merge: true }));
  await ok('מנהל: קריאת כל adminSettings', getDocs(collection(mgr, 'adminSettings')));
  await ok('מנהל: IP של עובד', getDoc(D(mgr, 'workerWifi/h1')));
  await no('מנהל: כתיבת IP של עובד (רק השרת)', setDoc(D(mgr, 'workerWifi/h1'), { ip: '1.1.1.1', lastSeen: 1 }, { merge: true }));
  await ok('מנהל: יומן השערים + מחיקה', Promise.all([getDocs(collection(mgr, 'gateOverrides')), deleteDoc(D(mgr, 'gateOverrides/g1'))]));
  await ok('מנהל: תיבת המנהל', getDocs(query(collection(mgr, 'mgrInbox'), where('read', '==', false))));
  await ok('מנהל: הודעה לעובד', setDoc(D(mgr, 'workerMessages/h1'), { msg: 'a', from: 'm', ts: 3, read: false }, { merge: true }));
  await ok('מנהל: תמונה ממוזערת + מחיקה', setDoc(D(mgr, 'thumbs/m'), { img: JPG, at: 1 }).then(() => deleteDoc(D(mgr, 'thumbs/m'))));
  await ok('מנהל: עובד חדש + מחיקה', setDoc(D(mgr, 'workers/n1'), { name: 'n', role: 'worker' }).then(() => deleteDoc(D(mgr, 'workers/n1'))));
  await ok('מנהל: מחיקת מסמך הגדרות', deleteDoc(D(mgr, 'appSettings/endOfDayAlert')));
  await ok('מנהל: מחיקת נוכחות', deleteDoc(D(mgr, 'attHistory/w1_2026-11-01')));
  await no('מנהל: תמונה עם הזרקה', setDoc(D(mgr, 'thumbs/zz'), { img: 'x" onerror="1', at: 1 }));
  await no('מנהל: credentials', getDoc(D(mgr, 'credentials/w1')));

  // ═══ בלי role (לקוח במעקב הזמנות) / לא מחובר ═══
  for (const [nm, db] of [['לקוח בלי role', cust], ['לא מחובר', anon]]) {
    await no(nm + ': workers', getDocs(collection(db, 'workers')));
    await no(nm + ': appSettings', getDoc(D(db, 'appSettings/telegramSettings')));
    await no(nm + ': thumbs', getDoc(D(db, 'thumbs/p1')));
    await no(nm + ': כתיבת thumbs', setDoc(D(db, 'thumbs/q'), { img: 'data:image/jpeg;base64,AA', at: 1 }));
    await no(nm + ': mgrInbox', addDoc(collection(db, 'mgrInbox'), { fromId: 'c1', msg: 'x' }));
    await no(nm + ': products', getDocs(collection(db, 'products')));
  }

  // ═══ 🧾 קופה לפי הרשאה (13/11/2026) ═══
  const wcb = ctx('w3', 'worker'), sup2 = ctx('s2', 'supervisor');
  await ok('עובד בלי permissions (ברירת מחדל): קריאת קופה', getDocs(collection(wrk, 'cashbox')));
  await ok('עובד עם הרשאת קופה: קריאת קופה', getDocs(collection(wcb, 'cashbox')));
  await ok('עובד עם הרשאת קופה: לקיחה', setDoc(D(wcb, 'cashbox/c_w3'), { id: 'c', type: 'out', workerId: 'w3', amount: 5 }));
  await no('עובד בלי הרשאת קופה: קריאת קופה', getDocs(collection(wdn, 'cashbox')));
  await no('עובד בלי הרשאת קופה: קריאת תנועה', getDoc(D(wdn, 'cashbox/cb1')));
  await no('עובד בלי הרשאת קופה: לקיחה', setDoc(D(wdn, 'cashbox/c_w2'), { id: 'c', type: 'out', workerId: 'w2', amount: 5 }));
  await ok('אחראי בלי permissions: קריאת קופה', getDocs(collection(sup, 'cashbox')));
  await no('אחראי עם הרשאות בלי קופה: קריאת קופה', getDocs(collection(sup2, 'cashbox')));
  await ok('מנהל: קריאת קופה', getDocs(collection(mgr, 'cashbox')));
  await ok('מנהל: הפקדה', setDoc(D(mgr, 'cashbox/in2'), { id: 'in2', type: 'in', workerId: 'm1', amount: 50 }));
  await no('עובד עם הרשאת קופה: הפקדה', setDoc(D(wcb, 'cashbox/in3'), { id: 'in3', type: 'in', workerId: 'w3', amount: 50 }));

  await env.cleanup();
  console.log('\n══ ' + pass + ' עברו · ' + fails.length + ' נכשלו ══');
  fails.forEach(f => console.log(f));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
