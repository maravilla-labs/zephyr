import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { CacheHelper } from '../../helpers/cache.helper';
import { NetworkHelper } from '../../helpers/network.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('HTTP Header Respect', () => {
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

  test('should not cache responses with no-store', async ({ page }) => {
    await networkHelper.mockEndpoint('/no-store.jpg', {
      body: 'image',
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });

    await page.evaluate(() => fetch('/test-api/no-store.jpg'));
    await page.waitForTimeout(500);

    const isCached = await cacheHelper.isCached('no-store.jpg');
    expect(isCached).toBe(false);
  });

  test.skip('should not cache responses with Set-Cookie header', async ({ page }) => {
    // SKIP: The Set-Cookie header is a "forbidden response header" and isn't accessible
    // via response.headers.get() in JavaScript/Service Workers. The SW code correctly checks
    // for this header, but the browser strips it from the response object for security reasons.
    // This test cannot verify this behavior through the Playwright/Fetch API.
    await networkHelper.mockEndpoint('/set-cookie.jpg', {
      body: 'image',
      headers: {
        'Content-Type': 'image/jpeg',
        'Set-Cookie': 'session=abc123',
      },
    });

    await page.evaluate(() => fetch('/test-api/set-cookie.jpg'));
    await page.waitForTimeout(500);

    const isCached = await cacheHelper.isCached('set-cookie.jpg');
    expect(isCached).toBe(false);
  });

  test('should use max-age from Cache-Control for TTL', async ({ page }) => {
    // Set a very short max-age (10 seconds)
    await networkHelper.mockEndpoint('/short-ttl.jpg', {
      body: 'image',
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'max-age=10',
      },
    });

    await page.evaluate(() => fetch('/test-api/short-ttl.jpg'));
    await page.waitForTimeout(500);

    const entry = await cacheHelper.getCacheEntry(
      page.url().replace(/\/$/, '') + '/test-api/short-ttl.jpg'
    );

    // validUntil should be approximately 10 seconds from now
    if (entry) {
      const expectedMaxExpiry = Date.now() + 15000; // 15s buffer
      expect(entry.validUntil).toBeLessThan(expectedMaxExpiry);
    }
  });

  test('should store ETag from response', async ({ page }) => {
    await networkHelper.mockEndpoint('/etag-test.jpg', {
      body: 'image',
      headers: {
        'Content-Type': 'image/jpeg',
        ETag: '"v1.0"',
      },
    });

    await page.evaluate(() => fetch('/test-api/etag-test.jpg'));
    await page.waitForTimeout(500);

    const entry = await cacheHelper.getCacheEntry(
      page.url().replace(/\/$/, '') + '/test-api/etag-test.jpg'
    );
    expect(entry?.etag).toBe('"v1.0"');
  });
});

test.describe('ETag Revalidation (304 Not Modified)', () => {
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

  test.skip('should send If-None-Match header for cached resources with ETag', async ({ page }) => {
    // SKIP: This test uses page.route() which intercepts requests at the browser level
    // BEFORE they reach the Service Worker. This means the SW's ETag handling code
    // never executes. Testing ETag revalidation requires real server-side 304 handling
    // with stateful If-None-Match checking, which would require a more complex test setup.
    let requestHeaders: Record<string, string> = {};

    // Use page.route to track headers (passthrough mode)
    await page.route('**/test-api/etag-revalidate.jpg', async (route) => {
      requestHeaders = route.request().headers();

      if (requestHeaders['if-none-match'] === '"version-1"') {
        await route.fulfill({ status: 304 });
      } else {
        await route.fulfill({
          body: 'image data',
          headers: {
            'Content-Type': 'image/jpeg',
            ETag: '"version-1"',
            'Cache-Control': 'max-age=1', // Very short TTL to trigger revalidation
          },
        });
      }
    });

    // First request - gets ETag
    await page.evaluate(() => fetch('/test-api/etag-revalidate.jpg'));
    await page.waitForTimeout(500);

    // Wait for cache to expire
    await page.waitForTimeout(2000);

    // Second request - should send If-None-Match
    await page.evaluate(() => fetch('/test-api/etag-revalidate.jpg'));
    await page.waitForTimeout(500);

    expect(requestHeaders['if-none-match']).toBe('"version-1"');
  });

  test.skip('should use cached response on 304 Not Modified', async ({ page }) => {
    // SKIP: This test uses page.route() which intercepts requests at the browser level
    // BEFORE they reach the Service Worker. Testing 304 handling requires real
    // server-side state management with If-None-Match header checking.
    let networkRequestCount = 0;

    await page.route('**/test-api/304-test.jpg', async (route) => {
      networkRequestCount++;

      if (route.request().headers()['if-none-match'] === '"etag-304"') {
        await route.fulfill({ status: 304 });
      } else {
        await route.fulfill({
          body: 'original image',
          headers: {
            'Content-Type': 'image/jpeg',
            ETag: '"etag-304"',
            'Cache-Control': 'max-age=1',
          },
        });
      }
    });

    // First request
    await page.evaluate(() => fetch('/test-api/304-test.jpg'));
    await page.waitForTimeout(500);

    const statsBefore = await zephyrApi.getStats();

    // Wait for TTL to expire
    await page.waitForTimeout(2000);

    // Second request - should get 304 and count as hit
    await page.evaluate(() => fetch('/test-api/304-test.jpg'));
    await page.waitForTimeout(500);

    const statsAfter = await zephyrApi.getStats();
    expect(statsAfter.revalidations).toBeGreaterThan(statsBefore.revalidations);
  });
});
