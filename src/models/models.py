from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class Exercise(Base):
    """課題テーブル"""

    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)  # 原文全体（100-300単語）
    turns = Column(Text, nullable=False)  # JSON形式のターン分割データ
    audio_file_path = Column(String(500))  # 全体音声ファイルパス（リスニング用）
    speech_rate = Column(Float, default=1.0)  # 音声再生速度（課題作成時の設定値）
    speech_voice = Column(String(50), default="alloy")  # 音声の種類（課題作成時の設定値）
    created_at = Column(DateTime, default=func.current_timestamp())
    updated_at = Column(DateTime, default=func.current_timestamp(), onupdate=func.current_timestamp())

    # リレーション
    results = relationship("Result", back_populates="exercise", cascade="all, delete-orphan")


class Result(Base):
    """成績テーブル"""

    __tablename__ = "results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    total_score = Column(Float, nullable=False)  # 総合スコア（0-100）
    turn_scores = Column(Text, nullable=False)  # JSON形式のターン別スコア
    turn_results = Column(Text, nullable=False)  # JSON形式のターン別認識結果
    completed_at = Column(DateTime, default=func.current_timestamp())

    # リレーション
    exercise = relationship("Exercise", back_populates="results")


class Setting(Base):
    """設定テーブル"""

    __tablename__ = "settings"

    key = Column(String(50), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=func.current_timestamp(), onupdate=func.current_timestamp())
