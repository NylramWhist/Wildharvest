import { MODULE_ID } from "../constants.js";
import { t } from "../i18n.js";
import {
  calculateGrantedQuantity,
  getInventoryDisplayQuantity
} from "./inventory-quantity-core.js";

const KNOWN_QUANTITY_PATHS = [
  "system.quantity",
  "system.quantity.value",
  "system.qty",
  "system.qty.value",
  "system.amount",
  "system.amount.value",
  "system.stack.value"
];

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

function getRewardKey(reward) {
  if (reward.uuid) return `uuid:${reward.uuid}`;
  if (reward.pack && reward.documentId) return `pack:${reward.pack}:${reward.documentId}`;
  return `reward:${reward.id}`;
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

function buildModuleFlags(reward, rewardKey, quantityPath, sourceItem) {
  return {
    rewardId: reward.id,
    rewardKey,
    quantityPath,
    sourceUuid: reward.uuid ?? sourceItem?.uuid ?? null,
    sourcePack: reward.pack ?? sourceItem?.compendium?.collection ?? null,
    sourceDocumentId: reward.documentId ?? sourceItem?.id ?? null
  };
}

async function resolveSourceItem(reward) {
  if (reward.uuid) {
    const document = await foundry.utils.fromUuid(reward.uuid);
    if (!document) throw new Error(t("WILDHARVEST.Errors.SourceUuidMissing", { uuid: reward.uuid }));
    if (document.documentName !== "Item") {
      throw new Error(t("WILDHARVEST.Errors.SourceUuidNotItem", { uuid: reward.uuid }));
    }
    return document;
  }

  if (reward.pack && reward.documentId) {
    const pack = game.packs.get(reward.pack);
    if (!pack) throw new Error(t("WILDHARVEST.Errors.PackMissing", { pack: reward.pack }));
    const document = await pack.getDocument(reward.documentId);
    if (!document) {
      throw new Error(t("WILDHARVEST.Errors.PackDocumentMissing", {
        documentId: reward.documentId,
        pack: reward.pack
      }));
    }
    if (document.documentName !== "Item") {
      throw new Error(t("WILDHARVEST.Errors.PackDocumentNotItem", {
        documentId: reward.documentId,
        pack: reward.pack
      }));
    }
    return document;
  }

  return null;
}

function findExistingActorItem(actor, reward, rewardKey, sourceItem) {
  const rewardId = reward.id;
  const sourceUuid = reward.uuid ?? sourceItem?.uuid ?? null;
  const expectedType = sourceItem?.type ?? getDefaultItemType(reward.itemType);

  return actor.items.find((item) => item.getFlag(MODULE_ID, "rewardKey") === rewardKey)
    ?? actor.items.find((item) => sourceUuid && item.getFlag(MODULE_ID, "sourceUuid") === sourceUuid)
    ?? actor.items.find((item) => item.getFlag(MODULE_ID, "rewardId") === rewardId)
    ?? actor.items.find((item) => item.name === reward.name && item.type === expectedType);
}

async function updateExistingItem(item, reward, rewardKey, sourceItem) {
  const preferredPath = reward.quantityPath ?? item.getFlag(MODULE_ID, "quantityPath") ?? null;
  const quantityPath = getQuantityPath(item, preferredPath);
  if (!quantityPath) {
    throw new Error(t("WILDHARVEST.Errors.QuantityPathMissing", { name: reward.name }));
  }

  const visibleQuantity = getNumericAtPath(item, quantityPath);
  const nextQuantity = calculateGrantedQuantity(visibleQuantity, reward.quantity);
  const updateData = {
    _id: item.id,
    flags: {
      [MODULE_ID]: buildModuleFlags(reward, rewardKey, quantityPath, sourceItem)
    }
  };

  if (quantityPath) setValueAtPath(updateData, quantityPath, nextQuantity);
  await item.update(updateData);

  return {
    mode: "inventory",
    item,
    reward,
    quantity: reward.quantity,
    quantityPath
  };
}

async function createNewItem(actor, reward, rewardKey, sourceItem) {
  const itemData = sourceItem ? sourceItem.toObject() : {};
  delete itemData._id;
  delete itemData.folder;
  delete itemData.sort;

  itemData.name = reward.name || itemData.name;
  itemData.type = sourceItem?.type ?? getDefaultItemType(reward.itemType);
  itemData.img = reward.img ?? itemData.img ?? getDefaultItemImage();

  const quantityPath = getQuantityPath(itemData, reward.quantityPath ?? null);
  itemData.flags = {
    ...(itemData.flags ?? {}),
    [MODULE_ID]: buildModuleFlags(reward, rewardKey, quantityPath, sourceItem)
  };

  if (quantityPath) setValueAtPath(itemData, quantityPath, reward.quantity);

  const [item] = await actor.createEmbeddedDocuments("Item", [itemData]);
  const resolvedQuantityPath = getQuantityPath(item, reward.quantityPath ?? quantityPath);

  if (!resolvedQuantityPath && reward.quantity !== 1) {
    await item.delete();
    throw new Error(t("WILDHARVEST.Errors.QuantityPathMissing", { name: reward.name }));
  }

  if (resolvedQuantityPath) {
    const currentQuantity = getNumericAtPath(item, resolvedQuantityPath);
    if (currentQuantity !== reward.quantity || resolvedQuantityPath !== quantityPath) {
      const updateData = {
        _id: item.id,
        flags: {
          [MODULE_ID]: buildModuleFlags(reward, rewardKey, resolvedQuantityPath, sourceItem)
        }
      };
      setValueAtPath(updateData, resolvedQuantityPath, reward.quantity);
      await item.update(updateData);
    }
  }

  return {
    mode: "inventory",
    item,
    reward,
    quantity: reward.quantity,
    quantityPath: resolvedQuantityPath ?? quantityPath
  };
}

export function getManagedInventoryResources(actor) {
  return actor.items
    .filter((item) => item.getFlag(MODULE_ID, "rewardId") || item.getFlag(MODULE_ID, "sourceUuid"))
    .map((item) => {
      const quantityPath = getQuantityPath(
        item,
        item.getFlag(MODULE_ID, "quantityPath") ?? null
      );
      const quantity = getInventoryDisplayQuantity({
        systemQuantity: getNumericAtPath(item, quantityPath),
        hasQuantityPath: Boolean(quantityPath)
      });

      return {
        id: item.id,
        name: item.name,
        quantity,
        type: "inventory"
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

export async function grantRewardsToActorInventory(actor, rewards) {
  const summary = {
    inventory: [],
    failed: []
  };

  for (const reward of rewards) {
    try {
      const rewardKey = getRewardKey(reward);
      const sourceItem = await resolveSourceItem(reward);
      const existingItem = findExistingActorItem(actor, reward, rewardKey, sourceItem);

      if (existingItem) {
        summary.inventory.push(await updateExistingItem(existingItem, reward, rewardKey, sourceItem));
        continue;
      }

      summary.inventory.push(await createNewItem(actor, reward, rewardKey, sourceItem));
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to add reward ${reward.name} to inventory.`, error);
      summary.failed.push({
        reward,
        error
      });
    }
  }

  return summary;
}
