import { getActivitySkillLabel } from "../helpers/dnd5e-support.js";
import { notifyError } from "../helpers/notification-utils.js";
import { renderModuleTemplate } from "../helpers/templates.js";
import { t } from "../i18n.js";
import {
  addWindowClasses,
  focusDialogControl
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;
// Font Awesome classes (bundled with Foundry).
const PLAYER_OFFER_ICONS = Object.freeze({
  wildharvest: "fa-solid fa-seedling",
  skill: "fa-solid fa-graduation-cap"
});

function renderPlayerOffer(activity) {
  const skillLabel = getActivitySkillLabel(activity) || activity.skillLabel;
  const description = String(activity.description ?? "").trim() || t("WILDHARVEST.Dialog.Offer.ScenePrompt");
  return renderModuleTemplate("wildharvest.playerOffer", {
    prompt: t("WILDHARVEST.Dialog.Offer.Prompt"),
    icons: PLAYER_OFFER_ICONS,
    sceneTitle: t("WILDHARVEST.Dialog.Offer.SceneTitle"),
    activityName: activity.name,
    skillCheck: t("WILDHARVEST.Dialog.Common.SkillCheck", { skillLabel }),
    description
  });
}

async function runOfferAction(action, dialog) {
  if (typeof action !== "function") return;
  // closeOnSubmit is off, so the invitation stays open when the action fails.
  // Errors are caught here because DialogV2 re-enables its buttons only after the callback returns.
  let succeeded = false;
  try {
    succeeded = await action();
  } catch (error) {
    notifyError(error);
  }
  if (succeeded === true) await dialog.close();
}

export function openPlayerSearchOfferDialog({ activity, onAccept, onDecline, onClose }) {
  const dialog = new DialogV2({
    form: { closeOnSubmit: false },
    window: {
      // W-8 (1.32.0): the window says what it is, instead of the module name only.
      title: t("WILDHARVEST.Dialog.Offer.WindowTitle", { activityName: activity.name })
    },
    content: renderPlayerOffer(activity),
    buttons: [
      {
        action: "accept",
        label: t("WILDHARVEST.Dialog.Offer.Accept"),
        icon: "fa-solid fa-magnifying-glass",
        default: true,
        callback: (_event, _button, instance) => runOfferAction(onAccept, instance)
      },
      {
        action: "decline",
        label: t("WILDHARVEST.Dialog.Offer.Decline"),
        callback: (_event, _button, instance) => runOfferAction(onDecline, instance)
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
