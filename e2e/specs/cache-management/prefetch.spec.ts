import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('zephyr.prefetch()', () => {
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

  test('should prefetch and cache a URL', async ({ page }) => {
    await networkHelper.mockEndpoint('/prefetch-test.jpg', {
      body: 'image-data',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const result = await zephyrApi.prefetch('/test-api/prefetch-test.jpg');
    expect(result.status).toBe('prefetched');

    const isCached = await cacheHelper.isCached('prefetch-test.jpg');
    expect(isCached).toBe(true);
  });

  test('should return already-cached status for cached URLs', async ({ page }) => {
    await networkHelper.mockEndpoint('/already-cached.jpg', {
      body: 'image-data',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    // First prefetch
    await zephyrApi.prefetch('/test-api/already-cached.jpg');

    // Second prefetch of same URL
    const result = await zephyrApi.prefetch('/test-api/already-cached.jpg');
    expect(result.status).toBe('already-cached');
  });

  test('should return fetch-failed status on network error', async ({ page }) => {
    await networkHelper.mockEndpoint('/fail-test.jpg', {
      status: 500,
      body: 'Server Error',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const result = await zephyrApi.prefetch('/test-api/fail-test.jpg');
    expect(result.status).toBe('fetch-failed');
    expect(result.httpStatus).toBe(500);
  });

  test('should increment prefetches stat', async ({ page }) => {
    await networkHelper.mockEndpoint('/stat-prefetch.jpg', {
      body: 'image',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const statsBefore = await zephyrApi.getStats();

    await zephyrApi.prefetch('/test-api/stat-prefetch.jpg');

    const statsAfter = await zephyrApi.getStats();
    expect(statsAfter.prefetches).toBeGreaterThan(statsBefore.prefetches || 0);
  });

  test('should handle relative URLs', async ({ page }) => {
    await networkHelper.mockEndpoint('/relative/path.jpg', {
      body: 'image',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const result = await zephyrApi.prefetch('/test-api/relative/path.jpg');
    expect(result.status).toBe('prefetched');
    expect(result.url).toContain('relative/path.jpg');
  });
});
