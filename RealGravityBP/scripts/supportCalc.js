// supportCalc.js
// Decides whether a block is stable by tracing a support path to the ground.

import { isAnchor, getEffectiveTier } from "./blockData.js";

// How far straight down we scan to decide if a solid block is "resting on
// terrain". Hitting air ends the scan (floating); reaching this depth or the
// world floor counts as grounded.
const GROUND_SCAN_MAX = 16;

// Hard cap on blocks visited by a single flood fill, protecting frame rate.
const MAX_VISITED = 256;

export function isSolid(block) {
  if (!block) return false;
  try {
    if (block.isAir || block.isLiquid) return false;
  } catch {
    return false;
  }
  return true;
}

function safeBelow(block) {
  try { return block.below(); } catch { return undefined; }
}

function safeNeighbors(block) {
  const out = [];
  for (const fn of ["above", "below", "north", "south", "east", "west"]) {
    try {
      const n = block[fn]();
      if (n) out.push(n);
    } catch { /* unloaded */ }
  }
  return out;
}

// True if this solid block traces straight down to the world floor or bedrock
// without an air gap. Cheap common case for blocks resting on terrain.
function isGrounded(block) {
  if (isAnchor(block.typeId)) return true;

  let minY;
  try { minY = block.dimension.heightRange.min; } catch { minY = -64; }

  let cur = block;
  for (let depth = 0; depth < GROUND_SCAN_MAX; depth++) {
    if (cur.y <= minY) return true;
    if (isAnchor(cur.typeId)) return true;
    const below = safeBelow(cur);
    if (below === undefined) return false; // unloaded: don't claim grounded
    if (!isSolid(below)) return false; // air gap => floating
    cur = below;
  }
  // Continuous solid for the full scan depth: assume terrain.
  return true;
}

function posKey(block) {
  return `${block.x},${block.y},${block.z}`;
}

// Breadth-first walk outward through solid blocks toward a grounded block.
// Returns the fewest steps to ground, or Infinity if none within maxRange.
export function findSupportDistance(startBlock, maxRange) {
  if (isGrounded(startBlock)) return 0;

  const visited = new Set([posKey(startBlock)]);
  let frontier = [startBlock];
  let distance = 0;

  while (frontier.length > 0 && distance < maxRange && visited.size < MAX_VISITED) {
    distance++;
    const next = [];
    for (const block of frontier) {
      for (const neighbor of safeNeighbors(block)) {
        if (!isSolid(neighbor)) continue;
        const key = posKey(neighbor);
        if (visited.has(key)) continue;
        visited.add(key);
        if (isGrounded(neighbor)) return distance;
        if (visited.size >= MAX_VISITED) break;
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return Infinity;
}

// Core decision. A block is stable if it can reach the ground within the
// range its material (under the active mode) allows. Blocks with nothing
// directly beneath them are held to the tighter hang range.
export function isBlockStable(block, mode) {
  if (isAnchor(block.typeId)) return true;

  const tier = getEffectiveTier(block.typeId, mode);
  if (tier === null) return true; // mode treats this block as fixed

  const hasFloor = isSolid(safeBelow(block));
  const limit = hasFloor ? tier.supportRange : tier.hangRange;

  const distance = findSupportDistance(block, limit);
  return distance <= limit;
}

// Richer status used by the Gravity Scanner. Returns one of:
//   "fixed"   - mode treats it as immovable
//   "stable"  - well supported
//   "edge"    - supported but at the very limit of its range (warning)
//   "unstable"- will fall
export function evaluateBlock(block, mode) {
  if (isAnchor(block.typeId)) return "fixed";
  const tier = getEffectiveTier(block.typeId, mode);
  if (tier === null) return "fixed";

  const hasFloor = isSolid(safeBelow(block));
  const limit = hasFloor ? tier.supportRange : tier.hangRange;
  const distance = findSupportDistance(block, limit);

  if (distance === Infinity || distance > limit) return "unstable";
  if (distance >= limit) return "edge";
  return "stable";
}
