export function normalizeSystemQuantity(value, {
  fallback = 0
} = {}) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : fallback;
}

export function calculateGrantedQuantity(systemQuantity, rewardQuantity) {
  const quantityToAdd = Number(rewardQuantity);
  if (!Number.isFinite(quantityToAdd)) {
    throw new TypeError("Reward quantity must be a finite number.");
  }

  return normalizeSystemQuantity(systemQuantity) + quantityToAdd;
}

export function getInventoryDisplayQuantity({
  systemQuantity,
  hasQuantityPath
}) {
  return hasQuantityPath
    ? normalizeSystemQuantity(systemQuantity)
    : 1;
}
