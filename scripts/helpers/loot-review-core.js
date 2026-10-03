// 1.34.0 (package 16): the GM checks the loot before it is given. Pure helpers, no Foundry globals.

function roundGp(value) {
  return Math.round(value * 100) / 100;
}

// Keeps the reward stacks whose positions are in keptIndexes. In Combined GP value mode the total
// value in the loot summary is counted again from what is left.
export function applyLootSelection(rewards, lootSummary, keptIndexes) {
  const list = Array.isArray(rewards) ? rewards : [];
  const kept = new Set((Array.isArray(keptIndexes) ? keptIndexes : [])
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < list.length));
  const selected = list.filter((_reward, index) => kept.has(index));
  const summary = lootSummary && typeof lootSummary === "object" ? { ...lootSummary } : lootSummary;
  // Engine details about the removed items no longer describe what is given.
  if (summary && selected.length !== list.length) {
    for (const key of ["totalValueCopper", "selectionGroups", "valueGroups", "rarityGroups"]) delete summary[key];
  }
  if (summary && summary.totalValueGp !== undefined && summary.totalValueGp !== null) {
    summary.totalValueGp = roundGp(selected.reduce((sum, reward) => {
      const unit = Number(reward?.unitValueGp);
      const quantity = Number(reward?.quantity);
      return sum + (Number.isFinite(unit) ? unit : 0) * (Number.isFinite(quantity) ? quantity : 1);
    }, 0));
  }
  return { rewards: selected, lootSummary: summary, removedCount: list.length - selected.length };
}

// 1.37.1: in Combined GP value mode the engine may end outside the tolerance range (a small or
// expensive pool, a low limit of different items). Returns the numbers for a note in the review
// window, or null when the loot is within the range or the mode is not value mode.
export function getValueToleranceNote(lootSummary) {
  if (!lootSummary || lootSummary.strategy !== "value") return null;
  const total = Number(lootSummary.totalValueGp);
  const target = Number(lootSummary.targetValueGp);
  const minimum = Number(lootSummary.minimumValueWithToleranceGp);
  const maximum = Number(lootSummary.maximumValueWithToleranceGp);
  if (![total, target, minimum, maximum].every(Number.isFinite) || target <= 0) return null;
  if (total >= minimum && total <= maximum) return null;
  return { total, target, minimum, maximum };
}

// The GM's choice in the review window: "approve" with the kept positions, "nothing", or "reroll".
export function normalizeLootDecision(decision, rewardCount) {
  const action = String(decision?.action ?? "approve");
  if (action === "reroll") return { action: "reroll" };
  if (action === "nothing") return { action: "approve", keptIndexes: [] };
  const all = Array.from({ length: Math.max(0, Math.trunc(Number(rewardCount) || 0)) }, (_value, index) => index);
  const keptIndexes = Array.isArray(decision?.keptIndexes) ? decision.keptIndexes : all;
  return { action: "approve", keptIndexes };
}
