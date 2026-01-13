import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('zephyr.clear()', () => {
  let swHelper: ServiceWorkerHelper;
  let cacheHelper: CacheHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    cacheHelper = new CacheHelper(page);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    // Navigate and wait for SW, then clear cache (don't unregister SW)
    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
    await networkHelper.clearMocks();
  });

  test('should clear all cached entries', async ({ page }) => {
    // Populate cache
    await networkHelper.mockEndpoint('/clear-test-1.jpg', { body: 'img1', headers: { 'Content-Type': 'image/jpeg' } });
    await networkHelper.mockEndpoint('/clear-test-2.png', { body: 'img2', headers: { 'Content-Type': 'image/png' } });

    await page.evaluate(() => fetch('/test-api/clear-test-1.jpg'));
    await page.evaluate(() => fetch('/test-api/clear-test-2.png'));
    await page.waitForTimeout(500);

    let entries = await cacheHelper.getAllCachedEntries();
    expect(entries.length).toBeGreaterThan(0);

    // Clear cache
    const result = await zephyrApi.clear();
    expect(result).toBe(true);

    entries = await cacheHelper.getAllCachedEntries();
    expect(entries.length).toBe(0);
  });

  test('should reset statistics entries count after clear', async ({ page }) => {
    await networkHelper.mockEndpoint('/stat-test.jpg', { body: 'img', headers: { 'Content-Type': 'image/jpeg' } });

    await page.evaluate(() => fetch('/test-api/stat-test.jpg'));
    await page.waitForTimeout(500);

    let stats = await zephyrApi.getStats();
    expect(stats.entries).toBeGreaterThan(0);

    await zephyrApi.clear();

    stats = await zephyrApi.getStats();
    expect(stats.entries).toBe(0);
  });
});

test.describe('zephyr.clearPattern()', () => {
  let swHelper: ServiceWorkerHelper;
  let cacheHelper: CacheHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    cacheHelper = new CacheHelper(page);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    // Navigate and wait for SW, then clear cache (don't unregister SW)
    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
    await networkHelper.clearMocks();
  });

  test('should clear entries matching pattern', async ({ page }) => {
    await networkHelper.mockEndpoint('/pattern-test.jpg', { body: 'jpg', headers: { 'Content-Type': 'image/jpeg' } });
    await networkHelper.mockEndpoint('/pattern-test.png', { body: 'png', headers: { 'Content-Type': 'image/png' } });
    await networkHelper.mockEndpoint('/other.css', { body: 'css', headers: { 'Content-Type': 'text/css' } });

    await page.evaluate(() => fetch('/test-api/pattern-test.jpg'));
    await page.evaluate(() => fetch('/test-api/pattern-test.png'));
    await page.evaluate(() => fetch('/test-api/other.css'));
    await page.waitForTimeout(500);

    // Clear only jpg files
    const deleted = await zephyrApi.clearPattern('.*\\.jpg$');
    expect(deleted).toBe(1);

    // Verify jpg is gone but others remain
    expect(await cacheHelper.isCached('pattern-test.jpg')).toBe(false);
    expect(await cacheHelper.isCached('pattern-test.png')).toBe(true);
    expect(await cacheHelper.isCached('other.css')).toBe(true);
  });

  test('should return count of deleted entries', async ({ page }) => {
    await networkHelper.mockEndpoint('/count-1.jpg', { body: 'img', headers: { 'Content-Type': 'image/jpeg' } });
    await networkHelper.mockEndpoint('/count-2.jpg', { body: 'img', headers: { 'Content-Type': 'image/jpeg' } });
    await networkHelper.mockEndpoint('/count-3.jpg', { body: 'img', headers: { 'Content-Type': 'image/jpeg' } });

    await page.evaluate(() => fetch('/test-api/count-1.jpg'));
    await page.evaluate(() => fetch('/test-api/count-2.jpg'));
    await page.evaluate(() => fetch('/test-api/count-3.jpg'));
    await page.waitForTimeout(500);

    const deleted = await zephyrApi.clearPattern('.*count.*\\.jpg$');
    expect(deleted).toBe(3);
  });

  test('should return 0 when no entries match', async ({ page }) => {
    const deleted = await zephyrApi.clearPattern('.*nonexistent.*');
    expect(deleted).toBe(0);
  });
});
