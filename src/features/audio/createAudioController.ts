export interface AudioController {
  startBgm(): Promise<void>;
  stopBgm(): void;
  playShot(): Promise<void>;
  playHit(): Promise<void>;
  playTimeout(): Promise<void>;
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

const playOneShotUntilEnded = async (src: string): Promise<void> => {
  const audio = createOneShotAudio(src);

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
    const handleEnded = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error(`Audio playback failed: ${src}`));
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    void audio.play().catch((error: unknown) => {
      cleanup();
      reject(toPlaybackError(error));
    });
  });
};

export const createAudioController = (): AudioController => {
  const bgm = new Audio("/audio/bgm.mp3");
  bgm.loop = true;
  bgm.volume = audioMix.bgmVolume;

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
      return playOneShotUntilEnded("/audio/time-up.mp3");
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
