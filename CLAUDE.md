<!-- sync:dev-conventions -->

## Conventions partagées (`CLAUDE_SHARED.md`)

`CLAUDE_SHARED.md` (synchronisé automatiquement depuis le repo `dev-conventions` au démarrage de session) contient les **conventions inter-projets** : Better-Auth/CASL, Stripe, Telegram, Sentry, Doppler, Prisma, next-intl, CI/CD, etc.

**Charge `CLAUDE_SHARED.md` uniquement quand tu touches à un domaine qu'il documente** — pas systématiquement. Le fichier fait ~60 KB ; le lire à chaque session dilue les instructions critiques propres au projet.

- Ce fichier (`CLAUDE.md`) override `CLAUDE_SHARED.md` pour les spécificités du projet
- Si une convention de `CLAUDE_SHARED.md` n'est pas encore en place dans ce projet, mets-la en place quand tu touches au code concerné
- Toujours consulter la doc officielle des libs via **Context7** avant d'écrire du code

### Packages Groupe J partagés (`@groupe-j/*`)

Avant d'écrire du code maison, vérifier si un `@groupe-j/*` package répond au besoin :

- **CLI** : `@groupe-j/dev-conventions` (commands: `gjdc setup/check/audit/list/init`)
- **Observability** : `@groupe-j/sentry-config`, `@groupe-j/logger`
- **UI** : `@groupe-j/ui` (55 composants shadcn)
- **AI** : `@groupe-j/ai` (wrapper Vercel AI Gateway — GROA-340 enforce direct `@ai-sdk/*` imports → CI fail)
- **Backend** : `@groupe-j/env` (Zod schemas), `@groupe-j/auth` (BetterAuth), `@groupe-j/notifications` (Knock)
- **Configs** : `@groupe-j/eslint-config`, `@groupe-j/tsconfig`

Liste live + versions : `pnpm dlx @groupe-j/dev-conventions list`
Audit conformité : `pnpm dlx @groupe-j/dev-conventions check`

> **Si tu modifies `CLAUDE_SHARED.md` depuis ce projet**, mets aussi à jour le repo source :
> `cd ~/projects/dev-conventions && git pull && git add CLAUDE_SHARED.md && git commit -m "fix: update shared conventions" && git push`

---

# CLAUDE.md — sentry-config

> Conventions inter-projets : voir `CLAUDE_SHARED.md` (synchronisé depuis `dev-conventions`).
> **À charger uniquement quand tu touches à un domaine qu'il documente** (Stripe, Sentry, Telegram, etc.), pas systématiquement.
> Toujours consulter la doc officielle des libs via Context7 avant d'écrire du code.

## Packages Groupe J partagés disponibles

Avant d'écrire du code maison, vérifier si un `@groupe-j/*` package répond au besoin. Liste rapide :

| Package | Quand l'utiliser |
|---|---|
| `@groupe-j/dev-conventions` | CLI de conventions (`gjdc setup`, `check`, `audit`, `list`, `init`) |
| `@groupe-j/sentry-config` | Init Sentry + PII redaction. Replace `Sentry.init(...)` inline |
| `@groupe-j/ui` | Composants shadcn/ui (Button, Dialog, DataTable, Form, etc.) |
| `@groupe-j/ai` | Wrapper Vercel AI Gateway. Use instead of `@ai-sdk/openai` direct |
| `@groupe-j/env` | Schemas Zod env (Sentry, Stripe, AI Gateway, Sanity, Knock, etc.) |
| `@groupe-j/eslint-config` | ESLint flat config + AI Gateway enforcement |
| `@groupe-j/tsconfig` | Configs TypeScript (base/nextjs/node/react-lib) |
| `@groupe-j/notifications` | Wrapper Knock (notification orchestration) |
| `@groupe-j/auth` | Wrapper BetterAuth (sessions, RBAC) |
| `@groupe-j/logger` | Logger structuré + Sentry breadcrumbs auto |

Liste complète + versions live : `pnpm dlx @groupe-j/dev-conventions list`
Audit conformité du projet : `pnpm dlx @groupe-j/dev-conventions check`

## Workflow Linear / GitHub

- **Projet Linear** : Packages & infra partagée
- **Repo GitHub** : groupe-j/sentry-config
- **Team Linear** : Groupe J (cle: GRO)

Les conventions detaillees (branches, commits, labels) sont dans `CLAUDE_SHARED.md` section "Workflow Linear / GitHub / Sentry".

Voir aussi `ADMIN_PROCEDURES.md` et `docs/linear-agent-workflow.md`.

## Projet

- **Nom** : sentry-config
- **Description** : Shared Sentry config + PII redaction for groupe-j apps. Extracted from ridesamui.
- **URL prod** : _non renseigné_
- **URL staging** : _non renseigné_
- **Repo** : https://github.com/groupe-j/sentry-config

## Stack spécifique

- **Stripe Connect** : oui/non
- **Telegram Bot** : oui/non
- **Mini App Telegram** : oui/non
- **i18n actif** : oui (FR + EN) / non (FR uniquement)
- **Particularités** : [tout ce qui sort du standard]

## Packages internes (workspace)

- `@<scope>/ui` : [détails ou supprimer si remplacé par @groupe-j/ui]
- `@<scope>/db` : [Schema Prisma, client, migrations]
- `@<scope>/config` : [détails ou supprimer si remplacé par @groupe-j/eslint-config + tsconfig]
- `@<scope>/email` : [détails ou supprimer si remplacé par @groupe-j/notifications]
- `@<scope>/monitoring` : [détails ou supprimer si remplacé par @groupe-j/sentry-config]

## Architecture spécifique

> Choix d'architecture propres à ce projet.

## Dette technique

Dernière analyse : [date]

### Vue d'ensemble
- X items : Y critiques, Z importants, W mineurs
- Zones endettées : [dossiers/modules]
- Risque principal : [1 phrase]

### Par catégorie

#### 🔴 Sécurité
- (à remplir)

#### 🟠 Architecture
- (à remplir)

#### 🟡 Code quality
- (à remplir)

#### 🔵 Infra
- (à remplir)

### Zones fragiles ⚠️
- (à remplir)

## Commandes

```bash
pnpm dev            # tsup --watch
pnpm build          # tsup
pnpm lint           # eslint src
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm prepublishOnly # pnpm build && pnpm typecheck
pnpm test:watch     # vitest
```

> Dérivé des scripts de `package.json` au moment du `gjdc setup`. Ce qui n'y
> figure pas n'existe pas dans ce dépôt.

## Notes

> Tout ce que Claude Code doit savoir pour travailler sur ce projet.
