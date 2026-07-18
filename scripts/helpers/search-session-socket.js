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
  SESSION_SYNC: "sessionSync"
};

function emitSocketMessage(payload) {
  game.socket?.emit(SOCKET_EVENT, {
    ...payload,
    senderId: game.user.id
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
  reason = ""
}) {
  const notice = buildNeutralResolutionNotice({
    sessionId,
    gmUserId: game.user.id,
    targetUserId,
    success,
    reason
  });
  emitSocketMessage({
    type: SOCKET_MESSAGE_TYPES.GM_RESOLUTION,
    ...notice
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
