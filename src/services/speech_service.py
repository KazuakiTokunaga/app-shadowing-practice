from pathlib import Path
from typing import Any, Dict, List

import aiofiles

from .model_providers import TTSProviderFactory, get_model_for_voice


class SpeechService:
    """アプリケーション側の音声生成サービス"""

    @staticmethod
    async def generate_speech(
        text: str,
        voice: str = "alloy",
        speed: float = 1.5,
        hd: bool = True,
        speech_model: str | None = None,
    ) -> bytes:
        try:
            cleaned_text = " ".join(text.split())
            selected_model = speech_model or get_model_for_voice(voice)
            provider = TTSProviderFactory.create(selected_model)
            return await provider.synthesize(cleaned_text, voice, speed)
        except Exception as e:
            raise Exception(f"音声生成に失敗しました: {str(e)}") from e

    @staticmethod
    async def generate_turn_audio_batch(
        turns: List[Dict[str, Any]],
        exercise_id: int,
        voice: str = "alloy",
        speed: float = 1.5,
        hd: bool = True,
        speech_model: str | None = None,
    ) -> List[Dict[str, Any]]:
        try:
            audio_dir = Path(f"src/audio/exercises/{exercise_id}")
            audio_dir.mkdir(parents=True, exist_ok=True)

            updated_turns = []

            for turn in turns:
                audio_data = await SpeechService.generate_speech(
                    text=turn["text"], voice=voice, speed=speed, hd=hd, speech_model=speech_model
                )

                audio_file_path = audio_dir / f"turn_{turn['id']}.mp3"
                async with aiofiles.open(audio_file_path, "wb") as f:
                    await f.write(audio_data)

                updated_turn = turn.copy()
                updated_turn["audio_file_path"] = str(audio_file_path)
                updated_turns.append(updated_turn)

            return updated_turns

        except Exception as e:
            raise Exception(f"音声一括生成に失敗しました: {str(e)}") from e

    @staticmethod
    async def generate_full_audio(
        content: str,
        exercise_id: int,
        voice: str = "alloy",
        speed: float = 1.5,
        hd: bool = True,
        speech_model: str | None = None,
    ) -> str:
        try:
            audio_data = await SpeechService.generate_speech(
                text=content, voice=voice, speed=speed, hd=hd, speech_model=speech_model
            )

            audio_dir = Path(f"src/audio/exercises/{exercise_id}")
            audio_dir.mkdir(parents=True, exist_ok=True)

            audio_file_path = audio_dir / "full.mp3"
            async with aiofiles.open(audio_file_path, "wb") as f:
                await f.write(audio_data)

            return str(audio_file_path)

        except Exception as e:
            raise Exception(f"全体音声生成に失敗しました: {str(e)}") from e
