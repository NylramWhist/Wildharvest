import { getDefaultActorId, getAvailableActors } from "../helpers/actor-utils.js";
import { notifyError } from "../helpers/notification-utils.js";
import { getRewardStackText } from "../helpers/reward-utils.js";
import { clearActorSearchLog, getActorSearchLog } from "../helpers/resource-store.js";
import { t } from "../i18n.js";
import {
  bringDialogToFront,
  escapeHtml,
  getDialogForm,
  linkFormLabels
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;

function getRollModeTag(entry) {
  const rollMode = String(entry.rollMode ?? (entry.advantage ? "advantage" : "normal")).trim().toLowerCase();
  if (rollMode === "advantage") return t("WILDHARVEST.Dialog.Search.RollModeAdvantage");
  if (rollMode === "disadvantage") return t("WILDHARVEST.Dialog.Search.RollModeDisadvantage");
  return "";
}

function renderActorOptions(actors, selectedActorId) {
  return actors
    .map((actor) => {
      const selected = actor.id === selectedActorId ? " selected" : "";
      return `<option value="${escapeHtml(actor.id)}"${selected}>${escapeHtml(actor.name)}</option>`;
    })
    .join("");
}

function getSelectedActor(dialog) {
  const form = getDialogForm(dialog);
  if (!form) return null;

  const actorId = String(form.elements.actorId?.value ?? "");
  return actorId ? game.actors.get(actorId) : null;
}

function renderLogTitle(entry) {
  return entry.locationName && entry.locationName !== t("WILDHARVEST.Default.ActivityCatalogName")
    ? `${entry.locationName} / ${entry.activityName}`
    : entry.activityName;
}

function renderSearchHistory(actor) {
  if (!actor) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Resources.NoActor"))}</p>`;
  }

  const log = getActorSearchLog(actor).slice(0, 10);
  if (!log.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Logs.Empty"))}</p>`;
  }

  const items = log
    .map((entry) => {
      const rewards = entry.rewards?.length
        ? entry.rewards.map((reward) => getRewardStackText(reward)).join(", ")
        : t("WILDHARVEST.History.None");
      const lootPoints = Number(entry.lootSummary?.lootPoints ?? 0);
      const lootPointsLine = lootPoints > 0
        ? `<span class="wildharvest-tag">${escapeHtml(t("WILDHARVEST.Dialog.Responses.LootPoints", { lootPoints }))}</span>`
        : "";
      const rollModeTag = getRollModeTag(entry);

      return `
        <article class="wildharvest-card wildharvest-card--compact">
          <div class="wildharvest-card__header">
            <strong>${escapeHtml(renderLogTitle(entry))}</strong>
            <span class="wildharvest-muted">${escapeHtml(entry.timestamp)}</span>
          </div>
          <p class="wildharvest-card__meta">${escapeHtml(t("WILDHARVEST.History.RollLine", {
            rollTotal: entry.rollTotal,
            skillName: entry.skillName
          }))}</p>
          <div class="wildharvest-tag-list">
            ${lootPointsLine}
            ${rollModeTag ? `<span class="wildharvest-tag">${escapeHtml(rollModeTag)}</span>` : ""}
          </div>
          <p class="wildharvest-card__meta">${escapeHtml(t("WILDHARVEST.History.Found", { rewards }))}</p>
        </article>
      `;
    })
    .join("");

  return `
    <p class="hint">${escapeHtml(t("WILDHARVEST.Logs.LatestTen"))}</p>
    <div class="wildharvest-card-grid wildharvest-card-grid--compact">${items}</div>
  `;
}

function refreshContent(dialog, actors) {
  const form = getDialogForm(dialog);
  if (!form) return;

  const actorId = String(form.elements.actorId?.value ?? "");
  const actor = actorId ? game.actors.get(actorId) : null;
  const historyElement = dialog.element.querySelector("[data-history]");

  if (historyElement) historyElement.innerHTML = renderSearchHistory(actor);

  const actorSelect = form.elements.actorId;
  if (actorSelect && !actorSelect.options.length) {
    actorSelect.innerHTML = renderActorOptions(actors, getDefaultActorId(actors));
  }
}

function attachListeners(dialog, actors) {
  linkFormLabels(dialog.element, "resource-log");
  const form = getDialogForm(dialog);
  if (!form) return;

  form.elements.actorId?.addEventListener("change", () => refreshContent(dialog, actors));
  refreshContent(dialog, actors);
}

function openClearLogsConfirmDialog(parentDialog, actors) {
  const actor = getSelectedActor(parentDialog);
  if (!actor) {
    ui.notifications.warn(t("WILDHARVEST.Resources.NoActor"));
    return;
  }

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Logs.ClearTitle")
    },
    content: `
      <div class="wildharvest-dialog">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Logs.ClearPrompt", { actorName: actor.name }))}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.Logs.ClearConfirm"),
        icon: "fa-solid fa-trash",
        default: true,
        callback: async () => {
          try {
            await clearActorSearchLog(actor);
            refreshContent(parentDialog, actors);
            ui.notifications.info(t("WILDHARVEST.Notifications.LogsCleared", { actorName: actor.name }));
            dialog.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(new Error(t("WILDHARVEST.Notifications.LogsClearFailed", { actorName: actor.name })));
          }
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.render({ force: true });
}

export function openResourceLogDialog() {
  const actors = getAvailableActors();
  if (!actors.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoActors"));
    return;
  }

  const selectedActorId = getDefaultActorId(actors);

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Resources.Title")
    },
    content: `
      <div class="wildharvest-dialog">
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.Logs.Actor"))}</label>
          <select name="actorId">
            ${renderActorOptions(actors, selectedActorId)}
          </select>
        </div>
        <section>
          <h3>${escapeHtml(t("WILDHARVEST.Dialog.Logs.Recent"))}</h3>
          <div data-history></div>
        </section>
      </div>
    `,
    buttons: [
      {
        action: "clear",
        label: t("WILDHARVEST.Dialog.Logs.Clear"),
        icon: "fa-solid fa-trash",
        callback: async () => openClearLogsConfirmDialog(dialog, actors)
      },
      {
        action: "close",
        label: t("WILDHARVEST.Dialog.Close"),
        default: true
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => attachListeners(dialog, actors), { once: true });
  dialog.render({ force: true });
}
