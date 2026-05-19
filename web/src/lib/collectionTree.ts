import type { CollectionDoc, FolderNode, SavedRequest } from "../types/collection";

export function addRootFolder(doc: CollectionDoc, name: string): CollectionDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const node: FolderNode = {
    id: crypto.randomUUID(),
    name: trimmed,
    folders: [],
    requests: [],
  };
  return { ...doc, folders: [...doc.folders, node] };
}

function insertSubfolder(nodes: FolderNode[], parentId: string, child: FolderNode): FolderNode[] | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === parentId) {
      const out = [...nodes];
      out[i] = { ...node, folders: [...node.folders, child] };
      return out;
    }
    const inner = insertSubfolder(node.folders, parentId, child);
    if (inner) {
      const out = [...nodes];
      out[i] = { ...node, folders: inner };
      return out;
    }
  }
  return null;
}

export function addSubfolder(doc: CollectionDoc, parentId: string, name: string): CollectionDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const child: FolderNode = {
    id: crypto.randomUUID(),
    name: trimmed,
    folders: [],
    requests: [],
  };
  const folders = insertSubfolder(doc.folders, parentId, child);
  if (!folders) return doc;
  return { ...doc, folders };
}

function removeFolderRecursive(nodes: FolderNode[], folderId: string): FolderNode[] {
  return nodes
    .filter((n) => n.id !== folderId)
    .map((n) => ({
      ...n,
      folders: removeFolderRecursive(n.folders, folderId),
    }));
}

export function removeFolder(doc: CollectionDoc, folderId: string): CollectionDoc {
  return { ...doc, folders: removeFolderRecursive(doc.folders, folderId) };
}

function renameInTree(nodes: FolderNode[], folderId: string, newName: string): FolderNode[] {
  const nm = newName.trim();
  return nodes.map((n) => {
    if (n.id === folderId) return { ...n, name: nm || n.name };
    return { ...n, folders: renameInTree(n.folders, folderId, nm) };
  });
}

export function renameFolder(doc: CollectionDoc, folderId: string, newName: string): CollectionDoc {
  return { ...doc, folders: renameInTree(doc.folders, folderId, newName) };
}

function appendRequestToFolder(
  nodes: FolderNode[],
  folderId: string,
  req: SavedRequest
): FolderNode[] | null {
  let found = false;
  const out = nodes.map((node) => {
    if (node.id === folderId) {
      found = true;
      return { ...node, requests: [...node.requests, req] };
    }
    const sub = appendRequestToFolder(node.folders, folderId, req);
    if (sub) {
      found = true;
      return { ...node, folders: sub };
    }
    return node;
  });
  return found ? out : null;
}

/** `folderId === null` — в корень `doc.requests`. */
export function addRequestToTarget(
  doc: CollectionDoc,
  folderId: string | null,
  req: SavedRequest
): CollectionDoc {
  if (folderId === null) {
    return { ...doc, requests: [...doc.requests, req] };
  }
  const folders = appendRequestToFolder(doc.folders, folderId, req);
  if (!folders) return doc;
  return { ...doc, folders };
}

function stripRequestFromFolders(nodes: FolderNode[], reqId: string): FolderNode[] {
  return nodes.map((n) => ({
    ...n,
    requests: n.requests.filter((r) => r.id !== reqId),
    folders: stripRequestFromFolders(n.folders, reqId),
  }));
}

export function removeRequestById(doc: CollectionDoc, reqId: string): CollectionDoc {
  return {
    ...doc,
    requests: doc.requests.filter((r) => r.id !== reqId),
    folders: stripRequestFromFolders(doc.folders, reqId),
  };
}

function renameRequestInFolders(
  nodes: FolderNode[],
  reqId: string,
  newName: string
): FolderNode[] {
  const nm = newName.trim();
  return nodes.map((n) => ({
    ...n,
    requests: n.requests.map((r) => (r.id === reqId ? { ...r, name: nm || r.name } : r)),
    folders: renameRequestInFolders(n.folders, reqId, nm),
  }));
}

export function renameRequestById(doc: CollectionDoc, reqId: string, newName: string): CollectionDoc {
  const nm = newName.trim();
  return {
    ...doc,
    requests: doc.requests.map((r) => (r.id === reqId ? { ...r, name: nm || r.name } : r)),
    folders: renameRequestInFolders(doc.folders, reqId, nm),
  };
}

function updateRequestInFolders(
  nodes: FolderNode[],
  reqId: string,
  patch: Omit<Partial<SavedRequest>, "id" | "name">
): FolderNode[] {
  return nodes.map((n) => ({
    ...n,
    requests: n.requests.map((r) => (r.id === reqId ? { ...r, ...patch } : r)),
    folders: updateRequestInFolders(n.folders, reqId, patch),
  }));
}

export function updateRequestById(
  doc: CollectionDoc,
  reqId: string,
  patch: Omit<Partial<SavedRequest>, "id" | "name">
): CollectionDoc {
  return {
    ...doc,
    requests: doc.requests.map((r) => (r.id === reqId ? { ...r, ...patch } : r)),
    folders: updateRequestInFolders(doc.folders, reqId, patch),
  };
}

/** Проверка, что папка существует в дереве (для сброса выбора при удалении). */
export function folderIdExists(nodes: FolderNode[], folderId: string): boolean {
  for (const n of nodes) {
    if (n.id === folderId) return true;
    if (folderIdExists(n.folders, folderId)) return true;
  }
  return false;
}

function countRequestsInFolders(nodes: FolderNode[]): number {
  let n = 0;
  for (const f of nodes) {
    n += f.requests.length + countRequestsInFolders(f.folders);
  }
  return n;
}

/** Все запросы: корень + дерево папок. */
export function countAllRequests(doc: CollectionDoc): number {
  return doc.requests.length + countRequestsInFolders(doc.folders);
}
