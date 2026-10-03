// 1.34.0 (package 16): before a player's loot is given, the GM sees it and can remove items,
// roll the loot again for the same roll total, or give nothing.
import { applyLootSelection, getValueToleranceNote, normalizeLootDecision } from "../helpers/loot-review-core.js";
import { getRewardDisplayName } from "../helpers/reward-utils.js";
import { rerollSearchLoot } from "../helpers/search-engine.js";
import { renderModuleTemplate } from "../helpers/templates.js";
import { formatModuleNumber, t } from "../i18n.js";
import { addWindowClasses, focusDialogControl } from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;

function getDefaultItemImage() {
  return CONFIG.Item?.documentClass?.DEFAULT_ICON ?? "icons/svg/item-bag.svg";
}

function getSelectedText(count, total) {
  return t("WILDHARVEST.Dialog.LootReview.Selected", { count, total });
}

function renderReview({ playerName, actorName, activityName, result }) {
  const rewards = Array.isArray(result.rewards) ? result.rewards : [];
  const lootSummary = result.lootSummary ?? {};
  const totalValue = Number(lootSummary.totalValueGp);
  const toleranceNote = getValueToleranceNote(lootSummary);
  return renderModuleTemplate("wildharvest.lootReview", {
    toleranceNote: toleranceNote
      ? t("WILDHARVEST.Dialog.LootReview.OutsideTolerance", {
        total: formatModuleNumber(toleranceNote.total),
        target: formatModuleNumber(toleranceNote.target),
        minimum: formatModuleNumber(toleranceNote.minimum),
        maximum: formatModuleNumber(toleranceNote.maximum)
      })
      : "",
    lead: t("WILDHARVEST.Dialog.LootReview.Lead", {
      player: playerName,
      actor: actorName,
      activity: activityName,
      roll: formatModuleNumber(result.roll?.total ?? 0),
      lootPoints: formatModuleNumber(lootSummary.lootPoints ?? 0)
    }),
    summary: Number.isFinite(totalValue) && totalValue > 0
      ? t("WILDHARVEST.Dialog.Result.SummaryValue", { value: formatModuleNumber(totalValue) })
      : "",
    selectedText: getSelectedText(rewards.length, rewards.length),
    labels: {
      selection: t("WILDHARVEST.Dialog.LootReview.Selection"),
      selectAll: t("WILDHARVEST.Dialog.LootReview.SelectAll"),
      selectNone: t("WILDHARVEST.Dialog.LootReview.SelectNone"),
      noItems: t("WILDHARVEST.Dialog.Result.NoItems"),
      closeHint: t("WILDHARVEST.Dialog.LootReview.CloseHint")
    },
    rewards: rewards.map((reward, index) => ({
      index,
      name: getRewardDisplayName(reward),
      img: reward.img || getDefaultItemImage(),
      quantity: String(reward.quantity ?? 1),
      stackValue: String((Number(reward.unitValueGp) || 0) * (Number(reward.quantity) || 1)),
      unitValue: reward.unitValueGp !== undefined && reward.unitValueGp !== null
        ? t("WILDHARVEST.Dialog.Result.UnitValueGp", { value: formatModuleNumber(reward.unitValueGp) })
        : ""
    }))
  });
}

function getKeptIndexes(element) {
  return [...(element?.querySelectorAll?.("input[name='keep']:checked") ?? [])].map((input) => Number(input.value));
}

// One review window; resolves with { action, keptIndexes }. Closing the window counts as giving the
// items that are ticked at that moment (stated in the window).
function askLootDecision(context) {
  return new Promise((resolve) => {
    const rewardCount = Array.isArray(context.result.rewards) ? context.result.rewards.length : 0;
    let keptIndexes = Array.from({ length: rewardCount }, (_value, index) => index);
    let settled = false;
    const finish = (decision) => {
      if (settled) return;
      settled = true;
      resolve(normalizeLootDecision(decision, rewardCount));
    };

    const dialog = new DialogV2({
      window: {
        title: t("WILDHARVEST.Dialog.LootReview.Title", { player: context.playerName })
      },
      position: { width: 520 },
      content: renderReview(context),
      buttons: [
        {
          action: "approve",
          label: t("WILDHARVEST.Dialog.LootReview.Approve"),
          icon: "fa-solid fa-check",
          default: true,
          callback: (_event, _button, instance) => finish({ action: "approve", keptIndexes: getKeptIndexes(instance.element) })
        },
        {
          action: "reroll",
          label: t("WILDHARVEST.Dialog.LootReview.Reroll"),
          icon: "fa-solid fa-dice",
          callback: () => finish({ action: "reroll" })
        },
        {
          action: "nothing",
          label: t("WILDHARVEST.Dialog.LootReview.Nothing"),
          icon: "fa-solid fa-ban",
          callback: () => finish({ action: "nothing" })
        }
      ],
      rejectClose: false
    });

    dialog.addEventListener("render", () => {
      addWindowClasses(dialog, "wildharvest-window--gm", "wildharvest-window--gm-dialog", "wildharvest-window--loot-review");
      const element = dialog.element;
      const count = element.querySelector("[data-review-count]");
      const summary = element.querySelector("[data-review-summary]");
      const sync = () => {
        keptIndexes = getKeptIndexes(element);
        if (count) count.textContent = getSelectedText(keptIndexes.length, rewardCount);
        if (summary) {
          const value = [...element.querySelectorAll("input[name='keep']:checked")]
            .reduce((sum, input) => sum + (Number(input.dataset.stackValue) || 0), 0);
          summary.textContent = t("WILDHARVEST.Dialog.Result.SummaryValue", { value: formatModuleNumber(value) });
        }
      };
      element.addEventListener("change", (event) => {
        if (event.target?.matches?.("input[name='keep']")) sync();
      });
      element.addEventListener("click", (event) => {
        const mode = event.target?.closest?.("[data-review-select]")?.dataset.reviewSelect;
        if (!mode) return;
        for (const input of element.querySelectorAll("input[name='keep']")) input.checked = mode === "all";
        sync();
      });
      focusDialogControl(dialog, [".form-footer button[autofocus]", "[data-action='approve']"]);
    }, { once: true });
    dialog.addEventListener("close", () => finish({ action: "approve", keptIndexes }), { once: true });
    dialog.render({ force: true });
  });
}

// Loops until the GM gives the loot: a new roll of the loot opens the window again with it.
export async function reviewLootAsGm({ playerName, actorName, activity, result }) {
  let current = { rewards: result.rewards, lootSummary: result.lootSummary };
  for (;;) {
    const decision = await askLootDecision({
      playerName,
      actorName,
      activityName: activity?.name ?? "",
      result: { ...result, ...current }
    });
    if (decision.action === "reroll") {
      // A failed new roll of the loot keeps the loot already shown, so the roll is not lost.
      try {
        current = await rerollSearchLoot(activity, result.roll?.total ?? 0);
      } catch (error) {
        console.warn("wildharvest | Rolling the loot again failed.", error);
        ui.notifications.error(t("WILDHARVEST.Notifications.LootRerollFailed"));
      }
      continue;
    }
    const selection = applyLootSelection(current.rewards, current.lootSummary, decision.keptIndexes);
    return { rewards: selection.rewards, lootSummary: selection.lootSummary, removedCount: selection.removedCount };
  }
}
