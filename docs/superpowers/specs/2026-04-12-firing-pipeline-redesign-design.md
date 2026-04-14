# Firing Pipeline Redesign Design

作成日: 2026-04-12

## 位置づけ

この文書は、`BalloonShoot` の発射入力パイプラインを再設計するための設計書である。

対象は `src/features/input-mapping/` を中心とした発射判定の内部構造であり、外部契約としての `HandDetection -> GameInputFrame` と、PoC の正式入力である `ゆるい銃型ポーズ + 親指トリガー状態の変化` は維持する。

この文書は、`docs/superpowers/plans/2026-04-12-firing-stability-hardening.md` の architecture 節にある「既存 state machine を強化する」前提を supersede する。今後は、既存 state machine への追加補償ではなく、conditioned trigger を導入して firing state machine を薄くする前提で計画を更新する。

## 背景

既存の発射パイプラインは、`createHandEvidence()` で `crosshair` / `gunPose` に `filteredFrame` を使い、`trigger` にだけ `rawFrame` を使っている。このため、照準系と発射系で時間特性がずれた signal が downstream へ流れている。

さらに、`shotIntentStateMachine` は tracking loss、pose grace、stable aim、trigger debounce、cooldown、armed-entry の補償を 1 つの state machine に集約している。その結果、誤発射抑制のための条件追加が増えるほど、撃ちたい時に撃てない理由の切り分けが難しくなる。

replay fixture と比較 bench の結果からも、strict な gun pose gate を通した時点で hitSegments が頭打ちになり、後段の複雑な state machine を追加しても大きな改善が出ていない。したがって、主戦場は「下流で救う」ことではなく、「発火コミットしやすい signal を upstream で作る」ことにある。

## ゴール

- `撃ちたい時に撃てる` を最優先にした発射パイプラインへ再設計する
- 誤発射は PoC として目立たない範囲に抑える
- `HandDetection -> GameInputFrame` の外部契約を維持する
- `mapHandToGameInput()` を orchestration seam として維持する
- replay fixture / intent comparison / debug telemetry を使って before/after を比較しやすくする
- 将来 Aim lane / Fire lane 分離へ進む場合も、今回の設計が自然な前段となるようにする

## 対象範囲

この設計書の対象は以下に限る。

- `src/features/input-mapping/` の内部責務分割
- `src/shared/config/gameConfig.ts` の firing 関連 tuning の見直し方針
- `src/features/debug/createDebugPanel.ts` と `src/app/bootstrap/startApp.ts` の観測点の整理方針
- replay / bench / unit test を使った検証方針

以下はこの設計書の対象外とする。

- 正式入力契約の変更
- MediaPipe 以外への認識基盤変更
- Aim lane / Fire lane を完全に分離した新アーキテクチャへの移行
- gameplay 側の hit 判定や score system の変更

## 優先順位

設計判断の優先順位は以下とする。

1. 撃ちたい時に撃てること
2. 誤発射が目立たないこと
3. UX 契約を変えないこと
4. デバッグと tuning の見通しが良いこと

## 設計方針

### A 案を採用する理由

今回採用するのは、`conditioned trigger + thinner firing FSM` の A 案である。

Aim lane / Fire lane を分離する B 案は、長期的な概念整理としては有効だが、現状の repo はすでに `rawFrame` / `filteredFrame`、`crosshair` / `gunPose` / `trigger` の分離を持っている。現時点の主ボトルネックは lane 未分離ではなく、最後段の `shotIntentStateMachine` に責務が集中しすぎていることである。

そのため、まずは既存 seam を維持しながら firing 専用 signal と thin FSM に整理し、その後も必要であれば B 案へ進める二段構えを採る。

### 基本原則

- 観測事実と発射判断を分ける
- trigger の raw geometry をそのまま final fire gate にしない
- firing state machine は「最後のコミット判定」に限定する
- 調整 UI と debug telemetry は gameplay rules から独立させる
- replay bench で比較できる state と signal を増やし、原因を bench 側で説明できるようにする

## ターゲットアーキテクチャ

発射パイプラインの内部構造を、以下の 4 層に再整理する。

1. **Observation layer**
   - `rawFrame` と `filteredFrame` から観測量を生成する
   - ここでは shot を決めない

2. **Conditioned trigger layer**
   - raw trigger geometry を、時間的に扱いやすい firing signal に変換する
   - 最終目標は「即時二値 state」ではなく、commit 向きの scalar / edge candidate を作ること
   - 実装単位としては `src/features/input-mapping/conditionTriggerSignal.ts` を追加し、`ConditionedTriggerState` を更新する

3. **Thin firing FSM**
   - one-shot latch、cooldown、tracking-lost 安全リセットだけを担う
   - complex な aim 補償や pose recovery を大量に持たない

4. **Output adaptation layer**
   - `GameInputFrame` と `runtime` を組み立て、既存 contract を維持する

この設計により、責務は以下の流れになる。

`raw/filtered detection -> evidence -> conditioned trigger -> thin firing FSM -> shot edge`

## モジュール責務

### `createHandEvidence.ts`

`createHandEvidence` は Observation layer として維持する。

ここで返す責務は「観測事実」のみである。具体的には以下を扱う。

- `crosshair`
- `crosshairDelta`
- `stableCrosshair`
- `gunPoseConfidence`
- `gunPoseEligible`
- raw trigger projection
- conditioned trigger input に必要な中間値

ここで `shotFired` や phase 遷移を決めてはならない。

### `evaluateThumbTrigger.ts`

`evaluateThumbTrigger` は raw thumb geometry を扱う低レベル classifier として維持する。

ただし、その出力は最終的な firing decision ではなく、conditioned trigger layer の入力とする。raw hysteresis の結果をそのまま firing commit に使う構造は避ける。

### `mapHandToGameInput.ts`

`mapHandToGameInput` は orchestration seam として維持する。

役割は以下に限定する。

- evidence を組み立てる
- `ConditionedTriggerState` を更新する
- thin firing FSM を進める
- `GameInputFrame` と `runtime` を返す

ここに gameplay rules や browser-specific workaround を増やしてはならない。

### `shotIntentStateMachine.ts`

`shotIntentStateMachine` は firing commit 用の thin FSM へ再編する。

この FSM に残す責務は以下とする。

- `armed` かどうか
- pull edge を one-shot commit として確定すること
- cooldown 中の re-fire 抑制
- tracking loss 時の安全リセット

以下の責務は、可能な限り evidence / conditioned trigger 側へ戻す。

- stable aim の長い蓄積
- armed-entry を救済する複雑な confidence 補償
- strong pull override のような例外救済
- pose recovery の多段 grace

## データモデル方針

### Conditioned trigger

conditioned trigger layer は、新しい firing 専用 signal として `ConditionedTriggerState` を持つ。

この state は、意味として以下を満たす必要がある。

- raw trigger 変化を保持する
- filtered/temporal smoothing の恩恵を受ける
- `open -> pulled` の edge 判定に使える
- held level と edge を区別できる

必要な概念は以下である。

- `triggerScalar`: 発火に近い連続量
- `triggerEdgeCandidate`: 今この瞬間に commit 候補があるか
- `triggerReleaseCandidate`: latch を解除してよいか

この layer は、UX を殺さないために過剰な dwell を持たない。短い temporal confirmation は許容するが、発火感を鈍らせる長い待機は避ける。

### Gun pose

gun pose は hard gate ではなく、fire eligibility を決める補助 signal として扱う。

PoC の正式入力契約は維持するので gun pose 自体は必要だが、「少し pose が弱いだけで全部 veto」する構造は避ける。最終発火の主役は thumb-trigger change とし、gun pose は firing eligibility の補助に寄せる。

## State model

thin FSM の最小 phase は以下を基準とする。

- `idle`
- `armed`
- `cooldown`
- `tracking_lost`

`ready` / `recovering` / `waiting_for_stable_aim` のような細かい意味は、phase として増やすのではなく、必要であれば reject reason や telemetry で説明する。

phase を増やすより、以下の state を最小限保持する方を優先する。

- trigger latch state
- cooldown remaining
- current fire eligibility
- tracking present

## エラー時の扱い

- tracking loss では stale shot を出さず、安全に reset する
- cooldown 中は同じ pull から複数発を出さない
- pose instability は、即 hard veto ではなく fire eligibility の低下として扱う
- trigger ambiguity は level 維持ではなく edge commit 側で抑える

## Debug / Telemetry 方針

`createDebugPanel.ts` と `startApp.ts` の責務は維持する。

ただし A 案では、phase/reject/counters だけでなく、conditioned trigger の中間状態を観測できるようにする。

少なくとも次の観測点は bench または debug telemetry から見えるようにする。

- conditioned trigger scalar
- trigger edge candidate
- fire eligibility
- cooldown remaining
- shot fired marker

既存の raw/filter trigger projection と組み合わせることで、「raw geometry はあるのに commit できなかった」のか、「conditioned trigger が弱い」のかを切り分けられるようにする。

## Bench / Test 方針

### replay / intent comparison

既存の replay fixture と `intentComparison` bench は維持する。

新設計では、少なくとも以下の比較ができるようにする。

- current pipeline
- conditioned trigger + thin FSM
- raw trigger + thin FSM（比較用）

### bench で説明できるようにすること

shots / hitSegments / missedSegments / multiShotSegments だけではなく、以下の「なぜそうなったか」を説明できるようにする。

- reject reason at peak
- trigger scalar at peak
- fire eligibility at peak
- cooldown state at peak

### unit test

unit test の中心は以下とする。

- conditioned trigger の edge / release 挙動
- thin FSM の one-shot latch
- cooldown 後の再発火条件
- tracking loss reset
- `mapHandToGameInput` の external contract 維持

## 既存ドキュメントとの関係

- `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` の正式入力契約を維持する
- `docs/superpowers/plans/2026-04-12-firing-stability-hardening.md` は、実行 plan としては一度見直し対象にする
- 今後の execution plan は、この文書を前提に `conditioned trigger + thin FSM` に更新する

## 採用しない案

### B 案: Aim lane / Fire lane の完全分離

長期的な概念整理としては魅力があるが、現時点では repo の seam を一段大きく変える。lane 間同期という新しいデバッグ軸も生むため、PoC の現段階では採用しない。

### C 案: 発火セマンティクス自体の変更

thumb trigger 以外の離散 gesture に寄せる案は、UX 契約変更コストが高い。A 案で改善余地を使い切る前に採用しない。

## この設計が確定したこと

- 発射パイプラインの主戦場は、state machine の追加補償ではなく conditioned trigger に置く
- firing FSM は thin commit machine へ整理する
- gun pose は補助 signal として扱い、hard veto を減らす
- replay / debug の観測点を増やし、原因が説明できる bench へ寄せる
- 今回は A 案を採用し、B 案は将来の拡張候補として残す
