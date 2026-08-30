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

function cookieHeader(config) {
  return [
    config.swid ? `SWID=${config.swid}` : '',
    config.espnS2 ? `espn_s2=${config.espnS2}` : ''
  ].filter(Boolean).join('; ');
}

function normalizePlayer(record) {
  const player = record.player ?? record;
  return {
    id: Number(player.id),
    name: player.fullName ?? `Player ${player.id}`,
    position: POSITIONS[player.defaultPositionId] ?? '—',
    proTeam: NFL_TEAMS[player.proTeamId] ?? 'FA'
  };
}

export class EspnApi {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.fetch = dependencies.fetch ?? globalThis.fetch;
  }

  async request(url, extraHeaders = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    const cookie = cookieHeader(this.config);

    try {
      const response = await this.fetch(url, {
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

  fetchLeague() {
    const views = ['mDraftDetail', 'mSettings', 'mTeam']
      .map((view) => `view=${view}`)
      .join('&');
    const url = `${ESPN_BASE}/seasons/${this.config.season}/segments/0/leagues/${this.config.leagueId}?${views}`;
    return this.request(url);
  }

  async fetchPlayers(playerIds) {
    if (playerIds.length === 0) return new Map();

    const url = `${ESPN_BASE}/seasons/${this.config.season}/players?scoringPeriodId=0&view=players_wl`;
    const records = await this.request(url, {
      'x-fantasy-filter': JSON.stringify({
        players: { filterIds: { value: playerIds } }
      })
    });
    const players = (Array.isArray(records) ? records : []).map(normalizePlayer);
    return new Map(players.map((player) => [player.id, player]));
  }
}
