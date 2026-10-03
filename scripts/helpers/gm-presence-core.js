// A9 (1.21.1): several browser windows can be logged in as the same GM user, and Foundry
// treats each of them as the active GM. Only one window may handle player requests,
// otherwise a request is resolved twice or answered with a stale rejection.
// Windows of the GM announce themselves over the module socket; the oldest live window leads.

export const GM_PRESENCE_HEARTBEAT_MS = 10_000;
export const GM_PRESENCE_TIMEOUT_MS = 25_000;
const MAX_CLIENT_ID_LENGTH = 64;

export function normalizeClientId(value) {
  return String(value ?? "").trim().slice(0, MAX_CLIENT_ID_LENGTH);
}

export function isValidPresence(presence) {
  return Boolean(presence
    && typeof presence === "object"
    && normalizeClientId(presence.clientId)
    && Number.isFinite(Number(presence.startedAt)));
}

// Earlier start wins; equal starts are ordered by client id, so every window picks the same leader.
export function comparePresence(left, right) {
  const byStart = Number(left.startedAt) - Number(right.startedAt);
  if (byStart !== 0) return byStart;
  return String(left.clientId).localeCompare(String(right.clientId));
}

export function createGmPresenceTracker({
  clientId,
  startedAt,
  timeoutMs = GM_PRESENCE_TIMEOUT_MS
}) {
  const self = { clientId: normalizeClientId(clientId), startedAt: Number(startedAt) };
  const peers = new Map();

  function prune(now) {
    for (const [peerId, peer] of peers) {
      if (Number(now) - peer.lastSeen > timeoutMs) peers.delete(peerId);
    }
  }

  return {
    self,
    // Returns true when the peer was not known yet, so the caller can answer with its own presence.
    see(presence, now) {
      if (!isValidPresence(presence)) return false;
      const peerId = normalizeClientId(presence.clientId);
      if (peerId === self.clientId) return false;
      const isNew = !peers.has(peerId);
      peers.set(peerId, { clientId: peerId, startedAt: Number(presence.startedAt), lastSeen: Number(now) });
      return isNew;
    },
    forget(peerClientId) {
      peers.delete(normalizeClientId(peerClientId));
    },
    leader(now) {
      prune(now);
      return [self, ...peers.values()].sort(comparePresence)[0];
    },
    isLeader(now) {
      return this.leader(now).clientId === self.clientId;
    },
    peerCount(now) {
      prune(now);
      return peers.size;
    }
  };
}
