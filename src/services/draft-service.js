import { EspnApi } from '../data/espn-api.js';
import { isSelectedPick, normalizeLeague } from '../draft.js';
import { SnapshotChannel } from '../utils/snapshot-channel.js';

export class DraftService {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.data = dependencies.data ?? new EspnApi(config);
    this.now = dependencies.now ?? Date.now;
    this.logger = dependencies.logger ?? console;
    this.cached = null;
    this.cacheTime = 0;
    this.pending = null;
    this.completedPicks = null;
    this.inProgress = false;
    this.latestError = null;
    this.clock = { startedAt: this.now(), pausedAt: null };
    this.players = new Map();
    this.channel = new SnapshotChannel(() => this.cached);
    this.errorChannel = new SnapshotChannel(() => this.latestError);
    this.pollTimer = null;
  }

  start() {
    if (this.pollTimer) return;
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), this.config.pollIntervalMs);
  }

  stop() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  subscribe(listener) {
    return this.channel.subscribe(listener);
  }

  subscribeErrors(listener) {
    return this.errorChannel.subscribe(listener);
  }

  async poll() {
    try {
      const snapshot = await this.snapshot();
      this.latestError = null;
      this.channel.publish(snapshot);
    } catch (error) {
      this.logger.error(`Draft refresh failed: ${error.message}`);
      this.latestError = {
        message: error.message,
        updatedAt: new Date(this.now()).toISOString()
      };
      this.errorChannel.publish(this.latestError);
    }
  }

  async snapshot() {
    const now = this.now();
    if (this.cached && now - this.cacheTime < this.config.pollIntervalMs) return this.cached;
    if (this.pending) return this.pending;
    this.pending = this.refresh(now).finally(() => { this.pending = null; });
    return this.pending;
  }

  async refresh(now) {
    const league = await this.data.fetchLeague();
    const rawPicks = league.draftDetail?.picks ?? [];
    const completed = rawPicks.filter(isSelectedPick);
    const inProgress = Boolean(league.draftDetail?.inProgress);
    const complete = Boolean(league.draftDetail?.drafted)
      || (rawPicks.length > 0 && completed.length === rawPicks.length);
    const pickChanged = this.completedPicks === null || completed.length !== this.completedPicks;
    if (pickChanged) {
      this.clock.startedAt = now;
      if (this.clock.pausedAt !== null) this.clock.pausedAt = now;
    } else if (inProgress && !this.inProgress) {
      if (this.clock.pausedAt !== null) {
        this.clock.startedAt += now - this.clock.pausedAt;
        this.clock.pausedAt = null;
      } else {
        this.clock.startedAt = now;
      }
    } else if (!inProgress && this.inProgress && !complete) {
      this.clock.pausedAt = now;
    }
    this.completedPicks = completed.length;
    this.inProgress = inProgress;

    const ids = [...new Set(completed.map((pick) => Number(pick.playerId)))];
    const missingIds = ids.filter((id) => !this.players.has(id));
    const fetchedPlayers = await this.data.fetchPlayers(missingIds);
    for (const [id, player] of fetchedPlayers) this.players.set(id, player);

    this.cached = normalizeLeague(league, this.players, this.clock, now);
    this.cacheTime = now;
    return this.cached;
  }
}
