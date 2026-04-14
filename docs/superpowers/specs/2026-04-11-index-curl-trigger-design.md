# Index Curl Trigger Design

作成日: 2026-04-11

## 位置づけ

この文書は `BalloonShoot` PoC の発射ジェスチャーを、現行の親指トリガー (`evaluateThumbTrigger`) から人差し指の曲げ (index curl) に置き換えるための設計を確定する。

PR #31 で `親指引きトリガー` のヒステリシスと状態機械を整えたが、ライブテスト (Issue #32) で「親指側の生信号自体が、子どもの実用的な発射動作と整合しない」ことが分かった。本設計はその差し替えを定義する。

`docs/superpowers/specs/2026-04-08-poc-foundation-design.md` の PoC 前提(Chrome、1 プレイ 1 分、片手、`HandLandmarker` + 自前判定)を継承する。

## ゴール

- 子どもが「カメラに向かって人差し指で指差し → 指を曲げて発射」を**確実に**行える発射ジェスチャーを実装する
- 発射の瞬間に照準がずれない(指先が曲げで動いても、命中点がぶれない)
- 既存の状態機械 `shotIntentStateMachine` の構造を壊さず、トリガー側の意味だけ差し替える
- ライブテスト時に判定の中身を観測・調整できるテレメトリを最初から備える
- 親指トリガーは完全に削除する(共存させない)

## 対象範囲

この設計書は以下を確定する。

- 人差し指 curl の判定式と閾値
- 3 値ステート (`extended` / `partial` / `curled`) の意味
- スナップロック発火タイミングと解除条件
- 発射状態機械への組み込み(`shotIntentStateMachine` 側の修正)
- gun-pose 判定の責務再定義
- `HandFrame` 型の拡張(landmark 追加)
- デバッグパネルへのテレメトリ追加
- 既存 `evaluateThumbTrigger` の削除

以下は対象外とする。

- ジェスチャー学習(MLP / fingerpose 等の機械学習路線)
- 角度ベースの曲げ判定(本 spec は distance ratio 主判定。角度判定は将来案として `HandFrame` 拡張で逃げ道だけ残す)
- z(深度)を主判定に使うこと
- マルチハンド対応
- ゲーム前の事前キャリブレーションフロー

## この文書が確定する設計上の決定

### D1. 人差し指 curl 判定の主信号は **`distance(indexTip, indexMcp) / handScale`**

- `handScale = hypot(indexMcp - wrist)`(既存と同じ正規化基準)
- 値の経験的範囲: 伸ばすと約 1.2〜1.4、軽く曲げると約 0.7〜1.2、しっかり曲げると 0.5〜0.7
- 同一フレーム内で計算される純粋な 2D 距離で、追加 landmark を必要としない
- 子どもの手の大小には正規化で対応

理由: コミュニティ(`fingerpose` 等)と Codex 助言の両方から最も実装が軽く堅い形。`HandLandmarker` の z 座標は値範囲が不安定でカメラ依存性が高い(複数開発者が `[-198, +168]` 等を観測)ため、主判定には載せない。

### D2. curl ステートは 3 値 (`extended` / `partial` / `curled`)

| ステート | distance ratio | 意味 |
|---|---|---|
| `extended` | `> extendedThreshold` | 指が伸びている。通常照準。発射不可 |
| `partial` | `curledThreshold ≤ ratio ≤ extendedThreshold` | 曲げ始め。スナップロック候補 |
| `curled` | `< curledThreshold` | しっかり曲げた。発射候補 |

3 値にする理由: 「TIP を照準に使いつつ TIP curl を発射に使う」最大の罠(発射直前にクロスヘアが下がる)を **`partial` 検出時にクロスヘアをスナップロックする** ことで吸収する。2 値だと curl 確定の瞬間にしかロックできず、ロック前に既に TIP が動いている。

### D3. 閾値の初期値とヒステリシス

```ts
extendedThreshold = 1.15
curledThreshold = 0.65
HYSTERESIS_GAP = 0.05  // 各境界の戻り判定はこの分だけ内側
```

ヒステリシス例:
- `extended → partial` は ratio が `1.15` を下回った瞬間(**1 フレームで遷移**、スナップロックを早期発火させるため)
- `partial → extended` は ratio が `1.15 + 0.05 = 1.20` を超えてから
- `partial → curled` は ratio が `0.65` を下回った瞬間
- `curled → partial` は ratio が `0.65 + 0.05 = 0.70` を超えてから

ヒステリシスギャップ (`0.05`) があるため、ratio が境界付近で 1 フレームだけブレてもステートが往復することはない(両境界の戻り判定が内側にずれている)。

フレーム確認(発射の確定とロック解除はマルチフレーム):
- 発射確定: `curled` が **2 フレーム連続**
- ロック解除: `extended` が **2 フレーム連続** に戻ったとき

### D4. クロスヘアのスナップロック

| 発生条件 | 動作 |
|---|---|
| `extended` 中 | クロスヘアは `indexTip` に追従(現状維持) |
| **`extended → partial` 遷移** | クロスヘアを `lastExtendedCrosshair` にロック |
| `partial` 維持 | ロック位置を保持 |
| **`partial → curled` 確定** | ロック位置に対して発射 |
| `curled → partial` (発射後) | ロック維持(再発火禁止) |
| `partial → extended` 確定 | ロック解除、`indexTip` 追従に戻る |
| 追跡喪失 (`trackingPresent === false`)、または gun-pose 喪失 | ロック解除 |

#### D4.1 `rawCurlState` と `curlState` の責務分離

実装には 2 種類の curl ステートが必要:

| 名前 | 意味 | 所有 |
|---|---|---|
| `rawCurlState` | `measureIndexCurl` がヒステリシス込みで返す**瞬時ステート**(その 1 フレームでの判定結果) | `HandEvidenceRuntimeState` に保持 |
| `curlState` | state machine 側が「curled が 2 frame 連続」「extended が 2 frame 連続」を確認してから昇格させる**安定ステート**(発射判定や crosshair lock 制御の入力) | `ShotIntentState` に保持 |

これは現状の `rawTriggerState` / `triggerState` の責務分割と完全に同じパターンであり、`measureIndexCurl` のシグネチャは前者だけを参照する:

```ts
measureIndexCurl(frame, previousRawCurlState, tuning)
```

`measureIndexCurl` は前ステートとしてヒステリシス用の瞬時ステート(`previousRawCurlState`)だけを必要とする。安定ステート(`curlState`)を渡してはいけない(意味が混ざる)。

#### D4.2 `lastExtendedCrosshair` と `lockedCrosshair` の所有権と適用順序

現行の `buildHandEvidence` は indexTip からまず `smoothedCrosshairCandidate` を計算し、その後で `advanceShotIntentState` が呼ばれる(`createHandEvidence.ts:54-65` 周辺)。この順序では、`partial` を検出した時点で「曲がり始め後の TIP で smoothing した値」を凍結することになり、本来狙っていた「直前の安定位置」が取れない。

これを正しく成立させるため、以下の所有権と順序を取る:

1. **runtime 側に保持する追加フィールド**(`HandEvidenceRuntimeState`):
   - `rawCurlState: IndexCurlState | undefined` — D4.1 の瞬時ステート
   - `lastExtendedCrosshair: CrosshairPoint | undefined` — `rawCurlState === "extended"` のフレームで更新された EMA 値のスナップショット(下記 step (b) で明示)
   - `lockedCrosshair: CrosshairPoint | undefined` — 現在 freeze 中ならその座標、未 freeze なら undefined

2. **適用主体は `mapHandToGameInput` に固定する**。`createHandEvidence` は curl measurement と次フレームに渡す候補値を返すだけで、state machine の呼び出しと runtime 更新は行わない。これは現状の `mapHandToGameInput` が `buildHandEvidence` → `advanceShotIntentState` を順に呼ぶ構造そのままで、責務だけを明示する変更:

3. **フレームごとの順序(`mapHandToGameInput` 内で実行):**
   - (a) `buildHandEvidence(...)` → `evidence` を取得。この中で `measureIndexCurl(frame, runtime.rawCurlState, tuning)` が走り、`evidence.curl.rawCurlState` が決まる。同時に `evidence.projectedCrosshairCandidate`(`projectLandmarkToViewport(indexTip)` の結果)も得る(D4.2.2)
   - (b) `evidence.curl.rawCurlState === "extended"` の場合のみ、`smoothCrosshair(runtime.lastExtendedCrosshair, evidence.projectedCrosshairCandidate, alpha)` を計算して `nextLastExtendedCrosshair` を作る。それ以外のケースでは `nextLastExtendedCrosshair = runtime.lastExtendedCrosshair`(更新しない)
   - (c) `advanceShotIntentState(prevShotState, evidence)` を呼び、`{ state, shotFired, crosshairLockAction }` を受け取る
   - (d) `crosshairLockAction === "freeze"` なら `nextLockedCrosshair = nextLastExtendedCrosshair`、`"release"` なら `undefined`、`"none"` なら `runtime.lockedCrosshair` を保持
   - (e) `runtime.rawCurlState`, `runtime.lastExtendedCrosshair`, `runtime.lockedCrosshair` を上記の値で更新
   - (f) ゲーム入力に渡す最終 crosshair は `nextLockedCrosshair ?? nextLastExtendedCrosshair ?? evidence.projectedCrosshairCandidate`(smoothing は (b) で `extended` のときだけ走る純粋な generator として閉じている)

つまり「smoothing を curl 判定より**前**に走らせない」「lock 適用主体を 1 か所(`mapHandToGameInput`)に固定する」ことで、partial 検出フレームのノイズで lastExtendedCrosshair が汚染されないようにし、循環依存や隠れた mutation を避ける。

#### D4.2.1 `lastExtendedCrosshair` の更新を `rawCurlState` に紐づける理由

step (b) の更新条件は **`rawCurlState === "extended"`** であり、安定確定 `curlState` ではない。これは意図的な選択:

- `rawCurlState` を採用: `partial` に入る瞬間まで lastExtendedCrosshair はフレッシュに更新され続ける。発射時のロック位置と「子どもが指で指していた最後の場所」のズレが最小化される。境界フリッカーは D3 のヒステリシスギャップで抑え、単フレームノイズは EMA の `smoothingAlpha` で吸収される
- もし `curlState`(stable)で更新する設計にすると、cold start 直後や境界戻りで「2 フレーム連続 extended」を待つ分だけ lastExtendedCrosshair が古くなり、partial 遷移時に「2 フレーム前の照準」をロックしてしまう

#### D4.2.2 `projectedCrosshairCandidate` の生成主体

`projectedTip`(viewport 座標に投影された indexTip)は **`buildHandEvidence` 内で生成し、`HandEvidence.projectedCrosshairCandidate` として返す**。`mapHandToGameInput` は projection ロジックを持たず、`evidence.projectedCrosshairCandidate` を読んで step (b) の smoothing に渡す。

これにより:
- mirror flip / viewport 変換の責務は `buildHandEvidence` に集中する(現状の `projectLandmarkToViewport` 呼び出し位置と整合)
- `mapHandToGameInput` は orchestration とロック制御に専念する

#### D4.3 ロック意図は `ShotIntentResult` の純粋な出力として返す

state machine は副作用も runtime 参照も持たない純関数のままにする。現状の `ShotIntentResult` は `{ state, shotFired }` だが、ここに `crosshairLockAction: "none" | "freeze" | "release"` を追加する。

state machine は **「武装中に curl が partial/curled に入ったか」「extended に戻ったか」「ロックすべき状況か」という意図** だけを判断する:

- `armed && rawCurlState === "partial"`(初めて partial を観測した遷移フレーム): `"freeze"`
- `partial → extended` 確定(2 フレーム連続): `"release"`
- 追跡喪失 / gun-pose 喪失: `"release"`
- それ以外: `"none"`

state machine は `runtime.lastExtendedCrosshair` を**知らない**(知ってはいけない)。`lastExtendedCrosshair` は `mapHandToGameInput` 側の所有物であり、state machine の入力ではない。

**物理制約は `mapHandToGameInput` が処理する**: state machine が `"freeze"` を返しても、`nextLastExtendedCrosshair === undefined` なら freeze を適用せず `nextLockedCrosshair = undefined` のままにする。実装イメージ:

```ts
if (intent.crosshairLockAction === "freeze" && nextLastExtendedCrosshair !== undefined) {
  nextLockedCrosshair = nextLastExtendedCrosshair
} else if (intent.crosshairLockAction === "release") {
  nextLockedCrosshair = undefined
} else {
  nextLockedCrosshair = runtime.lockedCrosshair  // none: 維持
}
```

cold start での `partial` / `curled` 直接スタートでは、そもそも `armed` に到達しないため state machine は `"freeze"` を返さない(`extended` を 2 フレーム経由するまでは武装しない、というアーミング条件と整合)。仮に `armed` に至る前に `"freeze"` 相当の意図が漏れたとしても、`mapHandToGameInput` 側の `nextLastExtendedCrosshair === undefined` ガードで吸収される。

#### D4.4 再発火禁止

一度 `curled` で発射した後は、`extended` に戻るまで次の発射ができない(現状の `recovering → ready → armed → fired` フローと同じ。意味だけ移し替える)。`recovering` フェーズの解除条件を「`extended` が 2 フレーム連続」に置き換える。

### D5. gun-pose の責務再定義

現状の `evaluateGunPose` は「`indexExtended && curledFingerCount >= 2`」(人差し指が伸びている + 中指/薬指/小指のうち 2 本以上が畳まれている)を要求している。これは新しい curl トリガーと衝突する(発射の瞬間に gun-pose が崩れてしまう)。

新しい責務分割:

| 概念 | 旧 | 新 |
|---|---|---|
| **gun-pose** | indexExtended + 他 3 指畳み | **他 3 指(中指/薬指/小指)が畳まれている** のみ |
| **arming 条件** | (gun-pose 内に内包) | **`extended` ステート**(gun-pose とは別) |
| **fire signal** | 親指 pull (2 frame) | **`curled` ステート**(2 frame 連続) |

つまり「指差ししているか(= 人差し指の伸び)」は gun-pose ではなく **`curlState === 'extended'`** で表現される。`armed` フェーズに入った後は curl が `partial`/`curled` に変わっても gun-pose は維持される。

これにより:
- gun-pose は「銃の構え」の意味だけを担う
- curl ステートは「武装/狙い/発射」を担う
- `shotIntentStateMachine` は「gun-pose と curl の両方が満たされた時に何をするか」を司る

### D6. `HandFrame` の landmark 拡張

現状の 8 landmark に加えて以下を追加する。

```ts
// MediaPipe HandLandmarker indices
indexPip: 6  // 追加
indexDip: 7  // 追加
```

主判定 (D1) では使用しない。**将来、distance ratio で精度不足が出たときに角度ベース判定 (`indexMcp→indexPip`/`indexPip→indexTip` の角度) に切り替えるための予備**として今のうちに確保する。MediaPipe 側のランドマーク取得コストはゼロ(既に検出済み)、`HandFrame` 型と `createMediaPipeHandTracker` の `toHandFrame` を更新するだけ。

### D7. z 座標は計測のみで搭載、発火ロジックには載せない

PoC 初期は **`distance ratio + multi-frame confirmation + hysteresis` だけで発火を判定する**。

ただし `zDelta = indexTip.z - indexMcp.z` は **計測してデバッグパネルに表示する**。これにより:
- ライブテストで「distance ratio が安定しないシーン」が発見されたとき、z が手がかりになるか観測できる
- 後で z 加算を導入する判断材料になる

将来的に有効化する場合のスケッチ:
```ts
const zScore = clamp01(zDelta / zDeltaScale)
const zAssist = zScore * zAssistWeight  // weight は最大 0.05〜0.10
confidence = clamp01(distanceConfidence + zAssist)
```

`zAssistWeight` は **デフォルト 0**。デバッグパネルにスライダーは置くが、本 spec の実装範囲では値の保持と表示のみで、`measureIndexCurl` の confidence 計算には接続しない(D8 と整合)。将来 D7 のスケッチを実装する際にこのスライダー値を取り込む。

### D8. デバッグパネルへの追加

新規テレメトリ:
- `curlState` (`extended` / `partial` / `curled`)
- `tipToMcp ratio`(瞬時値)
- `zDelta`(瞬時値)
- 直近 30 フレームの `ratio min / median / max`(現地調整時に閾値を当てる手がかり。30 はリングバッファ長の固定値)

新規調整スライダー:
- `extendedThreshold` (0.9 〜 1.6)
- `curledThreshold` (0.4 〜 0.9)
- `zAssistWeight` (0 〜 0.10、デフォルト 0)。**スライダーは存在するが、本 spec の実装範囲では発火 confidence に接続しない**(D7 と整合)。値はメモリには持つがロジックには反映されない「観測用ダミー」とする。将来 D7 のスケッチを実装する際に接続する
- `smoothingAlpha` は現状維持

正規化ルール(必須不変条件):
- スライダー操作によらず `extendedThreshold > curledThreshold + HYSTERESIS_GAP` が常に成立すること
- 違反する操作が来たら、`triggerReleaseThreshold` の現状実装と同様に値を内側に押し戻す
- この正規化は `createDebugPanel` 内の `normalizeCurlThresholds` ヘルパとして実装する(`normalizeTriggerThresholds` と同じ責務分割)

撤去:
- `triggerPullThreshold` / `triggerReleaseThreshold` スライダー(親指トリガー削除に伴う)

### D9. 既存 `evaluateThumbTrigger` の扱い

完全削除する。

- `src/features/input-mapping/evaluateThumbTrigger.ts` を削除
- 親指関連の状態(`pulledFrames`, `openFrames`, `triggerState`, `rawTriggerState`, `triggerConfidence`)を `shotIntentState` から削除し、curl 系フィールドに置き換える
- 親指関連のテスト(`tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts`, `thumbTriggerTestHelper.ts`)を削除し、新しい `evaluateIndexCurl` のテストに置き換える
- `gameConfig.input.triggerPullThreshold` / `triggerReleaseThreshold` を削除し、`extendedThreshold` / `curledThreshold` / `zAssistWeight` に置き換える
- `HandFrame.landmarks.thumbTip` / `thumbIp` は他の用途で使う可能性があるため**残す**(削除は別 spec で扱う)

旧コードを残して両系統を共存させない。PoC は YAGNI と fail-fast を優先する。

## アーキテクチャと修正対象ファイル

### 新規ファイル

- `src/features/input-mapping/evaluateIndexCurl.ts`
  - エクスポート: `measureIndexCurl(frame, previousCurlState, tuning)` / `IndexCurlMeasurement` / `IndexCurlState` / `IndexCurlTuning`
  - **前ステート (`previousCurlState`) を引数に取る純関数**(`evaluateThumbTrigger.measureThumbTrigger` と同じパターン)。ヒステリシスを正しく実装するには前ステートが必要なため、3 値の遷移判定はこの関数内で完結させる
  - 戻り値: `{ rawCurlState, ratio, zDelta, confidence, details: { extendedThreshold, curledThreshold, hysteresisGap } }`
  - 決定的・ユニットテスト容易

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/shared/types/hand.ts` | `landmarks` に `indexPip`, `indexDip` を追加 |
| `src/features/hand-tracking/createMediaPipeHandTracker.ts` | `HAND_LANDMARK_INDEX` に PIP=6, DIP=7 を追加し `toHandFrame` で取得 |
| `src/shared/config/gameConfig.ts` | `triggerPullThreshold`/`triggerReleaseThreshold` を撤去し `extendedThreshold` / `curledThreshold` / `zAssistWeight` を追加 |
| `src/features/input-mapping/evaluateGunPose.ts` | `indexExtended` 条件を撤去し「他 3 指が畳まれている」のみで gun-pose を判定 |
| `src/features/input-mapping/createHandEvidence.ts` | `measureThumbTrigger` 呼び出しを `measureIndexCurl(frame, runtime.rawCurlState, tuning)` に置換。**state machine の呼び出しと runtime 更新は行わない**(`mapHandToGameInput` の責務)。返値は `HandEvidence` のみ。`HandEvidenceRuntimeState` に `rawCurlState`, `lastExtendedCrosshair`, `lockedCrosshair` を追加(これらは `mapHandToGameInput` から書き込まれる) |
| `src/features/input-mapping/mapHandToGameInput.ts` | D4.2 のフレーム順序 (a)-(f) を実装するオーケストレーション主体。`buildHandEvidence` → smoothing 候補計算 → `advanceShotIntentState` → `crosshairLockAction` 反映 → runtime 更新 → 最終 crosshair 決定 |
| `src/features/input-mapping/shotIntentStateMachine.ts` | `triggerState`/`rawTriggerState`/`triggerConfidence`/`pulledFrames`/`openFrames` を `curlState`/`rawCurlState`/`curlConfidence`/`curledFrames`/`extendedFrames` に置換。`armed → fired` の発火条件を `curled` の 2 フレーム連続に書き換え。`ShotIntentResult` に `crosshairLockAction: "none" \| "freeze" \| "release"` を追加(D4.2)。state machine 自体は副作用を持たない純関数のまま |
| `src/features/input-mapping/createCrosshairSmoother.ts` | **変更最小**。`smoothCrosshair` 純関数はそのまま。freeze/release はこのファイル側で持たず、`HandEvidenceRuntimeState` に `lastExtendedCrosshair` と `lockedCrosshair` を追加する形で D4.1 を実装する(モジュールグローバル状態を作らない) |
| `src/features/debug/createDebugPanel.ts` | スライダーとテレメトリの差し替え。直近 30 フレームの ratio min/median/max を保持するリングバッファを追加 |
| `src/app/...` のブートストラップ | 上記タイプ変更に追従する型エラーの解消 |

### 削除ファイル

- `src/features/input-mapping/evaluateThumbTrigger.ts`
- `tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts`
- `tests/unit/features/input-mapping/thumbTriggerTestHelper.ts`

### 影響を受ける既存テストファイル(更新が必要)

- `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts`(`HandFrame` への `indexPip`/`indexDip` 追加に伴うフィクスチャ更新)
- `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`(curl ステートと crosshair lock 経路の検証追加)
- `tests/unit/features/input-mapping/trackingLoss.test.ts`(追跡喪失で `lockedCrosshair` が解除されることを追加)
- `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`(全面書き換え)
- `tests/unit/features/debug/createDebugPanel.test.ts`(スライダー差し替えとテレメトリ拡張)
- `tests/unit/app/bootstrap/startApp.test.ts`(`gameConfig.input` のキー差し替えに伴う初期化コードの追従)
- `tests/e2e/issue30.acceptance.spec.ts`(現状の親指トリガー前提の検証があれば curl 前提に書き換え)

## データフロー

```
HandLandmarker
    │
    ▼
toHandFrame (新: indexPip/indexDip 追加)
    │
    ▼
mapHandToGameInput  (オーケストレーション主体)
    │
    ├── (a) buildHandEvidence(frame, runtime)
    │       ├── projectLandmarkToViewport(indexTip) ─▶ evidence.projectedCrosshairCandidate
    │       ├── measureIndexCurl(frame, runtime.rawCurlState, tuning)
    │       │       ───▶ { rawCurlState, ratio, zDelta, confidence }
    │       └── measureGunPose(frame)            ───▶ GunPoseMeasurement (緩和版)
    │
    ├── (b) evidence.curl.rawCurlState === "extended" のときだけ
    │       smoothCrosshair(runtime.lastExtendedCrosshair,
    │                       evidence.projectedCrosshairCandidate, alpha)
    │       ───▶ nextLastExtendedCrosshair
    │       (それ以外は runtime.lastExtendedCrosshair をそのまま伝搬)
    │
    ├── (c) advanceShotIntentState(prevShotState, evidence)
    │       ───▶ { state, shotFired, crosshairLockAction }
    │
    ├── (d) crosshairLockAction を見て nextLockedCrosshair を決定
    │       freeze   → (nextLastExtendedCrosshair !== undefined)
    │                  ? nextLastExtendedCrosshair
    │                  : runtime.lockedCrosshair        ← undefined ガード (D4.3)
    │       release  → undefined
    │       none     → runtime.lockedCrosshair を保持
    │
    ├── (e) runtime を更新 (rawCurlState / lastExtendedCrosshair / lockedCrosshair)
    │
    └── (f) 最終 crosshair = nextLockedCrosshair
                          ?? nextLastExtendedCrosshair
                          ?? evidence.projectedCrosshairCandidate
    │
    ▼
ゲームエンジン側 (shotFired と最終 crosshair を渡す)
```

## テスト戦略

### 新規ユニットテスト

`tests/unit/features/input-mapping/evaluateIndexCurl.test.ts`:
- 距離比が `extendedThreshold` を超えるフレームで `extended` を返すこと
- 距離比が `curledThreshold` を下回るフレームで `curled` を返すこと
- 中間帯で `partial` を返すこと
- ヒステリシス: 一度 `curled` に入ったら戻り境界まで `partial` に戻らないこと
- 鏡像(左右どちらの手)でも同じ判定になること
- handScale が大小でも同一の正規化結果になること
- 異常入力(landmark 欠損、handScale = 0)で例外を出さず安全側に倒すこと

`tests/unit/features/input-mapping/shotIntentStateMachine.test.ts` 拡張:
- `extended` 維持中は発射しないこと
- `partial` 遷移したフレームで `crosshairLockAction === "freeze"` を返すこと
- `partial` が 30 フレーム続いても `shotFired` が立たないこと(`partial` 単独で発火しない)
- `curled` 2 フレーム連続で `shotFired = true` になること
- 1 フレームだけ `curled` に入って戻ると発射しないこと(誤検知耐性)
- 発射後 `extended` に 2 フレーム連続戻るまで次の発射が出ないこと、その時点で `crosshairLockAction === "release"` が返ること
- cold start (`partial` または `curled` から始まる)で、`extended` を 2 フレーム経由しない限り `armed` に入らないこと
- 上記の cold start シナリオで `crosshairLockAction === "freeze"` を返さないこと(`armed` に到達していないため。state machine は runtime を参照しないので、理由はあくまで「`armed` 未到達」に限定)
- `armed` 中に curl が `partial`/`curled` に変わっても gun-pose を落とさないこと(D5 緩和の検証)
- 追跡喪失で `crosshairLockAction === "release"` が返ること
- gun-pose 喪失で `crosshairLockAction === "release"` が返ること

`tests/unit/features/input-mapping/mapHandToGameInput.test.ts` 拡張(D4.2 のオーケストレーション責務に対応するテストはここに集約):
- ロック中(`runtime.lockedCrosshair !== undefined`)はゲーム入力に渡る最終 crosshair が `lockedCrosshair` と一致すること
- ロック中の発射(`shotFired === true`)時、ショット座標 = `lockedCrosshair` であること
- `rawCurlState === "extended"` のフレームでは `lastExtendedCrosshair` が更新され、`partial`/`curled` フレームでは更新されないこと(D4.2 step (b) と D4.2.1 の検証)
- state machine が `crosshairLockAction === "freeze"` を返しても `nextLastExtendedCrosshair === undefined` の場合は `lockedCrosshair` が undefined のまま据え置かれること(D4.3 物理制約ガードの検証)
- `crosshairLockAction === "release"` を受け取ったフレームで `lockedCrosshair` が undefined にクリアされること
- 最終 crosshair の優先順位が `nextLockedCrosshair → nextLastExtendedCrosshair → evidence.projectedCrosshairCandidate` で解決されること

`tests/unit/features/input-mapping/evaluateGunPose.test.ts`(**新規作成**。現状は専用テストファイルがなく `mapHandToGameInput.test.ts` 等で間接的に検査されているのみ):
- 「他 3 指畳まれている」だけで gun-pose 成立すること
- 人差し指の状態(伸び/曲げ)が gun-pose 判定に影響しないこと

`tests/unit/features/debug/createDebugPanel.test.ts` 更新:
- 新しいスライダー、ratio min/median/max の表示
- **正規化不変条件のテスト**: `extendedThreshold ≤ curledThreshold + HYSTERESIS_GAP` となる入力(意図的な交差/接近)を渡したとき、`extendedThreshold` が `curledThreshold + HYSTERESIS_GAP` 以上に押し戻されること
- スライダーから無効値(NaN、範囲外)を渡したときに、最寄りの有効値にクランプされること
- `zAssistWeight` スライダーは値を保持・表示するだけで、`measureIndexCurl` の confidence 計算には接続されていないこと(D7/D8 の整合性検証)

### E2E

- 既存 `tests/e2e/app.smoke.spec.ts` で型・起動が壊れていないことだけ担保
- ライブテストでの判定品質はマニュアル確認(本 spec の検証は spec 単体ではなく、ライブで「子どもが指差して曲げて撃てるか」)

### 既存テストの撤去

- `evaluateThumbTrigger.test.ts` および `thumbTriggerTestHelper.ts` を削除
- `shotIntentStateMachine.test.ts` の親指関連アサーションを curl ベースに書き換え

## 受け入れ基準 (acceptance criteria)

- [ ] `evaluateIndexCurl` が単体テストで決定的に動作する
- [ ] `shotIntentStateMachine` が curl 3 値ステートで `partial → curled` の発射フローを満たす
- [ ] gun-pose 判定が「他 3 指畳まれている」のみで成立する
- [ ] クロスヘアが `partial` 遷移時にロックされ、発射時にずれない
- [ ] デバッグパネルに `curlState` / `tipToMcp ratio` / `zDelta` / `ratio min/median/max` が表示される
- [ ] `extendedThreshold` / `curledThreshold` のスライダーが動作し、変更が即座に判定に反映される
- [ ] `zAssistWeight` スライダーは値を保持・表示するが、本 spec の実装範囲では curl 判定結果に影響しない(D7/D8 と整合)
- [ ] スライダーの正規化不変条件 `extendedThreshold > curledThreshold + HYSTERESIS_GAP` が常に維持される
- [ ] 親指トリガー関連のソースとテストが完全に削除されている
- [ ] `lint` / `typecheck` / `test` がすべて通る
- [ ] ライブテストでの定量的検証(マニュアル):
  - 大人 1 名 + 子ども 2 名以上、各 10 試行で **意図した発射成功率 ≥ 80%**
  - 同じ条件で **意図しない発火(false fire)が 1 分あたり 2 回以下**
  - 計測は debug panel の `curlState` 履歴をもとに、テストプロトコル(別ノートに記録)で確認する

## 開いた懸念

以下は本 spec では決め切らず、実装時または次の spec で扱う:

1. **スナップロックの保持時間上限**: `partial` が長時間続いた場合(子どもが指を曲げ途中で止める)、いつまでロックを維持するか。本 spec では「`extended` に戻るまで保持」だが、ライブテストで実用上の上限が必要なら追加する
2. **発射クールダウン**: 連射防止のフレーム数。現状の `recovering` フェーズで足りるかライブで確認
3. **左右両手対応**: 現状 `numHands: 1`。両手対応は別 spec
4. **z 加算の有効化**: 本 spec では `zAssistWeight = 0` 起動。ライブテストで効果が見えたら別途値を決める

## 関連ドキュメント

- Issue #32: `Enhancement: replace thumb trigger with index-finger fire gesture`
- 前 spec: `docs/superpowers/specs/2026-04-08-poc-foundation-design.md`
- 直前の plan: `docs/superpowers/plans/2026-04-09-thumb-trigger-geometry-fix.md`(本 spec で意味的に廃止される)
- 関連実装: `src/features/input-mapping/evaluateThumbTrigger.ts`(削除対象)、`src/features/input-mapping/shotIntentStateMachine.ts`(改修対象)

## 補足: 主な設計判断の根拠

`docs/notes/` または PR の議論を都度参照すること。本 spec の決定の出典:

- **distance ratio 主判定** ← `fingerpose` 系コミュニティ実装 + Codex 助言
- **3 値ステート + partial スナップロック** ← Codex 助言「partial を直接発火条件にしない」
- **z は計測のみ・weight=0 デフォルト** ← MediaPipe Issue #742、複数開発者の z 値範囲不定報告、Codex 助言
- **gun-pose の責務再定義** ← Codex 助言「indexExtended は arming 条件側に移す」
- **HandFrame 拡張(PIP/DIP)** ← Codex 助言「最初から角度ベースへの逃げ道を残しておく」
