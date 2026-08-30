import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundsResponse } from './api.js';
import { loadConfig, loadPort } from './config.js';
import { DemoDraftService } from './services/demo-draft-service.js';
import { DraftService } from './services/draft-service.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));

function headers(contentType) {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; img-src 'self' https:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, headers('application/json; charset=utf-8'));
  response.end(JSON.stringify(body));
}

const MAX_STREAM_BUFFER_BYTES = 1_000_000;

function writeStream(response, chunk) {
  if (response.writableEnded || response.destroyed) return;
  response.write(chunk);
  if (response.writableLength > MAX_STREAM_BUFFER_BYTES) response.destroy();
}

function sendEvent(response, event, body) {
  writeStream(response, `event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function selectService(url, services, defaultMode) {
  const mode = url.searchParams.get('mode') ?? defaultMode;
  if (!['demo', 'live'].includes(mode)) {
    return { error: { status: 400, message: 'Mode must be demo or live.' } };
  }
  if (!services[mode]) {
    return { error: { status: 503, message: 'Live mode requires ESPN league configuration.' } };
  }
  return { mode, service: services[mode] };
}

async function handleRequest(request, response, services, defaultMode) {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    sendJson(response, 400, { error: 'Bad request' });
    return;
  }

  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  if (url.pathname === '/healthz') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api') {
    sendJson(response, 200, {
      name: 'ESPN Draft Board API',
      version: 1,
      authentication: 'none',
      endpoints: [
        { method: 'GET', path: '/api/config', description: 'Available data sources and default mode' },
        { method: 'GET', path: '/api/draft', description: 'Complete current draft snapshot' },
        { method: 'GET', path: '/api/rounds', description: 'Drafted players grouped by round' },
        { method: 'GET', path: '/api/rounds/{round}', description: 'Drafted players in one round' },
        { method: 'GET', path: '/api/events', description: 'Live draft updates as server-sent events' }
      ]
    });
    return;
  }

  if (url.pathname === '/api/config') {
    sendJson(response, 200, {
      defaultMode,
      liveAvailable: Boolean(services.live)
    });
    return;
  }

  if (url.pathname === '/api/draft') {
    const selected = selectService(url, services, defaultMode);
    if (selected.error) {
      sendJson(response, selected.error.status, { error: selected.error.message });
      return;
    }
    try {
      sendJson(response, 200, await selected.service.snapshot());
    } catch (error) {
      console.error(`Draft refresh failed: ${error.message}`);
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  const roundMatch = url.pathname.match(/^\/api\/rounds\/([^/]+)$/);
  if (url.pathname === '/api/rounds' || roundMatch) {
    const roundNumber = roundMatch ? Number(roundMatch[1]) : null;
    if (roundMatch && (!Number.isInteger(roundNumber) || roundNumber < 1)) {
      sendJson(response, 400, { error: 'Round must be a positive integer.' });
      return;
    }
    const selected = selectService(url, services, defaultMode);
    if (selected.error) {
      sendJson(response, selected.error.status, { error: selected.error.message });
      return;
    }
    try {
      const body = roundsResponse(await selected.service.snapshot(), roundNumber);
      if (!body) {
        sendJson(response, 404, { error: 'Round not found.' });
        return;
      }
      sendJson(response, 200, body);
    } catch (error) {
      console.error(`Draft refresh failed: ${error.message}`);
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/events') {
    const selected = selectService(url, services, defaultMode);
    if (selected.error) {
      sendJson(response, selected.error.status, { error: selected.error.message });
      return;
    }
    if (typeof selected.service.subscribe !== 'function') {
      sendJson(response, 501, { error: 'Real-time updates are unavailable' });
      return;
    }
    response.writeHead(200, {
      ...headers('text/event-stream; charset=utf-8'),
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    response.on('error', () => response.destroy());
    writeStream(response, 'retry: 2000\n\n');
    const unsubscribe = selected.service.subscribe((snapshot) => sendEvent(response, 'draft', snapshot));
    const unsubscribeErrors = selected.service.subscribeErrors?.(
      (error) => sendEvent(response, 'draft-error', error)
    ) ?? (() => {});
    const heartbeat = setInterval(() => writeStream(response, ': heartbeat\n\n'), 15000);
    heartbeat.unref();
    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeErrors();
    });
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['index.html', 'app.js', 'styles.css'].includes(file)) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  try {
    const content = await readFile(join(ROOT, file));
    response.writeHead(200, headers(MIME[extname(file)]));
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

export function createApp(services, { defaultMode = 'demo' } = {}) {
  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, services, defaultMode);
    } catch (error) {
      console.error(`Request failed: ${error.message}`);
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal server error' });
      else response.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const config = loadConfig();
    const port = loadPort();
    const services = {
      demo: new DemoDraftService(config),
      live: config.leagueId ? new DraftService(config) : null
    };
    const defaultMode = services.live ? 'live' : 'demo';
    const server = createApp(services, { defaultMode });
    for (const service of Object.values(services).filter(Boolean)) service.start();
    server.on('close', () => {
      for (const service of Object.values(services).filter(Boolean)) service.stop();
    });
    server.listen(port, '0.0.0.0', () => {
      const source = services.live ? `demo and ESPN league ${config.leagueId}` : 'demo';
      console.log(`Draft board listening on http://0.0.0.0:${port} with ${source} mode`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        server.close(() => process.exit(0));
        server.closeAllConnections();
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
