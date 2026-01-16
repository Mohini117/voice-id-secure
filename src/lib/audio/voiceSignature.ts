// Enhanced Voice Signature System
// Uses MFCC with variance, delta coefficients, and stricter matching

import { extractMFCC, computeVoiceSignature, cosineSimilarity } from './mfcc';

// Voice signature includes mean, variance, and delta statistics
export interface VoiceSignature {
  mean: number[];
  variance: number[];
  deltaMean: number[];
  energy: number;
  zeroCrossingRate: number;
  frameCount: number;
}

// Compute variance of MFCC frames
function computeVariance(frames: number[][], mean: number[]): number[] {
  if (frames.length === 0) return [];
  
  const numCoeffs = mean.length;
  const variance = new Array(numCoeffs).fill(0);
  
  for (const frame of frames) {
    for (let i = 0; i < numCoeffs; i++) {
      const diff = frame[i] - mean[i];
      variance[i] += diff * diff;
    }
  }
  
  for (let i = 0; i < numCoeffs; i++) {
    variance[i] /= frames.length;
  }
  
  return variance;
}

// Compute delta (velocity) coefficients
function computeDelta(frames: number[][]): number[][] {
  if (frames.length < 3) return frames;
  
  const deltas: number[][] = [];
  
  for (let i = 1; i < frames.length - 1; i++) {
    const delta = frames[i].map((_, j) => 
      (frames[i + 1][j] - frames[i - 1][j]) / 2
    );
    deltas.push(delta);
  }
  
  return deltas;
}

// Compute audio energy
function computeEnergy(audioData: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < audioData.length; i++) {
    energy += audioData[i] * audioData[i];
  }
  return energy / audioData.length;
}

// Compute zero crossing rate
function computeZeroCrossingRate(audioData: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < audioData.length; i++) {
    if ((audioData[i] >= 0 && audioData[i - 1] < 0) ||
        (audioData[i] < 0 && audioData[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / audioData.length;
}

// Extract comprehensive voice signature
export function extractVoiceSignature(audioData: Float32Array): VoiceSignature {
  const mfccFrames = extractMFCC(audioData);
  const mean = computeVoiceSignature(mfccFrames);
  const variance = computeVariance(mfccFrames, mean);
  
  const deltaFrames = computeDelta(mfccFrames);
  const deltaMean = computeVoiceSignature(deltaFrames);
  
  const energy = computeEnergy(audioData);
  const zeroCrossingRate = computeZeroCrossingRate(audioData);
  
  return {
    mean,
    variance,
    deltaMean,
    energy,
    zeroCrossingRate,
    frameCount: mfccFrames.length,
  };
}

// Create averaged signature from multiple samples
export function averageSignatures(signatures: VoiceSignature[]): VoiceSignature {
  if (signatures.length === 0) {
    throw new Error('No signatures to average');
  }
  
  const numCoeffs = signatures[0].mean.length;
  const avgMean = new Array(numCoeffs).fill(0);
  const avgVariance = new Array(numCoeffs).fill(0);
  const avgDeltaMean = new Array(numCoeffs).fill(0);
  let avgEnergy = 0;
  let avgZcr = 0;
  let avgFrameCount = 0;
  
  for (const sig of signatures) {
    for (let i = 0; i < numCoeffs; i++) {
      avgMean[i] += sig.mean[i];
      avgVariance[i] += sig.variance[i];
      avgDeltaMean[i] += sig.deltaMean[i];
    }
    avgEnergy += sig.energy;
    avgZcr += sig.zeroCrossingRate;
    avgFrameCount += sig.frameCount;
  }
  
  const n = signatures.length;
  for (let i = 0; i < numCoeffs; i++) {
    avgMean[i] /= n;
    avgVariance[i] /= n;
    avgDeltaMean[i] /= n;
  }
  
  return {
    mean: avgMean,
    variance: avgVariance,
    deltaMean: avgDeltaMean,
    energy: avgEnergy / n,
    zeroCrossingRate: avgZcr / n,
    frameCount: avgFrameCount / n,
  };
}

// Weighted distance between signatures
function weightedDistance(test: VoiceSignature, stored: VoiceSignature): number {
  // Mean similarity (most important)
  const meanSim = cosineSimilarity(test.mean, stored.mean);
  
  // Variance similarity (captures voice texture)
  const varianceSim = cosineSimilarity(test.variance, stored.variance);
  
  // Delta similarity (captures speaking dynamics)
  const deltaSim = cosineSimilarity(test.deltaMean, stored.deltaMean);
  
  // Energy ratio (should be similar for same phrase/speaker)
  const energyRatio = Math.min(test.energy, stored.energy) / 
                      Math.max(test.energy, stored.energy);
  
  // ZCR ratio (voice characteristic)
  const zcrRatio = Math.min(test.zeroCrossingRate, stored.zeroCrossingRate) /
                   Math.max(test.zeroCrossingRate, stored.zeroCrossingRate);
  
  // Frame count ratio (phrase length check)
  const frameDiff = Math.abs(test.frameCount - stored.frameCount);
  const frameRatio = 1 - Math.min(frameDiff / stored.frameCount, 1);
  
  // Weighted combination with emphasis on mean and variance
  const score = 
    meanSim * 0.35 +           // 35% weight on mean MFCC
    varianceSim * 0.25 +       // 25% weight on variance
    deltaSim * 0.15 +          // 15% weight on dynamics
    energyRatio * 0.10 +       // 10% weight on energy
    zcrRatio * 0.05 +          // 5% weight on ZCR
    frameRatio * 0.10;         // 10% weight on phrase length
  
  return score;
}

// Strict verification with multiple checks
export function verifyVoiceStrict(
  testSignature: VoiceSignature,
  storedSignature: VoiceSignature,
  threshold: number = 0.92 // Higher default threshold
): { match: boolean; confidence: number; details: VerificationDetails } {
  
  const overallScore = weightedDistance(testSignature, storedSignature);
  
  // Individual component checks
  const meanSim = cosineSimilarity(testSignature.mean, storedSignature.mean);
  const varianceSim = cosineSimilarity(testSignature.variance, storedSignature.variance);
  
  // Strict checks - ALL must pass
  const meanPasses = meanSim >= 0.88;
  const variancePasses = varianceSim >= 0.80;
  const overallPasses = overallScore >= threshold;
  
  const details: VerificationDetails = {
    meanSimilarity: meanSim,
    varianceSimilarity: varianceSim,
    overallScore,
    meanPassed: meanPasses,
    variancePassed: variancePasses,
  };
  
  // All checks must pass for a match
  const match = meanPasses && variancePasses && overallPasses;
  
  return {
    match,
    confidence: overallScore,
    details,
  };
}

export interface VerificationDetails {
  meanSimilarity: number;
  varianceSimilarity: number;
  overallScore: number;
  meanPassed: boolean;
  variancePassed: boolean;
}

// Convert old signature format to new (for backwards compatibility)
export function convertLegacySignature(legacy: number[]): VoiceSignature {
  return {
    mean: legacy,
    variance: new Array(legacy.length).fill(0.1), // Default variance
    deltaMean: new Array(legacy.length).fill(0),
    energy: 0.01,
    zeroCrossingRate: 0.1,
    frameCount: 50,
  };
}

// Serialize signature for storage
export function serializeSignature(sig: VoiceSignature): string {
  return JSON.stringify(sig);
}

// Deserialize signature from storage
export function deserializeSignature(data: string): VoiceSignature | null {
  try {
    const parsed = JSON.parse(data);
    
    // Check if it's the new format
    if (parsed.mean && parsed.variance) {
      return parsed as VoiceSignature;
    }
    
    // Legacy format (just an array)
    if (Array.isArray(parsed)) {
      return convertLegacySignature(parsed);
    }
    
    return null;
  } catch {
    return null;
  }
}
