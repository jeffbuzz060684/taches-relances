// ===== Harnais de test v18 — « Photo → liste » (OCR Tesseract.js sur l'appareil) =====
// Base v17 (136 assertions conservées) + Section 18 v18 : ocrLines, boutons photo, création de
// liste depuis une photo, ajout à une liste cible, quantités « 4x » parsées, toggle, modale.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(process.argv[2] || 'taches-relances-v17.html', 'utf8'); // CI : node v17-test-harness.js index.html sw.js
const swSrc = fs.readFileSync(process.argv[3] || 'v17-sw.js', 'utf8');

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
global.__delete404 = 0;         // v17 : nombre de DELETE 404 (evenement deja supprime) restants
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
      if (global.__delete404 > 0) { global.__delete404--; return mk(404, { error: { code: 404 } }); } // v17 : evenement deja parti
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
    allDay: !!opts.allDay, startT: opts.startT || '', endT: opts.endT || '', loc: opts.loc || '', rem: (opts.rem !== undefined) ? opts.rem : null, desc: opts.desc || '' };
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
  eq(APP_VERSION, 'v18', 'APP_VERSION v18');
  ok(exportData().version === 17, 'exportData version 17 (format Drive inchangé en v18)');
  has(html, 'var APP_VERSION = "v18"', 'source : APP_VERSION v18');
  has(swSrc, "taches-relances-v18", 'sw : cache renomme v18');
  ok(swSrc.indexOf('taches-relances-v17') < 0, 'sw : plus de reference v17');
  ok(swSrc.indexOf('taches-relances-v16.4') < 0, 'sw : plus de reference v16.4');
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
  ['mTitle','mNote','mDue','mUntil','mStart','mEnd','mRep','mType-pro','mType-perso','mType-autres','mRem','eRem','eTitle','eDay','eUntil','eStart','eEnd','eLoc','evModal','toast'].forEach(function (id) { document.getElementById(id); });

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
  var putT = reqs.filter(function (r) { return r.method === 'PATCH'; })[0]; // v17 : PATCH au lieu de PUT
  ok(!!putT && putT.body.indexOf('"colorId":"11"') >= 0, 'liee : le PATCH porte colorId (v4 inchange)');
  ok(putT.body.indexOf('🔴 Tache liee T') >= 0, 'liee : prefixe rouge dans le titre pousse');
  ok(putT.body.indexOf('"location"') < 0, 'v17 : le corps ne porte PAS location — le lieu regle dans Google est preserve');
  ok(reqs.filter(function (r) { return r.method === 'PUT'; }).length === 0, 'v17 : plus AUCUN PUT de mise a jour');

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
  state.agendaCache.fetchedAt = Date.now() - 3 * 60000; // v17 : seuil 2 min — 3 min de cache suffit
  global.__eventsFixture = [];
  reqs = [];
  lastAutoFetch = 0; agendaAutoBusy = false;
  maybeAutoRefresh();
  await flush(); await flush();
  ok(reqs.some(function (r) { return r.url.indexOf('/calendars/primary/events?') >= 0; }), 'auto-refresh 2 min (v17) actif');

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

  // ===== Section 13 : v17 — relances : normalisation, lecture Google, corps pousses =====
  cleanState163();
  eq(cleanRem17('default'), 'default', 'cleanRem17 : default');
  eq(cleanRem17('none'), 'none', 'cleanRem17 : none');
  eq(cleanRem17('45'), '45', 'cleanRem17 : garde les minutes hors presets (fidelite Google)');
  eq(cleanRem17('99999'), '', 'cleanRem17 : rejete au-dela de 40320 (borne Google)');
  eq(cleanRem17(undefined), '', 'cleanRem17 : vide par defaut');
  eq(remLabel17('60'), '1 h avant', 'remLabel17 : 60 min');
  eq(remLabel17('1440'), '24 h avant', 'remLabel17 : 24 h');
  eq(remLabel17('2880'), '2 j avant', 'remLabel17 : 2 jours');
  eq(remLabel17('default'), 'défaut agenda', 'remLabel17 : défaut');
  eq(evRem17({ useDefault: true }), 'default', 'evRem17 : default');
  eq(evRem17({ useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] }), '30', 'evRem17 : popup 30');
  eq(evRem17({ useDefault: false, overrides: [] }), 'none', 'evRem17 : aucune');
  eq(evRem17(null), '', 'evRem17 : inconnu = ne rien changer');
  eq(stripEvSignature17('ma note\n(professionnel — via Tâches & Relances)'), 'ma note', 'stripEvSignature17 : retire la signature');
  var pe17 = parseEvents({ items: [{ id: 'g1p17', summary: 'S', start: { date: addDaysISO(today(), 1) }, end: { date: addDaysISO(today(), 2) }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }] } }] });
  eq(pe17[0].rem, '120', 'parseEvents : lit la relance popup de Google');
  var tR17 = addTask('Tache relance', '', 'week', addDaysISO(today(), 4), 'perso', { rem: '60' });
  var evB17 = taskEventBody(tR17);
  ok(evB17.reminders && evB17.reminders.useDefault === false && evB17.reminders.overrides.length === 1 && evB17.reminders.overrides[0].method === 'popup' && evB17.reminders.overrides[0].minutes === 60, 'taskEventBody : popup 60 min poussee');
  tR17.rem = 'default'; ok(taskEventBody(tR17).reminders.useDefault === true, 'taskEventBody : default du agenda');
  tR17.rem = 'none'; var evNc17 = taskEventBody(tR17); ok(evNc17.reminders.useDefault === false && evNc17.reminders.overrides.length === 0, 'taskEventBody : aucune notification');
  tR17.rem = null; ok(taskEventBody(tR17).reminders === undefined, 'taskEventBody : pas de relance posee (le POST suivra le defaut du agenda)');
  has(html, 'id="mRem"', 'source : select relance dans la modale tache');
  has(html, 'id="eRem"', 'source : select relance dans la modale evenement');
  has(html, 'function fetchTO17', 'source : timeout 20 s (fetchTO17)');
  has(html, 'ctl.abort()', 'source : AbortController branche');
  has(html, 'method: upd ? "PATCH" : "POST"', 'source : PATCH au lieu de PUT pour les mises a jour');
  has(html, 'r.status === 404 || r.status === 410', 'source : DELETE 404/410 = succes');
  has(html, 'Agenda synchronisé automatiquement', 'source : toast de la synchro auto');
  has(html, 'oldRem17 !== cleanRem17(t.rem', 'source : detection changement relance importee');

  // ===== Section 14 : v17 — relances 2 sens (importee + liee) =====
  cleanState163();
  var evP17 = mkEv('evP17', addDaysISO(today(), 5), { rem: '120' });
  seedCache([evP17]);
  var impP17 = importEventAsTask(evP17, true);
  eq(impP17.rem, '120', 'import : la tache garde la relance de l evenement');
  evP17.rem = 'default'; syncImportedFromCache({});
  eq(impP17.rem, 'default', 'pull importee : la relance suit Google (default)');
  evP17.rem = 'none'; syncImportedFromCache({});
  eq(impP17.rem, 'none', 'pull importee : aucune notification suit');
  var tQ17 = addTask('Tache liee relance', '', 'week', addDaysISO(today(), 6), 'pro', { gEventId: 'evQ17', gSync: 'ok', rem: '30' });
  var evQ17 = mkEv('evQ17', addDaysISO(today(), 6), { color: '11', rem: '30' });
  seedCache([evQ17]); syncImportedFromCache({});
  eq(tQ17.rem, '30', 'liee : relance inchangee quand Google dit pareil');
  evQ17.rem = '1440'; syncImportedFromCache({});
  eq(tQ17.rem, '1440', 'pull liee : la relance suit Google');
  ok(taskEventBody(tQ17).reminders.overrides[0].minutes === 1440, 'le prochain push porte la nouvelle relance');

  // ===== Section 15 : v17 — importee : PATCH couleur ET/OU relance SEULES =====
  cleanState163();
  var evM17 = mkEv('evM17', addDaysISO(today(), 7), {});
  seedCache([evM17]);
  var impM17 = importEventAsTask(evM17, true);
  editId = impM17.id;
  els['mTitle'].value = impM17.title; els['mNote'].value = ''; els['mDue'].value = impM17.due;
  els['mUntil'].value = ''; els['mStart'].value = ''; els['mEnd'].value = ''; els['mRep'].value = 'none';
  els['mRem'].value = '10';
  pickType('perso');
  reqs = [];
  saveModal();
  await flush();
  eq(getTask(impM17.id).rem, '10', 'la tache importee porte la relance 10 min');
  var prM17 = patchReqs()[0];
  ok(!!prM17 && prM17.url.indexOf('evM17') >= 0, 'PATCH parti pour la relance de l importee');
  ok(!!prM17 && prM17.body.indexOf('"minutes":10') >= 0, 'le PATCH porte la popup 10 min');
  ok(!!prM17 && prM17.body.indexOf('description') < 0, 'PATCH couleur/relance SEULES : jamais de description (l evenement n est pas a nous)');
  has(toast().textContent, 'relance', 'toast relance affiche');
  editId = impM17.id;
  els['mTitle'].value = impM17.title; els['mNote'].value = ''; els['mDue'].value = impM17.due;
  els['mUntil'].value = ''; els['mStart'].value = ''; els['mEnd'].value = ''; els['mRep'].value = 'none';
  els['mRem'].value = '10';
  pickType('perso');
  reqs = [];
  saveModal();
  await flush();
  eq(patchReqs().length, 0, 'importee : aucun PATCH quand ni le type ni la relance ne changent');

  // ===== Section 16 : v17 — modale evenement : relance dans le PATCH =====
  cleanState163();
  var evN17b = mkEv('evN17b', addDaysISO(today(), 2), { startT: '09:00', endT: '10:00' });
  seedCache([evN17b]);
  importEventAsTask(evN17b, true);
  openEvModal('evN17b');
  els['eRem'].value = '60';
  reqs = [];
  agendaSaveEvent();
  await flush();
  var prE17 = patchReqs()[0];
  ok(!!prE17 && prE17.body.indexOf('"minutes":60') >= 0, 'le PATCH evenement porte la relance 60');
  eq(state.agendaCache.events[0].rem, '60', 'cache local : relance suivie');

  // ===== Section 17 : v17 — note 2 sens + DELETE 404 = succes + toast auto =====
  cleanState163();
  var tL17 = addTask('Liee note', 'ma note perso', 'week', addDaysISO(today(), 8), 'perso', { gEventId: 'evL17', gSync: 'ok' });
  var evL17 = mkEv('evL17', addDaysISO(today(), 8), { desc: 'description modifiee dans Google' });
  seedCache([evL17]); syncImportedFromCache({});
  eq(tL17.note, 'description modifiee dans Google', 'v17 : la note de la liee suit la description Google');
  ok(taskEventBody(tL17).description.indexOf('description modifiee dans Google') >= 0, 'le push remet la note');
  ok(taskEventBody(tL17).description.indexOf('via Tâches & Relances)') >= 0, 'la signature de l app est reposee');
  var evD17 = mkEv('evD17', addDaysISO(today(), 9), { startT: '14:00', endT: '15:00', desc: 'apporter le materiel' });
  seedCache([evD17]);
  var impD17 = importEventAsTask(evD17, true);
  syncImportedFromCache({});
  ok(impD17.note.indexOf('apporter le materiel') >= 0, 'importee : la description Google rejoint la note au pull');
  ok(impD17.note.indexOf('14:00') >= 0, 'importee : l horaire reste en tete de note');
  cleanState163();
  var evF17 = mkEv('evF17', addDaysISO(today(), 3));
  seedCache([evF17]);
  var impF17 = importEventAsTask(evF17, true);
  global.__delete404 = 1;
  reqs = [];
  deleteTask(impF17.id);
  await flush();
  eq((state.pendingEventDeletes || []).length, 0, 'v17 : DELETE 404 = succes, rien en file d attente');
  has(toast().innerHTML, 'supprimée', 'toast de suppression normal (pas un echec)');
  global.__delete404 = 0;
  cleanState163();
  state.cfg = { cid: 'CID', csec: '', refresh: 'RT' };
  state.autoAgenda = true;
  global.__eventsFixture = [{ id: 'evAuto17', summary: 'Evenement auto 17', start: { dateTime: addDaysISO(today(), 2) + 'T09:00:00+02:00' }, end: { dateTime: addDaysISO(today(), 2) + 'T10:00:00+02:00' } }];
  seedCache([]);
  state.agendaCache.fetchedAt = Date.now() - 3 * 60000;
  lastAutoFetch = 0; agendaAutoBusy = false;
  reqs = [];
  els['toast'].textContent = '';
  maybeAutoRefresh();
  await flush(); await flush();
  ok(reqs.some(function (r) { return r.url.indexOf('/calendars/primary/events?') >= 0; }), 'auto-refresh 2 min : parti a 3 min de cache');
  has(toast().textContent, '⚡', 'v17 : la synchro AUTO toaste quand elle importe quelque chose');
  state.autoAgenda = false;
  global.__eventsFixture = [];

  // ===== Section 18 : v18 — Photo → liste =====
  cleanState163();
  ['photoModal','pLabel','pHint','pName','pNameWrap','pResults','pProgWrap','pProgTxt','pShoot','pCancelRow','pLines','pOkBtn','photoFile'].forEach(function (id) { document.getElementById(id); }); // stubs pre-crees (acces directs)
  has(html, 'id="photoModal"', 'v18 source : feuille photo presente');
  has(html, 'capture="environment"', 'v18 source : l input photo ouvre l appareil photo');
  has(html, 'cdn.jsdelivr.net/npm/tesseract.js@5', 'v18 source : Tesseract.js charge a la demande');
  has(html, 'try { closePhotoModal(); } catch', 'v18 source : la feuille photo se ferme avec les autres');
  eq(ocrLines('').length, 0, 'ocrLines : texte vide = aucune ligne');
  var ol18 = ocrLines('Pulka\n\n   Court sechon   \nPulka\n!!\n4x raccords');
  eq(ol18.length, 3, 'ocrLines : doublon et bruit ecartes');
  eq(ol18[0], 'Pulka', 'ocrLines : ligne simple');
  eq(ol18[1], 'Court sechon', 'ocrLines : espaces normalises');
  eq(ol18[2], '4x raccords', 'ocrLines : la quantite reste pour parseQty');
  state.lists = [];
  ok(listsOverviewHtml().indexOf('📷 Photo → nouvelle liste') >= 0, 'v18 : bouton photo present meme sans aucune liste');
  var lP18 = addList('Liste photo', null, null);
  currentListId = lP18.id;
  renderListDetail();
  ok(els['listDetail'].innerHTML.indexOf('📷 Photo → ajouter') >= 0, 'v18 : bouton photo dans le detail de liste');
  photoTargetList = null;
  photoLines = [{ text: 'Pulka', keep: true }, { text: 'a ecarter', keep: false }, { text: '4x raccords', keep: true }];
  els['pName'].value = 'Courses photo';
  photoCreate();
  var created18 = state.lists.filter(function (l) { return l.name === 'Courses photo'; })[0];
  ok(!!created18, 'v18 : la liste est creee depuis la photo');
  eq(created18.items.length, 2, 'v18 : seules les lignes cochees deviennent des elements');
  eq(created18.items[0].text, 'Pulka', 'v18 : premier element');
  eq(created18.items[1].qty, 4, 'v18 : la quantite 4x est parsee (parseQty)');
  photoLines = [{ text: 'Bidon', keep: true }];
  els['pName'].value = '';
  photoCreate();
  var def18 = state.lists.filter(function (l) { return /^Photo \d{2}\/\d{2}$/.test(l.name); })[0];
  ok(!!def18, 'v18 : nom par defaut « Photo jj/mm » quand le champ est vide');
  photoTargetList = lP18.id;
  photoLines = [{ text: '2x manche', keep: true }];
  photoCreate();
  eq(lP18.items.length, 1, 'v18 : ajout photo a la liste cible');
  eq(lP18.items[0].qty, 2, 'v18 : quantite parseee dans l ajout cible');
  eq(lP18.items[0].text, 'manche', 'v18 : texte sans le prefixe quantite');
  photoLines = [{ text: 'A', keep: true }, { text: 'B', keep: true }];
  renderPhotoLines();
  ok(els['pLines'].innerHTML.indexOf('>A<') >= 0, 'v18 : les lignes detectees sont rendues');
  photoToggle(0);
  eq(photoLines[0].keep, false, 'v18 : le toggle ecarte une ligne');
  ok(els['pOkBtn'].textContent.indexOf('1 élément') >= 0, 'v18 : le bouton ne compte que les lignes gardees');
  openPhotoModal();
  eq(els['pNameWrap'].className, '', 'v18 : nouvelle liste → champ nom visible');
  openPhotoModal(lP18.id);
  eq(els['pNameWrap'].className, 'hidden', 'v18 : liste cible → champ nom masque');
  ok(els['pLabel'].textContent.indexOf('Liste photo') >= 0, 'v18 : le titre vise la liste cible');
  closePhotoModal();
  eq(els['photoModal'].className, 'modal hidden', 'v18 : fermeture de la feuille photo');
  photoTargetList = null;

  // ===== Menage =====
  clearTimeout(driveTimer);
  if (typeof agendaTimer !== 'undefined') clearInterval(agendaTimer);
  clearTimeout(toastTimer);

  console.log('\n===== RESULTAT : ' + PASS + ' OK, ' + FAILS.length + ' echec(s) =====');
  if (FAILS.length > 0) process.exit(1);
}
main().catch(function (e) { console.error('ERREUR FATALE : ' + (e && e.stack || e)); process.exit(1); });

