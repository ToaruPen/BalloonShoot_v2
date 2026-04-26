# Calibrated Pointing PoC Design

作成日: 2026-04-26

## 位置づけ

この文書は、`BalloonShoot_v2` の現行 front aim が持つ「Web カメラ映像内の人差し指に照準が追従する」操作感を改善するための、独立した入力ロジック PoC 設計である。

現行の `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` は「クロスヘアは手の指先に追従する」としていたが、テストプレイのフィードバックでは、この前提が身体感覚とずれることが分かった。本設計はその前提を置き換える入力方式として、キャリブレーション済み指差し入力を検証する。

この PoC はゲーム本体の当たり判定や難易度調整ではなく、純粋な入力ロジックを対象にする。

## 背景

現在の front aim は、人差し指先の 2D ランドマークをカメラ映像内の位置として取り、キャリブレーション範囲で正規化して画面座標へ投影している。

この方式では、プレイヤーが「画面上の風船を指している」と感じていても、実際には「カメラ映像内の指先位置を動かしている」状態になる。ノート PC のカメラは画面中央ではなく画面上部にあり、プレイヤーの目、手、画面、カメラの位置関係も一致しないため、ズレは構造的に発生する。

テストプレイで出た「見ている方向と照準にズレがある」「アイトラッキングのようなものが必要では」という意見は、この構造的なズレを指している。

## 外部調査からの判断

普通のノート PC Web カメラだけでも、WebGazer.js などを使ったブラウザ内視線推定は可能である。ただし、実用には画面上の既知点を使うキャリブレーションが必要で、照明、頭の位置、眼鏡、端末性能の影響も大きい。

子どもを対象にした Web カメラ視線推定の研究では、推定位置がターゲットから画面距離の大きな割合でずれる例が報告されている。したがって、本 PoC では視線推定を主入力にしない。

参考:

- WebGazer.js: <https://webgazer.cs.brown.edu/>
- jsPsych eye-tracking overview: <https://www.jspsych.org/v8/overview/eye-tracking/>
- Webcam-based eye tracking for child-language research: <https://www.cambridge.org/core/journals/journal-of-child-language/article/assessing-two-methods-of-webcambased-eyetracking-for-child-language-research/F28BD05F1D529D3ADE04F2E28A5EE4CB>
- MediaPipe Face Landmarker Web JS: <https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js>

## ゴール

- 「指先カーソル」ではなく「指し示している方向」に近い aim point を推定できるか検証する
- キャリブレーションを準備体操ゲームとして扱い、プレイヤー交代時の心理的負担を下げる
- 現在の front camera / side camera 構成を使い、追加ハードウェアなしで検証する
- ゲーム本体へ混ぜる前に、診断 PoC として精度、安定性、失敗条件を観測する
- 将来 `front-aim` と差し替え可能な mapper 契約を作る

## 非ゴール

- 視線だけで照準を動かす
- 物理的に厳密な 3D レイを復元する
- 当たり判定の吸着、弾の補正、風船サイズ変更で体験をごまかす
- プレイヤーごとに長い設定作業を要求する
- 外部サーバーへ映像やランドマークを送信する
- ゲーム本体の score / hit 判定を同時に変更する

## 基本方針

本 PoC は、物理的なレイ復元ではなく、教師ありマッピングとして設計する。

準備体操ゲーム中、画面には「今指してほしい target point」が表示される。アプリはその target point を正解ラベルとして持ち、同じ瞬間の front / side hand landmarks を入力特徴量として記録する。

そのデータから、以下を満たす mapper を作る。

```text
front hand landmarks
+ side hand landmarks
+ confidence / quality
+ calibration model
=> aimPointNormalized
```

ここで重要なのは、サイドカメラがモニター画面を直接見ていなくても成立する点である。画面座標の正解はアプリが持っているため、サイドカメラは「手が画面方向へどの角度で伸びているか」「構えが変わったか」を補助する入力として使う。

## カメラの役割

### Front camera

Front camera は、画面正面から見た手の左右・上下位置を主に担当する。

初期実装で取得する特徴量:

- indexTip
- indexDip / indexPip / indexMcp
- wrist
- thumbTip
- hand center
- index direction in front image
- wrist-to-indexTip vector
- hand confidence

Front camera だけでも、現在の指先追従よりは自然な「指方向投影」を試せる。ただし、画面方向へ伸びる指が正面視点では短く潰れやすく、奥行き方向の情報が不足する。

### Side camera

Side camera は、正面だけでは見えにくい奥行き・構え・画面方向への指角度を補う。

初期実装で取得する特徴量:

- side indexTip
- side indexMcp / indexPip / indexDip
- side wrist
- side wrist-to-indexTip vector
- side index direction
- side hand scale
- trigger lane の既存品質情報

Side camera は現行の trigger 判断にも使われるため、本 PoC では side trigger の既存契約を壊さず、calibrated pointing 用の特徴量を別経路で観測する。

## キャリブレーションゲーム

キャリブレーションは「設定画面」ではなく「準備体操ゲーム」として見せる。

初期実装:

1. 中央の target を指す
2. 左上、右上、左下、右下を指す
3. 画面中央から少し外した 3 点を validation target として指す
4. 推定 aim と正解の誤差を表示する
5. 品質が足りれば検証完了、足りなければ 5 点 target を再試行する

左中央、右中央、上中央、下中央、斜め移動 target、円形追従 target は初期実装には入れない。5 点 target で改善が不足した場合に、次の設計で追加する。

各 target では、即時に 1 フレームを採用せず、一定時間安定したサンプルだけを採用する。

採用条件の初期案:

- front hand confidence が閾値以上
- side hand confidence が閾値以上、または front-only fallback として扱える
- target 表示後の短い猶予時間を過ぎている
- index direction / hand scale が急変していない
- 連続数フレームの特徴量分散が小さい

## Mapper Stages

### Stage 1: Front-only direction projection

最小実装として、front landmarks から人差し指方向を計算し、現在の indexTip ではなく次のような点を使う。

```text
projectedPoint = indexTip + normalize(indexTip - indexMcp) * gain
```

これはキャリブレーション前の baseline として使う。現在方式との差分を比較し、指先カーソル感がどれだけ減るかを見る。

### Stage 2: Calibrated front+side mapper

準備体操ゲームで集めたサンプルを使い、front / side 特徴量から target point への変換を作る。

初期実装は weighted k-nearest samples を採用する。

- weighted k-nearest samples: 現在の特徴量に近い calibration samples を重み付き平均する

理由は、サンプル数が少なくても実装とデバッグがしやすく、どの calibration sample が効いているか説明しやすいためである。affine / linear regression は、weighted k-nearest samples の検証後に比較対象として追加する。

### Stage 3: Hybrid mapper

Stage 2 が不安定な場合、front-only direction projection と calibrated front+side mapper を confidence で混ぜる。

例:

```text
aim = lerp(frontProjectedAim, calibratedAim, calibrationConfidence)
```

この段階でもゲーム本体の hit 補正は入れない。あくまで aim point の推定品質を上げる。

## データモデル

新規 feature は `src/features/pointing-calibration/` に隔離する。

初期型:

```ts
interface PointingCalibrationTarget {
  readonly id: string;
  readonly pointNormalized: { readonly x: number; readonly y: number };
  readonly kind: "fixed" | "moving" | "validation";
}

interface PointingFeatureVector {
  readonly front: readonly number[];
  readonly side: readonly number[] | undefined;
  readonly quality: {
    readonly frontConfidence: number;
    readonly sideConfidence: number | undefined;
    readonly hasSide: boolean;
  };
}

interface PointingCalibrationSample {
  readonly target: PointingCalibrationTarget;
  readonly featureVector: PointingFeatureVector;
  readonly timestampMs: number;
}

interface PointingCalibrationModel {
  readonly samples: readonly PointingCalibrationSample[];
  readonly status: "empty" | "collecting" | "ready" | "needsRetry";
  readonly validationErrorPx: number | undefined;
}
```

型名と配置はこの方針を維持し、実装計画では import 境界とテスト単位だけを詳細化する。

## UI と導線

ゲーム本体にはまだ統合しない。

最初の実装場所は `/diagnostic` 内の `Pointing calibration` パネルとする。既存の診断ワークベンチのカメラ、hand tracking、telemetry 表示に接続し、既存ゲーム画面とは別の entry point は作らない。

ゲーム本体の start flow にはまだ接続しない。

UI は以下を表示する。

- 現在 target
- 現在の推定 aim
- front-only baseline aim
- calibrated front+side aim
- target と aim の error
- sample count
- quality status
- retry reason

## 成功基準

PoC の成功は、ゲームの得点ではなく入力推定として判定する。

最低成功基準:

- 5点以上の準備体操 target から calibration model を作れる
- validation target で、現在の indexTip 追従より平均誤差が小さい
- front-only baseline と front+side calibrated mapper を同じ画面で比較できる
- side camera が一時的に不安定でも front-only fallback で aim が破綻しない
- 誤差、sample count、quality reason を診断画面で確認できる

望ましい成功基準:

- キャリブレーション時間が 20 秒以内に収まる
- プレイヤーが入れ替わっても「準備体操」として受け入れやすい
- 画面端でも中央付近でも、ズレの傾向が可視化される
- ゲーム本体の `AimInputFrame` へ将来接続できる

## 失敗条件

以下の場合は、本方式をゲーム本体へ入れない。

- validation error が現行 indexTip 方式より改善しない
- キャリブレーション直後でも手の高さや距離の微小変化で大きく崩れる
- side camera の追加情報が front-only baseline に対して改善を出さない
- 準備体操の手順が長く、放デイの交代プレイに合わない
- 診断画面でズレの理由を説明できない

## Error Handling

- hand lost: 現在 target の採用を止め、手を戻す表示にする
- low confidence: サンプルに採用しないが、UI には理由を出す
- side unavailable: front-only calibration として継続する
- unstable pose: target は進めず、安定フレーム待ちにする
- poor validation: 本編へ進まず、短い再試行 target を出す

## Testing

Unit tests:

- feature vector extraction
- sample acceptance reducer
- weighted sample mapper
- front-only direction projection
- model status transition
- fallback behavior when side features are missing

Integration tests:

- synthetic calibration samples から target point を再現できる
- front-only baseline と calibrated mapper の telemetry を同時に出せる
- diagnostic UI が sample count / error / status を表示する

Replay tests:

- 既存 recording pipeline に calibration telemetry を追加できる場合、実測 capture を使って mapper の誤差を再計算する

E2E:

- diagnostic route が開き、カメラなし環境でも graceful fallback を表示する

## 実装境界

本設計で追加してよい領域:

- `src/features/pointing-calibration/`
- `tests/unit/features/pointing-calibration/`
- 必要最小限の diagnostic UI
- 必要な shared type

本設計で変更しない領域:

- gameplay scoring
- hit detection
- side trigger state machine
- existing front aim mapper の既定挙動
- production game start flow

## 次のステップ

この設計が承認されたら、実装計画では以下を分解する。

1. feature vector と synthetic tests
2. calibration sample reducer
3. front-only baseline mapper
4. weighted sample mapper
5. diagnostic UI wiring
6. validation telemetry
7. replay / manual verification flow
