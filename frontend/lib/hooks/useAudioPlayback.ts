"use client";

/**
 * 音声再生フックの窓口。
 * Web: lib/audio/useAudioPlayback.web.ts（HTMLAudioElement）
 * RN: lib/audio/useAudioPlayback.native.ts（expo-av 等）を追加し、index で差し替え
 */
export { useAudioPlayback } from "@/lib/audio";
