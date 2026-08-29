# ESPN Draft Board

A read-only, spectator-friendly fantasy football draft board. It displays completed picks, the team on the clock, the next two teams, and a live countdown without exposing personal rankings or draft strategy.

The Node.js backend is the only component that contacts ESPN. Browsers call the backend's sanitized `/api/draft` endpoint, so ESPN cookies and raw league data never reach public viewers.

> ESPN does not offer a supported public Fantasy API or API keys. This app uses ESPN's private web API with your existing ESPN session cookies. ESPN may change that API without notice.

## Run with Docker

1. Copy the example configuration:

   ```sh
   cp .env.example .env
   ```

2. Set `ESPN_LEAGUE_ID` and `ESPN_SEASON` in `.env`.
3. For a private league, also set `ESPN_SWID` and `ESPN_S2` as described below.
4. Start the board:

   ```sh
   docker compose up --build
   ```

5. Open <http://localhost:3000>. The page refreshes from ESPN every two seconds.

The credentials stay on the server and are never included in the browser API response. Do not expose the `.env` file, commit it, or put its values in a Docker image.

## ESPN configuration

### League ID

Open your league on ESPN. The number after `leagueId=` in the URL is the value for `ESPN_LEAGUE_ID`.

### Private league credentials

There is no API key to request. Sign in to ESPN in a desktop browser, then retrieve the two session cookies:

1. Open <https://fantasy.espn.com/> and sign in.
2. Open browser developer tools.
3. In Chrome or Edge, select **Application → Storage → Cookies → https://fantasy.espn.com**. In Firefox, select **Storage → Cookies**.
4. Copy the values of `SWID` and `espn_s2` into `ESPN_SWID` and `ESPN_S2`.

`SWID` normally includes braces; keep them. These cookies grant access to your ESPN account. Treat them like passwords, use them only as server-side secrets, and replace them if they expire.

Public leagues may work with both cookie variables left blank.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ESPN_LEAGUE_ID` | Yes | — | Numeric ESPN league ID |
| `ESPN_SEASON` | No | Current year | Fantasy season |
| `ESPN_SWID` | Private leagues | — | ESPN `SWID` session cookie |
| `ESPN_S2` | Private leagues | — | ESPN `espn_s2` session cookie |
| `PORT` | No | `3000` | HTTP port |
| `ESPN_POLL_INTERVAL_MS` | No | `2000` | Minimum interval between ESPN requests |
| `ESPN_REQUEST_TIMEOUT_MS` | No | `10000` | ESPN request timeout |

The countdown is synchronized to when this server first observes each pick because ESPN's league snapshot does not expose an authoritative live clock. It resets on every new selection and should be treated as an estimate.

## Run without Docker

Node.js 22 or newer is required.

```sh
ESPN_LEAGUE_ID=123456789 ESPN_SEASON=2026 npm start
```

Run checks with:

```sh
npm run check
npm test
```
