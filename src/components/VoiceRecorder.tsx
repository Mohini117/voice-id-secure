import { useEffect, useRef, useState } from 'react';

import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  isRecording: boolean;
  isProcessing: boolean;
  audioLevel: number;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  minDuration?: number;
  maxDuration?: number;
}

export function VoiceRecorder({
  isRecording,
  isProcessing,
  audioLevel,
  onStart,
  onStop,
  disabled = false,
  minDuration = 2,
  maxDuration = 10,
}: VoiceRecorderProps) {
  const [recordingTime, setRecordingTime] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    if (!isRecording) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setRecordingTime(0);

    intervalRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const next = Math.min(prev + 0.1, maxDuration);
        if (next >= maxDuration && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return next;
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRecording, maxDuration]);

  // Auto-stop safely (after render) when max duration is reached
  useEffect(() => {
    if (isRecording && recordingTime >= maxDuration) {
      onStopRef.current();
    }
  }, [isRecording, recordingTime, maxDuration]);

  const handleClick = () => {
    if (isProcessing) return;
    
    if (isRecording) {
      if (recordingTime >= minDuration) {
        onStop();
      }
    } else {
      onStart();
    }
  };

  const canStop = recordingTime >= minDuration;
  const progress = (recordingTime / maxDuration) * 100;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        {/* Outer glow rings */}
        {isRecording && (
          <>
            <div
              className="absolute inset-[-20px] rounded-full bg-gradient-to-r from-primary/30 to-accent/30 blur-2xl transition-all duration-200"
              style={{
                transform: `scale(${1 + audioLevel * 0.3})`,
                opacity: 0.3 + audioLevel * 0.4,
              }}
            />
            <div
              className="absolute inset-[-10px] rounded-full border-2 border-primary/30 pulse-ring"
              style={{
                transform: `scale(${1 + audioLevel * 0.15})`,
              }}
            />
            <div
              className="absolute inset-[-5px] rounded-full border border-primary/20"
              style={{
                transform: `scale(${1 + audioLevel * 0.1})`,
              }}
            />
          </>
        )}

        {/* Main button */}
        <button
          onClick={handleClick}
          disabled={disabled || isProcessing || (isRecording && !canStop)}
          className={cn(
            "relative w-28 h-28 rounded-full transition-all duration-300",
            "flex items-center justify-center",
            "border-2",
            isRecording 
              ? "bg-gradient-to-br from-destructive to-red-600 border-destructive/50 shadow-[0_0_40px_rgba(239,68,68,0.4)]" 
              : "bg-gradient-to-br from-primary to-accent border-primary/50 shadow-[var(--glow-primary)]",
            "hover:scale-105 active:scale-95",
            disabled && "opacity-50 cursor-not-allowed hover:scale-100",
            isProcessing && "animate-pulse"
          )}
        >
          {isProcessing ? (
            <Loader2 className="w-12 h-12 text-primary-foreground animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-12 h-12 text-destructive-foreground" />
          ) : (
            <Mic className="w-12 h-12 text-primary-foreground" />
          )}
        </button>

        {/* Progress ring */}
        {isRecording && (
          <svg
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-primary/20"
            />
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${progress * 3.02} 302`}
              className="transition-all duration-100"
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--accent))" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {/* Voice bars visualization */}
        {isRecording && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-primary-foreground/50 to-primary-foreground rounded-full transition-all duration-75"
                  style={{
                    height: `${12 + audioLevel * 20 + Math.sin(Date.now() / 100 + i) * 8}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status text */}
      <div className="text-center space-y-1">
        {isProcessing ? (
          <p className="text-sm text-muted-foreground animate-pulse">Processing voice signature...</p>
        ) : isRecording ? (
          <div className="space-y-1">
            <p className="text-2xl font-mono font-bold text-gradient">
              {recordingTime.toFixed(1)}s
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <p className="text-sm text-muted-foreground">
                {canStop ? 'Tap to stop' : `Min ${minDuration}s required`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Tap to start recording</p>
            <p className="text-xs text-muted-foreground">Speak naturally for {minDuration}-{maxDuration} seconds</p>
          </div>
        )}
      </div>
    </div>
  );
}
