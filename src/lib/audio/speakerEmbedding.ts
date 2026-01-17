/**
 * Neural Speaker Embedding using Hugging Face Transformers.js
 * Uses WavLM-based speaker verification model for robust voice authentication
 */

import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface SpeakerEmbedding {
  embedding: number[];
  modelId: string;
  timestamp: number;
}

export interface VerificationResult {
  match: boolean;
  confidence: number;
  similarity: number;
  threshold: number;
}

// Singleton for the feature extraction pipeline
let extractorPipeline: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

// Model for speaker embeddings - using a lightweight model that works well in browser
const MODEL_ID = 'Xenova/wavlm-base-plus-sv';

/**
 * Initialize the speaker embedding model
 * This will download the model on first use (~100MB)
 */
export async function initializeSpeakerModel(
  onProgress?: (progress: { status: string; progress?: number }) => void
): Promise<boolean> {
  if (extractorPipeline) return true;
  
  if (isLoading && loadPromise) {
    await loadPromise;
    return !!extractorPipeline;
  }

  isLoading = true;
  
  try {
    onProgress?.({ status: 'loading', progress: 0 });
    
    loadPromise = pipeline('feature-extraction', MODEL_ID, {
      progress_callback: (data: any) => {
        if (data.status === 'progress' && data.progress) {
          onProgress?.({ status: 'downloading', progress: data.progress });
        }
      },
    });
    
    extractorPipeline = await loadPromise;
    onProgress?.({ status: 'ready', progress: 100 });
    
    console.log('Speaker embedding model loaded successfully');
    return true;
  } catch (error) {
    console.error('Failed to load speaker embedding model:', error);
    onProgress?.({ status: 'error' });
    return false;
  } finally {
    isLoading = false;
    loadPromise = null;
  }
}

/**
 * Check if model is loaded
 */
export function isModelReady(): boolean {
  return !!extractorPipeline;
}

/**
 * Extract speaker embedding from audio data
 * @param audioData - Float32Array of audio samples (16kHz mono)
 * @returns Speaker embedding vector
 */
export async function extractSpeakerEmbedding(
  audioData: Float32Array
): Promise<SpeakerEmbedding | null> {
  if (!extractorPipeline) {
    console.error('Speaker model not initialized. Call initializeSpeakerModel first.');
    return null;
  }

  try {
    // Ensure audio is at 16kHz and has enough samples
    const minSamples = 16000; // At least 1 second of audio
    if (audioData.length < minSamples) {
      console.warn('Audio too short for reliable embedding extraction');
    }

    // Normalize audio to prevent clipping issues
    const maxVal = Math.max(...Array.from(audioData).map(Math.abs));
    const normalizedAudio = maxVal > 0 
      ? new Float32Array(audioData.map(v => v / maxVal * 0.95))
      : audioData;

    // Extract features using the model
    const output = await extractorPipeline(normalizedAudio, {
      sampling_rate: 16000,
    });

    // Get the embedding - take mean pooling across time dimension
    let embedding: number[];
    
    if (output.data) {
      // Output is a tensor - need to process it
      const data = Array.from(output.data as Float32Array);
      const dims = output.dims;
      
      if (dims.length === 3) {
        // Shape: [batch, time, features] - mean pool across time
        const batchSize = dims[0];
        const timeSteps = dims[1];
        const features = dims[2];
        
        embedding = new Array(features).fill(0);
        for (let t = 0; t < timeSteps; t++) {
          for (let f = 0; f < features; f++) {
            embedding[f] += data[t * features + f];
          }
        }
        embedding = embedding.map(v => v / timeSteps);
      } else if (dims.length === 2) {
        // Shape: [time, features] - mean pool across time
        const timeSteps = dims[0];
        const features = dims[1];
        
        embedding = new Array(features).fill(0);
        for (let t = 0; t < timeSteps; t++) {
          for (let f = 0; f < features; f++) {
            embedding[f] += data[t * features + f];
          }
        }
        embedding = embedding.map(v => v / timeSteps);
      } else {
        // Already pooled or single vector
        embedding = data;
      }
    } else {
      // Direct array output
      embedding = Array.from(output);
    }

    // L2 normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      embedding = embedding.map(v => v / norm);
    }

    return {
      embedding,
      modelId: MODEL_ID,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Failed to extract speaker embedding:', error);
    return null;
  }
}

/**
 * Compute cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.error('Embedding dimensions mismatch:', a.length, 'vs', b.length);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * Average multiple embeddings (for enrollment with multiple samples)
 */
export function averageEmbeddings(embeddings: SpeakerEmbedding[]): SpeakerEmbedding | null {
  if (embeddings.length === 0) return null;
  
  const dim = embeddings[0].embedding.length;
  const averaged = new Array(dim).fill(0);
  
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      averaged[i] += emb.embedding[i];
    }
  }
  
  // Average and re-normalize
  for (let i = 0; i < dim; i++) {
    averaged[i] /= embeddings.length;
  }
  
  const norm = Math.sqrt(averaged.reduce((sum, v) => sum + v * v, 0));
  const normalized = norm > 0 ? averaged.map(v => v / norm) : averaged;
  
  return {
    embedding: normalized,
    modelId: MODEL_ID,
    timestamp: Date.now(),
  };
}

/**
 * Verify a speaker against a stored embedding
 * @param testEmbedding - Embedding from current audio
 * @param storedEmbedding - Enrollment embedding
 * @param threshold - Similarity threshold (default 0.75 for neural embeddings)
 */
export function verifySpeaker(
  testEmbedding: SpeakerEmbedding,
  storedEmbedding: SpeakerEmbedding,
  threshold: number = 0.75
): VerificationResult {
  const similarity = cosineSimilarity(testEmbedding.embedding, storedEmbedding.embedding);
  
  // Convert similarity to confidence score (0-1 range, adjusted for typical similarity values)
  // Neural embeddings typically give similarities between 0.5-1.0 for same speaker
  const confidence = Math.max(0, Math.min(1, (similarity - 0.5) * 2));
  
  return {
    match: similarity >= threshold,
    confidence,
    similarity,
    threshold,
  };
}

/**
 * Serialize embedding for storage in database
 */
export function serializeEmbedding(embedding: SpeakerEmbedding): string {
  return JSON.stringify(embedding);
}

/**
 * Deserialize embedding from database storage
 */
export function deserializeEmbedding(data: string): SpeakerEmbedding | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.embedding && Array.isArray(parsed.embedding)) {
      return parsed as SpeakerEmbedding;
    }
    return null;
  } catch {
    return null;
  }
}
