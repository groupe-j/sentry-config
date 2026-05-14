# Contributing — `@groupe-j/sentry-config`

Guide de maintenance du package partagé de configuration Sentry. Ce package est consommé par 8 apps Next.js du portfolio Groupe J et encapsule la PII redaction + sampling + init helpers.

## Sommaire

1. [Philosophie](#philosophie)
2. [Workflow : upgrade `@sentry/nextjs`](#workflow--upgrade-sentrynextjs)
3. [Workflow : ajouter une clé sensible (PII)](#workflow--ajouter-une-clé-sensible-pii)
4. [Workflow : ajouter un nouveau helper](#workflow--ajouter-un-nouveau-helper)
5. [Workflow : ajouter une app consommatrice](#workflow--ajouter-une-app-consommatrice)
6. [Politique semver](#politique-semver)
7. [Process de release](#process-de-release)
8. [Décisions de design](#décisions-de-design)

---

## Philosophie

Ce package centralise **3 lignes** d'init Sentry au lieu de 40 lignes répétées dans chaque app. Il garantit que **tous** les apps Groupe J ont :

- La même politique de PII redaction (38+ clés sensibles)
- Les mêmes sample rates (10% prod / 100% dev / 0% test)
- Les mêmes filtres (bots, health endpoints, static assets)
- Le même header scrubbing (webhook signatures Stripe/Knock/Telegram/Sanity/Vercel)

**Tout changement ici impacte 8 apps en production**. Treat as critical infrastructure.

Voir [DECISIONS.md](./DECISIONS.md) pour le contexte derrière les choix de design.

---

## Workflow : upgrade `@sentry/nextjs`

Sentry SDK suit semver. Les majors (ex: v10 → v11) peuvent changer :

- La signature de `Sentry.init()` (options retirées/renommées)
- Les noms d'intégrations (ex: `BrowserTracing` → `browserTracingIntegration`)
- Le shape des events dans `beforeSend`
- Les hooks de `withSentryConfig` côté `next.config.ts`

### 1. Lire le changelog

```bash
# Voir les notes de release Sentry
gh release list --repo getsentry/sentry-javascript --limit 10

# Ou directement sur :
# https://github.com/getsentry/sentry-javascript/releases
```

Identifier les breaking changes qui touchent nos imports : `init`, `setUser`, `withScope`, `replayIntegration`, `withCronMonitor`, `vercelAIIntegration`.

### 2. Bump local

```bash
cd C:/Projects/sentry-config
pnpm up @sentry/nextjs@latest @sentry/profiling-node@latest
```

### 3. Reproduire les breaking changes

```bash
pnpm typecheck   # Doit révéler les API removals
pnpm build       # Doit révéler les renames cassés à runtime
```

Corriger chaque erreur en consultant la migration guide Sentry (https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/).

### 4. Tester sur une app pilote

Avant de release, tester dans une app consommatrice :

```bash
# Lien local au package en dev
cd C:/Projects/sentry-config
pnpm link --global

cd C:/Projects/ridesamui-t3
pnpm link --global @groupe-j/sentry-config

# Vérifier que pas de regression
pnpm typecheck
pnpm build
pnpm dev   # tester une erreur manuelle pour vérifier l'event Sentry
```

### 5. Bump peerDependencies + release

Dans `package.json`, mettre à jour le range des `peerDependencies` :

```json
"peerDependencies": {
  "@sentry/nextjs": "^11.0.0",
  "@sentry/profiling-node": "^11.0.0"
}
```

⚠️ **Changement de peer dep major = bump major du package**. Voir [politique semver](#politique-semver).

### 6. Coordonner l'upgrade dans les apps

Après publication, ouvrir une PR coordonnée dans chaque app consommatrice ou documenter le breaking change dans le commit message pour que je sache ce qu'il faut adapter app par app.

---

## Workflow : ajouter une clé sensible (PII)

Si une nouvelle app (ou un audit) révèle un nom de field qui leak en clair dans Sentry :

### 1. Identifier la clé exacte

Aller dans Sentry → un event problématique → vérifier le path de la clé sensible (ex: `request.data.userMobile`).

### 2. Normaliser le nom

Le redactor normalise via `key.toLowerCase().replace(/[-_]/g, '')`. Donc :

- `userMobile` → `usermobile`
- `user_mobile` → `usermobile`
- `user-mobile` → `usermobile`

Tous les 3 sont matchés par la même entrée `"usermobile"`.

### 3. Ajouter dans `src/redaction.ts`

Trouver la section appropriée (`// Identity`, `// Government ID`, `// Address`, `// Payment`, `// Auth/Token`, etc.) et ajouter la clé normalisée.

```typescript
const SENSITIVE_KEYS = new Set([
  // Identity
  "email",
  // ... existing keys
  "usermobile",  // <-- new
  // ...
]);
```

### 4. Tester

Créer un event test localement :

```bash
cd C:/Projects/sentry-config
pnpm build
node -e "
  const { redact } = require('./dist/index.cjs');
  const event = { request: { data: { userMobile: '+33612345678' } } };
  console.log(JSON.stringify(redact(event), null, 2));
"
# Should print: { request: { data: { userMobile: '[REDACTED]' } } }
```

### 5. Bump patch (ajout de redaction = patch)

Ajout d'une clé sensible = **patch** (`0.1.4` → `0.1.5`), pas de breaking change pour les consommateurs. Suivre [process de release](#process-de-release).

---

## Workflow : ajouter un nouveau helper

Ex: ajouter `setSentryTransaction()` ou `initSentryClient` accepte une nouvelle option.

### 1. Implementation

Créer/modifier le fichier dans `src/`. Exporter depuis `src/index.ts` (ou `src/client.ts`, `src/server.ts`, etc. selon le runtime).

### 2. Mettre à jour `tsup.config.ts` si nouveau entry point

Si tu ajoutes un nouveau subpath export (ex: `@groupe-j/sentry-config/analytics`), il faut :

1. Ajouter l'entry dans `tsup.config.ts`
2. Ajouter l'export dans `package.json` → `exports`

### 3. Documenter

- Section "Usage" dans `README.md`
- Section dans [DECISIONS.md](./DECISIONS.md) si le helper introduit un choix de design non-évident

### 4. Bump minor (ajout d'API = minor)

---

## Workflow : ajouter une app consommatrice

Quand un nouvel app du portfolio devient sentry-instrumenté :

1. **Côté app** :
   - Ajouter `.npmrc` avec scope `@groupe-j` → GitHub Packages
   - `pnpm add @groupe-j/sentry-config`
   - Créer `sentry.{client,server,edge}.config.ts` avec les 3 init helpers
   - Set les env vars Sentry via Doppler

2. **Côté ce package** :
   - Mettre à jour la liste "Used in production by" dans `README.md`
   - Pas de bump nécessaire (rien n'a changé dans le code)

---

## Politique semver

| Type de change | Bump | Exemples |
|---|---|---|
| **Patch** (`0.1.0` → `0.1.1`) | Bug fix, ajout de clé sensible | Nouveau key dans SENSITIVE_KEYS, fix d'un null pointer, correction de doc |
| **Minor** (`0.1.0` → `0.2.0`) | Nouvelle fonctionnalité backward-compatible | Nouveau helper (ex: `withCronMonitor`), nouvelle option optionnelle dans `initSentry*`, support d'une nouvelle intégration |
| **Major** (`0.1.0` → `1.0.0`) | Breaking change | Bump major `@sentry/nextjs` peer, change de sample rate par défaut, modification du shape `beforeSend`, suppression d'export |

### Règles spécifiques

- **Bump de Sentry SDK major dans peer deps = major** : les apps doivent upgrader leur Sentry en même temps que ce package.
- **Change de sample rate par défaut = major** : impact direct sur le quota Sentry des apps en prod. Les apps doivent re-valider leur budget.
- **Ajout d'une clé sensible = patch** : c'est plus de redaction, donc safe (pas de leak qui apparaît, juste plus de redaction).
- **Retrait d'une clé sensible = major** : peut faire apparaître des PII en clair. Ne devrait jamais arriver sauf si remplacé par une approche plus stricte.

---

## Process de release

### 1. Préparer

```bash
cd C:/Projects/sentry-config

# Vérifier que tout est commité
git status

# Tests doivent passer
pnpm typecheck
pnpm build
```

### 2. Bumper la version

Éditer `package.json` → champ `version`. Suivre la [politique semver](#politique-semver).

### 3. Update lockfile

Si tu as modifié les deps, `pnpm install` re-génère le lockfile. Toujours vérifier `pnpm-lock.yaml` est commité.

### 4. Commit + tag

```bash
git add package.json pnpm-lock.yaml
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

### 5. Vérifier la publication

Le workflow `.github/workflows/publish.yml` se déclenche sur tag `v*.*.*` et publie sur GitHub Packages.

Vérifier sur https://github.com/orgs/groupe-j/packages/npm/sentry-config que la nouvelle version est listée.

### 6. Mettre à jour les apps consommatrices

Pour les apps en mode auto-update (Renovate / Dependabot) : la PR s'ouvrira automatiquement.

Pour les autres : ouvrir une PR manuelle ou bumper au prochain touch du fichier `package.json`.

---

## Décisions de design

Voir [DECISIONS.md](./DECISIONS.md) pour le rationale derrière :

- Pourquoi la redaction se fait par **key-name** et pas par regex sur les valeurs
- Pourquoi on utilise `[REDACTED]` (visible) et pas `null`/suppression
- Pourquoi le WeakSet cycle guard est critique
- Pourquoi `@sentry/profiling-node` est en `optional` peerDep
- Pourquoi le bot filtering est opt-out, pas opt-in
- Pourquoi `tsup` plutôt que pure TypeScript source distribution (vs `@groupe-j/ui`)

Toute modification d'un point listé dans DECISIONS doit être justifiée et documentée.
