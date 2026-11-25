"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Check, MessageSquare } from "lucide-react";
import { clsx } from "clsx";
import type { LanguageCode } from "@/lib/contracts";
import { Button } from "@/components/ui/primitives";

const MAX_RECORDING_SECONDS = 25;

export function VoiceRecorder({
  eventId,
  token,
  languageCode,
  onTranscriptConfirmed,
  compact = false,
}: {
  eventId: string;
  token: string;
  languageCode: LanguageCode;
  onTranscriptConfirmed: (text: string) => void;
  compact?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_SECONDS);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  async function sendAudioForTranscription(blob: Blob, fileName: string) {
    setTranscribing(true);
    setErrorMsg(null);
    try {
      const form = new FormData();
      form.append("file", blob, fileName);
      form.append("language_code", languageCode);

      const res = await fetch(
        `/api/speech/transcribe?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          body: form,
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(
          data.error ||
            "Could not transcribe audio. You can type your request below."
        );
        setShowEditor(true);
        return;
      }
      setTranscript(data.transcript || "");
      setShowEditor(true);
    } catch {
      setErrorMsg(
        "Voice service could not be reached. Please type your request below."
      );
      setShowEditor(true);
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    setErrorMsg(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setErrorMsg(
        "Microphone is not available in this browser. Please type your request instead."
      );
      setShowEditor(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 400) {
          setErrorMsg(
            "Audio sounded very short or silent. Please try again or type your request."
          );
          setShowEditor(true);
          return;
        }
        await sendAudioForTranscription(
          blob,
          mimeType.includes("webm") ? "note.webm" : "note.mp4"
        );
      };

      recorder.start();
      setRecording(true);
      setSecondsLeft(MAX_RECORDING_SECONDS);

      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              mediaRecorderRef.current.stop();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setErrorMsg(
        "Microphone permission was denied. No problem — you can type your request below."
      );
      setShowEditor(true);
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(
        "Audio file is too large (keep voice notes under 25 seconds). Please record a shorter clip or type below."
      );
      setShowEditor(true);
      return;
    }
    await sendAudioForTranscription(file, file.name);
  }

  return (
    <div className="space-y-4">
      <div
        className={clsx(
          "flex flex-col items-center justify-center rounded-card border border-border bg-surface-2/60 p-5 text-center",
          compact && "p-3"
        )}
      >
        <div className="relative flex items-center justify-center">
          {recording ? (
            <span
              className="absolute h-20 w-20 animate-ping rounded-full bg-accent/40"
              aria-hidden="true"
            />
          ) : null}
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            aria-label={recording ? "Stop recording" : "Record voice note"}
            className={clsx(
              "relative flex h-16 w-16 items-center justify-center rounded-full shadow-soft transition-transform active:scale-95",
              recording
                ? "bg-danger text-white"
                : "bg-primary text-white hover:bg-primary-hover"
            )}
          >
            {recording ? (
              <Square className="h-6 w-6" />
            ) : (
              <Mic className="h-7 w-7" />
            )}
          </button>
        </div>

        <div className="mt-3 text-sm font-medium text-ink">
          {transcribing
            ? "Listening and transcribing with Sarvam AI..."
            : recording
            ? `Recording... ${secondsLeft}s left (tap to finish)`
            : "Tap to speak in Kannada, Hindi, or English (up to 25s)"}
        </div>

        {recording ? (
          <div className="mt-2 flex h-5 items-end justify-center gap-1" aria-hidden="true">
            {[12, 20, 14, 22, 16, 10].map((h, i) => (
              <span
                key={i}
                className="w-1.5 animate-pulse rounded-full bg-accent"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={recording || transcribing}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2"
          >
            <Upload className="h-4 w-4" />
            Upload audio clip
          </button>
          <button
            type="button"
            onClick={() => setShowEditor(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2"
          >
            <MessageSquare className="h-4 w-4" />
            Type instead
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-warning"
        >
          {errorMsg}
        </div>
      ) : null}

      {showEditor ? (
        <div className="space-y-3 rounded-card border border-border bg-surface p-4">
          <label
            htmlFor="tayyari-transcript-box"
            className="block text-sm font-semibold text-ink"
          >
            Review or type your request (confirm numbers before continuing)
          </label>
          <textarea
            id="tayyari-transcript-box"
            rows={3}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Example: Increase catering plates from 150 to 200"
            className="w-full rounded-control border border-border bg-bg p-3 text-base text-ink indic-leading"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!transcript.trim()}
              onClick={() => onTranscriptConfirmed(transcript.trim())}
            >
              <Check className="h-4 w-4" />
              Looks right
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
