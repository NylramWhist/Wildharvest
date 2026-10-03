import { getCompendiumEntryKey } from "./search-engine-core.js";

const COPPER_PER_DENOMINATION = Object.freeze({
  pp: 1000,
  gp: 100,
  ep: 50,
  sp: 10,
  cp: 1
});

// 1.39.0 (D22): the cap of 5 copies applies to the diversity stage only. The top-up stage may add
// more copies of the items that stage already picked.
export const MAX_VALUE_ITEM_QUANTITY = 5;
// 1.23.0 (D7): how many different items one value search may give. The GM changes it in Loot Rules.
export const DEFAULT_VALUE_DISTINCT_ITEMS = 20;
export const MAX_VALUE_DISTINCT_ITEMS = 100;
// 1.39.0 (D25): upper limit of copies in one search, counting every item. The top-up stage stops
// there even when the total is still below the tolerance range.
export const DEFAULT_VALUE_MAX_TOTAL_ITEMS = 300;
export const MIN_VALUE_MAX_TOTAL_ITEMS = 10;
export const MAX_VALUE_MAX_TOTAL_ITEMS = 2000;
// The engine only looks at this many candidates per allowed distinct item (at least MIN_VALUE_CANDIDATES).
const CANDIDATES_PER_DISTINCT_ITEM = 8;
const MIN_VALUE_CANDIDATES = 64;
// The top-up and tuning stages pause for the browser about this often (in added copies).
const TOP_UP_YIELD_EVERY = 64;

export function normalizeValueDistinctItems(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 1) return DEFAULT_VALUE_DISTINCT_ITEMS;
  return Math.min(MAX_VALUE_DISTINCT_ITEMS, number);
}

export function normalizeValueMaxTotalItems(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return DEFAULT_VALUE_MAX_TOTAL_ITEMS;
  return Math.min(MAX_VALUE_MAX_TOTAL_ITEMS, Math.max(MIN_VALUE_MAX_TOTAL_ITEMS, number));
}

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

// Items the value engine could pick for this target: a positive price within the upper tolerance.
export function countAffordableValueEntries(pooledDocuments, targetGp, tolerancePercent = 10) {
  const targetCopper = currencyToCopper(targetGp, "gp") ?? 0;
  const normalizedTolerance = Math.min(100, Math.max(0, Number(tolerancePercent) || 0));
  const upperCopper = Math.round(targetCopper * (1 + (normalizedTolerance / 100)));
  if (upperCopper <= 0) return 0;
  return (Array.isArray(pooledDocuments) ? pooledDocuments : [])
    .filter((entry) => {
      const priceCopper = Object.prototype.hasOwnProperty.call(entry ?? {}, "priceCopper")
        ? entry.priceCopper
        : getDocumentPriceCopper(entry?.document);
      return Number.isInteger(priceCopper) && priceCopper > 0 && priceCopper <= upperCopper;
    })
    .length;
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
  if (candidate.distinctEntryCount !== current.distinctEntryCount) {
    return candidate.distinctEntryCount > current.distinctEntryCount;
  }
  return candidate.entryCount > current.entryCount;
}

function shouldReplaceEquivalentSelection(candidate, current, random) {
  if (!current) return true;
  if (candidate.distinctEntryCount !== current.distinctEntryCount) {
    return candidate.distinctEntryCount > current.distinctEntryCount;
  }
  if (candidate.entryCount !== current.entryCount) {
    return candidate.entryCount > current.entryCount;
  }
  const candidateWeight = Math.max(1, Number(candidate.distinctEntryCount) || 0);
  const currentWeight = Math.max(1, Number(current.distinctEntryCount) || 0);
  return random() < (candidateWeight / (candidateWeight + currentWeight));
}

// The chain of chosen items, oldest first, as mutable { entry, quantity } stacks.
function collectSelectionSegments(selection) {
  const segments = [];
  let current = selection;
  while (current?.previous) {
    segments.push({ entry: current.entry, quantity: current.quantity });
    current = current.previous;
  }
  return segments.reverse();
}

function materializeSegmentEntries(segments) {
  const entries = [];
  for (const segment of segments) {
    for (let copy = 0; copy < segment.quantity; copy += 1) entries.push(segment.entry);
  }
  return entries;
}

function countSegmentCopies(segments) {
  return segments.reduce((sum, segment) => sum + segment.quantity, 0);
}

function pickRandomFrom(list, random) {
  if (!list.length) return null;
  const index = Math.min(list.length - 1, Math.floor(random() * list.length));
  return list[index];
}

// The most a diversity stage could ever reach: the priciest allowed items, each at the copy cap, and
// never more copies than the total limit allows.
function getMaxDiversityTotal(candidates, distinctLimit, quantityLimit, totalItemLimit) {
  const priciest = [...candidates]
    .sort((left, right) => right.priceCopper - left.priceCopper)
    .slice(0, distinctLimit);
  let copiesLeft = totalItemLimit;
  let total = 0;
  for (const entry of priciest) {
    if (copiesLeft <= 0) break;
    const copies = Math.min(quantityLimit, copiesLeft);
    total += entry.priceCopper * copies;
    copiesLeft -= copies;
  }
  return total;
}

// 1.39.0: when even the priciest items cannot reach the tolerance range in the diversity stage, the
// search over sums is pointless work (and the slowest case on a large compendium). The engine seeds
// one copy of each of maxDistinctItems items instead — preferring prices that can still reach the
// target within maxTotalItems copies — and lets the top-up stage build the total evenly.
function seedDiversitySegments(candidates, { distinctLimit, targetCopper, maxTotalItems, random }) {
  // What one copy has to be worth for maxTotalItems copies to reach the target.
  const usefulPrice = Math.max(1, Math.floor(targetCopper / Math.max(1, maxTotalItems)));
  const shuffled = shuffleEntries(candidates, random);
  const useful = shuffled.filter((entry) => entry.priceCopper >= usefulPrice);
  const cheaper = shuffled
    .filter((entry) => entry.priceCopper < usefulPrice)
    .sort((left, right) => right.priceCopper - left.priceCopper);
  return [...useful, ...cheaper]
    .slice(0, distinctLimit)
    .map((entry) => ({ entry, quantity: 1 }));
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

// A large compendium has hundreds of items that fit the budget, but a search gives at most
// maxDistinctItems of them. The engine picks a random sample, preferring items that are
// expensive enough to reach the target with that many items, so large targets stay reachable.
function sampleValueCandidates(candidates, { maxDistinctItems, quantityLimit, lowerCopper, random }) {
  const shuffled = shuffleEntries(candidates, random);
  const sampleSize = Math.max(MIN_VALUE_CANDIDATES, maxDistinctItems * CANDIDATES_PER_DISTINCT_ITEM);
  if (shuffled.length <= sampleSize) return shuffled;
  const usefulPrice = Math.floor(lowerCopper / (maxDistinctItems * quantityLimit));
  const useful = shuffled.filter((entry) => entry.priceCopper >= usefulPrice);
  const small = shuffled.filter((entry) => entry.priceCopper < usefulPrice);
  const picked = [...useful.slice(0, sampleSize), ...small.slice(0, Math.max(0, sampleSize - useful.length))];
  return shuffleEntries(picked, random);
}

// Stages 2 and 3 of the 1.39.0 engine, on the stacks the diversity stage produced. It is a generator
// so a long top-up can pause for the browser, and it is run once per diversity attempt.
function* finishSelectionSteps(segments, diversityTotal, {
  lowerCopper,
  targetCopper,
  upperCopper,
  distinctLimit,
  copyLimit,
  uniqueCandidates,
  random
}) {
  const diversityEntryCount = countSegmentCopies(segments);
  let totalCopper = diversityTotal;
  let copyCount = diversityEntryCount;
  let topUpEntryCount = 0;
  let hitTotalLimit = false;
  let sinceYield = 0;

  // Stage 2 — top-up (D22, D23): one copy at a time to the stack that has the fewest, so the stacks
  // stay even. Ties go to a random item whose price still fits under the upper tolerance bound. It
  // aims at the target, not at the lower bound, so a topped-up result does not always land at -10%.
  // A tolerance of 100% puts the lower bound at 0, so the target decides whether topping up is due.
  const needsTopUp = lowerCopper > 0 ? totalCopper < lowerCopper : totalCopper < targetCopper;
  while (needsTopUp && totalCopper < targetCopper && segments.length) {
    if (copyCount >= copyLimit) {
      // The loop only runs while the total is under the target, so the limit is what stopped it.
      hitTotalLimit = true;
      break;
    }
    const room = upperCopper - totalCopper;
    const affordable = segments.filter((segment) => segment.entry.priceCopper <= room);
    if (!affordable.length) break;
    const fewestCopies = affordable.reduce(
      (fewest, segment) => Math.min(fewest, segment.quantity),
      Number.POSITIVE_INFINITY
    );
    const picked = pickRandomFrom(affordable.filter((segment) => segment.quantity === fewestCopies), random);
    picked.quantity += 1;
    totalCopper += picked.entry.priceCopper;
    copyCount += 1;
    topUpEntryCount += 1;
    sinceYield += 1;
    if (sinceYield >= TOP_UP_YIELD_EVERY) {
      sinceYield = 0;
      yield;
    }
  }

  // Stage 3 — tuning: the top-up stage ran out of items it could still afford, so a cheaper item
  // from the pool (still inside the limit of different items) may close the gap.
  if (totalCopper < lowerCopper && !hitTotalLimit && segments.length < distinctLimit) {
    const chosen = new Set(segments.map((segment) => segment.entry));
    const spare = uniqueCandidates
      .filter((entry) => !chosen.has(entry))
      .sort((left, right) => left.priceCopper - right.priceCopper);
    while (totalCopper < lowerCopper && segments.length < distinctLimit && spare.length) {
      if (copyCount >= copyLimit) {
        hitTotalLimit = true;
        break;
      }
      const room = upperCopper - totalCopper;
      const toTarget = targetCopper - totalCopper;
      // Sorted by price: the item closest to what is still missing is either the priciest one at or
      // below it, or the cheapest one above it that still fits under the upper bound.
      let underIndex = -1;
      let overIndex = -1;
      for (const [index, entry] of spare.entries()) {
        if (entry.priceCopper > room) break;
        if (entry.priceCopper <= toTarget) underIndex = index;
        else {
          overIndex = index;
          break;
        }
      }
      let pickedIndex = underIndex;
      if (overIndex >= 0) {
        const underGap = underIndex >= 0 ? toTarget - spare[underIndex].priceCopper : Number.POSITIVE_INFINITY;
        if (spare[overIndex].priceCopper - toTarget < underGap) pickedIndex = overIndex;
      }
      if (pickedIndex < 0) break;
      const [picked] = spare.splice(pickedIndex, 1);
      segments.push({ entry: picked, quantity: 1 });
      totalCopper += picked.priceCopper;
      copyCount += 1;
      topUpEntryCount += 1;
    }
    yield;
  }

  return {
    segments,
    totalCopper,
    diversityEntryCount,
    topUpEntryCount,
    hitTotalLimit,
    withinTolerance: totalCopper >= lowerCopper && totalCopper <= upperCopper
  };
}

// Which of two finished attempts the GM gets: one inside the tolerance range beats one outside it,
// otherwise the one closer to the target.
function isBetterOutcome(candidate, current, targetCopper) {
  if (!current) return true;
  if (candidate.withinTolerance !== current.withinTolerance) return candidate.withinTolerance;
  return Math.abs(targetCopper - candidate.totalCopper) < Math.abs(targetCopper - current.totalCopper);
}

// Selection as a generator: it yields after each candidate, so the browser version can pause
// and let the interface refresh (selectValueBudgetItemsAsync). Node tests use the plain version.
function* valueSelectionSteps({
  pooledDocuments,
  targetGp,
  tolerancePercent = 10,
  random = Math.random,
  maxStates = 25_000,
  maxQuantityPerItem = MAX_VALUE_ITEM_QUANTITY,
  maxDistinctItems = DEFAULT_VALUE_DISTINCT_ITEMS,
  maxTotalItems = DEFAULT_VALUE_MAX_TOTAL_ITEMS
}) {
  const targetCopper = currencyToCopper(targetGp, "gp") ?? 0;
  const normalizedTolerance = Math.min(100, Math.max(0, Number(tolerancePercent) || 0));
  const lowerCopper = Math.max(0, Math.round(targetCopper * (1 - (normalizedTolerance / 100))));
  const upperCopper = Math.round(targetCopper * (1 + (normalizedTolerance / 100)));
  const pricedEntries = (Array.isArray(pooledDocuments) ? pooledDocuments : [])
    .map((entry) => ({
      ...entry,
      priceCopper: Object.prototype.hasOwnProperty.call(entry ?? {}, "priceCopper")
        ? entry.priceCopper
        : getDocumentPriceCopper(entry.document)
    }));
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
  const quantityLimit = Math.min(
    MAX_VALUE_ITEM_QUANTITY,
    Math.max(1, Math.trunc(Number(maxQuantityPerItem) || MAX_VALUE_ITEM_QUANTITY))
  );
  const distinctLimit = normalizeValueDistinctItems(maxDistinctItems);
  const totalItemLimit = normalizeValueMaxTotalItems(maxTotalItems);

  // Stage 1 — diversity: up to distinctLimit different items, each in 1–quantityLimit copies.
  const finishContext = {
    lowerCopper,
    targetCopper,
    upperCopper,
    distinctLimit,
    copyLimit: totalItemLimit,
    uniqueCandidates,
    random
  };
  const seedAttempt = function* () {
    const segments = seedDiversitySegments(uniqueCandidates, {
      distinctLimit: Math.min(distinctLimit, totalItemLimit),
      targetCopper,
      maxTotalItems: totalItemLimit,
      random
    });
    const seedTotal = segments.reduce((sum, segment) => sum + segment.entry.priceCopper, 0);
    yield;
    const outcome = yield* finishSelectionSteps(segments, seedTotal, finishContext);
    return { ...outcome, diversityStrategy: "seed" };
  };

  // The search over sums cannot land inside the range when even the priciest items fall short of it,
  // and on a large compendium it is the slowest case, so the engine seeds the stacks instead.
  const canSearchForTotal = getMaxDiversityTotal(uniqueCandidates, distinctLimit, quantityLimit, totalItemLimit)
    >= lowerCopper;
  let sampledCandidateCount = uniqueCandidates.length;
  let outcome = null;

  if (canSearchForTotal) {
    const orderedCandidates = sampleValueCandidates(uniqueCandidates, {
      maxDistinctItems: distinctLimit,
      quantityLimit,
      lowerCopper,
      random
    });
    sampledCandidateCount = orderedCandidates.length;
    const stateLimit = Math.max(100, Math.trunc(Number(maxStates) || 25_000));
    let states = new Map([[0, {
      totalCopper: 0,
      distinctEntryCount: 0,
      entryCount: 0,
      previous: null,
      entry: null,
      quantity: 0
    }]]);

    for (const entry of orderedCandidates) {
      const sourceStates = [...states.values()];
      for (const state of sourceStates) {
        // A state that already holds as many different items or copies as the limits allow cannot
        // take another candidate, so it is skipped instead of being re-scanned for every one.
        if (state.distinctEntryCount >= distinctLimit || state.entryCount >= totalItemLimit) continue;
        for (let quantity = 1; quantity <= quantityLimit; quantity += 1) {
          if (state.entryCount + quantity > totalItemLimit) break;
          const stateTotal = state.totalCopper + (entry.priceCopper * quantity);
          if (stateTotal > upperCopper) break;
          const candidate = {
            totalCopper: stateTotal,
            distinctEntryCount: state.distinctEntryCount + 1,
            entryCount: state.entryCount + quantity,
            previous: state,
            entry,
            quantity
          };
          const current = states.get(candidate.totalCopper);
          if (shouldReplaceEquivalentSelection(candidate, current, random)) {
            states.set(candidate.totalCopper, candidate);
          }
        }
      }
      states = pruneSelectionStates(states, stateLimit, lowerCopper, targetCopper, upperCopper);
      yield;
    }

    let best = null;
    for (const candidate of states.values()) {
      if (isBetterSelection(candidate, best, lowerCopper, targetCopper, upperCopper)) best = candidate;
    }
    best ??= { totalCopper: 0, previous: null };
    const searched = yield* finishSelectionSteps(
      collectSelectionSegments(best),
      best.totalCopper,
      finishContext
    );
    outcome = { ...searched, diversityStrategy: "search" };

    // The search optimizes for a sum close to the target, so it may pick cheap items that the top-up
    // stage then cannot multiply far enough before the copy limit. Seeding costs a few milliseconds,
    // so whenever the search misses the range, or the copy limit stopped it short of the target, the
    // engine also seeds the stacks and keeps whichever attempt came out better.
    if (!outcome.withinTolerance || outcome.hitTotalLimit) {
      const seeded = yield* seedAttempt();
      if (isBetterOutcome(seeded, outcome, targetCopper)) outcome = seeded;
    }
  } else {
    outcome = yield* seedAttempt();
  }

  const {
    segments,
    totalCopper,
    diversityEntryCount,
    topUpEntryCount,
    hitTotalLimit,
    diversityStrategy
  } = outcome;

  const entries = materializeSegmentEntries(segments);
  const quantities = segments.map((segment) => segment.quantity);

  return {
    entries,
    totalCopper,
    distinctEntryCount: segments.length,
    lowerCopper,
    targetCopper,
    upperCopper,
    tolerancePercent: normalizedTolerance,
    invalidPriceCount,
    unaffordableCount,
    duplicateEntryCount,
    maxQuantityPerItem: quantityLimit,
    maxDistinctItems: distinctLimit,
    maxTotalItems: totalItemLimit,
    candidateCount: uniqueCandidates.length,
    sampledCandidateCount,
    diversityStrategy,
    diversityEntryCount,
    topUpEntryCount,
    hitTotalLimit,
    minEntryQuantity: quantities.length ? Math.min(...quantities) : 0,
    maxEntryQuantity: quantities.length ? Math.max(...quantities) : 0,
    exactTarget: totalCopper === targetCopper,
    withinTolerance: totalCopper >= lowerCopper && totalCopper <= upperCopper
  };
}

export function selectValueBudgetItems(options) {
  const steps = valueSelectionSteps(options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

// A new task through MessageChannel: the browser can repaint in between, and unlike setTimeout
// it is not slowed down to one call per second when the GM's tab is in the background.
function pauseForBrowser() {
  if (typeof MessageChannel !== "function") return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

// Same selection, but it pauses about every yieldEveryMs so a large search does not freeze the
// GM's browser.
export async function selectValueBudgetItemsAsync(options, {
  yieldEveryMs = 25,
  pause = pauseForBrowser,
  now = () => globalThis.performance?.now?.() ?? Date.now()
} = {}) {
  const steps = valueSelectionSteps(options);
  let sliceStart = now();
  let step = steps.next();
  while (!step.done) {
    if (now() - sliceStart >= yieldEveryMs) {
      await pause();
      sliceStart = now();
    }
    step = steps.next();
  }
  return step.value;
}
