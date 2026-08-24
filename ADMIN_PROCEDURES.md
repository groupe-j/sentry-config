# Procédures admin — Référence opérationnelle

Ce fichier contient les procédures admin et ops qui ne sont PAS nécessaires pour écrire du code.
Claude Code n'a PAS besoin de ce fichier pendant le développement — il est référencé uniquement quand
l'utilisateur demande explicitement une opération admin (onboarding, Grafana, Doppler, Sentry dashboard).

## Doppler — Tokens partagés

Préfixe `GROUPEJ_` = tokens communs à tous les projets. Source de vérité : Doppler pronostic prd.

- `GROUPEJ_GRAFANA_API_TOKEN` — Grafana Cloud API
- `GROUPEJ_SENTRY_TOKEN` — Sentry auth (source maps, releases)
- `GROUPEJ_VERCEL_API_TOKEN` — Vercel API

Copier vers un nouveau projet :
```bash
doppler secrets get GROUPEJ_GRAFANA_API_TOKEN GROUPEJ_SENTRY_TOKEN GROUPEJ_VERCEL_API_TOKEN --project pronostic --config prd --plain
```

Token admin Sentry (full write) : Doppler `dev-conventions/dev` → `SENTRY_ADMIN_TOKEN`

## Grafana Cloud — Instance et datasources

Instance : https://groupej.grafana.net

### Datasources existantes

Par projet : `{projet}-postgres-prod` (Neon read-only), `{projet}-stripe-live` (si Stripe)
Partagées : `groupej-vercel-api`, `groupej-sentry`
Built-in : `grafanacloud-groupej-logs` (Loki), `grafanacloud-groupej-prom`, `grafanacloud-groupej-traces`

### Onboarding Grafana pour un nouveau projet

1. Créer user `grafana_readonly` sur la DB Neon :
```sql
CREATE ROLE grafana_readonly WITH LOGIN PASSWORD '<generated>';
GRANT USAGE ON SCHEMA public TO grafana_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_readonly;
```
2. Ajouter `GRAFANA_DB_READONLY_PASSWORD` dans Doppler (tous envs)
3. Créer `{projet}-postgres-prod` dans Grafana (copier config d'un existant)
4. Créer `{projet}-stripe-live` si Stripe
5. Les datasources partagées sont déjà disponibles

### Queries SQL templates pour dashboards

```sql
-- Users actifs (30 jours)
SELECT COUNT(DISTINCT id) AS active_users FROM "user" WHERE "updatedAt" > NOW() - INTERVAL '30 days';

-- Nouveaux users (tendance 7j)
SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*) AS new_users
FROM "user" WHERE "createdAt" > NOW() - INTERVAL '7 days' GROUP BY day ORDER BY day;

-- MRR
SELECT COALESCE(SUM("amount"), 0) / 100.0 AS mrr FROM "subscription" WHERE "status" = 'active';

-- Churn (30 jours)
SELECT COUNT(*) AS churned FROM "subscription"
WHERE "status" = 'canceled' AND "canceledAt" > NOW() - INTERVAL '30 days';

-- Transactions (7 jours)
SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*) AS transactions
FROM "payment" WHERE "status" = 'succeeded' AND "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY day ORDER BY day;

-- Taille DB
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- Tables volumineuses
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

Adapter les noms de tables au schéma de chaque projet.

### Alertes Grafana

- App down > 2 min → Telegram (immédiat)
- Error spike > 20/5 min → Telegram (immédiat)
- MRR drop > 10%/24h → Telegram
- Churn > 3/24h → Telegram
- DB connexions > 80% → Email
- API p95 > 2s pendant > 10 min → Email

Contact point : bot Telegram (même bot que Sentry). Format : `[APP] [SEVERITY] Message`

## Sentry — Configuration dashboard

### Inbound Filters (par projet)

`Project Settings → Inbound Filters`. **État vérifié via API le 2026-07-06 : déjà
activés sur les 12 projets de l'org** (`browser-extensions` + `web-crawlers` =
`true`) — les maintenir à l'activation, pas besoin de les cocher à la main.

- **Filter out errors known to be caused by browser extensions** — neutralise le
  bruit tiers **attribuable** à une extension (culprit/frames identifiés).
- **Filter out known web crawlers** (double le `isBot` code-level).
- **Filter out events coming from legacy browsers** (au besoin).

> ⚠️ **Insuffisant seul.** Ce filtre (comme `denyUrls`) exige que l'event soit
> **attribué** à une extension. Un bruit d'extension **re-capté via la console**
> (ex. par un GlobalErrorHandler maison → `captureConsoleIntegration`) perd cette
> attribution → il passe à travers. C'est précisément ARCHICOLLAB-T3-1Q : le
> filtre était **déjà actif** et l'event a quand même fui. Le vrai correctif est
> code-level (ne pas re-capturer `window.onerror` + scanner `exception.values`).
> Cf. règle capstone #7 dans `CLAUDE_SHARED.md`.

Piloter via API (org EU `de.sentry.io`, token `SENTRY_ADMIN_TOKEN` dans
`dev-conventions/dev`) :

```bash
# Lire l'état de tous les filtres d'un projet
curl -s "https://de.sentry.io/api/0/projects/groupe-j/<project>/filters/" \
  -H "Authorization: Bearer $SENTRY_ADMIN_TOKEN"
# Activer un filtre
curl -s -X PUT "https://de.sentry.io/api/0/projects/groupe-j/<project>/filters/browser-extensions/" \
  -H "Authorization: Bearer $SENTRY_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"active": true}'
```

### Alertes (déjà créées via API sur les 5 projets)

- High priority issue → Email (rule par défaut)
- Error spike > 10/h → Email
- Fatal error (first seen) → Email

### Notifications utilisateur (sentry.io → User Settings → Notifications)

- Deploy : Off
- Workflow : Digest quotidien
- Weekly reports : Off
- My Own Activity : Off

### Telegram (à configurer quand nécessaire)

1. sentry.io → Settings → Integrations → webhook
2. Bot Telegram comme receiver
3. Ajouter l'action webhook dans chaque alert rule

## Slack — Hub de notifications

Workspace : `groupe-j-siege`

### Channels

| Channel | Source | Ce qui arrive |
|---------|--------|---------------|
| `#alerts-critical` (C0APF4Y3TPE) | **Grafana** + **Sentry** (Worker) + **Vercel** (fails) | Problèmes techniques |
| `#business` | **Grafana** (10 rules) | Ventes, inscriptions, activité (toutes les heures si > 0) |
| `#github-monitoring` (C0AP9FANBP0) | **GitHub** app | PRs + deployments uniquement |
| `#vercel-monitoring` (C0AP8KJCPNZ) | **Vercel** app | Tous les deploys (start/success/fail) |
| `#alerts-monitoring` (C0AP55VGKL3) | (réservé) | — |
| `#sentry-issues` (C0ANW6U6QCX) | (réservé) | — |

### Intégrations actives

- **Claude** (@Claude) — dans tous les channels. `@Claude fix this` ouvre une session Claude Code cloud
- **GitHub** — app native Slack, subscribed à Satan199222 (pulls + deployments)
- **Vercel** — app native Slack
  - `#alerts-critical` : firewall, alerts, deployment_error
  - `#vercel-monitoring` : tous les deploys
- **Grafana** — 2 webhooks (app "Grafana" dans api.slack.com)
  - `Slack alerts-critical` → `#alerts-critical` (2 rules techniques)
  - `Slack business` → `#business` (10 rules événements business)
- **Sentry** — via Cloudflare Worker relay (webhook interne Sentry → Worker → Slack)

### Grafana Alert Rules

**Techniques** (→ `#alerts-critical`, repeat 4h) :
- Pronostic - Subscribers drop > 3 en 1h
- RideSamui - Zero véhicule disponible (30min)

**Business** (→ `#business`, repeat 1h, avec count dynamique) :
- Pronostic : Nouveaux subscribers, Nouveaux pronostiqueurs, Nouveaux leads
- RideSamui : Nouvelles réservations, Avis 5 étoiles
- ArchiCollab : Nouveaux utilisateurs, Nouveaux projets, Nouvelles organisations, Achats ArchiTokens
- BusinessFamily : Nouveaux utilisateurs

Format des messages business : `🎉 Pronostic — 2 nouveau(x) subscriber(s) cette heure`

### Sentry → Slack (Cloudflare Worker)

L'intégration native Sentry → Slack nécessite Sentry Business (29€/mois).
Solution : Cloudflare Worker gratuit qui reçoit le webhook Sentry et poste dans `#alerts-critical`.

- Worker : `https://groupej-webhooks.julien-condello-57.workers.dev`
- Code : `/home/julien/projects/groupej-webhooks/src/index.ts`
- Sentry Internal Integration : "Slack Relay" (Settings → Developer Settings)
- Token : `SENTRY_SLACK_RELAY_TOKEN` dans Doppler `dev-conventions/dev`

### Workflow alertes

```
Erreur en prod
  → Sentry → Cloudflare Worker → #alerts-critical
  → "@Claude fix the checkout 500 error on pronostic"
  → Claude Code (cloud) lit Sentry via MCP → code le fix → PR

Événement business (nouvelle vente, inscription)
  → Grafana check toutes les heures → #business
  → "🎉 Pronostic — 2 nouveau(x) subscriber(s) cette heure"

KPI anormal (subscribers drop, véhicules dispo)
  → Grafana → #alerts-critical
  → "@Claude investigate this"

Deploy
  → Vercel → #vercel-monitoring (tous les deploys)
  → Vercel → #alerts-critical (deploy errors uniquement)
  → GitHub → #github-monitoring (PRs + deployments)
```

## Onboarding — Nouveau projet complet

### 1. Scaffolding
```bash
pnpm create t3-turbo@latest mon-projet
cd mon-projet && git init && git add -A && git commit -m "init: scaffold t3-turbo"
```

### 2. GitHub
```bash
gh repo create satan199222/mon-projet --private --source=. --push
```

### 3. Vercel
```bash
vercel link
```

### 4. Neon
- Créer projet Neon, récupérer DATABASE_URL et DIRECT_URL
- Créer user grafana_readonly (voir section Grafana ci-dessus)

### 5. Doppler
```bash
doppler projects create mon-projet
# Copier GROUPEJ_* tokens depuis pronostic prd
# Ajouter DATABASE_URL, DIRECT_URL, GRAFANA_DB_READONLY_PASSWORD
```

### 6. Sentry
- Créer projet dans sentry.io → groupe-j
- Ajouter dans Doppler : SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG=groupe-j, SENTRY_PROJECT
- Copier les fichiers Sentry standard depuis CLAUDE_SHARED.md
- Créer alert rules via API (token admin dans Doppler dev-conventions)

### 7. Grafana
- Voir section "Onboarding Grafana" ci-dessus

### 8. Conventions
```bash
cd ~/projects/mon-projet
bash ~/projects/dev-conventions/sync.sh
git add -A && git commit -m "chore: setup dev-conventions sync" && git push --no-verify
```

### 9. Vérification
- doppler run -- pnpm dev fonctionne
- pnpm build passe
- Sentry reçoit les erreurs
- Grafana datasource fonctionne
- CI se déclenche sur PR
- Hook pre-push bloque push sur main
- Hook pre-commit lint les fichiers modifiés
