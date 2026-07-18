import { LANGUAGE_MODE_SETTING_KEY, MODULE_ID } from "./constants.js";

export const MODULE_LOCALES = Object.freeze(["en", "pl"]);

const MODULE_TRANSLATION_PATHS = Object.freeze(Object.fromEntries(
  MODULE_LOCALES.map((locale) => [locale, `modules/${MODULE_ID}/lang/${locale}.json`])
));

const MODULE_TRANSLATION_CACHE = Object.fromEntries(
  MODULE_LOCALES.map((locale) => [locale, null])
);
const MODULE_TRANSLATION_PROMISES = new Map();
const REGISTERED_LOCALIZATION_KEYS = new WeakMap();

export function normalizeModuleLocale(value) {
  return String(value ?? "").trim().toLowerCase().startsWith("pl") ? "pl" : "en";
}

export function normalizeModuleLanguageMode(value) {
  const normalizedValue = String(value ?? "").trim().replace(/^"|"$/g, "").toLowerCase();
  return ["auto", ...MODULE_LOCALES].includes(normalizedValue) ? normalizedValue : "";
}

export function formatModuleTranslation(template, data = {}) {
  return String(template).replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = data[key];
    return value ?? `{${key}}`;
  });
}

function readStoredLanguageMode() {
  const storageKey = `${MODULE_ID}.${LANGUAGE_MODE_SETTING_KEY}`;
  return globalThis.game?.settings?.storage?.get?.("client")?.get?.(storageKey)?.value
    ?? globalThis.game?.settings?.storage?.get?.("world")?.get?.(storageKey)?.value
    ?? "";
}

export function getModuleLanguageMode() {
  try {
    const liveValue = normalizeModuleLanguageMode(
      globalThis.game?.settings?.get?.(MODULE_ID, LANGUAGE_MODE_SETTING_KEY)
    );
    if (liveValue) return liveValue;
  } catch (_error) {
    // Fall back to raw storage during startup, before the setting is registered.
  }

  return normalizeModuleLanguageMode(readStoredLanguageMode()) || "en";
}

export function getModuleLocale() {
  const languageMode = getModuleLanguageMode();
  if (MODULE_LOCALES.includes(languageMode)) return languageMode;
  return normalizeModuleLocale(globalThis.game?.i18n?.lang || "en");
}

export function getModuleLocaleTag() {
  return getModuleLocale() === "pl" ? "pl-PL" : "en-US";
}

function getGameLocalized(key, data = {}) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return key;

  return Object.keys(data).length > 0
    ? i18n.format?.(key, data) ?? key
    : i18n.localize?.(key) ?? key;
}

function isTranslationDictionary(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((translation) => typeof translation === "string")
  );
}

async function loadModuleTranslations(locale) {
  const normalizedLocale = normalizeModuleLocale(locale);
  if (MODULE_TRANSLATION_CACHE[normalizedLocale]) return MODULE_TRANSLATION_CACHE[normalizedLocale];
  if (MODULE_TRANSLATION_PROMISES.has(normalizedLocale)) {
    return MODULE_TRANSLATION_PROMISES.get(normalizedLocale);
  }

  const promise = Promise.resolve()
    .then(async () => {
      const response = await globalThis.fetch(MODULE_TRANSLATION_PATHS[normalizedLocale]);
      if (!response?.ok) {
        throw new Error(`Failed to load ${normalizedLocale} translations from ${MODULE_TRANSLATION_PATHS[normalizedLocale]}.`);
      }

      const strings = await response.json();
      if (!isTranslationDictionary(strings)) {
        throw new Error(`Invalid ${normalizedLocale} translation dictionary.`);
      }

      MODULE_TRANSLATION_CACHE[normalizedLocale] = Object.freeze({ ...strings });
      return MODULE_TRANSLATION_CACHE[normalizedLocale];
    })
    .finally(() => {
      MODULE_TRANSLATION_PROMISES.delete(normalizedLocale);
    });

  MODULE_TRANSLATION_PROMISES.set(normalizedLocale, promise);
  return promise;
}

function getRegisteredLocalizationKeys(registration) {
  const storedKeys = REGISTERED_LOCALIZATION_KEYS.get(registration) ?? {
    fields: {},
    choices: {}
  };

  for (const field of ["name", "label", "hint"]) {
    const value = registration?.[field];
    if (typeof value === "string" && value.startsWith("WILDHARVEST.")) {
      storedKeys.fields[field] = value;
    }
  }

  for (const [choice, value] of Object.entries(registration?.choices ?? {})) {
    if (typeof value === "string" && value.startsWith("WILDHARVEST.")) {
      storedKeys.choices[choice] = value;
    }
  }

  REGISTERED_LOCALIZATION_KEYS.set(registration, storedKeys);
  return storedKeys;
}

function refreshRegisteredEntry(registration) {
  if (!registration || typeof registration !== "object") return;
  const localizationKeys = getRegisteredLocalizationKeys(registration);

  for (const [field, key] of Object.entries(localizationKeys.fields)) {
    registration[field] = t(key);
  }

  for (const [choice, key] of Object.entries(localizationKeys.choices)) {
    registration.choices[choice] = t(key);
  }
}

export function refreshRegisteredModuleLocalization() {
  const settings = globalThis.game?.settings;
  for (const registration of settings?.settings?.values?.() ?? []) {
    if (registration?.namespace === MODULE_ID) refreshRegisteredEntry(registration);
  }
  for (const registration of settings?.menus?.values?.() ?? []) {
    if (registration?.namespace === MODULE_ID) refreshRegisteredEntry(registration);
  }
}

export async function preloadModuleTranslations() {
  await Promise.all(MODULE_LOCALES.map((locale) => loadModuleTranslations(locale)));
  refreshRegisteredModuleLocalization();
}

export function t(key, data = {}) {
  const languageMode = getModuleLanguageMode();
  if (languageMode === "auto") {
    const localized = getGameLocalized(key, data);
    if (localized !== key) return localized;
  }

  const preferredStrings = MODULE_TRANSLATION_CACHE[getModuleLocale()];
  if (preferredStrings?.[key] !== undefined) {
    return formatModuleTranslation(preferredStrings[key], data);
  }

  const englishStrings = MODULE_TRANSLATION_CACHE.en;
  if (englishStrings?.[key] !== undefined) {
    return formatModuleTranslation(englishStrings[key], data);
  }

  const localized = getGameLocalized(key, data);
  return localized !== key ? localized : key;
}
