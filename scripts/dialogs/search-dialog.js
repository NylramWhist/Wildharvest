import { getDefaultActorId, getAvailableActors } from "../helpers/actor-utils.js";
import { ACTIVITY_CATALOG_LOCATION_ID } from "../helpers/activity-presets.js";
import { MODULE_ID } from "../constants.js";
import { getActivitySkillLabel, getActorSkillModifier } from "../helpers/dnd5e-support.js";
import { getActorContainers, getContainerOptionLabels } from "../helpers/inventory-container-core.js";
import { getRewardDisplayName } from "../helpers/reward-utils.js";
import { addRewardsToActor, appendSearchLogWithRetry } from "../helpers/resource-store.js";
import {
  MAX_PLAYER_EXTRA_MODIFIER,
  normalizePlayerRollPolicy
} from "../helpers/search-authority-core.js";
import { executeSearch, getLootResultMessage } from "../helpers/search-engine.js";
import { getLootResultTone } from "../helpers/search-engine-core.js";
import {
  getFirstLootThreshold,
  getRewardStackValue,
  groupRewardsByType,
  sortRewardsByValue
} from "../helpers/result-view-core.js";
import { notifyError } from "../helpers/notification-utils.js";
import { renderModuleTemplate } from "../helpers/templates.js";
import { formatModuleNumber, t } from "../i18n.js";
import { getChatResultMode, getLocations, getRulesConfig } from "../settings.js";
import { getChatResultItems } from "../helpers/chat-result-core.js";
import {
  addWindowClasses,
  escapeHtml,
  focusDialogControl,
  getDialogForm
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;
// Font Awesome classes (bundled with Foundry) for the player windows.
const PLAYER_UI_ICONS = Object.freeze({
  roll: "fa-solid fa-dice-d20",
  result: "fa-solid fa-box-open",
  rewards: "fa-solid fa-gem",
  completed: "fa-solid fa-circle-check"
});

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getDefaultItemImage() {
  return CONFIG.Item?.documentClass?.DEFAULT_ICON ?? "icons/svg/item-bag.svg";
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

function getContainerOptionsContext(actor, selectedContainerId = "") {
  const containers = getActorContainers(actor);
  const labels = getContainerOptionLabels(actor, containers, (name, count) => (
    t("WILDHARVEST.Dialog.Search.ContainerWithCount", { name, count })
  ));
  return {
    rootSelected: !containers.some((container) => container.id === selectedContainerId),
    mainInventory: t("WILDHARVEST.Dialog.Search.MainInventory"),
    containers: containers.map((container) => ({
      id: container.id,
      label: labels.get(container.id) ?? container.name,
      selected: container.id === selectedContainerId
    }))
  };
}

function renderContainerOptions(actor, selectedContainerId = "") {
  return renderModuleTemplate("wildharvest.containerOptions", getContainerOptionsContext(actor, selectedContainerId));
}

function getResultRewardCount(result) {
  return Math.max(result.rewards.length, Math.trunc(Number(result.rewardCount) || 0));
}

// Name of a dnd5e item type for the result groups (CONFIG.Item.typeLabels holds translation keys).
function getItemTypeLabel(type) {
  if (type === "other") return t("WILDHARVEST.Dialog.Result.GroupOther");
  const key = CONFIG.Item?.typeLabels?.[type];
  return key ? game.i18n.localize(key) : type;
}

// W-10/W-11 (1.33.0): totals, the most valuable stacks first, groups by item type, and for an
// empty result how far the roll was from the first Loot Point.
function getResultItemsContext(result, rewardCount, omittedCount) {
  const sorted = sortRewardsByValue(result.rewards);
  const priced = sorted.some((reward) => getRewardStackValue(reward) !== null);
  const summary = [];
  if (!omittedCount && sorted.length) {
    const quantity = sorted.reduce((sum, reward) => sum + (Number(reward.quantity) || 1), 0);
    summary.push(t("WILDHARVEST.Dialog.Result.SummaryItems", { quantity: formatModuleNumber(quantity) }));
  }
  const totalValue = Number(result.lootSummary?.totalValueGp);
  if (rewardCount && Number.isFinite(totalValue) && totalValue > 0) {
    summary.push(t("WILDHARVEST.Dialog.Result.SummaryValue", { value: formatModuleNumber(totalValue) }));
  }
  const groups = groupRewardsByType(sorted).map((group) => ({
    label: group.type ? getItemTypeLabel(group.type) : "",
    count: String(group.rewards.length),
    rewards: group.rewards.map(getRewardContext)
  }));

  let missingText = "";
  const lootPoints = Number(result.lootSummary?.lootPoints ?? 0);
  const firstThreshold = getFirstLootThreshold(getRulesConfig().lootPointBrackets);
  // 1.35.0: the place's difficulty moves the threshold.
  const threshold = firstThreshold === null ? null : firstThreshold + (Number(result.lootSummary?.difficulty) || 0);
  const rollTotal = Number(result.roll?.total ?? 0);
  if (!rewardCount && lootPoints <= 0 && threshold !== null && rollTotal < threshold) {
    missingText = t("WILDHARVEST.Dialog.Result.MissingForFirstPoint", {
      needed: formatModuleNumber(threshold),
      missing: formatModuleNumber(threshold - rollTotal)
    });
  }

  return {
    summary: summary.join(" · "),
    previewLabel: priced ? t("WILDHARVEST.Dialog.Result.MostValuable") : "",
    previewRewards: sorted.slice(0, 8).map(getRewardContext),
    groups,
    missingText
  };
}

function getRewardContext(reward) {
  return {
    name: getRewardDisplayName(reward),
    img: reward.img || getDefaultItemImage(),
    quantity: String(reward.quantity ?? 1),
    unitValue: reward.unitValueGp !== undefined
      ? t("WILDHARVEST.Dialog.Result.UnitValueGp", { value: formatModuleNumber(reward.unitValueGp) })
      : ""
  };
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
      icon: PLAYER_UI_ICONS.rewards
    };
  }

  // W-10 (1.21.3): with no rewards the item list already says so; no second message.
  if (!rewardCount) return null;

  if (inventoryCount && !fallbackCount) {
    return {
      message: containerName
        ? t("WILDHARVEST.Dialog.Result.InventoryAllContainer", { containerName })
        : t("WILDHARVEST.Dialog.Result.InventoryAll"),
      className: "is-success",
      icon: PLAYER_UI_ICONS.completed
    };
  }

  if (inventoryCount && fallbackCount) {
    return {
      message: containerName
        ? t("WILDHARVEST.Dialog.Result.InventoryPartialContainer", { containerName })
        : t("WILDHARVEST.Dialog.Result.InventoryPartial"),
      className: "is-partial",
      icon: PLAYER_UI_ICONS.completed
    };
  }

  return {
    message: t("WILDHARVEST.Dialog.Result.InventoryFallback", { actorName: actor.name }),
    className: "is-warning",
    icon: PLAYER_UI_ICONS.rewards
  };
}

function getResultToneClass(result) {
  const tone = getLootResultTone(result?.lootSummary?.lootPoints, getRulesConfig().lootPointBrackets);
  return `wildharvest-player-layout--result-${tone}`;
}

function getPlayerDialogPosition(position = {}) {
  const nextPosition = { width: 520 };
  if (Number.isFinite(Number(position?.left))) nextPosition.left = Number(position.left);
  if (Number.isFinite(Number(position?.top))) nextPosition.top = Number(position.top);
  return nextPosition;
}

export function openSearchResultDialog({ actor, activity, result, storageSummary }, position = {}) {
  const rewardCount = getResultRewardCount(result);
  const storageState = buildResultStorageState(actor, storageSummary, rewardCount);
  const rewardsStateClass = rewardCount ? "has-rewards" : "no-rewards";
  const resultToneClass = getResultToneClass(result);

  // Saved history keeps a limited number of rewards; the rest are in the character's inventory.
  const omittedCount = rewardCount - result.rewards.length;
  const items = getResultItemsContext(result, rewardCount, omittedCount);
  const content = renderModuleTemplate("wildharvest.playerResult", {
    toneClass: resultToneClass,
    rewardsStateClass,
    icons: PLAYER_UI_ICONS,
    hero: { title: t("WILDHARVEST.Dialog.Result.Title"), subtitle: activity?.name ?? "", icon: PLAYER_UI_ICONS.result },
    labels: {
      finalResult: t("WILDHARVEST.Dialog.Result.FinalResult"),
      lootPoints: t("WILDHARVEST.Dialog.Result.LootPoints"),
      viewAll: t("WILDHARVEST.Dialog.Result.ViewAll", { count: rewardCount }),
      noItems: t("WILDHARVEST.Dialog.Result.NoItems")
    },
    rollTotal: String(result.roll.total ?? 0),
    lootPoints: String(result.lootSummary?.lootPoints ?? 0),
    // 1.34.0: Loot Points but no items (the GM gave nothing, or nothing fitted the GP target) would
    // otherwise read as a good find above an empty list.
    lootMessage: !rewardCount && Number(result.lootSummary?.lootPoints ?? 0) > 0
      ? t("WILDHARVEST.Dialog.Result.NothingGiven")
      : getLootResultMessage(result.lootSummary ?? { lootPoints: 0 }),
    itemsTitle: { title: t("WILDHARVEST.Dialog.Result.FoundItemsCount", { count: rewardCount }), icon: PLAYER_UI_ICONS.rewards },
    hasRewards: rewardCount > 0 && result.rewards.length > 0,
    ...items,
    omittedText: omittedCount > 0 ? t("WILDHARVEST.Dialog.Result.MoreItems", { count: omittedCount }) : "",
    storage: storageState
  });

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Result.Title")
    },
    content,
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
      ".form-footer button[autofocus]"
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
      rewards: Array.isArray(entry.rewards) ? entry.rewards : [],
      rewardCount: entry.rewardCount
    },
    storageSummary: entry.storageState ?? { inventoryCount: 0, fallbackCount: 0 }
  }, position);
}

// 1.35.0: the result as a chat message (setting "Search result in chat"), after the loot is given.
// ChatMessage.create, getSpeaker and getWhisperRecipients are documented core API.
async function postSearchResultToChat({ actor, activity, result }) {
  const mode = getChatResultMode();
  if (mode === "off" || !actor) return;
  try {
    const { shown, omitted } = getChatResultItems(result.rewards);
    const content = renderModuleTemplate("wildharvest.chatResult", {
      activityName: activity?.name ?? "",
      rollText: t("WILDHARVEST.Chat.Roll", {
        total: formatModuleNumber(Number(result.roll?.total ?? 0)),
        lootPoints: formatModuleNumber(Number(result.lootSummary?.lootPoints ?? 0))
      }),
      items: shown.map((item) => ({ name: item.name, quantity: formatModuleNumber(item.quantity) })),
      moreText: omitted ? t("WILDHARVEST.Chat.More", { count: omitted }) : "",
      // Loot Points but no items: the GM gave nothing in the loot review, or nothing fitted.
      emptyText: Number(result.lootSummary?.lootPoints ?? 0) > 0
        ? t("WILDHARVEST.Chat.NothingGiven")
        : t("WILDHARVEST.Chat.NoItems")
    });
    const messageData = {
      content,
      speaker: ChatMessage.implementation.getSpeaker({ actor })
    };
    if (mode === "gm") {
      messageData.whisper = ChatMessage.implementation.getWhisperRecipients("GM").map((user) => user.id);
    }
    await ChatMessage.implementation.create(messageData);
  } catch (error) {
    // The loot is already given; a failed chat message must not undo or block that.
    console.warn(`${MODULE_ID} | Failed to post the search result to chat.`, error);
  }
}

export async function resolveSearchAsGm({
  actor,
  location,
  activity,
  skillName,
  skillModifier,
  baseSkillModifier = skillModifier,
  extraModifier = 0,
  rollMode,
  containerId = "",
  resolutionId = "",
  allowSystemRoll = true,
  // 1.34.0: called with the rolled result before anything is given; returns the rewards and loot
  // summary to give (the GM may remove items or roll the loot again).
  reviewLoot = null,
  // 1.35.0: a GM's own roll from the Workbench (test roll) is not posted to chat.
  postToChat = true
}) {
  if (!game.user?.isGM) {
    throw new Error(t("WILDHARVEST.Errors.GmResolutionRequired"));
  }

  const result = await executeSearch({
    activity,
    skillName,
    skillModifier,
    rollMode,
    actor: allowSystemRoll ? actor : null,
    extraModifier
  });
  if (typeof reviewLoot === "function") {
    const reviewed = await reviewLoot(result);
    if (reviewed) {
      result.rewards = Array.isArray(reviewed.rewards) ? reviewed.rewards : [];
      result.lootSummary = reviewed.lootSummary ?? result.lootSummary;
      result.lootMessage = getLootResultMessage(result.lootSummary ?? { lootPoints: 0 });
    }
  }
  const normalizedExtraModifier = Number(extraModifier);
  const normalizedFinalModifier = Number(result.modifier ?? skillModifier ?? 0);
  const normalizedBaseModifier = Number(baseSkillModifier);
  const rollAudit = {
    baseSkillModifier: Number.isFinite(normalizedBaseModifier)
      ? normalizedBaseModifier
      : normalizedFinalModifier - (Number.isFinite(normalizedExtraModifier) ? normalizedExtraModifier : 0),
    extraModifier: Number.isFinite(normalizedExtraModifier) ? normalizedExtraModifier : 0,
    finalSkillModifier: normalizedFinalModifier,
    rollMode: result.rollMode ?? rollMode ?? "normal"
  };
  let storageSummary = {
    inventory: [],
    fallback: [],
    containerId: "",
    containerName: ""
  };

  if (actor && result.rewards.length) {
    storageSummary = await addRewardsToActor(actor, result.rewards, { containerId });
  }

  let historyPersisted = false;
  if (actor) {
    try {
      await appendSearchLogWithRetry(actor, {
        ...(resolutionId ? { sessionId: String(resolutionId) } : {}),
        // Presets share one internal location; its name is not a real place (1.21.1).
        locationName: location.id === ACTIVITY_CATALOG_LOCATION_ID ? "" : location.name,
        activityName: activity.name,
        skillName: result.skillName,
        rollTotal: result.roll.total,
        ...rollAudit,
        lootSummary: result.lootSummary ?? null,
        rewards: result.rewards,
        storageState: {
          inventoryCount: storageSummary.inventory.length,
          fallbackCount: storageSummary.fallback.length,
          containerId: storageSummary.containerId ?? "",
          containerName: storageSummary.containerName ?? ""
        },
        // The entry is stored in the compact data version 2 shape (search-history-core.js).
        timestamp: new Date().toISOString()
      });
      historyPersisted = true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to append the GM-authoritative search log.`, error);
      ui.notifications.warn(t("WILDHARVEST.Notifications.HistorySaveFailed"));
    }
  }

  if (postToChat) await postSearchResultToChat({ actor, activity, result });
  ui.notifications.info(t("WILDHARVEST.Notifications.ActionResolved"));
  return {
    actor,
    location,
    activity,
    result,
    storageSummary,
    rollAudit,
    historyPersisted
  };
}

async function handleSubmit(form, locations, {
  beforeSubmit = null,
  onSubmitRequest = null,
  requireActor = false,
  rollPolicy = null,
  dialogPosition = {}
} = {}) {
  if (!form) {
    throw new Error(t("WILDHARVEST.Errors.SearchFormMissing"));
  }

  if (typeof beforeSubmit === "function") {
    await beforeSubmit();
  }

  const formData = Object.fromEntries(new FormData(form).entries());
  const actorId = String(formData.actorId ?? "").trim();
  if (requireActor && !actorId) {
    throw new Error(t("WILDHARVEST.Errors.PlayerCharacterRequired"));
  }
  const extraModifier = Number(formData.extraModifier ?? 0);
  if (!Number.isFinite(extraModifier)) {
    throw new Error(t("WILDHARVEST.Errors.SkillModifierNumber"));
  }
  const rollMode = String(formData.rollMode ?? (form.elements.hasAdvantage?.checked ? "advantage" : "normal")).trim().toLowerCase();
  if (rollPolicy) {
    const normalizedPolicy = normalizePlayerRollPolicy(rollPolicy);
    if (Math.abs(extraModifier) > normalizedPolicy.maxExtraModifier
      || (!normalizedPolicy.allowExtraModifier && extraModifier !== 0)) {
      throw new Error(t("WILDHARVEST.Errors.PlayerExtraModifierInvalid", { max: normalizedPolicy.maxExtraModifier }));
    }
    if (!normalizedPolicy.allowRollModeSelection && rollMode !== "normal") {
      throw new Error(t("WILDHARVEST.Errors.PlayerRollModeLocked"));
    }
  }

  if (typeof onSubmitRequest === "function") {
    const outcome = await onSubmitRequest({
      actorId,
      containerId: String(formData.containerId ?? "").trim(),
      extraModifier,
      rollMode,
      dialogPosition
    });
    return { pending: true, silent: Boolean(outcome?.silent) };
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
  // A GM who typed a different base modifier than the sheet gets the module's own roll with it (1.24.0).
  const sheetModifier = actor ? getActorSkillModifier(actor, effectiveActivity) : null;
  return resolveSearchAsGm({
    allowSystemRoll: sheetModifier !== null && sheetModifier === baseSkillModifier,
    actor,
    location,
    activity: effectiveActivity,
    skillName: String(formData.skillName ?? ""),
    skillModifier: finalSkillModifier,
    baseSkillModifier,
    extraModifier,
    rollMode,
    containerId: String(formData.containerId ?? "").trim(),
    postToChat: false
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

function setSearchCalculationState(dialog, submitButton, active, messageKey) {
  const layout = dialog?.element?.querySelector?.("[data-player-lock-context]");
  const status = layout?.querySelector?.("[data-search-calculation-status]");
  layout?.setAttribute?.("aria-busy", active ? "true" : "false");

  if (status) {
    status.hidden = !active;
    status.textContent = active ? t(messageKey) : "";
  }

  if (!submitButton) return;
  if (active) {
    submitButton.dataset.wildharvestIdleHtml ??= submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHtml(t(messageKey))}`;
    return;
  }

  submitButton.disabled = false;
  submitButton.removeAttribute("aria-busy");
  if (submitButton.dataset.wildharvestIdleHtml) {
    submitButton.innerHTML = submitButton.dataset.wildharvestIdleHtml;
  }
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

function syncSkillInputs(form, location, activity) {
  const actorId = String(form.elements.actorId?.value ?? "");
  const actor = actorId ? game.actors.get(actorId) : null;
  const skillNameInput = form.elements.skillName;
  const skillIdInput = form.elements.skillId;
  const baseModifierInput = form.elements.baseSkillModifier;
  const baseModifierLabel = form.querySelector("[data-base-modifier]");
  const skillLabelOutput = form.querySelector("[data-skill-label]");
  const heroSubtitleOutput = form.querySelector("[data-search-hero-subtitle]");

  const skillLabel = getActivitySkillLabel(activity) || activity.skillLabel || t("WILDHARVEST.Default.SkillLabel");
  const suggestedModifier = getActorSkillModifier(actor, activity);
  const normalizedModifier = suggestedModifier ?? 0;

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
    heroSubtitleOutput.textContent = t("WILDHARVEST.Dialog.Common.SkillCheck", { skillLabel });
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
  const onSubmitRequest = typeof options.onSubmitRequest === "function" ? options.onSubmitRequest : null;
  const requireActor = Boolean(onSubmitRequest);
  // A GM test roll starts on "No character save" so rewards only reach a character on purpose.
  const selectedActorId = options.actorId && actors.some((actor) => actor.id === options.actorId)
    ? options.actorId
    : (!requireActor && options.defaultToNoActor ? "" : getDefaultActorId(actors));
  const selectedContainerId = String(options.containerId ?? "").trim();
  const { location: initialLocation, activity: initialActivity } = getInitialSearchContext(locations, options);
  const title = options.title ?? t("WILDHARVEST.Dialog.Search.Title");
  const beforeSubmit = typeof options.beforeSubmit === "function" ? options.beforeSubmit : null;
  if (requireActor && !actors.length) {
    ui.notifications.warn(t("WILDHARVEST.Errors.PlayerCharacterRequired"));
    return null;
  }
  const rollPolicy = requireActor
    ? normalizePlayerRollPolicy(getRulesConfig().playerRollRules)
    : normalizePlayerRollPolicy({
      allowExtraModifier: true,
      maxExtraModifier: MAX_PLAYER_EXTRA_MODIFIER,
      allowRollModeSelection: true
    });
  const initialSkillLabel = getActivitySkillLabel(initialActivity) || initialActivity.skillLabel || t("WILDHARVEST.Default.SkillLabel");
  const heroTitle = initialActivity.name;
  const heroSubtitle = t("WILDHARVEST.Dialog.Common.SkillCheck", { skillLabel: initialSkillLabel });
  const initialBaseModifier = getActorSkillModifier(
    selectedActorId ? game.actors.get(selectedActorId) : null,
    initialActivity
  ) ?? 0;

  const selectedActor = actors.find((actor) => actor.id === selectedActorId) ?? null;
  // Both callers (Workbench test roll and the player roll window) fix the location and activity in advance.
  const content = renderModuleTemplate("wildharvest.playerRoll", {
    hero: { title: heroTitle, subtitle: heroSubtitle, icon: PLAYER_UI_ICONS.roll },
    rollTitle: { title: t("WILDHARVEST.Dialog.Search.RollSection"), icon: PLAYER_UI_ICONS.roll },
    labels: {
      actor: t("WILDHARVEST.Dialog.Search.Actor"),
      noCharacterSave: t("WILDHARVEST.Dialog.Search.NoCharacterSave"),
      lootDestination: t("WILDHARVEST.Dialog.Search.LootDestination"),
      lootDestinationHint: t("WILDHARVEST.Dialog.Search.LootDestinationHint"),
      baseModifier: t("WILDHARVEST.Dialog.Search.BaseModifier"),
      extraModifier: t("WILDHARVEST.Dialog.Search.ExtraModifier"),
      extraModifierLimit: t("WILDHARVEST.Dialog.Search.ExtraModifierLimit", { max: rollPolicy.maxExtraModifier }),
      extraModifierLocked: t("WILDHARVEST.Dialog.Search.ExtraModifierLocked"),
      rollMode: t("WILDHARVEST.Dialog.Search.RollMode"),
      rollModeLocked: t("WILDHARVEST.Dialog.Search.RollModeLocked")
    },
    allowNoActor: !requireActor,
    // W-9 (1.32.0): a player with one character sees its name instead of a list with one entry.
    singleActor: requireActor && actors.length === 1 ? { id: actors[0].id, name: actors[0].name } : null,
    actors: actors.map((actor) => ({ id: actor.id, name: actor.name, selected: actor.id === selectedActorId })),
    hasContainers: getActorContainers(selectedActor).length > 0,
    containerOptions: getContainerOptionsContext(selectedActor, selectedContainerId),
    context: {
      locationId: initialLocation.id,
      activityId: initialActivity.id,
      skillId: initialActivity.skillId ?? "",
      skillName: getActivitySkillLabel(initialActivity) || initialActivity.skillLabel
    },
    baseModifier: String(initialBaseModifier),
    baseModifierText: formatSigned(initialBaseModifier),
    policy: rollPolicy,
    rollModes: ["normal", "advantage", "disadvantage"].map((mode) => ({
      value: mode,
      label: getRollModeLabel(mode),
      selected: mode === "normal"
    }))
  });

  let submitting = false;
  const dialog = new DialogV2({
    window: {
      title
    },
    // Keep the roll window open when the request fails, so the player can try again.
    form: { closeOnSubmit: false },
    content,
    buttons: [
      {
        action: "submit",
        label: t("WILDHARVEST.Dialog.Search.Submit"),
        icon: "fa-solid fa-magnifying-glass",
        default: true,
        callback: async (event, button, instance) => {
          if (submitting) return;
          submitting = true;
          // Foundry passes the clicked button as the second argument; event.currentTarget is the whole
          // dialog element, and swapping its innerHTML would replace the entire window.
          const submitButton = button;
          const calculationMessageKey = onSubmitRequest
            ? "WILDHARVEST.Dialog.Search.RequestingResolution"
            : "WILDHARVEST.Dialog.Search.CalculatingRewards";
          setSearchCalculationState(instance, submitButton, true, calculationMessageKey);

          const resultPosition = { ...(instance?.position ?? {}) };
          const summary = await handleSubmitSafely(
            getDialogForm(instance, button),
            locations,
            { beforeSubmit, onSubmitRequest, requireActor, rollPolicy, dialogPosition: resultPosition }
          );

          if (!summary) {
            submitting = false;
            setSearchCalculationState(instance, submitButton, false, calculationMessageKey);
            return;
          }
          // Shown before the window closes, so a quick answer from the GM comes after it (1.34.0).
          if (summary.pending && !summary.silent) ui.notifications.info(t("WILDHARVEST.Notifications.ResolutionRequested"));
          await instance?.close?.();
          if (summary.pending) return;
          openSearchResultDialog(summary, resultPosition);
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Search.Cancel"),
        callback: (_event, _button, instance) => instance.close()
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
  return dialog;
}


