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

// Containers a player can put loot into: only those lying directly in the inventory, not ones
// inside another container (e.g. a vial or jug found as loot and stored in the backpack).
// Equipped containers come first (1.21.1).
export function getActorContainers(actor) {
  return getActorItems(actor)
    .filter((item) => item?.type === "container"
      && normalizeContainerId(item.id)
      && !normalizeContainerId(item.system?.container))
    .sort((left, right) => (Number(Boolean(right.system?.equipped)) - Number(Boolean(left.system?.equipped)))
      || String(left.name ?? "").localeCompare(String(right.name ?? "")));
}

// Labels for the destination list: containers with the same name get the number of items inside.
export function getContainerOptionLabels(actor, containers = getActorContainers(actor), formatWithCount) {
  const nameCounts = new Map();
  for (const container of containers) {
    const name = String(container.name ?? "");
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const items = getActorItems(actor);
  return new Map(containers.map((container) => {
    const name = String(container.name ?? "");
    if (nameCounts.get(name) < 2) return [container.id, name];
    const count = items.filter((item) => normalizeContainerId(item?.system?.container) === container.id).length;
    return [container.id, formatWithCount(name, count)];
  }));
}

export function getActorContainer(actor, containerId) {
  const normalizedId = normalizeContainerId(containerId);
  if (!normalizedId) return null;
  return getActorContainers(actor).find((item) => item.id === normalizedId) ?? null;
}

export function getItemContainerId(item) {
  return normalizeContainerId(item?.system?.container);
}
