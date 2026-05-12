require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require("discord.js");

const config = require("./config.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const PORT = Number(process.env.PORT || 3000);

const PEBBLEHOST_API_KEY = process.env.PEBBLEHOST_API_KEY || "";
const PEBBLE_PANEL_URL = (process.env.PEBBLE_PANEL_URL || "https://panel.pebblehost.com").replace(/\/$/, "");
const PEBBLE_SERVER_ID = process.env.PEBBLE_SERVER_ID || "";
const LOG_FILE = process.env.LOG_FILE || "/logs/latest.log";
const LOG_POLL_MS = Number(process.env.LOG_POLL_MS || 5000);

let lastLength = 0;

function channelKey(type) {
  const map = {
    auction: "auctionHouse",
    prestige: "prestige",
    vote: "voteRewards",
    event: "events",
    update: "updates",
    staff: "staffLogs",
    rankup: "prestige",
    trade: "staffLogs"
  };
  return map[type] || "events";
}

async function sendEmbed(type, embed) {
  const key = channelKey(type);
  const id = config.channels[key];
  const channel = await client.channels.fetch(id).catch(() => null);

  if (!channel) {
    console.log(`[Bridge] Could not fetch Discord channel ${id} for key=${key}`);
    return;
  }

  await channel.send({ embeds: [embed] });
}

function makeEmbed(event) {
  const type = String(event.type || "event").toLowerCase();

  if (type === "auction") {
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle("💸 New Auction Listing")
      .setDescription(`**${event.player}** listed an item.`)
      .addFields(
        { name: "Item", value: String(event.item || "Unknown"), inline: true },
        { name: "Price", value: `$${String(event.price || "0")}`, inline: true }
      )
      .setTimestamp();
  }

  if (type === "prestige") {
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle("🏆 Prestige")
      .setDescription(`**${event.player}** reached Prestige ${event.prestige}`)
      .setTimestamp();
  }

  if (type === "vote") {
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle("🗳️ Vote Reward")
      .setDescription(String(event.reward || "Vote reward"))
      .setTimestamp();
  }

  if (type === "staff") {
    return new EmbedBuilder()
      .setColor(0xFF3131)
      .setTitle("🛡️ Staff Log")
      .setDescription(String(event.message || "Staff action"))
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle("🌌 Alcatraz")
    .setDescription(String(event.message || "Event"))
    .setTimestamp();
}

function parseLine(line) {
  const marker = "[SKYGEN_DISCORD]";
  const idx = line.indexOf(marker);
  if (idx === -1) return null;

  try {
    return JSON.parse(line.slice(idx + marker.length).trim());
  } catch {
    return null;
  }
}

async function fetchLog() {
  const url = `${PEBBLE_PANEL_URL}/api/client/servers/${PEBBLE_SERVER_ID}/files/contents?file=${encodeURIComponent(LOG_FILE)}`;

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${PEBBLEHOST_API_KEY}`,
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Pebble API ${res.status}`);
  }

  return await res.text();
}

async function pollLogs() {
  console.log("[Bridge] Pebble log polling enabled");

  setInterval(async () => {
    try {
      const log = await fetchLog();

      if (lastLength === 0) {
        lastLength = log.length;
        return;
      }

      const chunk = log.slice(lastLength);
      lastLength = log.length;

      for (const line of chunk.split(/\r?\n/)) {
        const event = parseLine(line);
        if (!event) continue;

        const embed = makeEmbed(event);
        await sendEmbed(event.type || "event", embed);

        console.log(`[Bridge] Posted event type=${event.type}`);
      }
    } catch (e) {
      console.log("[Bridge] Poll failed:", e.message);
    }
  }, LOG_POLL_MS);
}

const app = express();

app.get("/", (req, res) => {
  res.json({
    ok: true,
    discord: client.isReady() ? "ready" : "starting",
    pebblePolling: true
  });
});

client.once(Events.ClientReady, async () => {
  console.log(`Alcatraz bot online as ${client.user.tag}`);

  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on port ${PORT}`);
  });

  await pollLogs();
});

client.login(process.env.DISCORD_TOKEN);