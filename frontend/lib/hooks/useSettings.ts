"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSettings, updateSettings, resetSettings } from "@/lib/api";

export type SettingsMessage = { type: "ok" | "error"; text: string } | null;

export function useSettings() {
  const [speechRate, setSpeechRate] = useState("1.0");
  const [speechVoice, setSpeechVoice] = useState("alloy");
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState<SettingsMessage>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSettings();
      if (res.success && res.data) {
        const d = res.data as { speech_rate?: number; speech_voice?: string };
        if (d.speech_rate != null) setSpeechRate(String(d.speech_rate));
        if (d.speech_voice) setSpeechVoice(d.speech_voice);
      }
    } catch {
      setMessage({ type: "error", text: "設定の読み込みに失敗しました" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    setSaveLoading(true);
    setMessage(null);
    try {
      const res = await updateSettings({
        speech_rate: parseFloat(speechRate),
        speech_voice: speechVoice,
      });
      if (res.success) {
        setMessage({ type: "ok", text: "設定を保存しました" });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "保存に失敗しました",
      });
    } finally {
      setSaveLoading(false);
    }
  }, [speechRate, speechVoice]);

  const reset = useCallback(async () => {
    setResetLoading(true);
    setMessage(null);
    try {
      const res = await resetSettings();
      if (res.success && res.data) {
        const d = res.data as { speech_rate?: number; speech_voice?: string };
        if (d.speech_rate != null) setSpeechRate(String(d.speech_rate));
        if (d.speech_voice) setSpeechVoice(d.speech_voice);
        setMessage({ type: "ok", text: "設定をリセットしました" });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "リセットに失敗しました",
      });
    } finally {
      setResetLoading(false);
    }
  }, []);

  return {
    speechRate,
    setSpeechRate,
    speechVoice,
    setSpeechVoice,
    loading,
    save,
    saveLoading,
    reset,
    resetLoading,
    message,
  };
}
