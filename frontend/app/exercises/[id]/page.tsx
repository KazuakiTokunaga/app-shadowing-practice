"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  fetchExercise,
  updateExerciseTitle,
  deleteExercise,
  fullAudioUrl,
  turnAudioUrl,
  fetchShadowingResults,
  saveShadowingResult,
  transcribeBatch,
  type Exercise as ExerciseType,
  type Result as ResultType,
} from "@/lib/api";

type TabId = "detail" | "listen" | "shadowing" | "results";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// テキスト比較で不一致箇所をハイライト用にマーク
function compareTexts(original: string, recognized: string): string {
  const origWords = original.match(/\b[\w']+\b|[^\w\s]/g) || [];
  const recWords = recognized.match(/\b[\w']+\b|[^\w\s]/g) || [];
  const dp: number[][] = Array(origWords.length + 1)
    .fill(null)
    .map(() => Array(recWords.length + 1).fill(0));
  for (let i = 1; i <= origWords.length; i++) {
    for (let j = 1; j <= recWords.length; j++) {
      if (origWords[i - 1].toLowerCase() === recWords[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const matched = new Set<number>();
  let i = origWords.length,
    j = recWords.length;
  while (i > 0 && j > 0) {
    if (origWords[i - 1].toLowerCase() === recWords[j - 1].toLowerCase()) {
      matched.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return origWords
    .map((word, idx) => {
      const isAlphabetic = /^[a-zA-Z']+$/.test(word);
      const ok = matched.has(idx) || !isAlphabetic;
      const escaped = escapeHtml(word);
      const span = ok
        ? escaped
        : `<span class="text-red-600 font-semibold">${escaped}</span>`;
      const next = origWords[idx + 1];
      const needSpace =
        next && !/^[^\w\s]$/.test(word) && !/^[^\w\s]$/.test(next);
      return span + (needSpace ? " " : "");
    })
    .join("");
}

export default function ExerciseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const [exercise, setExercise] = useState<ExerciseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("detail");

  // 詳細タブ: タイトル編集
  const [titleEdit, setTitleEdit] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // 結果一覧・結果詳細
  const [results, setResults] = useState<ResultType[]>([]);
  const [resultDetail, setResultDetail] = useState<ResultType | null>(null);

  // リスニング: 音声
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioCurrent, setAudioCurrent] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // シャドーイング
  const [currentTurn, setCurrentTurn] = useState(0);
  const [recordings, setRecordings] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [shadowingLoading, setShadowingLoading] = useState(false);

  const loadExercise = useCallback(async () => {
    if (!id || Number.isNaN(id)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchExercise(id);
      if (res.success && res.data) {
        setExercise(res.data);
        setEditTitleValue(res.data.title);
      } else {
        setError(res.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadResults = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchShadowingResults(id);
      if (res.success && res.data) setResults(res.data);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    loadExercise();
  }, [loadExercise]);

  useEffect(() => {
    if (tab === "results") loadResults();
  }, [tab, loadResults]);

  // 音声の timeupdate
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setAudioCurrent(audio.currentTime);
    const onLoadedMetadata = () => setAudioDuration(audio.duration);
    const onEnded = () => setAudioPlaying(false);
    const onPlay = () => setAudioPlaying(true);
    const onPause = () => setAudioPlaying(false);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [exercise?.id, tab]);

  const handleSaveTitle = async () => {
    if (!exercise || !editTitleValue.trim()) return;
    setSavingTitle(true);
    try {
      const res = await updateExerciseTitle(exercise.id, editTitleValue.trim());
      if (res.success && res.data) {
        setExercise(res.data);
        setTitleEdit(false);
      }
    } finally {
      setSavingTitle(false);
    }
  };

  const handleDelete = async () => {
    if (!exercise || !confirm("この課題を削除してもよろしいですか？")) return;
    try {
      const res = await deleteExercise(exercise.id);
      if (res.success) {
        router.push("/");
      }
    } catch (e) {
      alert("削除に失敗しました: " + (e instanceof Error ? e.message : ""));
    }
  };

  const playFullAudio = () => {
    if (!exercise) return;
    const url = fullAudioUrl(exercise.id);
    if (!audioRef.current) {
      const a = new Audio(url);
      audioRef.current = a;
      a.addEventListener("loadedmetadata", () => setAudioDuration(a.duration));
      a.addEventListener("timeupdate", () => setAudioCurrent(a.currentTime));
      a.addEventListener("ended", () => setAudioPlaying(false));
      a.play().then(() => setAudioPlaying(true));
    } else {
      if (audioRef.current.src !== url) {
        audioRef.current.src = url;
        audioRef.current.load();
      }
      audioRef.current.play().then(() => setAudioPlaying(true));
    }
  };

  const pauseFullAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setAudioPlaying(false);
    }
  };

  const seekAudio = (value: number) => {
    if (audioRef.current && !Number.isNaN(audioRef.current.duration)) {
      audioRef.current.currentTime = value;
      setAudioCurrent(value);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // シャドーイング: 開始
  const startTurn = async () => {
    if (!exercise || currentTurn >= exercise.turns.length) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const options: MediaRecorderOptions = {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 128000,
      };
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = "audio/webm";
      }
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: options.mimeType || "audio/webm",
        });
        setRecordings((prev) => {
          const next = [...prev];
          next[currentTurn] = blob;
          return next;
        });
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start(50);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setShowNext(false);

      // 1秒後にターン音声再生
      setTimeout(() => {
        const turn = exercise.turns[currentTurn];
        const audio = new Audio(turnAudioUrl(exercise.id, turn.id));
        audio.onended = () => {
          setShowNext(true);
        };
        audio.play().catch(console.error);
      }, 1000);
    } catch (e) {
      alert(
        "マイクへのアクセスが拒否されました: " +
          (e instanceof Error ? e.message : "")
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const nextTurn = async () => {
    stopRecording();
    if (currentTurn + 1 < (exercise?.turns.length ?? 0)) {
      setCurrentTurn((c) => c + 1);
      setShowNext(false);
      setTimeout(() => startTurn(), 100);
    } else {
      setShowNext(false);
    }
  };

  const restartShadowing = () => {
    stopRecording();
    setCurrentTurn(0);
    setRecordings([]);
    setShowNext(false);
  };

  const finishShadowing = async () => {
    stopRecording();
    if (!exercise || recordings.length === 0) return;
    const validRecordings = recordings.filter(Boolean);
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
        loadResults();
        loadExercise();
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

  const canFinishShadowing =
    exercise &&
    currentTurn >= exercise.turns.length &&
    recordings.filter(Boolean).length === exercise.turns.length;

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
            {currentTurn < exercise.turns.length && !showNext && !recording && (
              <button
                type="button"
                onClick={startTurn}
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
          {recording && (
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
                            __html: compareTexts(tr.original, tr.recognized),
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
