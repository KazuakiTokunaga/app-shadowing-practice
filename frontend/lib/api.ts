/**
 * バックエンドAPIクライアント
 * NEXT_PUBLIC_API_URL が未設定の場合は同一オリジン（/api プロキシ想定）を使用
 */
import type { APIResponse, Exercise, ExerciseList, Result, TurnData } from "./types";

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
};

export const apiBaseUrl = getBaseUrl();

async function apiCall<T>(
  path: string,
  options: RequestInit = {}
): Promise<APIResponse<T>> {
  const url = path.startsWith("http") ? path : `${apiBaseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : json.detail?.[0]?.msg ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return json as APIResponse<T>;
}

/** 音声・ファイル用: 絶対URLを返す（別オリジンで再生するため） */
export function audioUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${apiBaseUrl}${path}`;
}

// --- Exercises ---
export async function fetchExercises(sortBy = "created_at", order = "desc") {
  return apiCall<ExerciseList[]>(`/api/exercises/?sort_by=${sortBy}&order=${order}`);
}

export async function fetchExercise(id: number) {
  return apiCall<Exercise>(`/api/exercises/${id}`);
}

export async function createExercise(body: { title: string; content: string }) {
  return apiCall<Exercise>("/api/exercises/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateExerciseTitle(id: number, title: string) {
  return apiCall<Exercise>(`/api/exercises/${id}/title`, {
    method: "PATCH",
    body: JSON.stringify(title),
  });
}

export async function deleteExercise(id: number) {
  return apiCall<null>(`/api/exercises/${id}`, { method: "DELETE" });
}

// --- Shadowing ---
export async function startShadowing(exerciseId: number) {
  return apiCall<{ exercise_id: number; title: string; turns: TurnData[]; total_turns: number }>(
    `/api/shadowing/${exerciseId}/start`,
    { method: "POST" }
  );
}

export async function transcribeBatch(
  exerciseId: number,
  formData: FormData
): Promise<APIResponse<{ turn_id: number; transcription: string }[]>> {
  const url = `${apiBaseUrl}/api/shadowing/${exerciseId}/transcribe-batch`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return json;
}

export async function saveShadowingResult(exerciseId: number, transcriptions: string[]) {
  return apiCall<Result>(`/api/shadowing/${exerciseId}/result`, {
    method: "POST",
    body: JSON.stringify(transcriptions),
  });
}

export async function fetchShadowingResults(exerciseId: number, limit = 10) {
  return apiCall<Result[]>(`/api/shadowing/${exerciseId}/results?limit=${limit}`);
}

export async function fetchResultDetail(exerciseId: number, resultId: number) {
  return apiCall<Result>(`/api/shadowing/${exerciseId}/results/${resultId}`);
}

// --- Audio ---
export function fullAudioUrl(exerciseId: number): string {
  return audioUrl(`/api/audio/${exerciseId}/full`);
}

export function turnAudioUrl(exerciseId: number, turnId: number): string {
  return audioUrl(`/api/audio/${exerciseId}/turn/${turnId}`);
}

// --- Settings ---
export async function fetchSettings() {
  return apiCall<Record<string, unknown>>("/api/settings/");
}

export async function updateSettings(body: { speech_rate?: number; speech_voice?: string }) {
  return apiCall<Record<string, unknown>>("/api/settings/", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function resetSettings() {
  return apiCall<Record<string, unknown>>("/api/settings/reset", { method: "POST" });
}
