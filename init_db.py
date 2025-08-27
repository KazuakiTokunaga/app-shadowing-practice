"""
データベース初期化スクリプト
"""
import asyncio

from src.models.database import AsyncSessionLocal, Base, engine
from src.models.models import Setting


async def init_database():
    """データベースとテーブルを作成する"""
    print("データベースを初期化しています...")

    # テーブル作成
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("テーブルが作成されました。")

    # 初期設定データを挿入
    async with AsyncSessionLocal() as session:
        # デフォルト設定を確認・挿入
        default_settings = [
            ("speech_rate", "1.0"),
            ("speech_voice", "alloy"),
            ("volume", "1.0"),
        ]

        for key, value in default_settings:
            # 既存の設定があるかチェック
            existing = await session.get(Setting, key)
            if not existing:
                setting = Setting(key=key, value=value)
                session.add(setting)

        await session.commit()
        print("デフォルト設定が挿入されました。")

    print("データベースの初期化が完了しました。")


if __name__ == "__main__":
    asyncio.run(init_database())
