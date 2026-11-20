import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/lib/tauri";

export interface CreatedSticker {
  id: string;
  name: string;
  path?: string;
  createdAt?: number;
}

let browserStorage: Promise<IDBDatabase> | undefined;

function openBrowserLibrary() {
  if (!browserStorage) {
    browserStorage = new Promise((resolve, reject) => {
      const request = indexedDB.open("deskpet-created-stickers", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore("stickers", { keyPath: "id" });
        database.createObjectStore("images");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return browserStorage;
}

function read<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listCreatedStickers(): Promise<CreatedSticker[]> {
  if (inTauri) return invoke("list_created_stickers");
  const database = await openBrowserLibrary();
  const records: CreatedSticker[] = await read(database.transaction("stickers").objectStore("stickers").getAll());
  return records.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function saveCreatedSticker(name: string, image: Blob): Promise<CreatedSticker> {
  if (inTauri) {
    const label = new TextEncoder().encode(name);
    const body = new Uint8Array(2 + label.length + image.size);
    new DataView(body.buffer).setUint16(0, label.length, true);
    body.set(label, 2);
    body.set(new Uint8Array(await image.arrayBuffer()), 2 + label.length);
    return invoke("save_created_sticker", body);
  }
  const database = await openBrowserLibrary();
  const sticker = { id: "created-" + crypto.randomUUID(), name, createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["stickers", "images"], "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore("stickers").add(sticker);
    transaction.objectStore("images").add(image, sticker.id);
  });
  return sticker;
}

export function nativeStickerUrl(path: string) {
  return convertFileSrc(path);
}

export async function deleteCreatedSticker(id: string): Promise<void> {
  if (inTauri) {
    await invoke("delete_created_sticker", { id });
    return;
  }
  const database = await openBrowserLibrary();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["stickers", "images"], "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore("stickers").delete(id);
    transaction.objectStore("images").delete(id);
  });
}

export async function readCreatedImage(id: string): Promise<Blob | undefined> {
  const database = await openBrowserLibrary();
  return read(database.transaction("images").objectStore("images").get(id));
}
