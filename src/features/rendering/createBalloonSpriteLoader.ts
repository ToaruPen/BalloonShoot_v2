interface BalloonSpriteLoaderOptions<TSprites> {
  readonly load: () => Promise<TSprites>;
  readonly onLoaded: (sprites: TSprites) => void;
  readonly onError: (error: unknown) => void;
}

interface BalloonSpriteLoader {
  readonly ensureStarted: () => void;
}

export const createBalloonSpriteLoader = <TSprites>(
  options: BalloonSpriteLoaderOptions<TSprites>
): BalloonSpriteLoader => {
  let started = false;
  let loaded = false;

  return {
    ensureStarted() {
      if (started || loaded) {
        return;
      }

      started = true;
      void Promise.resolve()
        .then(() => options.load())
        .then((sprites) => {
          loaded = true;
          options.onLoaded(sprites);
        })
        .catch((error: unknown) => {
          started = false;
          options.onError(error);
        });
    }
  };
};
