"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchExercise,
  updateExerciseTitle,
  deleteExercise,
  type Exercise,
} from "@/lib/api";

export function useExercise(id: number | null) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);

  const load = useCallback(async () => {
    if (id == null || Number.isNaN(id)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchExercise(id);
      if (res.success && res.data) {
        setExercise(res.data);
      } else {
        setError(res.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateTitle = useCallback(async (title: string) => {
    if (!exercise || !title.trim()) return false;
    setSavingTitle(true);
    try {
      const res = await updateExerciseTitle(exercise.id, title.trim());
      if (res.success && res.data) {
        setExercise(res.data);
        return true;
      }
      return false;
    } finally {
      setSavingTitle(false);
    }
  }, [exercise]);

  const remove = useCallback(async () => {
    if (!exercise) return false;
    try {
      const res = await deleteExercise(exercise.id);
      return res.success;
    } catch {
      return false;
    }
  }, [exercise]);

  return {
    exercise,
    loading,
    error,
    reload: load,
    updateTitle,
    deleteExercise: remove,
    savingTitle,
  };
}
