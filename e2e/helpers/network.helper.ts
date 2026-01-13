import { Page, Route, APIRequestContext } from '@playwright/test';

interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  delay?: number;
}

interface TrackedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/**
 * Helper class for network mocking in tests
 * Uses a real test server (Vite plugin) so requests flow through the service worker
 */
export class NetworkHelper {
  private trackedRequests: Map<string, TrackedRequest[]> = new Map();
  private baseUrl: string = 'http://localhost:5197';

  constructor(private page: Page) {}

  /**
   * Configure test server to respond to a path
   * This uses a real server so the service worker can intercept the request
   * @param path - The path (without /test-api prefix), e.g., "/test-image.jpg"
   * @param response - The response configuration
   * @param method - HTTP method (default: GET)
   */
  async mockEndpoint(
    path: string,
    response: MockResponse,
    method: string = 'GET'
  ): Promise<void> {
    // Normalize path - remove any glob patterns and leading slashes for clean path
    const cleanPath = path
      .replace(/^\*\*/, '') // Remove ** at start
      .replace(/^\*/, '') // Remove * at start
      .replace(/^\/+/, '/'); // Ensure single leading slash

    // Use Playwright's request API to configure the test server
    // This works even when page is on about:blank
    const request = this.page.request;
    await request.post(`${this.baseUrl}/test-api/__configure`, {
      data: { path: cleanPath, response, method },
    });
  }

  /**
   * Configure test server with Cache-Control headers
   */
  async mockWithCacheControl(
    path: string,
    body: unknown,
    cacheControl: string
  ): Promise<void> {
    await this.mockEndpoint(path, {
      body,
      headers: {
        'Cache-Control': cacheControl,
        'Content-Type': 'image/jpeg',
      },
    });
  }

  /**
   * Configure test server with ETag support
   * Note: 304 handling needs special server-side logic
   */
  async mockWithETag(
    path: string,
    body: unknown,
    etag: string,
    contentType = 'application/json'
  ): Promise<void> {
    await this.mockEndpoint(path, {
      body,
      headers: {
        'Content-Type': contentType,
        ETag: etag,
      },
    });
  }

  /**
   * Clear all test server mock configurations
   */
  async clearMocks(): Promise<void> {
    const request = this.page.request;
    await request.fetch(`${this.baseUrl}/test-api/__clear`);
    this.trackedRequests.clear();
  }

  /**
   * Simulate network failure using page.route()
   * This uses Playwright's route because we want to block the request entirely
   */
  async simulateOffline(urlPattern: string | RegExp): Promise<void> {
    await this.page.route(urlPattern, (route) => route.abort('failed'));
  }

  /**
   * Simulate slow network
   */
  async simulateSlow(
    path: string,
    delayMs: number,
    response: MockResponse = {}
  ): Promise<void> {
    await this.mockEndpoint(path, {
      ...response,
      delay: delayMs,
    });
  }

  /**
   * Track network requests matching a pattern using page.route()
   * This intercepts at browser level (before SW) for request tracking only
   */
  async trackRequests(urlPattern: string | RegExp): Promise<{
    getRequests: () => TrackedRequest[];
    clear: () => void;
  }> {
    const patternKey =
      typeof urlPattern === 'string' ? urlPattern : urlPattern.source;
    this.trackedRequests.set(patternKey, []);

    await this.page.route(urlPattern, async (route) => {
      const requests = this.trackedRequests.get(patternKey) || [];
      requests.push({
        url: route.request().url(),
        method: route.request().method(),
        headers: route.request().headers(),
      });
      this.trackedRequests.set(patternKey, requests);
      await route.continue();
    });

    return {
      getRequests: () => this.trackedRequests.get(patternKey) || [],
      clear: () => this.trackedRequests.set(patternKey, []),
    };
  }

  /**
   * Count requests to a URL pattern
   */
  async countRequests(urlPattern: string): Promise<number> {
    const requests = this.trackedRequests.get(urlPattern) || [];
    return requests.length;
  }

  /**
   * Remove all Playwright route handlers
   */
  async clearRoutes(): Promise<void> {
    await this.page.unroute('**/*');
    this.trackedRequests.clear();
  }

  /**
   * Pass through requests (continue without modification)
   */
  async passThrough(urlPattern: string | RegExp): Promise<void> {
    await this.page.route(urlPattern, (route) => route.continue());
  }

  /**
   * Helper to get the full test-api URL for a path
   */
  getTestApiUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `/test-api${cleanPath}`;
  }
}
