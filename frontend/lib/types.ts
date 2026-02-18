/** バックエンドAPIの型定義（schemas.py に対応） */

export interface TurnData {
  id: number;
  text: string;
  word_count: number;
  audio_file_path?: string;
}

export interface TurnResult {
  turn_id: number;
  original: string;
  recognized: string;
  score: number;
}

export interface Exercise {
  id: number;
  title: string;
  content: string;
  word_count: number;
  turns: TurnData[];
  audio_file_path: string | null;
  speech_rate: number;
  speech_voice: string;
  created_at: string;
  updated_at: string;
  max_score: number | null;
  attempt_count: number;
}

export interface ExerciseList {
  id: number;
  title: string;
  word_count: number;
  created_at: string;
  max_score: number | null;
  attempt_count: number;
  last_practiced_at: string | null;
}

export interface Result {
  id: number;
  exercise_id: number;
  total_score: number;
  turn_scores: number[];
  turn_results: TurnResult[];
  completed_at: string;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  timestamp?: string;
}

export interface SettingsMap {
  speech_rate?: number;
  speech_voice?: string;
}
