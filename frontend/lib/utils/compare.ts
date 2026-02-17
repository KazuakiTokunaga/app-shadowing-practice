/**
 * テキスト比較（DOM 非依存・共有レイヤー）
 * 単語ごとの一致可否を返す。HTML やスタイルは Web/RN 側で描画する。
 */

export interface CompareWord {
  word: string;
  correct: boolean;
  /** 次のトークンとの間にスペースを入れるか */
  needSpaceAfter: boolean;
}

/**
 * 元テキストと認識結果を単語単位で比較し、一致/不一致の配列を返す。
 * React Native ではこのデータで Text のスタイルを切り替え、Web では HTML に変換して表示する。
 */
export function compareTextsToWords(original: string, recognized: string): CompareWord[] {
  const origWords = original.match(/\b[\w']+\b|[^\w\s]/g) || [];
  const recWords = recognized.match(/\b[\w']+\b|[^\w\s]/g) || [];
  const dp: number[][] = Array(origWords.length + 1)
    .fill(null)
    .map(() => Array(recWords.length + 1).fill(0));
  for (let i = 1; i <= origWords.length; i++) {
    for (let j = 1; j <= recWords.length; j++) {
      if (origWords[i - 1].toLowerCase() === recWords[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const matched = new Set<number>();
  let i = origWords.length;
  let j = recWords.length;
  while (i > 0 && j > 0) {
    if (origWords[i - 1].toLowerCase() === recWords[j - 1].toLowerCase()) {
      matched.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return origWords.map((word, idx) => {
    const isAlphabetic = /^[a-zA-Z']+$/.test(word);
    const correct = matched.has(idx) || !isAlphabetic;
    const next = origWords[idx + 1];
    const needSpaceAfter =
      !!next && !/^[^\w\s]$/.test(word) && !/^[^\w\s]$/.test(next);
    return { word, correct, needSpaceAfter };
  });
}

/** HTML 用エスケープ（document 非依存） */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * CompareWord[] を Web 用ハイライト HTML 文字列に変換する。
 * 共有レイヤーに置いておく（DOM は使わない）。RN では compareTextsToWords の結果をそのまま View/Text で描画する。
 */
export function compareWordsToHighlightHtml(words: CompareWord[]): string {
  return words
    .map(({ word, correct, needSpaceAfter }) => {
      const escaped = escapeHtml(word);
      const span = correct
        ? escaped
        : `<span class="text-red-600 font-semibold">${escaped}</span>`;
      return span + (needSpaceAfter ? " " : "");
    })
    .join("");
}
