// SkyGen Discord Bridge Snippet
// This is for the Minecraft addon side, once @minecraft/server-net is enabled/available.

import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";

const DISCORD_BRIDGE_URL = "http://YOUR_BOT_HOST:3000/skygen/event";
const BRIDGE_SECRET = "change_this_to_match_.env";

export async function sendDiscordEvent(payload) {
  try {
    const req = new HttpRequest(DISCORD_BRIDGE_URL);
    req.method = HttpRequestMethod.Post;
    req.headers = [
      new HttpHeader("Content-Type", "application/json"),
      new HttpHeader("x-skygen-secret", BRIDGE_SECRET)
    ];
    req.body = JSON.stringify(payload);

    await http.request(req);
  } catch (e) {
    console.warn(`[SkyGen] Discord bridge failed: ${e}`);
  }
}

// Examples:
// sendDiscordEvent({ type: "auction", player: "Fovra", item: "Diamond Sword", price: "50m" });
// sendDiscordEvent({ type: "prestige", player: "Fovra", prestige: 12 });
// sendDiscordEvent({ type: "vote", player: "Fovra", reward: "2 Vote Keys", streak: 5 });
