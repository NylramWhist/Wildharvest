export const MAX_PERSISTED_SESSIONS = 50;

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

    const restoredSession = deepClone(session);
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

export function settleInterruptedResolutions(sessions, {
  getRecoveredResult = () => null,
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

      const recoveredResult = getRecoveredResult(session, entry);
      if (recoveredResult) {
        entry.status = "completed";
        entry.result = recoveredResult;
        entry.resolutionCompletedAt = timestamp;
        entry.recoveredAfterInterruption = true;
        result.recovered += 1;
      } else {
        entry.status = "failed";
        entry.failureReason = "resolution-interrupted";
        entry.resolutionFailedAt = timestamp;
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
    return hasOnlySocketKeys(message, ["type", "senderId", "sessionId", "gmUserId", "targetUserId", "offer"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM)
      && isMinimalSearchOffer(message.offer);
  }

  if (message.type === messageTypes.GM_RESOLUTION) {
    const targetUser = getUser(String(message.targetUserId ?? ""));
    return hasOnlySocketKeys(message, ["type", "senderId", "sessionId", "gmUserId", "targetUserId", "success", "resultAvailable", "reason"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM)
      && typeof message.success === "boolean"
      && typeof (message.resultAvailable ?? true) === "boolean"
      && typeof (message.reason ?? "") === "string"
      && String(message.reason ?? "").length <= 64;
  }

  if (message.type === messageTypes.SESSION_CLOSED) {
    const targetUser = getUser(String(message.targetUserId ?? ""));
    return hasOnlySocketKeys(message, ["type", "senderId", "sessionId", "gmUserId", "targetUserId"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && Boolean(targetUser && !targetUser.isGM);
  }

  if (message.type === messageTypes.SESSION_SYNC) {
    return hasOnlySocketKeys(message, ["type", "senderId", "sessionId", "gmUserId"])
      && senderIsActiveGm
      && message.gmUserId === senderId
      && sessionId === "state";
  }

  return false;
}
