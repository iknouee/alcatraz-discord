require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require("discord.js");

const CONFIG_PATH = path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("Missing config.json.");
  process.exit(1);
}

const config = require(CONFIG_PATH);

const TOKEN = process.env.DISCORD_TOKEN;
const SECRET = process.env.BRIDGE_SECRET || "change-me";
const PORT = Number(process.env.PORT || 3000);

const PEBBLEHOST_API_KEY = process.env.PEBBLEHOST_API_KEY || "";
const PEBBLE_PANEL_URL = (process.env.PEBBLE_PANEL_URL || "https://panel.pebblehost.com").replace(/\/$/, "");
const PEBBLE_SERVER_ID = process.env.PEBBLE_SERVER_ID || "";
const LOG_FILE = process.env.LOG_FILE || "/logs/latest.log";
const LOG_POLL_MS = Number(process.env.LOG_POLL_MS || 5000);

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in Render Environment variables.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let lastLogLength = 0;
let seenEventIds = new Set();

function compactSeenIds() {
  if (seenEventIds.size > 1000) {
    seenEventIds = new Set([...seenEventIds].slice(-300));
  }
}

function channelKeyForType(type) {
  const map = {
    auction: "auctionHouse",
    ah: "auctionHouse",
    prestige: "prestige",
    vote: "voteRewards",
    event: "events",
    update: "updates",
    staff: "staffLogs",
    rankup: "prestige",
    trade: "staffLogs"
  };
  return map[String(type || "event").toLowerCase()] || "events";
}

async function sendToDiscord(type, embed) {
  const key = channelKeyForType(type);
  const channelId = config.channels[key];

  if (!channelId || String(channelId).startsWith("PUT_")) {
    console.warn(`[Bridge] Missing Discord channel for type=${type}, key=${key}`);
    return false;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`[Bridge] Could not fetch Discord channel ${channelId} for key=${key}`);
    return false;
  }

  await channel.send({ embeds: [embed] });
  return true;
}

function buildEmbed(event) {
  const type = String(event.type || "event").toLowerCase();
  const player = event.player || "Unknown";
  const color = event.color || config.embedColor || 0xC800FF;

  if (type === "auction" || type === "ah") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("💸 New Auction Listing")
      .setDescription(`**${player}** listed an item on the Auction House.`)
      .addFields(
        { name: "Item", value: String(event.item || "Unknown Item"), inline: true },
        { name: "Price", value: `$${String(event.price || "0")}`, inline: true },
        { name: "Expires", value: String(event.expires || "24h"), inline: true }
      )
      .setFooter({ text: `${config.serverName} • Use !ah in-game` })
      .setTimestamp();
  }

  if (type === "prestige") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("🏆 Prestige Reached")
      .setDescription(`**${player}** has reached **Prestige ${event.prestige || "?"}**!`)
      .setFooter({ text: `${config.serverName} • Grind to Prestige 50` })
      .setTimestamp();
  }

  if (type === "rankup") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("📈 Rankup")
      .setDescription(`**${player}** ranked up!`)
      .addFields({ name: "New Rank", value: String(event.rank || "Unknown"), inline: true })
      .setFooter({ text: `${config.serverName}` })
      .setTimestamp();
  }

  if (type === "vote") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("🗳️ Vote Reward")
      .setDescription(`**${player}** voted and received rewards!`)
      .addFields(
        { name: "Reward", value: String(event.reward || "Vote Key"), inline: true },
        { name: "Streak", value: String(event.streak || "1"), inline: true }
      )
      .setFooter({ text: `${config.serverName} • Vote daily for rewards` })
      .setTimestamp();
  }

  if (type === "trade") {
    return new EmbedBuilder()
      .setColor(0xFFB300)
      .setTitle("💱 Trade Log")
      .setDescription(String(event.message || "A trade event occurred."))
      .setFooter({ text: `${config.serverName} • Staff Log` })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(String(event.title || "🌌 Alcatraz SkyGen"))
    .setDescription(String(event.message || "Server event."))
    .setFooter({ text: `${config.serverName} • ${config.ip}` })
    .setTimestamp();
}

function parseSkyGenEventFromLine(line) {
  const marker = "[SKYGEN_DISCORD]";
  const idx = line.indexOf(marker);
  if (idx === -1) return null;

  const jsonText = line.slice(idx + marker.length).trim();
  if (!jsonText.startsWith("{")) return null;

  try {
    const event = JSON.parse(jsonText);
    event._raw = line;
    return event;
  } catch (error) {
    console.warn("[Bridge] Failed to parse SKYGEN_DISCORD JSON:", jsonText);
    return null;
  }
}

async function handleSkyGenEvent(event) {
  const id = event.id || `${event.type}|${event.player}|${event.item || event.rank || event.prestige || ""}|${event.price || ""}|${event.time || ""}`;
  if (seenEventIds.has(id)) return;

  seenEventIds.add(id);
  compactSeenIds();

  const embed = buildEmbed(event);
  await sendToDiscord(event.type, embed);
  console.log(`[Bridge] Posted event type=${event.type || "event"} player=${event.player || "unknown"}`);
}

async function fetchPebbleLog() {
  if (!PEBBLEHOST_API_KEY || !PEBBLE_SERVER_ID) return null;

  const url = `${PEBBLE_PANEL_URL}/api/client/servers/${encodeURIComponent(PEBBLE_SERVER_ID)}/files/contents?file=${encodeURIComponent(LOG_FILE)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${PEBBLEHOST_API_KEY}`,
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pebble API ${res.status}: ${text.slice(0, 300)}`);
  }

  return await res.text();
}

async function pollPebbleLogs() {
  if (!PEBBLEHOST_API_KEY || !PEBBLE_SERVER_ID) {
    console.warn("[Bridge] Pebble polling disabled. Missing PEBBLEHOST_API_KEY or PEBBLE_SERVER_ID.");
    return;
  }

  console.log(`[Bridge] Pebble log polling enabled. Server=${PEBBLE_SERVER_ID}, file=${LOG_FILE}, every=${LOG_POLL_MS}ms`);

  setInterval(async () => {
    try {
      const log = await fetchPebbleLog();
      if (typeof log !== "string") return;

      let chunk = "";
      if (lastLogLength === 0) {
        lastLogLength = log.length;
        return;
      }

      if (log.length < lastLogLength) {
        chunk = log;
      } else {
        chunk = log.slice(lastLogLength);
      }

      lastLogLength = log.length;
      if (!chunk) return;

      for (const line of chunk.split(/\r?\n/)) {
        const event = parseSkyGenEventFromLine(line);
        if (event) await handleSkyGenEvent(event);
      }
    } catch (error) {
      console.warn("[Bridge] Log poll failed:", error.message);
    }
  }, LOG_POLL_MS);
}

const app = express();
app.use(express.json({ limit: "250kb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Alcatraz Discord Bridge v2",
    discord: client.isReady() ? "ready" : "starting",
    pebblePolling: Boolean(PEBBLEHOST_API_KEY && PEBBLE_SERVER_ID),
    logFile: LOG_FILE
  });
});

app.post("/skygen/event", async (req, res) => {
  try {
    const auth = req.headers["x-skygen-secret"];
    if (auth !== SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    await handleSkyGenEvent(req.body || {});
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed HTTP SkyGen event:", error);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`Alcatraz bot online as ${client.user.tag}`);
  app.listen(PORT, () => console.log(`HTTP bridge listening on port ${PORT}`));
  await pollPebbleLogs();
});

client.login(TOKEN);
