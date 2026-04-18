import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeTrackEnded,
  type TrackEndedPayload
} from "../../../../src/features/camera/observeTrackEnded";
import { FakeTrack } from "../../../helpers/fakeTrack";

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
    const track = new FakeTrack("front-track", "Front <Cam>");
    const callback = vi.fn<(payload: TrackEndedPayload) => void>();

    observeTrackEnded(createStream([track]), callback);
    track.fireEnded();

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0]?.[0].trackId).toBe("front-track");
    expect(callback.mock.calls[0]?.[0].readyState).toBe("ended");
    expect(callback.mock.calls[0]?.[0].label).toBe("Front <Cam>");
  });

  it("detaches listeners when stopped and ignores non-video tracks", () => {
    const videoTrack = new FakeTrack("video-track");
    const audioTrack = new FakeTrack("audio-track", "audio-track", "audio");
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
    const firstTrack = new FakeTrack("front-a");
    const secondTrack = new FakeTrack("front-b");
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
