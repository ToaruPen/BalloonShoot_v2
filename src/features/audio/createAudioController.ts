export interface AudioController {
  startBgm(): Promise<void>;
  stopBgm(): void;
  playShot(): Promise<void>;
  playHit(): Promise<void>;
  playTimeout(): Promise<void>;
  cancelTimeout(): void;
  playResult(): Promise<void>;
  duckBgm(volume?: number): void;
  restoreBgmVolume(): void;
}

const audioMix = {
  bgmVolume: 0.13,
  duckedBgmVolume: 0.07,
  sfxVolume: 0.5
} as const;

const toPlaybackError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const createOneShotAudio = (src: string): HTMLAudioElement => {
  const audio = new Audio(src);
  audio.volume = audioMix.sfxVolume;

  return audio;
};

const playOneShot = async (src: string): Promise<void> => {
  await createOneShotAudio(src).play();
};

interface OneShotPlayback {
  readonly promise: Promise<void>;
  cancel(): void;
}

const createOneShotUntilEndedPlayback = (src: string): OneShotPlayback => {
  const audio = createOneShotAudio(src);
  let resolvePlayback: () => void = () => undefined;
  let rejectPlayback: (error: Error) => void = () => undefined;
  let settled = false;

  const cleanup = (): void => {
    audio.removeEventListener("ended", handleEnded);
    audio.removeEventListener("error", handleError);
  };
  const resolveOnce = (): void => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    resolvePlayback();
  };
  const rejectOnce = (error: Error): void => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    rejectPlayback(error);
  };
  function handleEnded(): void {
    resolveOnce();
  }
  function handleError(): void {
    rejectOnce(new Error(`Audio playback failed: ${src}`));
  }

  const promise = new Promise<void>((resolve, reject) => {
    resolvePlayback = resolve;
    rejectPlayback = reject;
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    void audio.play().catch((error: unknown) => {
      rejectOnce(toPlaybackError(error));
    });
  });

  return {
    promise,
    cancel(): void {
      audio.pause();
      audio.currentTime = 0;
      resolveOnce();
    }
  };
};

export const createAudioController = (): AudioController => {
  const bgm = new Audio("/audio/bgm.mp3");
  bgm.loop = true;
  bgm.volume = audioMix.bgmVolume;
  let activeTimeoutPlayback: OneShotPlayback | undefined;

  return {
    async startBgm(): Promise<void> {
      await bgm.play();
    },
    stopBgm(): void {
      bgm.pause();
      bgm.currentTime = 0;
    },
    playShot(): Promise<void> {
      return playOneShot("/audio/shot.mp3");
    },
    playHit(): Promise<void> {
      return playOneShot("/audio/hit.mp3");
    },
    playTimeout(): Promise<void> {
      activeTimeoutPlayback?.cancel();
      const playback = createOneShotUntilEndedPlayback("/audio/time-up.mp3");
      activeTimeoutPlayback = playback;

      return playback.promise.finally(() => {
        if (activeTimeoutPlayback === playback) {
          activeTimeoutPlayback = undefined;
        }
      });
    },
    cancelTimeout(): void {
      activeTimeoutPlayback?.cancel();
      activeTimeoutPlayback = undefined;
    },
    playResult(): Promise<void> {
      return playOneShot("/audio/result.mp3");
    },
    duckBgm(volume = audioMix.duckedBgmVolume): void {
      bgm.volume = volume;
    },
    restoreBgmVolume(): void {
      bgm.volume = audioMix.bgmVolume;
    }
  };
};
