import { buildDraftSlots, normalizeLeague } from '../draft.js';
import { SnapshotChannel } from '../utils/snapshot-channel.js';

const TEAMS = [
  { id: 1, name: 'Fourth and Long', abbrev: 'FAL' },
  { id: 2, name: 'Sunday Scaries', abbrev: 'SUN' },
  { id: 3, name: 'Red Zone Regulars', abbrev: 'RZR' },
  { id: 4, name: 'Two-Minute Drill', abbrev: 'TMD' },
  { id: 5, name: 'Goal Line Stand', abbrev: 'GLS' },
  { id: 6, name: 'Pocket Presence', abbrev: 'PPR' },
  { id: 7, name: 'End Zone Empire', abbrev: 'EZE' },
  { id: 8, name: 'Monday Miracles', abbrev: 'MNM' },
  { id: 9, name: 'Hail Mary Heroes', abbrev: 'HMH' },
  { id: 10, name: 'Gridiron Guild', abbrev: 'GGD' },
  { id: 11, name: 'Blitz Brigade', abbrev: 'BLZ' },
  { id: 12, name: 'Victory Formation', abbrev: 'VFM' }
];

const PLAYERS = [
  { id: 1, name: 'Marcus Hale', position: 'RB', proTeam: 'DET' },
  { id: 2, name: 'Devin Brooks', position: 'WR', proTeam: 'CIN' },
  { id: 3, name: 'Eli Turner', position: 'QB', proTeam: 'BUF' },
  { id: 4, name: 'Cameron Wells', position: 'WR', proTeam: 'MIN' },
  { id: 5, name: 'Andre Fields', position: 'RB', proTeam: 'ATL' },
  { id: 6, name: 'Noah Bennett', position: 'TE', proTeam: 'SF' },
  { id: 7, name: 'Julian Price', position: 'WR', proTeam: 'PHI' },
  { id: 8, name: 'Miles Carter', position: 'RB', proTeam: 'BAL' },
  { id: 9, name: 'Theo Grant', position: 'QB', proTeam: 'KC' },
  { id: 10, name: 'Isaiah Cole', position: 'WR', proTeam: 'LAR' },
  { id: 11, name: 'Darius Stone', position: 'RB', proTeam: 'HOU' },
  { id: 12, name: 'Caleb Young', position: 'TE', proTeam: 'ARI' },
  { id: 13, name: 'Roman Ellis', position: 'WR', proTeam: 'SEA' },
  { id: 14, name: 'Micah Porter', position: 'RB', proTeam: 'GB' },
  { id: 15, name: 'Avery Daniels', position: 'QB', proTeam: 'LAC' },
  { id: 16, name: 'Jalen Cross', position: 'WR', proTeam: 'MIA' },
  { id: 17, name: 'Nico Lawson', position: 'RB', proTeam: 'IND' },
  { id: 18, name: 'Bryce Morgan', position: 'TE', proTeam: 'DAL' },
  { id: 19, name: 'Malik Foster', position: 'WR', proTeam: 'TB' },
  { id: 20, name: 'Owen Hayes', position: 'RB', proTeam: 'CHI' },
  { id: 21, name: 'Xavier Reed', position: 'QB', proTeam: 'WAS' },
  { id: 22, name: 'Trevor Banks', position: 'WR', proTeam: 'JAX' },
  { id: 23, name: 'Cole Harrison', position: 'RB', proTeam: 'PIT' },
  { id: 24, name: 'Logan Pierce', position: 'TE', proTeam: 'LV' }
];

const SLOTS = buildDraftSlots({
  order: TEAMS.map((team) => team.id),
  rounds: PLAYERS.length / TEAMS.length
});
const PLAYER_MAP = new Map(PLAYERS.map((player) => [player.id, player]));

export class DemoDraftService {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.now = dependencies.now ?? Date.now;
    this.startedAt = this.now();
    this.channel = new SnapshotChannel(() => this.snapshot());
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.publish();
    this.timer = setInterval(() => this.publish(), this.config.pollIntervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(listener) {
    return this.channel.subscribe(listener);
  }

  publish() {
    this.channel.publish(this.snapshot());
  }

  snapshot() {
    const now = this.now();
    const elapsedSteps = Math.floor((now - this.startedAt) / this.config.demoPickIntervalMs);
    const cycleSteps = SLOTS.length + 2;
    const step = elapsedSteps % cycleSteps;
    const completed = Math.min(step, SLOTS.length);
    const complete = completed === SLOTS.length;
    const picks = SLOTS.map((slot, index) => ({
      ...slot,
      playerId: index < completed ? PLAYERS[index].id : -1
    }));
    const pickStartedAt = this.startedAt + elapsedSteps * this.config.demoPickIntervalMs;

    return normalizeLeague({
      id: 'demo',
      seasonId: this.config.season,
      settings: {
        name: 'Demo League',
        draftSettings: {
          type: 'SNAKE',
          rounds: SLOTS.length / TEAMS.length,
          timePerSelection: this.config.demoPickIntervalMs / 1000
        }
      },
      teams: TEAMS,
      draftDetail: {
        inProgress: !complete,
        drafted: complete,
        picks
      }
    }, PLAYER_MAP, { startedAt: pickStartedAt }, now);
  }
}
