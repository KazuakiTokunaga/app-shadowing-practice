"use client";

import { useSettings } from "@/lib/hooks/useSettings";

const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
];

export default function SettingsPage() {
  const {
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
  } = useSettings();

  const handleReset = async () => {
    if (!confirm("設定をデフォルト値にリセットしてもよろしいですか？")) return;
    await reset();
  };

  if (loading) {
    return <p className="text-[#7f8c8d]">読み込み中...</p>;
  }

  return (
    <div>
      <h2 className="text-2xl font-light text-[#2c3e50] mb-8">設定</h2>
      <div className="max-w-md space-y-6">
        <div>
          <label htmlFor="speech-rate" className="block font-medium mb-2">
            読み上げ速度
          </label>
          <select
            id="speech-rate"
            value={speechRate}
            onChange={(e) => setSpeechRate(e.target.value)}
            className="w-full p-2 border border-[#ddd] rounded"
          >
            {[1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0].map(
              (r) => (
                <option key={r} value={String(r)}>
                  {r}倍
                </option>
              )
            )}
          </select>
        </div>
        <div>
          <label htmlFor="speech-voice" className="block font-medium mb-2">
            音声の種類
          </label>
          <select
            id="speech-voice"
            value={speechVoice}
            onChange={(e) => setSpeechVoice(e.target.value)}
            className="w-full p-2 border border-[#ddd] rounded"
          >
            {VOICES.map((v) => (
              <option key={v} value={v}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </div>
        {message && (
          <p
            className={
              message.type === "ok" ? "text-green-600" : "text-red-600"
            }
          >
            {message.text}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saveLoading}
            className="px-5 py-2.5 bg-[#3498db] text-white rounded cursor-pointer hover:bg-[#2980b9] disabled:opacity-50"
          >
            {saveLoading ? "保存中..." : "設定を保存"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetLoading}
            className="px-5 py-2.5 bg-[#95a5a6] text-white rounded cursor-pointer hover:bg-[#7f8c8d] disabled:opacity-50"
          >
            デフォルトに戻す
          </button>
        </div>
      </div>
    </div>
  );
}
