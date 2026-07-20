import {
  buildLocationsFromQuickOptions,
  buildLootPoolsFromQuickOptions,
  buildSampleQuickOptions,
  createUniqueActivityOptionId,
  getItemCompendiums,
  getQuickOptionsFromRawText,
  getQuickOptionValidationIssues,
  getQuickOptionsFromSettings,
  getSkillChoices,
  getSkillLabel,
  sanitizeQuickOptionsForStorage,
  renderCompendiumTags,
  validateQuickOptionDraft
} from "../helpers/activity-presets.js";
import { notifyError } from "../helpers/notification-utils.js";
import { t } from "../i18n.js";
import {
  bringDialogToFront,
  escapeHtml,
  getDialogForm,
  linkFormLabels
} from "./dialog-utils.js";
import {
  openConfigExportDialog,
  openConfigImportDialog
} from "./config-transfer-dialogs.js";
import {
  getModuleConfigExportData,
  getLocationsText,
  getLootPoolsText,
  importModuleConfigFromText,
  parseLocationsFromText,
  parseLootPoolsFromText,
  saveLocationsFromText,
  saveLootPoolsFromText,
  serializeLocations,
  serializeLootPools
} from "../settings.js";

const DialogV2 = foundry.applications.api.DialogV2;

function getQuickOptionsFromParentDialog(parentDialog) {
  const form = getDialogForm(parentDialog);
  const rawLocationsText = form?.elements?.locationsJson?.value ?? getLocationsText();
  const rawLootPoolsText = form?.elements?.lootPoolsJson?.value ?? getLootPoolsText();
  return getQuickOptionsFromRawText(rawLocationsText, rawLootPoolsText);
}

function renderQuickOptionsSummary(quickOptions) {
  if (!quickOptions.length) return t("WILDHARVEST.Dialog.Activities.Empty");

  return quickOptions
    .map((option) => option.name)
    .join(", ");
}

function renderQuickOptionPreviewMarkup(quickOptions) {
  if (!quickOptions.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Activities.Empty"))}</p>`;
  }

  return quickOptions
    .map((option) => `
      <article class="wildharvest-card wildharvest-card--compact">
        <div class="wildharvest-card__header">
          <strong>${escapeHtml(option.name)}</strong>
        </div>
        <p class="wildharvest-card__meta">${escapeHtml(getSkillLabel(option.skillId))}</p>
        ${option.description ? `<p class="wildharvest-card__meta">${escapeHtml(option.description)}</p>` : ""}
        <div class="wildharvest-tag-list">
          ${renderCompendiumTags(option.packIds)}
        </div>
      </article>
    `)
    .join("");
}

function getQuickOptionValidationState(quickOptions) {
  const normalizedQuickOptions = Array.isArray(quickOptions) ? quickOptions : [];
  const invalidEntries = normalizedQuickOptions
    .map((option) => ({
      option,
      issues: getQuickOptionValidationIssues(option).map((key) => t(key))
    }))
    .filter((entry) => entry.issues.length);

  return {
    totalCount: normalizedQuickOptions.length,
    validCount: normalizedQuickOptions.length - invalidEntries.length,
    invalidCount: invalidEntries.length,
    invalidEntries
  };
}

function renderValidationSummaryMarkup(quickOptions) {
  const validationState = getQuickOptionValidationState(quickOptions);

  return `
    <section class="wildharvest-preview__block">
      <div class="wildharvest-section-header">
        <div class="wildharvest-section-header__copy">
          <strong>${escapeHtml(t("WILDHARVEST.Dialog.Config.ValidationTitle"))}</strong>
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.Config.ValidationHint"))}</p>
        </div>
        <div class="wildharvest-inline-actions">
          <span class="wildharvest-tag">${escapeHtml(t("WILDHARVEST.Dialog.Config.ValidationReady", { count: validationState.validCount }))}</span>
          <span class="wildharvest-tag">${escapeHtml(t("WILDHARVEST.Dialog.Config.ValidationNeedsAttention", { count: validationState.invalidCount }))}</span>
        </div>
      </div>
      ${validationState.invalidEntries.length
        ? `
          <div class="wildharvest-card-grid wildharvest-card-grid--compact">
            ${validationState.invalidEntries.map(({ option, issues }) => `
              <article class="wildharvest-card wildharvest-card--compact">
                <div class="wildharvest-card__header">
                  <strong>${escapeHtml(option.name || option.id || t("WILDHARVEST.Reward.Unnamed"))}</strong>
                </div>
                <ul class="wildharvest-validation-list">
                  ${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
                </ul>
              </article>
            `).join("")}
          </div>
        `
        : `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Config.ValidationAllGood"))}</p>`}
    </section>
  `;
}

function refreshConfigDialogPreview(parentDialog, quickOptions) {
  const normalizedQuickOptions = sanitizeQuickOptionsForStorage(quickOptions);
  const form = getDialogForm(parentDialog);
  const locations = buildLocationsFromQuickOptions(normalizedQuickOptions);
  const lootPools = buildLootPoolsFromQuickOptions(normalizedQuickOptions);

  if (form?.elements?.locationsJson) {
    form.elements.locationsJson.value = serializeLocations(locations);
  }

  if (form?.elements?.lootPoolsJson) {
    form.elements.lootPoolsJson.value = serializeLootPools(lootPools);
  }

  const summary = parentDialog?.element?.querySelector?.("[data-activities-summary]");
  if (summary) {
    summary.textContent = renderQuickOptionsSummary(normalizedQuickOptions);
  }

  const preview = parentDialog?.element?.querySelector?.("[data-quick-options-preview]");
  if (preview) {
    preview.innerHTML = renderQuickOptionPreviewMarkup(normalizedQuickOptions);
  }

  const validation = parentDialog?.element?.querySelector?.("[data-validation-summary]");
  if (validation) {
    validation.innerHTML = renderValidationSummaryMarkup(normalizedQuickOptions);
  }
}

function setQuickOptionsOnParentDialog(parentDialog, quickOptions) {
  refreshConfigDialogPreview(parentDialog, quickOptions);
}

function renderQuickOptionManagerRows(quickOptions) {
  if (!quickOptions.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Activities.Empty"))}</p>`;
  }

  return `
    <table class="wildharvest-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("WILDHARVEST.Table.Name"))}</th>
          <th>${escapeHtml(t("WILDHARVEST.Table.Skill"))}</th>
          <th>${escapeHtml(t("WILDHARVEST.Table.Compendiums"))}</th>
          <th>${escapeHtml(t("WILDHARVEST.Table.Actions"))}</th>
        </tr>
      </thead>
      <tbody>
        ${quickOptions.map((option) => `
          <tr>
            <td>
              <strong>${escapeHtml(option.name)}</strong>
              <br>
              <span class="wildharvest-muted">${escapeHtml(option.id)}</span>
            </td>
            <td>${escapeHtml(getSkillLabel(option.skillId))}</td>
            <td>
              <div class="wildharvest-tag-list">
                ${renderCompendiumTags(option.packIds)}
              </div>
            </td>
            <td class="wildharvest-table__actions">
              <div class="wildharvest-inline-actions">
                <button type="button" class="button button--small" data-action="edit-activity" data-activity-id="${escapeHtml(option.id)}">${escapeHtml(t("WILDHARVEST.Dialog.Activities.Edit"))}</button>
                <button type="button" class="button button--small" data-action="delete-activity" data-activity-id="${escapeHtml(option.id)}">${escapeHtml(t("WILDHARVEST.Dialog.Activities.Delete"))}</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSkillOptions(selectedSkillId = "") {
  return getSkillChoices()
    .map((choice) => {
      const selected = choice.id === selectedSkillId ? " selected" : "";
      return `<option value="${escapeHtml(choice.id)}"${selected}>${escapeHtml(choice.label)}</option>`;
    })
    .join("");
}

function renderCompendiumSelectionRows(selectedPackIds) {
  const selected = new Set(selectedPackIds);
  const compendiums = getItemCompendiums();

  if (!compendiums.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Compendiums.Empty"))}</p>`;
  }

  return `
    <table class="wildharvest-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("WILDHARVEST.Table.Use"))}</th>
          <th>${escapeHtml(t("WILDHARVEST.Table.Name"))}</th>
          <th>${escapeHtml(t("WILDHARVEST.Table.PackId"))}</th>
        </tr>
      </thead>
      <tbody>
        ${compendiums.map((pack) => `
          <tr>
            <td class="wildharvest-table__control">
              <input
                type="checkbox"
                name="activityPackId"
                value="${escapeHtml(pack.id)}"
                aria-label="${escapeHtml(`${t("WILDHARVEST.Table.Use")}: ${pack.name}`)}"
                ${selected.has(pack.id) ? "checked" : ""}
              >
            </td>
            <td>${escapeHtml(pack.name)}</td>
            <td>${escapeHtml(pack.id)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openQuickOptionEditorDialog({ parentDialog, quickOption = null, quickOptions = [], onSave }) {
  const initialSkillId = String(quickOption?.skillId ?? getSkillChoices()[0]?.id ?? "").trim().toLowerCase();
  const initialPackIds = Array.isArray(quickOption?.packIds) ? quickOption.packIds : [];

  const dialog = new DialogV2({
    window: {
      title: quickOption ? t("WILDHARVEST.Dialog.ActivityEditor.EditTitle") : t("WILDHARVEST.Dialog.ActivityEditor.CreateTitle")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Name"))}</label>
          <input type="text" name="activityName" value="${escapeHtml(quickOption?.name ?? "")}">
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.NameHint"))}</p>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Skill"))}</label>
          <select name="skillId">
            ${renderSkillOptions(initialSkillId)}
          </select>
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.SkillHint"))}</p>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Description"))}</label>
          <textarea name="activityDescription" rows="4">${escapeHtml(quickOption?.description ?? "")}</textarea>
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.DescriptionHint"))}</p>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Compendiums"))}</label>
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.CompendiumsHint"))}</p>
        </div>
        ${renderCompendiumSelectionRows(initialPackIds)}
      </div>
    `,
    buttons: [
      {
        action: "save",
        label: t("WILDHARVEST.Dialog.Config.Save"),
        icon: "fa-solid fa-save",
        default: true,
        callback: async (_event, button, instance) => {
          try {
            const form = getDialogForm(instance, button);
            const name = String(form?.elements?.activityName?.value ?? "").trim();
            if (!name) throw new Error(t("WILDHARVEST.Errors.ActivityNameRequiredSimple"));

            const skillId = String(form?.elements?.skillId?.value ?? "").trim().toLowerCase();
            if (!skillId) throw new Error(t("WILDHARVEST.Errors.ActivitySkillRequired"));

            const packIds = Array.from(instance.element?.querySelectorAll?.('[name="activityPackId"]:checked') ?? [])
              .map((input) => String(input?.value ?? "").trim())
              .filter(Boolean);

            const id = createUniqueActivityOptionId(name, quickOptions, quickOption?.id ?? "");
            onSave(validateQuickOptionDraft({
              id,
              name,
              description: String(form?.elements?.activityDescription?.value ?? "").trim(),
              skillId,
              lootPoolId: quickOption?.lootPoolId ?? id,
              packIds
            }));
            instance.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigSaveFailed");
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

  dialog.addEventListener("render", () => linkFormLabels(dialog.element, "activity-editor"), { once: true });
  dialog.render({ force: true });
}

function openQuickOptionManagerDialog(parentDialog) {
  let workingQuickOptions = getQuickOptionsFromParentDialog(parentDialog);

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Activities.Title")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Activities.Description"))}</p>
        <div class="wildharvest-inline-actions">
          <button type="button" class="button" data-action="create-activity">${escapeHtml(t("WILDHARVEST.Dialog.Activities.Create"))}</button>
        </div>
        <div data-activity-manager-list>
          ${renderQuickOptionManagerRows(workingQuickOptions)}
        </div>
      </div>
    `,
    buttons: [
      {
        action: "save",
        label: t("WILDHARVEST.Dialog.Activities.Apply"),
        icon: "fa-solid fa-check",
        default: true,
        callback: async () => {
          setQuickOptionsOnParentDialog(parentDialog, workingQuickOptions);
          dialog.close();
          bringDialogToFront(parentDialog);
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  function refreshManagerList() {
    const container = dialog.element?.querySelector?.("[data-activity-manager-list]");
    if (container) {
      container.innerHTML = renderQuickOptionManagerRows(workingQuickOptions);
    }
  }

  dialog.addEventListener("render", () => {
    linkFormLabels(dialog.element, "activity-manager");
    dialog.element?.addEventListener("click", (event) => {
      const actionButton = event.target?.closest?.("[data-action]");
      if (!actionButton) return;

      const action = actionButton.dataset.action;
      const activityId = String(actionButton.dataset.activityId ?? "").trim();

      if (action === "create-activity") {
        openQuickOptionEditorDialog({
          parentDialog: dialog,
          quickOptions: workingQuickOptions,
          onSave: (nextQuickOption) => {
            workingQuickOptions = [...workingQuickOptions, nextQuickOption];
            refreshManagerList();
          }
        });
        return;
      }

      if (action === "edit-activity") {
        const currentQuickOption = workingQuickOptions.find((entry) => entry.id === activityId);
        if (!currentQuickOption) return;

        openQuickOptionEditorDialog({
          parentDialog: dialog,
          quickOption: currentQuickOption,
          quickOptions: workingQuickOptions,
          onSave: (nextQuickOption) => {
            workingQuickOptions = workingQuickOptions.map((entry) => entry.id === currentQuickOption.id ? nextQuickOption : entry);
            refreshManagerList();
          }
        });
        return;
      }

      if (action === "delete-activity") {
        workingQuickOptions = workingQuickOptions.filter((entry) => entry.id !== activityId);
        refreshManagerList();
      }
    });
  }, { once: true });

  dialog.render({ force: true });
}

function openResetSampleConfirmDialog(parentDialog) {
  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Config.ResetActivitySampleTitle")
    },
    content: `
      <div class="wildharvest-dialog">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Config.ResetActivitySamplePrompt"))}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.Config.ResetActivitySampleConfirm"),
        icon: "fa-solid fa-rotate-left",
        default: true,
        callback: () => {
          setQuickOptionsOnParentDialog(parentDialog, buildSampleQuickOptions());
          dialog.close();
          bringDialogToFront(parentDialog);
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

function openExportConfigDialog(parentDialog) {
  const form = getDialogForm(parentDialog);
  const rawLocationsText = form?.elements?.locationsJson?.value ?? getLocationsText();
  const rawLootPoolsText = form?.elements?.lootPoolsJson?.value ?? getLootPoolsText();
  const baseExportData = getModuleConfigExportData();
  const exportText = JSON.stringify({
    ...baseExportData,
    locations: parseLocationsFromText(rawLocationsText),
    lootPools: parseLootPoolsFromText(rawLootPoolsText)
  }, null, 2);

  openConfigExportDialog(parentDialog, exportText);
}

function openImportConfigDialog(parentDialog) {
  openConfigImportDialog(parentDialog, {
    onImport: async (rawText) => {
      await importModuleConfigFromText(rawText);
      setQuickOptionsOnParentDialog(parentDialog, getQuickOptionsFromSettings());
    }
  });
}

async function saveConfig(form) {
  if (!form) {
    throw new Error(t("WILDHARVEST.Errors.ConfigFormMissing"));
  }

  const locationsTextarea = form?.elements?.locationsJson;
  const lootPoolsTextarea = form?.elements?.lootPoolsJson;
  const normalizedLocations = parseLocationsFromText(locationsTextarea?.value ?? "[]");
  const normalizedLootPools = parseLootPoolsFromText(lootPoolsTextarea?.value ?? "[]");

  await saveLootPoolsFromText(serializeLootPools(normalizedLootPools));
  await saveLocationsFromText(serializeLocations(normalizedLocations));
  ui.notifications.info(t("WILDHARVEST.Notifications.ConfigSaved"));
}

async function saveConfigSafely(form) {
  try {
    await saveConfig(form);
  } catch (error) {
    notifyError(error, "WILDHARVEST.Notifications.ConfigSaveFailed");
  }
}

function attachDialogListeners(dialog) {
  linkFormLabels(dialog.element, "gm-config");
  const form = getDialogForm(dialog);
  const locationsTextarea = form?.elements?.locationsJson;
  const lootPoolsTextarea = form?.elements?.lootPoolsJson;
  if (!locationsTextarea || !lootPoolsTextarea) return;

  const manageActivitiesButton = dialog.element.querySelector('[data-action="manage-activities"]');
  const loadSampleButton = dialog.element.querySelector('[data-action="load-activity-sample"]');
  const exportButton = dialog.element.querySelector('[data-action="export-config"]');
  const importButton = dialog.element.querySelector('[data-action="import-config"]');

  manageActivitiesButton?.addEventListener("click", () => openQuickOptionManagerDialog(dialog));
  loadSampleButton?.addEventListener("click", () => {
    openResetSampleConfirmDialog(dialog);
  });
  exportButton?.addEventListener("click", () => {
    try {
      openExportConfigDialog(dialog);
    } catch (error) {
      notifyError(error, "WILDHARVEST.Notifications.ConfigSaveFailed");
    }
  });
  importButton?.addEventListener("click", () => openImportConfigDialog(dialog));
}

export function openGmConfigDialog() {
  if (!game.user.isGM) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.GmOnlyConfig"));
    return;
  }

  const quickOptions = getQuickOptionsFromRawText(getLocationsText(), getLootPoolsText());

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Config.Title")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Config.Description"))}</p>
        <div class="wildharvest-summary-row">
          <p class="hint"><strong>${escapeHtml(t("WILDHARVEST.Dialog.Config.ActivitiesSummary"))}:</strong> <span data-activities-summary>${escapeHtml(renderQuickOptionsSummary(quickOptions))}</span></p>
          <div class="wildharvest-inline-actions wildharvest-inline-actions--end">
            <button type="button" class="button button--small" data-action="export-config">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ExportConfig"))}</button>
            <button type="button" class="button button--small" data-action="import-config">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ImportConfig"))}</button>
          </div>
        </div>

        <section class="wildharvest-preview__block">
          <div class="wildharvest-section-header">
            <div class="wildharvest-section-header__copy">
              <strong>${escapeHtml(t("WILDHARVEST.Dialog.Config.ActivitiesTitle"))}</strong>
              <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.Config.ActivitiesHint"))}</p>
            </div>
            <div class="wildharvest-inline-actions wildharvest-inline-actions--end">
              <button type="button" class="button button--small" data-action="manage-activities">${escapeHtml(t("WILDHARVEST.Dialog.Config.ManageActivities"))}</button>
              <button type="button" class="button button--small" data-action="load-activity-sample">${escapeHtml(t("WILDHARVEST.Dialog.Config.LoadActivitySample"))}</button>
            </div>
          </div>
          <div class="wildharvest-card-grid wildharvest-card-grid--compact" data-quick-options-preview>
            ${renderQuickOptionPreviewMarkup(quickOptions)}
          </div>
        </section>

        <div data-validation-summary>
          ${renderValidationSummaryMarkup(quickOptions)}
        </div>

        <textarea
          name="locationsJson"
          class="wildharvest-code"
          hidden
          spellcheck="false"
        >${escapeHtml(serializeLocations(buildLocationsFromQuickOptions(quickOptions)))}</textarea>
        <textarea
          name="lootPoolsJson"
          class="wildharvest-code"
          hidden
          spellcheck="false"
        >${escapeHtml(serializeLootPools(buildLootPoolsFromQuickOptions(quickOptions)))}</textarea>
      </div>
    `,
    buttons: [
      {
        action: "save",
        label: t("WILDHARVEST.Dialog.Config.Save"),
        icon: "fa-solid fa-save",
        default: true,
        callback: async (_event, button, instance) => saveConfigSafely(getDialogForm(instance, button))
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => attachDialogListeners(dialog), { once: true });
  dialog.render({ force: true });
}
