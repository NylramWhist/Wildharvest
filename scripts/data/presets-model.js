// World setting "presets" (data version 3, 1.25.0): the list of search presets as a DataModel,
// registered as the setting's type (documented in ClientSettings#register). Foundry validates the
// stored value against this schema; normalizePresetList (helpers/preset-core.js) runs before every save.
const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;

export class WildharvestPresetsData extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      presets: new ArrayField(new SchemaField({
        id: new StringField({ required: true, blank: false }),
        name: new StringField({ required: true, blank: false }),
        description: new StringField({ required: true, blank: true, initial: "" }),
        skillId: new StringField({ required: true, blank: true, initial: "" }),
        packIds: new ArrayField(new StringField({ required: true, blank: false })),
        // 1.37.0: compendium folders (Folder UUIDs); a compendium with selected folders gives only
        // the items in them and their subfolders.
        folderIds: new ArrayField(new StringField({ required: true, blank: false })),
        // 1.35.0: difficulty of the place; added to every Loot Point threshold (negative: easier).
        difficulty: new NumberField({ required: true, integer: true, min: -20, max: 20, initial: 0 }),
        // 1.36.0: roll tables (RollTable UUIDs) and how they give loot: "draw" (one draw per
        // Loot Point, instead of the compendiums) or "pool" (their items join the compendium pool).
        tableIds: new ArrayField(new StringField({ required: true, blank: false })),
        tableMode: new StringField({ required: true, blank: false, choices: ["draw", "pool"], initial: "draw" })
      }))
    };
  }
}
