import { useState, useRef, useCallback } from 'react';
import { extractMFCC, computeVoiceSignature, verifyVoice } from '@/lib/audio/mfcc';
import { detectDeepfake, type DeepfakeAnalysis } from '@/lib/audio/deepfakeDetection';

const SAMPLE_RATE = 16000;

interface VoiceRecorderState {
  isRecording: boolean;
  isProcessing: boolean;
  audioLevel: number;
  error: string | null;
  deepfakeAnalysis: DeepfakeAnalysis | null;
}

interface VoiceRecorderResult {
  state: VoiceRecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Float32Array | null>;
  extractSignature: (audioData: Float32Array) => number[];
  verifyAgainst: (audioData: Float32Array, storedSignature: number[], threshold?: number) => { match: boolean; confidence: number; deepfakeAnalysis: DeepfakeAnalysis };
  checkDeepfake: (audioData: Float32Array) => DeepfakeAnalysis;
}

export function useVoiceRecorder(): VoiceRecorderResult {
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    isProcessing: false,
    audioLevel: 0,
    error: null,
    deepfakeAnalysis: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

      // Set up audio context for level monitoring
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Start level monitoring
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);

      // Set up media recorder
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
          // Stop all tracks
          streamRef.current?.getTracks().forEach(track => track.stop());

          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();

          // Decode audio
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

  const extractSignature = useCallback((audioData: Float32Array): number[] => {
    const mfcc = extractMFCC(audioData);
    return computeVoiceSignature(mfcc);
  }, []);

  const checkDeepfake = useCallback((audioData: Float32Array): DeepfakeAnalysis => {
    const analysis = detectDeepfake(audioData);
    setState(prev => ({ ...prev, deepfakeAnalysis: analysis }));
    return analysis;
  }, []);

  const verifyAgainst = useCallback((
    audioData: Float32Array,
    storedSignature: number[],
    threshold: number = 0.85
  ) => {
    // First check for deepfake
    const deepfakeAnalysis = detectDeepfake(audioData);
    setState(prev => ({ ...prev, deepfakeAnalysis }));
    
    // If deepfake detected, return failed verification
    if (!deepfakeAnalysis.isHuman) {
      return {
        match: false,
        confidence: 0,
        deepfakeAnalysis,
      };
    }
    
    // Proceed with normal voice verification
    const mfcc = extractMFCC(audioData);
    const result = verifyVoice(mfcc, storedSignature, threshold);
    
    return {
      ...result,
      deepfakeAnalysis,
    };
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    extractSignature,
    verifyAgainst,
    checkDeepfake,
  };
}
