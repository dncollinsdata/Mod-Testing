// gravityEngine.js
// The unstable-block queue, the falling logic, and the wave processor.

import { world, system, ItemStack } from "@minecraft/server";
import { Settings, Regions } from "./settings.js";
import { isBlockStable, isSolid, evaluateBlock } from "./supportCalc.js";
import { getEffectiveTier, BLOCK_TIER } from "./blockData.js";

const queue = [];
const queued = new Set();

function key(dimId, loc) {
  return `${dimId}:${loc.x},${loc.y},${loc.z}`;
}

function center(loc) {
  return { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 };
}

// Add a block position to the unstable-check queue (deduplicated).
export function enqueueBlock(dimension, loc) {
  const k = key(dimension.id, loc);
  if (queued.has(k)) return;
  queued.add(k);
  queue.push({ dimensionId: dimension.id, x: loc.x, y: loc.y, z: loc.z });
}

// Queue a changed position plus its six neighbors for rechecking.
export function enqueueAround(dimension, loc) {
  enqueueBlock(dimension, loc);
  enqueueBlock(dimension, { x: loc.x, y: loc.y + 1, z: loc.z });
  enqueueBlock(dimension, { x: loc.x, y: loc.y - 1, z: loc.z });
  enqueueBlock(dimension, { x: loc.x + 1, y: loc.y, z: loc.z });
  enqueueBlock(dimension, { x: loc.x - 1, y: loc.y, z: loc.z });
  enqueueBlock(dimension, { x: loc.x, y: loc.y, z: loc.z + 1 });
  enqueueBlock(dimension, { x: loc.x, y: loc.y, z: loc.z - 1 });
}

function impactSound(typeId) {
  const tier = BLOCK_TIER[typeId];
  return tier === "weak" ? "rgb.impact_soft" : "rgb.impact_stone";
}

// Drop a block downward to wherever it can rest. Plays warning + impact
// feedback and re-queues neighbours so the collapse propagates.
export function makeBlockFall(block) {
  const dimension = block.dimension;
  const typeId = block.typeId;
  const origin = { x: block.x, y: block.y, z: block.z };

  let minY = -64;
  try { minY = dimension.heightRange.min; } catch { /* default */ }

  // Find the resting position by scanning down through air/liquid.
  let restY = origin.y;
  let hitLava = false;
  while (restY - 1 > minY) {
    let below;
    try { below = dimension.getBlock({ x: origin.x, y: restY - 1, z: origin.z }); }
    catch { break; }
    if (!below) break;
    if (below.typeId === "minecraft:lava" || below.typeId === "minecraft:flowing_lava") {
      hitLava = true;
      break;
    }
    if (isSolid(below)) break;
    restY--;
  }

  // Warning feedback at the origin, then remove the block.
  try {
    dimension.spawnParticle("rgb:gravity_dust", center(origin));
    dimension.playSound("rgb.crack", center(origin));
    block.setType("minecraft:air");
  } catch {
    return; // chunk unloaded mid-process
  }

  const landing = { x: origin.x, y: restY, z: origin.z };

  if (hitLava || restY <= minY) {
    // Cannot rest: drop as an item like vanilla sand over lava / the void.
    if (!hitLava) {
      // fell into the void: nothing to drop
    } else {
      dropAsItem(dimension, typeId, center(landing));
    }
  } else {
    try {
      const target = dimension.getBlock(landing);
      if (target && (target.isAir || target.isLiquid)) {
        target.setType(typeId);
        dimension.spawnParticle("rgb:gravity_dust", center(landing));
        dimension.playSound(impactSound(typeId), center(landing));
      } else {
        dropAsItem(dimension, typeId, center(landing));
      }
    } catch { /* give up silently */ }
  }

  // The block above the origin (and the landing area) may now be unstable.
  enqueueAround(dimension, origin);
  enqueueBlock(dimension, { x: origin.x, y: origin.y + 1, z: origin.z });
}

function dropAsItem(dimension, typeId, loc) {
  try {
    dimension.spawnItem(new ItemStack(typeId, 1), loc);
  } catch { /* not a valid item form (e.g. grass_block), ignore */ }
}

function shakeNearby(dimension, loc, distance) {
  try {
    for (const player of world.getPlayers()) {
      if (player.dimension.id !== dimension.id) continue;
      const d = player.location;
      const dist = Math.hypot(d.x - loc.x, d.y - loc.y, d.z - loc.z);
      if (dist <= distance) {
        player.runCommand("camerashake add @s 0.12 0.4 positional");
      }
    }
  } catch { /* ignore */ }
}

// Processes the queue each interval, letting a limited number of blocks fall
// per wave so large collapses spread across ticks.
export function startEngine() {
  system.runInterval(() => {
    if (!Settings.enabled || Settings.mode === "safe") return;
    if (queue.length === 0) return;

    const mode = Settings.mode;
    const waveCap = Math.min(Settings.waveSize, Settings.maxFallingBlocks);
    let fell = 0;
    let lastFall = null;
    let lastDim = null;

    while (queue.length > 0 && fell < waveCap) {
      const item = queue.shift();
      queued.delete(`${item.dimensionId}:${item.x},${item.y},${item.z}`);

      const dimension = safeDimension(item.dimensionId);
      if (!dimension) continue;

      let block;
      try { block = dimension.getBlock({ x: item.x, y: item.y, z: item.z }); }
      catch { continue; }
      if (!block || block.isAir || block.isLiquid) continue;

      // Only blocks gravity recognises (or unknown solids under the mode).
      if (getEffectiveTier(block.typeId, mode) === null) continue;

      // Respect Gravity Wrench protected regions.
      if (Regions.isDisabledAt(item.dimensionId, item)) continue;

      if (!isBlockStable(block, mode)) {
        makeBlockFall(block);
        fell++;
        lastFall = { x: item.x, y: item.y, z: item.z };
        lastDim = dimension;
      }
    }

    if (fell >= 6 && lastFall && lastDim) {
      shakeNearby(lastDim, lastFall, 24);
      try { lastDim.playSound("rgb.rumble", center(lastFall)); } catch { /* ignore */ }
    }
  }, Settings.checkInterval);
}

function safeDimension(id) {
  try { return world.getDimension(id); } catch { return undefined; }
}

export function queueLength() {
  return queue.length;
}

// Evaluation mode used by the scanner / tester. In Safe Build Mode we preview
// against realistic thresholds so players can see what would collapse.
function previewMode() {
  return Settings.mode === "safe" ? "realistic" : Settings.mode;
}

// Highlight unstable / at-risk blocks around a player without changing them.
export function scanArea(player, radius) {
  const dimension = player.dimension;
  const o = player.location;
  const ox = Math.floor(o.x), oy = Math.floor(o.y), oz = Math.floor(o.z);
  const mode = previewMode();
  let unstable = 0, edge = 0;

  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        let block;
        try { block = dimension.getBlock({ x: ox + x, y: oy + y, z: oz + z }); }
        catch { continue; }
        if (!block || block.isAir || block.isLiquid) continue;

        const status = evaluateBlock(block, mode);
        if (status === "unstable") {
          dimension.spawnParticle("rgb:scan_danger", center(block));
          unstable++;
        } else if (status === "edge") {
          dimension.spawnParticle("rgb:scan_warning", center(block));
          edge++;
        }
      }
    }
  }
  player.sendMessage(`§eScan complete: §c${unstable} unstable§e, §6${edge} at-risk§e blocks.`);
}

// Force gravity in a small area for a few seconds, then stop. Works even while
// the world is paused (Safe Build Mode), pairing with the Collapse Tester item.
export function runCollapseTest(player, radius, durationTicks = 100) {
  const dimension = player.dimension;
  const o = player.location;
  const ox = Math.floor(o.x), oy = Math.floor(o.y), oz = Math.floor(o.z);
  const mode = previewMode();
  const local = [];

  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        local.push({ x: ox + x, y: oy + y, z: oz + z });
      }
    }
  }
  // Process from the bottom up so collapses cascade naturally.
  local.sort((a, b) => a.y - b.y);

  player.sendMessage("§6Collapse test running...");
  let elapsed = 0;
  const handle = system.runInterval(() => {
    elapsed += Settings.checkInterval;
    let fell = 0;
    const cap = Settings.waveSize;
    while (local.length > 0 && fell < cap) {
      const p = local.shift();
      let block;
      try { block = dimension.getBlock(p); } catch { continue; }
      if (!block || block.isAir || block.isLiquid) continue;
      if (getEffectiveTier(block.typeId, mode) === null) continue;
      if (!isBlockStable(block, mode)) {
        makeBlockFall(block);
        fell++;
      }
    }
    if (local.length === 0 || elapsed >= durationTicks) {
      system.clearRun(handle);
      player.sendMessage("§aCollapse test finished.");
    }
  }, Settings.checkInterval);
}
