import { MODULE_ID } from "../constants.js";
import { t } from "../i18n.js";
import {
  calculateGrantedQuantity
} from "./inventory-quantity-core.js";
import {
  getActorContainer,
  getItemContainerId,
  normalizeContainerId
} from "./inventory-container-core.js";
import {
  getRewardStackKey,
  INVENTORY_STACK_POLICY_VERSION,
  isMatchingRewardStack
} from "./inventory-stacking-core.js";
import { PHYSICAL_ITEM_TYPES } from "./search-engine-core.js";
import {
  collectPackDocumentIds,
  getRewardSourceKind,
  groupRewardsByStackKey,
  sortByRewardIndex
} from "./inventory-grant-core.js";

const KNOWN_QUANTITY_PATHS = [
  "system.quantity",
  "system.quantity.value",
  "system.qty",
  "system.qty.value",
  "system.amount",
  "system.amount.value",
  "system.stack.value"
];
const DND5E_CONTAINABLE_ITEM_TYPES = new Set(PHYSICAL_ITEM_TYPES);

function getDefaultItemImage() {
  return CONFIG.Item?.documentClass?.DEFAULT_ICON ?? "icons/svg/item-bag.svg";
}

function getAvailableItemTypes() {
  return Object.keys(CONFIG.Item?.typeLabels ?? {});
}

function getDefaultItemType(preferredType) {
  const itemTypes = getAvailableItemTypes();
  if (preferredType && itemTypes.includes(preferredType)) return preferredType;
  if (!itemTypes.length) return "loot";

  for (const candidate of ["loot", "equipment", "consumable", "treasure", "item"]) {
    if (itemTypes.includes(candidate)) return candidate;
  }

  return itemTypes[0];
}

function getQuantityPath(candidate, preferredPath) {
  const source = candidate?.toObject ? candidate.toObject() : candidate;
  if (preferredPath && foundry.utils.hasProperty(source, preferredPath)) {
    return preferredPath;
  }

  for (const path of KNOWN_QUANTITY_PATHS) {
    if (foundry.utils.hasProperty(source, path)) return path;
  }

  return null;
}

function getNumericAtPath(source, path) {
  if (!path) return null;
  const value = foundry.utils.getProperty(source, path);
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function setValueAtPath(target, path, value) {
  if (!path) return target;
  foundry.utils.setProperty(target, path, value);
  return target;
}

function buildModuleFlags(reward, rewardKey, quantityPath, sourceItem, containerId = "") {
  return {
    stackPolicyVersion: INVENTORY_STACK_POLICY_VERSION,
    rewardId: reward.id,
    rewardKey,
    quantityPath,
    containerId: normalizeContainerId(containerId) || null,
    sourceUuid: reward.uuid ?? sourceItem?.uuid ?? null,
    sourcePack: reward.pack ?? sourceItem?.compendium?.collection ?? null,
    sourceDocumentId: reward.documentId ?? sourceItem?.id ?? null
  };
}

function assertItemDocument(document, reward) {
  if (document.documentName === "Item") return document;
  throw new Error(t("WILDHARVEST.Errors.PackDocumentNotItem", {
    documentId: reward.documentId,
    pack: reward.pack
  }));
}

async function resolveUuidSource(reward) {
  const document = await foundry.utils.fromUuid(reward.uuid);
  if (!document) throw new Error(t("WILDHARVEST.Errors.SourceUuidMissing", { uuid: reward.uuid }));
  if (document.documentName !== "Item") {
    throw new Error(t("WILDHARVEST.Errors.SourceUuidNotItem", { uuid: reward.uuid }));
  }
  return document;
}

// Loads every source Item with one getDocuments query per compendium instead of one request per reward.
// Returns Map<stackKey, { document } | { error }>.
async function resolveSourceItems(groups) {
  const sources = new Map();
  const representatives = groups.map((group) => group.rewards[0]);
  const packDocuments = new Map();

  for (const [packId, documentIds] of collectPackDocumentIds(representatives)) {
    const pack = game.packs.get(packId);
    if (!pack) {
      packDocuments.set(packId, { error: new Error(t("WILDHARVEST.Errors.PackMissing", { pack: packId })) });
      continue;
    }
    try {
      const documents = await pack.getDocuments({ _id__in: documentIds });
      packDocuments.set(packId, { documents: new Map(documents.map((document) => [document.id, document])) });
    } catch (error) {
      packDocuments.set(packId, { error });
    }
  }

  for (const group of groups) {
    const reward = group.rewards[0];
    const kind = getRewardSourceKind(reward);
    try {
      if (kind === "uuid") {
        sources.set(group.key, { document: await resolveUuidSource(reward) });
      } else if (kind === "pack") {
        const packResult = packDocuments.get(String(reward.pack).trim());
        if (packResult?.error) throw packResult.error;
        const document = packResult?.documents?.get(String(reward.documentId).trim());
        if (!document) {
          throw new Error(t("WILDHARVEST.Errors.PackDocumentMissing", {
            documentId: reward.documentId,
            pack: reward.pack
          }));
        }
        sources.set(group.key, { document: assertItemDocument(document, reward) });
      } else {
        sources.set(group.key, { document: null });
      }
    } catch (error) {
      sources.set(group.key, { error });
    }
  }

  return sources;
}

function findExistingActorItem(actor, rewardKey, containerId = "") {
  const normalizedContainerId = normalizeContainerId(containerId);
  const matchesContainer = (item) => getItemContainerId(item) === normalizedContainerId;

  return actor.items.find((item) => matchesContainer(item) && isMatchingRewardStack({
    rewardKey: item.getFlag(MODULE_ID, "rewardKey"),
    sourceUuid: item.getFlag(MODULE_ID, "sourceUuid"),
    sourcePack: item.getFlag(MODULE_ID, "sourcePack"),
    sourceDocumentId: item.getFlag(MODULE_ID, "sourceDocumentId"),
    rewardId: item.getFlag(MODULE_ID, "rewardId")
  }, rewardKey));
}

function prepareStackUpdate(item, group, sourceItem, targetContainer = null) {
  const reward = group.rewards[0];
  const containerId = normalizeContainerId(targetContainer?.id);
  const preferredPath = reward.quantityPath ?? item.getFlag(MODULE_ID, "quantityPath") ?? null;
  const quantityPath = getQuantityPath(item, preferredPath);
  if (!quantityPath) {
    throw new Error(t("WILDHARVEST.Errors.QuantityPathMissing", { name: reward.name }));
  }

  const visibleQuantity = getNumericAtPath(item, quantityPath);
  const nextQuantity = calculateGrantedQuantity(visibleQuantity, group.quantity);
  const updateData = {
    _id: item.id,
    flags: {
      [MODULE_ID]: buildModuleFlags(reward, group.key, quantityPath, sourceItem, containerId)
    }
  };
  setValueAtPath(updateData, quantityPath, nextQuantity);

  return { group, item, updateData, quantityPath, containerId, containerName: targetContainer?.name ?? "" };
}

// Compendium items go through WorldCollection#fromCompendium, which also records
// _stats.compendiumSource; other sources are copied as before.
function getNewItemSourceData(sourceItem) {
  if (sourceItem?.pack && typeof game.items?.fromCompendium === "function") {
    return game.items.fromCompendium(sourceItem, { clearFolder: true, clearSort: true, keepId: false });
  }
  const itemData = sourceItem ? sourceItem.toObject() : {};
  delete itemData._id;
  delete itemData.folder;
  delete itemData.sort;
  return itemData;
}

function prepareNewItem(group, sourceItem, targetContainer = null) {
  const reward = group.rewards[0];
  const itemData = getNewItemSourceData(sourceItem);

  itemData.name = reward.name || itemData.name;
  itemData.type = sourceItem?.type ?? getDefaultItemType(reward.itemType);
  itemData.img = reward.img ?? itemData.img ?? getDefaultItemImage();
  const containerId = normalizeContainerId(targetContainer?.id);
  const supportsContainer = foundry.utils.hasProperty(itemData, "system.container")
    || (game.system?.id === "dnd5e" && DND5E_CONTAINABLE_ITEM_TYPES.has(itemData.type));

  if (supportsContainer) {
    setValueAtPath(itemData, "system.container", containerId || null);
  }

  const quantityPath = getQuantityPath(itemData, reward.quantityPath ?? null);
  itemData.flags = {
    ...(itemData.flags ?? {}),
    [MODULE_ID]: buildModuleFlags(reward, group.key, quantityPath, sourceItem, containerId)
  };

  if (quantityPath) setValueAtPath(itemData, quantityPath, group.quantity);

  return { group, sourceItem, itemData, quantityPath, containerId, targetContainer };
}

function buildInventoryResults(group, item, { quantityPath, containerId, containerName }) {
  return group.rewards.map((reward, position) => ({
    index: group.indexes[position],
    result: {
      mode: "inventory",
      item,
      reward,
      quantity: reward.quantity,
      quantityPath,
      containerId,
      containerName
    }
  }));
}

function buildFailures(group, error) {
  return group.rewards.map((reward, position) => ({
    index: group.indexes[position],
    failure: { reward, error }
  }));
}

// Runs one batched document operation; if the batch is rejected, retries entry by entry
// so a single bad item does not fail the whole search.
async function runBatched(entries, runBatch, runSingle) {
  if (!entries.length) return [];
  try {
    return await runBatch(entries);
  } catch (error) {
    console.warn(`${MODULE_ID} | Batched inventory update failed; retrying item by item.`, error);
    const outcomes = [];
    for (const entry of entries) {
      try {
        outcomes.push(...await runSingle(entry));
      } catch (singleError) {
        outcomes.push(...buildFailures(entry.group, singleError));
      }
    }
    return outcomes;
  }
}

async function applyStackUpdates(actor, updates) {
  const toOutcomes = (entry) => buildInventoryResults(entry.group, entry.item, entry);
  return runBatched(
    updates,
    async (entries) => {
      await actor.updateEmbeddedDocuments("Item", entries.map((entry) => entry.updateData));
      return entries.flatMap(toOutcomes);
    },
    async (entry) => {
      await entry.item.update(entry.updateData);
      return toOutcomes(entry);
    }
  );
}

// Checks created items once and fixes quantity or container with a single follow-up update.
async function finalizeCreatedItems(actor, creates, createdItems) {
  const createdByKey = new Map(createdItems.map((item) => [item.getFlag(MODULE_ID, "rewardKey"), item]));
  const outcomes = [];
  const followUpUpdates = [];
  const invalidItems = [];

  for (const entry of creates) {
    const { group, sourceItem, quantityPath, containerId, targetContainer } = entry;
    const reward = group.rewards[0];
    const item = createdByKey.get(group.key);
    if (!item) {
      outcomes.push(...buildFailures(group, new Error(`Item "${reward.name}" was not created.`)));
      continue;
    }

    const resolvedQuantityPath = getQuantityPath(item, reward.quantityPath ?? quantityPath);
    const resolvedContainerId = getItemContainerId(item);
    if (!resolvedQuantityPath && group.quantity !== 1) {
      invalidItems.push({ group, item });
      continue;
    }

    const currentQuantity = getNumericAtPath(item, resolvedQuantityPath);
    const requiresMetadataUpdate = resolvedContainerId !== containerId;
    const requiresQuantityUpdate = resolvedQuantityPath
      && (currentQuantity !== group.quantity || resolvedQuantityPath !== quantityPath);
    if (requiresMetadataUpdate || requiresQuantityUpdate) {
      const updateData = {
        _id: item.id,
        flags: {
          [MODULE_ID]: buildModuleFlags(reward, group.key, resolvedQuantityPath, sourceItem, resolvedContainerId)
        }
      };
      if (resolvedQuantityPath) setValueAtPath(updateData, resolvedQuantityPath, group.quantity);
      followUpUpdates.push(updateData);
    }

    outcomes.push(...buildInventoryResults(group, item, {
      quantityPath: resolvedQuantityPath ?? quantityPath,
      containerId: resolvedContainerId,
      containerName: resolvedContainerId === containerId ? (targetContainer?.name ?? "") : ""
    }));
  }

  if (invalidItems.length) {
    try {
      await actor.deleteEmbeddedDocuments("Item", invalidItems.map(({ item }) => item.id));
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to remove items without a quantity field.`, error);
    }
    for (const { group } of invalidItems) {
      const reward = group.rewards[0];
      outcomes.push(...buildFailures(group, new Error(t("WILDHARVEST.Errors.QuantityPathMissing", { name: reward.name }))));
    }
  }
  if (followUpUpdates.length) {
    try {
      await actor.updateEmbeddedDocuments("Item", followUpUpdates);
    } catch (error) {
      // The items already exist, so they stay counted as granted; only the quantity or container fix failed.
      console.warn(`${MODULE_ID} | Failed to correct quantity or container of new items.`, error);
    }
  }

  return outcomes;
}

const CREATE_BATCH_SIZE = 100;

async function applyNewItems(actor, creates) {
  if (!creates.length) return [];
  const createdItems = [];
  const outcomes = [];
  // Batches of CREATE_BATCH_SIZE keep each request to the server bounded (1.21.1); a rejected
  // batch is retried item by item, so one invalid item does not block the rest.
  for (let start = 0; start < creates.length; start += CREATE_BATCH_SIZE) {
    const batch = creates.slice(start, start + CREATE_BATCH_SIZE);
    try {
      createdItems.push(...await actor.createEmbeddedDocuments("Item", batch.map((entry) => entry.itemData)));
    } catch (error) {
      console.warn(`${MODULE_ID} | Batched item creation failed; retrying item by item.`, error);
      for (const entry of batch) {
        try {
          createdItems.push(...await actor.createEmbeddedDocuments("Item", [entry.itemData]));
        } catch (singleError) {
          outcomes.push(...buildFailures(entry.group, singleError));
        }
      }
    }
  }

  const failedKeys = new Set(outcomes.map((outcome) => getRewardStackKey(outcome.failure.reward)));
  const createdEntries = creates.filter((entry) => !failedKeys.has(entry.group.key));
  outcomes.push(...await finalizeCreatedItems(actor, createdEntries, createdItems));
  return outcomes;
}

// Grants all rewards with a handful of document operations: one getDocuments per compendium,
// one updateEmbeddedDocuments for existing stacks, one createEmbeddedDocuments for new items
// (plus at most one follow-up update or delete).
export async function grantRewardsToActorInventory(actor, rewards, { containerId = "" } = {}) {
  const requestedContainerId = normalizeContainerId(containerId);
  const targetContainer = getActorContainer(actor, requestedContainerId);
  const summary = {
    inventory: [],
    failed: [],
    requestedContainerId,
    containerId: targetContainer?.id ?? "",
    containerName: targetContainer?.name ?? "",
    containerFallback: Boolean(requestedContainerId && !targetContainer)
  };

  const { groups, invalid } = groupRewardsByStackKey(rewards, getRewardStackKey);
  const outcomes = invalid.map(({ reward, index }) => ({
    index,
    failure: {
      reward,
      error: new Error(t("WILDHARVEST.Errors.RewardIdentityMissing", { name: reward?.name }))
    }
  }));

  const sources = await resolveSourceItems(groups);
  const updates = [];
  const creates = [];
  for (const group of groups) {
    const source = sources.get(group.key);
    if (source?.error) {
      outcomes.push(...buildFailures(group, source.error));
      continue;
    }
    try {
      const existingItem = findExistingActorItem(actor, group.key, targetContainer?.id ?? "");
      if (existingItem) updates.push(prepareStackUpdate(existingItem, group, source.document, targetContainer));
      else creates.push(prepareNewItem(group, source.document, targetContainer));
    } catch (error) {
      outcomes.push(...buildFailures(group, error));
    }
  }

  outcomes.push(...await applyStackUpdates(actor, updates));
  outcomes.push(...await applyNewItems(actor, creates));

  for (const outcome of sortByRewardIndex(outcomes)) {
    if (outcome.result) {
      summary.inventory.push(outcome.result);
      continue;
    }
    console.warn(`${MODULE_ID} | Failed to add reward ${outcome.failure.reward?.name} to inventory.`, outcome.failure.error);
    summary.failed.push(outcome.failure);
  }

  return summary;
}
