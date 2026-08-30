export function draftRounds(snapshot) {
  const picksByRound = new Map();
  for (const pick of snapshot.picks ?? []) {
    const picks = picksByRound.get(pick.round) ?? [];
    picks.push(pick);
    picksByRound.set(pick.round, picks);
  }

  const roundCount = Math.max(
    Number(snapshot.league?.rounds) || 0,
    ...picksByRound.keys(),
    0
  );
  return Array.from({ length: roundCount }, (_, index) => ({
    number: index + 1,
    picks: picksByRound.get(index + 1) ?? []
  }));
}

export function roundsResponse(snapshot, roundNumber = null) {
  const rounds = draftRounds(snapshot);
  const response = {
    league: snapshot.league,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt
  };

  if (roundNumber === null) return { ...response, rounds };
  const round = rounds.find(({ number }) => number === roundNumber);
  return round ? { ...response, round } : null;
}
