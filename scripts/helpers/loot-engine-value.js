import { addCompendiumReward } from "./loot-engine-common.js";
import {
  formatCopperAsGp,
  getValueBudgetForLootPoints,
  selectValueBudgetItems
} from "./loot-engine-value-core.js";

export async function buildValueLoot({ lootPoints, lootSource, pooledDocuments, valueRules }) {
  const budget = getValueBudgetForLootPoints(lootPoints, valueRules.brackets);
  const selection = selectValueBudgetItems({
    pooledDocuments,
    targetGp: budget?.targetGp ?? 0,
    tolerancePercent: valueRules.tolerancePercent
  });
  const groupedRewards = new Map();
  for (const pickedEntry of selection.entries) {
    addCompendiumReward(groupedRewards, pickedEntry, "value", {
      unitValueCopper: pickedEntry.priceCopper,
      unitValueGp: formatCopperAsGp(pickedEntry.priceCopper)
    });
  }

  const selectionGroups = budget ? [{
    id: `lp-${budget.lootPoints}`,
    label: `${formatCopperAsGp(selection.totalCopper)} / ${formatCopperAsGp(selection.targetCopper)} GP`,
    quantity: selection.entries.length,
    cost: budget.lootPoints,
    targetGp: budget.targetGp
  }] : [];

  return {
    rewards: [...groupedRewards.values()],
    lootSummary: {
      mode: "loot-points-compendium",
      strategy: "value",
      sourceType: lootSource.sourceType,
      lootPoolId: lootSource.lootPoolId,
      lootPoolLabel: lootSource.lootPoolLabel,
      packIds: lootSource.packIds,
      lootPoints,
      remainingPoints: 0,
      selectionGroups,
      valueGroups: selectionGroups,
      valueBudget: budget,
      totalValueCopper: selection.totalCopper,
      totalValueGp: formatCopperAsGp(selection.totalCopper),
      targetValueGp: formatCopperAsGp(selection.targetCopper),
      minimumValueWithToleranceGp: formatCopperAsGp(selection.lowerCopper),
      maximumValueWithToleranceGp: formatCopperAsGp(selection.upperCopper),
      tolerancePercent: selection.tolerancePercent,
      exactTarget: selection.exactTarget,
      withinTolerance: selection.withinTolerance,
      invalidPriceCount: selection.invalidPriceCount,
      unaffordableCount: selection.unaffordableCount,
      duplicateEntryCount: selection.duplicateEntryCount,
      maxQuantityPerItem: selection.maxQuantityPerItem
    },
    selection
  };
}
