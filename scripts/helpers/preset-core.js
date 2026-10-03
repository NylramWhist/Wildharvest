// Search presets (data version 3, Wildharvest 1.25.0). One flat list stored in the world
// setting "presets" (PresetsData model). Before 1.25.0 presets were stored as two JSON texts,
// "locations" (one internal location holding every preset) and "lootPools"; the functions
// below read that old shape for the migration and for configuration files from 1.20.x–1.24.x.
// Pure functions: no Foundry globals, so the Node tests can load this file.

import { normalizeFolderIds } from "./folder-filter-core.js";

// Scenes and history written before 1.25.0 point to this location id; the catalog built
// from the presets keeps it so they still resolve.
export const PRESET_CATALOG_LOCATION_ID = "wildharvest-options";

// Same rules as before 1.25.0, so presets converted from old data keep the ids scenes point to.
export function slugify(value, fallback = "preset") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function createUniqueSlug(baseValue, usedValues, fallback = "preset") {
  const baseSlug = slugify(baseValue, fallback);
  let nextSlug = baseSlug;
  let index = 2;
  while (usedValues.has(nextSlug)) {
    nextSlug = `${baseSlug}-${index}`;
    index += 1;
  }
  usedValues.add(nextSlug);
  return nextSlug;
}

export function normalizePackIds(packIds) {
  const values = Array.isArray(packIds) ? packIds : [packIds];
  return [...new Set(values.map((packId) => String(packId ?? "").trim()).filter(Boolean))];
}

// Canonical preset list: trimmed text, lowercase skill id, unique ids and compendium ids.
// Presets without a name are dropped (the editor never saves them).
export function normalizePresetList(presets) {
  const usedIds = new Set();
  return (Array.isArray(presets) ? presets : [])
    .filter((preset) => preset && typeof preset === "object" && String(preset.name ?? "").trim())
    .map((preset, index) => {
      const name = String(preset.name ?? "").trim();
      const packIds = normalizePackIds(preset.packIds ?? []);
      return {
        id: createUniqueSlug(String(preset.id ?? "").trim() || name, usedIds, `preset-${index + 1}`),
        name,
        description: String(preset.description ?? "").trim(),
        skillId: String(preset.skillId ?? "").trim().toLowerCase(),
        packIds,
        // 1.37.0: compendium folders, only of the preset's compendiums.
        folderIds: normalizeFolderIds(preset.folderIds ?? [], packIds),
        difficulty: normalizePresetDifficulty(preset.difficulty),
        tableIds: normalizeTableIds(preset.tableIds ?? []),
        tableMode: normalizeTableMode(preset.tableMode)
      };
    });
}

// 1.35.0: difficulty of a preset, a whole number from -20 to 20 (0 when missing or unreadable).
export const PRESET_DIFFICULTY_LIMIT = 20;
export function normalizePresetDifficulty(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.max(-PRESET_DIFFICULTY_LIMIT, Math.min(PRESET_DIFFICULTY_LIMIT, number));
}

// 1.36.0: roll tables of a preset, as RollTable UUIDs ("RollTable.x" or "Compendium.p.RollTable.x").
export const PRESET_TABLE_MODES = Object.freeze(["draw", "pool"]);
export function normalizeTableIds(tableIds) {
  const values = Array.isArray(tableIds) ? tableIds : [tableIds];
  return [...new Set(values
    .map((value) => String(value ?? "").trim())
    .filter((value) => /(^|\.)RollTable\.[^.]+$/.test(value)))];
}

export function normalizeTableMode(value) {
  return PRESET_TABLE_MODES.includes(value) ? value : "draw";
}

// A preset gives loot when it has compendiums, or roll tables (1.36.0).
export function presetHasLootSource(preset) {
  return normalizePackIds(preset?.packIds ?? []).length > 0 || normalizeTableIds(preset?.tableIds ?? []).length > 0;
}

function legacyPoolPackIds(lootPool) {
  const packIds = [
    ...(Array.isArray(lootPool?.packIds) ? lootPool.packIds : []),
    ...(Array.isArray(lootPool?.packs) ? lootPool.packs : []),
    ...(Array.isArray(lootPool?.compendiums) ? lootPool.compendiums : [])
  ];
  if (!packIds.length && lootPool?.packId) packIds.push(lootPool.packId);
  return normalizePackIds(packIds);
}

// Presets from the old "locations" + "lootPools" data (arrays, or the JSON texts stored in
// the settings). Every activity of every location becomes one preset with the compendiums of
// its own loot pool, or of its location's pool. Unreadable input gives an empty list.
export function presetsFromLegacyConfig(rawLocations, rawLootPools) {
  const parse = (value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  };
  const locations = parse(rawLocations);
  const lootPools = parse(rawLootPools);
  const poolsById = new Map();
  for (const lootPool of Array.isArray(lootPools) ? lootPools : []) {
    const name = String(lootPool?.name ?? "").trim();
    const id = String(lootPool?.id ?? "").trim() || slugify(name, "");
    if (id) poolsById.set(id, lootPool);
    if (name && !poolsById.has(slugify(name, ""))) poolsById.set(slugify(name, ""), lootPool);
  }

  const presets = [];
  for (const location of Array.isArray(locations) ? locations : []) {
    const locationPoolId = String(location?.lootPoolId ?? location?.lootPool ?? location?.poolId ?? "").trim();
    for (const activity of Array.isArray(location?.activities) ? location.activities : []) {
      const poolId = String(activity?.lootPoolId ?? activity?.lootPool ?? activity?.poolId ?? "").trim();
      const lootPool = poolsById.get(poolId)
        ?? poolsById.get(locationPoolId)
        ?? poolsById.get(String(activity?.id ?? "").trim())
        ?? null;
      presets.push({
        id: activity?.id,
        name: activity?.name,
        description: String(activity?.description ?? location?.description ?? "").trim(),
        skillId: activity?.skillId ?? activity?.skillKey ?? activity?.skill ?? "",
        packIds: legacyPoolPackIds(lootPool)
      });
    }
  }
  return normalizePresetList(presets);
}

// The shape the rest of the module reads: one location whose activities are the presets,
// each with a loot pool of the same id. skillLabel(skillId) gives the label for a skill.
export function buildPresetCatalog(presets, { name = "", description = "", skillLabel = (skillId) => skillId } = {}) {
  const list = normalizePresetList(presets);
  if (!list.length) return [];
  return [{
    id: PRESET_CATALOG_LOCATION_ID,
    name,
    description,
    lootPoolId: null,
    activities: list.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      lootPoolId: preset.id,
      skillId: preset.skillId || null,
      skillLabel: skillLabel(preset.skillId || "")
    }))
  }];
}

export function buildPresetLootPools(presets) {
  return normalizePresetList(presets).map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: "",
    packIds: [...preset.packIds],
    folderIds: [...preset.folderIds],
    difficulty: preset.difficulty,
    tableIds: [...preset.tableIds],
    tableMode: preset.tableMode
  }));
}
