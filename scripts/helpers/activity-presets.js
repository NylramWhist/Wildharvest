import { DEFAULT_LOCATIONS } from "../data/default-locations.js";
import { DEFAULT_LOOT_POOLS } from "../data/default-loot-pools.js";
import {
  getDnd5eSkillChoices,
  getDnd5eSkillLabel,
  isDnd5eSystem
} from "./dnd5e-support.js";
import { getModuleLocale, t } from "../i18n.js";
import {
  filterAvailableItemPackIds,
  getLocations,
  getLocationsText,
  getLootPools,
  getLootPoolsText,
  parseLocationsFromText,
  parseLootPoolsFromText,
  serializeLocations,
  serializeLootPools
} from "../settings.js";

export const ACTIVITY_CATALOG_LOCATION_ID = "wildharvest-options";

function slugify(value, fallback = "activity") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function createUniqueSlug(baseValue, usedValues, fallback = "activity") {
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

export function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function normalizePackIds(packIds) {
  const values = Array.isArray(packIds) ? packIds : [packIds];
  return [...new Set(values
    .map((packId) => String(packId ?? "").trim())
    .filter(Boolean))];
}

export function getItemCompendiums() {
  return Array.from(game.packs?.values?.() ?? [])
    .filter((pack) => pack.documentName === "Item")
    .map((pack) => ({
      id: pack.collection,
      name: pack.title ?? pack.metadata?.label ?? pack.collection
    }))
    .sort((left, right) => left.name.localeCompare(right.name, getModuleLocale()));
}

export function getPackLabelById(packId) {
  const pack = game.packs.get(String(packId ?? "").trim());
  if (!pack) return String(packId ?? "").trim();

  const name = pack.title ?? pack.metadata?.label ?? pack.collection;
  return `${name} [${pack.collection}]`;
}

export function getSkillChoices() {
  return isDnd5eSystem() ? getDnd5eSkillChoices() : [];
}

export function getSkillLabel(skillId) {
  return skillId ? getDnd5eSkillLabel(skillId) : t("WILDHARVEST.Default.SkillLabel");
}

export function renderCompendiumTags(packIds) {
  if (!packIds.length) {
    return `<span class="wildharvest-muted">${escapeHtml(t("WILDHARVEST.Dialog.LootPools.NoCompendiums"))}</span>`;
  }

  return packIds
    .map((packId) => `<span class="wildharvest-tag">${escapeHtml(getPackLabelById(packId))}</span>`)
    .join("");
}

export function sanitizeQuickOptionPackIds(packIds) {
  return normalizePackIds(packIds ?? []);
}

export function validateQuickOptionDraft(option) {
  const name = String(option?.name ?? "").trim();
  if (!name) throw new Error(t("WILDHARVEST.Errors.ActivityNameRequiredSimple"));

  const skillId = String(option?.skillId ?? "").trim().toLowerCase();
  if (!skillId) throw new Error(t("WILDHARVEST.Errors.ActivitySkillRequired"));

  const packIds = sanitizeQuickOptionPackIds(option?.packIds ?? []);
  if (!packIds.length) throw new Error(t("WILDHARVEST.Errors.ActivityCompendiumsRequired"));
  if (!filterAvailableItemPackIds(packIds).length) {
    throw new Error(t("WILDHARVEST.Errors.ActivityCompendiumsRequired"));
  }

  return {
    ...option,
    name,
    skillId,
    packIds
  };
}

export function getQuickOptionValidationIssues(option) {
  const issues = [];
  const name = String(option?.name ?? "").trim();
  const skillId = String(option?.skillId ?? "").trim().toLowerCase();
  const packIds = sanitizeQuickOptionPackIds(option?.packIds ?? []);

  if (!name) issues.push("WILDHARVEST.Errors.ActivityNameRequiredSimple");
  if (!skillId) issues.push("WILDHARVEST.Errors.ActivitySkillRequired");
  if (!packIds.length || !filterAvailableItemPackIds(packIds).length) issues.push("WILDHARVEST.Errors.ActivityCompendiumsRequired");

  return issues;
}

export function sanitizeQuickOptionsForStorage(quickOptions) {
  const usedOptionIds = new Set();
  const usedLootPoolIds = new Set();

  return (Array.isArray(quickOptions) ? quickOptions : []).map((option, index) => {
    const name = String(option?.name ?? "").trim();
    const skillId = String(option?.skillId ?? "").trim().toLowerCase() || null;
    const packIds = sanitizeQuickOptionPackIds(option?.packIds ?? []);
    const id = createUniqueSlug(
      String(option?.id ?? name ?? "").trim() || `activity-${index + 1}`,
      usedOptionIds,
      `activity-${index + 1}`
    );
    const lootPoolId = createUniqueSlug(
      String(option?.lootPoolId ?? id).trim() || id,
      usedLootPoolIds,
      id
    );

    return {
      id,
      lootPoolId,
      name,
      skillId,
      packIds,
      description: String(option?.description ?? "").trim()
    };
  });
}

export function normalizeQuickOptionsForSave(quickOptions) {
  return sanitizeQuickOptionsForStorage(quickOptions).map((option) => validateQuickOptionDraft(option));
}

export function buildQuickOptionsFromState(locations, lootPools) {
  const lootPoolMap = new Map(lootPools.map((lootPool) => [lootPool.id, lootPool]));

  return locations.flatMap((location) => (location.activities ?? []).map((activity) => {
    const optionId = String(activity.id ?? "").trim() || slugify(activity.name, "activity");
    const sourceLootPoolId = String(activity.lootPoolId ?? location.lootPoolId ?? optionId).trim()
      || optionId;
    const lootPool = lootPoolMap.get(sourceLootPoolId);

    return {
      id: optionId,
      name: activity.name,
      description: String(activity.description ?? location.description ?? "").trim(),
      skillId: String(activity.skillId ?? "").trim().toLowerCase() || "",
      lootPoolId: lootPool?.id ?? optionId,
      packIds: normalizePackIds(lootPool?.packIds ?? [])
    };
  }));
}

export function buildSampleQuickOptions() {
  return buildQuickOptionsFromState(DEFAULT_LOCATIONS, DEFAULT_LOOT_POOLS);
}

export function buildLocationsFromQuickOptions(quickOptions) {
  if (!quickOptions.length) return [];

  return [
    {
      id: ACTIVITY_CATALOG_LOCATION_ID,
      name: t("WILDHARVEST.Default.ActivityCatalogName"),
      description: t("WILDHARVEST.Default.ActivityCatalogDescription"),
      activities: quickOptions.map((option) => ({
        id: option.id,
        name: option.name,
        description: String(option.description ?? "").trim(),
        lootPoolId: option.lootPoolId,
        skillId: option.skillId || null,
        skillLabel: getSkillLabel(option.skillId)
      }))
    }
  ];
}

export function buildLootPoolsFromQuickOptions(quickOptions) {
  return quickOptions.map((option) => ({
    id: option.lootPoolId,
    name: option.name,
    description: "",
    packIds: normalizePackIds(option.packIds ?? [])
  }));
}

export function getQuickOptionsFromRawText(rawLocationsText, rawLootPoolsText) {
  try {
    const locations = parseLocationsFromText(rawLocationsText);
    const lootPools = parseLootPoolsFromText(rawLootPoolsText);
    return buildQuickOptionsFromState(locations, lootPools);
  } catch (_error) {
    return buildQuickOptionsFromState(getLocations(), getLootPools());
  }
}

export function getQuickOptionsFromSettings() {
  return getQuickOptionsFromRawText(getLocationsText(), getLootPoolsText());
}

export function serializeQuickOptionsToState(quickOptions) {
  return {
    locations: buildLocationsFromQuickOptions(quickOptions),
    lootPools: buildLootPoolsFromQuickOptions(quickOptions)
  };
}

export function serializeQuickOptionsTexts(quickOptions) {
  const { locations, lootPools } = serializeQuickOptionsToState(quickOptions);
  return {
    locationsText: serializeLocations(locations),
    lootPoolsText: serializeLootPools(lootPools)
  };
}

export function createUniqueActivityOptionId(baseName, existingOptions, currentId = "") {
  if (currentId) return currentId;

  const existingIds = new Set(existingOptions.map((option) => option.id));
  const baseId = slugify(baseName, "activity");
  let nextId = baseId;
  let index = 2;

  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${index}`;
    index += 1;
  }

  return nextId;
}
