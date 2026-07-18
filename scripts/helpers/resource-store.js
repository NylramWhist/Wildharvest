import { MODULE_ID, RESOURCES_FLAG, SEARCH_LOG_FLAG } from "../constants.js";
import { getManagedInventoryResources, grantRewardsToActorInventory } from "./inventory-store.js";
import { getRewardDisplayName } from "./reward-utils.js";

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
      if (!resources[reward.id]) continue;
      delete resources[reward.id];
      changed = true;
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
    const existing = resources[reward.id] ?? {
      id: reward.id,
      name: getRewardDisplayName(reward),
      quantity: 0
    };

    existing.name = getRewardDisplayName(reward);
    existing.quantity = Number(existing.quantity ?? 0) + Number(reward.quantity ?? 0);
    resources[reward.id] = existing;
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
  return foundry.utils.deepClone(actor.getFlag(MODULE_ID, SEARCH_LOG_FLAG) ?? []).slice(0, 10);
}

export async function appendSearchLog(actor, entry) {
  const log = getActorSearchLog(actor);
  log.unshift(entry);
  log.splice(10);
  await actor.setFlag(MODULE_ID, SEARCH_LOG_FLAG, log);
  return log;
}

export async function clearActorSearchLog(actor) {
  await actor.setFlag(MODULE_ID, SEARCH_LOG_FLAG, []);
  return [];
}
