OPENAI_TTS_MODEL = "gpt-4o-mini-tts"
MAI_TTS_MODEL = "MAI-Voice-2"

ALLOWED_TTS_MODELS = [OPENAI_TTS_MODEL, MAI_TTS_MODEL]

OPENAI_TTS_VOICES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "onyx",
    "nova",
    "sage",
    "shimmer",
    "verse",
]

MAI_TTS_VOICES = [
    "en-US-Ethan:MAI-Voice-2",
    "en-US-Grant:MAI-Voice-2",
    "en-US-Harper:MAI-Voice-2",
    "en-US-Iris:MAI-Voice-2",
    "en-US-Jasper:MAI-Voice-2",
    "en-US-Olivia:MAI-Voice-2",
]

ALLOWED_TTS_VOICES = OPENAI_TTS_VOICES + MAI_TTS_VOICES

TTS_VOICE_LABELS = {
    **{voice: voice.title() for voice in OPENAI_TTS_VOICES},
    "en-US-Ethan:MAI-Voice-2": "Ethan (en-US)",
    "en-US-Grant:MAI-Voice-2": "Grant (en-US)",
    "en-US-Harper:MAI-Voice-2": "Harper (en-US)",
    "en-US-Iris:MAI-Voice-2": "Iris (en-US)",
    "en-US-Jasper:MAI-Voice-2": "Jasper (en-US)",
    "en-US-Olivia:MAI-Voice-2": "Olivia (en-US)",
}


def is_mai_voice(voice: str) -> bool:
    return voice in MAI_TTS_VOICES


def get_model_for_voice(voice: str) -> str:
    return MAI_TTS_MODEL if is_mai_voice(voice) else OPENAI_TTS_MODEL


def get_default_voice_for_model(speech_model: str) -> str:
    return MAI_TTS_VOICES[0] if speech_model == MAI_TTS_MODEL else OPENAI_TTS_VOICES[0]


def is_voice_allowed_for_model(voice: str, speech_model: str) -> bool:
    if speech_model == MAI_TTS_MODEL:
        return voice in MAI_TTS_VOICES
    if speech_model == OPENAI_TTS_MODEL:
        return voice in OPENAI_TTS_VOICES
    return False
