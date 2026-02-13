"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchExercises,
  createExercise,
  type ExerciseList as ExerciseListType,
} from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ja-JP");
}

export default function HomePage() {
  const [exercises, setExercises] = useState<ExerciseListType[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("created_at:desc");
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadExercises = useCallback(async () => {
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
    loadExercises();
  }, [loadExercises]);

  const wordCount = createContent.trim()
    ? createContent.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const canSubmit = createTitle.trim() && wordCount >= 50 && wordCount <= 300;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await createExercise({
        title: createTitle.trim(),
        content: createContent.trim(),
      });
      if (res.success) {
        setModalOpen(false);
        setCreateTitle("");
        setCreateContent("");
        loadExercises();
      } else {
        setCreateError(res.message);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-light text-[#2c3e50]">課題管理</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-5 py-2.5 bg-[#3498db] text-white rounded border-0 cursor-pointer hover:bg-[#2980b9] transition"
        >
          新しい課題を作成
        </button>
      </div>

      <div className="mb-4">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="p-2 border border-[#ddd] rounded text-base"
        >
          <option value="created_at:desc">作成日時（新しい順）</option>
          <option value="created_at:asc">作成日時（古い順）</option>
          <option value="title:asc">タイトル（昇順）</option>
          <option value="title:desc">タイトル（降順）</option>
          <option value="max_score:desc">スコア（高い順）</option>
          <option value="max_score:asc">スコア（低い順）</option>
          <option value="last_practiced_at:desc">最終実施日（新しい順）</option>
          <option value="last_practiced_at:asc">最終実施日（古い順）</option>
        </select>
      </div>

      {error && <p className="text-red-600 mb-4">エラー: {error}</p>}

      {loading ? (
        <p className="text-[#7f8c8d] py-8">読み込み中...</p>
      ) : exercises.length === 0 ? (
        <p className="text-center text-[#7f8c8d] text-lg py-8">
          まだ課題がありません。新しい課題を作成してください。
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {exercises.map((ex) => (
            <Link
              key={ex.id}
              href={`/exercises/${ex.id}`}
              className="block bg-white rounded-lg p-4 shadow border border-[#e1e8ed] hover:border-[#c3d0db] hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer"
            >
              <h3 className="text-[#2c3e50] font-semibold text-base mb-1">
                {ex.title}
              </h3>
              <div className="text-[#7f8c8d] text-xs mb-2">
                作成日: {formatDate(ex.created_at)}
                {ex.last_practiced_at && (
                  <>
                    <br />
                    最終実施: {formatDate(ex.last_practiced_at)}
                  </>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#2ecc71] font-semibold">
                  最高スコア:{" "}
                  {ex.max_score != null
                    ? `${ex.max_score.toFixed(1)}%`
                    : "未実施"}
                </span>
                <span className="text-[#7f8c8d]">
                  実施回数: {ex.attempt_count}回
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 課題作成モーダル */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !createLoading && setModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">新しい課題を作成</h3>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="exercise-title"
                  className="block text-sm font-medium mb-1"
                >
                  タイトル（必須）
                </label>
                <input
                  id="exercise-title"
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="課題のタイトルを入力"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label
                  htmlFor="exercise-content"
                  className="block text-sm font-medium mb-1"
                >
                  英文（50-300単語）
                </label>
                <textarea
                  id="exercise-content"
                  rows={10}
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  placeholder="英文を入力..."
                  className="w-full px-3 py-2 border rounded"
                />
                <p className="text-sm text-[#7f8c8d] mt-1">
                  単語数: {wordCount}
                </p>
              </div>
            </div>
            {createError && (
              <p className="text-red-600 text-sm mt-2">エラー: {createError}</p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => !createLoading && setModalOpen(false)}
                className="px-4 py-2 bg-[#95a5a6] text-white rounded cursor-pointer hover:bg-[#7f8c8d]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit || createLoading}
                className="px-4 py-2 bg-[#3498db] text-white rounded cursor-pointer hover:bg-[#2980b9] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createLoading ? "作成中..." : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
