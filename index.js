require("dotenv").config();

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  PermissionFlagsBits
} = require("discord.js");

const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PORT = Number(process.env.PORT || 3000);

const PEBBLEHOST_API_KEY = process.env.PEBBLEHOST_API_KEY || "";
const PEBBLE_PANEL_URL = (process.env.PEBBLE_PANEL_URL || "https://panel.pebblehost.com").replace(/\/$/, "");
const PEBBLE_SERVER_ID = process.env.PEBBLE_SERVER_ID || "";
const LOG_FILE = process.env.LOG_FILE || "/logs/latest.log";
const LOG_POLL_MS = Number(process.env.LOG_POLL_MS || 5000);

let lastLength = 0;
let seenIds = new Set();

function cleanMinecraftText(text) {
  return String(text || "")
    .replace(/§./g, "")
    .replace(/@everyone/g, "@ everyone")
    .replace(/@here/g, "@ here")
    .slice(0, 1800);
}

function escapeTellraw(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ");
}

function channelKey(type) {
  const map = {
    chat: "chat",
    auction: "auctionHouse",
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

async function fetchChannel(key) {
  const id = config.channels[key];
  if (!id) return null;
  return await client.channels.fetch(id).catch(() => null);
}

async function sendMinecraftCommand(command) {
  if (!PEBBLEHOST_API_KEY || !PEBBLE_SERVER_ID) {
    console.log("[Bridge] Cannot send command: missing Pebble API key/server ID.");
    return false;
  }

  const url = `${PEBBLE_PANEL_URL}/api/client/servers/${encodeURIComponent(PEBBLE_SERVER_ID)}/command`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PEBBLEHOST_API_KEY}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ command })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`[Bridge] Command failed ${res.status}: ${body.slice(0, 300)}`);
    return false;
  }

  return true;
}

async function sendDiscordChat(event) {
  const channel = await fetchChannel("chat");
  if (!channel) {
    console.log(`[Bridge] Could not fetch chat channel ${config.channels.chat}`);
    return;
  }

  const format = config.chat?.minecraftToDiscordFormat || "💬 **{player}** » {message}";
  const content = format
    .replaceAll("{player}", cleanMinecraftText(event.player || "Unknown"))
    .replaceAll("{message}", cleanMinecraftText(event.message || ""));

  await channel.send({ content });
}

async function sendEmbed(type, embed) {
  const key = channelKey(type);
  const channel = await fetchChannel(key);

  if (!channel) {
    console.log(`[Bridge] Could not fetch Discord channel ${config.channels[key]} for key=${key}`);
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
      .setDescription(`**${event.player || "Unknown"}** listed an item.`)
      .addFields(
        { name: "Item", value: String(event.item || "Unknown"), inline: true },
        { name: "Price", value: `$${String(event.price || "0")}`, inline: true },
        { name: "Enchants", value: String(event.enchants || "None"), inline: false }
      )
      .setTimestamp();
  }

  if (type === "prestige") {
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle("🏆 Prestige")
      .setDescription(`**${event.player || "Unknown"}** reached Prestige ${event.prestige || "?"}`)
      .setTimestamp();
  }

  if (type === "rankup") {
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle("📈 Rankup")
      .setDescription(`**${event.player || "Unknown"}** ranked up to **${event.rank || "Unknown"}**.`)
      .setTimestamp();
  }

  if (type === "vote") {
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle("🗳️ Vote / Crate Reward")
      .setDescription(String(event.reward || "Vote reward"))
      .setTimestamp();
  }

  if (type === "staff") {
    const embed = new EmbedBuilder()
      .setColor(0xFF3131)
      .setTitle(event.title || "🛡️ Staff Log")
      .setDescription(String(event.message || "Staff action"))
      .setTimestamp();

    if (event.staff) embed.addFields({ name: "Staff", value: String(event.staff), inline: true });
    if (event.target) embed.addFields({ name: "Target", value: String(event.target), inline: true });
    if (event.action) embed.addFields({ name: "Action", value: String(event.action), inline: true });
    if (event.oldBalance || event.newBalance) {
      embed.addFields(
        { name: "Old Balance", value: String(event.oldBalance || "Unknown"), inline: true },
        { name: "New Balance", value: String(event.newBalance || "Unknown"), inline: true }
      );
    }
    if (event.command) embed.addFields({ name: "Command", value: `\`${String(event.command).slice(0, 900)}\``, inline: false });
    if (event.details) embed.addFields({ name: "Details", value: String(event.details).slice(0, 1000), inline: false });

    return embed;
  }

  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(event.title || "🌌 Alcatraz")
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

async function handleEvent(event) {
  const id = event.id || `${event.type}|${event.player}|${event.message}|${event.time}`;
  if (seenIds.has(id)) return;
  seenIds.add(id);
  if (seenIds.size > 1500) seenIds = new Set([...seenIds].slice(-500));

  if (String(event.type).toLowerCase() === "chat") {
    await sendDiscordChat(event);
  } else {
    await sendEmbed(event.type || "event", makeEmbed(event));
  }

  console.log(`[Bridge] Posted event type=${event.type}`);
}

async function fetchLog() {
  const url = `${PEBBLE_PANEL_URL}/api/client/servers/${encodeURIComponent(PEBBLE_SERVER_ID)}/files/contents?file=${encodeURIComponent(LOG_FILE)}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${PEBBLEHOST_API_KEY}`,
      "Accept": "application/json"
    }
  });

  if (!res.ok) throw new Error(`Pebble API ${res.status}`);
  return await res.text();
}

async function pollLogs() {
  if (!PEBBLEHOST_API_KEY || !PEBBLE_SERVER_ID) {
    console.log("[Bridge] Pebble polling disabled. Missing API key or server ID.");
    return;
  }

  console.log("[Bridge] Pebble log polling enabled");

  setInterval(async () => {
    try {
      const log = await fetchLog();

      if (lastLength === 0) {
        lastLength = log.length;
        return;
      }

      let chunk = "";
      if (log.length < lastLength) chunk = log;
      else chunk = log.slice(lastLength);

      lastLength = log.length;

      for (const line of chunk.split(/\r?\n/)) {
        const event = parseLine(line);
        if (event) await handleEvent(event);
      }
    } catch (e) {
      console.log("[Bridge] Poll failed:", e.message);
    }
  }, LOG_POLL_MS);
}

async function handleDiscordToMinecraft(message) {
  if (message.author.bot) return;
  if (message.channelId !== config.channels.chat) return;

  const content = message.content.trim();
  if (!content) return;

  // Staff command bridge.
  // Example: !mc say Hello
  // Example: !mc command list
  if (content.startsWith("!mc ")) {
    const member = message.member;
    const allowed =
      member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
      member?.roles?.cache?.some(r => /founder|owner|manager|admin|moderator/i.test(r.name));

    if (!allowed) {
      await message.reply("You do not have permission to use Minecraft bridge commands.");
      return;
    }

    const raw = content.slice(4).trim();
    if (!raw) return;

    const command = raw.startsWith("command ") ? raw.slice("command ".length) : raw;
    const ok = await sendMinecraftCommand(command);
    await message.react(ok ? "✅" : "❌").catch(() => {});
    return;
  }

  // Normal Discord -> Minecraft chat
  const display = message.member?.displayName || message.author.username;
  const format = config.chat?.discordToMinecraftFormat || "§9[Discord] §f{user}§7: §f{message}";
  const mcText = format
    .replaceAll("{user}", display)
    .replaceAll("{message}", content);

  const tellraw = `tellraw @a {"rawtext":[{"text":"${escapeTellraw(mcText)}"}]}`;
  const ok = await sendMinecraftCommand(tellraw);

  if (!ok) console.log("[Bridge] Failed to send Discord chat to Minecraft.");
}

const app = express();
app.use(express.json({ limit: "250kb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Alcatraz Discord Bridge v3",
    discord: client.isReady() ? "ready" : "starting",
    pebblePolling: Boolean(PEBBLEHOST_API_KEY && PEBBLE_SERVER_ID),
    chatChannel: config.channels.chat
  });
});

client.on(Events.MessageCreate, handleDiscordToMinecraft);

client.once(Events.ClientReady, async () => {
  console.log(`Alcatraz bot online as ${client.user.tag}`);
  app.listen(PORT, () => console.log(`HTTP bridge listening on port ${PORT}`));
  await pollLogs();
});

client.login(process.env.DISCORD_TOKEN);
