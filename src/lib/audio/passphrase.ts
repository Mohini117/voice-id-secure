// Passphrase constants for voice authentication
// Users must say the exact same phrase during enrollment and verification

export const ENROLLMENT_PASSPHRASE = "My voice is my password, verify me";

export const PASSPHRASE_INSTRUCTIONS = {
  enrollment: `Please say: "${ENROLLMENT_PASSPHRASE}" clearly and naturally. This phrase will be your voice password.`,
  verification: `Say your voice password: "${ENROLLMENT_PASSPHRASE}" to verify your identity.`,
};

// Minimum audio duration for valid passphrase (seconds)
export const MIN_PASSPHRASE_DURATION = 2.5;
export const MAX_PASSPHRASE_DURATION = 6;

// Required samples for enrollment
export const REQUIRED_ENROLLMENT_SAMPLES = 3;
