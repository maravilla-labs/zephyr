import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('GET Request Caching', () => {
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

  test('should cache GET requests matching rule pattern', async ({ page }) => {
    await networkHelper.mockEndpoint('/test-image.jpg', {
      body: 'fake-image-data',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    // First request - should miss cache
    await page.evaluate(() => fetch('/test-api/test-image.jpg'));
    await cacheHelper.waitForCached('test-image.jpg');

    const isCached = await cacheHelper.isCached('test-image.jpg');
    expect(isCached).toBe(true);
  });

  test('should return cached response on subsequent requests', async ({ page }) => {
    await networkHelper.mockEndpoint('/cached-image.png', {
      body: 'fake-image-data',
      headers: { 'Content-Type': 'image/png' },
    });

    // First request
    await page.evaluate(() => fetch('/test-api/cached-image.png'));
    await cacheHelper.waitForCached('cached-image.png');

    const statsBefore = await zephyrApi.getStats();

    // Second request - should hit cache
    await page.evaluate(() => fetch('/test-api/cached-image.png'));
    await page.waitForTimeout(300);

    const statsAfter = await zephyrApi.getStats();
    expect(statsAfter.hits).toBeGreaterThan(statsBefore.hits);
  });

  test('should not cache requests that do not match any rule', async ({ page }) => {
    await networkHelper.mockEndpoint('/unmatched.xyz', {
      body: 'data',
    });

    await page.evaluate(() => fetch('/test-api/unmatched.xyz'));
    await page.waitForTimeout(1000);

    const isCached = await cacheHelper.isCached('unmatched.xyz');
    expect(isCached).toBe(false);
  });

  test('should not cache error responses', async ({ page }) => {
    await networkHelper.mockEndpoint('/error-image.jpg', {
      status: 500,
      body: 'Internal Server Error',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    await page.evaluate(() => fetch('/test-api/error-image.jpg').catch(() => {}));
    await page.waitForTimeout(1000);

    const isCached = await cacheHelper.isCached('error-image.jpg');
    expect(isCached).toBe(false);
  });

  test('should track cache misses', async ({ page }) => {
    await networkHelper.mockEndpoint('/miss-test.jpg', {
      body: 'image',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const statsBefore = await zephyrApi.getStats();
    await page.evaluate(() => fetch('/test-api/miss-test.jpg'));
    await page.waitForTimeout(500);

    const statsAfter = await zephyrApi.getStats();
    expect(statsAfter.misses).toBeGreaterThan(statsBefore.misses);
  });

  test('should track storage used', async ({ page }) => {
    const bodyContent = 'x'.repeat(10000);
    await networkHelper.mockEndpoint('/large-image.jpg', {
      body: bodyContent,
      headers: { 'Content-Type': 'image/jpeg' },
    });

    await page.evaluate(() => fetch('/test-api/large-image.jpg'));
    await cacheHelper.waitForCached('large-image.jpg');

    const stats = await zephyrApi.getStats();
    expect(stats.storageUsed).toBeGreaterThan(0);
  });
});
