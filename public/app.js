const state = {
  snapshot: null,
  timerOffset: 0,
  renderedPicks: '',
  audioContext: null,
  pendingTurnDing: false
};
const $ = (id) => document.getElementById(id);

function soundTurnDing(context) {
  const startedAt = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.2, startedAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.55);
  gain.connect(context.destination);

  for (const [frequency, delay] of [[880, 0], [1320, 0.12]]) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(startedAt + delay);
    oscillator.stop(startedAt + delay + 0.35);
  }
}

function dingForNewTurn() {
  if (state.audioContext?.state === 'running') {
    soundTurnDing(state.audioContext);
  } else {
    state.pendingTurnDing = true;
  }
}

function unlockAudio() {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return;
  state.audioContext ??= new AudioContext();
  void state.audioContext.resume().then(() => {
    if (state.pendingTurnDing) {
      soundTurnDing(state.audioContext);
      state.pendingTurnDing = false;
    }
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  });
}

function initials(name) {
  return name.split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase();
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function renderStatus(data) {
  $('league-name').textContent = `${data.league.name} · ${data.league.season}`;
  const current = data.upcoming[0];
  if (data.status === 'complete') {
    $('clock-label').textContent = 'DRAFT COMPLETE';
    $('current-team').textContent = 'That’s a wrap';
    $('current-pick').textContent = `${data.picks.length} selections made`;
    $('current-mark').textContent = '✓';
    $('timer').textContent = 'FINAL';
  } else if (current) {
    $('clock-label').textContent = data.status === 'in_progress' ? 'ON THE CLOCK' : 'FIRST UP';
    $('current-team').textContent = current.team.name;
    $('current-pick').textContent = `Round ${current.round} · Pick ${current.roundPick} · Overall ${current.overall}`;
    $('current-mark').textContent = initials(current.team.name);
  } else {
    $('clock-label').textContent = 'WAITING';
    $('current-team').textContent = 'Draft order pending';
    $('current-pick').textContent = 'ESPN has not published the draft slots yet';
    $('current-mark').textContent = '—';
    $('timer').textContent = '--:--';
  }

  $('up-next').replaceChildren(...data.upcoming.slice(1).map((slot, index) => {
    const row = document.createElement('div');
    row.className = 'next-team';
    const number = document.createElement('span');
    number.className = 'next-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = slot.team.name;
    const pick = document.createElement('small');
    pick.textContent = `Overall pick ${slot.overall}`;
    text.append(name, pick);
    row.append(number, text);
    return row;
  }));
}

function playerDetails(pick) {
  const details = document.createElement('div');
  details.className = 'player-details';
  const player = document.createElement('strong');
  player.textContent = pick.player.name;
  const meta = document.createElement('div');
  meta.className = 'pick-meta';
  const position = document.createElement('span');
  position.className = 'position-badge';
  position.dataset.position = pick.player.position;
  position.textContent = pick.player.position;
  const team = document.createElement('small');
  team.textContent = `${pick.player.proTeam} · ${pick.team.abbreviation}`;
  meta.append(position, team);
  details.append(player, meta);
  return details;
}

function renderBoard(data) {
  const board = $('board');
  board.replaceChildren();
  if (!data.draftSlots?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'The draft order will appear here when ESPN publishes it.';
    board.append(empty);
    return;
  }

  const firstRound = data.draftSlots
    .filter((slot) => slot.round === 1)
    .sort((a, b) => a.roundPick - b.roundPick);
  const teams = firstRound.map((slot) => slot.team);
  const rounds = Math.max(...data.draftSlots.map((slot) => slot.round));
  const picksByOverall = new Map(data.picks.map((pick) => [pick.overall, pick]));
  const slotsByRoundAndTeam = new Map(data.draftSlots.map((slot) => [
    `${slot.round}:${slot.team.id}`,
    slot
  ]));
  const currentOverall = data.upcoming[0]?.overall;
  const currentTeamId = data.upcoming[0]?.team.id;
  const grid = document.createElement('div');
  grid.className = 'draft-grid';
  grid.style.setProperty('--team-count', teams.length);

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  corner.textContent = 'RD';
  grid.append(corner);

  for (const team of teams) {
    const heading = document.createElement('div');
    heading.className = 'team-heading';
    heading.classList.toggle('active', team.id === currentTeamId && data.status === 'in_progress');
    const mark = document.createElement('span');
    mark.textContent = initials(team.name);
    const name = document.createElement('strong');
    name.textContent = team.name;
    heading.append(mark, name);
    grid.append(heading);
  }

  for (let round = 1; round <= rounds; round += 1) {
    const roundLabel = document.createElement('div');
    roundLabel.className = 'round-label';
    roundLabel.textContent = `R${round}`;
    grid.append(roundLabel);

    for (const team of teams) {
      const slot = slotsByRoundAndTeam.get(`${round}:${team.id}`);
      const cell = document.createElement('article');
      cell.className = 'draft-cell';
      if (!slot) {
        cell.classList.add('unavailable');
        grid.append(cell);
        continue;
      }

      const pick = picksByOverall.get(slot.overall);
      const pickNumber = document.createElement('span');
      pickNumber.className = 'cell-pick-number';
      pickNumber.textContent = `${slot.round}.${slot.roundPick}`;
      cell.append(pickNumber);

      if (pick) {
        cell.classList.add('selected');
        cell.dataset.position = pick.player.position;
        cell.append(playerDetails(pick));
      } else if (slot.overall === currentOverall && data.status === 'in_progress') {
        cell.classList.add('on-clock-cell');
        const label = document.createElement('strong');
        label.textContent = 'ON THE CLOCK';
        cell.append(label);
      }
      grid.append(cell);
    }
  }

  board.append(grid);
  const currentCell = board.querySelector('.on-clock-cell');
  if (currentCell) {
    const left = currentCell.offsetLeft - board.clientWidth / 2 + currentCell.clientWidth / 2;
    board.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }
}

function tick() {
  const clock = state.snapshot?.clock;
  if (!clock?.expiresAt || state.snapshot.status !== 'in_progress') return;
  const serverNow = Date.now() + state.timerOffset;
  const remaining = Math.max(0, Math.ceil((new Date(clock.expiresAt).getTime() - serverNow) / 1000));
  $('timer').textContent = formatClock(remaining);
  $('timer').classList.toggle('urgent', remaining <= 10);
}

function applySnapshot(data) {
  const previous = state.snapshot;
  const current = data.upcoming[0];
  const previousTeamId = previous?.upcoming[0]?.team.id;
  if (
    previous
    && current
    && data.status === 'in_progress'
    && (previous.status !== 'in_progress' || current.team.id !== previousTeamId)
  ) {
    dingForNewTurn();
  }

  state.snapshot = data;
  state.timerOffset = new Date(data.updatedAt).getTime() - Date.now();
  renderStatus(data);
  const pickSignature = data.picks
    .map((pick) => `${pick.overall}:${pick.team.id}:${pick.player.id}`)
    .join('|');
  if (pickSignature !== state.renderedPicks) {
    renderBoard(data);
    state.renderedPicks = pickSignature;
  }
  tick();
  $('last-updated').textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString()}`;
  $('connection-label').textContent = 'Live';
  $('connection-dot').className = 'live';
  $('error').hidden = true;
}

const updates = new EventSource('/api/events');
updates.addEventListener('draft', (event) => {
  try {
    applySnapshot(JSON.parse(event.data));
  } catch {
    $('error').textContent = 'Received an invalid update from the server.';
    $('error').hidden = false;
  }
});
updates.onerror = () => {
  $('connection-label').textContent = 'Reconnecting';
  $('connection-dot').className = 'offline';
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
setInterval(tick, 250);
