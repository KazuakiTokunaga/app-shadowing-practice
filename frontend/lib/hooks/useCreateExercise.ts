"use client";

import { useState } from "react";
import { createExercise } from "@/lib/api";

export function useCreateExercise(options?: { onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (params: { title: string; content: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await createExercise(params);
      if (res.success) {
        options?.onSuccess?.();
        return true;
      }
      setError(res.message);
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { create, loading, error };
}
