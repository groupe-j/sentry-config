# Decisions — `@groupe-j/sentry-config`

Architecture Decision Records (lite) du package. Capture les **choix de design non-évidents** dont l'inversion accidentelle dans un refactor pourrait causer un incident.

Chaque décision liste : **Contexte**, **Décision**, **Pourquoi**, **Conséquences si renversé**.

---

## 1. PII redaction par key-name, pas par regex sur valeurs

**Contexte** : Sentry capture par défaut les `request.data`, `extra`, `contexts`, `breadcrumbs` qui peuvent contenir des PII (email, passport, numéro carte). Il faut filtrer.

**Décision** : Le redactor (`src/redaction.ts`) cherche les **noms de clés** dans un Set (`SENSITIVE_KEYS`) et redacte récursivement leur valeur. Il ne fait **pas** de regex sur les valeurs (ex: détecter un email par pattern).

**Pourquoi** :
- **Prédictible** : "tout `email` est redacté" est une garantie absolue. Une regex sur valeur a toujours des false-negatives (email avec format exotique) et false-positives (chaîne ressemblant à un IBAN qui n'est pas un IBAN).
- **Performance** : un `Set.has(key)` est O(1). Un regex match sur chaque valeur primitive d'un event Sentry est O(n × regexes).
- **Visible** : la redaction insère `"[REDACTED]"`, donc une absence de donnée est visible dans Sentry UI. Une regex pourrait silencieusement laisser passer un cas non-couvert.

**Conséquences si renversé** : si tu remplaces par regex-on-value, tu introduis des leaks invisibles et tu ralentis le `beforeSend` (qui doit rester sub-millisecond pour ne pas bloquer le rendering).

---

## 2. Normalisation `lower + strip underscore/dash` pour les clés

**Contexte** : Les API renvoient les mêmes données sous des noms différents : `id_card`, `idCard`, `id-card`, `IDCard`.

**Décision** : Avant le `Set.has()`, normaliser : `key.toLowerCase().replace(/[-_]/g, '')`. Donc `SENSITIVE_KEYS` contient toutes les variantes normalisées : `"idcard"`, `"emailaddress"`, etc.

**Pourquoi** :
- Évite d'avoir à lister 4 variantes par champ → moins de risque d'oubli
- Match les conventions camelCase (frontend), snake_case (Python/Postgres), kebab-case (HTTP headers)

**Conséquences si renversé** : tu devras lister toutes les variantes manuellement → forcément des oublis sur les nouveaux fields.

---

## 3. Whole-word match, pas substring

**Contexte** : Si on matche par substring, `"address"` (sensible) déclencherait aussi sur `"ipAddress"` (non-sensible) ou `"emailAddressType"` (non-sensible).

**Décision** : Match exact sur la clé normalisée (`Set.has(normalizedKey)`), pas `key.includes(sensitive)`.

**Pourquoi** :
- Over-redaction casse les dashboards Sentry (perte d'info utile pour debug)
- L'opposé (substring) crée des effets de bord imprévisibles à chaque ajout

**Conséquences si renversé** : tu vas redacter `ipAddress`, `requestToken` (non-PII), `firstNamespace` (devName), etc. — perte massive d'info de debug.

---

## 4. `[REDACTED]` visible, pas suppression silencieuse

**Contexte** : Pour redacter, on a deux options : (A) remplacer par `"[REDACTED]"`, (B) supprimer la clé / set à `null`.

**Décision** : Option A. Tous les fields sensibles deviennent `"[REDACTED]"`.

**Pourquoi** :
- Un dev qui lit l'event Sentry voit immédiatement que la donnée a été filtrée et peut demander un audit si nécessaire
- L'option B masque le filtrage : si un futur refactor enlève la clé du Set par erreur, **on ne le voit pas dans Sentry** (la donnée apparaît juste, comme "normale")
- Permet de compter combien de fois chaque field a été redacté (audit du Set complétude)

**Conséquences si renversé** : silent leak du field si jamais une régression sort la clé du Set.

---

## 5. WeakSet cycle guard (CRITIQUE)

**Contexte** : Les events Sentry contiennent des cycles d'objets via :
- `contexts.react.componentStack` (React error boundaries)
- `error.cause` chains (Apollo, Prisma, certains middleware)
- Self-references dans des objets de domain

Un walker récursif naïf rentre en boucle infinie → throw `RangeError: Maximum call stack`.

**Décision** : `redact()` accepte un `seen` WeakSet pour détecter les cycles. Chaque object visité est ajouté ; si on le re-rencontre, on retourne `"[Circular]"`.

**Pourquoi** :
- Un throw dans `beforeSend` cause Sentry à **silencieusement drop l'event entier**. C'est exactement le mode de panne que ce helper est censé prévenir.
- WeakSet (vs Set) ne tient pas de référence forte → pas de leak mémoire après que l'event sort de scope.

**Conséquences si renversé** : sous certains schémas d'erreur (notamment Apollo error chains), Sentry ne reçoit plus rien. Silencieusement. Tu perds l'observabilité **exactement quand tu en as besoin** (incident en cours).

---

## 6. `beforeSend` retourne un nouvel objet, pas de mutation

**Contexte** : Le redactor pourrait muter l'event in-place (plus rapide, moins d'allocation).

**Décision** : `createSentryBeforeSend()` retourne un nouvel object (`{ ...event, ... }`).

**Pourquoi** :
- Sentry pipeline downstream (Replay, integrations custom) peut lire l'event **après** `beforeSend` retourne. Mutation = leak vers ces consumers.
- Tests deviennent triviaux (compare input vs output sans clone).

**Conséquences si renversé** : leak de PII vers Replay (qui apparaît ensuite dans la UI Replay non-redactée).

---

## 7. `@sentry/profiling-node` est en `optional` peerDep

**Contexte** : Le profiling Node.js nécessite `@sentry/profiling-node`, qui contient des binaires natifs (Linux, macOS, Windows). Toutes les apps n'en ont pas besoin (edge runtime, apps sans CPU bottleneck).

**Décision** : Listé dans `peerDependenciesMeta.optional = true`. L'import dans `src/server.ts` est wrapped dans un try/catch pour ne pas planter si absent.

**Pourquoi** :
- Les apps edge-runtime (Vercel Edge) ne peuvent pas l'installer (binaires natifs interdits)
- Les apps low-traffic n'ont pas besoin du profiling → éviter le poids du binaire
- Sans `optional`, `pnpm install` warn ou échoue sur chaque app qui ne l'installe pas

**Conséquences si renversé** : breakage de l'install pour les apps edge / low-traffic, ou bundle bloat inutile.

---

## 8. Bot filtering est opt-in via `isBot()` helper, pas auto

**Contexte** : Les bots (Googlebot, AhrefsBot, etc.) génèrent énormément de noise dans Sentry (erreurs 404 sur de vieux paths, erreurs JS sur des bots qui exécutent JS de manière exotique).

**Décision** : Exposer un helper `isBot(userAgent)` que les apps utilisent dans **leur** `beforeSend` ou middleware. Pas de filtering auto.

**Pourquoi** :
- Certaines apps veulent **garder** les erreurs bot (ex: pour détecter du scraping abusif)
- Le User-Agent n'est pas accessible côté browser (client), donc le filtering doit se faire côté server
- Mettre ce filtering en auto-on créerait un comportement inattendu pour les nouvelles apps

**Conséquences si renversé (auto-on)** : surprise pour les apps qui voulaient surveiller le traffic bot, et impossible à différencier "événement filtré bot" vs "événement absent par erreur".

---

## 9. Health endpoints + static assets : `tracesSampler` retourne 0

**Contexte** : Health probes (Grafana Synthetic Monitoring) frappent `/api/health` toutes les 60s. Static assets génèrent du traffic mais aucune valeur pour le debug.

**Décision** : `createTracesSampler()` matche un set de regex (`SKIP_PATTERNS`) et retourne 0 pour ces routes. Le `defaultRate` (10% prod) ne s'applique qu'aux routes réelles.

**Pourquoi** :
- À 10% sample rate × 1440 health probes/jour = 144 transactions/jour de pure noise → ~50k/an
- Sentry pricing est par-transaction → économies réelles
- Les health checks réussissent toujours en steady-state ; on les détecte autrement (Grafana Status Page)

**Conséquences si renversé** : 30-50% du quota Sentry brûlé en health checks. Réduction du sample rate utile sur les routes business.

---

## 10. `tsup` build avec ESM + CJS, pas distribution de source

**Contexte** : `@groupe-j/ui` distribue le TypeScript source brut (`main: ./src/index.ts`). Pourquoi ce package fait autrement ?

**Décision** : `tsup` build vers `dist/` avec ESM (`*.js`), CJS (`*.cjs`), et `.d.ts`. Le `main`/`module`/`types` pointent vers `dist`.

**Pourquoi** :
- Ce package est consommé en **runtime** par les init Sentry — pas en transpilé par le bundler de l'app comme un component UI
- Cibles multiples : Next.js client (ESM), Next.js server (peut être CJS), `instrumentation.ts` (mixte)
- `@sentry/nextjs` lui-même est CJS-aware → on doit produire les deux formats
- Pas de tree-shaking critique ici (10 helpers vs 55 composants UI)

**Conséquences si renversé** : breakage de l'import dans certains runtimes Vercel (notamment edge + cold start), ou besoin de tasks de transpilation côté chaque app.

---

## 11. Types Sentry "loose" (SentryEventLike, SamplingContextLike)

**Contexte** : On pourrait importer les types officiels de `@sentry/types` ou `@sentry/core`.

**Décision** : Définir nos propres types loose dans chaque fichier (`SentryEventLike`, `SamplingContextLike`). Pas d'import de `@sentry/types`.

**Pourquoi** :
- Découplage de la version Sentry SDK : si Sentry renomme un field dans v11, on n'est pas cassé
- Pas de dépendance directe à `@sentry/*` (sauf `@sentry/nextjs` en peerDep) → install plus léger
- Les types loose sont assez précis pour nos opérations (lecture de `event.request.data`, etc.)

**Conséquences si renversé** : couplage tight au schema Sentry → chaque major bump SDK requiert mise à jour des types ici.

---

## 12. Init helpers (`initSentryClient/Server/Edge`) plutôt qu'export brut

**Contexte** : On pourrait juste exporter `redact`, `createSentryBeforeSend`, etc. et laisser chaque app faire son `Sentry.init({...})` avec 40 lignes.

**Décision** : Helpers `initSentryClient`, `initSentryServer`, `initSentryEdge` qui prennent un minimum d'args (`{ app: string }`) et font tout.

**Pourquoi** :
- 8 apps × 40 lignes d'init = 320 lignes à maintenir séparément, et 8 endroits où mettre à jour une best practice
- Une nouvelle option Sentry à activer pour tout le monde (ex: replay) = un seul fichier à toucher ici
- Force la consistance (impossible pour une app d'oublier le `beforeSend` ou de baisser le sample rate par erreur)

**Conséquences si renversé** : copy-paste init dans chaque app, drift inévitable, perte du levier d'amélioration centralisé.

---

## Comment ajouter une nouvelle décision

Quand tu fais un choix non-évident lors d'un futur refactor :

1. Ajouter une section ici (numéro suivant)
2. Lister **Contexte**, **Décision**, **Pourquoi**, **Conséquences si renversé**
3. Référencer le commit dans la section "Décidé : `<sha>` (`YYYY-MM-DD`)"

L'objectif n'est PAS de documenter chaque ligne — c'est de documenter les choix qui pourraient être "innocemment" inversés par un futur mainteneur (toi dans 6 mois inclus).
