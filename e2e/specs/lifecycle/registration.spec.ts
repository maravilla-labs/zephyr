import { test, expect } from '@playwright/test';
import { ServiceWorkerHelper } from '../../helpers/service-worker.helper';
import { ZephyrAPIHelper } from '../../helpers/zephyr-api.helper';

test.describe('Service Worker Registration', () => {
  test('should register service worker on page load', async ({ page, context }) => {
    const swHelper = new ServiceWorkerHelper(page, context);

    await page.goto('/');
    await swHelper.waitForServiceWorker();

    const info = await swHelper.getRegistrationInfo();
    expect(info).not.toBeNull();
    expect(info?.scriptURL).toContain('zephyrConfig.js');
  });

  test('should activate service worker after registration', async ({ page, context }) => {
    const swHelper = new ServiceWorkerHelper(page, context);

    await page.goto('/');
    await swHelper.waitForServiceWorker();

    const info = await swHelper.getRegistrationInfo();
    expect(info?.state).toBe('activated');
  });

  test('should expose zephyr API on window after registration', async ({ page }) => {
    const zephyrApi = new ZephyrAPIHelper(page);

    await page.goto('/');
    await zephyrApi.waitForReady();

    const isAvailable = await zephyrApi.isAvailable();
    expect(isAvailable).toBe(true);
  });

  test('should be controlling the page', async ({ page, context }) => {
    const swHelper = new ServiceWorkerHelper(page, context);

    await page.goto('/');
    await swHelper.waitForServiceWorker();

    const isControlling = await swHelper.isControlling();
    expect(isControlling).toBe(true);
  });

  test('should log registration message to console', async ({ page, context }) => {
    const swHelper = new ServiceWorkerHelper(page, context);
    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await page.goto('/');
    await swHelper.waitForServiceWorker();

    expect(consoleMessages.some((m) => m.includes('[Zephyr]') && m.includes('registered'))).toBe(true);
  });
});
