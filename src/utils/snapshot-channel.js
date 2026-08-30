export class SnapshotChannel {
  constructor(currentSnapshot) {
    this.currentSnapshot = currentSnapshot;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    const current = this.currentSnapshot();
    if (current) {
      queueMicrotask(() => {
        if (!this.listeners.has(listener)) return;
        try {
          listener(current);
        } catch {
          // A failing subscriber must not surface as an uncaught error.
        }
      });
    }
    return () => this.listeners.delete(listener);
  }

  publish(snapshot) {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // One failing subscriber must not block delivery to the others.
      }
    }
  }
}
