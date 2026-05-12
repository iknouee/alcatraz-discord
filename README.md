# Alcatraz Discord Bridge v3

Adds bidirectional chat.

## New Feature

Discord channel `1503638480868347924` is used for chat bridge.

Minecraft chat -> Discord:
- SkyGen addon writes `[SKYGEN_DISCORD]` chat logs.
- Render bridge reads logs and posts to Discord.

Discord -> Minecraft:
- Bot sends `tellraw` commands through PebbleHost API.

## Required Discord Bot Setting

In Discord Developer Portal, enable:

- MESSAGE CONTENT INTENT

Then redeploy Render.

## Render Environment Variables

Keep:

- DISCORD_TOKEN
- BRIDGE_SECRET
- PORT
- PEBBLEHOST_API_KEY
- PEBBLE_PANEL_URL
- PEBBLE_SERVER_ID
- LOG_FILE
- LOG_POLL_MS

## Staff Command Bridge

In the chat channel:

```txt
!mc say hello
!mc command list
```

Only Discord users with Admin/Manage Server or staff-like roles can use this.
