import re
from typing import Any, Dict, List


class TurnService:
    """課題テキストをシャドーイング用ターンへ分割するサービス"""

    @staticmethod
    def split_turns(content: str) -> List[Dict[str, Any]]:
        """
        貪欲法アルゴリズムを使用してテキストをターンに分割する

        仕様:
        - ターンは1つもしくは複数の文からなり、ターンの区切りは文末になっている
        - 文末は句読点（. ! ?）を基準とする
        - U.S. などの略語、小数点、a.m./p.m. 等は文末と誤検出しない
        - 各ターンに含める文の決定は次のように決める:
          - 前から文を見てターンを決定していく
          - いまみている文が10単語以上であるならば、その文だけでターンとする
          - いまみている文が10単語未満であるとき、10単語を超えるまで次の文を同じターンに含めることを繰り返す
          - ただし、複数の文からなる30単語以上のターンは作らない
          - 次の文を含めると単語数が30単語以上になるとき、その次の文を含めないでターンとする
        """
        try:
            dot_placeholder = "∯"
            ellipsis_placeholder = "⋯"

            text = content.strip()
            text = text.replace("...", ellipsis_placeholder)
            text = re.sub(r"(?<=\d)\.(?=\d)", dot_placeholder, text)

            def protect_initials(match: re.Match[str]) -> str:
                return match.group(0).replace(".", dot_placeholder)

            text = re.sub(r"\b(?:[A-Za-z]\.){2,}", protect_initials, text)

            abbreviations = [
                "Mr.",
                "Mrs.",
                "Ms.",
                "Dr.",
                "Prof.",
                "Sr.",
                "Jr.",
                "St.",
                "vs.",
                "etc.",
                "e.g.",
                "i.e.",
                "a.m.",
                "p.m.",
                "U.S.",
                "U.K.",
                "U.N.",
                "E.U.",
                "U.A.E.",
                "U.S.A.",
            ]
            for abbreviation in abbreviations:
                text = re.sub(re.escape(abbreviation), abbreviation.replace(".", dot_placeholder), text)

            sentences = re.split(r"([.!?])", text)
            complete_sentences = []
            index = 0
            while index < len(sentences):
                sentence = sentences[index].strip()
                if sentence:
                    if index + 1 < len(sentences) and sentences[index + 1] in ".!?":
                        combined = sentence + sentences[index + 1]
                        combined = combined.replace(dot_placeholder, ".").replace(ellipsis_placeholder, "...")
                        complete_sentences.append(combined)
                        index += 2
                    else:
                        restored = sentence.replace(dot_placeholder, ".").replace(ellipsis_placeholder, "...")
                        complete_sentences.append(restored + ".")
                        index += 1
                else:
                    index += 1

            turns = []
            turn_id = 1
            index = 0

            while index < len(complete_sentences):
                sentence = complete_sentences[index]
                sentence_word_count = len(sentence.split())

                if sentence_word_count >= 10:
                    turns.append({"id": turn_id, "text": sentence.strip(), "word_count": sentence_word_count})
                    turn_id += 1
                    index += 1
                else:
                    current_turn = sentence
                    current_word_count = sentence_word_count
                    index += 1

                    while index < len(complete_sentences) and current_word_count < 10:
                        next_sentence = complete_sentences[index]
                        test_turn = current_turn + " " + next_sentence
                        test_word_count = len(test_turn.split())

                        if test_word_count >= 30:
                            break

                        current_turn = test_turn
                        current_word_count = test_word_count
                        index += 1

                    turns.append({"id": turn_id, "text": current_turn.strip(), "word_count": current_word_count})
                    turn_id += 1

            return turns

        except Exception as e:
            raise Exception(f"ターン分割に失敗しました: {str(e)}") from e
