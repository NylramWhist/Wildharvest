// Since 1.27.0 (D8) Wildharvest uses Foundry's own translations (game.i18n): the texts come from
// lang/en.json and lang/pl.json declared in module.json, in the language chosen in Foundry.
// English is Foundry's fallback for any missing key. t() stays as a short name for localize/format.

export function t(key, data = {}) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return key;
  return data && Object.keys(data).length > 0 ? i18n.format(key, data) : i18n.localize(key);
}

export function getModuleLocale() {
  return String(globalThis.game?.i18n?.lang || "en");
}

// Locale tag for dates, numbers and sorting. The module has English and Polish texts only, so any
// other Foundry language (shown with the English texts) also gets English formats.
export function getModuleLocaleTag() {
  return getModuleLocale() === "pl" ? "pl-PL" : "en-US";
}

// Timestamps are stored as ISO 8601 since 1.21.0 and shown in the Foundry language.
// Text that is not a date (an old entry the migration could not read) is shown as is.
export function formatModuleTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const time = Date.parse(text);
  return Number.isNaN(time) ? text : new Date(time).toLocaleString(getModuleLocaleTag());
}

// Day and time of a stored ISO timestamp, for lists grouped by day (1.31.0). Empty for text
// that is not a date.
function parseModuleTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time);
}

export function formatModuleDay(value) {
  return parseModuleTimestamp(value)?.toLocaleDateString(getModuleLocaleTag(), { dateStyle: "medium" }) ?? "";
}

export function formatModuleClock(value) {
  return parseModuleTimestamp(value)?.toLocaleTimeString(getModuleLocaleTag(), { timeStyle: "short" }) ?? "";
}

// Numbers such as GP values in the Foundry language ("0,02" in Polish, "0.02" in English).
export function formatModuleNumber(value, { maximumFractionDigits = 2 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return new Intl.NumberFormat(getModuleLocaleTag(), { maximumFractionDigits }).format(number);
}

// Name sorting that follows the Foundry language instead of a fixed locale.
export function compareByModuleLocale(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), getModuleLocaleTag());
}
