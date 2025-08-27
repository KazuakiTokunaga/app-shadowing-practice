# シャドーイングアプリ アーキテクチャ設計

## システム概要
個人使用向けのローカル実行型シャドーイングアプリ。英語学習者がOpenAI APIを活用した音声処理とGPTによるテキスト処理でシャドーイング練習を行うことができる。

## アプリケーション構成

### 全体アーキテクチャ
```
┌─────────────────┐    HTTP     ┌─────────────────┐    HTTPS    ┌─────────────────┐
│   Web Browser   │ ◄────────► │  Python Server  │ ◄────────► │   OpenAI API    │
│  (Chrome Only)  │             │   (Backend)     │             │  (GPT + Audio)  │
└─────────────────┘             └─────────────────┘             └─────────────────┘
         │                               │
         │ Web Audio API                 │ SQLite
         │                               │
┌─────────────────┐             ┌─────────────────┐
│   Microphone    │             │   Database      │
│   Speaker       │             │   (Local File)  │
└─────────────────┘             └─────────────────┘
```

### 環境変数設定
```bash
# .env ファイル
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=sqlite:///shadowing.db
```

### ブラウザ要件
- Google Chromeのみ
- **マイクアクセス許可必須**

## データベース設計

### テーブル構造

#### exercises（課題テーブル）
```sql
CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,  -- 原文全体（100-300単語）
    turns TEXT NOT NULL,    -- JSON形式のターン分割データ
    audio_file_path VARCHAR(500),  -- 全体音声ファイルパス（リスニング用）
    speech_rate FLOAT DEFAULT 1.0,  -- 音声再生速度（課題作成時の設定値）
    speech_voice VARCHAR(50) DEFAULT 'alloy',  -- 音声の種類（課題作成時の設定値）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### results（成績テーブル）
```sql
CREATE TABLE results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    total_score FLOAT NOT NULL,  -- 総合スコア（0-100）
    turn_scores TEXT NOT NULL,  -- JSON形式のターン別スコア
    turn_results TEXT NOT NULL, -- JSON形式のターン別認識結果
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id) ON DELETE CASCADE
);
```

#### settings（設定テーブル）
```sql
CREATE TABLE settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### データ構造詳細

#### 課題データ（exercises.turns）
```json
{
  "turns": [
    {
      "id": 1,
      "text": "Hello, my name is John and I work as a software engineer.",
      "word_count": 12,
      "audio_file_path": "audio/exercise_1_turn_1.mp3"
    },
    {
      "id": 2,
      "text": "I have been living in Tokyo for about five years now and I really enjoy the city life here.",
      "word_count": 18,
      "audio_file_path": "audio/exercise_1_turn_2.mp3"
    }
  ]
}
```

#### 成績データ（results.turn_scores, turn_results）
```json
{
  "turn_scores": [85.5, 92.0, 78.3],
  "turn_results": [
    {
      "turn_id": 1,
      "original": "Hello, my name is John.",
      "recognized": "Hello my name is John",
      "score": 85.5
    }
  ]
}
```

## API設計

### RESTful エンドポイント

#### 課題管理
```
GET    /api/exercises          # 課題一覧取得
POST   /api/exercises          # 課題作成（GPT-4o-miniでターン分割）
GET    /api/exercises/{id}     # 課題詳細取得（speech_rate含む）
PATCH  /api/exercises/{id}/title # 課題タイトルのみ更新
DELETE /api/exercises/{id}     # 課題削除
```

#### シャドーイング・リスニング実行
```
GET    /api/shadowing/{exercise_id}/listen   # リスニングモード（全体音声取得）
POST   /api/shadowing/{exercise_id}/start    # シャドーイング開始（ターン別音声取得）
POST   /api/shadowing/{exercise_id}/transcribe # 単一ターン音声書き起こし
POST   /api/shadowing/{exercise_id}/transcribe-batch # 複数ターン音声一括書き起こし
POST   /api/shadowing/{exercise_id}/result   # 結果保存（全体スコアのみ）
GET    /api/shadowing/{exercise_id}/results  # 過去の結果取得
GET    /api/shadowing/{exercise_id}/results/{result_id}  # 特定結果詳細取得
```

#### 設定管理
```
GET    /api/settings          # 設定取得
PUT    /api/settings          # 設定更新
GET    /api/settings/{key}    # 特定設定取得
PUT    /api/settings/{key}    # 特定設定更新
POST   /api/settings/reset    # 設定リセット
```

#### 音声ファイル管理
```
GET    /api/audio/{exercise_id}/full    # 全体音声ファイル取得（リスニング用）
GET    /api/audio/{exercise_id}/turn/{turn_id}  # ターン別音声ファイル取得
GET    /api/audio/{exercise_id}/info    # 音声ファイル情報取得
POST   /api/audio/{exercise_id}/regenerate  # 音声ファイル再生成
DELETE /api/audio/{exercise_id}         # 課題に関連する音声ファイル削除
```

### レスポンス形式
```json
{
  "success": true,
  "data": {...},
  "message": "操作が正常に完了しました",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## フロントエンド設計

### ページ構成（SPA）
```
/                    # シングルページアプリケーション
                     # - 課題管理タブ（課題一覧、作成、編集、削除）
                     # - 設定タブ
                     # - モーダル内で課題詳細、リスニング、シャドーイング実行
```

### アプリケーション構造
```javascript
// メインアプリケーションクラス
class ShadowingApp {
  constructor() {
    this.currentExercise = null;
    this.currentTurn = 0;
    this.totalTurns = 0;
    this.turns = [];
    this.recordings = [];
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.currentAudio = null;
    this.isRecording = false;
    this.isEditing = false;
  }
  
  // 主要メソッド
  init() { /* 初期化処理 */ }
  setupEventListeners() { /* イベントリスナー設定 */ }
  loadExercises() { /* 課題一覧読み込み */ }
  createExercise() { /* 課題作成 */ }
  startShadowing() { /* シャドーイング開始 */ }
  // ... その他のメソッド
}
```

### UI詳細仕様

#### 課題詳細モーダル
課題詳細モーダルは4つのタブで構成される：

1. **詳細タブ**
   - タイトル（編集可能）
   - 英文全体（読み取り専用）
   - 音声設定（課題作成時の設定値を表示）
     - 再生速度
     - 音声の種類
   - ターン分割結果の表示
   - 削除ボタン

2. **リスニングタブ**
   - 全体音声の再生コントロール
   - 再生位置のシークバー
   - テキスト表示

3. **シャドーイングタブ**
   - ターン別の音声再生と録音
   - 進捗状況の表示
   - 操作ボタン（開始、次へ、やり直し、完了）

4. **結果タブ**
   - 過去の実施結果一覧
   - スコアと日時の表示

### 主要機能の実装
```javascript
// 音声録音機能
async startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({audio: true});
  this.mediaRecorder = new MediaRecorder(stream);
  this.audioChunks = [];
  
  this.mediaRecorder.ondataavailable = (event) => {
    this.audioChunks.push(event.data);
  };
  
  this.mediaRecorder.onstop = () => {
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
    this.recordings[this.currentTurn] = audioBlob;
    this.onRecordingComplete();
  };
  
  this.mediaRecorder.start();
  this.isRecording = true;
}

// 音声再生機能
async playTurnAudio(exerciseId, turnId) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`/api/audio/${exerciseId}/turn/${turnId}`);
    audio.onended = resolve;
    audio.onerror = reject;
    this.currentAudio = audio;
    audio.play().catch(reject);
  });
}

// 採点機能
async transcribeRecordings() {
  const formData = new FormData();
  const turnIds = [];
  
  this.recordings.forEach((recording, index) => {
    if (recording) {
      formData.append('audio_files', recording, `turn_${index}.wav`);
      turnIds.push(this.turns[index].id);
    }
  });
  
  formData.append('turn_ids', JSON.stringify(turnIds));
  
  const response = await fetch(`/api/shadowing/${this.currentExercise.id}/transcribe-batch`, {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  return result.data.map(item => item.transcription);
}
```

## セキュリティ考慮事項

### データ保護
- **ローカル実行**: OpenAI API以外への外部通信なし、データは全てローカル保存
- **音声データ**: 
  - 生成された音声ファイルはローカルに保存（課題削除時に完全削除）
  - ユーザー録音データはOpenAI APIへの送信後は即座に削除、永続化しない
- **APIキー**: .envファイルで管理、Gitにコミットしない
- **データベース**: 適切なファイル権限設定（600）
- **音声ファイル**: 適切なディレクトリ権限設定、課題削除時の確実な削除

### 入力検証
- **SQL インジェクション対策**: SQLAlchemy ORM使用
- **XSS対策**: 入力値のエスケープ処理
- **ファイルアップロード制限**: テキストデータのみ

## パフォーマンス考慮事項

### フロントエンド最適化
- **遅延読み込み**: 大きな課題データの分割読み込み
- **キャッシュ**: 音声設定のローカルストレージ保存
- **レスポンシブ**: モバイル対応（タブレット想定）

### バックエンド最適化
- **データベース**: インデックス設定（exercise_id, created_at）
- **メモリ使用量**: 音声データの即座解放
- **ファイル管理**: 音声ファイルの効率的な保存・削除
- **並行処理**: FastAPIの非同期処理活用
- **音声生成**: バッチ処理による効率化

## 運用要件

### データ管理
- **バックアップ**: SQLiteファイルと音声ファイルディレクトリの定期コピー
- **容量監視**: 成績データと音声ファイルの蓄積量確認
- **クリーンアップ**: 
  - 古い成績データの削除機能
  - 孤立した音声ファイルの自動削除
  - 課題削除時の関連音声ファイル完全削除

## 実装の詳細

### 音声設定の管理
課題作成時の音声設定は以下のように管理される：

1. **設定値の取得**: 課題作成時に現在の設定から音声再生速度と音声の種類を取得
2. **データベース保存**: 
   - exercises テーブルの speech_rate カラムに再生速度を保存
   - exercises テーブルの speech_voice カラムに音声の種類を保存
3. **音声生成**: OpenAI TTS APIに設定された速度と音声タイプで音声を生成
4. **表示**: 課題詳細画面の詳細タブに作成時の設定値を表示

これにより、ユーザーは各課題がどの設定で音声生成されたかを後から確認できる。

## エラーハンドリング

### 音声関連エラー
```javascript
// マイクアクセス拒否
navigator.mediaDevices.getUserMedia({audio: true})
  .catch(err => {
    showError('マイクへのアクセスが必要です。Google Chromeの設定を確認してください。');
  });

// OpenAI API エラー
async function transcribeAudio(audioBlob) {
  try {
    const formData = new FormData();
    formData.append('audio_file', audioBlob);
    formData.append('turn_id', turnId);
    
    const response = await fetch(`/api/shadowing/${exerciseId}/transcribe`, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      throw new Error('音声認識に失敗しました');
    }
    return await response.json();
  } catch (error) {
    showError('音声の書き起こしでエラーが発生しました。もう一度お試しください。');
  }
}
```

### データベースエラー
```python
# FastAPI + SQLAlchemy エラー処理
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

async def create_exercise(exercise_data):
    try:
        # データベース操作
        await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="データベースエラーが発生しました")
```

### 音声ファイルエラー
```python
# 音声ファイル操作エラー処理
import aiofiles
import os

async def save_audio_file(audio_data, file_path):
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(audio_data)
    except IOError as e:
        logger.error(f"Audio file error: {e}")
        raise HTTPException(status_code=500, detail="音声ファイルの保存に失敗しました")

async def delete_audio_files(exercise_id):
    try:
        audio_dir = f"src/audio/exercises/{exercise_id}"
        if os.path.exists(audio_dir):
            shutil.rmtree(audio_dir)
    except OSError as e:
        logger.error(f"Audio deletion error: {e}")
        # 削除エラーは警告レベルで処理（致命的ではない）
```

### UI/UXエラー
- **ローディング状態**: 長時間処理の視覚的フィードバック
- **エラーメッセージ**: 日本語での分かりやすい説明
- **復旧オプション**: エラー後の適切な操作案内