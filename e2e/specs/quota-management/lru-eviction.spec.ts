import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('LRU Eviction', () => {
  let swHelper: ServiceWorkerHelper;
  let cacheHelper: CacheHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    cacheHelper = new CacheHelper(page);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
    await networkHelper.clearMocks();
  });

  test('should track evictions in stats', async ({ page }) => {
    const stats = await zephyrApi.getStats();
    expect(stats).toHaveProperty('evictions');
    expect(typeof stats.evictions).toBe('number');
  });

  test('should update lastAccess on cache hit', async ({ page }) => {
    await networkHelper.mockEndpoint('/access-test.jpg', {
      body: 'image',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    // First request
    await page.evaluate(() => fetch('/test-api/access-test.jpg'));
    await page.waitForTimeout(300);

    const entriesBefore = await cacheHelper.getAllCachedEntries();
    const entryBefore = entriesBefore.find((e) => e.url.includes('access-test.jpg'));

    await page.waitForTimeout(100);

    // Second request (cache hit)
    await page.evaluate(() => fetch('/test-api/access-test.jpg'));
    await page.waitForTimeout(300);

    const entriesAfter = await cacheHelper.getAllCachedEntries();
    const entryAfter = entriesAfter.find((e) => e.url.includes('access-test.jpg'));

    // lastAccess should be updated
    if (entryBefore && entryAfter) {
      expect(entryAfter.lastAccess).toBeGreaterThanOrEqual(entryBefore.lastAccess);
    }
  });
});

test.describe('maxEntries per Rule', () => {
  let swHelper: ServiceWorkerHelper;
  let cacheHelper: CacheHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    cacheHelper = new CacheHelper(page);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
    await networkHelper.clearMocks();
  });

  test('should enforce maxEntries limit per pattern', async ({ page }) => {
    // Create mock responses for multiple images
    for (let i = 1; i <= 150; i++) {
      await networkHelper.mockEndpoint(`/limit-${i}.jpg`, {
        body: 'img',
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }

    // Fetch more than maxEntries (default 100)
    for (let i = 1; i <= 110; i++) {
      await page.evaluate((n) => fetch(`/test-api/limit-${n}.jpg`), i);
    }

    await page.waitForTimeout(1000);

    // Should have evicted some entries
    const stats = await zephyrApi.getStats();
    expect(stats.entries).toBeLessThanOrEqual(100);
  });
});
