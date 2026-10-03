// 1.21.0: fewer scenes, and scene results are summaries (details live in actor history).
export const MAX_PERSISTED_SESSIONS = 20;

import { compactSession } from "./data-format-core.js";
import { isMinimalSearchOffer } from "./search-socket-payload-core.js";

function hasOnlySocketKeys(message, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(message ?? {}).every((key) => allowed.has(key));
}

export function collectPersistedSearchSessions(searchSessions, maxPersistedSessions = MAX_PERSISTED_SESSIONS) {
  return Array.from(searchSessions?.values?.() ?? searchSessions ?? []).slice(-maxPersistedSessions);
}

export function restorePersistedSearchSessions(rawValue, {
  deepClone = (value) => JSON.parse(JSON.stringify(value)),
  isSessionClosed = () => false,
  maxPersistedSessions = MAX_PERSISTED_SESSIONS
} = {}) {
  let parseError = null;
  let sessions = [];

  try {
    const parsedValue = JSON.parse(String(rawValue || "[]"));
    sessions = Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    parseError = error;
  }

  const restoredSessions = [];
  const closedSessionIds = [];
  for (const session of sessions.slice(-maxPersistedSessions)) {
    const sessionId = String(session?.id ?? "").trim();
    if (!sessionId || !session?.offers || typeof session.offers !== "object") continue;

    const restoredSession = compactSession(deepClone(session));
    restoredSession.id = sessionId;
    restoredSessions.push(restoredSession);
    if (isSessionClosed(restoredSession)) {
      closedSessionIds.push(sessionId);
    }
  }

  return {
    restoredSessions,
    closedSessionIds,
    parseError
  };
}

// Migration 1 -> 2 of the searchSessions world setting: newest scenes only, compact results.
// Returns null when the stored text cannot be parsed, so the caller leaves it untouched.
export function migratePersistedSearchSessions(rawValue, maxPersistedSessions = MAX_PERSISTED_SESSIONS) {
  let sessions;
  try {
    sessions = JSON.parse(String(rawValue || "[]"));
  } catch (_error) {
    return null;
  }
  if (!Array.isArray(sessions)) return null;
  return sessions
    .filter((session) => String(session?.id ?? "").trim() && session?.offers && typeof session.offers === "object")
    .slice(-maxPersistedSessions)
    .map((session) => compactSession(session));
}

export function settleInterruptedResolutions(sessions, {
  getRecoveredResult = () => null,
  // 1.34.0: a resolution this GM is still working on (the loot review window is open) is not settled.
  isStillResolving = () => false,
  timestamp = ""
} = {}) {
  const result = {
    changed: false,
    recovered: 0,
    failed: 0
  };

  for (const session of Array.from(sessions?.values?.() ?? sessions ?? [])) {
    for (const entry of Object.values(session?.offers ?? {})) {
      if (entry?.status !== "resolving") continue;
      if (isStillResolving(session, entry)) continue;

      const recoveredResult = getRecoveredResult(session, entry);
      if (recoveredResult) {
        entry.status = "completed";
        entry.result = recoveredResult;
        entry.resolutionCompletedAt = timestamp;
        entry.recoveredAfterInterruption = true;
        delete entry.lootReviewPending;
        result.recovered += 1;
      } else {
        entry.status = "failed";
        entry.failureReason = "resolution-interrupted";
        entry.resolutionFailedAt = timestamp;
        delete entry.lootReviewPending;
        result.failed += 1;
      }
      entry.updatedAt = timestamp;
      result.changed = true;
    }
  }

  return result;
}

export function isAuthorizedSearchSocketMessage(message, {
  getUser = () => null,
  getActiveGm = () => null,
  messageTypes = {}
} = {}) {
  const senderId = String(message?.senderId ?? "").trim();
  const sessionId = String(message?.sessionId ?? "").trim();
  if (!senderId || !sessionId || senderId.length > 128 || sessionId.length > 128) return false;

  const sender = getUser(senderId);
  if (!sender) return false;
  const activeGm = getActiveGm();
  const senderIsActiveGm = Boolean(sender.isGM && activeGm?.id === senderId);

  if (message.type === messageTypes.OFFER_SEARCH) {
    const targetUser = getUser(String(message.targetUserId ?? ""));
    return hasOnlySocketKeys(message, ["type", "senderId", "clientId", "sessionId", "gmUserId", "targetUserId", "offer"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM)
      && isMinimalSearchOffer(message.offer);
  }

  if (message.type === messageTypes.GM_RESOLUTION) {
    const targetUser = getUser(String(message.targetUserId ?? ""));
    return hasOnlySocketKeys(message, ["type", "senderId", "clientId", "sessionId", "gmUserId", "targetUserId", "success", "resultAvailable", "reason"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM)
      && typeof message.success === "boolean"
      && typeof (message.resultAvailable ?? true) === "boolean"
      && typeof (message.reason ?? "") === "string"
      && String(message.reason ?? "").length <= 64;
  }

  // 1.34.0: the GM tells the player that the loot is waiting for the GM's approval.
  if (message.type === messageTypes.GM_LOOT_REVIEW) {
    const targetUser = getUser(String(message.targetUserId ?? ""));
    return hasOnlySocketKeys(message, ["type", "senderId", "clientId", "sessionId", "gmUserId", "targetUserId"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM);
  }

  if (message.type === messageTypes.SESSION_CLOSED) {
    const targetUser = getUser(String(message.targetUserId ?? ""));
    return hasOnlySocketKeys(message, ["type", "senderId", "clientId", "sessionId", "gmUserId", "targetUserId"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM);
  }

  if (message.type === messageTypes.SESSION_SYNC) {
    return hasOnlySocketKeys(message, ["type", "senderId", "clientId", "sessionId", "gmUserId"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && sessionId === "state";
  }

  if (message.type === messageTypes.GM_PRESENCE) {
    return hasOnlySocketKeys(message, ["type", "senderId", "clientId", "sessionId", "gmUserId", "startedAt", "leaving"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && sessionId === "presence"
      && typeof message.clientId === "string"
      && message.clientId.length > 0
      && message.clientId.length <= 64
      && Number.isFinite(Number(message.startedAt))
      && typeof (message.leaving ?? false) === "boolean";
  }

  return false;
}
