import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      setRecordingTime(0);
      interval = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxDuration) {
            onStop();
            return prev;
          }
          return prev + 0.1;
        });
      }, 100);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, maxDuration, onStop]);

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
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {/* Audio level visualization rings */}
        {isRecording && (
          <>
            <div
              className={cn(
                "absolute inset-0 rounded-full bg-primary/20 transition-transform duration-100",
                "animate-ping"
              )}
              style={{
                transform: `scale(${1 + audioLevel * 0.5})`,
                opacity: audioLevel * 0.5,
              }}
            />
            <div
              className="absolute inset-0 rounded-full bg-primary/30"
              style={{
                transform: `scale(${1 + audioLevel * 0.3})`,
              }}
            />
          </>
        )}

        <Button
          size="lg"
          variant={isRecording ? "destructive" : "default"}
          className={cn(
            "relative w-24 h-24 rounded-full transition-all duration-200",
            isRecording && "scale-110",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={handleClick}
          disabled={disabled || isProcessing || (isRecording && !canStop)}
        >
          {isProcessing ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-10 h-10" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </Button>

        {/* Progress ring */}
        {isRecording && (
          <svg
            className="absolute inset-0 w-full h-full -rotate-90"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-primary/20"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${progress * 2.89} 289`}
              className="text-primary transition-all duration-100"
            />
          </svg>
        )}
      </div>

      <div className="text-center">
        {isProcessing ? (
          <p className="text-sm text-muted-foreground">Processing voice...</p>
        ) : isRecording ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {recordingTime.toFixed(1)}s / {maxDuration}s
            </p>
            {!canStop && (
              <p className="text-xs text-muted-foreground">
                Min {minDuration}s required
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tap to start recording
          </p>
        )}
      </div>
    </div>
  );
}
