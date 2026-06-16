from .model_providers import DEFAULT_STT_MODEL, STTProviderFactory


class TranscriptionService:
    """音声認識のアプリケーションサービス"""

    @staticmethod
    async def transcribe_audio(
        audio_data: bytes, file_extension: str = "webm", stt_model: str = DEFAULT_STT_MODEL
    ) -> str:
        provider = STTProviderFactory.create(stt_model)
        return await provider.transcribe(audio_data, file_extension=file_extension)
