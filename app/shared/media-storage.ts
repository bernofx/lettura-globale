

function openImageDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lettura-globale-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeLibraryImage(key: string, image: string) {
  const database = await openImageDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("images", "readwrite");
    transaction.objectStore("images").put(image, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readLibraryImage(key: string) {
  const database = await openImageDatabase();
  const image = await new Promise<string | undefined>((resolve, reject) => {
    const request = database.transaction("images", "readonly").objectStore("images").get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return image;
}

export async function prepareUploadedImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile elaborare l’immagine");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.78);
}

export async function uploadRemoteImage(mediaId: string, image: string) {
  const blob = await fetch(image).then((response) => response.blob());
  const response = await fetch("/api/media", { method: "POST", headers: { "content-type": blob.type || "image/webp", "x-media-id": mediaId }, body: blob });
  if (!response.ok) throw new Error("remote_image_upload_failed");
  return (await response.json()) as { id: string; url: string };
}
