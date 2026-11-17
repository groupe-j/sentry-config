import type * as SentryTypes from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import {
  createReplayBeforeAddRecordingEvent,
  createSentryBeforeBreadcrumb,
  createSentryBeforeSend,
  createSentryBeforeSendTransaction,
  type SentryEventLike,
} from "./before-send.js";
import { REDACTED } from "./redaction.js";
import { REDACTED_VALUE, scrubQueryString, scrubText, scrubUrl, scrubUrlQuery } from "./scrub.js";

/**
 * Coordinates of a visitor's plot (= the address of a private person) in the
 * shapes the SDK actually records them: the Node outgoing-request breadcrumb
 * (`url` without its query + `http.query`), the server event's `request`
 * of a tRPC GET, the browser fetch / navigation breadcrumbs, a span.
 *
 * The coordinates below are sentinels: no output may contain their digits.
 */
const LNG = "6.17592";
const LAT = "49.11963";
const ADDRESS = "12 rue de Metz";

const beforeSend = createSentryBeforeSend<SentryEventLike>("test-app");

/** Every sentinel absent from the serialised output (decoded, so `%2C` does not hide `,`). */
function expectNoPosition(value: unknown): void {
  const text = decodeURIComponent(JSON.stringify(value).replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
  expect(text).not.toContain(LNG);
  expect(text).not.toContain(LAT);
  expect(text).not.toContain(ADDRESS);
}

const geomPoint = JSON.stringify({ type: "Point", coordinates: [Number(LNG), Number(LAT)] });

describe("position — Node outgoing-request breadcrumb (`http.query`)", () => {
  it("masks `geom` of apicarto, encoded by encodeURIComponent, and keeps the rest", () => {
    const event = beforeSend({
      breadcrumbs: [
        {
          type: "http",
          category: "http",
          data: {
            url: "https://apicarto.ign.fr/api/gpu/zone-urba",
            "http.method": "GET",
            "http.query": `?geom=${encodeURIComponent(geomPoint)}&_limit=1`,
            status_code: 504,
          },
        },
      ],
    });
    const data = event?.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(data["http.query"]).toBe(`?geom=${REDACTED_VALUE}&_limit=1`);
    expect(data.url).toBe("https://apicarto.ign.fr/api/gpu/zone-urba");
    expect(data.status_code).toBe(504);
    expectNoPosition(event);
  });

  it("masks `geom` as WHATWG URL leaves it (`{`, `,` and `[` raw) — past the `,` where `key=value` stops", () => {
    // `new URL("…?geom=" + JSON.stringify(g)).search`: only `"` is encoded.
    const search = new URL(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${geomPoint}&source_ign=PCI`).search;
    expect(search).toContain(",");
    const data = beforeSend({
      breadcrumbs: [{ category: "http", data: { url: "https://apicarto.ign.fr/api/cadastre/parcelle", "http.query": search } }],
    })?.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(data["http.query"]).toBe(`?geom=${REDACTED_VALUE}&source_ign=PCI`);
  });

  it("masks Géorisques `latlon` and DVF `lat` / `lon`", () => {
    const event = beforeSend({
      breadcrumbs: [
        {
          category: "http",
          data: { url: "https://georisques.gouv.fr/api/v1/gaspar/risques", "http.query": `?latlon=${LNG},${LAT}&rayon=1000` },
        },
        {
          category: "http",
          data: { url: "https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/", "http.query": `?lat=${LAT}&lon=${LNG}&dist=500` },
        },
      ],
    });
    expect((event?.breadcrumbs?.[0]?.data as Record<string, unknown>)["http.query"]).toBe(`?latlon=${REDACTED_VALUE}&rayon=1000`);
    expect((event?.breadcrumbs?.[1]?.data as Record<string, unknown>)["http.query"]).toBe(
      `?lat=${REDACTED_VALUE}&lon=${REDACTED_VALUE}&dist=500`,
    );
  });

  it("masks the address typed into a geocoder (`q`), known by the host of the sibling `url`", () => {
    const data = beforeSend({
      breadcrumbs: [
        {
          category: "http",
          data: { url: "https://data.geopf.fr/geocodage/search", "http.query": `?q=${encodeURIComponent(ADDRESS)}&limit=5` },
        },
      ],
    })?.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(data["http.query"]).toBe(`?q=${REDACTED_VALUE}&limit=5`);
  });

  it("keeps `q` when nothing says it is an address", () => {
    const data = beforeSend({
      breadcrumbs: [{ category: "http", data: { url: "https://cms.example.com/search", "http.query": "?q=permis&page=2" } }],
    })?.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(data["http.query"]).toBe("?q=permis&page=2");
  });
});

describe("position — server event of a tRPC GET (`request`)", () => {
  const input = JSON.stringify({ 0: { json: { lng: Number(LNG), lat: Number(LAT) } } });
  const query = `batch=1&input=${encodeURIComponent(input)}`;

  /** The input as the scrubbing re-encodes it: position keys `[REDACTED]`, the rest kept. */
  const scrubbedInput = encodeURIComponent(JSON.stringify({ 0: { json: { lng: REDACTED, lat: REDACTED } } }));

  it("masks the position INSIDE `input` in `request.url` and in the separate `query_string`", () => {
    const event = beforeSend({
      transaction: "GET /api/trpc/[trpc]",
      request: { url: `https://jepeuxconstruire.fr/api/trpc/carte.parcelles?${query}`, query_string: query },
    });
    expect(event?.request?.url).toBe(`https://jepeuxconstruire.fr/api/trpc/carte.parcelles?batch=1&input=${scrubbedInput}`);
    expect(event?.request?.query_string).toBe(`batch=1&input=${scrubbedInput}`);
    expectNoPosition(event);
  });

  it("keeps a tRPC input without position whole — the input is the diagnosis", () => {
    const plain = encodeURIComponent(JSON.stringify({ 0: { json: { id: "abc", page: 2 } } }));
    expect(scrubUrl(`/api/trpc/dossier.get?batch=1&input=${plain}`)).toBe(`/api/trpc/dossier.get?batch=1&input=${plain}`);
    expect(scrubQueryString(`batch=1&input=${plain}`, { trpc: true })).toBe(`batch=1&input=${plain}`);
  });

  it("masks position and address label inside a batched tRPC input, keeps the rest", () => {
    const batch = JSON.stringify({
      0: { json: { insee: "57463" } },
      1: { json: { lng: Number(LNG), lat: Number(LAT), label: ADDRESS, zone: "UA" } },
    });
    const out = scrubUrl(`/api/trpc/commune.get,carte.parcelles?batch=1&input=${encodeURIComponent(batch)}`);
    const kept: unknown = JSON.parse(decodeURIComponent(out.split("input=")[1] ?? ""));
    expect(kept).toEqual({
      0: { json: { insee: "57463" } },
      1: { json: { lng: REDACTED, lat: REDACTED, label: REDACTED_VALUE, zone: "UA" } },
    });
  });

  it("scrubs a double-encoded input and re-encodes it twice", () => {
    const twice = encodeURIComponent(encodeURIComponent(input));
    const out = scrubUrl(`/api/trpc/a?input=${twice}`);
    expect(out).toBe(`/api/trpc/a?input=${encodeURIComponent(scrubbedInput)}`);
  });

  it("masks an unreadable input whole (fail-closed)", () => {
    expect(scrubUrl("/api/trpc/x.y?input=abc")).toBe(`/api/trpc/x.y?input=${REDACTED_VALUE}`);
    expect(scrubQueryString("input=abc", { trpc: true })).toBe(`input=${REDACTED_VALUE}`);
    expect(scrubUrl(`/api/trpc/x.y?input=%7B%22lat%22%3A${LAT}`)).toBe(`/api/trpc/x.y?input=${REDACTED_VALUE}`);
    expect(scrubUrl("/api/trpc/x.y?input=%E0%A4%A")).toBe(`/api/trpc/x.y?input=${REDACTED_VALUE}`);
    const huge = encodeURIComponent(JSON.stringify({ ids: "x".repeat(70_000) }));
    expect(scrubUrl(`/api/trpc/x.y?input=${huge}`)).toBe(`/api/trpc/x.y?input=${REDACTED_VALUE}`);
  });

  it("scrubs a parsed `query_string` object or pairs the same way, and a JSON `input` without the route", () => {
    const masked = JSON.stringify({ 0: { json: { lng: REDACTED, lat: REDACTED } } });
    expect(scrubQueryString({ batch: "1", input })).toEqual({ batch: "1", input: masked });
    expect(scrubQueryString([["batch", "1"], ["input", input]])).toEqual([["batch", "1"], ["input", masked]]);
  });

  it("keeps a non-JSON `input` elsewhere", () => {
    expect(scrubUrl("/recherche?input=search-box")).toBe("/recherche?input=search-box");
  });

  it("masks a procedure input attached by `trpcMiddleware` (`contexts.trpc`), numbers included", () => {
    const event = beforeSend({
      contexts: { trpc: { procedure_type: "query", procedure_input: { lng: Number(LNG), lat: Number(LAT), insee: "57463" } } },
    });
    expect((event?.contexts?.trpc as Record<string, unknown>).procedure_input).toEqual({
      lng: REDACTED,
      lat: REDACTED,
      insee: "57463",
    });
  });

  it("masks a tRPC mutation body with coordinates (`request.data`)", () => {
    const event = beforeSend({ request: { data: JSON.stringify({ 0: { json: { lat: Number(LAT), lng: Number(LNG) } } }) } });
    expectNoPosition(event);
  });
});

describe("position — browser breadcrumbs (fetch, navigation)", () => {
  it("masks `input` of a tRPC fetch, URL relative to the page", () => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { lng: Number(LNG), lat: Number(LAT) } } }));
    const event = beforeSend({
      breadcrumbs: [
        {
          type: "http",
          category: "fetch",
          data: { method: "GET", url: `/api/trpc/dossier.dossier,carte.parcelles?batch=1&input=${input}`, status_code: 500 },
        },
      ],
    });
    expect((event?.breadcrumbs?.[0]?.data as Record<string, unknown>).url).toBe(
      `/api/trpc/dossier.dossier,carte.parcelles?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: { lng: REDACTED, lat: REDACTED } } }))}`,
    );
    expectNoPosition(event);
  });

  it("masks the geocoder call of the address field (fetch `url` with its query)", () => {
    const event = beforeSend({
      breadcrumbs: [
        {
          category: "xhr",
          data: { method: "GET", url: `https://api-adresse.data.gouv.fr/search/?q=${ADDRESS.replace(/ /g, "+")}&limit=5` },
        },
      ],
    });
    expect((event?.breadcrumbs?.[0]?.data as Record<string, unknown>).url).toBe(
      `https://api-adresse.data.gouv.fr/search/?q=${REDACTED_VALUE}&limit=5`,
    );
  });

  it("masks position and address label of a navigation, keeps the rest", () => {
    const to = `/recherche?lng=${LNG}&lat=${LAT}&label=${encodeURIComponent(ADDRESS)}&insee=57463&focus=prix`;
    const event = beforeSend({ breadcrumbs: [{ category: "navigation", data: { from: "/", to } }] });
    expect((event?.breadcrumbs?.[0]?.data as Record<string, unknown>).to).toBe(
      `/recherche?lng=${REDACTED_VALUE}&lat=${REDACTED_VALUE}&label=${REDACTED_VALUE}&insee=57463&focus=prix`,
    );
  });

  it("masks the label even when it comes BEFORE the position", () => {
    expect(scrubUrl(`/recherche?label=${encodeURIComponent(ADDRESS)}&lat=${LAT}`)).toBe(
      `/recherche?label=${REDACTED_VALUE}&lat=${REDACTED_VALUE}`,
    );
  });

  it("masks the page URL of a browser event (`request.url`)", () => {
    const event = beforeSend({ request: { url: `https://jepeuxconstruire.fr/recherche?lng=${LNG}&lat=${LAT}` } });
    expect(event?.request?.url).toBe(`https://jepeuxconstruire.fr/recherche?lng=${REDACTED_VALUE}&lat=${REDACTED_VALUE}`);
  });
});

describe("position — malformed URLs fail closed", () => {
  it("drops the whole query when a parameter NAME cannot be decoded", () => {
    expect(scrubUrl(`https://jepeuxconstruire.fr/recherche?l%E0t=${LAT}&lng=${LNG}#carte`)).toBe(
      `https://jepeuxconstruire.fr/recherche?${REDACTED_VALUE}`,
    );
    expect(scrubUrlQuery(`?%E0=${LAT}`)).toBe(`?${REDACTED_VALUE}`);
    expect(scrubQueryString(`%E0=${LAT}&lng=${LNG}`)).toBe(REDACTED_VALUE);
  });

  it("drops it from a breadcrumb too", () => {
    const event = beforeSend({
      breadcrumbs: [{ category: "fetch", data: { url: `https://data.geopf.fr/geocodage/search?%ZZ=${ADDRESS}` } }],
    });
    expect((event?.breadcrumbs?.[0]?.data as Record<string, unknown>).url).toBe(
      `https://data.geopf.fr/geocodage/search?${REDACTED_VALUE}`,
    );
  });

  it("masks a position whose VALUE is malformed — values are never decoded to decide", () => {
    expect(scrubUrl(`/x?lat=%E0%A4%A${LAT}&page=2`)).toBe(`/x?lat=${REDACTED_VALUE}&page=2`);
  });

  it("masks a position parameter in free text whose name cannot be decoded", () => {
    expect(scrubText(`GET /x?ab%E0=${LAT}`)).toBe(`GET /x?ab%E0=${REDACTED_VALUE}`);
  });
});

describe("position — free text, `extra`, spans", () => {
  it("masks a URL quoted in an exception message and in `extra`", () => {
    const url = `https://apicarto.ign.fr/api/gpu/zone-urba?geom=${encodeURIComponent(geomPoint)}`;
    const event = beforeSend({
      exception: { values: [{ type: "ExternalHttpError", value: `HTTP 504 for ${url}` }] },
      extra: { endpoint: url, nested: { links: [`${url}&x=1`] } },
    });
    expect(event?.exception?.values?.[0]?.value).toBe(
      `HTTP 504 for https://apicarto.ign.fr/api/gpu/zone-urba?geom=${REDACTED_VALUE}`,
    );
    expectNoPosition(event);
  });

  it("masks coordinates written as numbers in a dump (JSON, JS object, GeoJSON)", () => {
    expect(scrubText(`input: {"lat":${LAT},"lng":${LNG}}`)).toBe(`input: {"lat":${REDACTED_VALUE},"lng":${REDACTED_VALUE}}`);
    expect(scrubText(`{ lat: ${LAT}, lng: -${LNG} }`)).toBe(`{ lat: ${REDACTED_VALUE}, lng: ${REDACTED_VALUE} }`);
    expect(scrubText(`{"type":"Polygon","coordinates":[[[${LNG},${LAT}],[6.1,49.1]]]}`)).toBe(
      `{"type":"Polygon","coordinates":${REDACTED_VALUE}}`,
    );
  });

  it("masks span data of a transaction (`http.query` next to `url`)", () => {
    const tx = createSentryBeforeSendTransaction<SentryEventLike>()({
      spans: [
        {
          description: "GET https://apicarto.ign.fr/api/gpu/zone-urba",
          data: { url: "https://apicarto.ign.fr/api/gpu/zone-urba", "http.query": `?geom=${encodeURIComponent(geomPoint)}` },
        },
      ],
    });
    expect((tx.spans?.[0]?.data as Record<string, unknown>)["http.query"]).toBe(`?geom=${REDACTED_VALUE}`);
  });
});

describe("position — map viewport", () => {
  it("masks the WMTS tile row / column of a map fetch, keeps layer and zoom", () => {
    const url =
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&TILEMATRIX=19&TILEROW=180234&TILECOL=265432";
    expect(scrubUrl(url)).toBe(
      `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&TILEMATRIX=19&TILEROW=${REDACTED_VALUE}&TILECOL=${REDACTED_VALUE}`,
    );
  });

  it("masks a bounding box, as a WMS parameter and as an object", () => {
    expect(scrubUrl(`/wms?REQUEST=GetMap&BBOX=${LNG},${LAT},6.18,49.12&WIDTH=256`)).toBe(
      `/wms?REQUEST=GetMap&BBOX=${REDACTED_VALUE}&WIDTH=256`,
    );
    const event = beforeSend({ extra: { viewport: { minLng: 6.1, minLat: 49.1, maxLng: 6.2, maxLat: 49.2, zoom: 17 } } });
    expect(event?.extra?.viewport).toEqual({ minLng: REDACTED, minLat: REDACTED, maxLng: REDACTED, maxLat: REDACTED, zoom: 17 });
    expect(scrubText(`{"minLat":${LAT}}`)).toBe(`{"minLat":${REDACTED_VALUE}}`);
  });
});

describe("position — what stays", () => {
  it("leaves look-alike names and ordinary queries alone", () => {
    for (const url of ["/x?latency=120&plat=3&longueur=12", "/x?page=2&sort=asc", "/x?zoom=15&layer=cadastre"]) {
      expect(scrubUrl(url)).toBe(url);
    }
    expect(scrubText("latency: 120, plateau: 3")).toBe("latency: 120, plateau: 3");
  });

  it("keeps an empty position parameter (nothing to hide, and it diagnoses a missing value)", () => {
    expect(scrubUrl("/recherche?lat=&lng=")).toBe("/recherche?lat=&lng=");
  });

  it("still masks credentials next to a position", () => {
    expect(scrubUrl(`/cb?token=abcdef123456&lat=${LAT}`)).toBe(`/cb?token=${REDACTED_VALUE}&lat=${REDACTED_VALUE}`);
  });
});

describe("createSentryBeforeBreadcrumb", () => {
  const beforeBreadcrumb = createSentryBeforeBreadcrumb();

  it("scrubs a breadcrumb when it is recorded, without mutating it", () => {
    const crumb = {
      type: "http",
      category: "http",
      level: "info",
      data: { url: "https://apicarto.ign.fr/api/gpu/zone-urba", "http.query": `?geom=${encodeURIComponent(geomPoint)}` },
    };
    const out = beforeBreadcrumb(crumb);
    expect(out).toEqual({ ...crumb, data: { ...crumb.data, "http.query": `?geom=${REDACTED_VALUE}` } });
    expect(crumb.data["http.query"]).toContain("geom=%7B");
  });

  it("fails closed: a breadcrumb that cannot be scrubbed keeps its kind, loses its content", () => {
    const crumb = {
      type: "http",
      category: "fetch",
      timestamp: 1,
      get data(): unknown {
        throw new Error("boom");
      },
    };
    expect(beforeBreadcrumb(crumb)).toEqual({ type: "http", category: "fetch", timestamp: 1, message: REDACTED_VALUE });
  });
});

describe("position — passes compose", () => {
  it("is idempotent: `beforeBreadcrumb` then `beforeSend` change nothing more", () => {
    const samples = [
      `/recherche?lng=${LNG}&lat=${LAT}&label=${encodeURIComponent(ADDRESS)}`,
      `?geom=${encodeURIComponent(geomPoint)}&_limit=1`,
      `?geom=${geomPoint}&x=1`,
      `{"url":"/x?lat=${LAT}"}`,
      `{"type":"Point","coordinates":[${LNG},${LAT}]}`,
      `{ lat: ${LAT} }`,
      `/api/trpc/a?input=${encodeURIComponent('{"lat":1}')}`,
    ];
    for (const sample of samples) {
      const once = scrubText(sample);
      expect(scrubText(once), sample).toBe(once);
      expect(scrubUrl(scrubUrl(sample)), sample).toBe(scrubUrl(sample));
    }
  });

  it("keeps the closing quote of a JSON string around a masked URL", () => {
    expect(scrubText(`{"to":"/recherche?lat=${LAT}"}`)).toBe(`{"to":"/recherche?lat=${REDACTED_VALUE}"}`);
  });
});

describe("position — cost", () => {
  it("stays linear on adversarial strings", () => {
    const inputs = [
      ",a=".repeat(33_000),
      ",input=".repeat(14_000),
      ",lat=".repeat(20_000),
      "&geom={".repeat(14_000),
      "geom=" + "{".repeat(100_000),
      ",q=".repeat(33_000) + "&lat=1",
      "lat:".repeat(25_000),
      '"coordinates":['.repeat(6_500),
      "coordinates:[1".repeat(7_000),
      "lat: 1".repeat(16_000),
      "?" + "%E0=".repeat(25_000),
      "?" + "a".repeat(64) + "=".repeat(100_000),
    ];
    for (const input of inputs) {
      const start = performance.now();
      scrubText(input);
      scrubUrl(input);
      expect(performance.now() - start, input.slice(0, 24)).toBeLessThan(250);
    }
  });
});

describe("position — review cases (PR #91)", () => {
  it("masks an unencoded address up to the next parameter, not the first space", () => {
    const data = beforeSend({
      breadcrumbs: [{ category: "fetch", data: { url: `https://api-adresse.data.gouv.fr/search/?q=${ADDRESS} 57000 Metz&limit=5` } }],
    })?.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(data.url).toBe(`https://api-adresse.data.gouv.fr/search/?q=${REDACTED_VALUE}&limit=5`);
    expect(scrubQueryString(`input={"0":{"json":{"label":"${ADDRESS}","lat":${LAT}}}}&batch=1`)).toBe(
      `input={"0":{"json":{"label":"${REDACTED_VALUE}","lat":"${REDACTED}"}}}&batch=1`,
    );
  });

  it("masks a double-encoded address in a nested URL (`%2520` decodes to a space)", () => {
    const out = scrubUrl(`https://x.fr/login?next=%2Frecherche%3Flng%3D${LNG}%26label%3D12%2520rue%2520de%2520Metz`);
    expectNoPosition(out);
    expect(out).not.toContain("Metz");
  });

  it("masks free-text address values past their spaces, up to a line or quote", () => {
    expect(scrubText(`geocode failed: adresse=${ADDRESS} 57000 Metz\nnext line`)).toBe(
      `geocode failed: adresse=${REDACTED_VALUE}\nnext line`,
    );
  });

  it("keeps `server.address` and other dotted OTel attributes", () => {
    const tx = createSentryBeforeSendTransaction<SentryEventLike>()({
      spans: [{ data: { "server.address": "apicarto.ign.fr", "network.peer.address": "10.0.0.1", "url.full": "https://apicarto.ign.fr/x" } }],
    });
    expect((tx.spans?.[0]?.data as Record<string, unknown>)["server.address"]).toBe("apicarto.ign.fr");
    expect(scrubText('{"server.address":"apicarto.ign.fr"}')).toBe('{"server.address":"apicarto.ign.fr"}');
    expect(scrubText("server.address=apicarto.ign.fr status=504")).toBe("server.address=apicarto.ign.fr status=504");
  });

  it("masks the label of a geocoder suggestion next to its position (object and JSON text)", () => {
    const event = beforeSend({ extra: { suggestion: { label: `${ADDRESS} 57000 Metz`, lat: Number(LAT), lng: Number(LNG), insee: "57463" } } });
    expect(event?.extra?.suggestion).toEqual({ label: REDACTED_VALUE, lat: REDACTED, lng: REDACTED, insee: "57463" });
    expect(scrubText(`{"label":"${ADDRESS}","lat":${LAT},"lng":${LNG}}`)).toBe(
      `{"label":"${REDACTED_VALUE}","lat":${REDACTED_VALUE},"lng":${REDACTED_VALUE}}`,
    );
    // Without a position, a label is a UI label.
    expect(beforeSend({ extra: { button: { label: "Rechercher" } } })?.extra?.button).toEqual({ label: "Rechercher" });
  });

  it("masks a large polygon to its end (no 8 KB tail in clear)", () => {
    const ring = Array.from({ length: 600 }, (_, i) => [6.1 + i / 1e6, 49.1 + i / 1e6]);
    const geom = JSON.stringify({ type: "Polygon", coordinates: [ring] });
    expect(scrubUrl(`/api/cadastre?geom=${geom}&x=1`)).toBe(`/api/cadastre?geom=${REDACTED_VALUE}&x=1`);
    expect(scrubUrl(`/api/cadastre?geom=${encodeURIComponent(geom)}`)).toBe(`/api/cadastre?geom=${REDACTED_VALUE}`);
    expect(scrubText(`"coordinates":${JSON.stringify([ring])}`)).toBe(`"coordinates":${REDACTED_VALUE}`);
  });

  it("stops a raw JSON value at its closing bracket inside a JSON string", () => {
    expect(scrubText('{"url":"/api/gpu?geom={%22type%22:%22Point%22}","status":500}')).toBe(
      `{"url":"/api/gpu?geom=${REDACTED_VALUE}","status":500}`,
    );
  });

  it("finds a position parameter right after a quote or a parenthesis", () => {
    expect(scrubText(`{"qs":"lat=${LAT}&lng=${LNG}"}`)).toBe(`{"qs":"lat=${REDACTED_VALUE}&lng=${REDACTED_VALUE}"}`);
    expect(scrubText(`(lat=${LAT})`)).toBe(`(lat=${REDACTED_VALUE})`);
  });

  it("masks slippy-map tiles and the map hash, keeps the zoom", () => {
    expect(scrubUrl("https://tile.openstreetmap.org/19/265432/180123.png")).toBe(
      `https://tile.openstreetmap.org/19/${REDACTED_VALUE}/${REDACTED_VALUE}.png`,
    );
    expect(scrubUrl(`/recherche#17.5/${LAT}/${LNG}`)).toBe(`/recherche#17.5/${REDACTED_VALUE}`);
    expect(scrubText(`center: [${LNG}, ${LAT}]`)).toBe(`center: ${REDACTED_VALUE}`);
  });

  it("fails closed on an undecodable key of a parsed query_string", () => {
    expect(scrubQueryString({ "%E0": LAT, page: "2" })).toEqual({ "%E0": REDACTED_VALUE, page: "2" });
    expect(scrubQueryString([["l%61t", LAT]])).toEqual([["l%61t", REDACTED_VALUE]]);
  });

  it("reads the root span's URL fields (`contexts.trace.data`) with their host", () => {
    const tx = createSentryBeforeSendTransaction<SentryEventLike>()({
      contexts: { trace: { trace_id: "t", data: { "url.full": "https://data.geopf.fr/geocodage/search", "url.query": `?q=${ADDRESS}` } } },
    });
    expect(((tx.contexts?.trace as Record<string, unknown>).data as Record<string, unknown>)["url.query"]).toBe(`?q=${REDACTED_VALUE}`);
  });

  it("beforeBreadcrumb scrubs top-level strings and console arguments, leaves nested objects to beforeSend", () => {
    const nested = { features: [{ geometry: { coordinates: [Number(LNG), Number(LAT)] } }] };
    const out = createSentryBeforeBreadcrumb()({
      category: "console",
      message: `parcels for /recherche?lat=${LAT}`,
      data: { arguments: [`/recherche?lat=${LAT}`, nested], logger: "console" },
    });
    expect(out.message).toBe(`parcels for /recherche?lat=${REDACTED_VALUE}`);
    const args = (out.data as { arguments: unknown[] }).arguments;
    expect(args[0]).toBe(`/recherche?lat=${REDACTED_VALUE}`);
    expect(args[1]).toBe(nested);
    // …and beforeSend still cleans the nested object once it is joined to an event.
    expectNoPosition(beforeSend({ breadcrumbs: [out] }));
  });
});

describe("position — map `center`, `ll` / `point`", () => {
  it("masks `center` as a URL parameter and as an object key", () => {
    expect(scrubUrl(`/carte?center=${LNG},${LAT}&zoom=17`)).toBe(`/carte?center=${REDACTED_VALUE}&zoom=17`);
    expect(beforeSend({ extra: { map: { center: [Number(LNG), Number(LAT)], zoom: 17 } } })?.extra?.map).toEqual({
      center: REDACTED,
      zoom: 17,
    });
  });

  it("masks `ll` / `point` on a map or geocoder URL, keeps them elsewhere", () => {
    expect(scrubUrl(`https://maps.googleapis.com/maps/api/staticmap?ll=${LAT},${LNG}&size=400x400`)).toBe(
      `https://maps.googleapis.com/maps/api/staticmap?ll=${REDACTED_VALUE}&size=400x400`,
    );
    expect(scrubUrl(`https://data.geopf.fr/geocodage/reverse?point=${LNG},${LAT}`)).toBe(
      `https://data.geopf.fr/geocodage/reverse?point=${REDACTED_VALUE}`,
    );
    expect(scrubUrl("/quiz?point=3&ll=fr")).toBe("/quiz?point=3&ll=fr");
  });
});

describe("createReplayBeforeAddRecordingEvent", () => {
  const hook = createReplayBeforeAddRecordingEvent();

  it("is assignable to the SDK's `beforeAddRecordingEvent` through a variable, without a cast", () => {
    // Type-level: `tsc --noEmit` (CI typecheck) fails here if the signature drifts (TS2322).
    type ReplayOptions = NonNullable<Parameters<typeof SentryTypes.replayIntegration>[0]>;
    const callback = createReplayBeforeAddRecordingEvent();
    const options: ReplayOptions = { beforeAddRecordingEvent: callback };
    expect(typeof options.beforeAddRecordingEvent).toBe("function");
  });

  it("leaves non-custom events as they are — the SDK only calls it on custom frames, so the page URL is out of reach", () => {
    // SDK 10.76 `maybeApplyCallback`: the callback runs only when `isCustomEvent(event)`
    // (type 5). The rrweb meta event (type 4, `href` = page URL) never reaches it.
    const meta = { type: 4, timestamp: 1, data: { href: `https://jepeuxconstruire.fr/recherche?lat=${LAT}`, width: 1, height: 1 } };
    expect(hook(meta)).toBe(meta);
  });

  it("scrubs the URL of a request span and a navigation, keeps their timing", () => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { lng: Number(LNG), lat: Number(LAT) } } }));
    const fetchSpan = hook({
      type: 5,
      timestamp: 2,
      data: {
        tag: "performanceSpan",
        payload: {
          op: "resource.fetch",
          description: `https://jepeuxconstruire.fr/api/trpc/carte.parcelles?batch=1&input=${input}`,
          startTimestamp: 1,
          endTimestamp: 2,
          data: { method: "GET", statusCode: 200 },
        },
      },
    });
    expectNoPosition(fetchSpan);
    expect((fetchSpan?.data as { payload: { op: string; endTimestamp: number } }).payload).toMatchObject({
      op: "resource.fetch",
      endTimestamp: 2,
    });
    const nav = hook({
      type: 5,
      data: {
        tag: "performanceSpan",
        payload: { op: "navigation.push", description: `/recherche?lng=${LNG}&lat=${LAT}&label=${encodeURIComponent(ADDRESS)}` },
      },
    });
    expectNoPosition(nav);
  });

  it("scrubs a breadcrumb frame and leaves DOM events alone", () => {
    const crumb = hook({ type: 5, data: { tag: "breadcrumb", payload: { category: "navigation", data: { to: `/recherche?lat=${LAT}` } } } });
    expectNoPosition(crumb);
    const dom = { type: 3, data: { source: 0, adds: [] } };
    expect(hook(dom)).toBe(dom);
  });

  it("drops an event it cannot scrub (fail-closed)", () => {
    const evil = {
      type: 4,
      get data(): unknown {
        throw new Error("boom");
      },
    };
    expect(hook(evil)).toBeNull();
  });
});

describe("position — free text of a procedure input (address search)", () => {
  const ADDRESS_TYPED = "12 rue de la Paix";

  it("masks `q` of `dossier.suggest` with no position next to it — non-batch GET", () => {
    const input = encodeURIComponent(JSON.stringify({ json: { q: ADDRESS_TYPED, limit: 5 } }));
    const url = `https://jepeuxconstruire.fr/api/trpc/dossier.suggest?input=${input}`;
    const event = beforeSend({
      transaction: "GET /api/trpc/[trpc]",
      request: { url, query_string: `input=${input}` },
      breadcrumbs: [{ category: "fetch", data: { method: "GET", url: `/api/trpc/dossier.suggest?input=${input}` } }],
    });
    const expected = encodeURIComponent(JSON.stringify({ json: { q: REDACTED_VALUE, limit: 5 } }));
    expect(event?.request?.url).toBe(`https://jepeuxconstruire.fr/api/trpc/dossier.suggest?input=${expected}`);
    expect(event?.request?.query_string).toBe(`input=${expected}`);
    expect((event?.breadcrumbs?.[0]?.data as Record<string, unknown>).url).toBe(`/api/trpc/dossier.suggest?input=${expected}`);
    expect(JSON.stringify(event)).not.toContain("Paix");
  });

  it("masks it in the exact batch shape `?batch=1&input={\"0\":{\"json\":{\"q\":…}}}`, raw and encoded", () => {
    const raw = `{"0":{"json":{"q":"${ADDRESS_TYPED}"}}}`;
    expect(scrubUrl(`/api/trpc/dossier.suggest?batch=1&input=${raw}`)).toBe(
      `/api/trpc/dossier.suggest?batch=1&input={"0":{"json":{"q":"${REDACTED_VALUE}"}}}`,
    );
    const out = scrubUrl(`/api/trpc/dossier.suggest?batch=1&input=${encodeURIComponent(raw)}`);
    expect(decodeURIComponent(out)).not.toContain("Paix");
  });

  it("masks it in a POST body to a tRPC route (`request.data`) and in `contexts.trpc.procedure_input`", () => {
    const event = beforeSend({
      request: {
        url: "https://jepeuxconstruire.fr/api/trpc/dossier.suggest?batch=1",
        data: JSON.stringify({ 0: { json: { q: ADDRESS_TYPED, street: "rue de la Paix", insee: "57463" } } }),
      },
      contexts: { trpc: { procedure_type: "query", procedure_input: { search: ADDRESS_TYPED, page: 2 } } },
    });
    expect(JSON.parse(event?.request?.data as string)).toEqual({ 0: { json: { q: REDACTED_VALUE, street: REDACTED_VALUE, insee: "57463" } } });
    expect((event?.contexts?.trpc as Record<string, unknown>).procedure_input).toEqual({ search: REDACTED_VALUE, page: 2 });
  });

  it("keeps identifiers and structured fields of an input", () => {
    const input = { json: { id: "ckx1", slug: "metz", insee: "57463", page: 2, limit: 10, status: "pending" } };
    const encoded = encodeURIComponent(JSON.stringify(input));
    expect(scrubUrl(`/api/trpc/dossier.list?input=${encoded}`)).toBe(`/api/trpc/dossier.list?input=${encoded}`);
  });
});

describe("position — keys whose value is a position by its shape", () => {
  it("masks `position`, `point`, `points` objects and arrays; keeps a scalar", () => {
    const event = beforeSend({
      extra: {
        marker: { position: { lat: Number(LAT), lng: Number(LNG) }, title: "x" },
        click: { point: { x: 512, y: 300 } },
        shape: { points: [[Number(LNG), Number(LAT)]] },
        quiz: { point: 3, position: 1 },
      },
    });
    expect(event?.extra).toEqual({
      marker: { position: REDACTED, title: "x" },
      click: { point: REDACTED },
      shape: { points: REDACTED },
      quiz: { point: 3, position: 1 },
    });
  });

  it("masks `path` / `polyline` arrays of coordinate pairs, keeps any other `path`", () => {
    const event = beforeSend({
      extra: {
        route: { path: [[Number(LNG), Number(LAT)], [6.18, 49.12]], polyline: [[1.5, 2.5]] },
        trpc: { path: "dossier.suggest" },
        files: { path: ["a", "b"] },
      },
    });
    expect(event?.extra).toEqual({
      route: { path: REDACTED, polyline: REDACTED },
      trpc: { path: "dossier.suggest" },
      files: { path: ["a", "b"] },
    });
  });
});
