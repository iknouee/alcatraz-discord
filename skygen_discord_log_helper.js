// SkyGen Discord Log Bridge Helper
// Use this in the Minecraft addon instead of @minecraft/server-net.

export function discordLogEvent(payload) {
  try {
    payload.time = Date.now();
    payload.id = `${payload.type || "event"}-${payload.player || "unknown"}-${payload.time}`;
    console.warn(`[SKYGEN_DISCORD] ${JSON.stringify(payload)}`);
  } catch (e) {
    console.warn(`[SkyGen] Failed to write Discord log event: ${e}`);
  }
}
