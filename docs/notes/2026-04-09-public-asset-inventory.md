# Public Asset Inventory

作成日: 2026-04-09

## Purpose

`BalloonShoot` PoC で使う無料公開アセットを、`CC0 / public domain / attribution not required` を優先して収集した記録。

## Policy

- 優先条件は `CC0` または `public domain`
- ランタイムで使う最小ファイルは `public/` に配置
- 元素材と取得物は `src/assets/` に保持
- このメモは 2026-04-09 時点の取得元と用途を記録する

## Runtime Audio

| Runtime path | Source asset | Intended use | License | Source page |
| --- | --- | --- | --- | --- |
| `public/audio/bgm.mp3` | `src/assets/audio/childrens-march-theme.mp3` | プレイ中 BGM | CC0 | https://opengameart.org/content/childrens-march-theme |
| `public/audio/shot.mp3` | `src/assets/audio/laserpew.ogg` | 射撃 SE | CC0 | https://opengameart.org/content/pew-laser-fire-sound |
| `public/audio/hit.mp3` | `src/assets/audio/balloon-pop.ogg` | 命中 SE | CC0 | https://opengameart.org/content/balloon-sounds |
| `public/audio/time-up.mp3` | `src/assets/audio/alarm-time-up.wav` | タイムアップ SE | CC0 | https://opengameart.org/content/alarm-sound-effect |
| `public/audio/result.mp3` | `src/assets/audio/completion-result.mp3` | 結果画面 SE | CC0 | https://opengameart.org/content/completion-sound |
| `public/audio/spawn.mp3` | `src/assets/audio/balloon-inflate.ogg` | 将来の風船出現 SE 候補 | CC0 | https://opengameart.org/content/balloon-sounds |

## Image Assets

| Local path | Asset type | Intended use | License | Source page |
| --- | --- | --- | --- | --- |
| `src/assets/images/foil-balloon.png` | 128x128 balloon icon | 風船テクスチャ参照 | CC0 | https://opengameart.org/content/foil-balloon |
| `public/images/balloons/foil-balloon.png` | runtime mirror | 風船画像の即時参照 | CC0 | https://opengameart.org/content/foil-balloon |
| `src/assets/images/balloon-rising/0.png` - `4.png` | animated balloon frames | 上昇風船アニメ参照 | CC0 | https://opengameart.org/content/balloon-rising |
| `public/images/balloons/rising/0.png` - `4.png` | runtime mirror | 実装時の即時参照 | CC0 | https://opengameart.org/content/balloon-rising |

## Downloaded Source Files

- `src/assets/audio/childrens-march-theme.mp3`
- `src/assets/audio/laserpew.ogg`
- `src/assets/audio/balloon-pop.ogg`
- `src/assets/audio/balloon-inflate.ogg`
- `src/assets/audio/alarm-time-up.wav`
- `src/assets/audio/completion-result.mp3`
- `src/assets/images/foil-balloon.png`
- `src/assets/images/balloon-rising.zip`

## Notes

- ランタイム音声はブラウザ側の既存参照に合わせて `mp3` に統一変換した。
- 画像素材はまだ描画コードへ未接続で、今は参照可能な状態までを整えた。
