import { getActivitySkillLabel } from "../helpers/dnd5e-support.js";
import { t } from "../i18n.js";
import {
  addWindowClasses,
  escapeHtml,
  focusDialogControl
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;
const PLAYER_OFFER_ASSETS = Object.freeze({
  wildharvest: "modules/wildharvest/assets/ui/icons/icon-wildharvest.svg",
  skill: "modules/wildharvest/assets/ui/icons/icon-skill.svg"
});

function renderPlayerOfferSummary(activity) {
  const skillLabel = getActivitySkillLabel(activity) || activity.skillLabel;
  const description = String(activity.description ?? "").trim() || t("WILDHARVEST.Dialog.Offer.ScenePrompt");
  return `
    <div class="wildharvest-player-offer-summary">
      <div class="wildharvest-player-hero">
        <div class="wildharvest-player-hero__emblem wildharvest-player-hero__emblem--image">
          <img class="wildharvest-player-hero__asset" src="${escapeHtml(PLAYER_OFFER_ASSETS.wildharvest)}" alt="">
        </div>
        <div class="wildharvest-player-hero__copy">
          <h2>${escapeHtml(t("WILDHARVEST.Dialog.Offer.SceneTitle"))}</h2>
          <p>${escapeHtml(activity.name)}</p>
          <div class="wildharvest-player-hero__divider" aria-hidden="true"></div>
        </div>
      </div>
      <section class="wildharvest-player-card wildharvest-player-card--offer-details">
        <div class="wildharvest-player-section-title">
          <span class="wildharvest-player-section-title__badge">
            <img class="wildharvest-player-section-title__asset" src="${escapeHtml(PLAYER_OFFER_ASSETS.skill)}" alt="">
          </span>
          <span>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Skill"))}</span>
        </div>
        <p class="wildharvest-player-offer__skill-check">${escapeHtml(t("WILDHARVEST.Dialog.Common.SkillCheck", { skillLabel }))}</p>
        <p class="wildharvest-player-copy">${escapeHtml(description)}</p>
      </section>
    </div>
  `;
}

export function openPlayerSearchOfferDialog({ activity, onAccept, onDecline, onClose }) {
  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Title")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-player-layout wildharvest-player-layout--invite">
        <section class="wildharvest-player-copy wildharvest-player-copy--lead">
          ${escapeHtml(t("WILDHARVEST.Dialog.Offer.Prompt"))}
        </section>
        <section class="wildharvest-preview wildharvest-preview--player-offer">
          ${renderPlayerOfferSummary(activity)}
        </section>
      </div>
    `,
    buttons: [
      {
        action: "accept",
        label: t("WILDHARVEST.Dialog.Offer.Accept"),
        icon: "fa-solid fa-magnifying-glass",
        default: true,
        callback: onAccept
      },
      {
        action: "decline",
        label: t("WILDHARVEST.Dialog.Offer.Decline"),
        callback: onDecline
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => {
    addWindowClasses(dialog, "wildharvest-window--player", "wildharvest-window--player-offer");
    focusDialogControl(dialog, ["[data-action='accept']", ".dialog-buttons button.default"]);
  }, { once: true });
  if (typeof onClose === "function") {
    dialog.addEventListener("close", onClose, { once: true });
  }
  dialog.render({ force: true });
  return dialog;
}
