import os
import re
from pathlib import Path
from typing import Any, Dict, List
from uuid import uuid4

import aiofiles
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class OpenAIService:
    """OpenAI APIを使用した各種サービス"""

    @staticmethod
    def split_turns(content: str) -> List[Dict[str, Any]]:
        """
        貪欲法アルゴリズムを使用してテキストをターンに分割する

        仕様:
        - ターンは1つもしくは複数の文からなり、ターンの区切りは文末になっている
        - 文末は句読点（. ! ?）を基準とする
        - 各ターンに含める文の決定は次のように決める:
          - 前から文を見てターンを決定していく
          - いまみている文が10単語以上であるならば、その文だけでターンとする
          - いまみている文が10単語未満であるとき、10単語を超えるまで次の文を同じターンに含めることを繰り返す
          - ただし、複数の文からなる30単語以上のターンは作らない
          - 次の文を含めると単語数が30単語以上になるとき、その次の文を含めないでターンとする

        Args:
            content: 分割対象のテキスト

        Returns:
            ターン分割されたデータのリスト
        """
        try:
            # 文を句読点で分割し、句読点を含めて保持
            sentences = re.split(r"([.!?])", content.strip())

            # 文と句読点をペアにして再構築
            complete_sentences = []
            i = 0
            while i < len(sentences):
                sentence = sentences[i].strip()
                if sentence:  # 空文字でない場合
                    # 次の要素が句読点かチェック
                    if i + 1 < len(sentences) and sentences[i + 1] in ".!?":
                        complete_sentences.append(sentence + sentences[i + 1])
                        i += 2
                    else:
                        # 句読点がない場合はピリオドを追加
                        complete_sentences.append(sentence + ".")
                        i += 1
                else:
                    i += 1

            turns = []
            turn_id = 1
            i = 0

            while i < len(complete_sentences):
                sentence = complete_sentences[i]
                sentence_word_count = len(sentence.split())

                # 現在の文が10単語以上の場合、その文だけでターンとする
                if sentence_word_count >= 10:
                    turns.append({"id": turn_id, "text": sentence.strip(), "word_count": sentence_word_count})
                    turn_id += 1
                    i += 1
                else:
                    # 現在の文が10単語未満の場合、10単語を超えるまで文を追加
                    current_turn = sentence
                    current_word_count = sentence_word_count
                    i += 1

                    # 10単語を超えるまで次の文を追加
                    while i < len(complete_sentences) and current_word_count < 10:
                        next_sentence = complete_sentences[i]
                        next_word_count = len(next_sentence.split())

                        # 次の文を追加した場合の単語数を計算
                        test_turn = current_turn + " " + next_sentence
                        test_word_count = len(test_turn.split())

                        # 30単語以上になる場合は追加しない
                        if test_word_count >= 30:
                            break

                        # 次の文を追加
                        current_turn = test_turn
                        current_word_count = test_word_count
                        i += 1

                    # ターンを追加
                    turns.append({"id": turn_id, "text": current_turn.strip(), "word_count": current_word_count})
                    turn_id += 1

            return turns

        except Exception as e:
            raise Exception(f"ターン分割に失敗しました: {str(e)}")

    @staticmethod
    async def transcribe_audio(audio_data: bytes, file_extension: str = "webm") -> str:
        """
        Whisper APIを使用して音声をテキストに変換する

        Args:
            audio_data: 音声データ（バイト形式）
            file_extension: ファイル拡張子（デフォルト: webm）

        Returns:
            認識されたテキスト
        """
        temp_file_path = None
        try:
            # 一時ファイルをユニーク名で作成（並列時の競合を回避）
            temp_dir = "src/audio/temp"
            os.makedirs(temp_dir, exist_ok=True)
            temp_file_path = os.path.join(temp_dir, f"temp_audio_{uuid4().hex}.{file_extension}")

            async with aiofiles.open(temp_file_path, "wb") as f:
                await f.write(audio_data)

            # Whisper APIで転写
            with open(temp_file_path, "rb") as audio_file:
                response = await client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="en",
                    temperature=0,  # より決定的な転写のために温度を低く設定
                )

            # 一時ファイルを削除
            os.remove(temp_file_path)

            return response.text

        except Exception as e:
            # エラーの場合も一時ファイルを削除
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise Exception(f"音声認識に失敗しました: {str(e)}")

    @staticmethod
    async def generate_speech(text: str, voice: str = "alloy", speed: float = 1.5, hd: bool = True) -> bytes:
        """
        TTS APIを使用してテキストから音声を生成する

        Args:
            text: 音声化するテキスト
            voice: 音声の種類（alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse）
            speed: 読み上げ速度（0.25-4.0）
            hd: 高音質モード（tts-1-hd）を使用するか（デフォルト: True）

        Returns:
            音声データ（バイト形式）
        """
        try:
            # テキストの前処理（改行や余分な空白を除去）
            cleaned_text = " ".join(text.split())

            # 音声フォーマットをMP3の高品質設定で生成
            response = await client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=voice,  # type: ignore
                input=cleaned_text,
                speed=speed,
                response_format="mp3",  # MP3フォーマットを明示的に指定
            )

            return response.content

        except Exception as e:
            raise Exception(f"音声生成に失敗しました: {str(e)}")

    @staticmethod
    async def generate_turn_audio_batch(
        turns: List[Dict[str, Any]], exercise_id: int, voice: str = "alloy", speed: float = 1.5, hd: bool = True
    ) -> List[Dict[str, Any]]:
        """
        複数のターンの音声を一括生成してファイルに保存する

        Args:
            turns: ターンデータのリスト
            exercise_id: 課題ID
            voice: 音声の種類
            speed: 読み上げ速度

        Returns:
            音声ファイルパスが追加されたターンデータのリスト
        """
        try:
            # 課題用ディレクトリを作成
            audio_dir = Path(f"src/audio/exercises/{exercise_id}")
            audio_dir.mkdir(parents=True, exist_ok=True)

            updated_turns = []

            for turn in turns:
                # 音声生成（高音質モード）
                audio_data = await OpenAIService.generate_speech(text=turn["text"], voice=voice, speed=speed, hd=hd)

                # ファイル保存
                audio_file_path = audio_dir / f"turn_{turn['id']}.mp3"
                async with aiofiles.open(audio_file_path, "wb") as f:
                    await f.write(audio_data)

                # ターンデータに音声ファイルパスを追加
                updated_turn = turn.copy()
                updated_turn["audio_file_path"] = str(audio_file_path)
                updated_turns.append(updated_turn)

            return updated_turns

        except Exception as e:
            raise Exception(f"音声一括生成に失敗しました: {str(e)}")

    @staticmethod
    async def generate_full_audio(
        content: str, exercise_id: int, voice: str = "alloy", speed: float = 1.5, hd: bool = True
    ) -> str:
        """
        全体テキストの音声を生成してファイルに保存する（リスニング用）

        Args:
            content: 全体テキスト
            exercise_id: 課題ID
            voice: 音声の種類
            speed: 読み上げ速度

        Returns:
            音声ファイルパス
        """
        try:
            # 音声生成（高音質モード）
            audio_data = await OpenAIService.generate_speech(text=content, voice=voice, speed=speed, hd=hd)

            # 課題用ディレクトリを作成
            audio_dir = Path(f"src/audio/exercises/{exercise_id}")
            audio_dir.mkdir(parents=True, exist_ok=True)

            # ファイル保存
            audio_file_path = audio_dir / "full.mp3"
            async with aiofiles.open(audio_file_path, "wb") as f:
                await f.write(audio_data)

            return str(audio_file_path)

        except Exception as e:
            raise Exception(f"全体音声生成に失敗しました: {str(e)}")


class ScoringService:
    """シャドーイング採点サービス"""

    @staticmethod
    def calculate_word_match_score(original: str, recognized: str) -> float:
        """
        単語レベルでの一致率を計算する

        Args:
            original: 元のテキスト
            recognized: 認識されたテキスト

        Returns:
            一致率（0-100）
        """

        # テキストを正規化（小文字化、句読点除去）
        def normalize_text(text: str) -> List[str]:
            # 小文字化して句読点を除去
            text = re.sub(r"[^\w\s]", "", text.lower())
            return text.split()

        original_words = normalize_text(original)
        recognized_words = normalize_text(recognized)

        if not original_words:
            return 0.0

        # 単語の一致を計算
        matches = 0
        recognized_set = set(recognized_words)

        for word in original_words:
            if word in recognized_set:
                matches += 1

        return (matches / len(original_words)) * 100

    @staticmethod
    def calculate_turn_scores(
        turns: List[Dict[str, Any]], transcriptions: List[str]
    ) -> tuple[List[float], List[Dict[str, Any]]]:
        """
        ターン別スコアを計算する

        Args:
            turns: ターンデータのリスト
            transcriptions: 各ターンの認識結果のリスト

        Returns:
            tuple(ターン別スコアリスト, ターン別結果詳細リスト)
        """
        turn_scores = []
        turn_results = []

        for i, turn in enumerate(turns):
            if i < len(transcriptions):
                original = turn["text"]
                recognized = transcriptions[i]
                score = ScoringService.calculate_word_match_score(original, recognized)

                turn_scores.append(score)
                turn_results.append(
                    {"turn_id": turn["id"], "original": original, "recognized": recognized, "score": score}
                )
            else:
                # 認識結果がない場合
                turn_scores.append(0.0)
                turn_results.append({"turn_id": turn["id"], "original": turn["text"], "recognized": "", "score": 0.0})

        return turn_scores, turn_results

    @staticmethod
    def calculate_total_score(turn_scores: List[float]) -> float:
        """
        総合スコアを計算する

        Args:
            turn_scores: ターン別スコアのリスト

        Returns:
            総合スコア（0-100）
        """
        if not turn_scores:
            return 0.0

        return sum(turn_scores) / len(turn_scores)
