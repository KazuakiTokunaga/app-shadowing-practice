/**
 * 録音のプラットフォーム非依存インターフェース。
 * Web は MediaRecorder、RN は expo-av 等で実装する。
 */
export interface RecordingSession {
  /** 録音開始。マイク権限を要求する場合あり */
  start(): Promise<void>;
  /** 録音停止。完了時に Blob で解決する */
  stop(): Promise<Blob | null>;
  isRecording: boolean;
}
