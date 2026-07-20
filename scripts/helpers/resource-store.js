import { MODULE_ID, RESOURCES_FLAG, SEARCH_LOG_FLAG } from "../constants.js";
import { getManagedInventoryResources, grantRewardsToActorInventory } from "./inventory-store.js";
import { getRewardStackKey } from "./inventory-stacking-core.js";
import { getRewardDisplayName } from "./reward-utils.js";
import {
  createEmptySearchHistoryStore,
  normalizeSearchHistoryStore,
  upsertSearchHistoryEntry
} from "./search-history-core.js";

export function getActorResources(actor) {
  return foundry.utils.deepClone(actor.getFlag(MODULE_ID, RESOURCES_FLAG) ?? {});
}

export function getActorResourceList(actor) {
  const fallbackResources = Object.values(getActorResources(actor)).map((entry) => ({
    ...entry,
    type: "fallback"
  }));
  const inventoryResources = getManagedInventoryResources(actor);
  return [...inventoryResources, ...fallbackResources].sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

export async function addRewardsToActor(actor, rewards, { containerId = "" } = {}) {
  const summary = {
    inventory: [],
    fallback: [],
    requestedContainerId: "",
    containerId: "",
    containerName: "",
    containerFallback: false
  };
  const inventorySummary = await grantRewardsToActorInventory(actor, rewards, { containerId });

  summary.inventory = inventorySummary.inventory;
  summary.requestedContainerId = inventorySummary.requestedContainerId;
  summary.containerId = inventorySummary.containerId;
  summary.containerName = inventorySummary.containerName;
  summary.containerFallback = inventorySummary.containerFallback;

  if (summary.inventory.length) {
    const resources = getActorResources(actor);
    let changed = false;

    for (const { reward } of summary.inventory) {
      if (!reward) continue;
      const stackKey = getRewardStackKey(reward);
      for (const storedKey of new Set([stackKey, String(reward.id ?? "").trim()])) {
        if (!storedKey || !resources[storedKey]) continue;
        delete resources[storedKey];
        changed = true;
      }
    }

    if (changed) {
      await actor.setFlag(MODULE_ID, RESOURCES_FLAG, resources);
    }
  }

  if (!inventorySummary.failed.length) {
    return summary;
  }

  const resources = getActorResources(actor);

  for (const { reward } of inventorySummary.failed) {
    const stackKey = getRewardStackKey(reward);
    if (!stackKey) continue;
    const legacyKey = String(reward.id ?? "").trim();
    const existing = resources[stackKey] ?? resources[legacyKey] ?? {
      id: reward.id,
      stackKey,
      name: getRewardDisplayName(reward),
      quantity: 0
    };

    if (legacyKey && legacyKey !== stackKey) delete resources[legacyKey];
    existing.stackKey = stackKey;
    existing.name = getRewardDisplayName(reward);
    existing.quantity = Number(existing.quantity ?? 0) + Number(reward.quantity ?? 0);
    resources[stackKey] = existing;
  }

  await actor.setFlag(MODULE_ID, RESOURCES_FLAG, resources);
  summary.fallback = inventorySummary.failed.map(({ reward }) => ({
    mode: "fallback",
    quantity: reward.quantity,
    reward
  }));
  return summary;
}

export function getActorSearchLog(actor) {
  const rawStore = foundry.utils.deepClone(actor.getFlag(MODULE_ID, SEARCH_LOG_FLAG) ?? []);
  return normalizeSearchHistoryStore(rawStore).entries;
}

export async function appendSearchLog(actor, entry) {
  const rawStore = foundry.utils.deepClone(actor.getFlag(MODULE_ID, SEARCH_LOG_FLAG) ?? []);
  const store = upsertSearchHistoryEntry(rawStore, entry);
  await actor.setFlag(MODULE_ID, SEARCH_LOG_FLAG, store);
  return foundry.utils.deepClone(store.entries);
}

export async function appendSearchLogWithRetry(actor, entry, {
  attempts = 3,
  delayMs = 150
} = {}) {
  const attemptLimit = Math.max(1, Math.trunc(Number(attempts) || 1));
  let lastError = null;

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    try {
      return await appendSearchLog(actor, entry);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attemptLimit && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new Error("Failed to persist the Wildharvest search log.");
}

export async function clearActorSearchLog(actor) {
  await actor.setFlag(MODULE_ID, SEARCH_LOG_FLAG, createEmptySearchHistoryStore());
  return [];
}
