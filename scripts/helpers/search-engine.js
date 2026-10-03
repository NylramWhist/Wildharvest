import { MODULE_ID } from "../constants.js";
import { formatModuleNumber, t } from "../i18n.js";
import {
  getLootPoolById,
  getLootPoolPackIds,
  getRulesConfig,
  isSystemSkillRollEnabled
} from "../settings.js";
import { describeDnd5eSkillRoll, resolveDnd5eSkillId, rollDnd5eSkill } from "./dnd5e-support.js";
import {
  buildRarityPools,
  getLootPointsForRollTotal as getLootPointsForRollTotalFromBrackets,
  getLootResultTier,
  getRollFormula,
  isPhysicalItemDocument,
  normalizeCompendiumIndex,
  normalizeRollMode
} from "./search-engine-core.js";
import { buildRarityLoot } from "./loot-engine-rarity.js";
import { buildValueLoot } from "./loot-engine-value.js";
import { createCompendiumIndexCache } from "./compendium-index-cache-core.js";
import { filterEntriesByFolders, getAllowedPackFolderIds, getPackFolderRecords } from "./folder-filter-core.js";
import { countAffordableValueEntries, getDocumentPriceCopper } from "./loot-engine-value-core.js";
import {
  aggregateTableItemResults,
  getItemUuidDocumentId,
  getItemUuidPackId,
  getTableDrawPlan
} from "./table-loot-core.js";

const COMPENDIUM_INDEX_FIELDS = Object.freeze([
  "name",
  "type",
  "img",
  "system.rarity",
  "system.details.rarity",
  "system.price.value",
  "system.price.denomination"
]);

const compendiumIndexCache = createCompendiumIndexCache(async (packId, pack) => {
  const index = await pack.getIndex({ fields: [...COMPENDIUM_INDEX_FIELDS] });
  return normalizeCompendiumIndex(index).filter(isPhysicalItemDocument).map((document) => ({
    packId,
    document,
    priceCopper: getDocumentPriceCopper(document)
  }));
});

const RARITY_LABEL_KEYS = Object.freeze({
  common: "WILDHARVEST.Rarity.Common",
  uncommon: "WILDHARVEST.Rarity.Uncommon",
  rare: "WILDHARVEST.Rarity.Rare",
  veryRare: "WILDHARVEST.Rarity.VeryRare",
  legendary: "WILDHARVEST.Rarity.Legendary"
});

function getConfiguredRarityDefinitions() {
  return getRulesConfig().rarityRules.map((rule) => ({
    ...rule,
    labelKey: RARITY_LABEL_KEYS[rule.id] ?? null,
    label: t(RARITY_LABEL_KEYS[rule.id] ?? rule.id)
  }));
}

function getLootPointsForRollTotal(rollTotal) {
  return getLootPointsForRollTotalFromBrackets(rollTotal, getRulesConfig().lootPointBrackets);
}

const LOOT_RESULT_MESSAGE_KEYS = Object.freeze({
  none: "WILDHARVEST.Result.NoLoot",
  some: "WILDHARVEST.Result.SomeLoot",
  good: "WILDHARVEST.Result.GoodLoot",
  rich: "WILDHARVEST.Result.RichLoot"
});

export function getLootResultMessage(lootSummary) {
  const tier = getLootResultTier(lootSummary?.lootPoints, getRulesConfig().lootPointBrackets);
  return t(LOOT_RESULT_MESSAGE_KEYS[tier]);
}

function getPackFromId(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return null;
  if (pack.documentName !== "Item") {
    throw new Error(t("WILDHARVEST.Errors.PackNotItemCompendium", { pack: packId }));
  }
  return pack;
}

// Every preset has its own loot pool; the "@selected" fallback compendiums were removed in 1.21.0.
function resolveLootSource(activity) {
  const lootPoolId = String(activity?.lootPoolId ?? "").trim();
  if (!lootPoolId) {
    throw new Error(t("WILDHARVEST.Errors.LootPoolNotSet", { activity: String(activity?.name ?? "").trim() }));
  }

  // Since 1.25.0 a preset's pool has the preset's id; scenes sent earlier may carry an older pool id.
  const lootPool = getLootPoolById(lootPoolId) ?? getLootPoolById(activity?.id);
  if (!lootPool) {
    throw new Error(t("WILDHARVEST.Errors.LootPoolMissing", { pool: lootPoolId }));
  }

  return {
    sourceType: "loot-pool",
    lootPoolId: lootPool.id,
    lootPoolLabel: lootPool.name,
    packIds: getLootPoolPackIds(lootPool.id),
    folderIds: Array.isArray(lootPool.folderIds) ? [...lootPool.folderIds] : [],
    difficulty: Number(lootPool.difficulty) || 0,
    tableIds: Array.isArray(lootPool.tableIds) ? [...lootPool.tableIds] : [],
    tableMode: lootPool.tableMode === "pool" ? "pool" : "draw"
  };
}

// 1.36.0: with roll tables in "draw" mode every Loot Point is one draw and the compendiums are not used.
function drawsFromTables(lootSource) {
  return lootSource?.tableMode !== "pool" && (lootSource?.tableIds?.length ?? 0) > 0;
}

async function getRollTable(uuid) {
  let table = null;
  try {
    table = await foundry.utils.fromUuid(uuid);
  } catch (_error) {
    table = null;
  }
  return table?.documentName === "RollTable" ? table : null;
}

// The preset's tables that still exist. A deleted table is skipped with a console warning, so one
// missing table does not stop the search; only when none is left does the search fail.
async function getAvailableRollTables(tableIds, { required = true } = {}) {
  const tables = [];
  for (const uuid of Array.isArray(tableIds) ? tableIds : []) {
    const table = await getRollTable(uuid);
    if (table) tables.push(table);
    else console.warn(`${MODULE_ID} | Roll table ${uuid} is missing and is skipped.`);
  }
  if (required && !tables.length && tableIds?.length) {
    throw new Error(t("WILDHARVEST.Errors.TableMissing", { table: tableIds.join(", ") }));
  }
  return tables;
}

// Index entries of a compendium by document id, built once per cached index (1.36.0).
const compendiumEntryMaps = new WeakMap();
function getCompendiumEntryMap(entries) {
  let map = compendiumEntryMaps.get(entries);
  if (!map) {
    map = new Map(entries.map((entry) => [String(entry.document?._id ?? ""), entry]));
    compendiumEntryMaps.set(entries, map);
  }
  return map;
}

// Index entry of an Item from a table result: the compendium index (with prices) when the Item is in
// a compendium, the world Item otherwise.
async function getTableResultItem(documentUuid) {
  const packId = getItemUuidPackId(documentUuid);
  if (packId) {
    const pack = game.packs.get(packId);
    if (!pack || pack.documentName !== "Item") return null;
    const documentId = getItemUuidDocumentId(documentUuid);
    const entries = await compendiumIndexCache.get(packId, pack);
    return getCompendiumEntryMap(entries).get(documentId) ?? null;
  }
  const item = foundry.utils.fromUuidSync(documentUuid, { strict: false });
  if (!item || item.documentName !== "Item") return null;
  return { packId: "", document: item, priceCopper: getDocumentPriceCopper(item) };
}

async function drawTableLoot(lootPoints, lootSource) {
  const tables = new Map((await getAvailableRollTables(lootSource.tableIds)).map((table) => [table.uuid, table]));
  const plan = getTableDrawPlan([...tables.keys()], lootPoints);
  const results = [];
  for (const uuid of plan) {
    // RollTable#roll draws without a chat message and without marking results as drawn.
    const draw = await tables.get(uuid).roll();
    for (const result of draw?.results ?? []) {
      const documentUuid = result?.type === "document" ? String(result.documentUuid ?? "") : "";
      const entry = documentUuid ? await getTableResultItem(documentUuid) : null;
      results.push({ documentUuid, item: entry?.document ?? null, priceCopper: entry?.priceCopper ?? null });
    }
  }
  const { rewards, skipped } = aggregateTableItemResults(results, { isPhysicalItem: isPhysicalItemDocument });
  const prices = new Map(results.map((entry) => [entry.documentUuid, entry.priceCopper]));
  for (const reward of rewards) {
    const priceCopper = Number(prices.get(String(reward.id).replace(/^table:/, "")));
    if (Number.isFinite(priceCopper) && priceCopper > 0) reward.unitValueGp = priceCopper / 100;
  }
  return {
    rewards,
    lootSummary: { strategy: "table", lootPoints, tableDraws: plan.length, skippedResults: skipped }
  };
}

// 1.36.0 "pool" mode: the Items of the tables (compendium Items only) join the compendium pool;
// the table weights are not used.
async function getTablePoolDocuments(tableIds) {
  const entries = [];
  const seen = new Set();
  for (const table of await getAvailableRollTables(tableIds, { required: false })) {
    for (const result of table.results?.contents ?? []) {
      const documentUuid = result?.type === "document" ? String(result.documentUuid ?? "") : "";
      if (!documentUuid || seen.has(documentUuid) || !getItemUuidPackId(documentUuid)) continue;
      seen.add(documentUuid);
      const entry = await getTableResultItem(documentUuid);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

// 1.37.0: a compendium with selected folders gives only the items in them and their subfolders.
function getPackAllowedFolderIds(pack, packId, folderIds) {
  return getAllowedPackFolderIds(getPackFolderRecords(pack), folderIds, packId);
}

async function getCompendiumDocumentsForPackIds(packIds, emptyErrorMessage, folderIds = []) {
  const normalizedPackIds = [...new Set((Array.isArray(packIds) ? packIds : [packIds])
    .map((packId) => String(packId ?? "").trim())
    .filter(Boolean))];

  const pooledDocuments = [];
  for (const packId of normalizedPackIds) {
    const pack = getPackFromId(packId);
    if (!pack) continue;
    let documents = await compendiumIndexCache.get(packId, pack);
    const allowedFolderIds = getPackAllowedFolderIds(pack, packId, folderIds);
    if (allowedFolderIds) documents = filterEntriesByFolders(documents, allowedFolderIds);
    if (!documents.length) continue;
    pooledDocuments.push(...documents);
  }

  if (!pooledDocuments.length) {
    throw new Error(emptyErrorMessage);
  }

  return pooledDocuments;
}

export function clearSearchCompendiumCache(packId = null) {
  compendiumIndexCache.invalidate(packId);
}

// 1.35.0: the preset's difficulty raises (or lowers) every Loot Point threshold, which is the same
// as taking it off the roll total before the thresholds are read. The summary keeps the difficulty.
async function buildLootPointCompendiumRewardsFromPool(rollTotal, lootSource, pooledDocuments, rulesConfig = getRulesConfig()) {
  const difficulty = Number(lootSource?.difficulty) || 0;
  const lootPoints = getLootPointsForRollTotal(Number(rollTotal) - difficulty);
  if (drawsFromTables(lootSource)) {
    const drawn = await drawTableLoot(lootPoints, lootSource);
    if (difficulty) drawn.lootSummary.difficulty = difficulty;
    return drawn;
  }
  const generated = rulesConfig.lootMode === "value"
    ? await buildValueLoot({
      lootPoints,
      lootSource,
      pooledDocuments,
      valueRules: rulesConfig.valueRules
    })
    : await buildRarityLoot({
      lootPoints,
      lootSource,
      pooledDocuments,
      definitions: rulesConfig.rarityRules.map((rule) => ({
        ...rule,
        label: t(RARITY_LABEL_KEYS[rule.id] ?? rule.id)
      }))
    });
  if (difficulty && generated?.lootSummary) generated.lootSummary.difficulty = difficulty;
  return generated;
}

// Compendium items of the loot source, plus the Items of its tables in "pool" mode (1.36.0).
async function getLootSourceDocuments(lootSource) {
  if (drawsFromTables(lootSource)) return [];
  const emptyMessage = t("WILDHARVEST.Errors.LootPoolEmpty", { pool: lootSource.lootPoolLabel });
  const tableEntries = lootSource.tableIds?.length ? await getTablePoolDocuments(lootSource.tableIds) : [];
  if (!tableEntries.length) return getCompendiumDocumentsForPackIds(lootSource.packIds, emptyMessage, lootSource.folderIds);
  let packEntries = [];
  if (lootSource.packIds?.length) {
    try {
      packEntries = await getCompendiumDocumentsForPackIds(lootSource.packIds, emptyMessage, lootSource.folderIds);
    } catch (_error) {
      packEntries = [];
    }
  }
  const keys = new Set(packEntries.map((entry) => `${entry.packId}:${entry.document?._id}`));
  return [...packEntries, ...tableEntries.filter((entry) => !keys.has(`${entry.packId}:${entry.document?._id}`))];
}

async function buildLootPointCompendiumRewards(rollTotal, lootSource) {
  const rulesConfig = getRulesConfig();
  const pooledDocuments = await getLootSourceDocuments(lootSource);

  return buildLootPointCompendiumRewardsFromPool(rollTotal, lootSource, pooledDocuments, rulesConfig);
}

// With an actor and the "D&D5e skill roll" setting on, the check goes through the system (1.24.0);
// otherwise, or when the system cannot roll this skill, the module rolls d20 + modifier itself.
async function rollSearchCheck({ actor, activity, modifier, extraModifier, rollMode }) {
  if (actor && isSystemSkillRollEnabled()) {
    const skillId = resolveDnd5eSkillId(activity);
    const systemRoll = skillId
      ? await rollDnd5eSkill(actor, skillId, { rollMode, extraModifier })
      : null;
    if (systemRoll) {
      const described = describeDnd5eSkillRoll(systemRoll);
      return {
        roll: systemRoll,
        modifier: described.modifier ?? modifier,
        rollMode: described.rollMode,
        rollSource: "dnd5e"
      };
    }
  }
  const roll = await new Roll(getRollFormula(modifier, { rollMode })).evaluate();
  return { roll, modifier, rollMode, rollSource: "module" };
}

export async function executeSearch({
  activity,
  skillName,
  skillModifier,
  rollMode = "normal",
  advantage = false,
  actor = null,
  extraModifier = 0
}) {
  const modifier = Number(skillModifier ?? 0);
  if (!Number.isFinite(modifier)) {
    throw new Error(t("WILDHARVEST.Errors.SkillModifierNumber"));
  }

  const lootSource = resolveLootSource(activity);
  const normalizedRollMode = normalizeRollMode({ rollMode, advantage });
  const check = await rollSearchCheck({
    actor,
    activity,
    modifier,
    extraModifier,
    rollMode: normalizedRollMode
  });
  const roll = check.roll;
  const generatedLoot = await buildLootPointCompendiumRewards(Number(roll.total ?? 0), lootSource);

  return {
    roll,
    lootMessage: getLootResultMessage(generatedLoot.lootSummary),
    rewards: generatedLoot.rewards,
    lootSummary: generatedLoot.lootSummary,
    skillName: skillName?.trim() || activity.skillLabel,
    modifier: check.modifier,
    rollSource: check.rollSource,
    rollMode: check.rollMode,
    advantage: check.rollMode === "advantage"
  };
}

// 1.34.0: new loot for the same roll total, when the GM asks for it in the review window.
export async function rerollSearchLoot(activity, rollTotal) {
  const generatedLoot = await buildLootPointCompendiumRewards(Number(rollTotal ?? 0), resolveLootSource(activity));
  return {
    rewards: generatedLoot.rewards,
    lootSummary: generatedLoot.lootSummary,
    lootMessage: getLootResultMessage(generatedLoot.lootSummary)
  };
}

export async function previewLootRewards(activity, sampleRollTotals = [10, 14, 18, 22, 28]) {
  const lootSource = resolveLootSource(activity);
  const rulesConfig = getRulesConfig();
  const rarityDefinitions = getConfiguredRarityDefinitions();
  const pooledDocuments = await getLootSourceDocuments(lootSource);
  const tableDraws = drawsFromTables(lootSource);
  const normalizedTotals = [...new Set(
    (Array.isArray(sampleRollTotals) ? sampleRollTotals : [sampleRollTotals])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  )].sort((left, right) => left - right);
  const rarityPools = !tableDraws && rulesConfig.lootMode === "rarity"
    ? buildRarityPools(pooledDocuments, rarityDefinitions)
    : null;

  const samples = [];
  for (const rollTotal of normalizedTotals) {
    const sample = await buildLootPointCompendiumRewardsFromPool(
      rollTotal,
      lootSource,
      pooledDocuments,
      rulesConfig
    );
    samples.push({
      rollTotal,
      lootPoints: sample.lootSummary.lootPoints,
      strategy: sample.lootSummary.strategy,
      selectionGroups: sample.lootSummary.selectionGroups,
      rarityGroups: sample.lootSummary.rarityGroups ?? [],
      totalValueGp: sample.lootSummary.totalValueGp ?? null,
      targetValueGp: sample.lootSummary.targetValueGp ?? null,
      tolerancePercent: sample.lootSummary.tolerancePercent ?? null,
      invalidPriceCount: sample.lootSummary.invalidPriceCount ?? 0,
      unaffordableCount: sample.lootSummary.unaffordableCount ?? 0,
      duplicateEntryCount: sample.lootSummary.duplicateEntryCount ?? 0,
      rewards: sample.rewards
    });
  }

  if (tableDraws) {
    const tables = await getAvailableRollTables(lootSource.tableIds);
    return {
      lootSource,
      strategy: "table",
      totalItems: tables.reduce((sum, table) => sum + (table.results?.size ?? 0), 0),
      breakdown: tables.map((table) => ({
        id: table.uuid,
        label: table.name,
        cost: null,
        count: table.results?.size ?? 0
      })),
      samples
    };
  }

  return {
    lootSource,
    strategy: rulesConfig.lootMode,
    // 1.37.1: the preview counts the pool; one value search gives at most this many different items.
    maxDistinctItems: rulesConfig.lootMode === "value" ? rulesConfig.valueRules.maxDistinctItems : null,
    totalItems: pooledDocuments.length,
    breakdown: rulesConfig.lootMode === "value"
      ? rulesConfig.valueRules.brackets.map((bracket) => ({
        id: `lp-${bracket.lootPoints}`,
        label: `${bracket.lootPoints} ${t("WILDHARVEST.Units.LootPointsShort")}`,
        cost: `${formatModuleNumber(bracket.targetGp)} GP`,
        count: countAffordableValueEntries(pooledDocuments, bracket.targetGp, rulesConfig.valueRules.tolerancePercent)
      }))
      : rarityDefinitions.map((definition) => ({
        id: definition.id,
        label: definition.label,
        cost: definition.cost,
        weight: definition.weight,
        quantityFormula: definition.quantityFormula,
        count: rarityPools?.[definition.id]?.length ?? 0
      })),
    samples
  };
}


