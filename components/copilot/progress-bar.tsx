"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ProgressStage {
  label: string;
  duration: number;
}

interface ProgressBarProps {
  active: boolean;
  stages: ProgressStage[];
  completedMessage?: string;
  liveProgress?: {
    message: string;
    progress?: number;
  } | null;
}

export function ProgressBar({ active, stages, completedMessage, liveProgress }: ProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevActiveRef = useRef(active);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      cleanup();
      setProgress(0);
      setStageIndex(0);
      setVisible(true);

      const totalDuration = stages.reduce((sum, s) => sum + s.duration, 0);
      let elapsed = 0;

      intervalRef.current = setInterval(() => {
        elapsed += 100;

        let stageStart = 0;
        let currentStage = 0;
        for (let i = 0; i < stages.length; i++) {
          if (elapsed >= stageStart && elapsed < stageStart + stages[i].duration) {
            currentStage = i;
            break;
          }
          stageStart += stages[i].duration;
          if (i === stages.length - 1) currentStage = stages.length - 1;
        }
        setStageIndex(currentStage);
        setProgress(Math.min((elapsed / totalDuration) * 92, 92));
      }, 100);
    }

    if (!active && prevActiveRef.current) {
      cleanup();
      setProgress(100);
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
        setStageIndex(0);
      }, 800);
    }

    prevActiveRef.current = active;
    return cleanup;
  }, [active, stages, cleanup]);

  if (!visible) return null;

  const displayProgress = active && typeof liveProgress?.progress === "number"
    ? Math.max(0, Math.min(100, liveProgress.progress))
    : progress;
  const displayStageIndex = active && liveProgress
    ? Math.min(stages.length - 1, Math.floor((displayProgress / 100) * stages.length))
    : stageIndex;
  const currentLabel = displayProgress >= 100
    ? (completedMessage || "完成")
    : liveProgress?.message || stages[stageIndex]?.label || "";

  return (
    <div className="w-full space-y-3 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-indigo-700">{currentLabel}</span>
        <span className="tabular-nums text-slate-400">{Math.round(displayProgress)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#4f46e5,#7c3aed)] transition-all duration-300 ease-out"
          style={{ width: `${displayProgress}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {stages.map((stage, index) => {
          const isDone = displayProgress >= 100 || index < displayStageIndex;
          const isCurrent = active && index === displayStageIndex;
          return (
            <span
              key={`${stage.label}-${index}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                isDone
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isCurrent
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              {stage.label}
            </span>
          );
        })}
      </div>
      {active && (
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
          {liveProgress?.message || "处理中，请稍候..."}
        </div>
      )}
    </div>
  );
}
