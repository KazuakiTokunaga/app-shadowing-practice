"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchExercises, type ExerciseList } from "@/lib/api";

export function useExercises(sort: string) {
  const [exercises, setExercises] = useState<ExerciseList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sortBy, order] = sort.split(":");
      const res = await fetchExercises(sortBy, order);
      if (res.success && res.data) setExercises(res.data);
      else setError(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    load();
  }, [load]);

  return { exercises, loading, error, reload: load };
}
