"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useNavigation } from "@/lib/navigation";
import {
  fullAudioUrl,
  turnAudioUrl,
  saveShadowingResult,
  transcribeBatch,
} from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/utils/format";
import {
  compareTextsToWords,
  compareWordsToHighlightHtml,
} from "@/lib/utils/compare";
import { useExercise } from "@/lib/hooks/useExercise";
import { useShadowingResults } from "@/lib/hooks/useShadowingResults";
import { useAudioPlayback } from "@/lib/hooks/useAudioPlayback";
import { useRecording } from "@/lib/recording";

type TabId = "detail" | "listen" | "shadowing" | "results";

export default function ExerciseDetailPage() {
  const params = useParams();
  const navigation = useNavigation();
  const id = Number(params?.id) || null;
  const [tab, setTab] = useState<TabId>("detail");

  const {
    exercise,
    loading,
    error,
    reload: reloadExercise,
    updateTitle,
    deleteExercise: removeExercise,
    savingTitle,
  } = useExercise(id);

  const {
    results,
    reload: reloadResults,
    resultDetail,
    setResultDetail,
  } = useShadowingResults(id, { enabled: tab === "results" });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    currentTime: audioCurrent,
    duration: audioDuration,
    playing: audioPlaying,
    play: playAudio,
    pause: pauseAudio,
    seek: seekAudio,
  } = useAudioPlayback(audioRef, { active: tab === "listen" });

  const [titleEdit, setTitleEdit] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  useEffect(() => {
    if (exercise) setEditTitleValue(exercise.title);
  }, [exercise?.id, exercise?.title]);

  const recordingSession = useRecording();

  const [currentTurn, setCurrentTurn] = useState(0);
  const [recordings, setRecordings] = useState<Blob[]>([]);
  const [showNext, setShowNext] = useState(false);
  const [shadowingLoading, setShadowingLoading] = useState(false);

  const handleSaveTitle = async () => {
    const ok = await updateTitle(editTitleValue);
    if (ok) setTitleEdit(false);
  };

  const handleDelete = async () => {
    if (!exercise || !confirm("この課題を削除してもよろしいですか？")) return;
    const ok = await removeExercise();
    if (ok) navigation.navigateToHome();
    else alert("削除に失敗しました");
  };

  const playFullAudio = () => {
    if (exercise) playAudio(fullAudioUrl(exercise.id));
  };

  const pauseFullAudio = () => pauseAudio();

  const startTurn = async (turnIndex?: number) => {
    const index = turnIndex ?? currentTurn;
    if (!exercise || index >= exercise.turns.length) return;
    try {
      await recordingSession.start();
      setShowNext(false);
      const turn = exercise.turns[index];
      setTimeout(() => {
        const audio = new Audio(turnAudioUrl(exercise.id, turn.id));
        audio.onended = () => setShowNext(true);
        audio.play().catch(console.error);
      }, 1000);
    } catch (e) {
      alert(
        "マイクへのアクセスが拒否されました: " +
          (e instanceof Error ? e.message : "")
      );
    }
  };

  const nextTurn = async () => {
    const blob = await recordingSession.stop();
    if (blob) {
      setRecordings((prev) => {
        const next = [...prev];
        next[currentTurn] = blob;
        return next;
      });
    }
    const nextIndex = currentTurn + 1;
    if (nextIndex < (exercise?.turns.length ?? 0)) {
      setCurrentTurn(nextIndex);
      setShowNext(false);
      setTimeout(() => startTurn(nextIndex), 100);
    } else {
      setShowNext(false);
    }
  };

  const restartShadowing = async () => {
    await recordingSession.stop();
    setCurrentTurn(0);
    setRecordings([]);
    setShowNext(false);
  };

  const finishShadowing = async () => {
    const lastBlob = await recordingSession.stop();
    if (!exercise) return;
    let validRecordings = recordings.filter(Boolean);
    if (
      lastBlob != null &&
      validRecordings.length === currentTurn &&
      currentTurn < exercise.turns.length
    ) {
      validRecordings = [...validRecordings, lastBlob];
    }
    if (validRecordings.length !== exercise.turns.length) {
      alert("全ターンの録音が完了していません");
      return;
    }
    setShadowingLoading(true);
    try {
      const formData = new FormData();
      const turnIds: number[] = [];
      exercise.turns.forEach((t, i) => {
        if (validRecordings[i]) {
          formData.append("audio_files", validRecordings[i], `turn_${i}.webm`);
          turnIds.push(t.id);
        }
      });
      formData.append("turn_ids", JSON.stringify(turnIds));
      const transRes = await transcribeBatch(exercise.id, formData);
      if (!transRes.success || !transRes.data)
        throw new Error("書き起こしに失敗しました");
      const transcriptions = transRes.data.map((x) => x.transcription);
      const saveRes = await saveShadowingResult(exercise.id, transcriptions);
      if (saveRes.success && saveRes.data) {
        setResultDetail(saveRes.data);
        reloadResults();
        reloadExercise();
      } else {
        throw new Error(saveRes.message);
      }
    } catch (e) {
      alert(
        "結果の保存に失敗しました: " + (e instanceof Error ? e.message : "")
      );
    } finally {
      setShadowingLoading(false);
    }
  };

  const hasAllRecordings = recordings.filter(Boolean).length === exercise?.turns.length;
  const isOnLastTurnWithRecording =
    exercise &&
    currentTurn === exercise.turns.length - 1 &&
    showNext &&
    recordings.filter(Boolean).length === currentTurn;
  const canFinishShadowing =
    exercise &&
    (hasAllRecordings ||
      isOnLastTurnWithRecording) &&
    (currentTurn >= exercise.turns.length - 1);

  if (loading) return <p className="text-[#7f8c8d]">読み込み中...</p>;
  if (error || !exercise) {
    return (
      <div>
        <p className="text-red-600">{error || "課題が見つかりません"}</p>
        <Link href="/" className="text-[#3498db] underline mt-4 inline-block">
          一覧へ戻る
        </Link>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "detail", label: "詳細" },
    { id: "listen", label: "リスニング" },
    { id: "shadowing", label: "シャドーイング" },
    { id: "results", label: "結果" },
  ];

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-[#3498db] hover:underline">
          ← 一覧へ
        </Link>
        <h2 className="text-2xl font-light text-[#2c3e50]">{exercise.title}</h2>
      </div>

      <div className="flex border-b border-[#eee] mb-6">
        {tabs.map(({ id: t, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-6 py-4 border-b-2 border-transparent cursor-pointer ${
              tab === t ? "text-[#3498db] border-[#3498db]" : "text-[#7f8c8d]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 詳細タブ */}
      {tab === "detail" && (
        <div className="space-y-4">
          <div>
            <label className="block font-medium mb-1">タイトル</label>
            {titleEdit ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  className="flex-1 p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={savingTitle}
                  className="px-4 py-2 bg-[#3498db] text-white rounded"
                >
                  {savingTitle ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleEdit(false);
                    setEditTitleValue(exercise.title);
                  }}
                  className="px-4 py-2 bg-[#95a5a6] text-white rounded"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <span>{exercise.title}</span>
                <button
                  type="button"
                  onClick={() => setTitleEdit(true)}
                  className="text-sm px-2 py-1 border rounded"
                >
                  編集
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block font-medium mb-1">英文</label>
            <textarea
              readOnly
              value={exercise.content}
              rows={8}
              className="w-full p-3 border rounded bg-[#f8f9fa]"
            />
            <p className="text-sm text-[#7f8c8d] mt-1">
              {exercise.word_count} 単語
            </p>
          </div>
          <div>
            <label className="block font-medium mb-1">音声設定</label>
            <p className="text-[#6c757d]">
              再生速度: {exercise.speech_rate.toFixed(1)}倍 / 音声:{" "}
              {exercise.speech_voice}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 bg-[#e74c3c] text-white rounded hover:bg-[#c0392b]"
          >
            課題を削除
          </button>
        </div>
      )}

      {/* リスニングタブ */}
      {tab === "listen" && (
        <div>
          <div className="space-y-2 mb-6 max-h-64 overflow-y-auto border rounded p-2">
            {exercise.turns.map((t) => (
              <div key={t.id} className="flex gap-2 items-start">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#3498db] text-white flex items-center justify-center text-sm font-bold">
                  {t.id}
                </span>
                <span className="text-sm">{t.text}</span>
              </div>
            ))}
          </div>
          <div className="max-w-xl mx-auto bg-[#f8f9fa] p-4 rounded-lg">
            <div className="flex justify-center gap-2 mb-4">
              <button
                type="button"
                onClick={audioPlaying ? pauseFullAudio : playFullAudio}
                className="px-5 py-2 bg-[#3498db] text-white rounded"
              >
                {audioPlaying ? "一時停止" : "再生"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm w-12 text-center">
                {formatTime(audioCurrent)}
              </span>
              <input
                type="range"
                min={0}
                max={audioDuration || 100}
                value={audioCurrent}
                onChange={(e) => seekAudio(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-12 text-center">
                {formatTime(audioDuration)}
              </span>
            </div>
          </div>
          <audio
            ref={audioRef}
            src={fullAudioUrl(exercise.id)}
            preload="metadata"
          />
        </div>
      )}

      {/* シャドーイングタブ */}
      {tab === "shadowing" && (
        <div className="max-w-xl mx-auto">
          <p className="mb-4">
            {currentTurn + 1} / {exercise.turns.length}
          </p>
          <p className="bg-[#f8f9fa] p-4 rounded mb-4">
            {currentTurn < exercise.turns.length
              ? "音声を聞いてシャドーイングしてください"
              : "すべてのターンが完了しました"}
          </p>
          <div className="flex gap-2 flex-wrap">
            {currentTurn < exercise.turns.length && !showNext && !recordingSession.isRecording && (
              <button
                type="button"
                onClick={() => startTurn()}
                className="px-5 py-2 bg-[#3498db] text-white rounded"
              >
                開始
              </button>
            )}
            {showNext && currentTurn + 1 < exercise.turns.length && (
              <button
                type="button"
                onClick={nextTurn}
                className="px-5 py-2 bg-[#3498db] text-white rounded"
              >
                次へ
              </button>
            )}
            {showNext && (
              <button
                type="button"
                onClick={restartShadowing}
                className="px-5 py-2 bg-[#95a5a6] text-white rounded"
              >
                最初から
              </button>
            )}
            {canFinishShadowing && (
              <button
                type="button"
                onClick={finishShadowing}
                disabled={shadowingLoading}
                className="px-5 py-2 bg-[#2ecc71] text-white rounded"
              >
                {shadowingLoading ? "解析中..." : "完了"}
              </button>
            )}
          </div>
          {recordingSession.isRecording && (
            <div className="mt-4 flex items-center gap-2 text-red-600">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              録音中...
            </div>
          )}
        </div>
      )}

      {/* 結果タブ */}
      {tab === "results" && (
        <div>
          {results.length === 0 ? (
            <p className="text-[#7f8c8d] py-8">まだ実施結果がありません。</p>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setResultDetail(r)}
                  className="w-full text-left p-4 bg-white border rounded hover:border-[#3498db] flex justify-between"
                >
                  <span className="font-semibold text-[#2ecc71]">
                    {r.total_score.toFixed(1)}%
                  </span>
                  <span className="text-sm text-[#7f8c8d]">
                    {formatDateTime(r.completed_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 結果詳細モーダル */}
      {resultDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setResultDetail(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">シャドーイング結果</h3>
              <button
                type="button"
                onClick={() => setResultDetail(null)}
                className="text-xl text-[#7f8c8d]"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-2xl font-bold text-[#2ecc71] mb-4">
                総合スコア: {resultDetail.total_score.toFixed(1)}%
              </p>
              <div className="space-y-4">
                {resultDetail.turn_results.map((tr) => (
                  <div key={tr.turn_id} className="border rounded p-3">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-bold">ターン {tr.turn_id}</span>
                      <span className="text-[#2ecc71]">
                        {tr.score.toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[#6c757d] mb-1">元の文章</p>
                        <p
                          className="leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: compareWordsToHighlightHtml(
                              compareTextsToWords(tr.original, tr.recognized),
                            ),
                          }}
                        />
                      </div>
                      <div>
                        <p className="text-[#6c757d] mb-1">認識結果</p>
                        <p className="leading-relaxed">{tr.recognized}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t">
              <button
                type="button"
                onClick={() => setResultDetail(null)}
                className="px-4 py-2 bg-[#95a5a6] text-white rounded"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
