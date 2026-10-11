# Tâches & Relances 📋

PWA installable (ajout à l'écran d'accueil) de gestion de tâches et de relances, **sans serveur ni base de données** : tout vit dans le navigateur (localStorage) + Google Agenda / Google Drive du compte taffbmpm.

**➡️ App en ligne : https://jeffbuzz060684.github.io/taches-relances/**

## Fonctionnalités

- **Tâches** à échéance (le retard / le jour / la semaine classent tout seul), type 🔴 pro / 🔵 perso, horaires, notes, répétitions (y compris mensuelles fidèles au jour d'origine), report, annulation 5 s, recherche.
- **Relances réelles** : chaque tâche peut piloter la notification Google Calendar (aucune / défaut agenda / 10 min à 2 jours avant) — la popup arrive par l'app Google Calendar, sans serveur. Sync 2 sens avec l'événement.
- **Listes avec sous-listes**, quantités (« 4x pulkas »), codes masqués 🔐 (expurgés de TOUT ce qui sort de l'appareil — sauvegarde Drive, exports), modèles, partage, réordonnancement.
- **Google Agenda, synchro bidirectionnelle totale** : import auto ou manuel des événements ; toute modification (titre, date, horaires, type 🔴/🔵, note, relance, lieu) se synchronise dans les DEUX sens ; supprimer une tâche supprime son événement Google (immédiat, annulable 5 s) ; supprimer l'événement dans Google retire la tâche — jamais sans preuve (404/410/`cancelled` relus chez Google).
- **Google Drive, fusion multi-appareils** : sauvegarde auto (30 s de debounce) dans le dossier `taffbmpm`, fusion additive avec `updatedAt` et pierres tombales (une suppression sur un appareil se propage, ne ressuscite pas).
- **Hors-ligne complet** (service worker) : files de reprise pour toutes les écritures agenda, reconnexion auto, badge d'icône, thème clair/sombre.

## Architecture

Un seul fichier `index.html` (~3 500 lignes, zéro dépendance, zéro build) + `sw.js` (cache versionné par release) + `manifest.webmanifest` + icônes (générées au build GitHub Pages par `tools/gen-icons.js`).

- **Stockage** : `localStorage` (clé `taches-relances-v2`) — tasks, listes, config OAuth, tombstones. **Aucune donnée personnelle dans ce dépôt public.**
- **OAuth Google** : Client ID + Refresh Token (OAuth Playground) collés dans l'app par l'utilisateur ; jetons d'accès mis en cache 50 min ; scopes `calendar` + `drive.file`.
- **Convention couleurs** : `colorId 11` = 🔴 pro, `9` = 🔵 perso (reconnu aussi à l'import).
- **Relances** : `reminders.useDefault/overrides` de l'API Calendar, bornes Google respectées (0 à 40 320 min, 5 max).
- **Sécurités de synchro** (le cœur du projet) : jamais de suppression sans preuve ; garde-fou > 3 retraits ; cache frais 15 min exigé pour tuer ; `localEdit` (modifs « sans toucher à l'agenda ») toujours protégé du pull ; verrous anti-chevauchement ; PATCH (jamais PUT) au push des liées pour ne pas écraser lieu/invités/description réglés dans Google ; timeout 20 s sur tous les fetch.

## Configuration Google (première fois)

1. Projet Google Cloud, activer **Calendar API** + **Drive API** ; Google Auth Platform publié « En production » (refresh token permanent).
2. Client OAuth « Application Web » avec URI de redirection `https://developers.google.com/oauthplayground`.
3. OAuth Playground → 2 refresh tokens (scopes `calendar` puis `drive.file`).
4. Les coller dans l'app (cartes « 🔌 Connecter mon agenda » et « ☁️ Sauvegarde Drive ») sur chaque appareil.

## Tests et pipeline de développement

- `v17-test-harness.js` : harnais Node qui exécute le script de la page avec des stubs pilotables (`__eventsFixture`, `__evGet`, `__delete404`, `__patchFails`…) — **136 assertions**, lancé par la CI à chaque push (`.github/workflows/tests.yml`).
- Pipeline figé : vérifier chaque affirmation dans le code avant de corriger ; modifications par splices Node avec assertions d'unicité (`apply-vX.js`) ; vérification de syntaxe ; harnais vert avant tout push ; push contrôlé par dir listing (size + sha blob byte-exacts).
- Historique détaillé : `CHANGELOG.md`.

## Versions

v17 est la version courante — voir `CHANGELOG.md`. Après une mise à jour, recharger l'app **2 fois** (le service worker sert l'ancienne version au premier chargement).
