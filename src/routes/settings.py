from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.models import Setting
from ..models.schemas import APIResponse, SettingUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/", response_model=APIResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """全ての設定を取得する"""
    try:
        stmt = select(Setting)
        result = await db.execute(stmt)
        settings = result.scalars().all()

        # 設定をディクショナリ形式で返す
        settings_dict = {}
        for setting in settings:
            # 数値の設定は適切な型に変換
            if setting.key == "speech_rate":
                try:
                    settings_dict[setting.key] = float(setting.value)
                except ValueError:
                    settings_dict[setting.key] = setting.value
            else:
                settings_dict[setting.key] = setting.value

        return APIResponse(success=True, data=settings_dict, message="設定を取得しました")

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"設定の取得に失敗しました: {str(e)}"
        )


@router.put("/", response_model=APIResponse)
async def update_settings(settings_data: SettingUpdate, db: AsyncSession = Depends(get_db)):
    """設定を更新する"""
    try:
        updated_settings = {}

        # 各設定項目を更新
        if settings_data.speech_rate is not None:
            await _update_setting(db, "speech_rate", str(settings_data.speech_rate))
            updated_settings["speech_rate"] = settings_data.speech_rate

        if settings_data.speech_voice is not None:
            await _update_setting(db, "speech_voice", settings_data.speech_voice)
            updated_settings["speech_voice"] = settings_data.speech_voice

        await db.commit()

        return APIResponse(success=True, data=updated_settings, message="設定を更新しました")

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"設定の更新に失敗しました: {str(e)}"
        )


@router.get("/{key}", response_model=APIResponse)
async def get_setting(key: str, db: AsyncSession = Depends(get_db)):
    """特定の設定を取得する"""
    try:
        stmt = select(Setting).where(Setting.key == key)
        result = await db.execute(stmt)
        setting = result.scalar_one_or_none()

        if not setting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"設定キー '{key}' が見つかりません")

        # 数値の設定は適切な型に変換
        value = setting.value
        if key == "speech_rate":
            try:
                value = float(setting.value)
            except ValueError:
                pass

        data = {"key": setting.key, "value": value, "updated_at": setting.updated_at}

        return APIResponse(success=True, data=data, message=f"設定 '{key}' を取得しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"設定の取得に失敗しました: {str(e)}"
        )


@router.put("/{key}", response_model=APIResponse)
async def update_setting(key: str, value: str, db: AsyncSession = Depends(get_db)):
    """特定の設定を更新する"""
    try:
        # 設定値の検証
        validated_value = _validate_setting_value(key, value)

        await _update_setting(db, key, validated_value)
        await db.commit()

        # レスポンス用の値を適切な型に変換
        response_value = validated_value
        if key == "speech_rate":
            try:
                response_value = float(validated_value)
            except ValueError:
                pass

        data = {"key": key, "value": response_value}

        return APIResponse(success=True, data=data, message=f"設定 '{key}' を更新しました")

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"設定の更新に失敗しました: {str(e)}"
        )


@router.post("/reset", response_model=APIResponse)
async def reset_settings(db: AsyncSession = Depends(get_db)):
    """設定をデフォルト値にリセットする"""
    try:
        default_settings = [
            ("speech_rate", "1.0"),
            ("speech_voice", "alloy"),
        ]

        for key, value in default_settings:
            await _update_setting(db, key, value)

        await db.commit()

        # リセット後の設定を取得
        reset_settings_dict = {}
        for key, value in default_settings:
            if key == "speech_rate":
                reset_settings_dict[key] = float(value)
            else:
                reset_settings_dict[key] = value

        return APIResponse(success=True, data=reset_settings_dict, message="設定をデフォルト値にリセットしました")

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"設定のリセットに失敗しました: {str(e)}"
        )


async def _update_setting(db: AsyncSession, key: str, value: str):
    """設定を更新するヘルパー関数"""
    stmt = select(Setting).where(Setting.key == key)
    result = await db.execute(stmt)
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = value
    else:
        # 設定が存在しない場合は新規作成
        setting = Setting(key=key, value=value)
        db.add(setting)


def _validate_setting_value(key: str, value: str) -> str:
    """設定値を検証するヘルパー関数"""
    if key == "speech_rate":
        try:
            rate = float(value)
            if not (1.0 <= rate <= 2.0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="speech_rate は 1.0 から 2.0 の範囲で設定してください",
                )
            # 0.1刻みに丸める
            rate = round(rate, 1)
            return str(rate)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="speech_rate は数値で設定してください")

    elif key == "speech_voice":
        allowed_voices = [
            "alloy",
            "ash",
            "ballad",
            "coral",
            "echo",
            "fable",
            "onyx",
            "nova",
            "sage",
            "shimmer",
            "verse",
        ]
        if value not in allowed_voices:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"speech_voice は次の値から選択してください: {', '.join(allowed_voices)}",
            )
        return value

    else:
        # 未知の設定キーでも受け入れて文字列として保存
        return value
