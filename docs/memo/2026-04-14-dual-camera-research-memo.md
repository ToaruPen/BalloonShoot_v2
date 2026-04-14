# BalloonShoot_v2 Dual-Camera Research Memo

作成日: 2026-04-14

## 位置づけ

この文書は、`BalloonShoot_v2` の 2 カメラ構成（front camera for aim / side camera for trigger）を検討するために行った外部調査メモである。

この文書は正式 spec ではない。v2 の正式な入力仕様とアーキテクチャは、後続の spec が作成された時点でそちらを優先する。

関連する bootstrap メモ:

- `docs/memo/2026-04-14-v2-bootstrap-memo.md`

## 要約

- 「front で aim、side で trigger」という構成そのものの有名な完成事例は多くない
- ただし、ブラウザの手ジェスチャー制御、MediaPipe / WebRTC / Web API、軽量な multi-camera 録画ツールには十分に参考になる先行事例がある
- browser PoC としては、**2 本の独立 capture lane -> timestamp 付き最新フレーム保持 -> 近い時刻だけ融合 -> 片方が死んだら縮退** が最も現実的
- 2 カメラで重要なのは 3D 復元より **役割分離**、つまり `front=aim` と `side=trigger` を別 lane にすること

## 1. 参考になる先行事例

### ブラウザ gesture / interaction 系

#### BrowserNinja

- URL: https://github.com/itsvivekm/BrowserNinja
- Web カメラの手ジェスチャーでブラウザ操作を行う例
- `continuous pointing + discrete action` の分離が近く、`aim lane` と `action lane` を分ける発想の参考になる

#### gesture-control

- URL: https://github.com/tejasarya12/gesture-control
- タブ操作やスクロールなどを hand gesture で行うブラウザ制御
- 単一 camera 例ではあるが、アクション確定を状態機械寄りに扱う発想が参考になる

#### A Gesture Controlled 3D Voxel Modeling System

- URL: https://github.com/Nasrin-99/A-Gesture-Controlled-3D-Voxel-Modeling-System
- ブラウザ内で連続ポインティングと離散アクションを組み合わせる例
- `front camera for aim` に近い連続入力の扱い方が参考になる

#### gestures-apps

- URL: https://github.com/manuelkiessling/gestures-apps
- ブラウザ向け gesture app 群の例
- 小さい interaction を積む構成の参考として有用

### browser / CV 基盤

#### MediaPipe Hand Landmarker

- URL: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- v2 の hand tracking 基盤候補として引き続き妥当
- 2 カメラでも「camera ごとに独立推論して、後段で融合する」構成が自然

#### WebRTC / browser frame callback samples

- URL: https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/per-frame-callback/js/main.js
- URL: https://github.com/googlechrome/samples/blob/gh-pages/requestvideoframecallback/script.js
- browser の video frame callback / frame timing の扱い方の参考になる

#### SysMocap

- URL: https://github.com/xianfei/SysMocap/blob/main/mocap/mocap.js
- browser / JS で毎フレーム hand/body 系推論を回す際の配線感の参考になる

#### multiwebcam

- URL: https://github.com/mprib/multiwebcam
- multi-camera の timestamp 付き運用を考える上で参考になる
- 完成したゲーム入力例ではないが、**独立 capture + timestamp** の考え方が使える

## 2. 公式 API / browser 制約から見える実装上の事実

### camera 列挙は permission 後の方が安全

- `enumerateDevices()` は許可前だとラベルが十分に取れない場合がある
- したがって `getUserMedia()` による permission 獲得後に device 選択 UI を出す方が安全

参考:

- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

### camera ごとに別 stream / track を持つ前提で考えるべき

- `deviceId` を使って front / side を明示的に割り当てる方がよい
- 2 カメラを 1 本の abstraction に早く畳み込みすぎると、故障時や device 再選択が難しくなる

参考:

- https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints

### 異なる camera 間で完全同期を前提にしない

- 同一 stream 内の同期は意図されていても、異なる camera の clock が厳密同期する前提は置けない
- v2 は stereo reconstruction より、**時間差を許容する役割分離** を優先するべき

参考:

- https://www.w3.org/TR/mediacapture-streams/

### `requestVideoFrameCallback()` は frame-timed だが best-effort

- `captureTime` / `expectedDisplayTime` / `presentedFrames` が使える
- ただし browser 実装差や vsync ずれを前提にし、完全な deterministic sync を期待しない

参考:

- https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- https://web.dev/articles/requestvideoframecallback-rvfc

## 3. 2 カメラ browser PoC に流用できる設計アイデア

### 1. lane 分離

最も重要なのは、最初から役割を分けること。

- `front lane`: aim / crosshair / pose for pointing
- `side lane`: trigger / release / thumb motion confirmation
- `fusion lane`: game input synthesis

この分離は、v1 の single-camera 前提より v2 に適している。

### 2. 軽量 fusion

PoC では 3D 再構成を狙わず、次のような単純な fusion が現実的。

- 各 lane に最近の推論結果を保持
- `captureTime` ベースで近い時刻の結果だけ組み合わせる
- Δt が大きいときは片方だけ採用して degrade する

### 3. trigger は状態機械、aim は連続値

先行事例を見る限り、gesture 系で安定するのはこの分離である。

- aim は毎フレーム更新
- trigger は debounce / hysteresis / dwell を持つ状態機械

v2 でもこの思想は維持した方がよい。

### 4. 片方が死んだ時の縮退を最初から設計する

2 カメラは便利だが、片方の permission 拒否、device 抜け、frame stall が現実に起きる。

したがって次のどれに落とすかを先に決めておく価値がある。

- front-only training mode
- side-only trigger diagnostics
- no-play fallback with explicit UI

## 4. リスク / 落とし穴

### 1. `OverconstrainedError`

- camera constraints を強くしすぎると取得自体が失敗する
- 解像度 / FPS / facingMode を `exact` で固定しすぎない方がよい

参考:

- https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints

### 2. 初回キャリブレーションを軽視すると後で苦しくなる

- v2 は本格 stereo calibration をやらなくてもよいが、最低限の front/side 校正は必要
- たとえば front は crosshair center, side は trigger region / posture guide の校正が必要になる

参考:

- https://github.com/opencv/opencv/blob/4.x/doc/tutorials/calib3d/camera_calibration/camera_calibration.markdown

### 3. 権限 UI と device 選択 UI が複雑化する

- 2 カメラ分の許可と選択を 1 画面で雑にやると混乱が増える
- `許可 -> 列挙 -> front/side 選択 -> 確認` の順が安全

### 4. multi-view の「夢」を見すぎると重くなる

- browser PoC 段階で 3D 再構成や厳密外部キャリブレーションまで狙うと過剰
- まずは **役割分離 + 軽量 fusion** に留めるべき

## 5. BalloonShoot_v2 への含意

今回の外部調査から、v2 は次の方針が妥当と考える。

### 推奨方針

1. Chrome/Edge + localhost/HTTPS を前提にする
2. front / side の 2 camera を `deviceId` で固定する
3. `1 camera = 1 capture lane = 1 tracking lane` を維持する
4. `requestVideoFrameCallback()` と timestamp 付き最新結果保持を採用する
5. trigger は side lane で state machine 化し、front lane では aim に専念する
6. fusion は「最近傍時刻 + 簡単な degrade」で始める

### 推奨しない方針

- 最初から厳密 stereo 解析をやる
- 2 camera を 1 本の巨大な input-mapper にまとめる
- face / eye / head tracking まで同時に足す
- calibration を後回しにする

## 6. 次にやるべきこと

1. `BalloonShoot_v2` の正式 spec を 2 カメラ前提で新規作成する
2. front / side / fusion の lane と型契約を決める
3. capture / permission / device selection の UX を先に決める
4. trigger lane の state machine と fusion 条件を先に固定する

## 参考 URL 一覧

- https://github.com/itsvivekm/BrowserNinja
- https://github.com/tejasarya12/gesture-control
- https://github.com/Nasrin-99/A-Gesture-Controlled-3D-Voxel-Modeling-System
- https://github.com/manuelkiessling/gestures-apps
- https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://developers.google.com/mediapipe/solutions
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- https://web.dev/articles/requestvideoframecallback-rvfc
- https://www.w3.org/TR/mediacapture-streams/
- https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/per-frame-callback/js/main.js
- https://github.com/googlechrome/samples/blob/gh-pages/requestvideoframecallback/script.js
- https://github.com/xianfei/SysMocap/blob/main/mocap/mocap.js
- https://github.com/mprib/multiwebcam
- https://github.com/opencv/opencv/blob/4.x/doc/tutorials/calib3d/camera_calibration/camera_calibration.markdown
