import os
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import aiofiles
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

OPENAI_WHISPER_MODEL = "whisper-1"
DEFAULT_STT_MODEL = OPENAI_WHISPER_MODEL

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class STTProvider(Protocol):
    """音声認識プロバイダの共通インターフェース"""

    async def transcribe(self, audio_data: bytes, file_extension: str) -> str:
        """音声データをテキストに変換する"""


class WhisperSTTProvider:
    """OpenAI Whisper APIを使用した音声認識プロバイダ"""

    async def transcribe(self, audio_data: bytes, file_extension: str) -> str:
        temp_file_path: Path | None = None
        try:
            temp_dir = Path("src/audio/temp")
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file_path = temp_dir / f"temp_audio_{uuid4().hex}.{file_extension}"

            async with aiofiles.open(temp_file_path, "wb") as audio_file:
                await audio_file.write(audio_data)

            with temp_file_path.open("rb") as audio_file:
                response = await client.audio.transcriptions.create(
                    model=OPENAI_WHISPER_MODEL,
                    file=audio_file,
                    language="en",
                    temperature=0,
                )

            return response.text

        except Exception as e:
            raise Exception(f"音声認識に失敗しました: {str(e)}") from e
        finally:
            if temp_file_path and temp_file_path.exists():
                temp_file_path.unlink()


class STTProviderFactory:
    """音声認識モデル名から対応するプロバイダを作成する"""

    @staticmethod
    def create(stt_model: str = DEFAULT_STT_MODEL) -> STTProvider:
        if stt_model == OPENAI_WHISPER_MODEL:
            return WhisperSTTProvider()
        raise ValueError(f"未対応の音声認識モデルです: {stt_model}")
