// Passphrase configuration for voice authentication
// Users choose their own passphrase during enrollment

// Minimum audio duration for valid passphrase (seconds)
export const MIN_PASSPHRASE_DURATION = 2.0;
export const MAX_PASSPHRASE_DURATION = 8;

// Required samples for enrollment
export const REQUIRED_ENROLLMENT_SAMPLES = 3;

// Suggested passphrases (user can also create their own)
export const SUGGESTED_PASSPHRASES = [
  "Open sesame let me in",
  "The quick brown fox jumps",
  "Hello world this is me",
  "Security is my priority",
];

export const PASSPHRASE_INSTRUCTIONS = {
  enrollment: "Choose or create your own voice password (3-8 words). Say it clearly and naturally.",
  verification: "Say your voice password exactly as you enrolled it.",
};

// Minimum passphrase requirements
export const MIN_PASSPHRASE_WORDS = 3;
export const MAX_PASSPHRASE_WORDS = 10;
