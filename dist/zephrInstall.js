/**
 * Zephyr - Client-side Installation & API
 *
 * @version 0.2.0
 * @license Apache-2.0
 * @copyright 2019-2025 SOLUTAS GmbH
 * @see https://github.com/maravilla-labs/zephyr
 */
(function() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[Zephyr] Service Workers are not supported in this browser");
    return;
  }
  if (!window.isSecureContext) {
    console.warn("[Zephyr] Service Workers require a secure context (HTTPS or localhost)");
    return;
  }
  function s(t, e = {}) {
    return new Promise((r, n) => {
      if (!navigator.serviceWorker.controller) {
        n(new Error("Service worker not active"));
        return;
      }
      const i = new MessageChannel();
      i.port1.onmessage = (o) => r(o.data), navigator.serviceWorker.controller.postMessage(
        { action: t, ...e },
        [i.port2]
      ), setTimeout(() => n(new Error("Service worker response timeout")), 5e3);
    });
  }
  const a = {
    /**
     * Clear all cached entries
     * @returns {Promise<boolean>}
     */
    clear: function() {
      return s("clear");
    },
    /**
     * Clear/invalidate cached entries matching a URL pattern
     * @param {string} pattern - Regex pattern to match URLs
     * @returns {Promise<number>} Number of entries deleted
     */
    clearPattern: function(t) {
      return s("clearPattern", { pattern: t });
    },
    /**
     * Alias for clearPattern - invalidate by regex pattern
     * @param {string} pattern - Regex pattern to match URLs
     * @returns {Promise<number>}
     */
    invalidate: function(t) {
      return s("invalidate", { pattern: t });
    },
    /**
     * Invalidate a specific URL
     * @param {string} url - URL to invalidate
     * @returns {Promise<boolean>}
     */
    invalidateUrl: function(t) {
      return s("invalidateUrl", { url: t });
    },
    /**
     * Get cache statistics
     * @returns {Promise<Object>}
     */
    stats: function() {
      return s("stats");
    },
    /**
     * Get quota usage information
     * @returns {Promise<Object>}
     */
    quota: function() {
      return s("quota");
    },
    /**
     * Toggle debug mode
     * @returns {Promise<{debugMode: boolean}>}
     */
    debug: function() {
      return s("debug");
    },
    /**
     * Check if service worker is ready
     * @returns {Promise<boolean>}
     */
    ready: function() {
      return navigator.serviceWorker.ready.then(() => !0);
    },
    /**
     * Listen for quota warning events from service worker
     * @param {function} callback - Called with {percentage, used, max}
     */
    onQuotaWarning: function(t) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        var r;
        ((r = e.data) == null ? void 0 : r.type) === "zephyr-quota-warning" && t({
          percentage: e.data.percentage,
          used: e.data.used,
          max: e.data.max
        });
      });
    },
    /**
     * Manually prefetch a URL
     * @param {string} url - URL to prefetch
     * @returns {Promise<Object>} Prefetch result
     */
    prefetch: function(t) {
      return s("prefetch", { url: t });
    },
    /**
     * Listen for precache completion events
     * @param {function} callback - Called with {succeeded, failed, total}
     */
    onPrecacheComplete: function(t) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        var r;
        ((r = e.data) == null ? void 0 : r.type) === "zephyr-precache-complete" && t({
          succeeded: e.data.succeeded,
          failed: e.data.failed,
          total: e.data.total
        });
      });
    }
  };
  class c {
    constructor(e, r) {
      this.config = {
        enabled: !1,
        scope: "rules-only",
        delay: 150,
        triggers: ["mouseenter", "touchstart"],
        selector: "a[href]",
        maxConcurrent: 2,
        respectDataSaver: !0,
        priority: "low",
        exclude: [],
        ...e
      }, this.rules = r || [], this.patterns = (e == null ? void 0 : e.patterns) || [], this.inFlight = /* @__PURE__ */ new Set(), this.prefetched = /* @__PURE__ */ new Set(), this.hoverTimers = /* @__PURE__ */ new Map(), this.observer = null, this.currentConcurrent = 0, this.pendingQueue = [], this.config.enabled && this.init();
    }
    init() {
      if (this.shouldDisable()) {
        console.log("[Zephyr] Link prediction disabled due to user preferences");
        return;
      }
      this.observeLinks(document.body), this.observer = new MutationObserver((e) => {
        e.forEach((r) => {
          r.addedNodes.forEach((n) => {
            n.nodeType === Node.ELEMENT_NODE && this.observeLinks(n);
          });
        });
      }), this.observer.observe(document.body, {
        childList: !0,
        subtree: !0
      }), console.log("[Zephyr] Link prediction initialized");
    }
    shouldDisable() {
      var e, r;
      return !!(this.config.respectDataSaver && ((e = navigator.connection) != null && e.saveData) || (r = navigator.connection) != null && r.effectiveType && ["slow-2g", "2g"].includes(navigator.connection.effectiveType));
    }
    observeLinks(e) {
      var n, i;
      ((n = e.matches) != null && n.call(e, this.config.selector) ? [e] : ((i = e.querySelectorAll) == null ? void 0 : i.call(e, this.config.selector)) || []).forEach((o) => {
        o._zephyrObserved || (o._zephyrObserved = !0, this.config.triggers.forEach((u) => {
          o.addEventListener(u, this.handleTrigger.bind(this), { passive: !0 }), u === "mouseenter" && o.addEventListener("mouseleave", this.handleCancel.bind(this), { passive: !0 });
        }));
      });
    }
    handleTrigger(e) {
      const r = e.currentTarget, n = this.normalizeUrl(r.href);
      if (!n || !this.shouldPrefetch(n))
        return;
      this.clearTimer(r);
      const i = setTimeout(() => {
        this.prefetch(n);
      }, this.config.delay);
      this.hoverTimers.set(r, i);
    }
    handleCancel(e) {
      this.clearTimer(e.currentTarget);
    }
    clearTimer(e) {
      const r = this.hoverTimers.get(e);
      r && (clearTimeout(r), this.hoverTimers.delete(e));
    }
    normalizeUrl(e) {
      try {
        const r = new URL(e, window.location.origin);
        return r.hash = "", r.href;
      } catch {
        return null;
      }
    }
    shouldPrefetch(e) {
      return this.prefetched.has(e) || this.inFlight.has(e) || this.config.exclude.some((n) => {
        try {
          return new RegExp(n).test(e);
        } catch {
          return !1;
        }
      }) || new URL(e).origin !== window.location.origin ? !1 : this.config.scope === "rules-only" ? this.matchesRule(e) || this.matchesPattern(e) : !0;
    }
    matchesRule(e) {
      return this.rules.some((r) => {
        try {
          return new RegExp(r.test).test(e) && (!r.method || r.method === "GET");
        } catch {
          return !1;
        }
      });
    }
    matchesPattern(e) {
      return this.patterns.some((r) => {
        try {
          return new RegExp(r).test(e);
        } catch {
          return !1;
        }
      });
    }
    async prefetch(e) {
      if (this.currentConcurrent >= this.config.maxConcurrent) {
        this.pendingQueue.push(e);
        return;
      }
      this.inFlight.add(e), this.currentConcurrent++;
      try {
        const r = await a.prefetch(e);
        return this.prefetched.add(e), r;
      } catch (r) {
        console.log("[Zephyr] Prefetch failed:", e, r.message);
      } finally {
        this.inFlight.delete(e), this.currentConcurrent--, this.processQueue();
      }
    }
    processQueue() {
      for (; this.pendingQueue.length > 0 && this.currentConcurrent < this.config.maxConcurrent; ) {
        const e = this.pendingQueue.shift();
        this.prefetched.has(e) || this.prefetch(e);
      }
    }
    destroy() {
      this.observer && this.observer.disconnect(), this.hoverTimers.forEach((e) => clearTimeout(e)), this.hoverTimers.clear();
    }
  }
  window.ZephyrLinkPredictor = c, window.zephyr = a;
  function h(t) {
    var e, r;
    return (r = (e = t == null ? void 0 : t.eagerCache) == null ? void 0 : e.linkPrediction) != null && r.enabled ? navigator.serviceWorker.ready.then(() => {
      var i;
      const n = new c(
        {
          ...t.eagerCache.linkPrediction,
          patterns: ((i = t.eagerCache.precache) == null ? void 0 : i.patterns) || []
        },
        t.rules
      );
      return window.zephyrLinkPredictor = n, n;
    }) : null;
  }
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./zephyrConfig.js", { scope: "/" }).then(function(t) {
      console.log("[Zephyr] Service worker registered"), window.zephyrConfig && h(window.zephyrConfig), t.addEventListener("updatefound", function() {
        const e = t.installing;
        console.log("[Zephyr] New service worker installing..."), e.addEventListener("statechange", function() {
          e.state === "installed" && navigator.serviceWorker.controller && console.log("[Zephyr] New version available. Refresh to update.");
        });
      });
    }).catch(function(t) {
      console.error("[Zephyr] Registration failed:", t.message), t.message.includes("SSL") && console.error("[Zephyr] Hint: Service workers require HTTPS");
    });
  }), window.zephyrInitLinkPrediction = h;
})();
//# sourceMappingURL=zephrInstall.js.map
