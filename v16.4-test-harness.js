// ===== Harnais de test v16.4 — « les modifications pro/perso des événements ne se font pas » =====
// Reconstruit (réinitialisation environnementale) : surface v16.3 (suppression immédiate) + invariants
// critiques hérités + NOUVEAU v16.4 (type 🔴/🔵 : pull, modale événement, PATCH couleur des importées).
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('taches-relances-v16.4.html', 'utf8');
const swSrc = fs.readFileSync('v16.4-sw.js', 'utf8');

// ---------- Stubs ----------
const LS = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : null; },
  setItem: function (k, v) { LS[k] = String(v); },
  removeItem: function (k) { delete LS[k]; }
};
function mkEl() {
  return {
    value: '', textContent: '', innerHTML: '', className: '', style: {}, children: [],
    addEventListener: function () {}, setAttribute: function () {}, focus: function () {},
    select: function () {}, click: function () {}, setSelectionRange: function () {},
    appendChild: function (c) { this.children.push(c); }, removeChild: function () {},
    classList: { contains: function () { return false; }, add: function () {}, remove: function () {}, toggle: function () {} }
  };
}
const els = {};
global.document = {
  hidden: true, activeElement: null,
  getElementById: function (id) { return els[id] || (els[id] = mkEl()); },
  createElement: function () { return mkEl(); },
  body: mkEl(),
  addEventListener: function () {}
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
global.addEventListener = function () {};
let __confirmVal = false;
global.confirm = function () { return __confirmVal; };

// fetch pilotable
let reqs = [];
global.__eventsFixture = null;   // liste d'événements (format Google) pour agendaRefresh
global.__evGet = null;           // { evId: événement 200 } pour verifyKills (absent = 404)
global.__evGetFail = false;      // réseau injoignable pour le GET de preuve
global.__deleteFails = 0;        // nombre d'échecs DELETE restants
global.__patchFails = 0;        // nombre d'échecs PATCH restants (v16.4)
global.fetch = function (url, options) {
  options = options || {};
  url = String(url);
  reqs.push({ url: url, method: options.method || 'GET', body: options.body || null });
  function mk(status, body) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
  }
  if (url === 'https://oauth2.googleapis.com/token') return mk(200, { access_token: 'TOK' });
  if (url.indexOf('/calendars/primary/events?') >= 0) return mk(200, { items: global.__eventsFixture || [] });
  var m = url.match(/\/calendars\/primary\/events\/([^?]+)$/);
  if (m) {
    var evId = decodeURIComponent(m[1]);
    if (options.method === 'DELETE') {
      if (global.__deleteFails > 0) { global.__deleteFails--; return mk(500, { error: { code: 500 } }); }
      return mk(204, {});
    }
    if (options.method === 'PATCH') {
      if (global.__patchFails > 0) { global.__patchFails--; return mk(500, { error: { code: 500 } }); }
      return mk(200, { id: evId });
    }
    if (options.method === 'PUT') return mk(200, { id: evId });
    if (global.__evGetFail) return Promise.reject(new Error('reseau'));
    if (global.__evGet && Object.prototype.hasOwnProperty.call(global.__evGet, evId)) return mk(200, global.__evGet[evId]);
    return mk(404, { error: { code: 404 } });
  }
  return mk(200, { id: 'gnew164' }); // POST création d'événement
};

// ---------- Chargement de l'app ----------
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) { console.error('SCRIPT INTROUVABLE'); process.exit(1); }
vm.runInThisContext(scriptMatch[1], { filename: 'app-v16.4' });

// ---------- Outillage ----------
var PASS = 0; var FAILS = [];
function ok(cond, label) { if (cond) { PASS++; } else { FAILS.push(label); console.error('ECHEC : ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' (attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a) + ')'); }
function has(s, sub, label) { ok(typeof s === 'string' && s.indexOf(sub) >= 0, label + ' (cherche "' + sub + '")'); }
function flush() { return new Promise(function (r) { setTimeout(r, 30); }); }
function toast() { return els['toast']; }
function mkEv(id, day, opts) {
  opts = opts || {};
  return { id: id, title: opts.title || ('Evenement ' + id), color: (opts.color !== undefined) ? opts.color : null, day: day, until: opts.until || null,
    allDay: !!opts.allDay, startT: opts.startT || '', endT: opts.endT || '', loc: opts.loc || '' };
}
function seedCache(events) { state.agendaCache = { fetchedAt: Date.now(), events: events }; }
function delReqs() { return reqs.filter(function (r) { return r.method === 'DELETE'; }); }
function patchReqs() { return reqs.filter(function (r) { return r.method === 'PATCH'; }); }
function cleanState163() { // isolation entre sections
  state.tasks = []; state.importedEvents = {}; state.tombstones = []; state.pendingEventDeletes = [];
  _shadow = {}; _undo = null; _killGuard = {};
  els['toast'].textContent = '';
}

async function main() {
  // ===== Section 0 : versions et sources =====
  eq(APP_VERSION, 'v16.4', 'APP_VERSION v16.4');
  ok(exportData().version === 16.4, 'exportData version 16.4');
  has(html, 'var APP_VERSION = "v16.4"', 'source : APP_VERSION v16.4');
  has(swSrc, "taches-relances-v16.4", 'sw : cache renomme v16.4');
  ok(swSrc.indexOf('taches-relances-v16.3') < 0, 'sw : plus de reference v16.3');
  has(html, 'id="eTypes"', 'source : rangee type dans la modale evenement');
  has(html, 'renderEvTypes164', 'source : rendu de la rangee type evenement');
  has(html, 'colorId: (newType164 === "pro") ? "11" : "9"', 'source : PATCH colorId de la modale evenement');
  has(html, 'function syncTaskColor164', 'source : PATCH couleur seulle des importees');
  has(html, 'oldType164 !== t.type', 'source : detection changement de type dans saveModal');
  // invariants herites
  has(html, 'status === "cancelled"', 'source : preuve soft-delete v16.1 conservee');
  has(html, 'badgeOnly', 'source : badgeOnly v16.1 conserve');
  has(html, 'removeImportTrace163', 'source : v16.3 conservee');
  has(html, 'maybeAutoRefresh', 'source : auto-refresh v16.2 conserve');
  eq(state.tasks.length, 0, 'etat initial sans taches');
  // elements de modale crees explicitement (les acces directs els['mTitle'] echoueraient sinon)
  ['mTitle','mNote','mDue','mUntil','mStart','mEnd','mRep','mType-pro','mType-perso','mType-autres','eTitle','eDay','eUntil','eStart','eEnd','eLoc','evModal','toast'].forEach(function (id) { document.getElementById(id); });

  // ===== Section 1 : fumee de base =====
  var t1 = addTask('Tache un', '', 'urgent', today(), 'perso', {});
  ok(!!getTask(t1.id), 'addTask fonctionne');
  ok(editTask(t1.id, 'Tache un bis', 'note', 'urgent', today(), 'perso', {}) === true, 'editTask fonctionne');

  // ===== Section 2 : suppression d une tache importee → DELETE immediat (v16.3, inchange) =====
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  var evA = mkEv('evA164', today(), { startT: '09:00', endT: '10:00' });
  seedCache([evA]);
  var impA = importEventAsTask(evA, true);
  ok(!!impA && impA.autoImport === true && impA.gEventId === 'evA164', 'import : tache importee liee');
  reqs = [];
  deleteTask(impA.id);
  await flush();
  ok(delReqs().some(function (r) { return r.url.indexOf('evA164') >= 0; }), 'v16.3 : DELETE envoye immediatement');
  has(toast().textContent, "retiré de l'agenda", 'toast : evenement retire');
  eq(state.agendaCache.events.length, 0, 'v16.3 : rangee retiree du cache local');
  ok(importEventAsTask(mkEv('evA164', today()), true) === null, 'anti-resurrection intacte');

  // ===== Section 3 : Annuler APRES un DELETE reussi (v16.3) =====
  cleanState163();
  var evB = mkEv('evB164', addDaysISO(today(), 2));
  seedCache([evB]);
  var impB = importEventAsTask(evB, true);
  reqs = [];
  deleteTask(impB.id);
  await flush();
  undoLast();
  ok(!!getTask(impB.id), 'Annuler : tache restauree');
  ok(!state.importedEvents['evB164'], 'v16.3 : trace retiree');
  seedCache([]);
  eq(syncImportedFromCache({ allowKill: true }).killQueue.length, 0, 'plus candidate au retrait');

  // ===== Section 4 : preuve 404 / cancelled / injoignable (v16/16.1, inchange) =====
  cleanState163();
  var evH = mkEv('evH164', addDaysISO(today(), 1));
  var impH = importEventAsTask(evH, true);
  seedCache([]);
  global.__evGet = null;
  var kqH = syncImportedFromCache({ allowKill: true });
  eq(kqH.killQueue.length, 1, 'candidate au retrait');
  eq(await verifyKills(kqH.killQueue), 1, 'preuve 404 → retrait');
  ok(getTask(impH.id) === null, 'suppression Google se propage');

  var evI = mkEv('evI164', addDaysISO(today(), 2));
  var impI = importEventAsTask(evI, true);
  seedCache([]);
  global.__evGet = { evI164: { id: 'evI164', status: 'cancelled' } };
  var kqI = syncImportedFromCache({ allowKill: true });
  eq(await verifyKills(kqI.killQueue), 1, 'cancelled = preuve (v16.1)');
  ok(getTask(impI.id) === null, 'supprimee sur preuve cancelled');

  var evJ = mkEv('evJ164', addDaysISO(today(), 3));
  var impJ = importEventAsTask(evJ, true);
  seedCache([]);
  global.__evGet = null; global.__evGetFail = true;
  var kqJ = syncImportedFromCache({ allowKill: true });
  eq(await verifyKills(kqJ.killQueue), 0, 'injoignable = aucun retrait');
  ok(!!getTask(impJ.id), 'conservee faute de preuve');
  has(toast().textContent, 'non vérifiable', 'toast distinct injoignable');
  global.__evGetFail = false;
  global.__evGet = { evJ164: { id: 'evJ164', summary: 'Evenement evJ164', colorId: '9', start: { dateTime: addDaysISO(today(), 3) + 'T09:00:00+02:00' }, end: { dateTime: addDaysISO(today(), 3) + 'T10:00:00+02:00' } } };

  // ===== Section 5 : v16.4 — PULL : le type suit la couleur Google =====
  cleanState163();
  var evP = mkEv('evP164', addDaysISO(today(), 4), { color: '11' });
  seedCache([evP]);
  var impP = importEventAsTask(evP, true);
  eq(impP.type, 'pro', 'import : colorId 11 → tache pro (convention inchangee)');
  evP.color = '9'; // la couleur change dans Google (cache rafraichi)
  var sP = syncImportedFromCache({});
  eq(impP.type, 'perso', 'v16.4 pull importees : la tache suit la nouvelle couleur');
  ok(sP.nUpd >= 1, 'changement compte dans nUpd');
  evP.color = '11';
  syncImportedFromCache({});
  eq(impP.type, 'pro', 'v16.4 pull importees : retour pro');
  // liée
  var evQ = mkEv('evQ164', addDaysISO(today(), 5), { color: '11' });
  seedCache([evQ]);
  var tQ = addTask('Tache liee Q', '', 'week', addDaysISO(today(), 5), 'perso', { gEventId: 'evQ164', gSync: 'ok' });
  syncImportedFromCache({});
  eq(tQ.type, 'pro', 'v16.4 pull liees : la tache suit la couleur Google');
  // localEdit protege
  var evR = mkEv('evR164', addDaysISO(today(), 6), { color: '11' });
  seedCache([evR]);
  var impR = importEventAsTask(evR, true);
  impR.localEdit = true;
  evR.color = '9';
  syncImportedFromCache({});
  eq(impR.type, 'pro', 'localEdit : le type ne bouge PAS (tes modifs priment)');

  // ===== Section 6 : v16.4 — verifyKills deplace : le type suit aussi =====
  cleanState163();
  var evS = mkEv('evS164', addDaysISO(today(), 1), { color: '11' });
  seedCache([evS]);
  var impS = importEventAsTask(evS, true);
  eq(impS.type, 'pro', 'import pro avant deplacement');
  seedCache([]); // l evenement quitte la fenetre
  global.__evGet = { evS164: { id: 'evS164', summary: 'Evenement deplace', colorId: '9', start: { dateTime: addDaysISO(today(), 10) + 'T08:00:00+02:00' }, end: { dateTime: addDaysISO(today(), 10) + 'T09:00:00+02:00' } } };
  var kqS = syncImportedFromCache({ allowKill: true });
  eq(kqS.killQueue.length, 1, 'candidate (deplace hors fenetre)');
  var nKS = await verifyKills(kqS.killQueue);
  eq(nKS, 0, '200 valide = conservee (deplacee, pas supprimee)');
  ok(!!getTask(impS.id), 'tache conservee');
  eq(impS.type, 'perso', 'v16.4 verifyKills : le type suit la couleur du deplace');
  eq(impS.due, addDaysISO(today(), 10), 'la date suit le deplacement (v16.1 inchange)');
  global.__evGet = null;

  // ===== Section 7 : v16.4 — modale evenement : rangee type + PATCH colorId =====
  cleanState163();
  var evN = mkEv('evN164', addDaysISO(today(), 7), { color: null, startT: '09:00', endT: '10:00' });
  seedCache([evN]);
  var impN = importEventAsTask(evN, true);
  eq(impN.type, 'perso', 'import perso (couleur par defaut)');
  editEvId = null;
  openEvModal('evN164'); // remplit la modale + la rangee type
  ok(els['eTypes'].innerHTML.indexOf('eType-pro') >= 0, 'rangee type rendue dans la modale');
  ok(els['eType-perso'].checked === true && els['eType-pro'].checked === false, 'type persel pre-coche selon la couleur');
  pickEvType164('pro'); // l utilisateur choisit 🔴
  reqs = [];
  var saveN = agendaSaveEvent();
  ok(saveN && typeof saveN.then === 'function', 'agendaSaveEvent renvoie une promesse');
  await flush();
  var prN = patchReqs()[0];
  ok(!!prN && prN.url.indexOf('evN164') >= 0, 'PATCH envoye');
  ok(!!prN && prN.body.indexOf('"colorId":"11"') >= 0, 'v16.4 : le PATCH porte la nouvelle couleur (11 = pro)');
  ok(!!prN && prN.body.indexOf('"summary":"🔴 ') >= 0, 'le titre Google repart avec le prefixe rouge');
  eq(state.agendaCache.events[0].color, '11', 'cache local : couleur mise a jour');
  eq(impN.type, 'pro', 'v16.4 : la tache liee suit IMMEDIATEMENT (sync apres PATCH)');
  has(toast().textContent, 'Événement modifié', 'toast evenement modifie');
  has(toast().textContent, 'tâche liée mise à jour', 'toast : tache liee mise a jour');
  // echec reseau du PATCH
  openEvModal('evN164'); // closeEvModal a remis editEvId a null apres le save reussi
  global.__patchFails = 1;
  pickEvType164('perso');
  reqs = [];
  agendaSaveEvent();
  await flush();
  has(toast().textContent, 'Modification impossible', 'echec PATCH : toast explicite');
  eq(state.agendaCache.events[0].color, '11', 'echec : le cache ne bouge pas');

  // ===== Section 8 : v16.4 — tache importee passee pro/perso → PATCH couleur SEULE =====
  cleanState163();
  var evM = mkEv('evM164', addDaysISO(today(), 8), { color: null });
  seedCache([evM]);
  var impM = importEventAsTask(evM, true);
  eq(impM.type, 'perso', 'importee perso avant edition');
  editId = impM.id;
  els['mTitle'].value = impM.title;
  els['mNote'].value = impM.note || '';
  els['mDue'].value = impM.due;
  els['mUntil'].value = '';
  els['mStart'].value = '';
  els['mEnd'].value = '';
  els['mRep'].value = 'none';
  pickType('pro'); // l utilisateur passe la tache en 🔴 pro
  reqs = [];
  var savedM = saveModal();
  ok(!!savedM && savedM.id === impM.id, 'saveModal retourne la tache');
  eq(getTask(impM.id).type, 'pro', 'la tache est pro');
  await flush();
  var prM = patchReqs()[0];
  ok(!!prM && prM.url.indexOf('evM164') >= 0, 'v16.4 : le changement de type part vers Google');
  ok(!!prM && prM.body.indexOf('"colorId":"11"') >= 0, 'PATCH couleur 11');
  ok(!!prM && prM.body.indexOf('"summary"') >= 0 && prM.body.indexOf('description') < 0, 'PATCH couleur SEULE : ni description ni titre necrase (l evenement Google nest pas a nous)');
  eq(state.agendaCache.events[0].color, '11', 'cache local : couleur suivie');
  has(toast().textContent, 'Type envoyé', 'toast type envoye');
  // echec reseau
  editId = impM.id;
  els['mTitle'].value = impM.title;
  els['mDue'].value = impM.due;
  els['mNote'].value = '';
  els['mStart'].value = ''; els['mEnd'].value = ''; els['mUntil'].value = '';
  els['mRep'].value = 'none';
  pickType('perso');
  global.__patchFails = 1;
  reqs = [];
  saveModal();
  await flush();
  eq(getTask(impM.id).type, 'perso', 'la tache garde son type malgre l echec reseau');
  has(toast().textContent, 'non envoyée', 'echec : toast explicite, la tache garde son type');
  eq(state.agendaCache.events[0].color, '11', 'echec : la couleur Google (cache) nest pas touchée');
  // occurrence de serie : jamais de PATCH
  var impO = addTask('Occurrence test', '', 'urgent', addDaysISO(today(), 9), 'perso', { autoImport: true, gEventId: 'serieO_20261020' });
  reqs = [];
  syncTaskColor164(impO.id);
  await flush();
  eq(patchReqs().length, 0, 'occurrence : aucun PATCH (garde v12)');
  has(toast().textContent, 'Occurrence', 'occurrence : info affichee');
  // pas de PATCH si le type n a PAS change
  editId = impM.id;
  els['mTitle'].value = 'Titre edite sans changer le type';
  els['mDue'].value = impM.due;
  els['mNote'].value = ''; els['mStart'].value = ''; els['mEnd'].value = ''; els['mUntil'].value = '';
  els['mRep'].value = 'none';
  pickType('perso');
  reqs = [];
  saveModal();
  await flush();
  eq(patchReqs().length, 0, 'pas de PATCH quand le type ne change pas (importee : rien ne part vers Google)');

  // ===== Section 9 : tache LIEE : le type pousse deja via PUT (inchange, re-verifie) =====
  cleanState163();
  var tT = addTask('Tache liee T', '', 'week', addDaysISO(today(), 3), 'perso', { gEventId: 'evT164', gSync: 'ok' }); // liee = a deja un evenement Google (sinon taskToEvent fait un POST de creation)
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  editId = tT.id;
  els['mTitle'].value = 'Tache liee T';
  els['mDue'].value = addDaysISO(today(), 3);
  els['mNote'].value = ''; els['mStart'].value = ''; els['mEnd'].value = ''; els['mUntil'].value = '';
  els['mRep'].value = 'none';
  pickType('pro');
  reqs = [];
  saveModal(); // autoSync : taskToEvent part
  await flush();
  var putT = reqs.filter(function (r) { return r.method === 'PUT'; })[0];
  ok(!!putT && putT.body.indexOf('"colorId":"11"') >= 0, 'liee : le PUT porte deja colorId (v4 inchange)');
  ok(putT.body.indexOf('🔴 Tache liee T') >= 0, 'liee : prefixe rouge dans le titre pousse');

  // ===== Section 10 : suppression v16.3 re-verifiee (liée + occurrence) =====
  cleanState163();
  var evU = mkEv('evU164', addDaysISO(today(), 2));
  seedCache([evU]);
  var tU = addTask('Tache liee U', '', 'week', addDaysISO(today(), 2), 'pro', { gEventId: 'evU164', gSync: 'ok' });
  reqs = [];
  deleteTask(tU.id);
  await flush();
  ok(delReqs().some(function (r) { return r.url.indexOf('evU164') >= 0; }), 'liee : DELETE immediat');
  undoLast();
  ok(!!getTask(tU.id), 'liee restauree');

  var evV = mkEv('serieV_20261018', addDaysISO(today(), 3));
  seedCache([evV]);
  var impV = importEventAsTask(evV, true);
  reqs = [];
  deleteTask(impV.id);
  await flush();
  eq(delReqs().length, 0, 'occurrence : jamais de DELETE (garde v12)');
  has(toast().innerHTML, "occurrence d'une série", 'v16.4 : info occurrence integree au toast de suppression (visible, pas ecrasee)');

  // ===== Section 11 : auto-refresh v16.2 toujours actif =====
  cleanState163();
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  seedCache([]);
  state.agendaCache.fetchedAt = Date.now() - 6 * 60000;
  global.__eventsFixture = [];
  reqs = [];
  lastAutoFetch = 0; agendaAutoBusy = false;
  maybeAutoRefresh();
  await flush(); await flush();
  ok(reqs.some(function (r) { return r.url.indexOf('/calendars/primary/events?') >= 0; }), 'auto-refresh 5 min (v16.2) actif');

  // ===== Section 12 : badgeOnly v16.1 =====
  cleanState163();
  var evK = mkEv('evK164', addDaysISO(today(), 8));
  var impK = importEventAsTask(evK, true);
  impK.localEdit = true;
  seedCache([]);
  global.__evGet = { evK164: { id: 'evK164', status: 'cancelled' } };
  var kqK = syncImportedFromCache({ allowKill: true });
  eq(kqK.killQueue.length, 1, 'localEdit candidate (badgeOnly)');
  ok(kqK.killQueue[0].badgeOnly === true, 'badgeOnly=true');
  eq(await verifyKills(kqK.killQueue), 0, 'badgeOnly : jamais retiree');
  ok(!!getTask(impK.id) && impK.evGone === true, 'badge « plus dans l agenda » seulement');
  seedCache([evK]);
  global.__evGet = null;
  syncImportedFromCache({ allowKill: true });
  ok(impK.evGone === false, 'le badge se leve au retour');

  // ===== Menage =====
  clearTimeout(driveTimer);
  if (typeof agendaTimer !== 'undefined') clearInterval(agendaTimer);
  clearTimeout(toastTimer);

  console.log('\n===== RESULTAT : ' + PASS + ' OK, ' + FAILS.length + ' echec(s) =====');
  if (FAILS.length > 0) process.exit(1);
}
main().catch(function (e) { console.error('ERREUR FATALE : ' + (e && e.stack || e)); process.exit(1); });
