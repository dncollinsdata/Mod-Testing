// commands.js
// Chat-trigger command handler. Messages are intercepted in main.js.
//
// The game consumes real "/"-prefixed text as built-in commands before the
// scripting API can see it, so Real Gravity Blocks uses a "!gravity" chat
// prefix instead. Example: "!gravity mode chaos".

import { Settings } from "./settings.js";
import { scanArea, runCollapseTest, queueLength } from "./gravityEngine.js";

export const COMMAND_PREFIX = "!gravity";

const MODES = new Set(["light", "realistic", "chaos", "safe"]);

const HELP = [
  "§l§6Real Gravity Blocks§r §7— commands:",
  "§e!gravity on|off§7 — enable/disable gravity",
  "§e!gravity mode light|realistic|chaos|safe§7 — set mode",
  "§e!gravity scan§7 — highlight unstable blocks nearby",
  "§e!gravity test§7 — run a collapse test around you",
  "§e!gravity limit <n>§7 — max falling blocks per wave",
  "§e!gravity distance <n>§7 — scan/check distance",
  "§e!gravity interval <n>§7 — ticks between scans",
  "§e!gravity wave <n>§7 — blocks per collapse wave",
  "§e!gravity status§7 — show current settings",
];

// Returns true if the message was a gravity command (and was handled).
export function handleChat(player, message) {
  const text = message.trim();
  if (!text.toLowerCase().startsWith(COMMAND_PREFIX)) return false;

  const args = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] || "help").toLowerCase();

  switch (sub) {
    case "on":
      Settings.enabled = true;
      player.sendMessage("§aGravity enabled.");
      break;
    case "off":
      Settings.enabled = false;
      player.sendMessage("§cGravity disabled (everything stays floating).");
      break;
    case "mode": {
      const m = (args[1] || "").toLowerCase();
      if (!MODES.has(m)) {
        player.sendMessage("§cUsage: !gravity mode light|realistic|chaos|safe");
        return true;
      }
      Settings.mode = m;
      player.sendMessage(`§aGravity mode set to §e${m}§a.`);
      break;
    }
    case "scan":
      scanArea(player, Settings.checkDistance);
      break;
    case "test":
      runCollapseTest(player, 8);
      break;
    case "limit":
      Settings.maxFallingBlocks = args[1];
      player.sendMessage(`§aMax falling blocks per wave: §e${Settings.maxFallingBlocks}`);
      break;
    case "distance":
      Settings.checkDistance = args[1];
      player.sendMessage(`§aCheck/scan distance: §e${Settings.checkDistance}`);
      break;
    case "interval":
      Settings.checkInterval = args[1];
      player.sendMessage(`§aScan interval: §e${Settings.checkInterval}§a ticks §7(reload world to apply to the main loop)`);
      break;
    case "wave":
      Settings.waveSize = args[1];
      player.sendMessage(`§aWave size: §e${Settings.waveSize}`);
      break;
    case "status": {
      const s = Settings.snapshot();
      player.sendMessage(
        `§6Gravity §7| enabled: §e${s.enabled}§7 mode: §e${s.mode}§7 ` +
        `limit: §e${s.maxFallingBlocks}§7 dist: §e${s.checkDistance}§7 ` +
        `interval: §e${s.checkInterval}§7 wave: §e${s.waveSize}§7 queued: §e${queueLength()}`
      );
      break;
    }
    case "help":
    default:
      for (const line of HELP) player.sendMessage(line);
      break;
  }

  Settings.save();
  return true;
}
