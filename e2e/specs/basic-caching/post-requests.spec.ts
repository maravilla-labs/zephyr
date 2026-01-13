import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('POST Request Caching with Payload Hashing', () => {
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

  test('should cache POST requests with payload hash in key', async ({ page }) => {
    await networkHelper.mockEndpoint('/api/getProducts', {
      body: { products: [{ id: 1, name: 'Product A' }] },
    }, 'POST');

    await page.evaluate(() =>
      fetch('/test-api/api/getProducts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'electronics' }),
      })
    );

    await page.waitForTimeout(1000);

    const entries = await cacheHelper.getAllCachedEntries();
    const postEntry = entries.find((e) => e.url.includes('getProducts'));
    expect(postEntry).toBeDefined();
    // The key should include a hash suffix for POST
    expect(postEntry?.url).toMatch(/getProducts-[a-f0-9]+$/);
  });

  test('should create separate cache entries for different payloads', async ({ page }) => {
    await networkHelper.mockEndpoint('/api/getProducts', {
      body: { products: [] },
    }, 'POST');

    // First POST with payload A
    await page.evaluate(() =>
      fetch('/test-api/api/getProducts', {
        method: 'POST',
        body: JSON.stringify({ category: 'electronics' }),
      })
    );

    // Second POST with payload B
    await page.evaluate(() =>
      fetch('/test-api/api/getProducts', {
        method: 'POST',
        body: JSON.stringify({ category: 'clothing' }),
      })
    );

    await page.waitForTimeout(1000);

    const entries = await cacheHelper.getAllCachedEntries();
    const productEntries = entries.filter((e) => e.url.includes('getProducts'));
    expect(productEntries.length).toBe(2);
  });

  test('should return cached response for same payload', async ({ page }) => {
    await networkHelper.mockEndpoint('/api/getProducts', {
      body: { products: [{ id: 1 }] },
    }, 'POST');

    const payload = JSON.stringify({ category: 'electronics' });

    // First request
    await page.evaluate((body) =>
      fetch('/test-api/api/getProducts', { method: 'POST', body }),
      payload
    );

    await page.waitForTimeout(500);
    const statsBefore = await zephyrApi.getStats();

    // Second request with same payload
    await page.evaluate((body) =>
      fetch('/test-api/api/getProducts', { method: 'POST', body }),
      payload
    );

    await page.waitForTimeout(300);
    const statsAfter = await zephyrApi.getStats();
    expect(statsAfter.hits).toBeGreaterThan(statsBefore.hits);
  });
});
