# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Single Node.js process: **Alcatraz Discord Bridge v3** — a bidirectional Minecraft <-> Discord chat/event bridge with a minimal Express HTTP status server. No database, no Docker, no build step.

### Run
- Start: `npm start` (= `node index.js`). There is no separate dev/watch script.
- Node >= 18 is required (the code uses global `fetch`); verified working on the preinstalled Node 22.
- HTTP status endpoint: `GET /` on `PORT` (default `3000`).

### Lint / test / build
- None are configured. `package.json` only defines the `start` script (no ESLint/Prettier, no test framework/test files, no build/transpile step).

### Important startup gotchas
- `index.js` calls `client.login(process.env.DISCORD_TOKEN)` at module load. **Without a valid `DISCORD_TOKEN` the process exits immediately with `TokenInvalid`** and the Express server never starts — the HTTP server and Minecraft log polling only start inside the `ClientReady` handler. A real bot token requires the bot to be in the guild/channels listed in `config.json` and to have the MESSAGE CONTENT INTENT enabled in the Discord Developer Portal.
- `PEBBLEHOST_API_KEY` + `PEBBLE_SERVER_ID` are optional. If absent, Minecraft log polling and `tellraw`/command sending are gracefully disabled (logs "Pebble polling disabled" / "missing Pebble API key/server ID"); the Discord bot and HTTP server still run.
- Config (guild id, channel ids, formats) lives in `config.json`. Env vars are read via `dotenv` (a local `.env` file works), or from the process environment / deploy (Render) env vars: `DISCORD_TOKEN` (required), `PORT`, `PEBBLEHOST_API_KEY`, `PEBBLE_PANEL_URL`, `PEBBLE_SERVER_ID`, `LOG_FILE`, `LOG_POLL_MS`.

### Testing without live credentials
To exercise the app without a real Discord token, you can boot the real `index.js` while stubbing only the `discord.js` `Client` (override `Module._load` to swap in a fake client whose `login()` emits `ClientReady`). This starts the real Express server and message handlers so you can hit `GET /` and emit `MessageCreate` events; the external Discord gateway is the only thing mocked.
