export class FakeTrack {
  readonly id: string;
  readonly kind = "video";
  readonly label: string;
  readyState: MediaStreamTrackState = "live";
  private readonly endedListeners = new Set<EventListener>();

  constructor(id: string, label = id) {
    this.id = id;
    this.label = label;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === "ended") {
      this.endedListeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === "ended") {
      this.endedListeners.delete(listener);
    }
  }

  fireEnded(): void {
    this.readyState = "ended";
    for (const listener of this.endedListeners) {
      listener(new Event("ended"));
    }
  }

  listenerCount(): number {
    return this.endedListeners.size;
  }
}
