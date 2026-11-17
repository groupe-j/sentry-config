import { describe, expect, it } from "vitest";
import {
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

  it("masks `input` in `request.url` and in the separate `query_string`", () => {
    const event = beforeSend({
      transaction: "GET /api/trpc/[trpc]",
      request: { url: `https://jepeuxconstruire.fr/api/trpc/carte.parcelles?${query}`, query_string: query },
    });
    expect(event?.request?.url).toBe(`https://jepeuxconstruire.fr/api/trpc/carte.parcelles?batch=1&input=${REDACTED_VALUE}`);
    expect(event?.request?.query_string).toBe(`batch=1&input=${REDACTED_VALUE}`);
    expectNoPosition(event);
  });

  it("masks a parsed `query_string` object, and a JSON `input` even without the route", () => {
    expect(scrubQueryString({ batch: "1", input })).toEqual({ batch: "1", input: REDACTED_VALUE });
    expect(scrubQueryString([["batch", "1"], ["input", input]])).toEqual([["batch", "1"], ["input", REDACTED_VALUE]]);
  });

  it("masks any `input` on a tRPC route, JSON or not", () => {
    expect(scrubUrl("/api/trpc/x.y?input=abc")).toBe(`/api/trpc/x.y?input=${REDACTED_VALUE}`);
    expect(scrubQueryString("input=abc", { trpc: true })).toBe(`input=${REDACTED_VALUE}`);
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
      `/api/trpc/dossier.dossier,carte.parcelles?batch=1&input=${REDACTED_VALUE}`,
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
