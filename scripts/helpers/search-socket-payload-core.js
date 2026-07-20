const MAX_SOCKET_ID_LENGTH = 128;

function normalizeId(value) {
  return String(value ?? "").trim().slice(0, MAX_SOCKET_ID_LENGTH);
}

export function buildMinimalSearchOffer(offer) {
  return {
    locationId: normalizeId(offer?.locationId),
    activityId: normalizeId(offer?.activityId),
    lootPoolId: normalizeId(offer?.lootPoolId),
    skillId: normalizeId(offer?.skillId)
  };
}

export function isMinimalSearchOffer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowedKeys = new Set(["locationId", "activityId", "lootPoolId", "skillId"]);
  const keys = Object.keys(value);
  return keys.every((key) => allowedKeys.has(key))
    && [value.locationId, value.activityId, value.lootPoolId, value.skillId]
      .every((entry) => typeof entry === "string" && entry.length <= MAX_SOCKET_ID_LENGTH)
    && Boolean(value.locationId && value.activityId);
}

export function buildNeutralResolutionNotice({
  sessionId,
  gmUserId,
  targetUserId,
  success,
  resultAvailable = true,
  reason = ""
}) {
  return {
    sessionId: normalizeId(sessionId),
    gmUserId: normalizeId(gmUserId),
    targetUserId: normalizeId(targetUserId),
    success: Boolean(success),
    resultAvailable: Boolean(resultAvailable),
    reason: String(reason ?? "").trim().slice(0, 64)
  };
}
