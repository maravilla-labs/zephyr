/**
 * Zephyr - Client-side Installation & API
 *
 * @version 0.2.0
 * @license Apache-2.0
 * @copyright 2019-2025 SOLUTAS GmbH
 * @see https://github.com/maravilla-labs/zephyr
 */

(function() {
  'use strict';

  if (!('serviceWorker' in navigator)) {
    console.warn('[Zephyr] Service Workers are not supported in this browser');
    return;
  }

  if (!window.isSecureContext) {
    console.warn('[Zephyr] Service Workers require a secure context (HTTPS or localhost)');
    return;
  }

  function sendMessage(action, data = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker.controller) {
        reject(new Error('Service worker not active'));
        return;
      }

      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => resolve(event.data);

      navigator.serviceWorker.controller.postMessage(
        { action, ...data },
        [messageChannel.port2]
      );

      setTimeout(() => reject(new Error('Service worker response timeout')), 5000);
    });
  }

  const zephyr = {
    /**
     * Clear all cached entries
     * @returns {Promise<boolean>}
     */
    clear: function() {
      return sendMessage('clear');
    },

    /**
     * Clear/invalidate cached entries matching a URL pattern
     * @param {string} pattern - Regex pattern to match URLs
     * @returns {Promise<number>} Number of entries deleted
     */
    clearPattern: function(pattern) {
      return sendMessage('clearPattern', { pattern });
    },

    /**
     * Alias for clearPattern - invalidate by regex pattern
     * @param {string} pattern - Regex pattern to match URLs
     * @returns {Promise<number>}
     */
    invalidate: function(pattern) {
      return sendMessage('invalidate', { pattern });
    },

    /**
     * Invalidate a specific URL
     * @param {string} url - URL to invalidate
     * @returns {Promise<boolean>}
     */
    invalidateUrl: function(url) {
      return sendMessage('invalidateUrl', { url });
    },

    /**
     * Get cache statistics
     * @returns {Promise<Object>}
     */
    stats: function() {
      return sendMessage('stats');
    },

    /**
     * Get quota usage information
     * @returns {Promise<Object>}
     */
    quota: function() {
      return sendMessage('quota');
    },

    /**
     * Toggle debug mode
     * @returns {Promise<{debugMode: boolean}>}
     */
    debug: function() {
      return sendMessage('debug');
    },

    /**
     * Check if service worker is ready
     * @returns {Promise<boolean>}
     */
    ready: function() {
      return navigator.serviceWorker.ready.then(() => true);
    },

    /**
     * Listen for quota warning events from service worker
     * @param {function} callback - Called with {percentage, used, max}
     */
    onQuotaWarning: function(callback) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'zephyr-quota-warning') {
          callback({
            percentage: event.data.percentage,
            used: event.data.used,
            max: event.data.max
          });
        }
      });
    },

    /**
     * Manually prefetch a URL
     * @param {string} url - URL to prefetch
     * @returns {Promise<Object>} Prefetch result
     */
    prefetch: function(url) {
      return sendMessage('prefetch', { url });
    },

    /**
     * Listen for precache completion events
     * @param {function} callback - Called with {succeeded, failed, total}
     */
    onPrecacheComplete: function(callback) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'zephyr-precache-complete') {
          callback({
            succeeded: event.data.succeeded,
            failed: event.data.failed,
            total: event.data.total
          });
        }
      });
    }
  };

  // ============================================================================
  // Link Prediction (Prefetch on Hover/Touch)
  // ============================================================================

  /**
   * ZephyrLinkPredictor - Prefetch URLs on hover/touch
   */
  class ZephyrLinkPredictor {
    constructor(config, rules) {
      this.config = {
        enabled: false,
        scope: 'rules-only',
        delay: 150,
        triggers: ['mouseenter', 'touchstart'],
        selector: 'a[href]',
        maxConcurrent: 2,
        respectDataSaver: true,
        priority: 'low',
        exclude: [],
        ...config
      };

      this.rules = rules || [];
      this.patterns = config?.patterns || [];
      this.inFlight = new Set();
      this.prefetched = new Set();
      this.hoverTimers = new Map();
      this.observer = null;
      this.currentConcurrent = 0;
      this.pendingQueue = [];

      if (this.config.enabled) {
        this.init();
      }
    }

    init() {
      // Check user preferences
      if (this.shouldDisable()) {
        console.log('[Zephyr] Link prediction disabled due to user preferences');
        return;
      }

      // Observe existing links
      this.observeLinks(document.body);

      // Watch for new links (SPA support)
      this.observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.observeLinks(node);
            }
          });
        });
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      console.log('[Zephyr] Link prediction initialized');
    }

    shouldDisable() {
      // Check data-saver mode
      if (this.config.respectDataSaver && navigator.connection?.saveData) {
        return true;
      }

      // Check slow connection
      if (navigator.connection?.effectiveType) {
        const slowTypes = ['slow-2g', '2g'];
        if (slowTypes.includes(navigator.connection.effectiveType)) {
          return true;
        }
      }

      return false;
    }

    observeLinks(root) {
      const links = root.matches?.(this.config.selector)
        ? [root]
        : root.querySelectorAll?.(this.config.selector) || [];

      links.forEach(link => {
        if (link._zephyrObserved) return;
        link._zephyrObserved = true;

        this.config.triggers.forEach(trigger => {
          link.addEventListener(trigger, this.handleTrigger.bind(this), { passive: true });

          if (trigger === 'mouseenter') {
            link.addEventListener('mouseleave', this.handleCancel.bind(this), { passive: true });
          }
        });
      });
    }

    handleTrigger(event) {
      const link = event.currentTarget;
      const url = this.normalizeUrl(link.href);

      if (!url || !this.shouldPrefetch(url)) {
        return;
      }

      // Clear any existing timer for this element
      this.clearTimer(link);

      // Start debounce timer
      const timer = setTimeout(() => {
        this.prefetch(url);
      }, this.config.delay);

      this.hoverTimers.set(link, timer);
    }

    handleCancel(event) {
      this.clearTimer(event.currentTarget);
    }

    clearTimer(link) {
      const timer = this.hoverTimers.get(link);
      if (timer) {
        clearTimeout(timer);
        this.hoverTimers.delete(link);
      }
    }

    normalizeUrl(href) {
      try {
        const url = new URL(href, window.location.origin);
        // Remove hash
        url.hash = '';
        return url.href;
      } catch {
        return null;
      }
    }

    shouldPrefetch(url) {
      // Already prefetched or in flight
      if (this.prefetched.has(url) || this.inFlight.has(url)) {
        return false;
      }

      // Check exclusion patterns
      if (this.config.exclude.some(pattern => {
        try {
          return new RegExp(pattern).test(url);
        } catch {
          return false;
        }
      })) {
        return false;
      }

      const urlObj = new URL(url);

      // Same-origin check
      if (urlObj.origin !== window.location.origin) {
        return false;
      }

      // Scope check
      if (this.config.scope === 'rules-only') {
        return this.matchesRule(url) || this.matchesPattern(url);
      }

      return true; // same-origin scope
    }

    matchesRule(url) {
      return this.rules.some(rule => {
        try {
          const regex = new RegExp(rule.test);
          return regex.test(url) && (!rule.method || rule.method === 'GET');
        } catch {
          return false;
        }
      });
    }

    matchesPattern(url) {
      return this.patterns.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(url);
        } catch {
          return false;
        }
      });
    }

    async prefetch(url) {
      if (this.currentConcurrent >= this.config.maxConcurrent) {
        this.pendingQueue.push(url);
        return;
      }

      this.inFlight.add(url);
      this.currentConcurrent++;

      try {
        // Send prefetch request to service worker
        const result = await zephyr.prefetch(url);
        this.prefetched.add(url);
        return result;
      } catch (error) {
        console.log('[Zephyr] Prefetch failed:', url, error.message);
      } finally {
        this.inFlight.delete(url);
        this.currentConcurrent--;
        this.processQueue();
      }
    }

    processQueue() {
      while (this.pendingQueue.length > 0 && this.currentConcurrent < this.config.maxConcurrent) {
        const url = this.pendingQueue.shift();
        if (!this.prefetched.has(url)) {
          this.prefetch(url);
        }
      }
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
      this.hoverTimers.forEach(timer => clearTimeout(timer));
      this.hoverTimers.clear();
    }
  }

  // Store reference for external access
  window.ZephyrLinkPredictor = ZephyrLinkPredictor;

  window.zephyr = zephyr;

  /**
   * Initialize link prediction if configured
   * @param {Object} config - Zephyr configuration object
   */
  function initLinkPrediction(config) {
    if (!config?.eagerCache?.linkPrediction?.enabled) {
      return null;
    }

    // Wait for SW to be ready
    return navigator.serviceWorker.ready.then(() => {
      const predictor = new ZephyrLinkPredictor(
        {
          ...config.eagerCache.linkPrediction,
          patterns: config.eagerCache.precache?.patterns || []
        },
        config.rules
      );
      window.zephyrLinkPredictor = predictor;
      return predictor;
    });
  }

  window.addEventListener('load', function() {
    navigator.serviceWorker
      .register('./zephyrConfig.js', { scope: '/' })
      .then(function(registration) {
        console.log('[Zephyr] Service worker registered');

        // Initialize link prediction if config is available on window
        // Users should set window.zephyrConfig = { ... } before this script loads
        if (window.zephyrConfig) {
          initLinkPrediction(window.zephyrConfig);
        }

        registration.addEventListener('updatefound', function() {
          const newWorker = registration.installing;
          console.log('[Zephyr] New service worker installing...');

          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[Zephyr] New version available. Refresh to update.');
            }
          });
        });
      })
      .catch(function(error) {
        console.error('[Zephyr] Registration failed:', error.message);
        if (error.message.includes('SSL')) {
          console.error('[Zephyr] Hint: Service workers require HTTPS');
        }
      });
  });

  // Export initLinkPrediction for manual initialization
  window.zephyrInitLinkPrediction = initLinkPrediction;
})();
