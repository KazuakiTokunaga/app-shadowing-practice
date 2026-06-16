from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.models import Setting
from ..models.schemas import APIResponse, SettingUpdate
from ..services.model_providers import (
    ALLOWED_TTS_MODELS,
    ALLOWED_TTS_VOICES,
    OPENAI_TTS_MODEL,
    get_default_voice_for_model,
    get_model_for_voice,
    is_voice_allowed_for_model,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/", response_model=APIResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """全ての設定を取得する"""
    try:
        stmt = select(Setting)
        result = await db.execute(stmt)
        settings = result.scalars().all()

        # 設定をディクショナリ形式で返す
        settings_dict: dict[str, object] = {}
        for setting in settings:
            setting_key = str(setting.key)
            setting_value = str(setting.value)
            # 数値の設定は適切な型に変換
            if setting_key == "speech_rate":
                try:
                    settings_dict[setting_key] = float(setting_value)
                except ValueError:
                    settings_dict[setting_key] = setting_value
            else:
                settings_dict[setting_key] = setting_value

        if "speech_voice" not in settings_dict:
            settings_dict["speech_voice"] = get_default_voice_for_model(OPENAI_TTS_MODEL)
        if "speech_model" not in settings_dict:
            settings_dict["speech_model"] = get_model_for_voice(str(settings_dict["speech_voice"]))
        if not is_voice_allowed_for_model(str(settings_dict["speech_voice"]), str(settings_dict["speech_model"])):
            settings_dict["speech_voice"] = get_default_voice_for_model(str(settings_dict["speech_model"]))

        return APIResponse(success=True, data=settings_dict, message="設定を取得しました")

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"設定の取得に失敗しました: {str(e)}"
        )


@router.put("/", response_model=APIResponse)
async def update_settings(settings_data: SettingUpdate, db: AsyncSession = Depends(get_db)):
    """設定を更新する"""
    try:
        updated_settings: dict[str, object] = {}

        # 各設定項目を更新
        if settings_data.speech_rate is not None:
            validated_rate = _validate_setting_value("speech_rate", str(settings_data.speech_rate))
            await _update_setting(db, "speech_rate", validated_rate)
            updated_settings["speech_rate"] = float(validated_rate)

        current_model = await _get_setting_value(db, "speech_model")
        current_voice = await _get_setting_value(db, "speech_voice")
        speech_model = settings_data.speech_model or current_model or OPENAI_TTS_MODEL
        speech_voice = settings_data.speech_voice or current_voice or get_default_voice_for_model(speech_model)

        if settings_data.speech_model is None and settings_data.speech_voice is not None:
            speech_model = get_model_for_voice(speech_voice)

        validated_model = _validate_setting_value("speech_model", speech_model)
        validated_voice = _validate_setting_value("speech_voice", speech_voice)
        if not is_voice_allowed_for_model(validated_voice, validated_model):
            validated_voice = get_default_voice_for_model(validated_model)

        if settings_data.speech_model is not None:
            await _update_setting(db, "speech_model", validated_model)
            updated_settings["speech_model"] = validated_model

        if settings_data.speech_model is None and settings_data.speech_voice is not None:
            await _update_setting(db, "speech_model", validated_model)
            updated_settings["speech_model"] = validated_model

        if settings_data.speech_voice is not None:
            await _update_setting(db, "speech_voice", validated_voice)
            updated_settings["speech_voice"] = validated_voice

        if settings_data.speech_model is not None and settings_data.speech_voice is None:
            await _update_setting(db, "speech_voice", validated_voice)
            updated_settings["speech_voice"] = validated_voice

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
        value: object = str(setting.value)
        if key == "speech_rate":
            try:
                value = float(str(setting.value))
            except ValueError:
                pass
        elif key == "speech_model":
            value = _normalize_speech_model(str(value), await _get_setting_value(db, "speech_voice"))

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

        if key == "speech_model":
            current_voice = await _get_setting_value(db, "speech_voice")
            voice = current_voice or get_default_voice_for_model(validated_value)
            if not is_voice_allowed_for_model(voice, validated_value):
                await _update_setting(db, "speech_voice", get_default_voice_for_model(validated_value))
        elif key == "speech_voice":
            current_model = await _get_setting_value(db, "speech_model") or get_model_for_voice(validated_value)
            if not is_voice_allowed_for_model(validated_value, current_model):
                await _update_setting(db, "speech_model", get_model_for_voice(validated_value))

        await _update_setting(db, key, validated_value)
        await db.commit()

        # レスポンス用の値を適切な型に変換
        response_value: object = validated_value
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
            ("speech_model", OPENAI_TTS_MODEL),
            ("speech_voice", "alloy"),
        ]

        for key, value in default_settings:
            await _update_setting(db, key, value)

        await db.commit()

        # リセット後の設定を取得
        reset_settings_dict: dict[str, object] = {}
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
        setting_model = cast(Any, setting)
        setting_model.value = value
    else:
        # 設定が存在しない場合は新規作成
        setting = Setting(key=key, value=value)
        db.add(setting)


async def _get_setting_value(db: AsyncSession, key: str) -> str | None:
    stmt = select(Setting).where(Setting.key == key)
    result = await db.execute(stmt)
    setting = result.scalar_one_or_none()
    if not setting:
        return None
    return str(setting.value)


def _normalize_speech_model(speech_model: str | None, speech_voice: str | None) -> str:
    if speech_model in ALLOWED_TTS_MODELS:
        return speech_model
    if speech_voice:
        return get_model_for_voice(speech_voice)
    return OPENAI_TTS_MODEL


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

    elif key == "speech_model":
        if value not in ALLOWED_TTS_MODELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"speech_model は次の値から選択してください: {', '.join(ALLOWED_TTS_MODELS)}",
            )
        return value

    elif key == "speech_voice":
        if value not in ALLOWED_TTS_VOICES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"speech_voice は次の値から選択してください: {', '.join(ALLOWED_TTS_VOICES)}",
            )
        return value

    else:
        # 未知の設定キーでも受け入れて文字列として保存
        return value
