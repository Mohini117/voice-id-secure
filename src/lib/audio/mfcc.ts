// MFCC Feature Extraction for Voice Biometrics
// Uses Mel-Frequency Cepstral Coefficients for voice recognition

const FFT_SIZE = 512;
const NUM_MEL_FILTERS = 26;
const NUM_MFCC_COEFFS = 13;
const SAMPLE_RATE = 16000;
const MIN_FREQ = 0;
const MAX_FREQ = SAMPLE_RATE / 2;

// Pre-compute mel filter bank
function createMelFilterBank(
  fftSize: number,
  sampleRate: number,
  numFilters: number,
  minFreq: number,
  maxFreq: number
): number[][] {
  const melMin = hzToMel(minFreq);
  const melMax = hzToMel(maxFreq);
  const melPoints = new Array(numFilters + 2);
  
  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = melToHz(melMin + (i * (melMax - melMin)) / (numFilters + 1));
  }
  
  const fftBins = melPoints.map((f) => Math.floor((fftSize + 1) * f / sampleRate));
  const filterBank: number[][] = [];
  
  for (let i = 0; i < numFilters; i++) {
    const filter = new Array(fftSize / 2 + 1).fill(0);
    
    for (let j = fftBins[i]; j < fftBins[i + 1]; j++) {
      filter[j] = (j - fftBins[i]) / (fftBins[i + 1] - fftBins[i]);
    }
    
    for (let j = fftBins[i + 1]; j < fftBins[i + 2]; j++) {
      filter[j] = (fftBins[i + 2] - j) / (fftBins[i + 2] - fftBins[i + 1]);
    }
    
    filterBank.push(filter);
  }
  
  return filterBank;
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

// Hamming window
function hammingWindow(size: number): number[] {
  const window = new Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

// Simple FFT implementation
function fft(real: number[], imag: number[]): void {
  const n = real.length;
  
  if (n <= 1) return;
  
  // Bit reversal
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
  
  // Cooley-Tukey FFT
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const step = (2 * Math.PI) / size;
    
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = -step * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;
        
        const tReal = cos * real[oddIdx] - sin * imag[oddIdx];
        const tImag = sin * real[oddIdx] + cos * imag[oddIdx];
        
        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] = real[evenIdx] + tReal;
        imag[evenIdx] = imag[evenIdx] + tImag;
      }
    }
  }
}

// DCT-II for MFCC
function dct(input: number[], numCoeffs: number): number[] {
  const n = input.length;
  const output = new Array(numCoeffs);
  
  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * k * (2 * i + 1)) / (2 * n));
    }
    output[k] = sum;
  }
  
  return output;
}

// Pre-computed filter bank and window
const melFilterBank = createMelFilterBank(FFT_SIZE, SAMPLE_RATE, NUM_MEL_FILTERS, MIN_FREQ, MAX_FREQ);
const window = hammingWindow(FFT_SIZE);

// Extract MFCC from a single frame
function extractFrameMFCC(frame: Float32Array): number[] {
  // Apply window
  const windowed = new Array(FFT_SIZE).fill(0);
  for (let i = 0; i < Math.min(frame.length, FFT_SIZE); i++) {
    windowed[i] = frame[i] * window[i];
  }
  
  // Zero-pad if needed
  while (windowed.length < FFT_SIZE) {
    windowed.push(0);
  }
  
  // FFT
  const imag = new Array(FFT_SIZE).fill(0);
  fft(windowed, imag);
  
  // Power spectrum
  const powerSpectrum = new Array(FFT_SIZE / 2 + 1);
  for (let i = 0; i <= FFT_SIZE / 2; i++) {
    powerSpectrum[i] = windowed[i] * windowed[i] + imag[i] * imag[i];
  }
  
  // Apply mel filter bank
  const melEnergies = new Array(NUM_MEL_FILTERS);
  for (let i = 0; i < NUM_MEL_FILTERS; i++) {
    let sum = 0;
    for (let j = 0; j < powerSpectrum.length; j++) {
      sum += powerSpectrum[j] * melFilterBank[i][j];
    }
    melEnergies[i] = Math.log(sum + 1e-10);
  }
  
  // DCT to get MFCC
  return dct(melEnergies, NUM_MFCC_COEFFS);
}

// Extract MFCC features from audio buffer
export function extractMFCC(audioData: Float32Array): number[][] {
  const frameSize = FFT_SIZE;
  const hopSize = frameSize / 2;
  const frames: number[][] = [];
  
  for (let i = 0; i + frameSize <= audioData.length; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const mfcc = extractFrameMFCC(frame);
    frames.push(mfcc);
  }
  
  return frames;
}

// Compute mean MFCC vector (voice signature)
export function computeVoiceSignature(mfccFrames: number[][]): number[] {
  if (mfccFrames.length === 0) return [];
  
  const numCoeffs = mfccFrames[0].length;
  const signature = new Array(numCoeffs).fill(0);
  
  for (const frame of mfccFrames) {
    for (let i = 0; i < numCoeffs; i++) {
      signature[i] += frame[i];
    }
  }
  
  for (let i = 0; i < numCoeffs; i++) {
    signature[i] /= mfccFrames.length;
  }
  
  return signature;
}

// Compute cosine similarity between two voice signatures
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

// Verify voice against stored signature
export function verifyVoice(
  testMfcc: number[][],
  storedSignature: number[],
  threshold: number = 0.85
): { match: boolean; confidence: number } {
  const testSignature = computeVoiceSignature(testMfcc);
  const similarity = cosineSimilarity(testSignature, storedSignature);
  
  return {
    match: similarity >= threshold,
    confidence: Math.round(similarity * 100) / 100
  };
}
