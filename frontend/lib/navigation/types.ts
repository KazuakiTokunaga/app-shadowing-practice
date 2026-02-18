/**
 * プラットフォーム非依存のナビゲーション API。
 * Web は Next.js の router、RN は React Navigation で実装する。
 */
export interface Navigation {
  navigateToHome(): void;
  navigateToExercise(id: number): void;
  navigateToSettings(): void;
}
