/** Flush the debounce/serial queue before asking the server for a snapshot. */
export async function prepareCloudShare(flush: () => Promise<void>, hasPendingChanges: () => boolean, revision: () => number) {
  await flush();
  if (hasPendingChanges()) throw new Error("share_sync_pending");
  return revision();
}

export function cloudSaveCanSettle(queuedWrites: number, hasTimer: boolean, hasChanges: boolean) {
  return queuedWrites === 0 && !hasTimer && !hasChanges;
}
