/**
 * Zephyr - Lightweight Service Worker Caching Library
 *
 * @version 0.2.0
 * @license Apache-2.0
 * @copyright 2019-2025 SOLUTAS GmbH
 * @see https://github.com/maravilla-labs/zephyr
 */
const H = "zephyr-cache-db";
const p = "responses";
let A = !1, f = null, I = null, y = 0;
const g = {
  hits: 0,
  misses: 0,
  errors: 0,
  evictions: 0,
  revalidations: 0,
  prefetches: 0
};
function l(e, ...s) {
  A && console.log(`[Zephyr] ${e}`, ...s);
}
function F(e) {
  A && console.log(
    "%c[Zephyr] Cache HIT:%c %s",
    "background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px;",
    "color: #4CAF50;",
    e
  );
}
function Z(e) {
  A && console.log(
    "%c[Zephyr] Cache MISS:%c %s",
    "background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px;",
    "color: #FF9800;",
    e
  );
}
function G(e) {
  A && console.log(
    "%c[Zephyr] Revalidating:%c %s",
    "background: #2196F3; color: white; padding: 2px 6px; border-radius: 3px;",
    "color: #2196F3;",
    e
  );
}
async function Q(e) {
  try {
    const t = new TextEncoder().encode(e), a = await crypto.subtle.digest("SHA-256", t);
    return Array.from(new Uint8Array(a)).map((o) => o.toString(16).padStart(2, "0")).join("");
  } catch {
    let t = 0;
    for (let a = 0; a < e.length; a++) {
      const r = e.charCodeAt(a);
      t = (t << 5) - t + r, t = t & t;
    }
    return Math.abs(t).toString(16);
  }
}
async function j(e) {
  let s = e.url;
  if (e.method === "POST")
    try {
      const t = await e.clone().text(), a = await Q(t);
      s += `-${a}`;
    } catch (t) {
      l("Failed to hash POST payload:", t.message);
    }
  return s;
}
function X(e) {
  const s = e.split(".").pop().split(/[#?]/)[0].toLowerCase();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    css: "text/css",
    html: "text/html",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    xml: "application/xml",
    txt: "text/plain",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf"
  }[s] || "application/octet-stream";
}
function P(e, s = 1e4) {
  return new Promise((t, a) => {
    const r = new AbortController(), o = setTimeout(() => {
      r.abort(), a(new Error(`Request timeout after ${s}ms`));
    }, s);
    fetch(e, { signal: r.signal }).then((n) => {
      clearTimeout(o), t(n);
    }).catch((n) => {
      clearTimeout(o), a(n);
    });
  });
}
function W(e) {
  if (!e)
    return {};
  const s = {};
  return e.split(",").forEach((t) => {
    const [a, r] = t.trim().split("=");
    s[a.toLowerCase()] = r ? parseInt(r, 10) : !0;
  }), s;
}
function V(e) {
  if (!e)
    return null;
  const s = new Date(e);
  return isNaN(s.getTime()) ? null : s.getTime();
}
function b(e) {
  const s = W(e.headers.get("Cache-Control")), t = V(e.headers.get("Expires"));
  return {
    etag: e.headers.get("ETag"),
    lastModified: e.headers.get("Last-Modified"),
    maxAge: s["max-age"],
    mustRevalidate: s["must-revalidate"] || s["no-cache"] === !0,
    noStore: s["no-store"] === !0,
    expires: t,
    sMaxAge: s["s-maxage"]
  };
}
function k(e, s, t = !0) {
  if (!t)
    return s;
  if (e.sMaxAge !== void 0)
    return e.sMaxAge / 60;
  if (e.maxAge !== void 0)
    return e.maxAge / 60;
  if (e.expires) {
    const a = e.expires - Date.now();
    return Math.max(0, a / 6e4);
  }
  return s;
}
function M(e, s) {
  return e.ok ? s.noStore ? (l("Not caching: Cache-Control: no-store"), !1) : e.headers.get("Set-Cookie") ? (l("Not caching: response contains Set-Cookie header"), !1) : !0 : (l("Not caching: response not ok (status:", e.status, ")"), !1);
}
async function S() {
  return new Promise((e, s) => {
    const t = indexedDB.open(H, 3);
    t.onerror = () => {
      var a;
      s(new Error(`IndexedDB error: ${((a = t.error) == null ? void 0 : a.message) || "Unknown error"}`));
    }, t.onupgradeneeded = (a) => {
      const r = a.target.result;
      r.objectStoreNames.contains(p) && r.deleteObjectStore(p);
      const o = r.createObjectStore(p, { keyPath: "url" });
      o.createIndex("validUntil", "validUntil", { unique: !1 }), o.createIndex("pattern", "pattern", { unique: !1 }), o.createIndex("lastAccess", "lastAccess", { unique: !1 }), o.createIndex("cachedAt", "cachedAt", { unique: !1 });
    }, t.onsuccess = () => e(t.result);
  });
}
async function U(e, s, t, a, r = {}) {
  try {
    const o = await S(), n = await s.clone().arrayBuffer(), c = await j(e), i = n.byteLength;
    if (f != null && f.quota && !(await z(i)).canStore) {
      l("Quota exceeded, applying strategy:", f.quota.onQuotaExceeded);
      return;
    }
    const d = {};
    s.headers.forEach((E, u) => {
      u.toLowerCase() !== "set-cookie" && (d[u] = E);
    }), d["content-type"] || (d["content-type"] = X(e.url));
    const h = Date.now(), x = {
      url: c,
      body: n,
      headers: d,
      status: s.status,
      statusText: s.statusText,
      validUntil: h + t * 6e4,
      lastAccess: h,
      cachedAt: h,
      pattern: a,
      size: i,
      // HTTP cache metadata
      etag: r.etag,
      lastModified: r.lastModified,
      mustRevalidate: r.mustRevalidate,
      cacheVersion: r.cacheVersion
    };
    return new Promise((E, u) => {
      const w = o.transaction(p, "readwrite");
      w.objectStore(p).put(x), w.oncomplete = () => {
        y += i, l("Stored in cache:", c, `(${(i / 1024).toFixed(1)}KB)`), E();
      }, w.onerror = () => {
        var m;
        g.errors++, u(new Error(`Failed to store: ${(m = w.error) == null ? void 0 : m.message}`));
      };
    });
  } catch (o) {
    l("Store error:", o.message), g.errors++;
  }
}
async function L(e, s = {}) {
  try {
    const t = await S(), a = await j(e);
    return new Promise((r) => {
      const n = t.transaction(p, "readwrite").objectStore(p), c = n.get(a);
      c.onerror = () => {
        g.errors++, r({ response: null, record: null });
      }, c.onsuccess = () => {
        const i = c.result;
        if (!i || !i.body || !i.headers) {
          r({ response: null, record: null });
          return;
        }
        const d = Date.now(), h = d > i.validUntil, x = h, E = s.maxStaleAge || 1440, w = (d - i.validUntil) / 6e4 > E;
        i.lastAccess = d, n.put(i);
        const T = i.headers["content-type"] || "application/octet-stream", m = new Blob([i.body], { type: T }), v = new Response(m, {
          status: i.status || 200,
          statusText: i.statusText || "OK",
          headers: i.headers
        });
        r({
          response: v,
          record: i,
          isExpired: h,
          isStale: x,
          isTooStale: w,
          needsRevalidation: i.mustRevalidate || h
        });
      };
    });
  } catch (t) {
    return l("Cache retrieval error:", t.message), g.errors++, { response: null, record: null };
  }
}
async function K(e) {
  try {
    const s = await S();
    return new Promise((t) => {
      const a = s.transaction(p, "readwrite"), r = a.objectStore(p), o = r.get(e);
      o.onsuccess = () => {
        var n;
        (n = o.result) != null && n.size && (y -= o.result.size), r.delete(e);
      }, a.oncomplete = () => t(!0), a.onerror = () => t(!1);
    });
  } catch {
    return !1;
  }
}
async function D() {
  try {
    const e = await S();
    return new Promise((s) => {
      const t = e.transaction(p, "readwrite");
      t.objectStore(p).clear(), t.oncomplete = () => {
        y = 0, l("Cache cleared"), s(!0);
      }, t.onerror = () => s(!1);
    });
  } catch {
    return !1;
  }
}
async function C(e) {
  try {
    const s = await S(), t = new RegExp(e);
    let a = 0, r = 0;
    return new Promise((o) => {
      const n = s.transaction(p, "readwrite"), i = n.objectStore(p).openCursor();
      i.onsuccess = (d) => {
        const h = d.target.result;
        h && (t.test(h.value.url) && (r += h.value.size || 0, h.delete(), a++), h.continue());
      }, n.oncomplete = () => {
        y -= r, l(`Cleared ${a} entries matching: ${e}`), o(a);
      }, n.onerror = () => o(0);
    });
  } catch {
    return 0;
  }
}
async function q(e) {
  return K(e);
}
async function N() {
  try {
    const e = await S();
    return new Promise((s) => {
      const r = e.transaction(p, "readonly").objectStore(p).count();
      r.onsuccess = () => {
        const o = {
          ...g,
          entries: r.result,
          storageUsed: y,
          storageUsedMB: (y / 1048576).toFixed(2),
          hitRate: g.hits + g.misses > 0 ? (g.hits / (g.hits + g.misses) * 100).toFixed(1) + "%" : "N/A"
        };
        f != null && f.eagerCache && (o.prefetches = g.prefetches), s(o);
      }, r.onerror = () => {
        s({ ...g, entries: 0, hitRate: "N/A" });
      };
    });
  } catch (e) {
    return { ...g, entries: 0, hitRate: "N/A", error: e.message };
  }
}
async function _(e, s = 100) {
  try {
    const t = await S();
    return new Promise((a) => {
      const o = t.transaction(p, "readwrite").objectStore(p), c = o.index("pattern").getAll(e);
      c.onsuccess = () => {
        const i = c.result;
        if (i.length <= s) {
          a(0);
          return;
        }
        i.sort((h, x) => h.lastAccess - x.lastAccess);
        const d = i.slice(0, i.length - s);
        d.forEach((h) => {
          o.delete(h.url), y -= h.size || 0, g.evictions++;
        }), l(`Evicted ${d.length} entries for pattern: ${e}`), a(d.length);
      }, c.onerror = () => a(0);
    });
  } catch {
    return 0;
  }
}
async function z(e = 0) {
  if (!(f != null && f.quota))
    return { canStore: !0, usage: 0, percentage: 0 };
  const s = f.quota.maxSize || 52428800, t = f.quota.warningThreshold || 0.8, r = (y + e) / s;
  if (r >= t && r < 1 && (l(`Quota warning: ${(r * 100).toFixed(1)}% used`), J(r)), r >= 1)
    switch (f.quota.onQuotaExceeded || "evict-lru") {
      case "evict-lru":
        return await Y(e), { canStore: !0, usage: y, percentage: r };
      case "stop-caching":
        return { canStore: !1, usage: y, percentage: r };
      case "clear-all":
        return await D(), { canStore: !0, usage: 0, percentage: 0 };
      default:
        return { canStore: !1, usage: y, percentage: r };
    }
  return { canStore: !0, usage: y, percentage: r };
}
async function Y(e) {
  try {
    const s = await S();
    return new Promise((t) => {
      const a = s.transaction(p, "readwrite"), n = a.objectStore(p).index("lastAccess").openCursor();
      let c = 0;
      n.onsuccess = (i) => {
        const d = i.target.result;
        d && c < e && (c += d.value.size || 0, d.delete(), g.evictions++, d.continue());
      }, a.oncomplete = () => {
        y -= c, l(`Evicted entries to free ${(c / 1024).toFixed(1)}KB`), t(c);
      };
    });
  } catch {
    return 0;
  }
}
function J(e) {
  typeof clients < "u" && clients.matchAll().then((s) => {
    s.forEach((t) => {
      var a;
      t.postMessage({
        type: "zephyr-quota-warning",
        percentage: e,
        used: y,
        max: ((a = f == null ? void 0 : f.quota) == null ? void 0 : a.maxSize) || 52428800
      });
    });
  });
}
async function $() {
  var s;
  const e = ((s = f == null ? void 0 : f.quota) == null ? void 0 : s.maxSize) || 52428800;
  return {
    used: y,
    max: e,
    percentage: (y / e * 100).toFixed(1) + "%",
    available: e - y
  };
}
async function ee(e) {
  var o;
  if (!((o = e == null ? void 0 : e.invalidation) != null && o.type) === "manifest" || !e.invalidation.url)
    return;
  const s = e.invalidation.interval || 6e4, t = e.invalidation.url, a = e.invalidation.parser || ((n) => n.json());
  l("Starting manifest polling:", t, "interval:", s);
  const r = async () => {
    try {
      const n = await fetch(t, { cache: "no-store" });
      if (!n.ok) {
        l("Manifest fetch failed:", n.status);
        return;
      }
      const c = await a(n);
      c.version && c.version !== I && (l("Manifest version changed:", I, "->", c.version), I = c.version, c.patterns && await te(c.patterns));
    } catch (n) {
      l("Manifest poll error:", n.message);
    }
  };
  await r(), setInterval(r, s);
}
async function te(e) {
  try {
    const s = await S();
    return new Promise((t) => {
      const a = s.transaction(p, "readwrite"), o = a.objectStore(p).openCursor();
      let n = 0;
      o.onsuccess = (c) => {
        const i = c.target.result;
        if (i) {
          const d = i.value;
          for (const [h, x] of Object.entries(e))
            try {
              if (new RegExp(h).test(d.url)) {
                const u = new Date(x).getTime();
                d.cachedAt < u && (i.delete(), y -= d.size || 0, n++, l("Invalidated by manifest:", d.url));
              }
            } catch {
            }
          i.continue();
        }
      }, a.oncomplete = () => {
        n > 0 && l(`Manifest invalidation: ${n} entries removed`), t(n);
      };
    });
  } catch (s) {
    return l("Manifest invalidation error:", s.message), 0;
  }
}
async function re(e, s, t) {
  const a = new Headers(e.headers);
  s.etag && a.set("If-None-Match", s.etag), s.lastModified && a.set("If-Modified-Since", s.lastModified);
  const r = new Request(e.url, {
    method: e.method,
    headers: a,
    mode: e.mode,
    credentials: e.credentials,
    cache: "no-store"
  });
  try {
    G(e.url), g.revalidations++;
    const o = await P(r, t);
    return o.status === 304 ? (l("304 Not Modified, using cached response"), { notModified: !0, response: null }) : { notModified: !1, response: o };
  } catch (o) {
    return l("Revalidation failed:", o.message), { notModified: !1, response: null, error: o };
  }
}
function se(e) {
  return e.fallback ? {
    strategy: e.fallback.strategy || "stale-if-error",
    maxStaleAge: e.fallback.maxStaleAge || 1440
  } : { strategy: "stale-if-error", maxStaleAge: 1440 };
}
async function ae() {
  if (A)
    try {
      const a = (await S()).transaction(p, "readonly").objectStore(p).getAll();
      a.onsuccess = () => {
        const r = a.result;
        if (r.length === 0) {
          console.log("[Zephyr] Cache is empty");
          return;
        }
        const o = r.map((n) => ({
          url: n.url.substring(0, 50) + (n.url.length > 50 ? "..." : ""),
          size: n.size ? `${(n.size / 1024).toFixed(1)}KB` : "N/A",
          validUntil: new Date(n.validUntil).toISOString(),
          etag: n.etag ? "Yes" : "No",
          mustRevalidate: n.mustRevalidate ? "Yes" : "No"
        }));
        console.log("[Zephyr] Cache contents:"), console.table(o);
      };
    } catch (e) {
      console.log("[Zephyr] Error reading cache:", e.message);
    }
}
function O(e, s = "GET") {
  return f != null && f.rules ? f.rules.find((t) => {
    try {
      return new RegExp(t.test).test(e) && (!t.method || t.method === s);
    } catch {
      return !1;
    }
  }) : null;
}
async function ne(e) {
  const { urls: s = [], retries: t = 2, failSilently: a = !0 } = e;
  if (s.length === 0) {
    l("No URLs to precache");
    return;
  }
  const r = [...new Set(s)];
  l(`Precaching ${r.length} URLs`);
  const o = await Promise.allSettled(
    r.map((i) => B(i, t))
  ), n = o.filter((i) => i.status === "fulfilled").length, c = o.filter((i) => i.status === "rejected").length;
  if (l(`Precache complete: ${n} succeeded, ${c} failed`), ce(n, c, r.length), c > 0 && !a)
    throw new Error(`Precache failed: ${c} of ${r.length} URLs failed`);
}
async function B(e, s) {
  try {
    const t = new URL(e, self.location.origin).href, a = O(t, "GET"), r = a ? parseInt(a.cache, 10) : 60, o = await L({ url: t, method: "GET" });
    if (o.response && !o.isExpired)
      return l("Precache skip (already cached):", t), { status: "already-cached", url: t };
    const n = await fetch(t, {
      method: "GET",
      credentials: "same-origin"
    });
    if (!n.ok)
      throw new Error(`HTTP ${n.status}`);
    const c = b(n);
    if (M(n, c)) {
      const i = (a == null ? void 0 : a.test) || "precache";
      return await U(
        { url: t, method: "GET" },
        n,
        r,
        i,
        c
      ), g.prefetches++, l("Precached:", t), { status: "precached", url: t };
    }
    return { status: "not-cacheable", url: t };
  } catch (t) {
    if (s > 0)
      return l(`Precache retry (${s} left):`, e), await new Promise((a) => setTimeout(a, 1e3)), B(e, s - 1);
    throw t;
  }
}
async function oe(e) {
  var s;
  try {
    const t = new URL(e, self.location.origin).href, a = await L({ url: t, method: "GET" });
    if (a.response && !a.isExpired)
      return { status: "already-cached", url: t };
    const r = O(t, "GET");
    if (!(await z(0)).canStore)
      return { status: "quota-exceeded", url: t };
    const n = await fetch(t, {
      method: "GET",
      credentials: "same-origin"
    });
    if (!n.ok)
      return { status: "fetch-failed", url: t, httpStatus: n.status };
    const c = b(n);
    if (!M(n, c))
      return { status: "not-cacheable", url: t };
    const i = r ? parseInt(r.cache, 10) : 60, d = ((s = f == null ? void 0 : f.invalidation) == null ? void 0 : s.respectHttpHeaders) !== !1, h = k(c, i, d), x = (r == null ? void 0 : r.test) || "prefetch";
    return await U(
      { url: t, method: "GET" },
      n,
      h,
      x,
      c
    ), r != null && r.maxEntries && await _(r.test, r.maxEntries), g.prefetches++, l("Prefetched:", t), { status: "prefetched", url: t };
  } catch (t) {
    return l("Prefetch error:", t.message), { status: "error", url: e, error: t.message };
  }
}
function ce(e, s, t) {
  typeof clients < "u" && clients.matchAll().then((a) => {
    a.forEach((r) => {
      r.postMessage({
        type: "zephyr-precache-complete",
        succeeded: e,
        failed: s,
        total: t
      });
    });
  });
}
function ie(e) {
  if (!e || !Array.isArray(e.rules)) {
    console.error("[Zephyr] Invalid configuration: missing rules array");
    return;
  }
  f = e;
  const t = (e.invalidation || {}).respectHttpHeaders !== !1;
  e.rules.forEach((a, r) => {
    a.test || console.error(`[Zephyr] Rule ${r}: missing 'test' pattern`);
    try {
      new RegExp(a.test);
    } catch {
      console.error(`[Zephyr] Rule ${r}: invalid regex pattern`);
    }
  }), self.addEventListener("install", (a) => {
    var r, o, n;
    l("Installing..."), ((n = (o = (r = e.eagerCache) == null ? void 0 : r.precache) == null ? void 0 : o.urls) == null ? void 0 : n.length) > 0 ? a.waitUntil(
      ne(e.eagerCache.precache).then(() => self.skipWaiting()).catch((c) => (l("Precache error:", c.message), self.skipWaiting()))
    ) : self.skipWaiting();
  }), self.addEventListener("activate", (a) => {
    var r;
    l("Activated"), a.waitUntil(
      Promise.all([
        clients.claim(),
        // Start manifest polling if configured
        ((r = e.invalidation) == null ? void 0 : r.type) === "manifest" ? ee(e) : Promise.resolve()
      ])
    );
  }), self.addEventListener("message", async (a) => {
    const { action: r, pattern: o, url: n } = a.data || {};
    let c;
    switch (r) {
      case "clear":
        c = await D();
        break;
      case "clearPattern":
      case "invalidate":
        c = await C(o);
        break;
      case "invalidateUrl":
        c = await q(n);
        break;
      case "stats":
        c = await N();
        break;
      case "quota":
        c = await $();
        break;
      case "debug":
        A = !A, c = { debugMode: A };
        break;
      case "prefetch":
        c = await oe(n);
        break;
      default:
        c = { error: "Unknown action" };
    }
    a.ports && a.ports[0] && a.ports[0].postMessage(c);
  }), self.addEventListener("fetch", (a) => {
    var E;
    const r = a.request;
    new URL(r.url).searchParams.get("zephyrDebug") === "true" && (A = !0, ae());
    const n = e.rules.find((u) => {
      try {
        return new RegExp(u.test).test(r.url) && (!u.method || u.method === r.method);
      } catch {
        return !1;
      }
    });
    if (!n)
      return;
    const c = parseInt(n.cache, 10) || 60, i = n.maxEntries || 100, d = n.timeout || 1e4, h = se(n), x = (E = e.invalidation) == null ? void 0 : E.header;
    a.respondWith(
      (async () => {
        try {
          const u = await L(r, { maxStaleAge: h.maxStaleAge });
          if (h.strategy === "stale-while-revalidate" && u.response)
            return g.hits++, F(r.url), (u.needsRevalidation || u.isExpired) && (async () => {
              try {
                const m = await P(r.clone(), d), v = b(m);
                if (M(m, v)) {
                  const R = k(v, c, t);
                  await U(r, m, R, n.test, v), await _(n.test, i);
                }
              } catch (m) {
                l("Background revalidation failed:", m.message);
              }
            })(), u.response;
          if (u.response && u.needsRevalidation && (u.record.etag || u.record.lastModified)) {
            const m = await re(r, u.record, d);
            if (m.notModified)
              return g.hits++, F(r.url), u.record.validUntil = Date.now() + c * 6e4, (await S()).transaction(p, "readwrite").objectStore(p).put(u.record), u.response;
            if (m.response) {
              g.misses++;
              const v = b(m.response);
              if (M(m.response, v)) {
                const R = k(v, c, t);
                U(r, m.response.clone(), R, n.test, v).then(() => _(n.test, i));
              }
              return m.response;
            }
          }
          if (u.response && !u.isExpired)
            return x && u.record.cacheVersion, g.hits++, F(r.url), u.response;
          g.misses++, Z(r.url);
          const w = await P(r.clone(), d), T = b(w);
          if (x && (T.cacheVersion = w.headers.get(x)), M(w, T)) {
            const m = k(T, c, t);
            U(r, w.clone(), m, n.test, T).then(() => _(n.test, i)).catch(() => {
            });
          }
          return w;
        } catch (u) {
          if (l("Fetch error:", u.message), g.errors++, h.strategy === "network-only")
            throw u;
          const w = await L(r, { maxStaleAge: h.maxStaleAge });
          return w.response && !w.isTooStale ? (l("Returning stale cache due to network error"), w.response) : new Response(JSON.stringify({
            error: "Network request failed",
            message: u.message
          }), {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "application/json" }
          });
        }
      })()
    );
  }), l("Initialized with", e.rules.length, "rules"), e.invalidation && l("Invalidation config:", e.invalidation.type || "http-headers"), e.quota && l("Quota config:", (e.quota.maxSize / 1024 / 1024).toFixed(0), "MB max");
}
typeof self < "u" && (self.initZephyr = ie, self.zephyr = {
  clear: D,
  clearPattern: C,
  invalidate: C,
  invalidateUrl: q,
  stats: N,
  quota: $,
  debug: () => (A = !A, A)
});
//# sourceMappingURL=zephyrWorker.js.map
