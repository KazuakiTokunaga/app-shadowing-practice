from datetime import datetime, timezone
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator


class TurnData(BaseModel):
    """ターンデータの構造"""

    id: int
    text: str
    word_count: int
    audio_file_path: Optional[str] = None


class TurnResult(BaseModel):
    """ターン別結果の構造"""

    turn_id: int
    original: str
    recognized: str
    score: float


class ExerciseBase(BaseModel):
    """課題の基本情報"""

    title: str = Field(..., min_length=1, description="課題のタイトル（必須）")
    content: str = Field(..., min_length=10, max_length=3000, description="課題の英文")

    @field_validator("content")
    @classmethod
    def validate_word_count(cls, v: str) -> str:
        """英文の単語数が50-300の範囲内であることを検証"""
        words = v.strip().split()
        word_count = len([word for word in words if word])

        if word_count < 50:
            raise ValueError(f"英文は最低50単語必要です（現在: {word_count}単語）")
        if word_count > 300:
            raise ValueError(f"英文は最大300単語までです（現在: {word_count}単語）")

        return v


class ExerciseCreate(ExerciseBase):
    """課題作成用"""

    pass


class Exercise(ExerciseBase):
    """課題情報（レスポンス用）"""

    id: int
    word_count: int
    turns: List[TurnData]
    audio_file_path: Optional[str] = None
    speech_rate: float = 1.0
    speech_voice: str = "alloy"
    created_at: datetime
    updated_at: datetime
    max_score: Optional[float] = None
    attempt_count: int = 0

    class Config:
        from_attributes = True


class ExerciseList(BaseModel):
    """課題一覧用"""

    id: int
    title: str
    word_count: int
    created_at: datetime
    max_score: Optional[float] = None
    attempt_count: int = 0
    last_practiced_at: Optional[datetime] = None  # 最終実施日

    class Config:
        from_attributes = True


class ResultCreate(BaseModel):
    """成績作成用"""

    exercise_id: int
    total_score: float = Field(..., ge=0, le=100)
    turn_scores: List[float]
    turn_results: List[TurnResult]


class Result(BaseModel):
    """成績情報（レスポンス用）"""

    id: int
    exercise_id: int
    total_score: float
    turn_scores: List[float]
    turn_results: List[TurnResult]
    completed_at: datetime

    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    """設定更新用"""

    speech_rate: Optional[float] = Field(None, ge=1.0, le=2.0)
    speech_voice: Optional[str] = None


class Setting(BaseModel):
    """設定情報（レスポンス用）"""

    key: str
    value: str
    updated_at: datetime

    class Config:
        from_attributes = True


class APIResponse(BaseModel):
    """標準APIレスポンス"""

    success: bool
    data: Optional[Any] = None
    message: str
    # APIサーバーはUTC時刻で返却（クライアント側でローカルに変換）
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TranscriptionRequest(BaseModel):
    """音声書き起こしリクエスト"""

    exercise_id: int
    turn_audio_data: List[bytes]  # ターン別音声データ


class SplitTurnsRequest(BaseModel):
    """ターン分割リクエスト"""

    content: str


class TTSRequest(BaseModel):
    """TTS音声生成リクエスト"""

    text: str
    voice: Optional[str] = "alloy"
    speed: Optional[float] = Field(1.0, ge=0.25, le=4.0)
