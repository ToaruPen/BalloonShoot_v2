export interface TrackEndedPayload {
  readonly trackId: string;
  readonly readyState: MediaStreamTrackState;
  readonly label?: string | undefined;
}

interface TrackEndedObserver {
  stop(): void;
}

type TrackLike = Pick<
  MediaStreamTrack,
  "addEventListener" | "removeEventListener" | "id" | "kind" | "readyState"
> & {
  readonly label?: string;
};

const videoTracksFor = (stream: MediaStream): TrackLike[] => {
  const candidate = stream as Partial<MediaStream>;

  if (typeof candidate.getVideoTracks === "function") {
    return candidate.getVideoTracks() as TrackLike[];
  }

  if (typeof candidate.getTracks === "function") {
    return (candidate.getTracks() as TrackLike[]).filter(
      (track) => track.kind === "video"
    );
  }

  throw new Error("MediaStream does not support getVideoTracks or getTracks");
};

export const observeTrackEnded = (
  stream: MediaStream,
  callback: (payload: TrackEndedPayload) => void
): TrackEndedObserver => {
  const cleanup: (() => void)[] = [];

  for (const track of videoTracksFor(stream)) {
    const handler = (): void => {
      callback({
        trackId: track.id,
        readyState: track.readyState,
        label: track.label
      });
    };

    track.addEventListener("ended", handler);
    cleanup.push(() => {
      track.removeEventListener("ended", handler);
    });
  }

  let stopped = false;

  return {
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;

      for (const fn of cleanup) {
        fn();
      }
    }
  };
};
