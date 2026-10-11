// Application des correctifs v16.4 — « les modifications pro/perso des événements ne se font pas »
// Mode opératoire figé : remplacements avec assertion d'unicité, JAMAIS de sed -i.
const fs = require('fs');
const F = 'taches-relances-v16.4.html';
let html = fs.readFileSync('taches-relances-v16.3.html', 'utf8');
let n = 0;
function rep(oldS, newS, label) {
  const i = html.indexOf(oldS);
  if (i < 0) { console.error('ECHEC [' + label + '] : introuvable'); process.exit(1); }
  if (html.indexOf(oldS, i + 1) >= 0) { console.error('ECHEC [' + label + '] : non unique'); process.exit(1); }
  html = html.slice(0, i) + newS + html.slice(i + oldS.length);
  n++;
  console.log('OK ' + n + ' : ' + label);
}

// ---------- S1 : en-tête + APP_VERSION ----------
rep(
  "// ===== Tâches & Relances — v16.3 (demande Jade : « quand je retire une tâche, je veux synchronisation immédiate ») : supprimer une tâche supprime AUSSI son événement Google Agenda immédiatement — y compris les tâches importées (avant : l'événement restait dans l'agenda et sa rangée revenait à l'écran au rafraîchissement) ; la rangée disparaît de l'app sans attendre le 🔄 ; l'Annuler 5 s reste fiable même quand le DELETE Google a déjà réussi =====",
  "// ===== Tâches & Relances — v16.4 (demande Jade : « les modifications d'événement entre pro et perso ne se font pas ») : le type 🔴 pro / 🔵 perso se synchronise dans TOUS les sens — le pull suit la couleur Google (colorId 11 = pro), la modale événement gagne une rangée 🔴/🔵 (PATCH colorId + préfixe du titre), et un changement de type d'une tâche importée part vers Google en PATCH couleur SEULE (jamais de PUT sur un événement qui n'est pas à nous : titre/lieu/invités Google préservés) =====",
  'en-tête v16.4'
);
rep('var APP_VERSION = "v16.3";', 'var APP_VERSION = "v16.4";', 'APP_VERSION v16.4');

// ---------- S2 : exportData version ----------
rep(
  'app: "taches-relances", version: 16.3, tasks: state.tasks, lists: redactListsForExport(state.lists),',
  'app: "taches-relances", version: 16.4, tasks: state.tasks, lists: redactListsForExport(state.lists),',
  'exportData version 16.4'
);

// ---------- S3 : modale événement — rangée 🔴/🔵 ----------
rep(
`      <input type="time" id="eStart" placeholder="Début">
      <input type="time" id="eEnd" placeholder="Fin">
    </div>
    <input type="text" id="eLoc" placeholder="Lieu (optionnel — copié dans la note de la tâche liée)">`,
`      <input type="time" id="eStart" placeholder="Début">
      <input type="time" id="eEnd" placeholder="Fin">
    </div>
    <div class="flabel">🏷️ Type — 🔴 pro ou 🔵 perso, la couleur suit dans Google Agenda</div>
    <div class="cat-row type-row" id="eTypes" style="grid-template-columns:1fr 1fr"></div>
    <input type="text" id="eLoc" placeholder="Lieu (optionnel — copié dans la note de la tâche liée)">`,
  'modale événement : rangée type'
);

// ---------- S4 : openEvModal — remplir la rangée selon la couleur Google ----------
rep(
`  document.getElementById("eLoc").value = ev.loc || "";`,
`  document.getElementById("eLoc").value = ev.loc || "";
  renderEvTypes164(ev.color === "11" ? "pro" : "perso"); // v16.4 : le type de la modale suit la couleur Google — modifiable (PATCH colorId)`,
  'openEvModal : rangée type'
);

// ---------- S5 : agendaSaveEvent — type lu, colorId dans le PATCH, cache suivi ----------
rep(
`  var body = {
    summary: ((ev.color === "11") ? "🔴 " : ((ev.color === "9") ? "🔵 " : "")) + title,
    location: loc || ""
  };`,
`  var newType164 = "perso"; // v16.4 : le type 🔴/🔵 de la modale événement suit et CHANGE la couleur Google
  TYPES.forEach(function (c) {
    var r = document.getElementById("eType-" + c);
    if (r && r.checked) newType164 = c;
  });
  var body = {
    summary: (newType164 === "pro" ? "🔴 " : "🔵 ") + stripEvTitle(title),
    location: loc || "",
    colorId: (newType164 === "pro") ? "11" : "9"
  };`,
  'agendaSaveEvent : PATCH colorId'
);
rep(
`    ev.title = body.summary;
    ev.day = day;`,
`    ev.title = body.summary;
    ev.color = (newType164 === "pro") ? "11" : "9"; // v16.4 : le cache local suit le nouveau type tout de suite
    ev.day = day;`,
  'agendaSaveEvent : cache couleur'
);

// ---------- S6 : pull importées — le type suit la couleur ----------
rep(
`      var newTitle = stripEvTitle(ev.title);
      if (newTitle !== t.title) { t.title = newTitle; changed = true; }
      if (ev.day !== t.due) { t.due = ev.day; changed = true; }`,
`      var newTitle = stripEvTitle(ev.title);
      if (newTitle !== t.title) { t.title = newTitle; changed = true; }
      var newType164 = (ev.color === "11") ? "pro" : "perso"; // v16.4 : le type suit la couleur Google (🔴 11, sinon 🔵)
      if (newType164 !== t.type) { t.type = newType164; changed = true; }
      if (ev.day !== t.due) { t.due = ev.day; changed = true; }`,
  'pull importées : type suit couleur'
);

// ---------- S7 : pull liées — le type suit la couleur ----------
rep(
`    var newTitle = stripEvTitle(ev.title);
    if (newTitle !== t.title) { t.title = newTitle; changed = true; }
    if (ev.day !== t.due) { t.due = ev.day; t.cat = catForDate(ev.day); changed = true; } // v14 : la catégorie suit la nouvelle date`,
`    var newTitle = stripEvTitle(ev.title);
    if (newTitle !== t.title) { t.title = newTitle; changed = true; }
    var newType164 = (ev.color === "11") ? "pro" : "perso"; // v16.4 : le type suit la couleur Google (🔴 11, sinon 🔵)
    if (newType164 !== t.type) { t.type = newType164; changed = true; }
    if (ev.day !== t.due) { t.due = ev.day; t.cat = catForDate(ev.day); changed = true; } // v14 : la catégorie suit la nouvelle date`,
  'pull liées : type suit couleur'
);

// ---------- S8 : verifyKills déplacé — le type suit la couleur ----------
rep(
`            var newTitle = stripEvTitle(ev.title);
            if (newTitle !== t.title) { t.title = newTitle; changed = true; }
            if (ev.day !== t.due) { t.due = ev.day; t.cat = catForDate(ev.day); changed = true; } // v16 : la tâche suit, même hors fenêtre`,
`            var newTitle = stripEvTitle(ev.title);
            if (newTitle !== t.title) { t.title = newTitle; changed = true; }
            var newType164 = (ev.color === "11") ? "pro" : "perso"; // v16.4 : le type suit la couleur Google (🔴 11, sinon 🔵)
            if (newType164 !== t.type) { t.type = newType164; changed = true; }
            if (ev.day !== t.due) { t.due = ev.day; t.cat = catForDate(ev.day); changed = true; } // v16 : la tâche suit, même hors fenêtre`,
  'verifyKills déplacé : type suit couleur'
);

// ---------- S9 : syncTaskColor164 + saveModal ----------
rep(
`function saveModal(autoSync) {`,
`// v16.4 : une tâche IMPORTÉE ne pousse jamais tout son événement (PUT = écraser description/invités
// d'un événement qui n'est pas à nous) — mais un changement de type part en PATCH couleur SEULE :
// Google garde titre/lieu/invités/rappels, seule la couleur (et le préfixe 🔴/🔵 du titre) suit.
function syncTaskColor164(id) {
  var t = getTask(id);
  if (!t || !t.autoImport || !t.gEventId) return Promise.resolve(false);
  if (String(t.gEventId).indexOf("_") >= 0) {
    showToast("ℹ️ Occurrence d'une série — la couleur de la série ne peut pas être changée depuis la tâche");
    return Promise.resolve(false);
  }
  var cfg = state.cfg;
  if (!cfg || !cfg.cid || !cfg.refresh) return Promise.resolve(false);
  var body = { colorId: (t.type === "pro") ? "11" : "9" };
  var ev = findEvent(t.gEventId);
  if (ev) body.summary = (t.type === "pro" ? "🔴 " : "🔵 ") + stripEvTitle(ev.title); // le préfixe suit la nouvelle couleur, le titre Google reste le sien
  return agendaAccessToken(cfg).then(function (at) {
    return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(t.gEventId), {
      method: "PATCH",
      headers: { "Authorization": "Bearer " + at, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok || !j || j.error) throw new Error("patch refusé");
      return j;
    });
  }).then(function () {
    if (ev) { ev.color = (t.type === "pro") ? "11" : "9"; ev.title = body.summary; } // le cache local suit tout de suite
    persist();
    showToast("🏷️ Type envoyé à l'agenda — l'événement est " + (t.type === "pro" ? "🔴 pro" : "🔵 perso"));
    return true;
  }).catch(function () {
    showToast("⚠️ Couleur non envoyée à l'agenda (réseau ?) — ta tâche garde son type, l'événement Google garde sa couleur");
    return false;
  });
}
function saveModal(autoSync) {`,
  'fonction syncTaskColor164'
);
rep(
`  var t0 = editId ? getTask(editId) : null;`,
`  var t0 = editId ? getTask(editId) : null;
  var oldType164 = t0 ? t0.type : null; // v16.4 : pour détecter un changement de type sur une tâche importée`,
  'saveModal : capture ancien type'
);
rep(
`  if (autoSync !== false && t && !t.autoImport) {
    if (!t.due) showToast("✅ Tâche enregistrée (sans échéance : rien à mettre dans l'agenda)");
    else if (!state.cfg || !state.cfg.cid || !state.cfg.refresh) showToast("✅ Tâche enregistrée (agenda non connecté)");
    else { showToast("💾 Enregistré — 📅 synchro agenda en cours…"); taskToEvent(t.id); }
  }
  return t;`,
`  if (autoSync !== false && t && !t.autoImport) {
    if (!t.due) showToast("✅ Tâche enregistrée (sans échéance : rien à mettre dans l'agenda)");
    else if (!state.cfg || !state.cfg.cid || !state.cfg.refresh) showToast("✅ Tâche enregistrée (agenda non connecté)");
    else { showToast("💾 Enregistré — 📅 synchro agenda en cours…"); taskToEvent(t.id); }
  }
  if (autoSync !== false && t && t.autoImport && t.gEventId && oldType164 && oldType164 !== t.type) syncTaskColor164(t.id); // v16.4 : importée passée pro↔perso → la couleur part vers Google en PATCH seul
  return t;`,
  'saveModal : PATCH couleur importée'
);

// ---------- S10 : rendu de la rangée type de la modale événement ----------
rep(
`function renderTypes() {`,
`function renderEvTypes164(sel) { // v16.4 : rangée 🔴/🔵 de la modale événement (indépendante de celle des tâches : autre groupe radio)
  var html = "";
  TYPES.forEach(function (k) {
    html += '<label id="tlblE-' + k + '" onclick="pickEvType164(\\'' + k + '\\')"><input type="radio" name="evType" id="eType-' + k + '" value="' + k + '"><span>' + TYPE_LABELS[k] + "</span></label>";
  });
  document.getElementById("eTypes").innerHTML = html;
  pickEvType164(sel || "perso");
}
function pickEvType164(k) {
  TYPES.forEach(function (c) {
    var r = document.getElementById("eType-" + c);
    var l = document.getElementById("tlblE-" + c);
    if (r) r.checked = (c === k);
    if (l) l.className = (c === k) ? "on" : "";
  });
}
function renderTypes() {`,
  'rendu rangée type événement'
);

// ---------- Écriture + contrôles ----------
fs.writeFileSync(F, html);
if (/\u2019/.test(html)) { console.error('ECHEC : apostrophe typographique présente'); process.exit(1); }
console.log('ECRIT : ' + F + ' (' + Buffer.byteLength(html, 'utf8') + ' octets, ' + n + ' remplacements)');
