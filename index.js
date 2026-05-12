require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events
} = require("discord.js");

const CONFIG_PATH = path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("Missing config.json. Copy config.example.json to config.json and fill channel IDs.");
  process.exit(1);
}

const config = require(CONFIG_PATH);
const TOKEN = process.env.DISCORD_TOKEN;
const SECRET = process.env.BRIDGE_SECRET;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}
if (!SECRET) {
  console.error("Missing BRIDGE_SECRET in .env");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function money(value) {
  if (value === undefined || value === null) return "0";
  return String(value);
}

function getChannelName(type) {
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

async function sendToChannel(type, embed) {
  const key = getChannelName(type);
  const channelId = config.channels[key];
  if (!channelId || channelId.startsWith("PUT_")) {
    console.warn(`No channel configured for type=${type} key=${key}`);
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`Could not fetch channel ${channelId} for ${key}`);
    return;
  }

  await channel.send({ embeds: [embed] });
}

function buildEmbed(event) {
  const type = String(event.type || "event").toLowerCase();
  const player = event.player || "Unknown";
  const color = event.color || config.embedColor || 0xC800FF;

  if (type === "auction") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("💸 New Auction Listing")
      .setDescription(`**${player}** listed an item on the Auction House.`)
      .addFields(
        { name: "Item", value: event.item || "Unknown Item", inline: true },
        { name: "Price", value: `$${money(event.price)}`, inline: true },
        { name: "Expires", value: event.expires || "24h", inline: true }
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

  if (type === "vote") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("🗳️ Vote Reward")
      .setDescription(`**${player}** voted and received rewards!`)
      .addFields(
        { name: "Reward", value: event.reward || "Vote Key", inline: true },
        { name: "Streak", value: String(event.streak || "1"), inline: true }
      )
      .setFooter({ text: `${config.serverName} • Vote daily for rewards` })
      .setTimestamp();
  }

  if (type === "rankup") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("📈 Rankup")
      .setDescription(`**${player}** ranked up!`)
      .addFields(
        { name: "New Rank", value: event.rank || "Unknown", inline: true }
      )
      .setFooter({ text: `${config.serverName}` })
      .setTimestamp();
  }

  if (type === "trade") {
    return new EmbedBuilder()
      .setColor(0xFFB300)
      .setTitle("💱 Trade Log")
      .setDescription(event.message || "A trade event occurred.")
      .setFooter({ text: `${config.serverName} • Staff Log` })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(event.title || "🌌 Alcatraz SkyGen")
    .setDescription(event.message || "Server event.")
    .setFooter({ text: `${config.serverName} • ${config.ip}` })
    .setTimestamp();
}

const app = express();
app.use(express.json({ limit: "250kb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Alcatraz Discord Bot",
    status: client.isReady() ? "ready" : "starting"
  });
});

app.post("/skygen/event", async (req, res) => {
  try {
    const auth = req.headers["x-skygen-secret"];
    if (auth !== SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const event = req.body || {};
    const embed = buildEmbed(event);
    await sendToChannel(String(event.type || "event").toLowerCase(), embed);

    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to process SkyGen event:", error);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

client.once(Events.ClientReady, () => {
  console.log(`Alcatraz bot online as ${client.user.tag}`);
  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on port ${PORT}`);
  });
});

client.login(TOKEN);
