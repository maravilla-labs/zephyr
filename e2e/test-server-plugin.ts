import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

interface TestResponse {
  status?: number;
  body?: string | object;
  headers?: Record<string, string>;
  delay?: number;
}

interface TestConfig {
  path: string;
  method?: string;
  response: TestResponse;
}

// In-memory store for test configurations
// Key format: "METHOD:path" e.g., "GET:/test-image.jpg" or "POST:/api/getProducts"
const testResponses = new Map<string, TestResponse>();

function getConfigKey(method: string, path: string): string {
  return `${method.toUpperCase()}:${path}`;
}

export function testServerPlugin(): Plugin {
  return {
    name: 'test-server',
    configureServer(server: ViteDevServer) {
      // Endpoint to configure test responses
      server.middlewares.use('/test-api/__configure', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk.toString()));
          req.on('end', () => {
            try {
              const config: TestConfig = JSON.parse(body);
              const method = config.method || 'GET';
              const key = getConfigKey(method, config.path);
              testResponses.set(key, config.response);
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end('OK');
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Invalid JSON');
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'text/plain' });
          res.end('Method not allowed');
        }
      });

      // Endpoint to clear test configurations
      server.middlewares.use('/test-api/__clear', (_req: IncomingMessage, res: ServerResponse) => {
        testResponses.clear();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });

      // Handle test requests - must be registered after configure/clear
      server.middlewares.use('/test-api/', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || '/';
        const path = url.replace(/^\/test-api/, '') || '/';

        // Skip configuration endpoints
        if (path.startsWith('/__')) {
          return next();
        }

        const method = req.method || 'GET';
        const key = getConfigKey(method, path);
        const config = testResponses.get(key);

        if (!config) {
          // Also try without method for backwards compatibility
          const fallbackConfig = testResponses.get(getConfigKey('GET', path));
          if (!fallbackConfig) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Not configured: ${key}`);
            return;
          }
        }

        const responseConfig = config || testResponses.get(getConfigKey('GET', path))!;

        // Apply delay if specified
        if (responseConfig.delay) {
          await new Promise((r) => setTimeout(r, responseConfig.delay));
        }

        // Set headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...responseConfig.headers,
        };

        res.writeHead(responseConfig.status || 200, headers);

        const body =
          typeof responseConfig.body === 'string'
            ? responseConfig.body
            : JSON.stringify(responseConfig.body);
        res.end(body);
      });
    },
  };
}
