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
  containerId = "",
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
    request.containerId = normalizeId(containerId);
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
      "containerId",
      "extraModifier",
      "rollMode"
    ]);
    return Object.keys(request).every((key) => allowedKeys.has(key))
      && typeof request.actorId === "string"
      && request.actorId.length <= MAX_REQUEST_ID_LENGTH
      && typeof request.containerId === "string"
      && request.containerId.length <= MAX_REQUEST_ID_LENGTH
      && Number.isFinite(Number(request.extraModifier))
      && ["normal", "advantage", "disadvantage"].includes(request.rollMode);
  }

  return false;
}

// 1.21.0: every request lives under its own key, flags.wildharvest.requests.<id>,
// so a new request never merges with one the GM has not handled yet.
export function isValidPlayerRequestKey(key) {
  return typeof key === "string"
    && key.length > 0
    && key.length <= MAX_REQUEST_ID_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(key);
}

// Requests stored on a user, oldest first. Entries whose key does not match the
// request id are returned too (marked keyMismatch) so the GM can reject and remove them.
export function listStoredPlayerRequests(rawRequests) {
  if (!rawRequests || typeof rawRequests !== "object" || Array.isArray(rawRequests)) return [];
  return Object.entries(rawRequests)
    .filter(([, request]) => request !== null && request !== undefined)
    .map(([key, request]) => ({
      key,
      request,
      keyMismatch: !isValidPlayerRequestKey(key) || String(request?.id ?? "") !== key
    }))
    .sort((left, right) => {
      const leftTime = Number(left.request?.createdAt);
      const rightTime = Number(right.request?.createdAt);
      const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
      return safeLeft - safeRight || left.key.localeCompare(right.key);
    });
}

// Keys of the player's own requests that the GM can no longer accept (too old),
// so the player can remove them before writing a new one.
export function getExpiredPlayerRequestKeys(rawRequests, {
  now = Date.now(),
  maxAgeMs = MAX_REQUEST_AGE_MS
} = {}) {
  return listStoredPlayerRequests(rawRequests)
    .filter(({ request }) => {
      const createdAt = Number(request?.createdAt);
      const age = Number(now) - createdAt;
      // A negative age means the server restarted (serverTime counts from server start).
      return !Number.isFinite(createdAt) || age > maxAgeMs || age < -30_000;
    })
    .map(({ key }) => key);
}
