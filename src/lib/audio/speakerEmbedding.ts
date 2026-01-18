/**
 * Neural Speaker Embedding using Hugging Face Transformers.js
 * Uses WeSpeaker model for robust voice authentication
 */

import { AutoFeatureExtractor, AutoModelForXVector, env } from '@huggingface/transformers';

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

// Singleton for model and processor
let featureExtractor: any = null;
let model: any = null;
let isLoading = false;
let loadPromise: Promise<boolean> | null = null;

// Using WeSpeaker model - specifically designed for speaker verification
const MODEL_ID = 'Xenova/wespeaker-voxceleb-resnet34-LM';

/**
 * Initialize the speaker embedding model
 * This will download the model on first use
 */
export async function initializeSpeakerModel(
  onProgress?: (progress: { status: string; progress?: number }) => void
): Promise<boolean> {
  if (model && featureExtractor) return true;
  
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  
  loadPromise = (async () => {
    try {
      onProgress?.({ status: 'loading', progress: 0 });
      
      // Load feature extractor and model in parallel
      const [loadedExtractor, loadedModel] = await Promise.all([
        AutoFeatureExtractor.from_pretrained(MODEL_ID, {
          progress_callback: (data: any) => {
            if (data.status === 'progress' && data.progress) {
              onProgress?.({ status: 'downloading extractor', progress: data.progress * 0.3 });
            }
          },
        }),
        AutoModelForXVector.from_pretrained(MODEL_ID, {
          progress_callback: (data: any) => {
            if (data.status === 'progress' && data.progress) {
              onProgress?.({ status: 'downloading model', progress: 30 + data.progress * 0.7 });
            }
          },
        }),
      ]);
      
      featureExtractor = loadedExtractor;
      model = loadedModel;
      
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
  })();
  
  return loadPromise;
}

/**
 * Check if model is loaded
 */
export function isModelReady(): boolean {
  return !!model && !!featureExtractor;
}

/**
 * Extract speaker embedding from audio data
 * @param audioData - Float32Array of audio samples (16kHz mono)
 * @returns Speaker embedding vector
 */
export async function extractSpeakerEmbedding(
  audioData: Float32Array
): Promise<SpeakerEmbedding | null> {
  if (!model || !featureExtractor) {
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

    // Process audio through the feature extractor
    const inputs = await featureExtractor(normalizedAudio, {
      sampling_rate: 16000,
      return_tensors: 'pt',
    });

    // Run the model to get speaker embeddings
    const outputs = await model(inputs);
    
    // Get the embedding from model output - WeSpeaker outputs embeddings directly
    let embedding: number[];
    
    if (outputs.embeddings) {
      embedding = Array.from(outputs.embeddings.data as Float32Array);
    } else if (outputs.logits) {
      embedding = Array.from(outputs.logits.data as Float32Array);
    } else {
      // Try to get any available output
      const outputKeys = Object.keys(outputs);
      const firstOutput = outputs[outputKeys[0]];
      if (firstOutput && firstOutput.data) {
        embedding = Array.from(firstOutput.data as Float32Array);
      } else {
        throw new Error('Could not extract embedding from model output');
      }
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
