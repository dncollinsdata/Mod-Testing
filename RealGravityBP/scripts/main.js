// main.js
// Entry point: loads settings, registers event listeners, starts the engine.

import { world, system } from "@minecraft/server";
import { Settings, Regions } from "./settings.js";
import { startEngine, enqueueAround, scanArea, runCollapseTest } from "./gravityEngine.js";
import { handleChat } from "./commands.js";

function init() {
  Settings.load();
  startEngine();
}

// World load fires once the world is ready. Fall back across API versions.
if (world.afterEvents.worldLoad) {
  world.afterEvents.worldLoad.subscribe(init);
} else if (world.afterEvents.worldInitialize) {
  world.afterEvents.worldInitialize.subscribe(init);
} else {
  system.run(init);
}

// Mining a block may leave its neighbours unsupported.
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  enqueueAround(ev.dimension, ev.block.location);
});

// Placing a block may stabilise neighbours or be unstable itself.
world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  enqueueAround(ev.block.dimension, ev.block.location);
});

// Chat-trigger commands ("!gravity ..."). Cancel so the text isn't broadcast.
world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = ev.message;
  if (!msg.trim().toLowerCase().startsWith("!gravity")) return;
  ev.cancel = true;
  const player = ev.sender;
  system.run(() => handleChat(player, msg));
});

// --- Custom item handling ---

const useCooldown = new Map(); // playerId -> tick of last use
const wrenchCorners = new Map(); // playerId -> { dimensionId, x, y, z }

function onCooldown(player) {
  const now = system.currentTick;
  const last = useCooldown.get(player.id) ?? -999;
  if (now - last < 5) return true;
  useCooldown.set(player.id, now);
  return false;
}

function useScanner(player) {
  scanArea(player, Settings.checkDistance);
}

function useTester(player) {
  runCollapseTest(player, 8);
}

function useWrench(player, block) {
  if (!block) {
    player.sendMessage("§7Aim at a block corner to use the Gravity Wrench.");
    return;
  }
  const dimId = player.dimension.id;
  const loc = block.location;

  // Sneak + use toggles gravity in the region containing this block.
  if (player.isSneaking) {
    const state = Regions.toggleAt(dimId, loc);
    if (state === null) player.sendMessage("§7No gravity region here.");
    else player.sendMessage(state ? "§aGravity ON in this region." : "§cGravity OFF in this region.");
    return;
  }

  const pending = wrenchCorners.get(player.id);
  if (!pending || pending.dimensionId !== dimId) {
    wrenchCorners.set(player.id, { dimensionId: dimId, x: loc.x, y: loc.y, z: loc.z });
    player.sendMessage(`§eCorner 1 set at §f${loc.x}, ${loc.y}, ${loc.z}§e. Use again for corner 2.`);
  } else {
    Regions.add({
      dimensionId: dimId,
      x1: pending.x, y1: pending.y, z1: pending.z,
      x2: loc.x, y2: loc.y, z2: loc.z,
      enabled: false, // gravity off (protected) by default
    });
    wrenchCorners.delete(player.id);
    player.sendMessage("§aRegion created — gravity is §cOFF§a inside. Sneak + use to toggle.");
  }
}

function dispatchItem(player, typeId, block) {
  switch (typeId) {
    case "rgb:gravity_scanner": useScanner(player); return true;
    case "rgb:collapse_tester": useTester(player); return true;
    case "rgb:gravity_wrench": useWrench(player, block); return true;
    default: return false;
  }
}

// Used in the air or on entities.
world.afterEvents.itemUse.subscribe((ev) => {
  const player = ev.source;
  const typeId = ev.itemStack?.typeId;
  if (!typeId || !typeId.startsWith("rgb:")) return;
  if (onCooldown(player)) return;
  dispatchItem(player, typeId, undefined);
});

// Used while aiming at a block (gives us the targeted block, needed for the wrench).
world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  const player = ev.player;
  const typeId = ev.itemStack?.typeId;
  if (!typeId || !typeId.startsWith("rgb:")) return;
  if (onCooldown(player)) return;
  dispatchItem(player, typeId, ev.block);
});
