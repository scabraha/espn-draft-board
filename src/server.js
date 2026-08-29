import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DraftService } from './espn.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = integerEnv('PORT', 3000, 1, 65535);

function integerEnv(name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function cleanCookie(value = '') {
  return value.trim().replace(/^["']|["']$/g, '');
}

export function loadConfig() {
  const leagueId = process.env.ESPN_LEAGUE_ID?.trim();
  if (!leagueId || !/^\d+$/.test(leagueId)) {
    throw new Error('ESPN_LEAGUE_ID is required and must contain only digits.');
  }
  return {
    leagueId,
    season: integerEnv('ESPN_SEASON', new Date().getUTCFullYear(), 2018, 2100),
    swid: cleanCookie(process.env.ESPN_SWID),
    espnS2: cleanCookie(process.env.ESPN_S2),
    pollIntervalMs: integerEnv('ESPN_POLL_INTERVAL_MS', 2000, 1000, 60000),
    requestTimeoutMs: integerEnv('ESPN_REQUEST_TIMEOUT_MS', 10000, 1000, 60000)
  };
}

function headers(contentType) {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, headers('application/json; charset=utf-8'));
  response.end(JSON.stringify(body));
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

export function createApp(service) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (url.pathname === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (url.pathname === '/api/draft') {
      try {
        sendJson(response, 200, await service.snapshot());
      } catch (error) {
        console.error(`Draft refresh failed: ${error.message}`);
        sendJson(response, 502, { error: error.message });
      }
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
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const server = createApp(new DraftService(loadConfig()));
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Draft board listening on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
