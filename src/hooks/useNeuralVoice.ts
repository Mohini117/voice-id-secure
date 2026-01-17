import { useState, useRef, useCallback } from 'react';
import {
  initializeSpeakerModel,
  isModelReady,
  extractSpeakerEmbedding,
  averageEmbeddings,
  verifySpeaker,
  SpeakerEmbedding,
  VerificationResult,
} from '@/lib/audio/speakerEmbedding';

const SAMPLE_RATE = 16000;

interface NeuralVoiceState {
  isRecording: boolean;
  isProcessing: boolean;
  isModelLoading: boolean;
  modelReady: boolean;
  audioLevel: number;
  error: string | null;
  modelProgress: number;
}

interface NeuralVoiceResult {
  state: NeuralVoiceState;
  initializeModel: (onProgress?: (p: { status: string; progress?: number }) => void) => Promise<boolean>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Float32Array | null>;
  extractEmbedding: (audioData: Float32Array) => Promise<SpeakerEmbedding | null>;
  verifyAgainst: (testEmbedding: SpeakerEmbedding, storedEmbedding: SpeakerEmbedding, threshold?: number) => VerificationResult;
  averageEmbeddings: (embeddings: SpeakerEmbedding[]) => SpeakerEmbedding | null;
}

export function useNeuralVoice(): NeuralVoiceResult {
  const [state, setState] = useState<NeuralVoiceState>({
    isRecording: false,
    isProcessing: false,
    isModelLoading: false,
    modelReady: isModelReady(),
    audioLevel: 0,
    error: null,
    modelProgress: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const initializeModel = useCallback(async (
    onProgress?: (p: { status: string; progress?: number }) => void
  ): Promise<boolean> => {
    if (isModelReady()) {
      setState(prev => ({ ...prev, modelReady: true }));
      return true;
    }

    setState(prev => ({ ...prev, isModelLoading: true, modelProgress: 0 }));

    const success = await initializeSpeakerModel((p) => {
      setState(prev => ({ ...prev, modelProgress: p.progress || 0 }));
      onProgress?.(p);
    });

    setState(prev => ({
      ...prev,
      isModelLoading: false,
      modelReady: success,
      modelProgress: success ? 100 : 0,
    }));

    return success;
  }, []);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    const normalizedLevel = Math.min(average / 128, 1);

    setState(prev => ({ ...prev, audioLevel: normalizedLevel }));

    if (state.isRecording) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [state.isRecording]);

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null, isRecording: true }));
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      streamRef.current = stream;

      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start(100);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setState(prev => ({
        ...prev,
        isRecording: false,
        error: 'Failed to access microphone. Please check permissions.'
      }));
    }
  }, [updateAudioLevel]);

  const stopRecording = useCallback(async (): Promise<Float32Array | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        setState(prev => ({ ...prev, isRecording: false }));
        resolve(null);
        return;
      }

      setState(prev => ({ ...prev, isProcessing: true }));

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      mediaRecorderRef.current.onstop = async () => {
        try {
          streamRef.current?.getTracks().forEach(track => track.stop());

          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();

          const tempContext = new AudioContext({ sampleRate: SAMPLE_RATE });
          const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
          const audioData = audioBuffer.getChannelData(0);
          await tempContext.close();

          setState(prev => ({ ...prev, isRecording: false, isProcessing: false, audioLevel: 0 }));
          resolve(audioData);
        } catch (error) {
          console.error('Failed to process audio:', error);
          setState(prev => ({
            ...prev,
            isRecording: false,
            isProcessing: false,
            error: 'Failed to process audio recording.'
          }));
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    });
  }, []);

  const extractEmbedding = useCallback(async (audioData: Float32Array): Promise<SpeakerEmbedding | null> => {
    setState(prev => ({ ...prev, isProcessing: true }));
    try {
      const embedding = await extractSpeakerEmbedding(audioData);
      return embedding;
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, []);

  const verifyAgainstFn = useCallback((
    testEmbedding: SpeakerEmbedding,
    storedEmbedding: SpeakerEmbedding,
    threshold: number = 0.75
  ): VerificationResult => {
    return verifySpeaker(testEmbedding, storedEmbedding, threshold);
  }, []);

  return {
    state,
    initializeModel,
    startRecording,
    stopRecording,
    extractEmbedding,
    verifyAgainst: verifyAgainstFn,
    averageEmbeddings,
  };
}
