export function isSelectedPick(pick) {
  return pick.playerId !== null
    && pick.playerId !== undefined
    && Number(pick.playerId) !== -1;
}

export function buildDraftSlots({ order, rounds, type = 'SNAKE' }) {
  const slots = [];
  for (let round = 1; round <= rounds; round += 1) {
    const roundOrder = type === 'SNAKE' && round % 2 === 0
      ? [...order].reverse()
      : order;
    roundOrder.forEach((teamId, index) => slots.push({
      overallPickNumber: slots.length + 1,
      roundId: round,
      roundPickNumber: index + 1,
      teamId,
      playerId: -1
    }));
  }
  return slots;
}

function teamName(team) {
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(' ') || team.abbrev || `Team ${team.id}`;
}

function teamLogo(logo) {
  if (typeof logo !== 'string' || !logo) return null;
  try {
    const url = new URL(logo);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function fallbackTeam(teamId) {
  return {
    id: Number(teamId),
    name: `Team ${teamId}`,
    abbreviation: `T${teamId}`,
    logo: null
  };
}

function normalizeSlot(pick, teamById) {
  return {
    overall: Number(pick.overallPickNumber),
    round: Number(pick.roundId),
    roundPick: Number(pick.roundPickNumber),
    team: teamById.get(Number(pick.teamId)) ?? fallbackTeam(pick.teamId)
  };
}

export function normalizeLeague(data, players, clock, now = Date.now()) {
  const settings = data.settings?.draftSettings ?? {};
  const teams = (data.teams ?? []).map((team) => ({
    id: Number(team.id),
    name: teamName(team),
    abbreviation: team.abbrev ?? `T${team.id}`,
    logo: teamLogo(team.logo)
  }));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  let slots = [...(data.draftDetail?.picks ?? [])]
    .filter((pick) => Number(pick.overallPickNumber) > 0)
    .sort((a, b) => a.overallPickNumber - b.overallPickNumber);

  if (slots.length === 0 && settings.pickOrder?.length) {
    slots = buildDraftSlots({
      order: settings.pickOrder,
      rounds: settings.rounds ?? 0,
      type: settings.type
    });
  }

  const picks = slots.filter(isSelectedPick).map((pick) => ({
    ...normalizeSlot(pick, teamById),
    player: players.get(Number(pick.playerId)) ?? {
      id: Number(pick.playerId),
      name: `Player ${pick.playerId}`,
      position: '—',
      proTeam: '—'
    }
  }));
  const openSlots = slots.filter((pick) => !isSelectedPick(pick));
  const upcoming = openSlots.slice(0, 3).map((pick) => normalizeSlot(pick, teamById));
  const draftSlots = slots.map((pick) => normalizeSlot(pick, teamById));
  const inProgress = Boolean(data.draftDetail?.inProgress);
  const complete = Boolean(data.draftDetail?.drafted) || (slots.length > 0 && picks.length === slots.length);
  const paused = !complete && clock.pausedAt !== null && clock.pausedAt !== undefined;
  const secondsPerPick = Number(settings.timePerSelection) || 0;
  const expiresAt = inProgress && !complete && secondsPerPick > 0
    ? clock.startedAt + secondsPerPick * 1000
    : null;
  const remainingAt = paused ? clock.pausedAt : now;

  return {
    league: {
      id: String(data.id ?? ''),
      name: data.settings?.name ?? 'ESPN Fantasy Football',
      season: Number(data.seasonId),
      draftAt: settings.date ?? null,
      type: settings.type ?? 'SNAKE',
      rounds: Number(settings.rounds) || Math.max(0, ...slots.map((slot) => Number(slot.roundId))),
      teamCount: teams.length
    },
    status: complete ? 'complete' : paused ? 'paused' : inProgress ? 'in_progress' : 'waiting',
    picks,
    upcoming,
    draftSlots,
    teams,
    clock: {
      secondsPerPick,
      expiresAt,
      remainingSeconds: secondsPerPick > 0 && (inProgress || paused)
        ? Math.max(0, Math.ceil((clock.startedAt + secondsPerPick * 1000 - remainingAt) / 1000))
        : null,
      estimated: (inProgress || paused) && !complete,
      state: complete ? 'complete' : paused ? 'paused' : inProgress ? 'running' : 'unavailable'
    },
    updatedAt: new Date(now).toISOString()
  };
}
