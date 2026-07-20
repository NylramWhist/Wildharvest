import {
  DATA_VERSION_SETTING_KEY,
  LANGUAGE_MODE_SETTING_KEY,
  LOOT_POOLS_SETTING_KEY,
  LOCATIONS_SETTING_KEY,
  MIGRATION_BACKUPS_SETTING_KEY,
  MODULE_ID,
  RANDOM_LOOT_PACK_SETTING_KEY,
  RULES_SETTING_KEY,
  SEARCH_SESSIONS_SETTING_KEY,
  SELECTED_PACK_ALIAS
} from "./constants.js";
import { DEFAULT_LOCATIONS } from "./data/default-locations.js";
import { DEFAULT_LOOT_POOLS } from "./data/default-loot-pools.js";
import { DEFAULT_RULES_CONFIG } from "./data/default-rules.js";
import {
  applySettingsTransaction,
  SettingsTransactionError
} from "./helpers/settings-transaction-core.js";
import { createPreMigrationBackup } from "./helpers/migration-backup.js";
import { refreshRegisteredModuleLocalization, t } from "./i18n.js";

function slugify(value, fallback) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function normalizePackId(value) {
  return String(value ?? "").trim();
}

function normalizePackIds(packIds) {
  const values = Array.isArray(packIds) ? packIds : [packIds];
  return [...new Set(values
    .map(normalizePackId)
    .filter(Boolean))];
}

function parseSelectedPackIds(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map(normalizePackId).filter(Boolean);
  }

  const rawText = String(rawValue ?? "").trim();
  if (!rawText) return [];

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizePackId).filter(Boolean);
    }
  } catch (_error) {
    // Legacy single-pack string value.
  }

  return [rawText];
}

function getPackLabel(pack) {
  const packName = pack?.title ?? pack?.metadata?.label ?? pack?.collection ?? "";
  return packName ? `${packName} [${pack.collection}]` : "";
}

function assertItemPack(packId) {
  const pack = game.packs.get(packId);
  if (!pack) throw new Error(t("WILDHARVEST.Errors.PackMissing", { pack: packId }));
  if (pack.documentName !== "Item") {
    throw new Error(t("WILDHARVEST.Errors.PackNotItemCompendium", { pack: packId }));
  }

  return pack;
}

export function isAvailableItemPackId(packId) {
  const normalizedPackId = normalizePackId(packId);
  if (!normalizedPackId) return false;

  const pack = game.packs.get(normalizedPackId);
  return Boolean(pack && pack.documentName === "Item");
}

export function filterAvailableItemPackIds(packIds) {
  return normalizePackIds(packIds)
    .filter((packId) => isAvailableItemPackId(packId));
}

function validateItemPackIds(packIds) {
  for (const packId of packIds) {
    assertItemPack(packId);
  }
}

function normalizeLootPoolPackIds(lootPool) {
  const rawPackIds = [
    ...(Array.isArray(lootPool.packIds) ? lootPool.packIds : []),
    ...(Array.isArray(lootPool.packs) ? lootPool.packs : []),
    ...(Array.isArray(lootPool.compendiums) ? lootPool.compendiums : [])
  ];

  if (!rawPackIds.length && lootPool.packId) {
    rawPackIds.push(lootPool.packId);
  }

  return [...new Set(rawPackIds.map(normalizePackId).filter(Boolean))];
}

function normalizeLootPool(lootPool, index) {
  if (!lootPool || typeof lootPool !== "object") {
    throw new Error(t("WILDHARVEST.Errors.LootPoolInvalid", { index: index + 1 }));
  }

  const name = String(lootPool.name ?? "").trim();
  if (!name) throw new Error(t("WILDHARVEST.Errors.LootPoolNameRequired", { index: index + 1 }));

  const packIds = normalizeLootPoolPackIds(lootPool);

  return {
    id: slugify(lootPool.id ?? name, `loot-pool-${index + 1}`),
    name,
    description: String(lootPool.description ?? "").trim(),
    packIds
  };
}

function normalizeLootPoolId(value) {
  return String(value ?? "").trim() || null;
}

const RULE_RARITY_IDS = DEFAULT_RULES_CONFIG.rarityRules.map((entry) => entry.id);

function normalizeLootPointBracket(bracket, index) {
  if (!bracket || typeof bracket !== "object") {
    throw new Error(t("WILDHARVEST.Errors.LootPointBracketInvalid", { index: index + 1 }));
  }

  const minTotal = Number(bracket.minTotal ?? bracket.total ?? bracket.threshold ?? 0);
  const lootPoints = Number(bracket.lootPoints ?? bracket.points ?? 0);

  if (!Number.isFinite(minTotal)) {
    throw new Error(t("WILDHARVEST.Errors.LootPointBracketTotalInvalid", { index: index + 1 }));
  }

  if (!Number.isFinite(lootPoints) || lootPoints < 0) {
    throw new Error(t("WILDHARVEST.Errors.LootPointBracketPointsInvalid", { index: index + 1 }));
  }

  return {
    minTotal: Math.trunc(minTotal),
    lootPoints: Math.trunc(lootPoints)
  };
}

function normalizeLootPointBrackets(brackets) {
  if (!Array.isArray(brackets) || !brackets.length) {
    throw new Error(t("WILDHARVEST.Errors.LootPointBracketsRequired"));
  }

  const normalized = brackets.map(normalizeLootPointBracket)
    .sort((left, right) => left.minTotal - right.minTotal);

  const seenThresholds = new Set();
  for (const bracket of normalized) {
    if (seenThresholds.has(bracket.minTotal)) {
      throw new Error(t("WILDHARVEST.Errors.LootPointBracketDuplicateThreshold", { total: bracket.minTotal }));
    }
    seenThresholds.add(bracket.minTotal);
  }

  if (!normalized.some((bracket) => bracket.lootPoints === 0)) {
    throw new Error(t("WILDHARVEST.Errors.LootPointZeroRequired"));
  }

  return normalized;
}

function normalizeRarityRule(rule, index) {
  if (!rule || typeof rule !== "object") {
    throw new Error(t("WILDHARVEST.Errors.RarityRuleInvalid", { index: index + 1 }));
  }

  const id = String(rule.id ?? "").trim();
  if (!RULE_RARITY_IDS.includes(id)) {
    throw new Error(t("WILDHARVEST.Errors.RarityRuleUnknown", { id: id || `#${index + 1}` }));
  }

  const cost = Number(rule.cost ?? 0);
  const weight = Number(rule.weight ?? 0);
  const quantityFormula = String(rule.quantityFormula ?? rule.quantity ?? "").trim();

  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error(t("WILDHARVEST.Errors.RarityRuleCostInvalid", { id }));
  }

  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(t("WILDHARVEST.Errors.RarityRuleWeightInvalid", { id }));
  }

  if (!quantityFormula) {
    throw new Error(t("WILDHARVEST.Errors.RarityRuleQuantityInvalid", { id }));
  }

  if (typeof globalThis.Roll?.validate === "function" && !globalThis.Roll.validate(quantityFormula)) {
    throw new Error(t("WILDHARVEST.Errors.RarityRuleQuantityInvalid", { id }));
  }

  return {
    id,
    cost: Math.trunc(cost),
    weight: Math.trunc(weight),
    quantityFormula
  };
}

function normalizeRarityRules(rules) {
  if (!Array.isArray(rules) || !rules.length) {
    throw new Error(t("WILDHARVEST.Errors.RarityRulesRequired"));
  }

  const normalized = rules.map(normalizeRarityRule);
  const seenIds = new Set();
  for (const rule of normalized) {
    if (seenIds.has(rule.id)) {
      throw new Error(t("WILDHARVEST.Errors.RarityRuleDuplicateId", { id: rule.id }));
    }
    seenIds.add(rule.id);
  }
  const normalizedById = new Map(normalized.map((rule) => [rule.id, rule]));

  for (const requiredId of RULE_RARITY_IDS) {
    if (!normalizedById.has(requiredId)) {
      throw new Error(t("WILDHARVEST.Errors.RarityRuleMissing", { id: requiredId }));
    }
  }

  return RULE_RARITY_IDS.map((id) => normalizedById.get(id));
}

function normalizeLootMode(value) {
  const normalized = String(value ?? DEFAULT_RULES_CONFIG.lootMode).trim().toLowerCase();
  if (normalized === "rarity" || normalized === "value") return normalized;
  throw new Error(t("WILDHARVEST.Errors.LootModeInvalid"));
}

function normalizePlayerRollRules(playerRollRules) {
  const source = playerRollRules && typeof playerRollRules === "object"
    ? playerRollRules
    : DEFAULT_RULES_CONFIG.playerRollRules;
  const maxExtraModifier = Number(
    source.maxExtraModifier ?? DEFAULT_RULES_CONFIG.playerRollRules.maxExtraModifier
  );

  if (!Number.isInteger(maxExtraModifier) || maxExtraModifier < 0 || maxExtraModifier > 100) {
    throw new Error(t("WILDHARVEST.Errors.PlayerRollModifierLimitInvalid"));
  }

  return {
    allowExtraModifier: source.allowExtraModifier !== false,
    maxExtraModifier,
    allowRollModeSelection: source.allowRollModeSelection !== false
  };
}

function normalizeValueBracket(bracket, index) {
  if (!bracket || typeof bracket !== "object") {
    throw new Error(t("WILDHARVEST.Errors.ValueBracketInvalid", { index: index + 1 }));
  }

  const lootPoints = Number(bracket.lootPoints);
  const targetGp = Number(bracket.targetGp);
  if (!Number.isInteger(lootPoints) || lootPoints < 0) {
    throw new Error(t("WILDHARVEST.Errors.ValueBracketPointsInvalid", { index: index + 1 }));
  }
  if (!Number.isFinite(targetGp) || targetGp < 0) {
    throw new Error(t("WILDHARVEST.Errors.ValueBracketTargetInvalid", { lootPoints }));
  }

  return { lootPoints, targetGp: Math.round(targetGp * 100) / 100 };
}

function normalizeValueRules(valueRules) {
  const source = valueRules && typeof valueRules === "object"
    ? valueRules
    : DEFAULT_RULES_CONFIG.valueRules;
  const tolerancePercent = Number(source.tolerancePercent);
  if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0 || tolerancePercent > 100) {
    throw new Error(t("WILDHARVEST.Errors.ValueToleranceInvalid"));
  }
  if (!Array.isArray(source.brackets) || !source.brackets.length) {
    throw new Error(t("WILDHARVEST.Errors.ValueBracketsRequired"));
  }

  const brackets = source.brackets.map(normalizeValueBracket)
    .sort((left, right) => left.lootPoints - right.lootPoints);
  const seenPoints = new Set();
  for (const bracket of brackets) {
    if (seenPoints.has(bracket.lootPoints)) {
      throw new Error(t("WILDHARVEST.Errors.ValueBracketDuplicatePoints", { lootPoints: bracket.lootPoints }));
    }
    seenPoints.add(bracket.lootPoints);
  }
  if (!seenPoints.has(0)) throw new Error(t("WILDHARVEST.Errors.ValueBracketZeroRequired"));

  return {
    tolerancePercent: Math.round(tolerancePercent * 100) / 100,
    brackets
  };
}

export function normalizeRulesConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error(t("WILDHARVEST.Errors.RulesConfigInvalid"));
  }

  return {
    lootMode: normalizeLootMode(config.lootMode),
    playerRollRules: normalizePlayerRollRules(config.playerRollRules),
    lootPointBrackets: normalizeLootPointBrackets(config.lootPointBrackets ?? DEFAULT_RULES_CONFIG.lootPointBrackets),
    rarityRules: normalizeRarityRules(config.rarityRules ?? DEFAULT_RULES_CONFIG.rarityRules),
    valueRules: normalizeValueRules(config.valueRules)
  };
}

function normalizeActivity(activity, index) {
  if (!activity || typeof activity !== "object") {
    throw new Error(t("WILDHARVEST.Errors.ActivityInvalid", { index: index + 1 }));
  }

  const name = String(activity.name ?? "").trim();
  if (!name) throw new Error(t("WILDHARVEST.Errors.ActivityNameRequired", { index: index + 1 }));

  return {
    id: slugify(activity.id ?? name, `activity-${index + 1}`),
    name,
    description: String(activity.description ?? "").trim(),
    lootPoolId: normalizeLootPoolId(activity.lootPoolId ?? activity.lootPool ?? activity.poolId ?? activity.pool),
    skillId: String(activity.skillId ?? activity.skillKey ?? activity.skill ?? "").trim().toLowerCase() || null,
    skillLabel: String(activity.skillLabel ?? t("WILDHARVEST.Default.SkillLabel")).trim() || t("WILDHARVEST.Default.SkillLabel")
  };
}

function normalizeLocation(location, index) {
  if (!location || typeof location !== "object") {
    throw new Error(t("WILDHARVEST.Errors.LocationInvalid", { index: index + 1 }));
  }

  const name = String(location.name ?? "").trim();
  if (!name) throw new Error(t("WILDHARVEST.Errors.LocationNameRequired", { index: index + 1 }));

  const rawActivities = location.activities ?? [];
  if (!Array.isArray(rawActivities) || !rawActivities.length) {
    throw new Error(t("WILDHARVEST.Errors.LocationActivitiesRequired", { name }));
  }

  return {
    id: slugify(location.id ?? name, `location-${index + 1}`),
    name,
    description: String(location.description ?? "").trim(),
    lootPoolId: normalizeLootPoolId(location.lootPoolId ?? location.lootPool ?? location.poolId ?? location.pool),
    activities: rawActivities.map(normalizeActivity)
  };
}

export function normalizeLocations(data) {
  if (!Array.isArray(data)) {
    throw new Error(t("WILDHARVEST.Errors.ConfigArrayRequired"));
  }

  const locations = data.map(normalizeLocation);
  const locationIds = new Set();
  const activityIds = new Set();
  for (const location of locations) {
    if (locationIds.has(location.id)) {
      throw new Error(t("WILDHARVEST.Errors.LocationDuplicateId", { id: location.id }));
    }
    locationIds.add(location.id);

    for (const activity of location.activities) {
      if (activityIds.has(activity.id)) {
        throw new Error(t("WILDHARVEST.Errors.ActivityDuplicateId", { id: activity.id }));
      }
      activityIds.add(activity.id);
    }
  }

  return locations;
}

export function normalizeLootPools(data) {
  if (!Array.isArray(data)) {
    throw new Error(t("WILDHARVEST.Errors.LootPoolsConfigArrayRequired"));
  }

  const lootPools = data.map(normalizeLootPool);
  const seenIds = new Set();

  for (const lootPool of lootPools) {
    if (seenIds.has(lootPool.id)) {
      throw new Error(t("WILDHARVEST.Errors.LootPoolDuplicateId", { id: lootPool.id }));
    }

    seenIds.add(lootPool.id);
  }

  return lootPools;
}

export function serializeLocations(locations) {
  return JSON.stringify(locations, null, 2);
}

export function serializeLootPools(lootPools) {
  return JSON.stringify(lootPools, null, 2);
}

export function serializeRulesConfig(rulesConfig) {
  return JSON.stringify(rulesConfig, null, 2);
}

const CURRENT_DEFAULT_LOCATIONS_TEXT = serializeLocations(DEFAULT_LOCATIONS);
const CURRENT_DEFAULT_LOOT_POOLS_TEXT = serializeLootPools(DEFAULT_LOOT_POOLS);
const CURRENT_DEFAULT_RULES_TEXT = serializeRulesConfig(DEFAULT_RULES_CONFIG);
const CURRENT_DATA_VERSION = 1;
const CONFIG_EXPORT_VERSION = 1;
const CONFIG_EXPORT_FORMAT = "wildharvest-config";

export function isWildharvestConfigExport(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && value.format === CONFIG_EXPORT_FORMAT);
}

function sanitizeLootPoolsPackIds(lootPools) {
  return lootPools.map((lootPool) => ({
    ...lootPool,
    packIds: filterAvailableItemPackIds(lootPool.packIds ?? [])
  }));
}

function sanitizeLocationsAgainstLootPools(locations, lootPools) {
  const validLootPoolIds = new Set((lootPools ?? []).map((lootPool) => lootPool.id));

  return locations.map((location) => {
    const locationLootPoolId = validLootPoolIds.has(location.lootPoolId) ? location.lootPoolId : null;

    return {
      ...location,
      lootPoolId: locationLootPoolId,
      activities: (location.activities ?? []).map((activity) => {
        const activityLootPoolId = validLootPoolIds.has(activity.lootPoolId)
          ? activity.lootPoolId
          : locationLootPoolId;

        return {
          ...activity,
          description: String(activity.description ?? "").trim(),
          lootPoolId: activityLootPoolId,
          skillId: String(activity.skillId ?? "").trim().toLowerCase() || null
        };
      })
    };
  });
}

function getStoredSelectedRandomLootPackIdsRaw() {
  return parseSelectedPackIds(game.settings.get(MODULE_ID, RANDOM_LOOT_PACK_SETTING_KEY));
}

function sanitizeSelectedRandomLootPackIds(packIds) {
  return filterAvailableItemPackIds(packIds);
}

async function canonicalizeQuickOptionsConfigFromTexts(locationsText, lootPoolsText) {
  const {
    getQuickOptionsFromRawText,
    sanitizeQuickOptionsForStorage,
    serializeQuickOptionsTexts
  } = await import("./helpers/activity-presets.js");

  const quickOptions = sanitizeQuickOptionsForStorage(
    getQuickOptionsFromRawText(locationsText, lootPoolsText)
      .map((option) => ({
        ...option,
        description: String(option.description ?? "").trim(),
        skillId: String(option.skillId ?? "").trim().toLowerCase() || null,
        lootPoolId: String(option.lootPoolId ?? option.id ?? "").trim() || String(option.id ?? "").trim(),
        packIds: normalizePackIds(option.packIds ?? [])
      }))
  );

  return {
    quickOptions,
    ...serializeQuickOptionsTexts(quickOptions)
  };
}

export function registerSettings() {
  game.settings.register(MODULE_ID, LANGUAGE_MODE_SETTING_KEY, {
    name: "WILDHARVEST.Setting.Language.Name",
    hint: "WILDHARVEST.Setting.Language.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "WILDHARVEST.Setting.Language.Auto",
      en: "WILDHARVEST.Setting.Language.English",
      pl: "WILDHARVEST.Setting.Language.Polish"
    },
    default: "en",
    onChange: () => {
      refreshRegisteredModuleLocalization();
      ui.notifications?.info(t("WILDHARVEST.Notifications.LanguageChanged"));
    }
  });

  game.settings.register(MODULE_ID, LOCATIONS_SETTING_KEY, {
    name: "WILDHARVEST.Setting.Locations.Name",
    hint: "WILDHARVEST.Setting.Locations.Hint",
    scope: "world",
    config: false,
    type: String,
    default: CURRENT_DEFAULT_LOCATIONS_TEXT
  });

  game.settings.register(MODULE_ID, LOOT_POOLS_SETTING_KEY, {
    name: "WILDHARVEST.Setting.LootPools.Name",
    hint: "WILDHARVEST.Setting.LootPools.Hint",
    scope: "world",
    config: false,
    type: String,
    default: CURRENT_DEFAULT_LOOT_POOLS_TEXT
  });

  game.settings.register(MODULE_ID, RANDOM_LOOT_PACK_SETTING_KEY, {
    name: "WILDHARVEST.Setting.RandomLootPack.Name",
    hint: "WILDHARVEST.Setting.RandomLootPack.Hint",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, RULES_SETTING_KEY, {
    name: "WILDHARVEST.Setting.Rules.Name",
    hint: "WILDHARVEST.Setting.Rules.Hint",
    scope: "world",
    config: false,
    type: String,
    default: CURRENT_DEFAULT_RULES_TEXT
  });

  game.settings.register(MODULE_ID, DATA_VERSION_SETTING_KEY, {
    name: "WILDHARVEST.Setting.DataVersion.Name",
    hint: "WILDHARVEST.Setting.DataVersion.Hint",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, SEARCH_SESSIONS_SETTING_KEY, {
    name: "WILDHARVEST.Setting.SearchSessions.Name",
    hint: "WILDHARVEST.Setting.SearchSessions.Hint",
    scope: "world",
    config: false,
    type: String,
    default: "[]"
  });

  game.settings.register(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY, {
    name: "WILDHARVEST.Setting.MigrationBackups.Name",
    hint: "WILDHARVEST.Setting.MigrationBackups.Hint",
    scope: "world",
    config: false,
    type: String,
    default: "[]"
  });
}

export function getLocationsText() {
  return game.settings.get(MODULE_ID, LOCATIONS_SETTING_KEY) ?? CURRENT_DEFAULT_LOCATIONS_TEXT;
}

export function getLootPoolsText() {
  return game.settings.get(MODULE_ID, LOOT_POOLS_SETTING_KEY) ?? CURRENT_DEFAULT_LOOT_POOLS_TEXT;
}

export function getRulesConfigText() {
  return game.settings.get(MODULE_ID, RULES_SETTING_KEY) ?? CURRENT_DEFAULT_RULES_TEXT;
}

export function getLocations() {
  try {
    const normalizedLocations = normalizeLocations(JSON.parse(getLocationsText()));
    return sanitizeLocationsAgainstLootPools(normalizedLocations, getLootPools());
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to load location configuration.`, error);
    ui.notifications?.error(t("WILDHARVEST.Notifications.ConfigInvalid"));
    return normalizeLocations(DEFAULT_LOCATIONS);
  }
}

export function getLootPools() {
  try {
    const normalizedLootPools = parseLootPoolsFromText(getLootPoolsText(), {
      validatePackIds: false,
      filterUnavailablePackIds: true
    });
    return sanitizeLootPoolsPackIds(normalizedLootPools);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to load loot pool configuration.`, error);
    ui.notifications?.error(t("WILDHARVEST.Notifications.ConfigInvalid"));
    return normalizeLootPools(DEFAULT_LOOT_POOLS);
  }
}

export function getRulesConfig() {
  try {
    return normalizeRulesConfig(JSON.parse(getRulesConfigText()));
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to load rules configuration.`, error);
    ui.notifications?.error(t("WILDHARVEST.Notifications.RulesConfigInvalid"));
    return normalizeRulesConfig(DEFAULT_RULES_CONFIG);
  }
}

export function getLootPoolById(lootPoolId) {
  const normalizedLootPoolId = normalizeLootPoolId(lootPoolId);
  if (!normalizedLootPoolId) return null;

  return getLootPools().find((lootPool) => lootPool.id === normalizedLootPoolId) ?? null;
}

export function getLootPoolPackIds(lootPoolId) {
  return getLootPoolById(lootPoolId)?.packIds ?? [];
}

export function getLootPoolLabel(lootPoolId) {
  const lootPool = getLootPoolById(lootPoolId);
  return lootPool?.name ?? String(lootPoolId ?? "").trim();
}

export function isSelectedPackAlias(packId) {
  return String(packId ?? "").trim().toLowerCase() === SELECTED_PACK_ALIAS;
}

export function getSelectedRandomLootPackId() {
  return getSelectedRandomLootPackIds()[0] ?? "";
}

export function getSelectedRandomLootPack() {
  const packId = getSelectedRandomLootPackId();
  return packId ? game.packs.get(packId) ?? null : null;
}

export function getSelectedRandomLootPackIds() {
  return sanitizeSelectedRandomLootPackIds(getStoredSelectedRandomLootPackIdsRaw());
}

export function getSelectedRandomLootPacks() {
  return getSelectedRandomLootPackIds()
    .map((packId) => game.packs.get(packId) ?? null)
    .filter(Boolean);
}

export function getSelectedRandomLootPackLabel() {
  return getSelectedRandomLootPackLabels().join(", ");
}

export function getSelectedRandomLootPackLabels() {
  return getSelectedRandomLootPacks()
    .map((pack) => getPackLabel(pack))
    .filter(Boolean);
}

export function hasSelectedRandomLootPacks() {
  return getSelectedRandomLootPackIds().length > 0;
}

export async function saveSelectedRandomLootPack(packId) {
  return saveSelectedRandomLootPacks(packId ? [packId] : []);
}

export async function saveSelectedRandomLootPacks(packIds) {
  const normalizedPackIds = [...new Set((Array.isArray(packIds) ? packIds : [packIds])
    .map(normalizePackId)
    .filter(Boolean))];

  if (!normalizedPackIds.length) {
    await game.settings.set(MODULE_ID, RANDOM_LOOT_PACK_SETTING_KEY, "");
    return [];
  }

  validateItemPackIds(normalizedPackIds);

  await game.settings.set(MODULE_ID, RANDOM_LOOT_PACK_SETTING_KEY, JSON.stringify(normalizedPackIds));
  return normalizedPackIds;
}

export function resolveRewardPackId(packId) {
  const normalizedPackId = String(packId ?? "").trim();
  if (!isSelectedPackAlias(normalizedPackId)) return normalizedPackId;

  const selectedPackId = getSelectedRandomLootPackId();
  if (!selectedPackId) throw new Error(t("WILDHARVEST.Errors.SelectedPackNotConfigured"));
  return selectedPackId;
}

export function getRewardPackLabel(packId) {
  const normalizedPackId = String(packId ?? "").trim();
  if (!isSelectedPackAlias(normalizedPackId)) return normalizedPackId;

  return getSelectedRandomLootPackLabel() || t("WILDHARVEST.Config.SelectedPackPlaceholder");
}

export function parseLocationsFromText(rawText) {
  const parsed = JSON.parse(rawText);
  return normalizeLocations(parsed);
}

export function parseLootPoolsFromText(rawText, options = {}) {
  const {
    validatePackIds = true,
    filterUnavailablePackIds = false
  } = options;

  const parsed = JSON.parse(rawText);
  let normalized = normalizeLootPools(parsed);

  if (filterUnavailablePackIds) {
    normalized = sanitizeLootPoolsPackIds(normalized);
  }

  if (validatePackIds) {
    validateItemPackIds(normalized.flatMap((lootPool) => lootPool.packIds));
  }

  return normalized;
}

export function parseRulesConfigFromText(rawText) {
  const parsed = JSON.parse(rawText);
  return normalizeRulesConfig(parsed);
}

export async function saveLocationsFromText(rawText) {
  const normalized = parseLocationsFromText(rawText);
  await game.settings.set(MODULE_ID, LOCATIONS_SETTING_KEY, serializeLocations(normalized));
  return normalized;
}

export async function saveLootPoolsFromText(rawText, options = {}) {
  const normalized = parseLootPoolsFromText(rawText, options);
  await game.settings.set(MODULE_ID, LOOT_POOLS_SETTING_KEY, serializeLootPools(normalized));
  return normalized;
}

export async function saveRulesConfigFromText(rawText) {
  const normalized = parseRulesConfigFromText(rawText);
  await game.settings.set(MODULE_ID, RULES_SETTING_KEY, serializeRulesConfig(normalized));
  return normalized;
}

export function getModuleConfigExportData() {
  return {
    format: CONFIG_EXPORT_FORMAT,
    moduleId: MODULE_ID,
    schemaVersion: CONFIG_EXPORT_VERSION,
    dataVersion: CURRENT_DATA_VERSION,
    moduleVersion: game.modules?.get(MODULE_ID)?.version ?? null,
    exportedAt: new Date().toISOString(),
    locations: getLocations(),
    lootPools: getLootPools(),
    rulesConfig: getRulesConfig(),
    selectedRandomLootPackIds: getSelectedRandomLootPackIds()
  };
}

export function serializeModuleConfigExport() {
  return JSON.stringify(getModuleConfigExportData(), null, 2);
}

export async function importModuleConfigFromText(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_error) {
    throw new Error(t("WILDHARVEST.Errors.ImportConfigInvalid"));
  }

  if (!isWildharvestConfigExport(parsed)) {
    throw new Error(t("WILDHARVEST.Errors.ImportConfigInvalid"));
  }

  const locations = normalizeLocations(parsed.locations ?? []);
  const lootPools = parseLootPoolsFromText(JSON.stringify(parsed.lootPools ?? []), {
    validatePackIds: false,
    filterUnavailablePackIds: true
  });
  const rulesConfig = normalizeRulesConfig(parsed.rulesConfig ?? parsed.rules ?? {});
  const selectedRandomLootPackIds = sanitizeSelectedRandomLootPackIds(
    parsed.selectedRandomLootPackIds ?? parsed.selectedPackIds ?? []
  );

  const canonicalized = await canonicalizeQuickOptionsConfigFromTexts(
    serializeLocations(sanitizeLocationsAgainstLootPools(locations, lootPools)),
    serializeLootPools(lootPools)
  );

  const changes = [
    { key: LOCATIONS_SETTING_KEY, value: canonicalized.locationsText },
    { key: LOOT_POOLS_SETTING_KEY, value: canonicalized.lootPoolsText },
    { key: RULES_SETTING_KEY, value: serializeRulesConfig(rulesConfig) },
    {
      key: RANDOM_LOOT_PACK_SETTING_KEY,
      value: selectedRandomLootPackIds.length ? JSON.stringify(selectedRandomLootPackIds) : ""
    },
    { key: DATA_VERSION_SETTING_KEY, value: CURRENT_DATA_VERSION }
  ];

  try {
    await applySettingsTransaction(changes, {
      getValue: (key) => game.settings.get(MODULE_ID, key),
      setValue: (key, value) => game.settings.set(MODULE_ID, key, value)
    });
  } catch (error) {
    if (error instanceof SettingsTransactionError) {
      console.error(`${MODULE_ID} | Configuration import rollback was incomplete.`, error);
      throw new Error(t("WILDHARVEST.Errors.ImportConfigRollbackFailed"));
    }
    throw error;
  }

  return {
    ...canonicalized,
    rulesConfig,
    selectedRandomLootPackIds
  };
}

export async function migrateModuleData() {
  const migrationBackup = await createPreMigrationBackup({
    targetDataVersion: CURRENT_DATA_VERSION
  });
  const currentDataVersion = Number(game.settings.get(MODULE_ID, DATA_VERSION_SETTING_KEY) ?? 0);
  const changed = currentDataVersion !== CURRENT_DATA_VERSION;
  if (changed) {
    await game.settings.set(MODULE_ID, DATA_VERSION_SETTING_KEY, CURRENT_DATA_VERSION);
  }

  return {
    changed,
    currentDataVersion: CURRENT_DATA_VERSION,
    migrationBackup
  };
}
