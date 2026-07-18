import {
  getCompendiumDocumentId,
  getCompendiumEntryKey,
  getCompendiumRewardId
} from "./search-engine-core.js";

export async function evaluateLootQuantity(formula) {
  if (!formula) return 1;
  const roll = await new Roll(String(formula)).evaluate();
  return Math.max(0, Math.trunc(Number(roll.total) || 0));
}

export function chooseWeightedDefinition(definitions, random = Math.random) {
  const totalWeight = definitions.reduce((sum, entry) => sum + Number(entry.weight ?? 0), 0);
  if (totalWeight <= 0) return null;

  let remaining = random() * totalWeight;
  for (const entry of definitions) {
    remaining -= Number(entry.weight ?? 0);
    if (remaining <= 0) return entry;
  }

  return definitions.at(-1) ?? null;
}

export function addCompendiumReward(groupedRewards, pickedEntry, definitionId, metadata = {}) {
  const documentId = getCompendiumDocumentId(pickedEntry.document);
  if (!documentId) {
    throw new Error(`Compendium index entry in ${pickedEntry.packId} has no document ID.`);
  }

  const rewardKey = getCompendiumEntryKey(pickedEntry);
  const rewardId = getCompendiumRewardId(definitionId, pickedEntry);
  if (!rewardKey || !rewardId) {
    throw new Error(`Compendium reward in ${pickedEntry.packId} has incomplete identity.`);
  }
  const existing = groupedRewards.get(rewardKey) ?? {
    id: rewardId,
    name: pickedEntry.document.name,
    quantity: 0,
    uuid: null,
    pack: pickedEntry.packId,
    documentId,
    itemType: pickedEntry.document.type ?? null,
    img: pickedEntry.document.img ?? null,
    quantityPath: null,
    ...metadata
  };

  existing.quantity += 1;
  groupedRewards.set(rewardKey, existing);
}

export async function spendLootPoints({
  lootPoints,
  definitions,
  pools,
  evaluateQuantity = evaluateLootQuantity,
  random = Math.random,
  buildGroup,
  rewardMetadata
}) {
  const groupedRewards = new Map();
  const selectionGroups = [];
  const remainingDrawPools = new Map();
  let remainingPoints = Math.max(0, Math.trunc(Number(lootPoints) || 0));

  while (remainingPoints > 0) {
    const affordable = definitions.filter((entry) => (
      entry.cost <= remainingPoints
      && Number(entry.weight) > 0
      && pools[entry.id]?.length
    ));
    if (!affordable.length) break;

    const definition = chooseWeightedDefinition(affordable, random);
    if (!definition) break;
    remainingPoints -= definition.cost;

    const quantity = await evaluateQuantity(definition.quantityFormula);
    selectionGroups.push(buildGroup(definition, quantity));

    const pool = pools[definition.id] ?? [];
    for (let index = 0; index < quantity; index += 1) {
      let drawPool = remainingDrawPools.get(definition.id);
      if (!drawPool?.length) {
        drawPool = [...pool];
        remainingDrawPools.set(definition.id, drawPool);
      }
      const pickedIndex = Math.floor(random() * drawPool.length);
      const [pickedEntry] = drawPool.splice(pickedIndex, 1);
      if (!pickedEntry) continue;
      addCompendiumReward(
        groupedRewards,
        pickedEntry,
        definition.id,
        rewardMetadata?.(pickedEntry, definition) ?? {}
      );
    }
  }

  return {
    rewards: [...groupedRewards.values()],
    remainingPoints,
    selectionGroups
  };
}
