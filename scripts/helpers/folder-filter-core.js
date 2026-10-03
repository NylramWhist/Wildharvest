// 1.37.0: compendium folders in a preset. A preset may limit a compendium to some of its folders
// (with their subfolders); a compendium without selected folders is used whole.
// Pure functions: no Foundry globals, so the Node tests can load this file.

const FOLDER_UUID_PATTERN = /^Compendium\.(.+)\.Folder\.([^.]+)$/;

export function getFolderUuidPackId(uuid) {
  const match = FOLDER_UUID_PATTERN.exec(String(uuid ?? "").trim());
  return match ? match[1] : "";
}

export function getFolderUuidDocumentId(uuid) {
  const match = FOLDER_UUID_PATTERN.exec(String(uuid ?? "").trim());
  return match ? match[2] : "";
}

// Unique folder UUIDs ("Compendium.<pack>.Folder.<id>"); with packIds, only folders of those packs.
export function normalizeFolderIds(folderIds, packIds = null) {
  const values = Array.isArray(folderIds) ? folderIds : [folderIds];
  const packs = Array.isArray(packIds) ? new Set(packIds) : null;
  return [...new Set(values
    .map((value) => String(value ?? "").trim())
    .filter((value) => FOLDER_UUID_PATTERN.test(value))
    .filter((value) => !packs || packs.has(getFolderUuidPackId(value))))];
}

// Folder ids of one pack selected in the preset.
export function getPackFolderSelection(folderIds, packId) {
  return normalizeFolderIds(folderIds)
    .filter((uuid) => getFolderUuidPackId(uuid) === packId)
    .map(getFolderUuidDocumentId);
}

// { id, uuid, name, parent, sort } of a compendium's folders (CompendiumCollection#folders). The parent
// falls back to the stored field when Folder#folder does not resolve.
export function getPackFolderRecords(pack) {
  return (pack?.folders?.contents ?? []).map((folder) => ({
    id: folder.id,
    uuid: folder.uuid,
    name: folder.name,
    parent: folder.folder?.id ?? folder._source?.folder ?? null,
    sort: folder.sort ?? 0
  }));
}

// Folder ids a compendium may give loot from, or null when the preset uses it whole. When every
// selected folder of the compendium was deleted the set is empty: nothing from the wrong folders.
export function getAllowedPackFolderIds(folders, folderIds, packId) {
  const selected = getPackFolderSelection(folderIds, packId);
  return selected.length ? expandFolderSelection(folders, selected) : null;
}

// "Parent / Child" names of a folder, from the records of its compendium.
export function getFolderPath(folders, folderId) {
  const byId = new Map((Array.isArray(folders) ? folders : []).map((folder) => [String(folder.id), folder]));
  const names = [];
  const seen = new Set();
  let current = byId.get(String(folderId ?? ""));
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(String(current.name ?? ""));
    current = current.parent ? byId.get(String(current.parent)) : null;
  }
  return names.join(" / ");
}

// The selected folders and every folder below them. `folders` are { id, parent } (parent id or null).
// Selected ids that are not among the folders are left out.
export function expandFolderSelection(folders, selectedIds) {
  const children = new Map();
  const known = new Set();
  for (const folder of Array.isArray(folders) ? folders : []) {
    const id = String(folder?.id ?? "");
    if (!id) continue;
    known.add(id);
    const parent = folder?.parent ? String(folder.parent) : "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(id);
  }
  const allowed = new Set();
  const queue = (Array.isArray(selectedIds) ? selectedIds : []).map(String).filter((id) => known.has(id));
  while (queue.length) {
    const id = queue.shift();
    if (allowed.has(id)) continue;
    allowed.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return allowed;
}

// Index entries kept by the folder selection of their pack (entries are { document } with document.folder).
export function filterEntriesByFolders(entries, allowedFolderIds) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => allowedFolderIds.has(String(entry?.document?.folder ?? "")));
}

// Folders in tree order (parents before children, siblings by sort, then name), with their depth.
// `folders` are { id, name, parent, sort }.
export function orderFolderTree(folders) {
  const list = Array.isArray(folders) ? folders.filter((folder) => folder?.id) : [];
  const ids = new Set(list.map((folder) => String(folder.id)));
  const children = new Map();
  for (const folder of list) {
    const parent = folder.parent && ids.has(String(folder.parent)) ? String(folder.parent) : "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  }
  const compare = (a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0)
    || String(a.name ?? "").localeCompare(String(b.name ?? ""));
  const ordered = [];
  const visit = (parent, depth) => {
    for (const folder of [...(children.get(parent) ?? [])].sort(compare)) {
      ordered.push({ ...folder, depth });
      visit(String(folder.id), depth + 1);
    }
  };
  visit("", 0);
  return ordered;
}
