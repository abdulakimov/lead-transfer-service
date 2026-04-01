import http from 'node:http';
import type express from 'express';

export interface TestResponse {
  status: number;
  body: Record<string, unknown>;
  headers: http.IncomingHttpHeaders;
}

export async function testRequest(
  app: express.Express,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<TestResponse> {
  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('No address'));
        return;
      }

      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
      const reqOptions: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: method.toUpperCase(),
        headers: {
          ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...options.headers,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { parsed = { raw: data }; }
          resolve({ status: res.statusCode!, body: parsed, headers: res.headers });
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}
