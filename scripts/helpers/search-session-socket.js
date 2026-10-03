import { MODULE_ID } from "../constants.js";
import {
  buildMinimalSearchOffer,
  buildNeutralResolutionNotice
} from "./search-socket-payload-core.js";

export const SOCKET_EVENT = `module.${MODULE_ID}`;
export const SOCKET_MESSAGE_TYPES = {
  OFFER_SEARCH: "offerSearch",
  GM_RESOLUTION: "gmResolution",
  SESSION_CLOSED: "sessionClosed",
  SESSION_SYNC: "sessionSync",
  GM_PRESENCE: "gmPresence",
  GM_LOOT_REVIEW: "gmLootReview"
};

// One id per browser window. Messages carry it so a window ignores only its own messages,
// not those of another window logged in as the same user (A9).
let clientId = "";
export function getSocketClientId() {
  if (!clientId) clientId = foundry.utils.randomID(16);
  return clientId;
}

function emitSocketMessage(payload) {
  game.socket?.emit(SOCKET_EVENT, {
    ...payload,
    senderId: game.user.id,
    clientId: getSocketClientId()
  });
}

export function emitGmPresence({ startedAt, leaving = false }) {
  emitSocketMessage({
    type: SOCKET_MESSAGE_TYPES.GM_PRESENCE,
    sessionId: "presence",
    gmUserId: game.user.id,
    startedAt: Number(startedAt),
    leaving: Boolean(leaving)
  });
}

export function emitSearchOffer({
  sessionId,
  targetUserId,
  offer
}) {
  emitSocketMessage({
    type: SOCKET_MESSAGE_TYPES.OFFER_SEARCH,
    sessionId,
    gmUserId: game.user.id,
    targetUserId,
    offer: buildMinimalSearchOffer(offer)
  });
}

export function emitGmSearchResolution({
  sessionId,
  targetUserId,
  success,
  resultAvailable = true,
  reason = ""
}) {
  const notice = buildNeutralResolutionNotice({
    sessionId,
    gmUserId: game.user.id,
    targetUserId,
    success,
    resultAvailable,
    reason
  });
  emitSocketMessage({
    type: SOCKET_MESSAGE_TYPES.GM_RESOLUTION,
    ...notice
  });
}

export function emitGmLootReview({ sessionId, targetUserId }) {
  emitSocketMessage({
    type: SOCKET_MESSAGE_TYPES.GM_LOOT_REVIEW,
    sessionId,
    gmUserId: game.user.id,
    targetUserId
  });
}

export function emitSearchSessionClosed({
  sessionId,
  gmUserId,
  targetUserIds = []
}) {
  for (const targetUserId of targetUserIds) {
    emitSocketMessage({
      type: SOCKET_MESSAGE_TYPES.SESSION_CLOSED,
      sessionId,
      gmUserId,
      targetUserId
    });
  }
}

export function emitSearchSessionSync() {
  emitSocketMessage({
    type: SOCKET_MESSAGE_TYPES.SESSION_SYNC,
    sessionId: "state",
    gmUserId: game.user.id
  });
}
