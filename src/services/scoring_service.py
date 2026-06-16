import re
from typing import Any, Dict, List


class ScoringService:
    """シャドーイング採点サービス"""

    @staticmethod
    def calculate_word_match_score(original: str, recognized: str) -> float:
        """単語レベルでの一致率を計算する"""

        def normalize_text(text: str) -> List[str]:
            text = re.sub(r"[^\w\s]", "", text.lower())
            return text.split()

        original_words = normalize_text(original)
        recognized_words = normalize_text(recognized)

        if not original_words:
            return 0.0

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
        """ターン別スコアを計算する"""
        turn_scores = []
        turn_results = []

        for index, turn in enumerate(turns):
            if index < len(transcriptions):
                original = turn["text"]
                recognized = transcriptions[index]
                score = ScoringService.calculate_word_match_score(original, recognized)

                turn_scores.append(score)
                turn_results.append(
                    {"turn_id": turn["id"], "original": original, "recognized": recognized, "score": score}
                )
            else:
                turn_scores.append(0.0)
                turn_results.append({"turn_id": turn["id"], "original": turn["text"], "recognized": "", "score": 0.0})

        return turn_scores, turn_results

    @staticmethod
    def calculate_total_score(turn_scores: List[float]) -> float:
        """総合スコアを計算する"""
        if not turn_scores:
            return 0.0

        return sum(turn_scores) / len(turn_scores)
