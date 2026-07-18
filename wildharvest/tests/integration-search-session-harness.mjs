import {
  claimSearchResolution,
  completeSearchResolution
} from "../scripts/helpers/search-authority-core.js";
import {
  buildPlayerDocumentRequest,
  isValidPlayerDocumentRequest,
  PLAYER_REQUEST_TYPES
} from "../scripts/helpers/player-request-core.js";
import { isAuthorizedSearchSocketMessage, settleInterruptedResolutions } from "../scripts/helpers/search-session-state.js";
import { SOCKET_MESSAGE_TYPES } from "../scripts/helpers/search-session-socket.js";

const DEFAULT_NOW = 1_800_000_000_000;

function resultKey(sessionId, playerId) {
  return `${sessionId}:${playerId}`;
}

export function createTwoClientSearchHarness({ now = DEFAULT_NOW } = {}) {
  const users = new Map([
    ["gm-primary", { id: "gm-primary", name: "Primary GM", isGM: true, active: true }],
    ["gm-secondary", { id: "gm-secondary", name: "Secondary GM", isGM: true, active: true }],
    ["player-one", { id: "player-one", name: "Player One", isGM: false, active: true }],
    ["player-two", { id: "player-two", name: "Player Two", isGM: false, active: true }]
  ]);
  const actors = new Map([
    ["actor-one", { id: "actor-one", name: "Ranger", ownerIds: ["player-one"] }],
    ["actor-two", { id: "actor-two", name: "Wizard", ownerIds: ["player-two"] }]
  ]);
  const sessions = new Map();
  const processedRequestIds = new Set();
  const actorResults = new Map();
  const grantCounts = new Map();
  let activeGmId = "gm-primary";
  let sequence = 0;

  function timestamp(label) {
    sequence += 1;
    return `${label}-${sequence}`;
  }

  function createSession(sessionId = "session-one") {
    const session = {
      id: sessionId,
      closedAt: null,
      offers: {
        "player-one": { userId: "player-one", status: "pending", updatedAt: timestamp("offered") },
        "player-two": { userId: "player-two", status: "pending", updatedAt: timestamp("offered") }
      }
    };
    sessions.set(sessionId, session);
    return session;
  }

  function buildDecision(playerId, decision, {
    id = `${playerId}-decision-${sequence + 1}`,
    sessionId = "session-one",
    gmUserId = activeGmId,
    createdAt = now
  } = {}) {
    return buildPlayerDocumentRequest({
      id,
      type: PLAYER_REQUEST_TYPES.DECISION,
      sessionId,
      gmUserId,
      decision,
      createdAt
    });
  }

  function buildResolution(playerId, actorId, {
    id = `${playerId}-resolution-${sequence + 1}`,
    sessionId = "session-one",
    gmUserId = activeGmId,
    extraModifier = 0,
    rollMode = "normal",
    createdAt = now
  } = {}) {
    return buildPlayerDocumentRequest({
      id,
      type: PLAYER_REQUEST_TYPES.RESOLUTION,
      sessionId,
      gmUserId,
      actorId,
      extraModifier,
      rollMode,
      createdAt
    });
  }

  function authenticateRequest(playerId, request) {
    const sender = users.get(playerId);
    if (!sender || sender.isGM || sender.active === false) {
      return { ok: false, reason: "invalid-sender" };
    }
    if (!isValidPlayerDocumentRequest(request, { now })) {
      return { ok: false, reason: "invalid-request" };
    }
    if (!users.get(request.gmUserId)?.isGM) {
      return { ok: false, reason: "unknown-gm" };
    }
    if (processedRequestIds.has(request.id)) {
      return { ok: false, reason: "duplicate-request" };
    }
    processedRequestIds.add(request.id);
    return { ok: true, sender };
  }

  function processDecision(playerId, request) {
    const authenticated = authenticateRequest(playerId, request);
    if (!authenticated.ok) return authenticated;
    if (request.type !== PLAYER_REQUEST_TYPES.DECISION) {
      return { ok: false, reason: "wrong-request-type" };
    }

    const entry = sessions.get(request.sessionId)?.offers?.[playerId];
    if (!entry) return { ok: false, reason: "offer-not-found" };
    if (entry.status !== "pending" && entry.status !== "accepted") {
      return { ok: false, reason: "offer-not-pending" };
    }
    if (!(entry.status === "accepted" && request.decision === "declined")) {
      entry.status = request.decision === "declined" ? "declined" : "accepted";
      entry.updatedAt = timestamp("decision");
    }
    return { ok: true, entry };
  }

  function storeGrantedResult(sessionId, playerId, result) {
    const key = resultKey(sessionId, playerId);
    if (actorResults.has(key)) return false;
    actorResults.set(key, result);
    grantCounts.set(key, (grantCounts.get(key) ?? 0) + 1);
    return true;
  }

  function processResolution(playerId, request, { result, deferCompletion = false } = {}) {
    const authenticated = authenticateRequest(playerId, request);
    if (!authenticated.ok) return authenticated;
    if (request.type !== PLAYER_REQUEST_TYPES.RESOLUTION) {
      return { ok: false, reason: "wrong-request-type" };
    }

    const session = sessions.get(request.sessionId);
    const actor = actors.get(request.actorId) ?? null;
    const claim = claimSearchResolution({
      message: { ...request, gmUserId: activeGmId },
      session,
      sender: authenticated.sender,
      currentGmId: activeGmId,
      actor,
      isActorOwner: (candidate, user) => candidate.ownerIds.includes(user.id),
      timestamp: timestamp("resolution-started")
    });
    if (!claim.ok || deferCompletion) return claim;

    const completed = completeSearchResolution(claim.entry, result, {
      actorName: actor?.name ?? "",
      timestamp: timestamp("resolution-completed")
    });
    if (completed) storeGrantedResult(request.sessionId, playerId, result);
    return { ...claim, completed };
  }

  function recordPersistedActorResult(sessionId, playerId, result) {
    return storeGrantedResult(sessionId, playerId, result);
  }

  function recoverInterrupted() {
    return settleInterruptedResolutions(sessions, {
      timestamp: timestamp("recovered"),
      getRecoveredResult: (session, entry) => actorResults.get(resultKey(session.id, entry.userId)) ?? null
    });
  }

  function authorizeSocket(message) {
    return isAuthorizedSearchSocketMessage(message, {
      getUser: (userId) => users.get(userId) ?? null,
      getActiveGm: () => users.get(activeGmId) ?? null,
      messageTypes: SOCKET_MESSAGE_TYPES
    });
  }

  function setActiveGm(userId) {
    if (!users.get(userId)?.isGM) throw new Error(`Unknown GM: ${userId}`);
    activeGmId = userId;
  }

  return {
    actorResults,
    actors,
    authorizeSocket,
    buildDecision,
    buildResolution,
    createSession,
    get activeGmId() {
      return activeGmId;
    },
    getGrantCount: (sessionId, playerId) => grantCounts.get(resultKey(sessionId, playerId)) ?? 0,
    processDecision,
    processedRequestIds,
    processResolution,
    recordPersistedActorResult,
    recoverInterrupted,
    sessions,
    setActiveGm,
    users
  };
}
