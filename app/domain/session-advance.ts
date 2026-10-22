/** Prevent duplicate completion callbacks within a visit, not across revisits. */
export class SessionAdvanceGuard {
  private lastItem = "";

  claim(sessionId: string, index: number) {
    const item = `${sessionId}:${index}`;
    if (item === this.lastItem) return false;
    this.lastItem = item;
    return true;
  }

  navigated() {
    this.lastItem = "";
  }
}
