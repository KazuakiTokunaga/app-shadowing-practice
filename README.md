# シャドーイング練習アプリ

個人使用向けの英語シャドーイング練習アプリケーションです。OpenAI APIを活用した音声処理で、効果的なシャドーイング練習を行うことができます。フロントエンド（Next.js）とバックエンド（FastAPI）が分離された構成です。

## 主な機能

- **課題管理**: 英文（50-300単語）を入力してターン分割・音声作成
- **リスニング**: 課題全体の音声を聞いてリスニング練習
- **シャドーイング**: ターン別に音声を再生し、録音・採点を実行
- **成績管理**: シャドーイング結果の保存と履歴確認
- **設定**: 音声の速度と種類を設定可能

## セットアップ

### 前提条件

- Python 3.10+
- Node.js 20.9+（フロントエンド用。Next.js 16 の要件）
- uv パッケージマネージャー
- OpenAI API キー
- Google Chrome ブラウザ（推奨）

#### Node.js のバージョン（フロントエンド）

現在 Node.js 18 の場合は、次のいずれかで Node 20 を用意してください。

**nvm を使う場合（推奨）**

1. [nvm](https://github.com/nvm-sh/nvm) を未導入ならインストール:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
   ```
   インストール後、ターミナルを開き直す。

2. Node 20 をインストールして使用:
   ```bash
   nvm install 20
   nvm use 20
   ```
   または、フロントエンドのディレクトリで（`frontend/.nvmrc` に 20 と書いてあるので）:
   ```bash
   cd frontend
   nvm use
   ```
   とすると Node 20 に切り替わります。

**Homebrew で Node 20 を入れる場合**

```bash
brew install node@20
```

その後、フロントエンドの起動時は `node@20` が使われるように PATH を合わせてから `npm run dev` を実行してください。

### 利用手順

1. リポジトリをクローン
```bash
git clone https://github.com/KazuakiTokunaga/app-shadowing-practice.git
cd app-shadowing-practice
```

2. **バックエンド**の依存関係をインストール
```bash
uv sync
```

3. 環境変数を設定
```bash
# バックエンド用
cp .env.example .env
# .env を編集して OPENAI_API_KEY を設定（必要に応じて CORS_ORIGINS も設定）

# フロントエンド用（バックエンドのURLを指定）
cp frontend/.env.local.example frontend/.env.local
# 開発時は http://localhost:8000 のままでOK
```

4. データベースを初期化
```bash
uv run python init_db.py
```

5. **バックエンド**を起動（ターミナル1）
```bash
uv run python -m src.app
# または: uvicorn src.app:app --reload --host 127.0.0.1 --port 8000
```

6. **フロントエンド**を起動（ターミナル2）
```bash
cd frontend
npm install
npm run dev
```

7. ブラウザでアクセス
```
http://localhost:3000
```
（バックエンドは http://localhost:8000 でAPIのみ提供）

## 使用方法

### 1. 課題作成
1. 「新しい課題を作成」ボタンをクリック
2. タイトル（任意）と英文（50-300単語）を入力
3. 自動的にターンに分割され、音声ファイルが生成されます

### 2. リスニング練習
1. 課題を選択して「リスニング」タブをクリック
2. 「再生」ボタンで全体音声を聞きます

### 3. シャドーイング練習
1. 課題を選択して「シャドーイング」タブをクリック
2. 各ターンで「開始」ボタンを押すと音声読み上げと録音が同時開始
3. 英語テキストは表示されず、音声のみでシャドーイング練習
4. 音声読み上げ完了後「次へ」ボタンで次のターンへ進行（または録音開始から20秒で自動停止）
5. 全ターン完了後、自動採点が行われます

### 4. 結果確認
1. 「結果」タブで過去のシャドーイング履歴を確認
2. 各結果をクリックすると詳細な採点結果が表示されます

## 開発

### 技術スタック

- **フロントエンド**: Next.js (App Router), TypeScript, Tailwind CSS
- **バックエンド**: Python 3.10+ (FastAPI)、API専用（HTML/静的配信なし）
- **データベース**: SQLite3
- **AI/音声処理**: OpenAI API (Whisper, TTS)
  - 音声作成: gpt-4o-mini-tts
  - 書き起こし: whisper-1
- **パッケージ管理**: uv（バックエンド）, npm（フロントエンド）

### プロジェクト構造

```
app-shadowing-practice/
├── frontend/               # Next.js フロントエンド
│   ├── app/                # App Router ページ
│   │   ├── page.tsx        # 課題一覧
│   │   ├── settings/       # 設定ページ
│   │   └── exercises/[id]  # 課題詳細（詳細/リスニング/シャドーイング/結果）
│   ├── lib/                # APIクライアント・型定義
│   └── .env.local.example
├── src/
│   ├── app.py              # FastAPIメイン（API専用・CORS対応）
│   ├── models/
│   ├── routes/             # APIルーター
│   ├── services/
│   └── audio/              # 生成された音声ファイル
├── tests/
├── docs/
├── .env.example            # バックエンド用（CORS_ORIGINS は任意）
├── init_db.py
├── pyproject.toml
└── README.md
```

### ドキュメント

- docs/specification.md: 機能要件
- docs/architecture.md: 構成・設計

## 注意事項

- 利用すると、OpenAIのAPI費用がかかります
- OpenAI APIキーは.envファイルで管理し、Gitにコミットしないでください
- 音声データは録音後即座に書き起こし処理を行い、永続化されません
- Google Chrome推奨（Web Audio API使用）