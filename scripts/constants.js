export const MODULE_ID = "wildharvest";
// 1.25.0 (data version 3): presets live in one setting; "locations" and "lootPools" are read
// only by the migration and removed by it.
export const PRESETS_SETTING_KEY = "presets";
export const LEGACY_LOCATIONS_SETTING_KEY = "locations";
export const LEGACY_LOOT_POOLS_SETTING_KEY = "lootPools";
export const RULES_SETTING_KEY = "rulesConfig";
// Client setting removed in 1.27.0 (D8: the module follows the Foundry language); old backups
// may still hold it and restoring skips it.
export const LEGACY_LANGUAGE_MODE_SETTING_KEY = "languageMode";
export const DATA_VERSION_SETTING_KEY = "dataVersion";
export const SEARCH_SESSIONS_SETTING_KEY = "searchSessions";
export const MIGRATION_BACKUPS_SETTING_KEY = "migrationBackups";
// 1.24.0 (D9): skill checks through the D&D5e system roll instead of the module's own d20 formula.
export const SYSTEM_SKILL_ROLL_SETTING_KEY = "systemSkillRoll";
// 1.34.0: the GM checks the loot of a player's search before it is given.
export const LOOT_APPROVAL_SETTING_KEY = "lootApproval";
// 1.35.0: a chat message with the search result: "off", "public" or "gm" (whispered to the GMs).
export const CHAT_RESULT_SETTING_KEY = "chatResult";
export const CHAT_RESULT_MODES = Object.freeze(["off", "public", "gm"]);
export const RESOURCES_FLAG = "resources";
export const SEARCH_LOG_FLAG = "searchLog";
// Legacy single-request flag (data version 1), removed by the 1.21.0 migration.
export const LEGACY_PLAYER_REQUEST_FLAG = "playerRequest";
export const PLAYER_REQUESTS_FLAG = "requests";

// Setting removed in 1.21.0 (fallback "@selected" loot compendiums); the migration deletes its stored value.
export const LEGACY_RANDOM_LOOT_PACK_SETTING_KEY = "randomLootPack";
