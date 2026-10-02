# 人質タスク協定

仲間を人質に、サボりを封じろ。タスクを期限までに片付けないと、自分だけでなく仲間にも不名誉な称号がつくチーム向けタスク管理アプリ（技育ハッカソン2026 vol.5）。

## 主な画面

| パス | 画面 |
|---|---|
| `/login` | ログイン |
| `/` | チーム一覧 |
| `/teams/new` | チーム作成 |
| `/teams/:teamId` | チームのタスク一覧 |
| `/titles` | 称号一覧 |
| `/profile` | プロフィール |

ログイン画面以外は、未ログインだと `/login` にリダイレクトされます。

## セットアップ

必要なもの：Node.js 22以上、Java 21以上（Firestore Emulator用）

```bash
npm install
cp web/.env.example web/.env.local
```

`web/.env.local` はそのまま（`VITE_USE_EMULATOR=true`）で、ローカルのEmulatorに接続されます。

## 開発の始め方

ターミナルを2つ開いて、それぞれで実行します。

```bash
npm run emulators   # Firebase Emulator（Auth / Firestore / Functions / Hosting）
npm run dev         # 画面 http://localhost:5173
```

Emulatorの管理画面は http://localhost:4000 です。

Functionsを書き換えたら、別ターミナルで `npm run fn:watch` を動かしておくとEmulatorに自動反映されます。

### Emulatorのデータ

| フォルダ | 役割 | Git |
|---|---|---|
| `seed/` | チーム共有の初期データ（ダミーユーザー・称号マスタなど） | コミットする |
| `emulator-data/` | 各自の作業データ | 管理外 |

- `npm run emulators`：毎回 `seed/` の状態から起動し、終了時に `emulator-data/` へ保存します
- `npm run emulators:resume`：前回の `emulator-data/` から続きで起動します
- `npm run emulators:seed`：共有の初期データを編集したいときに使います。Emulator UI で編集して Ctrl+C で終了すると `seed/` に保存されるので、コミットして共有してください

## その他のコマンド

### PWA（ホーム画面に追加）

本番ビルドでは、アプリをホーム画面に追加して単独のウィンドウで開けます。Chrome / Edgeはブラウザーのインストール操作、iPhoneはSafariの共有メニューから「ホーム画面に追加」を使います。

開発用の `npm run dev` ではService Workerを有効にしません。ローカルで確認するときは、エミュレータを起動した状態で次を実行してください。

```bash
npm install
npm run build -w web
npm run preview -w web -- --host 127.0.0.1 --port 4173 --strictPort
```

通常モードのブラウザーで `http://127.0.0.1:4173` を開いて確認します。画面の静的ファイルはキャッシュしますが、ログインやタスクの取得・保存には通信が必要です。新しいバージョンを検出すると、更新するか選べる通知を表示します。

詳しい確認手順と本番導入の注意点は [PWAの手順](docs/PWA.md) を参照してください。

### 期限切れチームの自動削除

`cleanupExpiredTeams` は毎日午前0時（日本時間）に、チーム期限 `goalDueDate` から7日経過したチームと配下のタスクを削除します。例：期限が `2026-10-01` なら `2026-10-08` 午前0時から対象です。期限未設定の既存チームは残します。

Emulatorでは定期処理が自動実行されないため、ログイン後に `runExpiredTeamCleanup` を手動で呼び出せます（本番では実行不可）。フロントのコードから呼ぶ例：

```ts
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

const result = await httpsCallable(functions, 'runExpiredTeamCleanup')()
console.log(result.data) // { deletedTeamCount: 削除したチーム数 }
```

専用のFirestore Emulatorで自動テストする場合：

```bash
npm run build -w functions
npx firebase emulators:exec --config functions/tests/firebase.expired-teams.json --only firestore --project demo-expired-team-tests "node functions/tests/expired-teams.cjs"
```

```bash
npm run build    # web + functions のビルド
npm run lint     # web の Lint（oxlint + eslint）
npm run format   # prettier で web / functions / shared を整形
```

## フォルダ構成

```
web/                 画面（Vue 3 + Vite + Tailwind CSS 4 + VueFire）
  src/views/         画面単位のコンポーネント
  src/layouts/       共通レイアウト（AppLayout.vue）
  src/composables/   Firestore へのアクセス（useTeams, useTeamTasks など）
  src/lib/firebase.ts  Firebase の初期化
functions/           Cloud Functions v2（称号判定など）
shared/              フロントとFunctionsで共通の型・Zodスキーマ
seed/                Emulator の共有初期データ
firestore.rules      Security Rules
```

`shared/` は `import { ... } from '@hitojichi/shared'` で読み込めます。

開発ルール（用語・コーディング規約・デザイン方針）は [AGENTS.md](AGENTS.md) にまとめています。

## 本番へのデプロイ

`.firebaserc` に本番プロジェクトが `prod` エイリアス（`hitojichi-task-kyotei`）として登録済みで、`npm run deploy` は常に本番へデプロイします（Hosting / Firestore / Functions）。

1. `web/.env.production.local` を作り、Firebaseコンソールの本番の値を入れて `VITE_USE_EMULATOR=false` にする（ビルド時は `.env.local` より優先されます）
2. 以下を実行する

```bash
npx firebase login
npm run deploy
```
