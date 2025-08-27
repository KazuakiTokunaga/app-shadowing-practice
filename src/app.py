import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

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

# CORS設定（開発時のみ）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静的ファイルのマウント
app.mount("/static", StaticFiles(directory="src/static"), name="static")

# ルーターの登録
app.include_router(exercises.router)
app.include_router(shadowing.router)
app.include_router(audio.router)
app.include_router(settings.router)


@app.get("/", response_class=HTMLResponse)
async def read_root():
    """ルートページ - メインのSPAページを返す"""
    try:
        with open("src/static/templates/index.html", "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content, status_code=200)
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>エラー: テンプレートファイルが見つかりません</h1>",
            status_code=500
        )


@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "message": "シャドーイングアプリは正常に動作しています"}


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """404エラーハンドラー - SPAなので全てのパスでindex.htmlを返す"""
    return await read_root()


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
