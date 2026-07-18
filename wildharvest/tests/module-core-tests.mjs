import assert from "node:assert/strict";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRarityPools,
  chooseWeightedRarity,
  getAffordableRarities,
  getCompendiumEntryKey,
  getCompendiumDocumentId,
  getCompendiumRewardId,
  getLootPointsForRollTotal,
  getRollFormula,
  normalizeCompendiumIndex,
  normalizeRarityId,
  normalizeRollMode
} from "../scripts/helpers/search-engine-core.js";
import { executeSearch, previewLootRewards } from "../scripts/helpers/search-engine.js";
import { addCompendiumReward, spendLootPoints } from "../scripts/helpers/loot-engine-common.js";
import {
  currencyToCopper,
  getDocumentPriceCopper,
  getValueBudgetForLootPoints,
  selectValueBudgetItems
} from "../scripts/helpers/loot-engine-value-core.js";
import {
  MAX_PERSISTED_SESSIONS,
  collectPersistedSearchSessions,
  isAuthorizedSearchSocketMessage,
  restorePersistedSearchSessions,
  settleInterruptedResolutions
} from "../scripts/helpers/search-session-state.js";
import {
  buildPlayerDocumentRequest,
  isValidPlayerDocumentRequest,
  PLAYER_REQUEST_TYPES
} from "../scripts/helpers/player-request-core.js";
import {
  appendMigrationBackup,
  buildMigrationBackup,
  MIGRATION_BACKUP_FORMAT,
  normalizeMigrationBackupHistory
} from "../scripts/helpers/migration-backup-core.js";
import { createPreMigrationBackup } from "../scripts/helpers/migration-backup.js";
import { createModuleLifecycle } from "../scripts/helpers/module-lifecycle.js";
import { applySettingsTransaction } from "../scripts/helpers/settings-transaction-core.js";
import {
  claimSearchResolution,
  completeSearchResolution,
  failSearchResolution,
  SEARCH_RESOLUTION_REASONS
} from "../scripts/helpers/search-authority-core.js";
import {
  calculateGrantedQuantity,
  getInventoryDisplayQuantity,
  normalizeSystemQuantity
} from "../scripts/helpers/inventory-quantity-core.js";
import { grantRewardsToActorInventory } from "../scripts/helpers/inventory-store.js";
import { getActiveGmId, isActiveGmUser } from "../scripts/helpers/active-gm-core.js";
import {
  buildMinimalSearchOffer,
  buildNeutralResolutionNotice,
  isMinimalSearchOffer
} from "../scripts/helpers/search-socket-payload-core.js";
import {
  isWildharvestConfigExport,
  migrateModuleData,
  normalizeLocations,
  normalizeRulesConfig,
  parseLootPoolsFromText
} from "../scripts/settings.js";
import { sanitizeQuickOptionsForStorage } from "../scripts/helpers/activity-presets.js";
import {
  GM_LIVE_FILTERS,
  GM_PRESET_FILTERS,
  GM_RESPONSE_FILTERS,
  GM_SEND_MODES,
  ensureStateSelections,
  getFilteredLiveEntries,
  getFilteredPresets,
  getFilteredResponseEntries,
  getKeyboardTabTarget,
  getLatestSession,
  getResponseEntryKey,
  getSelectedSession,
  getSelectedUserIds,
  getSessionCounts
} from "../scripts/dialogs/gm-control-panel-state.js";
import {
  getFilteredHistoryEntries,
  getHistoryPlayerActors,
  getHistoryEntryKey,
} from "../scripts/dialogs/gm-control-panel-history-view.js";
import {
  bringDialogToFront,
  focusDialogControl,
  linkFormLabels
} from "../scripts/dialogs/dialog-utils.js";
import {
  formatModuleTranslation,
  normalizeModuleLanguageMode,
  normalizeModuleLocale,
  preloadModuleTranslations,
  t,
  refreshRegisteredModuleLocalization
} from "../scripts/i18n.js";
import { createTwoClientSearchHarness } from "./integration-search-session-harness.mjs";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readModuleJson(relativePath) {
  return JSON.parse(readFileSync(join(MODULE_ROOT, relativePath), "utf8"));
}

function collectModuleFiles(relativeDirectory, extensions) {
  const directory = join(MODULE_ROOT, relativeDirectory);
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectModuleFiles(relativePath, extensions));
    } else if (extensions.has(extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}

function getTemplateParameters(value) {
  return [...String(value).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const sharedBrackets = [
  { minTotal: 0, lootPoints: 0 },
  { minTotal: 10, lootPoints: 1 },
  { minTotal: 14, lootPoints: 3 },
  { minTotal: 20, lootPoints: 6 }
];
const rarityDefinitions = [
  { id: "common", cost: 1, weight: 10 },
  { id: "rare", cost: 4, weight: 2 }
];

test("module locale helpers normalize modes and preserve zero-valued format data", () => {
  assert.equal(normalizeModuleLocale("pl-PL"), "pl");
  assert.equal(normalizeModuleLocale("de"), "en");
  assert.equal(normalizeModuleLanguageMode('"PL"'), "pl");
  assert.equal(normalizeModuleLanguageMode("unsupported"), "");
  assert.equal(formatModuleTranslation("Found {quantity}", { quantity: 0 }), "Found 0");
});

test("forced module language loads both JSON dictionaries and ignores Foundry language", async () => {
  const previousFetch = globalThis.fetch;
  const previousGame = globalThis.game;
  const fetchedPaths = [];
  const dictionaries = {
    en: readModuleJson("lang/en.json"),
    pl: readModuleJson("lang/pl.json")
  };

  globalThis.fetch = async (path) => {
    const locale = String(path).endsWith("/pl.json") ? "pl" : "en";
    fetchedPaths.push(String(path));
    return {
      ok: true,
      json: async () => dictionaries[locale]
    };
  };
  globalThis.game = {
    settings: {
      get: () => "pl",
      settings: new Map(),
      menus: new Map()
    },
    i18n: {
      lang: "en",
      localize: (key) => dictionaries.en[key] ?? key,
      format: (key) => dictionaries.en[key] ?? key
    }
  };

  try {
    await preloadModuleTranslations();
    assert.equal(t("WILDHARVEST.Dialog.Close"), dictionaries.pl["WILDHARVEST.Dialog.Close"]);
    assert.deepEqual(fetchedPaths.sort(), [
      "modules/wildharvest/lang/en.json",
      "modules/wildharvest/lang/pl.json"
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.game = previousGame;
  }
});

test("registered module settings are refreshed from localization keys", () => {
  const previousGame = globalThis.game;
  const languageSetting = {
    namespace: "wildharvest",
    name: "WILDHARVEST.Setting.Language.Name",
    hint: "WILDHARVEST.Setting.Language.Hint",
    choices: {
      auto: "WILDHARVEST.Setting.Language.Auto"
    }
  };
  const foreignSetting = {
    namespace: "another-module",
    name: "WILDHARVEST.Setting.Language.Name"
  };

  globalThis.game = {
    settings: {
      get: () => "auto",
      settings: new Map([
        ["wildharvest.languageMode", languageSetting],
        ["another-module.languageMode", foreignSetting]
      ]),
      menus: new Map()
    },
    i18n: {
      lang: "en",
      localize: (key) => `localized:${key}`,
      format: (key) => `localized:${key}`
    }
  };

  try {
    refreshRegisteredModuleLocalization();
    assert.equal(languageSetting.name, "localized:WILDHARVEST.Setting.Language.Name");
    assert.equal(languageSetting.hint, "localized:WILDHARVEST.Setting.Language.Hint");
    assert.equal(languageSetting.choices.auto, "localized:WILDHARVEST.Setting.Language.Auto");
    assert.equal(foreignSetting.name, "WILDHARVEST.Setting.Language.Name");
  } finally {
    globalThis.game = previousGame;
  }
});

test("English and Polish localization files have identical complete key sets", () => {
  const english = readModuleJson("lang/en.json");
  const polish = readModuleJson("lang/pl.json");
  const englishKeys = Object.keys(english).sort();
  const polishKeys = Object.keys(polish).sort();

  assert.deepEqual(polishKeys, englishKeys);
  assert.ok(englishKeys.length > 0);
  for (const key of englishKeys) {
    assert.equal(typeof english[key], "string", `${key} must be a string in en.json`);
    assert.equal(typeof polish[key], "string", `${key} must be a string in pl.json`);
    assert.ok(english[key].trim(), `${key} must not be empty in en.json`);
    assert.ok(polish[key].trim(), `${key} must not be empty in pl.json`);
  }
});

test("English and Polish translations use the same template parameters", () => {
  const english = readModuleJson("lang/en.json");
  const polish = readModuleJson("lang/pl.json");

  for (const key of Object.keys(english)) {
    assert.deepEqual(
      getTemplateParameters(polish[key]),
      getTemplateParameters(english[key]),
      `${key} uses different format parameters`
    );
  }
});

test("all literal localization references exist and i18n.js contains no translation catalogue", () => {
  const english = readModuleJson("lang/en.json");
  const knownKeys = new Set(Object.keys(english));
  const referencedKeys = new Set();
  const sourceFiles = [
    ...collectModuleFiles("scripts", new Set([".js"])),
    ...collectModuleFiles("templates", new Set([".hbs"]))
  ];

  for (const relativePath of sourceFiles) {
    const source = readFileSync(join(MODULE_ROOT, relativePath), "utf8");
    for (const match of source.matchAll(/["'](POSZ\.[^"']+)["']/g)) {
      referencedKeys.add(match[1]);
    }
  }

  const missingKeys = [...referencedKeys].filter((key) => !knownKeys.has(key)).sort();
  assert.deepEqual(missingKeys, []);

  const i18nSource = readFileSync(join(MODULE_ROOT, "scripts/i18n.js"), "utf8");
  assert.equal(i18nSource.includes("EN_STRINGS"), false);
  assert.equal(/^\s*["']POSZ\.[^"']+["']\s*:/m.test(i18nSource), false);
});

test("manifest identity matches the canonical Wildharvest source folder", () => {
  const manifest = readModuleJson("module.json");
  assert.equal(basename(MODULE_ROOT), "wildharvest");
  assert.equal(manifest.id, "wildharvest");
  assert.equal(manifest.title, "Wildharvest");
  assert.deepEqual(manifest.relationships?.requires ?? [], []);
  assert.deepEqual(manifest.relationships?.recommends ?? [], []);
});

test("manifest records the actually tested Foundry and dnd5e compatibility", () => {
  const manifest = readModuleJson("module.json");
  const dnd5e = manifest.relationships?.systems?.find((relationship) => relationship.id === "dnd5e");

  assert.equal(manifest.version, "1.14.0");
  assert.deepEqual(manifest.compatibility, {
    minimum: "13.351",
    verified: "14.360"
  });
  assert.deepEqual(dnd5e?.compatibility, {
    minimum: "5.3.0",
    verified: "5.3.3"
  });
  assert.equal("maximum" in manifest.compatibility, false);
  assert.equal("maximum" in dnd5e.compatibility, false);
});

test("compatibility matrix keeps manifest claims conservative and live gates explicit", () => {
  const manifest = readModuleJson("module.json");
  const matrix = readModuleJson("tests/compatibility-matrix.json");
  const compatibility = readFileSync(join(MODULE_ROOT, "COMPATIBILITY.md"), "utf8");
  const minimum = matrix.foundry.find((entry) => entry.manifestRole === "minimum");
  const verified = matrix.foundry.find((entry) => entry.manifestRole === "verified");
  const candidate = matrix.foundry.find((entry) => entry.manifestRole === "candidate");

  assert.equal(matrix.schemaVersion, 1);
  assert.equal(manifest.compatibility.minimum, minimum.version);
  assert.equal(manifest.compatibility.verified, verified.version);
  assert.equal(candidate.version, "14.364");
  assert.equal(candidate.liveRuntime, "owner-required");
  assert.equal(matrix.twoClient.automatedHarness, true);
  assert.equal(matrix.twoClient.liveRuntime, "owner-required");
  for (const entry of matrix.foundry) {
    assert.match(compatibility, new RegExp(entry.version.replaceAll(".", "\\.")));
  }
});

test("workspace package and module manifest use the same release version", () => {
  const manifest = readModuleJson("module.json");
  const workspacePackage = JSON.parse(readFileSync(join(MODULE_ROOT, "..", "package.json"), "utf8"));

  assert.equal(workspacePackage.private, true);
  assert.equal(workspacePackage.version, manifest.version);
  assert.equal(typeof workspacePackage.scripts?.release, "string");
  assert.equal(typeof workspacePackage.scripts?.["format:check"], "string");
});

test("manifest documents and local README links resolve inside the module", () => {
  const manifest = readModuleJson("module.json");
  const documentPaths = [manifest.readme, manifest.changelog, "README.md"];

  for (const relativePath of documentPaths) {
    assert.equal(typeof relativePath, "string");
    assert.equal(existsSync(join(MODULE_ROOT, relativePath)), true, `${relativePath} must exist`);
  }

  const readmePath = join(MODULE_ROOT, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const localLinks = [...readme.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)]
    .map((match) => match[1].split("#", 1)[0].split("?", 1)[0]);

  assert.ok(localLinks.length > 0);
  for (const relativePath of localLinks) {
    assert.equal(
      existsSync(resolve(dirname(readmePath), relativePath)),
      true,
      `README link must resolve: ${relativePath}`
    );
  }
});

test("runtime source stays on the public API shared by Foundry 13 and 14", () => {
  const sourceFiles = collectModuleFiles("scripts", new Set([".js"]));
  const sources = sourceFiles.map((relativePath) => ({
    relativePath,
    source: readFileSync(join(MODULE_ROOT, relativePath), "utf8")
  }));
  const combined = sources.map(({ source }) => source).join("\n");
  const mainSource = readFileSync(join(MODULE_ROOT, "scripts/main.js"), "utf8");
  const searchSource = readFileSync(join(MODULE_ROOT, "scripts/helpers/search-engine.js"), "utf8");
  const inventorySource = readFileSync(join(MODULE_ROOT, "scripts/helpers/inventory-store.js"), "utf8");

  assert.match(combined, /foundry\.applications\.api\.DialogV2/);
  assert.match(combined, /foundry\.applications\.api/);
  assert.match(mainSource, /Hooks\.on\(["']getSceneControlButtons["']/);
  assert.match(mainSource, /control\.tools\[MODULE_ID\]\s*=/);
  assert.match(searchSource, /pack\.getIndex\(\{\s*fields:/);
  assert.match(inventorySource, /foundry\.utils\.fromUuid\(/);
  assert.match(inventorySource, /actor\.createEmbeddedDocuments\(["']Item["']/);
  assert.equal(/\bFormApplication\b/.test(combined), false);
  assert.equal(/(?<![.\w])fromUuid\s*\(/.test(combined), false);
});

test("active runtime sources contain no former project branding", () => {
  const sourceFiles = [
    ...collectModuleFiles("scripts", new Set([".js"])),
    ...collectModuleFiles("templates", new Set([".hbs"])),
    ...collectModuleFiles("styles", new Set([".css"])),
    ...collectModuleFiles("lang", new Set([".json"])),
    "module.json",
    "README.md"
  ];
  const violations = [];

  for (const relativePath of sourceFiles) {
    const source = readFileSync(join(MODULE_ROOT, relativePath), "utf8");
    if (/poszukiwania|ghateret|gathering/i.test(source)) violations.push(relativePath);
  }

  assert.deepEqual(violations, []);
});

test("CSS and localization identifiers use only Wildharvest prefixes", () => {
  const english = readModuleJson("lang/en.json");
  const polish = readModuleJson("lang/pl.json");
  const css = collectModuleFiles("styles", new Set([".css"]))
    .map((relativePath) => readFileSync(join(MODULE_ROOT, relativePath), "utf8"))
    .join("\n");

  assert.ok(Object.keys(english).every((key) => key.startsWith("WILDHARVEST.")));
  assert.ok(Object.keys(polish).every((key) => key.startsWith("WILDHARVEST.")));
  assert.equal(css.includes(".wildharvest-"), true);
  assert.equal(css.includes(".poszukiwania-"), false);
  assert.equal(css.includes("--posz-"), false);
});

test("GM Workbench theme is loaded after the base stylesheet and remains GM-scoped", () => {
  const manifest = readModuleJson("module.json");
  const theme = readFileSync(join(MODULE_ROOT, "styles/gm-workbench.css"), "utf8");
  const responsive = readFileSync(join(MODULE_ROOT, "styles/gm-responsive.css"), "utf8");

  assert.deepEqual(manifest.styles, [
    "styles/module.css",
    "styles/gm-dialogs.css",
    "styles/gm-workbench.css",
    "styles/gm-presets.css",
    "styles/gm-history.css",
    "styles/player-dialogs.css",
    "styles/gm-responsive.css"
  ]);
  assert.match(theme, /\.wildharvest-window--gm\s*\{/);
  assert.match(theme, /--wildharvest-gm-bg-deep:/);
  assert.match(theme, /--wildharvest-gm-accent-bright:/);
  assert.match(responsive, /@media \(max-width: 720px\)/);
  assert.match(responsive, /@media \(prefers-reduced-motion: reduce\)/);
  assert.equal(theme.includes(".wildharvest-window--player"), false);
});

test("redundant dialog close buttons use Foundry's native window control", () => {
  const baseStyles = readFileSync(join(MODULE_ROOT, "styles/gm-dialogs.css"), "utf8");
  const theme = readFileSync(join(MODULE_ROOT, "styles/gm-workbench.css"), "utf8");
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");

  assert.match(baseStyles, /\.dialog:has\(\.wildharvest-dialog\)/);
  assert.match(baseStyles, /\.form-footer/);
  assert.match(baseStyles, /button\[data-action="close"\]/);
  assert.match(baseStyles, /button\[data-action="close"\]:only-child/);
  assert.equal(panelSource.includes("gm-close-panel"), false);
  assert.equal(panelSource.includes("gm-close-scene"), true);
  assert.doesNotMatch(panelSource, /action: "cancel",\s*label: t\("WILDHARVEST\.Dialog\.Close"\)/);
  assert.match(theme, /1\.2\.0 density pass/);
  assert.match(theme, /\.wildharvest-gm-main-grid\s*\{[\s\S]*?minmax\(390px, 0\.9fr\)/);
});

test("GM footer exposes one localized and accessible Ko-fi support link", () => {
  const english = readModuleJson("lang/en.json");
  const polish = readModuleJson("lang/pl.json");
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");
  const theme = readFileSync(join(MODULE_ROOT, "styles/gm-workbench.css"), "utf8");
  const responsive = readFileSync(join(MODULE_ROOT, "styles/gm-responsive.css"), "utf8");
  const supportUrl = "https://ko-fi.com/tomorrokoshii";
  const runtimeLinkSources = collectModuleFiles("scripts", new Set([".js"]))
    .filter((relativePath) => readFileSync(join(MODULE_ROOT, relativePath), "utf8").includes(supportUrl))
    .map((relativePath) => relativePath.replaceAll("\\", "/"));

  assert.deepEqual(runtimeLinkSources, ["scripts/dialogs/gm-control-panel-dialog.js"]);
  assert.match(panelSource, /<footer class="wildharvest-gm-footer">[\s\S]*?wildharvest-gm-footer__support/);
  assert.match(panelSource, /href="https:\/\/ko-fi\.com\/tomorrokoshii"/);
  assert.match(panelSource, /target="_blank"/);
  assert.match(panelSource, /rel="noopener noreferrer"/);
  assert.match(panelSource, /WILDHARVEST\.Dialog\.ControlPanel\.SupportKoFi/);
  assert.equal(english["WILDHARVEST.Dialog.ControlPanel.SupportKoFi"], "Support Wildharvest on Ko-fi");
  assert.equal(polish["WILDHARVEST.Dialog.ControlPanel.SupportKoFi"], "Wesprzyj Wildharvest na Ko-fi");
  assert.match(theme, /\.wildharvest-gm-footer__support:focus-visible/);
  assert.match(responsive, /\.wildharvest-gm-footer__support\s*\{[\s\S]*?margin-left: 0/);
  assert.doesNotMatch(panelSource, /<script[^>]+ko-fi/i);
  assert.doesNotMatch(panelSource, /<img[^>]+https:\/\/ko-fi/i);
});

test("player search results use a compact second dialog and Actor-log synchronization without chat", () => {
  const searchSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/search-dialog.js"), "utf8");
  const offerSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/search-offer-dialogs.js"), "utf8");
  const playerStyles = readFileSync(join(MODULE_ROOT, "styles/player-dialogs.css"), "utf8");
  const runtimeSources = collectModuleFiles("scripts", new Set([".js"]))
    .map((relativePath) => readFileSync(join(MODULE_ROOT, relativePath), "utf8"))
    .join("\n");

  assert.doesNotMatch(runtimeSources, /\bChatMessage\b|postSearchToChat|WILDHARVEST\.Chat\./);
  assert.match(searchSource, /export function openSearchResultDialog/);
  assert.match(searchSource, /export function openSearchResultFromLog/);
  assert.match(searchSource, /result\.rewards\.slice\(0, 8\)/);
  assert.match(searchSource, /<details class="wildharvest-result-details">/);
  assert.match(searchSource, /WILDHARVEST\.Dialog\.Result\.ViewAll/);
  assert.doesNotMatch(searchSource, /result\.rewards\.length > previewRewards\.length/);
  assert.match(searchSource, /sessionId: String\(resolutionId\)/);
  assert.match(searchSource, /storageState:\s*\{/);
  assert.match(offerSource, /const pendingPlayerResults = new Map\(\)/);
  assert.match(offerSource, /async function waitForPlayerResult/);
  assert.match(offerSource, /openSearchResultFromLog\(\{/);
  assert.match(playerStyles, /1\.8\.0 compact player flow/);
  assert.match(playerStyles, /\.wildharvest-result-preview-grid\s*\{/);
  assert.match(playerStyles, /--wildharvest-player-accent:\s*#d3a447/);
});

test("obsolete preset favorites are absent from active module assets and code", () => {
  const activeFiles = [
    ...collectModuleFiles("scripts", new Set([".js"])),
    ...collectModuleFiles("styles", new Set([".css"])),
    ...collectModuleFiles("lang", new Set([".json"])),
    ...collectModuleFiles("assets", new Set([".svg"]))
  ];
  const violations = activeFiles.filter((relativePath) => /favorite/i.test(relativePath)
    || /favorite/i.test(readFileSync(join(MODULE_ROOT, relativePath), "utf8")));

  assert.deepEqual(violations, []);
});

test("every packaged UI asset has a live runtime or stylesheet reference", () => {
  const assetFiles = collectModuleFiles("assets", new Set([".png", ".webp", ".svg"]));
  const referenceText = [
    ...collectModuleFiles("scripts", new Set([".js"])),
    ...collectModuleFiles("styles", new Set([".css"])),
    ...collectModuleFiles("templates", new Set([".hbs"])),
    "module.json"
  ]
    .map((relativePath) => readFileSync(join(MODULE_ROOT, relativePath), "utf8"))
    .join("\n");
  const unreferenced = assetFiles.filter((relativePath) => !referenceText.includes(basename(relativePath)));

  assert.deepEqual(unreferenced, []);
});

test("Presets use the compact 1.3.0 workbench table with all existing actions", () => {
  const theme = readFileSync(join(MODULE_ROOT, "styles/gm-presets.css"), "utf8");
  const responsive = readFileSync(join(MODULE_ROOT, "styles/gm-responsive.css"), "utf8");
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");
  const presetsSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-presets-view.js"), "utf8");

  assert.match(panelSource, /import \{ renderPresetsTab \} from "\.\/gm-control-panel-presets-view\.js"/);
  assert.match(presetsSource, /function renderPresetRow\(preset,/);
  assert.equal(presetsSource.includes("function renderPresetCard"), false);
  assert.match(presetsSource, /class="wildharvest-gm-preset-table" role="table"/);
  for (const action of ["gm-send-preset", "gm-edit-preset", "gm-duplicate-preset", "gm-delete-preset"]) {
    assert.match(presetsSource, new RegExp(`data-action="${action}"`));
  }
  assert.match(theme, /1\.3\.0 Presets workbench/);
  assert.match(theme, /--wildharvest-gm-preset-columns:/);
  assert.match(responsive, /\.wildharvest-gm-preset-table__header\s*\{\s*display: none;/);
});

test("GM control panel tab views are isolated behind explicit render boundaries", () => {
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");
  const launchSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-launch-view.js"), "utf8");
  const responsesSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-responses-view.js"), "utf8");
  const presetsSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-presets-view.js"), "utf8");
  const sharedSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-view-shared.js"), "utf8");

  assert.match(panelSource, /import \{ renderLaunchTab \} from "\.\/gm-control-panel-launch-view\.js"/);
  assert.match(panelSource, /import \{ renderResponsesTab \} from "\.\/gm-control-panel-responses-view\.js"/);
  assert.match(panelSource, /import \{ renderPresetsTab \} from "\.\/gm-control-panel-presets-view\.js"/);
  assert.match(launchSource, /export function renderLaunchTab\(state,/);
  assert.match(responsesSource, /export function renderResponsesTab\(state,/);
  assert.match(presetsSource, /export function renderPresetsTab\(state,/);
  assert.match(sharedSource, /export const GM_UI_ASSETS/);
  assert.doesNotMatch(panelSource, /function render(?:Launch|Responses|Presets)Tab\(/);
});

test("DialogV2 workflow boundaries isolate config transfer and the player offer view", () => {
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");
  const configSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-config-dialog.js"), "utf8");
  const transferSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/config-transfer-dialogs.js"), "utf8");
  const authoritySource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/search-offer-dialogs.js"), "utf8");
  const offerViewSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/player-search-offer-dialog.js"), "utf8");

  assert.match(panelSource, /from "\.\/config-transfer-dialogs\.js"/);
  assert.match(configSource, /from "\.\/config-transfer-dialogs\.js"/);
  assert.match(transferSource, /export function openConfigExportDialog/);
  assert.match(transferSource, /export function openConfigImportDialog/);
  assert.doesNotMatch(panelSource, /function openImportConfigConfirmDialog/);
  assert.doesNotMatch(configSource, /function openImportConfigConfirmDialog/);
  assert.match(authoritySource, /from "\.\/player-search-offer-dialog\.js"/);
  assert.match(authoritySource, /openPlayerSearchOfferDialog\(\{/);
  assert.doesNotMatch(authoritySource, /wildharvest-player-offer-summary/);
  assert.match(offerViewSource, /export function openPlayerSearchOfferDialog/);
  assert.match(offerViewSource, /new DialogV2\(/);
});

test("History uses the responsive 1.4.0 three-pane workbench", () => {
  const theme = readFileSync(join(MODULE_ROOT, "styles/gm-history.css"), "utf8");
  const responsive = readFileSync(join(MODULE_ROOT, "styles/gm-responsive.css"), "utf8");
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");
  const historySource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-history-view.js"), "utf8");
  const stateSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-state.js"), "utf8");

  assert.match(panelSource, /import \{ renderHistoryTab \} from "\.\/gm-control-panel-history-view\.js"/);
  assert.match(historySource, /function renderHistoryActorList\(actors, selectedActorId\)/);
  assert.match(historySource, /export function getHistoryPlayerActors\(actors, linkedPlayerActorIds/);
  assert.match(historySource, /function renderHistoryEntryRows\(historyEntries, selectedEntryKey, hasFilter\)/);
  assert.match(historySource, /function renderHistoryEntryDetails\(entry\)/);
  assert.match(historySource, /class="wildharvest-gm-history-workbench"/);
  assert.match(historySource, /data-action="gm-select-history-actor"/);
  assert.match(historySource, /data-action="gm-select-history-entry"/);
  assert.match(stateSource, /state\.historyEntryKey = String\(state\.historyEntryKey \?\? ""\)/);
  assert.match(theme, /1\.4\.0 History workbench/);
  assert.match(theme, /grid-template-columns: 210px minmax\(520px, 1fr\) 290px/);
  assert.match(responsive, /\.wildharvest-gm-history-pane--details\s*\{[\s\S]*?grid-column: 1 \/ -1/);
});

test("History view helpers keep stable keys and filter activity, skill, and rewards", () => {
  const previousFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      deepClone: (value) => structuredClone(value)
    }
  };
  const log = [
    {
      timestamp: "2026-07-12 12:00",
      activityName: "Herbalism",
      locationName: "Whispering Woods",
      skillName: "Survival",
      rollTotal: 18,
      rewards: [{ name: "Bitterroot", quantity: 2 }]
    },
    {
      timestamp: "2026-07-12 13:00",
      activityName: "Mining",
      locationName: "Ironridge Cavern",
      skillName: "Athletics",
      rollTotal: 21,
      rewards: [{ name: "Iron Ore", quantity: 1 }]
    }
  ];
  const actor = {
    getFlag: () => log
  };

  try {
    assert.equal(getHistoryEntryKey(log[0], 0), "0|2026-07-12 12:00|Herbalism|Whispering Woods|18");
    assert.deepEqual(getFilteredHistoryEntries(actor, "survival").map(({ entry }) => entry.activityName), ["Herbalism"]);
    assert.deepEqual(getFilteredHistoryEntries(actor, "iron ore").map(({ entry }) => entry.activityName), ["Mining"]);
    assert.equal(getFilteredHistoryEntries(actor, "missing").length, 0);
  } finally {
    globalThis.foundry = previousFoundry;
  }
});

test("DialogV2 helpers have one shared implementation", () => {
  const utilitySource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/dialog-utils.js"), "utf8");
  const dialogSources = collectModuleFiles("scripts/dialogs", new Set([".js"]))
    .filter((relativePath) => !relativePath.endsWith("dialog-utils.js"))
    .map((relativePath) => readFileSync(join(MODULE_ROOT, relativePath), "utf8"));

  assert.match(utilitySource, /export function escapeHtml\(value\)/);
  assert.match(utilitySource, /export function getDialogForm\(dialog, button\)/);
  assert.match(utilitySource, /export function addWindowClasses\(dialog, \.\.\.classNames\)/);
  assert.match(utilitySource, /export function bringDialogToFront\(dialog\)/);
  assert.match(utilitySource, /\[role='tab'\]\[aria-selected='true'\]/);
  assert.ok(dialogSources.every((source) => !/^function getDialogForm\(/m.test(source)));
  assert.ok(dialogSources.every((source) => !/^function addWindowClasses\(/m.test(source)));

  let calls = 0;
  assert.equal(bringDialogToFront(null), false);
  assert.equal(bringDialogToFront({ element: null, bringToFront: () => { calls += 1; } }), false);
  assert.equal(bringDialogToFront({
    element: { isConnected: false },
    bringToFront: () => { calls += 1; }
  }), false);
  assert.equal(bringDialogToFront({
    element: { isConnected: true },
    bringToFront: () => { calls += 1; }
  }), true);
  assert.equal(calls, 1);
});

test("dialog accessibility helpers link labels and focus the requested control", () => {
  let focusCalls = 0;
  const label = {
    htmlFor: "",
    matches: (selector) => selector === "label:not([for])",
    querySelector: () => null
  };
  const control = {
    id: "",
    disabled: false,
    hidden: false,
    matches: (selector) => selector.includes("input:not([type='hidden'])"),
    focus: () => { focusCalls += 1; }
  };
  const root = {
    querySelectorAll: (selector) => selector === ".form-group"
      ? [{ children: [label, control] }]
      : []
  };
  const dialog = {
    element: {
      querySelector: (selector) => selector === "[name='actorId']" ? control : null
    }
  };

  assert.equal(linkFormLabels(root, "test-control"), 1);
  assert.match(control.id, /^wildharvest-test-control-\d+$/);
  assert.equal(label.htmlFor, control.id);
  assert.equal(focusDialogControl(dialog, ["[name='missing']", "[name='actorId']"]), true);
  assert.equal(focusCalls, 1);
});

test("GM tabs support cyclic arrows plus Home and End keyboard navigation", () => {
  const tabs = ["launch", "responses", "presets", "history"];
  assert.equal(getKeyboardTabTarget(tabs, "launch", "ArrowRight"), "responses");
  assert.equal(getKeyboardTabTarget(tabs, "launch", "ArrowLeft"), "history");
  assert.equal(getKeyboardTabTarget(tabs, "presets", "Home"), "launch");
  assert.equal(getKeyboardTabTarget(tabs, "responses", "End"), "history");
  assert.equal(getKeyboardTabTarget(tabs, "responses", "Enter"), null);
});

test("active dialogs expose tab semantics, labelled controls, visible focus, and reduced motion", () => {
  const panelSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/gm-control-panel-dialog.js"), "utf8");
  const offerSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/search-offer-dialogs.js"), "utf8");
  const dialogUtils = readFileSync(join(MODULE_ROOT, "scripts/dialogs/dialog-utils.js"), "utf8");
  const rulesTemplate = readFileSync(join(MODULE_ROOT, "templates/rules-settings-form.hbs"), "utf8");
  const playerStyles = readFileSync(join(MODULE_ROOT, "styles/player-dialogs.css"), "utf8");
  const responsiveStyles = readFileSync(join(MODULE_ROOT, "styles/gm-responsive.css"), "utf8");

  assert.match(panelSource, /role="tablist"/);
  assert.match(panelSource, /role="tab"/);
  assert.match(panelSource, /aria-selected=/);
  assert.match(panelSource, /aria-controls=/);
  assert.match(panelSource, /role="tabpanel"/);
  assert.match(panelSource, /getKeyboardTabTarget/);
  assert.match(dialogUtils, /export function linkFormLabels/);
  assert.match(offerSource, /aria-label=.*WILDHARVEST\.Dialog\.Search\.Activity/);
  assert.match(rulesTemplate, /for="wildharvest-loot-mode"/);
  assert.match(rulesTemplate, /aria-label=/);
  assert.match(playerStyles, /wildharvest-window--player summary:focus-visible/);
  assert.match(responsiveStyles, /wildharvest-window--player \*/);
  assert.match(responsiveStyles, /animation-duration: 0\.01ms !important/);
});

test("configuration exports use only the new Wildharvest format", () => {
  const settingsSource = readFileSync(join(MODULE_ROOT, "scripts/settings.js"), "utf8");
  assert.equal(isWildharvestConfigExport({ format: "wildharvest-config" }), true);
  assert.equal(isWildharvestConfigExport({ format: "legacy-config" }), false);
  assert.equal(isWildharvestConfigExport({}), false);
  assert.equal(settingsSource.includes('CONFIG_EXPORT_FORMAT = "wildharvest-config"'), true);
  assert.equal(settingsSource.includes("gathering-config"), false);
});

test("active search schema contains no inert DC or outcomes fields", () => {
  const activeFiles = [
    ...collectModuleFiles("scripts", new Set([".js"])),
    ...collectModuleFiles("lang", new Set([".json"]))
  ];
  const violations = activeFiles.filter((relativePath) => {
    const source = readFileSync(join(MODULE_ROOT, relativePath), "utf8");
    return /\bdc\b|outcomes?|minMargin|baseDc/i.test(source);
  });
  const sanitized = sanitizeQuickOptionsForStorage([{
    id: "legacy",
    name: "Legacy search",
    skillId: "sur",
    packIds: ["dnd5e.items"],
    dc: 15,
    outcomes: [{ minMargin: 0, message: "legacy" }]
  }]);

  assert.deepEqual(violations, []);
  assert.deepEqual(sanitized, [{
    id: "legacy",
    lootPoolId: "legacy",
    name: "Legacy search",
    skillId: "sur",
    packIds: ["dnd5e.items"],
    description: ""
  }]);
});

test("normalizeRollMode prefers advantage flag", () => {
  assert.equal(normalizeRollMode({ rollMode: "disadvantage", advantage: true }), "advantage");
});

test("search engine orchestrator imports both loot engines", () => {
  assert.equal(typeof executeSearch, "function");
  assert.equal(typeof previewLootRewards, "function");
});

test("rules settings use one bound top-level ApplicationV2 form", () => {
  const source = readFileSync(join(MODULE_ROOT, "scripts/dialogs/rules-settings-menu.js"), "utf8");
  const template = readFileSync(join(MODULE_ROOT, "templates/rules-settings-form.hbs"), "utf8");

  assert.match(source, /tag:\s*["']form["']/);
  assert.match(source, /handler:\s*RulesSettingsForm\.onSubmitForm/);
  assert.match(source, /const form = this\.form/);
  assert.equal(/^\s*<form\b/i.test(template), false);
  assert.match(template, /^\s*<div\b/i);
});

test("getRollFormula handles disadvantage and negative modifiers", () => {
  assert.equal(getRollFormula(-3, { rollMode: "disadvantage" }), "2d20kl - 3");
});

test("getLootPointsForRollTotal uses highest matching bracket", () => {
  assert.equal(getLootPointsForRollTotal(19, sharedBrackets), 3);
  assert.equal(getLootPointsForRollTotal(21, sharedBrackets), 6);
});

test("normalizeRarityId maps artifact to legendary", () => {
  assert.equal(normalizeRarityId("Artifact"), "legendary");
});

test("normalizeCompendiumIndex supports arrays and collection-like values", () => {
  const collectionLike = new Map([["a", { _id: "a" }], ["b", { _id: "b" }]]);
  assert.deepEqual(normalizeCompendiumIndex(collectionLike), [{ _id: "a" }, { _id: "b" }]);
  assert.deepEqual(normalizeCompendiumIndex([{ id: "x" }]), [{ id: "x" }]);
});

test("compendium index _id values keep different rolled items in separate reward groups", () => {
  const documents = normalizeCompendiumIndex(new Map([
    ["book", { _id: "book", name: "Book" }],
    ["pot", { _id: "pot", name: "Iron Pot" }]
  ]));
  const rewardKeys = documents.map((document) => `dnd5e.items:${getCompendiumDocumentId(document)}`);

  assert.deepEqual(rewardKeys, ["dnd5e.items:book", "dnd5e.items:pot"]);
  assert.equal(new Set(rewardKeys).size, 2);
});

test("normalizeCompendiumIndex restores an id from the collection key when an entry omits it", () => {
  const [document] = normalizeCompendiumIndex(new Map([["fallback-id", { name: "Fallback" }]]));
  assert.equal(getCompendiumDocumentId(document), "fallback-id");
});

test("compendium reward identity includes both pack and document ids", () => {
  const first = { packId: "world.first", document: { _id: "same-id", name: "First" } };
  const second = { packId: "world.second", document: { _id: "same-id", name: "Second" } };
  const groupedRewards = new Map();

  assert.equal(getCompendiumEntryKey(first), "world.first:same-id");
  assert.equal(getCompendiumEntryKey(second), "world.second:same-id");
  assert.equal(getCompendiumRewardId("common", first), "common:world~2e~first:same-id");
  addCompendiumReward(groupedRewards, first, "common");
  addCompendiumReward(groupedRewards, second, "common");

  const rewards = [...groupedRewards.values()];
  assert.equal(rewards.length, 2);
  assert.notEqual(rewards[0].id, rewards[1].id);
  assert.deepEqual(rewards.map((reward) => reward.id), [
    "common:world~2e~first:same-id",
    "common:world~2e~second:same-id"
  ]);
});

test("buildRarityPools and getAffordableRarities group entries correctly", () => {
  const pooledDocuments = [
    { document: { system: { rarity: "common" } } },
    { document: { system: { rarity: "rare" } } }
  ];
  const pools = buildRarityPools(pooledDocuments, rarityDefinitions);
  assert.equal(pools.common.length, 1);
  assert.equal(pools.rare.length, 1);
  assert.deepEqual(getAffordableRarities(3, pools, rarityDefinitions).map((entry) => entry.id), ["common"]);
});

test("chooseWeightedRarity supports deterministic RNG injection", () => {
  const picked = chooseWeightedRarity(rarityDefinitions, () => 0.95);
  assert.equal(picked.id, "rare");
});

test("D&D5e prices in PP, GP, EP, SP, and CP normalize to copper", () => {
  assert.equal(currencyToCopper(1, "pp"), 1000);
  assert.equal(currencyToCopper(1, "gp"), 100);
  assert.equal(currencyToCopper(1, "ep"), 50);
  assert.equal(currencyToCopper(1, "sp"), 10);
  assert.equal(currencyToCopper(1, "cp"), 1);
  assert.equal(getDocumentPriceCopper({ system: { price: { value: 0.5, denomination: "gp" } } }), 50);
  assert.equal(getDocumentPriceCopper({ system: { price: { value: 1, denomination: "ep" } } }), 50);
  assert.equal(getDocumentPriceCopper({ system: { price: { value: 50, denomination: "cp" } } }), 50);
});

test("value loot combines different items to the configured total", () => {
  const entry = (id, value, denomination = "gp") => ({
    packId: "world.loot",
    document: { _id: id, name: id, system: { price: { value, denomination } } }
  });
  const selection = selectValueBudgetItems({
    pooledDocuments: [
      entry("one-a", 1),
      entry("two", 2),
      entry("one-b", 10, "sp"),
      entry("one-c", 100, "cp"),
      entry("too-expensive", 6),
      { packId: "world.loot", document: { _id: "missing", name: "missing" } }
    ],
    targetGp: 5,
    tolerancePercent: 10,
    random: () => 0.5,
    attempts: 3
  });

  assert.equal(selection.totalCopper, 500);
  assert.equal(selection.entries.length, 4);
  assert.equal(selection.exactTarget, true);
  assert.equal(selection.withinTolerance, true);
  assert.equal(selection.invalidPriceCount, 1);
  assert.equal(selection.unaffordableCount, 1);
});

test("value loot never exceeds the configured upper tolerance", () => {
  const selection = selectValueBudgetItems({
    pooledDocuments: [
      { packId: "world.loot", document: { _id: "a", system: { price: { value: 3, denomination: "gp" } } } },
      { packId: "world.loot", document: { _id: "b", system: { price: { value: 3, denomination: "gp" } } } }
    ],
    targetGp: 5,
    tolerancePercent: 10,
    random: () => 0,
    attempts: 2
  });

  assert.equal(selection.upperCopper, 550);
  assert.equal(selection.totalCopper, 300);
  assert.equal(selection.withinTolerance, false);
});

test("value loot finds an exact combination without relying on repeated greedy attempts", () => {
  const entry = (id, value) => ({
    packId: "world.loot",
    document: { _id: id, name: id, system: { price: { value, denomination: "gp" } } }
  });
  const selection = selectValueBudgetItems({
    pooledDocuments: [entry("four", 4), entry("three", 3), entry("two", 2)],
    targetGp: 5,
    tolerancePercent: 0,
    random: () => 0,
    maxStates: 100
  });

  assert.equal(selection.totalCopper, 500);
  assert.equal(selection.exactTarget, true);
  assert.deepEqual(selection.entries.map(({ document }) => document._id).sort(), ["three", "two"]);
});

test("value loot removes duplicate pack-qualified index entries before selection", () => {
  const duplicated = {
    packId: "world.loot",
    document: { _id: "same", name: "Same", system: { price: { value: 1, denomination: "gp" } } }
  };
  const selection = selectValueBudgetItems({
    pooledDocuments: [duplicated, structuredClone(duplicated)],
    targetGp: 2,
    tolerancePercent: 0,
    random: () => 0
  });

  assert.equal(selection.entries.length, 1);
  assert.equal(selection.totalCopper, 100);
  assert.equal(selection.duplicateEntryCount, 1);
});

test("value budget uses the highest configured LP row not exceeding the result", () => {
  const budget = getValueBudgetForLootPoints(5, [
    { lootPoints: 0, targetGp: 0 },
    { lootPoints: 3, targetGp: 15 },
    { lootPoints: 5, targetGp: 30 }
  ]);
  assert.deepEqual(budget, { lootPoints: 5, targetGp: 30 });
});

test("rarity spending evaluates quantity independently for every LP purchase", async () => {
  let calls = 0;
  const result = await spendLootPoints({
    lootPoints: 2,
    definitions: [{ id: "common", cost: 1, weight: 1, quantityFormula: "test" }],
    pools: {
      common: [{ packId: "world.loot", document: { _id: "item", name: "Item" } }]
    },
    evaluateQuantity: async () => {
      calls += 1;
      return calls;
    },
    random: () => 0,
    buildGroup: (definition, quantity) => ({ id: definition.id, quantity })
  });

  assert.equal(calls, 2);
  assert.deepEqual(result.selectionGroups.map((group) => group.quantity), [1, 2]);
  assert.equal(result.rewards[0].quantity, 3);
});

test("rarity draws different items before repeating an entry", async () => {
  const result = await spendLootPoints({
    lootPoints: 1,
    definitions: [{ id: "common", cost: 1, weight: 1, quantityFormula: "3" }],
    pools: {
      common: ["a", "b", "c"].map((id) => ({
        packId: "world.loot",
        document: { _id: id, name: id }
      }))
    },
    evaluateQuantity: async () => 3,
    random: () => 0,
    buildGroup: (definition, quantity) => ({ id: definition.id, quantity })
  });

  assert.equal(result.rewards.length, 3);
  assert.deepEqual(result.rewards.map((reward) => reward.name).sort(), ["a", "b", "c"]);
});

test("legacy rarity-only rules receive the new default engine fields", () => {
  const normalized = normalizeRulesConfig({
    lootPointBrackets: sharedBrackets,
    rarityRules: [
      { id: "common", cost: 1, weight: 60, quantityFormula: "1" },
      { id: "uncommon", cost: 2, weight: 25, quantityFormula: "1" },
      { id: "rare", cost: 4, weight: 10, quantityFormula: "1" },
      { id: "veryRare", cost: 6, weight: 4, quantityFormula: "1" },
      { id: "legendary", cost: 10, weight: 1, quantityFormula: "1" }
    ]
  });

  assert.equal(normalized.lootMode, "rarity");
  assert.equal(normalized.valueRules.tolerancePercent, 10);
  assert.equal(normalized.valueRules.brackets[5].targetGp, 5);
});

test("configuration rejects duplicate location, activity, and rarity rule ids", () => {
  const location = (id, activityId) => ({
    id,
    name: id,
    activities: [{ id: activityId, name: activityId }]
  });
  const rarityRules = [
    { id: "common", cost: 1, weight: 60, quantityFormula: "1" },
    { id: "uncommon", cost: 2, weight: 25, quantityFormula: "1" },
    { id: "rare", cost: 4, weight: 10, quantityFormula: "1" },
    { id: "veryRare", cost: 6, weight: 4, quantityFormula: "1" },
    { id: "legendary", cost: 10, weight: 1, quantityFormula: "1" }
  ];

  assert.throws(() => normalizeLocations([
    location("forest", "forage"),
    location("forest", "mine")
  ]), /Location id "forest"/);
  assert.throws(() => normalizeLocations([
    location("forest", "search"),
    location("cave", "search")
  ]), /Activity id "search"/);
  assert.throws(() => normalizeRulesConfig({
    lootPointBrackets: sharedBrackets,
    rarityRules: [...rarityRules, rarityRules[0]]
  }), /Rarity rule id "common"/);
});

test("loot-pool import filtering keeps only available Item compendiums", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    packs: new Map([
      ["world.items", { documentName: "Item" }],
      ["world.journals", { documentName: "JournalEntry" }]
    ])
  };

  try {
    const pools = parseLootPoolsFromText(JSON.stringify([{
      id: "mixed",
      name: "Mixed",
      packIds: ["world.items", "world.missing", "world.journals"]
    }]), {
      validatePackIds: false,
      filterUnavailablePackIds: true
    });
    assert.deepEqual(pools[0].packIds, ["world.items"]);
  } finally {
    globalThis.game = previousGame;
  }
});

test("settings transaction restores every attempted value after a partial write failure", async () => {
  const state = new Map([
    ["locations", "old-locations"],
    ["lootPools", "old-pools"],
    ["rules", "old-rules"]
  ]);
  let shouldFail = true;

  await assert.rejects(() => applySettingsTransaction([
    { key: "locations", value: "new-locations" },
    { key: "lootPools", value: "new-pools" },
    { key: "rules", value: "new-rules" }
  ], {
    getValue: (key) => state.get(key),
    setValue: (key, value) => {
      state.set(key, value);
      if (key === "lootPools" && value === "new-pools" && shouldFail) {
        shouldFail = false;
        throw new Error("simulated write failure");
      }
    }
  }), /simulated write failure/);

  assert.deepEqual(Object.fromEntries(state), {
    locations: "old-locations",
    lootPools: "old-pools",
    rules: "old-rules"
  });
});

test("collectPersistedSearchSessions keeps only the newest entries", () => {
  const sessions = new Map();
  for (let index = 1; index <= MAX_PERSISTED_SESSIONS + 2; index += 1) {
    sessions.set(`s-${index}`, { id: `s-${index}` });
  }
  const persisted = collectPersistedSearchSessions(sessions);
  assert.equal(persisted.length, MAX_PERSISTED_SESSIONS);
  assert.equal(persisted[0].id, "s-3");
});

test("restorePersistedSearchSessions filters invalid entries and marks closed ones", () => {
  const rawValue = JSON.stringify([
    { id: "keep-open", offers: { a: { userId: "a" } } },
    { id: "keep-closed", offers: { b: { userId: "b" } }, closedAt: "now" },
    { id: "", offers: {} },
    { id: "skip", offers: null }
  ]);
  const restored = restorePersistedSearchSessions(rawValue, {
    deepClone: (value) => structuredClone(value),
    isSessionClosed: (session) => Boolean(session.closedAt)
  });

  assert.equal(restored.parseError, null);
  assert.deepEqual(restored.restoredSessions.map((session) => session.id), ["keep-open", "keep-closed"]);
  assert.deepEqual(restored.closedSessionIds, ["keep-closed"]);
});

test("search socket accepts only active-GM broadcasts and rejects player authority messages", () => {
  const users = new Map([
    ["gm-1", { id: "gm-1", isGM: true }],
    ["gm-2", { id: "gm-2", isGM: true }],
    ["player-1", { id: "player-1", isGM: false }],
    ["player-2", { id: "player-2", isGM: false }]
  ]);
  const messageTypes = {
    OFFER_SEARCH: "offerSearch",
    GM_RESOLUTION: "gmResolution",
    SESSION_CLOSED: "sessionClosed",
    SESSION_SYNC: "sessionSync"
  };
  const getUser = (userId) => users.get(userId) ?? null;
  const getActiveGm = () => users.get("gm-1");

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "offerSearch",
    senderId: "gm-1",
    gmUserId: "gm-1",
    targetUserId: "player-1",
    sessionId: "session-1",
    offer: {
      locationId: "forest",
      activityId: "forage",
      lootPoolId: "plants",
      skillId: "sur"
    }
  }, { getUser, getActiveGm, messageTypes }), true);

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "playerDecision",
    senderId: "player-1",
    gmUserId: "gm-1",
    sessionId: "session-1",
    decision: "accepted"
  }, { getUser, getActiveGm, messageTypes }), false);

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "playerResolutionRequest",
    senderId: "player-1",
    gmUserId: "gm-1",
    sessionId: "session-1",
    actorId: "actor-1",
    extraModifier: 2,
    rollMode: "advantage"
  }, { getUser, getActiveGm, messageTypes }), false);

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "gmResolution",
    senderId: "gm-1",
    gmUserId: "gm-1",
    targetUserId: "player-1",
    sessionId: "session-1",
    success: true
  }, { getUser, getActiveGm, messageTypes }), true);

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "playerResult",
    senderId: "player-1",
    gmUserId: "gm-1",
    sessionId: "session-1",
    rewards: [{ id: "forged-reward", quantity: 999 }]
  }, { getUser, getActiveGm, messageTypes }), false);

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "playerDecision",
    senderId: "gm-1",
    gmUserId: "gm-1",
    sessionId: "session-1",
    decision: "accepted"
  }, { getUser, getActiveGm, messageTypes }), false);

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "playerDecision",
    senderId: "player-1",
    gmUserId: "gm-1",
    sessionId: "session-1",
    decision: "accepted",
    actorName: "private-leak"
  }, { getUser, getActiveGm, messageTypes }), false);
});

test("player authority uses the authenticated updateUser hook instead of claimed socket senderId", () => {
  const mainSource = readFileSync(join(MODULE_ROOT, "scripts/main.js"), "utf8");
  const offerSource = readFileSync(join(MODULE_ROOT, "scripts/dialogs/search-offer-dialogs.js"), "utf8");
  const socketSource = readFileSync(join(MODULE_ROOT, "scripts/helpers/search-session-socket.js"), "utf8");

  assert.match(mainSource, /Hooks\.on\("updateUser", \(user, changes, options, userId\)/);
  assert.match(mainSource, /handlePlayerRequestDocumentUpdate\(user, changes, options, userId\)/);
  assert.match(offerSource, /String\(userId \?\? ""\) !== String\(user\.id \?\? ""\)/);
  assert.match(offerSource, /game\.user\.setFlag\(MODULE_ID, PLAYER_REQUEST_FLAG, request\)/);
  assert.doesNotMatch(socketSource, /PLAYER_DECISION|PLAYER_RESOLUTION_REQUEST|emitSearchDecision|emitSearchResolutionRequest/);
});

test("player document requests are bounded, typed, and expire", () => {
  const now = 1_800_000_000_000;
  const accepted = buildPlayerDocumentRequest({
    id: "request-1",
    type: PLAYER_REQUEST_TYPES.DECISION,
    sessionId: "session-1",
    gmUserId: "gm-1",
    decision: "accepted",
    createdAt: now
  });
  const resolution = buildPlayerDocumentRequest({
    id: "request-2",
    type: PLAYER_REQUEST_TYPES.RESOLUTION,
    sessionId: "session-1",
    gmUserId: "gm-1",
    actorId: "actor-1",
    extraModifier: 2,
    rollMode: "advantage",
    createdAt: now
  });

  assert.equal(isValidPlayerDocumentRequest(accepted, { now }), true);
  assert.equal(isValidPlayerDocumentRequest(resolution, { now }), true);
  assert.equal(isValidPlayerDocumentRequest({ ...accepted, decision: "forged" }, { now }), false);
  assert.equal(isValidPlayerDocumentRequest({ ...resolution, rewards: [] }, { now }), false);
  assert.equal(isValidPlayerDocumentRequest(accepted, { now: now + (6 * 60 * 1000) }), false);
});

test("two-player authenticated session isolates owned Actors and grants each result once", () => {
  const harness = createTwoClientSearchHarness();
  const session = harness.createSession();
  const playerOneResult = { rollTotal: 18, lootPoints: 5, rewards: [{ id: "herb", quantity: 2 }] };
  const playerTwoResult = { rollTotal: 14, lootPoints: 3, rewards: [{ id: "ore", quantity: 1 }] };

  assert.equal(harness.processDecision("player-one", harness.buildDecision("player-one", "accepted", {
    id: "decision-one"
  })).ok, true);
  assert.equal(harness.processDecision("player-two", harness.buildDecision("player-two", "accepted", {
    id: "decision-two"
  })).ok, true);

  const playerOneRequest = harness.buildResolution("player-one", "actor-one", { id: "resolution-one" });
  const playerOneResolution = harness.processResolution("player-one", playerOneRequest, {
    result: playerOneResult
  });
  assert.equal(playerOneResolution.ok, true);
  assert.equal(playerOneResolution.completed, true);

  const wrongActor = harness.processResolution(
    "player-two",
    harness.buildResolution("player-two", "actor-one", { id: "resolution-wrong-actor" }),
    { result: playerTwoResult }
  );
  assert.equal(wrongActor.ok, false);
  assert.equal(wrongActor.reason, SEARCH_RESOLUTION_REASONS.ACTOR_NOT_OWNED);
  assert.equal(session.offers["player-two"].status, "accepted");

  const playerTwoResolution = harness.processResolution(
    "player-two",
    harness.buildResolution("player-two", "actor-two", { id: "resolution-two" }),
    { result: playerTwoResult }
  );
  assert.equal(playerTwoResolution.ok, true);
  assert.equal(playerTwoResolution.completed, true);

  assert.equal(harness.processResolution("player-one", playerOneRequest, {
    result: playerOneResult
  }).reason, "duplicate-request");
  assert.equal(harness.processResolution(
    "player-one",
    harness.buildResolution("player-one", "actor-one", { id: "resolution-one-retry" }),
    { result: playerOneResult }
  ).reason, SEARCH_RESOLUTION_REASONS.OFFER_NOT_ACCEPTED);
  assert.equal(session.offers["player-one"].status, "completed");
  assert.equal(session.offers["player-two"].status, "completed");
  assert.equal(harness.getGrantCount("session-one", "player-one"), 1);
  assert.equal(harness.getGrantCount("session-one", "player-two"), 1);
});

test("active-GM handoff recovers an interrupted result without repeating its grant", () => {
  const harness = createTwoClientSearchHarness();
  const session = harness.createSession();
  const queuedPlayerTwoDecision = harness.buildDecision("player-two", "accepted", {
    id: "queued-before-handoff",
    gmUserId: "gm-primary"
  });
  const recoveredResult = { rollTotal: 21, lootPoints: 7, rewards: [{ id: "relic", quantity: 1 }] };

  harness.processDecision("player-one", harness.buildDecision("player-one", "accepted", {
    id: "handoff-decision-one"
  }));
  const claim = harness.processResolution(
    "player-one",
    harness.buildResolution("player-one", "actor-one", { id: "handoff-resolution-one" }),
    { deferCompletion: true }
  );
  assert.equal(claim.ok, true);
  assert.equal(session.offers["player-one"].status, "resolving");
  assert.equal(harness.recordPersistedActorResult("session-one", "player-one", recoveredResult), true);
  assert.equal(harness.getGrantCount("session-one", "player-one"), 1);

  harness.setActiveGm("gm-secondary");
  const recovery = harness.recoverInterrupted();
  assert.deepEqual(recovery, { changed: true, recovered: 1, failed: 0 });
  assert.equal(session.offers["player-one"].status, "completed");
  assert.equal(session.offers["player-one"].result, recoveredResult);
  assert.equal(harness.getGrantCount("session-one", "player-one"), 1);
  assert.deepEqual(harness.recoverInterrupted(), { changed: false, recovered: 0, failed: 0 });
  assert.equal(harness.getGrantCount("session-one", "player-one"), 1);

  assert.equal(harness.processDecision("player-two", queuedPlayerTwoDecision).ok, true);
  const playerTwoResolution = harness.processResolution(
    "player-two",
    harness.buildResolution("player-two", "actor-two", {
      id: "handoff-resolution-two",
      gmUserId: "gm-secondary"
    }),
    { result: { rollTotal: 12, lootPoints: 2, rewards: [] } }
  );
  assert.equal(playerTwoResolution.ok, true);
  assert.equal(harness.getGrantCount("session-one", "player-two"), 1);

  assert.equal(harness.authorizeSocket({
    type: "sessionSync",
    senderId: "gm-primary",
    gmUserId: "gm-primary",
    sessionId: "state"
  }), false);
  assert.equal(harness.authorizeSocket({
    type: "sessionSync",
    senderId: "gm-secondary",
    gmUserId: "gm-secondary",
    sessionId: "state"
  }), true);
});

test("two-client socket matrix keeps offer and resolution payloads target-isolated", () => {
  const harness = createTwoClientSearchHarness();
  const offer = {
    locationId: "forest",
    activityId: "forage",
    lootPoolId: "plants",
    skillId: "sur"
  };
  const offerOne = {
    type: "offerSearch",
    senderId: "gm-primary",
    gmUserId: "gm-primary",
    targetUserId: "player-one",
    sessionId: "session-one",
    offer
  };
  const offerTwo = { ...offerOne, targetUserId: "player-two" };
  const resolutionOne = {
    type: "gmResolution",
    senderId: "gm-primary",
    gmUserId: "gm-primary",
    targetUserId: "player-one",
    sessionId: "session-one",
    success: true,
    reason: ""
  };
  const resolutionTwo = { ...resolutionOne, targetUserId: "player-two" };

  assert.equal(harness.authorizeSocket(offerOne), true);
  assert.equal(harness.authorizeSocket(offerTwo), true);
  assert.equal(harness.authorizeSocket(resolutionOne), true);
  assert.equal(harness.authorizeSocket(resolutionTwo), true);
  assert.notEqual(offerOne.targetUserId, offerTwo.targetUserId);
  assert.notEqual(resolutionOne.targetUserId, resolutionTwo.targetUserId);
  assert.equal(harness.authorizeSocket({ ...offerOne, targetUserIds: ["player-one", "player-two"] }), false);
  assert.equal(harness.authorizeSocket({
    type: "offerSearch",
    senderId: "player-one",
    gmUserId: "gm-primary",
    targetUserId: "player-two",
    sessionId: "session-one",
    offer
  }), false);
});

test("interrupted resolutions recover from Actor history or fail without retry", () => {
  const sessions = new Map([
    ["session-recovered", {
      id: "session-recovered",
      offers: { "player-1": { userId: "player-1", status: "resolving" } }
    }],
    ["session-failed", {
      id: "session-failed",
      offers: { "player-2": { userId: "player-2", status: "resolving" } }
    }]
  ]);
  const recoveredResult = { rollTotal: 18, lootPoints: 5, rewards: [{ id: "herb", quantity: 1 }] };
  const recovery = settleInterruptedResolutions(sessions, {
    timestamp: "recovered-at",
    getRecoveredResult: (session) => session.id === "session-recovered" ? recoveredResult : null
  });

  assert.deepEqual(recovery, { changed: true, recovered: 1, failed: 1 });
  assert.equal(sessions.get("session-recovered").offers["player-1"].status, "completed");
  assert.equal(sessions.get("session-recovered").offers["player-1"].result, recoveredResult);
  assert.equal(sessions.get("session-failed").offers["player-2"].status, "failed");
  assert.equal(sessions.get("session-failed").offers["player-2"].failureReason, "resolution-interrupted");
});

test("socket offer payload contains one assignment and no private labels or player map", () => {
  const payload = buildMinimalSearchOffer({
    userId: "player-1",
    userName: "Secret Player",
    characterName: "Secret Character",
    locationId: "forest",
    locationName: "Secret Forest",
    activityId: "forage",
    activityName: "Secret Forage",
    lootPoolId: "plants",
    lootPoolLabel: "Secret Pool",
    skillId: "sur",
    skillLabel: "Survival",
    rewards: [{ id: "secret-reward" }]
  });

  assert.deepEqual(payload, {
    locationId: "forest",
    activityId: "forage",
    lootPoolId: "plants",
    skillId: "sur"
  });
  assert.equal(isMinimalSearchOffer(payload), true);
  assert.equal(isMinimalSearchOffer({ ...payload, userName: "leak" }), false);
  assert.equal("userName" in payload, false);
  assert.equal("rewards" in payload, false);
});

test("GM resolution socket notice excludes roll, actor, storage, and rewards", () => {
  const notice = buildNeutralResolutionNotice({
    sessionId: "session-1",
    gmUserId: "gm-1",
    targetUserId: "player-1",
    success: true,
    actor: { id: "actor-1" },
    result: { roll: { total: 20 }, rewards: [{ id: "secret" }] },
    storageSummary: { inventory: [{}] }
  });

  assert.deepEqual(notice, {
    sessionId: "session-1",
    gmUserId: "gm-1",
    targetUserId: "player-1",
    success: true,
    reason: ""
  });
});

test("only the active GM owns session mutations", () => {
  const gm1 = { id: "gm-1", isGM: true };
  const gm2 = { id: "gm-2", isGM: true };
  const player = { id: "player-1", isGM: false };

  assert.equal(isActiveGmUser(gm1, gm1), true);
  assert.equal(isActiveGmUser(gm2, gm1), false);
  assert.equal(isActiveGmUser(player, gm1), false);
  assert.equal(getActiveGmId(gm1, "gm-2"), "gm-1");
  assert.equal(getActiveGmId(null, ""), "");
});

test("socket authorization rejects state messages from a secondary GM", () => {
  const users = new Map([
    ["gm-1", { id: "gm-1", isGM: true }],
    ["gm-2", { id: "gm-2", isGM: true }],
    ["player-1", { id: "player-1", isGM: false }]
  ]);
  const options = {
    getUser: (userId) => users.get(userId) ?? null,
    getActiveGm: () => users.get("gm-1"),
    messageTypes: {
      SESSION_SYNC: "sessionSync",
      GM_RESOLUTION: "gmResolution",
      OFFER_SEARCH: "offerSearch"
    }
  };

  assert.equal(isAuthorizedSearchSocketMessage({
    type: "sessionSync",
    senderId: "gm-1",
    gmUserId: "gm-1",
    sessionId: "state"
  }, options), true);
  assert.equal(isAuthorizedSearchSocketMessage({
    type: "sessionSync",
    senderId: "gm-2",
    gmUserId: "gm-2",
    sessionId: "state"
  }, options), false);
  assert.equal(isAuthorizedSearchSocketMessage({
    type: "offerSearch",
    senderId: "gm-2",
    gmUserId: "gm-2",
    targetUserId: "player-1",
    sessionId: "session-1",
    offer: {
      locationId: "forest",
      activityId: "forage",
      lootPoolId: "plants",
      skillId: "sur"
    }
  }, options), false);
});

function createAcceptedResolutionFixture() {
  const entry = {
    userId: "player-1",
    status: "accepted",
    actorName: "",
    updatedAt: "accepted-at"
  };
  return {
    actor: { id: "actor-1", name: "Ranger" },
    message: {
      sessionId: "session-1",
      gmUserId: "gm-1",
      actorId: "actor-1",
      extraModifier: 2,
      rollMode: "advantage"
    },
    sender: { id: "player-1", isGM: false, active: true },
    session: {
      id: "session-1",
      closedAt: null,
      offers: { "player-1": entry }
    },
    entry
  };
}

test("GM authority atomically claims an accepted player offer", () => {
  const fixture = createAcceptedResolutionFixture();
  const claim = claimSearchResolution({
    ...fixture,
    currentGmId: "gm-1",
    isActorOwner: () => true,
    timestamp: "started-at"
  });

  assert.equal(claim.ok, true);
  assert.equal(claim.entry.status, "resolving");
  assert.equal(claim.request.extraModifier, 2);
  assert.equal(claim.request.rollMode, "advantage");
  assert.equal(fixture.entry.resolutionStartedAt, "started-at");
});

test("GM authority requires an authenticated accepted state before claiming an offer", () => {
  const fixture = createAcceptedResolutionFixture();
  fixture.entry.status = "pending";
  const claim = claimSearchResolution({
    ...fixture,
    currentGmId: "gm-1",
    isActorOwner: () => true,
    timestamp: "handoff-started-at"
  });

  assert.equal(claim.ok, false);
  assert.equal(claim.reason, SEARCH_RESOLUTION_REASONS.OFFER_NOT_ACCEPTED);
  assert.equal(fixture.entry.status, "pending");
});

test("GM authority rejects a duplicate request after the first claim", () => {
  const fixture = createAcceptedResolutionFixture();
  const options = {
    ...fixture,
    currentGmId: "gm-1",
    isActorOwner: () => true,
    timestamp: "started-at"
  };

  assert.equal(claimSearchResolution(options).ok, true);
  const duplicate = claimSearchResolution(options);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, SEARCH_RESOLUTION_REASONS.OFFER_NOT_ACCEPTED);
});

test("GM authority rejects an actor not owned by the requesting player", () => {
  const fixture = createAcceptedResolutionFixture();
  const claim = claimSearchResolution({
    ...fixture,
    currentGmId: "gm-1",
    isActorOwner: () => false,
    timestamp: "started-at"
  });

  assert.equal(claim.ok, false);
  assert.equal(claim.reason, SEARCH_RESOLUTION_REASONS.ACTOR_NOT_OWNED);
  assert.equal(fixture.entry.status, "accepted");
});

test("GM authority rejects forged session, closed session, and invalid roll input", () => {
  const forged = createAcceptedResolutionFixture();
  forged.message.sessionId = "forged-session";
  assert.equal(claimSearchResolution({
    ...forged,
    currentGmId: "gm-1",
    isActorOwner: () => true
  }).reason, SEARCH_RESOLUTION_REASONS.SESSION_NOT_FOUND);

  const closed = createAcceptedResolutionFixture();
  closed.session.closedAt = "closed-at";
  assert.equal(claimSearchResolution({
    ...closed,
    currentGmId: "gm-1",
    isActorOwner: () => true
  }).reason, SEARCH_RESOLUTION_REASONS.SESSION_CLOSED);

  const modifier = createAcceptedResolutionFixture();
  modifier.message.extraModifier = 1000;
  assert.equal(claimSearchResolution({
    ...modifier,
    currentGmId: "gm-1",
    isActorOwner: () => true
  }).reason, SEARCH_RESOLUTION_REASONS.INVALID_EXTRA_MODIFIER);

  const rollMode = createAcceptedResolutionFixture();
  rollMode.message.rollMode = "always-critical";
  assert.equal(claimSearchResolution({
    ...rollMode,
    currentGmId: "gm-1",
    isActorOwner: () => true
  }).reason, SEARCH_RESOLUTION_REASONS.INVALID_ROLL_MODE);
});

test("GM authority rejects an inactive sender and a request targeting another GM", () => {
  const inactive = createAcceptedResolutionFixture();
  inactive.sender.active = false;
  assert.equal(claimSearchResolution({
    ...inactive,
    currentGmId: "gm-1",
    isActorOwner: () => true
  }).reason, SEARCH_RESOLUTION_REASONS.INVALID_SENDER);

  const wrongGm = createAcceptedResolutionFixture();
  wrongGm.message.gmUserId = "gm-2";
  assert.equal(claimSearchResolution({
    ...wrongGm,
    currentGmId: "gm-1",
    isActorOwner: () => true
  }).reason, SEARCH_RESOLUTION_REASONS.WRONG_GM);
});

test("GM authority completes or permanently fails only a claimed offer", () => {
  const completed = { status: "resolving" };
  assert.equal(completeSearchResolution(completed, { rollTotal: 17 }, {
    actorName: "Ranger",
    timestamp: "completed-at"
  }), true);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.rollTotal, 17);
  assert.equal(completeSearchResolution(completed, {}, {}), false);

  const failed = { status: "resolving" };
  assert.equal(failSearchResolution(failed, { timestamp: "failed-at" }), true);
  assert.equal(failed.status, "failed");
  assert.equal(failSearchResolution(failed, {}), false);
});

test("inventory quantity remains consumed after restart despite a legacy stack flag", () => {
  const grantedQuantity = calculateGrantedQuantity(0, 5);
  const consumedQuantity = grantedQuantity - 2;
  const quantityAfterRestart = normalizeSystemQuantity(consumedQuantity, {
    fallback: 0,
    legacyStackQuantity: 5
  });

  assert.equal(grantedQuantity, 5);
  assert.equal(consumedQuantity, 3);
  assert.equal(quantityAfterRestart, 3);
  assert.equal(calculateGrantedQuantity(quantityAfterRestart, 2), 5);
});

test("inventory display uses zero from the system and never a legacy flag fallback", () => {
  assert.equal(getInventoryDisplayQuantity({
    systemQuantity: 0,
    hasQuantityPath: true,
    legacyStackQuantity: 12
  }), 0);
  assert.equal(getInventoryDisplayQuantity({
    systemQuantity: null,
    hasQuantityPath: false,
    legacyStackQuantity: 12
  }), 1);
});

test("inventory reward addition rejects invalid quantities", () => {
  assert.throws(() => calculateGrantedQuantity(3, "not-a-number"), TypeError);
  assert.equal(calculateGrantedQuantity(null, 2), 2);
});

test("inventory grant adds to the consumed system quantity instead of a legacy stack flag", async () => {
  const previousConfig = globalThis.CONFIG;
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const moduleFlags = {
    rewardId: "herb",
    rewardKey: "reward:herb",
    quantityPath: "system.oldQuantity",
    stackQuantity: 5
  };
  let updateData = null;
  const item = {
    id: "item-1",
    name: "Herb",
    type: "loot",
    system: { quantity: 3 },
    flags: { wildharvest: moduleFlags },
    toObject: () => ({ system: { quantity: 3 } }),
    getFlag: (_moduleId, key) => moduleFlags[key],
    update: async (data) => {
      updateData = data;
    }
  };
  const getProperty = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);

  globalThis.CONFIG = {
    Item: {
      typeLabels: { loot: "Loot" },
      documentClass: { DEFAULT_ICON: "icons/item.svg" }
    }
  };
  globalThis.foundry = {
    utils: {
      getProperty,
      hasProperty: (source, path) => getProperty(source, path) !== undefined,
      setProperty: (target, path, value) => {
        const parts = path.split(".");
        const finalKey = parts.pop();
        let cursor = target;
        for (const part of parts) {
          cursor[part] ??= {};
          cursor = cursor[part];
        }
        cursor[finalKey] = value;
      }
    }
  };
  globalThis.game = { packs: new Map() };

  try {
    const summary = await grantRewardsToActorInventory({ items: [item] }, [{
      id: "herb",
      name: "Herb",
      quantity: 2,
      itemType: "loot"
    }]);

    assert.equal(summary.failed.length, 0);
    assert.equal(summary.inventory.length, 1);
    assert.equal(updateData.system.quantity, 5);
    assert.equal(updateData.flags.wildharvest.quantityPath, "system.quantity");
    assert.equal("stackQuantity" in updateData.flags.wildharvest, false);
  } finally {
    globalThis.CONFIG = previousConfig;
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
  }
});

test("inventory grant refuses to fake stacking when the system has no quantity field", async () => {
  const previousConfig = globalThis.CONFIG;
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const previousWarn = console.warn;
  const moduleFlags = {
    rewardId: "herb",
    rewardKey: "reward:herb",
    quantityPath: "system.quantity",
    stackQuantity: 5
  };
  let updated = false;
  const item = {
    id: "item-1",
    name: "Herb",
    type: "loot",
    system: {},
    flags: { wildharvest: moduleFlags },
    toObject: () => ({ system: {} }),
    getFlag: (_moduleId, key) => moduleFlags[key],
    update: async () => {
      updated = true;
    }
  };
  const getProperty = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);

  globalThis.CONFIG = {
    Item: {
      typeLabels: { loot: "Loot" },
      documentClass: { DEFAULT_ICON: "icons/item.svg" }
    }
  };
  globalThis.foundry = {
    utils: {
      getProperty,
      hasProperty: (source, path) => getProperty(source, path) !== undefined
    }
  };
  globalThis.game = { packs: new Map() };
  console.warn = () => {};

  try {
    const summary = await grantRewardsToActorInventory({ items: [item] }, [{
      id: "herb",
      name: "Herb",
      quantity: 2,
      itemType: "loot"
    }]);

    assert.equal(summary.inventory.length, 0);
    assert.equal(summary.failed.length, 1);
    assert.equal(updated, false);
  } finally {
    globalThis.CONFIG = previousConfig;
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
    console.warn = previousWarn;
  }
});

test("GM control panel helpers normalize selections and filters", () => {
  const state = {
    quickOptions: [{ id: "fish", name: "Fishing" }],
    sessions: [{ id: "session-1", offers: { p1: { userId: "p1", status: "pending" } } }],
    selectedPresetId: "missing",
    selectedSessionId: "missing",
    expandedResponseKey: "session-1:missing",
    selectedUserIds: [],
    liveFilter: "broken",
    responseFilter: "broken",
    presetModeFilter: "broken",
    presetFilter: null,
    historyFilter: null
  };
  const activePlayers = [{ id: "p1" }, { id: "p2" }];

  ensureStateSelections(state, { activePlayers });

  assert.equal(state.selectedPresetId, "fish");
  assert.equal(state.selectedSessionId, "session-1");
  assert.equal(state.liveFilter, GM_LIVE_FILTERS.ALL);
  assert.equal(state.responseFilter, GM_RESPONSE_FILTERS.ALL);
  assert.equal(state.presetModeFilter, GM_PRESET_FILTERS.ALL);
  assert.deepEqual(state.selectedUserIds, ["p1", "p2"]);
  assert.equal(state.expandedResponseKey, "");
});

test("GM control panel user selection returns whole party or filtered explicit list", () => {
  const activePlayers = [{ id: "p1" }, { id: "p2" }];
  assert.deepEqual(
    getSelectedUserIds({ sendMode: GM_SEND_MODES.WHOLE_PARTY, selectedUserIds: ["p1"] }, { activePlayers }),
    ["p1", "p2"]
  );
  assert.deepEqual(
    getSelectedUserIds({ sendMode: GM_SEND_MODES.SELECTED_PLAYERS, selectedUserIds: ["p1", "offline"] }, { activePlayers }),
    ["p1"]
  );
});

test("GM control panel preset filters support text filtering and attention-first sorting", () => {
  const state = {
    presetFilter: "",
    presetModeFilter: GM_PRESET_FILTERS.ALL,
    quickOptions: [
      { id: "b", name: "Berries", description: "Forest", skillId: "sur" },
      { id: "a", name: "Fishing", description: "Lake", skillId: "nat" }
    ]
  };
  const result = getFilteredPresets(state, {
    getPresetValidationMessages: (preset) => preset.id === "b" ? ["Missing compendium"] : [],
    getSkillLabel: (skillId) => skillId,
    getPresetCompendiumSummary: (preset) => preset.description,
    locale: "en"
  });
  assert.deepEqual(result.map((preset) => preset.id), ["b", "a"]);

  state.presetFilter = "fish";
  assert.deepEqual(getFilteredPresets(state, {
    getPresetValidationMessages: () => [],
    getSkillLabel: (skillId) => skillId,
    getPresetCompendiumSummary: (preset) => preset.description,
    locale: "en"
  }).map((preset) => preset.id), ["a"]);
});

test("GM control panel response filters and counters reflect statuses", () => {
  const session = {
    offers: {
      a: { userId: "a", status: "pending" },
      b: { userId: "b", status: "accepted" },
      c: { userId: "c", status: "completed" },
      d: { userId: "d", status: "declined" },
      e: { userId: "e", status: "resolving" },
      f: { userId: "f", status: "failed" }
    }
  };

  assert.equal(getFilteredLiveEntries(session, GM_LIVE_FILTERS.PENDING).length, 3);
  assert.equal(getFilteredResponseEntries(session, GM_RESPONSE_FILTERS.SKIPPED).length, 1);
  assert.equal(getFilteredResponseEntries(session, GM_RESPONSE_FILTERS.FAILED).length, 1);
  assert.deepEqual(getSessionCounts(session), {
    total: 6,
    completed: 1,
    accepted: 1,
    resolving: 1,
    pending: 1,
    failed: 1,
    declined: 1
  });
});

test("GM control panel history excludes non-player actors", () => {
  const actors = [
    { id: "pc-type", type: "character", name: "Hero" },
    { id: "pc-linked", type: "npc", name: "Linked companion" },
    { id: "npc", type: "npc", name: "Goblin" },
    { id: "vehicle", type: "vehicle", name: "Cart" }
  ];
  const result = getHistoryPlayerActors(actors, new Set(["pc-linked"]));

  assert.deepEqual(result.map((actor) => actor.id), ["pc-type", "pc-linked"]);
});

test("GM control panel session selectors and keys remain stable", () => {
  const state = {
    selectedSessionId: "b",
    sessions: [{ id: "a" }, { id: "b" }]
  };
  assert.equal(getSelectedSession(state).id, "b");
  assert.equal(getLatestSession(state).id, "b");
  assert.equal(getResponseEntryKey("b", { userId: "u1" }), "b:u1");
});

test("migration backup captures independent settings and actor flag snapshots", () => {
  const settings = { locations: "[{\"id\":\"forest\"}]" };
  const actors = [{ id: "actor-1", moduleFlags: { resources: { herb: { quantity: 2 } } } }];
  const backup = buildMigrationBackup({
    moduleId: "wildharvest",
    moduleVersion: "0.32.0",
    sourceDataVersion: 2,
    targetDataVersion: 3,
    settings,
    actors,
    createdAt: "2026-07-11T10:00:00.000Z"
  });

  settings.locations = "[]";
  actors[0].moduleFlags.resources.herb.quantity = 99;

  assert.equal(backup.format, MIGRATION_BACKUP_FORMAT);
  assert.equal(backup.settings.locations, "[{\"id\":\"forest\"}]");
  assert.equal(backup.actors[0].moduleFlags.resources.herb.quantity, 2);
  assert.equal(backup.sourceDataVersion, 2);
  assert.equal(backup.targetDataVersion, 3);
});

test("migration backup fingerprint ignores timestamp and deduplicates identical data", () => {
  const shared = {
    moduleId: "wildharvest",
    moduleVersion: "0.32.0",
    sourceDataVersion: 3,
    targetDataVersion: 3,
    settings: { rulesConfig: "{}" },
    actors: []
  };
  const first = buildMigrationBackup({ ...shared, createdAt: "2026-07-11T10:00:00.000Z" });
  const second = buildMigrationBackup({ ...shared, createdAt: "2026-07-11T11:00:00.000Z" });
  const appended = appendMigrationBackup([first], second);

  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(appended.added, false);
  assert.equal(appended.history.length, 1);
  assert.equal(appended.backup.id, first.id);
});

test("migration backup keeps the first snapshot for a migration boundary", () => {
  const first = buildMigrationBackup({
    moduleId: "wildharvest",
    moduleVersion: "0.32.0",
    sourceDataVersion: 3,
    targetDataVersion: 3,
    settings: { marker: "before" },
    actors: [],
    createdAt: "2026-07-11T10:00:00.000Z"
  });
  const laterState = buildMigrationBackup({
    moduleId: "wildharvest",
    moduleVersion: "0.32.0",
    sourceDataVersion: 3,
    targetDataVersion: 3,
    settings: { marker: "after-restart" },
    actors: [{ id: "actor-1", moduleFlags: { resources: { herb: 5 } } }],
    createdAt: "2026-07-12T10:00:00.000Z"
  });
  const appended = appendMigrationBackup([first], laterState);

  assert.notEqual(first.fingerprint, laterState.fingerprint);
  assert.equal(appended.added, false);
  assert.equal(appended.history.length, 1);
  assert.equal(appended.backup.settings.marker, "before");
});

test("migration backup history rejects invalid data and keeps only the newest limit", () => {
  assert.deepEqual(normalizeMigrationBackupHistory("not-json"), []);
  assert.deepEqual(normalizeMigrationBackupHistory([{ id: "invalid" }]), []);

  let history = [];
  for (let index = 1; index <= 4; index += 1) {
    const backup = buildMigrationBackup({
      moduleId: "wildharvest",
      moduleVersion: `0.3${index}.0`,
      sourceDataVersion: index,
      targetDataVersion: index + 1,
      settings: { marker: index },
      actors: [],
      createdAt: `2026-07-11T1${index}:00:00.000Z`
    });
    history = appendMigrationBackup(history, backup, 3).history;
  }

  assert.equal(history.length, 3);
  assert.deepEqual(history.map((backup) => backup.settings.marker), [2, 3, 4]);
});

test("pre-migration backup persists Foundry settings and module flags only once", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  let storedHistory = "[]";
  const writes = [];
  const values = new Map([
    ["languageMode", "pl"],
    ["locations", "[{\"id\":\"forest\"}]"],
    ["lootPools", "[]"],
    ["randomLootPack", ""],
    ["rulesConfig", "{}"],
    ["dataVersion", 2],
    ["searchSessions", "[]"]
  ]);

  globalThis.foundry = {
    utils: {
      deepClone: (value) => structuredClone(value)
    }
  };
  globalThis.game = {
    user: { isGM: true },
    modules: new Map([["wildharvest", { version: "0.32.0" }]]),
    settings: {
      get: (_moduleId, key) => key === "migrationBackups" ? storedHistory : values.get(key),
      set: async (_moduleId, key, value) => {
        assert.equal(key, "migrationBackups");
        storedHistory = value;
        writes.push(value);
      }
    },
    actors: {
      contents: [{
        id: "actor-1",
        name: "Scout",
        flags: { wildharvest: { resources: { herb: { quantity: 2 } } } },
        items: new Map([["item-1", {
          id: "item-1",
          name: "Herb",
          flags: { wildharvest: { rewardId: "herb", stackQuantity: 2 } }
        }]])
      }]
    }
  };

  try {
    const first = await createPreMigrationBackup({ targetDataVersion: 3 });
    const second = await createPreMigrationBackup({ targetDataVersion: 3 });
    const [backup] = JSON.parse(storedHistory);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(writes.length, 1);
    assert.equal(backup.settings.locations, "[{\"id\":\"forest\"}]");
    assert.equal(backup.actors[0].moduleFlags.resources.herb.quantity, 2);
    assert.equal(backup.actors[0].items[0].moduleFlags.rewardId, "herb");
  } finally {
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
  }
});

test("clean Wildharvest data initialization writes only its own schema version", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const settings = new Map([
    ["languageMode", "en"],
    ["locations", "[]"],
    ["lootPools", "[]"],
    ["randomLootPack", ""],
    ["rulesConfig", "{}"],
    ["dataVersion", 0],
    ["searchSessions", "[]"],
    ["migrationBackups", "[]"]
  ]);
  const writes = [];

  globalThis.foundry = {
    utils: {
      deepClone: (value) => structuredClone(value)
    }
  };
  globalThis.game = {
    user: { isGM: true },
    modules: new Map([["wildharvest", { version: "0.33.0" }]]),
    actors: { contents: [] },
    settings: {
      get: (_moduleId, key) => settings.get(key),
      set: async (_moduleId, key, value) => {
        settings.set(key, value);
        writes.push(key);
      }
    }
  };

  try {
    const result = await migrateModuleData();

    assert.equal(result.changed, true);
    assert.equal(result.currentDataVersion, 1);
    assert.equal(settings.get("dataVersion"), 1);
    assert.deepEqual(writes, ["migrationBackups", "dataVersion"]);
  } finally {
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
  }
});

test("lifecycle registers settings and menus synchronously during init", () => {
  const calls = [];
  const lifecycle = createModuleLifecycle({
    registerSettings: () => calls.push("settings"),
    registerRulesSettingsMenu: () => calls.push("menu"),
    preloadTranslations: () => calls.push("translations"),
    registerSocketListeners: () => calls.push("socket"),
    runReadyMaintenance: () => calls.push("maintenance"),
    onInitComplete: () => calls.push("init-complete")
  });

  assert.equal(lifecycle.onInit(), undefined);
  assert.deepEqual(calls, ["settings", "menu", "init-complete"]);
});

test("lifecycle waits for delayed translations before ready maintenance", async () => {
  const calls = [];
  let releaseTranslations;
  const translationGate = new Promise((resolve) => {
    releaseTranslations = resolve;
  });
  const lifecycle = createModuleLifecycle({
    registerSettings: () => {},
    registerRulesSettingsMenu: () => {},
    preloadTranslations: async () => {
      calls.push("translations-start");
      await translationGate;
      calls.push("translations-end");
    },
    registerSocketListeners: () => calls.push("socket"),
    runReadyMaintenance: () => calls.push("maintenance")
  });

  assert.equal(lifecycle.onI18nInit(), undefined);
  assert.equal(lifecycle.onReady(), undefined);
  assert.deepEqual(calls, ["socket"]);

  await Promise.resolve();
  assert.deepEqual(calls, ["socket", "translations-start"]);

  releaseTranslations();
  await lifecycle.waitForTranslations();
  await Promise.resolve();
  assert.deepEqual(calls, ["socket", "translations-start", "translations-end", "maintenance"]);
});

test("lifecycle reports translation failures and still runs maintenance", async () => {
  const calls = [];
  const expectedError = new Error("translation fetch failed");
  const lifecycle = createModuleLifecycle({
    registerSettings: () => {},
    registerRulesSettingsMenu: () => {},
    preloadTranslations: async () => {
      throw expectedError;
    },
    registerSocketListeners: () => calls.push("socket"),
    runReadyMaintenance: () => calls.push("maintenance"),
    onBackgroundError: (phase, error) => calls.push(`${phase}:${error === expectedError}`)
  });

  lifecycle.onI18nInit();
  lifecycle.onReady();
  await lifecycle.waitForTranslations();
  await Promise.resolve();

  assert.deepEqual(calls, ["socket", "translations:true", "maintenance"]);
});

test("lifecycle contains socket and maintenance failures", async () => {
  const calls = [];
  const lifecycle = createModuleLifecycle({
    registerSettings: () => {},
    registerRulesSettingsMenu: () => {},
    preloadTranslations: () => {},
    registerSocketListeners: () => {
      throw new Error("socket failed");
    },
    runReadyMaintenance: async () => {
      throw new Error("maintenance failed");
    },
    onBackgroundError: (phase) => calls.push(phase)
  });

  lifecycle.onI18nInit();
  lifecycle.onReady();
  await lifecycle.waitForTranslations();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, ["socket-registration", "ready-maintenance"]);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`TESTS_FAILED ${failures}`);
  process.exit(1);
}

console.log(`TESTS_PASSED ${tests.length}`);
