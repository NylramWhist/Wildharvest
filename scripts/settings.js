import {
  DATA_VERSION_SETTING_KEY,
  LEGACY_PLAYER_REQUEST_FLAG,
  LEGACY_RANDOM_LOOT_PACK_SETTING_KEY,
  LEGACY_LOCATIONS_SETTING_KEY,
  LEGACY_LOOT_POOLS_SETTING_KEY,
  MIGRATION_BACKUPS_SETTING_KEY,
  MODULE_ID,
  PRESETS_SETTING_KEY,
  RULES_SETTING_KEY,
  SEARCH_LOG_FLAG,
  SEARCH_SESSIONS_SETTING_KEY,
  SYSTEM_SKILL_ROLL_SETTING_KEY,
  LOOT_APPROVAL_SETTING_KEY,
  CHAT_RESULT_MODES,
  CHAT_RESULT_SETTING_KEY
} from "./constants.js";
import { DEFAULT_RULES_CONFIG } from "./data/default-rules.js";
import { WildharvestPresetsData } from "./data/presets-model.js";
import {
  applySettingsTransaction,
  SettingsTransactionError
} from "./helpers/settings-transaction-core.js";
import { DATA_VERSION } from "./helpers/data-format-core.js";
import {
  MAX_VALUE_DISTINCT_ITEMS,
  MAX_VALUE_MAX_TOTAL_ITEMS,
  MIN_VALUE_MAX_TOTAL_ITEMS
} from "./helpers/loot-engine-value-core.js";
import { createPreMigrationBackup, getRawWorldSetting } from "./helpers/migration-backup.js";
import { migrateSearchHistoryStore } from "./helpers/search-history-core.js";
import { migratePersistedSearchSessions } from "./helpers/search-session-state.js";
import {
  buildPresetCatalog,
  buildPresetLootPools,
  normalizePackIds,
  normalizePresetList,
  presetsFromLegacyConfig
} from "./helpers/preset-core.js";
import { t } from "./i18n.js";

function normalizePackId(value) {
  return String(value ?? "").trim();
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

  // 1.37.1: an emptied field (null or "") is an error, not a silent 20; a missing field (older
  // configuration files and saved rules) still gets the default.
  if (source.maxDistinctItems === null || source.maxDistinctItems === "") {
    throw new Error(t("WILDHARVEST.Errors.ValueDistinctItemsInvalid", { max: MAX_VALUE_DISTINCT_ITEMS }));
  }
  const distinctItems = Number(source.maxDistinctItems ?? DEFAULT_RULES_CONFIG.valueRules.maxDistinctItems);
  if (!Number.isInteger(distinctItems) || distinctItems < 1 || distinctItems > MAX_VALUE_DISTINCT_ITEMS) {
    throw new Error(t("WILDHARVEST.Errors.ValueDistinctItemsInvalid", { max: MAX_VALUE_DISTINCT_ITEMS }));
  }

  // 1.39.0 (D25): the total copy limit. Rules saved before this version have no field, so they get
  // the default; an emptied field in the form is an error, as with the limit of different items.
  if (source.maxTotalItems === null || source.maxTotalItems === "") {
    throw new Error(t("WILDHARVEST.Errors.ValueMaxTotalItemsInvalid", {
      min: MIN_VALUE_MAX_TOTAL_ITEMS,
      max: MAX_VALUE_MAX_TOTAL_ITEMS
    }));
  }
  const maxTotalItems = Number(source.maxTotalItems ?? DEFAULT_RULES_CONFIG.valueRules.maxTotalItems);
  if (!Number.isInteger(maxTotalItems)
    || maxTotalItems < MIN_VALUE_MAX_TOTAL_ITEMS
    || maxTotalItems > MAX_VALUE_MAX_TOTAL_ITEMS) {
    throw new Error(t("WILDHARVEST.Errors.ValueMaxTotalItemsInvalid", {
      min: MIN_VALUE_MAX_TOTAL_ITEMS,
      max: MAX_VALUE_MAX_TOTAL_ITEMS
    }));
  }

  return {
    tolerancePercent: Math.round(tolerancePercent * 100) / 100,
    maxDistinctItems: distinctItems,
    maxTotalItems,
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

export function serializeRulesConfig(rulesConfig) {
  return JSON.stringify(rulesConfig, null, 2);
}

const CURRENT_DEFAULT_RULES_TEXT = serializeRulesConfig(DEFAULT_RULES_CONFIG);
const CURRENT_DATA_VERSION = DATA_VERSION;
// Version 2 (1.25.0) stores "presets"; version 1 files ("locations" + "lootPools") are still read.
const CONFIG_EXPORT_VERSION = 2;
const CONFIG_EXPORT_FORMAT = "wildharvest-config";

export function isWildharvestConfigExport(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && value.format === CONFIG_EXPORT_FORMAT);
}

export function registerSettings() {
  game.settings.register(MODULE_ID, PRESETS_SETTING_KEY, {
    name: "WILDHARVEST.Setting.Presets.Name",
    hint: "WILDHARVEST.Setting.Presets.Hint",
    scope: "world",
    config: false,
    type: WildharvestPresetsData,
    default: { presets: [] }
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

  game.settings.register(MODULE_ID, SYSTEM_SKILL_ROLL_SETTING_KEY, {
    name: "WILDHARVEST.Setting.SystemSkillRoll.Name",
    hint: "WILDHARVEST.Setting.SystemSkillRoll.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, LOOT_APPROVAL_SETTING_KEY, {
    name: "WILDHARVEST.Setting.LootApproval.Name",
    hint: "WILDHARVEST.Setting.LootApproval.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, CHAT_RESULT_SETTING_KEY, {
    name: "WILDHARVEST.Setting.ChatResult.Name",
    hint: "WILDHARVEST.Setting.ChatResult.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "WILDHARVEST.Setting.ChatResult.Off",
      public: "WILDHARVEST.Setting.ChatResult.Public",
      gm: "WILDHARVEST.Setting.ChatResult.Gm"
    },
    default: "off"
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

export function isSystemSkillRollEnabled() {
  try {
    return game.settings.get(MODULE_ID, SYSTEM_SKILL_ROLL_SETTING_KEY) !== false;
  } catch (_error) {
    return true;
  }
}

export function isLootApprovalEnabled() {
  try {
    return game.settings.get(MODULE_ID, LOOT_APPROVAL_SETTING_KEY) === true;
  } catch (_error) {
    return false;
  }
}

export function getChatResultMode() {
  try {
    const mode = game.settings.get(MODULE_ID, CHAT_RESULT_SETTING_KEY);
    return CHAT_RESULT_MODES.includes(mode) ? mode : "off";
  } catch (_error) {
    return "off";
  }
}

export function getRulesConfigText() {
  return game.settings.get(MODULE_ID, RULES_SETTING_KEY) ?? CURRENT_DEFAULT_RULES_TEXT;
}

// The old settings were String settings holding JSON text; a restored backup may hold the array
// itself. Returns the array, or null when the setting is missing or unreadable.
function readLegacyPresetSetting(key) {
  const setting = getRawWorldSetting(key);
  if (!setting) return null;
  let value = setting.value;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch (_error) {
    return null;
  }
  return Array.isArray(value) ? value : null;
}

// Presets as plain objects. Until the migration to data version 3 has run (the active GM does it
// at start), a world that still has the old "locations" + "lootPools" settings is read from them.
export function getPresets() {
  try {
    if (!getRawWorldSetting(PRESETS_SETTING_KEY)) {
      const legacyLocations = readLegacyPresetSetting(LEGACY_LOCATIONS_SETTING_KEY);
      if (legacyLocations) {
        return presetsFromLegacyConfig(legacyLocations, readLegacyPresetSetting(LEGACY_LOOT_POOLS_SETTING_KEY) ?? []);
      }
    }
    const stored = game.settings.get(MODULE_ID, PRESETS_SETTING_KEY);
    const plain = typeof stored?.toObject === "function" ? stored.toObject() : stored;
    return normalizePresetList(plain?.presets ?? []);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to load presets.`, error);
    ui.notifications?.error(t("WILDHARVEST.Notifications.ConfigInvalid"));
    return [];
  }
}

export async function savePresets(presets) {
  const normalized = normalizePresetList(presets);
  await game.settings.set(MODULE_ID, PRESETS_SETTING_KEY, { presets: normalized });
  return normalized;
}

function getSkillLabelForCatalog(skillId) {
  if (!skillId) return t("WILDHARVEST.Default.SkillLabel");
  const entry = globalThis.CONFIG?.DND5E?.skills?.[skillId];
  const label = typeof entry === "string" ? entry : entry?.label;
  if (!label) return skillId;
  return label.includes(".") ? (game.i18n?.localize?.(label) ?? label) : label;
}

// Read-only view of the presets in the location + activity + loot pool shape that scenes,
// the roll dialogs and the loot engine use. The location is not stored anywhere (1.25.0).
export function getLocations() {
  return buildPresetCatalog(getPresets(), {
    name: t("WILDHARVEST.Default.ActivityCatalogName"),
    description: t("WILDHARVEST.Default.ActivityCatalogDescription"),
    skillLabel: getSkillLabelForCatalog
  });
}

export function getLootPools() {
  return buildPresetLootPools(getPresets()).map((lootPool) => ({
    ...lootPool,
    packIds: filterAvailableItemPackIds(lootPool.packIds)
  }));
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
  const normalizedLootPoolId = String(lootPoolId ?? "").trim() || null;
  if (!normalizedLootPoolId) return null;

  return getLootPools().find((lootPool) => lootPool.id === normalizedLootPoolId) ?? null;
}

export function getLootPoolPackIds(lootPoolId) {
  return getLootPoolById(lootPoolId)?.packIds ?? [];
}

export function parseRulesConfigFromText(rawText) {
  const parsed = JSON.parse(rawText);
  return normalizeRulesConfig(parsed);
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
    presets: getPresets(),
    rulesConfig: getRulesConfig()
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

  // Version 1 files (1.20.x–1.24.x) hold "locations" + "lootPools" instead of "presets".
  const importedPresets = Array.isArray(parsed.presets)
    ? normalizePresetList(parsed.presets)
    : presetsFromLegacyConfig(parsed.locations ?? [], parsed.lootPools ?? []);
  const presets = importedPresets.map((preset) => ({
    ...preset,
    packIds: filterAvailableItemPackIds(preset.packIds)
  }));
  // Exports from 1.20.x may carry selectedRandomLootPackIds; that fallback no longer exists.
  const rulesConfig = normalizeRulesConfig(parsed.rulesConfig ?? parsed.rules ?? {});

  const changes = [
    { key: PRESETS_SETTING_KEY, value: { presets } },
    // The data version is left alone: importing configuration does not migrate actor history
    // or scenes, so only migrateModuleData may mark the world data as current.
    { key: RULES_SETTING_KEY, value: serializeRulesConfig(rulesConfig) }
  ];

  try {
    await applySettingsTransaction(changes, {
      getValue: (key) => {
        const value = game.settings.get(MODULE_ID, key);
        return typeof value?.toObject === "function" ? value.toObject() : value;
      },
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
    presets,
    rulesConfig
  };
}

// Data version 2 (1.21.0): compact actor history, compact scenes, one flag key per player
// request, ISO timestamps, no "@selected" fallback setting. Every step is idempotent, so a
// failed run is simply repeated at the next start; the version is written only at the end.
async function migrateActorHistoryToV2() {
  const updates = [];
  for (const actor of game.actors?.contents ?? []) {
    const rawStore = actor.getFlag(MODULE_ID, SEARCH_LOG_FLAG);
    if (rawStore === undefined || rawStore === null) continue;
    const store = migrateSearchHistoryStore(foundry.utils.deepClone(rawStore));
    // Arrays are replaced whole on update, so fields dropped from entries do not survive the merge.
    updates.push({ _id: actor.id, [`flags.${MODULE_ID}.${SEARCH_LOG_FLAG}`]: store });
  }
  if (updates.length) await Actor.implementation.updateDocuments(updates);
  return updates.length;
}

async function migrateSearchSessionsToV2() {
  const sessions = migratePersistedSearchSessions(game.settings.get(MODULE_ID, SEARCH_SESSIONS_SETTING_KEY));
  if (!sessions) {
    console.warn(`${MODULE_ID} | Stored search sessions could not be read; they were left unchanged.`);
    return 0;
  }
  await game.settings.set(MODULE_ID, SEARCH_SESSIONS_SETTING_KEY, JSON.stringify(sessions));
  return sessions.length;
}

async function removeLegacyPlayerRequestFlags() {
  let removed = 0;
  for (const user of game.users?.contents ?? []) {
    if (user.getFlag(MODULE_ID, LEGACY_PLAYER_REQUEST_FLAG) === undefined) continue;
    await user.unsetFlag(MODULE_ID, LEGACY_PLAYER_REQUEST_FLAG);
    removed += 1;
  }
  return removed;
}

// The setting is no longer registered, so its stored world value is removed as a Setting document.
async function removeLegacyRandomLootPackSetting() {
  const setting = getRawWorldSetting(LEGACY_RANDOM_LOOT_PACK_SETTING_KEY);
  if (!setting) return false;
  await setting.delete();
  return true;
}

async function migrateToDataVersion2() {
  return {
    actorsWithHistory: await migrateActorHistoryToV2(),
    searchSessions: await migrateSearchSessionsToV2(),
    legacyPlayerRequests: await removeLegacyPlayerRequestFlags(),
    legacyRandomLootPackRemoved: await removeLegacyRandomLootPackSetting()
  };
}

// Data version 3 (1.25.0): the presets move from the "locations" + "lootPools" JSON texts to the
// "presets" setting (PresetsData). Idempotent: without the old settings there is nothing to do.
async function migrateToDataVersion3() {
  const locationsSetting = getRawWorldSetting(LEGACY_LOCATIONS_SETTING_KEY);
  const lootPoolsSetting = getRawWorldSetting(LEGACY_LOOT_POOLS_SETTING_KEY);
  if (!locationsSetting && !lootPoolsSetting) return { presets: null, legacySettingsRemoved: 0 };

  const legacyLocations = locationsSetting ? readLegacyPresetSetting(LEGACY_LOCATIONS_SETTING_KEY) : [];
  const legacyLootPools = lootPoolsSetting ? readLegacyPresetSetting(LEGACY_LOOT_POOLS_SETTING_KEY) : [];
  if (!legacyLocations || !legacyLootPools) {
    // Unreadable old presets stay where they are (and in the backup) instead of being deleted.
    console.warn(`${MODULE_ID} | Old preset settings could not be read; they were left unchanged.`);
    return { presets: null, legacySettingsRemoved: 0 };
  }
  const presets = presetsFromLegacyConfig(legacyLocations, legacyLootPools);
  await savePresets(presets);

  let legacySettingsRemoved = 0;
  for (const setting of [locationsSetting, lootPoolsSetting]) {
    if (!setting) continue;
    await setting.delete();
    legacySettingsRemoved += 1;
  }
  return { presets: presets.length, legacySettingsRemoved };
}

export async function migrateModuleData() {
  const storedDataVersion = Number(game.settings.get(MODULE_ID, DATA_VERSION_SETTING_KEY) ?? 0);
  const changed = storedDataVersion !== CURRENT_DATA_VERSION;
  // Back up only when the stored data version is about to change; a new module
  // release with the same data version has nothing to migrate.
  if (!changed) {
    return { changed, currentDataVersion: CURRENT_DATA_VERSION, migrationBackup: null };
  }

  const migrationBackup = await createPreMigrationBackup({
    targetDataVersion: CURRENT_DATA_VERSION
  });
  const steps = {
    v2: storedDataVersion < 2 ? await migrateToDataVersion2() : null,
    v3: storedDataVersion < 3 ? await migrateToDataVersion3() : null
  };
  await game.settings.set(MODULE_ID, DATA_VERSION_SETTING_KEY, CURRENT_DATA_VERSION);

  return {
    changed,
    sourceDataVersion: storedDataVersion,
    currentDataVersion: CURRENT_DATA_VERSION,
    migrationBackup,
    steps
  };
}
