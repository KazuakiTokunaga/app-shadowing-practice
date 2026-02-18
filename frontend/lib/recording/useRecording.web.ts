"use client";

import { useCallback, useRef, useState } from "react";
import type { RecordingSession } from "./types";

/**
 * Web 用: MediaRecorder を使った録音フック。
 */
export function useRecording(): RecordingSession {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    streamRef.current = stream;

    const options: MediaRecorderOptions = {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 128000,
    };
    if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
      options.mimeType = "audio/webm";
    }

    const recorder = new MediaRecorder(stream, options);
    chunksRef.current = [];
    resolveStopRef.current = null;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob =
        chunksRef.current.length > 0
          ? new Blob(chunksRef.current, {
              type: options.mimeType || "audio/webm",
            })
          : null;
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsRecording(false);
      resolveStopRef.current?.(blob);
      resolveStopRef.current = null;
    };

    recorder.start(50);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        resolve(null);
        return;
      }
      resolveStopRef.current = resolve;
      recorder.stop();
      mediaRecorderRef.current = null;
    });
  }, []);

  return { start, stop, isRecording };
}
