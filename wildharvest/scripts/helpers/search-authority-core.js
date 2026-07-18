export const MAX_PLAYER_EXTRA_MODIFIER = 100;

export const SEARCH_RESOLUTION_REASONS = Object.freeze({
  ACTOR_NOT_OWNED: "actor-not-owned",
  ACTOR_NOT_FOUND: "actor-not-found",
  INVALID_ACTOR_ID: "invalid-actor-id",
  INVALID_EXTRA_MODIFIER: "invalid-extra-modifier",
  INVALID_ROLL_MODE: "invalid-roll-mode",
  INVALID_SENDER: "invalid-sender",
  OFFER_NOT_ACCEPTED: "offer-not-accepted",
  OFFER_NOT_FOUND: "offer-not-found",
  SESSION_CLOSED: "session-closed",
  SESSION_NOT_FOUND: "session-not-found",
  WRONG_GM: "wrong-gm"
});

const ALLOWED_ROLL_MODES = new Set(["normal", "advantage", "disadvantage"]);

function reject(reason) {
  return { ok: false, reason };
}

export function claimSearchResolution({
  message,
  session,
  sender,
  currentGmId,
  actor = null,
  isActorOwner = () => false,
  timestamp = ""
}) {
  const sessionId = String(message?.sessionId ?? "").trim();
  const senderId = String(sender?.id ?? "").trim();
  const gmUserId = String(message?.gmUserId ?? "").trim();
  const actorId = String(message?.actorId ?? "").trim();
  const rollMode = String(message?.rollMode ?? "normal").trim().toLowerCase();
  const extraModifier = Number(message?.extraModifier ?? 0);

  if (!senderId || sender?.isGM || sender?.active === false) {
    return reject(SEARCH_RESOLUTION_REASONS.INVALID_SENDER);
  }
  if (!currentGmId || gmUserId !== currentGmId) return reject(SEARCH_RESOLUTION_REASONS.WRONG_GM);
  if (!session || String(session.id ?? "").trim() !== sessionId) {
    return reject(SEARCH_RESOLUTION_REASONS.SESSION_NOT_FOUND);
  }
  if (session.closedAt) return reject(SEARCH_RESOLUTION_REASONS.SESSION_CLOSED);

  const entry = session.offers?.[senderId];
  if (!entry) return reject(SEARCH_RESOLUTION_REASONS.OFFER_NOT_FOUND);
  if (entry.status !== "accepted") {
    return reject(SEARCH_RESOLUTION_REASONS.OFFER_NOT_ACCEPTED);
  }

  if (actorId) {
    if (!actor || String(actor.id ?? "") !== actorId) {
      return reject(SEARCH_RESOLUTION_REASONS.ACTOR_NOT_FOUND);
    }
    if (!isActorOwner(actor, sender)) {
      return reject(SEARCH_RESOLUTION_REASONS.ACTOR_NOT_OWNED);
    }
  } else if (message?.actorId != null && typeof message.actorId !== "string") {
    return reject(SEARCH_RESOLUTION_REASONS.INVALID_ACTOR_ID);
  }

  if (!Number.isFinite(extraModifier) || Math.abs(extraModifier) > MAX_PLAYER_EXTRA_MODIFIER) {
    return reject(SEARCH_RESOLUTION_REASONS.INVALID_EXTRA_MODIFIER);
  }
  if (!ALLOWED_ROLL_MODES.has(rollMode)) {
    return reject(SEARCH_RESOLUTION_REASONS.INVALID_ROLL_MODE);
  }

  entry.status = "resolving";
  entry.actorId = actorId;
  entry.actorName = actor?.name ?? entry.actorName ?? "";
  entry.resolutionStartedAt = timestamp;
  entry.resolutionStartedAtMs = Date.now();
  entry.updatedAt = timestamp;

  return {
    ok: true,
    actor,
    entry,
    request: {
      actorId,
      extraModifier,
      rollMode,
      sessionId,
      senderId
    }
  };
}

export function completeSearchResolution(entry, result, {
  actorName = "",
  timestamp = ""
} = {}) {
  if (!entry || entry.status !== "resolving") return false;

  entry.status = "completed";
  entry.actorName = actorName || entry.actorName || "";
  entry.result = result;
  entry.resolutionCompletedAt = timestamp;
  entry.resolutionCompletedAtMs = Date.now();
  entry.updatedAt = timestamp;
  return true;
}

export function failSearchResolution(entry, {
  timestamp = "",
  reason = ""
} = {}) {
  if (!entry || entry.status !== "resolving") return false;

  entry.status = "failed";
  entry.resolutionFailedAt = timestamp;
  entry.resolutionFailedAtMs = Date.now();
  entry.failureReason = String(reason ?? "").trim();
  entry.updatedAt = timestamp;
  return true;
}
