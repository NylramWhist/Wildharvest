export function getAvailableActors() {
  const actors = game.actors?.contents ?? [];
  const filtered = game.user.isGM
    ? actors
    : actors.filter((actor) => actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));

  const sorted = [...filtered].sort((left, right) => left.name.localeCompare(right.name, "pl"));
  const preferredId = game.user.character?.id;

  if (!preferredId) return sorted;

  sorted.sort((left, right) => {
    if (left.id === preferredId) return -1;
    if (right.id === preferredId) return 1;
    return 0;
  });

  return sorted;
}

export function getLinkedPlayerCharacters() {
  const playerUsers = (game.users?.contents ?? []).filter((user) => !user.isGM && user.character);
  const seen = new Set();
  const actors = [];

  for (const user of playerUsers) {
    const actor = user.character;
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    actors.push(actor);
  }

  return actors.sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

export function getDefaultActorId(actors) {
  const preferredId = game.user.character?.id;
  if (preferredId && actors.some((actor) => actor.id === preferredId)) return preferredId;
  return actors[0]?.id ?? "";
}
