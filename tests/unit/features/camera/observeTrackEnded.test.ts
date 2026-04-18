import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeTrackEnded,
  type TrackEndedPayload
} from "../../../../src/features/camera/observeTrackEnded";

class FakeTrack {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  readyState: MediaStreamTrackState = "live";
  private readonly listeners = new Set<EventListener>();

  constructor({
    id,
    kind = "video",
    label = ""
  }: {
    readonly id: string;
    readonly kind?: string;
    readonly label?: string;
  }) {
    this.id = id;
    this.kind = kind;
    this.label = label;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === "ended") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === "ended") {
      this.listeners.delete(listener);
    }
  }

  fireEnded(): void {
    this.readyState = "ended";
    for (const listener of this.listeners) {
      listener(new Event("ended"));
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

const createStream = (tracks: readonly FakeTrack[]): MediaStream =>
  ({
    getVideoTracks: vi.fn(() =>
      tracks.filter((track) => track.kind === "video")
    ),
    getTracks: vi.fn(() => [...tracks])
  }) as unknown as MediaStream;

describe("observeTrackEnded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the callback with ended video track details", () => {
    const track = new FakeTrack({ id: "front-track", label: "Front <Cam>" });
    const callback = vi.fn<(payload: TrackEndedPayload) => void>();

    observeTrackEnded(createStream([track]), callback);
    track.fireEnded();

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0]?.[0].trackId).toBe("front-track");
    expect(callback.mock.calls[0]?.[0].readyState).toBe("ended");
    expect(callback.mock.calls[0]?.[0].label).toBe("Front <Cam>");
  });

  it("detaches listeners when stopped and ignores non-video tracks", () => {
    const videoTrack = new FakeTrack({ id: "video-track" });
    const audioTrack = new FakeTrack({ id: "audio-track", kind: "audio" });
    const callback = vi.fn<(payload: TrackEndedPayload) => void>();
    const observer = observeTrackEnded(
      createStream([videoTrack, audioTrack]),
      callback
    );

    expect(videoTrack.listenerCount()).toBe(1);
    expect(audioTrack.listenerCount()).toBe(0);

    observer.stop();
    observer.stop();
    videoTrack.fireEnded();

    expect(videoTrack.listenerCount()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("observes every video track independently", () => {
    const firstTrack = new FakeTrack({ id: "front-a" });
    const secondTrack = new FakeTrack({ id: "front-b" });
    const callback = vi.fn<(payload: TrackEndedPayload) => void>();

    observeTrackEnded(createStream([firstTrack, secondTrack]), callback);
    firstTrack.fireEnded();
    secondTrack.fireEnded();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0]?.[0].trackId).toBe("front-a");
    expect(callback.mock.calls[1]?.[0].trackId).toBe("front-b");
  });

  it("fails fast when the stream exposes no track accessors", () => {
    const stream = {} as MediaStream;

    expect(() => observeTrackEnded(stream, vi.fn())).toThrow(
      "MediaStream does not support getVideoTracks or getTracks"
    );
  });
});
