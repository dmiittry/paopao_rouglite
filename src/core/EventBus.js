// Stable listener order and an explicit event context prevent recursive effect storms.
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.sequence = 0;
    this.depth = 0;
  }
  on(type, sourceId, handler, priority = 0) {
    const entry = { sourceId, handler, priority };
    const list = this.listeners.get(type) || [];
    list.push(entry);
    list.sort(
      (a, b) => a.priority - b.priority || a.sourceId.localeCompare(b.sourceId),
    );
    this.listeners.set(type, list);
    return () =>
      this.listeners.set(
        type,
        list.filter((x) => x !== entry),
      );
  }
  emit(type, payload = {}, parent = null) {
    if (this.depth >= 8) return null;
    const event = {
      id: parent?.id ?? `event-${++this.sequence}`,
      type,
      depth: this.depth,
      seen: parent?.seen ?? new Set(),
    };
    this.depth++;
    try {
      for (const l of this.listeners.get(type) || []) {
        const k = `${event.id}:${type}:${l.sourceId}`;
        if (event.seen.has(k)) continue;
        event.seen.add(k);
        l.handler(payload, event);
      }
    } finally {
      this.depth--;
    }
    return event;
  }
  clear() {
    this.listeners.clear();
  }
}
