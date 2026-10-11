// ===== Application v17 — relances Google Calendar 2 sens, PATCH au lieu de PUT, DELETE 404/410 = succès,
// timeouts 20 s, auto-refresh 2 min + toast ⚡, note 2 sens (description Google), relances importées (PATCH) =====
const fs = require('fs');
var src = fs.readFileSync('/home/user/index.html', 'utf8');
function rep(oldStr, newStr, n) {
  n = n || 1;
  var count = src.split(oldStr).length - 1;
  if (count !== n) { console.error('ASSERTION ECHEC (' + count + ' occurrence(s), attendu ' + n + ') : ' + JSON.stringify(String(oldStr).slice(0, 90))); process.exit(1); }
  src = src.split(oldStr).join(newStr);
}

// ---------- S1 : en-tête + version ----------
rep('// ===== Tâches & Relances — v16.4 (demande Jade : « les modifications d\'événement entre pro et perso ne se font pas ») : le type 🔴 pro / 🔵 perso se synchronise dans TOUS les sens — le pull suit la couleur Google (colorId 11 = pro), la modale événement gagne une rangée 🔴/🔵 (PATCH colorId + préfixe du titre), et un changement de type d\'une tâche importée part vers Google en PATCH couleur SEULE (jamais de PUT sur un événement qui n\'est pas à nous : titre/lieu/invités Google préservés) =====\nvar APP_VERSION = "v16.4";',
    '// ===== Tâches & Relances — v17 (demande Jade : « 1, 2, 3 sans oublier toutes les synchros et modifications dans les 2 sens ») : relances Google Calendar pilotées depuis l\'app (poussées ET tirées, PATCH couleur+relances SEULES pour les importées), PATCH au lieu de PUT (lieu/invités/description/relances réglés dans Google ne sont plus écrasés au push des liées), DELETE 404/410 = succès, timeout 20 s sur TOUS les fetch agenda, synchro auto 2 min + toast ⚡ quand elle change quelque chose, la note suit la description Google dans les 2 sens =====\nvar APP_VERSION = "v17";');

// ---------- S2 : exportData ----------
rep('version: 16.4, tasks: state.tasks', 'version: 17, tasks: state.tasks');

// ---------- S3 : helpers relances + signature (avant buildEvNote) ----------
rep('function buildEvNote(ev) {',
'var REMS17 = ["", "default", "none", "10", "30", "60", "120", "1440", "2880"]; // v17 : préréglages de relance affichés dans les 2 modales\n' +
'function cleanRem17(v) { // v17 : relance agenda — "" (ne rien changer), "default", "none" ou des minutes AVANT l\'événement (0 à 40 320 : borne Google vérifiée)\n' +
'  if (typeof v === "number") v = String(v);\n' +
'  if (v === "default" || v === "none") return v;\n' +
'  if (typeof v === "string" && /^\\d+$/.test(v)) { var n = parseInt(v, 10); if (n >= 0 && n <= 40320) return String(n); }\n' +
'  return "";\n' +
'}\n' +
'function remLabel17(v) {\n' +
'  if (v === "default") return "défaut agenda";\n' +
'  var n = parseInt(v, 10);\n' +
'  if (isNaN(n) || n < 0) return "";\n' +
'  if (n === 0) return "au début";\n' +
'  if (n < 60) return n + " min avant";\n' +
'  if (n < 1440) return Math.round(n / 60) + " h avant";\n' +
'  if (n < 2880) return "24 h avant";\n' +
'  return Math.round(n / 1440) + " j avant";\n' +
'}\n' +
'function evRem17(reminders) { // v17 : relances de l\'événement Google → "default" / "none" / minutes (1ʳᵉ popup) / "" (inconnu : ne rien changer)\n' +
'  if (!reminders) return "";\n' +
'  if (reminders.useDefault) return "default";\n' +
'  var ovs = Array.isArray(reminders.overrides) ? reminders.overrides.filter(function (o) { return o && o.method === "popup" && typeof o.minutes === "number" && o.minutes >= 0 && o.minutes <= 40320; }) : [];\n' +
'  return ovs.length ? String(ovs[0].minutes) : "none";\n' +
'}\n' +
'function stripEvSignature17(desc) { // v17 : retire la signature que l\'app pose dans la description Google (« (professionnel|personnel — via Tâches & Relances) »)\n' +
'  return String(desc || "").replace(/\\n\\((?:professionnel|personnel) — via Tâches & Relances\\)\\s*$/, "").replace(/^\\((?:professionnel|personnel) — via Tâches & Relances\\)\\s*$/, "");\n' +
'}\n' +
'function buildEvNote(ev) {');

// ---------- S4 : fetchTO17 + S5 : agendaFetch ----------
rep('function agendaFetch(url, options) {\n  return fetch(url, options).then(function (r) {',
'function fetchTO17(url, options, ms) { // v17 : timeout 20 s — un fetch réseau bloqué (réseau mort, iOS figé en arrière-plan) ne gèle plus l\'app ni les files de reprise\n' +
'  ms = ms || 20000;\n' +
'  if (typeof AbortController === "undefined") return fetch(url, options);\n' +
'  var ctl = new AbortController();\n' +
'  var to = setTimeout(function () { try { ctl.abort(); } catch (e17a) {} }, ms);\n' +
'  return fetch(url, Object.assign({}, options, { signal: ctl.signal })).then(\n' +
'    function (r17) { clearTimeout(to); return r17; },\n' +
'    function (e17) { clearTimeout(to); throw e17; }\n' +
'  );\n' +
'}\n' +
'function agendaFetch(url, options) {\n  return fetchTO17(url, options).then(function (r) {');

// ---------- S6 : taskToEvent PATCH (au lieu de PUT) ----------
rep('return fetch(url, { method: upd ? "PUT" : "POST", headers: headers, body: JSON.stringify(ev) })',
    'return fetchTO17(url, { method: upd ? "PATCH" : "POST", headers: headers, body: JSON.stringify(ev) }) // v17 : PATCH au lieu de PUT — lieu, invités, description et relances réglés dans Google ne sont plus écrasés');

// ---------- S7 : POST de recréation (2 occurrences) ----------
rep('return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: headers, body: JSON.stringify(ev) });',
    'return fetchTO17("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: headers, body: JSON.stringify(ev) });', 2);

// ---------- S8 : PUT de résurrection ----------
rep('return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(ev.id), {',
    'return fetchTO17("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(ev.id), {');

// ---------- S9 : agendaDeleteEvent timeout + 404/410 = succès ----------
rep('return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(evId), {\n      method: "DELETE",',
    'return fetchTO17("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(evId), {\n      method: "DELETE",');
rep('    if (r.status !== 200 && r.status !== 204) throw new Error("delete refusé");',
    '    if (r.status === 404 || r.status === 410) { /* v17 : déjà parti chez Google (supprimé d\'ailleurs) = exactement le résultat attendu */ }\n    else if (r.status !== 200 && r.status !== 204) throw new Error("delete refusé");');

// ---------- S10 : verifyKills GET avec timeout ----------
rep('return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(c.evId), { headers: { "Authorization": "Bearer " + at } })',
    'return fetchTO17("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(c.evId), { headers: { "Authorization": "Bearer " + at } })');

// ---------- S11 : auto-refresh 2 min ----------
rep('// v16.2 : synchro agenda AUTOMATIQUE — rafraîchissement silencieux dès que le cache dépasse 5 min (max 1 essai/min).',
    '// v16.2/17 : synchro agenda AUTOMATIQUE — rafraîchissement silencieux dès que le cache dépasse 2 min (max 1 essai/min) ; v17 : un toast ⚡ signale quand elle a changé quelque chose.');
rep('  if (Date.now() - last > 5 * 60000 && Date.now() - lastAutoFetch > 60000) {',
    '  if (Date.now() - last > 2 * 60000 && Date.now() - lastAutoFetch > 60000) { // v17 : 2 min (était 5) — plus réactif, la garde 1 essai/min tient toujours la barrière');
rep("  // v16.2 : heartbeat — tant que l'app est OUVERTE au premier plan, l'agenda se resynchro tout seul (cache > 5 min).",
    "  // v16.2/17 : heartbeat — tant que l'app est OUVERTE au premier plan, l'agenda se resynchro tout seul (cache > 2 min).");

// ---------- S12 : toast ⚡ de la synchro auto ----------
rep('    return verifyKills(sync.killQueue).then(function (nK) { // v16 : PREUVE de suppression chez Google avant tout retrait\n      if (!silent) {',
'    return verifyKills(sync.killQueue).then(function (nK) { // v16 : PREUVE de suppression chez Google avant tout retrait\n' +
'      if (silent && (nImp > 0 || (sync && sync.nUpd > 0) || nK > 0)) { // v17 : la synchro AUTO ne reste silencieuse que si elle n\'a rien changé\n' +
'        var bits17 = [];\n' +
'        if (nImp > 0) bits17.push(nImp + " tâche(s) importée(s)");\n' +
'        if (sync && sync.nUpd > 0) bits17.push(sync.nUpd + " mise(s) à jour");\n' +
'        if (nK > 0) bits17.push(nK + " tâche(s) retirée(s)");\n' +
'        showToast("⚡ Agenda synchronisé automatiquement — " + bits17.join(" · "));\n' +
'      }\n' +
'      if (!silent) {');

// ---------- S13 : parseEvents desc + rem ----------
rep('      loc: (typeof it.location === "string") ? it.location : ""\n    };',
'      loc: (typeof it.location === "string") ? it.location : "",\n' +
'      desc: (typeof it.description === "string") ? it.description : "",\n' +
'      rem: evRem17(it.reminders) // v17 : relances Google lues au pull ("default", "none", minutes de la 1ʳᵉ popup, "" = inconnu)\n' +
'    };');

// ---------- S14 : importEventAsTask garde la relance ----------
rep('    until: ev.until,\n    gEventId: ev.id,\n    autoImport: true\n  });',
'    until: ev.until,\n    gEventId: ev.id,\n    autoImport: true,\n    rem: cleanRem17(ev.rem || "") // v17 : la relance de l\'événement suit la tâche importée\n  });');

// ---------- S15 : pull importées — note 2 sens + relance ----------
rep('      var newNote = buildEvNote(ev);\n      if (newNote !== (t.note || "")) { t.note = newNote; changed = true; }',
'      var newNote = buildEvNote(ev); // v17 : la description Google (signature de l\'app retirée) s\'ajoute sous l\'horaire/lieu — la note est synchro dans les 2 sens\n' +
'      var d17i = stripEvSignature17(ev.desc);\n' +
'      if (d17i && d17i !== newNote) newNote = (newNote ? newNote + "\\n" : "") + d17i;\n' +
'      if (newNote !== (t.note || "")) { t.note = newNote; changed = true; }\n' +
'      var r17i = cleanRem17(ev.rem || "");\n' +
'      if (r17i !== cleanRem17(t.rem || "")) { t.rem = r17i || null; changed = true; } // v17 : la relance suit la tâche importée (2 sens)');

// ---------- S16 : pull liées — note + relance ----------
rep('    if (!ev.allDay) {\n      var ls14 = validHM(ev.startT), le14 = validHM(ev.endT);\n      if (ls14 !== t.startT) { t.startT = ls14; changed = true; }\n      if (le14 !== t.endT) { t.endT = le14; changed = true; }\n    } else if (t.startT || t.endT) { t.startT = null; t.endT = null; changed = true; }\n    if (changed) nUpd++;',
'    if (!ev.allDay) {\n      var ls14 = validHM(ev.startT), le14 = validHM(ev.endT);\n      if (ls14 !== t.startT) { t.startT = ls14; changed = true; }\n      if (le14 !== t.endT) { t.endT = le14; changed = true; }\n    } else if (t.startT || t.endT) { t.startT = null; t.endT = null; changed = true; }\n' +
'    var nN17 = stripEvSignature17(ev.desc); // v17 : la note de la liée suit la description Google (l\'app remet sa signature au prochain push)\n' +
'    if (nN17 !== (t.note || "")) { t.note = nN17; changed = true; }\n' +
'    var rL17 = cleanRem17(ev.rem || "");\n' +
'    if (rL17 !== cleanRem17(t.rem || "")) { t.rem = rL17 || null; changed = true; } // v17 : la relance suit la tâche liée (2 sens)\n' +
'    if (changed) nUpd++;');

// ---------- S17 : taskEventBody pousse la relance ----------
rep('  var rule = repToRule(t.rep);\n  if (rule) ev.recurrence = [rule];\n  return ev;',
'  var rule = repToRule(t.rep);\n  if (rule) ev.recurrence = [rule];\n' +
'  if (t.rem === "default") ev.reminders = { useDefault: true }; // v17 : relance pilotée depuis la tâche — popup par l\'app Google Calendar (bornes Google vérifiées : 0 à 40 320 min, 5 max)\n' +
'  else if (t.rem === "none") ev.reminders = { useDefault: false, overrides: [] };\n' +
'  else if (t.rem && /^\\d+$/.test(t.rem)) ev.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: parseInt(t.rem, 10) }] };\n' +
'  return ev;');

// ---------- S18/S19 : addTask + editTask portent rem ----------
rep('    rep: cleanRep(extra.rep, due),\n    gEventId:', '    rep: cleanRep(extra.rep, due),\n    rem: cleanRem17(extra.rem), // v17 : relance agenda\n    gEventId:');
rep('  t.rep = cleanRep(extra.rep, t.due); // v13 : le jour d\'origine mensuel suit l\'édition', '  t.rep = cleanRep(extra.rep, t.due); // v13 : le jour d\'origine mensuel suit l\'édition\n  t.rem = cleanRem17(extra.rem); // v17 : la relance suit l\'édition (push au prochain « Enregistrer (+ 📅) »)');

// ---------- S20 : le clone garde la relance ----------
rep('    startT: t.startT, endT: t.endT, until: null, rep: nrep, repChild: true,\n    gEventId: null,',
    '    startT: t.startT, endT: t.endT, until: null, rep: nrep, repChild: true, rem: t.rem, // v17 : le clone garde la relance\n    gEventId: null,');

// ---------- S21 : normalizeTaskIn roundtrip ----------
rep('    rep: cleanRep(t.rep, t.due),\n    gEventId:', '    rep: cleanRep(t.rep, t.due),\n    rem: cleanRem17(t.rem), // v17 : relance agenda — roundtrip export/import/fusion Drive\n    gEventId:');

// ---------- S22 : carte tâche : 🔔 visible ----------
rep('  else if (t.gSync === "ok") meta.push("📅 agenda ✓");',
    '  else if (t.gSync === "ok") meta.push("📅 agenda ✓");\n  if (t.rem && t.rem !== "none") meta.push("🔔 " + remLabel17(t.rem)); // v17 : relance agenda visible sur la carte');

// ---------- S23 : modale tâche — select relance ----------
rep('    <div class="cat-row type-row" id="mTypes" style="grid-template-columns:1fr 1fr"></div>',
'    <div class="cat-row type-row" id="mTypes" style="grid-template-columns:1fr 1fr"></div>\n' +
'    <div class="flabel">🔔 Relance — notification via l\'app Google Calendar (vide = ne rien changer ; sur une journée entière, Google compte avant minuit du jour J)</div>\n' +
'    <select id="mRem">\n' +
'      <option value="">— Ne rien changer —</option>\n' +
'      <option value="default">Par défaut de l\'agenda</option>\n' +
'      <option value="none">Aucune notification</option>\n' +
'      <option value="10">10 min avant</option>\n' +
'      <option value="30">30 min avant</option>\n' +
'      <option value="60">1 h avant</option>\n' +
'      <option value="120">2 h avant</option>\n' +
'      <option value="1440">24 h avant (la veille)</option>\n' +
'      <option value="2880">2 jours avant</option>\n' +
'    </select>');

// ---------- S24 : modale événement — select relance ----------
rep('    <input type="text" id="eLoc" placeholder="Lieu (optionnel — copié dans la note de la tâche liée)">',
'    <div class="flabel">🔔 Relance — remplace les notifications de cet événement (vide = inchangées)</div>\n' +
'    <select id="eRem">\n' +
'      <option value="">— Ne rien changer —</option>\n' +
'      <option value="default">Par défaut de l\'agenda</option>\n' +
'      <option value="none">Aucune notification</option>\n' +
'      <option value="10">10 min avant</option>\n' +
'      <option value="30">30 min avant</option>\n' +
'      <option value="60">1 h avant</option>\n' +
'      <option value="120">2 h avant</option>\n' +
'      <option value="1440">24 h avant (la veille)</option>\n' +
'      <option value="2880">2 jours avant</option>\n' +
'    </select>\n' +
'    <input type="text" id="eLoc" placeholder="Lieu (optionnel — copié dans la note de la tâche liée)">');

// ---------- S25 : openModal pré-remplit mRem ----------
rep('  pickType(t ? (t.type === "pro" ? "pro" : "perso") : "perso");',
'  pickType(t ? (t.type === "pro" ? "pro" : "perso") : "perso");\n' +
'  var mr17 = document.getElementById("mRem"); // v17 : relance de la tâche, pré-remplie (valeur absente du select = vide ; le pull la restaure)\n' +
'  if (mr17) mr17.value = cleanRem17(t ? (t.rem || "") : "") || "";');

// ---------- S26 : saveModal porte rem ----------
rep('  var extra = { startT: startT, endT: endT, until: until, rep: rep };',
    '  var extra = { startT: startT, endT: endT, until: until, rep: rep, rem: ((document.getElementById("mRem") || {}).value || "") }; // v17 : la relance part avec le reste');

// ---------- S27 : saveModal — importée : PATCH couleur ET/OU relance ----------
rep('  var oldType164 = t0 ? t0.type : null; // v16.4 : pour détecter un changement de type sur une tâche importée',
    '  var oldType164 = t0 ? t0.type : null; // v16.4 : pour détecter un changement de type sur une tâche importée\n  var oldRem17 = t0 ? cleanRem17(t0.rem || "") : ""; // v17 : idem pour la relance');
rep('  if (autoSync !== false && t && t.autoImport && t.gEventId && oldType164 && oldType164 !== t.type) syncTaskColor164(t.id); // v16.4 : importée passée pro↔perso → la couleur part vers Google en PATCH seul',
    '  if (autoSync !== false && t && t.autoImport && t.gEventId && ((oldType164 && oldType164 !== t.type) || (oldRem17 !== cleanRem17(t.rem || "")))) syncTaskColor164(t.id); // v16.4/17 : importée dont le type OU la relance a changé → PATCH couleur et/ou relances SEULES (jamais de PUT sur un événement qui n\'est pas à nous)');

// ---------- S28 : syncTaskColor164 — relances dans le PATCH + toast ----------
rep('  var body = { colorId: (t.type === "pro") ? "11" : "9" };\n  var ev = findEvent(t.gEventId);',
'  var body = { colorId: (t.type === "pro") ? "11" : "9" };\n' +
'  if (t.rem === "default") body.reminders = { useDefault: true }; // v17 : la relance d\'une importée part dans le MÊME PATCH (ni description ni invités : l\'événement n\'est pas à nous)\n' +
'  else if (t.rem === "none") body.reminders = { useDefault: false, overrides: [] };\n' +
'  else if (t.rem && /^\\d+$/.test(t.rem)) body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: parseInt(t.rem, 10) }] };\n' +
'  var ev = findEvent(t.gEventId);');
rep('if (ev) { ev.color = (t.type === "pro") ? "11" : "9"; ev.title = body.summary; } // le cache local suit tout de suite',
    'if (ev) { ev.color = (t.type === "pro") ? "11" : "9"; ev.title = body.summary; ev.rem = cleanRem17(t.rem || ""); } // le cache local suit tout de suite');
rep('showToast("🏷️ Type envoyé à l\'agenda — l\'événement est " + (t.type === "pro" ? "🔴 pro" : "🔵 perso"));',
    'showToast("🏷️ Type envoyé à l\'agenda — l\'événement est " + (t.type === "pro" ? "🔴 pro" : "🔵 perso") + (body.reminders ? " · 🔔 relance : " + ((t.rem === "none") ? "aucune" : (t.rem === "default") ? "défaut agenda" : (remLabel17(t.rem) || "personnalisée")) : ""));');
rep('    return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(t.gEventId), {\n      method: "PATCH",',
    '    return fetchTO17("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(t.gEventId), {\n      method: "PATCH",');

// ---------- S29 : openEvModal pré-remplit eRem ----------
rep('  renderEvTypes164(ev.color === "11" ? "pro" : "perso"); // v16.4 : le type de la modale suit la couleur Google — modifiable (PATCH colorId)',
'  renderEvTypes164(ev.color === "11" ? "pro" : "perso"); // v16.4 : le type de la modale suit la couleur Google — modifiable (PATCH colorId)\n' +
'  var er17 = document.getElementById("eRem"); // v17 : relance de l\'événement, pré-remplie — le PATCH ne l\'envoie QUE si tu choisis\n' +
'  if (er17) er17.value = cleanRem17(ev.rem || "") || "";');

// ---------- S30 : agendaSaveEvent — relance dans le PATCH + cache ----------
rep('  var body = {\n    summary: (newType164 === "pro" ? "🔴 " : "🔵 ") + stripEvTitle(title),\n    location: loc || "",\n    colorId: (newType164 === "pro") ? "11" : "9"\n  };',
'  var remE17 = ((document.getElementById("eRem") || {}).value || ""); // v17 : relance — vide = les notifications Google restent telles quelles\n' +
'  var body = {\n    summary: (newType164 === "pro" ? "🔴 " : "🔵 ") + stripEvTitle(title),\n    location: loc || "",\n    colorId: (newType164 === "pro") ? "11" : "9"\n  };\n' +
'  if (remE17 === "default") body.reminders = { useDefault: true };\n' +
'  else if (remE17 === "none") body.reminders = { useDefault: false, overrides: [] };\n' +
'  else if (/^\\d+$/.test(remE17)) body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: parseInt(remE17, 10) }] };');
rep('    ev.loc = loc;',
    '    ev.loc = loc;\n    ev.rem = cleanRem17(remE17); // v17 : le cache local suit la relance choisie');
rep('    return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(idBefore), {\n      method: "PATCH",',
    '    return fetchTO17("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(idBefore), {\n      method: "PATCH",');

fs.writeFileSync('/home/user/taches-relances-v17.html', src, 'utf8');
console.log('OK : v17 appliquee (' + Buffer.byteLength(src) + ' octets)');

// ---------- Contrôles ----------
var m = src.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('SCRIPT INTROUVABLE'); process.exit(1); }
new (require('vm').Script)(m[1]);
console.log('OK : syntaxe validee');
var idx = src.indexOf('’');
if (idx >= 0) { console.error('ECHEC : apostrophe typographique U+2019 position ' + idx); process.exit(1); }
console.log('OK : 0 apostrophe typographique');
