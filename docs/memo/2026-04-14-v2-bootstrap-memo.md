# BalloonShoot_v2 Bootstrap Memo

作成日: 2026-04-14

## 位置づけ

この文書は `BalloonShoot_v2` を 2 カメラ前提で立ち上げるための初期メモである。

`BalloonShoot_v2` は `BalloonShoot` の構成・設定・技術スタックを流用して作成した新規 repo であり、ここでは「開発を始める前に改善しておきたい点」と「すでに流用済みの資産」を整理する。

この文書は設計書ではない。v2 の正式仕様は、後続の spec が作成された時点でそちらを優先する。

## 開発前に改善しておきたい点

### 1. single-camera 前提の入力統合を最初から分割する

v1 の `src/features/input-mapping/mapHandToGameInput.ts` は、1 つの `HandDetection` から照準・トリガー・発射状態をまとめて `GameInputFrame` にする設計になっている。

v2 は 2 カメラ前提なので、最初から以下の 3 lane に分けた方がよい。

- `front camera -> aim lane`
- `side camera -> trigger lane`
- `fusion lane -> fused game input`

最初からここを分けておかないと、v1 の single-camera 前提を後から剥がすことになり、配線が崩れやすい。

### 2. 2 カメラ用の共有型を早めに確定する

v1 の `src/shared/types/hand.ts` はそのまま再利用しやすいが、v2 では上位契約が追加で必要になる。

たとえば次のような境界を早めに決めたい。

- `FrontHandDetection`
- `SideHandDetection`
- `AimInputFrame`
- `TriggerInputFrame`
- `FusedGameInputFrame`

これを先に決めることで、tracking / fusion / gameplay の依存方向を固定しやすくなる。

### 3. 時刻同期とキャリブレーションを先に設計する

2 カメラ構成では、検出精度そのものよりも「どの front frame とどの side frame を結びつけるか」が重要になる。

最低限、次の論点を先に設計した方がよい。

- どの timestamp で 2 系統を同期するか
- side の trigger を front の aim とどう束ねるか
- 一方の camera が落ちたときにどう degrade するか

### 4. debug / telemetry を lane ごとに分離する

v1 の debug は単一路線向けであり、2 カメラでは観測したい値が増える。

v2 では最初から以下を分けて出せるようにした方がよい。

- front camera telemetry
- side camera telemetry
- fusion telemetry

これにより「どちらの camera が悪いのか」「fusion が悪いのか」を切り分けやすくなる。

### 5. v1 の仕様文書は reference 扱いにする

v1 由来の spec / plan / memo は bootstrap 資産として有用だが、v2 の authority としてそのまま採用すると前提が混ざる。

したがって v2 では、既存の v1 文書を次のように扱うのがよい。

- フォルダ構造・品質ゲート・技術スタックの参考資料
- 入力や gameplay の正式仕様ではなく reference
- v2 の spec 作成後に superseded / replaced を明記する

## すでに配置済みの流用資産

この repo には、`BalloonShoot` から以下の資産をすでに配置している。

### 設定・ツールチェーン

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `vite.config.ts`
- `vitest.config.ts`
- `vitest.bench.config.ts`
- `playwright.config.ts`
- `eslint.config.mjs`
- `prettier.config.mjs`
- `.gitignore`
- `.prettierignore`
- `.coderabbit.yaml`
- `.github/`

### ドキュメント構造と作業ガイド

- `AGENTS.md`
- `CLAUDE.md`
- `docs/AGENTS.md`
- `docs/superpowers/`
- `docs/notes/`
- `docs/setup/`
- `src/**/AGENTS.md`
- `tests/**/AGENTS.md`
- `public/AGENTS.md`

### 実装資産

- `src/`
- `tests/`
- `scripts/`
- `public/`
- `index.html`
- `bench.html`

## 再利用の優先度

### そのまま流用しやすいもの

- `src/shared/`
- `src/features/hand-tracking/`
- `src/features/input-mapping/` 内の小さい判定器
- `tests/unit/` の幾何判定・入力判定のテストパターン
- lint / format / typecheck / test の設定一式

### 参考にはなるが、そのまま使わない方がいいもの

- `src/app/bootstrap/`
- single-camera 前提で統合された入力配線
- v1 の gameplay 固有仕様を前提にした設計文書

## 次にやるべきこと

1. v2 の 2-camera input architecture spec を新規作成する
2. front / side / fusion の 3 lane を前提とした型を定義する
3. capture / tracking / fusion の責務分離を先に決める
4. その後に gameplay を接続する
