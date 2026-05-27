// blockData.js
// Lookup tables mapping block types to support tiers, plus mode-aware tier resolution.

export const SUPPORT_TIERS = {
  strong: { supportRange: 10, hangRange: 4 },
  medium: { supportRange: 5, hangRange: 2 },
  weak: { supportRange: 2, hangRange: 0 },
};

// Explicit tier assignments. Anything not listed falls back to the mode's
// default tier (see getEffectiveTier).
export const BLOCK_TIER = {
  // strong
  "minecraft:stone": "strong",
  "minecraft:deepslate": "strong",
  "minecraft:cobbled_deepslate": "strong",
  "minecraft:iron_block": "strong",
  "minecraft:obsidian": "strong",
  "minecraft:netherrack": "strong",
  "minecraft:blackstone": "strong",
  "rgb:reinforced_block": "strong",
  "rgb:support_beam": "strong",

  // medium
  "minecraft:oak_log": "medium",
  "minecraft:spruce_log": "medium",
  "minecraft:birch_log": "medium",
  "minecraft:jungle_log": "medium",
  "minecraft:acacia_log": "medium",
  "minecraft:dark_oak_log": "medium",
  "minecraft:oak_planks": "medium",
  "minecraft:spruce_planks": "medium",
  "minecraft:birch_planks": "medium",
  "minecraft:bricks": "medium",
  "minecraft:cobblestone": "medium",
  "minecraft:mossy_cobblestone": "medium",
  "minecraft:stone_bricks": "medium",
  "minecraft:smooth_stone": "medium",

  // weak
  "minecraft:dirt": "weak",
  "minecraft:grass_block": "weak",
  "minecraft:coarse_dirt": "weak",
  "minecraft:podzol": "weak",
  "minecraft:sand": "weak",
  "minecraft:red_sand": "weak",
  "minecraft:gravel": "weak",
  "minecraft:oak_leaves": "weak",
  "minecraft:spruce_leaves": "weak",
  "minecraft:birch_leaves": "weak",
  "minecraft:white_wool": "weak",
  "minecraft:clay": "weak",
  "minecraft:mud": "weak",
  "minecraft:packed_mud": "weak",
  "minecraft:glass": "weak",
  "minecraft:ice": "weak",
  "minecraft:packed_ice": "weak",
  "minecraft:snow": "weak",

  // ores (medium so deep mining stays interesting but not punishing)
  "minecraft:coal_ore": "medium",
  "minecraft:iron_ore": "medium",
  "minecraft:gold_ore": "medium",
  "minecraft:diamond_ore": "medium",
  "minecraft:redstone_ore": "medium",
  "minecraft:deepslate_iron_ore": "strong",
  "minecraft:deepslate_diamond_ore": "strong",
};

// Blocks gravity never touches. They always count as solid anchors / ground.
export const ANCHOR_BLOCKS = new Set([
  "minecraft:bedrock",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:barrier",
  "minecraft:end_portal_frame",
]);

export function isAnchor(typeId) {
  return ANCHOR_BLOCKS.has(typeId);
}

// Resolve the support tier for a block under the active gravity mode.
// Returns { supportRange, hangRange } or null when the block is treated as
// fixed (never falls) under the current mode.
export function getEffectiveTier(typeId, mode) {
  if (isAnchor(typeId)) return null;

  const known = BLOCK_TIER[typeId];

  switch (mode) {
    case "light": {
      // Only loose (weak) blocks fall. Everything else is fixed.
      if (known !== "weak") return null;
      return SUPPORT_TIERS.weak;
    }
    case "chaos": {
      // Almost everything falls; unknown blocks are treated as weak and
      // every range is cut short.
      const tier = known ?? "weak";
      const base = SUPPORT_TIERS[tier];
      return {
        supportRange: Math.max(1, Math.floor(base.supportRange / 2)),
        hangRange: Math.max(0, base.hangRange - 1),
      };
    }
    case "realistic":
    default: {
      const tier = known ?? "medium";
      return SUPPORT_TIERS[tier];
    }
  }
}
