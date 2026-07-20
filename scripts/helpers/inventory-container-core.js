const MAX_CONTAINER_ID_LENGTH = 128;

export function normalizeContainerId(value) {
  return String(value ?? "").trim().slice(0, MAX_CONTAINER_ID_LENGTH);
}

export function getActorItems(actor) {
  const items = actor?.items;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.contents)) return items.contents;
  if (typeof items.values === "function") return [...items.values()];
  return [...items];
}

export function getActorContainers(actor) {
  return getActorItems(actor)
    .filter((item) => item?.type === "container" && normalizeContainerId(item.id))
    .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")));
}

export function getActorContainer(actor, containerId) {
  const normalizedId = normalizeContainerId(containerId);
  if (!normalizedId) return null;
  return getActorContainers(actor).find((item) => item.id === normalizedId) ?? null;
}

export function getItemContainerId(item) {
  return normalizeContainerId(item?.system?.container);
}
