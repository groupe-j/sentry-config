# Conventions partagées — Projets Julien

Ce fichier contient les conventions de CODE à appliquer. Les procédures admin (Grafana dashboards, Doppler setup, Sentry dashboard, onboarding) sont dans `ADMIN_PROCEDURES.md` — les consulter uniquement quand l'utilisateur demande une opération admin.

## Comment ce fichier fonctionne

### Synchronisation

- Ce fichier (`CLAUDE_SHARED.md`) est **synchronisé automatiquement** depuis le repo [`dev-conventions`](https://github.com/groupe-j/dev-conventions).
- Un hook Claude Code (`SessionStart`) le re-télécharge à chaque démarrage. **Tu as toujours la dernière version.**
- **Ne pas modifier ce fichier directement dans un projet.** Si une convention doit changer, modifie la source dans `dev-conventions` et push :
  ```bash
  cd ~/projects/dev-conventions && git pull
  # modifier CLAUDE_SHARED.md
  git add CLAUDE_SHARED.md && git commit -m "fix: update conventions" && git push
  ```
  Le hook SessionStart re-télécharge ce fichier via `gh api` (repo privé, authentifié).
- Les conventions **spécifiques au projet** sont dans `CLAUDE.md` (jamais écrasé par le sync).

### Artefacts gérés par `gjdc`

`gjdc setup` installe/maintient — et `gjdc check` vérifie — plusieurs fichiers, pas seulement `CLAUDE_SHARED.md` :

| Fichier | Rôle | Géré par |
|---|---|---|
| `CLAUDE_SHARED.md` | Conventions de code partagées (ce fichier) | re-téléchargé par le hook SessionStart |
| `CLAUDE.md` (header) | Marqueur + pointeur vers les conventions ; corps local jamais écrasé | `setup` insère le header, `check` vérifie le marqueur |
| **`AGENTS.md`** | Équivalent agent-agnostique (Codex/autres) ; contient un **bloc workflow géré** (mapping repo ↔ Linear/CI, régénéré) entre marqueurs | `setup` crée/sync le bloc, `check` vérifie présence du fichier **et** du bloc |
| Hook `SessionStart` | Re-télécharge `CLAUDE_SHARED.md` à chaque session | `setup` (sauf `--skip-hook`) |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI adaptative + Dependabot avec auth `@groupe-j/*` | `setup` distribue, `check` vérifie présence |

> Le **bloc workflow** d'`AGENTS.md` est généré (entre marqueurs) — comme les sections `AUTO-*` ici, ne pas l'éditer à la main ; re-lancer `gjdc setup`.

### Onboarding — Après injection dans un nouveau projet

Quand ce fichier apparaît pour la première fois dans un projet :

1. **Lis `CLAUDE.md`** du projet pour comprendre le contexte spécifique
2. **Applique les conventions ci-dessous** à tout le code que tu écris
3. **Vérifie la conformité** du projet avec ces conventions (stack, structure, patterns)
4. **Signale les écarts** si le projet ne respecte pas une convention — ne corrige pas sans demander

### Priorité des instructions

1. **Instructions directes de l'utilisateur** — priorité maximale
2. **`CLAUDE.md` du projet** — conventions locales spécifiques
3. **`CLAUDE_SHARED.md` (ce fichier)** — conventions globales partagées
4. **Comportement par défaut de Claude Code**

En cas de conflit entre `CLAUDE.md` et `CLAUDE_SHARED.md`, le `CLAUDE.md` local gagne toujours.

---

## Workflow Linear / GitHub / Sentry

### Roles
- **Linear** : taches, decisions, priorites, criteres d'acceptation, documentation projet.
- **GitHub** : branches, commits, pull requests, reviews, CI.
- **Sentry** : erreurs observees en production (via `@groupe-j/sentry-config`).

### Conventions de branches et commits
- Format de branche : `username/gro-XXX-titre-en-slug` (ex: `julien/gro-244-linear-agent-workflow`)
- `Fixes GRO-XXX` dans le message de commit ferme automatiquement l'issue Linear au merge.
- `Refs GRO-XXX` dans le commit pour referencer sans fermer.

### Avant un travail significatif
1. Lire l'issue Linear liee (contexte, scope, criteres d'acceptation).
2. Commenter le plan dans l'issue Linear.
3. Rester dans le scope de l'issue — pas de travail hors-scope sans nouvelle issue.

### Apres le travail
1. Mettre a jour l'issue Linear : resume, fichiers modifies, tests lances, risques restants, lien PR.
2. Deplacer l'issue en "En revue" quand la PR est ouverte.
3. L'issue passe en "Termine" automatiquement au merge (via `Fixes GRO-XXX`).

### Flux PR (ouverture → review → merge → doc)
Sequence obligatoire des qu'une PR est ouverte — ne jamais merger une PR qui n'a pas ete reviewee.

1. **Ouvrir la PR** avec `Fixes GRO-XXX` dans la description. Passer l'issue Linear en "En revue".
2. **Lancer une review immediatement** apres l'ouverture, dans la foulee — la review est confiee a un **agent dedie** (sub-agent de review, ex. `pr-review-toolkit` / `code-reviewer`), jamais faite a la main inline. Ne pas attendre, ne pas laisser la PR sans review.
3. **Corriger les points remontes** par la review et pousser les corrections sur la meme branche. Reboucler si la review souleve de nouveaux points.
4. **Merger** une fois la review traitee et la CI verte (squash merge). ⚠️ Un agent ne merge **jamais seul en prod** — le merge final demande une validation humaine.
5. **Documenter dans Linear** une fois merge : resume final, fichiers modifies, tests lances, **points de review corriges**, risques restants, points a verifier apres deploiement. L'issue passe en "Termine" automatiquement via `Fixes GRO-XXX`.

> Deux touchpoints Linear : "En revue" a l'**ouverture** de la PR (etape 1), documentation complete **apres merge** (etape 5).

### Documentation — dans la PR qui change le comportement

Jamais en suivi, jamais en balayage ultérieur : **une campagne de rafraîchissement de la doc est la preuve que cette règle n'a pas tenu.** Deux versants, tous deux obligatoires là où ils existent — le versant **dev** (`CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, ADR) et le versant **utilisateur** (la route d'aide / de doc de l'app, quand l'app a des utilisateurs). Un seuil, une limite, un champ requis ou un message d'erreur qui change touche le versant utilisateur, y compris depuis une PR « backend uniquement ».

- **Dériver, jamais recopier.** Tout chiffre, seuil ou liste montré à un lecteur se lit depuis le code (constante exportée, schéma, config) — un chiffre recopié devient faux à la première modification et **rien ne le signale**. Ce n'est pas théorique : ce portefeuille a livré plusieurs fois de la documentation confiante et fausse.
- **Nommer le trou plutôt que le combler.** Ce qui n'existe pas encore s'écrit comme tel. Une phrase absente est sans danger ; une phrase plausible que sa source ne porte pas est crue — et fausse.
- **`gjdc check` rapporte les surfaces de documentation qu'exige le type du dépôt** (contrôle « surfaces de documentation (matrice) », sortie 1 dès qu'une surface exigée manque). C'est le mécanisme, pas une suggestion : le lancer avant d'ouvrir la PR.
- 🚨 **Rien ne mesure cette règle.** `gjdc check` constate la PRÉSENCE d'une surface, jamais sa fraîcheur ni sa véracité : un vert sur un `README.md` qui décrit une route supprimée est exactement le même vert que sur une doc juste. Elle tient donc sur la relecture humaine de la PR, et sur rien d'autre — lire un `gjdc check` vert comme « la doc est à jour » est précisément le mode d'échec qu'elle documente.

### Labels obligatoires par issue
- **1 label Type** : Bug, Fonctionnalite, Amelioration, ou Maintenance.
- **1 label Domaine** : Backend, Frontend, IA, CMS, etc.
- Labels Priorite (P0-P3) et Processus sont recommandes.

### Labels de triage agent (groupe Suivi, exclusif)
- **Pret pour agent** : l'issue peut etre traitee de facon autonome par un agent IA (scope clair, pas de decision d'architecture). La routine `sprint-worker` prend ces issues automatiquement.
- **Revue humaine** : l'issue necessite un humain + agent en tandem (decisions de trade-off, features nouvelles, refacto archi, go-live).
- **Migre** : issue migrée depuis un autre outil, pas encore triée.
- Un seul label du groupe Suivi par issue (exclusif).

### Sprints (cycles Linear)
- Duree : **10 jours ouvrés**, cross-projet (toute la team Groupe J).
- Naming : `Sprint N - Objectif court` (ex: `Sprint 1 - Stabiliser ce qui rapporte`).
- Les issues sont assignees au sprint par priorite business, pas par projet.
- En fin de sprint, les issues non terminees sont reportees au sprint suivant.

### Routines automatiques
Trois routines Claude Code tournent sur ce workspace :
- **sprint-worker** (lun-ven 9h) : traite les issues labellees "Pret pour agent" du sprint actif — clone, branche, fix, PR, mise a jour Linear. Max 3 issues/jour.
- **sentry-plan-check** (quotidien 8h) : sync erreurs Sentry → issues Linear sans doublon.
- **linear-issue-monitor** (lundi 9h) : archive les issues terminees/annulees depuis >14 jours.

### Claim avant de travailler (anti-collision agents)
Avant de commencer une issue (agent autonome OU humain+agent) :
1. **Verifier le statut Linear** en temps reel (pas depuis un cache ou dashboard) — si l'issue est deja "En cours" ou "En revue", **ne pas la prendre**.
2. **Passer l'issue a "En cours"** immediatement via l'API Linear avant de toucher au code.
3. **Ajouter un commentaire Linear** : `🤖 Agent session started — [session-id ou contexte]` pour tracer qui travaille dessus.

Si deux agents demarrent en meme temps (race condition), le premier a avoir pousse un commit sur la branche gagne. L'autre doit abandonner et passer a l'issue suivante.

Le dashboard `sprint-status.py` affiche un snapshot — il peut etre perime de quelques minutes. **Toujours re-verifier via l'API Linear avant de spawn un agent.**

### Regle d'escalation agent → humain
Si un agent est bloque sur une issue "Pret pour agent" pendant >30 min sans solution claire, il doit :
1. Relabeler l'issue en **Revue humaine**.
2. Commenter dans Linear : ce qui a ete tente, ou ca bloque, suggestion de piste.
3. Passer a l'issue suivante.

### Connecteurs vs plugins MCP — à vérifier au démarrage

**Au début de chaque session (y compris les sessions d'agent / chips), repérer les connecteurs disponibles et les utiliser en priorité.**

Beaucoup de services sont accessibles de deux façons dans Claude Code :
- **Connecteur (niveau compte)** — authentifié une seule fois, réutilisé par toutes les sessions. **À privilégier.**
- **Plugin MCP** (`mcp__plugin_<service>_*`) — possède sa propre OAuth et **redemande l'autorisation à chaque nouvelle session/worktree** (friction inutile, surtout pour les chips qui démarrent à froid).

Règle : quand un connecteur **et** un plugin existent pour le même service (Linear, Sentry, Vercel, Slack, etc.), **toujours passer par le connecteur**. Ne jamais déclencher le flow OAuth d'un plugin si un connecteur équivalent est déjà disponible. (Et jamais via Chrome/navigateur non plus — lent + cher en tokens.)

### Acces Linear (MCP / API)
Deux moyens d'acceder a Linear. **Jamais via Chrome/navigateur** (lent + cher en tokens).

1. **Connecteur MCP Linear (prefere)** — utiliser directement les outils MCP Linear (`list_issues`, `get_issue`, `save_issue`, `save_comment`, `list_cycles`, etc.) pour lire/ecrire issues, commentaires, statuts. C'est le defaut pour toute interaction manuelle ou agentique.
2. **API GraphQL (scripts / automatisation)** — endpoint `https://api.linear.app/graphql`.
   - **Cle API** : `LINEAR_API_KEY`, stockee dans **Doppler, projet `dev-conventions`, config `dev`**.
   - **Lancement** : `doppler run --project dev-conventions --config dev -- python3 scripts/<script>.py` (ne jamais hardcoder la cle ni la lire depuis un `.env` local).
   - **Auth** : header `Authorization: <LINEAR_API_KEY>` — **valeur brute, sans prefixe `Bearer`**.

### References
- Team Linear : `Groupe J` (cle: GRO)
- Voir aussi `ADMIN_PROCEDURES.md`, `docs/linear-agent-workflow.md` et la doc Linear du projet `Standards & conventions dev`.

---

## Règles fondamentales

### Context7

**Toujours utiliser Context7 via MCP pour consulter la documentation officielle avant d'utiliser une lib ou une API.** Ne jamais se fier uniquement à la mémoire ou aux connaissances de training. Cela s'applique à toutes les libs du stack.

### Best practices — Standard d'abord

**Toujours privilégier les solutions standard, natives et recommandées** avant d'écrire du custom. Cette règle s'applique à tout le stack :

- **UI** : utiliser les composants shadcn/ui tels quels avant de créer un composant custom
- **Next.js** : utiliser les API natives (metadata, next/image, next/font, sitemap.ts, Route Handlers) — pas de lib tierce si le natif couvre le besoin
- **Infra** : préférer les intégrations Vercel Marketplace / services managés plutôt que du self-hosted
- **Prisma/tRPC** : utiliser les middlewares et patterns natifs, pas de wrappers custom inutiles
- **Général** : si une lib du stack fournit une feature, l'utiliser plutôt que réinventer

Si un besoin ne peut pas être couvert par le standard, le custom est OK **à condition de justifier par un commentaire** dans le code expliquant pourquoi le standard ne convient pas.

### Règles Claude Code

- **Toujours consulter Context7** avant d'écrire du code qui utilise une lib externe
- **Toujours utiliser `AskUserQuestion`** pour poser des questions — ne jamais poser de questions en texte libre dans la conversation
- **Lancer lint + typecheck après chaque modification** : `pnpm lint && pnpm tsc --noEmit`
- **Commiter après chaque étape fonctionnelle** — commits atomiques, pas de gros commits monolithiques
- **Faire un backup (branche ou stash) avant tout refacto majeur** — ne jamais refactorer sur la branche de travail sans filet
- **Écrire un test pour chaque bug fixé** — le test doit reproduire le bug avant le fix, puis passer après
- **Ne jamais supprimer de fichier ou de bloc de code significatif sans demander** — commenter ou marquer DEBT si c'est de la dette, mais ne pas supprimer silencieusement
- **Avant d'éditer un composant partagé, tracer TOUS ses points de montage** — un composant monté dans `Footer` ET `Modal` a déjà cassé le build prod via un point de montage oublié. (GRO-35)

---

## Pièges récurrents (audit 2026-07)

> **Capstone préventif.** Le sweep portfolio du 2026-07-01 ([GRO-522 → GRO-526](https://linear.app/groupe-j/team/GRO)) a confirmé 5 classes de bugs qui reviennent d'un repo à l'autre. Elles sont codifiées ailleurs dans ce fichier (liens ci-dessous) ; ce tableau est le **checklist unique** à relire au démarrage de tout projet Next. Les lignes marquées 🤖 sont vérifiées automatiquement par `gjdc audit` (cf. [ADR-0018](./decisions/0018-preventive-capstone-recurring-bugs.md)).

| # | Anti-pattern (à bannir) | Pourquoi ça casse | Pattern requis | Détail |
|---|---|---|---|---|
| 1 🤖 | `fetchRequestHandler({...})` sans `onError` | Les throws des resolvers sont sérialisés en 500 **sans** déclencher `onRequestError` → Sentry aveugle aux 500 serveur | `onError({ error }) => Sentry.captureException(error.cause ?? error)` sur les codes 5xx uniquement | [§ tRPC onError](#onerror--sentrycaptureexception-obligatoire) |
| 2 | `void asyncFn()` après la réponse HTTP | Vercel **gèle** la fonction dès la réponse renvoyée → l'effet de bord (notif Knock…) ne s'exécute jamais | `waitUntil(fn().catch((e) => Sentry.captureException(e)))` de `@vercel/functions` (ou queue durable si retries) | [§ Pas de fire-and-forget](#pas-de-fire-and-forget-serverless) |
| 3 🤖 | Next 16 + Turbopack + `@sentry/node` sans `serverExternalPackages` | Turbopack bundle les modules Node-only → `Module not found: @opentelemetry/instrumentation` au build (ce n'est **pas** une dép manquante) | `next.config`: `serverExternalPackages: ['@sentry/node','@sentry/profiling-node']` | [§ Bundles workflow / edge](#bundles-workflow--edge--pas-de-modules-node) |
| 4 | `` `Bearer ${process.env.X}` `` comparé sans garde | Secret absent → `"Bearer undefined"` matche le header → **endpoint ouvert** (fail-open) | `if (!secret) return false` en premier (fail-**closed**) + `crypto.timingSafeEqual` + test « secret absent » | [§ Garde auth fail-closed](#garde-auth--webhook--cron--fail-closed) |
| 5 🤖 | Reset global CSS hors `@layer` (Tailwind v4) | Le CSS non-layered a la **priorité absolue** sur les utilitaires `@layer utilities` → `mx-auto`/`px-*` écrasés, CTA blanc-sur-blanc | Tout reset (`*{}`, `html`/`body`, resets d'éléments) **dans** `@layer base { … }` | [§ Tailwind](#tailwind) |
| 6 | *(Sanity)* Lecture anonyme d'un projet `privateDataset` **ou** route détail tokenisée en static/ISR | Les projets Sanity récents **refusent l'anonyme** (fetch → 0 doc, même dataset « public ») ; et une lecture **tokenisée est `no-store`** → `generateStaticParams` la pré-rend → `DYNAMIC_SERVER_USAGE` | Read-only viewer token → `SANITY_API_READ_TOKEN` (lu par `@groupe-j/blog`) **+** route détail `export const dynamic = "force-dynamic"` (sans `generateStaticParams`) | [§ Nouveau projet Sanity privateDataset](#nouveau-projet-sanity-privatedataset--token-de-lecture--force-dynamic) |
| 7 | « GlobalErrorHandler » maison qui écoute `window.onerror` / `unhandledrejection` et rappelle `captureException` | Le SDK capte **déjà** ces events (avec `denyUrls`) → **doublon** ; et le doublon a **perdu les frames d'origine** (URL d'extension/CDN tiers) → `denyUrls` ne le filtre plus → bruit d'extension en prod | Laisser le SDK gérer `error`/`unhandledrejection` ; capture manuelle réservée aux surfaces sans couverture SDK (error boundary, tRPC, réseau). Init via `@groupe-j/sentry-config` | [§ Ne pas re-capturer window.onerror](#ne-pas-re-capturer-windowonerror-doublon--défait-denyurls) |
| 8 | `Promise.race([fetch(url), timeout(ms)])` comme timeout sur une API tierce | La requête perdante **n'est jamais annulée** (socket ouverte, fonction facturée) et sa continuation (cache last-good, `captureException`) est tuée dès la réponse envoyée → panne amont **invisible** | `AbortSignal.timeout(ms)` propagé au `fetch` (+ User-Agent explicite, retry 5xx/429, cache) | [§ Résilience des API tierces](#résilience-des-api-tierces) |
| 9 | Une erreur → `captureException` **+** log **+** `captureMessage(stack)` | 1 incident = plusieurs issues Sentry (compteurs faux, triage impossible) ; et `logger.error(msg, { error })` sérialise l'`Error` en `[object Object]` → **cause perdue** | **UNE** `captureException(error, { tags, extra })` par incident ; l'`Error` n'est jamais sérialisée dans une string/objet | [§ Une erreur = UNE capture](#une-erreur--une-capture) |
| 10 | Pipeline qui déploie le code sans appliquer le schéma Prisma | La DB prd peut **n'avoir aucune table** sans que personne ne le sache → 500 sur tout le métier, en silence | `prisma migrate deploy` **dans le pipeline** ; vérifier une fois par app que les tables prd matchent `schema.prisma` | [§ Drift DB prod](#drift-db-prod--le-schéma-doit-être-appliqué-au-déploiement) |
| 11 | *(Knock)* URL de channel sans schéma / sur un domaine non canonique | **Knock ne suit pas les redirections** : un `www → apex` en 308 → **tout le canal part dans le vide, en silence** (241 notifs perdues en 4 mois) | Schéma explicite + domaine canonique (`curl -I` pour trancher), puis relire l'URL via la Management API ; diag via `delivery_logs` | [§ Notifications — Knock](#notifications--knock) |

- **2 & 4 ne sont pas détectables statiquement de façon fiable** (waitUntil vs void selon le flux, garde d'auth polymorphe) → conventions de **review** uniquement, pas de check `gjdc audit`.
- **6 ajoutée le 2026-07-02** (hors sweep GRO-522→526) : scope **Sanity uniquement**, appris en migrant un consommateur du stack blog vers un projet `privateDataset` neuf.
- **7 ajoutée le 2026-07-06** (hors sweep GRO-522→526) : convention de **review** (pas de check `gjdc audit` — un handler custom est polymorphe), appris via ARCHICOLLAB-T3-1Q (bruit d'extension navigateur fuité par un GlobalErrorHandler maison).
- **8 → 11 ajoutées le 2026-07-14** (hors sweep) : quatre pannes **silencieuses** vécues le même jour — chacune tournait depuis des semaines ou des mois sans alerte. Conventions de **review** (aucune n'est détectable statiquement de façon fiable). Point commun à retenir : *un chemin qui échoue sans bruit n'est pas un chemin qui marche* — le seul contrôle valable est de **vérifier l'effet réel** (la notif est-elle arrivée ? la table existe-t-elle ? l'issue Sentry est-elle unique et lisible ?).

---

## Stack technique

- **Framework** : Next.js (App Router)
- **Langage** : TypeScript (strict mode)
- **Monorepo** : Turborepo (un repo GitHub par produit, organisé en monorepo avec packages internes)
- **API** : tRPC
- **ORM** : Prisma
- **DB** : Neon (PostgreSQL, branching par environnement)
- **Auth** : Better Auth + CASL (autorisations)
- **Env validation** : t3-env (Zod, validation au build)
- **i18n** : next-intl
- **Paiements** : Stripe (Connect pour les marketplaces)
- **UI** : Tailwind CSS + shadcn/ui
- **Package manager** : pnpm
- **Formatting** : Prettier intégré dans ESLint (eslint-plugin-prettier)
- **Git hooks** : Husky + lint-staged (lint + format avant chaque commit)
- **Déploiement** : Vercel
- **Secrets** : Doppler (environnements : dev, staging, prd, test)
- **Error tracking** : Sentry (un projet par app)
- **Monitoring** : Grafana Cloud (compte unique, toutes apps)
- **Analytics** : Vercel Analytics + GA4 + Meta Pixel
- **Consent** : Tarteaucitron (`tarteaucitronjs`, **auto-hébergé** — le compte Pro n'a jamais existé)
- **Email templates** : React Email (dans `@mon-app/email`)
- **Notifications app** : Amazon SES + Knock — hygiène déliverabilité & runbook anti-abus dans [`docs/ses-hygiene.md`](./docs/ses-hygiene.md)
- **Notifications alertes** : Email + Telegram (bot perso)
- **Bot / Messaging** : Telegram Bot API + Mini App
- **IA** : Vercel AI Gateway (`AI_GATEWAY_API_KEY`) — **source unique pour tous les projets**
- **AI SDK** : `@groupe-j/ai` (wrapper Gateway) — peers `ai@^6 || ^7` + `@ai-sdk/gateway@^3 || ^4`
- **Storage fichiers** : Vercel Blob / Uploadthing
- **Tests E2E** : Playwright
- **Tests unitaires** : Vitest
- **CI/CD** : GitHub Actions + Vercel
- **License** : UNLICENSED (propriétaire)

> **Pourquoi** : ce stack n'est pas un inventaire mais une suite de choix tranchés et documentés — multi-repo plutôt que monorepo unique ([ADR-0001](./decisions/0001-multi-repo-over-monorepo.md)), `gjdc` CLI plutôt que sync bash ([ADR-0008](./decisions/0008-cli-bootstrap-over-bash-sync.md)), rate-limit DB plutôt que mémoire ([ADR-0009](./decisions/0009-rate-limit-strategy.md)), BotID plutôt que captcha ([ADR-0010](./decisions/0010-auth-bot-protection-strategy.md)), AI Gateway unique plutôt qu'appels providers directs (section *IA* ci-dessous). S'écarter d'une ligne = relire l'ADR correspondant avant.

---

## Turborepo — Structure monorepo

Chaque produit/application a son propre repo GitHub, organisé en monorepo Turborepo avec ses packages internes.

### Structure standard

```
mon-app/
├── apps/
│   └── web/                # App Next.js principale
├── packages/
│   ├── ui/                 # Composants shadcn/ui partagés
│   ├── db/                 # Schema Prisma + client partagé
│   ├── config/             # ESLint, TSConfig, Prettier partagés
│   ├── email/              # Templates email partagés
│   └── monitoring/         # Config Sentry + métriques Grafana
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── CLAUDE.md
└── CLAUDE_SHARED.md
```

### Règles

- Package naming : `@mon-app/nom-du-package`
- Dépendances internes : `"workspace:*"`
- Tâches cachées par Turborepo : `build`, `lint`, `test` (pas `dev`)
- Chaque package exporte via `exports` dans son `package.json`

### Packages internes standard

| Package                  | Rôle                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `@mon-app/ui`            | Composants shadcn/ui + helper `cn()`                          |
| `@mon-app/db`            | Schema Prisma, client, migrations, types générés              |
| `@mon-app/config`        | Config ESLint (+ Prettier), TSConfig de base                  |
| `@mon-app/notifications` | Service Knock (workflows, types, templates Liquid versionnés) |
| `@mon-app/monitoring`    | Config Sentry, helpers métriques Grafana, health check        |

### Packages Groupe J partagés (`@groupe-j/*`)

Packages cross-portfolio publiés sur GitHub Packages (`https://npm.pkg.github.com`). Installer via `.npmrc` avec `@groupe-j:registry=https://npm.pkg.github.com`.

<!-- AUTO-PACKAGES-START -->
<!-- Régénéré automatiquement par scripts/regen-claude-shared.ts (cron daily). -->
<!-- Ne pas éditer le contenu entre les markers — modifier le script ou les README des packages. -->

| Package | Latest | Rôle |
|---|---|---|
| `@groupe-j/ai` | `0.5.0` | Shared Vercel AI Gateway wrapper for groupe-j apps |
| `@groupe-j/auth` | `0.4.0` | Shared BetterAuth wrapper for groupe-j apps |
| `@groupe-j/blog` | `0.1.7` | Headless Next.js blog rendering + SEO layer for groupe-j apps — PortableText serializers, JSON-LD builders, typed GROQ, headless UI slots + OG-image factory on @groupe-j/sanity-blog-schemas (ADR-0019 phase 2). |
| `@groupe-j/blog-generator` | `0.8.1` | AI auto-blog pipeline for groupe-j apps — generic topic→body→PortableText→publish workflow + rich-block markdown converter, built on @groupe-j/sanity-blog-schemas + @groupe-j/ai (ADR-0019 phase 3) |
| `@groupe-j/botid` | `0.3.0` | Vercel BotID wrapper for groupe-j apps. BetterAuth-friendly hook + portfolio defaults. |
| `@groupe-j/calculette-surface` | `0.3.0` | Calculette de surfaces réglementaires partagée (moteur + UI) pour les apps groupe-j |
| `@groupe-j/dev-conventions` | `0.6.0` | Conventions de développement partagées entre tous mes projets Next.js/T3/Turborepo |
| `@groupe-j/env` | `0.3.0` | Shared Zod env schemas for groupe-j apps |
| `@groupe-j/eslint-config` | `0.2.1` | Shared ESLint flat config for groupe-j apps |
| `@groupe-j/logger` | `0.1.1` | Structured logger for groupe-j apps with auto Sentry breadcrumbs |
| `@groupe-j/notifications` | `0.4.0` | Shared Knock wrapper for groupe-j apps (transactional notifications) |
| `@groupe-j/sanity-blog-schemas` | `0.2.1` | Canonical blogPost Sanity v5 schema + rich PortableText blocks + i18n plugin wiring for groupe-j apps (ADR-0019) |
| `@groupe-j/sentry-config` | `1.0.1` | Shared Sentry config + PII redaction for groupe-j apps. Extracted from ridesamui — production-grade. |
| `@groupe-j/seo` | `0.11.0` | Shared schema.org JSON-LD builders for groupe-j apps — framework-agnostic core + optional React component, zero Sanity/heavy deps |
| `@groupe-j/tsconfig` | `0.1.0` | Shared TypeScript configs for groupe-j apps |
| `@groupe-j/ui` | `0.13.0` | Shared shadcn/ui design system for groupe-j — 55 composants. Extracted from ridesamui + shadcn standards. |

<!-- AUTO-PACKAGES-END -->

**Comment consommer** :

```bash
# .npmrc à la racine de l'app
# Registre par défaut EXPLICITE : sans lui, Dependabot route les packages publics
# (@types/node, etc.) vers npm.pkg.github.com (mirror gelé) → résolution cassée.
echo "registry=https://registry.npmjs.org/" >> .npmrc
echo "@groupe-j:registry=https://npm.pkg.github.com" >> .npmrc
echo "//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}" >> .npmrc

# Auth : doit avoir scope read:packages sur l'org groupe-j
# Local : NODE_AUTH_TOKEN sourced from Doppler dev-conventions/dev NPM_TOKEN
# CI    : utiliser secrets.GITHUB_TOKEN (auto-provisionné)
# Vercel: env var NODE_AUTH_TOKEN à set dans le project settings
```

---

## Naming — Convention de nommage des services

### Règle de base

Tous les noms suivent le **kebab-case**, aligné sur le nom du repo GitHub.

| Service                       | Convention                   | Exemple                                      |
| ----------------------------- | ---------------------------- | -------------------------------------------- |
| **Repo GitHub**               | kebab-case                   | `prono-pro`                                  |
| **Neon — projet**             | kebab-case                   | `prono-pro`                                  |
| **Neon — branches**           | noms fixes                   | `main`, `staging`, `test`                    |
| **Doppler — projet**          | kebab-case                   | `prono-pro`                                  |
| **Doppler — envs**            | noms fixes                   | `dev`, `staging`, `prd`, `test`              |
| **Sentry — projet**           | kebab-case                   | `prono-pro`                                  |
| **Vercel — projet**           | kebab-case                   | `prono-pro`                                  |
| **Knock — workflows**         | kebab-case                   | `welcome-email`, `subscription-confirmation` |
| **Stripe — products**         | Nom lisible                  | `Prono Pro — Premium Monthly`                |
| **Stripe — price lookup_key** | kebab-case                   | `prono-pro-premium-monthly`                  |
| **Stripe — metadata**         | toujours `app: "nom-app"`    | `app: "prono-pro"`                           |
| **Telegram — bots**           | Libre (contrainte BotFather) | —                                            |

> **Pourquoi** : un slug unique (le nom du repo GitHub) propagé identique sur GitHub/Neon/Doppler/Sentry/Vercel rend les ressources d'un projet immédiatement corrélables — un seul mapping à mémoriser au lieu d'une convention par service.

---

## Structure de dossiers (dans `apps/web/`)

```
apps/web/src/
├── app/
│   ├── (public)/           # Routes publiques
│   ├── (auth)/             # Auth
│   ├── (app)/              # Routes authentifiées
│   ├── (admin)/            # Back office
│   └── api/
│       ├── webhooks/
│       ├── trpc/
│       ├── health/
│       └── cron/
├── server/
│   ├── routers/
│   ├── trpc.ts
│   └── root.ts
├── lib/
│   ├── stripe.ts
│   ├── telegram.ts
│   ├── email.ts
│   ├── metrics.ts
│   └── utils.ts
├── components/
│   ├── ui/
│   └── [feature]/
├── hooks/
├── types/
├── i18n/                   # Config next-intl + messages
│   ├── request.ts
│   └── messages/
│       ├── fr.json
│       └── en.json
└── styles/

scripts/
e2e/
├── fixtures/
├── helpers/
├── pages/
├── front-office/
├── back-office/
└── integrations/
```

> **Pourquoi** : une arborescence identique d'un projet à l'autre permet à un agent (ou un humain) de localiser `server/routers`, `lib/stripe.ts` ou `api/webhooks` sans explorer — la navigation cross-repo devient un réflexe, pas une recherche.

---

## Conventions de code

### Naming

- **Fichiers** : kebab-case (`user-profile.tsx`)
- **Composants React** : PascalCase (`UserProfile`)
- **Hooks** : camelCase préfixé `use` (`useSubscription`)
- **Types/Interfaces** : PascalCase, pas de préfixe `I`
- **Variables/fonctions** : camelCase
- **Constantes globales** : UPPER_SNAKE_CASE
- **Routes tRPC** : camelCase, verbe d'action (`user.getById`)
- **Variables d'env** : UPPER*SNAKE_CASE, `NEXT_PUBLIC*` uniquement si côté client
- **Migrations Prisma** : nommées par description (`add-user-subscription-fields`, `create-telegram-tables`)

### Imports

Ordre : 1) React/Next, 2) Libs externes, 3) `@mon-app/*`, 4) `@/server`, 5) `@/lib`, 6) `@/components`, 7) `@/hooks`, 8) `@/types`, 9) Relatifs. Toujours `@/` pour les imports internes, `@mon-app/` pour les packages.

### TypeScript

- **Jamais de `any`** — `unknown` + type guard si nécessaire
- `any` temporaire → `// DEBT: [code-quality] — any à typer`
- Types Prisma générés (depuis `@mon-app/db`), pas de redéfinition
- `as const` pour les littéraux

### Formatting

- Prettier intégré dans ESLint via `eslint-plugin-prettier`
- Config partagée dans `packages/config`
- Husky + lint-staged : formatting vérifié avant chaque commit

### Composants React

- Functional components uniquement
- Props typées inline si ≤ 3 props, interface séparée sinon
- Un composant par fichier
- Pas de logique métier dans les composants

---

## Variables d'environnement — t3-env

### Validation obligatoire au build

Chaque projet utilise `@t3-oss/env-nextjs` pour valider les variables d'environnement avec Zod. Le build crashe si une variable manque ou est invalide.

### Structure standard

```typescript
// src/env.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url(),
    AUTH_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    DOPPLER_ENVIRONMENT: z.enum(['dev', 'staging', 'prd', 'test']),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith('G-'),
    NEXT_PUBLIC_META_PIXEL_ID: z.string().min(1),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  },
});
```

### Validation au build (next.config.ts)

```typescript
// Next.js 15+ : import direct (TypeScript natif dans next.config.ts)
import './src/env';
```

### Règles

- **Toujours importer depuis `~/env`** ou `@/env`, jamais `process.env` directement
- Chaque nouvelle variable d'env doit être ajoutée dans `env.ts` avec sa validation Zod
- Les variables Doppler doivent correspondre au schéma t3-env
- Le build échoue si une variable manque → pas de bug runtime lié aux env vars

---

## Base de données — Prisma

### Connexion Neon (serverless)

Deux URLs obligatoires pour chaque environnement :

```dotenv
# Connexion poolée — utilisée par Prisma Client (app)
DATABASE_URL="postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Connexion directe/unpooled — utilisée par Prisma CLI (migrations)
# Nom standard fourni par l'intégration Neon-Vercel (⚠️ ce n'est PAS `DIRECT_URL`)
DATABASE_URL_UNPOOLED="postgres://user:pass@ep-xxx.region.aws.neon.tech/neondb"
```

> **Ownership — éviter le double-owner :** en prod Vercel, laisser l'**intégration Neon-Vercel** injecter `DATABASE_URL` + `DATABASE_URL_UNPOOLED` (rotation auto + une DB par branche de preview). **Ne pas les dupliquer dans Doppler** — deux propriétaires du même secret déclenchent l'erreur de sync `cannot change type of a sensitive variable`. Doppler ne porte que les secrets applicatifs **sans provider natif** (`AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, etc.).

### Singleton PrismaClient

Évite les fuites de connexions en dev (hot reload) et en serverless :

```typescript
// packages/db/src/client.ts
import { PrismaClient } from '../generated/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Soft delete

**Soft delete par défaut.** Toutes les entités principales ont un champ `deletedAt` :

```prisma
model User {
  id        String    @id @default(cuid())
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime? // soft delete
}
```

- Les queries doivent toujours filtrer `where: { deletedAt: null }` (utiliser un middleware Prisma ou un helper)
- Hard delete uniquement pour les données techniques sans valeur métier (sessions, tokens, logs temporaires)
- Prévoir un job de purge pour supprimer définitivement les données soft-deleted après X jours (RGPD)

### Enums

**Enums définis dans Prisma** (enum natif PostgreSQL) :

```prisma
enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  EXPIRED
}

model Subscription {
  status SubscriptionStatus @default(ACTIVE)
}
```

- Les types sont automatiquement générés par Prisma et utilisables côté TypeScript
- Nommage des enums : PascalCase
- Nommage des valeurs : UPPER_SNAKE_CASE

### Migrations

- Nommage descriptif : `npx prisma migrate dev --name add-user-subscription-fields`
- Jamais de migration manuelle en prod — toujours via `prisma migrate deploy`
- Revue des migrations SQL générées avant de commit
- **`prisma migrate deploy` est une étape du pipeline de déploiement** — jamais un humain, jamais `db push` en prod. C'est une commande automatisée, pas une action manuelle.
- **pgvector / colonnes hors-schéma Prisma** : écrire le SQL **à la main** dans un fichier de migration (ou `prisma db execute` en raw SQL). JAMAIS `db push --accept-data-loss` (il veut DROP les colonnes qu'il ne connaît pas, ex. `embedding`).
- **Provisionner `DATABASE_URL` avant que la première route DB ne ship** — l'env DB doit être posée en amont du déploiement, pas après.
- **Pourquoi** : `db push` manuel en prod → `table does not exist` → tous les endpoints terrain en 500. (GRO-295/296/416)

### Drift DB prod — le schéma DOIT être appliqué au déploiement

> Un pipeline qui déploie du **code** sans synchroniser la **DB** est une bombe à retardement. Vécu le 2026-07-14 : une DB de production **sans aucune table métier** — le schéma n'avait jamais été appliqué, le produit ne pouvait pas fonctionner (500 à toute création d'utilisateur) et personne ne le savait (LeDossierParfait ; même famille : archicollab GRO-295).

- **Tout repo avec Prisma applique son schéma au déploiement, sans étape humaine** : `prisma migrate deploy` dans le pipeline. Pas d'historique de migrations dans le repo ? Ce n'est pas une excuse pour `db push` en prod (cf. la règle ci-dessus) — **créer l'historique** (`prisma migrate diff` → migration de baseline, `migrate resolve --applied`) avant le prochain déploiement.
- **Vérification** (à faire une fois par app, pas seulement à la création) : lister les tables de la DB prd et les comparer au `schema.prisma`. Une table manquante = incident silencieux **déjà en cours**.
- **Interventions manuelles** (quand elles sont inévitables) : SQL **additif** uniquement, **en transaction**, après un **snapshot de branche Neon** ; auditer le contenu (`SELECT count(*)`) avant tout `DROP` ; jamais `--accept-data-loss` (cf. ci-dessus).
- **Gotcha outillage** : `prisma@7` a supprimé les flags `--url` / `--schema` de `db execute` → déclarer la `datasource` dans `prisma.config.ts` puis `doppler run -- prisma db execute --file …`. À défaut, repli sur un CLI pinné : `pnpm dlx prisma@6.18.0 db execute --url "$DATABASE_URL" --file …`.

### Champs standard

Toutes les entités principales incluent :

```prisma
createdAt DateTime  @default(now())
updatedAt DateTime  @updatedAt
deletedAt DateTime? // soft delete
```

---

## i18n — next-intl

### Config

- Fichiers de messages dans `src/i18n/messages/` : `fr.json`, `en.json`
- Français comme langue par défaut
- Clés de traduction en dot notation : `auth.login.title`, `billing.plan.premium`

### Règles

- Jamais de texte en dur dans les composants — toujours `useTranslations()`
- Les clés de traduction suivent la structure des routes/features
- Les messages d'erreur et de succès sont aussi traduits
- Si un projet n'a pas besoin de i18n, le setup reste en place avec FR uniquement (prêt à étendre)

### Routing next-intl

```typescript
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
});
```

---

## Sanity i18n (si le projet utilise Sanity comme CMS)

Deux mécanismes selon le type de contenu :

- **Document-level** (`@sanity/document-internationalization`) pour les types de contenu (pages, articles, etc.) → **un document par langue**, reliés par un document `translation.metadata`.
- **Field-level** (`sanity-plugin-internationalized-array`) pour les types globaux (réglages, équipe) → un seul document, champs `internationalizedArray*`.

### Règles `translation.metadata` (format **v5** obligatoire)

Chaque item de `translations[]` doit être :

```jsonc
{
  "_key": "fr",
  "_type": "internationalizedArrayReferenceValue",
  "language": "fr",                              // ⚠️ v5 : langue ICI (pas seulement _key)
  "value": { "_type": "reference", "_ref": "<doc-publié>" }   // ref FORTE, cible PUBLIÉE
}
```

- **`language`** est requis (format v5) ; le format v4 (langue seulement dans `_key`) déclenche "migrate to v5".
- **Référence forte propre** vers le doc **publié** — pas de `_weak`/`_strengthenOnPublish` (sinon "Reference strength mismatch").
- La metadata relie par **id publié** : une traduction en **brouillon seul** se résout à `null`.
- **Ne jamais cliquer "Ajouter une traduction"** sur un doc seedé/importé sans metadata → crée un **doublon vide**. Créer/réparer la metadata vers les docs existants.
- **Tout créateur programmatique** (cron, seed, migration) doit émettre le format v5.
- Le **frontend requête par `language == $locale`** et ne dépend pas de la metadata (expérience éditeur uniquement).

### Studio : desk épuré + language-filter

- **Desk** : pour les types document-level, lister **une entrée par contenu** (langue par défaut FR) via une structure custom — `S.documentTypeList(type).filter('_type == $type && language == "fr"').params({ type })`. Les autres langues se rejoignent par le menu **Translations** du document. Évite d'afficher 3 docs par item.
- **Field-level** : activer le toggle "Filter Languages" via l'intégration **built-in** d'`internationalizedArray` — `languageFilter: { documentTypes: [...] }` (nécessite `@sanity/language-filter` installé). Ne pas écrire de `filterField` à la main.

### Visual Editing (si édition humaine du contenu)

- `presentationTool({ resolve, previewUrl: { previewMode: { enable: "/api/draft-mode/enable" } } })` + `defineLive` (`sanityFetch`/`SanityLive`).
- **Live en preview uniquement** : monter `<SanityLive/>` + `<VisualEditing/>` **gatés sur `draftMode().isEnabled`** → la prod reste statique/ISR.
- `stega: false` sur les fetchs de `generateMetadata` (sinon SEO cassé) ; `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` (l'iframe de preview).
- Token **Viewer** read-only séparé (`SANITY_API_READ_TOKEN`), lu via `process.env` (pas l'agrégat t3-env, sinon le package serveur fuit dans le bundle client).

**Implémentation de référence : `groupe-j/linegroup`.** Détails + recette de relink en masse : voir l'ADR `decisions/0011-sanity-i18n-translation-metadata.md`.

---

## Auth — Better Auth + CASL

### Config standard

```typescript
// packages/auth/src/auth.ts (ou src/lib/auth.ts)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';
import { prisma } from '@mon-app/db';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 }, // 5 min cache
  },
  rateLimit: {
    window: 60,
    max: 100,
    storage: 'database', // ⚠️ obligatoire en serverless (Vercel) — la mémoire ne survit pas entre invocations. Cf. ADR-0009.
  },
  emailAndPassword: { enabled: true },
  plugins: [
    organization(), // rôles par défaut : owner, admin, member
  ],
});

export type Session = typeof auth.$Infer.Session;
```

### Active organization — seed SERVEUR obligatoire (plugin `organization`)

**RÈGLE : `session.activeOrganizationId` DOIT être posé côté serveur au `session.create.before`, depuis la membership de l'utilisateur. Ne JAMAIS se reposer sur un `setActive()` client pour le définir.**

C'est la [best practice officielle Better Auth](https://better-auth.com) (plugins/organization → « Set Initial Active Organization using Database Hook »). Toute l'app traite `activeOrganizationId === null` comme « pas d'org / client » (contexte tRPC multi-tenant, détection staff, redirections). Un `setActive()` client est **non-déterministe** : selon la surface visitée et les courses de rendu, une partie des sessions reste `null` **même pour un owner d'org** (constaté en prod : ~1/4 des sessions d'un owner avaient `activeOrganizationId` null → staff vu comme client, redirections erronées).

```typescript
databaseHooks: {
  session: {
    create: {
      before: async (session) => {
        if (!session.userId) return { data: session };
        const membership = await prisma.member.findFirst({
          where: { userId: session.userId },
          orderBy: { createdAt: 'asc' },
          select: { organizationId: true },
        });
        // Pas de membership = vrai client/guest → null légitime.
        return membership
          ? { data: { ...session, activeOrganizationId: membership.organizationId } }
          : { data: session };
      },
    },
  },
},
```

- Le `setActive()` **client** reste utile uniquement pour **changer** d'org active (multi-org) — pas pour l'initialiser.
- Ne jamais dériver une identité/sémantique d'affichage (staff vs client) d'un `activeOrganizationId` supposé présent sans ce seed serveur : préférer la **présence d'une membership** si la valeur peut être `null`.

### Client auth

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
```

### Route handler

```typescript
// src/app/api/auth/[...all]/route.ts
import { auth } from '@mon-app/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

### CASL — Autorisations

CASL gère les permissions métier (qui peut faire quoi sur quoi). Intégré avec Prisma via `@casl/prisma`. Chaque projet a un package `@mon-app/permissions` dédié.

```typescript
// packages/permissions/src/abilities.ts
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma';
import { Prisma } from '@mon-app/db';
import type { Session } from '@mon-app/auth';

type AppAbility = ReturnType<typeof createPrismaAbility<[string, Prisma.ModelName]>>;

export function defineAbilityFor(session: Session): AppAbility {
  const { can, cannot, build } = new AbilityBuilder(createPrismaAbility);
  const userId = session.user.id;
  const role = session.user.role; // Nécessite un champ `role` dans le schema User ou le plugin admin de Better Auth

  // Tous les users authentifiés
  can('read', 'Post', { deletedAt: null });
  can('create', 'Post');
  can('update', 'Post', { authorId: userId });
  can('delete', 'Post', { authorId: userId });

  // Admin
  if (role === 'admin') {
    can('manage', 'all');
  }

  return build();
}
```

### Utilisation dans tRPC

```typescript
import { accessibleBy } from "@casl/prisma";

// Dans un router tRPC
getAll: protectedProcedure.query(async ({ ctx }) => {
  const ability = defineAbilityFor(ctx.session);
  return ctx.db.post.findMany({
    where: {
      AND: [accessibleBy(ability).Post, { deletedAt: null }],
    },
  });
}),
```

### Règles Auth

- **Better Auth** avec `prismaAdapter` pour persister users/sessions/organizations en DB
- **Cookie-based sessions** avec cache côté serveur (5 min)
- **Rate limiting** : `rateLimit.storage: 'database'` (jamais mémoire en serverless — cf. ADR-0009)
- **Bot protection** : `@groupe-j/botid` activé par défaut via `withBotId: true` dans `@groupe-j/auth` (cf. ADR-0010)
- CASL dans un package dédié `@mon-app/permissions`
- Défense en profondeur : proxy/middleware (auth check) + tRPC procedures (CASL check)
- Jamais de vérification de permissions côté client uniquement
- Organizations plugin si multi-tenant

### Authz — refuser au serveur, pas seulement cacher dans l'UI

Masquer un bouton/élément UI **sans** refuser la route ou la mutation côté serveur = *security theater*.

- **Une seule source de vérité CASL** partagée client/serveur (pas deux définitions qui drift), vérifiée sur **chaque** mutation.
- Renvoyer un **403 uniforme** quand l'ability refuse — l'accès URL direct doit échouer comme l'UI cachée.
- **Pourquoi** : un rôle `GUEST` read-only pouvait écrire, et l'accès URL direct fonctionnait. (GRO-54/53/286/55/200)

### Bot protection & rate-limit — pile à 4 couches

Standard portfolio (cf. [ADR-0009](./decisions/0009-rate-limit-strategy.md) + [ADR-0010](./decisions/0010-auth-bot-protection-strategy.md)). Chaque couche attrape un vecteur que les autres ratent — ne JAMAIS s'appuyer sur une seule.

| # | Couche | Outil standard | Coût |
|---|---|---|---|
| 1 | **Volumetric / DDoS** | Vercel Platform Firewall (auto, gratuit) | Inclus |
| 2 | **WAF / IP-level** | Vercel Firewall custom rules + `templates/firewall/baseline.json` | Inclus Pro |
| 3 | **Bot fingerprint** | **Vercel BotID** via `@groupe-j/botid` | Basic gratuit, Deep Analysis $1/1000 calls |
| 4 | **Auth-level** | BetterAuth `rateLimit.storage: 'database'` + lockout | Gratuit (Postgres) |

#### Couche 1 — DDoS (rien à faire)

Auto sur toutes plans Vercel, L3/L4/L7. En cas d'incident actif : `vercel firewall attack-mode enable --duration 1h --yes` (TTY-only, à lancer manuellement).

#### Couche 2 — Vercel Firewall WAF

Voir [`docs/firewall-recipes.md`](./docs/firewall-recipes.md) pour les recettes détaillées (rate_limit auth, exploit probes, geo, UA suspects).

Bootstrap d'un nouveau projet :

```bash
vercel link
gjdc firewall init       # applique templates/firewall/baseline.json en --action log
# review dans le dashboard Vercel, puis :
vercel firewall publish --yes
```

**Workflow obligatoire** : `log` → review dashboard → `preview` → `deny`/`challenge` prod. Jamais de `deny` direct sans étape log (un faux positif WAF peut bloquer la moitié de tes utilisateurs Chrome).

#### Couche 3 — Vercel BotID via `@groupe-j/botid`

**Choix standard** : BotID et pas Turnstile/reCAPTCHA/hCaptcha. Raisons dans ADR-0010 (résumé : zéro key à propager, intégré native Vercel, Kasada bat les autres sur Playwright/Puppeteer).

**Pricing (vérifié 2026-05-15)** :

| Mode | Plans | Prix | Quota gratuit |
|---|---|---|---|
| Basic | Toutes plans | Gratuit illimité | n/a |
| Deep Analysis | Pro + Enterprise | **$1 / 1000 appels** `checkBotId()` | **Aucun** |

Le master toggle dashboard `Vercel BotID Deep Analysis` est **ON par défaut sur les projets Vercel du portfolio**. Activer le toggle ne coûte rien tant que le code ne fait pas d'appel `checkBotId({ advancedOptions: { checkLevel: 'deepAnalysis' } })` — c'est juste une **permission** (= le droit de demander Deep), pas un déclencheur de facturation. La matrice ADR-0010 utilise `'basic'` (gratuit) sur sign-in / verify-email et `'deepAnalysis'` (payant) sur sign-up / forget-password / reset-password / magic-link / checkouts Stripe / endpoints AI.

**Estimation portfolio** : ~$15/mois pour les 8 apps avec auth BetterAuth aux volumes typiques. Détails dans ADR-0010.

**Opt-out app-par-app** (sites vitrines à faible trafic auth, apps non-critiques) : désactiver le master toggle dashboard + set `BOTID_DEEP_ANALYSIS=false` dans Doppler (marqueur audit).

```typescript
// next.config.ts
import { withBotId } from '@groupe-j/botid/next-config';

export default withBotId({
  // your existing next config
});
```

```typescript
// instrumentation-client.ts
import { initBotId, defaultAuthProtectRoutes } from '@groupe-j/botid/client';

initBotId({
  protect: [
    ...defaultAuthProtectRoutes, // /api/auth/sign-in, sign-up, forget-password, magic-link/*
    // routes custom de l'app :
    { path: '/api/checkout', method: 'POST' },
    { path: '/api/ai/chat', method: 'POST' },
  ],
});
```

```typescript
// dans un route handler ou server action
import { requireHuman } from '@groupe-j/botid/server';

export async function POST(req: NextRequest) {
  await requireHuman({ deepAnalysis: true }); // throws 403 si bot
  // ... business logic
}
```

**BetterAuth s'auto-intègre** via le hook custom de `@groupe-j/botid` (tant que [better-auth/better-auth#7535](https://github.com/better-auth/better-auth/issues/7535) n'est pas mergé) :

```typescript
import { betterAuth } from '@groupe-j/auth';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  withBotId: true, // injecte automatiquement le hook BotID sur sign-in/sign-up/forget/magic-link
  rateLimit: {
    window: 60,
    max: 100,
    storage: 'database',
  },
  // ...
});
```

#### Couche 4 — BetterAuth rate-limit DB

Toujours `storage: 'database'` (jamais mémoire) cf. ADR-0009. Voir snippet config dans la section *Auth — Better Auth + CASL* plus haut.

#### Couche 5 — Rate-limit applicatif par destinataire (endpoints email publics)

Standard acté dans [ADR-0014](./decisions/0014-public-email-endpoint-protection.md), suite à l'incident SES prono.pro (slow-drip). **Les couches 2 et 4 comptent par IP, la couche 3 par fingerprint — aucune ne compte par destinataire.** Un bot lent (15-20 req/jour) sur IPs rotatives passe sous tous les seuils et alimente le signup avec des centaines d'adresses, une plainte spam par adresse.

**Tout endpoint public qui envoie un email OU crée une ressource DB** (signup, magic-link, forgot-password, contact, waitlist, invitation) DOIT avoir, en plus des couches ci-dessus :

1. **BotID en `deepAnalysis`** (jamais `basic` : reverse-engineered, classe « humain » un headless Chrome — il ne stoppe que les scripts sans JS). `checkLevel` client et serveur **doivent matcher**. `checkBotId()` se place **avant tout write DB et tout envoi email**.
2. **Rate-limit applicatif par email — max ~3 envois / adresse / 24 h**, côté app. C'est la seule couche qui ferme le slow-drip multi-IP.
3. **Bonus gratuit** : champ **honeypot** caché sur les formulaires publics.

> ⚠️ **Normaliser l'adresse avant de compter** (couche 5.2) : retirer les points et le suffixe `+tag` Gmail, sinon le *dot-trick* (`g.ia.h.u.yle.ng@`) contourne le compteur. Cf. signature d'abus dans [`docs/ses-hygiene.md`](./docs/ses-hygiene.md).

> ℹ️ Pas encore de helper `@groupe-j/*` pour la couche 5.2 (BetterAuth ne compte pas par destinataire) — implémentation locale par app (compteur DB ou KV sur l'email normalisé).

#### Magic-links — jamais d'auth via GET

Le clic sur un magic-link ne doit **jamais** authentifier ni marquer `emailVerified` via un simple `GET` : les scanners d'emails corporate (Outlook **SafeLinks**, etc.) suivent **tous** les liens → comptes « vérifiés » fantômes avec sessions ouvertes. Le lien pointe vers une **page intermédiaire « Confirmer la connexion »** avec action humaine (`POST`).

#### Matrice routes × couches

| Endpoint | WAF rate_limit | BotID | BetterAuth DB | RL /email 24h | Niveau BotID |
|---|:-:|:-:|:-:|:-:|:-:|
| `POST /api/auth/sign-in` | ✅ 30/min/IP | ✅ | ✅ | ❌ (pas d'email) | Basic |
| `POST /api/auth/sign-up` | ✅ 10/min/IP | ✅ | ✅ | ✅ ~3/24h | **Deep** |
| `POST /api/auth/forget-password` | ✅ 5/min/IP | ✅ | ✅ | ✅ ~3/24h | **Deep** |
| `POST /api/auth/magic-link` | ✅ 5/min/IP | ✅ | ✅ | ✅ ~3/24h | **Deep** |
| Forms publics email (contact, waitlist, invitation) | ✅ 3-5/h/IP | ✅ | n/a | ✅ ~3/24h | **Deep** |
| Checkouts Stripe | ✅ | ✅ | n/a | ❌ | **Deep** |
| Endpoints AI (chat, completions) | ✅ par-user | ✅ | n/a | ❌ | **Deep** |
| Endpoints API authentifiés | ❌ | ❌ | ❌ | ❌ | n/a |

> La colonne **RL /email 24h** (couche 5.2, [ADR-0014](./decisions/0014-public-email-endpoint-protection.md)) est obligatoire sur tout endpoint qui *envoie* un email. « Forms publics » est passé de **Basic** à **Deep** : un formulaire qui envoie un email est un endpoint à risque email, pas un simple lead.

#### KV stores / Redis

**Pas de Redis par défaut.** Cf. ADR-0009.

**Uniquement** si besoin avéré de : queue durable (BullMQ), idempotency Stripe webhooks, AI chat history TTL, cache hot d'API tierce au quota strict. Si Redis nécessaire : **un Upstash par projet, jamais partagé** (isolation quotas/blast radius/debug). Préfixage de clés `tenant:resource:id`, jamais `app:tenant:...`.

#### Mutations publiques — anti-abus + pagination bornée

Tout endpoint de **mutation public** exige une limite anti-abus **et** BotID en `deepAnalysis` (`checkLevel: 'deepAnalysis'`, jamais Turnstile — cf. ADR-0010). Capper systématiquement la pagination : pas de `limit` illimité accepté depuis l'input (borne max côté Zod).

- **Pourquoi** : limiteur in-memory bypassable (reset à chaque invocation serverless) + pagination non bornée sur un endpoint public. (GRO-189/205/188/217)

#### À ne JAMAIS faire

- ❌ Rate-limit in-memory en serverless (compteur reset à chaque invocation Vercel)
- ❌ Un Upstash partagé pour tout le portfolio
- ❌ Une seule couche de protection auth (les 4 sont obligatoires sur les endpoints listés ci-dessus)
- ❌ Protéger un endpoint qui *envoie un email* uniquement par IP (WAF/BetterAuth) — il faut la couche 5.2 par destinataire (cf. ADR-0014, slow-drip multi-IP)
- ❌ BotID `basic` sur un endpoint qui envoie un email ou crée une ressource DB — `deepAnalysis` obligatoire (basic est reverse-engineered)
- ❌ Authentifier / marquer `emailVerified` sur le **GET** d'un magic-link (SafeLinks crée des comptes fantômes) — page de confirmation **POST**
- ❌ E2E qui déclenchent de vrais envois Knock/SES (leçon ridesamui ~200 bounces) — mock ou sandbox, cf. [`docs/ses-hygiene.md`](./docs/ses-hygiene.md)
- ❌ `vercel firewall rules add ... --action deny` direct sans passer par `log` d'abord (cf. workflow staged dans `docs/firewall-recipes.md`)
- ❌ Captcha visible (Turnstile iframe, reCAPTCHA badge, hCaptcha puzzle) — BotID est invisible par design, c'est l'argument
- ❌ Ajouter `@upstash/redis` / `ioredis` / `bullmq` sans justifier dans la PR
- ❌ Ajouter `@marsidev/react-turnstile` / `react-google-recaptcha` / `@hcaptcha/*` / `@arcjet/*` — déjà décidé contre dans ADR-0010

---

## Proxy / Middleware — Auth + i18n

### Pattern avec Better Auth (Next.js 16 = `proxy.ts`)

```typescript
// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const publicPages = ['/', '/login', '/register'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Routes API et fichiers statiques : skip
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  // Routes publiques : i18n uniquement
  const isPublic = publicPages.some((p) => new RegExp(`^(/(fr|en))?${p}$`).test(pathname));
  if (isPublic) return intlMiddleware(req);

  // Routes protégées : vérifier le cookie de session Better Auth
  const sessionCookie = req.cookies.get('better-auth.session_token');
  if (!sessionCookie) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
```

### Règles

- Next.js 16 utilise `proxy.ts` (renommé depuis `middleware.ts`)
- Le proxy combine auth (cookie Better Auth) + i18n (next-intl)
- Les routes API et fichiers statiques sont exclues via le matcher
- Vérification légère du cookie côté proxy, validation complète côté tRPC
- Si un projet n'a pas d'i18n, le proxy fait uniquement l'auth check

---

## Patterns tRPC

### Structure d'un router

```typescript
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

export const exampleRouter = createTRPCRouter({
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const item = await ctx.db.example.findUnique({
      where: { id: input.id, deletedAt: null },
    });
    if (!item) throw new TRPCError({ code: 'NOT_FOUND' });
    return item;
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.example.create({
        data: { ...input, userId: ctx.session.user.id },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Soft delete
      return ctx.db.example.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
    }),
});
```

### Règles

- Inputs validés avec Zod (même les IDs)
- `protectedProcedure` par défaut
- Vérifier ownership, pas juste l'auth
- Ne jamais retourner de données sensibles
- `TRPCError` avec bons codes
- Toujours filtrer `deletedAt: null` dans les queries
- Pas de try/catch qui avale les erreurs

### `onError` → `Sentry.captureException` (obligatoire)

`fetchRequestHandler` **sérialise les throws des resolvers en réponse 500 sans déclencher `onRequestError`** : sans un `onError` qui appelle `Sentry.captureException`, Sentry est **aveugle** à tous les 500 serveur tRPC.

```typescript
fetchRequestHandler({
  // ...
  onError({ error, path }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      Sentry.captureException(error, { tags: { trpcPath: path } });
    }
  },
});
```

- **Pourquoi** : incident prod, tous les endpoints en 500, Sentry n'a rien remonté. (GRO-296/256/263/428)

### Atomicité transactionnelle

Ne jamais committer un état terminal si une écriture downstream peut échouer : wrapper les opérations multi-écritures dans une **transaction DB** (`prisma.$transaction`) ou ajouter un **chemin de réconciliation**.

- **Pourquoi** : Stripe cancel OK mais refund KO → abonné marqué `cancelled` sans remboursement et sans recovery. (GRO-182/213/196/97)

---

## Patterns Stripe

### Webhooks — structure obligatoire

```typescript
import { headers } from 'next/headers';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      break;
    case 'customer.subscription.updated':
      break;
    case 'customer.subscription.deleted':
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response('OK', { status: 200 });
}
```

### Règles

- **Toujours vérifier la signature webhook**
- Mode test pour dev/staging/test
- Connect : `application_fee_amount` pour les commissions
- Montants en centimes
- `customer_id` stocké sur le user en DB
- Idempotence via `event.id` ou status en DB
- Metadata : toujours `app: "nom-de-l-app"`

### Idempotence — généralisée au-delà de Stripe

- **Dédupliquer toute livraison webhook par `event.id`** persisté en DB (Knock, Telegram, Stripe…), avec early-return si l'état est déjà terminal. Traiter **toute livraison webhook comme non fiable** (retries, doublons, ordre non garanti) → prévoir un chemin de réconciliation.
- Gérer le write-conflict Prisma **`P2034`** (transaction serializable) → renvoyer `CONFLICT` plutôt que de laisser remonter un 500.
- **Pourquoi** : retries Stripe sur 5xx → double-commission facturée. (GRO-177/255/197/206/211)

---

## Patterns Telegram

### Bot API

- Bot de prod ET bot de test (via @BotFather)
- Webhook sécurisé avec secret token
- Valider `X-Telegram-Bot-Api-Secret-Token`

### Mini App — Validation `initData` obligatoire côté serveur

```typescript
import crypto from 'crypto';

function validateInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return hash === expectedHash;
}
```

### Modèle single-group

- Un seul groupe par tipster/créateur
- Picks gratuits et premium coexistent
- Accès premium via permissions du groupe

---

## Résilience des API tierces

Toute API tierce est **lente et capricieuse** jusqu'à preuve du contraire — les API publiques / gouvernementales en particulier. Cas mesuré le 2026-07-14 (Géoportail de l'Urbanisme, 10 appels) : 10/10 succès mais latence **4,7 s → 17,9 s** (moy. **8,5 s**), **aucune réponse avec le User-Agent par défaut** de `node`/`undici`/`curl` (throttlé, voire refusé), 500 intermittents sous charge. Même famille : DVF, IGN, Géorisques.

**Les 4 protections sont obligatoires pour tout appel à une API tierce :**

| # | Protection | Détail |
|---|---|---|
| a | **User-Agent explicite** | `"MonApp/1.0 (+https://monapp.fr)"`. Un UA *explicite* suffit — c'est l'**UA par défaut du runtime** (`node`, `undici`, `curl`) qui est throttlé ou ignoré par certaines API gouv. |
| b | **Timeout avec abort RÉEL** | `AbortSignal.timeout(ms)` **propagé au `fetch`** (nouveau signal à chaque tentative : un signal abort est consommé). **JAMAIS un `Promise.race`** : elle ne fait qu'ignorer la promesse perdante — la requête **n'est jamais annulée** (socket ouverte, fonction facturée, rejet tardif non géré), et en serverless la continuation qui devait écrire le cache last-good / capturer dans Sentry est **tuée dès la réponse envoyée** (cf. [§ Pas de fire-and-forget](#pas-de-fire-and-forget-serverless)). |
| c | **Retry-once sur 5xx / 429 / 408** | Backoff court, `Retry-After` respecté sur 429. **Pas de retry sur les autres 4xx** (ressource périmée ≠ panne). **Fingerprint Sentry séparé 4xx / 5xx** — sinon le bruit des 404 noie les vraies pannes. |
| d | **Cache** | Dès que le mapping est quasi immuable (adresse → parcelle, code INSEE → zonage…) : élimine l'essentiel des appels répétés (~95 % mesuré sur adresse → parcelle) **et** la latence utilisateur. |

```typescript
async function fetchUpstream(url: string, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MonApp/1.0 (+https://monapp.fr)" }, // (a)
      signal: AbortSignal.timeout(8_000),                           // (b) abort réel, un par tentative
    });
    // (c) retry-once : panne amont uniquement
    if ((res.status >= 500 || res.status === 429 || res.status === 408) && attempt === 0) {
      return fetchUpstream(url, 1);
    }
    return res; // 404/4xx : pas de retry, fingerprint Sentry distinct
  } catch (error) {
    // AbortSignal.timeout THROW (TimeoutError) — il ne renvoie pas de Response
    if (attempt === 0) return fetchUpstream(url, 1);
    throw error;
  }
}
```

- **Paralléliser les fetches indépendants** (`Promise.all`) : 4 sources séquentielles × 4 s = **16 s de TTFB**.
- **Conséquence business** : une API lente devient le **TTFB de nos pages** → **le crawler Google timeout → pages non indexées**. Vécu : TTFB 14 s → 2-9 s après fix, et les pages ont enfin été crawlées (jepeuxconstruire).

---

## Gestion d'erreur

### Serveur

- `TRPCError` pour les erreurs attendues
- Erreurs inattendues → Sentry automatiquement
- Webhooks retournent 200 pour les événements traités ou ignorés ; 400 uniquement si la signature est invalide

### Client

- `error.tsx` au niveau `app/(app)/` minimum
- `not-found.tsx` personnalisé
- `loading.tsx` ou Suspense
- Mutations tRPC : `onError` → toast
- Sous ISR/Next, `notFound()` doit propager un vrai **HTTP 404** (pas un soft-404 servi en 200 — pénalité SEO). (GRO-168)

### Interdit

- ❌ `catch (e) { console.log(e) }`
- ❌ `catch (e) { return null }`
- ❌ try/catch trop large

---

## Sécurité

### Auth

- Routes protégées par middleware + vérification tRPC (défense en profondeur)
- Rôle admin vérifié côté serveur
- `AUTH_SECRET` unique par environnement
- Valider toute redirection `callbackURL` / `redirect` contre une **allowlist** (open-redirect). (GRO-212)

### Webhooks

- Toujours vérifier la signature

### Garde auth / webhook / cron — fail-closed

- Un secret manquant doit **fermer** l'accès, jamais l'ouvrir. Bannir `Bearer ${process.env.SECRET}` et l'égalité de string sur un secret possiblement `undefined`.
- Pattern : `if (!secret) return false` **en premier**, puis comparaison **timing-safe** (`crypto.timingSafeEqual`), plus un **test unitaire du cas « secret absent »**.
- **Pourquoi** : `CRON_SECRET` absent en env → `"Bearer undefined"` matchait le header `Authorization` et ouvrait l'endpoint ; même classe de bug retrouvée sur 5 repos. (GRO-391/392/393/178/180/204/221)

### Inputs

- Zod partout
- Sanitiser les entrées (XSS)

### Données sensibles

- Jamais de secret dans `NEXT_PUBLIC_*`
- Variables d'env dans Doppler uniquement
- Pas de `.env` commité

---

## Caching — Stratégie de rendu

### Matrice de décision

| Cas                                                | Stratégie          | Config                              |
| -------------------------------------------------- | ------------------ | ----------------------------------- |
| Page publique statique (landing, CGU)              | **SSG**            | `generateStaticParams()`            |
| Page publique avec données (blog, catalogue)       | **ISR**            | `export const revalidate = 60`      |
| Page authentifiée (dashboard, profil)              | **SSR**            | `cache: 'no-store'` ou pas de cache |
| Données qui changent rarement (config, catégories) | **ISR long**       | `revalidate = 3600`                 |
| Données temps réel (chat, notifications)           | **Client**         | `useQuery` tRPC avec polling/SSE    |
| Mutations (formulaires, actions)                   | **Server Actions** | `'use server'` + `revalidatePath`   |

### Règles

- Par défaut, les Server Components cachent les données (`force-cache`)
- Utiliser `revalidatePath()` ou `revalidateTag()` après une mutation pour invalider le cache
- Ne jamais cacher les données utilisateur spécifiques (panier, profil, sessions)
- ISR pour les pages publiques avec données : bon compromis performance/fraîcheur
- Tester la stratégie de cache en staging avant de passer en prod

---

## Logging structuré

### Format standard

```typescript
// Utiliser un logger structuré (pino ou winston)
logger.info('User signed up', {
  userId: user.id,
  email: user.email,
  source: 'telegram',
  app: 'prono-pro',
});

logger.error('Stripe webhook failed', {
  eventId: event.id,
  eventType: event.type,
  error: err.message,
  app: 'prono-pro',
});
```

### Règles

- Logs structurés en JSON (pas de `console.log` en prod)
- Toujours inclure : `app`, contexte métier (userId, eventId, etc.)
- Niveaux : `error` (erreurs), `warn` (situations anormales), `info` (événements métier), `debug` (dev uniquement)
- Pas de données sensibles dans les logs (pas de tokens, mots de passe, données perso complètes)
- `console.log` / `console.error` acceptés en dev uniquement — le lint doit catcher en CI
- **Signature `logger.error(message, error, context)`** : le **2e argument positionnel est l'`Error`**, pas le contexte. Passer le contexte en 2e arg produit `{"error":"[object Object]"}` et **perd la stack**. (GRO-437)

---

## Commits & Branching

### Conventional Commits

Format : `type(scope): description`

Types : `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`

### Branching

- `main` — production, **protégée** (pas de push direct)
- `feat/nom` — nouvelle fonctionnalité
- `fix/nom` — correction de bug
- `hotfix/nom` — correction urgente (depuis `main`)

### Palier `staging` — modèle unique des applications

**Les applications** suivent un modèle unique : `feat/*` → **`staging`** → release → `main`. **Les paquets et l'outillage** (`@groupe-j/*`, `dev-conventions`, `.github`, `sanity-groupe-j`) restent en **flux `main` direct** — pas de branche d'intégration (flux `main` → tag → npm).

Le modèle se **déclare**, il ne se devine pas : `config/staging-model.json` dans `dev-conventions` associe chaque repo à `promotion`, `deployment-environment` ou `none`. Un repo non déclaré qui porte déjà l'une des pièces ci-dessous est traité comme `promotion` — adopter le modèle à moitié n'est pas une dispense.

⚠️ **« Une branche `staging` existe » n'est PAS le critère.** `namecheck-v2` en a une : c'est un **miroir strict de `main`** (0/0) qu'aucune PR ne vise depuis le 2026-04-12 — cinq PR au total, toutes dans les 36 premières heures, contre soixante vers `main` depuis. Y router quoi que ce soit créerait des commits uniques que rien ne promeut, `sync-staging` refuserait alors le fast-forward **définitivement**, et le miroir dériverait en silence.

#### Deux pièces positives, une contrainte négative

Vérifié par `gjdc check`, qui **échoue** (code 1) en nommant ce qui manque — ou ce qui est en trop.

1. **La CI se déclenche sur les PR vers `staging`** — `on.pull_request.branches` doit inclure `staging`. Sans elle, la moitié du flux (`feat/*` → `staging`) fusionne **sans aucune CI** : seule la promotion finale est vérifiée, trop tard et en bloc.
2. **`sync-staging.yml` est installé** — fast-forward de `staging` vers `main` après chaque release, uniquement si `staging` n'a aucun commit unique. Sans ce chemin de retour, `main` accumule des correctifs que `staging` ignore et chaque promotion risque de les annuler.
3. ⛔ **`dependabot.yml` ne porte AUCUN `target-branch`** — y compris ici, sur les repos à branche `staging`. Ce n'est pas un oubli, c'est la contrainte. Il ne reste qu'**un seul gabarit** pour tout le portefeuille (`github/dependabot.yml`), et l'entrée npm y porte `registries: npm-github`.

##### Pourquoi cette pièce s'est INVERSÉE le 2026-08-05

Elle prescrivait exactement le contraire jusqu'à cette date. Trois mesures l'ont retournée :

- **GitHub ne calcule les alertes de sécurité que sur la branche PAR DÉFAUT.** Un correctif fusionné dans `staging` ne les éteint pas. Relevé : **211 alertes ouvertes sur des correctifs déjà livrés** — archicollab est passé de **85 à 26 à l'instant même de la promotion**, sans qu'une ligne de code change.
- **Les mises à jour de sécurité ignorent `target-branch`** ([dependabot-core#2767](https://github.com/dependabot/dependabot-core/issues/2767)) : le fichier décrivait un routage que la moitié des PR ne suivait pas. C'est ce qui imposait la seconde entrée npm, uniquement là pour rendre `registries` à la sécurité — cause supprimée, contournement supprimé, mais le **besoin** de `registries` demeure.
- **`target-branch` fait perdre `assignees`, `labels` et `commit-message`** aux PR produites.

`staging` reste la branche d'intégration **des fonctionnalités** ; les montées de dépendances visent la branche par défaut et redescendent par `sync-staging.yml`. La doc officielle ne recommande `target-branch` que quand la branche par défaut *n'est pas* la branche de développement — ce qui n'est le cas d'aucun repo du portefeuille.

#### Déclarer l'exception « environnement de déploiement »

Quand `staging` est un **environnement déployé** (Doppler et Vercel dédiés) et non un palier — toutes les PR visent `main` —, la nommer comme telle plutôt que l'aligner de force :

```jsonc
// dev-conventions/config/staging-model.json
"models": { "groupe-j/namecheck-v2": "deployment-environment" }
```

`gjdc check` n'exige alors **aucune** pièce. La PR qui ajoute l'entrée doit dire **pourquoi** : c'est une exception documentée, pas un opt-out.

#### 🪤 Changer la base des PR Dependabot : RETARGETER, jamais fermer

Modifier `target-branch` (dans un sens **comme dans l'autre**) orpheline toutes les PR Dependabot déjà ouvertes vers l'ancienne base — *mesuré le 2026-07-26 : **39 PR, 28 % de la file*** — et `@dependabot recreate` ne les rebase pas.

**Ne jamais les fermer** : fermer une PR Dependabot enregistre un `ignore` de version **IRRÉVERSIBLE**, que ni la réouverture ni `@dependabot unignore` ne défont. La parade, validée le 2026-08-05 sur **20 PR rattrapées sans perte** : `gh pr edit <n> --base main`, qui change la base sans rien enregistrer. Basculer **un repo à la fois**, en vérifiant que les PR retargetées sont vertes avant de propager.

#### 🪤 Ne jamais écraser un `dependabot.yml` existant

Éditer l'existant, pas copier le gabarit par-dessus. Les blocs `ignore` accumulent de l'état propre au repo qui n'est **pas** dans le gabarit — `LeDossierParfait` porte `sharp >=0.35.0` (GRO-857), dont la suppression silencieuse rouvrirait le bump qui casse la génération des images de couverture. `gjdc setup` ne réécrit jamais ces fichiers : il installe ce qui manque, puis **échoue** en nommant ce qu'il n'a pas pu poser.

### Règles

- **Jamais de push direct sur `main`** — toujours passer par une PR
- Commits atomiques
- Pas de "WIP" sur main
- Squash merge pour les PRs

### Git hooks (Husky + lint-staged)

À installer **par projet** : `gjdc setup` ne touche pas aux hooks (le flag `--skip-husky` n'a jamais rien piloté). Gabarit à recopier depuis `hooks/pre-push` du package `@groupe-j/dev-conventions`.

- **`pre-commit`** : lint-staged — lint uniquement les fichiers modifiés (rapide)
- **`pre-push`** : bloque tout push direct sur `main` avec message explicite

```json
// lint-staged config dans package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix"]
  }
}
```

---

## CI/CD — GitHub Actions

Le workflow CI est installé par `gjdc setup` dans `.github/workflows/ci.yml`, depuis le gabarit **[`workflows/ci.yml` de `dev-conventions`](https://github.com/groupe-j/dev-conventions/blob/main/workflows/ci.yml) — seule source de vérité** (lien absolu : ce fichier est synchronisé dans des repos qui n'ont pas ce chemin). Il est **adaptatif** : chaque step teste la présence du script (`jq -e '.scripts.x'`) et se skip sinon. Ne pas décrire ici ce que le gabarit ne fait pas : c'est cette divergence qui a produit la panne.

### Triggers

| Événement | Branches | Détail |
|-----------|----------|--------|
| **push** | `main`, `staging` | `paths-ignore` docs/assets |
| **pull_request** | `main`, `staging` | `types: [opened, synchronize, reopened, edited]` |
| **workflow_dispatch** | — | `run_e2e` pour les tests E2E |

- ⚠️ **`staging` DOIT figurer dans `pull_request.branches`** — l'une des pièces du palier (cf. « Palier `staging` »). L'omettre laisse fusionner sans aucune CI la moitié du flux (`feat/*` → `staging`). `gjdc check` échoue dessus.
- ⚠️ **`types:` REMPLACE le défaut** : réénumérer `opened/synchronize/reopened`. `edited` couvre le retargetage de base (`gh pr edit --base staging`), sinon une PR retargetée passe **sans aucune CI**.
- ⚠️ **`paths-ignore` + required status check** : une PR docs-only n'émet jamais le check → bloquée sans recours. Le retirer avant de rendre le check requis (cf. « Required checks côté ruleset »).

### Job `ci` (check « Lint & Typecheck » — nom référencé par les rulesets, ne pas renommer)

| Step | Condition |
|------|-----------|
| `pnpm install --frozen-lockfile` | avec `NPM_TOKEN` **et** `NODE_AUTH_TOKEN` en `env:` (résolution des `@groupe-j/*`) |
| **Generate** (`pnpm db:generate`) | si le script existe — en amont du DAG turbo (race `prismaNamespace.ts`) |
| **Lint** / **Typecheck** | si `lint` / `typecheck` ou `type-check` existe |
| **Build** (`pnpm build`) | si le script existe — `NODE_OPTIONS=--max-old-space-size=4096`, `SKIP_ENV_VALIDATION=true` |

- **Le build est gaté en CI**, pas seulement par la preview Vercel : lint + typecheck ne voient pas les casses de build réelles (TS5101 à l'émission des `.d.ts`, PostCSS cassé).
- **Turbo Remote Cache** : `TURBO_TOKEN` / `TURBO_TEAM` posés au niveau workflow (secret + variable d'org). Absent/invalide → warn, jamais d'échec.
- 🪤 **turbo 2.x, env strict** : une var posée dans le workflow **n'atteint pas** la tâche `build` — déclarer `passThroughEnv` (`SKIP_ENV_VALIDATION`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `NEXT_PUBLIC_*`) dans le `turbo.json` du repo, sinon le build échoue sur la validation env alors que la var est bien posée.
- **Node : `24` partout** (`actions/setup-node`), pour matcher le runtime Vercel — cf. « Config Vercel → Node.js version ».

### Job `e2e` (optionnel, manuel)

Gaté sur `workflow_dispatch` (`run_e2e == 'true'`) : pas systématique, pour économiser les minutes CI. Il pose `SENTRY_ENVIRONMENT: ci` **et** `NEXT_PUBLIC_SENTRY_ENVIRONMENT: ci` au niveau du job (cf. « Sentry → Environnement & CI/e2e »). Dès que la suite E2E devient un gate de merge (multi-app, required check), passer à la matrice per-app : « Tests E2E — Playwright → CI ».

### Interdits CI

- **Jamais `skip-build: true`** sur un workflow de déploiement/CI : aucune build Next.js jamais vérifiée avant merge est inacceptable — le build doit pouvoir casser le merge (cf. ADR-0012/0013).
- **Playwright tourne dans le container `mcr.microsoft.com/playwright`** (`container:` du job) dès que la suite E2E est un gate de merge — le download `headless-shell` fige sur les runners GitHub. (Le job `e2e` manuel du gabarit installe encore les navigateurs sur le runner : acceptable parce qu'il ne bloque aucun merge.)
- **Injecter `NPM_TOKEN` / `NODE_AUTH_TOKEN`** au step `pnpm install` (via `env:`) pour résoudre les `@groupe-j/*` depuis GitHub Packages.
- **Pourquoi** : un job CI passait `skip-build: true` → du code qui ne buildait pas restait mergeable. (GRO-382/329/270/136)

---

## Sentry

### Organisation

- **Org** : `groupe-j`
- Un **projet Sentry par app** (ex: `pronostic-web`, `pronostic-bot`, `ridesamui-t3`)
- Auth token partagé : `GROUPEJ_SENTRY_TOKEN` (dans Doppler de chaque projet)

### Variables d'environnement

```bash
SENTRY_DSN=""                    # Server-side DSN (jamais hardcodé !)
NEXT_PUBLIC_SENTRY_DSN=""        # Client-side DSN (public)
SENTRY_AUTH_TOKEN=""             # Pour source maps upload (CI/build)
SENTRY_ORG="groupe-j"           # Organisation Sentry
SENTRY_PROJECT=""                # Nom du projet Sentry
SENTRY_ENVIRONMENT=""            # Override d'environnement server/edge (CI : `ci`/`e2e`) — voir « Environnement & CI/e2e »
NEXT_PUBLIC_SENTRY_ENVIRONMENT="" # Idem côté client (inliné au build)
```

**JAMAIS de DSN hardcodé dans le code** — toujours via `process.env`.

### sentry.server.config.ts (standard)

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // SENTRY_ENVIRONMENT en premier : permet à la CI de forcer `ci`/`e2e`.
  // Sans ça, fallback VERCEL_ENV/NODE_ENV → les events e2e arrivent en `production`.
  environment:
    process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV !== "test",
});
```

### Côté client : `instrumentation-client.ts` — **JAMAIS `sentry.client.config.ts`**

> 🚨 **`sentry.client.config.ts` est MORT sous Turbopack, donc sous Next 16.**
> `@sentry/nextjs` n'injecte ce fichier dans le bundle navigateur que depuis son
> **chemin webpack** (`build/cjs/config/webpack.js` → `getClientSentryConfigFile`).
> Next 16 construit avec Turbopack par défaut : le SDK prend `getTurbopackPatch`,
> l'injection n'a jamais lieu, et **`Sentry.init` ne s'exécute jamais dans le
> navigateur**. Le build passe, la CI est verte, et il ne remonte **aucune erreur
> client, aucun replay, aucun Web Vital** — un angle mort total, parfaitement muet.
>
> Constaté le 2026-07-25 sur **8 apps du portfolio** (ridesamui ×5, pronostic ×3),
> dont le site au plus fort trafic réel : 0 pageload sur 30 jours. Cette convention
> elle-même prescrivait le motif mort — c'est elle qui l'a propagé.
>
> **Le fichier correct est `instrumentation-client.ts`** (racine de l'app ou `src/`),
> chargé nativement par Next indépendamment du bundler. Il doit **exporter
> `onRouterTransitionStart`** : sans lui, les chargements de page remontent mais
> **pas les navigations client**.
>
> ⚠️ Ce fichier est chargé **avant le bootstrap de l'app et sans try/catch** : tout
> throw à l'intérieur (lecture de cookie de consentement, `decodeURIComponent` sur
> un `%` isolé…) ne produit pas un tag manquant mais une **page morte**. Enveloppe
> toute lecture d'environnement dans un try/catch avec repli sûr.
>
> Vérification : un build vert ne prouve rien ici. Cherche les marqueurs du SDK
> dans `.next/static` après build, et pose un test e2e qui vérifie dans un vrai
> navigateur qu'une erreur part réellement.

```typescript
// instrumentation-client.ts
import * as Sentry from "@sentry/nextjs";
import { initSentryClient } from "@groupe-j/sentry-config/client";

// DSN, environment (NEXT_PUBLIC_SENTRY_ENVIRONMENT en premier), release,
// sampling, denyUrls, ignoreErrors et redaction PII : tout est DANS le package.
// Ne pas ré-implémenter ces filtres par app — cf. § Ne pas re-capturer.
initSentryClient({ app: "nom-du-projet" });

// OBLIGATOIRE — sans cet export, les chargements de page remontent mais
// AUCUNE navigation client (App Router) n'est tracée.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

> **Poids du SDK** : `@groupe-j/sentry-config/client` embarque rrweb (~40 KB gzip) dans le chunk initial, **même avec `replay: false`**. Sous-export `/client-lazy` (même API, un import à changer) pour l'en sortir : Replay est alors chargé au premier idle depuis `browser.sentry-cdn.com` — **exige cette origine dans `script-src` ET, si l'app a un service worker, dans `connect-src`** (le SW re-fetch le `<script src>`).
>
> ⚠️ **Jamais `integrations: []` dans un `Sentry.init` recopié** : le tableau est *fusionné* avec les défauts (aucun effet réel), mais il se lit comme « traçage désactivé » et a déjà égaré un diagnostic. Si une intégration doit sauter, la nommer.

> **Détection automatisée** : `gjdc check` échoue (statut `error`) sur toute app qui
> build avec Turbopack, garde un `sentry.client.config.*` et n'a pas
> d'`instrumentation-client.*` initialisant Sentry — une ligne par app, monorepos
> inclus. L'absence d'`onRouterTransitionStart` y est un **warning** séparé, non
> bloquant. C'est ce contrôle, pas cette page, qui empêche l'écart de réapparaître.
>
> **Détection manuelle sur une app existante** : `git grep -l "sentry.client.config"` dans un
> repo en Next ≥ 15 = suspicion immédiate de cécité totale côté navigateur. Le
> contre-signe se lit dans Sentry : `transaction.op:pageload` à **0 sur 30 jours**
> alors que l'app a du trafic. Les apps saines appellent `initSentryClient` depuis
> `instrumentation-client.ts`.

### Ne pas re-capturer `window.onerror` (doublon + défait `denyUrls`)

Le SDK `@sentry/nextjs` installe **déjà** un handler `window.onerror` +
`unhandledrejection` (intégration `GlobalHandlers`) auquel s'appliquent
`denyUrls` / `allowUrls` / `ignoreErrors`. Un `window.addEventListener("error", …)`
maison qui **re-capture** via `captureException` fabrique un **doublon** de chaque
erreur non capturée — et, pire, ce doublon a **perdu les frames d'origine** (URL
de l'extension, du script CDN tiers…), donc `denyUrls` ne peut plus le filtrer.

- ❌ **Interdit** : un « GlobalErrorHandler » maison qui écoute `error` /
  `unhandledrejection` et rappelle `captureException`.
- ✅ **Requis** : laisser le SDK gérer `error` / `unhandledrejection`. Réserver la
  capture manuelle aux surfaces **sans** couverture SDK — React error boundaries,
  erreurs tRPC, erreurs réseau applicatives.
- **Préférer `@groupe-j/sentry-config`** (`initSentryClient`) : il bake déjà
  `denyUrls` (schemes d'extension), `ignoreErrors` (bots/quirks) et la redaction
  PII. Ne pas ré-implémenter ces filtres par app.
- **Pourquoi** : ARCHICOLLAB-T3-1Q — une extension navigateur (scan JSON-LD,
  `r["@context"].toLowerCase`) a fui en prod car re-loggée par un GlobalErrorHandler
  maison puis re-captée via `captureConsoleIntegration`. Le filtre extension partagé
  (`DEFAULT_DENY_URLS`) ne pouvait pas la voir : le doublon console ne portait plus
  l'URL de l'extension. (`@groupe-j/sentry-config` ≥ 0.6.0 ajoute en plus un
  `beforeSend` qui drop les exceptions dont une frame/value porte un scheme
  `…-extension://`.)

### sentry.edge.config.ts (standard)

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // SENTRY_ENVIRONMENT en premier : permet à la CI de forcer `ci`/`e2e`.
  environment:
    process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV !== "test",
});
```

### instrumentation.ts (standard)

```typescript
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

### next.config.ts — withSentryConfig (standard)

```typescript
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  tunnelRoute: "/monitoring",
});
```

### Sampling — Règles

| Contexte | tracesSampleRate | profilesSampleRate | replaysSession | replaysOnError |
|----------|-----------------|-------------------|----------------|----------------|
| **Production** | 0.1 (10%) | 0.1 (10%) | 0.1 (10%) | 1.0 (100%) |
| **Dev/Preview** | 1.0 (100%) | 1.0 (100%) | 0 | 0 |
| **Test** | désactivé | désactivé | désactivé | désactivé |

### Environnement & CI/e2e

L'environnement Sentry vient de `SENTRY_ENVIRONMENT` (ou `NEXT_PUBLIC_SENTRY_ENVIRONMENT` côté client) **avant** le fallback `VERCEL_ENV || NODE_ENV`. C'est volontaire : un `environment` explicite dans `Sentry.init` override la variable d'env Sentry, et sans aucune des deux le SDK retombe sur `production`.

**Règle : les tests e2e en CI doivent tourner sous `environment: ci` (jamais `production`).**

- Le job e2e du **template CI** distribué par ce repo (`workflows/ci.yml`) exporte `SENTRY_ENVIRONMENT=ci` et `NEXT_PUBLIC_SENTRY_ENVIRONMENT=ci` au niveau du job.
- Sans ça, l'app sous test (serveur Node sur le runner GitHub, `VERCEL_ENV` absent) émet sous `production` → faux tickets « erreur production » lors du sync Sentry → Linear.
- **À propager aux apps existantes** : le `gjdc setup` réinstalle le workflow, mais le filet de sécurité réel est le snippet `environment:` ci-dessus — vérifier que `sentry.{server,client,edge}.config.ts` lit bien `SENTRY_ENVIRONMENT` en premier. Apps prioritaires : celles qui lancent des e2e en CI.

### Triage d'une issue Sentry « production »

Avant de coder un fix (ou d'ouvrir un ticket) sur une erreur taggée `environment: production`, **vérifier que c'est une vraie erreur prod et pas du bruit e2e CI** :

1. **Users Impacted** — `0` user + volume concentré sur un seul jour = quasi-certainement du bruit CI, pas un incident prod.
2. **`server_name`** — `runnervm*` (ou contient `runner`) = runner GitHub, pas un serveur prod.
3. **Chemins de la stacktrace** — `/home/runner/work/…` = arborescence CI.
4. **User-agent** — `curl` = requête de test automatisée.

Si l'un de ces signaux est présent : ce n'est pas un incident production. Reclasser/ignorer plutôt qu'investiguer. La routine `sentry-plan-check` applique ce même filtre avant de créer des issues Linear.

### beforeSend — Contexte enrichi

Côté client, le tag `app` vient de `initSentryClient({ app })` — rien à écrire. Pour du contexte métier supplémentaire, enrichir via `beforeSend` dans `sentry.server.config.ts` (et côté client uniquement si le package ne couvre pas le besoin ; **jamais** dans `sentry.client.config.ts`, mort sous Turbopack — voir plus haut) :

```typescript
Sentry.init({
  // ... config standard ...
  beforeSend(event) {
    // Ajouter le contexte métier du projet
    event.tags = {
      ...event.tags,
      app: "nom-du-projet",          // Identifier l'app dans les dashboards
      // Pour les apps multi-tenant :
      // tenantId: getCurrentTenantId(),
    };
    return event;
  },
});
```

Exemples de contexte utile selon le projet :

| Projet | Tags à ajouter |
|--------|----------------|
| pronostic | `app`, `tenantId` (tipster), `plan` (free/pro) |
| ridesamui | `app`, `locale` (th/en/fr) |
| archicollab | `app`, `orgId`, `role` (admin/member) |
| megahote | `app`, `propertyId`, `tenantId` |
| businessfamily | `app` |

### Une erreur = UNE capture

**Le triple-logging fabrique plusieurs issues pour 1 seul incident.** Le pattern vu en audit : l'exception est capturée par le SDK, **puis** re-capturée par un GlobalError handler custom, **puis** re-envoyée en `captureMessage` avec la stack en texte → issues distinctes pour un même bug, compteurs faux, triage impossible (on croit à 3 bugs).

```typescript
// ✅ une seule capture, le contexte en tags/extra
Sentry.captureException(error, {
  tags: { route: "geocode" },
  extra: { address, provider: "ign" },
});

// ❌ doublons
Sentry.captureException(error);
Sentry.captureMessage(`geocode failed: ${error.stack}`); // 2e issue, stack en message → groupage cassé
logger.error("geocode failed", { error });               // Error sérialisée en [object Object] → cause perdue
```

- **Une seule `captureException(error)` par incident.** Contexte → `tags` / `extra` / `setContext`, jamais une 2e capture.
- **Pas de `captureMessage` en doublon** d'une exception, et **jamais une stack envoyée en `message`** (Sentry ne peut plus grouper : chaque stack unique = une issue unique).
- **Ne jamais logger un objet `Error` dans une string ou un objet** : `logger.error("Failed to geocode", { error })` sérialise l'`Error` en **`[object Object]`** → **la cause est définitivement perdue** et l'issue est indébuggable (cas réels avec utilisateurs impactés). Passer l'`Error` à `captureException`, le contexte séparément (cf. [§ Logging structuré](#logging-structuré)).

### Cron Monitoring

Sentry surveille automatiquement les crons Vercel quand `automaticVercelMonitors: true` est dans `withSentryConfig`. Un cron **non déclenché** à l'heure prévue lève une alerte « missed ».

> ⚠️ **`automaticVercelMonitors` (et `withMonitor` route-level) ne prouvent que le DÉCLENCHEMENT de la route + son `200` — PAS que le travail a été fait.** Un cron **fire-and-forget / workflow durable** (`start(workflow)`) renvoie 200 immédiatement pendant que le vrai travail tourne (ou échoue à tourner) ailleurs → il est reporté **VERT alors qu'il est mort en silence**, et `captureException` dans les steps n'attrape rien car aucun step ne tourne. Vécu : **10 crons WDK de pronostic morts 8 semaines** malgré `automaticVercelMonitors` (GRO-629). Pour ces crons : **lier le check-in `ok` à l'achèvement RÉEL** (ouvrir `in_progress` à la route, fermer `ok` seulement quand le dernier step confirme l'effet de bord) OU une **assertion donnée** (la ligne/effet attendu est bien apparu).
>
> **Cause racine associée à surveiller** — un `next.config` `pageExtensions` custom **REMPLACE** les défauts : ajouter `"mdx"` sans re-mettre `"js","jsx"` **supprime silencieusement** les routes `.js` générées par WDK (`app/.well-known/workflow/v1/flow/route.js`) → plus de consumer abonné → tous les `start()` de l'app enfilent dans le vide. Toujours `pageExtensions: ["ts","tsx","mdx","js","jsx"]`. Vérif : `GET /.well-known/workflow/v1/manifest.json` doit lister les workflows.

**Déjà activé** via la config `withSentryConfig` standard. Pour les crons custom (pas via `vercel.json`), wrapper manuellement :

```typescript
// Dans un cron handler custom
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  return Sentry.withMonitor("nom-du-cron", async () => {
    // logique du cron
    return Response.json({ ok: true });
  }, {
    schedule: { type: "crontab", value: "*/15 * * * *" },
    checkinMargin: 5,   // minutes de tolérance avant alerte "missed"
    maxRuntime: 10,      // minutes max avant alerte "timeout"
  });
}
```

**Tous les crons doivent être wrappés** avec `Sentry.withMonitor` ou `automaticVercelMonitors` — **mais pour les crons durables/fire-and-forget, cf. l'avertissement ci-dessus** : le check-in `ok` doit refléter l'achèvement réel du travail, pas juste le `200` de la route.

> 🚨 **`Sentry.withMonitor` ne marque « failed » que si son callback LÈVE.** `return Response.json({ok:false}, {status:500})` ou `return NextResponse.json(..., {status:500})` **à l'intérieur** du callback est un retour normal du point de vue de `withMonitor` : aucune exception ne remonte, donc le check-in part en `ok`. Ce n'est pas théorique — mesuré sur ce portefeuille, plusieurs crons répondent 500 sans relancer et rendent un check-in vert.
>
> **Correctif SDK, pas seulement une convention d'écriture** : `@groupe-j/sentry-config@1.0.1` remplace `withCronMonitor`'s implémentation par des `Sentry.captureCheckIn` manuels (`in_progress` → `ok`/`error`), qui ne dépendent plus de la présence d'un `throw`. **Avant 1.0.1**, la seule façon d'être correct était de **toujours relancer l'erreur fatale depuis l'intérieur du callback** — jamais construire une `Response` d'échec à la main dans un handler wrappé par `withMonitor`.
>
> ⚠️ **Ce que la 1.0.1 NE garantit PAS** : un handler qui **avale** sa propre exception (`catch` qui logue puis `return Response.json({ok:true})`) reste vert avec n'importe quelle version du SDK — `captureCheckIn` rend fidèlement ce que le code lui dit, il ne devine pas un échec caché derrière un succès délibérément fabriqué. La bascule sur `withCronMonitor` répond à « le moniteur reflète-t-il un throw ? », pas à « le handler a-t-il raison de dire qu'il a réussi ? » — cette seconde question reste à la charge du code métier. Et un moniteur, même correct, ne dit toujours que « la route a répondu » : voir « Tâches planifiées » ci-dessous pour ce qui manque au-delà.

### Tâches planifiées

Un moniteur Sentry atteste qu'une route a répondu 200 — pas que le travail a eu lieu (cf. l'avertissement ci-dessus). Le complément est un **vérificateur d'invariants** : chaque app expose ce que ses crons ont **réellement produit**, un job externe agrège et n'émet **qu'un seul** check-in pour tout le portefeuille. Ce siège unique remplace un moniteur par cron.

**Convention de nommage : `type.verbe-objet`** (ex. `livraison.vider-file-leads`, `production.ingerer-reglements`, `obligation.purger-donnees`, `compensation.reconcilier-abonnements`). Le préfixe est la famille, le reste décrit l'effet attendu — jamais le nom de la route ni de l'app, qui vivent déjà dans `app`/`schedule`.

**Quatre familles, quatre formes d'invariant :**

| Famille | Ce qu'elle couvre | Forme de l'invariant | Source de la fenêtre |
|---|---|---|---|
| `production` | fabrique du contenu qui reste dans le système (rien ne quitte vers un tiers) | fraîcheur d'une trace en base **OU** stock restant à zéro | dérivée du `schedule` (`deriveWindow(schedule, graceFactor)`) |
| `livraison` | fait sortir quelque chose vers un tiers ou un autre système | file d'attente vide au-delà d'un délai, en excluant explicitement les lignes délibérément abandonnées (dead-letter) du verdict | dérivée du `schedule` |
| `obligation` | conformité/réglementaire (rétention, rappel légal) | délai métier écoulé sans action | **`businessWindow` explicite, jamais dérivée du `schedule`** — la cadence du cron n'a aucun rapport avec le délai réglementaire qu'il applique |
| `compensation` | répare un état incohérent laissé par un autre processus | absence d'incohérence détectable | dérivée du `schedule` |

Ces quatre sources de fenêtre supposent un effet constatable en base. **N'importe laquelle des quatre familles** peut en manquer (agit hors base, ou volontairement en dry-run) : la tâche déclare alors `ok: null` avec `reason` obligatoire, quel que soit son type — c'est la liste des sièges Sentry à payer si le budget s'ouvre, pas une case à combler à tout prix par une requête forcée.

**Le contrat de l'endpoint.** Chaque app expose `GET /api/internal/cron-invariants`, gardé par un secret partagé (comparaison SHA-256 + `timingSafeEqual`, avec les valeurs piégeuses `Bearer undefined` / `Bearer null` / `Bearer ` explicitement dans la liste des refus — pas seulement l'égalité de chaînes). La réponse : `{ app, declared, evaluated, tasks: [{ name, type, schedule, window?, ok, detail?, reason?, needsMonitor? }] }`. `declared` est le nombre de tâches que l'app affirme surveiller, `evaluated` celui qu'elle a réellement évalué — un écart entre les deux est en soi un défaut (une évaluation qui lève ne doit jamais faire disparaître la tâche du rapport, elle doit ressortir `ok: false`). Un **test de parité** compare ce fichier de déclarations au `vercel.json` (ou équivalent) du même dépôt : chaque cron planifié a une déclaration, chaque déclaration correspond à un cron réellement planifié, et les deux horaires concordent.

> ⚠️ **Documenter la convention ne suffit pas à la faire respecter — et ce n'est pas une hypothèse.** L'avertissement sur `withMonitor` ci-dessus existait déjà dans ce fichier avant qu'une dizaine de crons du portefeuille ne le contredisent en production. Une section de conventions est lue une fois, à la création du cron ; elle n'est jamais relue à chaque modification ultérieure. **Ce qui applique réellement la règle, c'est le test de parité** (`vercel.json` ↔ déclarations) exécuté en CI à chaque PR touchant l'un des deux fichiers — pas cette page. Toute nouvelle app qui adopte ce contrat doit poser ce test avant son premier cron, pas après le premier incident.

### Alertes (configurées par projet Sentry)

- Error spike > 10/h → Email
- High priority issue → Email
- Fatal error → Email
- Cron missed/timeout → automatique via `automaticVercelMonitors`

> Configuration des notifications, alertes Telegram, et dashboards : voir `ADMIN_PROCEDURES.md`

---

## Doppler

- Workspace : **GROUPE J** (plan Team)
- Configs par projet : `dev`, `dev_personal`, `stg`, `prd` (+ `test` / `e2e` / `dev_test` si besoin CI)
- `dev_personal` = overrides perso non partagés (chaque dev a sa branche)
- Toute variable d'env passe par Doppler
- Dev : `doppler run -- pnpm dev`
- Tests : `doppler run -c test -- pnpm test:e2e`

### 🚨 Ce que la CI peut lire (audit portefeuille 2026-08-05)

**Un config Doppler *branche* hérite INTÉGRALEMENT de sa racine.** `dev_test`,
`test`, `e2e`, `dev_personal` (`root=False`) ne sont pas des configs restreints :
ils portent tout `dev`, plus leurs propres ajouts. Mesuré sur `ridesamui/dev_test` :
57 secrets, dont **52 strictement identiques à `dev`** — il n'en ajoutait que 5.

Un jeton de service « de test » n'est donc **jamais plus restreint que la racine**.
Vérifier avant de conclure :

```bash
doppler configs --project <proj> --json   # lire root=true/false
```

#### La règle qui compte : `DOPPLER_TOKEN` ne doit pas vivre pendant `pnpm install`

`pnpm install` exécute les scripts `postinstall` de **chaque dépendance** — du code
tiers, et sur une PR Dependabot du code tiers **qui vient d'être mis à jour**. Si
`DOPPLER_TOKEN` est déclaré au niveau **job**, il est dans l'environnement de ce
step, et tout le config est lisible par ce code, **sur chaque PR**.

La précédence des variables est **step > job**. Une seule ligne suffit :

```yaml
      - run: pnpm install --frozen-lockfile
        env:
          DOPPLER_TOKEN: ""     # les steps `doppler run` gardent la valeur du job
```

Un `env:` de step **fusionne** avec celui du job (il ne le remplace pas) : les
autres clés, dont `NPM_TOKEN` nécessaire aux paquets `@groupe-j`, restent héritées.

#### Avant d'ajouter un secret à un config `dev` / `test`

> **Doit-il être lisible par du code tiers pendant `pnpm install` ?**
> Si non, il n'a rien à faire dans un config que la CI charge.

Les identifiants d'**opérateur** (API Vercel/Sentry/Grafana de l'org, mots de passe
Neon, jetons admin CMS) ne sont lus par aucun code applicatif : leur place est dans
`prd`, pas dans `dev`. Contrôle par empreinte, sans jamais faire transiter de valeur :

```bash
# Quels secrets de <cfg> portent EXACTEMENT la valeur de prd ?
# Compare par empreinte, secret par secret — aucune valeur n'est affichee.
python - <<'EOF'
import json, subprocess, hashlib
PROJ = "<proj>"
def emp(cfg):
    out = subprocess.run(["doppler","secrets","--project",PROJ,"--config",cfg,"--json"],
                         capture_output=True, text=True).stdout
    return {k: hashlib.sha256((v.get("computed") or "").encode()).hexdigest()
            for k, v in json.loads(out).items() if v.get("computed")}
a, b = emp("dev"), emp("prd")
memes = sorted(k for k in a if a[k] == b.get(k))
print(f"{len(memes)} secrets identiques a prd :", *memes, sep="
  ")
EOF
```

Relevé du 2026-08-05 sur les 18 projets : **45 configs non-`prd` portaient au moins
un secret à la valeur de production**, et 4 (`GROUPEJ_GRAFANA_API_TOKEN`,
`GROUPEJ_SENTRY_TOKEN`, `GROUPEJ_VERCEL_API_TOKEN`, `NPM_TOKEN`) étaient présents
dans **25 configs `dev`/`test`** — conséquence directe de la procédure cross-ref
ci-dessous, qui dit « chaque config (dev, stg, prd) ». Le risque est **latent** tant
qu'aucun workflow ne pose de `DOPPLER_TOKEN` au niveau job ; il devient actif au
premier qui le fera, en une ligne, sans que rien ne le signale en revue.

### Architecture cross-project — Single source of truth (depuis 2026-05-14)

Le project Doppler **`dev-conventions`** est le **hub des secrets shared** cross-app.

Chaque secret shared a UNE valeur master dans `dev-conventions/{dev,stg,prd}` ; les autres projects (`megahote`, `linegroup`, etc.) le **référencent** au lieu de le dupliquer :

```
dev-conventions/prd:
  GROUPEJ_VERCEL_API_TOKEN = vrcl_xxx          ← master, valeur réelle
  GROUPEJ_SENTRY_TOKEN     = sntrys_xxx        ← master
  GROUPEJ_GRAFANA_API_TOKEN = glsa_xxx         ← master
  NPM_TOKEN                = ghp_xxx           ← master (read:packages scope)
  SENTRY_ORG               = groupe-j          ← constante

megahote/prd:
  GROUPEJ_VERCEL_API_TOKEN = ${dev-conventions.prd.GROUPEJ_VERCEL_API_TOKEN}
  GROUPEJ_SENTRY_TOKEN     = ${dev-conventions.prd.GROUPEJ_SENTRY_TOKEN}
  ... (idem pour chaque shared)
  DATABASE_URL             = postgresql://... ← per-project, valeur réelle
  BETTER_AUTH_SECRET       = ...              ← per-project
```

**Conséquence rotation** : pour rotate `GROUPEJ_VERCEL_API_TOKEN`, **une seule modification dans `dev-conventions/prd`** — tous les consumer projects récupèrent la nouvelle valeur instantanément (résolution au read-time).

**Règle absolue** : ne JAMAIS modifier un `GROUPEJ_*` directement dans un consumer project. Toujours via `dev-conventions`.

### Secrets per-project (NE PAS migrer en cross-ref)

Ces secrets sont uniques par app/env, doivent rester dans le project consumer :

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (Neon DB par app — de préférence injectés par l'intégration Neon-Vercel, pas Doppler)
- `BETTER_AUTH_SECRET` (HMAC key per app)
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (URL Sentry par project)
- `SENTRY_AUTH_TOKEN` (par Sentry project pour source maps)
- `SENTRY_PROJECT` (slug Sentry par app)
- `GRAFANA_DB_READONLY_PASSWORD` (password Neon `grafana_readonly` par DB)
- Stripe keys (live + webhook secret par app si Connect platform)
- Tous les API keys spécifiques à l'app

### Rotation policy

| Catégorie | Fréquence | Méthode |
|-----------|-----------|---------|
| **High-risk** : Stripe live keys, BETTER_AUTH_SECRET, DATABASE_URL passwords | **90 jours** | Manuelle, two-secret strategy (Doppler natif) |
| **Medium-risk** : GROUPEJ_VERCEL_API_TOKEN, GROUPEJ_SENTRY_TOKEN, ANTHROPIC_API_KEY | **365 jours** | Manuelle dans `dev-conventions`, propagation auto via refs |
| **Low-risk** : GROUPEJ_GRAFANA_API_TOKEN, NPM_TOKEN, AI provider keys | **365 jours** | Manuelle |
| **Constantes** : SENTRY_ORG, project slugs, public DSNs | jamais | — |

> Rotation détaillée + commandes : voir `ADMIN_PROCEDURES.md § Rotation`

### Procédure cross-ref pour nouveaux projets

Quand tu crées un nouveau project Doppler :
```bash
# Pour chaque shared token + chaque config (dev, stg, prd) :
doppler secrets set GROUPEJ_VERCEL_API_TOKEN='${dev-conventions.prd.GROUPEJ_VERCEL_API_TOKEN}' \
  --project mon-nouveau-projet --config prd
```

Le `'${...}'` doit être en single quotes pour empêcher l'expansion shell. Doppler résoudra au read-time.

### Exception : `NPM_TOKEN` dual-source (Doppler + GitHub Actions org secret)

Doppler-GitHub-Actions integration sync uniquement vers les **repo-level secrets**, pas vers les **org-level secrets**. Pour éviter de dupliquer `NPM_TOKEN` dans 12 repos, on utilise un **org-level GitHub secret** créé manuellement.

**Conséquence** : `NPM_TOKEN` existe en 2 endroits non auto-synced :
1. `Doppler dev-conventions/{dev,stg,prd}` — master (utilisé par Vercel via Doppler sync)
2. `GitHub Actions org-level secret` sur `groupe-j` (visibility=all) — utilisé par CI workflows

**Procédure de rotation** (~1×/an) :

```bash
# Étape 1 : nouvelle valeur dans Doppler master
doppler secrets set NPM_TOKEN="ghp_NEW_VALUE" --project dev-conventions --config prd
doppler secrets set NPM_TOKEN="ghp_NEW_VALUE" --project dev-conventions --config stg
doppler secrets set NPM_TOKEN="ghp_NEW_VALUE" --project dev-conventions --config dev
#   → propagation auto vers les 11 apps (cross-refs) + Vercel env vars (Doppler sync)

# Étape 2 : update GitHub Actions org secret
echo "ghp_NEW_VALUE" | gh secret set NPM_TOKEN --org groupe-j --visibility all

# Étape 3 : verify
gh api orgs/groupe-j/actions/secrets --jq '.secrets[] | select(.name == "NPM_TOKEN")'
```

**Reminder** : le token a besoin du scope `read:packages` (fine-grained PAT recommandé pour CI, scope minimal).

---

## Grafana Cloud

Approche zero-code : Grafana se connecte aux datasources existantes, pas de SDK dans les projets.
Aucun code à écrire pour le monitoring — tout se configure dans le dashboard Grafana.

Env vars liées à Grafana dans Doppler :
- `GROUPEJ_GRAFANA_API_TOKEN` — Token API global
- `GRAFANA_DB_READONLY_PASSWORD` — Password du user Neon `grafana_readonly` (par projet)

> Onboarding Grafana, datasources, queries SQL templates, alertes : voir `ADMIN_PROCEDURES.md`

---

## Tests E2E — Playwright

### 4 types de tests

1. Parcours utilisateur complets
2. Tests de composants isolés
3. Tests API/tRPC (fixture `request`)
4. Tests visuels / screenshots (régression CSS)

### Intégrations

- **Stripe** : vraie API test + `stripe listen`
- **Telegram** : bot de test + tunnel ngrok
- **Auth** : injection de session, `storageState` par rôle

### Config

- Chromium, local, `retries: 0`
- E2E en CI uniquement sur PR vers main

### Scripts

```json
{
  "test:db:reset": "doppler run -c test -- tsx scripts/db-reset.ts",
  "test:db:seed": "doppler run -c test -- tsx scripts/seed-test.ts",
  "test:e2e": "doppler run -c test -- playwright test",
  "test:e2e:ui": "doppler run -c test -- playwright test --ui",
  "test:e2e:setup": "pnpm test:db:reset && pnpm test:db:seed",
  "test:stripe:listen": "stripe listen --forward-to localhost:3000/api/webhooks/stripe"
}
```

### Règles

- Tests indépendants, données seedées
- Pas de `sleep`
- Vérifier absence d'erreur console + réseau

### CI — matrice per-app + « E2E Gate » agrégateur

Quand la suite E2E couvre plusieurs apps/serveurs, ne PAS empiler tous les serveurs dans un seul job CI monolithique : N serveurs Next en compétition sur un runner 2-core → cold-starts qui dépassent les timeouts, flakes tournants, et un seul échec environnemental fait retomber toute la run. Le pattern standard :

**Matrice par app/leg**

- Un job `build` partagé construit chaque app UNE fois et uploade les `.next` en artifacts per-app (⚠️ `include-hidden-files: true` obligatoire — `.next` est un dossier caché, exclu par défaut par `upload-artifact@v4+`). Builds séquentiels (`--concurrency=1`) : deux `next build` parallèles OOM-kill le runner.
- Une `strategy.matrix` avec un leg par app (ou groupe d'apps testées ensemble) : chaque leg télécharge uniquement ses artifacts, démarre uniquement ses serveurs, exécute son sous-dossier de specs (`e2e/<group>/`).
- `fail-fast: false` (un leg rouge ne doit pas annuler les autres), `workers: 1` par leg, `retries: 1` en CI.
- Capturer stdout/stderr de chaque serveur backgroundé dans un fichier uploadé en artifact — GitHub ne capture pas la sortie des process `&`, et sans elle une erreur runtime avalée (tRPC → 500) est indiagnosticable.
- (Exemple : ridesamui — job monolithique 5 serveurs ~31 min → 6 legs parallèles, leg le plus lent 7,8 min, ~4× plus rapide, échecs isolés par app.)

**« E2E Gate » agrégateur = l'UNIQUE required check**

- Un job agrégateur `needs: [e2e]` dont le check est le required status check — jamais les legs individuels un par un : ajouter/renommer/supprimer un leg ne demande alors aucune reconfiguration du ruleset.

> ⚠️ **CORRECTION (mesurée) — ce paragraphe affirmait l'inverse de la réalité.**
>
> Il était écrit ici qu'« un required check résolu *skipped* bloque la PR pour toujours ». **C'est faux.** Un check-run `skipped` **SATISFAIT** une exigence de branche : GitHub laisse la fusion passer.
>
> Les deux états sont opposés et il faut les distinguer :
>
> | État du contexte requis sur le SHA | Effet |
> |---|---|
> | `skipped` | **AUTORISE** la fusion (fail-open) |
> | **absent** | **BLOQUE** (`GH006 … Required status check "…" is expected`) |
>
> Le blocage « pour toujours » qu'on attribuait au `skipped` venait en réalité d'un contexte **absent** (workflow non déclenché — typiquement un `paths-ignore` sur `pull_request`). Deux causes distinctes, deux remèdes opposés.
>
> Cette croyance a coûté cher : des fusions **non testées** sont passées en « tout vert », dont un bump de dépendance qui a cassé en silence une chaîne de génération d'images en production.

- Pourquoi un agrégateur et pas les jobs lourds eux-mêmes : si le workflow tourne aussi sur `push` avec les jobs lourds gatés `if: pull_request`, le job lourd est skippé sur les runs de push et publie `skipped` sur le SHA de tête. Comme la tête d'une PR de synchro/promotion **est aussi le tip d'une branche poussée**, un même commit collecte alors DEUX conclusions de sens opposé pour le même contexte — un verdict réel et un `skipped` sans contenu. Le dernier arrivé gagne, et si c'est le `skipped`, la PR se fusionne **sans qu'aucun test n'ait tourné**.
- ⛔ **Ne JAMAIS traiter `skipped` comme vert dans un agrégateur.** Un gate qui rend `success` quand `needs.<job>.result == 'skipped'` publie un contexte requis qui n'a **rien mesuré** : la protection de branche devient décorative. C'est la même classe de défaut qu'un job « always-green » qui se contente d'`echo`.
- Deux formes valides — choisir selon que le job lourd **peut** ou **ne peut pas** tourner sur l'événement :
  1. **Le job lourd peut tourner partout** (ex. smoke contre une URL publique) : l'agrégateur porte le nom requis, `needs: [<job>]`, `if: always()`, **sans aucune autre condition**, et traduit `needs.<job>.result` en code de sortie — `success` ⇒ 0, **tout le reste (`skipped` compris) ⇒ `exit 1`**. Ne pouvant jamais être skippé lui-même, il ne conclut que `success` ou `failure` : l'état « ni testé ni bloquant » disparaît.
  2. **Le job lourd ne peut pas tourner sur certains événements** (matrice trop coûteuse sur les pushes) : faire du `name:` de l'agrégateur une **expression**, pour que les runs sans verdict publient un nom DIFFÉRENT. Le contexte requis est alors **absent** de ce SHA — donc bloquant — au lieu d'être `skipped` — donc passant.
     - ⚠️ L'agrégateur doit malgré tout tourner **toujours** (`if: always()`) et sortir en 0 tout de suite quand il ne fait pas autorité : GitHub **n'évalue pas** `jobs.<id>.name` pour un job *skippé*, il publie le gabarit BRUT (on obtient un check littéralement nommé `(github.event_name == 'pull_request' || …`).
     - ⚠️ Sortir en **0** (et non en échec) sur ces chemins : un workflow de synchro qui lit « un `failure` sur le SHA ⇒ la branche est rouge » se figerait sinon en permanence.
     - ⚠️ Si un workflow fast-forward une branche protégée sur une autre **par un push**, le contexte requis doit rester publié sur ce chemin, sinon `GH006` bloque la synchro pour toujours. Sur ce chemin, le publier **mérité** : prouver que chaque PR fusionnée par le commit portait bien le contexte en `success`. **Tester les deux chemins**, jamais un seul.

**Isolation DB**

- Cible : une branche Neon éphémère PAR leg (`neondatabase/create-branch-action`, `expires_at` en TTL backstop, delete en `if: always()` + `continue-on-error`), forkée d'une branche permanente `e2e-template` — enfant zéro-ligne (TRUNCATE) de `main`. Ni `schema-only` (crée des branches ROOT, cappées par plan Neon → HTTP 422 en rafale), ni fork d'une branche de données. Fork de `main` obligatoire dès que le schéma contient des fonctions PG raw-SQL : `prisma db push` ne crée JAMAIS ces fonctions, seule la lignée du fork les fournit — sinon l'app avale un `42883 function does not exist` en résultat vide.
- A minima (DB e2e partagée entre PRs) : `concurrency` group dédié sur le job e2e (`cancel-in-progress: false`). Limite documentée : GitHub ne garde qu'UNE exécution en file d'attente par groupe → une rafale de 3+ PRs produit des checks requis « cancelled » à re-runner. C'est un palliatif, pas l'isolation cible.

**Required checks côté ruleset**

- Sans required status check sur la branche d'intégration, `gh pr merge --auto` merge INSTANTANÉMENT sans attendre la CI — le contrat « merge si CI verte » n'est pas appliqué mécaniquement. Poser un ruleset qui exige les checks (noms EXACTS des check-runs, agrégateurs inclus).
- Piège : `paths-ignore` sur un workflow dont un job est requis = les PRs docs-only n'émettent jamais le check → bloquées sans recours. Vérifier l'absence de `paths-ignore` avant de rendre un check requis.
- 🚨 **Une PR en CONFLIT ne déclenche AUCUN `pull_request` workflow — pas d'échec, pas de `skipped`, rien.** GitHub ne peut pas calculer le commit de fusion hypothétique sur lequel `pull_request` s'exécute, donc les déclencheurs ne partent tout simplement pas. Mesuré : une PR en conflit n'affichait qu'un seul check (un déploiement déclenché par ailleurs sur `push`) et aucun test, sans qu'aucune ligne ne signale explicitement un test « manquant » — la liste des checks montre seulement ce qui a tourné, jamais ce qui aurait dû tourner. Que GitHub bloque ensuite la fusion (`GH006`, cas « contexte absent ») dépend du ruleset de la branche ; ce que cette règle couvre, c'est le **temps de lecture humaine de la PR avant la tentative de fusion** — ne jamais conclure « la CI est en cours » d'une liste de checks courte : vérifier d'abord la mergeabilité de la PR.

**Sentry** : les serveurs démarrés par les legs doivent émettre sous `environment: ci` (`SENTRY_ENVIRONMENT` + `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, bakées au build pour les `NEXT_PUBLIC_*`) — voir « Sentry → Environnement & CI/e2e », ne pas dupliquer ici.

**Migration** : coexistence d'abord (matrice purement additive, le job legacy reste le required check), bake sur plusieurs PRs sans divergence de résultat, puis cutover (l'agrégateur devient le required check, retrait du legacy) — jamais de cutover à chaud.

---

## Health check — Endpoint standard

### Structure

```typescript
// src/app/api/health/route.ts
import { prisma } from '@mon-app/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};

  // DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Ajouter d'autres checks selon le projet :
  // checks.stripe = await checkStripe();
  // checks.redis = await checkRedis();

  const healthy = Object.values(checks).every((v) => v === 'ok');

  return Response.json(
    { status: healthy ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
```

### Règles

- Endpoint `/api/health` sur chaque projet
- Vérifie au minimum : DB (Prisma), et les services critiques du projet
- Retourne `200` si tout OK, `503` si un service est down
- Appelé par le cron Vercel `*/5 * * * *` (déjà dans la config standard)
- Le cron health alimente aussi les métriques Grafana (uptime)

---

## Email templates — React Email

### Structure dans `@mon-app/email`

```
packages/email/
├── src/
│   ├── templates/
│   │   ├── welcome.tsx
│   │   ├── reset-password.tsx
│   │   ├── subscription-confirmation.tsx
│   │   └── invoice.tsx
│   ├── components/
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   └── button.tsx
│   └── send.ts             # Helper d'envoi (SES / Knock)
├── package.json
└── tsconfig.json
```

### Pattern template

```tsx
// packages/email/src/templates/welcome.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
  Tailwind,
} from '@react-email/components';

interface WelcomeEmailProps {
  name: string;
  appName: string;
  dashboardUrl: string;
}

export default function WelcomeEmail({ name, appName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <Html lang="fr">
      <Tailwind>
        <Head />
        <Preview>Bienvenue sur {appName}</Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto max-w-xl rounded-lg bg-white px-5 py-10">
            <Heading className="mb-6 text-center text-2xl font-bold text-gray-900">
              Bienvenue, {name} !
            </Heading>
            <Text className="mb-4 text-base leading-7 text-gray-600">
              Ton compte sur {appName} est prêt.
            </Text>
            <Button
              href={dashboardUrl}
              className="block rounded bg-indigo-600 px-6 py-3 text-center text-base font-semibold text-white no-underline"
            >
              Accéder au dashboard
            </Button>
            <Hr className="my-6 border-gray-200" />
            <Text className="text-sm text-gray-400">
              Si tu n'as pas créé ce compte, ignore cet email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  name: 'Julien',
  appName: 'Mon App',
  dashboardUrl: 'https://mon-app.com/dashboard',
} satisfies WelcomeEmailProps;
```

### Règles

- Chaque template a des `PreviewProps` pour le dev (`npx email dev`)
- Props typées avec une interface TypeScript
- Composants réutilisables (header, footer, button) dans `components/`
- Tailwind pour le style (via le composant `<Tailwind>`)
- Textes en français par défaut, i18n si nécessaire
- Tester le rendu sur les principaux clients email (Gmail, Outlook, Apple Mail)

---

## Notifications — Knock

### URL de channel : schéma explicite + domaine canonique (obligatoire)

> **Knock NE SUIT PAS les redirections HTTP.** Une URL de channel http saisie sans schéma (`monsite.com/api/webhooks/x`) est normalisée par Knock en `https://www.…` ; si le site redirige `www → apex` (308), **Knock abandonne** → **tout le canal part dans le vide, en silence**. Vécu : **241 notifications Telegram perdues de mars à juillet 2026**, jamais vues (megahote).

- **Règle** : l'URL d'un channel Knock (webhook / http) s'écrit avec le **schéma explicite** et le **domaine canonique** — celui vers lequel le site redirige, pas l'autre. Vérifier avant de la saisir :
  ```bash
  curl -I https://www.monsite.fr/api/webhooks/x   # 308 → www n'est PAS canonique
  curl -I https://monsite.fr/api/webhooks/x       # 200/405 → apex est canonique
  ```
- **Vérification post-création** (la seule fiable — le dashboard ne montre pas la normalisation) :
  ```bash
  curl -H "Authorization: Bearer $KNOCK_SERVICE_TOKEN" \
    "https://control.knock.app/v1/channels/{key}?environment=production"
  # → environment_settings.production.channel_settings.template.url
  ```

### Diagnostic — `delivery_logs` avant toute hypothèse

Quand une notif est « undelivered », le dashboard n'affiche qu'un statut **opaque**. La requête ET la réponse HTTP **brutes du provider** (status + body) ne sont visibles qu'ici :

```bash
curl -H "Authorization: Bearer $KNOCK_API_KEY" \
  "https://api.knock.app/v1/messages/{message_id}/delivery_logs"
```

C'est le **premier réflexe**, pas le dernier : deux pannes résolues en 2 min grâce à ça — SES `403 InvalidSignatureException` (secret AWS erroné) et `308 redirect` (URL non canonique ci-dessus).

### Ce qui est scriptable (et ce qui ne l'est pas)

| Objet | API | Note |
|---|---|---|
| **Channels** (URL, credentials, secrets) | ❌ **Dashboard uniquement** | La Management API n'expose PAS l'update de channel (`PUT` → 404). Ne pas perdre de temps à scripter. |
| **Workflows** | ✅ `PUT /v1/workflows/{key}?environment=development&commit=true` puis `PUT /v1/commits/promote?to_environment=production` | Pleinement scriptable — permet de provisionner une app entière d'un coup (10 workflows poussés ainsi sur businessfamily). ⚠️ `promote` ne promeut que depuis l'environnement **directement précédent** : sur un workspace à 3 environnements, promouvoir par étapes. |

---

## Database seeding

### Scripts standard

```
scripts/
├── seed-dev.ts              # Données de dev (riches, réalistes)
├── seed-test.ts             # Données de test (minimales, déterministes)
└── db-reset.ts              # Reset complet : drop + migrate + seed
```

### Pattern seed

```typescript
// scripts/seed-dev.ts
import { prisma } from '@mon-app/db';

async function main() {
  console.log('🌱 Seeding database...');

  // Cleanup (respecter l'ordre des FK)
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.com',
      name: 'Admin Test',
      role: 'admin',
    },
  });

  const user = await prisma.user.create({
    data: {
      email: 'user@test.com',
      name: 'User Test',
      role: 'user',
    },
  });

  console.log(`✅ Seeded: ${admin.email}, ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### Règles

- **seed-dev** : données riches et réalistes pour le développement
- **seed-test** : données minimales et déterministes pour les tests E2E
- **db-reset** : reset complet, utilisé avant les tests (`pnpm test:e2e:setup`)
- Les IDs de seed sont stables (pas de `cuid()` aléatoire) pour les tests déterministes
- Exécution via Doppler : `doppler run -- tsx scripts/seed-dev.ts`
- Jamais de seed en production

---

## API error codes — Catalogue d'erreurs métier

### Format standard

```typescript
// src/lib/errors.ts
export const APP_ERRORS = {
  // Auth
  AUTH_001: { code: 'AUTH_001', message: 'Session expirée', httpStatus: 401 },
  AUTH_002: { code: 'AUTH_002', message: 'Permissions insuffisantes', httpStatus: 403 },
  AUTH_003: { code: 'AUTH_003', message: 'Compte désactivé', httpStatus: 403 },

  // Payment
  PAYMENT_001: { code: 'PAYMENT_001', message: 'Paiement échoué', httpStatus: 402 },
  PAYMENT_002: { code: 'PAYMENT_002', message: 'Abonnement expiré', httpStatus: 402 },
  PAYMENT_003: { code: 'PAYMENT_003', message: 'Carte refusée', httpStatus: 402 },

  // Resource
  RESOURCE_001: { code: 'RESOURCE_001', message: 'Ressource non trouvée', httpStatus: 404 },
  RESOURCE_002: { code: 'RESOURCE_002', message: 'Ressource déjà existante', httpStatus: 409 },

  // Validation
  VALIDATION_001: { code: 'VALIDATION_001', message: 'Données invalides', httpStatus: 400 },

  // Rate limit
  RATE_001: { code: 'RATE_001', message: 'Trop de requêtes', httpStatus: 429 },
} as const;

export type AppErrorCode = keyof typeof APP_ERRORS;
```

### Utilisation dans tRPC

```typescript
import { TRPCError } from '@trpc/server';
import { APP_ERRORS } from '@/lib/errors';

throw new TRPCError({
  code: 'FORBIDDEN',
  message: APP_ERRORS.AUTH_002.message,
  cause: { appCode: APP_ERRORS.AUTH_002.code },
});
```

### Règles

- Chaque projet définit son catalogue dans `src/lib/errors.ts`
- Les codes suivent le format `CATEGORIE_XXX`
- Catégories standard : `AUTH`, `PAYMENT`, `RESOURCE`, `VALIDATION`, `RATE`
- Les codes spécifiques au projet s'ajoutent avec des catégories propres
- Les messages sont en français (traduits via i18n si le projet est multilingue)
- Le code d'erreur est retourné au client pour un traitement programmatique

---

## Config Vercel

### Build — Ignored Build Step

Tous les projets monorepo (Turborepo) utilisent `npx turbo-ignore` pour skip les builds quand les fichiers du projet n'ont pas changé. Configuré dans Vercel Project Settings → Git → Ignored Build Step.

Résultat : si tu push un changement dans `apps/web`, seul `apps/web` rebuild. Les autres apps (bot, backoffice, etc.) sont skipées.

Ne PAS configurer sur les projets standalone (un seul app comme businessfamily, jelement).

### Pas de fire-and-forget serverless

Tout effet de bord déclenché **après** la réponse HTTP passe par `waitUntil()` de `@vercel/functions` (ou un step WDK) — jamais `void asyncFn()`, que Vercel tue dès la réponse renvoyée. Toujours un `catch` qui remonte à Sentry.

```typescript
import { waitUntil } from '@vercel/functions';

waitUntil(notifyKnock(payload).catch((err) => Sentry.captureException(err)));
```

- **Pourquoi** : notifications Knock perdues — un `void (async () => …)()` posé après la réponse est tué par Vercel avant de s'exécuter. (GRO-394/68/206/197/196)

### Node.js version

Tous les projets utilisent **Node 24.x**. Configuré dans Vercel Project Settings → General → Node.js Version.

> **Parité CI ↔ prod** : le template CI (`actions/setup-node`) doit pinner **la même major que Vercel** (`node-version: 24`) pour éviter le skew « passe en CI, casse en prod ». À ne pas confondre avec le minimum local du CLI `gjdc` (Node 20+, ADR-0008) : c'est un plancher pour exécuter l'outil, pas le runtime applicatif.

### Headers de sécurité

```typescript
headers: async () => [
  {
    source: "/(.*)",
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ],
  },
],
```

### Cron

```json
{
  "crons": [
    { "path": "/api/cron/health", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/metrics", "schedule": "*/15 * * * *" }
  ]
}
```

### Vercel Workflow DevKit (WDK) — `next dev` ne boote pas sur Windows ARM

**S'applique uniquement aux apps qui utilisent `withWorkflow` (Vercel Workflow DevKit)** dans leur `next.config.*`. Si l'app n'importe pas `workflow/next`, ignorer cette section.

**Symptôme** — Sur **Windows ARM (`win32-arm64`)**, `next dev` exit 1 dès qu'une route workflow compile (souvent au boot ou au premier hit). esbuild crache des erreurs `node-js-module-in-workflow` sur des modules Node-only (`events`, `node:path`, `@prisma/client`, `sharp`, `@hyzyla/pdfium`, `fs`…). L'app elle-même boote ; c'est le bundle workflow qui tue le serveur de dev. **Tout marche sur Vercel (linux-x64)** et sur les machines x64.

**Cause racine (toolchain, pas le code)** — WDK transforme les directives `"use workflow"` / `"use step"` via un **plugin SWC wasm** (`@workflow/swc-plugin`) ; c'est cette transform qui sort le code Node des steps hors du bundle workflow sandboxé (déterministe). Le binding natif `@swc/core` pour **win32-arm64 est livré sans runner de plugin wasm** → SWC **ignore silencieusement** `experimental.plugins` (aucune erreur, même avec un chemin de plugin bidon). Les directives restent non-transformées → les imports Node-only des steps restent dans le bundle workflow → l'esbuild de WDK échoue → `next dev` exit 1. C'est strictement une limite toolchain **local-arm64**, jamais en prod.

**Fix — skip `withWorkflow` sur cette seule plateforme.** Les routes workflow ne tournent pas en local sur win32-arm64 (elles renvoient 500), mais tout le reste boote — ce qui débloque le dev et les boucles e2e. Opt-in via `WORKFLOW_FORCE=1` (ex. dev lancé sous un Node x64 où le plugin fonctionne).

```typescript
// next.config.ts — adapter `baseConfig` au nom réel de ta config finale
// (ex. `sentryWrapped`, `withNextIntl(nextConfig)`, etc.)
import { withWorkflow } from "workflow/next";

// WDK transforme "use workflow"/"use step" via un plugin SWC wasm. Le binding
// @swc/core win32-arm64 n'a pas de runner wasm → plugin ignoré en silence →
// imports Node-only des steps laissés dans le bundle workflow → esbuild échoue
// (node-js-module-in-workflow) → next dev exit 1. Marche sur Vercel (linux-x64).
const workflowSwcPluginUnsupported =
  process.platform === "win32" &&
  process.arch === "arm64" &&
  process.env.WORKFLOW_FORCE !== "1";

if (workflowSwcPluginUnsupported) {
  console.warn(
    "[next.config] win32-arm64 détecté : Workflow DevKit skippé — son plugin SWC " +
      "wasm n'a pas de runner sur cette plateforme. Les routes workflow ne tournent " +
      "pas en local (elles marchent sur Vercel/linux-x64). WORKFLOW_FORCE=1 pour forcer.",
  );
}

export default workflowSwcPluginUnsupported
  ? baseConfig
  : withWorkflow(baseConfig);
```

**Règles** :
- Le skip ne s'active **que** sur `win32-arm64` — aucun impact sur la prod (linux-x64), la CI, macOS, ou Windows x64.
- `withWorkflow` doit rester le wrapper **le plus externe** (il retourne une fonction async `(phase, ctx) => config`, pas un objet config) ; le ternaire ci-dessus le préserve.
- Ne pas utiliser ce skip comme excuse pour ne pas tester les workflows : valider leur comportement sur preview Vercel ou sous un runtime x64.

### Bundles workflow / edge — pas de modules Node

- `next.config.ts` : `serverExternalPackages: ['@sentry/node', '@sentry/profiling-node']` pour que Turbopack/WDK ne bundle pas ces modules Node-only (sinon `Module not found: @opentelemetry/instrumentation` au build — ce n'est pas une dép manquante).
- **Exposer des sous-exports `…/workflows-only`** dans les packages internes pour que le barrel d'index ne tire pas Prisma/pino dans un bundle workflow/edge.
- Skip `withWorkflow` en local sur `win32-arm64` (cf. section WDK ci-dessus).
- **Pourquoi** : « Node.js modules not available in workflow functions » = 5 964 events Sentry. (GRO-170/271/280)

---

## IA — Vercel AI Gateway (OBLIGATOIRE)

> **Règle groupe** : tous les appels IA du portfolio passent **uniquement** par le Vercel AI Gateway. Aucun appel direct aux providers (OpenAI, Anthropic, Google, Perplexity, etc.) n'est autorisé.

### Pourquoi

- Observabilité centralisée (coûts, latence, erreurs par projet)
- Fallback / model routing géré par le gateway
- Une seule clé API (`AI_GATEWAY_API_KEY`) par projet — pas de rotation multi-provider
- Zero data retention option sur les providers sensibles

### Pattern standard — `@groupe-j/ai`

Le wrapper portfolio pré-configure la clé, expose des **presets sémantiques** et re-exporte l'AI SDK. C'est le point d'entrée par défaut — pas d'appel `gateway()` nu dans les modules applicatifs.

```bash
pnpm add @groupe-j/ai ai @ai-sdk/gateway
```

`ai` et `@ai-sdk/gateway` sont des **peerDependencies** (`ai@^6 || ^7`, `@ai-sdk/gateway@^3 || ^4`) — le wrapper ne les tire pas, pour éviter une **double instance** de `ai` dans l'app (`TypeError: private member #s`, GRO-440/442). L'app fournit sa copie unique. Les deux majors ont la même API côté wrapper ; l'AI SDK 7 exige **Node ≥ 22** et déplace `usage`/`reasoningText`/`response` sous `result.finalStep.*` côté app.

```typescript
import { streamText, model, models } from "@groupe-j/ai";

const result = streamText({
  model: model("claude"), // preset → anthropic/claude-sonnet-4-6
  prompt: "...",
});

models.claudeFast; // anthropic/claude-haiku-4-5
models.gptFast;    // openai/gpt-5-mini
```

Un identifiant brut `"provider/model-id"` reste accepté partout où un preset ne convient pas — liste des modèles dans le dashboard Vercel AI Gateway.

### Variables d'environnement

| Variable            | Description                                  | Obligatoire |
| ------------------- | -------------------------------------------- | ----------- |
| `AI_GATEWAY_API_KEY` | Clé API Vercel AI Gateway | ✅ Oui      |

Cross-ref Doppler depuis `dev-conventions.{cfg}.GROUPEJ_AI_GATEWAY_API_KEY` (cf. § Doppler), puis référencer via t3-env :

```typescript
// env.ts
AI_GATEWAY_API_KEY: z.string().min(1),
```

Le wrapper (et, à défaut, le SDK `ai`) lit `AI_GATEWAY_API_KEY` automatiquement.

### Règles strictes

- **❌ INTERDIT** : `import Anthropic from "@anthropic-ai/sdk"` avec `apiKey: process.env.ANTHROPIC_API_KEY`
- **❌ INTERDIT** : `import { google } from "@ai-sdk/google"` / `{ anthropic } from "@ai-sdk/anthropic"` directement (sans gateway)
- **❌ INTERDIT** : tout `baseURL` custom pointant ailleurs que Vercel AI Gateway
- **✅ AUTORISÉ** : `import { openai } from "@ai-sdk/openai"` **uniquement** si `baseURL` pointe sur `https://ai-gateway.vercel.sh/v1` et `apiKey = AI_GATEWAY_API_KEY`
- **✅ AUTORISÉ** : `@groupe-j/ai` (recommandé), ou `gateway("provider/model")` de `@ai-sdk/gateway` pour un cas non couvert

Les packages provider-spécifiques (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@anthropic-ai/sdk`, `openai`) ne s'installent pas dans un nouveau projet. `gjdc audit --ai-gateway` remonte les bypass.

### Exception — package IA interne à une app

**megahote** wrape le gateway dans `@megahote/ai` (antérieur à `@groupe-j/ai`) — dans cette app, passer par ce package, pas par le gateway directement.

### Migration des appels non-conformes

1. `pnpm add @groupe-j/ai ai @ai-sdk/gateway` (peers : `ai@^6 || ^7`)
2. Remplacer l'import provider par `model("<preset>")` / `gateway("provider/model-id")`
3. Supprimer `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` de Doppler (garder `AI_GATEWAY_API_KEY`)
4. Vérifier qu'il n'existe **qu'une seule** copie de `ai` dans le lockfile (double instance → `TypeError: private member #s`)

---

## Analytics & Tracking

### Vercel Analytics (obligatoire) + events custom

- **Obligatoire dans chaque app** via `@vercel/analytics` — `<Analytics />` importé de **`@vercel/analytics/next`** (pas le barrel) dans le root layout, avec un **`beforeSend`** construit par **`createRedactor` de `@groupe-j/seo/analytics`** (≥ 0.9.0) : c'est le **mécanisme de redaction PII officiel**, désormais partagé.

  > 🚨 **Pourquoi partagé, et pas recopié.** Au 2026-07-31, les quatre copies du portefeuille avaient divergé — seuils 11 / 16 / 20, déclencheurs et remplacements différents. **Deux étaient fautives** : LeDossierParfait ne vidait pas `url.hash` (porteur classique des jetons OAuth et magic-link), et pronostic exigeait `!segment.includes("-")`, laissant passer **en clair** tout identifiant contenant un tiret. Un correctif dans l'un ne se propageait nulle part.
  >
  > Le **seuil reste un paramètre**, pas une constante : il doit dépasser le plus long segment *statique* de l'app, sinon une vraie page disparaît des statistiques. La politique est partagée, le calibrage reste local. Idem pour `publicPrefixes` (un slug public est souvent la donnée qu'on veut mesurer) et `idRoutes` (là où l'on connaît la position d'un identifiant, on ne parie pas sur une heuristique de forme). First-party, RGPD-friendly, sans consentement. `gjdc check` le recommande sur toute app Next qui ne l'a pas.
- ⚠️ **Le package ne suffit pas** : Web Analytics doit être **activé au niveau projet** (`vercel project web-analytics <name>` ou toggle dashboard). Sans ça, le `<Analytics />` s'exécute mais **aucune donnée n'est collectée**. Après install, **vérifier que la data arrive** (dashboard Vercel → onglet Analytics). Confirmer l'état en non-interactif : `vercel project web-analytics <name> --format json`.
- **Pages vues, referrers, géo, device, UTM** : automatiques, zéro config.
- **Métriques produit / funnel custom → `track()` de Vercel Analytics** (PLUS Grafana Cloud : abandonné, coûteux et à part). Grafana ne reste que pour l'ops/infra time-series si vraiment nécessaire, jamais pour le produit.
- **Conversions à source serveur** (webhook paiement, réservation confirmée) → `await track` de **`@vercel/analytics/server`**, pas le client — la conversion est comptée là où elle a vraiment lieu.

**Taxonomie d'events standard** (portfolio-wide — helper typé dans [`templates/analytics/`](./templates/analytics/), copié/adapté par app) :

| Event | Props | Quand |
|---|---|---|
| `sign_up` | `{ method }` | inscription réussie |
| `login` | `{ method }` | connexion réussie |
| `cta_click` | `{ location, label }` | clic sur un CTA clé |
| `contact_submit` | `{ form }` | formulaire de contact envoyé |
| `conversion` | `{ kind, value? }` | acte de valeur (devis, réservation, paiement) |
| `funnel_step` | `{ funnel, step }` | étape d'un tunnel — **rang encodé dans `step`** : `"03_surface"` |
| `outbound_click` | `{ href }` | clic sortant |
| `search` | `{ query_len }` | recherche (jamais la query brute) |

Events spécifiques produit en plus (ex. ridesamui `booking_started/completed`, jpc `plu_search`, jelement `devis_request`). **Règle PII** : jamais d'email/nom/query brute dans les props (même logique que la redaction Sentry) — que des enums, compteurs, IDs non-personnels.

#### 🚨 Limites dures du plan — vérifiées le 2026-07-31

| | Hobby | **Pro (le nôtre)** | Pro + Analytics Plus |
|---|---|---|---|
| Événements inclus | 50 000/mois | **aucun** | aucun |
| Événements supplémentaires | — | **0,03 $ / 1 000** | 0,03 $ / 1 000 |
| **Propriétés par event custom** | — | **2** | 8 |
| Fenêtre de rapport | 1 mois | 12 mois | 24 mois |
| Paramètres UTM | — | non | inclus |

- **2 propriétés maximum.** Cette table prescrivait `funnel_step { funnel, step, index }` — **trois props, donc rejeté**. Corrigé : le rang est encodé dans `step` (`"01_service"`, `"02_surface"`… sur deux chiffres pour que `10_` se classe après `09_`). Le tri lexical redonne l'ordre du parcours sans consommer de propriété.
- **Un seul nom d'événement par entonnoir**, le parcours en prop. `by=eventData/step` rend alors l'entonnoir entier en une requête **et permet de comparer les sites entre eux**. Un nom d'événement par app (`wizard_step_reached`, `quote_step_reached`…) oblige à une requête sur mesure par site et interdit toute comparaison.
- Valeurs autorisées : `string`, `number`, `boolean`, `null`. **Objets imbriqués non supportés.** Nom, clés et valeurs : **255 caractères max**.
- **Clés en `[a-z0-9_]`** : toute autre clé doit être échappée entre quotes simples dans *chaque* requête (`eventData/'ma-cle' eq 'x'`) — un coût permanent pour un choix de nommage d'une seconde.
- **Le quota est partagé entre tous les projets de l'équipe**, et Pro n'inclut aucun événement. Chaque étape d'entonnoir est facturée : instrumenter ce qui oriente une décision, pas tout ce qui bouge.

#### Déduplication et dénominateur

- **Dédupliquer par session** : une étape ne compte qu'une fois, même après un aller-retour « Précédent / Suivant ». Sans ça un taux de passage peut **dépasser 100 %** et l'entonnoir devient illisible.
- **L'étape d'entrée doit émettre.** La déduire des pages vues crée un maillon mesuré autrement que les autres — donc non comparable, et gonflé par les rechargements.

#### Métriques HORS entonnoir — les angles morts

Un entonnoir ne montre que ce qu'on a prévu. Ce qui suit est invisible dans les pages vues et **change des décisions** :

| Métrique | Pourquoi elle manque toujours |
|---|---|
| `consent_decision { action, scope }` | Sans taux d'acceptation, toute décision sur le consentement est aveugle. ridesamui a mesuré 0 visiteur pendant 11 semaines sans qu'on sache si c'était 0 % ou 5 % d'opt-in. |
| échec d'API externe `{ api, reason }` | Un appel tiers lent ou throttlé dégrade l'expérience **en silence** — la personne ne peut pas nous le signaler. |
| recherche sans résultat | Un trou de contenu ou de couverture, invisible dans les pages vues. |
| erreur montrée à l'utilisateur | Invisible par construction, pour la même raison. |
| clic sortant / partenaire | De l'attribution perdue. |

**Le côté échec avant le côté succès.** Un envoi réussi finit toujours par se voir ; un envoi perdu, jamais.

### ❌ Pas de Speed Insights

- **`@vercel/speed-insights` est INTERDIT** : facturé **$10/projet/mois**. Il n'a d'ailleurs jamais été activé sur aucun projet Vercel du portfolio — les montages trouvés dans 5 repos le 2026-07-25 **payaient le coût sans collecter la moindre donnée** (~600 ms de fenêtre pré-paint mesurés sur jepeuxconstruire, par différence avec une page témoin). Tous retirés.

- ⚠️ **Où obtenir les Core Web Vitals, alors — corrigé le 2026-07-25.** Cette section prescrivait « GSC (CrUX) + PageSpeed », et **ça ne marche pas à notre échelle** :
  - **CrUX est VIDE sur les 12 propriétés** du portfolio : Google n'a de données de terrain que pour les origines à fort trafic Chrome, et aucune ne franchit le seuil. La colonne « CWV terrain » de l'audit est restée vide depuis sa création.
    - 🔄 **Plus vrai depuis le 2026-08-16 : `jepeuxconstruire.fr` a franchi le seuil** et renvoie désormais `LCP 3 799 ms` 🟠, `INP 140 ms` 🟢, `CLS 0,020` 🟢. Le seuil se franchit sans prévenir — **re-vérifier CrUX à chaque audit** plutôt que de supposer la colonne vide. Les 11 autres restent sans données.
  - **PageSpeed est du LABORATOIRE simulé** (bridage 1,6 Mbit/s, CPU ×4) : il modélise un mobile bas de gamme sur 3G, pas l'audience réelle. Il a **contredit le terrain sur 2 sites** — j-element mesuré à 4,2 s en labo est à **2,00 s chez ses vrais utilisateurs**, tandis que linegroup souffre d'un TTFB de 4,7 s que le labo ne peut structurellement pas voir puisqu'il mesure depuis l'infrastructure de Google. Une mesure PSI unique varie en outre jusqu'à un facteur 5 : prendre une **médiane de plusieurs passages**, avec un fragment distinct par passage (`#psi-run-2`) pour contourner le cache PSI sans changer la réponse du serveur.
    - 🚨 **Aggravé le 2026-08-16 : PSI se trompe dans les DEUX sens, d'un facteur ~4.** On le croyait seulement pessimiste ; il est aussi franchement optimiste. Sur `jepeuxconstruire` il annonce **98/100 et un LCP de 2,1 s** 🟢 pour un terrain Sentry à **5,26 s** 🔴 (205 chargements) — et CrUX, arrivé entre-temps, tranche à 3,8 s, donc **du côté de Sentry**. Sur `j-element` il annonce **4,6 s** 🔴 pour un terrain à **1,09 s** 🟢 (250 chargements) ; sur `ridesamui`, **6,5 s** 🔴 pour **1,62 s** 🟢 (285 chargements). Un instrument qui se trompe dans les deux sens n'a pas de biais rattrapable. ➡️ **PSI ne sert plus de verdict** : le verdict est Sentry, l'arbitre est CrUX là où il existe, et PSI ne garde qu'un usage de diagnostic — dire *quoi* optimiser sur une page, une fois la décision prise ailleurs.
  - ✅ **La vraie source est Sentry, et elle existe déjà.** Le SDK capture LCP/CLS/INP/FCP/TTFB sur **chaque pageload** dès que `browserTracingIntegration` est actif — c'est le cas partout via `@groupe-j/sentry-config` (`tracesSampler`, 10 % en production). Requête : `GET https://sentry.io/api/0/organizations/{org}/events/?field=p75(measurements.lcp)&query=transaction.op:pageload&statsPeriod=30d&project={id}` (`GROUPEJ_SENTRY_TOKEN` + `SENTRY_ORG` dans Doppler `dev-conventions/prd`). **Publier l'effectif à côté de la valeur** : un p75 sur 2 pageloads n'est pas un fait.
- Les CWV restent un facteur SEO — mais **seule la donnée de terrain compte pour le classement**, et Google n'en dispose que via CrUX. Tant qu'une propriété est sous le seuil CrUX, son LCP n'a **aucun effet de classement** : le travail de performance y est un investissement d'expérience utilisateur, pas un levier SEO. Le prioriser comme tel.
  - ⚠️ **Cette règle cesse de s'appliquer dès qu'une propriété franchit le seuil** — c'est le cas de `jepeuxconstruire.fr` depuis le 2026-08-16. Sur elle, le LCP est **redevenu un signal de classement réel** et se priorise comme tel. Vérifier la présence de données CrUX **avant** d'appliquer la règle ci-dessus, jamais l'inverse.

### Tags standard — GA4 + Meta Pixel

Chaque projet inclut par défaut :

- **Google Analytics 4** (GA4) — chargé via `next/script` strategy `afterInteractive`
- **Meta Pixel** — chargé via `next/script` strategy `afterInteractive`
- **Vercel Analytics** — via `@vercel/analytics` (first-party, pas soumis au consentement)
- Tout autre tag analytics ou marketing nécessaire

### Consentement — Tarteaucitron Pro (auto-détection)

> 🚨 **Cette section prescrivait Tarteaucitron Pro. Corrigé le 2026-07-31 : on est en AUTO-HÉBERGÉ.**
>
> Le compte Pro n'a **jamais existé** — aucun `NEXT_PUBLIC_TARTEAUCITRON_UUID` dans Vercel ni dans Doppler, vérifié sur 5 projets × 3 configs. Or l'ancien composant faisait `if (!uuid) return null` : **le bandeau de `collab.archi` n'a donc jamais rendu en production**, sans la moindre erreur. Une variable absente supprimait le consentement entier.
>
> Décision : auto-hébergé, par économie (Pro coûte 190 €/an).

- **CMP** : `tarteaucitronjs` en npm, **auto-hébergé**, servi depuis notre propre origine — pas de requête tierce avant consentement.
- **Composant partagé** : `ConsentProvider` de **`@groupe-j/ui`** (≥ 0.4.0). Il porte le mécanisme — import dynamique, enregistrement des descripteurs **avant `init`**, remontée d'échec. L'app fournit la politique : locale, persistance du choix, outil de report.
- **`onError` est obligatoire, à dessein.** Si le CMP ne se charge pas, la bannière n'existe pas et des scripts non essentiels peuvent partir sans consentement : c'est un incident de conformité, pas un avertissement.
- **Décision de montage** : trois états, jamais deux. « Pas encore initialisé » n'est PAS « autorisé » — le CMP se charge de façon asynchrone, et traiter l'indéterminé comme un accord envoie la page vue **avant** qu'un refus mémorisé ait pu être restauré. Lire le cookie de consentement et `doNotTrack` soi-même, de façon synchrone.
- ⚠️ **Ce qu'on perd sans Pro : la détection automatique des services tiers.** La liste vit en code et **elle dérivera** — un embed ajouté sans service déclaré ne produit aucune erreur. C'est le prix assumé ; il se paie en **test** (contrôle des hôtes tiers réellement chargés), pas en abonnement.
- **Pièges vérifiés en source (`tarteaucitronjs@1.31.0`)** :
  - en autostart (`needConsent: false`), Tarteaucitron pose `state[key] = true` mais émet `_loaded` / `_consentModeOk` — **jamais `_allowed`** (l. 1235-1244) ;
  - les descripteurs doivent être enregistrés **avant `init`**, sinon les clés du `job` sont **silencieusement ignorées** ;
  - format du cookie : `!<service>=<wait|true|false>` (`cookie.create`, l. 2015-2043) ;
  - le paquet ne fournit **aucune déclaration TypeScript**, et il n'existe pas de `@types/tarteaucitronjs`.

### Variables d'env tracking

```
# Aucune variable pour le CMP : on est en auto-hébergé, il n'y a pas d'UUID.
# (`NEXT_PUBLIC_TARTEAUCITRON_UUID` était prescrit ici et n'a jamais été défini
#  nulle part — c'est ce qui rendait le bandeau d'archicollab inerte.)

# Tags tiers — en auto-hébergé, chacun DOIT être déclaré comme service
# Tarteaucitron. Rien n'est intercepté automatiquement : un tag non déclaré
# se charge sans consentement, en silence.
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_META_PIXEL_ID=XXXXXXXXXXXXXXXX
```

### Composant ConsentProvider (`@groupe-j/ui` ≥ 0.4.0)

```tsx
// Dans le root layout, avant </body>
<ConsentProvider
  config={TARTEAUCITRON_INIT_CONFIG}
  services={SERVICE_DESCRIPTORS}   // enregistrés AVANT init, sinon ignorés
  locale={locale}
  onConsentChange={(state) => persistConsent(state)}
  onError={(error, context) => Sentry.captureException(error, { tags: { context } })}
/>
```

`onError` n'est pas optionnel : un CMP qui ne se charge pas est un incident de conformité.

---

## Images & Assets

### Storage

- **Assets statiques** (logos, icônes, illustrations) : dossier `public/` de Next.js
- **Uploads utilisateur** (avatars, documents, pièces jointes) : **Vercel Blob** ou **Uploadthing**
- Jamais d'uploads user dans `public/`

### Optimisation

- Utiliser `next/image` pour toutes les images affichées
- Toujours fournir `width`, `height` et `alt`
- Formats modernes : WebP ou AVIF quand possible
- Images de plus de 200ko → optimiser avant upload

---

## SEO — Checklist par page publique

Chaque page dans `(public)/` doit avoir :

- [ ] `metadata` exporté (title + description uniques)
- [ ] Open Graph tags (title, description, image)
- [ ] Twitter Card tags
- [ ] URL canonique
- [ ] Balise `h1` unique
- [ ] Images avec attribut `alt`
- [ ] Structured data (JSON-LD) si pertinent (product, article, FAQ)
- [ ] Lien dans le sitemap (`sitemap.ts`)

### Fichiers SEO obligatoires

- `app/sitemap.ts` — sitemap dynamique
- `app/robots.ts` — config robots (cf. profils de crawl ci-dessous)
- `app/manifest.ts` — PWA manifest (si applicable)
- `app/opengraph-image.tsx` — image OG par défaut
- `public/llms.txt` — sur les **vitrines** uniquement (cf. ci-dessous)

### robots.txt — profils de crawl

Trois profils selon le type de surface (génère-les avec `gjdc seo init --profile <profil>`) :

| Profil | Politique | Pour |
|---|---|---|
| `vitrine` | `Allow: /` + opt-out entraînement IA + `Sitemap:` | sites vitrines / contenu public |
| `saas-public` | idem + `Disallow` `/api/` `/dashboard/` `/admin/` `/auth/` | surface marketing d'un SaaS authentifié |
| `internal` | `Disallow: /` (tout) | apps internes / auth-only, non indexables |

**Politique crawlers IA (surfaces publiques) — allow-all + opt-out entraînement :**

- **Autorisés** (via `User-agent: *`) : `Googlebot`, `Bingbot`, `Applebot`, `ClaudeBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`. Ils apportent citations + trafic ; les bloquer fait perdre du trafic sans réduire les citations.
- **Opt-out entraînement** (`Disallow: /`) : `GPTBot`, `CCBot`, `Bytespider`, `anthropic-ai`, `cohere-ai`, `Google-Extended`, `Applebot-Extended`. Gratuit en trafic, protège l'IP.

Forme : `app/robots.ts` (Next, typé `MetadataRoute.Robots`) ; `public/robots.txt` statique pour les sites non-Next.

### llms.txt (discoverability agents)

Format [llmstxt.org](https://llmstxt.org) : `# Titre`, puis `> résumé` (blockquote), puis sections `##` de liens markdown vers les pages clés.

- **Forme** : `public/llms.txt` statique par défaut (servi `text/plain`). Variante route handler `app/llms.txt/route.ts` si la liste de liens doit venir d'un CMS.
- **Périmètre** : **vitrines uniquement**. Son ROI search/AEO est aujourd'hui ~nul (Google ne le supporte pas) ; sa valeur réelle est pour les **outils dev / agents (Cursor, Claude Code, MCP)**. On le ship comme pari low-cost, pas comme levier AEO. Les vrais leviers AEO restent robots + sitemap + JSON-LD + contenu structuré.
- **Maintenance** : un llms.txt obsolète induit les agents en erreur — mets-le à jour ou supprime-le.

Politique complète + justifications : **ADR-0017**. Génération : `gjdc seo init`.

---

## SEO structurel (best practices)

> La checklist ci-dessus couvre le SEO **par page**. Cette section couvre le SEO **structurel** (racine du `app/`) : les recettes prouvées cette session sur [groupe-j.fr](https://groupe-j.fr) ([GRO-480](https://linear.app/groupe-j/issue/GRO-480)) et **jepeuxconstruire** — implémentations de référence. Toute app user-facing doit les avoir par convention. Le crawl (`robots.ts` / `llms.txt`) est traité ci-dessus ; ne pas dupliquer.

### 1. Metadata API — `metadata` racine + `generateMetadata` par page

Dans `app/layout.tsx`, exporter un `metadata` racine qui pose les defaults partagés :

```ts
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://groupe-j.fr"), // requis pour résoudre les URLs OG/canonical relatives
  title: {
    default: "Groupe J — Studio produit & développement", // ⚠️ « architecte », « cabinet
    // d'architecture » : titres réglementés (Ordre) — jamais sans inscription.
    template: "%s | Groupe J", // les pages n'exportent que leur titre court
  },
  description: "…", // 150–160 caractères, unique par page
  keywords: ["architecture", "…"], // signal faible mais gratuit ; garder court et pertinent
  alternates: { canonical: "/" }, // canonical par page = chemin propre, sans query params
  robots: { index: true, follow: true }, // passer à false sur les pages auth/utilitaires
};
```

- **Une seule source de vérité** pour le nom de marque, l'URL et le template — les pages surchargent `title` (string court, le template ajoute le suffixe) + `description` + `alternates.canonical`.
- `metadataBase` **obligatoire** : sans lui, les `opengraph-image` et canonicals relatifs ne se résolvent pas en absolu.
- `robots` par page pour exclure les surfaces non indexables (dashboard, tunnels) — complète `app/robots.ts` (crawl-level), ne le remplace pas.

### 2. JSON-LD `Organization` — capter la requête de marque (entity SEO)

**C'est le levier le plus rentable et le plus négligé.** Mesure terrain groupe-j.fr : **2984 impressions captives sur la requête de marque à CTR 0,2 %** avant d'ajouter l'entité — Google affichait la marque sans knowledge panel ni sitelinks. Un `Organization` JSON-LD dans le layout racine donne à Google l'entité à rattacher à la requête de marque.

```tsx
// app/layout.tsx — dans <body>, un <script type="application/ld+json">
const org = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Groupe J",
  alternateName: ["Groupe J", "GroupeJ", "Groupe-J", "groupe j"], // TOUTES les graphies de la requête de marque
  url: "https://groupe-j.fr",
  logo: "https://groupe-j.fr/logo.png",
  founder: { "@type": "Person", name: "Julien Condello" },
  subOrganization: [{ "@type": "Organization", name: "J Element" }],
  owns: [{ "@type": "WebSite", name: "Je peux construire", url: "https://jepeuxconstruire.fr" }],
  sameAs: ["https://www.linkedin.com/…", "https://…"], // profils sociaux = liens d'entité
  areaServed: "FR",
};
```

- `alternateName` : lister **toutes** les orthographes que les gens tapent (avec/sans espace/tiret/casse) — c'est ce qui matche la requête de marque.
- `founder` / `subOrganization` / `owns` : construisent le graphe d'entité (le portfolio Groupe J → produits) que Google exploite pour les sitelinks et le knowledge panel.
- `sameAs` : profils officiels — signaux de désambiguïsation de l'entité.
- Injecter via `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />`. Pour les entités par page (Product, Article, FAQ, LocalBusiness) → cf. checklist par page.
- **⚠️ Jamais d'email en clair dans le JSON-LD (anti-harvesting).** Ne PAS ajouter de champ `email:` sur `Organization`/`ContactPoint` — le structured data est moissonné par les spammeurs (source **confirmée** du harvesting de `contact@`/`hello@`/`julien@` du portfolio → campagne phishing « faux Cloudflare » 2026-07). Pour un point de contact : `contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: "<page contact ou mentions-légales>" }` (+ `telephone` si déjà public) — **jamais** le champ `email`. Même règle pour toute adresse sur les pages publiques : **formulaire de contact > `mailto:`** (l'obfuscation JS/CSS/image est du théâtre, les scrapers 2026 exécutent le JS). Publier des **alias role** (`contact@`, `hello@`) via Cloudflare Email Routing, pas la vraie boîte (brûlable/remplaçable). Côté WHOIS : registrar en redaction (OVH « masquer données titulaire » ou Cloudflare Registrar). Réf : mémoire `email_exposure_prevention`.

### 3. OpenGraph + Twitter — `opengraph-image.tsx` (une image, les deux réseaux)

Un seul `app/opengraph-image.tsx` (image OG de marque, générée dynamiquement via `ImageResponse` / `next/og`, 1200×630) **couvre OpenGraph ET Twitter** — Next.js émet automatiquement les balises `og:image` et `twitter:image`. Pas besoin d'un `twitter-image.tsx` séparé si l'image est identique.

- Compléter le `metadata` racine avec `openGraph: { type, siteName, locale }` et `twitter: { card: "summary_large_image" }` — l'image, elle, vient du fichier `opengraph-image`.
- Variante par page : un `opengraph-image.tsx` dans le dossier de la route surcharge le défaut (ex. carte de partage d'un dossier PLU sur jepeuxconstruire).

### 4. `sitemap.ts` + `robots.ts` + `llms.txt` (crawl)

Traités en détail dans **[§ SEO — Checklist](#seo--checklist-par-page-publique)** ci-dessus (profils de crawl, politique bots IA, `llms.txt` vitrines) et **[ADR-0017](./decisions/0017-robots-llms-crawl-policy.md)**. Générés par `gjdc seo init`. Rappel : `app/sitemap.ts` typé `MetadataRoute.Sitemap`, `app/robots.ts` typé `MetadataRoute.Robots`, `llms.txt` par profil de crawl.

### 5. Icônes + manifest + theme color

- `app/favicon.ico` — fallback historique (navigateurs anciens, onglets).
- `app/icon.png` (ou `icon.svg`) + `app/apple-icon.png` (180×180) — Next.js émet `<link rel="icon">` et `<link rel="apple-touch-icon">` automatiquement.
- `app/manifest.ts` (typé `MetadataRoute.Manifest`) — PWA : `name`, `short_name`, `theme_color`, `background_color`, `icons` (192 + 512), `display: "standalone"`.
- `viewport` (export dédié, **pas** dans `metadata` depuis Next 14+) : `export const viewport: Viewport = { themeColor: "#…" }` — doit matcher le `theme_color` du manifest.

### 6. Gate Lighthouse — SEO / Perf / A11y ≥ 95

Le workflow réutilisable **`lighthouse.yml`** (`groupe-j/.github`) tourne sur les PR des apps user-facing et poste un commentaire avec les scores. **Seuil bloquant : SEO, Performance, Accessibility et Best Practices ≥ 95.** Complète le [Performance budget](#performance-budget) : Lighthouse = gate **laboratoire** en CI, le **terrain** se lit dans Sentry (jamais Speed Insights, interdit).

---

## Accessibilité (a11y) — Règles minimum

- Tous les éléments interactifs sont accessibles au clavier (Tab, Enter, Escape)
- Focus visible sur tous les éléments interactifs
- Contraste minimum WCAG AA (4.5:1 pour le texte normal)
- Tous les `<img>` ont un `alt` (vide si décoratif : `alt=""`)
- Les formulaires ont des `<label>` associés à chaque input
- Les modales piègent le focus (focus trap)
- Les messages d'erreur sont liés aux inputs via `aria-describedby`
- Les icônes seules ont un `aria-label`
- Tester avec le lecteur d'écran au moins une fois par feature majeure

---

## UI/UX

### Composants

- **shadcn/ui** comme base (via `@mon-app/ui` ou local)
- Personnaliser via CSS variables
- Composant custom = `components/[feature]/`

### Tailwind

- Mobile-first
- > 5 classes → extraire dans un composant
- `cn()` pour classes conditionnelles
- Pas de `!important`
- **Tailwind v4 — tout reset/CSS global dans `@layer base`** : un reset hors layer (`* { margin: 0 }`, `a { … }`, etc.) a la **priorité absolue** sur les utilitaires `@layer utilities` et les écrase. `@source` doit couvrir les répertoires cross-package (sinon classes purgées).
  - **Pourquoi** : reset non-layered → CTA blanc-sur-blanc, `mx-auto` cassé, viewer cassé. (GRO-414/415/395/284)

### États obligatoires

- ⏳ **Loading** : skeleton/spinner
- 📭 **Empty** : message + CTA
- ❌ **Error** : message + action
- ✅ **Success** : toast/feedback

### Responsive

- 3 breakpoints : 375px, 768px, 1280px
- Tableaux → cartes sur mobile
- Nav latérale → hamburger sur mobile

> **Pourquoi** : 375 / 768 / 1280 ne sont pas arbitraires — ils ciblent les trois classes d'appareils réelles du trafic (smartphone portrait, tablette/petit laptop, desktop standard) et s'alignent sur les breakpoints `sm`/`md`/`xl` de Tailwind, pour tester les mêmes ruptures que celles effectivement rendues.

---

## Dépendances

### 🚨 Comment épingler une version (audit portefeuille 2026-08-05)

**Règle : `^x.y.z` par défaut. Une version exacte ou un pin dur exige une raison
écrite au-dessus de la ligne.**

Trois façons d'écrire une version rendent un paquet **invisible à Dependabot**, et
les trois produisent le même symptôme — un dépôt qui « n'a rien à mettre à jour » —
pour trois causes différentes. Aucune ne déclenche d'erreur :

| écriture | ce que fait Dependabot | comment ça se voit |
|---|---|---|
| `"next": "^16.2.6"` | ✅ propose les minors et patchs | normal |
| `"next": "16.2.6"` **exact** | ❌ **aucune PR** — pas de plage où remonter | silence total |
| `pnpm.overrides.next: "16.2.6"` **pin dur** | ⚠️ PR proposée mais **infusionnable** | `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` |
| `"^1.1.16"` **borne trop basse** | ✅ propose, mais **pnpm ne remonte pas** | lockfile figé à 1.1.16 |

#### Le pin dur dans `pnpm.overrides` est le pire des trois

Dependabot met à jour le **lockfile** mais ne sait pas éditer le bloc
`pnpm.overrides` du `package.json`. Les deux divergent, et `--frozen-lockfile`
refuse **toute** installation — donc **toutes les PRs du dépôt échouent**, quel que
soit leur contenu, sur un message qui pointe vers l'installation et pas vers la cause.

Mesuré sur `pronostic` le 2026-08-05 : `next` épinglé en dur, 9 alertes dont 4 HIGH
accumulées, et l'échec s'affichait sur `Lint & Typecheck`.

#### Une borne large ne suit pas

`^1.1.16` **admet** 1.1.18, mais **pnpm ne remonte pas à l'intérieur d'une plage**
sur un `install`. Écrire `^x.y.z` gèle `x.y.z` aussi sûrement qu'un pin tant que
personne ne relance la résolution. Le caret donne l'illusion d'un suivi qui n'a pas
lieu — vérifier le **lockfile**, jamais la plage déclarée.

#### Surcharges de sécurité : bornées par majeur, jamais globales

```json
"pnpm": { "overrides": {
  "brace-expansion@1": "^1.1.18",
  "brace-expansion@2": "^2.1.4",
  "brace-expansion@5": "^5.0.9"
}}
```

Plusieurs lignes majeures coexistent réellement dans un arbre pnpm (`minimatch@3`
exige `^1.1.7`, `minimatch@9` exige `^2.0.1`, `minimatch@10` exige `^5.0.5`). Une
surcharge **globale** casserait deux consommateurs sur trois — et **en silence**,
sans avertissement d'installation ni erreur de type.

⚠️ Une borne par majeur peut **rater sa cible** quand un paquet déclare une plage
plus fine : `undici@7: ^7.29.0` n'atteignait pas `@vercel/blob@2.3.3`, qui exige
`undici: ^7.28.0`. **Toujours relire le lockfile après**, jamais supposer que la
surcharge a mordu.

#### Vérifier, et contre quoi

Contre les **plages vulnérables réelles des avis**, relues par l'API — jamais contre
les versions cibles supposées. Cette précaution a démenti quatre suppositions en une
session, dont une régression qui rétablissait deux failles HIGH.

```bash
gh api repos/groupe-j/<repo>/dependabot/alerts?state=open --jq   '.[] | "\(.dependency.package.name) \(.security_vulnerability.vulnerable_version_range) -> \(.security_vulnerability.first_patched_version.identifier)"'
```

#### 🚨 Les alertes ne comptent que la branche PAR DÉFAUT

Corollaire direct : un épinglage n'est réparé que lorsque le correctif atteint la
branche par défaut. Les mesures et les conséquences sont dans « Palier `staging`
› Pourquoi cette pièce s'est INVERSÉE ».


### Quand ajouter une lib

- ✅ Si la lib résout un problème complexe et bien maintenu (Stripe, Prisma, tRPC, next-intl)
- ✅ Si coder soi-même prendrait > 2 jours et que la lib est mature (> 1k stars, mise à jour récente)
- ❌ Si c'est un petit utilitaire qu'on peut écrire en 20 lignes
- ❌ Si la lib a des dépendances lourdes pour un usage mineur
- ❌ Si la lib n'est plus maintenue (dernier commit > 6 mois, issues non répondues)

### Avant d'ajouter une lib

1. Vérifier sur npm : dernière mise à jour, taille du bundle, nombre de dépendances
2. Vérifier la compatibilité avec le stack (Next.js App Router, React Server Components)
3. Consulter la doc via Context7

### Mise à jour des dépendances

- **Minors/patches** : auto-mergés par le workflow `dependabot-auto-merge.yml` si la CI est verte
- **Majors** : planifier, lire le changelog, tester — ne pas accumuler le retard. **Jamais auto-mergés.**
- **Sécurité** : appliquer immédiatement (`pnpm audit`)
- Après chaque mise à jour manuelle : `pnpm lint && pnpm tsc --noEmit && pnpm test`

### Dependabot — configuration obligatoire des applications

Quatre pièces, indissociables. Chacune existe parce que son absence a causé une panne réelle.

`gjdc setup` les installe. Il n'existe qu'**un seul gabarit** — `github/dependabot.yml` — pour tout le portefeuille ; ce qui varie selon le modèle **déclaré** dans `config/staging-model.json` (jamais la simple existence d'une branche `staging`, cf. « Palier `staging` — modèle unique des applications »), c'est `sync-staging.yml`, posé sur les repos `promotion` seulement. Un `.github/dependabot.yml` ou `sync-staging.yml` déjà présent n'est **jamais écrasé** sans `--force` — et si le fichier préservé ne porte pas ce qui est attendu, `setup` **sort en non-zéro** en nommant la pièce manquante plutôt que de laisser une installation partielle.

**1. ⛔ AUCUN `target-branch`, nulle part** — ni sur les paquets publiés, ni sur les applications à branche `staging` : Dependabot vise la **branche par défaut**, seule sur laquelle GitHub calcule les alertes. *Cette règle prescrivait le contraire jusqu'au 2026-08-05 ; les trois mesures qui l'ont retournée sont dans « Palier `staging` › Pourquoi cette pièce s'est INVERSÉE ».* Corollaire pour lire les compteurs : **toutes les PR Dependabot visent `main`, y compris sur les repos à `staging`** — elles redescendent par `sync-staging.yml`.

⚠️ **L'entrée npm doit porter `registries: npm-github`.** Sans ce bloc, Dependabot n'a qu'une credential `git_source github.com` et échoue en `security_update_not_possible` dès qu'un `@groupe-j/*` privé entre dans l'arbre — panne muette, aucun build rouge. C'était la raison d'être de la « seconde entrée npm » qu'imposait l'ancien modèle : le contournement disparaît avec `target-branch`, **le besoin demeure**.

**2. `sync-staging.yml`** — fast-forward de `staging` vers `main` après chaque release (cf. « Palier `staging` »). Les montées atterrissant sur `main`, sans ce chemin de retour `staging` accumule du retard et chaque promotion risque d'annuler des correctifs.

**3. `cooldown`** — la contrepartie de l'auto-merge, portée par les gabarits distribués (rien à ajouter à la main). Sans délai, une dépendance compromise publiée il y a dix minutes peut être mergée sans qu'aucun humain ne la voie : c'est le vecteur des compromissions npm récentes.

```yaml
    cooldown:
      default-days: 7
      semver-major-days: 30
      semver-minor-days: 7
```

- Le plancher est **7 jours**, pas 3 — plus strict que le défaut GitHub, et exigé par la règle Semgrep `dependabot-missing-cooldown`.
- Ne pas descendre `semver-patch-days` sous le plancher. Traiter un patch comme moins risqué qu'un minor relève de la **compatibilité**, pas de la **sécurité** : une compromission se déguise volontiers en patch, précisément parce que c'est la mise à jour qu'on relit le moins.
- `github-actions` ne supporte que `default-days` — le mettre à **7** : une action compromise s'exécute avec les credentials du dépôt et l'accès aux secrets, rayon d'explosion supérieur à un paquet npm. Et l'écosystème étant en cadence mensuelle, le délai ne coûte rien.
- **`cooldown` ne s'applique jamais aux mises à jour de sécurité** — un correctif de faille n'est donc pas retardé.

**4. Étiquetage `release:hotfix` des PRs de sécurité** — nécessaire uniquement sur les repos dotés d'un garde-fou de promotion. Toutes les PR Dependabot visant désormais la branche par défaut ([doc](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)), un garde-fou qui n'accepte sur `main` que des promotions les refuse toutes : elles s'accumulent sans être ni auto-mergées ni mergeables.

#### Pièges vérifiés

- **GitHub ne lit `.github/dependabot.yml` que sur la branche par défaut.** Les jobs déclenchés par `workflow_run` ou `push: branches: [main]` s'y exécutent aussi. Une PR de configuration vers `staging` produit un fichier **inerte** : mergé, vert, sans aucun effet.
- **Le job `merge` se déclenche sur CHAQUE CI verte**, PRs humaines comprises. Tout échec bruyant qu'on y ajoute doit être scopé aux branches `dependabot/*` — sinon ~85 % des runs rougissent pour rien.
- **Le format de `author.login` a déjà changé** (`dependabot[bot]` → `app/dependabot`). Ne jamais le figer en dur : tester les deux formats et exiger `is_bot == true`. Ce seul défaut a rendu l'auto-merge **inerte pendant trois semaines sur 23 repos**, sous des runs verts, avec 121+ vulnérabilités hautes en attente à la clé.
- **Épingler les actions GitHub sur un SHA complet**, jamais un tag — un tag peut être re-pointé silencieusement par son propriétaire (précédents `tj-actions/changed-files`, `trivy-action`). Règle Semgrep `github-actions-mutable-action-tag`.
- **`@dependabot recreate` ne rebase PAS une PR sur une nouvelle base.** Changer la base d'une PR existante se fait par `gh pr edit <n> --base main` (cf. « Changer la base des PR Dependabot »).

---

## README — Convention par projet

Chaque projet doit avoir un README avec au minimum :

```markdown
# Nom du projet

Description courte.

## Stack

[Résumé du stack spécifique]

## Getting started

[Comment lancer le projet en local]

## Commandes

[Liste des commandes pnpm]

## Architecture

[Résumé des choix d'architecture]

## Tests

[Comment lancer les tests]

## Déploiement

[Comment le déploiement fonctionne]
```

> **Pourquoi** : un squelette identique partout permet de retrouver « comment lancer en local » ou « comment se fait le déploiement » au même endroit dans n'importe quel repo — onboarding (humain ou agent) sans reconstituer le contexte projet par projet.

---

## Dette technique

### Marquage dans le code

```typescript
// DEBT: [catégorie] — Description
// Impact: ce que ça cause
// Fix: comment résoudre (S/M/L)
```

Catégories : `[security]`, `[architecture]`, `[code-quality]`, `[performance]`, `[infra]`

### Trouver les items

```bash
grep -rn "// DEBT:" src/ apps/ packages/
```

### Règles

- Ne jamais fixer sans demander
- Commentaire au-dessus de la ligne concernée
- Si résolu : supprimer + mettre à jour CLAUDE.md

---

## Blog auto-généré (standard Groupe J)

### Architecture (validation Board 2026-04-14)

Chaque SaaS possède **son propre projet Sanity isolé**. Pas de projet partagé.

| SaaS | Nom projet Sanity | Dataset |
|------|------------------|---------|
| RideSamui | `ridesamui-blog` | `production` |
| Megahote | `megahote-blog` | `production` |
| VoixCourses | `voixcourses-blog` | `production` |
| Prono.pro | `pronopro-blog` | `production` |
| ArchiCollab | `archicollab-blog` | `production` |
| NameCheck Pro | `namecheck-blog` | `production` |

### Variables d'environnement requises

À ajouter dans **Doppler du projet concerné** (dev/stg/prd) :

```
SANITY_PROJECT_ID=<id du projet sanity spécifique au SaaS>
SANITY_DATASET=production
SANITY_API_TOKEN=sk_<token write avec permission editor>
```

### Schéma Sanity `blogPost`

```typescript
// sanity/schemas/blog-post.ts
export default {
  name: 'blogPost',
  title: 'Blog Post',
  type: 'document',
  fields: [
    { name: 'title', type: 'string', validation: (R: any) => R.required() },
    { name: 'slug', type: 'slug', options: { source: 'title' }, validation: (R: any) => R.required() },
    { name: 'publishedAt', type: 'datetime' },
    { name: 'locale', type: 'string' }, // 'fr' | 'en' | 'th' etc.
    { name: 'excerpt', type: 'text' },
    { name: 'body', type: 'array', of: [{ type: 'block' }] },
    { name: 'imageUrl', type: 'url' }, // Vercel Blob URL
    { name: 'autoGenerated', type: 'boolean', initialValue: true },
  ],
}
```

### Requêtes GROQ

```groq
// Tous les articles publiés (chaque projet est isolé par SaaS)
*[_type == "blogPost" && defined(publishedAt)] | order(publishedAt desc)

// Articles avec locale spécifique
*[_type == "blogPost" && locale == $locale && defined(publishedAt)] | order(publishedAt desc)
```

### Règles

- Le `locale` doit correspondre à la locale du site (ex: `fr` pour archicollab.com)
- `autoGenerated: true` pour les articles générés par l'IA, `false` pour les articles manuels
- `imageUrl` pointe vers une URL Vercel Blob (ne pas stocker d'assets binaires dans Sanity)
- Toujours filtrer par `defined(publishedAt)` en production (les brouillons n'ont pas de date)
- Chaque SaaS déploie son propre Sanity Studio sur Vercel (URL: `studio.<saas-domain>.com`)

### Nouveau projet Sanity (`privateDataset`) → token de lecture + `force-dynamic`

Les projets Sanity récents ont la feature **`privateDataset`** et **refusent les lectures API anonymes** — **même** quand l'ACL du dataset est étiquetée `public`. Un `client.fetch` non authentifié y renvoie **0 document** (sans erreur). Les datasets plus anciens servent encore l'anonyme, donc ça ne mord que sur les projets neufs.

- **Fix** : créer un **token read-only *viewer*** dans Sanity Manage et l'exposer en `SANITY_API_READ_TOKEN` (convention portfolio). `createBlogClient` (@groupe-j/blog ≥ 0.1.3) le lit par défaut → aucune boilerplate. Env absent = token `undefined` = lecture anonyme (datasets publics anciens) : le même code marche des deux côtés.
- **Conséquence `DYNAMIC_SERVER_USAGE`** : une lecture Sanity **tokenisée est `no-store`**. Une route détail **statiquement générée** (`generateStaticParams` + cache) qui l'utilise **jette `DYNAMIC_SERVER_USAGE`** au build/runtime. Donc la route `/blog/[slug]` doit être `export const dynamic = "force-dynamic"` (et **sans** `generateStaticParams`). Alternative : `defineLive` de next-sanity ou la directive `'use cache'` pour garder du cache incrémental. La liste `/blog` (page unique, sans `generateStaticParams`) reste en ISR.

### Covers (`coverImage`) — packaging `sharp`/logo + observabilité

Le pipeline cover de `@groupe-j/blog-generator` (`generateAndUploadCoverImage` / `createCoverImageHandler`) génère l'image (Flux) + **overlay logo via `sharp`** → upload asset Sanity (`coverImage`). Il est **best-effort** : toute erreur (sharp, logo, Flux) est **avalée → cover `null` → l'article publie sans image**. Sans les règles ci-dessous, un échec laisse **1 post sans cover, en silence** (vécu : chantier GRO-636, 3 apps touchées).

**Packaging (sinon `ERR_DLOPEN_FAILED` au runtime serverless) :**
- **`sharp` DOIT être dans `serverExternalPackages`** (`next.config`) **ET** une **`dependency`** (jamais une `devDependency` — sinon absent en prod). Sous Next 16/Turbopack, un natif non-externalisé est bundlé → `dlopen` libvips échoue.
- Si le `.node` seul ne suffit pas (le tracer suit `require` mais pas le `dlopen`), forcer les `.so` libvips via **`outputFileTracingIncludes`** — **mais jamais avec des globs `.pnpm/**` en monorepo pnpm** : ils résolvent dans le store symlinké et Vercel rejette le déploiement (« an invalid deployment package for a Serverless Function (files in symlinked directories) », `patch_build_4xx`).

**Version — `sharp@0.35` ne se bumpe JAMAIS sans un build Linux qui le valide :**
- Le traceur de Vercel (`@vercel/nft`) embarque un cas particulier pour `sharp` : il n'émet le répertoire libvips **que si** le module tracé se termine par `sharp/lib/index.js`. En **0.35**, sharp a déplacé son entrée vers `dist/index.cjs`. Cas particulier vérifié **encore keyé ainsi** sur `@vercel/nft@1.10.2` (dernière publiée) et Next 16.2.6.
- **Ce que ça donne réellement, mesuré** (build staging archicollab, 2026-07-25, `sharp@0.35.3`) : le binding `.node` est tracé, **`libvips-cpp.so` ne l'est pas** — sur 4 fonctions. Le correctif « improve code bundler support by resolving path to libvips binary » livré en 0.35.3 **ne couvre pas ce chemin**.
- **Le contexte d'exécution n'est PAS le discriminant.** Sur ces 4 fonctions, **3 sont des routes Node ordinaires** (`/api/cron/generate-blog`, `/api/documents/[id]/export`, `/api/render/start`) et une seule est le consommateur WDK. Déplacer `sharp` derrière une frontière HTTP ne protège donc de rien — hypothèse testée et **réfutée**.
- **La cause de l'écart entre apps est IDENTIFIÉE : `outputFileTracingIncludes`.** Les apps qui tournent en `0.35.3` sans casse déclarent toutes des includes explicites vers les deux répertoires `@img` ; archicollab n'en avait aucun. Ce n'est donc ni la version seule, ni le contexte d'exécution, ni la structure monorepo — c'est la présence ou l'absence de cette déclaration. Confirmé par trois builds de production le 2026-07-25 : groupe-j-website (6 fonctions, includes présents, vert), linegroup (2 fonctions, vert **après** ajout des includes), archicollab (4 fonctions, sans includes, `libvips MISSING`).
- **En 0.35, les includes ne sont donc plus optionnels — ils sont la seule chose qui embarque libvips.** Les globs doivent viser les répertoires du store à leurs chemins **RÉELS** :
  ```
  node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**/*
  node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*
  ```
  Préfixer par `../../` depuis une app de monorepo (`apps/web`), sans préfixe pour une app à la racine. **Jamais à travers le lien symbolique frère de sharp** — Vercel rejette alors le déploiement (« files in symlinked directories »). C'est le seul piège réel, et il avait fait interdire à tort toute la pratique.
- **Un bump reste conditionné à un build Linux qui le valide.** Le garde-fou décide, app par app : tant qu'un build n'a pas montré `libvips present` **à la version attendue**, l'app reste sur sa version connue-bonne. Et `sharp` va dans les `ignore` de `dependabot.yml` de toute app en `^0.34.x` : sans ça un bump de range 0.34→0.35 est classé *minor*, donc **auto-mergé**, et arrive sans les includes.
- **Garde-fou obligatoire** : une assertion de build vérifiant que le `.node` **et** le `.so` libvips figurent dans la trace (`.next/**/*.nft.json`). Sans lui la régression est silencieuse : l'article publie sans image, sans erreur. Trois exigences, chacune tirée d'un faux verdict observé :
  - **rapporter les versions tracées** — sans elles, un « libvips MISSING » ne désigne aucune version en particulier quand deux `sharp` coexistent dans le store (celle de l'app, celle que Next tire en `optionalDependencies`) ;
  - **apparier sharp et libvips** — une libvips *présente* mais de la mauvaise version ne sauve rien, le soname diffère et le `dlopen` échoue pareil. Lire la version attendue dans le `package.json` de la sharp réellement tracée, ne pas coder le mapping en dur ;
  - **échouer si AUCUNE fonction ne charge sharp** — un garde-fou qui ne garde rien passerait au vert indéfiniment.
- **Le garde-fou doit découvrir les routes, jamais en coder une en dur.** Une copie keyée sur une route qui bouge devient un no-op au vert. (Constat 2026-07-25 : les 6 copies du portfolio ont dérivé en 3 implémentations, dont 2 à route figée.)
- **Logo : `logoBase64`, jamais `logoPath: "public/…"`** — Vercel **ne bundle pas `public/`** dans les runtimes serverless/WDK → le fichier est absent → sharp throw → cover sans logo (ou nulle). Embarquer les bytes du logo dans le module graph.

**Observabilité (le pipeline avale les échecs → il FAUT reporter) :**
- Utiliser **`@groupe-j/blog-generator ≥ 0.2.0`** et **wirer `onError`** dans la config, **scopé aux non-fatals** (`if (ctx?.fatal === false) …`) pour ne pas double-capturer avec la capture fatale de la route cron.
- `onError` → **`captureBlogError(error, { operation, slug, fatal })`** (pas un message-string) : les échecs hebdo **s'agrègent en une seule issue Sentry** au lieu de fragmenter par slug-semaine.
- **Import `@sentry/*` statique OK** — **sauf si la config est aspirée dans un bundle WDK `"use workflow"`** (cover via step) : alors utiliser **`globalThis.Sentry`** (enregistré dans `instrumentation.ts`) + `flush` dans un `"use step"`, jamais un import statique (sinon `node-js-module-in-workflow`).
- **Partial-failure (multi-locale)** : garder le soft-fail (`throw → {skipped:true}` — une locale ratée ne doit pas tuer le post, best-practice `Promise.allSettled`), mais **`captureBlogError` la rejection avant le `skipped`** (sinon fatal muet). Un vrai fatal *whole-workflow* non-récupérable doit throw **`FatalError`** (→ remonte au caller → capté).
- **Cron Monitor** : `withCronMonitor(slug, cb, { schedule })` **avec le schedule de `vercel.json`** → alerte sur run **manqué** (feed qui s'arrête). Attention : `automaticVercelMonitors` ne voit que le `200` de la route, pas l'échec cover (cf. § Cron Monitoring).
- Prérequis : l'app doit avoir un **SDK Sentry** (`@groupe-j/sentry-config` + DSN + `instrumentation.ts`) — sinon `onError`/`withCronMonitor` restent inertes (le bump 0.2.0 donne au moins un `console.error` loud dans les logs Vercel).

**Backfill** d'une cover manquante : `scripts/backfill-blog-covers.ts --execute` via `doppler run --config prd` (sharp tourne en local) → vérifier le `coverImage.asset._ref` côté Sanity après.

### Génération pilotée par la demande (`BlogTarget` + `seoTarget`) — ADR-0022

**1 article = 1 requête de recherche mesurée, servie sous un angle non traité.** La demande pilote le sujet ; le modèle rédige, il ne choisit plus quoi couvrir. Le détail du contrat est dans [ADR-0022](./decisions/0022-blog-demand-driven-generation.md).

- **Déclarer les cibles** dans `src/lib/blog-topics.ts` : `export const BLOG_TARGETS: BlogTarget[] = [ // gjdc:seo-keywords:start:targets … :end:targets ]`. Le bloc marqué est régénéré par **`gjdc seo keywords --write`** (GSC striking-distance + Google Ads explore) et **toujours curé en PR** : retirer marque maison, marques concurrentes navigationnelles, requêtes de login concurrentes, quasi-doublons, et requêtes hors-marché/hors-langue. La preuve (`evidence`) reste dans le code.
- **Câbler la sélection** : soit `createBlogGenerator({ targets: BLOG_TARGETS, … })` (le générateur appelle `selectTarget` **en interne** dans `generateTopic`), soit — pour un générateur **bespoke** (cron/workflow maison) — **importer `selectTarget` du barrel** `@groupe-j/blog-generator` (≥ 0.5.4) et l'appeler en forme objet : `selectTarget({ targets: BLOG_TARGETS, existing })`. **Ne JAMAIS recopier l'algorithme localement.**
- **Champ `seoTarget`** : à la publication, écrire `seoTarget: { query, angle, evidence, servedAt }` sur le `blogPost`, **et le PROJETER dans la lecture des articles existants** (dedup query / `getRecent…`). Sans cette projection, l'angle n'avance jamais (le générateur répète la 1re cible/1er angle à l'infini).
- **Non-blocage** : `selectTarget` renvoie `null` si les cibles sont vides ou tous les angles servis → fallback équilibrage historique. Le cron **ne bloque jamais**, même sans refresh des cibles pendant des mois.
- 🪤 **Lecture des articles existants = token READ, jamais le write token.** Le cron lit les `blogPost` publiés (dedup + historique `seoTarget`) via le **client de lecture authentifié** de l'app. Ce client DOIT utiliser **`SANITY_API_READ_TOKEN`** (cf. § token read-only ci-dessus), **pas** `SANITY_API_TOKEN`. Coupler les lectures au token d'écriture casse **tout** le cron dès que ce dernier expire/rotationne (« Session not found » / `SIO-401-ANF` au 1er fetch — vécu, cron muet pendant des semaines).
- 🪤 **Sites bilingues** (rotation de locale par semaine) : `generateTopic` est locale-agnostique → passer la locale au **prompt de sujet** (config-factory par locale) sinon le titre part dans la mauvaise langue. **Slug non canonique** (chaîne, pas `{ current }`) → fournir un `dedupQuery` custom projetant `seoTarget`.

---

## Performance budget

### Seuils par défaut

| Métrique | Seuil | Outil de mesure |
|----------|-------|-----------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Sentry — `p75(measurements.lcp)` |
| **INP** (Interaction to Next Paint) | < 200ms | Sentry — `p75(measurements.inp)` |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Sentry — `p75(measurements.cls)` |
| **TTFB** (Time to First Byte) | < 800ms | Sentry — `p75(measurements.ttfb)` |
| **Bundle JS** (first load) | < 300kb gzipped | `next build` output |
| **API response** (p95) | < 500ms | Sentry Tracing |
| **DB query** (p95) | < 100ms | Sentry Profiling |
| **Build time** | < 3 min | Vercel deploy logs |

### Règles

- **Chaque nouvelle page** doit respecter les Core Web Vitals avant merge
- **Chaque nouvelle API route** : vérifier que le p95 < 500ms après deploy
- **Bundle size** : vérifier le delta dans le output `next build` — un nouveau `use client` component ne doit pas ajouter > 50kb
- Si un seuil est dépassé, créer un item `// DEBT: [performance]` avec le contexte

### Où voir les métriques

| Métrique | Où |
|----------|----|
| Core Web Vitals (terrain) | Sentry → `transaction.op:pageload` (requête dans « Pas de Speed Insights ») |
| Bundle size | `next build` → "First Load JS" column |
| API latency | Sentry → Performance → par endpoint |
| DB queries | Sentry → Profiling (quand activé) |
| Grafana | `{projet}-postgres-prod` → query `pg_stat_user_tables` |

---

## Onboarding nouveau projet

> Checklist complète step-by-step : voir `ADMIN_PROCEDURES.md`

Résumé : scaffold T3 → GitHub → Vercel → Neon → Doppler (cross-refs `GROUPEJ_*`) → Sentry → Grafana → `pnpm dlx @groupe-j/dev-conventions setup`

## Documentation du centre de contrôle

Les conventions transversales, les 22 ADR et les guides d'adoption vivent dans `groupe-j/dev-conventions` et **n'y sont pas copiés ici**. Le dépôt est **privé** : l'URL web renvoie un 404 sans session GitHub — ne pas en conclure que l'index n'existe pas.

- **1. Voie par défaut — `gh api`.** Elle marche partout où le hook SessionStart marche déjà (même authentification), et c'est celle que `gjdc docs get` emprunte en interne. L'index : `gh api repos/groupe-j/dev-conventions/contents/docs/INDEX.md --jq .content | base64 -d`. Un document : la même commande avec son `<chemin>` à la place de `docs/INDEX.md`.
- **2. Voie confort — `gjdc`.** `pnpm dlx @groupe-j/dev-conventions docs get <chemin>`. À n'essayer **qu'en second** : la commande `docs` n'existe qu'à partir de la **0.7.0**, et `pnpm dlx` exige une authentification GitHub Packages qui n'est pas acquise partout (symptôme : `WARN Ignored project-level auth setting`). Sur `unknown command 'docs'`, 401 ou 404 du registre → revenir au point 1 ; ce n'est pas le chemin demandé qui est en cause.

L'index donne une ligne par document avec « quand le lire », et couvre `docs/*.md` + `decisions/*.md` au **premier niveau** — son en-tête nomme ce qui vit en dehors (`PLAN.md`, `CLAUDE_SHARED.md`). Le lire **avant** de conclure qu'une convention n'existe pas, et lire son périmètre **avant** de conclure qu'un sujet n'est pas traité.
