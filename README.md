# ESPN Draft Board

A clean, read-only draft board for ESPN Fantasy Football. Put it on a TV or
projector so everyone can follow the draft without seeing anyone's rankings,
queue, or draft strategy.

The board shows:

- the team currently on the clock
- the next two teams in the draft order
- completed picks grouped by round
- draft progress, the latest selection, and roster position counts
- draft format, size, schedule, and pick length
- an estimated countdown for the current pick
- a ding when the turn passes to a different team
- fullscreen, density, text-size, and sound controls saved in the browser
- live connection age and ESPN refresh errors
- live updates without refreshing the page

## Quick start

The easiest way to run the board is with Docker Compose.

1. Copy the example configuration:

   ```sh
   cp .env.example .env
   ```

2. To connect a live league, add your ESPN league ID and season to `.env`.
   Private leagues also need the `SWID` and `espn_s2` cookies described below.
   Leave the league ID blank to use demo mode only.

3. Start the board:

   ```sh
   docker compose up --build
   ```

4. Open <http://localhost:3000>.

The board checks ESPN every two seconds and sends updates to connected browsers
as soon as it sees a change.

## Try it without an ESPN league

Demo mode runs a short, fictional snake draft and starts a new pick every five
seconds. It loops automatically, making it easy to test the board, timer, and
turn sound. With no `ESPN_LEAGUE_ID` configured, the app starts in demo mode:

```sh
docker compose up --build
```

Open <http://localhost:3000>, then click or press a key once to allow browser
audio. When a league is configured, use the **Demo / Live** toggle in the
top-right corner to switch data sources.

## ESPN setup

### Find your league ID

Open your league on the ESPN Fantasy website. The number after `leagueId=` in
the URL is your `ESPN_LEAGUE_ID`.

For example, this URL has the league ID `123456789`:

```text
https://fantasy.espn.com/football/league?leagueId=123456789
```

### Connect to a private league

ESPN does not provide API keys for fantasy leagues, so private leagues require
cookies from an existing ESPN session:

1. Sign in at <https://fantasy.espn.com/>.
2. Open your browser's developer tools.
3. In Chrome or Edge, go to **Application → Storage → Cookies**. In Firefox,
   go to **Storage → Cookies**.
4. Select `https://fantasy.espn.com` and copy the values of `SWID` and
   `espn_s2` into your `.env` file.

Keep the braces around the `SWID` value. These cookies provide access to your
ESPN account, so treat them like passwords: never commit them, share them, or
expose the `.env` file publicly.

Some public leagues work without cookies, but ESPN may still require an
authenticated session to read them.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DEMO_PICK_SECONDS` | No | `5` | Seconds between picks in demo mode |
| `ESPN_LEAGUE_ID` | Live mode | — | Numeric ESPN league ID |
| `ESPN_SEASON` | No | Current year | Fantasy season |
| `ESPN_SWID` | Private leagues | — | ESPN `SWID` session cookie |
| `ESPN_S2` | Private leagues | — | ESPN `espn_s2` session cookie |
| `PORT` | No | `3000` | HTTP port |
| `ESPN_POLL_INTERVAL_MS` | No | `2000` | Minimum time between ESPN requests |
| `ESPN_REQUEST_TIMEOUT_MS` | No | `10000` | ESPN request timeout |

## A couple of details

**The clock is an estimate.** ESPN's league response does not include the live
draft-room clock. The board starts a fresh timer when it first sees the draft
begin or a new pick appear. If that estimate expires before ESPN reports a
selection, the board shows `DELAYED` instead of implying that ESPN's clock is
still running. When ESPN reports that an active draft has paused, the estimate
freezes until the draft resumes.

**Browsers block sound until the page is used.** Click or press a key on the
board once after opening it. After that, the board will ding whenever a
different team goes on the clock. A team with consecutive picks at the turn of
a snake draft only dings once.

**This uses an unofficial ESPN API.** ESPN does not publish or support the
Fantasy API used by this project, and it may change without notice.

## Run without Docker

Node.js 22 or newer is required. Set the environment variables in your shell,
then start the server:

```sh
ESPN_LEAGUE_ID=123456789 ESPN_SEASON=2026 npm start
```

For a private league, set `ESPN_SWID` and `ESPN_S2` in the same environment.

## Development

Run the syntax checks and test suite with:

```sh
npm run check
npm test
```

The Node.js server is the only part of the application that contacts ESPN. It
sends a smaller, sanitized snapshot to browsers over server-sent events, so
ESPN cookies and raw league data are not included in client responses.
