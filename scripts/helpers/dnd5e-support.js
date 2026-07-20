function normalizeLookup(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const SKILL_ALIASES = {
  acr: ["acrobatics", "akrobatyka"],
  ani: ["animalhandling", "animal", "zwierzeta", "obslugazwierzat"],
  arc: ["arcana"],
  ath: ["athletics", "atletyka"],
  dec: ["deception", "oszustwo"],
  his: ["history", "historia"],
  ins: ["insight", "intuicja"],
  itm: ["intimidation", "zastraszanie"],
  inv: ["investigation", "sledztwo", "dochodzenie"],
  med: ["medicine", "medycyna"],
  nat: ["nature", "natura"],
  prc: ["perception", "spostrzegawczosc", "percepcja"],
  prf: ["performance", "wystepy"],
  per: ["persuasion", "perswazja"],
  rel: ["religion", "religia"],
  slt: ["sleightofhand", "zrecznedlonie"],
  ste: ["stealth", "skradanie"],
  sur: ["survival", "przetrwanie"]
};

function getSkillConfigEntry(skillId) {
  return CONFIG.DND5E?.skills?.[skillId] ?? null;
}

export function isDnd5eSystem() {
  return game.system?.id === "dnd5e";
}

export function getDnd5eSkillLabel(skillId) {
  const entry = getSkillConfigEntry(skillId);
  if (!entry) return skillId;

  const rawLabel = typeof entry === "string"
    ? entry
    : entry.label ?? entry.abbreviation ?? skillId;

  if (typeof rawLabel !== "string") return skillId;
  if (rawLabel.includes(".")) return game.i18n?.localize?.(rawLabel) ?? rawLabel;
  return rawLabel;
}

export function getDnd5eSkillChoices() {
  if (!isDnd5eSystem()) return [];

  return Object.keys(CONFIG.DND5E?.skills ?? {})
    .map((skillId) => ({
      id: skillId,
      label: getDnd5eSkillLabel(skillId)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang || "en"));
}

export function resolveDnd5eSkillId(activity) {
  if (!isDnd5eSystem()) return null;

  const configuredSkillId = String(activity?.skillId ?? "").trim().toLowerCase();
  if (configuredSkillId && getSkillConfigEntry(configuredSkillId)) {
    return configuredSkillId;
  }

  const lookup = normalizeLookup(activity?.skillLabel ?? "");
  if (!lookup) return null;

  for (const skillId of Object.keys(CONFIG.DND5E?.skills ?? {})) {
    if (normalizeLookup(getDnd5eSkillLabel(skillId)) === lookup) {
      return skillId;
    }
  }

  for (const [skillId, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.includes(lookup) && getSkillConfigEntry(skillId)) {
      return skillId;
    }
  }

  return null;
}

export function getActivitySkillLabel(activity) {
  const skillId = resolveDnd5eSkillId(activity);
  return skillId ? getDnd5eSkillLabel(skillId) : String(activity?.skillLabel ?? "");
}

export function getActorSkillModifier(actor, activity) {
  if (!actor || !isDnd5eSystem()) return null;

  const skillId = resolveDnd5eSkillId(activity);
  if (!skillId) return null;

  const modifier = foundry.utils.getProperty(actor, `system.skills.${skillId}.total`)
    ?? foundry.utils.getProperty(actor, `system.skills.${skillId}.mod`);
  return Number.isFinite(Number(modifier)) ? Number(modifier) : null;
}
