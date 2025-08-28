import json
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.models import Exercise, Result, Setting
from ..models.schemas import APIResponse, ExerciseCreate, ExerciseList, TurnData
from ..models.schemas import Exercise as ExerciseSchema
from ..services.openai_service import OpenAIService

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


async def _get_speech_settings(db: AsyncSession) -> dict:
    """音声生成用の設定を取得する"""
    # デフォルト設定（高音質モードは常にTrue）
    default_settings = {"speech_voice": "alloy", "speech_rate": 1.0, "use_hd_model": True}

    try:
        # データベースから設定を取得
        voice_stmt = select(Setting).where(Setting.key == "speech_voice")
        voice_result = await db.execute(voice_stmt)
        voice_setting = voice_result.scalar_one_or_none()

        rate_stmt = select(Setting).where(Setting.key == "speech_rate")
        rate_result = await db.execute(rate_stmt)
        rate_setting = rate_result.scalar_one_or_none()

        # 設定値を反映
        if voice_setting:
            default_settings["speech_voice"] = voice_setting.value
        if rate_setting:
            try:
                default_settings["speech_rate"] = float(rate_setting.value)
            except ValueError:
                pass  # デフォルト値を使用

        # use_hd_modelは常にTrue（高音質モード固定）

        return default_settings
    except Exception:
        # エラーの場合はデフォルト設定を返す
        return default_settings


@router.get("/", response_model=APIResponse)
async def get_exercises(
    sort_by: str = "created_at",  # created_at, title, max_score, last_practiced_at
    order: str = "desc",  # asc, desc
    db: AsyncSession = Depends(get_db),
):
    """課題一覧を取得する"""
    try:
        # ソート条件を設定
        order_by = Exercise.created_at.desc()
        if sort_by == "title":
            order_by = Exercise.title.asc() if order == "asc" else Exercise.title.desc()
        elif sort_by == "created_at":
            order_by = Exercise.created_at.asc() if order == "asc" else Exercise.created_at.desc()

        # 課題一覧を取得
        stmt = select(Exercise).order_by(order_by)
        result = await db.execute(stmt)
        exercises = result.scalars().all()

        # 各課題の最高スコアと実施回数を取得
        exercise_list = []
        for exercise in exercises:
            # 最高スコアを取得
            max_score_stmt = select(func.max(Result.total_score)).where(Result.exercise_id == exercise.id)
            max_score_result = await db.execute(max_score_stmt)
            max_score = max_score_result.scalar()

            # 実施回数を取得
            count_stmt = select(func.count(Result.id)).where(Result.exercise_id == exercise.id)
            count_result = await db.execute(count_stmt)
            attempt_count = count_result.scalar() or 0

            # 最終実施日を取得
            last_practiced_stmt = select(func.max(Result.completed_at)).where(Result.exercise_id == exercise.id)
            last_practiced_result = await db.execute(last_practiced_stmt)
            last_practiced_at = last_practiced_result.scalar()

            exercise_data = ExerciseList(
                id=exercise.id,
                title=exercise.title,
                word_count=exercise.word_count,
                created_at=exercise.created_at,
                max_score=max_score,
                attempt_count=attempt_count,
                last_practiced_at=last_practiced_at,
            )
            exercise_list.append(exercise_data)

        # スコアまたは最終実施日でソートする場合
        if sort_by == "max_score":
            exercise_list.sort(key=lambda x: x.max_score or 0, reverse=(order == "desc"))
        elif sort_by == "last_practiced_at":
            # 最終実施日でソート（Noneは最後に配置）
            if order == "desc":
                exercise_list.sort(key=lambda x: x.last_practiced_at or datetime.min, reverse=True)
            else:
                exercise_list.sort(key=lambda x: x.last_practiced_at or datetime.max)

        return APIResponse(success=True, data=exercise_list, message="課題一覧を取得しました")

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"課題一覧の取得に失敗しました: {str(e)}"
        )


@router.post("/", response_model=APIResponse)
async def create_exercise(exercise_data: ExerciseCreate, db: AsyncSession = Depends(get_db)):
    """新しい課題を作成する"""
    try:
        # 貪欲法アルゴリズムでターン分割
        turns = OpenAIService.split_turns(exercise_data.content)

        # 音声生成用の設定を取得（DBに保存する前に取得）
        speech_settings = await _get_speech_settings(db)

        # 単語数を計算
        words = exercise_data.content.strip().split()
        word_count = len([word for word in words if word])

        # 課題をデータベースに保存
        exercise = Exercise(
            title=exercise_data.title,
            content=exercise_data.content,
            word_count=word_count,
            turns=json.dumps(turns, ensure_ascii=False),
            speech_rate=speech_settings["speech_rate"],  # 作成時の再生速度を保存
            speech_voice=speech_settings["speech_voice"],  # 作成時の音声の種類を保存
        )

        db.add(exercise)
        await db.flush()  # IDを取得するためにflush

        # ターン別音声を生成
        updated_turns = await OpenAIService.generate_turn_audio_batch(
            turns,
            exercise.id,
            voice=speech_settings["speech_voice"],
            speed=speech_settings["speech_rate"],
            hd=speech_settings["use_hd_model"],
        )

        # 全体音声を生成（リスニング用）
        full_audio_path = await OpenAIService.generate_full_audio(
            exercise_data.content,
            exercise.id,
            voice=speech_settings["speech_voice"],
            speed=speech_settings["speech_rate"],
            hd=speech_settings["use_hd_model"],
        )

        # 更新されたターンデータと全体音声パスを保存
        exercise.turns = json.dumps(updated_turns, ensure_ascii=False)
        exercise.audio_file_path = full_audio_path

        await db.commit()
        await db.refresh(exercise)

        # レスポンス用データを作成
        response_data = ExerciseSchema(
            id=exercise.id,
            title=exercise.title,
            content=exercise.content,
            word_count=exercise.word_count,
            turns=[TurnData(**turn) for turn in updated_turns],
            audio_file_path=exercise.audio_file_path,
            speech_rate=exercise.speech_rate,
            speech_voice=exercise.speech_voice,
            created_at=exercise.created_at,
            updated_at=exercise.updated_at,
            max_score=None,
            attempt_count=0,
        )

        return APIResponse(success=True, data=response_data, message="課題を作成しました")

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"課題の作成に失敗しました: {str(e)}"
        )


@router.get("/{exercise_id}", response_model=APIResponse)
async def get_exercise(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """指定された課題の詳細を取得する"""
    try:
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # ターンデータをパース
        turns_data = json.loads(exercise.turns)
        turns = [TurnData(**turn) for turn in turns_data]

        # 最高スコアと実施回数を取得
        max_score_stmt = select(func.max(Result.total_score)).where(Result.exercise_id == exercise.id)
        max_score_result = await db.execute(max_score_stmt)
        max_score = max_score_result.scalar()

        count_stmt = select(func.count(Result.id)).where(Result.exercise_id == exercise.id)
        count_result = await db.execute(count_stmt)
        attempt_count = count_result.scalar() or 0

        response_data = ExerciseSchema(
            id=exercise.id,
            title=exercise.title,
            content=exercise.content,
            word_count=exercise.word_count,
            turns=turns,
            audio_file_path=exercise.audio_file_path,
            speech_rate=exercise.speech_rate,
            speech_voice=exercise.speech_voice,
            created_at=exercise.created_at,
            updated_at=exercise.updated_at,
            max_score=max_score,
            attempt_count=attempt_count,
        )

        return APIResponse(success=True, data=response_data, message="課題詳細を取得しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"課題詳細の取得に失敗しました: {str(e)}"
        )


@router.patch("/{exercise_id}/title", response_model=APIResponse)
async def update_exercise_title(exercise_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """課題のタイトルのみを更新する"""
    try:
        # リクエストボディからタイトルを取得
        title = await request.json()

        if not title or not isinstance(title, str):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="タイトルが指定されていません")

        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # タイトルを更新
        exercise.title = title
        await db.commit()
        await db.refresh(exercise)

        # レスポンスデータを作成
        turns_data = json.loads(exercise.turns)
        response_data = ExerciseSchema(
            id=exercise.id,
            title=exercise.title,
            content=exercise.content,
            word_count=exercise.word_count,
            turns=[TurnData(**turn) for turn in turns_data],
            audio_file_path=exercise.audio_file_path,
            speech_rate=exercise.speech_rate,
            speech_voice=exercise.speech_voice,
            created_at=exercise.created_at,
            updated_at=exercise.updated_at,
            max_score=None,
            attempt_count=0,
        )

        return APIResponse(success=True, data=response_data, message="タイトルを更新しました")

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"タイトルの更新に失敗しました: {str(e)}"
        )


@router.delete("/{exercise_id}", response_model=APIResponse)
async def delete_exercise(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """課題を削除する"""
    try:
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # 関連する音声ファイルを削除
        audio_dir = Path(f"src/audio/exercises/{exercise_id}")
        if audio_dir.exists():
            shutil.rmtree(audio_dir)

        # データベースから削除（関連データは CASCADE で自動削除）
        await db.delete(exercise)
        await db.commit()

        return APIResponse(success=True, data=None, message="課題を削除しました")

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"課題の削除に失敗しました: {str(e)}"
        )
