// Correctif v16.4 (app) : occurrence de série importée supprimée — l'info « la série reste dans l'agenda »
// est écrasée en ~0 s par le toast principal. On l'intègre au toast principal au lieu de la perdre.
const fs = require('fs');
var src = fs.readFileSync('taches-relances-v16.4.html', 'utf8');
function rep(oldStr, newStr) {
  var count = src.split(oldStr).length - 1;
  if (count !== 1) { console.error('ASSERTION ECHEC (' + count + ' occurrence(s), attendu 1) : ' + JSON.stringify(oldStr.slice(0, 90))); process.exit(1); }
  src = src.replace(oldStr, newStr);
}

// 1. Déclaration du drapeau occurrence
rep("var evDelP = null; // la promesse du DELETE Google — elle dicte ce que l'Annuler 5 s doit défaire",
    "var evDelP = null; // la promesse du DELETE Google — elle dicte ce que l'Annuler 5 s doit défaire\n    var occInfo164 = false; // v16.4 : occurrence d'une série importée — l'info « la série reste » part dans le toast principal (avant, il l'écrasait en ~0 s et personne ne la voyait)");

// 2. Branche occurrence : pas de DELETE, drapeau posé
rep("    } else if (t && t.autoImport && t.gEventId) {\n      // v16.3 : tâche importée de l'agenda → son événement part AUSSI. L'import auto ne le ressuscitera\n      // pas (la trace d'import reste) ; les occurrences de séries (« _ ») restent protégées (info affichée).\n      evDelP = agendaDeleteEvent(t.gEventId, t.title);\n    }",
    "    } else if (t && t.autoImport && t.gEventId && String(t.gEventId).indexOf(\"_\") >= 0) {\n      // v16.4 : occurrence d'une série importée — jamais de DELETE (garde v12/v16.3) ; l'info « la série\n      // reste dans l'agenda » est portée par le toast de suppression ci-dessous (avant : toast d'info\n      // écrasé en ~0 s par le toast principal, l'explication n'était jamais visible).\n      occInfo164 = true;\n    } else if (t && t.autoImport && t.gEventId) {\n      // v16.3 : tâche importée de l'agenda → son événement part AUSSI. L'import auto ne le ressuscitera\n      // pas (la trace d'import reste).\n      evDelP = agendaDeleteEvent(t.gEventId, t.title);\n    }");

// 3. Toast principal : version longue si occurrence
rep("    showToast(\"🗑️ Tâche supprimée\", { action: \"Annuler\", ttl: 5000 });",
    "    showToast(occInfo164 ? \"🗑️ Tâche supprimée — occurrence d'une série : la série reste dans l'agenda (modifie-la dans Google Agenda)\" : \"🗑️ Tâche supprimée\", { action: \"Annuler\", ttl: 5000 });");

fs.writeFileSync('taches-relances-v16.4.html', src, 'utf8');
console.log('OK : correctif occurrence applique (3 remplacements)');

// Contrôles : syntaxe du script extrait + 0 apostrophe typographique U+2019
var m = src.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('SCRIPT INTROUVABLE'); process.exit(1); }
new (require('vm').Script)(m[1]);
console.log('OK : syntaxe du script app validee');
var idx = src.indexOf('\u{2019}');
if (idx >= 0) { console.error('ECHEC : apostrophe typographique U+2019 a la position ' + idx + ' : ' + JSON.stringify(src.slice(idx - 30, idx + 30))); process.exit(1); }
console.log('OK : 0 apostrophe typographique');
