import { MODULE_ID, RESOURCES_FLAG, SEARCH_LOG_FLAG } from "../constants.js";
import { grantRewardsToActorInventory } from "./inventory-store.js";
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

// Stack keys contain dots (compendium UUIDs) and Foundry expands dotted keys when a
// document is updated, so fallback entries live at nested paths inside the flag.
// Read, write and delete them by path so every operation hits the same place.
function getStoredResource(resources, key) {
  if (!key) return undefined;
  const value = foundry.utils.getProperty(resources, key);
  return value && typeof value === "object" ? value : undefined;
}

function isEmptyBranch(value) {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every(isEmptyBranch);
}

async function removeStoredResource(actor, resources, key) {
  const segments = String(key ?? "").split(".");
  const parent = segments.length > 1
    ? foundry.utils.getProperty(resources, segments.slice(0, -1).join("."))
    : resources;
  if (parent && typeof parent === "object") delete parent[segments.at(-1)];

  // Remove the shortest ancestor left empty, so no hollow objects stay behind.
  let targetPath = segments.join(".");
  for (let length = 1; length < segments.length; length += 1) {
    const prefix = segments.slice(0, length).join(".");
    if (isEmptyBranch(foundry.utils.getProperty(resources, prefix))) {
      targetPath = prefix;
      break;
    }
  }

  // setFlag merges objects and cannot drop keys; unsetFlag is the documented way.
  await actor.unsetFlag(MODULE_ID, `${RESOURCES_FLAG}.${targetPath}`);
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
    const removedKeys = new Set();

    for (const { reward } of summary.inventory) {
      if (!reward) continue;
      const stackKey = getRewardStackKey(reward);
      for (const storedKey of new Set([stackKey, String(reward.id ?? "").trim()])) {
        if (!storedKey || removedKeys.has(storedKey) || !getStoredResource(resources, storedKey)) continue;
        removedKeys.add(storedKey);
        await removeStoredResource(actor, resources, storedKey);
      }
    }
  }

  if (!inventorySummary.failed.length) {
    return summary;
  }

  const resources = getActorResources(actor);
  const updates = {};
  const legacyKeysToRemove = new Set();

  for (const { reward } of inventorySummary.failed) {
    const stackKey = getRewardStackKey(reward);
    if (!stackKey) continue;
    const legacyKey = String(reward.id ?? "").trim();
    const existing = foundry.utils.deepClone(
      getStoredResource(resources, stackKey)
      ?? (legacyKey ? getStoredResource(resources, legacyKey) : undefined)
      ?? {
        id: reward.id,
        stackKey,
        name: getRewardDisplayName(reward),
        quantity: 0
      }
    );

    if (legacyKey && legacyKey !== stackKey && getStoredResource(resources, legacyKey)) {
      legacyKeysToRemove.add(legacyKey);
    }
    existing.stackKey = stackKey;
    existing.name = getRewardDisplayName(reward);
    existing.quantity = Number(existing.quantity ?? 0) + Number(reward.quantity ?? 0);
    foundry.utils.setProperty(resources, stackKey, existing);
    updates[`flags.${MODULE_ID}.${RESOURCES_FLAG}.${stackKey}`] = existing;
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
  }
  for (const legacyKey of legacyKeysToRemove) {
    await removeStoredResource(actor, getActorResources(actor), legacyKey);
  }

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
