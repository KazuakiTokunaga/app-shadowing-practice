"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchShadowingResults, type Result } from "@/lib/api";

export function useShadowingResults(
  exerciseId: number | null,
  options?: { enabled?: boolean }
) {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultDetail, setResultDetail] = useState<Result | null>(null);

  const load = useCallback(async () => {
    if (exerciseId == null) return;
    setLoading(true);
    try {
      const res = await fetchShadowingResults(exerciseId);
      if (res.success && res.data) setResults(res.data);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    if (options?.enabled && exerciseId != null) {
      load();
    }
  }, [options?.enabled, exerciseId, load]);

  return { results, loading, reload: load, resultDetail, setResultDetail };
}
