// settings.js
// Persists configuration and the active gravity mode in world dynamic properties.

import { world } from "@minecraft/server";

const PROP = "rgb:settings";

const DEFAULTS = {
  enabled: true,
  mode: "realistic", // light | realistic | chaos | safe
  maxFallingBlocks: 100,
  checkDistance: 16,
  checkInterval: 4,
  waveSize: 16,
};

// Per-mode overrides applied on top of the user's numeric settings when a
// mode is selected. Modes change thresholds, not the core system.
const MODE_PRESETS = {
  light: { checkInterval: 6, waveSize: 12 },
  realistic: { checkInterval: 4, waveSize: 16 },
  chaos: { checkInterval: 2, waveSize: 32 },
  safe: {},
};

class SettingsStore {
  constructor() {
    this._cache = { ...DEFAULTS };
    this._loaded = false;
  }

  load() {
    const raw = world.getDynamicProperty(PROP);
    if (typeof raw === "string") {
      try {
        this._cache = { ...DEFAULTS, ...JSON.parse(raw) };
      } catch {
        this._cache = { ...DEFAULTS };
      }
    } else {
      this._cache = { ...DEFAULTS };
    }
    this._loaded = true;
  }

  save() {
    world.setDynamicProperty(PROP, JSON.stringify(this._cache));
  }

  get enabled() { return this._cache.enabled; }
  set enabled(v) { this._cache.enabled = !!v; }

  get mode() { return this._cache.mode; }
  set mode(v) {
    if (!MODE_PRESETS[v]) return;
    this._cache.mode = v;
    Object.assign(this._cache, MODE_PRESETS[v]);
  }

  get maxFallingBlocks() { return this._cache.maxFallingBlocks; }
  set maxFallingBlocks(v) { this._cache.maxFallingBlocks = clampInt(v, 1, 1000, DEFAULTS.maxFallingBlocks); }

  get checkDistance() { return this._cache.checkDistance; }
  set checkDistance(v) { this._cache.checkDistance = clampInt(v, 1, 64, DEFAULTS.checkDistance); }

  get checkInterval() { return this._cache.checkInterval; }
  set checkInterval(v) { this._cache.checkInterval = clampInt(v, 1, 100, DEFAULTS.checkInterval); }

  get waveSize() { return this._cache.waveSize; }
  set waveSize(v) { this._cache.waveSize = clampInt(v, 1, 256, DEFAULTS.waveSize); }

  snapshot() { return { ...this._cache }; }
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const Settings = new SettingsStore();

// --- Gravity Wrench regions: boxes where gravity can be toggled off ---

const REGION_PROP = "rgb:regions";

function loadRegions() {
  const raw = world.getDynamicProperty(REGION_PROP);
  if (typeof raw !== "string") return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveRegions(regions) {
  world.setDynamicProperty(REGION_PROP, JSON.stringify(regions));
}

function norm(box) {
  return {
    dimensionId: box.dimensionId,
    minX: Math.min(box.x1, box.x2), maxX: Math.max(box.x1, box.x2),
    minY: Math.min(box.y1, box.y2), maxY: Math.max(box.y1, box.y2),
    minZ: Math.min(box.z1, box.z2), maxZ: Math.max(box.z1, box.z2),
    enabled: box.enabled ?? false, // false = gravity disabled inside
  };
}

function inside(r, dimId, loc) {
  return r.dimensionId === dimId &&
    loc.x >= r.minX && loc.x <= r.maxX &&
    loc.y >= r.minY && loc.y <= r.maxY &&
    loc.z >= r.minZ && loc.z <= r.maxZ;
}

export const Regions = {
  add(box) {
    const regions = loadRegions();
    regions.push(norm(box));
    saveRegions(regions);
  },
  // Toggle gravity for whichever region contains loc. Returns new state or null.
  toggleAt(dimId, loc) {
    const regions = loadRegions();
    for (const r of regions) {
      if (inside(r, dimId, loc)) {
        r.enabled = !r.enabled;
        saveRegions(regions);
        return r.enabled;
      }
    }
    return null;
  },
  // True when gravity should be suppressed for this position.
  isDisabledAt(dimId, loc) {
    const regions = loadRegions();
    for (const r of regions) {
      if (inside(r, dimId, loc) && !r.enabled) return true;
    }
    return false;
  },
};
