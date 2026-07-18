const MAX_REQUEST_ID_LENGTH = 128;
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

export const PLAYER_REQUEST_TYPES = Object.freeze({
  DECISION: "decision",
  RESOLUTION: "resolution"
});

function normalizeId(value) {
  return String(value ?? "").trim().slice(0, MAX_REQUEST_ID_LENGTH);
}

export function buildPlayerDocumentRequest({
  id,
  type,
  sessionId,
  gmUserId,
  decision = "",
  actorId = "",
  extraModifier = 0,
  rollMode = "normal",
  createdAt = Date.now()
}) {
  const request = {
    id: normalizeId(id),
    type: String(type ?? "").trim(),
    sessionId: normalizeId(sessionId),
    gmUserId: normalizeId(gmUserId),
    createdAt: Number(createdAt)
  };

  if (request.type === PLAYER_REQUEST_TYPES.DECISION) {
    request.decision = String(decision ?? "").trim().toLowerCase();
  } else if (request.type === PLAYER_REQUEST_TYPES.RESOLUTION) {
    request.actorId = normalizeId(actorId);
    request.extraModifier = Number(extraModifier);
    request.rollMode = String(rollMode ?? "normal").trim().toLowerCase();
  }

  return request;
}

export function isValidPlayerDocumentRequest(request, {
  now = Date.now(),
  maxAgeMs = MAX_REQUEST_AGE_MS
} = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return false;
  if (!request.id || !request.sessionId || !request.gmUserId) return false;
  if ([request.id, request.sessionId, request.gmUserId].some((value) => (
    typeof value !== "string" || value.length > MAX_REQUEST_ID_LENGTH
  ))) return false;
  if (!Number.isFinite(Number(request.createdAt))) return false;
  const age = Number(now) - Number(request.createdAt);
  if (age < -30_000 || age > maxAgeMs) return false;

  if (request.type === PLAYER_REQUEST_TYPES.DECISION) {
    const allowedKeys = new Set(["id", "type", "sessionId", "gmUserId", "createdAt", "decision"]);
    return Object.keys(request).every((key) => allowedKeys.has(key))
      && ["accepted", "declined"].includes(request.decision);
  }

  if (request.type === PLAYER_REQUEST_TYPES.RESOLUTION) {
    const allowedKeys = new Set([
      "id",
      "type",
      "sessionId",
      "gmUserId",
      "createdAt",
      "actorId",
      "extraModifier",
      "rollMode"
    ]);
    return Object.keys(request).every((key) => allowedKeys.has(key))
      && typeof request.actorId === "string"
      && request.actorId.length <= MAX_REQUEST_ID_LENGTH
      && Number.isFinite(Number(request.extraModifier))
      && ["normal", "advantage", "disadvantage"].includes(request.rollMode);
  }

  return false;
}
