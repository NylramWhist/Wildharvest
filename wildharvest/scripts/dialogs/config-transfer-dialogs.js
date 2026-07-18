import { notifyError } from "../helpers/notification-utils.js";
import { t } from "../i18n.js";
import {
  bringDialogToFront,
  escapeHtml,
  focusDialogControl,
  getDialogForm
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;

export function openConfigExportDialog(parentDialog, exportText) {
  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.ExportConfigTitle")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ExportConfigHint"))}</p>
        <textarea class="wildharvest-code" readonly spellcheck="false" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ExportConfig"))}">${escapeHtml(exportText)}</textarea>
      </div>
    `,
    buttons: [
      {
        action: "close",
        label: t("WILDHARVEST.Dialog.Close"),
        default: true
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => {
    focusDialogControl(dialog, "textarea");
  }, { once: true });
  dialog.addEventListener("close", () => bringDialogToFront(parentDialog), { once: true });
  dialog.render({ force: true });
  return dialog;
}

function openConfigImportConfirmDialog(parentDialog, importDialog, rawText, onImport) {
  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigConfirmTitle")
    },
    content: `
      <div class="wildharvest-dialog">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ImportConfigConfirmPrompt"))}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigConfirm"),
        icon: "fa-solid fa-file-import",
        default: true,
        callback: async () => {
          try {
            await onImport(rawText);
            ui.notifications.info(t("WILDHARVEST.Notifications.ConfigImported"));
            dialog.close();
            importDialog?.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigImportFailed");
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

  dialog.addEventListener("close", () => bringDialogToFront(importDialog), { once: true });
  dialog.render({ force: true });
  return dialog;
}

export function openConfigImportDialog(parentDialog, { onImport }) {
  if (typeof onImport !== "function") {
    throw new TypeError("Wildharvest config import requires an onImport callback.");
  }

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigTitle")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ImportConfigHint"))}</p>
        <textarea class="wildharvest-code" name="importConfigJson" spellcheck="false" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ImportConfig"))}" placeholder="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ImportConfigPlaceholder"))}"></textarea>
      </div>
    `,
    buttons: [
      {
        action: "import",
        label: t("WILDHARVEST.Dialog.ControlPanel.ImportConfig"),
        icon: "fa-solid fa-file-import",
        default: true,
        callback: async (_event, button, instance) => {
          try {
            const form = getDialogForm(instance, button) ?? instance.element;
            const textarea = form?.querySelector?.('[name="importConfigJson"]');
            const rawText = String(textarea?.value ?? "").trim();
            if (!rawText) {
              throw new Error(t("WILDHARVEST.Errors.ImportConfigEmpty"));
            }
            openConfigImportConfirmDialog(parentDialog, instance, rawText, onImport);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigImportFailed");
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

  dialog.addEventListener("render", () => {
    focusDialogControl(dialog, '[name="importConfigJson"]');
  }, { once: true });
  dialog.addEventListener("close", () => bringDialogToFront(parentDialog), { once: true });
  dialog.render({ force: true });
  return dialog;
}
