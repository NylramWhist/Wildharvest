export const INVENTORY_STACK_POLICY_VERSION = 1;

function normalizeIdentityPart(value) {
  return String(value ?? "").trim();
}

export function getRewardStackKey(reward) {
  const uuid = normalizeIdentityPart(reward?.uuid);
  if (uuid) return `uuid:${uuid}`;

  const pack = normalizeIdentityPart(reward?.pack);
  const documentId = normalizeIdentityPart(reward?.documentId);
  if (pack && documentId) return `pack:${pack}:${documentId}`;

  const rewardId = normalizeIdentityPart(reward?.id);
  if (rewardId) return `reward:${rewardId}`;

  return "";
}

export function getManagedItemStackKey(flags = {}) {
  const explicitKey = normalizeIdentityPart(flags.rewardKey);
  if (explicitKey) return explicitKey;

  const sourceUuid = normalizeIdentityPart(flags.sourceUuid);
  if (sourceUuid) return `uuid:${sourceUuid}`;

  const sourcePack = normalizeIdentityPart(flags.sourcePack);
  const sourceDocumentId = normalizeIdentityPart(flags.sourceDocumentId);
  if (sourcePack && sourceDocumentId) {
    return `pack:${sourcePack}:${sourceDocumentId}`;
  }

  const rewardId = normalizeIdentityPart(flags.rewardId);
  return rewardId ? `reward:${rewardId}` : "";
}

export function isMatchingRewardStack(itemFlags, rewardKey) {
  const normalizedRewardKey = normalizeIdentityPart(rewardKey);
  return Boolean(
    normalizedRewardKey
    && getManagedItemStackKey(itemFlags) === normalizedRewardKey
  );
}
