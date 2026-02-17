"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web 用: HTMLAudioElement を使った音声再生フック。
 * React Native では別実装（expo-av 等）のフックを使う想定。
 * @param active - タブ切り替えなどで audio が DOM にマウントされているとき true にするとイベントを購読する
 */
export function useAudioPlayback(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  options?: { active?: boolean }
) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (options?.active === false) return;
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
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
  }, [audioRef, options?.active]);

  const play = useCallback(
    (url: string) => {
      const el = audioRef.current;
      if (!el) return;
      if (el.src !== url) {
        el.src = url;
        el.load();
      }
      el.play().then(() => setPlaying(true));
    },
    [audioRef]
  );

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      setPlaying(false);
    }
  }, [audioRef]);

  const seek = useCallback(
    (value: number) => {
      const el = audioRef.current;
      if (el && !Number.isNaN(el.duration)) {
        el.currentTime = value;
        setCurrentTime(value);
      }
    },
    [audioRef]
  );

  return { currentTime, duration, playing, play, pause, seek };
}
