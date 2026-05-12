# Alcatraz Discord Bot

This bot is for Alcatraz SkyGen Discord integration.

It receives server events from the Minecraft addon and posts clean embeds to Discord channels.

## Current Supported Events

- Auction House listings
- Prestiges
- Vote rewards
- Rankups
- Trade logs
- General events/updates

## Setup

### 1. Create a Discord bot
Go to Discord Developer Portal, create an application, add a bot, and copy the bot token.

### 2. Invite the bot
Give it permission to:
- Send Messages
- Embed Links
- View Channels

### 3. Install files
Upload this folder to a Node.js server or VPS.

Run:

```bash
npm install
```

### 4. Create `.env`

Copy `.env.example` to `.env` and fill:

```env
DISCORD_TOKEN=your_bot_token
PORT=3000
BRIDGE_SECRET=make_this_long_and_private
```

### 5. Create `config.json`

Copy `config.example.json` to `config.json`.

Fill your Discord channel IDs:

```json
{
  "guildId": "1448457695949750445",
  "channels": {
    "auctionHouse": "channel_id_here",
    "prestige": "channel_id_here",
    "voteRewards": "channel_id_here",
    "events": "channel_id_here",
    "updates": "channel_id_here",
    "staffLogs": "channel_id_here"
  }
}
```

### 6. Start bot

```bash
npm start
```

## Test the bridge

Use Postman, curl, or your browser tool:

```bash
curl -X POST http://localhost:3000/skygen/event \
  -H "Content-Type: application/json" \
  -H "x-skygen-secret: change_this_to_a_long_random_secret" \
  -d '{"type":"auction","player":"Fovra","item":"Diamond Sword","price":"50m"}'
```

## Minecraft Addon Integration

For the upcoming SkyGen stage, the addon should send POST requests to:

```txt
http://YOUR_BOT_IP:3000/skygen/event
```

with header:

```txt
x-skygen-secret: YOUR_SECRET
```

Example payload:

```json
{
  "type": "prestige",
  "player": "Fovra",
  "prestige": 12
}
```

## Important

Do not share:
- your bot token
- your bridge secret

Discord webhooks can post messages without a bot, but this bot bridge is better because it can later support slash commands, verification, tickets, rank sync, and staff logs.
