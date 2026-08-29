const ESPN_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

const POSITIONS = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST'
};

const NFL_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL',
  7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV',
  14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG',
  20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF',
  26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL',
  34: 'HOU'
};

function isSelectedPick(pick) {
  return pick.playerId !== null
    && pick.playerId !== undefined
    && Number(pick.playerId) !== -1;
}

function cookieHeader(config) {
  const cookies = [];
  if (config.swid) cookies.push(`SWID=${config.swid}`);
  if (config.espnS2) cookies.push(`espn_s2=${config.espnS2}`);
  return cookies.join('; ');
}

async function espnFetch(url, config, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const cookie = cookieHeader(config);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        ...(cookie ? { cookie } : {}),
        ...extraHeaders
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const authHint = response.status === 401 || response.status === 403
        ? ' Check ESPN_SWID and ESPN_S2 for a private league.'
        : '';
      throw new Error(`ESPN returned HTTP ${response.status}.${authHint}`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('ESPN request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLeague(config) {
  const views = ['mDraftDetail', 'mSettings', 'mTeam']
    .map((view) => `view=${view}`)
    .join('&');
  const url = `${ESPN_BASE}/seasons/${config.season}/segments/0/leagues/${config.leagueId}?${views}`;
  return espnFetch(url, config);
}

export async function fetchPlayers(config, playerIds) {
  if (playerIds.length === 0) return new Map();

  const url = `${ESPN_BASE}/seasons/${config.season}/players?scoringPeriodId=0&view=players_wl`;
  const records = await espnFetch(url, config, {
    'x-fantasy-filter': JSON.stringify({
      players: { filterIds: { value: playerIds } }
    })
  });

  return new Map(records.map((record) => {
    const player = record.player ?? record;
    return [Number(player.id), {
      id: Number(player.id),
      name: player.fullName ?? `Player ${player.id}`,
      position: POSITIONS[player.defaultPositionId] ?? '—',
      proTeam: NFL_TEAMS[player.proTeamId] ?? 'FA'
    }];
  }));
}

function teamName(team) {
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(' ') || team.abbrev || `Team ${team.id}`;
}

function generatedSlots(settings, teamCount) {
  const order = settings.pickOrder ?? [];
  const rounds = settings.rounds ?? 0;
  const slots = [];
  for (let round = 1; round <= rounds; round += 1) {
    const roundOrder = settings.type === 'SNAKE' && round % 2 === 0
      ? [...order].reverse()
      : order;
    roundOrder.forEach((teamId, index) => slots.push({
      overallPickNumber: (round - 1) * teamCount + index + 1,
      roundId: round,
      roundPickNumber: index + 1,
      teamId,
      playerId: -1
    }));
  }
  return slots;
}

export function normalizeLeague(data, players, clock, now = Date.now()) {
  const settings = data.settings?.draftSettings ?? {};
  const teams = (data.teams ?? []).map((team) => ({
    id: Number(team.id),
    name: teamName(team),
    abbreviation: team.abbrev ?? `T${team.id}`
  }));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  let slots = [...(data.draftDetail?.picks ?? [])]
    .filter((pick) => Number(pick.overallPickNumber) > 0)
    .sort((a, b) => a.overallPickNumber - b.overallPickNumber);

  if (slots.length === 0 && settings.pickOrder?.length) {
    slots = generatedSlots(settings, teams.length);
  }

  const picks = slots.filter(isSelectedPick).map((pick) => ({
    overall: Number(pick.overallPickNumber),
    round: Number(pick.roundId),
    roundPick: Number(pick.roundPickNumber),
    team: teamById.get(Number(pick.teamId)) ?? {
      id: Number(pick.teamId),
      name: `Team ${pick.teamId}`,
      abbreviation: `T${pick.teamId}`
    },
    player: players.get(Number(pick.playerId)) ?? {
      id: Number(pick.playerId),
      name: `Player ${pick.playerId}`,
      position: '—',
      proTeam: '—'
    }
  }));

  const upcoming = slots
    .filter((pick) => !isSelectedPick(pick))
    .slice(0, 3)
    .map((pick) => ({
      overall: Number(pick.overallPickNumber),
      round: Number(pick.roundId),
      roundPick: Number(pick.roundPickNumber),
      team: teamById.get(Number(pick.teamId)) ?? {
        id: Number(pick.teamId),
        name: `Team ${pick.teamId}`,
        abbreviation: `T${pick.teamId}`
      }
    }));

  const inProgress = Boolean(data.draftDetail?.inProgress);
  const complete = Boolean(data.draftDetail?.drafted) || (slots.length > 0 && picks.length === slots.length);
  const secondsPerPick = Number(settings.timePerSelection) || 0;
  const expiresAt = inProgress && !complete && secondsPerPick > 0
    ? clock.startedAt + secondsPerPick * 1000
    : null;

  return {
    league: {
      id: String(data.id ?? ''),
      name: data.settings?.name ?? 'ESPN Fantasy Football',
      season: Number(data.seasonId),
      draftAt: settings.date ?? null,
      type: settings.type ?? 'SNAKE'
    },
    status: complete ? 'complete' : inProgress ? 'in_progress' : 'waiting',
    picks,
    upcoming,
    teams,
    clock: {
      secondsPerPick,
      expiresAt,
      remainingSeconds: expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null,
      estimated: inProgress && !complete
    },
    updatedAt: new Date(now).toISOString()
  };
}

export class DraftService {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.fetchLeague = dependencies.fetchLeague ?? fetchLeague;
    this.fetchPlayers = dependencies.fetchPlayers ?? fetchPlayers;
    this.now = dependencies.now ?? Date.now;
    this.cached = null;
    this.cacheTime = 0;
    this.pending = null;
    this.completedPicks = null;
    this.inProgress = false;
    this.clock = { startedAt: this.now() };
    this.players = new Map();
  }

  async snapshot() {
    const now = this.now();
    if (this.cached && now - this.cacheTime < this.config.pollIntervalMs) return this.cached;
    if (this.pending) return this.pending;
    this.pending = this.refresh(now).finally(() => { this.pending = null; });
    return this.pending;
  }

  async refresh(now) {
    const league = await this.fetchLeague(this.config);
    const rawPicks = league.draftDetail?.picks ?? [];
    const completed = rawPicks.filter(isSelectedPick);
    const inProgress = Boolean(league.draftDetail?.inProgress);
    if (
      this.completedPicks === null
      || completed.length !== this.completedPicks
      || (inProgress && !this.inProgress)
    ) {
      this.clock.startedAt = now;
      this.completedPicks = completed.length;
    }
    this.inProgress = inProgress;
    const ids = [...new Set(completed.map((pick) => Number(pick.playerId)))];
    const missingIds = ids.filter((id) => !this.players.has(id));
    const fetchedPlayers = await this.fetchPlayers(this.config, missingIds);
    for (const [id, player] of fetchedPlayers) this.players.set(id, player);
    this.cached = normalizeLeague(league, this.players, this.clock, now);
    this.cacheTime = now;
    return this.cached;
  }
}
