import json
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.models import Exercise, Result
from ..models.schemas import APIResponse, TurnResult
from ..models.schemas import Result as ResultSchema
from ..services.openai_service import OpenAIService, ScoringService

router = APIRouter(prefix="/api/shadowing", tags=["shadowing"])


@router.get("/{exercise_id}/listen", response_model=APIResponse)
async def get_listening_data(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """リスニングモード用のデータを取得する"""
    try:
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        data = {
            "exercise_id": exercise.id,
            "title": exercise.title,
            "content": exercise.content,
            "audio_file_path": exercise.audio_file_path,
        }

        return APIResponse(success=True, data=data, message="リスニングデータを取得しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"リスニングデータの取得に失敗しました: {str(e)}"
        )


@router.post("/{exercise_id}/start", response_model=APIResponse)
async def start_shadowing(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """シャドーイングを開始する（ターン別データを取得）"""
    try:
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # ターンデータをパース
        turns_data = json.loads(exercise.turns)

        data = {
            "exercise_id": exercise.id,
            "title": exercise.title,
            "turns": turns_data,
            "total_turns": len(turns_data),
        }

        return APIResponse(success=True, data=data, message="シャドーイングを開始しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"シャドーイング開始に失敗しました: {str(e)}"
        )


@router.post("/{exercise_id}/transcribe", response_model=APIResponse)
async def transcribe_turn_audio(
    exercise_id: int, turn_id: int = Form(...), audio_file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    """単一ターンの音声を書き起こす"""
    try:
        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # 音声ファイルの内容を読み取り
        audio_data = await audio_file.read()

        # ファイル名から拡張子を取得
        file_extension = audio_file.filename.split(".")[-1] if "." in audio_file.filename else "webm"

        # Whisper APIで書き起こし
        transcription = await OpenAIService.transcribe_audio(audio_data, file_extension=file_extension)

        data = {"turn_id": turn_id, "transcription": transcription}

        return APIResponse(success=True, data=data, message="音声の書き起こしが完了しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"音声の書き起こしに失敗しました: {str(e)}"
        )


@router.post("/{exercise_id}/transcribe-batch", response_model=APIResponse)
async def transcribe_batch_audio(
    exercise_id: int,
    audio_files: List[UploadFile] = File(...),
    turn_ids: str = Form(...),  # JSON文字列として受け取り
    db: AsyncSession = Depends(get_db),
):
    """複数ターンの音声を一括で書き起こす"""
    try:
        # turn_idsをパース
        turn_id_list = json.loads(turn_ids)

        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        if len(audio_files) != len(turn_id_list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="音声ファイルの数とターンIDの数が一致しません"
            )

        # 各ターンの音声を書き起こし
        transcriptions = []
        for i, audio_file in enumerate(audio_files):
            audio_data = await audio_file.read()
            # ファイル名から拡張子を取得
            file_extension = audio_file.filename.split(".")[-1] if "." in audio_file.filename else "webm"
            transcription = await OpenAIService.transcribe_audio(audio_data, file_extension=file_extension)

            transcriptions.append({"turn_id": turn_id_list[i], "transcription": transcription})

        return APIResponse(success=True, data=transcriptions, message="音声の一括書き起こしが完了しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"音声の一括書き起こしに失敗しました: {str(e)}"
        )


@router.post("/{exercise_id}/result", response_model=APIResponse)
async def save_shadowing_result(exercise_id: int, transcriptions: List[str], db: AsyncSession = Depends(get_db)):
    """シャドーイング結果を保存する"""
    try:
        # 課題の存在確認とターンデータ取得
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # ターンデータをパース
        turns_data = json.loads(exercise.turns)

        # スコア計算
        turn_scores, turn_results = ScoringService.calculate_turn_scores(turns_data, transcriptions)
        total_score = ScoringService.calculate_total_score(turn_scores)

        # 結果をデータベースに保存
        result_record = Result(
            exercise_id=exercise_id,
            total_score=total_score,
            turn_scores=json.dumps(turn_scores),
            turn_results=json.dumps(turn_results, ensure_ascii=False),
        )

        db.add(result_record)
        await db.commit()
        await db.refresh(result_record)

        # レスポンスデータを作成
        response_data = ResultSchema(
            id=result_record.id,
            exercise_id=result_record.exercise_id,
            total_score=result_record.total_score,
            turn_scores=turn_scores,
            turn_results=[TurnResult(**result) for result in turn_results],
            completed_at=result_record.completed_at,
        )

        return APIResponse(
            success=True, data=response_data, message=f"結果を保存しました。総合スコア: {total_score:.1f}%"
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"結果の保存に失敗しました: {str(e)}"
        )


@router.get("/{exercise_id}/results", response_model=APIResponse)
async def get_shadowing_results(exercise_id: int, limit: int = 10, db: AsyncSession = Depends(get_db)):
    """過去のシャドーイング結果を取得する"""
    try:
        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # 結果を取得（新しい順）
        stmt = select(Result).where(Result.exercise_id == exercise_id).order_by(desc(Result.completed_at)).limit(limit)

        result = await db.execute(stmt)
        results = result.scalars().all()

        # レスポンスデータを作成
        results_data = []
        for result_record in results:
            turn_scores = json.loads(result_record.turn_scores)
            turn_results = json.loads(result_record.turn_results)

            result_data = ResultSchema(
                id=result_record.id,
                exercise_id=result_record.exercise_id,
                total_score=result_record.total_score,
                turn_scores=turn_scores,
                turn_results=[TurnResult(**result) for result in turn_results],
                completed_at=result_record.completed_at,
            )
            results_data.append(result_data)

        return APIResponse(success=True, data=results_data, message="過去の結果を取得しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"過去の結果取得に失敗しました: {str(e)}"
        )


@router.get("/{exercise_id}/results/{result_id}", response_model=APIResponse)
async def get_shadowing_result_detail(exercise_id: int, result_id: int, db: AsyncSession = Depends(get_db)):
    """特定のシャドーイング結果の詳細を取得する"""
    try:
        stmt = select(Result).where(Result.id == result_id, Result.exercise_id == exercise_id)
        result = await db.execute(stmt)
        result_record = result.scalar_one_or_none()

        if not result_record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="結果が見つかりません")

        # レスポンスデータを作成
        turn_scores = json.loads(result_record.turn_scores)
        turn_results = json.loads(result_record.turn_results)

        result_data = ResultSchema(
            id=result_record.id,
            exercise_id=result_record.exercise_id,
            total_score=result_record.total_score,
            turn_scores=turn_scores,
            turn_results=[TurnResult(**result) for result in turn_results],
            completed_at=result_record.completed_at,
        )

        return APIResponse(success=True, data=result_data, message="結果詳細を取得しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"結果詳細の取得に失敗しました: {str(e)}"
        )
