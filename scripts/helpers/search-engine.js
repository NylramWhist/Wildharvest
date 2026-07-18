import { t } from "../i18n.js";
import {
  getLootPoolById,
  getLootPoolPackIds,
  getRulesConfig,
  getSelectedRandomLootPackIds,
  getSelectedRandomLootPackLabel,
  hasSelectedRandomLootPacks
} from "../settings.js";
import {
  buildRarityPools,
  getLootPointsForRollTotal as getLootPointsForRollTotalFromBrackets,
  getRollFormula,
  normalizeCompendiumIndex,
  normalizeRollMode
} from "./search-engine-core.js";
import { buildRarityLoot } from "./loot-engine-rarity.js";
import { buildValueLoot } from "./loot-engine-value.js";

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

function getLootResultMessage(lootSummary) {
  const lootPoints = Number(lootSummary?.lootPoints ?? 0);
  if (lootPoints <= 0) {
    return t("WILDHARVEST.Result.NoLoot");
  }

  if (lootPoints <= 3) {
    return t("WILDHARVEST.Result.SomeLoot");
  }

  if (lootPoints <= 6) {
    return t("WILDHARVEST.Result.GoodLoot");
  }

  return t("WILDHARVEST.Result.RichLoot");
}

function getPackFromId(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return null;
  if (pack.documentName !== "Item") {
    throw new Error(t("WILDHARVEST.Errors.PackNotItemCompendium", { pack: packId }));
  }
  return pack;
}

function resolveLootSource(activity) {
  const lootPoolId = String(activity?.lootPoolId ?? "").trim();
  if (lootPoolId) {
    const lootPool = getLootPoolById(lootPoolId);
    if (!lootPool) {
      throw new Error(t("WILDHARVEST.Errors.LootPoolMissing", { pool: lootPoolId }));
    }

    return {
      sourceType: "loot-pool",
      lootPoolId: lootPool.id,
      lootPoolLabel: lootPool.name,
      packIds: getLootPoolPackIds(lootPool.id)
    };
  }

  if (!hasSelectedRandomLootPacks()) {
    throw new Error(t("WILDHARVEST.Errors.SelectedPackNotConfigured"));
  }

  return {
    sourceType: "selected-pack-fallback",
    lootPoolId: null,
    lootPoolLabel: getSelectedRandomLootPackLabel() || t("WILDHARVEST.Config.SelectedPackPlaceholder"),
    packIds: getSelectedRandomLootPackIds()
  };
}

async function getCompendiumDocumentsForPackIds(packIds, emptyErrorMessage = null) {
  const normalizedPackIds = [...new Set((Array.isArray(packIds) ? packIds : [packIds])
    .map((packId) => String(packId ?? "").trim())
    .filter(Boolean))];

  const pooledDocuments = [];
  for (const packId of normalizedPackIds) {
    const pack = getPackFromId(packId);
    if (!pack) continue;
    const index = await pack.getIndex({
      fields: [
        "name",
        "type",
        "img",
        "system.rarity",
        "system.details.rarity",
        "system.price.value",
        "system.price.denomination"
      ]
    });
    const documents = normalizeCompendiumIndex(index);
    if (!documents.length) continue;

    pooledDocuments.push(...documents.map((document) => ({
      packId,
      document
    })));
  }

  if (!pooledDocuments.length) {
    throw new Error(emptyErrorMessage || t("WILDHARVEST.Errors.SelectedPacksEmpty"));
  }

  return pooledDocuments;
}

async function buildLootPointCompendiumRewardsFromPool(rollTotal, lootSource, pooledDocuments, rulesConfig = getRulesConfig()) {
  const lootPoints = getLootPointsForRollTotal(rollTotal);
  if (rulesConfig.lootMode === "value") {
    return buildValueLoot({
      lootPoints,
      lootSource,
      pooledDocuments,
      valueRules: rulesConfig.valueRules
    });
  }

  return buildRarityLoot({
    lootPoints,
    lootSource,
    pooledDocuments,
    definitions: rulesConfig.rarityRules.map((rule) => ({
      ...rule,
      label: t(RARITY_LABEL_KEYS[rule.id] ?? rule.id)
    }))
  });
}

async function buildLootPointCompendiumRewards(rollTotal, lootSource) {
  const rulesConfig = getRulesConfig();
  const pooledDocuments = await getCompendiumDocumentsForPackIds(
    lootSource.packIds,
    lootSource.sourceType === "loot-pool"
      ? t("WILDHARVEST.Errors.LootPoolEmpty", { pool: lootSource.lootPoolLabel })
      : t("WILDHARVEST.Errors.SelectedPacksEmpty")
  );

  return buildLootPointCompendiumRewardsFromPool(rollTotal, lootSource, pooledDocuments, rulesConfig);
}

export async function executeSearch({ activity, skillName, skillModifier, rollMode = "normal", advantage = false }) {
  const modifier = Number(skillModifier ?? 0);
  if (!Number.isFinite(modifier)) {
    throw new Error(t("WILDHARVEST.Errors.SkillModifierNumber"));
  }

  const lootSource = resolveLootSource(activity);
  const normalizedRollMode = normalizeRollMode({ rollMode, advantage });
  const roll = await new Roll(getRollFormula(modifier, { rollMode: normalizedRollMode })).evaluate();
  const generatedLoot = await buildLootPointCompendiumRewards(Number(roll.total ?? 0), lootSource);

  return {
    roll,
    lootMessage: getLootResultMessage(generatedLoot.lootSummary),
    rewards: generatedLoot.rewards,
    lootSummary: generatedLoot.lootSummary,
    skillName: skillName?.trim() || activity.skillLabel,
    modifier,
    rollMode: normalizedRollMode,
    advantage: normalizedRollMode === "advantage"
  };
}

export async function previewLootRewards(activity, sampleRollTotals = [10, 14, 18, 22, 28]) {
  const lootSource = resolveLootSource(activity);
  const rulesConfig = getRulesConfig();
  const rarityDefinitions = getConfiguredRarityDefinitions();
  const pooledDocuments = await getCompendiumDocumentsForPackIds(
    lootSource.packIds,
    lootSource.sourceType === "loot-pool"
      ? t("WILDHARVEST.Errors.LootPoolEmpty", { pool: lootSource.lootPoolLabel })
      : t("WILDHARVEST.Errors.SelectedPacksEmpty")
  );
  const normalizedTotals = [...new Set(
    (Array.isArray(sampleRollTotals) ? sampleRollTotals : [sampleRollTotals])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  )].sort((left, right) => left - right);
  const rarityPools = rulesConfig.lootMode === "rarity"
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

  return {
    lootSource,
    strategy: rulesConfig.lootMode,
    totalItems: pooledDocuments.length,
    breakdown: rulesConfig.lootMode === "value"
      ? rulesConfig.valueRules.brackets.map((bracket) => ({
        id: `lp-${bracket.lootPoints}`,
        label: `${bracket.lootPoints} LP`,
        cost: `${bracket.targetGp} GP`,
        count: pooledDocuments.filter((entry) => entry.document?.system?.price).length
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


