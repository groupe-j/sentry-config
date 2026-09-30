# Règle de suffixe sur les noms d'en-têtes — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une règle de suffixe de credential sur les noms d'en-têtes HTTP, à côté de la liste exacte `SENSITIVE_HEADERS`, pour fermer six fuites réelles et la classe des conventions maison non encore inventées.

**Architecture:** Un prédicat `hasCredentialSuffix` descend dans `redaction.ts` (couche de base, n'importe rien → aucun cycle) et devient la source unique des suffixes, consommée par `isSecretName` (dans `scrub.ts`) et par `scrubHeaders`. Il reçoit un nom **déjà normalisé** : chaque appelant choisit sa normalisation, sans quoi `isSecretName` perdrait les noms entre crochets. Dans `scrubHeaders`, la liste exacte est évaluée **avant** le suffixe.

**Tech Stack:** TypeScript, vitest 4, tsup, typedoc, pnpm 10.34.5.

**Spec:** [`docs/superpowers/specs/2026-09-30-header-credential-suffix-design.md`](../specs/2026-09-30-header-credential-suffix-design.md)

## Global Constraints

- Dépôt : `groupe-j/sentry-config`. Worktree : `C:\Projects\sentry-config-sanity-secret`. Branche : `design/header-credential-suffix` (empilée sur `fix/scrub-sanity-webhook-secret` = PR #70).
- **`node_modules` a été supprimé** dans ce worktree. Tâche 1 étape 1 l'installe.
- Toutes les commandes `pnpm` se préfixent par `doppler run --project dev-conventions --config dev --` (auth GitHub Packages).
- Vitest se lance en `--no-file-parallelism --maxWorkers=1` (RAM de la machine sous 3 Go).
- Suffixes retenus, **exactement** : `token`, `secret`, `password`, `signature`, `credential`. **`key` est exclu** — il emporterait `x-idempotency-key`.
- Version cible : **1.4.0** (minor, pas patch — voir tâche 6).
- Commentaires de code en **français**, descriptions de tests en **anglais** (convention du dépôt).
- `hasCredentialSuffix` ne doit **jamais** être ajouté à `src/index.ts` : son contrat d'entrée (nom déjà normalisé) est un piège pour un appelant externe.
- Chaque message de commit finit par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Jamais `--no-verify`.**

## Structure des fichiers

| Fichier | Responsabilité | Tâches |
|---|---|---|
| `src/redaction.ts` | `CREDENTIAL_SUFFIXES`, `hasCredentialSuffix`, `SENSITIVE_HEADERS`, `scrubHeaders` | 1, 2, 3 |
| `src/scrub.ts` | `isSecretName` consomme le prédicat au lieu de porter ses `endsWith` | 1 |
| `src/scrub.test.ts` | caractérisation de `isSecretName` ; bout en bout `createSentryBeforeSend` | 1, 4 |
| `src/redaction.test.ts` | comportement de `scrubHeaders` : prises, précédence, témoins | 2, 3 |
| `src/serverless.test.ts` | le chemin `signalServerless` reçoit le même traitement | 4 |
| `DECISIONS.md` | §3 restreint à sa portée + §19 nouvelle | 6 |
| `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `package.json` | contrat public, politique semver, version | 6 |
| `api-reference/` | régénérée — **dernière étape du plan** | 7 |

---

### Task 1: `hasCredentialSuffix` extrait, `isSecretName` prouvé inchangé

**Files:**
- Modify: `src/redaction.ts` (insérer avant `const SENSITIVE_HEADERS`, ligne 197)
- Modify: `src/scrub.ts:24` (import) et `src/scrub.ts:190-203` (`isSecretName`)
- Test: `src/scrub.test.ts` (dans le `describe("isSecretName / isSecretParam")`, ligne 335)

**Interfaces:**
- Consumes: `foldKey` et `isSensitive` de `./redaction.js` (déjà importés par `scrub.ts`)
- Produces: `export function hasCredentialSuffix(nomNormalise: string): boolean` depuis `src/redaction.ts`. Les tâches 2 et 3 l'appellent avec `foldKey(key)`.

> **Nature du test de cette tâche** : c'est une **caractérisation**, pas un test qui échoue d'abord. L'extraction est une refactorisation pure : le test passe AVANT comme APRÈS. Sa falsifiabilité vient de l'étape 6, qui casse la normalisation et exige qu'il devienne rouge. Ne pas chercher à le faire échouer à l'étape 3 — s'il échoue là, c'est que le test est faux.

- [ ] **Step 1: Installer les dépendances**

```bash
cd C:/Projects/sentry-config-sanity-secret
doppler run --project dev-conventions --config dev -- pnpm install --frozen-lockfile
```

Attendu : `exit 0`.

- [ ] **Step 2: Écrire le test de caractérisation**

Dans `src/scrub.test.ts`, à la fin du `describe("isSecretName / isSecretParam", …)` :

```ts
  // CARACTÉRISATION. Ces verdicts sont ceux d'AVANT l'extraction de
  // `hasCredentialSuffix` : ils épinglent le comportement pour prouver que la
  // refactorisation ne le change pas. `user[token]` est le cas qui compte —
  // `isSecretName` normalise avec `normaliseName`, qui retire `.` `[` `]`, là
  // où `foldKey` ne le fait pas. Un prédicat qui normaliserait lui-même avec
  // `foldKey` perdrait ce nom. Voir DECISIONS.md §19.
  it.each([
    ["user[token]", true],
    ["refresh_token", true],
    ["requestToken", true],
    ["x-amz-credential", true],
    ["magicLink", true],
    ["ipAddress", false],
    ["firstNamespace", false],
    ["x-cache-key", false],
    ["x-idempotency-key", false],
  ])("isSecretName(%s) === %s, before and after the extraction", (nom, attendu) => {
    expect(isSecretName(nom)).toBe(attendu);
  });
```

- [ ] **Step 3: Lancer le test — il doit PASSER sur le code actuel**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run src/scrub.test.ts --no-file-parallelism --maxWorkers=1
```

Attendu : **PASS**. C'est une caractérisation du code existant. S'il échoue, le test est faux — corriger le test, pas le code.

- [ ] **Step 4: Extraire le prédicat dans `redaction.ts`**

Dans `src/redaction.ts`, **juste avant** `const SENSITIVE_HEADERS = new Set([` (ligne 197) :

```ts
/**
 * Suffixes de nom qui désignent un credential, quel que soit le contexte.
 *
 * ⚠️ `key` N'Y FIGURE PAS, délibérément. Il emporterait `x-idempotency-key` —
 * précisément l'en-tête qu'on veut lire dans Sentry pour déboguer un double
 * paiement, et le portefeuille a un `@groupe-j/stripe` avec un
 * `src/idempotency.ts` dédié — ainsi que `x-cache-key` et `x-cache-status`,
 * qui sont du diagnostic. Les clés d'API sont couvertes NOMMÉMENT, dans
 * `SENSITIVE_KEYS` et `SENSITIVE_HEADERS`.
 */
const CREDENTIAL_SUFFIXES = ["token", "secret", "password", "signature", "credential"] as const;

/**
 * Vrai si le nom finit par un suffixe de credential.
 *
 * ⚠️ CONTRAT D'ENTRÉE : `nomNormalise` doit être DÉJÀ normalisé, et c'est à
 * l'appelant de choisir sa normalisation — `normaliseName` pour un paramètre
 * (il retire en plus `.` `[` `]`, ce qui fait tomber `user[token]`), `foldKey`
 * pour un en-tête. Normaliser ICI avec `foldKey` ferait perdre les noms entre
 * crochets à `isSecretName` : une régression dans les paramètres d'URL, causée
 * par un changement qui ne parlait que des en-têtes.
 *
 * C'est aussi pourquoi cette fonction N'EST PAS exportée depuis `index.ts` :
 * un tel contrat est un piège pour un appelant externe.
 */
export function hasCredentialSuffix(nomNormalise: string): boolean {
  return CREDENTIAL_SUFFIXES.some((suffixe) => nomNormalise.endsWith(suffixe));
}
```

- [ ] **Step 5: Rebrancher `isSecretName` dessus**

Dans `src/scrub.ts`, remplacer la ligne 24 :

```ts
import { REDACTED, foldKey, hasCredentialSuffix, isSensitive } from "./redaction.js";
```

Puis remplacer le corps de `isSecretName` (lignes 190-203) par :

```ts
export function isSecretName(name: string): boolean {
  if (isSensitive(name)) return true;
  const n = normaliseName(name);
  if (SECRET_PARAMS.has(n)) return true;
  // `hasCredentialSuffix` reçoit `n`, DÉJÀ normalisé par `normaliseName` —
  // c'est ce qui préserve `user[token]`. Voir son contrat d'entrée.
  return hasCredentialSuffix(n) || n.startsWith("magic");
}
```

- [ ] **Step 6: Relancer la suite ENTIÈRE — rien ne doit bouger**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run --no-file-parallelism --maxWorkers=1
doppler run --project dev-conventions --config dev -- pnpm run typecheck
```

Attendu : vitest **PASS** (263 tests + les 9 nouveaux cas = 272), typecheck `exit 0`.

- [ ] **Step 7: Mutation — prouver que le test de caractérisation mord**

Remplacer temporairement, dans `src/redaction.ts` :

```ts
export function hasCredentialSuffix(nomNormalise: string): boolean {
  const n = foldKey(nomNormalise);
  return CREDENTIAL_SUFFIXES.some((suffixe) => n.endsWith(suffixe));
}
```

Puis :

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run src/scrub.test.ts --no-file-parallelism --maxWorkers=1
```

Attendu : **FAIL** sur la ligne `isSecretName(user[token]) === true`.
Si cette mutation ne fait rien échouer, **arrêter et le signaler** : le test ne tient pas ce qu'il prétend.

Puis **restaurer** la version de l'étape 4 et relancer pour confirmer le retour au vert.

- [ ] **Step 8: Commit**

```bash
git add src/redaction.ts src/scrub.ts src/scrub.test.ts
git commit -m "refactor(redaction): extraire hasCredentialSuffix, source unique des suffixes

Les suffixes de credential vivaient dans isSecretName (scrub.ts). scrubHeaders
va en avoir besoin, et deux listes jumelles derivent — c'est exactement la
classe de panne corrigee en 1.3.5 (une entree qui donnait une impression de
couverture parce que personne ne relisait deux endroits ensemble).

Le predicat descend dans redaction.ts, qui n'importe rien : aucun cycle.

Il recoit un nom DEJA normalise, et c'est le point non evident : isSecretName
normalise avec normaliseName, qui retire en plus . [ ] — un foldKey interne au
predicat lui ferait perdre user[token]. Test de caracterisation + mutation qui
le prouve.

Refactorisation pure : 272 tests verts avant comme apres, typecheck propre.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: La règle sur les en-têtes, avec précédence explicite

**Files:**
- Modify: `src/redaction.ts:239-250` (`scrubHeaders`)
- Test: `src/redaction.test.ts` (nouveau `describe`, à la fin du fichier)

**Interfaces:**
- Consumes: `hasCredentialSuffix(nomNormalise: string): boolean` (tâche 1), `foldKey`, `REDACTED`, `SENSITIVE_HEADERS` — tous dans `redaction.ts`
- Produces: `scrubHeaders` au contrat en trois cas ordonnés. La tâche 4 s'appuie dessus par `createSentryBeforeSend` et `signalServerless`.

- [ ] **Step 1: Écrire les tests qui échouent**

À la fin de `src/redaction.test.ts` :

```ts
describe("scrubHeaders — credential-suffix rule (1.4.0)", () => {
  const SECRET_NU = "k3n8Pq2wRt7vZx1mLb4c";

  // Six credentials authentiques, dans AUCUNE liste avant 1.4.0. Mesures a
  // l'appui : ils partaient en clair.
  it.each([
    "x-csrf-token",
    "x-xsrf-token",
    "x-amz-signature",
    "x-amz-credential",
    "x-amz-security-token",
    "x-goog-signature",
  ])("marks %s as [REDACTED] and keeps its key", (nom) => {
    const out = scrubHeaders({ [nom]: SECRET_NU, accept: "application/json" });
    expect(out[nom]).toBe(REDACTED);
    expect(JSON.stringify(out)).not.toContain(SECRET_NU);
    // La cle SURVIT : c'est ce qui rend la prise visible, donc contestable.
    expect(Object.keys(out)).toContain(nom);
  });

  it("folds case and separators like the exact list does", () => {
    expect(scrubHeaders({ "X-CSRF-Token": SECRET_NU })["X-CSRF-Token"]).toBe(REDACTED);
    expect(scrubHeaders({ X_CSRF_TOKEN: SECRET_NU })["X_CSRF_TOKEN"]).toBe(REDACTED);
  });

  // ⚠️ LA PRECEDENCE. Dix entrees de SENSITIVE_HEADERS finissent DEJA par un
  // suffixe de credential. Si le suffixe passait avant la liste exacte, elles
  // cesseraient d'etre SUPPRIMEES pour n'etre plus que MARQUEES : un
  // affaiblissement de la couverture existante, livre comme une amelioration.
  it.each([
    "stripe-signature",
    "x-knock-signature",
    "x-sanity-webhook-secret",
    "sanity-webhook-signature",
    "x-auth-token",
    "x-access-token",
  ])("keeps DELETING %s — the exact list wins over the suffix rule", (nom) => {
    const out = scrubHeaders({ [nom]: SECRET_NU, accept: "application/json" });
    expect(out).not.toHaveProperty(nom);
    expect(out).toEqual({ accept: "application/json" });
  });

  // ⚠️ LE TEMOIN LE PLUS IMPORTANT DU FICHIER.
  //
  // `location` figure dans les cles PII (au sens « lieu d'une personne »), donc
  // `isSensitive("location")` est VRAI. Or `Location` est l'en-tete HTTP
  // standard qui porte la cible d'une redirection. Brancher `isSecretName` — ou
  // `isSensitive` — sur le chemin des en-tetes supprimerait le Location de
  // toute reponse 3xx.
  //
  // Ce test ne garde pas une fonctionnalite : il garde une ERREUR DE CONCEPTION
  // FERMEE. Le jour ou quelqu'un trouvera plus court d'appeler isSecretName ici,
  // il tombera et lui dira pourquoi. Voir DECISIONS.md §19.
  it("keeps Location — the header path must never consult the PII keys", () => {
    const out = scrubHeaders({ location: "https://app.example.com/dashboard" });
    expect(out.location).toBe("https://app.example.com/dashboard");
  });

  it("keeps the diagnostic headers a suffix rule could plausibly eat", () => {
    const survivants = {
      "x-idempotency-key": "idem_01J9",
      "x-cache-key": "home-v3",
      "x-cache-status": "HIT",
      "content-location": "/fr/accueil",
      etag: 'W/"abc123"',
      "x-request-id": "req_01J9",
      "x-vercel-id": "cdg1::abc",
      "user-agent": "Mozilla/5.0 (Macintosh)",
    };
    expect(scrubHeaders({ ...survivants })).toEqual(survivants);
  });

  it("leaves isBot able to read the user-agent it survives on", () => {
    const out = scrubHeaders({ "user-agent": "Googlebot/2.1", "x-csrf-token": SECRET_NU });
    expect(isBot(out["user-agent"])).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer — vérifier l'échec, et sur quoi**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run src/redaction.test.ts --no-file-parallelism --maxWorkers=1
```

Attendu : **FAIL** sur les 6 cas `marks … as [REDACTED]` et sur `folds case and separators` (8 échecs). Les cas de précédence, `location` et les témoins doivent déjà **passer** — ils décrivent le comportement actuel, qui ne doit pas changer.

- [ ] **Step 3: Implémenter la règle avec précédence**

Remplacer `scrubHeaders` (`src/redaction.ts:239-250`) par :

```ts
export function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    // `foldKey`, pas `toLowerCase` : même règle que `SENSITIVE_KEYS` au-dessus,
    // donc `X-API-Key` et `X_API_KEY` tombent comme `x-api-key`.
    const folded = foldKey(key);

    // ── 1. LISTE EXACTE, EN PREMIER ─────────────────────────────────────────
    // L'ORDRE EST SIGNIFIANT. Dix entrées de `SENSITIVE_HEADERS` finissent déjà
    // par un suffixe de credential (`stripe-signature`, `x-auth-token`,
    // `x-sanity-webhook-secret`…). Si le suffixe était évalué avant, elles
    // cesseraient d'être SUPPRIMÉES pour n'être plus que MARQUÉES — un
    // affaiblissement de la couverture existante, livré comme une amélioration.
    // Épinglé par `redaction.test.ts`.
    if (SENSITIVE_HEADERS.has(folded)) continue;

    // ── 2. RÈGLE DE FORME ───────────────────────────────────────────────────
    // Attrapé par son SUFFIXE, pas par son nom : on MARQUE au lieu de
    // supprimer. Asymétrie assumée (DECISIONS.md §19). Une règle de forme trop
    // large est invisible si elle supprime — l'objet est seulement plus petit,
    // et personne ne sait pourquoi. Le marqueur rend la prise contestable.
    //
    // ⚠️ `hasCredentialSuffix`, JAMAIS `isSecretName` : celui-ci commence par
    // `isSensitive`, qui consulte les clés PII — où figure `location`, l'en-tête
    // standard d'une redirection.
    result[key] = hasCredentialSuffix(folded) ? REDACTED : value;
  }
  return result;
}
```

- [ ] **Step 4: Relancer — tout doit passer**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run --no-file-parallelism --maxWorkers=1
doppler run --project dev-conventions --config dev -- pnpm run typecheck
doppler run --project dev-conventions --config dev -- pnpm run lint
```

Attendu : vitest **PASS**, typecheck et lint `exit 0`.

- [ ] **Step 5: Mutation A — retirer la règle**

Remplacer temporairement la ligne 2 par `result[key] = value;`.
Lancer `vitest run src/redaction.test.ts`.
Attendu : **FAIL** sur les 6 prises + le cas de casse. Restaurer.

- [ ] **Step 6: Mutation B — le raccourci interdit**

Remplacer temporairement la même ligne par :

```ts
    result[key] = isSensitive(key) || hasCredentialSuffix(folded) ? REDACTED : value;
```

(ajouter `isSensitive` à la portée si nécessaire — c'est dans le même fichier).
Lancer `vitest run src/redaction.test.ts`.
Attendu : **FAIL** sur `keeps Location`. C'est la preuve que le témoin refuse le raccourci. Restaurer.

- [ ] **Step 7: Mutation C — inverser la précédence**

Déplacer temporairement le bloc `if (SENSITIVE_HEADERS.has(folded)) continue;` **après** l'affectation.
Lancer `vitest run src/redaction.test.ts`.
Attendu : **FAIL** sur les 6 cas `keeps DELETING …`. Restaurer.

Si l'une des trois mutations ne fait rien échouer, **arrêter et le signaler**.

- [ ] **Step 8: Commit**

```bash
git add src/redaction.ts src/redaction.test.ts
git commit -m "feat(redaction): regle de suffixe de credential sur les noms d'en-tetes

Ferme six fuites reelles, dans AUCUNE liste jusqu'ici : x-csrf-token,
x-xsrf-token, x-amz-signature, x-amz-credential, x-amz-security-token,
x-goog-signature. Mesure sur 70 en-tetes reels.

Un en-tete attrape par sa FORME est MARQUE [REDACTED], pas supprime, et sa cle
survit : une regle de forme trop large est invisible si elle supprime. Le
marqueur rend la prise contestable. Asymetrie assumee avec la liste exacte, qui
continue de supprimer ce qu'elle nomme.

PRECEDENCE EXPLICITE, liste exacte d'abord : dix de ses entrees finissent deja
par un suffixe, elles passeraient de supprimees a marquees. Mutation C le
prouve.

hasCredentialSuffix et JAMAIS isSecretName : celui-ci consulte les cles PII, ou
figure `location` — l'en-tete standard d'une redirection. Mutation B le prouve
par un temoin qui refuse ce raccourci.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Les quatre credentials que le suffixe ne peut pas voir

**Files:**
- Modify: `src/redaction.ts` (dans `SENSITIVE_HEADERS`, avant `].map(foldKey));` ligne 237)
- Test: `src/redaction.test.ts` (dans le `describe` de la tâche 2)

**Interfaces:**
- Consumes: `SENSITIVE_HEADERS`, le contrat de `scrubHeaders` (tâche 2)
- Produces: rien de nouveau — quatre entrées dans une liste existante.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le `describe("scrubHeaders — credential-suffix rule (1.4.0)")` :

```ts
  // Quatre credentials que la regle de suffixe NE PEUT PAS voir, et pourquoi :
  //   - x-hub-signature-256 / x-shopify-hmac-sha256 : le numero de version
  //     apres le mot desarme `endsWith` (`…signature256`) ;
  //   - x-functions-key / x-goog-api-key : `key` est exclu du suffixe, pour
  //     sauver x-idempotency-key.
  // Ils sont donc NOMMES dans la liste exacte — et donc SUPPRIMES, pas marques.
  // Sans eux, la regle fermerait 6 trous sur 10 en laissant croire qu'elle
  // ferme la classe : le defaut meme corrige en 1.3.5.
  it.each([
    "x-hub-signature-256",
    "x-shopify-hmac-sha256",
    "x-functions-key",
    "x-goog-api-key",
  ])("drops %s by name, because no suffix rule can reach it", (nom) => {
    const out = scrubHeaders({ [nom]: SECRET_NU, accept: "application/json" });
    expect(out).toEqual({ accept: "application/json" });
  });
```

- [ ] **Step 2: Lancer — vérifier l'échec**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run src/redaction.test.ts --no-file-parallelism --maxWorkers=1
```

Attendu : **FAIL** sur les 4 cas.

- [ ] **Step 3: Ajouter les quatre entrées**

Dans `src/redaction.ts`, **juste avant** `].map(foldKey));` :

```ts
  //
  // ── Credentials que la RÈGLE DE SUFFIXE ne peut pas atteindre ─────────────
  //
  // `hasCredentialSuffix` teste une fin de nom. Deux formes lui échappent par
  // construction, et elles doivent donc être nommées ici :
  //
  //   • un numéro de version APRÈS le mot : `x-hub-signature-256` plie en
  //     `xhubsignature256`, qui ne finit pas par `signature`. C'est la
  //     signature des webhooks GitHub, et la même forme vaut pour Shopify ;
  //   • un nom en `-key` : `key` est délibérément absent des suffixes, pour ne
  //     pas emporter `x-idempotency-key` (cf. CREDENTIAL_SUFFIXES). Le coût
  //     assumé de ce choix, c'est qu'Azure Functions et Google API doivent
  //     être nommés.
  //
  // Les nommer ici n'est pas un pis-aller : c'est ce qui empêche le README
  // d'annoncer une couverture « par la forme » qui fermerait 6 trous sur 10.
  "x-hub-signature-256",
  "x-shopify-hmac-sha256",
  "x-functions-key",
  "x-goog-api-key",
```

- [ ] **Step 4: Relancer**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run --no-file-parallelism --maxWorkers=1
```

Attendu : **PASS**.

- [ ] **Step 5: Commit**

```bash
git add src/redaction.ts src/redaction.test.ts
git commit -m "feat(redaction): nommer les quatre credentials hors de portee du suffixe

x-hub-signature-256 et x-shopify-hmac-sha256 : le numero de version apres le
mot desarme endsWith. x-functions-key et x-goog-api-key : `key` est exclu du
suffixe pour sauver x-idempotency-key.

Sans ces quatre entrees, la regle fermerait 6 trous sur 10 en se presentant
comme une couverture de classe — le defaut exact corrige en 1.3.5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Le câblage — bout en bout, idempotence, serverless

**Files:**
- Test: `src/scrub.test.ts` (dans le `describe` qui construit `beforeSend`, ligne ~440)
- Test: `src/serverless.test.ts` (dans le `describe` qui teste `scrubHeaders`, ligne ~147)

**Interfaces:**
- Consumes: `createSentryBeforeSend` (`src/before-send.ts`), `signalServerless` (`src/serverless.ts`), le contrat de `scrubHeaders` (tâches 2-3)
- Produces: rien — tests d'intégration.

> **Nature des tests de cette tâche** : ils passeront probablement **dès l'écriture**, puisque les tâches 2 et 3 ont fait le travail. Leur valeur n'est pas de piloter l'implémentation mais de **garder le câblage** : `scrubHeaders` a deux appelants, et rien ne garantit aujourd'hui qu'ils reçoivent le nouveau comportement. L'étape 4 le prouve par mutation.

- [ ] **Step 1: Bout en bout + idempotence, dans `src/scrub.test.ts`**

```ts
  it("marks a credential-suffix header inside a real event, and leaves it alone on a second pass", () => {
    const SECRET_NU = "k3n8Pq2wRt7vZx1mLb4c";
    const evenement = {
      request: {
        url: "https://www.example.com/api/v1/projects",
        headers: {
          "x-csrf-token": SECRET_NU,
          location: "https://www.example.com/apres-redirection",
          "user-agent": "Mozilla/5.0",
          "x-request-id": "req_01J9",
        },
      },
      exception: { values: [{ type: "Error", value: "boom" }] },
    };

    const out = beforeSend(evenement)!;
    expect(JSON.stringify(out)).not.toContain(SECRET_NU);
    expect(out.request!.headers).toEqual({
      "x-csrf-token": "[REDACTED]",
      location: "https://www.example.com/apres-redirection",
      "user-agent": "Mozilla/5.0",
      "x-request-id": "req_01J9",
    });

    // IDEMPOTENCE. Dans before-send, la valeur marquee traverse ENSUITE
    // scrubText (scrubHeaderValues). Elle doit en ressortir intacte — verifie,
    // pas suppose.
    const deuxiemePasse = beforeSend(out)!;
    expect(deuxiemePasse.request!.headers!["x-csrf-token"]).toBe("[REDACTED]");
  });
```

- [ ] **Step 2: Le chemin serverless, dans `src/serverless.test.ts`**

Dans le `describe` existant qui contient `scrubs credential headers via scrubHeaders, keeping the rest` :

```ts
  it("applies the credential-suffix rule to the headers it attaches to extra", async () => {
    const SECRET_NU = "k3n8Pq2wRt7vZx1mLb4c";
    const { signalServerless } = await chargerModule();
    signalServerless("revalidation refusee", (p) => void p, {
      headers: { "x-csrf-token": SECRET_NU, "x-request-id": "req_01J9" },
    });

    const appel = captureMessage.mock.calls[0]![1] as {
      extra?: { headers?: Record<string, string> };
    };
    expect(appel.extra!.headers).toEqual({
      "x-csrf-token": "[REDACTED]",
      "x-request-id": "req_01J9",
    });
  });
```

> Adapter `chargerModule()` et `captureMessage` aux helpers déjà présents en tête de `src/serverless.test.ts` — **les lire d'abord**, ne pas en inventer.

- [ ] **Step 3: Lancer les deux fichiers**

```bash
doppler run --project dev-conventions --config dev -- pnpm exec vitest run src/scrub.test.ts src/serverless.test.ts --no-file-parallelism --maxWorkers=1
```

Attendu : **PASS**.

- [ ] **Step 4: Mutation — débrancher le câblage**

Dans `src/before-send.ts`, remplacer temporairement `Object.entries(scrubHeaders(headers))` par `Object.entries(headers)`.
Lancer `vitest run src/scrub.test.ts`.
Attendu : **FAIL** sur le test de l'étape 1. Restaurer.

- [ ] **Step 5: Commit**

```bash
git add src/scrub.test.ts src/serverless.test.ts
git commit -m "test(redaction): garder le cablage des deux appelants de scrubHeaders

scrubHeaders a deux appelants — before-send (evenements) et serverless
(en-tetes joints a extra). Rien ne garantissait qu'ils recoivent le nouveau
comportement : ces tests le tiennent, et la mutation qui debranche
scrubHeaders de before-send les fait tomber.

Couvre aussi l'idempotence : la valeur marquee traverse ensuite scrubText, et
doit en ressortir intacte. Verifie, plus suppose.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Vérification complète avant la documentation

**Files:** aucun — tâche de mesure.

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: les chiffres réels que la tâche 6 écrira dans le CHANGELOG. **Ne pas les inventer.**

- [ ] **Step 1: Suite entière, typecheck, lint, build**

```bash
cd C:/Projects/sentry-config-sanity-secret
doppler run --project dev-conventions --config dev -- pnpm exec vitest run --no-file-parallelism --maxWorkers=1
echo "VITEST=$?"
doppler run --project dev-conventions --config dev -- pnpm run typecheck; echo "TSC=$?"
doppler run --project dev-conventions --config dev -- pnpm run lint; echo "LINT=$?"
doppler run --project dev-conventions --config dev -- pnpm run build; echo "BUILD=$?"
```

Attendu : les quatre à `0`. **Noter le nombre exact de fichiers et de tests** pour la tâche 6.

- [ ] **Step 2: Vérifier que le `dist` porte bien les nouveaux noms**

```bash
grep -l "x-hub-signature-256" dist/*.js
```

Attendu : les quatre points d'entrée (`index.js`, `client.js`, `client-lazy.js`, `edge.js`).

- [ ] **Step 3: Vérifier que `hasCredentialSuffix` N'EST PAS dans la surface publique**

```bash
grep -n "hasCredentialSuffix" src/index.ts || echo "OK — absent de index.ts, conforme"
```

Attendu : `OK — absent de index.ts, conforme`. Si présent, **le retirer** : son contrat d'entrée est un piège.

---

### Task 6: Documentation et version 1.4.0

**Files:**
- Modify: `DECISIONS.md` (amender §3 ; insérer §19 avant `## Comment ajouter une nouvelle décision`)
- Modify: `README.md` (la phrase « Matching … is **exact** »)
- Modify: `CONTRIBUTING.md:154-156` (section 5)
- Modify: `CHANGELOG.md` (entrée 1.4.0 en tête)
- Modify: `package.json` (`"version": "1.3.5"` → `"1.4.0"`)

**Interfaces:**
- Consumes: les chiffres mesurés en tâche 5
- Produces: rien de code.

- [ ] **Step 1: Amender `DECISIONS.md` §3 — en restreindre la portée**

Ajouter, après la ligne `**Conséquences si renversé**` de §3 :

```markdown
> **⚠️ PORTÉE RESTREINTE le 2026-09-30 (§19).** Cette décision vaut pour les
> **clés d'objet**, et ses contre-exemples (`ipAddress`, `emailAddressType`,
> `firstNamespace`) sont des formes de clés. Les **noms d'en-têtes HTTP**
> relèvent désormais aussi d'une règle de **suffixe de credential** — voir §19,
> qui dit pourquoi la forme d'un nom d'en-tête ne se raisonne pas comme celle
> d'une clé.
```

- [ ] **Step 2: Écrire `DECISIONS.md` §19**

Insérer **juste avant** `## Comment ajouter une nouvelle décision` :

```markdown
## 19. Noms d'en-têtes : suffixe de credential, en PLUS de l'énumération

**Contexte** : trois correctifs en dix jours (1.3.4 GRO-1548, 1.3.5 GRO-1563 deux fois) ont tous consisté à ajouter un nom après coup dans `SENSITIVE_HEADERS`. Le mode de panne n'est pas « il manque un nom » : une énumération ne couvre que ce qu'on a pensé à y mettre, et rien ne signale ce qu'elle rate. GRO-1563 l'a montré par l'absurde — `x-sanity-webhook-signature`, présent depuis longtemps, ne correspondait à RIEN de ce que Sanity envoie, et n'avait aucun test. De plus, `@groupe-j/blog-generator` expose son `headerName` en option surchargeable : le nom n'existe qu'à l'exécution, aucun test statique ne peut le couvrir.

**Décision** : une règle de **suffixe de credential** (`token`, `secret`, `password`, `signature`, `credential`) s'applique aux noms d'en-têtes, **en plus** de `SENSITIVE_HEADERS` — jamais à sa place. Trois cas évalués **dans cet ordre** : liste exacte → clé supprimée ; suffixe → valeur `[REDACTED]`, clé conservée ; sinon → valeur passée à `scrubText`.

**Pourquoi** :

- **L'ordre.** Dix entrées de la liste exacte finissent déjà par un suffixe. Sans précédence, elles passeraient de supprimées à marquées : un affaiblissement de la couverture existante, livré comme une amélioration.
- **`key` est exclu des suffixes.** Il emporterait `x-idempotency-key` — l'en-tête qu'on veut lire pour déboguer un double paiement — ainsi que `x-cache-key` et `x-cache-status`. Coût assumé : `x-functions-key` et `x-goog-api-key` doivent être nommés.
- **Le suffixe ne remplace pas l'énumération.** Un numéro de version après le mot désarme `endsWith` : `x-hub-signature-256` (webhooks GitHub) plie en `xhubsignature256`. Quatre noms sont donc nommés. Une règle qui fermerait 6 trous sur 10 en se présentant comme une couverture de classe serait le défaut qu'on corrige.
- **`isSecretName` n'est PAS branché sur les en-têtes**, bien que ce soit le raccourci évident. Sa première ligne est `isSensitive(name)`, qui consulte les clés PII — où figure `location`, au sens « lieu d'une personne ». Or `Location` est l'en-tête standard qui porte la cible d'une redirection : le brancher supprimerait le `Location` de toute réponse 3xx. Un test témoin (`keeps Location …`) refuse ce raccourci et dit pourquoi.
- **Le prédicat reçoit un nom DÉJÀ normalisé.** `isSecretName` normalise avec `normaliseName`, qui retire en plus `.` `[` `]` ; un `foldKey` interne au prédicat lui ferait perdre `user[token]` — une régression dans les paramètres d'URL causée par un changement qui ne parlait que des en-têtes. C'est aussi pourquoi `hasCredentialSuffix` n'est pas exporté depuis `index.ts`.
- **L'asymétrie supprimé / `[REDACTED]` est intentionnelle.** `archicollab-t3/packages/utils/src/sentry-noise.ts` argumente pour le retrait pur : « la présence même de la clé n'apprend rien d'utile ». C'est juste pour un en-tête retiré **nommément**. Ça ne l'est pas pour un en-tête attrapé **par sa forme**, où la visibilité est tout l'intérêt : sans marqueur, une règle trop large ne se découvre jamais, l'objet est seulement plus petit. Chaque argument s'applique à son domaine.

**Ce que cette décision laisse OUVERT** (une décision qui ne le dit pas se relit comme une garantie) : les suffixes versionnés autres que les deux nommés, et tout en-tête en `-key` non nommé. La couverture annoncée est « énumération PLUS suffixe », jamais « par la forme ».

**Conséquences si renversé** : revenir à l'énumération seule rouvre `x-csrf-token`, `x-xsrf-token`, `x-amz-signature`, `x-amz-credential`, `x-amz-security-token`, `x-goog-signature` — six credentials mesurés hors de toute liste avant 1.4.0. Inverser la précédence affaiblit dix entrées existantes. Brancher `isSecretName` à la place du prédicat supprime le `Location` des réponses 3xx.

---
```

- [ ] **Step 3: Réécrire la phrase du `README.md`**

Remplacer :

```markdown
Matching folds case and separators (`X-API-Key` ≡ `X_API_KEY` ≡ `x-api-key`) and
is **exact** — `x-request-id`, `user-agent`, `referer` and the rest stay, values
scrubbed.
```

par :

```markdown
Matching folds case and separators (`X-API-Key` ≡ `X_API_KEY` ≡ `x-api-key`).
Two rules apply, **in this order**:

1. **the exact list above** — the key is **removed**;
2. **a credential-suffix rule** (`token`, `secret`, `password`, `signature`,
   `credential`) — the value becomes `[REDACTED]` and **the key stays**, so the
   catch is visible and can be argued with. This closes `x-csrf-token`,
   `x-amz-signature` and their kind without naming them.

The order matters: ten entries of the exact list already end in a credential
suffix, and they must keep being *removed* rather than merely marked.

**What the suffix rule does NOT reach**, named here on purpose — announcing
shape-based coverage without its gaps is the very fault this replaced:

- a version number after the word (`x-hub-signature-256` folds to
  `xhubsignature256`) — hence GitHub's and Shopify's are listed by name;
- names ending in `key`: `key` is **deliberately not a suffix**, or
  `x-idempotency-key` and `x-cache-key` would be eaten. API keys are listed by
  name instead.

`x-request-id`, `user-agent`, `referer`, `etag`, `location` and the rest stay,
values scrubbed.
```

- [ ] **Step 4: Amender `CONTRIBUTING.md`**

Remplacer la section 5 (lignes 154-156) par :

```markdown
### 5. Bump : patch ou minor ?

- **Ajouter un NOM** à une liste (clé sensible, en-tête) = **patch** (`1.3.4` → `1.3.5`). Aucun changement observable pour le consommateur.
- **Changer le RÉGIME DE CORRESPONDANCE** (une règle au lieu d'une énumération) ou la **FORME DU RETOUR** d'un export public = **minor** (`1.3.5` → `1.4.0`). Le consommateur voit la différence : une clé présente à `[REDACTED]` là où elle était absente casse une requête Sentry écrite sur son absence.

La distinction date du 2026-09-30 (DECISIONS.md §19). Avant elle, cette section disait « ajout de redaction = patch » sans réserve, ce qui aurait classé 1.4.0 en patch.

Suivre [process de release](#process-de-release).
```

- [ ] **Step 5: Entrée `CHANGELOG.md` 1.4.0**

En tête, après la ligne `This project follows [Semantic Versioning](https://semver.org/).` :

```markdown

## [1.4.0] - 2026-09-30

### Added

- **Règle de suffixe de credential sur les noms d'en-têtes** (suite de GRO-1563).
  `SENSITIVE_HEADERS` reste, et une règle s'y ajoute : un en-tête dont le nom
  plié finit par `token`, `secret`, `password`, `signature` ou `credential` voit
  sa **valeur** remplacée par `[REDACTED]`, sa **clé conservée**.

  Ferme six credentials mesurés hors de toute liste jusqu'ici :
  `x-csrf-token`, `x-xsrf-token`, `x-amz-signature`, `x-amz-credential`,
  `x-amz-security-token`, `x-goog-signature`.

  **Pourquoi une règle et pas un nom de plus** : trois correctifs en dix jours
  avaient tous ajouté un nom après coup, et GRO-1563 a montré le vrai défaut —
  `x-sanity-webhook-signature` était présent depuis longtemps sans correspondre
  à rien de ce que Sanity envoie. Une énumération ne couvre que ce qu'on a pensé
  à y mettre. S'y ajoute que `@groupe-j/blog-generator` rend son `headerName`
  surchargeable : le nom n'existe qu'à l'exécution.

  **Précédence, liste exacte d'abord.** Dix de ses entrées finissent déjà par un
  suffixe ; sans ordre explicite elles passeraient de supprimées à marquées.

  **Asymétrie assumée** : ce qui est nommé disparaît, ce qui est attrapé par sa
  forme est marqué. Une règle de forme trop large est invisible si elle
  supprime. Voir DECISIONS.md §19.

  **Quatre credentials restent nommés**, parce qu'aucune règle de suffixe ne
  peut les atteindre : `x-hub-signature-256` et `x-shopify-hmac-sha256` (le
  numéro de version désarme `endsWith`), `x-functions-key` et `x-goog-api-key`
  (`key` est exclu des suffixes, pour ne pas emporter `x-idempotency-key`).

  **Ce que la règle NE couvre PAS** est nommé dans le README : annoncer une
  couverture par la forme sans dire ce qu'elle rate serait le défaut corrigé.

### Changed

- **`scrubHeaders` peut désormais rendre une clé présente valant `[REDACTED]`**
  là où elle était absente. C'est ce qui fait de cette version un **minor** et
  non un patch, contre la lettre de `CONTRIBUTING.md` — dont la section 5 est
  amendée pour distinguer « ajouter un nom » (patch) de « changer le régime de
  correspondance ou la forme du retour » (minor).
- `isSecretName` consomme le même prédicat que les en-têtes. **Refactorisation
  pure**, épinglée par un test de caractérisation : `user[token]`,
  `requestToken`, `ipAddress`, `firstNamespace`, `magicLink` gardent leur
  verdict. Le prédicat reçoit un nom déjà normalisé — normaliser en interne
  aurait fait perdre les noms entre crochets.
```

- [ ] **Step 6: Bumper `package.json`**

```bash
cd C:/Projects/sentry-config-sanity-secret
python -c "
import io
p='package.json'; s=io.open(p,encoding='utf-8').read()
a='\"version\": \"1.3.5\",'; b='\"version\": \"1.4.0\",'
assert s.count(a)==1, s.count(a)
io.open(p,'w',encoding='utf-8',newline='\n').write(s.replace(a,b))
print('1.3.5 -> 1.4.0')"
grep -n '"version"' package.json
```

- [ ] **Step 7: Relire la documentation — chasse aux affirmations fausses**

Vérifier, en relisant :

- aucun « TBD », « TODO », section vide ;
- le nombre de tests du CHANGELOG (s'il est cité) est celui **mesuré** en tâche 5, pas estimé ;
- la liste des six prises est identique dans le README, le CHANGELOG, §19 et les tests ;
- la liste des quatre noms est identique dans le code, le README, le CHANGELOG et §19 ;
- le README ne contient plus la phrase « is **exact** » sans réserve.

```bash
grep -n "is \*\*exact\*\*" README.md || echo "OK — la phrase absolue a disparu"
```

- [ ] **Step 8: Commit**

```bash
git add DECISIONS.md README.md CONTRIBUTING.md CHANGELOG.md package.json
git commit -m "docs: DECISIONS §19, portee de §3, contrat du README, semver — v1.4.0

§19 enregistre la regle de suffixe et ses cinq arbitrages avec leur preuve :
l'ordre, l'exclusion de `key`, les quatre noms hors de portee, le refus de
brancher isSecretName (piege `location`), et le contrat d'entree normalise.
Elle nomme aussi ce qu'elle laisse OUVERT — une decision qui ne le dit pas se
relit comme une garantie.

§3 n'est pas supprimee : sa portee est restreinte aux cles d'objet, ce qu'elle
etait deja en fait (ses contre-exemples sont des formes de cles).

README : la phrase « Matching is exact » devenait fausse. Elle decrit
desormais les deux regles, leur ORDRE, l'asymetrie, et les trous connus
NOMMES.

CONTRIBUTING section 5 disait « ajout de redaction = patch » sans reserve, ce
qui aurait classe cette version en patch. Elle distingue maintenant ajouter un
nom (patch) de changer le regime ou la forme du retour (minor).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Référence d'API et vérification finale

**Files:**
- Modify: `api-reference/` (généré)

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: un arbre où `git diff --exit-code -- api-reference` est vide — la condition exacte de la CI.

> **Cette tâche est la DERNIÈRE, et ce n'est pas un détail d'ordonnancement.** L'étape CI « Référence d'API à jour » régénère et exige un diff vide. Elle a mordu **deux fois de suite** (GRO-1548, puis GRO-1563), parce que toute modification de la longueur de `src/redaction.ts` déplace le lien de `scrubHeaders`. Régénérer avant la fin garantit de devoir le refaire.

- [ ] **Step 1: Régénérer**

```bash
cd C:/Projects/sentry-config-sanity-secret
doppler run --project dev-conventions --config dev -- pnpm docs:api
git diff --stat -- api-reference
```

Attendu : un diff non vide (au moins le lien de `scrubHeaders`).

- [ ] **Step 2: Reproduire EXACTEMENT le contrôle de la CI**

```bash
doppler run --project dev-conventions --config dev -- pnpm docs:api
git diff --exit-code -- api-reference; echo "GATE=$?"
```

Attendu : `GATE=0` **après** avoir commité l'étape 3. Si `GATE=1` persiste après un second passage, la génération n'est pas déterministe — **arrêter et le signaler**.

- [ ] **Step 3: Commit**

```bash
git add api-reference
git commit -m "docs(api): regenerer la reference apres la regle de suffixe

L'etape CI « Reference d'API a jour » regenere et exige un diff vide. Elle a
mordu deux fois de suite sur ce fichier (GRO-1548, GRO-1563) : toute
modification de la longueur de src/redaction.ts deplace le lien de
scrubHeaders. Derniere etape, jamais la premiere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Vérification finale, les cinq contrôles de la CI**

```bash
cd C:/Projects/sentry-config-sanity-secret
doppler run --project dev-conventions --config dev -- pnpm install --frozen-lockfile; echo "INSTALL=$?"
doppler run --project dev-conventions --config dev -- pnpm run lint; echo "LINT=$?"
doppler run --project dev-conventions --config dev -- pnpm run typecheck; echo "TSC=$?"
doppler run --project dev-conventions --config dev -- pnpm exec vitest run --no-file-parallelism --maxWorkers=1; echo "TEST=$?"
doppler run --project dev-conventions --config dev -- pnpm run build; echo "BUILD=$?"
doppler run --project dev-conventions --config dev -- pnpm docs:api && git diff --exit-code -- api-reference; echo "GATE=$?"
```

Attendu : les six à `0`.

- [ ] **Step 5: Pousser**

```bash
git push origin design/header-credential-suffix
```

> **La PR est ouverte par le pilote de la session, pas par cette tâche** — et elle cible `main` **après** la fusion de #70, dont cette branche est empilée. Si #70 n'est pas encore fusionnée, le dire au pilote plutôt que de rebaser sur `main`.

---

## Auto-relecture du plan

**Couverture de la spec** — chaque section a sa tâche :

| Spec | Tâche |
|---|---|
| §2 la règle, `key` exclu | 1 (prédicat), 2 (application) |
| §2 les quatre noms | 3 |
| §3.1 où vit le prédicat | 1 étape 4 |
| §3.2 contrat d'entrée normalisé | 1 étapes 2, 4, 7 (mutation) |
| §3.3 ce qui ne bouge pas dans `isSecretName` | 1 étapes 2, 5, 6 |
| §3.4 pourquoi pas `isSecretName` sur les en-têtes | 2 étape 6 (mutation B) + témoin |
| §4 contrat en trois cas, précédence | 2 étapes 1, 3, 7 (mutation C) |
| §4 rayon (les deux appelants) | 4 |
| §5.1 caractérisation | 1 |
| §5.2 nouveau comportement | 2, 3 |
| §5.3 le témoin `location` | 2 |
| §5.4 idempotence | 4 étape 1 |
| §6.1 1.4.0 + amendement CONTRIBUTING | 6 étapes 4, 6 |
| §6.2 DECISIONS §19 + portée de §3 | 6 étapes 1, 2 |
| §6.3 README | 6 étape 3 |
| §6.4 CHANGELOG | 6 étape 5 |
| §6.5 `api-reference` | 7 |
| §7 hors périmètre | non planifié, par construction |

**Placeholders** : aucun « TBD »/« TODO ». Une seule instruction de lecture assumée — tâche 4 étape 2, où les helpers de `serverless.test.ts` doivent être lus avant d'être appelés plutôt qu'inventés ; c'est explicite et borné.

**Cohérence des types et des noms** : `hasCredentialSuffix(nomNormalise: string): boolean` porte le même nom et la même signature dans les tâches 1, 2, 3 et 5, dans §19 et dans le README. `CREDENTIAL_SUFFIXES` n'apparaît qu'en tâches 1 et 3. `REDACTED` vaut `"[REDACTED]"` — les tests de la tâche 2 utilisent la constante importée, ceux de la tâche 4 le littéral parce que `before-send` n'exporte pas la constante dans ce contexte ; les deux sont la même valeur.

**Écart connu, assumé** : la tâche 4 écrit des tests qui passent immédiatement. C'est signalé en tête de la tâche, et leur falsifiabilité est établie par la mutation de l'étape 4 — pas par un rouge initial.

---

## Errata

Ce plan **n'est pas réécrit**. Il est le compte rendu de ce qui a été *demandé* :
récrire son corps effacerait le fait qu'il était faux, et ce fait est de
l'information — il dit où un plan écrit d'avance se trompe. Quatre de ses
affirmations ont été réfutées par la mesure pendant l'exécution. La référence
durable, elle, est la **spec**, corrigée dans son corps, et c'est elle que
`DECISIONS.md` §19 cite.

Les quatre avaient la même forme : **une affirmation plus large que la mesure qui
la soutenait**.

### 1. Le contrat d'entrée du prédicat — mauvaise justification

**Écrit ici** à **cinq** endroits : §Architecture (ligne 7), les commentaires
prescrits lignes 120 et 199, la puce de §19 ligne 692, et — recensée après coup —
**ligne 807**, dans le texte de CHANGELOG que ce plan prescrivait (« normaliser en
interne aurait fait perdre les noms entre crochets »). Cette cinquième
occurrence n'était couverte par aucun addendum : elle a été corrigée à la rédaction,
mais elle compte dans le décompte, parce qu'un brief non relu l'aurait recopiée.

L'affirmation : « si le prédicat faisait son propre `foldKey`, `isSecretName`
perdrait les noms entre crochets ».

**Mesuré** (tâche 1, par mutation) : faux. `normaliseName` vaut `foldKey(name)`
**puis** le retrait de `.` `[` `]`, donc le prédicat reçoit une chaîne déjà
pliée et refolder à l'intérieur est un no-op — la suite reste verte avec cette
mutation en place. Ce que le contrat protège, c'est un **appelant qui
sous-normalise** : `foldKey` ne retire pas les crochets, donc seul
`normaliseName` fait finir `user[token]` par `token`. La mutation qui le prouve
est **côté appelant** (`hasCredentialSuffix(foldKey(name))` dans
`isSecretName` → `user[token]` tombe).

La conclusion de conception — le prédicat reçoit un nom déjà normalisé, et il
n'est pas exporté depuis `index.ts` — était juste ; sa justification ne l'était
pas. Corrigé dans la spec §3.2 et dans `DECISIONS.md` §19.

### 2. `x-cache-status` n'est pas un exemple du suffixe `key`

**Écrit ici** (lignes 108 et 689) : le suffixe `key` « emporterait `x-cache-key`
et `x-cache-status` ».

**Mesuré** (revue de la tâche 1) : faux pour le second. `x-cache-status` plie en
`xcachestatus` et finit par `status` — aucun des cinq suffixes ne l'atteint, et
`key` non plus. Il reste légitime ailleurs comme en-tête de diagnostic *qui
survit* (spec § témoins, `redaction.test.ts`). Corrigé dans la spec §2 ;
`DECISIONS.md` §19 ne le reprend pas.

### 3. « 6 trous sur 10 » — chiffre non vérifiable depuis le code

**Écrit ici** (lignes 432, 473, 498, 690).

**Retiré** par la tâche 3 de `src/redaction.ts` et d'un commentaire de test, puis
de la spec. Le rapport « 6 sur 10 » dépend d'un corpus qui ne vit pas dans le
dépôt : un lecteur ne peut ni le refaire ni le contredire. Ce qui le remplace est
vérifiable en pliant quatre noms : `xhubsignature256`, `xshopifyhmacsha256`,
`xfunctionskey`, `xgoogapikey` — aucun ne finit par un des cinq suffixes, donc la
règle de forme ne peut pas les atteindre et ils sont nommés.

### 4. « un séparateur n'est jamais en fin de nom »

**Pas dans ce plan ni dans la spec** (vérifié) : l'affirmation venait d'une
directive de coordination, qui en concluait que `foldKey` ne porterait aucun
comportement propre sur le chemin du suffixe, au-delà de la casse.

**Mesuré** : faux. Quatre noms discriminent `foldKey` de `toLowerCase` sur ce
chemin, et quatre cas de `redaction.test.ts` les tiennent désormais — un
séparateur **final** (`x-csrf-token-`, `x_csrf_token_`), un séparateur **au
milieu du mot** (`x-pass-word` → `xpassword`) et un **accent** (`x-tokén`, qui
passe par la branche NFD). `foldKey` agit donc sur les deux chemins, et pas
seulement par la casse.

*Consigné le 2026-09-30, tâches 5 et 6.*
