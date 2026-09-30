/**
 * PII redaction by key-name (not regex on values).
 *
 * Why key-name: cheap, predictable, no false negatives on well-named fields.
 * Redaction is visible (`"[REDACTED]"`) so missing data is obvious in Sentry UI
 * rather than silent.
 *
 * Why whole-word + normalization (not substring): substring would over-redact
 * `ipAddress`, `requestToken`, etc. Normalisation handles `id_card` ≡ `idCard`
 * ≡ `id-card` (all become `idcard` → match), and folds accents and spaces
 * (`Prénom` ≡ `prenom`, `Code Postal` ≡ `codepostal`). Exact-key matching means broad
 * entries stay narrow: `name` redacts a key literally named `name`, never
 * `filename` / `hostname` / `username` / `appName`.
 *
 * Tradeoff — these broad keys also match fields libraries set for their own
 * use: `description` / `location` in `extra` or breadcrumb data become
 * `[REDACTED]`. Accepted, visible cost — in this lead-heavy portfolio they are
 * high-risk PII fields.
 *
 * `redact` itself applies the list everywhere. The event hooks do not, for one
 * case: `contexts.runtime.name` / `contexts.os.name` survive when they hold a
 * value the Sentry SDK writes ("node", "Linux") — product metadata that backs
 * the `runtime.name` / `os.name` tags (`scrubContexts` in ./scrub.ts,
 * GRO-1505). Any other value there, and `name` in every other context
 * (`device.name` included), stays redacted. Exception values are never passed through
 * `redact` (a message has no key names); free text goes through `scrubText` in
 * ./scrub.ts instead, which replaces PII VALUES inside the text and leaves
 * filenames untouched.
 *
 * Why WeakSet cycle guard: Sentry events hold cycles via
 * `contexts.react.componentStack` or error.cause chains from Apollo/Prisma.
 * A throw in `beforeSend` causes Sentry to silently drop the event —
 * exactly the failure mode this helper is meant to prevent.
 */

const SENSITIVE_KEYS = new Set([
  // Identity
  "email",
  "emails",
  "phone",
  "phonenumber",
  "telephone",
  "mobile",
  "mobilephone",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "givenname",
  "familyname",
  "dateofbirth",
  "dob",
  "birthdate",
  "birthday",
  "ip",

  // French form fields (lead, subscription and dossier forms of the portfolio).
  // Matched after folding case, accents and separators, like every key here:
  // `Prénom` ≡ `prenom`, `Code Postal` ≡ `code_postal` ≡ `codePostal`. Exact
  // match, so `nombre` / `nomenclature` never hit `nom`.
  "nom",
  "prenom",
  "tel",
  "portable",
  "adresse",
  "commune",
  "ville",
  "codepostal",
  "raisonsociale",
  "siret",

  // Lead / contact free-text (leads schema across portfolio apps —
  // `name`/`location`/`description` carry a person's identity, home town,
  // and self-description, so they are PII once attached to an event).
  "location",
  "description",

  // Government ID (Thailand, France, Luxembourg, EU)
  "passport",
  "passporturl",
  "passportnumber",
  "idcard",
  "idcardurl",
  "idcardnumber",
  "nationalid",
  "nationalidnumber",
  "ssn",
  "socialsecuritynumber",
  "niss",  // Luxembourg
  "nif",   // tax IDs

  // Address
  "address",
  "streetaddress",
  "billingaddress",
  "shippingaddress",
  "postalcode",
  "zipcode",
  "remoteaddr", // request.env.REMOTE_ADDR
  "city",

  // Auth + secrets
  "password",
  "passwordhash",
  "secret",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "csrftoken",

  // Payment
  "cardnumber",
  "cvv",
  "cvc",
  "iban",
  "swift",
  "bic",
]);

export const REDACTED = "[REDACTED]";

/**
 * Case, accents and word separators folded away: `Prénom` → `prenom`,
 * `code_postal` / `Code Postal` / `code-postal` → `codepostal`.
 */
export function foldKey(key: string): string {
  let folded = key.toLowerCase();
  // `redact` runs this on every key of every event: pay for Unicode
  // normalisation only when the key is not plain ASCII.
  if (/[\u0080-\uffff]/.test(folded)) {
    folded = folded.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return folded.replace(/[\s_-]/g, "");
}

export function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(foldKey(key));
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  // Cycle guard: return REDACTED rather than the same ref (which would re-enter
  // on the next traversal anyway).
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitive(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redact(v, seen);
    }
  }
  return result;
}

/**
 * Suffixes de nom qui désignent un credential, quel que soit le contexte.
 *
 * ⚠️ `key` N'Y FIGURE PAS, délibérément. Il emporterait `x-idempotency-key` —
 * précisément l'en-tête qu'on veut lire dans Sentry pour déboguer un double
 * paiement, et le portefeuille a un `@groupe-j/stripe` avec un
 * `src/idempotency.ts` dédié — ainsi que `x-cache-key`, qui est du
 * diagnostic. Les clés d'API sont couvertes NOMMÉMENT, dans
 * `SENSITIVE_KEYS` et `SENSITIVE_HEADERS`.
 */
const CREDENTIAL_SUFFIXES = ["token", "secret", "password", "signature", "credential"] as const;

/**
 * Vrai si le nom finit par un suffixe de credential.
 *
 * ⚠️ CONTRAT D'ENTRÉE : `nomNormalise` doit être DÉJÀ normalisé, et c'est à
 * l'appelant de choisir LE BON normaliseur. Ce n'est pas une coquetterie :
 *
 *   • `isSecretName` (paramètres d'URL, formulaires) doit passer par
 *     `normaliseName`, qui retire `.` `[` `]` en plus de ce que fait
 *     `foldKey` — sans quoi `user[token]` ne finit pas par `token` et cesse
 *     d'être reconnu ;
 *   • `scrubHeaders` (en-têtes HTTP) passe par `foldKey`, suffisant là où les
 *     noms n'ont ni point ni crochet.
 *
 * Normaliser ICI ne protégerait de rien : `foldKey` est idempotent sur une
 * chaîne déjà pliée, et il ne retire pas les crochets — un appelant qui
 * sous-normalise resterait cassé. La responsabilité est donc chez l'appelant,
 * et un test de caractérisation la tient : passer `foldKey(name)` au lieu de
 * `n` dans `isSecretName` fait tomber `user[token]`.
 *
 * Pas exporté depuis `index.ts` : ce contrat est un piège pour un appelant
 * externe.
 */
export function hasCredentialSuffix(nomNormalise: string): boolean {
  return CREDENTIAL_SUFFIXES.some((suffixe) => nomNormalise.endsWith(suffixe));
}

/**
 * Headers that are credentials by another name — strip them entirely.
 * They have no debug value once an error has fired.
 *
 * Le NOM est le seul filet pour un en-tête de ce genre : `scrubText` ne
 * reconnaît que des secrets à préfixe connu (`sk_`, `gh*_`, `eyJ`…), et une clé
 * d'API émise sans préfixe est une chaîne aléatoire nue qu'aucun motif ne
 * rattrape.
 *
 * Le SDK ne protège pas ce chemin, relevé dans @sentry/core 10.70 (GRO-1548) :
 * le filtrage par mot-clé (`SENSITIVE_KEY_SNIPPETS` — `auth`, `token`,
 * `secret`, `key`, `jwt`, `bearer`… — appliqué par `filterKeyValueData`) ne
 * tourne QUE dans `httpHeadersToSpanAttributes` (`utils/request.js`), donc sur
 * les ATTRIBUTS DE SPAN. Le chemin EVENT est ailleurs :
 * `extractNormalizedRequestData` (`integrations/requestdata.js`) recopie
 * `normalizedRequest.headers` EN BLOC dans `event.request.headers`, et n'en
 * retire que `cookie` et les en-têtes d'IP client. Aucun filtrage de clé.
 *
 * Et couper `sendDefaultPii` n'y change rien : il met `httpHeaders.request` à
 * `{ deny: PII_HEADER_SNIPPETS }`, et `include.headers` se calcule par
 * `!== false` — donc VRAI. (`PII_HEADER_SNIPPETS` vaut
 * `["forwarded", "-ip", "remote-", "via", "-user"]` : ni « key » ni « token »,
 * et lui aussi ne sert qu'au chemin span.)
 *
 * Absent d'ici, un en-tête de ce genre part donc en clair dans chaque event
 * levé pendant la requête, conservé 90 jours et lisible par tout membre de
 * l'organisation Sentry.
 *
 * Critère d'entrée : l'en-tête EST le secret. Un en-tête qui se contente d'en
 * contenir un (`referer` avec un jeton en query) n'a rien à faire ici — sa
 * VALEUR est nettoyée par `scrubText`, et le retirer coûterait du diagnostic.
 */
const SENSITIVE_HEADERS = new Set([
  "stripe-signature",
  "x-knock-signature",
  "x-webhook-signature",
  "x-vercel-signature",
  "x-telegram-bot-api-secret-token",
  "x-sanity-webhook-signature",
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  // Clés et jetons portés par un en-tête dédié : conventions courantes d'une
  // API authentifiée par clé (AWS API Gateway, `/api/v1` d'archicollab-t3).
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  // Secret de contournement de Vercel Deployment Protection : envoyé sur chaque
  // requête e2e et staging du portefeuille.
  "x-vercel-protection-bypass",
  // ── Webhooks Sanity : TROIS en-têtes, et il en manquait DEUX ─────────────
  //
  // ⚠️ `x-sanity-webhook-signature` (plus haut) est une entrée MORTE. Sanity
  // n'envoie jamais ce nom-là : `SIGNATURE_HEADER_NAME` de `@sanity/webhook`
  // vaut `sanity-webhook-signature`, SANS préfixe `x-`. Les deux plient
  // respectivement en `xsanitywebhooksignature` et `sanitywebhooksignature` :
  // la correspondance étant exacte, ils ne se rencontrent jamais. L'entrée
  // historique donnait donc une impression de couverture sans rien couvrir.
  // On garde l'ancienne (inoffensive, et une app a pu s'en inspirer) et on
  // ajoute le vrai nom.
  "sanity-webhook-signature",
  //
  // Et le secret de revalidation MAISON, à ne pas confondre avec la signature :
  // ce sont deux mécanismes distincts. La signature est un HMAC horodaté du
  // corps ; le secret, lui, est le secret partagé en clair. C'est `-secret` que
  // le portefeuille envoie le plus souvent — la convention vient de
  // `@groupe-j/blog-generator` (`headerName`, dont c'est le défaut), donc elle
  // est présente dans les six apps qui ont un blog. Là encore, `-signature` ne
  // couvrait pas `-secret` : le secret partait en clair.
  "x-sanity-webhook-secret",
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
  // Les nommer ici n'est pas un pis-aller : la règle de forme ne peut pas
  // atteindre ces quatre noms-là, et le lecteur peut le vérifier en pliant
  // leurs noms — aucun ne finit par un suffixe de `CREDENTIAL_SUFFIXES`.
  // Le README ne doit donc pas présenter la règle comme une couverture
  // complète « par la forme ».
  "x-hub-signature-256",
  "x-shopify-hmac-sha256",
  "x-functions-key",
  "x-goog-api-key",
].map(foldKey));

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
    //
    // La correspondance de CETTE liste est exacte après pliage, jamais une
    // sous-chaîne : c'est ce qui fait que `x-request-id` n'est pas emporté par
    // elle. (Ne vaut que pour la liste exacte : la règle de forme ci-dessous,
    // elle, teste une fin de nom.)
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
