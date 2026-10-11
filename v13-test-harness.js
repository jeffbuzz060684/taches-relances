// Harnais de tests — Tâches & Relances v13 (fusion multi-appareils sûre : pull-before-push, tombstones/restauration, séries protégées, pannes par source) (Node pur, aucun paquet)
// Usage : node v13-test-harness.js  →  0 échec obligatoire avant publication
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'taches-relances-v13.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: bloc <script> introuvable'); process.exit(1); }
const code = m[1];

// ---------- Stubs navigateur ----------
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
function makeEl(id) {
  return {
    id: id || '', value: '', textContent: '', innerHTML: '', className: '', style: {},
    files: null, checked: false,
    appendChild() {}, click() {}, addEventListener() {}, setAttribute() {}, select() {}, focus() {},
    classList: { add() {}, remove() {}, toggle() {} }
  };
}
const els = {};
global.document = {
  documentElement: { className: '' },
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement() { const e = makeEl(); e.href = ''; e.download = ''; return e; },
  body: { appendChild() {}, removeChild() {} },
  addEventListener(ev, fn) { (global.__docListeners = global.__docListeners || {})[ev] = (global.__docListeners[ev] || []).concat(fn); }
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, serviceWorker: { register() { return Promise.resolve({}); } } }, configurable: true });
// Stubs v7 : presse-papiers (codes, copie de liste) + fallback execCommand
global.navigator.clipboard = { writeText: function (t) { global.__copied = t; return Promise.resolve(); } };
global.document.execCommand = function () { return true; };
// Stubs v10 : badge d'icône, partage natif, thème
global.__badge = null; global.__badgeCleared = false; global.__shared = null;
Object.defineProperty(globalThis, 'navigator', { value: Object.assign({}, globalThis.navigator, {
  onLine: true,
  serviceWorker: { register() { return Promise.resolve({}); }, addEventListener() {}, controller: undefined },
  setAppBadge: function (n) { global.__badge = n; return Promise.resolve(); },
  clearAppBadge: function () { global.__badgeCleared = true; global.__badge = null; return Promise.resolve(); },
  share: function (data) { global.__shared = data; return Promise.resolve(); }
}), configurable: true });
// Stubs v8 : confirmation d'import + pilotage fetch (erreurs API, pagination, 409, Drive injoignable)
global.confirm = function () { return true; };
global.__apiFail = false;
global.__pageTwo = false;
global.__postDup = false;
global.__driveFail = false;
global.addEventListener = function () {}; // stub window.addEventListener (load / visibilitychange)

// fetch : requêtes enregistrées + réponses pilotées par __writeMode / __eventsFixture / __offline / __driveRemote
const reqs = [];
let seq = 0;
global.fetch = function (url, options) {
  options = options || {};
  reqs.push({ url: String(url), method: options.method || 'GET', body: options.body || null, seq: ++seq });
  const u = String(url);
  if (global.__offline && u.includes('calendar/v3/calendars/primary/events') && options.method && options.method !== 'GET') {
    return Promise.reject(new Error('offline'));
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 'AT-TEST' }) });
  }
  if (u.includes('calendar/v3/calendars/primary/events')) {
    if (!options.method || options.method === 'GET') {
      if (global.__apiFail) {
        return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: { code: 403, message: 'userRateLimitExceeded' } }) });
      }
      if (global.__pageTwo && !u.includes('pageToken=')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: (global.__eventsFixture.items || []).slice(0, 2), nextPageToken: 'p2' }) });
      }
      if (global.__pageTwo && u.includes('pageToken=p2')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: (global.__eventsFixture.items || []).slice(2) }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(global.__eventsFixture || { items: [] }) });
    }
    if (global.__postDup && options.method === 'POST') {
      let bid = null; try { bid = JSON.parse(options.body).id; } catch (e) {}
      if (!bid || String(bid).indexOf('x2') < 0) return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: { code: 409, message: 'duplicate' } }) });
      // un id de repli « x2 » n'a jamais existé chez Google : ce POST passe
    }
    if (options.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) });
    }
    if (options.method === 'PATCH' && global.__patchMode === 'fail') {
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: { code: 400 } }) });
    }
    if (options.method === 'PATCH') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'patched-ok' }) });
    }
    if (options.method === 'PUT' && global.__writeMode === 'gone') {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: { code: 404 } }) });
    }
    if (options.method === 'PUT') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: global.__putId || 'updated-id' }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'evt-created-' + seq }) });
  }
  // ---------- Stubs Google Drive ----------
  if (u.includes('drive/v3/files') && u.includes('alt=media')) {
    if (global.__driveFail) return Promise.reject(new Error('drive down'));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(global.__driveRemote || null) });
  }
  if (u.includes('drive/v3/files?q=')) { // recherche dossier ou fichier de sauvegarde
    const isFolderQuery = u.includes('google-apps.folder');
    if (isFolderQuery) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ files: [{ id: 'folder-1', name: 'taffbmpm' }] }) });
    const hasFile = !!(global.__driveRemote && global.__driveRemote.tasks);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hasFile ? { files: [{ id: 'file-1', name: 'taches-relances.json' }] } : { files: [] }) });
  }
  if (u.includes('upload/drive/v3/files')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'drive-file-ok' }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
};

// Évalue le script au niveau global (les var/fonctions deviennent des propriétés de globalThis)
vm.runInThisContext(code, { filename: 'app-v10.js' });

// ---------- Mini framework ----------
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.error('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(Object.is(actual, expected), label + ' — attendu: ' + JSON.stringify(expected) + ' / reçu: ' + JSON.stringify(actual));
}
function section(name) { console.log('— ' + name); }
function lastReq() { return reqs[reqs.length - 1] || null; }

(async function main() {
  await new Promise((r) => setTimeout(r, 10)); // laisse tourner les promesses éventuelles

  // ---------- Version ----------
  section('Version & fichiers');
  ok(APP_VERSION === 'v13', 'APP_VERSION === v13');
  ok(!html.includes('saveAndAgenda('), 'plus aucun bouton « Enregistrer et mettre dans l\'agenda » v3');
  ok(html.includes('id="mStart"') && html.includes('id="mEnd"'), 'champs horaires présents dans la modale');
  ok(html.includes('id="mUntil"'), 'champ « Jusqu\'au » (multi-jours) présent dans la modale');
  ok(html.includes('id="mRep"'), 'sélecteur de répétition présent');
  ok(html.includes('id="warnCard"'), 'bandeau codes Google manquants présent');
  ok(html.includes('id="evModal"') && html.includes('id="eTitle"') && html.includes('id="eLoc"'), 'modale d\'édition d\'événement présente');
  ok(html.includes('openEvModal('), 'bouton ✏️ d\'édition branché dans le rendu agenda');
  ok(fs.readFileSync(path.join(__dirname, 'v13-sw.js'), 'utf8').includes('taches-relances-v13'), 'cache SW v13');

  // ---------- Helpers v5 ----------
  section('Helpers v5 (cleanUntil, fmtAgo, fenêtre agenda)');
  eq(cleanUntil('2026-10-15', '2026-10-17'), '2026-10-17', 'cleanUntil : jusqu\'au après le début → conservé');
  eq(cleanUntil('2026-10-15', '2026-10-14'), null, 'cleanUntil : jusqu\'au avant le début → refusé');
  eq(cleanUntil('2026-10-15', '2026-10-15'), '2026-10-15', 'cleanUntil : même jour → conservé (inoffensif)');
  eq(cleanUntil('2026-10-15', null), null, 'cleanUntil : pas de until → null');
  eq(cleanUntil('2026-10-15', 'bidon'), null, 'cleanUntil : format invalide → null');
  eq(cleanUntil(null, '2026-10-15'), null, 'cleanUntil : pas de due → null');
  eq(stripEvTitle('🔴 Garde DIH'), 'Garde DIH', 'stripEvTitle retire le préfixe 🔴');
  eq(stripEvTitle('🔵 Sport'), 'Sport', 'stripEvTitle retire le préfixe 🔵');
  eq(stripEvTitle('Plain'), 'Plain', 'stripEvTitle sans préfixe');
  eq(fmtAgo(null), 'jamais', 'fmtAgo(null) → jamais');
  eq(fmtAgo(Date.now() - 20000), 'à l\'instant', 'fmtAgo < 1 min → à l\'instant');
  ok(fmtAgo(Date.now() - 5 * 60000).indexOf('5 min') >= 0, 'fmtAgo 5 min');
  ok(fmtAgo(Date.now() - 3 * 3600000).indexOf('3 h') >= 0, 'fmtAgo 3 h');
  ok(/^\d{2}\/\d{2}\/\d{4}$/.test(fmtAgo(Date.now() - 5 * 86400000)), 'fmtAgo ancien → date');
  state.cfg = {};
  eq(agendaWindowDays(), 30, 'fenêtre par défaut : 30 jours');
  state.cfg = { agendaDays: 7 };
  eq(agendaWindowDays(), 7, 'fenêtre 7 jours');
  state.cfg = { agendaDays: '14' };
  eq(agendaWindowDays(), 14, 'fenêtre 14 jours (chaîne acceptée)');
  state.cfg = { agendaDays: 99 };
  eq(agendaWindowDays(), 30, 'fenêtre invalide → 30 jours');
  state.cfg = null;

  // ---------- Helpers horaires & répétitions (régression v4) ----------
  section('Helpers horaires & fuseau');
  eq(typeof deviceTz(), 'string', 'deviceTz() retourne une chaîne');
  eq(validHM('08:30'), '08:30', 'validHM accepte 08:30');
  eq(validHM('8:30'), null, 'validHM refuse 8:30');
  eq(validHM('bidon'), null, 'validHM refuse bidon');
  eq(hmPlus('08:30', 60).hm, '09:30', 'hmPlus +60 min');
  eq(hmPlus('08:30', 60).plusDays, 0, 'hmPlus pas de passage de jour');
  eq(hmPlus('23:30', 60).hm, '00:30', 'hmPlus passage de minuit');
  eq(hmPlus('23:30', 60).plusDays, 1, 'hmPlus passage de jour = +1');

  section('Répétitions → RRULE Google Calendar');
  eq(repToRule(null), null, 'pas de répétition → null');
  eq(repToRule({ mode: 'daily' }), 'RRULE:FREQ=DAILY', 'chaque jour');
  eq(repToRule({ mode: 'ndays', every: 3 }), 'RRULE:FREQ=DAILY;INTERVAL=3', 'tous les 3 jours');
  eq(repToRule({ mode: 'ndays', every: 2, count: 10 }), 'RRULE:FREQ=DAILY;INTERVAL=2;COUNT=10', 'tous les 2 jours × 10 fois');
  eq(repToRule({ mode: 'weekly' }), 'RRULE:FREQ=WEEKLY', 'chaque semaine');
  eq(repToRule({ mode: '2weeks' }), 'RRULE:FREQ=WEEKLY;INTERVAL=2', 'toutes les 2 semaines');
  eq(repToRule({ mode: 'monthly', count: 12 }), 'RRULE:FREQ=MONTHLY;COUNT=12', 'chaque mois × 12');
  eq(repToRule({ mode: 'nimportequoi' }), null, 'mode inconnu rejeté');
  eq(repToRule({ mode: 'ndays' }), null, 'ndays sans intervalle rejeté');
  eq(cleanRep({ mode: 'daily', count: 0 }).count, null, 'count 0 → sans fin');
  eq(cleanRep({ mode: 'daily', count: -5 }).count, null, 'count négatif → sans fin');
  ok(repLabel({ mode: 'weekly', count: 8 }).indexOf('chaque semaine') >= 0, 'repLabel lisible');

  // ---------- Corps d'événement ----------
  section('Corps d\'événement agenda (taskEventBody)');
  const tAllday = { title: 'Contrôle linge', type: 'perso', due: '2026-10-15', note: '' };
  const b1 = taskEventBody(tAllday);
  eq(b1.start.date, '2026-10-15', 'journée entière : start.date');
  eq(b1.end.date, '2026-10-16', 'journée entière : end.date = J+1');
  eq(b1.colorId, '9', 'perso → couleur 9 (bleu)');
  ok(!b1.recurrence, 'sans répétition : pas de recurrence');

  const tTimed = { title: 'Sport', type: 'perso', due: '2026-10-16', startT: '18:00', endT: '19:30', note: '', rep: { mode: 'weekly' } };
  const b2 = taskEventBody(tTimed);
  eq(b2.start.dateTime, '2026-10-16T18:00:00', 'horodaté : start.dateTime');
  eq(b2.end.dateTime, '2026-10-16T19:30:00', 'horodaté : end.dateTime');
  ok(!!b2.start.timeZone && !!b2.end.timeZone, 'timeZone IANA obligatoire (événements récurrents)');
  ok(b2.recurrence && b2.recurrence[0] === 'RRULE:FREQ=WEEKLY', 'récurrence hebdo dans le corps');

  const tPro = { title: 'Garde DIH', type: 'pro', due: '2026-10-17', startT: '08:00', note: '' };
  const b3 = taskEventBody(tPro);
  eq(b3.summary, '🔴 Garde DIH', 'titre préfixé 🔴 (pro)');
  eq(b3.colorId, '11', 'pro → couleur 11 (rouge)');
  eq(b3.end.dateTime, '2026-10-17T09:00:00', 'fin par défaut = début + 1 h');

  const tNight = { title: 'Astreinte', type: 'pro', due: '2026-10-18', startT: '23:30', note: '' };
  const b4 = taskEventBody(tNight);
  eq(b4.end.dateTime, '2026-10-19T00:30:00', 'fin par défaut après minuit → lendemain');

  // multi-jours v5
  section('Événements multi-jours (taskEventBody v5)');
  const tMultiDay = { title: 'Stage feu de forêt', type: 'pro', due: '2026-10-15', until: '2026-10-17', note: '' };
  const bm = taskEventBody(tMultiDay);
  eq(bm.start.date, '2026-10-15', 'multi-jours journée entière : start = 1er jour');
  eq(bm.end.date, '2026-10-18', 'multi-jours journée entière : end.date = dernier jour + 1');

  const tMultiTimed = { title: 'Manœuvres', type: 'pro', due: '2026-10-15', until: '2026-10-17', startT: '09:00', endT: '18:00', note: '' };
  const bmt = taskEventBody(tMultiTimed);
  eq(bmt.start.dateTime, '2026-10-15T09:00:00', 'multi-jours horodaté : début au 1er jour');
  eq(bmt.end.dateTime, '2026-10-17T18:00:00', 'multi-jours horodaté : fin au dernier jour');

  const tMultiNight = { title: 'Garde 3 jours', type: 'pro', due: '2026-10-15', until: '2026-10-17', startT: '23:30', note: '' };
  const bmn = taskEventBody(tMultiNight);
  eq(bmn.end.dateTime, '2026-10-18T00:30:00', 'multi-jours horodaté sans heure de fin : dernier jour +60 min (passage minuit)');

  // until == due : traité comme un seul jour
  const tSameDay = { title: 'Pareil', type: 'perso', due: '2026-10-15', until: '2026-10-15', note: '' };
  const bsd = taskEventBody(tSameDay);
  eq(bsd.end.date, '2026-10-16', 'until == due → événement d\'un seul jour');

  // ---------- parseEvents : extraction until ----------
  section('parseEvents : multi-jours depuis Google');
  const fxMulti = { items: [
    { id: 'mA', summary: 'Stage 3 jours', start: { date: '2026-10-15' }, end: { date: '2026-10-18' } },
    { id: 'mB', summary: 'Simple', start: { date: '2026-10-15' }, end: { date: '2026-10-16' } },
    { id: 'mC', summary: 'Déplacement', start: { dateTime: '2026-10-15T09:00:00+02:00' }, end: { dateTime: '2026-10-17T18:00:00+02:00' } },
    { id: 'mD', summary: 'Soirée courte', start: { dateTime: '2026-10-15T22:00:00+02:00' }, end: { dateTime: '2026-10-16T01:00:00+02:00' } }
  ] };
  const pm = parseEvents(fxMulti);
  eq(pm.length, 4, 'parseEvents : 4 événements');
  eq(pm[0].until, '2026-10-17', 'journée entière multi-jours : until = end.date - 1');
  eq(pm[1].until, '2026-10-15', 'journée entière simple : until = jour même (inoffensif)');
  eq(pm[2].until, '2026-10-17', 'horodaté multi-jours : until = jour de fin');
  eq(pm[3].until, '2026-10-16', 'v12 : horodaté « overnight » 22:00→01:00 = multi-jours (jour de fin conservé, avant : perdu)');

  // ---------- Tâches : horaires, répétition, multi-jours ----------
  section('Tâches : horaires, répétition, conservation des champs');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = false; state.cfg = null;
  const t = addTask('Réunion DIH', 'point hebdo', 'week', '2026-10-15', 'pro', { startT: '09:00', endT: '10:30', rep: { mode: 'weekly', count: 10 } });
  ok(!!t.id, 'tâche créée');
  eq(t.startT, '09:00', 'startT enregistré');
  eq(t.endT, '10:30', 'endT enregistré');
  eq(t.rep.mode, 'weekly', 'répétition enregistrée');
  eq(t.rep.count, 10, 'nombre de répétitions enregistré');
  eq(t.gEventId, null, 'pas encore d\'id Google');
  eq(t.gSync, null, 'pas encore de statut sync');
  eq(t.evGone, false, 'evGone initialisé à false');
  editTask(t.id, 'Réunion DIH (MAJ)', '', 'week', '2026-10-16', 'pro', { startT: '09:00', endT: '10:30', rep: { mode: 'weekly', count: 10 } });
  const t2 = getTask(t.id);
  eq(t2.title, 'Réunion DIH (MAJ)', 'édition : titre mis à jour');
  eq(t2.due, '2026-10-16', 'édition : échéance mise à jour');
  t2.gEventId = 'abc123';
  editTask(t.id, 'Réunion DIH', '', 'week', '2026-10-16', 'pro', { startT: '09:00', endT: '10:30', rep: null });
  eq(getTask(t.id).gEventId, 'abc123', 'édition : gEventId conservé');
  eq(getTask(t.id).rep, null, 'édition : répétition supprimée');

  const tMulti = addTask('Stage', '', 'week', '2026-10-15', 'pro', { until: '2026-10-17' });
  eq(tMulti.until, '2026-10-17', 'tâche multi-jours : until enregistré');
  editTask(tMulti.id, 'Stage', '', 'week', '2026-10-15', 'pro', { until: '2026-10-14' });
  eq(getTask(tMulti.id).until, null, 'édition : until antérieur au début → supprimé');

  // v12 : plus de promoteOverdue — l'urgence se DÉDUIT au rendu, plus jamais écrite dans l'état
  state.tasks = [];
  const tStill = addTask('Séminaire en cours', '', 'week', '2024-01-01', 'perso', { until: addDaysISO(today(), 2) });
  const tLate = addTask('Vraiment en retard', '', 'week', '2024-01-01', 'perso');
  eq(getTask(tStill.id).cat, 'week', 'v12 : rendu sans écriture — la cat ne bouge plus');
  eq(getTask(tLate.id).cat, 'week', 'v12 : l\'état reste intact, même en retard');
  const thV12 = tasksTabHtml();
  ok(thV12.indexOf('Séminaire en cours') >= 0 && thV12.indexOf('Aujourd\'hui') >= 0, 'v12 : multi-jours en cours classé Aujourd\'hui');
  ok(thV12.indexOf('Vraiment en retard') >= 0 && thV12.indexOf('En retard') >= 0, 'v12 : la tâche échue classée En retard');
  ok(taskHtml(tLate).indexOf('task urgent') >= 0, 'v12 : bordure urgente déduite de la date au rendu');

  // ---------- dueHtml ----------
  section('Affichage (dueHtml)');
  const dh = dueHtml({ due: '2026-10-15', startT: '09:00', endT: '10:30', rep: { mode: 'weekly', count: 10 }, cat: 'week' });
  ok(dh.indexOf('09:00') >= 0 && dh.indexOf('10:30') >= 0, 'horaires affichés');
  ok(dh.indexOf('chaque semaine') >= 0, 'répétition affichée');
  const dhm = dueHtml({ due: '2026-10-15', until: '2026-10-17', cat: 'week' });
  ok(dhm.indexOf('du 15/10/2026 au 17/10/2026') >= 0, 'multi-jours affiché « du X au Y »');

  // ---------- Écriture agenda : création / mise à jour / recréation ----------
  section('Écriture agenda : création / mise à jour / recréation');
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  state.tasks = []; state.importedEvents = {};
  const tA = addTask('Brief matin', '', 'urgent', '2026-10-12', 'pro', { startT: '07:30', endT: '08:00', rep: { mode: 'daily', count: 5 } });
  reqs.length = 0;
  await taskToEvent(tA.id);
  ok(reqs.some((r) => r.method === 'POST' && r.url.includes('primary/events')), 'création : POST events.insert');
  const postBody = JSON.parse(reqs.find((r) => r.method === 'POST' && r.url.includes('primary/events')).body);
  ok(postBody.recurrence[0] === 'RRULE:FREQ=DAILY;COUNT=5', 'RRULE quotidien envoyé à Google');
  ok(postBody.start.timeZone === deviceTz(), 'timeZone présent');
  ok(!!tA.gEventId && tA.gEventId.indexOf('evt-created-') === 0, 'gEventId mémorisé après création');
  eq(tA.gSync, 'ok', 'statut sync « ok » après création réussie');
  const idBefore = tA.gEventId;
  reqs.length = 0;
  await taskToEvent(tA.id);
  const put = reqs.find((r) => r.method === 'PUT');
  ok(!!put && put.url.includes(idBefore), 'ré-enregistrement : PUT events.update (pas de doublon)');
  global.__writeMode = 'gone'; // l'événement a été supprimé côté Google
  const oldId = tA.gEventId;
  reqs.length = 0;
  await taskToEvent(tA.id);
  ok(reqs.some((r) => r.method === 'POST'), 'événement disparu → recréé automatiquement');
  ok(tA.gEventId !== oldId, 'nouveau gEventId après recréation');
  global.__writeMode = 'ok';

  // multi-jours → événement Google du X au Y
  state.tasks = [];
  const tMJ = addTask('Congé de garde', '', 'week', '2026-10-15', 'pro', { until: '2026-10-17' });
  reqs.length = 0;
  await taskToEvent(tMJ.id);
  const bodyMJ = JSON.parse(reqs.find((r) => r.method === 'POST' && r.url.includes('primary/events')).body);
  eq(bodyMJ.start.date, '2026-10-15', 'événement multi-jours : commence le 15');
  eq(bodyMJ.end.date, '2026-10-18', 'événement multi-jours : finit le 18 (dernier jour + 1)');

  // tâche sans échéance : refus propre
  const tNo = addTask('Sans date', '', 'later', null, 'perso');
  const rNo = await taskToEvent(tNo.id);
  eq(rNo, false, 'sans échéance : pas d\'écriture agenda');

  // ---------- Hors-ligne : file d'attente ----------
  section('Hors-ligne : file d\'attente + reprise automatique');
  state.tasks = []; state.importedEvents = {}; state.pendingEventDeletes = [];
  const tOff = addTask('À sync plus tard', '', 'urgent', '2026-10-12', 'perso', { startT: '09:00' });
  global.__offline = true;
  const rOff = await taskToEvent(tOff.id);
  eq(rOff, false, 'hors-ligne : écriture refusée');
  eq(tOff.gSync, 'pending', 'tâche marquée « à synchroniser »');
  ok(tOff.gEventId === null, 'pas de gEventId tant que rien n\'est parti');
  // suppression d'une tâche synchronisée pendant la coupure
  const tOn = addTask('Déjà synchronisée', '', 'urgent', '2026-10-12', 'perso');
  global.__offline = false;
  await taskToEvent(tOn.id);
  const idOn = tOn.gEventId;
  global.__offline = true;
  deleteTask(tOn.id);
  await new Promise((r) => setTimeout(r, 10));
  ok(state.pendingEventDeletes.indexOf(idOn) >= 0, 'suppression hors-ligne : événement mis en file d\'attente');
  eq(state.tasks.filter((x) => x.id === tOn.id).length, 0, 'la tâche est bien supprimée localement');
  // retour en ligne → retryPendingSync vide la file
  global.__offline = false;
  reqs.length = 0;
  retryPendingSync();
  await new Promise((r) => setTimeout(r, 30));
  ok(reqs.some((r) => r.method === 'POST' && r.url.includes('primary/events')), 'reprise : la tâche en attente part vers l\'agenda');
  eq(tOff.gSync, 'ok', 'reprise : statut sync repasse à « ok »');
  const del = reqs.find((r) => r.method === 'DELETE');
  ok(!!del && del.url.includes(encodeURIComponent(idOn)), 'reprise : l\'événement en file est supprimé sur Google');
  eq(state.pendingEventDeletes.indexOf(idOn), -1, 'file d\'attente vidée après suppression réussie');
  eq(state.tasks.filter((x) => x.id === tOff.id).length, 1, 'la tâche à synchroniser est toujours là');

  // suppression en ligne : DELETE immédiat
  section('Suppression tâche → suppression événement Google');
  const tDel = addTask('À supprimer', '', 'urgent', '2026-10-12', 'perso');
  await taskToEvent(tDel.id);
  const idDel = tDel.gEventId;
  reqs.length = 0;
  deleteTask(tDel.id);
  await new Promise((r) => setTimeout(r, 10));
  ok(reqs.some((r) => r.method === 'DELETE' && r.url.includes(encodeURIComponent(idDel))), 'supprimer la tâche supprime l\'événement agenda');
  // tâche importée de l'agenda : la suppression ne touche PAS Google
  const tImp = addTask('Venue agenda', '', 'urgent', '2026-10-12', 'perso', { gEventId: 'evXyz', autoImport: true });
  reqs.length = 0;
  deleteTask(tImp.id);
  await new Promise((r) => setTimeout(r, 10));
  ok(!reqs.some((r) => r.method === 'DELETE'), 'tâche auto-importée supprimée : l\'événement Google reste');
  // tâche sans événement : pas de requête
  const tLoc = addTask('Locale', '', 'urgent', '2026-10-12', 'perso');
  reqs.length = 0;
  deleteTask(tLoc.id);
  await new Promise((r) => setTimeout(r, 10));
  ok(reqs.filter((r) => r.url.includes('primary/events')).length === 0, 'tâche sans événement : aucune requête agenda');

  // ---------- Import agenda → tâches ----------
  section('Import agenda → tâches (dédoublonnage)');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = false;
  const D0 = today(), D1 = addDaysISO(today(), 1), D2 = addDaysISO(today(), 2);
  const fixture = {
    items: [
      { id: 'ev1', summary: '🔴 Permanence DIH', colorId: '11', start: { dateTime: D0 + 'T08:00:00+02:00' }, end: { dateTime: D0 + 'T10:00:00+02:00' }, location: 'Caserne' },
      { id: 'ev2', summary: 'Anniversaire Léa', colorId: null, start: { date: D1 }, end: { date: addDaysISO(D1, 1) } },
      { id: 'ev3', summary: 'Séance sport', colorId: '9', start: { dateTime: D2 + 'T18:30:00+02:00' }, end: { dateTime: D2 + 'T19:30:00+02:00' } }
    ]
  };
  const parsed = parseEvents(fixture);
  eq(parsed.length, 3, 'parseEvents : 3 événements');
  eq(parsed[0].startT, '08:00', 'heure de début extraite');
  eq(parsed[1].allDay, true, 'journée entière détectée');

  const im1 = importEventAsTask(parsed[0], true);
  ok(!!im1, 'import 1 OK');
  eq(im1.type, 'pro', 'couleur 11 → pro');
  ok(im1.title.indexOf('🔴') !== 0, 'préfixe emoji retiré du titre');
  eq(im1.startT, '08:00', 'horaires recopiés dans la tâche');
  eq(im1.autoImport, true, 'marqueur autoImport');
  eq(im1.gEventId, 'ev1', 'gEventId = id événement');
  ok(im1.note.indexOf('Caserne') >= 0, 'lieu recopié dans la note');

  eq(importEventAsTask(parsed[0], true), null, 'ré-import du même événement → refusé (dédoublonnage)');
  eq(importEventAsTask(parsed[1], true) !== null, true, 'journée entière importée');
  eq(importEventAsTask(parsed[2], true) !== null, true, 'événement soir importé');
  eq(state.tasks.length, 3, '3 tâches créées, 0 doublon');
  ok(!!state.importedEvents['ev1'], 'importedEvents trace l\'import');

  // import d'un événement multi-jours → until recopié
  const evMulti = { id: 'evM', title: 'Stage 2 jours', color: null, day: D1, until: addDaysISO(D1, 1), allDay: true, startT: '', endT: '', loc: '' };
  const imM = importEventAsTask(evMulti, true);
  eq(imM.until, addDaysISO(D1, 1), 'import multi-jours : until recopié dans la tâche');

  // auto-import global depuis le cache
  state.agendaCache = { fetchedAt: Date.now(), events: parsed.concat([evMulti]) };
  const evNew = { id: 'ev4', summary: 'Nouvelle garde', colorId: '11', day: D0, allDay: true, startT: '', endT: '', loc: '', until: null };
  state.agendaCache.events.push(evNew);
  eq(autoImportAll().n, 1, 'autoImportAll : 1 seule nouvelle tâche (déjà importées ignorées)');

  eq(getTask(state.importedEvents['ev4'].taskId).cat, 'urgent', 'événement du jour → urgent');
  const evFuture = { id: 'ev5', summary: 'Week-end', colorId: null, day: addDaysISO(today(), 3), allDay: true, startT: '', endT: '', loc: '', until: null };
  importEventAsTask(evFuture, true);
  eq(getTask(state.importedEvents['ev5'].taskId).cat, 'week', 'événement futur → semaine');

  // ---------- Synchro retour Google → tâches (v5) ----------
  section('Synchro retour agenda → tâches (syncImportedFromCache)');
  state.tasks = []; state.importedEvents = {}; state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  const evMoved = { id: 'evS1', title: 'Brief déplacé', color: '11', day: addDaysISO(D0, 2), allDay: false, startT: '14:00', endT: '15:00', loc: 'Salle B', until: null };
  const tS1 = addTask('Brief', 'ancienne note', 'week', D0, 'pro', { startT: '09:00', endT: '10:00', gEventId: 'evS1', autoImport: true });
  state.importedEvents['evS1'] = { taskId: tS1.id, title: 'Brief', day: D0, at: Date.now() };
  state.agendaCache = { fetchedAt: Date.now(), events: [evMoved] };
  let r1 = syncImportedFromCache();
  eq(tS1.title, 'Brief déplacé', 'événement renommé → tâche renommée');
  eq(tS1.due, addDaysISO(D0, 2), 'événement déplacé → échéance suivie');
  eq(tS1.startT, '14:00', 'heure de début suivie');
  eq(tS1.endT, '15:00', 'heure de fin suivie');
  ok(r1.nUpd >= 1, 'compteur de mises à jour > 0');

  // tâche modifiée à la main : Google ne l'écrase pas
  const evS2 = { id: 'evS2', title: 'Titre Google', color: null, day: D0, allDay: true, startT: '', endT: '', loc: '', until: null };
  const tS2 = addTask('Mon titre à moi', '', 'week', D0, 'perso', { gEventId: 'evS2', autoImport: true });
  tS2.localEdit = true; // posé par editTask en usage réel, jamais par addTask
  state.importedEvents['evS2'] = { taskId: tS2.id, title: 'Mon titre à moi', day: D0, at: Date.now() };
  state.agendaCache.events.push(evS2);
  syncImportedFromCache();
  eq(tS2.title, 'Mon titre à moi', 'localEdit : la tâche n\'est PAS écrasée par Google');

  // tâche terminée : ne bouge plus (mais l'événement reste dans l'agenda)
  const tS3 = addTask('Terminée', '', 'done', D0, 'perso', { gEventId: 'evS3', autoImport: true });
  tS3.cat = 'done';
  state.importedEvents['evS3'] = { taskId: tS3.id, title: 'Terminée', day: D0, at: Date.now() };
  state.agendaCache.events.push({ id: 'evS3', title: 'Titre Google changé', color: null, day: addDaysISO(D0, 5), allDay: true, startT: '', endT: '', loc: '', until: null });
  syncImportedFromCache();
  eq(tS3.title, 'Terminée', 'tâche terminée : jamais écrasée');
  eq(tS3.due, D0, 'tâche terminée : échéance figée');

  // événement disparu de la fenêtre → drapeau evGone
  const tS4 = addTask('Disparue', '', 'week', D1, 'perso', { gEventId: 'evS4', autoImport: true });
  state.importedEvents['evS4'] = { taskId: tS4.id, title: 'Disparue', day: D1, at: Date.now() };
  // evS4 absent du cache
  let rG = syncImportedFromCache();
  eq(tS4.evGone, true, 'événement disparu (dans l\'horizon) → badge « plus dans l\'agenda »');
  ok(rG.nGone >= 1, 'compteur nGone > 0');
  // l'événement réapparaît → drapeau retiré + champs resynchronisés
  state.agendaCache.events.push({ id: 'evS4', title: 'Disparue (réapparue)', color: null, day: D2, allDay: true, startT: '', endT: '', loc: '', until: null });
  let rB = syncImportedFromCache();
  eq(tS4.evGone, false, 'événement réapparu → badge retiré');
  eq(tS4.due, D2, 'réapparition : échéance resynchronisée');
  eq(tS4.title, 'Disparue (réapparue)', 'réapparition : titre resynchronisé');
  // tâche dont l'événement est disparu mais au-delà de l'horizon : pas de badge
  const tFar = addTask('Loin', '', 'week', addDaysISO(today(), 400), 'perso', { gEventId: 'evFar', autoImport: true });
  state.importedEvents['evFar'] = { taskId: tFar.id, title: 'Loin', day: addDaysISO(today(), 400), at: Date.now() };
  syncImportedFromCache();
  eq(tFar.evGone, false, 'disparition au-delà de la fenêtre : pas de badge evGone');
  // tâche supprimée localement : la trace reste, pas de crash
  delete state.tasks[state.tasks.indexOf(tFar)];
  state.tasks = state.tasks.filter((x) => x.id !== tFar.id);
  let rNoCrash = syncImportedFromCache();
  eq(typeof rNoCrash, 'object', 'tâche importée supprimée : la synchro ne crashe pas');

  // ---------- agendaRefresh : fenêtre réglable + import auto en chaîne ----------
  section('agendaRefresh : fenêtre 30 j, maxResults 250, import auto');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = true;
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' }; // pas de agendaDays → 30 par défaut
  global.__eventsFixture = fixture;
  reqs.length = 0;
  const rRef = await agendaRefresh(true);
  eq(rRef, true, 'agendaRefresh OK');
  eq(state.tasks.length, 3, 'import auto : les 3 événements deviennent des tâches');
  await agendaRefresh(true);
  eq(state.tasks.length, 3, 'second rafraîchissement : aucun doublon');
  const getReq = reqs.find((r) => r.method === 'GET' && r.url.includes('primary/events'));
  ok(!!getReq, 'requête GET events émise');
  ok(getReq.url.includes('maxResults=250'), 'maxResults=250');
  ok(getReq.url.includes('singleEvents=true'), 'singleEvents=true (instances étendues)');
  const q = {};
  getReq.url.split('?')[1].split('&').forEach((kv) => { const [k, v] = kv.split('='); q[k] = decodeURIComponent(v || ''); });
  const spanDays = (Date.parse(q.timeMax) - Date.parse(q.timeMin)) / 86400000;
  ok(spanDays > 29.9 && spanDays < 30.1, 'fenêtre par défaut = 30 jours (reçu ' + spanDays.toFixed(2) + ')');
  // fenêtre réglable : 14 jours
  state.cfg.agendaDays = 14;
  reqs.length = 0;
  await agendaRefresh(true);
  const q14 = {};
  reqs.find((r) => r.method === 'GET' && r.url.includes('primary/events')).url.split('?')[1].split('&').forEach((kv) => { const [k, v] = kv.split('='); q14[k] = decodeURIComponent(v || ''); });
  const span14 = (Date.parse(q14.timeMax) - Date.parse(q14.timeMin)) / 86400000;
  ok(span14 > 13.9 && span14 < 14.1, 'fenêtre agendaDays=14 → 14 jours');
  // saveAgendaDays
  saveAgendaDays('7');
  eq(state.cfg.agendaDays, 7, 'saveAgendaDays(7) enregistré');
  eq(agendaWindowDays(), 7, 'fenêtre lue = 7 jours');
  saveAgendaDays('99');
  eq(agendaWindowDays(), 30, 'saveAgendaDays(99) → replié sur 30 jours');

  // ---------- eventToTask manuel (bouton ＋) ----------
  section('eventToTask manuel');
  const before = state.tasks.length;
  eventToTask('ev1');
  eq(state.tasks.length, before, 'bouton ＋ sur événement déjà importé : pas de doublon');

  // ---------- v10.1 : ＋ recrée une tâche supprimée ; l'import AUTO reste bloqué ----------
  section('v10.1 ＋ après suppression (anti-résurrection vs ajout manuel)');
  const ev1Obj = () => state.agendaCache.events.find((e) => e.id === 'ev1');
  const tEv1 = state.tasks.find((x) => x.gEventId === 'ev1');
  ok(!!tEv1, 'tâche de ev1 présente');
  state.tasks = state.tasks.filter((x) => x.id !== tEv1.id); // suppression locale : la trace importedEvents survit
  ok(!!state.importedEvents['ev1'], 'trace importedEvents conservée après suppression (anti-résurrection)');
  eq(importEventAsTask(ev1Obj(), true), null, 'import AUTO toujours refusé après suppression');
  const nB4 = state.tasks.length;
  eventToTask('ev1'); // ＋ manuel : la trace ne bloque plus
  eq(state.tasks.length, nB4 + 1, '＋ manuel recrée la tâche supprimée');
  ok(!!evOwnerTask(ev1Obj()), 'la tâche recréée possède l’événement (gEventId)');
  ok(document.getElementById('toast').textContent.indexOf('Tâche créée') >= 0, 'toast « Tâche créée » après ré-import');
  eventToTask('ev1'); // la tâche existe à nouveau → refus
  eq(state.tasks.length, nB4 + 1, '＋ sur événement ré-importé : pas de doublon');
  const own1 = evOwnerTask(ev1Obj());
  own1.cat = 'done';
  eventToTask('ev1');
  ok(document.getElementById('toast').textContent.indexOf('Terminé') >= 0, 'refus ＋ : le message pointe « Terminé »');
  own1.cat = 'week'; // état rendu
  state.tasks = state.tasks.filter((x) => x.id !== own1.id); // re-supprimée
  importAllNow();
  ok(document.getElementById('toast').textContent.indexOf('＋') >= 0, '« Tout importer » bloqué : message explicite (ré-ajout via ＋)');
  eq(state.tasks.filter((x) => x.gEventId === 'ev1').length, 0, '« Tout importer » ne ressuscite PAS la tâche supprimée');

  // ---------- Export / import JSON v5 ----------
  section('Export / import JSON v5 (roundtrip des nouveaux champs)');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = true; state.cfg = null;
  const tX = addTask('Export test', 'n', 'week', '2026-10-20', 'pro', { startT: '14:00', endT: '15:00', until: '2026-10-22', rep: { mode: '2weeks', count: 6 } });
  tX.gEventId = 'abc'; tX.gSync = 'ok'; tX.localEdit = true; tX.evGone = true;
  const dump = JSON.stringify(exportData());
  ok(JSON.parse(dump).version === 13, 'export version 13 (roundtrip v5 des champs enrichis)');
  const restored = importJsonText(dump);
  eq(restored, true, 'importJsonText accepte l\'export v5');
  const tY = state.tasks.find((x) => x.title === 'Export test');
  ok(!!tY, 'tâche restaurée');
  eq(tY.startT, '14:00', 'horaires restaurés');
  eq(tY.until, '2026-10-22', 'until restauré');
  eq(tY.rep.mode, '2weeks', 'répétition restaurée');
  eq(tY.gEventId, 'abc', 'gEventId restauré');
  eq(tY.gSync, 'ok', 'statut sync restauré');
  eq(tY.localEdit, true, 'localEdit restauré');
  eq(tY.evGone, true, 'evGone restauré');
  eq(state.autoAgenda, true, 'préférence import auto restaurée');
  ok(typeof state.importedEvents === 'object', 'importedEvents restauré (vide)');

  // import d'un fichier v3 (sans nouveaux champs) : toujours accepté
  const v3dump = JSON.stringify({ app: 'taches-relances', version: 3, tasks: [{ id: 'old1', title: 'Ancienne', cat: 'urgent', due: '2026-10-11' }], lists: [], savedAt: Date.now() + 5 });
  ok(importJsonText(v3dump), 'import compatible v3');
  const tOld = state.tasks.find((x) => x.id === 'old1');
  ok(!!tOld && tOld.startT === null && tOld.rep === null && tOld.until === null && tOld.gSync === null, 'tâche v3 : nouveaux champs absents mais valides');

  // ---------- Fusion Drive au démarrage (v5) ----------
  section('Fusion Drive → local (driveMergeOnStart, additive)');
  state.tasks = []; state.lists = []; state.importedEvents = {}; state.autoAgenda = false;
  state.cfg = { dCid: 'DCID', dSecret: '', dRefresh: 'DRT' };
  const tLocal = addTask('Tâche locale', '', 'week', '2026-10-20', 'perso');
  const lLocal = addList('Liste locale');
  global.__driveRemote = {
    app: 'taches-relances', version: 5,
    tasks: [
      { id: 'remote-1', title: 'Tâche du PC', cat: 'week', due: '2026-10-21', type: 'pro', startT: '09:00', endT: '10:00', until: '2026-10-23', gSync: 'ok' },
      { id: tLocal.id, title: 'Tâche locale MODIFIÉE SUR DRIVE', cat: 'urgent', due: '2026-10-20', type: 'perso' },
      { id: 'remote-bidon', cat: 'week' } // sans titre → ignorée
    ],
    lists: [
      { id: 'remote-l1', name: 'Liste du PC', items: [{ id: 'ri1', text: 'Truc', done: true }] },
      { id: lLocal.id, name: 'Liste locale MODIFIÉE' },
      { id: 'remote-bidon-liste' } // sans nom → ignorée
    ],
    importedEvents: { evR1: { taskId: 'remote-1', title: 'Tâche du PC', day: '2026-10-21', at: Date.now() } },
    autoAgenda: true,
    savedAt: Date.now() + 100
  };
  const nMerged = await driveMergeOnStart();
  eq(nMerged, 2, 'fusion : 1 tâche + 1 liste récupérées (2 éléments)');
  const tR1 = getTask('remote-1');
  ok(!!tR1, 'tâche distante ajoutée');
  eq(tR1.until, '2026-10-23', 'fusion : until préservé');
  eq(tR1.gSync, 'ok', 'fusion : statut sync préservé');
  eq(getTask(tLocal.id).title, 'Tâche locale', 'fusion : la tâche locale n\'est PAS écrasée par Drive');
  eq(state.lists.filter((l) => l.id === lLocal.id)[0].name, 'Liste locale', 'fusion : la liste locale n\'est PAS écrasée');
  ok(!!getList('remote-l1'), 'fusion : liste distante ajoutée');
  eq(getList('remote-l1').items.length, 1, 'fusion : items de la liste restaurés');
  ok(!!state.importedEvents.evR1, 'fusion : trace importedEvents récupérée');
  eq(state.autoAgenda, false, 'v12 : import auto = réglage LOCAL — la fusion ne peut plus le réactiver toute seule');
  eq(state.tasks.filter((x) => x.title === 'Tâche locale MODIFIÉE SUR DRIVE').length, 0, 'fusion : pas de doublon de la tâche locale');
  global.__driveRemote = null;
  // Drive non configuré → 0 ajout, pas de crash
  state.cfg = {};
  eq(await driveMergeOnStart(), 0, 'Drive non configuré : fusion ignorée proprement');

  // ---------- saveModal : multi-jours + validation ----------
  section('saveModal : app + agenda en un geste, multi-jours');
  state.tasks = []; state.importedEvents = {}; state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  document.getElementById('mTitle').value = 'Brief quotidien';
  document.getElementById('mNote').value = '';
  document.getElementById('mDue').value = '2026-10-13';
  document.getElementById('mUntil').value = '2026-10-11'; // AVANT le début → refus
  document.getElementById('mStart').value = '07:30';
  document.getElementById('mEnd').value = '07:45';
  document.getElementById('mRep').value = 'daily';
  document.getElementById('mRepEvery').value = '';
  document.getElementById('mRepCount').value = '5';
  document.getElementById('mCat-week').checked = true;
  document.getElementById('mType-pro').checked = true;
  editId = null;
  eq(saveModal(), null, '« Jusqu\'au » antérieur au début → refusé');

  document.getElementById('mUntil').value = '2026-10-15'; // multi-jours 13 → 15
  reqs.length = 0;
  const tS = saveModal();
  ok(!!tS, 'tâche enregistrée via saveModal');
  eq(tS.startT, '07:30', 'horaires depuis la modale');
  eq(tS.until, '2026-10-15', 'until multi-jours depuis la modale');
  eq(tS.rep.mode, 'daily', 'répétition depuis la modale');
  await new Promise((r) => setTimeout(r, 20));
  ok(reqs.some((r) => r.method === 'POST' && r.url.includes('primary/events')), 'saveModal a poussé l\'événement agenda (un seul geste)');
  const bodyS = JSON.parse(reqs.find((r) => r.method === 'POST' && r.url.includes('primary/events')).body);
  eq(bodyS.start.dateTime, '2026-10-13T07:30:00', 'événement horodaté 07:30 le 13');
  eq(bodyS.end.dateTime, '2026-10-15T07:45:00', 'événement multi-jours : fin le 15 à 07:45');
  ok(bodyS.recurrence[0] === 'RRULE:FREQ=DAILY;COUNT=5', 'RRULE quotidien × 5');

  // saveModal(false) : sans agenda
  state.tasks = [];
  document.getElementById('mTitle').value = 'Tâche locale';
  document.getElementById('mDue').value = '2026-10-14';
  document.getElementById('mUntil').value = '';
  document.getElementById('mStart').value = ''; document.getElementById('mEnd').value = '';
  document.getElementById('mRep').value = 'none';
  reqs.length = 0;
  saveModal(false);
  await new Promise((r) => setTimeout(r, 20));
  ok(reqs.filter((r) => r.url.includes('primary/events') && r.method !== 'GET').length === 0, 'saveModal(false) : aucune écriture agenda');

  // fin d'horaire avant début : refusé
  document.getElementById('mTitle').value = 'Incohérent';
  document.getElementById('mStart').value = '10:00';
  document.getElementById('mEnd').value = '09:00';
  eq(saveModal(), null, 'fin avant début → refusé');

  // ndays sans X : refusé
  document.getElementById('mStart').value = ''; document.getElementById('mEnd').value = '';
  document.getElementById('mRep').value = 'ndays';
  document.getElementById('mRepEvery').value = '';
  eq(saveModal(), null, '« tous les X jours » sans X → refusé');

  // openModal réaffiche bien le until existant
  const tEdit = addTask('Édition multi-jours', '', 'week', '2026-10-13', 'perso', { until: '2026-10-15' });
  openModal(tEdit.id);
  eq(document.getElementById('mUntil').value, '2026-10-15', 'openModal : champ « Jusqu\'au » prérempli');
  openModal(addTask('Simple', '', 'week', '2026-10-13', 'perso').id);
  eq(document.getElementById('mUntil').value, '', 'openModal : until vide si tâche simple');

  // ---------- Tâche auto-importée : pas de ré-écriture vers l'agenda ----------
  section('Tâche venant de l\'agenda : pas de ré-écriture');
  state.tasks = []; state.importedEvents = {};
  const tI = addTask('Import agenda', '', 'urgent', '2026-10-12', 'perso', { gEventId: 'ev9', autoImport: true });
  reqs.length = 0;
  await taskToEvent(tI.id);
  ok(reqs.filter((r) => r.url.includes('primary/events') && r.method !== 'GET').length === 0, 'autoImport → pas d\'écriture retour vers Google');

  // instance récurrente (id avec _) : jamais de PUT
  state.tasks = [];
  const tInst = addTask('Instance récurrente', '', 'urgent', '2026-10-12', 'perso', { gEventId: 'master_20261012T080000Z' });
  reqs.length = 0;
  await taskToEvent(tInst.id);
  ok(reqs.some((r) => r.method === 'POST') && !reqs.some((r) => r.method === 'PUT'), 'id d\'instance (avec _) → création et non mise à jour');
  ok(reqs.filter((r) => r.method === 'DELETE').length === 0, 'id d\'instance : jamais de DELETE non plus');

  // ---------- Régression v3 : cœurs métier ----------
  section('Régressions v3');
  eq(addDaysISO('2026-10-31', 1), '2026-11-01', 'addDaysISO passage de mois');
  eq(fmtDate('2026-10-15'), '15/10/2026', 'fmtDate');
  state.tasks = []; state.lists = [];
  const tR = addTask('Retard', '', 'week', '2024-01-01', 'perso');
  ok(taskHtml(tR).indexOf('task urgent') >= 0, 'v12 : tâche en retard → bordure urgente (déduite au rendu)');
  completeTask(tR.id);
  eq(getTask(tR.id).cat, 'done', 'complétion');
  reactivateTask(tR.id);
  eq(getTask(tR.id).cat, 'urgent', 'réactivation');
  const l = addList('Test liste');
  addItem(l.id, 'item A');
  addItem(l.id, 'item B');
  toggleItem(l.id, l.items[0].id);
  eq(listProgress(getList(l.id)).done, 1, 'progression liste');
  duplicateList(l.id);
  eq(state.lists.length, 2, 'duplication liste');
  deleteList(state.lists[1].id);
  eq(state.lists.length, 1, 'suppression liste');

  // ---------- Édition d'événement depuis l'app (v6) ----------
  section('Libellés de jour (v6)');
  eq(dayLongLabel('2026-10-10'), 'samedi 10 octobre', 'dayLongLabel : samedi 10 octobre');
  eq(dayLongLabel('2026-10-15'), 'jeudi 15 octobre', 'dayLongLabel : jeudi 15 octobre');
  eq(dayHeaderLabel(today()), "Aujourd'hui — " + dayLongLabel(today()), 'dayHeaderLabel : Aujourd\'hui');
  eq(dayHeaderLabel(addDaysISO(today(), 1)), "Demain — " + dayLongLabel(addDaysISO(today(), 1)), 'dayHeaderLabel : Demain');
  ok(dayHeaderLabel(addDaysISO(today(), 2)).indexOf('—') < 0, 'jour plus lointain : date longue seule, sans préfixe');

  section('Édition d\'événement agenda (openEvModal / agendaSaveEvent)');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = false;
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  editEvId = null;
  state.agendaCache = { fetchedAt: Date.now(), events: [
    { id: 'master_20261012T080000Z', title: '🔴 Occurrence', color: '11', day: today(), until: null, allDay: false, startT: '08:00', endT: '09:00', loc: '' }
  ] };
  openEvModal('master_20261012T080000Z');
  eq(editEvId, null, 'occurrence récurrente (id avec _) : modale refusée');

  const D0e = today(), D2e = addDaysISO(today(), 2);
  const evE = { id: 'evEdit', title: '🔴 Brief', color: '11', day: D0e, until: null, allDay: false, startT: '09:00', endT: '10:00', loc: 'Caserne' };
  const tE = addTask('Brief', '', 'week', D0e, 'pro', { startT: '09:00', endT: '10:00', gEventId: 'evEdit', autoImport: true });
  state.importedEvents['evEdit'] = { taskId: tE.id, title: 'Brief', day: D0e, at: Date.now() };
  state.agendaCache.events = [evE];
  openEvModal('evEdit');
  eq(editEvId, 'evEdit', 'modale ouverte sur le bon événement');
  eq(document.getElementById('eTitle').value, 'Brief', 'titre prérempli sans préfixe emoji');
  eq(document.getElementById('eDay').value, D0e, 'date préremplie');
  eq(document.getElementById('eStart').value, '09:00', 'heure préremplie');
  eq(document.getElementById('eEnd').value, '10:00', 'heure de fin préremplie');
  eq(document.getElementById('eLoc').value, 'Caserne', 'lieu prérempli');
  document.getElementById('eTitle').value = '';
  eq(agendaSaveEvent(), null, 'titre vide → refusé');
  document.getElementById('eTitle').value = 'Brief déplacé';
  document.getElementById('eDay').value = D2e;
  document.getElementById('eUntil').value = addDaysISO(D2e, -1);
  eq(agendaSaveEvent(), null, '« Jusqu\'au » avant le début → refusé');
  document.getElementById('eUntil').value = '';
  document.getElementById('eStart').value = '14:00';
  document.getElementById('eEnd').value = '13:00';
  eq(agendaSaveEvent(), null, 'heure de fin avant le début → refusé');
  document.getElementById('eEnd').value = '15:30';
  document.getElementById('eLoc').value = 'Salle B';
  reqs.length = 0;
  const rEv = await agendaSaveEvent();
  eq(rEv, true, 'PATCH réussi → true');
  const patchReq = reqs.find((r) => r.method === 'PATCH');
  ok(!!patchReq && patchReq.url.includes('primary/events/' + encodeURIComponent('evEdit')), 'PATCH events.patch sur le bon id');
  const pb = JSON.parse(patchReq.body);
  eq(pb.summary, '🔴 Brief déplacé', 'préfixe couleur conservé (pro)');
  eq(pb.start.dateTime, D2e + 'T14:00:00', 'début déplacé au nouveau jour');
  ok(!!pb.start.timeZone && !!pb.end.timeZone, 'timeZone IANA présent (début et fin)');
  eq(pb.end.dateTime, D2e + 'T15:30:00', 'fin au nouveau jour');
  eq(pb.location, 'Salle B', 'lieu mis à jour');
  ok(!pb.colorId && !pb.recurrence && !pb.description, 'PATCH partiel : ni couleur, ni récurrence, ni description touchées');
  eq(evE.day, D2e, 'cache local mis à jour : jour');
  eq(evE.startT, '14:00', 'cache local mis à jour : heure de début');
  eq(getTask(tE.id).due, D2e, 'tâche importée liée : échéance mise à jour immédiatement');
  eq(getTask(tE.id).startT, '14:00', 'tâche liée : heure suivie');
  eq(getTask(tE.id).title, 'Brief déplacé', 'tâche liée : titre suivi');
  eq(editEvId, null, 'modale fermée après succès');
  eq(document.getElementById('evModal').className, 'modal hidden', 'modale masquée');

  // édition journée entière + multi-jours
  const evA = { id: 'evAllday', title: '🔵 Stage', color: '9', day: today(), until: null, allDay: true, startT: '', endT: '', loc: '' };
  state.agendaCache.events = [evA];
  openEvModal('evAllday');
  document.getElementById('eTitle').value = 'Stage';
  document.getElementById('eDay').value = '2026-10-15';
  document.getElementById('eUntil').value = '2026-10-17';
  reqs.length = 0;
  await agendaSaveEvent();
  const pb2 = JSON.parse(reqs.find((r) => r.method === 'PATCH').body);
  eq(pb2.start.date, '2026-10-15', 'all-day : start.date au 1er jour');
  eq(pb2.end.date, '2026-10-18', 'all-day multi-jours : end.date = dernier jour + 1');
  eq(pb2.summary, '🔵 Stage', 'préfixe couleur conservé (perso)');
  eq(evA.until, '2026-10-17', 'cache local : until multi-jours mémorisé');

  // horodaté sans heure de fin : +60 min par défaut (gère minuit)
  state.agendaCache.events.push(evE); // remet evEdit dans le cache (retiré au test all-day précédent)
  openEvModal('evEdit');
  document.getElementById('eTitle').value = 'Brief';
  document.getElementById('eDay').value = '2026-10-15';
  document.getElementById('eUntil').value = '';
  document.getElementById('eStart').value = '23:30';
  document.getElementById('eEnd').value = '';
  reqs.length = 0;
  await agendaSaveEvent();
  const pb3 = JSON.parse(reqs.find((r) => r.method === 'PATCH').body);
  eq(pb3.start.dateTime, '2026-10-15T23:30:00', 'début 23:30');
  eq(pb3.end.dateTime, '2026-10-16T00:30:00', 'fin par défaut +60 min → passage de minuit');

  // tri du cache après changement de jour
  const evB1 = { id: 'evB1', title: 'Tôt', color: null, day: addDaysISO(today(), 5), until: null, allDay: false, startT: '08:00', endT: '', loc: '' };
  state.agendaCache.events.push(evB1);
  openEvModal('evB1');
  document.getElementById('eTitle').value = 'Tôt';
  document.getElementById('eDay').value = today();
  document.getElementById('eUntil').value = '';
  reqs.length = 0;
  await agendaSaveEvent();
  ok(state.agendaCache.events[0].day <= state.agendaCache.events[1].day, 'cache re-trié par jour après édition');

  // échec réseau : false propre, pas de crash, modale reste ouverte
  global.__offline = true;
  openEvModal('evB1');
  document.getElementById('eTitle').value = 'Tôt';
  document.getElementById('eDay').value = today();
  const rFail = await agendaSaveEvent();
  eq(rFail, false, 'échec réseau → false');
  eq(editEvId, 'evB1', 'échec : la modale reste ouverte (on peut réessayer)');
  global.__offline = false;

  // ---------- Rendu agenda : organisation des jours (v6) ----------
  section('Rendu agenda : organisation lisible des jours');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = false;
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  state.agendaCache = { fetchedAt: Date.now(), events: [
    { id: 'rv1', title: '🔴 Garde', color: '11', day: today(), until: null, allDay: false, startT: '08:00', endT: '18:00', loc: 'Caserne' },
    { id: 'rv2', title: '🔵 Sport', color: '9', day: today(), until: null, allDay: false, startT: '19:00', endT: '20:00', loc: '' },
    { id: 'rv3', title: '🔵 Stage', color: '9', day: addDaysISO(today(), 1), until: addDaysISO(today(), 2), allDay: true, startT: '', endT: '', loc: '' }
  ] };
  renderAgenda();
  const agHtml = document.getElementById('agBody').innerHTML;
  ok(agHtml.indexOf('day-h today') >= 0, 'en-tête du jour courant marqué « today »');
  ok(agHtml.indexOf('AUJOURD\'HUI') >= 0, 'badge AUJOURD\'HUI affiché');
  ok(agHtml.indexOf('Demain — ') >= 0, '« Demain — … » libellé complet');
  ok(agHtml.indexOf('2 événements') >= 0, 'compteur du jour (2 événements aujourd\'hui)');
  ok(agHtml.indexOf('1 événement') >= 0, 'compteur du lendemain (1 événement)');
  ok(agHtml.indexOf('ev-time') >= 0, 'colonne horaire affichée');
  ok(agHtml.indexOf('dayLongLabel') < 0 && agHtml.indexOf(dayLongLabel(addDaysISO(today(), 1))) >= 0, 'nom du jour complet en français (indépendant du jour d\'exécution)');
  ok(agHtml.indexOf('jusqu\'au') >= 0, 'événement multi-jours : « jusqu\'au » affiché');
  ok(agHtml.indexOf('openEvModal(\'rv1\')') >= 0 && agHtml.indexOf('openEvModal(\'rv3\')') >= 0, 'boutons ✏️ d\'édition sur chaque événement');
  ok(agHtml.indexOf('eventToTask(\'rv2\')') >= 0, 'boutons ＋ toujours présents');
  ok(agHtml.indexOf('📍 Caserne') >= 0, 'lieu affiché');

  // ---------- v7 : listes matériel (quantités, ordre, modèles, copie) ----------
  section('Listes v7 : quantités, réordonner, modèles, copie');
  state.tasks = []; state.lists = []; state.importedEvents = {}; state.autoAgenda = false; state.cfg = null;
  searchQ = '';
  const lM = addList('Matériel manœuvre');
  const it1 = addItem(lM.id, '4x pulkas');
  const it2 = addItem(lM.id, '2 × cordes 40 m');
  const it3 = addItem(lM.id, 'trousse secours');
  eq(it1.qty, 4, 'parseQty : « 4x pulkas » → quantité 4');
  eq(it1.text, 'pulkas', 'parseQty : texte nettoyé « pulkas »');
  eq(it2.qty, 2, 'parseQty : « 2 × cordes 40 m » → quantité 2 (× unicode)');
  eq(it2.text, 'cordes 40 m', 'parseQty : texte « cordes 40 m »');
  eq(it3.qty, null, 'parseQty : « trousse secours » → pas de quantité');
  eq(parseQty('3 pulkas').qty, null, '« 3 pulkas » sans « x » → pas de quantité (pas d\'ambiguïté)');

  ok(moveItem(lM.id, it1.id, -1) === false, 'moveItem : déjà en haut → aucun effet');
  ok(moveItem(lM.id, it1.id, 1) === true, 'moveItem : descendre');
  eq(getList(lM.id).items[1].id, it1.id, 'pulkas maintenant en 2e position');
  ok(moveItem(lM.id, it3.id, 1) === false, 'moveItem : dernier → aucun effet vers le bas');
  ok(moveItem(lM.id, it1.id, -1) === true, 'moveItem : remonter');
  eq(getList(lM.id).items[0].id, it1.id, 'pulkas de retour en tête');

  ok(toggleTemplate(lM.id) === true && getList(lM.id).template === true, 'toggleTemplate : liste figée comme modèle');
  toggleItem(lM.id, it1.id); // coche pulkas sur le modèle
  const fromTpl = newFromTemplate(lM.id);
  ok(!!fromTpl, 'newFromTemplate crée une liste');
  eq(fromTpl.name, 'Matériel manœuvre — ' + fmtDate(today()), 'nom de la copie : source + date du jour');
  eq(fromTpl.template, false, 'la copie n\'est PAS un modèle');
  ok(fromTpl.items.every(function (it) { return it.done === false; }), 'cochages à zéro sur la copie');
  eq(fromTpl.items[0].qty, 4, 'quantités conservées sur la copie');
  ok(toggleTemplate(lM.id) === true && getList(lM.id).template === false, 'toggleTemplate : désactivation');

  const sec1 = addItem(lM.id, 'CODE-ALPHA-77', true);
  eq(sec1.secret, true, 'addItem(…, true) → élément code masqué');
  const dup = duplicateList(lM.id);
  const dupSec = dup.items.find(function (it) { return it.secret === true; });
  ok(!!dupSec && dupSec.text === 'CODE-ALPHA-77', 'duplication conserve le code (texte intact)');
  ok(dup.items.every(function (it) { return it.done === false; }), 'duplication : cochages à zéro');
  eq(dup.items[0].qty, 4, 'duplication : quantité conservée');

  global.__copied = null;
  toggleItem(lM.id, it3.id); // trousse cochée
  ok(copyListText(lM.id) === true, 'copyListText retourne true');
  ok(typeof global.__copied === 'string' && global.__copied.indexOf('📋 Matériel manœuvre') === 0, 'copie : en-tête liste');
  ok(global.__copied.indexOf('☒ 4 × pulkas') >= 0 && global.__copied.indexOf('☐ 2 × cordes 40 m') >= 0, 'copie : quantités au format « 4 × » + cases ☐/☒ justes');
  ok(global.__copied.indexOf('☒ trousse secours') >= 0, 'copie : élément coché ☒');
  ok(global.__copied.indexOf('•••••• (code masqué)') >= 0, 'copie : code masqué, jamais en clair');
  ok(global.__copied.indexOf('CODE-ALPHA-77') < 0, 'copie : le code réel n\'apparaît pas');
  global.__copied = null;
  ok(copyItemSecret(lM.id, sec1.id) === true, 'copyItemSecret retourne true');
  ok(global.__copied === 'CODE-ALPHA-77', 'copyItemSecret copie le vrai code dans le presse-papiers');

  // export / import v7 : qty, secret, template
  const dump7 = JSON.stringify(exportData());
  ok(JSON.parse(dump7).version === 13, 'export version 13');
  ok(dump7.indexOf('CODE-ALPHA-77') >= 0, 'export : le code est dans la sauvegarde (chiffré côté appareil uniquement)');
  state.lists = [];
  ok(importJsonText(dump7) === true, 'import de l\'export v7');
  const lBack = state.lists.find(function (l) { return l.name === 'Matériel manœuvre'; });
  ok(!!lBack && lBack.items[0].qty === 4, 'import : quantité restaurée');
  const sBack = lBack.items.find(function (it) { return it.secret === true; });
  ok(!!sBack && sBack.text === 'CODE-ALPHA-77', 'import : code restauré');
  ok(lBack.template === false, 'import : template=false restauré');
  ok(dump7.indexOf('"revealed"') < 0 && dump7.indexOf('revealed') < 0, 'export : état de révélation jamais exporté');

  const normL = normalizeListIn({ id: 'nl1', name: 'Norm', items: [ { id: 'i1', text: 'ok', qty: 5555 }, { id: 'i2', text: 'bon', qty: 3 }, 42 ] });
  eq(normL.items.length, 2, 'normalizeListIn : items non-objets écartés');
  eq(normL.items[0].qty, null, 'normalizeListIn : quantité aberrante (≥1000) rejetée');
  eq(normL.items[1].qty, 3, 'normalizeListIn : quantité valide conservée');
  eq(normL.template, false, 'normalizeListIn : template booléen strict');

  // ---------- v7 : rendu listes, codes masqués, recherche live ----------
  section('Rendu & recherche v7');
  ok(toggleTemplate(lBack.id) === true, 'repasser la liste en modèle pour le rendu');
  const card = listCardHtml(lBack, false);
  ok(card.indexOf('📋 modèle') >= 0, 'listCardHtml : badge « 📋 modèle »');
  ok(card.indexOf('newFromTemplate(\'' + lBack.id + '\')') >= 0, 'listCardHtml : bouton ➕ Nouvelle depuis');
  ok(listCardHtml(dup, false).indexOf('📋 modèle') < 0, 'listCardHtml : pas de badge sans modèle');

  openList(lBack.id);
  let det = document.getElementById('listDetail').innerHTML;
  ok(det.indexOf('••••••') >= 0, 'rendu : code affiché masqué');
  ok(det.indexOf('CODE-ALPHA-77') < 0, 'rendu : code jamais en clair tant que masqué');
  ok(det.indexOf('toggleReveal(\'' + sBack.id + '\')') >= 0, 'rendu : bouton 👁 révéler');
  ok(det.indexOf('copyItemSecret(\'' + lBack.id + '\',\'' + sBack.id + '\')') >= 0, 'rendu : bouton 📋 copier le code');
  ok(det.indexOf('toggleReorderMode()') >= 0 && det.indexOf('moveItem(') < 0, 'v13 : les ▲▼ sont rangés derrière le ⇅ (mode normal allégé — avant : 4-6 boutons de 40 px par ligne)');
  ok(det.indexOf('4 × ') >= 0, 'rendu : quantité « 4 × » affichée');
  toggleReveal(sBack.id);
  det = document.getElementById('listDetail').innerHTML;
  ok(det.indexOf('CODE-ALPHA-77') >= 0, 'après 👁 : code visible à l\'écran');
  ok(det.indexOf('••••••') < 0, 'après 👁 : plus de masque ••••••');
  toggleReveal(sBack.id);
  det = document.getElementById('listDetail').innerHTML;
  ok(det.indexOf('CODE-ALPHA-77') < 0, '🙈 : code re-masqué');

  state.tasks = [];
  addTask('Préparer trousse héliportée', 'voir DIH', 'week', '2026-10-20', 'pro');
  addTask('Ranger le local motopompes', '', 'week', '2026-10-21', 'perso');
  view = 'tasks'; tab = 'urgent';
  setSearch('trousse');
  eq(searchQ, 'trousse', 'setSearch normalise la requête');
  let tasksHtml = document.getElementById('list').innerHTML;
  ok(tasksHtml.indexOf('héliportée') >= 0, 'recherche « trousse » trouve la tâche par titre');
  ok(tasksHtml.indexOf('motopompes') < 0, 'recherche : tâche sans correspondance absente');
  eq(document.getElementById('searchClear').className, '', 'bouton ✕ visible pendant la recherche');
  setSearch('dih');
  tasksHtml = document.getElementById('list').innerHTML;
  ok(tasksHtml.indexOf('héliportée') >= 0, 'recherche par contenu de la note');
  tab = 'lists';
  setSearch('manœuvre');
  let listsHtml = document.getElementById('list').innerHTML;
  ok(listsHtml.indexOf('liste(s) trouvée(s)') >= 0, 'recherche liste : compteur affiché');
  ok(listsHtml.indexOf('Matériel manœuvre') >= 0, 'recherche liste : carte affichée');
  setSearch('pulkas');
  listsHtml = document.getElementById('list').innerHTML;
  ok(listsHtml.indexOf('Matériel manœuvre') >= 0, 'recherche par item d\'une liste');
  setSearch('zzzz-inexistant');
  listsHtml = document.getElementById('list').innerHTML;
  ok(listsHtml.indexOf('Aucune liste ne correspond') >= 0, 'recherche sans résultat : message dédié');
  setSearch('');
  eq(searchQ, '', '✕ efface la recherche');
  eq(document.getElementById('searchClear').className, 'hidden', 'bouton ✕ caché hors recherche');
  listsHtml = document.getElementById('list').innerHTML;
  ok(listsHtml.indexOf('Aucune liste ne correspond') < 0, 'affichage normal restauré');

  // ---------- v8 : fiabilisation (audit 2026-10-11) ----------
  section('v8 : anti-doublon agenda ↔ tâches (gEventId)');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = true;
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  const tOwn = addTask('Ma tâche app', '', 'week', '2026-10-20', 'pro');
  tOwn.gEventId = 'gown1'; // événement créé par la tâche : il revient de Google au refresh
  eq(importEventAsTask({ id: 'gown1', title: 'Ma tâche app', color: '11', day: '2026-10-20', until: null, allDay: true, startT: '', endT: '', loc: '' }, true), null, 'l’événement déjà possédé par une tâche ne devient PAS une 2e tâche');
  eq(state.tasks.length, 1, 'aucune tâche dupliquée');
  const tSer = addTask('Garde récurrente', '', 'week', '2026-10-21', 'pro');
  tSer.gEventId = 'base77';
  eq(importEventAsTask({ id: 'base77_20261021T080000Z', title: 'Garde récurrente', color: '11', day: '2026-10-21', until: null, allDay: true, startT: '', endT: '', loc: '' }, true), null, 'instance (id avec _) d’un événement possédé : pas de tâche');
  eq(state.tasks.length, 2, 'toujours 2 tâches, pas plus');
  ok(!!state.importedEvents['base77_20261021T080000Z'], 'l’instance est mémorisée comme gérée (pas re-testée à chaque refresh)');
  const tImp8 = importEventAsTask({ id: 'newfree1', title: 'Nouvel événement', color: '9', day: '2026-10-25', until: null, allDay: true, startT: '', endT: '', loc: '' }, true);
  ok(!!tImp8, 'événement inconnu → tâche importée (le vrai import continue de marcher)');

  section('v8 : import / restauration force + instantané de secours');
  const olderDump = JSON.stringify({ app: 'taches-relances', version: 8, tasks: [{ id: 'old8', title: 'Ancienne', cat: 'urgent', due: '2026-10-20' }], lists: [], savedAt: Date.now() - 100000, autoAgenda: false, importedEvents: {}, tombstones: [] });
  ok(importJsonText(olderDump) === false, 'sans force : fichier plus ancien toujours refusé (garde-fou inchangé)');
  ok(importJsonText(olderDump, { force: true }) === true, 'avec force (restauration explicite) : accepté');
  ok(!!getTask('old8'), 'tâche du fichier restaurée');
  ok(typeof store[KEY + '-secours'] === 'string' && store[KEY + '-secours'].length > 5, 'instantané de secours gardé avant remplacement');

  section('v8 : erreur API ≠ agenda vide + pagination');
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = true;
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  state.agendaCache = { fetchedAt: Date.now() - 1000, events: [ { id: 'keepv8', title: 'Événement sain', color: '9', day: today(), until: null, allDay: true, startT: '', endT: '', loc: '' } ] };
  const tKeep = importEventAsTask(state.agendaCache.events[0], true);
  ok(!!tKeep, 'tâche liée à l’événement sain créée');
  global.__apiFail = true; // Google répond 403 (quota, token expiré…)
  const rFail8 = await agendaRefresh(true);
  eq(rFail8, false, 'erreur Google 403 → agendaRefresh échoue (pas de succès mensonger)');
  ok((state.agendaCache.events || []).length === 1, 'le cache n’est PAS vidé par une erreur API');
  ok(!tKeep.evGone, 'aucune tâche marquée « disparue » après une erreur API');
  global.__apiFail = false;
  // pagination : 3 événements découpés en 2 pages → rien de perdu
  state.tasks = []; state.importedEvents = {}; state.autoAgenda = false;
  const Dp0 = addDaysISO(today(), 1);
  global.__eventsFixture = { items: [
    { id: 'p1', summary: 'Un', colorId: null, start: { date: Dp0 }, end: { date: addDaysISO(Dp0, 1) } },
    { id: 'p2', summary: 'Deux', colorId: null, start: { date: addDaysISO(Dp0, 2) }, end: { date: addDaysISO(Dp0, 3) } },
    { id: 'p3', summary: 'Trois', colorId: null, start: { date: addDaysISO(Dp0, 4) }, end: { date: addDaysISO(Dp0, 5) } }
  ] };
  global.__pageTwo = true;
  reqs.length = 0;
  await agendaRefresh(true);
  const getsP = reqs.filter((r) => r.method === 'GET' && r.url.includes('primary/events'));
  eq(getsP.length, 2, 'pagination : les 2 pages sont demandées');
  ok(getsP.some((r) => r.url.includes('pageToken=p2')), 'page 2 demandée avec le nextPageToken');
  eq((state.agendaCache.events || []).length, 3, 'les événements des 2 pages sont fusionnés (aucun perdu au-delà de 250)');
  global.__pageTwo = false;
  // fenêtre depuis minuit local + fuseau explicite
  const q8 = {};
  getsP[0].url.split('?')[1].split('&').forEach((kv) => { const [k, v] = kv.split('='); q8[k] = decodeURIComponent(v || ''); });
  const midnight8 = new Date(); midnight8.setHours(0, 0, 0, 0);
  eq(Date.parse(q8.timeMin), midnight8.getTime(), 'timeMin = minuit local (les événements passés du jour restent visibles)');
  ok(!!q8.timeZone && q8.timeZone.length > 0, 'timeZone envoyé (pas de dérive horaire)');

  section('v8 : fusion Drive — updatedAt, pierres tombales, fusion avant envoi');
  state.tasks = []; state.lists = []; state.importedEvents = {}; state.tombstones = [];
  state.cfg = { dCid: 'DCID', dSecret: '', dRefresh: 'DRT' };
  const tStay = addTask('Modifiée ici', '', 'week', '2026-10-20', 'perso');
  save(); // updatedAt posé
  const tDeadRemote = addTask('Supprimée ailleurs', '', 'week', '2026-10-21', 'perso');
  save();
  const remote8 = {
    app: 'taches-relances', version: 8, savedAt: Date.now(), autoAgenda: false, importedEvents: {},
    tasks: [
      { id: 'rnew1', title: 'Nouvelle distante', cat: 'week', due: '2026-10-22', type: 'pro', updatedAt: Date.now() - 5000 },
      { id: tStay.id, title: 'Modifiée ailleurs', cat: 'urgent', due: '2026-10-20', type: 'perso', updatedAt: Date.now() - 60000 },
      { id: 'rmod1', title: 'Distante plus récente', cat: 'later', due: '2026-10-23', type: 'perso', updatedAt: Date.now() }
    ],
    lists: [ { id: 'rlnew', name: 'Liste distante', items: [], updatedAt: Date.now() - 5000 } ],
    tombstones: [ { id: tDeadRemote.id, kind: 'task', at: Date.now() } ]
  };
  global.__driveRemote = remote8;
  const nF8 = await driveMergeOnStart();
  eq(nF8, 4, 'fusion : 2 ajouts + 1 liste + 1 suppression distante → total 4 (v12 compte TOUT, avant : 3 ajouts seulement)');
  eq(getTask(tStay.id).title, 'Modifiée ici', 'modif locale plus récente que la distante → locale conservée');
  ok(!getTask(tDeadRemote.id), 'tâche supprimée sur l’autre appareil → supprimée ici aussi (pierres tombales)');
  ok(!!getTask('rmod1'), 'tâche distante ajoutée');
  // suppression locale : ne revient jamais depuis Drive
  deleteTask('rmod1'); // tombstone locale posée
  remote8.tasks.find((t) => t.id === 'rmod1').updatedAt = Date.now() - 1000; // Drive la connaît encore, mais plus vieille que la suppression
  await driveMergeOnStart();
  ok(!getTask('rmod1'), 'supprimée localement : Drive ne la fait PAS revenir');
  // fusion avant envoi : Drive injoignable → rien n’est écrasé
  driveMergedOk = false;
  global.__driveFail = true;
  reqs.length = 0;
  const rBk8 = await driveBackupNow(false);
  eq(rBk8, false, 'sans fusion réussie : sauvegarde annulée');
  ok(!reqs.some((r) => r.url.includes('upload/drive/v3/files')), 'rien n’a été envoyé/écrasé sur Drive');
  global.__driveFail = false;
  global.__driveRemote = null;

  section('v8 : anti-doublon d’événements + cache token');
  state.tasks = []; state.importedEvents = {}; state.pendingEventDeletes = [];
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  const tDup = addTask('Anti-doublon', '', 'urgent', '2026-10-12', 'perso');
  reqs.length = 0;
  await taskToEvent(tDup.id);
  const postB8 = JSON.parse(reqs.find((r) => r.method === 'POST' && r.url.includes('primary/events')).body);
  ok(typeof postB8.id === 'string' && postB8.id.indexOf('evt') === 0 && /^[a-v0-9]+$/.test(postB8.id), 'id déterministe base32hex envoyé dans le POST');
  eq(postB8.id, clientEventId(tDup.id), 'id dérivé de l’id de la tâche (renvoi = jamais de doublon)');
  global.__postDup = true; // Google répond 409 « déjà créé »
  const tDup2 = addTask('409 test', '', 'urgent', '2026-10-13', 'perso');
  const r409 = await taskToEvent(tDup2.id);
  eq(r409, true, 'v13 : 409 « déjà créé » → PUT de résurrection, toujours un succès');
  eq(tDup2.gSync, 'ok', 'statut sync ok malgré le 409');
  ok(reqs.some((r) => r.method === 'PUT' && r.url.indexOf(clientEventId(tDup2.id)) >= 0), 'v13 : le 409 déclenche un PUT status confirmed sur l’id pris (avant : « 📅 agenda ✓ » mensonger, sans événement)');
  eq(tDup2.gEventId, 'updated-id', 'v13 : l’événement est VRAIMENT réanimé (id renvoyé par Google)');
  global.__postDup = false;
  // triple déclenchement simultané de la reprise → UN SEUL envoi
  const tPend8 = addTask('Pendant', '', 'urgent', '2026-10-14', 'perso');
  tPend8.gSync = 'pending';
  reqs.length = 0;
  retryPendingSync(); retryPendingSync(); retryPendingSync();
  await new Promise((r) => setTimeout(r, 30));
  eq(reqs.filter((r) => r.method === 'POST' && r.url.includes('primary/events')).length, 1, 'triple appel → UN SEUL POST (garde anti-doublon)');
  eq(tPend8.gSync, 'ok', 'la tâche en attente est partie et marquée ok');
  // cache token : 2 opérations → 1 seul échange oauth
  _tokCache = {}; // repart à zéro pour compter proprement
  const tT1 = addTask('Cache A', '', 'urgent', '2026-10-15', 'perso');
  const tT2 = addTask('Cache B', '', 'urgent', '2026-10-16', 'perso');
  reqs.length = 0;
  await taskToEvent(tT1.id);
  await taskToEvent(tT2.id);
  eq(reqs.filter((r) => r.url.includes('oauth2.googleapis.com/token')).length, 1, 'cache token : 2 opérations → 1 seul échange de jeton');

  section('v8 : codes sans quantité, ids validés, sauvegarde locale');
  state.tasks = []; state.lists = [];
  const lC8 = addList('Codes');
  const cS8 = addItem(lC8.id, '4x1234', true);
  eq(cS8.qty, null, 'code « 4x1234 » : pas de quantité découpée');
  eq(cS8.text, '4x1234', 'code conservé entier');
  const bad8 = normalizeTaskIn({ id: "x');alert(1);('", title: 'Mauvaise', cat: 'urgent' });
  ok(bad8.id !== "x');alert(1);('", 'id non conforme régénéré (tâche)');
  ok(/^[\w-]{1,64}$/.test(bad8.id), 'id régénéré conforme');
  const badL8 = normalizeListIn({ id: "l');evil(", name: 'Mauvaise liste', items: [{ id: "i');evil(", text: 'item' }] });
  ok(/^[\w-]{1,64}$/.test(badL8.id) && /^[\w-]{1,64}$/.test(badL8.items[0].id), 'ids liste et item régénérés (pas d’injection dans les onclick)');
  const realSet = global.localStorage.setItem;
  global.localStorage.setItem = function (k, v) { throw new Error('QuotaExceeded'); };
  persist(); // ne doit ni crasher ni rester silencieux
  global.localStorage.setItem = realSet;
  ok(true, 'persist() survit à un quota localStorage plein (erreur signalée à l’utilisateur)');

  section('v8 : sous-listes récursives + copiées');
  state.lists = [];
  const lA8 = addList('Parent');
  const lB8 = addList('Fille', lA8.id);
  addList('Petite-fille', lB8.id);
  searchQ = '';
  const ovHtml8 = listsOverviewHtml();
  ok(ovHtml8.indexOf('Petite-fille') >= 0, 'sous-liste de niveau 3 visible dans l’aperçu (rendu récursif)');
  ok((ovHtml8.match(/class="listcard sub"/g) || []).length >= 2, 'fille et petite-fille indentées comme sous-listes');
  const dupA8 = duplicateList(lA8.id);
  const dupB8 = state.lists.filter((l) => l.parent === dupA8.id)[0];
  ok(!!dupB8 && dupB8.name === 'Fille', 'duplication : la sous-liste est copiée');
  ok(state.lists.some((l) => l.parent === dupB8.id && l.name === 'Petite-fille'), 'duplication : la sous-sous-liste aussi');

  section('v8 : événements multi-jours affichés chaque jour');
  state.tasks = []; state.importedEvents = {};
  state.agendaCache = { fetchedAt: Date.now(), events: [
    { id: 'mv8', title: 'Stage 3 jours', color: '9', day: addDaysISO(today(), 1), until: addDaysISO(today(), 3), allDay: true, startT: '', endT: '', loc: '' }
  ] };
  renderAgenda();
  const agH8 = document.getElementById('agBody').innerHTML;
  eq((agH8.match(/Stage 3 jours/g) || []).length, 3, 'l’événement de 3 jours apparaît sur ses 3 jours');
  eq((agH8.match(/openEvModal\('mv8'\)/g) || []).length, 3, 'bouton ✏️ présent sur chaque jour couvert');

  // ================== v9 + v10 + v11 ==================
  section('v11 : version, 3 onglets, onglet Tâches classé par date puis horaire');
  ok(TABS[0] === 'tasks' && TABS.length === 3, '3 onglets seulement, 📋 Tâches en tête');
  ok(html.indexOf('var tab = "tasks"') >= 0, 'onglet par défaut = 📋 Tâches (accueil)');
  ok(html.includes('id="syncPill"') && html.includes('id="themeBtn"') && html.includes('id="quickModal"') && html.includes('id="deferModal"') && html.includes('id="itemModal"'), 'pastille synchro, bouton thème, feuilles rapide/report/élément présents');
  ok(html.includes('role="tab"'), 'onglets en <button role="tab">');
  ok(html.includes('classList.contains("modal")') && html.includes('function closeAllSheets'), 'v13 : tap sur le fond + Échap ferment via les listeners globaux (pointerdown mémorisé, click vérifié)');
  ok(html.includes('html.light body'), 'thème clair défini en CSS');
  ok(html.includes('min-height: 44px'), 'cibles tactiles 44 px');
  ok(html.indexOf('todayHtml') < 0 && html.indexOf('id="mCats"') < 0, 'écran Aujourd’hui et boutons de catégorie retirés');
  ok(html.indexOf('id="backupCard"') >= 0 && html.indexOf('function renderBackupCard') >= 0, 'carte ☁️ Sauvegarde unifiée présente');
  ok(html.indexOf('renderDriveCard') < 0 && html.indexOf('id="driveCard"') < 0 && html.indexOf('id="persistLbl"') < 0, 'ancienne double carte de sauvegarde retirée');
  state.tasks = []; state.importedEvents = {}; state.syncErrors = {};
  state.cfg = null;
  const tLate10 = addTask('Retard v10', '', 'urgent', addDaysISO(today(), -2), 'pro');
  const tToday10 = addTask('Du jour v10', '', 'urgent', today(), 'perso');
  const tTom10 = addTask('Demain v10', '', 'week', addDaysISO(today(), 1), 'perso');
  eq(counts().today, 2, 'badge = retards + tâches du jour (2)');
  eq(counts().tasks, 3, 'compteur 📋 = toutes les tâches actives');
  renderTabs();
  const tabsHtml10 = document.getElementById('tabbar').innerHTML;
  ok(tabsHtml10.indexOf('role="tab"') >= 0, 'rendu des onglets : role=tab');
  ok(tabsHtml10.indexOf('aria-selected="true"') >= 0 && tabsHtml10.indexOf('aria-selected="false"') >= 0, 'aria-selected présent (actif / inactif)');
  ok(tabsHtml10.indexOf('📋') >= 0 && tabsHtml10.indexOf('⭐') < 0, 'onglet 📋 Tâches affiché, plus d’onglet ⭐');
  state.agendaCache = { fetchedAt: Date.now(), events: [
    { id: 'ev10a', title: 'Manœuvre DIH', color: '11', day: today(), until: null, allDay: false, startT: '08:00', endT: '12:00', loc: '' },
    { id: 'ev10b', title: 'Stage multi', color: '9', day: addDaysISO(today(), -1), until: addDaysISO(today(), 1), allDay: true, startT: '', endT: '', loc: '' },
    { id: 'ev10c', title: 'Événement demain', color: '9', day: addDaysISO(today(), 1), until: null, allDay: true, startT: '', endT: '', loc: '' }
  ] };
  const th10 = tasksTabHtml();
  ok(th10.indexOf('En retard') >= 0, 'onglet Tâches : section retards');
  ok(th10.indexOf('Retard v10') >= 0, 'les retards y figurent');
  ok(th10.indexOf("Aujourd'hui") >= 0, 'bandeau du jour présent');
  ok(th10.indexOf('Du jour v10') >= 0, 'les tâches du jour y figurent');
  ok(th10.indexOf('Demain v10') >= 0, 'les tâches de demain y figurent (classées par date)');
  ok(th10.indexOf('Événement demain') < 0, 'les événements agenda ne s’y mélangent pas (bouton 📅)');
  ok(th10.indexOf('Manœuvre DIH') >= 0, 'v13 : l’événement du jour s’affiche EN LIGNE dans la section Aujourd’hui (avant : juste un compteur)');
  ok(th10.indexOf("eventToTask('ev10a')") >= 0, 'v13 : son bouton ＋ le convertit en tâche en un tap');
  ok(th10.indexOf('Retard v10') < th10.indexOf('Du jour v10'), 'retards AVANT le jour');
  ok(th10.indexOf('Du jour v10') < th10.indexOf('Demain v10'), 'jour AVANT demain (chronologique)');

  section('v11 : classement par horaire dans une journée');
  state.tasks = []; state.importedEvents = {};
  const tNoTime = addTask('Sans heure', '', 'urgent', today(), 'perso');
  const t14 = addTask('À 14 h', '', 'urgent', today(), 'perso', { startT: '14:00', endT: '15:00' });
  const t8 = addTask('À 8 h', '', 'urgent', today(), 'perso', { startT: '08:00', endT: '09:00' });
  const tNoDate = addTask('Flottante', '', 'later', null, 'perso');
  const th11 = tasksTabHtml();
  ok(th11.indexOf('Sans date') >= 0, 'section Sans date en fin d’onglet');
  const i8 = th11.indexOf('À 8 h'), i14 = th11.indexOf('À 14 h'), iN = th11.indexOf('Sans heure'), iD = th11.indexOf('Flottante');
  ok(iN >= 0 && i8 > iN, 'sans heure AVANT les horodatées du jour');
  ok(i8 >= 0 && i14 > i8, '8 h AVANT 14 h (horaire croissant)');
  ok(iD > i14 && iD > i8, 'sans date en DERNIER');
  // la modale classe par la date, plus de boutons catégorie (v11)
  openModal(null);
  ok(document.getElementById('mTypes').innerHTML.indexOf('Pro') >= 0, 'types pro/perso toujours dans la modale');
  ok(String(document.getElementById('mTypes').innerHTML).indexOf('mCat') < 0, 'plus de radios Urgent/Semaine/Plus tard dans la modale');
  saveModal(); // sans titre : rien ne se passe (garde-fou inchangé)
  eq(state.tasks.length, 4, 'enregistrement sans titre : aucune tâche créée');

  section('v11 : carte ☁️ Sauvegarde simplifiée (état clair, options avancées)');
  state.cfg = null; state.driveSyncedAt = null; state.syncErrors = {};
  renderBackupCard();
  let bc11 = document.getElementById('backupCard').innerHTML;
  ok(bc11.indexOf('Sauvegarde sur cet appareil seulement') >= 0, 'non configurée : avertissement clair affiché');
  ok(bc11.indexOf('dRefresh') >= 0, 'non configurée : champs Drive proposés');
  ok(bc11.indexOf('Options avancées') >= 0, 'les réglages avancés sont repliés');
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT', dCid: 'dCID', dRefresh: 'dRT' };
  state.driveSyncedAt = Date.now() - 120000;
  renderBackupCard();
  bc11 = document.getElementById('backupCard').innerHTML;
  ok(bc11.indexOf('Tout est sauvegardé') >= 0, 'configurée : état 🟢 avec ancienneté');
  ok(bc11.indexOf('Sauvegarder maintenant') >= 0, 'bouton principal unique');
  ok(bc11.indexOf('Restaurer') >= 0 && bc11.indexOf('Exporter un fichier de secours') >= 0, 'secours/restauration rangés dans les options avancées');
  state.driveSyncedAt = null;
  renderBackupCard();
  ok(document.getElementById('backupCard').innerHTML.indexOf('première sauvegarde en attente') >= 0, 'jamais sauvegardé : état 🟠 explicite');

  section('v10 : saisie rapide (une ligne, puces de date, agenda mémorisé)');
  state.tasks = []; state.importedEvents = {}; state.syncErrors = {};
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  els['qTitle'] = makeEl('qTitle'); els['qTitle'].value = 'Tâche rapide';
  els['qAgenda'] = makeEl('qAgenda'); els['qAgenda'].checked = false;
  quickPick('tomorrow');
  quickSave();
  let tQ = state.tasks.find((x) => x.title === 'Tâche rapide');
  ok(!!tQ, 'quickSave crée la tâche');
  eq(tQ.cat, 'week', 'catégorie déduite de la date (demain → Semaine)');
  eq(tQ.due, addDaysISO(today(), 1), 'échéance demain posée par la puce');
  eq(state.cfg.quickAgenda, false, 'choix « agenda » mémorisé (OFF ici)');
  els['qTitle'].value = 'Rapide pro';
  els['qAgenda'].checked = true;
  quickPickType('pro');
  quickPick('today');
  reqs.length = 0;
  quickSave();
  tQ = state.tasks.find((x) => x.title === 'Rapide pro');
  eq(tQ.type, 'pro', 'puce 🔴 Pro respectée');
  eq(tQ.cat, 'urgent', 'aujourd’hui → Urgent');
  eq(state.cfg.quickAgenda, true, 'choix « agenda » mémorisé (ON)');
  await new Promise((r) => setTimeout(r, 5));
  ok(reqs.some((r) => r.method === 'POST' && r.url.indexOf('primary/events') >= 0), 'case agenda cochée → événement Google créé');
  els['qTitle'].value = '';
  const nBefore10 = state.tasks.length;
  quickSave();
  eq(state.tasks.length, nBefore10, 'sans titre : rien n’est créé');
  eq(catForDate(today()), 'urgent', 'catForDate : aujourd’hui → urgent');
  eq(catForDate(addDaysISO(today(), 3)), 'week', 'catForDate : +3 j → semaine');
  eq(catForDate(addDaysISO(today(), 12)), 'later', 'catForDate : +12 j → plus tard');

  section('v10 : vrai Reporter ⬅️ (la date change, l’événement suit)');
  state.tasks = []; state.importedEvents = {}; state.syncErrors = {};
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  const tDf = addTask('À reporter', '', 'urgent', today(), 'perso', { until: addDaysISO(today(), 2) });
  deferTask(tDf.id);
  eq(document.getElementById('deferModal').className, 'modal', '⬅️ ouvre la feuille de report');
  deferBy(7);
  const tDf2 = getTask(tDf.id);
  eq(tDf2.due, addDaysISO(today(), 7), 'report +7 jours : la date change vraiment');
  eq(tDf2.deferredFrom, today(), 'trace « reportée du … » conservée');
  eq(tDf2.cat, 'week', 'catégorie recalculée après report');
  eq(tDf2.until, addDaysISO(today(), 9), 'v13 : le report DÉCALE le « jusqu’au » (durée 2 j conservée : J+2 → J+9 ; avant : durée multi-jours perdue)');
  eq(document.getElementById('deferModal').className, 'modal hidden', 'la feuille se referme après le report');
  // tâche liée à un événement : le report met à jour l’événement Google (PUT)
  const tEv10 = addTask('Avec agenda', '', 'urgent', today(), 'pro');
  tEv10.gEventId = 'evtput10';
  reqs.length = 0;
  deferTo(tEv10.id, addDaysISO(today(), 2));
  await new Promise((r) => setTimeout(r, 5));
  ok(reqs.some((r) => r.method === 'PUT' && r.url.indexOf('evtput10') >= 0), 'report → l’événement agenda est mis à jour (PUT)');
  // instance récurrente importée : jamais de ré-écriture vers Google
  const tInst10 = addTask('Import récurrent', '', 'urgent', today(), 'perso');
  tInst10.gEventId = 'basex_20261011'; tInst10.autoImport = true;
  reqs.length = 0;
  deferTo(tInst10.id, addDaysISO(today(), 3));
  await new Promise((r) => setTimeout(r, 5));
  ok(!reqs.some((r) => r.method === 'PUT' || r.method === 'POST'), 'tâche importée d’une instance : le report ne ré-écrit jamais vers Google');

  section('v10 : Annuler 5 s (✓ et 🗑️) + occurrence suivante des répétitions');
  state.tasks = []; state.importedEvents = {}; state.syncErrors = {};
  state.cfg = null;
  const tCk10 = addTask('Fait puis annulé', '', 'week', today(), 'perso');
  completeTask(tCk10.id);
  eq(getTask(tCk10.id).cat, 'done', '✓ marque la tâche faite');
  ok(document.getElementById('toast').innerHTML.indexOf('Annuler') >= 0, 'toast avec bouton Annuler');
  undoLast();
  eq(getTask(tCk10.id).cat, 'week', 'Annuler restaure la tâche non faite');
  eq(getTask(tCk10.id).doneAt, null, 'doneAt effacé par l’annulation');
  const tDel10 = addTask('Supprimée puis annulée', '', 'later', null, 'perso');
  deleteTask(tDel10.id);
  ok(!getTask(tDel10.id), '🗑️ supprime la tâche');
  ok((state.tombstones || []).some((x) => x.id === tDel10.id), 'pierre tombale posée');
  ok(document.getElementById('toast').innerHTML.indexOf('Annuler') >= 0, 'toast Annuler après suppression');
  undoLast();
  ok(!!getTask(tDel10.id), 'Annuler restaure la tâche supprimée');
  ok(!(state.tombstones || []).some((x) => x.id === tDel10.id), 'la pierre tombale est retirée (Drive ne re-supprimera pas)');
  undoLast(); // sans action en attente : ne doit rien casser
  ok(true, 'undoLast sans action : sans erreur');
  // répétition quotidienne ×3 → la 2e occurrence est créée à la validation
  const tRep10 = addTask('Piqure chien', '', 'urgent', today(), 'perso', { rep: { mode: 'daily', count: 3 } });
  completeTask(tRep10.id);
  const occ10 = state.tasks.find((x) => x.title === 'Piqure chien' && x.id !== tRep10.id);
  ok(!!occ10, 'occurrence suivante créée automatiquement');
  eq(occ10.due, addDaysISO(today(), 1), 'prochaine occurrence = demain (daily)');
  eq(occ10.rep.count, 2, 'le décompte des répétitions suit (3 → 2)');
  eq(occ10.cat, 'week', 'catégorie de la nouvelle occurrence déduite de la date');
  undoLast();
  ok(!state.tasks.find((x) => x.title === 'Piqure chien' && x.id !== tRep10.id), 'Annuler retire aussi l’occurrence créée');
  eq(getTask(tRep10.id).cat, 'urgent', '… et la tâche originale redevient à faire (sa catégorie d’origine)');
  completeTask(tRep10.id);
  undoLast();
  // répétition mensuelle sans limite → +1 mois
  eq(addMonthsISO('2026-01-31', 1), '2026-02-28', 'addMonthsISO : 31 janvier + 1 mois = 28 février');
  eq(addMonthsISO('2026-10-31', 2), '2026-12-31', 'addMonthsISO : 31 octobre + 2 mois = 31 décembre');
  const tMo10 = addTask('Visa mensuel', '', 'urgent', today(), 'perso', { rep: { mode: 'monthly' } });
  completeTask(tMo10.id);
  const occMo = state.tasks.find((x) => x.title === 'Visa mensuel' && x.id !== tMo10.id);
  eq(occMo.due, addMonthsISO(today(), 1), 'occurrence suivante mensuelle = +1 mois');
  undoLast();
  // dernière occurrence d’un cycle : rien à créer
  const tLast10 = addTask('Dernière fois', '', 'urgent', today(), 'perso', { rep: { mode: 'daily', count: 1 } });
  completeTask(tLast10.id);
  ok(!state.tasks.find((x) => x.title === 'Dernière fois' && x.id !== tLast10.id), 'count=1 : pas d’occurrence suivante');
  undoLast();

  section('v10 : anti-doublon des récurrences (base d’instance)');
  state.tasks = []; state.importedEvents = {};
  const tRec10 = addTask('Garde récurrente v10', '', 'week', addDaysISO(today(), 1), 'pro');
  tRec10.gEventId = 'bas77_20261012T080000Z'; // tâche liée à une instance
  eq(importEventAsTask({ id: 'bas77_20261019T080000Z', title: 'Garde récurrente v10', color: '11', day: addDaysISO(today(), 8), until: null, allDay: true, startT: '', endT: '', loc: '' }, true), null, 'l’occurrence suivante d’une récurrence déjà possédée ne devient PAS une tâche (base commune)');
  eq(state.tasks.length, 1, 'aucun doublon créé');
  ok(!!state.importedEvents['bas77_20261019T080000Z'], 'l’occurrence est mémorisée comme gérée');

  section('v10 : pastille de synchro 🟢🟠🔴');
  state.syncErrors = {};
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT', dCid: 'DC', dSecret: '', dRefresh: 'DR' };
  renderSyncPill();
  eq(document.getElementById('syncPill').textContent, '🟢', 'agenda + Drive connectés et sans erreur → vert');
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  renderSyncPill();
  eq(document.getElementById('syncPill').textContent, '🟠', 'connexion partielle → orange');
  state.cfg = null;
  renderSyncPill();
  eq(document.getElementById('syncPill').textContent, '🟠', 'rien de connecté → orange');
  setSyncError('agenda', new Error('invalid_grant'));
  eq(state.syncErrors.agenda.kind, 'auth', 'invalid_grant détecté comme erreur d’authentification');
  renderSyncPill();
  eq(document.getElementById('syncPill').textContent, '🔴', 'jeton refusé → rouge (reconnexion nécessaire)');
  setSyncError('drive', new Error('network down'));
  eq(state.syncErrors.drive.kind, 'err', 'erreur réseau = kind err (pas auth)');
  clearSyncError('agenda'); // v13 : les pannes coexistent — on isole la panne Drive
  renderSyncPill();
  eq(document.getElementById('syncPill').textContent, '🟠', 'échec simple → orange');
  // un rafraîchissement agenda réussi efface l’erreur agenda
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  state.syncErrors = { agenda: { scope: 'agenda', kind: 'auth', at: Date.now() } };
  global.__apiFail = false;
  global.__eventsFixture = { items: [] };
  state.autoAgenda = false; state.importedEvents = {}; state.tasks = [];
  await agendaRefresh(true);
  eq(state.syncErrors.agenda, undefined, 'agendaRefresh réussi → l’erreur agenda est effacée (pastille réparée)');
  state.syncErrors = {};

  section('v10 : thème clair ☀️ / sombre 🌙');
  state.cfg = null;
  toggleTheme();
  eq(state.cfg.light, true, 'toggleTheme → thème clair mémorisé');
  eq(document.getElementById('themeBtn').textContent, '☀️', 'bouton ☀️ en thème clair');
  eq(document.documentElement.className, 'light', 'classe light posée sur <html>');
  toggleTheme();
  eq(state.cfg.light, false, 'retour au thème sombre');
  eq(document.getElementById('themeBtn').textContent, '🌙', 'bouton 🌙 en thème sombre');
  eq(document.documentElement.className, '', 'classe light retirée');

  section('v10 : listes — lot, édition, masquer cochés, progression totale, partage, badge');
  state.tasks = []; state.lists = []; state.syncErrors = {}; state.cfg = null;
  const lL10 = addList('Liste lot');
  currentListId = lL10.id; view = 'list';
  els['itemInput'] = makeEl('itemInput');
  els['itemInput'].value = 'gants\n  casque\n\n4x pulkas';
  addItemFromInput();
  eq(getList(lL10.id).items.length, 3, 'collage en lot : 3 lignes = 3 éléments');
  ok(getList(lL10.id).items.some((it) => it.text === 'pulkas' && it.qty === 4), 'la ligne « 4x pulkas » garde sa quantité');
  ok(document.getElementById('toast').textContent.indexOf('3 éléments') >= 0, 'toast de collage en lot');
  const itEdit = getList(lL10.id).items[0];
  els['iText'] = makeEl('iText'); els['iQty'] = makeEl('iQty'); els['iSecret'] = makeEl('iSecret');
  openItemModal(lL10.id, itEdit.id);
  els['iText'].value = 'gants résine'; els['iQty'].value = '2'; els['iSecret'].checked = false;
  eq(document.getElementById('itemModal').className, 'modal', '✏️ ouvre la feuille d’édition d’élément');
  saveItemModal();
  eq(itEdit.text, 'gants résine', 'texte de l’élément modifié');
  eq(itEdit.qty, 2, 'quantité modifiée');
  eq(document.getElementById('itemModal').className, 'modal hidden', 'la feuille se referme');
  const itSec10 = getList(lL10.id).items[2];
  openItemModal(lL10.id, itSec10.id);
  els['iText'].value = 'CODE-BETA-42'; els['iQty'].value = '5'; els['iSecret'].checked = true;
  saveItemModal();
  eq(itSec10.text, 'CODE-BETA-42', 'élément transformé en code');
  eq(itSec10.secret, true, '… marqué masqué');
  eq(itSec10.qty, null, 'un code masqué n’a jamais de quantité');
  // masquer les cochés
  toggleItem(lL10.id, itEdit.id);
  toggleHideDone(lL10.id);
  eq(getList(lL10.id).hideDone, true, '🙈 masquer cochés mémorisé par liste');
  renderListDetail();
  let det10 = document.getElementById('listDetail').innerHTML;
  ok(det10.indexOf('gants résine') < 0, 'élément coché masqué');
  ok(det10.indexOf('Afficher les 1 coché') >= 0, 'bouton 👁 Afficher les cochés');
  toggleHideDone(lL10.id);
  renderListDetail();
  det10 = document.getElementById('listDetail').innerHTML;
  ok(det10.indexOf('gants résine') >= 0, '👁 les cochés réapparaissent');
  ok(det10.indexOf('Masquer cochés') >= 0, 'bouton 🙈 Masquer cochés');
  ok(det10.indexOf('shareList(') >= 0, 'bouton 📤 Partager');
  ok(det10.indexOf('openItemModal(') >= 0, 'bouton ✏️ par élément');
  // progression totale (branche parente)
  const lKid10 = addList('Sous-liste', lL10.id);
  addItem(lKid10.id, 'tronçonneuse');
  const agg10 = listProgressAgg(getList(lL10.id));
  eq(agg10.total, 4, 'progression totale : éléments du parent + des sous-listes');
  eq(agg10.done, 1, 'progression totale : cochés de toute la branche');
  const card10 = listCardHtml(getList(lL10.id), false);
  ok(card10.indexOf('total 1/4') >= 0, 'carte parente : « total 1/4 » affiché');
  // partage natif, sinon copie
  global.__shared = null; global.__copied = null;
  shareList(lL10.id);
  ok(!!global.__shared && global.__shared.text.indexOf('Liste lot') >= 0, 'navigator.share appelé avec le texte de la liste');
  Object.defineProperty(globalThis.navigator, 'share', { value: undefined, configurable: true });
  shareList(lL10.id);
  ok(!!global.__copied && global.__copied.indexOf('CODE-BETA-42') < 0 && global.__copied.indexOf('•••••• (code masqué)') >= 0, 'sans navigator.share → copie, et le code reste masqué');
  Object.defineProperty(globalThis.navigator, 'share', { value: function (d) { global.__shared = d; return Promise.resolve(); }, configurable: true });
  // badge d’icône
  state.tasks = []; state.importedEvents = {}; state.agendaCache = null;
  addTask('En retard badge', '', 'urgent', addDaysISO(today(), -1), 'perso');
  addTask('Du jour badge', '', 'urgent', today(), 'perso');
  global.__badge = null; global.__badgeCleared = false;
  renderAll();
  eq(global.__badge, 2, 'badge d’icône = retards + tâches du jour');
  state.tasks = [];
  global.__badge = null; global.__badgeCleared = false;
  renderAll();
  eq(global.__badgeCleared, true, 'plus rien à faire → badge effacé');
  // Échap ferme les feuilles
  const escs10 = (global.__docListeners['keydown'] || []);
  ok(escs10.length >= 1, 'écouteur Échap enregistré au démarrage');
  document.getElementById('modal').className = 'modal';
  escs10.forEach((fn) => fn({ key: 'Escape' }));
  eq(document.getElementById('modal').className, 'modal hidden', 'Échap ferme la modale tâche');

  section('v10 : export version 11 + hideDone dans les sauvegardes');
  toggleHideDone(lL10.id); // 🙈 réactivé pour l’export
  const dump10 = JSON.stringify(exportData());
  eq(JSON.parse(dump10).version, 13, 'export version 13');
  ok(dump10.indexOf('"hideDone":true') >= 0, 'l’état 🙈 d’une liste survit à l’export');
  ok(importJsonText(dump10, { force: true }) === true, 'réimport de l’export v10 accepté');
  ok(state.lists.some((l) => l.hideDone === true), 'hideDone restauré à l’import');

  // ================== v12 : correctifs des audits ==================
  section('v12 : horodatage stable (stampUpdates / sig / primeShadow)');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {}; state.syncErrors = {}; state.cfg = null;
  const tStable = addTask('Stable', '', 'week', addDaysISO(today(), 2), 'perso');
  const tsA = getTask(tStable.id).updatedAt;
  ok(typeof tsA === 'number' && tsA > 0, 'premier save() → updatedAt posé');
  editTask(tStable.id, 'Stable 2', '', 'week', addDaysISO(today(), 2), 'perso');
  const tsB = getTask(tStable.id).updatedAt;
  ok(tsB >= tsA, 'vraie modification → updatedAt avance');
  save(); save();
  eq(getTask(tStable.id).updatedAt, tsB, 'v12 : save() sans changement ne retampone PAS (avant : tout était réécrit)');
  primeShadow();
  save();
  eq(getTask(tStable.id).updatedAt, tsB, 'v12 : primeShadow() fige la référence — rien ne bouge');

  section('v12 : pierres tombales rechargées (normalize)');
  state.tasks = []; state.lists = []; state.tombstones = [];
  const tTb = addTask('À supprimer', '', 'urgent', today(), 'perso');
  deleteTask(tTb.id);
  ok(state.tombstones.some((x) => x.id === tTb.id), 'tombstone posée à la suppression');
  persist();
  const reloaded12 = load();
  ok((reloaded12.tombstones || []).some((x) => x.id === tTb.id), 'v12 : tombstones relues depuis localStorage (avant : perdues au rechargement)');

  section('v12 : fusion Drive compte TOUT (ajouts, modifs, suppressions)');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {}; state.autoAgenda = false; state.cfg = null;
  const tKeep12 = addTask('Locale gardée', '', 'week', addDaysISO(today(), 3), 'perso');
  const tMod12 = addTask('Locale à modifier', '', 'week', addDaysISO(today(), 4), 'perso');
  const tGone12 = addTask('Locale supprimée à distance', '', 'week', addDaysISO(today(), 5), 'perso');
  const mV12 = mergeRemote({
    tasks: [
      { id: tMod12.id, title: 'Modifiée à distance', cat: 'later', due: addDaysISO(today(), 20), type: 'perso', updatedAt: Date.now() + 60000 },
      { id: tKeep12.id, title: 'Locale gardée', cat: 'week', due: addDaysISO(today(), 3), type: 'perso', updatedAt: getTask(tKeep12.id).updatedAt }
    ],
    lists: [],
    tombstones: [{ id: tGone12.id, kind: 'task', at: Date.now() + 60000 }]
  });
  eq(mV12.added, 0, 'fusion : aucun ajout');
  eq(mV12.changed, 1, 'v12 : la modification distante est comptée');
  eq(mV12.removed, 1, 'v12 : la suppression distante est comptée');
  eq(getTask(tMod12.id).title, 'Modifiée à distance', 'fusion : modif distante appliquée');
  eq(getTask(tGone12.id), null, 'fusion : tâche supprimée à distance disparue');
  ok(getTask(tKeep12.id) !== null, 'fusion : la locale intacte reste');
  // driveMergeOnStart persiste AUSSI les modifs/suppressions (avant : seulement si added > 0)
  state.cfg = { dCid: 'DCID', dSecret: '', dRefresh: 'DRT' };
  global.__driveRemote = {
    app: 'taches-relances', version: 13,
    tasks: [ { id: tMod12.id, title: 'Modifiée sur Drive', cat: 'later', due: addDaysISO(today(), 21), type: 'perso', updatedAt: Date.now() + 90000 } ],
    lists: [], tombstones: [], savedAt: Date.now()
  };
  persist();
  const nm12 = await driveMergeOnStart();
  eq(nm12, 1, 'v12 : driveMergeOnStart retourne le TOTAL (avant : only added)');
  const afterMerge12 = JSON.parse(localStorage.getItem('taches-relances-v2') || '{}');
  ok((afterMerge12.tasks || []).some((x) => x.id === tMod12.id && x.title === 'Modifiée sur Drive'), 'v12 : la modif venue de Drive est PERSISTÉE (avant : jamais sauvée si added = 0)');
  global.__driveRemote = null;

  section('v12 : id déterministe des imports agenda (anti-doublon multi-appareils)');
  state.tasks = []; state.importedEvents = {}; state.tombstones = []; state.autoAgenda = false; state.cfg = null;
  const evI = { id: 'abc123XYZ', title: 'Garde Lunel', color: '9', day: addDaysISO(today(), 2), until: null, allDay: true, startT: '', endT: '', loc: '' };
  const tI12 = importEventAsTask(evI, true);
  ok(!!tI12, 'import : tâche créée');
  eq(tI12.id, 'ev-abc123XYZ', 'v12 : id de tâche DÉRIVÉ de l’événement (avant : uid() aléatoire → doublons après fusion)');
  const mI12 = mergeRemote({ tasks: [JSON.parse(JSON.stringify(tI12))], lists: [] });
  eq(state.tasks.filter((x) => x.gEventId === 'abc123XYZ').length, 1, 'v12 : le même événement importé sur 2 appareils → 1 seule tâche après fusion');
  eq(importEventAsTask(evI, true, true), null, 'v12 : import forcé sur un id existant → pas de doublon');
  eq(state.tasks.filter((x) => x.gEventId === 'abc123XYZ').length, 1, 'v12 : toujours une seule tâche pour cet événement');

  section('v12 : instance importée ≠ série entière (evOwnerTask)');
  state.tasks = []; state.importedEvents = {}; state.tombstones = []; state.cfg = null;
  const evInst1b = { id: 'serie77_20261012T080000Z', title: 'Garde récurrente', color: '9', day: today(), until: null, allDay: true, startT: '', endT: '', loc: '' };
  const tInst1b = importEventAsTask(evInst1b, true);
  ok(!!tInst1b, '1re occurrence importée');
  const evInst2b = { id: 'serie77_20261013T080000Z', title: 'Garde récurrente', color: '9', day: addDaysISO(today(), 1), until: null, allDay: true, startT: '', endT: '', loc: '' };
  ok(evOwnerTask(evInst2b) === null, 'v12 : l’occurrence suivante n’est pas « possédée » par l’import de la 1re (avant : bloquée)');
  const tInst2b = importEventAsTask(evInst2b, true);
  ok(!!tInst2b, 'v12 : l’occurrence suivante PEUT être importée');
  const evSerie = { id: 'serieApp_20261014T080000Z', title: 'Stage app', color: '9', day: addDaysISO(today(), 2), until: null, allDay: true, startT: '', endT: '', loc: '' };
  const tSerie12 = addTask('Stage app', '', 'week', addDaysISO(today(), 2), 'perso', { gEventId: 'serieApp' });
  ok(evOwnerTask(evSerie) === tSerie12, 'v12 : une tâche créée dans l’app (base = id maître) possède bien sa série');

  section('v12 : occurrence suivante — pas de lien Google, date avancée, tombstone à l’annulation');
  state.tasks = []; state.lists = []; state.importedEvents = {}; state.tombstones = []; state.cfg = null;
  const tRep12 = addTask('Sport', '', 'urgent', addDaysISO(today(), -10), 'perso', { rep: { mode: 'daily', every: 1, count: null }, gEventId: 'masterRep' });
  completeTask(tRep12.id);
  const tClone12 = state.tasks.find((x) => x.repChild === true);
  ok(!!tClone12, 'v12 : le clone est marqué repChild');
  eq(tClone12.gEventId, null, 'v12 : le clone NE porte PAS le gEventId de l’original (avant : éditer le clone décalait la série Google)');
  eq(tClone12.gSync, null, 'v12 : le clone n’est pas marqué « à synchroniser »');
  ok(tClone12.due > today(), 'v12 : cochée avec 10 j de retard → prochaine occurrence APRÈS aujourd’hui (avant : encore en retard)');
  undoLast();
  eq(getTask(tClone12.id), null, 'annulation du ✓ : le clone disparaît');
  ok(state.tombstones.some((x) => x.id === tClone12.id), 'v12 : tombstone posée sur le clone annulé (avant : Drive le ressuscitait)');
  ok(getTask(tRep12.id) && getTask(tRep12.id).cat !== 'done', 'annulation du ✓ : l’original redevient à faire');
  // supprimer une répétée ne supprime PAS la série Google
  reqs.length = 0;
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  const tRep2b = addTask('Répétée vivante', '', 'week', addDaysISO(today(), 1), 'perso', { rep: { mode: 'weekly', every: 1, count: null }, gEventId: 'masterRep2' });
  global.confirm = function () { return false; }; // v13 : « Annuler » à la question série → elle reste dans Google
  deleteTask(tRep2b.id);
  ok(!reqs.some((r) => r.method === 'DELETE'), 'v13 : refus à la question → la série Google reste (avant : DELETE du maître sans demander)');
  global.confirm = function () { return true; };
  undoLast();
  ok(getTask(tRep2b.id) !== null, 'annulation de la suppression : tâche restaurée');
  ok(!state.tombstones.some((x) => x.id === tRep2b.id), 'tombstone retirée à l’annulation');
  // échec de suppression d’événement → l’annulation purge la reprise
  global.__offline = true;
  const tEvDel12 = addTask('Avec événement', '', 'week', addDaysISO(today(), 2), 'perso', { gEventId: 'evt-del-1' });
  deleteTask(tEvDel12.id);
  await new Promise((r) => setTimeout(r, 10));
  ok((state.pendingEventDeletes || []).indexOf('evt-del-1') >= 0, 'suppression d’événement en échec → reprise programmée');
  global.__offline = false;
  undoLast();
  ok((state.pendingEventDeletes || []).indexOf('evt-del-1') < 0, 'v12 : annuler la suppression purge la reprise (avant : rejouée sur la tâche restaurée)');

  section('v12 : report — base aujourd’hui pour une tâche en retard + puces datées');
  state.tasks = []; state.importedEvents = {}; state.tombstones = []; state.cfg = null;
  const tLate12 = addTask('En retard à reporter', '', 'urgent', addDaysISO(today(), -5), 'perso');
  deferTask(tLate12.id);
  ok(document.getElementById('dfrB1').textContent.indexOf(fmtDate(addDaysISO(today(), 1))) >= 0, 'v12 : la puce « Demain » affiche la vraie date de demain');
  deferBy(1);
  eq(getTask(tLate12.id).due, addDaysISO(today(), 1), 'v12 : « Demain » sur une tâche en retard → VRAIMENT demain (avant : due+1, encore en retard)');
  const tFut12 = addTask('Future', '', 'later', addDaysISO(today(), 10), 'perso');
  deferTask(tFut12.id);
  deferBy(7);
  eq(getTask(tFut12.id).due, addDaysISO(today(), 17), 'v12 : report d’une tâche future → +7 j depuis SON échéance');
  const tImpD12 = addTask('Import à reporter', '', 'week', addDaysISO(today(), 2), 'perso', { gEventId: 'imp-rep', autoImport: true });
  deferTo(tImpD12.id, addDaysISO(today(), 3));
  eq(getTask(tImpD12.id).localEdit, true, 'v12 : tâche importée reportée → localEdit (avant : le balayage Google défaisait le report)');

  section('v12 : plus de faux « plus dans l’agenda » pour les événements passés');
  state.tasks = []; state.importedEvents = {}; state.cfg = null;
  const evPast = { id: 'past1', title: 'Garde passée', color: '9', day: addDaysISO(today(), -3), until: null, allDay: true, startT: '', endT: '', loc: '' };
  const tPast12 = importEventAsTask(evPast, true);
  state.agendaCache = { fetchedAt: Date.now(), events: [] };
  syncImportedFromCache();
  eq(getTask(tPast12.id).evGone, false, 'v12 : un événement PASSÉ absent du cache n’est PAS « disparu » (avant : faux ⚠️)');
  const evFutGone = { id: 'fut1', title: 'Garde future', color: '9', day: addDaysISO(today(), 2), until: null, allDay: true, startT: '', endT: '', loc: '' };
  const tFutG12 = importEventAsTask(evFutGone, true);
  state.agendaCache = { fetchedAt: Date.now(), events: [] };
  syncImportedFromCache();
  eq(getTask(tFutG12.id).evGone, true, 'v12 : un événement FUTUR disparu reste signalé');

  section('v12 : garde de nuit multi-jours (parseEvents)');
  const Dp12 = today();
  const ev22b = { id: 'e22', summary: 'Garde de nuit', start: { dateTime: Dp12 + 'T22:00:00+02:00' }, end: { dateTime: addDaysISO(Dp12, 1) + 'T01:00:00+02:00' } };
  eq(parseEvents({ items: [ev22b] })[0].until, addDaysISO(Dp12, 1), 'v12 : 22:00→01:00 = multi-jours (avant : comparaison d’heures trop stricte)');

  section('v12 : pastille 🔴 reconnue (invalid_grant / api 401) + panne scopée');
  state.syncErrors = {};
  setSyncError('agenda', new Error('api 400 invalid_grant'));
  eq(state.syncErrors.agenda.kind, 'auth', 'v13 : « api 400 invalid_grant » → kind auth (avant : invisible, jamais 🔴)');
  eq(state.syncErrors.agenda.scope, 'agenda', 'erreur scopée agenda');
  setSyncError('agenda', new Error('api 401'));
  eq(state.syncErrors.agenda.kind, 'auth', 'v13 : « api 401 » → kind auth');
  setSyncError('agenda', new Error('api 403 userRateLimitExceeded'));
  eq(state.syncErrors.agenda.kind, 'err', 'v13 : quota → kind err (🟠, pas 🔴)');
  state.cfg = { dCid: 'DCID', dSecret: '', dRefresh: 'DRT' };
  state.driveSyncedAt = Date.now();
  renderBackupCard();
  ok(document.getElementById('backupCard').innerHTML.indexOf('Sauvegarde en échec') < 0, 'v12 : panne AGENDA ≠ « sauvegarde Drive en échec » (avant : slot unique)');
  state.syncErrors = { drive: { scope: 'drive', kind: 'err', at: Date.now() } };
  renderBackupCard();
  ok(document.getElementById('backupCard').innerHTML.indexOf('Sauvegarde en échec') >= 0, 'une panne DRIVE affiche bien l’échec');
  state.syncErrors = {};

  section('v12 : drapeau _dirty + pause auto + instantané de secours');
  await new Promise((r) => setTimeout(r, 25)); // v13 : laisse finir le taskToEvent non attendu de l'annulation précédente
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {}; state.syncErrors = {};
  state.cfg = { dCid: 'DCID', dSecret: '', dRefresh: 'DRT' }; state.autoBackup = true;
  global.__driveRemote = null;
  _dirty = false; driveTimer = null;
  const tDirty = addTask('Tâche dirty', '', 'urgent', today(), 'perso');
  eq(_dirty, true, 'v12 : save() pose _dirty');
  await driveBackupNow(true);
  eq(_dirty, false, 'v12 : sauvegarde Drive réussie → _dirty effacé');
  state.autoBackup = false; _dirty = true; driveTimer = null;
  scheduleDriveBackup();
  eq(driveTimer, null, 'v12 : pause auto → le debounce ne s’arme pas');
  state.autoBackup = true; _dirty = false;
  ok(html.indexOf('if (_dirty && state.autoBackup !== false) driveBackupNow(true);') >= 0, 'v12 : passage en arrière-plan = envoi seulement si nécessaire (et pause respectée)');
  ok(typeof restoreSecours === 'function', 'v12 : fonction restoreSecours présente');
  localStorage.removeItem('taches-relances-v2-secours');
  restoreSecours();
  ok(document.getElementById('toast').textContent.indexOf('Aucun instantané') >= 0, 'v12 : aucun instantané local → message clair');
  renderBackupCard();
  ok(document.getElementById('backupCard').innerHTML.indexOf('restoreSecours') >= 0, 'v12 : bouton « instantané de secours » dans la carte ☁️');
  ok(html.indexOf('Restaurer la sauvegarde Drive ?') >= 0, 'v12 : restauration Drive avec confirmation');

  section('v12 : suppression directe, textarea, fermeture pointerdown, recherche Terminé');
  state.tasks = []; state.lists = []; state.tombstones = []; state.cfg = null; state.importedEvents = {};
  const tDel12 = addTask('Directe', '', 'urgent', today(), 'perso');
  onDelete(tDel12.id);
  eq(getTask(tDel12.id), null, 'v12 : 🗑️ = suppression immédiate (l’annulation 5 s remplace le double-tap)');
  ok(html.indexOf('onclick="if(event.target===this)') < 0, 'v12 : plus de fermeture au click du fond');
  ok(html.indexOf('onpointerdown="if(event.target===this)') < 0, 'v13 : plus aucun onpointerdown inline (listeners globaux pointerdown/click)');
  ok(typeof closeAllSheets === 'function', 'v13 : closeAllSheets ferme les 6 feuilles (Échap + clic de fond)');
  ok(html.indexOf('<textarea id="itemInput"') >= 0, 'v12 : champ d’ajout = textarea (collage multi-lignes réel)');
  ok(html.indexOf('flex-wrap: wrap; } /* v12') >= 0, 'v12 : les boutons des cartes de liste ne débordent plus (flex-wrap)');
  state.tasks = []; state.lists = []; state.importedEvents = {}; state.tombstones = [];
  addTask('Active recherche', '', 'urgent', today(), 'perso');
  const tDoneS12 = addTask('Terminée recherche', '', 'urgent', today(), 'perso');
  completeTask(tDoneS12.id);
  tab = 'done'; searchQ = 'recherche';
  renderTasksTab();
  const htmlDone12 = document.getElementById('list').innerHTML;
  ok(htmlDone12.indexOf('Active recherche') < 0, 'v12 : chercher depuis Terminé n’affiche plus les actives');
  ok(htmlDone12.indexOf('Terminée recherche') >= 0, 'v12 : les terminées correspondantes restent');
  tab = 'tasks'; searchQ = '';



  // ================== v13 : fusion multi-appareils sûre, séries protégées, ergonomie ==================
  section('v13 : annulation d’une suppression — updatedAt NEUF, pas de re-kill à la fusion');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {}; state.syncErrors = {}; state.cfg = null; state.autoAgenda = false;
  const tRes13 = addTask('Supprimée puis restaurée', '', 'week', addDaysISO(today(), 2), 'perso');
  deleteTask(tRes13.id);
  ok(state.tombstones.some((x) => x.id === tRes13.id), 'tombstone posée à la suppression');
  undoLast();
  ok(getTask(tRes13.id) !== null, 'annulation → tâche restaurée');
  const tsRes13 = getTask(tRes13.id).updatedAt;
  ok(typeof tsRes13 === 'number' && tsRes13 >= Date.now() - 60000, 'v13 : restaurée avec un updatedAt NEUF (delete _shadow — avant : signature fantôme → mort à la fusion)');
  mergeRemote({ tasks: [], lists: [], tombstones: [{ id: tRes13.id, kind: 'task', at: tsRes13 - 1000 }] });
  ok(getTask(tRes13.id) !== null, 'v13 : une tombstone distante plus VIEILLE que la restauration ne la re-tue pas (avant : re-supprimée)');

  section('v13 : restauration d’un fichier — absents enterrés, restaurés repartis neufs');
  const bk13 = JSON.stringify(exportData());
  const tNew13 = addTask('Créée après la sauvegarde', '', 'week', addDaysISO(today(), 6), 'perso');
  eq(importJsonText(bk13, { force: true }), true, 'restauration acceptée');
  ok(getTask(tNew13.id) === null, 'v13 : locale absente du fichier restauré → supprimée (une restauration = décision explicite)');
  ok(state.tombstones.some((x) => x.id === tNew13.id), 'v13 : … et sa tombstone empêche l’autre appareil de la renvoyer à la fusion');
  ok(typeof getTask(tRes13.id).updatedAt === 'number' && getTask(tRes13.id).updatedAt >= Date.now() - 60000, 'v13 : les restaurés repartent avec un updatedAt NEUF (sinon la tombstone les re-tuait)');
  ok(!state.tombstones.some((x) => x.id === tRes13.id), 'v13 : tombstone purgée pour les ressuscités');

  section('v13 : recréation sous le même id (＋ refait sur un événement importé)');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {};
  const evX13 = { id: 'evrecreate13', title: 'Garde recréée', color: '9', day: addDaysISO(today(), 3), until: null, allDay: true, startT: '', endT: '', loc: '' };
  const tEvX13 = importEventAsTask(evX13, true);
  eq(tEvX13.id, 'ev-evrecreate13', 'import → id dérivé de l’événement');
  tEvX13.updatedAt = 1000; // simulation : ancien horodatage posé par le bug v10
  deleteTask(tEvX13.id);
  state.tombstones.find((x) => x.id === 'ev-evrecreate13').at = 2000; // tombstone ancienne elle aussi
  const tEvX13b = importEventAsTask(evX13, true, true); // ＋ manuel : la trace d’import ne bloque plus
  ok(!!tEvX13b, 'recréation après suppression');
  eq(tEvX13b.id, 'ev-evrecreate13', 'recréé sous le MÊME id (dédoublonnage multi-appareils intact)');
  ok(tEvX13b.updatedAt > 2000 && tEvX13b.updatedAt >= Date.now() - 60000, 'v13 : recréé avec un updatedAt NEUF (avant : _shadow gardait l’ancienne signature → mort à la fusion)');
  mergeRemote({ tasks: [JSON.parse(JSON.stringify(tEvX13b))], lists: [], tombstones: [] });
  ok(getTask('ev-evrecreate13') !== null, 'v13 : la tombstone de la suppression (plus vieille) ne tue pas la recréation');

  section('v13 : pull-before-push — le distant changé pendant l’envoi est fusionné, jamais écrasé');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {}; state.autoBackup = false; state.syncErrors = {};
  state.cfg = { dCid: 'DCID', dSecret: '', dRefresh: 'DRT' };
  addTask('Locale avant envoi', '', 'week', addDaysISO(today(), 2), 'perso');
  global.__driveRemote = null;
  driveMergedOk = true;
  global.__driveRemote = { app: 'taches-relances', version: 13, tasks: [
    { id: 'remote-pb13', title: 'Écrite à distance', cat: 'later', due: addDaysISO(today(), 9), type: 'perso', updatedAt: Date.now() + 45000 }
  ], lists: [], tombstones: [], savedAt: Date.now() };
  reqs.length = 0;
  eq(await driveBackupNow(true), true, 'envoi réussi');
  ok(!!getTask('remote-pb13'), 'v13 : la tâche écrite à distance PENDANT notre envoi est fusionnée (avant : écrasée puis perdue)');
  const upPb13 = reqs.find((r) => r.url.indexOf('upload/drive/v3/files') >= 0);
  ok(!!upPb13 && upPb13.body.indexOf('"remote-pb13"') >= 0, 'v13 : ce qui part vers Drive la CONTIENT (pull avant push)');

  section('v13 : fichier Drive illisible → jamais de feu vert, jamais d’écrasement');
  driveMergedOk = false;
  global.__driveRemote = { app: 'x', tasks: 'CASSÉ', savedAt: Date.now() };
  eq(await driveMergeOnStart(), 0, 'fusion : fichier distant invalide → refus');
  eq(driveMergedOk, false, 'v13 : PAS de feu vert sur un fichier illisible (avant : driveMergedOk=true puis écrasement)');
  eq(state.syncErrors.drive.kind, 'err', 'panne Drive enregistrée');
  driveMergedOk = true;
  reqs.length = 0;
  eq(await driveBackupNow(true), false, 'v13 : pull-before-push sur fichier cassé → envoi ANNULÉ');
  ok(!reqs.some((r) => r.url.indexOf('upload/drive/v3/files') >= 0), 'v13 : rien n’a été écrasé sur Drive');
  global.__driveRemote = null;

  section('v13 : modif PENDANT l’envoi → _dirty reste vrai (le changement ne dort jamais)');
  state.autoBackup = true;
  driveMergedOk = true;
  _dirty = false; driveTimer = null;
  const pSend13 = driveBackupNow(true);
  addTask('Écrite pendant l’envoi', '', 'week', addDaysISO(today(), 4), 'perso'); // survenue PENDANT l’envoi
  await pSend13;
  eq(_dirty, true, 'v13 : un save() pendant l’envoi → _dirty reste vrai (avant : changement jamais renvoyé)');
  if (driveTimer) clearTimeout(driveTimer);
  driveTimer = null;

  section('v13 : drapeau dirty persisté — un état non envoyé survit au rechargement');
  _dirty = true;
  persist();
  eq(JSON.parse(localStorage.getItem('taches-relances-v2') || '{}').dirty, true, 'persist() écrit dirty');
  eq(load().dirty, true, 'normalize() relit dirty');
  ok(html.indexOf('_dirty = state.dirty === true') >= 0, 'le drapeau est repris au démarrage (et repart sans attendre)');
  _dirty = false;
  persist();

  section('v13 : repChild au travail — éditer une occurrence ne crée plus de 2e série Google');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {};
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  const tRc13 = addTask('Occurrence modifiée', '', 'urgent', today(), 'perso', { rep: { mode: 'weekly', every: 1, count: null }, repChild: true });
  reqs.length = 0;
  eq(await taskToEvent(tRc13.id), false, 'v13 : repChild → refus d’écrire dans l’agenda (avant : POST avec RRULE = 2e série)');
  ok(!reqs.some((r) => r.method === 'POST' || r.method === 'PUT'), 'aucune écriture Google');
  eq(tRc13.gSync, null, 'pas marquée « à synchroniser » pour autant');

  section('v13 : supprimer le maître d’une série → question, DELETE seulement si accord');
  const tMast13 = addTask('Maître série', '', 'week', addDaysISO(today(), 1), 'perso', { rep: { mode: 'weekly', every: 1, count: null }, gEventId: 'masterS13' });
  global.confirm = function () { return true; }; // accord explicite
  reqs.length = 0;
  deleteTask(tMast13.id);
  await new Promise((r) => setTimeout(r, 10));
  ok(reqs.some((r) => r.method === 'DELETE' && r.url.indexOf('masterS13') >= 0), 'v13 : accord → la série Google part aussi (sinon l’import auto ramenait ses occurrences)');
  global.confirm = function () { return true; };

  section('v13 : 409 → résurrection, avec repli id « x2 » si Google refuse le PUT');
  global.__writeMode = 'gone'; // le PUT de résurrection tombe sur 404
  global.__postDup = true;
  const tRz13 = addTask('À ressusciter', '', 'urgent', addDaysISO(today(), 8), 'perso');
  reqs.length = 0;
  eq(await taskToEvent(tRz13.id), true, 'v13 : résurrection en repli → succès quand même');
  const bodiesRz13 = reqs.filter((r) => r.method === 'POST' && r.url.indexOf('primary/events') >= 0).map((r) => { try { return JSON.parse(r.body); } catch (e) { return null; } });
  ok(bodiesRz13.some((b) => b && String(b.id) === clientEventId(tRz13.id) + 'x2'), 'v13 : id dérivé suffixé « x2 » (l’id pris n’est jamais réutilisé en double)');
  eq(tRz13.gSync, 'ok', 'la tâche est marquée synchronisée avec un événement réel');
  global.__writeMode = null; global.__postDup = false;

  section('v13 : reporter une répétée ne déplace PAS sa série Google');
  state.tasks = []; state.importedEvents = {};
  const tRd13 = addTask('Garde série', '', 'week', addDaysISO(today(), 1), 'perso', { rep: { mode: 'weekly', every: 1, count: null }, gEventId: 'masterRd13' });
  reqs.length = 0;
  deferTo(tRd13.id, addDaysISO(today(), 3));
  await new Promise((r) => setTimeout(r, 5));
  ok(!reqs.some((r) => r.method === 'PUT' || r.method === 'POST'), 'v13 : le report d’un maître de série n’écrit JAMAIS dans Google (avant : la série entière se déplaçait)');
  eq(getTask(tRd13.id).due, addDaysISO(today(), 3), 'la date locale a bien changé');

  section('v13 : récurrence mensuelle — le jour d’origine est gardé');
  eq(addMonthsISOFrom('2026-01-31', 31, 1), '2026-02-28', '31/01 → 28/02 (fin du mois)');
  eq(addMonthsISOFrom('2026-02-28', 31, 1), '2026-03-31', 'v13 : retour au 31 en mars (avant : le 28 dérivait et restait le 28)');
  eq(cleanRep({ mode: 'monthly', count: null }, '2026-01-31').day, 31, 'cleanRep mémorise le jour d’origine');
  state.tasks = []; state.importedEvents = {}; state.tombstones = [];
  const tM13 = addTask('Mensuelle', '', 'urgent', addDaysISO(today(), -70), 'perso', { rep: { mode: 'monthly', count: null } });
  completeTask(tM13.id);
  const tM13c = state.tasks.find((x) => x.repChild === true);
  ok(!!tM13c, 'le clone de l’occurrence suivante existe');
  eq(tM13c.rep.day, parseInt(String(addDaysISO(today(), -70)).slice(8, 10), 10), 'v13 : le clone porte le jour d’origine (le 28 ne dérive plus)');

  section('v13 : événement 18:00→00:00 — fin À minuit, pas de jour fantôme');
  const Dq13 = today();
  const evMid13 = { id: 'mid13', summary: 'Soirée jusqu’à minuit', start: { dateTime: Dq13 + 'T18:00:00+02:00' }, end: { dateTime: addDaysISO(Dq13, 1) + 'T00:00:00+02:00' } };
  eq(parseEvents({ items: [evMid13] })[0].until, null, 'v13 : finit À minuit → jusqu’à = rien (v12 : un jour fantôme était ajouté)');
  const ev22n13 = { id: 'e22n13', summary: 'Garde de nuit', start: { dateTime: Dq13 + 'T22:00:00+02:00' }, end: { dateTime: addDaysISO(Dq13, 1) + 'T01:00:00+02:00' } };
  eq(parseEvents({ items: [ev22n13] })[0].until, addDaysISO(Dq13, 1), '22:00→01:00 → toujours multi-jours');

  section('v13 : import auto — les occurrences d’une série sont sautées');
  state.tasks = []; state.importedEvents = {}; state.tombstones = []; state.autoAgenda = false;
  state.agendaCache = { fetchedAt: Date.now(), events: [
    { id: 'serieK', title: 'Série quotidienne', color: '11', day: today(), until: null, allDay: false, startT: '07:00', endT: '07:30', loc: '' },
    { id: 'serieK_' + today().replace(/-/g, '') + 'T060000Z', title: 'Série quotidienne', color: '11', day: today(), until: null, allDay: false, startT: '07:00', endT: '07:30', loc: '' },
    { id: 'serieK_' + addDaysISO(today(), 1).replace(/-/g, '') + 'T060000Z', title: 'Série quotidienne', color: '11', day: addDaysISO(today(), 1), until: null, allDay: false, startT: '07:00', endT: '07:30', loc: '' },
    { id: 'freeZ13', title: 'Événement libre', color: '9', day: addDaysISO(today(), 2), until: null, allDay: true, startT: '', endT: '', loc: '' }
  ] };
  const imp13 = autoImportAll();
  eq(imp13.n, 2, 'v13 : seuls le maître et l’événement libre sont importés');
  eq(imp13.skip, 2, 'v13 : les 2 occurrences (id avec _) sont sautées (avant : une série quotidienne = jusqu’à 30 tâches d’un coup)');
  ok(!!getTask('ev-serieK') && !!getTask('ev-freeZ13'), 'le maître et l’événement libre sont là');

  section('v13 : événements du jour EN LIGNE dans l’onglet Tâches, triés avec les tâches');
  state.tasks = []; state.importedEvents = {}; state.tombstones = [];
  state.agendaCache = { fetchedAt: Date.now(), events: [
    { id: 'evday13', title: 'Brief 07:30', color: '9', day: today(), until: null, allDay: false, startT: '07:30', endT: '08:00', loc: 'Caserne' }
  ] };
  addTask('Tâche sans heure', '', 'urgent', today(), 'perso');
  addTask('Tâche 14 h', '', 'urgent', today(), 'perso', { startT: '14:00', endT: '15:00' });
  const th13 = tasksTabHtml();
  ok(th13.indexOf('Brief 07:30') >= 0, 'l’événement du jour s’affiche en ligne (plus gros gain à l’usage)');
  ok(th13.indexOf('1 événement(s)') >= 0, 'le bandeau du jour compte les événements');
  ok(th13.indexOf('eventToTask(') >= 0, 'le bouton ＋ convertit l’événement en tâche');
  ok(th13.indexOf('Tâche sans heure') < th13.indexOf('Tâche 14 h') && th13.indexOf('Tâche 14 h') < th13.indexOf('Brief 07:30'), 'tri : sans heure < 14:00 < événement (tâches puis événements, chacun par horaire)');

  section('v13 : fermeture des feuilles — pointerdown et click sur la MÊME cible seulement');
  ok(html.indexOf('var _bd = null;') >= 0, 'la cible du pointerdown est mémorisée');
  const pd13 = (global.__docListeners['pointerdown'] || [])[0];
  const ck13 = (global.__docListeners['click'] || [])[0];
  ok(typeof pd13 === 'function' && typeof ck13 === 'function', 'listeners pointerdown + click enregistrés sur document');
  const modalPd13 = document.getElementById('modal');
  modalPd13.classList.contains = function (c) { return String(modalPd13.className).indexOf(c) >= 0; };
  modalPd13.className = 'modal';
  pd13({ target: modalPd13 });
  ck13({ target: modalPd13 });
  eq(modalPd13.className, 'modal hidden', 'doigt posé sur le fond + click au même endroit → fermeture');
  modalPd13.className = 'modal';
  pd13({ target: modalPd13 });
  ck13({ target: {} }); // le click retombe ailleurs (sélection de texte, bouton dessous)
  eq(modalPd13.className, 'modal', 'pointerdown et click sur des cibles DIFFÉRENTES → rien ne se ferme (le click ne retombe pas sur un bouton dessous)');

  section('v13 : un rendu en arrière-plan ne vole pas la frappe en cours');
  view = 'tasks'; tab = 'tasks'; searchQ = '';
  state.tasks = []; state.importedEvents = {}; state.tombstones = []; state.agendaCache = null;
  addTask('Fond', '', 'urgent', today(), 'perso');
  const inp13 = document.getElementById('itemInput');
  inp13.value = '4x pulkas';
  document.activeElement = inp13;
  renderAll();
  eq(inp13.value, '4x pulkas', 'v13 : la frappe en cours survit à un rendu déclenché par une fusion Drive (avant : champ vidé, clavier fermé)');
  ok(html.indexOf('document.activeElement === _inp') >= 0, 'le rendu capture puis restaure la valeur, le focus et la sélection');
  delete global.document.activeElement;

  section('v13 : pannes PAR SOURCE — une 2e panne n’efface plus la 1re');
  state.syncErrors = {};
  setSyncError('agenda', new Error('api 400 invalid_grant'));
  setSyncError('drive', new Error('drive down'));
  eq(state.syncErrors.agenda.kind, 'auth', 'panne agenda mémorisée');
  eq(state.syncErrors.drive.kind, 'err', 'v13 : panne drive mémorisée EN PLUS (avant : slot unique, la 1re était écrasée)');
  renderSyncPill();
  eq(document.getElementById('syncPill').textContent, '🔴', 'une panne d’auth reste rouge même avec une 2e panne à côté');
  clearSyncError('drive');
  ok(!state.syncErrors.drive && !!state.syncErrors.agenda, 'clearSyncError(drive) ne touche pas à la panne agenda');
  state.syncErrors = {};

  section('v13 : tombstones — expiration 180 jours + plafond 500');
  state.tasks = []; state.lists = []; state.importedEvents = {}; state.tombstones = [];
  const tExp13 = addTask('Vieille suppression', '', 'week', addDaysISO(today(), 2), 'perso');
  deleteTask(tExp13.id);
  state.tombstones.find((x) => x.id === tExp13.id).at = Date.now() - 91 * 86400000;
  mergeRemote({ tasks: [], lists: [], tombstones: [] });
  ok(state.tombstones.some((x) => x.id === tExp13.id), 'v13 : 91 jours → tombstone conservée (v12 : 60 j → un appareil hors ligne 2 mois ressuscitait la tâche)');
  state.tombstones.find((x) => x.id === tExp13.id).at = Date.now() - 200 * 86400000;
  mergeRemote({ tasks: [], lists: [], tombstones: [] });
  ok(!state.tombstones.some((x) => x.id === tExp13.id), '200 jours → expirée (180 j)');
  state.tombstones = [];
  for (let i = 0; i < 520; i++) state.tombstones.push({ id: 'cap13-' + i, kind: 'task', at: Date.now() - i });
  mergeRemote({ tasks: [], lists: [], tombstones: [] });
  eq(state.tombstones.length, 500, 'v13 : plafond mémoire 500 tombstones');
  eq(state.tombstones[0].id, 'cap13-0', 'les 500 PLUS RÉCENTES sont gardées');
  state.tombstones = [];

  section('v13 : traces d’import purgées après 60 jours');
  state.importedEvents = { evold13: { taskId: 'a', at: Date.now() - 90 * 86400000 }, evnew13: { taskId: 'b', at: Date.now() } };
  const purged13 = purgeImportedEvents(state.importedEvents);
  ok(!purged13.evold13 && !!purged13.evnew13, 'v13 : les traces de plus de 60 jours ne s’accumulent plus');

  section('v13 : listes — mode ⇅, lignes allégées (360 px)');
  state.tasks = []; state.lists = []; state.tombstones = []; state.importedEvents = {}; state.cfg = null; state.agendaCache = null;
  const lR13 = addList('Liste v13');
  addItem(lR13.id, 'Premier');
  addItem(lR13.id, 'Deuxième');
  view = 'list'; currentListId = lR13.id;
  reorderMode = false;
  renderListDetail();
  let ld13 = document.getElementById('listDetail').innerHTML;
  ok(ld13.indexOf('toggleReorderMode()') >= 0, 'le bouton ⇅ est présent');
  ok(ld13.indexOf('openItemModal(') >= 0, 'tap sur le texte = édition (mode normal)');
  ok(ld13.indexOf('moveItem(') < 0, 'v13 : mode normal = case + texte + ✕, PAS de ▲▼ par ligne (avant : 4-6 boutons de 40 px écrasaient le texte) — le ⇅ seul les propose');
  toggleReorderMode();
  ld13 = document.getElementById('listDetail').innerHTML;
  ok(ld13.indexOf('▲') >= 0 && ld13.indexOf('moveItem(') >= 0, 'mode ⇅ : les ▲▼ de réordonnancement apparaissent');
  ok(ld13.indexOf('openItemModal(') < 0, 'mode ⇅ : le texte n’ouvre plus l’édition (pas de mauvaise manip en réordonnant)');
  toggleReorderMode();
  ok(document.getElementById('listDetail').innerHTML.indexOf('moveItem(') < 0, 'retour au mode normal : plus de ▲▼ par ligne');

  section('v13 : lisibilité — contrastes et variables');
  ok(html.indexOf(':root { --muted: #8fa3bd; --ok: #34d399; }') >= 0, 'variables --muted/--ok définies');
  ok(html.indexOf('html.light { --muted: #475569; --ok: #047857; }') >= 0, '… et redéfinies en thème clair (l’ancien vert tombait à ~2:1 sur blanc)');
  ok(html.indexOf('.syncline .pend') >= 0 && html.indexOf('.syncline .gone') >= 0 && html.indexOf('.syncline .okline') >= 0, 'les statuts de la carte ☁️ (échec, en attente, 🟢) sont enfin colorés');
  ok(html.indexOf('color:var(--muted)') >= 0, 'le paragraphe d’import auto utilise la variable (plus de gris codé en dur)');
  global.__driveRemote = null; global.__writeMode = null; global.__postDup = false;
  _dirty = false;

  // ---------- Résultat ----------
  console.log('\n' + pass + ' OK · ' + fail + ' échec(s)');
  if (typeof driveTimer !== 'undefined' && driveTimer) clearTimeout(driveTimer); // évite d'attendre le debounce 30 s en fin de process
  if (fail > 0) { console.log(failures.join('\n')); process.exit(1); }
  process.exit(0);
})().catch(function (e) {
  console.error('ERREUR DU HARNais :', e);
  process.exit(1);
});
