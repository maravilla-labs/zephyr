import { Page, BrowserContext } from '@playwright/test';

/**
 * Helper class for service worker lifecycle management in tests
 */
export class ServiceWorkerHelper {
  constructor(private page: Page, private context?: BrowserContext) {}

  /**
   * Wait for service worker to be registered and activated
   */
  async waitForServiceWorker(timeout = 30000): Promise<void> {
    await this.page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      { timeout }
    );
  }

  /**
   * Wait for service worker to be ready
   */
  async waitForReady(timeout = 30000): Promise<void> {
    await this.page.waitForFunction(
      () => navigator.serviceWorker.ready !== undefined,
      { timeout }
    );
    await this.page.evaluate(() => navigator.serviceWorker.ready);
  }

  /**
   * Force service worker update
   */
  async triggerUpdate(): Promise<void> {
    await this.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
      }
    });
  }

  /**
   * Unregister service worker and clear caches
   */
  async cleanup(): Promise<void> {
    // Navigate to base URL first if at about:blank
    const currentUrl = this.page.url();
    if (currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
      await this.page.goto('/');
    }

    await this.page.evaluate(async () => {
      // Check if service worker is supported
      if (!('serviceWorker' in navigator)) {
        return;
      }
      // Unregister all service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      // Clear IndexedDB
      if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      }
    });

    // Navigate to about:blank to allow fresh page load in tests
    await this.page.goto('about:blank');
  }

  /**
   * Get service worker registration info
   */
  async getRegistrationInfo(): Promise<{
    scope: string;
    state: string;
    scriptURL: string;
  } | null> {
    return this.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) return null;
      return {
        scope: registration.scope,
        state: registration.active.state,
        scriptURL: registration.active.scriptURL,
      };
    });
  }

  /**
   * Check if service worker is controlling the page
   */
  async isControlling(): Promise<boolean> {
    return this.page.evaluate(() => navigator.serviceWorker.controller !== null);
  }

  /**
   * Get the current service worker state
   */
  async getState(): Promise<string | null> {
    return this.page.evaluate(() => {
      const controller = navigator.serviceWorker.controller;
      return controller?.state ?? null;
    });
  }
}
