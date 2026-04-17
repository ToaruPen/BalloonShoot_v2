interface AudioController {
  startBgm(): Promise<void>;
  stopBgm(): void;
  playShot(): Promise<void>;
  playHit(): Promise<void>;
  playTimeout(): Promise<void>;
  playResult(): Promise<void>;
}

const playOneShot = async (src: string): Promise<void> => {
  const audio = new Audio(src);
  await audio.play();
};

export const createAudioController = (): AudioController => {
  const bgm = new Audio("/audio/bgm.mp3");
  bgm.loop = true;

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
      return playOneShot("/audio/time-up.mp3");
    },
    playResult(): Promise<void> {
      return playOneShot("/audio/result.mp3");
    }
  };
};
