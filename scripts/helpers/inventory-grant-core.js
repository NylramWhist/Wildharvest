// Pure planning helpers for granting rewards in batches (no Foundry globals).

function normalizePart(value) {
  return String(value ?? "").trim();
}

// Groups rewards that end up in the same inventory stack, so one stack gets one create or update.
export function groupRewardsByStackKey(rewards, getStackKey) {
  const groups = new Map();
  const invalid = [];

  for (const [index, reward] of (Array.isArray(rewards) ? rewards : []).entries()) {
    const key = normalizePart(getStackKey(reward));
    if (!key) {
      invalid.push({ reward, index });
      continue;
    }

    const quantity = Number(reward?.quantity ?? 0);
    const group = groups.get(key) ?? { key, rewards: [], indexes: [], quantity: 0 };
    group.rewards.push(reward);
    group.indexes.push(index);
    group.quantity += Number.isFinite(quantity) ? quantity : 0;
    groups.set(key, group);
  }

  return { groups: [...groups.values()], invalid };
}

// How each reward's source Item is found: by UUID, by pack + document ID, or not at all.
export function getRewardSourceKind(reward) {
  if (normalizePart(reward?.uuid)) return "uuid";
  if (normalizePart(reward?.pack) && normalizePart(reward?.documentId)) return "pack";
  return "none";
}

// Document IDs to load per compendium, so each pack is read with one getDocuments call.
export function collectPackDocumentIds(rewards) {
  const packs = new Map();
  for (const reward of Array.isArray(rewards) ? rewards : []) {
    if (getRewardSourceKind(reward) !== "pack") continue;
    const packId = normalizePart(reward.pack);
    const ids = packs.get(packId) ?? new Set();
    ids.add(normalizePart(reward.documentId));
    packs.set(packId, ids);
  }
  return new Map([...packs].map(([packId, ids]) => [packId, [...ids]]));
}

// Restores the original reward order after batched processing.
export function sortByRewardIndex(entries) {
  return [...entries].sort((left, right) => Number(left.index) - Number(right.index));
}
