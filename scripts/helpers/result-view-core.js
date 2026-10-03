// 1.33.0 (W-10, W-11): pure helpers for the result window with many items. No Foundry globals.

// Order of the item groups in the result window (dnd5e physical item types); anything else is "other".
export const RESULT_TYPE_ORDER = Object.freeze(["weapon", "equipment", "consumable", "tool", "container", "loot"]);

// Value of one reward stack in GP, or null when the loot engine gave no price (Rarity mode).
export function getRewardStackValue(reward) {
  const unit = Number(reward?.unitValueGp);
  if (reward?.unitValueGp === undefined || reward?.unitValueGp === null || !Number.isFinite(unit)) return null;
  const quantity = Number(reward?.quantity);
  return unit * (Number.isFinite(quantity) ? quantity : 1);
}

// Most valuable stacks first; stacks without a price keep their order after the priced ones.
export function sortRewardsByValue(rewards) {
  const list = Array.isArray(rewards) ? rewards : [];
  return list
    .map((reward, index) => ({ reward, index, value: getRewardStackValue(reward) }))
    .sort((left, right) => {
      if (left.value === null && right.value === null) return left.index - right.index;
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      return right.value - left.value || left.index - right.index;
    })
    .map((entry) => entry.reward);
}

// Saved rewards carry "type"; rewards straight from the loot engine (a GM's own roll) carry "itemType".
function getRewardType(reward) {
  return String(reward?.type ?? reward?.itemType ?? "").trim();
}

// Groups by item type in RESULT_TYPE_ORDER, then "other". Rewards saved before 1.33.0 have no type,
// so a list where no reward has one comes back as one group without a type.
export function groupRewardsByType(rewards) {
  const list = Array.isArray(rewards) ? rewards : [];
  if (!list.some((reward) => getRewardType(reward))) {
    return list.length ? [{ type: "", rewards: list }] : [];
  }
  const groups = new Map();
  for (const reward of list) {
    const raw = getRewardType(reward);
    const type = RESULT_TYPE_ORDER.includes(raw) ? raw : "other";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(reward);
  }
  return [...RESULT_TYPE_ORDER, "other"]
    .filter((type) => groups.has(type))
    .map((type) => ({ type, rewards: groups.get(type) }));
}

// Lowest roll total that gives at least one Loot Point, or null when no bracket gives any.
export function getFirstLootThreshold(brackets) {
  const totals = (Array.isArray(brackets) ? brackets : [])
    .filter((bracket) => Number(bracket?.lootPoints) > 0 && Number.isFinite(Number(bracket?.minTotal)))
    .map((bracket) => Number(bracket.minTotal));
  return totals.length ? Math.min(...totals) : null;
}
