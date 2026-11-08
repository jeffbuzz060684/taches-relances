# CHANGELOG — Tâches & Relances

## v19.1 (2026-11-08) — « Listes »
- **⭐ Épinglage + ⇅ ordre manuel des listes** : une liste importante se colle en haut de l'onglet d'un tap (⭐/📌), et le mode ⇅ réordonne les listes racines à la main. `pinned` et `order` sont suivis par `normalizeListIn` → la fusion Drive multi-appareils les conserve ; les deux listes touchées bumpent leur `updatedAt`.
- **🔗 Date de l'événement lié sur la carte** : une liste liée à un événement agenda affiche sa date (jj/mm/aaaa) directement dans l'onglet, plus besoin de l'ouvrir.
- **Filtres Tout / ⏳ En cours / 📋 Modèles / ✅ Finies** avec compteurs : une liste est « finie » quand 100 % de ses éléments sont cochés, sous-listes incluses (agrégat récursif).
- **🧮 Récap des quantités restantes** dans le détail d'une liste : « Reste N élément(s) · quantité totale Q » (somme des quantités non cochées).
- **🧮 Vue « Ce qui manque »** : toutes les listes confondues, seuls les éléments NON cochés, groupés par famille (racine + sous-listes), cochables en un tap, et **imprimables** (feuille de courses prête à partir) — les codes 🔐 y sont toujours masqués ••••••, jamais en clair ni à l'impression.
- **➡️ Déplacer un élément vers une autre liste** : dans la modale élément, un sélecteur propose toutes les autres listes ; texte, quantité et code 🔐 sont préservés, `updatedAt` bumpé sur les DEUX listes pour la fusion Drive.
- Harnais **325 tests, 0 échec** (255 v19 + 70 v19.1). Format de données inchangé (`version 19 ≥ 16`, pas de rotation Drive).

## v19 (2026-11-08) — « Haut de gamme »
- **🗓️ Vue Calendrier intégrée** : grille du mois (tâches + événements agenda superposés, pastilles 🔴 pro / 🔵 perso / 🟢 événement), navigation ◀ ▶ + retour Aujourd'hui, bandeau des retards. Taper un jour ouvre la feuille du jour : tâches (✓ faite, ⬅️ reporter, ✏️ modifier), événements (＋ tâche, ✏️ modifier dans Google), et « ➕ Tâche ce jour » qui pré-remplit la saisie rapide avec la date choisie. Les tâches et événements multi-jours apparaissent sur toute leur plage.
- **📊 Statistiques** : 6 compteurs (faites cette semaine avec tendance ▲▼ vs la semaine dernière, ce mois-ci, en cours, en retard, total, éléments de listes) + graphique SVG des 10 dernières semaines, zéro dépendance externe.
- **🖨️ Impression / PDF d'une liste** (bouton dans le détail de liste) : cases ☐/☑, quantités, sous-listes incluses — **les codes 🔐 ne sont JAMAIS imprimés** (masqués ••••••).
- **Recherche étendue** : en plus des tâches et notes, la recherche touche les listes (nom + éléments) et les événements de l'agenda — résultats groupés par type.
- **Timeout 20 s sur le DELETE Drive** (fetchTO17) : le dernier fetch réseau encore sans garde-fou ne peut plus geler la rotation de la sauvegarde.
- Correctif attrapé par le harnais : les pastilles du calendrier lisaient le wrapper au lieu de l'objet (pro/perso inversés).
- Harnais **255 tests, 0 échec** (179 v18 + 76 v19). Format de données inchangé (`version 19 ≥ 16`, pas de rotation Drive).

## v18 / v18.1→v18.8 (2026-10-25) — Photo → liste (OCR)
- **Photo → nouvelle liste** : OCR sur l'appareil (Tesseract.js v5 chargé à la demande, français), lignes détectées cochables, quantités « 4x » parsées, ajout à une liste cible ou création (nom par défaut « Photo jj/mm »). v18.7 : bouton caméra retiré (Opera), unique bouton « 🖼️ Choisir une image » avec l'entrée invisible en overlay sur toute la surface. v18.8 : 3ᵉ mécanisme de mise à jour automatique INDÉPENDANT du service worker (lecture réseau de sw.js, comparaison de version, rechargement) — anti-boucle 1 rechargement/version.

## v17 (2026-10-11) — « 1, 2, 3 sans oublier toutes les synchros dans les 2 sens »
- **Relances Google Calendar pilotées depuis l'app** : select 🔔 dans la modale tâche (aucune / défaut agenda / 10 min à 2 jours avant) et dans la modale événement — popup via l'app Google Calendar, sync 2 sens avec l'événement (poussée ET tirée, export/Drive roundtrip). Les importées l'envoient en PATCH relance SEULE (jamais de description/invités touchés).
- **PATCH au lieu de PUT** au push des tâches liées : le lieu, les invités, la description et les relances réglés dans Google ne sont plus écrasés.
- **DELETE 404/410 = succès** (l'événement déjà parti ailleurs est le résultat attendu, plus de reprise inutile).
- **Timeout 20 s** (AbortController) sur TOUS les fetch agenda : plus d'app gelée par un réseau mort.
- **Synchro auto 2 min** (était 5) + toast ⚡ quand elle a changé quelque chose.
- **Note 2 sens** : la description Google suit la note de la tâche (signature de l'app retirée au pull, remise au push) ; les importées tirent la description sous l'horaire.
- CI GitHub Actions (harnais 136 tests à chaque push), README, CHANGELOG.

## v16.4 (2026-10-11) — type 🔴/🔵 des événements dans tous les sens
- Modale événement : rangée 🔴/🔵 pré-cochée selon la couleur Google, PATCH `colorId` + titre re-préfixé.
- Pull : le type suit la couleur Google aux 3 points (importées, liées, déplacé vérifié).
- Importée passée pro↔perso : PATCH couleur SEULE vers Google. Occurrences refusées avec info.
- Correctif : l'info « occurrence de série » est intégrée au toast de suppression (avant, écrasée en ~0 s).

## v16.3 (2026-10-11) — suppression immédiate
- Supprimer une tâche supprime AUSSI son événement Google immédiatement (y compris importées) ; la rangée disparaît sans attendre le rafraîchissement ; Annuler 5 s fiable même après un DELETE réussi.

## v16.2 (2026-10-11) — synchro automatique
- Rafraîchissement agenda auto pendant que l'app est ouverte (heartbeat 1 min, seuil 5 min, verrou anti-chevauchement) ; bouton 🔄 conservé en secours.

## v16.1 (2026-10-11) — revues v16
- `status "cancelled"` = suppression prouvée ; badge « plus dans l'agenda » au lieu de retrait pour les protégées ; déplacé hors fenêtre totalement suivi ; verrou Drive expirable (2 min) + retry de rotation ; doublon trace `taskId: null` corrigé ; « Aujourd'hui » trié par horaire.

## v16 (2026-10-11) — intégrité des données
- Preuve de suppression (`verifyKills`) : jamais de kill sans 404/410 relu chez Google ; `localEdit` protège du retrait ; purge des liens vivants ; verrou Drive + rotation du fichier (historique de versions avec codes 🔐 en clair supprimé définitivement) ; plus de doublons « Aujourd'hui ».

## v15 (2026-10-11) — correctifs audit v14
- Off-by-one du jour J-N (`timeMax` exclusif) ; retraits seulement sur cache frais 15 min ; confirmation au-delà de 3 retraits ; « Enregistrer sans l'agenda » = modifs protégées ; codes 🔐 expurgés de tout ce qui sort de l'appareil (réinjection aux fusions/restaurations).

## v14 (2026-10-11) — sync bidirectionnelle liées + listes↔événements
- Pull des liées (titre, date, horaires) ; événement supprimé dans Google = tâche retirée (Annuler, tombstone) ; gardes (`done`, `pushedAt`, `syncInFlight`) ; lien liste ↔ événement (`l.evId`).

## v13 (2026-10-11) — fusion multi-appareils sûre, séries
- Pull-before-push Drive ; restaurations cohérentes ; tombstones 180 j ; `repChild` (plus de 2ᵉ série Google) ; 409 = plus un faux succès ; report multi-jours décalé ; mensuel fidèle ; import auto saute les occurrences.

## v12 (2026-10-11) — moteur de fusion
- `stampUpdates`/`_shadow` (le plus récent gagne, pas le dernier écrivain) ; tombstones relues ; compteurs de fusion justes ; `autoAgenda` local ; id déterministes à l'import ; faux « plus dans l'agenda » corrigés ; occurrences sûres ; report corrigé ; collage en lot ; saisie mobile.

## v11 (2026-10-11) — onglet unique + sauvegarde simple
- Onglet 📋 unique (retards, jour, sections par date) ; la DATE classe la tâche ; carte ☁️ unifiée avec options avancées repliées.

## v10/v10.1 (2026-10-11) — écran Aujourd'hui, ergonomie, accessibilité
- Saisie rapide, Reporter, Annuler 5 s, occurrences des répétitions, pastille synchro, quantités, modèles, codes masqués, thème clair, cibles 44 px, badge d'icône. v10.1 : ＋ ré-importe un événement converti puis supprimé.

## v8 (2026-10-11) — correctifs audit, sans changer l'interface
- Anti-doublons agenda→tâches ; restauration Drive avec instantané de secours ; erreurs API ≠ agenda vide ; pagination ; fusion Drive bidirectionnelle avec tombstones ; id déterministes + 409 ; cache jeton 50 min ; codes entiers ; sous-listes récursives ; validations ids.

## v7 (2026-10-10) — listes
- Quantités, modèles, réordonnancement, copie texte, codes masqués, recherche live.

## v6 (2026-10-10) — modification des événements
- Modale ✏️ sur chaque événement (PATCH Google) ; en-têtes de jours enrichis.

## v5 (2026-10-10) — synchro retour Google → tâches
- Pull des importées (titre, date, horaires, lieu) ; suppression tâche → événement ; fenêtre agenda réglable ; sauvegarde Drive auto + fusion ; statuts par tâche ; multi-jours.

## v4 (2026-10-10) — app + agenda en un geste
- Horaires, répétitions RRULE, création/mise à jour d'événement sans doublon, import auto, sauvegarde Drive, type 🔴/🔵 (couleur 11/9).
