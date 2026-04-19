# Adaptive Side-Trigger Calibration Design

作成日: 2026-04-19

## 位置づけ

この文書は、`BalloonShoot_v2` のサイドカメラ・トリガー判定に**ランタイム適応キャリブレーション**を導入するための設計書である。

対象は `src/features/side-trigger/` を中心とした calibration 供給経路であり、既存の発射 FSM (`sideTriggerStateMachine`) およびその外部契約 (`SideHandDetection -> TriggerInputFrame`) は維持する。

この設計は `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` の static `defaultSideTriggerCalibration` 前提を、本番ゲーム経路に限り **動的キャリブレーションに置き換える** 形で更新する。診断ワークベンチ (`src/diagnostic-main.ts`) は引き続き static calibration + slider のままとする。

## 背景

PoC の現地テストで、ある成人プレイヤーがサイドトリガーを 22 秒間に約 20 回引いたが、**1 発も発射されなかった**。原因はキャリブレーション値が当該ユーザの可動域に合っていなかったこと。

`iterations/telemetry-2026-04-19T01-18-36-449Z.json` の解析結果：

- `pullEvidenceScalar` の最大値は 0.737（閾値 0.72 をギリギリ超えるが、2 フレーム連続にならず未発火）
- 22 個の独立した「ジェスチャ波形」を検出（1 サイクル = pullScalar の上昇〜下降）
- ユーザの正規化親指距離の最小値（pulled 端） ≈ 0.263
- 同じくユーザの正規化親指距離の最大値（open 端） ≈ 1.009

`defaultSideTriggerCalibration.pulledPose.normalizedThumbDistance = 0` / `openPose = 1.2` は「親指を indexMcp に完全に重ねられ、開いた時は 1.2 まで広がる」前提だが、当該ユーザは pull 側で 0.263 までしか縮められず、open 側でも 1.009 までしか広げていない。

### release 評価との結合

`sideTriggerEvidence.ts` の `computeScalars` は、`pullEvidenceScalar` と `releaseEvidenceScalar` を**同じ canonical 距離から導出**している：

```text
canonical = DEFAULT_PULLED + ((normalized - cal.pulled) / observedSpan) * (DEFAULT_OPEN - DEFAULT_PULLED)
pullEvidenceScalar    = clamp01(1 - canonical)
releaseEvidenceScalar = clamp01((canonical - 0.45) / 0.75)
```

FSM が `OpenReady` に遷移するには `releaseEvidenceScalar >= 0.7`、すなわち `canonical >= 0.975` が必要。`cal.pulled` を高く動かして`cal.open` を 1.2 固定のままにすると、canonical 空間が歪み、ユーザの実 open 端 (1.009) ですら canonical = 0.975 に届かなくなる。結果、**FSM が `PulledLatched` から戻れず、最初の発火後一切ジェスチャを受け付けなくなる**。

事前 simulation で確認済み（codex review 530c895）：

- static (`cal.pulled=0`)：commit 1 (運良く 0.737 が連続)
- adaptive `pulled` only (`cal.pulled→0.39`, `cal.open=1.2` 固定)：commit **0**

したがって、**`pulled` 側だけを適応する設計は破綻する**。`pulled` と `open` の両方を同じ観測窓から並列に適応する必要がある。

放課後デイサービスという deployment context では、子どもが入れ替わり立ち替わりプレイし、指導員一人が複数の子どもを回す。**プレイ前のキャリブレーション儀式は現実的ではない**。

## ゴール

- **明示的キャリブレーションなしで多くのプレイヤー** が発射できる状態にする
- 子どもが入れ替わっても**数秒で順応**する
- 既存 FSM (`sideTriggerStateMachine`) と外部契約は不変更
- 既存テストを壊さない（adaptive は既存 mapper をラップする層として追加）
- 適応の挙動を**観測可能**にする（診断画面で可視化、telemetry で記録）

## 対象範囲

この設計書の対象：

- `src/features/side-trigger/` 配下に adaptive calibration reducer と wrapper mapper を追加
- `src/features/side-trigger/sideTriggerEvidence.ts` から raw metric 抽出 helper を分離
- `src/features/side-trigger/sideTriggerConstants.ts` に provisional 初期値定数を追加
- `src/app/balloonGameRuntime.ts` を adaptive wrapper 経由に切り替え
- `src/features/diagnostic-workbench/` に adaptive 状態の **読み取り専用** 観測パネルを追加
- `iterations/telemetry-*.json` 録画フォーマットへの adaptive snapshot 追加
- 既存 telemetry capture (`iterations/telemetry-2026-04-19T01-18-36-449Z.json`) を入力にした opt-in ローカル replay test（fixture はコミットしない）

対象外：

- 既存 FSM (`sideTriggerStateMachine`) の変更
- 既存 `createSideTriggerMapper` の変更（追加 only）
- 診断画面のスライダー UX 変更
- 自動オートキャリブレーション以外の手段（明示キャリブ画面、プリセット選択 UI など）

なお、当初は `open` を固定する案を検討したが、上述「release 評価との結合」により破綻するため、**`pulled` と `open` の両方を適応する**ことを今回スコープに含める。

## 優先順位

設計判断の優先順位は以下とする。

1. プレイヤーが**明示的キャリブなしに発射できる**こと
2. プレイヤー交代時に**数秒で追従**すること
3. 既存テスト・既存 FSM・既存外部契約に**影響しない**こと
4. 適応の挙動が**観測可能・テスト可能**であること
5. 将来 `open` 側の適応や別アルゴリズムに**差し替え可能**な構造であること

## 設計方針

### アーキテクチャ：Pure Reducer + Wrapper Mapper

既存 `createSideTriggerMapper` には**一切手を入れない**。代わりに：

1. **純粋 reducer** `updateSideTriggerAdaptiveCalibration(state, metric, config) -> state` を新設
2. raw metric 抽出 helper `extractSideTriggerRawMetric(detection)` を `sideTriggerEvidence.ts` から分離
3. **wrapper mapper** `createAdaptiveSideTriggerMapper(config?)` が、raw metric → reducer 更新 → 内部 mapper への calibration 注入、という pipeline を構成する

ゲーム本体経路 (`balloonGameRuntime.ts`) は wrapper を使う。診断画面は引き続き bare mapper + static calibration。

診断画面の adaptive 観測パネル用データは、**`liveLandmarkInspection` 内に独立した observe-only reducer インスタンスを 1 つ保持**して供給する。bare mapper の calibration には影響を与えず、reducer の state だけを `WorkbenchInspectionState.sideTriggerAdaptiveCalibration` として露出する。これにより：

- 診断画面の static cal + slider 動作は無変更
- 観測パネルは「もしゲーム経路だったら adaptive がどう動くか」を並列に可視化する
- 同じ reducer ロジックを 2 系統で再利用するので、実装の二重化を防ぐ

### 命名分離（Codex 指摘事項）

既存の `DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0` は `sideTriggerEvidence.ts` の数式における**標準アンカー**として温存する（変更すると診断スライダの意味が変わる）。

新しい provisional 初期値は別名で導入：

```ts
export const INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0.2;
```

`createAdaptiveSideTriggerMapper` の初期 calibration はこの定数を使う。`defaultSideTriggerCalibration` 自体は変更しない（診断画面の static cal として温存）。

### Time-based loss 判定（Codex 指摘事項）

既存 FSM の hand-loss 判定は**フレーム数ベース** (`sideTriggerStateMachine.ts:72`)。adaptive reducer の `hand-loss > 1.5s` 判定は**timestamp ベース**で実装する。

理由：

- フレームレートに依存しない閾値が必要（PoC は ≈ 30fps を想定するが、保証されていない）
- adaptive のテストを decoupled deterministic にできる（timestamp を引数で渡す）

reducer は `metric.timestampMs` を受け取り、`state.lastObservedHandTimestampMs` と比較して reset を判定する。

### 適応アルゴリズム：Sliding-window p10 / p90

短い観測窓（既定 5 秒、または 90 サンプル）に raw `normalizedThumbDistance` を ring buffer で保持し、

- **p10**（下位 10 パーセンタイル）を `cal.pulled` として採用
- **p90**（上位 10 パーセンタイル）を `cal.open` として採用

する。両者を並列に同じ window から計算する。

#### percentile の計算方法

**Nearest-rank** を採用：

```text
sorted = samples.sort()
p_q = sorted[max(0, ceil(q * sorted.length) - 1)]
```

- `q = 0.10` で p10、`q = 0.90` で p90
- `sorted.length >= 1` のとき定義される
- `sorted.length = 1` なら p10 = p90 = その唯一の値

線形補間 percentile を選ばない理由：実装が単純で、テストが書きやすく、PoC では精度差が問題にならない。

#### clamp / hold 規則

ring buffer から導出した raw extrema は、まず観測 span collapse を判定し、その後に bound clamp する。

```ts
// Step 0: 観測 span が実質的に collapse した場合は calibration 本体を hold
observedSpan = p90 - p10;
if (observedSpan < MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN) {
  return {
    ...state,
    status,
    sampleCount,
    samples,
    observedPulledP10: p10,
    observedOpenP90: p90,
    calibration: state.calibration
  };
}
```

この hold は `calibration` 本体だけに適用する。`observedPulledP10`、`observedOpenP90`、`sampleCount`、`samples`、`status` など telemetry / reducer state は通常どおり更新する。`status` は既存の `provisional` / `warmingUp` / `adaptive` 遷移ルールに従う。次フレームで `observedSpan >= 0.05` に戻った場合は、即時に通常の clamp / warmup blend 経路へ復帰する。

hold しない場合は以下のステップで clamp：

```ts
// Step 1: 各端を bound に clamp
clampedPulled = max(pulledLowerBound, p10); // default lowerBound = 0
clampedOpen = min(openUpperBound, p90); // default upperBound = 1.2

// Step 2: bound clamp により minSpan 不足になった場合、中点保持で両端を均等に押し広げ
if (clampedOpen - clampedPulled < pulledOpenMinSpan) {
  midpoint = (clampedPulled + clampedOpen) / 2;
  clampedPulled = midpoint - pulledOpenMinSpan / 2;
  clampedOpen = midpoint + pulledOpenMinSpan / 2;

  // Step 3: 押し広げで bound を超えた場合、超えた分を反対端へ「シフト」
  // （bound に張り付けつつスパンを保つ）
  if (clampedPulled < pulledLowerBound) {
    shift = pulledLowerBound - clampedPulled;
    clampedPulled = pulledLowerBound;
    clampedOpen = clampedOpen + shift;
  }
  if (clampedOpen > openUpperBound) {
    shift = clampedOpen - openUpperBound;
    clampedOpen = openUpperBound;
    clampedPulled = clampedPulled - shift;
  }

  // Step 4: 退化ケース（openUpperBound - pulledLowerBound < pulledOpenMinSpan）では
  // span を妥協して bound 全体を採用
  if (clampedPulled < pulledLowerBound) {
    clampedPulled = pulledLowerBound;
  }
}
```

`pulledOpenMinSpan = 0.05`（既定値）。既存の `MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN = 0.05` と同じ値を使う。

**Invariants 保証**：

- `pulledLowerBound <= clampedPulled <= clampedOpen <= openUpperBound` （常に）
- 通常経路では `clampedOpen - clampedPulled >= min(pulledOpenMinSpan, openUpperBound - pulledLowerBound)`
- hold 経路では前フレームの `state.calibration` を保持するため、既存 calibration の invariant を維持する

config invariants（後述）で `openUpperBound - pulledLowerBound >= pulledOpenMinSpan` を必須とすれば、退化ケースは config 不正としてはじける。

#### 設計判断

- `min` / `max` ではなく `p10` / `p90`：単発 tracking glitch（外れ値）に強い
- 5 秒：プレイヤーが 1 回はジェスチャを完走する想定。短すぎると baseline が動きすぎ、長すぎると交代に追従しない
- ring buffer：実装が単純、メモリ固定、push は O(1)、percentile 取得は O(N log N) ソート（N=90 なら無視できる）

#### tug-of-war リスクの管理

`pulled` と `open` を同時に動かすと、稀に互いを引っ張り合う可能性が理論上ある。本設計では：

- 両者は**独立な percentile** として計算する（互いを直接参照しない）
- ring buffer に入るのは「quality good かつ hand detected」のフレームのみで、ジェスチャの上下動が両端を自然に押し広げる
- 観測窓 5 秒は十分短く、ハンチングが起きても短時間で収束する

simulation でも収束挙動が確認済み（後述 replay test）。

### Adaptive 状態のライフサイクル

```text
provisional → warmingUp → adaptive
              ↑                ↓
              └── (reset trigger) ──┘
```

| 状態          | 条件                                   | 出力 calibration                                 |
| ------------- | -------------------------------------- | ------------------------------------------------ |
| `provisional` | `sampleCount = 0`（直後 / reset 直後） | `{ pulled: INITIAL_PULLED, open: INITIAL_OPEN }` |
| `warmingUp`   | `0 < sampleCount < warmupSamples`      | initial と clamped 観測値の **線形補間**         |
| `adaptive`    | `sampleCount >= warmupSamples`         | clamped 観測値そのもの                           |

定数：

- `INITIAL_PULLED = 0.20` (`INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE`)
- `INITIAL_OPEN = 1.20` (`INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE`)
- `warmupSamples = 30`（≈ 1 秒）

#### 線形補間の式

`sampleCount = s`、`warmupSamples = W` のとき、blend 重み `w = clamp(s / W, 0, 1)`：

```ts
weight = clamp(sampleCount / warmupSamples, 0, 1);
output.pulled = INITIAL_PULLED + weight * (clampedPulled - INITIAL_PULLED);
output.open = INITIAL_OPEN + weight * (clampedOpen - INITIAL_OPEN);
```

`weight = 1` のとき `output = clamped 観測値`、`weight = 0` のとき `output = initial`。

線形補間理由：いきなり observed percentile に切り替えると、開始直後の不安定な観測値で発火閾値が大きく動くため。

### プレイヤー交代検知（複合シグナル）

reset trigger は以下のいずれか：

1. **`sourceKey` 変化**（カメラ切替）
2. **hand-loss > 1.5s**（timestamp ベース、最後の `handDetected = true` フレームの `timestampMs` と現在フレームの `timestampMs` を比較）
3. **手の幾何学的シグネチャ jump**

#### shape signature の計算

シグネチャは MediaPipe **world-landmarks** から計算した 3 つの距離（メートル単位）のベクトル：

```ts
geometrySignature = {
  wristToIndexMcp: dist(wrist, indexMcp),
  wristToMiddleMcp: dist(wrist, middleMcp),
  indexMcpToPinkyMcp: dist(indexMcp, pinkyMcp)
};
```

距離はユークリッド距離（`Math.hypot(dx, dy, dz)`）。

#### 必要な landmarks の追加（前提作業）

現状 `HandLandmarkSet` (`src/shared/types/hand.ts:16`) と MediaPipe wrapper (`src/features/hand-tracking/createMediaPipeHandTracker.ts:43`) は以下の 8 点のみを公開している：

```text
wrist (0), thumbIp (3), thumbTip (4), indexMcp (5),
indexTip (8), middleTip (12), ringTip (16), pinkyTip (20)
```

シグネチャ計算には `middleMcp (9)` と `pinkyMcp (17)` が必要。本設計の対象として：

- `HandLandmarkSet` に **optional フィールド** `middleMcp?: Point3D` と `pinkyMcp?: Point3D` を追加
- `HAND_LANDMARK_INDEX` に `middleMcp: 9, pinkyMcp: 17` を追加（新規 detection は常に値を持つ）
- 既存の filter 配線、telemetry serialization、テストフィクスチャを連動更新

#### Optional とする理由（MUST FIX 2/3 対応）

- **既存の telemetry 録画**（`iterations/telemetry-2026-04-19T01-18-36-449Z.json` など）には新フィールドが**含まれていない**
- これらを **replay test の入力として使えるようにする**ため、欠損を許容する型にする
- 新規生成の detection は常に値を持つので、本番経路では undefined にならない
- adaptive reducer は MCPs 欠損時 `geometrySignature = undefined` として扱い、jump 検知のみ無効化される（reset signal は sourceKey + hand-loss の 2 系統で動作継続）

これにより：

- 既存処理（HandLandmarkSet を参照する箇所）は optional 扱いで型安全に拡張可能
- 旧フォーマット telemetry も replay test で利用可能
- 新規 detection / 新規 telemetry は完全機能

#### jump 判定

シグネチャ 3 成分各々の EMA を保持し、現在フレームのシグネチャと比較：

```ts
ratio_i = |current_i - ema_i| / max(ema_i, 0.001)
isJump = max(ratio_wristToIndexMcp, ratio_wristToMiddleMcp, ratio_indexMcpToPinkyMcp) > geometryJumpRatio
```

`geometryJumpRatio = 0.25` （既定）。`isJump` が true なら reset → EMA を新値で初期化。

EMA 更新：

```ts
ema' = (1 - alpha) * ema + alpha * current
```

`geometryEmaAlpha = 0.1`（≈ 10 フレームで半減）。

#### 観測欠損時の扱い

quality が `good` でない、または world-landmarks が不在のフレームでは shape signature を計算しない（EMA も更新しない、jump 判定もしない）。ただし `lastObservedHandTimestampMs` の更新は行う条件があるので、quality gate の規則は次節で改めて整理する。

### Reducer に流すフレームと quality gate

**全フレーム**を reducer に流す（`update(state, metric)` を毎フレーム呼ぶ）。これは hand-loss timer (1.5s) を reducer 内で観測可能にするため。

ただし reducer の内部処理は metric の状態によって異なる：

| metric の状態                                                                                           | ring buffer push | EMA 更新 | `lastObservedHandTimestampMs` 更新 | hand-loss timer 評価 |
| ------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------------------------------- | -------------------- |
| 8a. good 品質 + hand 検出 + `normalizedThumbDistance` 取得済 + `geometrySignature` あり                 | あり             | あり     | あり                               | あり                 |
| 8b. good 品質 + hand 検出 + `normalizedThumbDistance` 取得済 + `geometrySignature` 欠損（旧 telemetry） | あり             | なし     | あり                               | あり                 |
| 8c. hand 検出 + `normalizedThumbDistance` 取得済 + quality not good (`tooOccluded` / `frontLike`)       | なし             | なし     | あり                               | あり                 |
| 8d. hand 検出あるが `normalizedThumbDistance` 取得不能（worldLandmarks 欠損）                           | なし             | なし     | あり                               | あり                 |
| 8e. hand 未検出                                                                                         | なし             | なし     | なし                               | あり                 |

`metric.timestampMs` は MediaPipe の `frameTimestampMs` を使う（既存の `FrameTimestamp` 経由）。timestamp が undefined のフレームでは hand-loss timer 評価をスキップ。

### 失敗モード対策

| 失敗モード                              | 対策                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frozen low（最初から握っている）        | 更新は単発 min/max ではなく `p10`/`p90`。さらに `observedOpenP90 - observedPulledP10 < 0.05` の間は calibration 本体を hold し、実観測の外側へ過剰に押し広げない       |
| drift up（ジェスチャが甘くなる）        | sliding-window 自体が古いサンプルを排出するため、窓サイズ（5 秒）の時定数で自然に追従する。追加処理は不要                                                              |
| プレイヤー交代未検知                    | 上記 3 シグナルの OR で最低限カバー。検知漏れの場合も窓が 5 秒で完全入れ替わるので、最悪 5 秒で順応                                                                    |
| tracking glitch                         | quality gate：`sideViewQuality !== "good"` または landmarks 欠損のフレームは ring buffer / EMA に入らない                                                              |
| tug-of-war (`pulled`/`open` 同時動的)   | 両者を独立な percentile で計算（互いを参照しない）。最小スパン保証で formula が壊れない。replay test で安定性を gate する                                              |
| release 評価との結合（Codex Review P1） | `pulled` と `open` を**並列に同じ window から**適応することで、canonical 空間が常にユーザの実際の可動域に正規化され、`releaseEvidenceScalar >= 0.7` の達成可能性を保つ |

### Adaptive 状態の telemetry 露出

新型 `SideTriggerAdaptiveCalibrationTelemetry`：

```ts
{
  status: "provisional" | "warmingUp" | "adaptive",
  sampleCount: number,
  windowSize: number,
  observedPulledP10: number | undefined,
  observedOpenP90: number | undefined,
  pulledCalibrated: number,            // 線形補間 + clamp 後の最終出力
  openCalibrated: number,              // 線形補間 + clamp 後の最終出力
  lastResetReason?: "sourceChanged" | "handLoss" | "geometryJump",
  lastResetTimestampMs?: number,
  geometrySignatureEma?: SideTriggerHandGeometrySignature
}
```

`WorkbenchInspectionState` に `sideTriggerAdaptiveCalibration` フィールドを追加。観測パネルはこれを参照して描画。

#### Telemetry シリアライズ互換性

`telemetryFrame.ts:26-55` の `TelemetryFrameSchemaVersion = 1` を維持。adaptive snapshot は `TelemetryFrame` に**optional 新フィールド** `sideTriggerAdaptiveCalibration?: SideTriggerAdaptiveCalibrationTelemetry` として追加する。これにより：

- 旧 JSON ファイルは引き続き parser で読める（field 不在でも valid）
- 新 JSON ファイルも旧 reader で読める（field を無視）
- schema version を上げる必要がなく、後方互換性を保つ

ただし新規 landmark (`middleMcp`, `pinkyMcp`) を `HandLandmarkSet` に追加する関係で、telemetry の `landmarks` 配列も新フィールドが入る。これも optional として serialize 側で扱う。

## アーキテクチャ概要

### モジュール境界

```text
src/shared/types/hand.ts              # HandLandmarkSet に middleMcp / pinkyMcp 追加
src/features/hand-tracking/
  createMediaPipeHandTracker.ts       # HAND_LANDMARK_INDEX に middleMcp=9, pinkyMcp=17 追加
src/features/diagnostic-workbench/recording/
  telemetryFrame.ts                   # 任意フィールド sideTriggerAdaptiveCalibration を追加（schema v1 維持）
src/features/side-trigger/
  sideTriggerConstants.ts             # INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE / INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE 追加
  sideTriggerCalibration.ts           # 既存（無変更）
  sideTriggerEvidence.ts              # extractSideTriggerRawMetric を export 追加
  sideTriggerStateMachine.ts          # 既存（無変更）
  createSideTriggerMapper.ts          # 既存（無変更）
  sideTriggerRawMetric.ts             # 新規: 型と raw metric 抽出
  sideTriggerHandGeometrySignature.ts # 新規: signature 計算と jump 判定
  sideTriggerAdaptiveCalibration.ts   # 新規: 純粋 reducer
  createAdaptiveSideTriggerMapper.ts  # 新規: wrapper mapper
  index.ts                            # 新規 export 追加
src/features/diagnostic-workbench/
  renderSideTriggerAdaptiveCalibrationPanel.ts  # 新規: read-only panel
  workbenchInspectionState.ts                   # sideTriggerAdaptiveCalibration フィールド追加
  liveLandmarkInspection.ts                     # observe-only reducer 配線、resetTrackingState で reducer もリセット
  renderWorkbench.ts                            # 新パネル組み込み
src/app/balloonGameRuntime.ts                  # createSideTriggerMapper → createAdaptiveSideTriggerMapper に切り替え
```

### データフロー（ゲーム経路）

```text
SideHandDetection
    ↓
extractSideTriggerRawMetric(detection)
    ↓ SideTriggerRawMetric
updateSideTriggerAdaptiveCalibration(state, metric, config)
    ↓ AdaptiveSideTriggerCalibrationState (含む calibration)
createSideTriggerMapper.update({ detection, calibration: adaptive.calibration, tuning })
    ↓ SideTriggerMapperResult
（外側で wrapper が adaptive snapshot を telemetry にマージ）
    ↓
GameInputFrame / TelemetryFrame
```

### データフロー（診断画面、観測のみ）

```text
SideHandDetection
    ↓
                    ┌── extractSideTriggerRawMetric ── observe-only adaptive reducer ──→ WorkbenchInspectionState.sideTriggerAdaptiveCalibration
                    │                                                                                ↓
                    │                                                                       read-only panel
                    │
                    └── extractSideTriggerEvidence(detection, sliderCal) ── createSideTriggerMapper.update ──→ 既存 telemetry / overlay
```

### 主要型シグネチャ

```ts
// sideTriggerRawMetric.ts

export interface SideTriggerHandGeometrySignature {
  readonly wristToIndexMcp: number;
  readonly wristToMiddleMcp: number;
  readonly indexMcpToPinkyMcp: number;
}

export interface SideTriggerRawMetric {
  readonly sourceKey: string | undefined; // `${deviceId}:${streamId}` または undefined
  readonly timestampMs: number | undefined; // detection.timestamp.frameTimestampMs
  readonly handDetected: boolean; // detection !== undefined
  readonly sideViewQuality: SideViewQuality; // detection.sideViewQuality または "lost"
  readonly normalizedThumbDistance: number | undefined;
  readonly geometrySignature: SideTriggerHandGeometrySignature | undefined;
}

/**
 * extractSideTriggerRawMetric の動作仕様：
 *
 * 全ケース共通：戻り値の型は SideTriggerRawMetric。例外を投げない。
 *
 * 引数の `fallback` は wrapper mapper が `SideTriggerMapperUpdate` から渡す。
 * `update.timestamp` は detection 不在時もフレームループから供給されるため、
 * hand-loss timer 評価を中断させないために `fallback.timestampMs` として伝播する。
 *
 * Case A) detection === undefined:
 *   sourceKey                 = undefined  // 現 sourceKey を「保持」する意味（reducer は undefined を「未知」として扱い source-change reset を発火しない）
 *   timestampMs               = fallback.timestampMs ?? undefined
 *   handDetected              = false
 *   sideViewQuality           = "lost"
 *   normalizedThumbDistance   = undefined
 *   geometrySignature         = undefined
 *
 * Case B) detection があり worldLandmarks が不在 (rawFrame.worldLandmarks === undefined):
 *   sourceKey                 = `${detection.deviceId}:${detection.streamId}`
 *   timestampMs               = detection.timestamp.frameTimestampMs
 *   handDetected              = true
 *   sideViewQuality           = detection.sideViewQuality
 *   normalizedThumbDistance   = undefined
 *   geometrySignature         = undefined
 *
 * Case C) detection と worldLandmarks があり、middleMcp / pinkyMcp が optional 欠損:
 *   sourceKey                 = `${detection.deviceId}:${detection.streamId}`
 *   timestampMs               = detection.timestamp.frameTimestampMs
 *   handDetected              = true
 *   sideViewQuality           = detection.sideViewQuality
 *   normalizedThumbDistance   = dist(worldLandmarks.thumbTip, worldLandmarks.indexMcp)
 *                               / max(0.0001, dist(worldLandmarks.wrist, worldLandmarks.indexMcp))
 *   geometrySignature         = undefined  // MCPs 欠損なので signature 計算不能
 *
 * Case D) detection と worldLandmarks があり、middleMcp / pinkyMcp も揃っている:
 *   sourceKey                 = `${detection.deviceId}:${detection.streamId}`
 *   timestampMs               = detection.timestamp.frameTimestampMs
 *   handDetected              = true
 *   sideViewQuality           = detection.sideViewQuality
 *   normalizedThumbDistance   = ... (上と同じ)
 *   geometrySignature         = {
 *                                 wristToIndexMcp:  dist(wrist, indexMcp),
 *                                 wristToMiddleMcp: dist(wrist, middleMcp),
 *                                 indexMcpToPinkyMcp: dist(indexMcp, pinkyMcp)
 *                               }
 *
 * 重要：quality gate（sideViewQuality === "good" 判定）は reducer 側で行う。
 * 抽出 helper は値を計算して渡すだけで、good 判定で枝刈りはしない。
 */
export interface SideTriggerRawMetricFallback {
  readonly timestampMs?: number;
}

export const extractSideTriggerRawMetric: (
  detection: SideHandDetection | undefined,
  fallback?: SideTriggerRawMetricFallback
) => SideTriggerRawMetric;

/**
 * Reducer の source-change 検知ルール（参照）：
 *   if (metric.sourceKey !== undefined
 *       && state.currentSourceKey !== undefined
 *       && metric.sourceKey !== state.currentSourceKey) {
 *     // sourceChanged reset
 *   }
 *
 * すなわち `metric.sourceKey === undefined` は「未知」であり、source-change
 * 判定を発火させない。これにより no-hand frame で「sourceKey が消えた」状態が
 * 偽の sourceChanged reset を引き起こすことを防ぐ。
 * state.currentSourceKey の更新は `metric.sourceKey !== undefined` の時のみ。
 */

// sideTriggerAdaptiveCalibration.ts

export interface AdaptiveSideTriggerCalibrationConfig {
  readonly windowSamples: number; // default 90 (≈ 5s @ 30fps)
  readonly warmupSamples: number; // default 30 (≈ 1s)
  readonly handLossResetMs: number; // default 1500
  readonly geometryJumpRatio: number; // default 0.25
  readonly geometryEmaAlpha: number; // default 0.1
  readonly pulledLowerBound: number; // default 0
  readonly openUpperBound: number; // default 1.2
  readonly pulledOpenMinSpan: number; // default 0.05
  readonly initialPulled: number; // default INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0.20
  readonly initialOpen: number; // default INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE = 1.20
}

export type AdaptiveCalibrationStatus =
  | "provisional"
  | "warmingUp"
  | "adaptive";

export type AdaptiveResetReason = "sourceChanged" | "handLoss" | "geometryJump";

export interface AdaptiveSampleEntry {
  readonly timestampMs: number;
  readonly normalizedThumbDistance: number;
}

export interface AdaptiveSideTriggerCalibrationState {
  readonly calibration: SideTriggerCalibration; // 出力（warmup blend + clamp 後）
  readonly status: AdaptiveCalibrationStatus;
  readonly sampleCount: number;
  readonly windowSamples: number;
  readonly samples: ReadonlyArray<AdaptiveSampleEntry>; // ring buffer の immutable view
  readonly observedPulledP10: number | undefined; // 補間/clamp 前の生 p10
  readonly observedOpenP90: number | undefined; // 補間/clamp 前の生 p90
  readonly lastObservedHandTimestampMs: number | undefined;
  readonly geometrySignatureEma: SideTriggerHandGeometrySignature | undefined;
  readonly lastResetReason: AdaptiveResetReason | undefined;
  readonly lastResetTimestampMs: number | undefined;
  readonly currentSourceKey: string | undefined;
}

/**
 * Ring buffer の immutable shape：state.samples は ReadonlyArray<AdaptiveSampleEntry>。
 * push 時は古いサンプルを 1 つ削った新配列を作って差し替える（copy-on-write）。
 * windowSamples = 90 サイズで毎フレーム呼ばれるので O(N) 配列コピーは許容範囲。
 * テスト側は state.samples を直接 inspection 可能。
 */

export const createInitialAdaptiveSideTriggerCalibrationState: (
  config: AdaptiveSideTriggerCalibrationConfig
) => AdaptiveSideTriggerCalibrationState;

export const updateSideTriggerAdaptiveCalibration: (
  state: AdaptiveSideTriggerCalibrationState,
  metric: SideTriggerRawMetric,
  config: AdaptiveSideTriggerCalibrationConfig
) => AdaptiveSideTriggerCalibrationState;

// createAdaptiveSideTriggerMapper.ts

export interface AdaptiveSideTriggerMapper extends SideTriggerMapper {
  getAdaptiveState(): AdaptiveSideTriggerCalibrationState;
}

export const createAdaptiveSideTriggerMapper: (
  config?: Partial<AdaptiveSideTriggerCalibrationConfig>
) => AdaptiveSideTriggerMapper;

/**
 * createAdaptiveSideTriggerMapper の reset() 動作：
 * - 内部 reducer state を createInitialAdaptiveSideTriggerCalibrationState で再生成
 * - 内部 createSideTriggerMapper.reset() を呼ぶ
 *
 * balloonGameRuntime.ts:719-723 の retry() から呼ばれた時、両方が確実に reset される。
 */
```

### Config invariants

`createInitialAdaptiveSideTriggerCalibrationState` および `updateSideTriggerAdaptiveCalibration` は、以下の invariants を満たさない config に対し早期に throw する（純粋関数だが入力検査は許容）：

```ts
windowSamples >= 1;
warmupSamples >= 1;
warmupSamples <= windowSamples;
handLossResetMs > 0;
geometryJumpRatio > 0;
0 < geometryEmaAlpha <= 1;
pulledLowerBound >= 0;
openUpperBound > pulledLowerBound;
pulledOpenMinSpan > 0;
pulledOpenMinSpan <= openUpperBound - pulledLowerBound; // 退化ケース禁止
pulledLowerBound <= initialPulled <= openUpperBound;
pulledLowerBound <= initialOpen <= openUpperBound;
initialPulled < initialOpen;
initialOpen - initialPulled >= pulledOpenMinSpan;
```

config 受信時に上記を検査するヘルパ `assertAdaptiveCalibrationConfig(config)` を export する。デフォルト値はすべての invariants を満たす（テスト済）。

## テスト戦略

### 純粋 reducer の単体テスト

`tests/unit/features/side-trigger/sideTriggerAdaptiveCalibration.test.ts` で全ケース deterministic に検証：

1. **provisional → warmingUp → adaptive 遷移**：30 frames で warmingUp 終了、それ以降 adaptive
2. **線形補間**：warmingUp 中に `output.pulled` が `INITIAL_PULLED` から `clampedP10` へ、`output.open` が `INITIAL_OPEN` から `clampedP90` へ、それぞれ `weight = sampleCount/30` で単調変化
3. **p10 / p90 nearest-rank 計算**：
   - 既知配列 `[0.1, 0.2, ..., 1.0]` (n=10) で p10=0.1, p90=0.9
   - 90 サンプル投入時、`ceil(0.10 * 90) - 1 = 8` (0-indexed)、つまり sorted 配列の **9 番目** の値が p10。同様に `ceil(0.90 * 90) - 1 = 80` で **81 番目** の値が p90
4. **clamp 動作**：
   - `p10 < pulledLowerBound (0)` → 0 に clamp
   - `p90 > openUpperBound (1.2)` → 1.2 に clamp
   - `p90 - p10 < 0.05` → `calibration` 本体のみ前フレームから hold
   - `p90 - p10 >= 0.05` → p10 / p90 をそのまま採用（bound clamp は適用）
   - hold 後に `p90 - p10 >= 0.05` に戻ると次フレームで通常経路へ復帰
5. **`sourceKey` reset**：sourceKey 変化で provisional に戻り、sampleCount = 0、samples 配列空、`lastResetReason = "sourceChanged"`
6. **hand-loss reset (timestamp ベース)**：最後の `handDetected=true` フレームから 1500ms 経過した最初のフレームで reset、`lastResetReason = "handLoss"`
7. **geometry jump reset**：3 成分のいずれかで `|current - ema| / ema > 0.25` → reset、EMA は新値で再初期化、`lastResetReason = "geometryJump"`
8. **quality gate（5 ケース別）**：
   各ケースで以下を必ず assert：(i) ring buffer push の有無, (ii) EMA 更新の有無, (iii) `sampleCount` 増減, (iv) `observedPulledP10` / `observedOpenP90` 更新, (v) `geometrySignatureEma` 変化, (vi) **`lastObservedHandTimestampMs` 更新**, (vii) hand-loss timer 評価実行有無
   - **8a. good 品質 + thumb距離あり + signature あり**：(i) push, (ii) 更新, (iii) +1, (iv) 更新, (v) 更新, (vi) **更新**, (vii) 評価
   - **8b. good 品質 + thumb距離あり + signature 欠損（旧 telemetry の主要パス）**：(i) push, (ii) **更新せず**, (iii) +1, (iv) 更新, (v) **不変**, (vi) **更新**, (vii) 評価。連続フレームで `handLossResetMs` 経過しても reset しないことを assert（旧 telemetry 全フレーム再生でハングしない保証）
   - **8c. hand 検出あり、thumb距離あり、quality not good (`tooOccluded` / `frontLike`)**：(i) **push なし**, (ii) **更新せず**, (iii) **不変**, (iv) **不変**, (v) **不変**, (vi) **更新**, (vii) 評価
   - **8d. hand 検出あるが thumb距離取得不能 (worldLandmarks 欠損)**：(i) push なし, (ii) 更新せず, (iii) 不変, (iv) 不変, (v) 不変, (vi) **更新**, (vii) 評価
   - **8e. hand 未検出 (detection === undefined)**：(i)-(v) すべて不変, (vi) **更新せず**, (vii) **評価**（前回の `lastObservedHandTimestampMs` から `handLossResetMs` 経過なら reset）

   8b はリプレイ用旧 telemetry (`tests/fixtures/replay/sideTriggerAdaptive/baseline-2026-04-19.json`) の主要パスなので、必ずテストに含めること。8c は `tooOccluded` / `frontLike` のフレームを push してしまう実装ミスを検出するために必須。

9. **table-driven invariant tests**：
   - `output.pulled <= output.open - pulledOpenMinSpan + ε`（formula 健全性）
   - `output.pulled >= pulledLowerBound`（lower bound 保証）
   - `output.open <= openUpperBound`（upper bound 保証）
   - 同じ metric 列を 2 回流すと state が一致（決定論性）

### Wrapper mapper の単体テスト

`tests/unit/features/side-trigger/createAdaptiveSideTriggerMapper.test.ts`：

1. **black-box 委譲確認**：static mapper では発火しない detection sequence が、adaptive wrapper では発火する（`pullStarted+shotCommitted` edge を観測）
2. **`reset()` 委譲**：reset 後は state が provisional、内部 mapper も `SideTriggerNoHand` から再開
3. **`getAdaptiveState()` 公開**：reducer state が読み取れ、telemetry と整合する

既存 `tests/unit/features/side-trigger/createSideTriggerMapper.test.ts` は **無変更**。

### Replay opt-in ローカルゲート

`tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts` を新設：

- 入力：`iterations/telemetry-2026-04-19T01-18-36-449Z.json`（gitignored、ローカルのみ）
  - 200k 行超の landmark JSON を git に載せると repo が肥大するため、fixture は **コミットしない**
  - test は `it.skipIf(fixture === undefined)` で fixture 不在時 skip
  - CI では fixture 不在のため skip され、ハードな CI ゲートにはならない
  - ローカル（capture を持つ環境）では gate が走り、回帰検出に使う
- 各フレームの side detection から `extractSideTriggerRawMetric` → adaptive reducer → `extractSideTriggerEvidence` → 既存 FSM の simulation
- 比較対象として **同じ telemetry を static calibration で流した baseline** も同テスト内で計算する
- `package.json:15-19` の `check` から呼ばれる `test:replay` に組み込まれるが、fixture 不在時は test 自体が skip されるため、CI では実質ノーオペになる（ローカル opt-in 評価）

#### 期待値の根拠と Phase 1 ゲート

Codex review (commit 0cf70fe) の初期シミュレーション結果：

| シナリオ                                | commit 数     | release 数 |
| --------------------------------------- | ------------- | ---------- |
| static (`cal.pulled=0`, `cal.open=1.2`) | 1             | 0          |
| pulled-only adaptive                    | 0 (FSM stuck) | 0          |
| **pulled + open adaptive (本設計)**     | **9**         | **8**      |

人間プレイヤーの実ジェスチャ数は約 22 回（解析済み）。pulled+open 適応で **9 commits = baseline static の 9 倍** の改善を実証している。残り約 13 ジェスチャを取りこぼす要因は：

- p90 が 90 frame 窓では稀な open ピーク（実最大 1.009）を捉えきれず ~0.64 に落ち着く
- warmup 中のジェスチャは固定 INITIAL に近い calibration を使うため commit しにくい
- minSpan = 0.4 が実観測の外側へ calibration を押し広げ、canonical mapping 後の scalar が FSM 閾値へ届きにくくなる可能性

続く現地計測と advisor simulation で、`pulledOpenMinSpan = 0.4` はユーザ実モーション幅（median 0.185）より広すぎることが root cause と判明した。現 checkout の TypeScript 実装を `jiti` で直接 replay した結果：

| capture                                                             | minSpan | commit 数 |
| ------------------------------------------------------------------- | ------: | --------: |
| `iterations/telemetry-2026-04-19T05-00-33-702Z.json`（25 gestures） |    0.05 |     20/25 |
| `iterations/telemetry-2026-04-19T05-00-33-702Z.json`（25 gestures） |    0.10 |     20/25 |
| `iterations/telemetry-2026-04-19T05-00-33-702Z.json`（25 gestures） |    0.15 |     18/25 |
| `iterations/telemetry-2026-04-19T05-00-33-702Z.json`（25 gestures） |    0.20 |     16/25 |
| `iterations/telemetry-2026-04-19T05-00-33-702Z.json`（25 gestures） |    0.40 |      5/25 |
| `iterations/telemetry-2026-04-19T01-18-36-449Z.json`（22 gestures） |    0.05 |        16 |
| `iterations/telemetry-2026-04-19T01-18-36-449Z.json`（22 gestures） |    0.40 |         9 |

**Phase 1 ゲート値**（ローカルで fixture を持つ場合のみ評価）：

- **必須 (test 失敗)**：commit 数 ≥ 13（旧 capture の 0.05 実測 16 に対する回帰保護）
- **目標 (warning のみ)**：commit 数 ≥ 18（新 capture の 0.15 実測、および 25 gestures の 70% 超）
- **長期目標 (Phase 2 以降)**：commit 数 ≥ 20

CI では fixture 不在で skip されるため、本ゲートは厳密な CI 失敗トリガーにはならない。実装者は手元 capture をもとにローカルで commit 前に評価する想定。Phase 2 で複数ユーザの telemetry を集めて軽量な合成 fixture を作る案は別 spec で扱う。

#### Phase 2 で検討するチューニング軸

- p90 → p95 へ昇格（open のレア値を拾いやすくする）
- windowSamples を「pulled 推定用 90」と「open 推定用 270 (9s)」で分ける
- pulled 用 windowSamples を短縮（30-60）して即応性を上げる
- EMA 平滑化で p10/p90 のフレーム間揺れを抑える
- 直近の commit/release 実績を観測して hysteresis やジェスチャ周期を調整する

これらは別 PR で simulation を回しながら判定。

### 観測パネル / telemetry 統合テスト

軽量な smoke test：

- `WorkbenchInspectionState.sideTriggerAdaptiveCalibration` が adaptive reducer の state と一致する
- `TelemetryFrame` snapshot を JSON シリアライズ → 再パース → adaptive snapshot が round-trip する
- 旧フォーマット（adaptive snapshot 不在）の JSON も parse できる（後方互換性）

### 既存 telemetry / hand-tracking テストへの影響

- `HandLandmarkSet` 拡張：既存テストフィクスチャに `middleMcp` / `pinkyMcp` フィールドを追加。値は仮の `{x:0, y:0, z:0}` で十分（既存テストはこれらを参照しない）
- `createMediaPipeHandTracker` テスト：landmark index 抽出のテストがあれば 2 件追加

## 観測性設計

### 診断画面パネル

新パネル `renderSideTriggerAdaptiveCalibrationPanel.ts`：

- 現在の status（バッジ表示：provisional/warmingUp/adaptive）
- sampleCount / windowSize（progress bar）
- pulled の現在値（数値 + INITIAL からの差分）
- 観測 p10（数値、未確定なら `--`）
- 直近の reset 理由とタイムスタンプ
- geometry signature EMA の 3 成分

### Telemetry 録画フォーマット

`TelemetryFrame` に **optional 新フィールド** `sideTriggerAdaptiveCalibration?: SideTriggerAdaptiveCalibrationTelemetry` を追加する。`TelemetryFrame.calibration` 既存フィールドは変更しない。schema version は `1` を維持し、旧 JSON との後方互換性を保つ（前掲「Telemetry シリアライズ互換性」節と同一方針）。具体形式は M2 (Timestamped Diagnostic Capture) と整合させる。

## ロールアウト方針

1. **Phase 1（本設計の対象 / 1 PR）**：
   - `HandLandmarkSet` と MediaPipe wrapper に `middleMcp` / `pinkyMcp` 追加
   - `INITIAL_*` 定数追加
   - raw metric helper、shape signature、adaptive reducer、wrapper mapper を実装
   - 観測パネルと telemetry optional フィールド追加
   - `balloonGameRuntime.ts` を adaptive 経路に切り替え
   - opt-in ローカル replay test を `test:replay` 経由で配置（fixture 不在時は skip）
   - 診断画面の static cal は温存
2. **Phase 2（別 PR、現地検証後）**：
   - 複数ユーザのテレメトリを集めて `INITIAL_*` / `windowSamples` / `warmupSamples` の調整
   - 観測パネルの UI 改善
3. **Phase 3（将来）**：
   - 自動キャリブの収束を加速する仕組み（事前学習プリセット、ジェスチャ検知での p10/p90 重み調整など）
   - 必要なら adaptive アルゴリズムの差し替え（kalman-like、quantile sketch など）

## オープン論点

- `windowSamples = 90` (5s @ 30fps) は仮置き。複数ユーザのテレメトリ取得後に調整する可能性
- `warmupSamples = 30` (1s) は仮置き。短すぎると初期不安定、長すぎると初動が鈍る
- `pulledOpenMinSpan = 0.05` は短期修正値。閾値 (`PULL_ENTER = 0.72`, `RELEASE 0.7`) や hold guard との整合は replay test と現地計測で継続確認
- `geometryJumpRatio = 0.25` / `geometryEmaAlpha = 0.1` は仮置き。子どもと大人の手で実測した値が望ましい
- 観測パネルの UI レイアウトは別 PR で詳細詰め可
- adaptive スナップショットを `iterations/telemetry-*.json` 録画フォーマットに含める実装範囲が「frame ごと丸ごと」か「変化時のみ」かは実装時判断（現状: frame ごと前提）

## 改訂履歴

時系列順（古い → 新しい）。各版は直前版を supersede する。

- 2026-04-19 初版
- 2026-04-19 改訂 r1: codex review (commit 530c895) と codex advisor の指摘を反映
  - **`pulled` のみ適応 → `pulled` と `open` 両方の適応**（release 評価との結合により pulled-only は破綻）
  - geometry signature の必要 landmarks (`middleMcp`, `pinkyMcp`) を追加対象に明示
  - `extractSideTriggerRawMetric` の動作仕様を全ケース明示
  - hand-loss timer と quality gate の関係を整理（全フレームを reducer に流す）
  - p10 / p90 の nearest-rank 計算式、warmup 線形補間式を明示
  - ring buffer の immutable shape を `ReadonlyArray<AdaptiveSampleEntry>` で明示
  - replay test を `tests/replay/` に配置（後の r5 で opt-in ローカル方針へ修正）
  - telemetry 後方互換性方針（optional 新フィールド、schema v1 維持）を追加
- 2026-04-19 改訂 r2: codex review v2 (commit 0cf70fe) と codex advisor v2 の追指摘を反映
  - `extractSideTriggerRawMetric` に `fallback?: { timestampMs }` を追加（no-hand frame で timer 評価可能化）
  - reducer の source-change ルールを明示（`metric.sourceKey === undefined` を「未知」扱い、reset しない）
  - 新 MCP 必須化を取りやめ、`HandLandmarkSet` の新フィールドを **optional** に変更（旧 telemetry の replay 互換性確保）
  - quality gate 表に「MCPs 欠損だが thumb 距離計算可能」の case を追加
  - clamp 規則を 4-step アルゴリズムに精緻化（minSpan 保証）
  - test 用 nearest-rank 番号を 9th/81st に修正
  - replay 入力を `iterations/` から `tests/fixtures/replay/sideTriggerAdaptive/` へ移動（CI 可視化、r5 で再修正）
  - replay gate を多段化（必須 ≥ 8 / 目標 ≥ 13 / 長期 ≥ 18）。simulation 実証値に整合
  - Phase 2 で検討するチューニング軸を明示
  - config invariants セクションを追加（`assertAdaptiveCalibrationConfig`）
- 2026-04-19 改訂 r3: codex review v3 (commit ab3496a) の P2 指摘を反映
  - quality gate テスト #8 を 4 ケース (8a-8d) に分解し、特に 8b（旧 telemetry の MCPs 欠損 + thumb距離あり）が ring buffer に入ることを明示
- 2026-04-19 改訂 r4: codex review v4 (commit def59ab) の P2 指摘を反映
  - quality gate テスト #8 を 5 ケース (8a-8e) に拡張：「quality not good かつ thumb 距離あり」(8c) を独立ケースとして分離
  - 各ケースで `lastObservedHandTimestampMs` 更新と hand-loss timer 評価の期待値を明示
  - quality-gate 表側もケース番号付きで整合
- 2026-04-19 改訂 r5: implementation 後 review 後の方針修正
  - replay fixture を git にコミットしない方針に変更（200k 行超で repo 肥大）— r2 の `tests/fixtures/` 配置を supersede
  - test は `iterations/...` (gitignored) を読み、不在時 `it.skipIf` で skip
  - CI ハードゲートではなくローカル opt-in 評価とする — r1 の「CI 必須ゲート」を supersede
  - Telemetry 拡張方式を「`TelemetryFrame` への optional 新フィールド `sideTriggerAdaptiveCalibration` 追加」に断定（`TelemetryFrame.calibration` 拡張は採用しない）
- 2026-04-19 改訂 r6: 現地 capture と advisor simulation に基づき minSpan を hand-size 非依存化
  - `pulledOpenMinSpan` 既定値を `0.4` から `0.05` へ変更し、`MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN` と一致させる
  - `observedOpenP90 - observedPulledP10 < 0.05` の間は `calibration` 本体のみ hold し、telemetry state は通常更新する方針へ変更
  - replay gate を旧 capture 基準で `>= 13 commits` へ引き上げ、warning target を `>= 18` へ更新
  - Phase 2 チューニング軸として EMA 平滑化と commit 実績ベース hysteresis を残す
