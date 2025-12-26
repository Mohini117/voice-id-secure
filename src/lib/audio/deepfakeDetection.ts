// Deepfake Voice Detection
// Detects AI-generated voices using spectral and temporal analysis

const FFT_SIZE = 512;
const SAMPLE_RATE = 16000;

export interface DeepfakeAnalysis {
  isHuman: boolean;
  confidence: number;
  reasons: string[];
  metrics: {
    spectralFlatness: number;
    temporalVariation: number;
    pitchVariation: number;
    breathDetected: boolean;
    microVariations: number;
  };
}

// Hamming window for analysis
function hammingWindow(size: number): number[] {
  const window = new Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

// FFT implementation
function fft(real: number[], imag: number[]): void {
  const n = real.length;
  if (n <= 1) return;

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

// Calculate spectral flatness (Wiener entropy)
// Real voices have lower flatness due to harmonic structure
// AI voices tend to be flatter/more noise-like in certain frequencies
function calculateSpectralFlatness(audioData: Float32Array): number {
  const window = hammingWindow(FFT_SIZE);
  const flatnessValues: number[] = [];

  for (let i = 0; i + FFT_SIZE <= audioData.length; i += FFT_SIZE / 2) {
    const frame = new Array(FFT_SIZE);
    const imag = new Array(FFT_SIZE).fill(0);

    for (let j = 0; j < FFT_SIZE; j++) {
      frame[j] = audioData[i + j] * window[j];
    }

    fft(frame, imag);

    // Power spectrum
    const powerSpectrum: number[] = [];
    for (let j = 1; j < FFT_SIZE / 2; j++) {
      const power = frame[j] * frame[j] + imag[j] * imag[j];
      if (power > 1e-10) powerSpectrum.push(power);
    }

    if (powerSpectrum.length === 0) continue;

    // Geometric mean
    const logSum = powerSpectrum.reduce((acc, val) => acc + Math.log(val), 0);
    const geometricMean = Math.exp(logSum / powerSpectrum.length);

    // Arithmetic mean
    const arithmeticMean = powerSpectrum.reduce((a, b) => a + b, 0) / powerSpectrum.length;

    // Spectral flatness
    const flatness = geometricMean / (arithmeticMean + 1e-10);
    flatnessValues.push(flatness);
  }

  return flatnessValues.length > 0 
    ? flatnessValues.reduce((a, b) => a + b, 0) / flatnessValues.length 
    : 0;
}

// Calculate temporal variation - how much the signal changes over time
// Real voices have natural micro-variations, AI voices are too consistent
function calculateTemporalVariation(audioData: Float32Array): number {
  const frameSize = 256;
  const energies: number[] = [];

  for (let i = 0; i + frameSize <= audioData.length; i += frameSize) {
    let energy = 0;
    for (let j = 0; j < frameSize; j++) {
      energy += audioData[i + j] * audioData[i + j];
    }
    energies.push(Math.sqrt(energy / frameSize));
  }

  if (energies.length < 2) return 0;

  // Calculate variance of frame-to-frame energy changes
  const differences: number[] = [];
  for (let i = 1; i < energies.length; i++) {
    differences.push(Math.abs(energies[i] - energies[i - 1]));
  }

  const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
  const variance = differences.reduce((acc, val) => acc + (val - mean) ** 2, 0) / differences.length;

  return Math.sqrt(variance);
}

// Detect pitch variation using zero-crossing rate variation
// Real voices have natural pitch fluctuations, AI voices are more monotone
function calculatePitchVariation(audioData: Float32Array): number {
  const frameSize = 512;
  const zcrs: number[] = [];

  for (let i = 0; i + frameSize <= audioData.length; i += frameSize / 2) {
    let zcr = 0;
    for (let j = 1; j < frameSize; j++) {
      if ((audioData[i + j - 1] >= 0 && audioData[i + j] < 0) ||
          (audioData[i + j - 1] < 0 && audioData[i + j] >= 0)) {
        zcr++;
      }
    }
    zcrs.push(zcr / frameSize);
  }

  if (zcrs.length < 2) return 0;

  const mean = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;
  const variance = zcrs.reduce((acc, val) => acc + (val - mean) ** 2, 0) / zcrs.length;
  
  return Math.sqrt(variance);
}

// Detect breath sounds and natural pauses
// Real voices have breath sounds, AI voices typically don't
function detectBreathSounds(audioData: Float32Array): boolean {
  const frameSize = 512;
  let lowEnergyFrames = 0;
  let breathLikeFrames = 0;

  for (let i = 0; i + frameSize <= audioData.length; i += frameSize) {
    let energy = 0;
    let highFreqEnergy = 0;
    
    for (let j = 0; j < frameSize; j++) {
      const sample = audioData[i + j];
      energy += sample * sample;
      
      // High-pass approximation for breath detection
      if (j > 0) {
        const diff = sample - audioData[i + j - 1];
        highFreqEnergy += diff * diff;
      }
    }
    
    const rmsEnergy = Math.sqrt(energy / frameSize);
    const rmsHighFreq = Math.sqrt(highFreqEnergy / (frameSize - 1));
    
    // Low energy frame (potential breath or pause)
    if (rmsEnergy < 0.05 && rmsEnergy > 0.005) {
      lowEnergyFrames++;
      
      // Breath-like characteristics: low overall energy but some high-freq content
      if (rmsHighFreq / (rmsEnergy + 1e-10) > 0.5) {
        breathLikeFrames++;
      }
    }
  }

  // Natural speech typically has some breath sounds
  return breathLikeFrames > 2;
}

// Calculate micro-variations in amplitude (jitter-like measure)
// Real voices have natural micro-variations, AI is too smooth
function calculateMicroVariations(audioData: Float32Array): number {
  const peaks: number[] = [];
  
  // Find local peaks
  for (let i = 1; i < audioData.length - 1; i++) {
    if (audioData[i] > audioData[i - 1] && audioData[i] > audioData[i + 1] && audioData[i] > 0.1) {
      peaks.push(audioData[i]);
    }
  }

  if (peaks.length < 10) return 0;

  // Calculate variation in peak amplitudes
  const differences: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    differences.push(Math.abs(peaks[i] - peaks[i - 1]));
  }

  const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
  const peakMean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  
  return mean / (peakMean + 1e-10);
}

// Main deepfake detection function
export function detectDeepfake(audioData: Float32Array): DeepfakeAnalysis {
  const reasons: string[] = [];
  let humanScore = 0;
  const maxScore = 5;

  // 1. Spectral Flatness Analysis
  const spectralFlatness = calculateSpectralFlatness(audioData);
  // Real voices typically have flatness between 0.1-0.4
  // AI voices tend to be either too flat (>0.5) or too harmonic (<0.05)
  if (spectralFlatness >= 0.08 && spectralFlatness <= 0.45) {
    humanScore += 1;
  } else {
    reasons.push('Unnatural spectral characteristics detected');
  }

  // 2. Temporal Variation
  const temporalVariation = calculateTemporalVariation(audioData);
  // Real voices have natural energy variations
  if (temporalVariation > 0.005) {
    humanScore += 1;
  } else {
    reasons.push('Voice energy too consistent (lacks natural variation)');
  }

  // 3. Pitch Variation
  const pitchVariation = calculatePitchVariation(audioData);
  // Real voices have natural pitch fluctuations
  if (pitchVariation > 0.01) {
    humanScore += 1;
  } else {
    reasons.push('Pitch too monotone (lacks natural fluctuation)');
  }

  // 4. Breath Detection
  const breathDetected = detectBreathSounds(audioData);
  if (breathDetected) {
    humanScore += 1;
  } else {
    reasons.push('No natural breath sounds detected');
  }

  // 5. Micro-variations (jitter)
  const microVariations = calculateMicroVariations(audioData);
  // Real voices have subtle amplitude variations
  if (microVariations > 0.02 && microVariations < 0.3) {
    humanScore += 1;
  } else {
    reasons.push('Amplitude patterns appear artificial');
  }

  const confidence = humanScore / maxScore;
  const isHuman = confidence >= 0.6; // At least 3 out of 5 tests must pass

  return {
    isHuman,
    confidence,
    reasons: isHuman ? ['Voice appears natural and human'] : reasons,
    metrics: {
      spectralFlatness,
      temporalVariation,
      pitchVariation,
      breathDetected,
      microVariations,
    },
  };
}

// Quick check function for integration
export function isLikelyHumanVoice(audioData: Float32Array, threshold: number = 0.6): boolean {
  const analysis = detectDeepfake(audioData);
  return analysis.isHuman && analysis.confidence >= threshold;
}
