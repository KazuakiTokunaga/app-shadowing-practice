---
title: シャドーイング練習アプリ
description: 英語シャドーイング練習アプリのセットアップ、使い方、開発構成
---

## シャドーイング練習アプリ

個人使用向けの英語シャドーイング練習アプリケーションです。TTS/STTモデルを使った音声処理で、効果的なシャドーイング練習を行うことができます。ローカル環境での使用を前提としています

## 主な機能

- **課題管理**: 英文（50-300単語）を入力してターン分割・音声作成
- **リスニング**: 課題全体の音声を聞いてリスニング練習
- **シャドーイング**: ターン別に音声を再生し、録音・採点を実行
- **成績管理**: シャドーイング結果の保存と履歴確認
- **設定**: 読み上げ速度、音声モデル、音声の種類を設定可能

## セットアップ

### 前提条件

- Python 3.10+
- uv パッケージマネージャー
- OpenAI API キー
- Microsoft Foundry API キーとエンドポイントURL（MAI-Voice-1またはMAI-Voice-2を利用する場合）
- Google Chrome ブラウザ（推奨）

### 利用手順

1. リポジトリをクローン
```bash
git clone https://github.com/KazuakiTokunaga/app-shadowing-practice.git
cd app-shadowing-practice
```

2. 依存関係をインストール
```bash
uv sync
```

3. 環境変数を設定
```bash
cp .env.example .env
# .envファイルを編集してOPENAI_API_KEYを設定
# MAI-Voice-1またはMAI-Voice-2を使う場合はFOUNDRY_API_KEYとFOUNDRY_ENDPOINT_URLも設定
```

4. データベースを初期化
```bash
uv run python init_db.py
```

5. アプリケーションを起動
```bash
# 開発モード
uv run python -m src.app

# または
uvicorn src.app:app --reload --host 0.0.0.0 --port 8000
```

6. ブラウザでアクセス
```text
http://localhost:8000
```

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

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **バックエンド**: Python 3.10+ (FastAPI)
- **データベース**: SQLite3
- **AI/音声処理**: TTS/STTプロバイダ
  - 音声作成: gpt-4o-mini-tts, MAI-Voice-1, MAI-Voice-2
  - 書き起こし: whisper-1
  - 外部モデル呼び出しは `services/model_providers/` に集約
- **パッケージ管理**: uv

### プロジェクト構造

```text
app-shadowing-practice/
├── src/
│   ├── app.py              # FastAPIメインアプリケーション
│   ├── models/             # SQLAlchemyモデル
│   │   ├── database.py     # データベース設定
│   │   ├── models.py       # データモデル
│   │   └── schemas.py      # Pydanticスキーマ
│   ├── routes/             # FastAPI ルーター
│   │   ├── exercises.py    # 課題管理API
│   │   ├── shadowing.py    # シャドーイング機能API
│   │   ├── audio.py        # 音声ファイル管理API
│   │   └── settings.py     # 設定管理API
│   ├── services/           # ビジネスロジック
│   │   ├── model_providers/         # 外部モデル連携
│   │   │   ├── tts.py               # TTSプロバイダ
│   │   │   ├── stt.py               # STTプロバイダ
│   │   │   └── tts_voices.py        # TTSモデルと音声定義
│   │   ├── speech_service.py        # 音声生成アプリケーションサービス
│   │   ├── transcription_service.py # 音声認識アプリケーションサービス
│   │   ├── turn_service.py          # ターン分割
│   │   └── scoring_service.py       # 採点
│   ├── static/             # 静的ファイル
│   │   ├── css/style.css   # スタイルシート
│   │   ├── js/app.js       # フロントエンドアプリケーション
│   │   └── templates/index.html # HTMLテンプレート
│   └── audio/              # 生成された音声ファイル
├── tests/                  # テストファイル
├── docs/                   # ドキュメント
├── .env.example           # 環境変数テンプレート
├── init_db.py             # データベース初期化スクリプト
├── pyproject.toml         # プロジェクト設定・依存関係
└── README.md              # このファイル
```

### ドキュメント

- docs/specification.md: 機能要件
- docs/architecture.md: 構成・設計

## 注意事項

- 利用すると、OpenAIやMicrosoft FoundryのAPI費用がかかります
- APIキーは.envファイルで管理し、Gitにコミットしないでください
- 音声データは録音後即座に書き起こし処理を行い、永続化されません
- Google Chrome推奨（Web Audio API使用）
