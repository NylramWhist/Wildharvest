export function isActiveGmUser(user, activeGm) {
  return Boolean(
    user?.isGM
    && user?.id
    && activeGm?.id
    && user.id === activeGm.id
  );
}

export function getActiveGmId(activeGm, fallbackId = "") {
  return String(activeGm?.id ?? fallbackId ?? "").trim();
}
