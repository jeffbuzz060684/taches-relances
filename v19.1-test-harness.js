// ===== Harnais de test v19.1 — « Listes » =====
// Base v19 (255 assertions conservées : agenda 2 sens, relances, fusion Drive, photo → liste OCR,
// calendrier, stats, impression, recherche étendue, timeout Drive) + Section 21 v19.1 : épinglage ⭐
// et ordre manuel ⇅ des listes (suivis par la fusion Drive), date de l'événement lié sur la carte,
// filtres Tout/En cours/Modèles/Finies, récap des quantités restantes, vue « 🧮 Ce qui manque »
// consolidée toutes listes (imprimable, codes 🔐 jamais montrés), déplacement d'un élément vers
// une autre liste.
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
  eq(APP_VERSION, 'v19.1', 'APP_VERSION v19.1');
  ok(exportData().version === 19, 'exportData version 19 (>= 16 : pas de rotation Drive, format inchangé)');
  has(html, 'var APP_VERSION = "v19.1"', 'source : APP_VERSION v19.1');
  has(swSrc, "const CACHE = 'taches-relances-v19.1'", 'sw : cache renomme v19.1 (exact)');
  has(html, 'checkNewVer188', 'v18.8 : verif INDEPENDANTE du SW — l app lit sw.js et compare la version, rechargement si plus recent');
  has(html, "cache: 'no-store'", 'v18.8 : lecture reseau sans cache HTTP (evite le CDN qui sert une vieille copie)');
  has(html, 'r.update()', 'v18.6 : mise a jour ACTIVE — l app demande les nouveautes (retour premier plan + toutes les 2 min)');
  has(html, 'visibilitychange', 'v18.6 : update au retour au premier plan');
  has(html, 'location.reload()', 'v18.3 : nouvelle version → rechargement automatique (fini le rechargement manuel)');
  has(html, 'opacity:0;cursor:pointer', 'v18.5 : entree fichier invisible POSEE sur le bouton (tap direct sur l input — fiable sur Opera et tous navigateurs)');
  ok(html.indexOf('left:-9999px') < 0, 'v18.5 : plus d entree hors ecran (Opera n active pas un input hors de la vue)');
  ok(html.indexOf('for="photoCam"') < 0 && html.indexOf('for="photoGal"') < 0, 'v18.5 : plus de label for — l input est DANS le label');
  ok(html.indexOf("photoCam').click()") < 0 && html.indexOf("photoGal').click()") < 0, 'v18.4 : plus AUCUN click() programme sur les entrees fichier');
  ok(html.indexOf('id="photoCam"') < 0 && html.indexOf('id="pShootCam"') < 0 && html.indexOf('capture=') < 0, 'v18.7 : bouton caméra RETIRE (demande Jade — appareil photo via navigateur cassé dans Opera) : plus ni photoCam ni pShootCam ni capture');
  has(html, 'addEventListener("error"', 'v18.4 : anti-erreur muette — toute erreur JS devient un toast visible');
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
  ['photoModal','pLabel','pHint','pName','pNameWrap','pResults','pProgWrap','pProgTxt','pShootGal','pCancelRow','pLines','pOkBtn','photoGal'].forEach(function (id) { document.getElementById(id); }); // stubs pre-crees (acces directs) — v18.7 : pShootCam/photoCam retires
  has(html, 'id="photoModal"', 'v18 source : feuille photo presente');
  has(html, 'id="photoGal"', 'v18.1/v18.7 : unique entree = import galerie/fichiers SANS capture');
  has(html, 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:0', 'v18.5 : overlay input sur TOUTE la surface du bouton (Section 18)');
  has(html, 'pShootGal', 'v18.1 : bouton galerie/fichiers distinct');
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
  eq(els['pShootGal'].className, 'bigphoto', 'v18.7 : bouton unique import galerie visible a l ouverture');
  openPhotoModal(lP18.id);
  eq(els['pNameWrap'].className, 'hidden', 'v18 : liste cible → champ nom masque');
  ok(els['pLabel'].textContent.indexOf('Liste photo') >= 0, 'v18 : le titre vise la liste cible');
  closePhotoModal();
  eq(els['photoModal'].className, 'modal hidden', 'v18 : fermeture de la feuille photo');
  photoTargetList = null;

  // ===== Section 19 : v18.2 — cohérence des ids (leçon pShoot : getElementById sur un id inexistant = crash muet en vrai navigateur) =====
  var defIds19 = {};
  var mDef19; var reDef19 = /id="([A-Za-z0-9_\-]+)"/g;
  while ((mDef19 = reDef19.exec(html))) defIds19[mDef19[1]] = true;
  var orphans19 = []; var seen19 = {}; var mRef19; var reRef19 = /getElementById\("([A-Za-z0-9_\-]+)"\)/g;
  while ((mRef19 = reRef19.exec(html))) {
    if (!seen19[mRef19[1]]) { seen19[mRef19[1]] = true; if (!defIds19[mRef19[1]]) orphans19.push(mRef19[1]); }
  }
  ok(orphans19.length === 0, 'v18.2 : tout getElementById littéral vise un id défini (orphelins : ' + (orphans19.join(', ') || 'aucun') + ')');
  ok(html.indexOf('getElementById("pShoot")') < 0, 'v18.2 : plus aucune reference au vieux bouton pShoot');

  // ===== Section 20 : v19 « Haut de gamme » — Calendrier, Stats, Impression, recherche étendue, timeout Drive =====
  has(html, "showView('cal')", 'v19 : bouton calendrier dans l en-tete');
  has(html, "showView('stats')", 'v19 : bouton statistiques dans l en-tete');
  has(html, 'id="view-cal"', 'v19 : conteneur de la vue calendrier');
  has(html, 'id="view-stats"', 'v19 : conteneur de la vue stats');
  has(html, 'id="calDayModal"', 'v19 : feuille du jour du calendrier');
  has(html, 'id="printArea"', 'v19 : zone d impression dediee');
  has(html, 'body.printing > *:not(#printArea)', 'v19 : a l impression SEULE la liste est visible (tout le reste masque)');
  ok(html.indexOf('return fetch("https://www.googleapis.com/drive') < 0, 'v19 : plus AUCUN fetch reseau brut — driveDeleteFile passe par fetchTO17');
  has(html, 'fetchTO17("https://www.googleapis.com/drive/v3/files/', 'v19 : le DELETE Drive a le timeout 20 s (le dernier fetch sans garde-fou, bouche en v19)');
  has(html, 'function printList', 'v19 : impression d une liste');
  has(html, ' imprimé', 'v19 : le bouton imprimer vit dans le detail de liste');

  // --- Calendrier : arithmetique des mois, items d un jour, grille, feuille du jour ---
  eq(calMonthOf('2026-11-08'), '2026-11', 'cal : calMonthOf extrait YYYY-MM');
  eq(calShiftMonth('2026-11', 1), '2026-12', 'cal : +1 mois simple');
  eq(calShiftMonth('2026-12', 1), '2027-01', 'cal : passage d annee en avant');
  eq(calShiftMonth('2026-01', -1), '2025-12', 'cal : passage d annee en arriere');
  eq(calDaysInMonth('2026-11'), 30, 'cal : novembre 2026 = 30 jours');
  eq(calDaysInMonth('2028-02'), 29, 'cal : fevrier 2028 bissextile = 29 jours');
  ok(calMonthLabel('2026-11') === 'novembre 2026', 'cal : libelle du mois en francais');
  eq(((daysDiffISO('2024-01-01', '2026-11-01') % 7) + 7) % 7, 6, 'cal : 1er novembre 2026 = dimanche (grille demarree lundi 26 octobre — ancrage lundi verifie)');
  var t19 = today();
  cleanState163();
  state.lists = [];
  state.tasks.push({ id: 'ct1', title: 'Tache pro du jour', type: 'pro', due: t19, cat: 'urgent', createdAt: t19 });
  state.tasks.push({ id: 'ct2', title: 'Tache multi-jours', type: 'perso', due: addDaysISO(t19, 2), until: addDaysISO(t19, 4), cat: 'week', createdAt: t19 });
  state.tasks.push({ id: 'ct3', title: 'Deja faite', type: 'perso', due: t19, cat: 'done', doneAt: t19, createdAt: t19 });
  state.tasks.push({ id: 'ct4', title: 'En retard', type: 'perso', due: addDaysISO(t19, -2), cat: 'urgent', createdAt: t19 });
  seedCache([
    mkEv('evcal1', addDaysISO(t19, 3), { title: 'Stage debouchoir', startT: '09:00', endT: '17:00' }),
    mkEv('evcal2', t19, { until: addDaysISO(t19, 5), color: '11' })
  ]);
  var bToday19 = calDayItems(t19);
  ok(bToday19.tasks.length === 1 && bToday19.tasks[0].id === 'ct1', 'calDayItems : la tache du jour y est, la terminee n y est pas');
  ok(calDayItems(t19).events.length === 1, 'calDayItems : l evenement multi-jours couvre aujourd hui');
  ok(calDayItems(addDaysISO(t19, 1)).tasks.length === 0, 'calDayItems : aucune tache isolee le lendemain');
  ok(calDayItems(addDaysISO(t19, 3)).events.length === 2, 'calDayItems : les 2 evenements couvrent J+3');
  ok(calDayItems(addDaysISO(t19, 4)).tasks.length === 1, 'calDayItems : la tache multi-jours reste presente jusqu a sa fin');
  ok(calDayItems(addDaysISO(t19, 5)).tasks.length === 0, 'calDayItems : plus rien apres la fin de la plage');
  var g19 = calGridHtml();
  has(g19, "openCalDay('" + t19 + "')", 'cal : le jour courant est cliquable');
  ok(g19.indexOf('calcell today') >= 0, 'cal : classe today sur le jour courant');
  has(g19, 'cdot p', 'cal : pastille rouge pro rendue');
  has(g19, 'cdot s', 'cal : pastille bleue rendue');
  has(g19, 'cdot e', 'cal : pastille verte pour un evenement de couleur inconnue');
  var nv19 = calNavHtml();
  has(nv19, 'calPrev', 'cal : navigation mois precedent');
  has(nv19, 'calNext', 'cal : navigation mois suivant');
  has(nv19, "calGoToday", 'cal : bouton retour Aujourd hui');
  has(nv19, '1 en retard', 'cal : bandeau des retards (1 tache en retard)');
  // navigation de mois : la grille suit
  calMonth = '2026-10';
  has(calGridHtml(), "openCalDay('2026-10-26')", 'cal : octobre 2026 demarre lundi 26 (grille du mois choisi)');
  calMonth = null; // retour au mois courant
  // feuille du jour
  openCalDay(t19);
  eq(els['calDayModal'].className, 'modal', 'cal : feuille du jour ouverte');
  ok(String(els['calDayLabel'].textContent).indexOf(dayLongLabel(t19)) >= 0, 'cal : libelle de la feuille = jour long');
  has(els['calDayBody'].innerHTML, 'Tache pro du jour', 'cal : la tache du jour figure dans la feuille');
  ok(els['calDayBody'].innerHTML.indexOf('Deja faite') < 0, 'cal : pas de tache terminee dans la feuille');
  ok(els['calDayBody'].innerHTML.indexOf('En retard') < 0, 'cal : la feuille ne montre que le jour tape (pas les retards d hier)');
  closeCalDay();
  eq(els['calDayModal'].className, 'modal hidden', 'cal : feuille fermee');
  // showView branche les nouvelles vues
  showView('cal');
  eq(els['view-cal'].className, '', 'v19 : showView affiche la vue calendrier');
  eq(els['view-stats'].className, 'hidden', 'v19 : la vue stats reste masquee');
  has(els['calBody'].innerHTML, 'calgrid', 'v19 : la grille est rendue dans la vue calendrier');
  showView('stats');
  eq(els['view-stats'].className, '', 'v19 : showView affiche la vue stats');
  has(els['statsBody'].innerHTML, 'statcard', 'v19 : les compteurs sont rendus');
  showView('tasks');
  eq(els['view-cal'].className, 'hidden', 'v19 : retour aux taches masque le calendrier');
  // saisie rapide pre-remplie au jour choisi depuis le calendrier
  openQuickAdd(addDaysISO(t19, 9));
  eq(quickDue, 'date', 'v19 : quick add en mode date quand il est pre-rempli par le calendrier');
  eq(els['qDate'].value, addDaysISO(t19, 9), 'v19 : la date pre-remplie = le jour tape dans le calendrier');
  eq(els['q-today'].className, 'chip', 'v19 : la puce Aujourd hui est neutralisee (date pre-remplie)');
  closeQuickAdd();
  openQuickAdd();
  eq(quickDue, 'today', 'v19 : sans argument, quick add est inchange (Aujourd hui)');
  eq(els['qDate'].value, '', 'v19 : sans argument, la date reste vide');
  closeQuickAdd();

  // --- Statistiques : semaines, compteurs, SVG ---
  cleanState163();
  var mon19 = weekKeyOf(today());
  eq(weekKeyOf(addDaysISO(mon19, 3)), mon19, 'stats : milieu de semaine → lundi de sa semaine');
  eq(weekKeyOf(addDaysISO(mon19, 7)), addDaysISO(mon19, 7), 'stats : le lundi suivant ouvre une nouvelle cle');
  state.tasks.push({ id: 's1', title: 'A', type: 'perso', due: t19, cat: 'done', doneAt: t19, createdAt: t19 });
  state.tasks.push({ id: 's2', title: 'B', type: 'perso', due: t19, cat: 'done', doneAt: addDaysISO(mon19, -3), createdAt: t19 }); // vendredi de la semaine DERNIÈRE
  state.tasks.push({ id: 's2b', title: 'B2', type: 'perso', due: t19, cat: 'done', doneAt: addDaysISO(mon19, 2), createdAt: t19 }); // mercredi de CETTE semaine
  state.tasks.push({ id: 's3', title: 'C', type: 'pro', due: t19, cat: 'week', createdAt: t19 });
  state.tasks.push({ id: 's4', title: 'D', type: 'pro', due: addDaysISO(t19, -2), cat: 'urgent', createdAt: t19 });
  var w19 = statsWeeksData(10);
  eq(w19.length, 10, 'stats : 10 semaines produites');
  eq(w19[9].count, 2, 'stats : 2 faites cette semaine');
  eq(w19[8].count, 1, 'stats : 1 faite la semaine derniere');
  eq(w19[9].key, mon19, 'stats : la semaine courante demarre lundi');
  var sh19 = statsHtml();
  has(sh19, 'faites cette semaine', 'stats : carte semaine');
  has(sh19, 'en retard', 'stats : carte retards (1)');
  has(sh19, '<svg', 'stats : graphique SVG sans aucune dependance externe');
  ok((sh19.match(/class="bar19[ "]/g) || []).length === 10, 'stats : 10 barres rendues');
  has(sh19, '▲ +1 vs la semaine dernière', 'stats : tendance hausse affichee');

  // --- Impression : les codes 🔐 ne sortent JAMAIS ---
  cleanState163();
  state.lists = [
    { id: 'pl1', name: 'Liste impression', parent: null, items: [
      { id: 'pi1', text: 'gants', qty: 4, done: false, secret: false },
      { id: 'pi2', text: 'CODE-SECRET-123', done: false, secret: true },
      { id: 'pi3', text: 'casque', done: true, secret: false }
    ] },
    { id: 'pl2', name: 'Sous-liste', parent: 'pl1', items: [ { id: 'pi4', text: 'lampe', done: false, secret: false } ] }
  ];
  var ph19 = printListHtml(getList('pl1'));
  has(ph19, 'Liste impression', 'print : nom de la liste');
  has(ph19, '☐ 4 × gants', 'print : case vide + quantite');
  has(ph19, '☑ casque', 'print : case cochee');
  ok(ph19.indexOf('CODE-SECRET-123') < 0, 'print : le code secret n est JAMAIS imprime');
  has(ph19, '••••••', 'print : le code apparait masque a la place');
  has(ph19, 'Sous-liste', 'print : la sous-liste est imprimee aussi');
  printList('pl1');
  has(els['printArea'].innerHTML, 'Liste impression', 'print : la zone d impression est remplie');
  ok(els['printArea'].innerHTML.indexOf('CODE-SECRET-123') < 0, 'print : la zone d impression ne contient jamais le code');

  // --- Recherche etendue : listes + elements + evenements ---
  cleanState163();
  setSearch('');
  state.lists = [{ id: 'rl1', name: 'Sac mortier', parent: null, items: [ { id: 'ri1', text: 'debouchoir', done: false, secret: false } ] }];
  state.tasks.push({ id: 'rt1', title: 'Acheter un debouchoir', type: 'perso', due: t19, cat: 'urgent', createdAt: t19 });
  seedCache([mkEv('evsrch', t19, { title: 'Stage debouchoir pro' })]);
  view = 'tasks'; tab = 'tasks';
  setSearch('debouchoir');
  var sb19 = els['list'].innerHTML;
  has(sb19, 'Acheter un debouchoir', 'recherche v19 : les taches restent trouvees');
  has(sb19, 'Sac mortier', 'recherche v19 : la liste dont un ELEMENT matche est proposee');
  has(sb19, 'Stage debouchoir pro', 'recherche v19 : l evenement agenda matche aussi');
  has(sb19, '3 résultat(s)', 'recherche v19 : compteur total = 3 resultats');
  setSearch('');
  ok(els['searchClear'].className === 'hidden', 'recherche : le bouton effacer se retracte quand la recherche est vide');

  // ===== Section 21 : v19.1 « Listes » — épinglage ⭐, ordre ⇅, filtres, récap 🧮, vue manquant, déplacement ➡️ =====
  has(html, 'id="iMove"', 'v19.1 : sélecteur de déplacement dans la modale élément');
  has(html, 'function togglePinList', 'v19.1 : épinglage d une liste');
  has(html, 'function moveRootList', 'v19.1 : ordre manuel des listes racines');
  has(html, 'function openManque', 'v19.1 : vue consolidée « ce qui manque »');
  has(html, 'function printManque', 'v19.1 : impression de la vue manquant');
  has(html, 'function moveItemToList', 'v19.1 : déplacement d un élément vers une autre liste');
  has(html, 'lfilters', 'v19.1 : barre de filtres CSS de l onglet listes');
  has(html, 'pinned: l.pinned === true', 'v19.1 : normalizeListIn suit l épinglage (fusion Drive)');
  has(html, 'order: (typeof l.order === "number"', 'v19.1 : normalizeListIn suit l ordre manuel (fusion Drive)');

  // --- normalizeListIn : roundtrip pinned / order ---
  var nl191 = normalizeListIn({ id: 'nlx191', name: 'X', pinned: true, order: 3, items: [] });
  eq(nl191.pinned, true, 'normalize : pinned=true conservé');
  eq(nl191.order, 3, 'normalize : order=3 conservé');
  var nl191b = normalizeListIn({ id: 'nly191', name: 'Y', pinned: 'oui', order: 'abc', items: [] });
  eq(nl191b.pinned, false, 'normalize : pinned non booléen → false');
  eq(nl191b.order, null, 'normalize : order non numérique → null');

  // --- listIsDone : agrégat racine + sous-listes ---
  cleanState163();
  state.lists = [
    { id: 'a191', name: 'Racine vide', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [] },
    { id: 'b191', name: 'Sous complète', parent: 'a191', createdAt: '2026-11-02', updatedAt: 2, items: [
      { id: 'bi1', text: 'x', done: true }, { id: 'bi2', text: 'y', done: true } ] },
    { id: 'c191', name: 'Pas finie', parent: null, createdAt: '2026-11-03', updatedAt: 3, items: [ { id: 'ci1', text: 'z', done: false } ] }
  ];
  ok(listIsDone(getList('a191')) === true, 'fini : racine vide + sous-liste 100 % cochée = finie (agrégat)');
  ok(listIsDone(getList('b191')) === true, 'fini : sous-liste 2/2 = finie');
  ok(listIsDone(getList('c191')) === false, 'fini : 1 élément non coché = pas finie');

  // --- épinglage ⭐ : état, updatedAt, tri ---
  cleanState163();
  state.lists = [
    { id: 'p191a', name: 'Prem', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [] },
    { id: 'p191b', name: 'Deux', parent: null, createdAt: '2026-11-02', updatedAt: 2, items: [] }
  ];
  ok(togglePinList('p191b') === true, 'pin : togglePinList renvoie true');
  eq(getList('p191b').pinned, true, 'pin : la liste est épinglée');
  ok(getList('p191b').updatedAt > 2, 'pin : updatedAt bumpé (fusion Drive)');
  eq(listRoots().map(function (l) { return l.id; }).join(','), 'p191b,p191a', 'pin : l épinglée passe en tête');
  togglePinList('p191b');
  eq(getList('p191b').pinned, false, 'pin : désépinglage');
  eq(listRoots().map(function (l) { return l.id; }).join(','), 'p191a,p191b', 'pin : retour à l ordre de création');

  // --- ordre manuel ⇅ : swap des voisins + updatedAt + rendu ---
  cleanState163();
  state.lists = [
    { id: 'r191a', name: 'L1', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [] },
    { id: 'r191b', name: 'L2', parent: null, createdAt: '2026-11-02', updatedAt: 2, items: [] },
    { id: 'r191c', name: 'L3', parent: null, createdAt: '2026-11-03', updatedAt: 3, items: [] }
  ];
  ok(moveRootList('r191c', -1) === true, 'ordre : L3 monte d un cran');
  eq(listRoots().map(function (l) { return l.id; }).join(','), 'r191a,r191c,r191b', 'ordre : L1, L3, L2');
  ok(getList('r191b').updatedAt > 3 && getList('r191c').updatedAt > 3, 'ordre : les 2 voisines bumpées updatedAt');
  var ov191 = listsOverviewHtml();
  ok(ov191.indexOf('L3') < ov191.indexOf('L2'), 'ordre : listsOverviewHtml reflète le nouvel ordre');
  ok(moveRootList('r191a', -1) === false, 'ordre : monter au-dessus de la première = refus propre');

  // --- filtres Tout / En cours / Modèles / Finies ---
  cleanState163();
  state.lists = [
    { id: 'f191a', name: 'MaListeFinie', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [ { id: 'fi1', text: 'ok', done: true } ] },
    { id: 'f191b', name: 'MaListeActive', parent: null, createdAt: '2026-11-02', updatedAt: 2, items: [ { id: 'fi2', text: 'non', done: false } ] },
    { id: 'f191c', name: 'MonModele', parent: null, template: true, createdAt: '2026-11-03', updatedAt: 3, items: [] }
  ];
  setListFilter('done');
  var fl191 = listsOverviewHtml();
  has(fl191, 'MaListeFinie', 'filtre Finies : la liste finie est affichée');
  ok(fl191.indexOf('MaListeActive') < 0, 'filtre Finies : la liste active est masquée');
  ok(fl191.indexOf('MonModele') < 0, 'filtre Finies : le modèle est masqué');
  setListFilter('templates');
  var ft191 = listsOverviewHtml();
  has(ft191, 'MonModele', 'filtre Modèles : le modèle est affiché');
  ok(ft191.indexOf('MaListeFinie') < 0 && ft191.indexOf('MaListeActive') < 0, 'filtre Modèles : seulement les modèles');
  setListFilter('active');
  var fa191 = listsOverviewHtml();
  has(fa191, 'MaListeActive', 'filtre En cours : la liste active est affichée');
  ok(fa191.indexOf('MaListeFinie') < 0, 'filtre En cours : la finie est masquée');
  has(fa191, 'En cours · 1', 'filtres : compteur En cours = 1');
  has(fa191, 'Finies · 1', 'filtres : compteur Finies = 1');
  setListFilter('all');
  var fn191 = listsOverviewHtml();
  has(fn191, 'Tout · 3', 'filtres : compteur Tout = 3');
  has(fn191, '🧮 Ce qui manque · 1', 'filtres : bouton manquant avec compteur');

  // --- date de l événement lié sur la carte 🔗 ---
  cleanState163();
  seedCache([mkEv('evchip191', '2026-11-20', { title: 'Manoeuvre' })]);
  state.lists = [ { id: 'ec191', name: 'ListeEvent', parent: null, evId: 'evchip191', createdAt: '2026-11-04', updatedAt: 4, items: [] } ];
  var ev191 = listsOverviewHtml();
  has(ev191, '🔗', 'carte : icône lien de l événement');
  has(ev191, '20/11/2026', 'carte : la date de l événement lié est visible directement');
  seedCache([]);

  // --- récap des quantités restantes dans le détail ---
  cleanState163();
  state.lists = [ { id: 'q191', name: 'Courses', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [
    { id: 'qi1', text: 'pulkas', qty: 3, done: false, secret: false },
    { id: 'qi2', text: 'gants', qty: 2, done: false, secret: false },
    { id: 'qi3', text: 'casque', qty: 5, done: true, secret: false } ] } ];
  currentListId = 'q191';
  renderListDetail();
  has(els['listDetail'].innerHTML, '🧮 Reste 2 élément(s) · quantité totale 5', 'détail : récap reste 2 éléments, quantité 5 (le coché ne compte pas)');

  // --- vue « 🧮 Ce qui manque » : consolidée, cochable, secrets masqués, imprimable ---
  cleanState163();
  state.lists = [
    { id: 'm191a', name: 'Achat', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [
      { id: 'mi1', text: 'Pulka', qty: 3, done: false, secret: false },
      { id: 'mi2', text: 'CODE-191', done: false, secret: true },
      { id: 'mi3', text: 'DejaPris', qty: 9, done: true, secret: false } ] },
    { id: 'm191b', name: 'Sous achat', parent: 'm191a', createdAt: '2026-11-02', updatedAt: 2, items: [ { id: 'mi4', text: 'Court sechon', done: false, secret: false } ] }
  ];
  eq(manqueCount(), 3, 'manque : 3 éléments non cochés toutes listes confondues');
  manqueMode = true;
  view = 'tasks'; tab = 'lists';
  renderAll();
  var mh191 = els['list'].innerHTML;
  has(mh191, 'Ce qui manque', 'manque : titre de la vue');
  has(mh191, '3 élément(s) non coché(s)', 'manque : compteur d éléments');
  has(mh191, 'quantité totale 5', 'manque : quantité totale (3 + 1 + 1)');
  has(mh191, 'Pulka', 'manque : l élément non coché de la racine est là');
  has(mh191, 'Court sechon', 'manque : les sous-listes sont incluses');
  ok(mh191.indexOf('DejaPris') < 0, 'manque : les éléments déjà cochés n apparaissent pas');
  ok(mh191.indexOf('CODE-191') < 0, 'manque : le code secret n est JAMAIS affiché en clair');
  has(mh191, '••••••', 'manque : le code est masqué à la place');
  var pm191 = printManqueHtml();
  has(pm191, 'Ce qui manque', 'print manque : titre');
  has(pm191, '☐ 3 × Pulka', 'print manque : case vide + quantité');
  ok(pm191.indexOf('DejaPris') < 0, 'print manque : pas d élément coché');
  ok(pm191.indexOf('CODE-191') < 0, 'print manque : le code n est jamais imprimé');
  has(pm191, '•••••• (code masqué — jamais imprimé)', 'print manque : le code est remplacé par le masque');
  printManque();
  has(els['printArea'].innerHTML, 'Ce qui manque', 'print manque : la zone d impression est remplie');
  ok(els['printArea'].innerHTML.indexOf('CODE-191') < 0, 'print manque : jamais de code dans la zone d impression');
  toggleItem('m191a', 'mi1');
  renderAll();
  eq(manqueCount(), 2, 'manque : cocher depuis la vue décrémente le compteur');
  manqueMode = false; tab = 'tasks';

  // --- déplacement ➡️ d un élément vers une autre liste (quantité et code préservés) ---
  cleanState163();
  state.lists = [
    { id: 's191a', name: 'Source', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [ { id: 'si1', text: 'Cle dynamometrique', qty: 2, done: false, secret: false } ] },
    { id: 's191b', name: 'Cible', parent: null, createdAt: '2026-11-02', updatedAt: 2, items: [] }
  ];
  openItemModal('s191a', 'si1');
  eq(els['iMove'].innerHTML.indexOf('s191b') >= 0, true, 'move : la modale propose la liste cible');
  ok(els['iMove'].innerHTML.indexOf('s191a') < 0, 'move : la liste source n est pas proposée');
  els['iText'].value = 'Cle dynamometrique';
  els['iQty'].value = '2';
  els['iSecret'].checked = false;
  els['iMove'].value = 's191b';
  saveItemModal();
  eq(getList('s191a').items.length, 0, 'move : la source est vide après le déplacement');
  eq(getList('s191b').items.length, 1, 'move : la cible a reçu l élément');
  eq(getList('s191b').items[0].text, 'Cle dynamometrique', 'move : texte préservé');
  eq(getList('s191b').items[0].qty, 2, 'move : quantité préservée');
  ok(getList('s191a').updatedAt > 1 && getList('s191b').updatedAt > 2, 'move : updatedAt bumpé sur les DEUX listes (fusion Drive)');
  cleanState163();
  state.lists = [
    { id: 'd191a', name: 'De', parent: null, createdAt: '2026-11-01', updatedAt: 1, items: [ { id: 'di1', text: 'CODE-MOVE', done: false, secret: true } ] },
    { id: 'd191b', name: 'Vers', parent: null, createdAt: '2026-11-02', updatedAt: 2, items: [] }
  ];
  ok(moveItemToList('d191a', 'di1', 'd191b') === true, 'move direct : succès');
  eq(getList('d191b').items[0].secret, true, 'move direct : le code 🔐 reste un code');
  eq(getList('d191b').items[0].text, 'CODE-MOVE', 'move direct : texte préservé');
  ok(moveItemToList('d191a', 'di1', 'd191b') === false, 'move direct : élément introuvable = échec propre');
  ok(moveItemToList('d191a', 'di1', 'd191a') === false, 'move direct : déplacer vers soi-même refusé');
  currentListId = null;

  // ===== Menage =====
  clearTimeout(driveTimer);
  if (typeof agendaTimer !== 'undefined') clearInterval(agendaTimer);
  clearTimeout(toastTimer);

  console.log('\n===== RESULTAT : ' + PASS + ' OK, ' + FAILS.length + ' echec(s) =====');
  if (FAILS.length > 0) process.exit(1);
}
main().catch(function (e) { console.error('ERREUR FATALE : ' + (e && e.stack || e)); process.exit(1); });


