const state = { snapshot: null, timerOffset: 0, renderedPicks: '' };
const $ = (id) => document.getElementById(id);

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

function pickCard(pick) {
  const card = document.createElement('article');
  card.className = 'pick-card';
  const number = document.createElement('span');
  number.className = 'pick-number';
  number.textContent = `${pick.round}.${String(pick.roundPick).padStart(2, '0')}`;
  const details = document.createElement('div');
  const player = document.createElement('strong');
  player.textContent = pick.player.name;
  const meta = document.createElement('small');
  meta.textContent = `${pick.player.position} · ${pick.player.proTeam} · ${pick.team.abbreviation}`;
  details.append(player, meta);
  card.append(number, details);
  return card;
}

function renderBoard(data) {
  const board = $('board');
  board.replaceChildren();
  if (data.picks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No picks yet. This board will update automatically when the draft begins.';
    board.append(empty);
    return;
  }

  const rounds = data.picks.reduce((grouped, pick) => {
    const round = grouped.get(pick.round) ?? [];
    round.push(pick);
    grouped.set(pick.round, round);
    return grouped;
  }, new Map());
  for (const [round, picks] of rounds) {
    const column = document.createElement('section');
    column.className = 'round';
    const heading = document.createElement('h3');
    heading.textContent = `Round ${round}`;
    column.append(heading, ...picks.map(pickCard));
    board.append(column);
  }
  board.scrollLeft = board.scrollWidth;
}

function tick() {
  const clock = state.snapshot?.clock;
  if (!clock?.expiresAt || state.snapshot.status !== 'in_progress') return;
  const serverNow = Date.now() + state.timerOffset;
  const remaining = Math.max(0, Math.ceil((new Date(clock.expiresAt).getTime() - serverNow) / 1000));
  $('timer').textContent = formatClock(remaining);
  $('timer').classList.toggle('urgent', remaining <= 10);
}

async function refresh() {
  try {
    const response = await fetch('/api/draft', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
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
  } catch (error) {
    $('connection-label').textContent = 'Reconnecting';
    $('connection-dot').className = 'offline';
    $('error').textContent = error.message;
    $('error').hidden = false;
  }
}

refresh();
setInterval(refresh, 2000);
setInterval(tick, 250);
