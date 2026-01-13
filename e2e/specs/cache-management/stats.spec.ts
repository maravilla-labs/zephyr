import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('zephyr.stats()', () => {
  let swHelper: ServiceWorkerHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
    await networkHelper.clearMocks();
  });

  test('should return correct statistics structure', async ({ page }) => {
    const stats = await zephyrApi.getStats();

    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('errors');
    expect(stats).toHaveProperty('evictions');
    expect(stats).toHaveProperty('revalidations');
    expect(stats).toHaveProperty('entries');
    expect(stats).toHaveProperty('storageUsed');
    expect(stats).toHaveProperty('hitRate');
  });

  test('should track cache hits correctly', async ({ page }) => {
    await networkHelper.mockEndpoint('/hit-test.jpg', {
      body: 'image',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    // First request - miss
    await page.evaluate(() => fetch('/test-api/hit-test.jpg'));
    await page.waitForTimeout(300);

    // Second request - hit
    await page.evaluate(() => fetch('/test-api/hit-test.jpg'));
    await page.waitForTimeout(300);

    const stats = await zephyrApi.getStats();
    expect(stats.misses).toBeGreaterThanOrEqual(1);
    expect(stats.hits).toBeGreaterThanOrEqual(1);
  });

  test('should track storage used', async ({ page }) => {
    const largeBody = 'x'.repeat(50000);
    await networkHelper.mockEndpoint('/large.jpg', {
      body: largeBody,
      headers: { 'Content-Type': 'image/jpeg' },
    });

    await page.evaluate(() => fetch('/test-api/large.jpg'));
    await page.waitForTimeout(500);

    const stats = await zephyrApi.getStats();
    expect(stats.storageUsed).toBeGreaterThan(0);
    expect(stats.entries).toBe(1);
  });

  test('should show storage used in MB format', async ({ page }) => {
    const stats = await zephyrApi.getStats();
    expect(stats.storageUsedMB).toMatch(/^\d+\.\d+$/);
  });

  test('should report hit rate as percentage', async ({ page }) => {
    await networkHelper.mockEndpoint('/rate-test.jpg', {
      body: 'image',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    // Generate some hits and misses
    await page.evaluate(() => fetch('/test-api/rate-test.jpg')); // miss
    await page.waitForTimeout(300);
    await page.evaluate(() => fetch('/test-api/rate-test.jpg')); // hit
    await page.evaluate(() => fetch('/test-api/rate-test.jpg')); // hit
    await page.waitForTimeout(300);

    const stats = await zephyrApi.getStats();
    expect(stats.hitRate).toMatch(/\d+\.\d+%/);
  });
});

test.describe('zephyr.quota()', () => {
  let swHelper: ServiceWorkerHelper;
  let networkHelper: NetworkHelper;
  let zephyrApi: ZephyrAPIHelper;

  test.beforeEach(async ({ page, context }) => {
    swHelper = new ServiceWorkerHelper(page, context);
    networkHelper = new NetworkHelper(page);
    zephyrApi = new ZephyrAPIHelper(page);

    await page.goto('/');
    await zephyrApi.waitForReady();
    await zephyrApi.clear();
    await networkHelper.clearMocks();
  });

  test('should return quota usage structure', async ({ page }) => {
    const quota = await zephyrApi.getQuota();

    expect(quota).toHaveProperty('used');
    expect(quota).toHaveProperty('max');
    expect(quota).toHaveProperty('percentage');
    expect(quota).toHaveProperty('available');
  });

  test('should report correct quota max', async ({ page }) => {
    const quota = await zephyrApi.getQuota();

    // Default max is 50MB
    expect(quota.max).toBe(50 * 1024 * 1024);
  });

  test('should update used quota after caching', async ({ page }) => {
    await networkHelper.mockEndpoint('/quota-test.jpg', {
      body: 'x'.repeat(10000),
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const quotaBefore = await zephyrApi.getQuota();

    await page.evaluate(() => fetch('/test-api/quota-test.jpg'));
    await page.waitForTimeout(500);

    const quotaAfter = await zephyrApi.getQuota();
    expect(quotaAfter.used).toBeGreaterThan(quotaBefore.used);
  });
});
