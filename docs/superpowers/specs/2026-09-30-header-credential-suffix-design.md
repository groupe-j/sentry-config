# Règle de suffixe sur les noms d'en-têtes — design

**Date** : 2026-09-30 · **Paquet** : `@groupe-j/sentry-config` · **Version cible** : 1.4.0
**Linear** : suite de GRO-1563 (qui suit GRO-1548)

---

## 1. Le problème

`SENSITIVE_HEADERS` est une **énumération à correspondance exacte**. Un en-tête absent de la liste part en clair dans `event.request.headers`, conservé 90 jours et lisible par tout membre de l'organisation Sentry.

Trois correctifs en dix jours ont tous consisté à **ajouter un nom après coup** :

| Version | Ajout | Ticket |
|---|---|---|
| 1.3.4 | `x-api-key`, `api-key`, `x-auth-token`, `x-access-token`, `x-vercel-protection-bypass` | GRO-1548 |
| 1.3.5 | `x-sanity-webhook-secret`, `sanity-webhook-signature` | GRO-1563 |

Le second a révélé pire qu'un manque : `x-sanity-webhook-signature`, présent depuis longtemps, **ne correspondait à rien de ce que Sanity envoie** (le vrai nom n'a pas de préfixe `x-`). Une entrée morte, sans test, qui donnait une impression de couverture.

Le mode de panne n'est donc pas « il manque un nom ». C'est : **une énumération ne couvre que ce qu'on a déjà pensé à y mettre, et rien ne signale ce qu'elle rate.**

### Ce qui rend l'énumération structurellement insuffisante

`@groupe-j/blog-generator` expose `headerName` en **option surchargeable** (`RevalidateConfig`, défaut `x-sanity-webhook-secret`). Une app qui en change reste découverte, et **aucun test statique ne peut la couvrir** : le nom n'existe qu'à l'exécution, dans la configuration de l'app.

---

## 2. La décision

Ajouter une **règle de suffixe de credential** sur les noms d'en-têtes, **à côté** de la liste exacte — pas à sa place.

Suffixes retenus, repris à l'identique de `isSecretName` : `token`, `secret`, `password`, `signature`, `credential`.

**`key` est délibérément exclu.** Il attraperait `x-idempotency-key` — précisément l'en-tête qu'on veut lire dans Sentry pour déboguer un double paiement, et le portefeuille a un paquet `@groupe-j/stripe` avec un `src/idempotency.ts` dédié. Il emporterait aussi `x-cache-key`, qui est du diagnostic. (`x-cache-status`, longtemps cité ici à ses côtés, ne serait PAS emporté : il plie en `xcachestatus` et finit par `status`.) Les clés d'API restent couvertes **nommément** dans la liste exacte, où elles sont déjà.

### Ce que la règle ferme, mesuré sur 70 en-têtes réels

Six credentials authentiques qui, **dans `event.request.headers`**, ne passent
aujourd'hui par aucune liste :

`x-csrf-token` · `x-xsrf-token` · `x-amz-signature` · `x-amz-credential` · `x-amz-security-token` · `x-goog-signature`

### Ce qu'elle ne ferme PAS — à écrire dans le README

| En-tête | Pourquoi raté | Ce que c'est |
|---|---|---|
| `x-hub-signature-256` | plie en `…signature256` : le suffixe versionné désarme `endsWith` | signature des webhooks GitHub |
| `x-shopify-hmac-sha256` | même forme | HMAC Shopify |
| `x-functions-key` | `key` exclu | clé Azure Functions |
| `x-goog-api-key` | `key` exclu | clé Google API |

**Ces quatre noms entrent donc dans la liste exacte, dans la même livraison.** La règle de forme ne peut pas les atteindre, et plier leurs noms le montre : `xhubsignature256`, `xshopifyhmacsha256`, `xfunctionskey`, `xgoogapikey` — aucun ne finit par un des cinq suffixes. Une règle qui les laisserait dehors en se présentant comme une couverture de classe reproduirait le défaut qu'on corrige.

**La couverture annoncée est « énumération PLUS suffixe », jamais « par la forme ».**

> **Surface, et non règle nouvelle.** La règle de suffixe existe déjà dans
> `isSecretName`, sur les clés d'objet (`scrubEntry`) et les paramètres d'URL —
> vérifié sur v1.3.5. Ce que ce changement ajoute, c'est la **troisième
> surface** : `scrubHeaders`, le seul des trois chemins nettoyés par nom à
> n'avoir que la liste exacte. Sur le chemin `extra`, où `scrubDeep` passe, les
> six ci-dessus étaient déjà marqués, et `x-amz-credential` comme
> `x-amz-security-token` figurent nommément dans `SECRET_PARAMS`. L'affirmation
> « dans aucune liste » n'est vraie **que** de `event.request.headers`.

---

## 3. Architecture

### 3.1 Où vit le prédicat

`redaction.ts` n'importe **rien** (couche de base) ; `scrub.ts` importe depuis lui. Le prédicat partagé descend donc dans **`redaction.ts`**. L'inverse serait un cycle.

```
redaction.ts   hasCredentialSuffix()  ←  scrubHeaders()      [même fichier]
      ↑
scrub.ts       isSecretName()  appelle hasCredentialSuffix()
```

**Interne au paquet.** Pas exporté depuis `index.ts` : voir §3.2, son contrat d'entrée est un piège pour un appelant externe.

### 3.2 Le contrat d'entrée : un nom DÉJÀ normalisé

C'est le point qui peut casser quelque chose, et il n'est pas visible à la lecture.

`isSecretName` ne normalise pas avec `foldKey` mais avec `normaliseName`, qui **retire en plus `.`, `[` et `]`** :

| Nom | `normaliseName` | `foldKey` seul |
|---|---|---|
| `user[token]` | `usertoken` → **attrapé** | `user[token]` → *raté* |

> Légende — la colonne « `foldKey` seul » décrit ce que donnerait un
> **appelant qui sous-normalise**, pas un pliage interne au prédicat : celui-là
> serait sans effet.

Le piège n'est pas là où on le croit. `normaliseName` vaut `foldKey(name)`
**puis** le retrait de `.` `[` `]` : le prédicat reçoit donc une chaîne déjà
pliée, et refolder à l'intérieur serait un **no-op** (`foldKey` est idempotent).
Mesuré pendant l'implémentation : la suite reste verte avec cette mutation.

Le vrai risque est un **appelant qui sous-normalise**. `foldKey` ne retire pas
les crochets, donc seul `normaliseName` fait finir `user[token]` par `token`.
Si un jour `isSecretName` passait `foldKey(name)` au prédicat — le raccourci
apparemment équivalent — ce nom cesserait d'être reconnu, et la régression
frapperait les paramètres d'URL sans rapport avec les en-têtes.

C'est donc l'**appelant** qui porte la responsabilité, et c'est l'appelant que
la mutation attaque.

**Donc `hasCredentialSuffix(nomNormalise: string)` reçoit une chaîne déjà pliée, et chaque appelant normalise selon son contexte :**

- `isSecretName` → lui passe son `n` issu de `normaliseName` ;
- `scrubHeaders` → lui passe `foldKey(nom)`.

### 3.3 Ce qui ne bouge pas dans `isSecretName`

L'extraction déplace **uniquement** la chaîne de `endsWith`. Restent en place :

- l'appel initial à `isSensitive(name)` ;
- l'ensemble exact `SECRET_PARAMS` ;
- `startsWith("magic")` — ce n'est pas un suffixe, et il est spécifique aux paramètres.

### 3.4 Pourquoi `isSecretName` n'est PAS branché directement sur les en-têtes

Parce que sa première ligne est `isSensitive(name)`, qui consulte les clés **PII**. Or `location` y figure (au sens « lieu d'une personne »), et `Location` est l'en-tête HTTP standard qui porte la **cible d'une redirection**.

Le brancher tel quel supprimerait le `Location` de toute réponse 3xx — perte de diagnostic réelle, et exactement le risque contre lequel `DECISIONS.md §3` met en garde.

C'est un raccourci qui *paraît* plus propre. Le test témoin de §5 existe pour le refuser.

---

## 4. Le contrat de `scrubHeaders`

**Les trois cas sont évalués DANS CET ORDRE, et le premier qui répond gagne.** La précédence n'est pas un détail : sept entrées de la liste exacte finissent déjà par un suffixe de credential (`stripe-signature`, `x-knock-signature`, `x-webhook-signature`, `x-vercel-signature`, `sanity-webhook-signature`, `x-sanity-webhook-signature`, `x-sanity-webhook-secret`, `x-telegram-bot-api-secret-token`, `x-auth-token`, `x-access-token`). Sans ordre explicite, elles changeraient de comportement — supprimées aujourd'hui, marquées `[REDACTED]` demain — ce qui serait une régression silencieuse de la couverture existante.

| Ordre | Cas | Comportement | Motif |
|---|---|---|---|
| 1 | dans `SENSITIVE_HEADERS` (nommé) | **clé supprimée** | inchangé. On sait exactement ce qu'on retire. |
| 2 | suffixe de credential (par la forme) | **valeur → `[REDACTED]`, clé conservée** | la prise doit être observable pour être contestable |
| 3 | le reste | valeur passée à `scrubText` | inchangé |

**Test exigé** : `stripe-signature` reste **supprimé**, pas marqué. C'est la preuve que la précédence tient.

### L'asymétrie est intentionnelle, et elle réconcilie deux positions

`archicollab-t3/packages/utils/src/sentry-noise.ts` argumente l'inverse :

> Retrait PUR ET SIMPLE, pas un remplacement par « [redacted] » : la présence même de la clé n'apprend rien d'utile au diagnostic, et un marqueur inviterait à croire qu'on sait la relire.

Cet argument est **juste pour un en-tête retiré nommément** : on sait ce qu'on a enlevé, le marqueur n'ajoute rien. Il est **faible pour un en-tête attrapé par sa forme**, où la visibilité est tout l'intérêt : sans marqueur, une règle trop large ne se découvre jamais — l'objet est seulement plus petit, et personne ne sait pourquoi. C'est le mode de panne que `DECISIONS.md §4` décrit.

L'asymétrie applique donc chaque argument à son domaine de validité.

### Rayon du changement

`scrubHeaders` est exporté publiquement, mais **aucun consommateur ne l'appelle** : la seule occurrence hors du paquet est une *mention dans un commentaire* de `sentry-noise.ts`, qui a sa propre liste locale. Les deux appelants réels sont internes :

- `before-send.ts:116` (`scrubHeaderValues`) — chemin des événements ;
- `serverless.ts:109` — en-têtes joints au débogage.

---

## 5. Tests

Chaque famille est **éprouvée par mutation** : un test qui ne tombe pas quand on casse ce qu'il prétend tenir ne compte pas.

### 5.1 Non-régression de `isSecretName` (l'extraction ne change rien)

Tableau de verdicts épinglés :

| Nom | Attendu | Pourquoi ce cas |
|---|---|---|
| `user[token]` | sensible | **le cas qui prouve la normalisation** (cf. §3.2) |
| `requestToken` | sensible | cité par §3 comme victime du substring ; le suffixe l'attrape **volontairement** en contexte de paramètre |
| `ipAddress` | non sensible | contre-exemple de §3 |
| `firstNamespace` | non sensible | contre-exemple de §3 |
| `magicLink` | sensible | `startsWith("magic")`, resté local |
| `x-amz-credential` | sensible | suffixe `credential` |

**Mutation exigée** : faire normaliser le prédicat avec `foldKey` en interne doit rendre la ligne `user[token]` **rouge**.

### 5.2 Le nouveau comportement des en-têtes

- les six prises marquées `[REDACTED]` **avec leur clé conservée** ;
- les quatre ajouts nommés (`x-hub-signature-256`, `x-shopify-hmac-sha256`, `x-functions-key`, `x-goog-api-key`) **supprimés** ;
- un bout en bout par `createSentryBeforeSend`, sur un événement portant des en-têtes réels ;
- le chemin `serverless.ts` : les en-têtes joints à `extra` reçoivent le même traitement.

**Mutation exigée** : retirer le prédicat de `scrubHeaders` doit faire tomber chaque prise.

### 5.3 Le témoin — le test le plus important du lot

`location` **doit survivre**.

Il ne garde pas une fonctionnalité : il garde une **erreur de conception fermée**. Le jour où quelqu'un trouvera plus court de brancher `isSecretName` directement sur les en-têtes, ce test tombera et lui dira pourquoi (§3.4).

Avec lui : `x-idempotency-key`, `x-cache-key`, `x-cache-status`, `etag`, `x-request-id`, `x-vercel-id`, `content-location`, et `user-agent` — plus l'assertion que `isBot` sait encore le lire.

**Mutation exigée** : ajouter `isSensitive` en tête du chemin des en-têtes doit rendre la ligne `location` **rouge**.

### 5.4 Idempotence

Une valeur déjà `[REDACTED]` traversant `scrubText` dans `scrubHeaderValues` doit en ressortir **inchangée**. Vérifié par test, pas supposé.

---

## 6. Version et documentation

### 6.1 Pourquoi 1.4.0 et pas un patch

`CONTRIBUTING.md` écrit : « Ajout d'une clé sensible = **patch**, pas de breaking change pour les consommateurs. »

Cette règle **ne s'applique pas ici**, et son propre motif dit pourquoi : « aucun changement observable ». Or deux choses observables changent — le **régime de correspondance** (une règle, plus une seule énumération) et la **forme du retour** d'un export public (clé présente à `[REDACTED]` au lieu de clé absente). Un consommateur qui interrogeait Sentry sur l'absence d'une clé verra désormais la clé.

**Donc 1.4.0**, et `CONTRIBUTING.md` est amendé dans la même PR pour distinguer les deux cas :

- ajouter un **nom** à une liste → patch ;
- changer le **régime de correspondance** ou la **forme du retour** → minor.

Sans cet amendement, le prochain lecteur croira que la politique a été ignorée.

### 6.2 `DECISIONS.md` §19 — amende §3

§3 (« Whole-word match, pas substring ») **reste juste pour les clés d'objet** : ses contre-exemples (`ipAddress`, `emailAddressType`, `firstNamespace`) sont des formes de clés, pas d'en-têtes.

§19 en **restreint la portée** et enregistre que les **noms d'en-têtes** relèvent du suffixe, avec les deux arbitrages et leur preuve :

- le piège `location` (§3.4) — pourquoi le suffixe de credential, et non `isSecretName` ;
- le renoncement à `key` (§2) — pour sauver `x-idempotency-key`, en nommant le coût (`x-functions-key`, `x-goog-api-key`, couverts nommément).

§19 nomme aussi les **trous assumés** (suffixes versionnés) : une décision qui ne dit pas ce qu'elle laisse ouvert se relit comme une garantie.

### 6.3 `README.md`

La phrase « Matching … is **exact** » devient **fausse** et doit être réécrite :

- « liste exacte **plus** règle de suffixe » ;
- l'asymétrie suppression / `[REDACTED]`, et laquelle s'applique quand ;
- les **trous connus**, nommés — un README qui annonce une couverture par la forme sans dire ce qu'elle rate reproduirait le défaut corrigé.

### 6.4 `CHANGELOG.md`

Entrée 1.4.0 : la règle, les six prises, les quatre ajouts nommés, l'asymétrie, les trous assumés, et l'écart assumé à la politique semver.

### 6.5 `api-reference/`

Régénérée par `pnpm docs:api`. **Dernière étape, jamais la première** : l'étape CI « Référence d'API à jour » a mordu **deux fois de suite** sur ce fichier (GRO-1548, puis GRO-1563), parce que toute modification de la longueur de `redaction.ts` déplace le lien de `scrubHeaders`.

`MIGRATION.md` ne bouge pas : il porte l'adoption initiale du paquet, pas les montées de version.

---

## 7. Hors périmètre

- **La rotation de `SANITY_REVALIDATE_SECRET`** — GRO-1563. Cette livraison ferme l'exposition, elle n'efface rien de ce qui est déjà stocké dans Sentry.
- **Le filtre local d'archicollab** (`sentry-noise.ts`) est **redondant depuis 1.3.4** : sa propre condition (« tant que ce paquet ne l'inclut pas ») est fausse depuis le 23/09. Code mort donnant l'impression d'une protection locale. Ticket de suite sur `archicollab-t3`.
- **Le bump des 15 consommateurs** vers 1.4.0 — un lot à part, après publication.
