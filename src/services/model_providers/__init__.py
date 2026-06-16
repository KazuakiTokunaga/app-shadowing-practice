"""外部モデルプロバイダ実装"""

from .stt import DEFAULT_STT_MODEL, STTProviderFactory
from .tts import TTSProviderFactory
from .tts_voices import (
    ALLOWED_TTS_MODELS,
    ALLOWED_TTS_VOICES,
    MAI_TTS_MODEL,
    OPENAI_TTS_MODEL,
    TTS_VOICE_LABELS,
    get_default_voice_for_model,
    get_model_for_voice,
    is_voice_allowed_for_model,
)

__all__ = [
    "ALLOWED_TTS_MODELS",
    "ALLOWED_TTS_VOICES",
    "DEFAULT_STT_MODEL",
    "MAI_TTS_MODEL",
    "OPENAI_TTS_MODEL",
    "STTProviderFactory",
    "TTSProviderFactory",
    "TTS_VOICE_LABELS",
    "get_default_voice_for_model",
    "get_model_for_voice",
    "is_voice_allowed_for_model",
]
