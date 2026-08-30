function integerEnv(env, name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const value = env[name];
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

export function loadPort(env = process.env) {
  return integerEnv(env, 'PORT', 3000, 1, 65535);
}

export function loadConfig(env = process.env, currentYear = new Date().getUTCFullYear()) {
  const leagueId = env.ESPN_LEAGUE_ID?.trim();
  if (leagueId && !/^\d+$/.test(leagueId)) {
    throw new Error('ESPN_LEAGUE_ID must contain only digits.');
  }

  return {
    leagueId: leagueId ?? '',
    season: integerEnv(env, 'ESPN_SEASON', currentYear, 2018, 2100),
    swid: cleanCookie(env.ESPN_SWID),
    espnS2: cleanCookie(env.ESPN_S2),
    pollIntervalMs: integerEnv(env, 'ESPN_POLL_INTERVAL_MS', 2000, 1000, 60000),
    requestTimeoutMs: integerEnv(env, 'ESPN_REQUEST_TIMEOUT_MS', 10000, 1000, 60000),
    demoPickIntervalMs: integerEnv(env, 'DEMO_PICK_SECONDS', 5, 1, 60) * 1000
  };
}
