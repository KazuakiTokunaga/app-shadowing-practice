import asyncio
import html
import os
from typing import Protocol
from urllib.parse import urlparse

import azure.cognitiveservices.speech as speechsdk  # type: ignore[import-untyped]
from dotenv import load_dotenv
from openai import AsyncOpenAI

from .tts_voices import MAI_TTS_VOICES_BY_MODEL, OPENAI_TTS_MODEL

load_dotenv()


class TTSProvider(Protocol):
    async def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        pass


class OpenAITTSProvider:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    async def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        response = await self.client.audio.speech.create(
            model=OPENAI_TTS_MODEL,
            voice=voice,  # type: ignore
            input=text,
            speed=speed,
            response_format="mp3",
        )
        return response.content


class MAITTSProvider:
    async def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        foundry_endpoint_url = os.getenv("FOUNDRY_ENDPOINT_URL")
        foundry_api_key = os.getenv("FOUNDRY_API_KEY")

        if not foundry_endpoint_url or not foundry_api_key:
            raise ValueError("MAI-Voiceを利用するには FOUNDRY_ENDPOINT_URL と FOUNDRY_API_KEY が必要です")

        parsed = urlparse(foundry_endpoint_url)
        base_endpoint = f"{parsed.scheme}://{parsed.netloc}"
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("FOUNDRY_ENDPOINT_URL の形式が正しくありません")

        def synthesize_sync() -> bytes:
            speech_config = speechsdk.SpeechConfig(subscription=foundry_api_key, endpoint=base_endpoint)
            speech_config.speech_synthesis_voice_name = voice
            speech_config.set_speech_synthesis_output_format(
                speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
            )
            speech_synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
            result = speech_synthesizer.speak_ssml_async(self._build_ssml(text, voice, speed)).get()

            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                return bytes(result.audio_data)

            if result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = result.cancellation_details
                detail = cancellation_details.reason
                if cancellation_details.reason == speechsdk.CancellationReason.Error:
                    detail = cancellation_details.error_details
                raise RuntimeError(f"MAI-Voiceの音声生成がキャンセルされました: {detail}")

            raise RuntimeError(f"MAI-Voiceの音声生成に失敗しました: {result.reason}")

        return await asyncio.to_thread(synthesize_sync)

    @staticmethod
    def _build_ssml(text: str, voice: str, speed: float) -> str:
        rate_percent = round((speed - 1.0) * 100)
        rate = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"
        escaped_text = html.escape(text, quote=False)
        return (
            '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">'
            f'<voice name="{voice}"><mstts:express-as style="professional">'
            f'<prosody rate="{rate}">{escaped_text}</prosody>'
            "</mstts:express-as></voice>"
            "</speak>"
        )


class TTSProviderFactory:
    @staticmethod
    def create(speech_model: str) -> TTSProvider:
        if speech_model in MAI_TTS_VOICES_BY_MODEL:
            return MAITTSProvider()
        if speech_model == OPENAI_TTS_MODEL:
            return OpenAITTSProvider()
        raise ValueError(f"未対応の音声モデルです: {speech_model}")
