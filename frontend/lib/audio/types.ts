/**
 * 音声再生のプラットフォーム非依存インターフェース。
 * Web は HTMLAudioElement、RN は expo-av 等で実装する。
 */
export interface AudioPlaybackHandle {
  currentTime: number;
  duration: number;
  playing: boolean;
  play(url: string): void;
  pause(): void;
  seek(value: number): void;
}
