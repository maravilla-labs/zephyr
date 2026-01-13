import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('Link Prediction (Prefetch on Hover)', () => {
  let swHelper: ServiceWorkerHelper;
  let cacheHelper: CacheHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    cacheHelper = new CacheHelper(page);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    // Don't use cleanup() as it unregisters the SW
    // Just clear the cache entries instead
    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
  });

  test('should prefetch link target on mouseenter', async ({ page }) => {
    await networkHelper.mockEndpoint('**/products/123', {
      body: '<html>Product Page</html>',
      headers: { 'Content-Type': 'text/html' },
    });

    // Use root page and inject a test link
    await page.goto('/');
    await zephyrApi.waitForReady();

    // Wait for link predictor to initialize
    await page.waitForTimeout(500);

    // Inject a test link that matches the rules
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/products/123';
      link.textContent = 'Product 123';
      link.id = 'test-link';
      document.body.appendChild(link);
    });

    // Hover over link
    const link = page.locator('#test-link');
    await link.hover();

    // Wait for debounce + prefetch
    await page.waitForTimeout(500);

    const isCached = await cacheHelper.isCached('products/123');
    expect(isCached).toBe(true);
  });

  test('should not prefetch already-cached URLs', async ({ page }) => {
    // Use the mocked products endpoint from beforeEach context
    await networkHelper.mockEndpoint('**/products/already-cached', {
      body: '<html>Product</html>',
      headers: { 'Content-Type': 'text/html' },
    });

    // Inject a test link
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/products/already-cached';
      link.textContent = 'Product Already Cached';
      link.id = 'test-link-cached';
      document.body.appendChild(link);
    });

    const link = page.locator('#test-link-cached');

    // First hover - should prefetch
    await link.hover();
    await page.waitForTimeout(500);

    const isCachedAfterFirst = await cacheHelper.isCached('products/already-cached');
    expect(isCachedAfterFirst).toBe(true);

    // Move away and hover again
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await link.hover();
    await page.waitForTimeout(500);

    // Should still be cached (no duplicate entries)
    const entries = await cacheHelper.getAllCachedEntries();
    const matchingEntries = entries.filter(e => e.url.includes('products/already-cached'));
    expect(matchingEntries.length).toBe(1);
  });

  test('should not prefetch cross-origin links', async ({ page }) => {
    await page.goto('/');
    await zephyrApi.waitForReady();
    await page.waitForTimeout(500);

    // Inject an external link
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = 'https://external.com/page';
      link.textContent = 'External Link';
      link.id = 'external-link';
      document.body.appendChild(link);
    });

    const externalLink = page.locator('#external-link');
    await externalLink.hover();
    await page.waitForTimeout(500);

    const entries = await cacheHelper.getAllCachedEntries();
    const hasExternal = entries.some((e) => e.url.includes('external.com'));
    expect(hasExternal).toBe(false);
  });

  test('should not prefetch excluded patterns', async ({ page }) => {
    await networkHelper.mockEndpoint('**/logout', {
      body: 'Logout page',
    });

    await page.goto('/');
    await zephyrApi.waitForReady();
    await page.waitForTimeout(500);

    // Inject a logout link (excluded pattern)
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/logout';
      link.textContent = 'Logout';
      link.id = 'logout-link';
      document.body.appendChild(link);
    });

    const logoutLink = page.locator('#logout-link');
    await logoutLink.hover();
    await page.waitForTimeout(500);

    const isCached = await cacheHelper.isCached('logout');
    expect(isCached).toBe(false);
  });

  test('should respect debounce delay - no prefetch on quick hover', async ({ page }) => {
    let fetchCount = 0;
    await page.route('**/products/quick', async (route) => {
      fetchCount++;
      await route.fulfill({ body: 'page' });
    });

    await page.goto('/');
    await zephyrApi.waitForReady();
    await page.waitForTimeout(500);

    // Inject a test link that matches rules
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/products/quick';
      link.textContent = 'Quick Test';
      link.id = 'quick-link';
      document.body.appendChild(link);
    });

    const link = page.locator('#quick-link');

    // Quick hover (less than debounce delay of 150ms)
    await link.hover();
    await page.waitForTimeout(50);
    await page.mouse.move(0, 0);

    await page.waitForTimeout(500);
    expect(fetchCount).toBe(0);
  });

  test('should prefetch after hover duration exceeds delay', async ({ page }) => {
    // Mock the endpoint
    await networkHelper.mockEndpoint('**/products/long-hover', {
      body: '<html>Long Hover Product</html>',
      headers: { 'Content-Type': 'text/html' },
    });

    // Inject a test link that matches rules
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/products/long-hover';
      link.textContent = 'Long Hover Test';
      link.id = 'long-hover-link';
      document.body.appendChild(link);
    });

    const link = page.locator('#long-hover-link');

    // Long hover (more than debounce delay of 150ms)
    await link.hover();
    await page.waitForTimeout(400);

    // Check that the URL was cached
    const isCached = await cacheHelper.isCached('products/long-hover');
    expect(isCached).toBe(true);
  });
});
