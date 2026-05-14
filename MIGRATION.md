# Migration vers @groupe-j/sentry-config

Guide pour migrer chaque app vers le package partagé.

## Préalable — Authentification GitHub Packages

Chaque app consumer doit pouvoir télécharger le package.

### En local

```bash
# .npmrc dans la racine de chaque consumer (committable)
@groupe-j:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

Variable `NPM_TOKEN` dans `~/.bashrc` ou Doppler local : un classic personal access token avec scope `read:packages`.

### Sur Vercel

Ajouter `NPM_TOKEN` dans Project Settings → Environment Variables → Production + Preview + Development. Vercel lira automatiquement `.npmrc`.

### Sur GitHub Actions

Utiliser `${{ secrets.GITHUB_TOKEN }}` qui est auto-provisionné (scope packages read inclus pour l'org).

```yaml
- run: pnpm install
  env:
    NPM_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Étapes par app

### 1. Apps déjà sur Sentry 10.x (megahote, linegroup, archicollab, ridesamui)

```bash
cd <repo>
pnpm add @groupe-j/sentry-config
```

Remplacer chaque `sentry.{client,server,edge}.config.ts` par le 3-liner correspondant. Voir README.

**Garder** les comportements spécifiques :
- `megahote` : le tenantId hint via `beforeSend` → utiliser `setSentryUser({ tenant })` après auth à la place
- `ridesamui` : la consent gating PDPA → passer `enabled: () => hasUserConsent()` à `initSentryClient`
- `linegroup` : déjà très proche, simple swap

### 2. Apps sur Sentry 9.x (mirey, namecheck-v2)

D'abord upgrade :

```bash
pnpm add @sentry/nextjs@^10.53.0
```

Breaking changes notables 9 → 10 :
- `Sentry.BrowserTracing` retiré → remplacé par instrumentation auto
- `Sentry.Replay` retiré → utiliser `Sentry.replayIntegration()` (le package fait déjà ça)
- `tracePropagationTargets` ne nécessite plus `Sentry.BrowserTracing`
- Profile rate `>= 1.0.0` recommandé

Tester en preview Vercel avant de merge.

Ensuite, suivre l'étape 1.

### 3. Apps qui n'ont pas Sentry (à venir)

Bootstrap d'abord :

```bash
pnpm dlx @sentry/wizard@latest -i nextjs
# Suivre les questions, configurer le DSN dans Doppler
```

Puis remplacer les fichiers générés par les versions @groupe-j/sentry-config.

## Vérification post-migration

1. **Build** : `pnpm build` réussit (TypeScript check)
2. **Preview deploy** : Sentry capture une erreur de test
3. **Production** : après 24h, vérifier que le tag `app: <name>` apparaît bien sur les nouveaux events
4. **Source maps** : ouvrir une stack trace dans Sentry, vérifier que les lignes TS sont mappées
5. **PII** : checker un event avec body POST contenant un email → doit afficher `[REDACTED]`

## Ordre de migration recommandé

Du moins risqué au plus exposé :

1. **dev-conventions** (lui-même, mais pas Sentry) — skip
2. **sanity-groupe-j** — Studio, peu de runtime
3. **GK-FORMATION** — statique, skip aussi (pas de Sentry)
4. **businessfamily** — pas de Sentry actuellement
5. **JELEMENT** — pas de Sentry actuellement
6. **linegroup** — déjà 10.53, swap rapide
7. **archicollab** — staging d'abord, puis main
8. **namecheck-v2** — upgrade 9.15 → 10.x puis swap
9. **megahote** — pilote pour valider le pattern de remplacement
10. **LeDossierParfait** — vérifier d'abord stack (Vite + Hono, pas Next ?)
11. **coraly** — extension Chrome, contexte particulier
12. **crm** — pas de Sentry actuellement
13. **mirey** — paie LU, critique → en dernier après validation des autres
14. **pronostic** — multi-app (web/bot/mini-app), 3 init par migration
15. **ridesamui** — source du package, 5 apps à migrer (le plus grand)

## Rollback

Si la migration casse en prod sur une app :

```bash
git revert <migration-commit>
git push --no-verify
```

Le package est compatible avec un retour aux configs inline — pas de breaking sur le format des events Sentry.
