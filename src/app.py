import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models.database import Base, engine
from .routes import audio, exercises, settings, shadowing


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフサイクル管理"""
    # 起動時の処理
    print("シャドーイングアプリを起動しています...")

    # データベースのテーブル作成
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("データベースの初期化が完了しました")
    yield

    # 終了時の処理
    print("シャドーイングアプリを終了しています...")


# FastAPIアプリケーション作成
app = FastAPI(
    title="シャドーイング練習アプリ",
    description="個人使用向けの英語シャドーイング練習アプリケーション",
    version="1.0.0",
    lifespan=lifespan
)

# CORS設定（ローカル検証用に全オリジン許可。本番では CORS_ORIGINS で制限すること）
_cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
if _cors_origins_env:
    _cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ルーターの登録
app.include_router(exercises.router)
app.include_router(shadowing.router)
app.include_router(audio.router)
app.include_router(settings.router)


@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "message": "シャドーイングアプリは正常に動作しています"}


def start_dev_server():
    """開発サーバーを起動する"""
    uvicorn.run(
        "src.app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )


def start_prod_server():
    """本番サーバーを起動する"""
    uvicorn.run(
        "src.app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=False,
        log_level="warning"
    )


if __name__ == "__main__":
    # 直接実行された場合は開発サーバーを起動
    start_dev_server()
