export const DEFAULT_RULES_CONFIG = {
  lootMode: "rarity",
  lootPointBrackets: [
    { minTotal: 0, lootPoints: 0 },
    { minTotal: 10, lootPoints: 1 },
    { minTotal: 12, lootPoints: 2 },
    { minTotal: 14, lootPoints: 3 },
    { minTotal: 16, lootPoints: 4 },
    { minTotal: 18, lootPoints: 5 },
    { minTotal: 20, lootPoints: 6 },
    { minTotal: 22, lootPoints: 7 },
    { minTotal: 24, lootPoints: 8 },
    { minTotal: 26, lootPoints: 9 },
    { minTotal: 28, lootPoints: 10 }
  ],
  rarityRules: [
    { id: "common", cost: 1, weight: 60, quantityFormula: "1d6" },
    { id: "uncommon", cost: 2, weight: 25, quantityFormula: "1d4" },
    { id: "rare", cost: 4, weight: 10, quantityFormula: "1d2" },
    { id: "veryRare", cost: 6, weight: 4, quantityFormula: "1" },
    { id: "legendary", cost: 10, weight: 1, quantityFormula: "1" }
  ],
  valueRules: {
    tolerancePercent: 10,
    brackets: [
      { lootPoints: 0, targetGp: 0 },
      { lootPoints: 1, targetGp: 1 },
      { lootPoints: 2, targetGp: 2 },
      { lootPoints: 3, targetGp: 3 },
      { lootPoints: 4, targetGp: 4 },
      { lootPoints: 5, targetGp: 5 },
      { lootPoints: 6, targetGp: 6 },
      { lootPoints: 7, targetGp: 7 },
      { lootPoints: 8, targetGp: 8 },
      { lootPoints: 9, targetGp: 9 },
      { lootPoints: 10, targetGp: 10 }
    ]
  }
};
