export function normalizeRollMode({ rollMode = "normal", advantage = false } = {}) {
  if (advantage) return "advantage";

  const normalized = String(rollMode ?? "normal").trim().toLowerCase();
  if (normalized === "advantage" || normalized === "disadvantage") return normalized;
  return "normal";
}

export function getRollFormula(modifier, options = {}) {
  const rollMode = normalizeRollMode(options);
  const baseFormula = rollMode === "advantage"
    ? "2d20kh"
    : rollMode === "disadvantage"
      ? "2d20kl"
      : "1d20";
  if (modifier < 0) return `${baseFormula} - ${Math.abs(modifier)}`;
  return `${baseFormula} + ${modifier}`;
}

export function getLootPointsForRollTotal(rollTotal, brackets = []) {
  const normalizedBrackets = [...(Array.isArray(brackets) ? brackets : [])]
    .filter((bracket) => Number.isFinite(Number(bracket?.minTotal)) && Number.isFinite(Number(bracket?.lootPoints)))
    .sort((left, right) => Number(right.minTotal) - Number(left.minTotal));

  return normalizedBrackets.find((bracket) => Number(rollTotal) >= Number(bracket.minTotal))?.lootPoints ?? 0;
}

export function normalizeRarityId(rawValue) {
  const normalized = String(
    rawValue?.value
    ?? rawValue?.label
    ?? rawValue
    ?? ""
  )
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (!normalized || normalized === "common") return "common";
  if (normalized === "uncommon") return "uncommon";
  if (normalized === "rare") return "rare";
  if (normalized === "veryrare") return "veryRare";
  if (normalized === "legendary" || normalized === "artifact") return "legendary";
  return "common";
}

export function getDocumentRarityId(document) {
  return normalizeRarityId(
    document?.system?.rarity
    ?? document?.system?.details?.rarity
    ?? document?.rarity
    ?? ""
  );
}

export function getCompendiumDocumentId(document) {
  return String(document?._id ?? document?.id ?? "").trim();
}

export function getCompendiumEntryKey(entry) {
  const packId = String(entry?.packId ?? "").trim();
  const documentId = getCompendiumDocumentId(entry?.document);
  return packId && documentId ? `${packId}:${documentId}` : "";
}

function encodeRewardIdPart(value) {
  return [...String(value ?? "")].map((character) => (
    /^[a-z0-9_-]$/i.test(character)
      ? character
      : `~${character.codePointAt(0).toString(16)}~`
  )).join("");
}

export function getCompendiumRewardId(definitionId, entry) {
  const packId = String(entry?.packId ?? "").trim();
  const documentId = getCompendiumDocumentId(entry?.document);
  if (!packId || !documentId) return "";
  return [definitionId, packId, documentId].map(encodeRewardIdPart).join(":");
}

export function chooseWeightedRarity(definitions, random = Math.random) {
  const totalWeight = definitions.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  let remaining = random() * totalWeight;
  for (const entry of definitions) {
    remaining -= entry.weight;
    if (remaining <= 0) return entry;
  }

  return definitions.at(-1) ?? null;
}

export function buildRarityPools(pooledDocuments, definitions = []) {
  const rarityPools = Object.fromEntries(definitions.map((entry) => [entry.id, []]));

  for (const entry of pooledDocuments) {
    const rarityId = getDocumentRarityId(entry.document);
    if (!rarityPools[rarityId]) {
      rarityPools[rarityId] = [];
    }
    rarityPools[rarityId].push(entry);
  }

  return rarityPools;
}

export function getAffordableRarities(remainingPoints, rarityPools, definitions = []) {
  return definitions.filter((entry) => entry.cost <= remainingPoints && rarityPools[entry.id]?.length);
}

export function normalizeCompendiumIndex(index) {
  if (Array.isArray(index)) return [...index];

  if (typeof index?.entries === "function") {
    return Array.from(index.entries(), ([collectionId, document]) => {
      if (getCompendiumDocumentId(document)) return document;
      return { ...document, _id: String(collectionId ?? "").trim() };
    });
  }

  return Array.from(index ?? []);
}
