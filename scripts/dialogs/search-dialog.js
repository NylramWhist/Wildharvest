import { getDefaultActorId, getAvailableActors } from "../helpers/actor-utils.js";
import { MODULE_ID } from "../constants.js";
import { getActivitySkillLabel, getActorSkillModifier } from "../helpers/dnd5e-support.js";
import { getActorContainers } from "../helpers/inventory-container-core.js";
import { getRewardDisplayName } from "../helpers/reward-utils.js";
import { addRewardsToActor, appendSearchLog } from "../helpers/resource-store.js";
import { executeSearch } from "../helpers/search-engine.js";
import { notifyError } from "../helpers/notification-utils.js";
import { getModuleLocaleTag, t } from "../i18n.js";
import { getLocations } from "../settings.js";
import {
  addWindowClasses,
  escapeHtml,
  focusDialogControl,
  getDialogForm
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;
const ACTIVITY_CATALOG_LOCATION_ID = "wildharvest-options";
const PLAYER_UI_ASSETS = Object.freeze({
  activity: "modules/wildharvest/assets/ui/icons/icon-activity.svg",
  wildharvest: "modules/wildharvest/assets/ui/icons/icon-wildharvest.svg",
  character: "modules/wildharvest/assets/ui/icons/icon-character.svg",
  roll: "modules/wildharvest/assets/ui/icons/icon-roll.svg",
  result: "modules/wildharvest/assets/ui/icons/icon-result.svg",
  rewards: "modules/wildharvest/assets/ui/icons/icon-rewards.svg",
  completed: "modules/wildharvest/assets/ui/icons/icon-completed.svg"
});

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getDefaultItemImage() {
  return CONFIG.Item?.documentClass?.DEFAULT_ICON ?? "icons/svg/item-bag.svg";
}

function renderPlayerInlineAsset(imagePath, className, alt = "") {
  if (!imagePath) return "";
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(imagePath)}" alt="${escapeHtml(alt)}">`;
}

function isHiddenActivityCatalog(location) {
  return String(location?.id ?? "").trim() === ACTIVITY_CATALOG_LOCATION_ID
    || String(location?.name ?? "").trim() === t("WILDHARVEST.Default.ActivityCatalogName");
}

function getRollModeLabel(rollMode) {
  const key = {
    normal: "WILDHARVEST.Dialog.Search.RollModeNormal",
    advantage: "WILDHARVEST.Dialog.Search.RollModeAdvantage",
    disadvantage: "WILDHARVEST.Dialog.Search.RollModeDisadvantage"
  }[String(rollMode ?? "normal").trim().toLowerCase()] ?? "WILDHARVEST.Dialog.Search.RollModeNormal";

  return t(key);
}

function buildEffectiveActivity(location, activity, override = {}) {
  return {
    ...activity,
    lootPoolId: String(override.lootPoolId ?? activity.lootPoolId ?? location?.lootPoolId ?? "").trim() || null,
    skillId: override.skillId ?? activity.skillId ?? null,
    skillLabel: override.skillLabel ?? activity.skillLabel
  };
}

function renderActorOptions(actors, selectedActorId) {
  const blankOption = `<option value="">${escapeHtml(t("WILDHARVEST.Dialog.Search.NoCharacterSave"))}</option>`;
  const actorOptions = actors
    .map((actor) => {
      const selected = actor.id === selectedActorId ? " selected" : "";
      return `<option value="${escapeHtml(actor.id)}"${selected}>${escapeHtml(actor.name)}</option>`;
    })
    .join("");

  return `${blankOption}${actorOptions}`;
}

function renderContainerOptions(actor, selectedContainerId = "") {
  const containers = getActorContainers(actor);
  const rootSelected = containers.some((container) => container.id === selectedContainerId) ? "" : " selected";
  const containerOptions = containers.map((container) => {
    const selected = container.id === selectedContainerId ? " selected" : "";
    return `<option value="${escapeHtml(container.id)}"${selected}>${escapeHtml(container.name)}</option>`;
  }).join("");

  return `<option value=""${rootSelected}>${escapeHtml(t("WILDHARVEST.Dialog.Search.MainInventory"))}</option>${containerOptions}`;
}

function renderActorSection(actors, selectedActorId, selectedContainerId = "") {
  const selectedActor = actors.find((actor) => actor.id === selectedActorId) ?? null;
  const hasContainers = getActorContainers(selectedActor).length > 0;
  return `
    <section class="wildharvest-player-card">
      ${renderPlayerSectionTitle({
        title: t("WILDHARVEST.Dialog.Search.Actor"),
        icon: "fa-solid fa-user",
        imagePath: PLAYER_UI_ASSETS.character
      })}
      <div class="form-group wildharvest-form-group--tight">
        <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.Actor"))}</label>
        <select name="actorId">
          ${renderActorOptions(actors, selectedActorId)}
        </select>
      </div>
      <div class="form-group wildharvest-form-group--tight" data-loot-destination${hasContainers ? "" : " hidden"}>
        <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.LootDestination"))}</label>
        <select name="containerId">
          ${renderContainerOptions(selectedActor, selectedContainerId)}
        </select>
        <p class="notes">${escapeHtml(t("WILDHARVEST.Dialog.Search.LootDestinationHint"))}</p>
      </div>
    </section>
  `;
}

function renderLocationOptions(locations, selectedLocationId) {
  return locations
    .map((location) => {
      const selected = location.id === selectedLocationId ? " selected" : "";
      return `<option value="${escapeHtml(location.id)}"${selected}>${escapeHtml(location.name)}</option>`;
    })
    .join("");
}

function renderActivityOptions(location, selectedActivityId) {
  return location.activities
    .map((activity) => {
      const selected = activity.id === selectedActivityId ? " selected" : "";
      return `<option value="${escapeHtml(activity.id)}"${selected}>${escapeHtml(activity.name)}</option>`;
    })
    .join("");
}

function renderRollModeOptions(selectedRollMode = "normal") {
  return ["normal", "advantage", "disadvantage"]
    .map((mode) => {
      const selected = mode === selectedRollMode ? " selected" : "";
      return `<option value="${escapeHtml(mode)}"${selected}>${escapeHtml(getRollModeLabel(mode))}</option>`;
    })
    .join("");
}

function renderPlayerHero({ title, subtitle, icon = "fa-solid fa-compass", imagePath = "" }) {
  const emblemClassName = imagePath
    ? "wildharvest-player-hero__emblem wildharvest-player-hero__emblem--image"
    : "wildharvest-player-hero__emblem";

  return `
    <section class="wildharvest-player-hero">
      <div class="${emblemClassName}">
        ${imagePath
          ? `<img class="wildharvest-player-hero__asset" src="${escapeHtml(imagePath)}" alt="">`
          : `<i class="${escapeHtml(icon)}" aria-hidden="true"></i>`}
      </div>
      <div class="wildharvest-player-hero__copy">
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<p data-search-hero-subtitle>${escapeHtml(subtitle)}</p>` : ""}
        <div class="wildharvest-player-hero__divider" aria-hidden="true"></div>
      </div>
    </section>
  `;
}

function renderPlayerSectionTitle({ title, icon = "", imagePath = "" }) {
  return `
    <div class="wildharvest-player-section-title">
      <span class="wildharvest-player-section-title__badge">
        ${imagePath
          ? `<img class="wildharvest-player-section-title__asset" src="${escapeHtml(imagePath)}" alt="">`
          : `<i class="${escapeHtml(icon)} wildharvest-player-section-title__icon" aria-hidden="true"></i>`}
      </span>
      <span>${escapeHtml(title)}</span>
    </div>
  `;
}

function renderRollSection({ baseModifier = 0, selectedRollMode = "normal" } = {}) {
  return `
    <section class="wildharvest-player-card">
      ${renderPlayerSectionTitle({
        title: t("WILDHARVEST.Dialog.Search.RollSection"),
        icon: "fa-solid fa-dice-d20",
        imagePath: PLAYER_UI_ASSETS.roll
      })}
      <div class="wildharvest-player-metrics">
        <div class="wildharvest-player-metric wildharvest-player-metric--primary">
          <span>${escapeHtml(t("WILDHARVEST.Dialog.Search.BaseModifier"))}</span>
          <strong data-base-modifier>${escapeHtml(formatSigned(baseModifier))}</strong>
        </div>
      </div>
      <input type="hidden" name="baseSkillModifier" value="${escapeHtml(String(baseModifier))}">
      <div class="form-group wildharvest-form-group--tight">
        <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.ExtraModifier"))}</label>
        <input type="number" name="extraModifier" step="1" value="0">
      </div>
      <div class="form-group wildharvest-form-group--tight">
        <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.RollMode"))}</label>
        <select name="rollMode">
          ${renderRollModeOptions(selectedRollMode)}
        </select>
      </div>
    </section>
  `;
}

function renderResultItems(result) {
  if (!result.rewards.length) {
    return `
      <div class="wildharvest-result-empty">
        ${renderPlayerInlineAsset(PLAYER_UI_ASSETS.rewards, "wildharvest-result-empty__asset")}
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Result.NoItems"))}</p>
      </div>
    `;
  }

  const previewRewards = result.rewards.slice(0, 8);
  const previewMarkup = previewRewards.map((reward) => `
    <article class="wildharvest-result-preview-item" title="${escapeHtml(getRewardDisplayName(reward))}">
      <img src="${escapeHtml(reward.img || getDefaultItemImage())}" alt="${escapeHtml(getRewardDisplayName(reward))}">
      <strong>${escapeHtml(getRewardDisplayName(reward))}</strong>
      <span>x${escapeHtml(String(reward.quantity ?? 1))}</span>
    </article>
  `).join("");
  const detailMarkup = result.rewards.map((reward) => `
      <article class="wildharvest-result-item">
        <div class="wildharvest-result-item__status">
          ${renderPlayerInlineAsset(PLAYER_UI_ASSETS.completed, "wildharvest-result-item__status-asset")}
        </div>
        <img
          class="wildharvest-result-item__image"
          src="${escapeHtml(reward.img || getDefaultItemImage())}"
          alt="${escapeHtml(getRewardDisplayName(reward))}"
        >
        <div class="wildharvest-result-item__copy">
          <strong>${escapeHtml(getRewardDisplayName(reward))}</strong>
          ${reward.unitValueGp !== undefined
            ? `<small>${escapeHtml(t("WILDHARVEST.Dialog.Result.UnitValueGp", { value: reward.unitValueGp }))}</small>`
            : ""}
        </div>
        <span class="wildharvest-result-item__quantity">x${escapeHtml(String(reward.quantity ?? 1))}</span>
      </article>
    `).join("");

  return `
    <div class="wildharvest-result-preview-grid">
      ${previewMarkup}
    </div>
    <details class="wildharvest-result-details">
      <summary>${escapeHtml(t("WILDHARVEST.Dialog.Result.ViewAll", { count: result.rewards.length }))}</summary>
      <div class="wildharvest-result-list">${detailMarkup}</div>
    </details>
  `;
}

function buildResultStorageState(actor, storageSummary, rewardCount) {
  const inventoryCount = Array.isArray(storageSummary?.inventory)
    ? storageSummary.inventory.length
    : Number(storageSummary?.inventoryCount ?? 0);
  const fallbackCount = Array.isArray(storageSummary?.fallback)
    ? storageSummary.fallback.length
    : Number(storageSummary?.fallbackCount ?? 0);
  const containerName = String(storageSummary?.containerName ?? "").trim();

  if (!actor) {
    return {
      message: t("WILDHARVEST.Dialog.Result.NoActor"),
      className: "is-muted",
      iconPath: PLAYER_UI_ASSETS.rewards
    };
  }

  if (!rewardCount) {
    return {
      message: t("WILDHARVEST.Dialog.Result.InventoryNone"),
      className: "is-muted",
      iconPath: PLAYER_UI_ASSETS.rewards
    };
  }

  if (inventoryCount && !fallbackCount) {
    return {
      message: containerName
        ? t("WILDHARVEST.Dialog.Result.InventoryAllContainer", { containerName })
        : t("WILDHARVEST.Dialog.Result.InventoryAll"),
      className: "is-success",
      iconPath: PLAYER_UI_ASSETS.completed
    };
  }

  if (inventoryCount && fallbackCount) {
    return {
      message: containerName
        ? t("WILDHARVEST.Dialog.Result.InventoryPartialContainer", { containerName })
        : t("WILDHARVEST.Dialog.Result.InventoryPartial"),
      className: "is-partial",
      iconPath: PLAYER_UI_ASSETS.completed
    };
  }

  return {
    message: t("WILDHARVEST.Dialog.Result.InventoryFallback", { actorName: actor.name }),
    className: "is-warning",
    iconPath: PLAYER_UI_ASSETS.rewards
  };
}

function getResultToneClass(result) {
  const total = Number(result?.roll?.total ?? 0);
  const lootPoints = Number(result?.lootSummary?.lootPoints ?? 0);

  if (total >= 20 || lootPoints >= 6) return "wildharvest-player-layout--result-high";
  if (total >= 12 || lootPoints >= 2) return "wildharvest-player-layout--result-mid";
  return "wildharvest-player-layout--result-low";
}

function getPlayerDialogPosition(position = {}) {
  const nextPosition = { width: 520 };
  if (Number.isFinite(Number(position?.left))) nextPosition.left = Number(position.left);
  if (Number.isFinite(Number(position?.top))) nextPosition.top = Number(position.top);
  return nextPosition;
}

export function openSearchResultDialog({ actor, activity, result, storageSummary }, position = {}) {
  const storageState = buildResultStorageState(actor, storageSummary, result.rewards.length);
  const rewardsStateClass = result.rewards.length ? "has-rewards" : "no-rewards";
  const resultToneClass = getResultToneClass(result);

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Result.Title")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-player-layout wildharvest-player-layout--result ${escapeHtml(resultToneClass)} ${escapeHtml(rewardsStateClass)}">
        ${renderPlayerHero({
          title: t("WILDHARVEST.Dialog.Result.Title"),
          subtitle: activity?.name ?? "",
          icon: "fa-solid fa-box-open",
          imagePath: PLAYER_UI_ASSETS.result
        })}
        <section class="wildharvest-player-card wildharvest-player-card--accent wildharvest-player-card--result-summary">
          <div class="wildharvest-player-stat-grid">
            <div class="wildharvest-player-stat wildharvest-player-stat--primary">
              <span>${escapeHtml(t("WILDHARVEST.Dialog.Result.FinalResult"))}</span>
              <strong class="wildharvest-player-stat__value">${escapeHtml(String(result.roll.total ?? 0))}</strong>
            </div>
            <div class="wildharvest-player-stat">
              <span>${escapeHtml(t("WILDHARVEST.Dialog.Result.LootPoints"))}</span>
              <strong class="wildharvest-player-stat__value">${escapeHtml(String(result.lootSummary?.lootPoints ?? 0))}</strong>
            </div>
          </div>
        </section>
        <section class="wildharvest-player-card wildharvest-player-card--result-items">
          ${renderPlayerSectionTitle({
            title: t("WILDHARVEST.Dialog.Result.FoundItemsCount", { count: result.rewards.length }),
            imagePath: PLAYER_UI_ASSETS.rewards
          })}
          <div class="wildharvest-result-list">
            ${renderResultItems(result)}
          </div>
        </section>
        <p class="wildharvest-player-status ${escapeHtml(storageState.className)}">
          ${renderPlayerInlineAsset(storageState.iconPath, "wildharvest-player-status__asset")}
          <span>${escapeHtml(storageState.message)}</span>
        </p>
      </div>
    `,
    buttons: [
      {
        action: "close",
        label: t("WILDHARVEST.Dialog.Result.Close"),
        icon: "fa-solid fa-check",
        default: true
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => {
    addWindowClasses(dialog, "wildharvest-window--player", "wildharvest-window--player-result");
    dialog.setPosition?.(getPlayerDialogPosition(position));
    focusDialogControl(dialog, [
      "details summary",
      "[data-action='close']",
      ".dialog-buttons button.default"
    ]);
  }, { once: true });
  dialog.render({ force: true });
  return dialog;
}

export function openSearchResultFromLog({ actor, entry, activityName = "", position = {} }) {
  if (!actor || !entry) return null;

  return openSearchResultDialog({
    actor,
    activity: { name: activityName || entry.activityName || "" },
    result: {
      roll: { total: Number(entry.rollTotal ?? 0) },
      lootSummary: entry.lootSummary ?? { lootPoints: 0 },
      rewards: Array.isArray(entry.rewards) ? entry.rewards : []
    },
    storageSummary: entry.storageState ?? { inventoryCount: 0, fallbackCount: 0 }
  }, position);
}

export async function resolveSearchAsGm({
  actor,
  location,
  activity,
  skillName,
  skillModifier,
  rollMode,
  containerId = "",
  resolutionId = ""
}) {
  if (!game.user?.isGM) {
    throw new Error(t("WILDHARVEST.Errors.GmResolutionRequired"));
  }

  const result = await executeSearch({
    activity,
    skillName,
    skillModifier,
    rollMode
  });
  let storageSummary = {
    inventory: [],
    fallback: [],
    containerId: "",
    containerName: ""
  };

  if (actor && result.rewards.length) {
    storageSummary = await addRewardsToActor(actor, result.rewards, { containerId });
  }

  if (actor) {
    try {
      await appendSearchLog(actor, {
        ...(resolutionId ? { sessionId: String(resolutionId) } : {}),
        locationName: location.name,
        activityName: activity.name,
        skillName: result.skillName,
        rollTotal: result.roll.total,
        advantage: result.advantage,
        rollMode: result.rollMode ?? rollMode,
        lootSummary: result.lootSummary ?? null,
        rewards: result.rewards,
        storageState: {
          inventoryCount: storageSummary.inventory.length,
          fallbackCount: storageSummary.fallback.length,
          containerId: storageSummary.containerId ?? "",
          containerName: storageSummary.containerName ?? ""
        },
        timestamp: new Date().toLocaleString(getModuleLocaleTag())
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to append the GM-authoritative search log.`, error);
    }
  }

  ui.notifications.info(t("WILDHARVEST.Notifications.ActionResolved"));
  return {
    actor,
    location,
    activity,
    result,
    storageSummary
  };
}

async function handleSubmit(form, locations, {
  beforeSubmit = null,
  onSubmitRequest = null,
  dialogPosition = {}
} = {}) {
  if (!form) {
    throw new Error(t("WILDHARVEST.Errors.SearchFormMissing"));
  }

  if (typeof beforeSubmit === "function") {
    await beforeSubmit();
  }

  const formData = Object.fromEntries(new FormData(form).entries());
  const extraModifier = Number(formData.extraModifier ?? 0);
  if (!Number.isFinite(extraModifier)) {
    throw new Error(t("WILDHARVEST.Errors.SkillModifierNumber"));
  }
  const rollMode = String(formData.rollMode ?? (form.elements.hasAdvantage?.checked ? "advantage" : "normal")).trim().toLowerCase();

  if (typeof onSubmitRequest === "function") {
    await onSubmitRequest({
      actorId: String(formData.actorId ?? "").trim(),
      containerId: String(formData.containerId ?? "").trim(),
      extraModifier,
      rollMode,
      dialogPosition
    });
    return { pending: true };
  }

  if (!game.user?.isGM) {
    throw new Error(t("WILDHARVEST.Errors.GmResolutionRequired"));
  }

  const location = locations.find((entry) => entry.id === formData.locationId);
  if (!location) throw new Error(t("WILDHARVEST.Errors.LocationMissing"));

  const activity = location.activities.find((entry) => entry.id === formData.activityId);
  if (!activity) throw new Error(t("WILDHARVEST.Errors.ActivityMissing"));

  const effectiveActivity = buildEffectiveActivity(location, activity, {
    skillId: String(formData.skillId ?? "").trim() || null,
    skillLabel: String(formData.skillName ?? "").trim() || activity.skillLabel
  });

  const actor = formData.actorId ? game.actors.get(String(formData.actorId)) : null;
  const baseSkillModifier = Number(formData.baseSkillModifier ?? formData.skillModifier ?? 0);
  const finalSkillModifier = baseSkillModifier + extraModifier;
  return resolveSearchAsGm({
    actor,
    location,
    activity: effectiveActivity,
    skillName: String(formData.skillName ?? ""),
    skillModifier: finalSkillModifier,
    rollMode,
    containerId: String(formData.containerId ?? "").trim()
  });
}

async function handleSubmitSafely(form, locations, submitOptions = {}) {
  try {
    return await handleSubmit(form, locations, submitOptions);
  } catch (error) {
    notifyError(error);
    return null;
  }
}

function refreshActivityOptions(dialog, locations) {
  const form = getDialogForm(dialog);
  if (!form) return;

  const locationId = String(form.elements.locationId?.value ?? "");
  const location = locations.find((entry) => entry.id === locationId) ?? locations[0];
  const activitySelect = form.elements.activityId;
  if (!location || !activitySelect) return;

  const currentActivityId = String(activitySelect.value ?? "");
  const hasCurrentActivity = location.activities.some((entry) => entry.id === currentActivityId);
  const nextActivityId = hasCurrentActivity ? currentActivityId : location.activities[0]?.id;

  activitySelect.innerHTML = renderActivityOptions(location, nextActivityId);
  activitySelect.value = nextActivityId;

  const baseActivity = location.activities.find((entry) => entry.id === nextActivityId) ?? location.activities[0];
  const activity = buildEffectiveActivity(location, baseActivity);
  syncSkillInputs(form, location, activity);
}

function attachListeners(dialog, locations) {
  const form = getDialogForm(dialog);
  if (!form) return;

  form.elements.actorId?.addEventListener("change", () => {
    const locationId = String(form.elements.locationId?.value ?? "");
    const location = locations.find((entry) => entry.id === locationId) ?? locations[0];
    const activityId = String(form.elements.activityId?.value ?? "");
    const baseActivity = location.activities.find((entry) => entry.id === activityId) ?? location.activities[0];
    const activity = buildEffectiveActivity(location, baseActivity);
    syncSkillInputs(form, location, activity);
    syncContainerDestination(form);
  });
  form.elements.locationId?.addEventListener("change", () => refreshActivityOptions(dialog, locations));
  form.elements.activityId?.addEventListener("change", () => refreshActivityOptions(dialog, locations));
  refreshActivityOptions(dialog, locations);
  syncContainerDestination(form);
}

function getInitialSearchContext(locations, options = {}) {
  const requestedLocation = locations.find((entry) => entry.id === options.locationId);
  const location = requestedLocation ?? locations[0];
  const requestedActivity = location.activities.find((entry) => entry.id === options.activityId);
  const activity = buildEffectiveActivity(
    location,
    requestedActivity ?? location.activities[0],
    {
      skillId: options.skillId ?? null,
      skillLabel: options.skillLabel ?? null,
      lootPoolId: options.lootPoolId ?? null
    }
  );
  return { location, activity };
}

function renderContextSection({ locations, location, activity, lockContext }) {
  const skillLabel = getActivitySkillLabel(activity) || activity.skillLabel;
  if (lockContext) {
    return `
      <input type="hidden" name="locationId" value="${escapeHtml(location.id)}">
      <input type="hidden" name="activityId" value="${escapeHtml(activity.id)}">
      <input type="hidden" name="skillId" value="${escapeHtml(activity.skillId ?? "")}">
      <input type="hidden" name="skillName" value="${escapeHtml(skillLabel)}">
    `;
  }

  return `
    <section class="wildharvest-player-card">
      ${renderPlayerSectionTitle({
        title: t("WILDHARVEST.Dialog.Search.ContextTitle"),
        imagePath: PLAYER_UI_ASSETS.activity
      })}
      <div class="form-group wildharvest-form-group--tight">
        <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.Location"))}</label>
        <select name="locationId">
          ${renderLocationOptions(locations, location.id)}
        </select>
      </div>
      <div class="form-group wildharvest-form-group--tight">
        <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.Activity"))}</label>
        <select name="activityId">
          ${renderActivityOptions(location, activity.id)}
        </select>
      </div>
      <input type="hidden" name="skillId" value="${escapeHtml(activity.skillId ?? "")}">
      <input type="hidden" name="skillName" value="${escapeHtml(skillLabel)}">
      <div class="wildharvest-player-metrics">
        <div class="wildharvest-player-metric">
          <span>${escapeHtml(t("WILDHARVEST.Dialog.Search.Skill"))}</span>
          <strong data-skill-label>${escapeHtml(skillLabel)}</strong>
        </div>
      </div>
    </section>
  `;
}

function syncSkillInputs(form, location, activity) {
  const actorId = String(form.elements.actorId?.value ?? "");
  const actor = actorId ? game.actors.get(actorId) : null;
  const skillNameInput = form.elements.skillName;
  const skillIdInput = form.elements.skillId;
  const baseModifierInput = form.elements.baseSkillModifier;
  const baseModifierLabel = form.querySelector("[data-base-modifier]");
  const skillLabelOutput = form.querySelector("[data-skill-label]");
  const heroSubtitleOutput = form.querySelector("[data-search-hero-subtitle]");
  const layoutRoot = form.closest("[data-player-lock-context]");

  const skillLabel = getActivitySkillLabel(activity) || activity.skillLabel || t("WILDHARVEST.Default.SkillLabel");
  const suggestedModifier = getActorSkillModifier(actor, activity);
  const normalizedModifier = suggestedModifier ?? 0;
  const isLockContext = layoutRoot?.dataset?.playerLockContext === "true";

  if (skillNameInput) {
    skillNameInput.value = skillLabel;
  }

  if (skillIdInput) {
    skillIdInput.value = activity.skillId ?? "";
  }

  if (baseModifierInput) {
    baseModifierInput.value = String(normalizedModifier);
  }

  if (baseModifierLabel) {
    baseModifierLabel.textContent = suggestedModifier !== null
      ? formatSigned(normalizedModifier)
      : "0";
  }

  if (skillLabelOutput) {
    skillLabelOutput.textContent = skillLabel;
  }

  if (heroSubtitleOutput) {
    heroSubtitleOutput.textContent = isLockContext
      ? t("WILDHARVEST.Dialog.Common.SkillCheck", { skillLabel })
      : t("WILDHARVEST.Dialog.Search.SearchingWith", { skillLabel });
  }
}

function syncContainerDestination(form) {
  const actorId = String(form.elements.actorId?.value ?? "");
  const actor = actorId ? game.actors.get(actorId) : null;
  const destinationGroup = form.querySelector("[data-loot-destination]");
  const destinationSelect = form.elements.containerId;
  if (!destinationGroup || !destinationSelect) return;

  const selectedContainerId = String(destinationSelect.value ?? "");
  const containers = getActorContainers(actor);
  destinationSelect.innerHTML = renderContainerOptions(actor, selectedContainerId);
  destinationGroup.hidden = !containers.length;
}

export function openSearchDialog(options = {}) {
  const locations = getLocations();
  if (!locations.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoLocations"));
    return;
  }

  const actors = Array.isArray(options.availableActors) && options.availableActors.length
    ? options.availableActors
    : getAvailableActors();
  const selectedActorId = options.actorId && actors.some((actor) => actor.id === options.actorId)
    ? options.actorId
    : getDefaultActorId(actors);
  const selectedContainerId = String(options.containerId ?? "").trim();
  const { location: initialLocation, activity: initialActivity } = getInitialSearchContext(locations, options);
  const lockContext = Boolean(options.lockContext);
  const title = options.title ?? t("WILDHARVEST.Dialog.Search.Title");
  const beforeSubmit = typeof options.beforeSubmit === "function" ? options.beforeSubmit : null;
  const onSubmitRequest = typeof options.onSubmitRequest === "function" ? options.onSubmitRequest : null;
  const initialSkillLabel = getActivitySkillLabel(initialActivity) || initialActivity.skillLabel || t("WILDHARVEST.Default.SkillLabel");
  const heroTitle = lockContext
    ? initialActivity.name
    : t("WILDHARVEST.Dialog.Search.Title");
  const heroSubtitle = lockContext
    ? t("WILDHARVEST.Dialog.Common.SkillCheck", { skillLabel: initialSkillLabel })
    : t("WILDHARVEST.Dialog.Search.SearchingWith", { skillLabel: initialSkillLabel });
  const initialBaseModifier = getActorSkillModifier(
    selectedActorId ? game.actors.get(selectedActorId) : null,
    initialActivity
  ) ?? 0;

  let submitting = false;
  const dialog = new DialogV2({
    window: {
      title
    },
    content: `
      <div class="wildharvest-dialog wildharvest-player-layout wildharvest-player-layout--roll" data-player-lock-context="${lockContext ? "true" : "false"}">
        ${renderPlayerHero({
          title: heroTitle,
          subtitle: heroSubtitle,
          icon: "fa-solid fa-compass",
          imagePath: PLAYER_UI_ASSETS.roll
        })}
        ${renderActorSection(actors, selectedActorId, selectedContainerId)}
        ${renderContextSection({
          locations,
          location: initialLocation,
          activity: initialActivity,
          lockContext
        })}
        ${renderRollSection({
          baseModifier: initialBaseModifier,
          selectedRollMode: "normal"
        })}
      </div>
    `,
    buttons: [
      {
        action: "submit",
        label: t("WILDHARVEST.Dialog.Search.Submit"),
        icon: "fa-solid fa-magnifying-glass",
        default: true,
        callback: async (event, button, instance) => {
          if (submitting) return;
          submitting = true;
          const submitButton = event?.currentTarget;
          if (submitButton && "disabled" in submitButton) {
            submitButton.disabled = true;
          }

          const resultPosition = { ...(instance?.position ?? {}) };
          const summary = await handleSubmitSafely(
            getDialogForm(instance, button),
            locations,
            { beforeSubmit, onSubmitRequest, dialogPosition: resultPosition }
          );

          if (!summary) {
            submitting = false;
            if (submitButton && "disabled" in submitButton) {
              submitButton.disabled = false;
            }
            return;
          }
          instance?.close?.();
          if (summary.pending) {
            ui.notifications.info(t("WILDHARVEST.Notifications.ResolutionRequested"));
            return;
          }
          openSearchResultDialog(summary, resultPosition);
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Search.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => {
    addWindowClasses(dialog, "wildharvest-window--player", "wildharvest-window--player-roll");
    dialog.setPosition?.(getPlayerDialogPosition());
    focusDialogControl(dialog, [
      "[name='actorId']",
      "[name='extraModifier']",
      "[data-action='submit']",
      ".dialog-buttons button.default"
    ]);
    if (!lockContext) {
      attachListeners(dialog, locations);
      return;
    }

    const form = getDialogForm(dialog);
    if (!form) return;
    form.elements.actorId?.addEventListener("change", () => {
      syncSkillInputs(form, initialLocation, initialActivity);
      syncContainerDestination(form);
    });
    syncSkillInputs(form, initialLocation, initialActivity);
    syncContainerDestination(form);
  }, { once: true });
  dialog.render({ force: true });
}


