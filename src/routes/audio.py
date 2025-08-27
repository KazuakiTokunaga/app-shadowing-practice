import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.models import Exercise
from ..models.schemas import APIResponse

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.get("/{exercise_id}/full")
async def get_full_audio(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """全体音声ファイルを取得する（リスニング用）"""
    try:
        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        if not exercise.audio_file_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="音声ファイルが見つかりません")

        audio_path = Path(exercise.audio_file_path)

        if not audio_path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="音声ファイルが存在しません")

        return FileResponse(path=str(audio_path), media_type="audio/mpeg", filename=f"exercise_{exercise_id}_full.mp3")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"音声ファイルの取得に失敗しました: {str(e)}"
        )


@router.get("/{exercise_id}/turn/{turn_id}")
async def get_turn_audio(exercise_id: int, turn_id: int, db: AsyncSession = Depends(get_db)):
    """ターン別音声ファイルを取得する"""
    try:
        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # ターン別音声ファイルのパスを構築
        audio_path = Path(f"src/audio/exercises/{exercise_id}/turn_{turn_id}.mp3")

        if not audio_path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ターン音声ファイルが存在しません")

        return FileResponse(
            path=str(audio_path), media_type="audio/mpeg", filename=f"exercise_{exercise_id}_turn_{turn_id}.mp3"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ターン音声ファイルの取得に失敗しました: {str(e)}",
        )


@router.delete("/{exercise_id}", response_model=APIResponse)
async def delete_exercise_audio(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """課題に関連する全ての音声ファイルを削除する"""
    try:
        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        # 音声ディレクトリの削除
        audio_dir = Path(f"src/audio/exercises/{exercise_id}")
        deleted_files = 0

        if audio_dir.exists():
            # ディレクトリ内のファイル数をカウント
            deleted_files = len(list(audio_dir.glob("*")))
            # ディレクトリを削除
            shutil.rmtree(audio_dir)

        return APIResponse(
            success=True,
            data={"exercise_id": exercise_id, "deleted_files": deleted_files},
            message=f"課題{exercise_id}の音声ファイル{deleted_files}個を削除しました",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"音声ファイルの削除に失敗しました: {str(e)}"
        )


@router.get("/{exercise_id}/info", response_model=APIResponse)
async def get_audio_info(exercise_id: int, db: AsyncSession = Depends(get_db)):
    """課題の音声ファイル情報を取得する"""
    try:
        # 課題の存在確認
        stmt = select(Exercise).where(Exercise.id == exercise_id)
        result = await db.execute(stmt)
        exercise = result.scalar_one_or_none()

        if not exercise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="課題が見つかりません")

        audio_info = {
            "exercise_id": exercise_id,
            "full_audio": {"exists": False, "path": exercise.audio_file_path, "size": 0},
            "turn_audio": {"count": 0, "files": []},
        }

        # 全体音声ファイルの情報
        if exercise.audio_file_path:
            full_audio_path = Path(exercise.audio_file_path)
            if full_audio_path.exists():
                audio_info["full_audio"]["exists"] = True
                audio_info["full_audio"]["size"] = full_audio_path.stat().st_size

        # ターン別音声ファイルの情報
        audio_dir = Path(f"src/audio/exercises/{exercise_id}")
        if audio_dir.exists():
            turn_files = list(audio_dir.glob("turn_*.mp3"))
            audio_info["turn_audio"]["count"] = len(turn_files)

            for turn_file in sorted(turn_files):
                # ファイル名からターンIDを抽出
                turn_id_str = turn_file.stem.replace("turn_", "")
                try:
                    turn_id = int(turn_id_str)
                    file_size = turn_file.stat().st_size

                    audio_info["turn_audio"]["files"].append(
                        {"turn_id": turn_id, "filename": turn_file.name, "size": file_size}
                    )
                except ValueError:
                    # ターンIDが数値でない場合はスキップ
                    continue

        return APIResponse(success=True, data=audio_info, message="音声ファイル情報を取得しました")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"音声ファイル情報の取得に失敗しました: {str(e)}"
        )
