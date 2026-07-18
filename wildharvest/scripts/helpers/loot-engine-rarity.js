import { buildRarityPools } from "./search-engine-core.js";
import { spendLootPoints } from "./loot-engine-common.js";

export async function buildRarityLoot({ lootPoints, lootSource, pooledDocuments, definitions }) {
  const pools = buildRarityPools(pooledDocuments, definitions);
  const spent = await spendLootPoints({
    lootPoints,
    definitions,
    pools,
    buildGroup: (definition, quantity) => ({
      id: definition.id,
      label: definition.label,
      quantity,
      cost: definition.cost
    })
  });

  return {
    rewards: spent.rewards,
    lootSummary: {
      mode: "loot-points-compendium",
      strategy: "rarity",
      sourceType: lootSource.sourceType,
      lootPoolId: lootSource.lootPoolId,
      lootPoolLabel: lootSource.lootPoolLabel,
      packIds: lootSource.packIds,
      lootPoints,
      remainingPoints: spent.remainingPoints,
      selectionGroups: spent.selectionGroups,
      rarityGroups: spent.selectionGroups
    },
    pools
  };
}
