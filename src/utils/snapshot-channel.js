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
        if (this.listeners.has(listener)) listener(current);
      });
    }
    return () => this.listeners.delete(listener);
  }

  publish(snapshot) {
    for (const listener of this.listeners) listener(snapshot);
  }
}
