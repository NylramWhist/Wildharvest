import { getCompendiumEntryKey } from "./search-engine-core.js";

const COPPER_PER_DENOMINATION = Object.freeze({
  pp: 1000,
  gp: 100,
  ep: 50,
  sp: 10,
  cp: 1
});

export function currencyToCopper(value, denomination = "gp") {
  const numericValue = Number(value);
  const multiplier = COPPER_PER_DENOMINATION[String(denomination ?? "gp").trim().toLowerCase()];
  if (!Number.isFinite(numericValue) || numericValue < 0 || !multiplier) return null;
  return Math.round(numericValue * multiplier);
}

export function getDocumentPriceCopper(document) {
  const price = document?.system?.price ?? document?.price;
  if (!price || typeof price !== "object") return null;
  return currencyToCopper(price.value, price.denomination);
}

export function formatCopperAsGp(copper) {
  const gp = Math.max(0, Number(copper) || 0) / 100;
  return Number.isInteger(gp) ? String(gp) : gp.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function getValueBudgetForLootPoints(lootPoints, brackets = []) {
  const points = Math.max(0, Math.trunc(Number(lootPoints) || 0));
  return [...(Array.isArray(brackets) ? brackets : [])]
    .filter((entry) => Number.isFinite(Number(entry?.lootPoints)) && Number(entry.lootPoints) <= points)
    .sort((left, right) => Number(right.lootPoints) - Number(left.lootPoints))[0] ?? null;
}

function shuffleEntries(entries, random) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pickedIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[pickedIndex]] = [shuffled[pickedIndex], shuffled[index]];
  }
  return shuffled;
}

function getSelectionRank(totalCopper, lowerCopper, targetCopper, upperCopper) {
  const accepted = totalCopper >= lowerCopper && totalCopper <= upperCopper;
  const exact = totalCopper === targetCopper;
  return {
    accepted,
    exact,
    distance: Math.abs(targetCopper - totalCopper)
  };
}

function isBetterSelection(candidate, current, lowerCopper, targetCopper, upperCopper) {
  if (!current) return true;
  const candidateRank = getSelectionRank(candidate.totalCopper, lowerCopper, targetCopper, upperCopper);
  const currentRank = getSelectionRank(current.totalCopper, lowerCopper, targetCopper, upperCopper);
  if (candidateRank.exact !== currentRank.exact) return candidateRank.exact;
  if (candidateRank.accepted !== currentRank.accepted) return candidateRank.accepted;
  if (candidateRank.distance !== currentRank.distance) return candidateRank.distance < currentRank.distance;
  return candidate.entries.length > current.entries.length;
}

function pruneSelectionStates(states, maxStates, lowerCopper, targetCopper, upperCopper) {
  if (states.size <= maxStates) return states;

  const ranked = [...states.values()].sort((left, right) => {
    if (isBetterSelection(left, right, lowerCopper, targetCopper, upperCopper)) return -1;
    if (isBetterSelection(right, left, lowerCopper, targetCopper, upperCopper)) return 1;
    return left.totalCopper - right.totalCopper;
  });
  const preferredCount = Math.max(1, Math.floor(maxStates * 0.75));
  const retained = ranked.slice(0, preferredCount);
  const retainedTotals = new Set(retained.map((state) => state.totalCopper));
  const buildingStates = ranked
    .filter((state) => state.totalCopper < targetCopper && !retainedTotals.has(state.totalCopper))
    .sort((left, right) => left.totalCopper - right.totalCopper)
    .slice(0, maxStates - retained.length);

  return new Map([...retained, ...buildingStates].map((state) => [state.totalCopper, state]));
}

export function selectValueBudgetItems({
  pooledDocuments,
  targetGp,
  tolerancePercent = 10,
  random = Math.random,
  maxStates = 25_000
}) {
  const targetCopper = currencyToCopper(targetGp, "gp") ?? 0;
  const normalizedTolerance = Math.min(100, Math.max(0, Number(tolerancePercent) || 0));
  const lowerCopper = Math.max(0, Math.round(targetCopper * (1 - (normalizedTolerance / 100))));
  const upperCopper = Math.round(targetCopper * (1 + (normalizedTolerance / 100)));
  const pricedEntries = (Array.isArray(pooledDocuments) ? pooledDocuments : [])
    .map((entry) => ({ ...entry, priceCopper: getDocumentPriceCopper(entry.document) }));
  const invalidPriceCount = pricedEntries
    .filter((entry) => !Number.isInteger(entry.priceCopper) || entry.priceCopper <= 0)
    .length;
  const unaffordableCount = pricedEntries
    .filter((entry) => Number.isInteger(entry.priceCopper) && entry.priceCopper > upperCopper)
    .length;
  const seenEntryKeys = new Set();
  let duplicateEntryCount = 0;
  const candidates = pricedEntries
    .filter((entry) => Number.isInteger(entry.priceCopper) && entry.priceCopper > 0 && entry.priceCopper <= upperCopper);
  const uniqueCandidates = candidates.filter((entry, index) => {
    const entryKey = getCompendiumEntryKey(entry) || `missing-id:${index}`;
    if (seenEntryKeys.has(entryKey)) {
      duplicateEntryCount += 1;
      return false;
    }
    seenEntryKeys.add(entryKey);
    return true;
  });
  const orderedCandidates = shuffleEntries(uniqueCandidates, random)
    .sort((left, right) => left.priceCopper - right.priceCopper);
  const stateLimit = Math.max(100, Math.trunc(Number(maxStates) || 25_000));
  let states = new Map([[0, { entries: [], totalCopper: 0 }]]);

  for (const entry of orderedCandidates) {
    const additions = [];
    for (const state of states.values()) {
      const totalCopper = state.totalCopper + entry.priceCopper;
      if (totalCopper > upperCopper) continue;
      additions.push({ entries: [...state.entries, entry], totalCopper });
    }

    for (const candidate of additions) {
      const current = states.get(candidate.totalCopper);
      if (!current || candidate.entries.length > current.entries.length) {
        states.set(candidate.totalCopper, candidate);
      }
    }
    states = pruneSelectionStates(states, stateLimit, lowerCopper, targetCopper, upperCopper);
    if (states.has(targetCopper)) break;
  }

  let best = null;
  for (const candidate of states.values()) {
    if (isBetterSelection(candidate, best, lowerCopper, targetCopper, upperCopper)) best = candidate;
  }
  best ??= { entries: [], totalCopper: 0 };

  return {
    ...best,
    lowerCopper,
    targetCopper,
    upperCopper,
    tolerancePercent: normalizedTolerance,
    invalidPriceCount,
    unaffordableCount,
    duplicateEntryCount,
    exactTarget: best.totalCopper === targetCopper,
    withinTolerance: best.totalCopper >= lowerCopper && best.totalCopper <= upperCopper
  };
}
