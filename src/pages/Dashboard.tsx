import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { OTPInput } from '@/components/OTPInput';
import { useAuth } from '@/hooks/useAuth';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  VoiceSignature, 
  deserializeSignature, 
  serializeSignature 
} from '@/lib/audio/voiceSignature';
import { 
  ENROLLMENT_PASSPHRASE, 
  PASSPHRASE_INSTRUCTIONS,
  MIN_PASSPHRASE_DURATION,
  MAX_PASSPHRASE_DURATION,
  REQUIRED_ENROLLMENT_SAMPLES
} from '@/lib/audio/passphrase';
import { 
  Loader2, Fingerprint, Shield, CheckCircle2, XCircle, LogOut, Mic, 
  User, Mail, Phone, RefreshCw, AlertTriangle, Quote
} from 'lucide-react';

type VoiceProfile = {
  id: string;
  user_id: string;
  azure_profile_id: string;
  enrollment_status: string;
  samples_collected: number;
};

type Profile = {
  email: string;
  phone: string;
  full_name: string;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const { 
    state: recorderState, 
    startRecording, 
    stopRecording, 
    extractFullSignature,
    verifyAgainstStrict,
    averageEnrollmentSignatures
  } = useVoiceRecorder();
  const { toast } = useToast();

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storedSignature, setStoredSignature] = useState<VoiceSignature | null>(null);
  const [enrollmentSamples, setEnrollmentSamples] = useState<VoiceSignature[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ 
    match: boolean; 
    confidence: number;
    details?: {
      meanSimilarity: number;
      varianceSimilarity: number;
    };
  } | null>(null);
  const [showOTP, setShowOTP] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [verificationAttempts, setVerificationAttempts] = useState(0);

  const MAX_VERIFICATION_ATTEMPTS = 3;

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfiles();
    }
  }, [user]);

  const fetchProfiles = async () => {
    if (!user) return;

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
      }

      const { data: voiceData } = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (voiceData) {
        setVoiceProfile(voiceData);
        const sig = deserializeSignature(voiceData.azure_profile_id);
        if (sig) {
          setStoredSignature(sig);
        }
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setFetchingProfile(false);
    }
  };

  const handleEnrollmentRecording = async () => {
    if (recorderState.isRecording) {
      const audioData = await stopRecording();
      if (!audioData) return;

      // Extract full voice signature with variance and dynamics
      const signature = extractFullSignature(audioData);
      const newSamples = [...enrollmentSamples, signature];
      setEnrollmentSamples(newSamples);

      if (newSamples.length >= REQUIRED_ENROLLMENT_SAMPLES) {
        await completeEnrollment(newSamples);
      } else {
        toast({
          title: `Sample ${newSamples.length}/${REQUIRED_ENROLLMENT_SAMPLES} recorded`,
          description: `${REQUIRED_ENROLLMENT_SAMPLES - newSamples.length} more sample(s) needed. Say the same phrase again.`,
        });
      }
    } else {
      await startRecording();
    }
  };

  const completeEnrollment = async (samples: VoiceSignature[]) => {
    if (!user) return;

    setIsEnrolling(true);

    try {
      // Average all voice signatures
      const finalSignature = averageEnrollmentSignatures(samples);

      const { error } = await supabase
        .from('voice_profiles')
        .upsert({
          user_id: user.id,
          azure_profile_id: serializeSignature(finalSignature),
          enrollment_status: 'enrolled',
          samples_collected: samples.length,
        });

      if (error) throw error;

      setStoredSignature(finalSignature);
      setVoiceProfile(prev => prev ? { ...prev, enrollment_status: 'enrolled' } : null);
      setEnrollmentSamples([]);

      await supabase.from('auth_logs').insert({
        user_id: user.id,
        auth_method: 'voice_enrollment',
        success: true,
        confidence_score: 1.0,
      });

      toast({
        title: 'Voice enrolled!',
        description: 'Your voice profile has been created. Remember your passphrase!',
      });

      fetchProfiles();
    } catch (error) {
      console.error('Enrollment error:', error);
      toast({
        title: 'Enrollment failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleReEnroll = () => {
    setStoredSignature(null);
    setEnrollmentSamples([]);
    setVoiceProfile(prev => prev ? { ...prev, enrollment_status: 'pending' } : null);
    setVerificationResult(null);
    setVerificationAttempts(0);
  };

  const handleVerificationRecording = async () => {
    if (recorderState.isRecording) {
      setIsVerifying(true);
      const audioData = await stopRecording();
      
      if (!audioData || !storedSignature) {
        setIsVerifying(false);
        return;
      }

      // Use strict verification with full signature
      const result = verifyAgainstStrict(audioData, storedSignature, 0.92);
      setVerificationResult(result);
      setVerificationAttempts(prev => prev + 1);

      await supabase.from('auth_logs').insert({
        user_id: user?.id,
        auth_method: 'voice_verification',
        success: result.match,
        confidence_score: result.confidence,
      });

      if (result.match) {
        toast({
          title: 'Voice verified!',
          description: `Identity confirmed with ${(result.confidence * 100).toFixed(1)}% confidence.`,
        });
        setVerificationAttempts(0);
      } else {
        const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - (verificationAttempts + 1);
        
        if (remainingAttempts <= 0) {
          toast({
            title: 'Voice not recognized',
            description: 'Maximum attempts reached. Please use OTP verification.',
            variant: 'destructive',
          });
          setShowOTP(true);
        } else {
          toast({
            title: 'Voice not recognized',
            description: `${remainingAttempts} attempt(s) remaining. Make sure to say: "${ENROLLMENT_PASSPHRASE}"`,
            variant: 'destructive',
          });
        }
      }

      setIsVerifying(false);
    } else {
      setVerificationResult(null);
      await startRecording();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading || fetchingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
          <Loader2 className="w-10 h-10 animate-spin text-primary relative" />
        </div>
      </div>
    );
  }

  const isEnrolled = voiceProfile?.enrollment_status === 'enrolled' && storedSignature;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid opacity-10" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-primary/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Fingerprint className="w-6 h-6 text-primary-foreground" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gradient">VoiceAuth</h1>
                <p className="text-sm text-muted-foreground">{profile?.full_name || user?.email}</p>
              </div>
            </Link>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSignOut}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>

          {/* User Info Card */}
          <Card className="glass-card border-border/50">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  {profile?.full_name}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  {profile?.email}
                </div>
                {profile?.phone && profile.phone.trim() && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    {profile.phone}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Voice Profile Status */}
          <Card className="glass-card border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Voice Profile
                </CardTitle>
                <div className="flex items-center gap-2">
                  {isEnrolled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReEnroll}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Re-enroll
                    </Button>
                  )}
                  <Badge 
                    variant={isEnrolled ? "default" : "secondary"}
                    className={isEnrolled ? "bg-gradient-to-r from-primary to-accent" : ""}
                  >
                    {isEnrolled ? "Enrolled" : "Not Enrolled"}
                  </Badge>
                </div>
              </div>
              <CardDescription>
                {isEnrolled
                  ? "Your voice signature is ready for authentication."
                  : `Record ${REQUIRED_ENROLLMENT_SAMPLES} voice samples saying the same passphrase.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isEnrolled ? (
                <div className="space-y-6">
                  {/* Passphrase Display */}
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                    <div className="flex items-start gap-3">
                      <Quote className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Your voice password:</p>
                        <p className="text-lg font-semibold text-foreground">"{ENROLLMENT_PASSPHRASE}"</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Say this phrase clearly {REQUIRED_ENROLLMENT_SAMPLES} times. It will be your voice password.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Indicators */}
                  <div className="flex items-center justify-center gap-3 mb-6">
                    {Array.from({ length: REQUIRED_ENROLLMENT_SAMPLES }).map((_, i) => (
                      <div
                        key={i}
                        className={`relative w-4 h-4 rounded-full transition-all duration-300 ${
                          i < enrollmentSamples.length
                            ? 'bg-gradient-to-r from-primary to-accent shadow-lg'
                            : 'bg-muted'
                        }`}
                      >
                        {i < enrollmentSamples.length && (
                          <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <VoiceRecorder
                    isRecording={recorderState.isRecording}
                    isProcessing={recorderState.isProcessing || isEnrolling}
                    audioLevel={recorderState.audioLevel}
                    onStart={handleEnrollmentRecording}
                    onStop={handleEnrollmentRecording}
                    minDuration={MIN_PASSPHRASE_DURATION}
                    maxDuration={MAX_PASSPHRASE_DURATION}
                  />
                </div>
              ) : (
                <div className="text-center space-y-4 py-4">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
                    <div className="relative w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30">
                      <CheckCircle2 className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Voice Enrolled</p>
                    <p className="text-sm text-muted-foreground">
                      {voiceProfile?.samples_collected} samples collected
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Voice Verification */}
          {isEnrolled && !showOTP && (
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="w-5 h-5 text-secondary" />
                  Voice Verification
                </CardTitle>
                <CardDescription>
                  Say your voice password to verify your identity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Passphrase Reminder */}
                <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
                  <div className="flex items-start gap-3">
                    <Quote className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Say your voice password:</p>
                      <p className="text-lg font-semibold text-foreground">"{ENROLLMENT_PASSPHRASE}"</p>
                    </div>
                  </div>
                </div>

                {/* Attempts Warning */}
                {verificationAttempts > 0 && verificationAttempts < MAX_VERIFICATION_ATTEMPTS && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">
                      {MAX_VERIFICATION_ATTEMPTS - verificationAttempts} attempt(s) remaining
                    </span>
                  </div>
                )}

                <VoiceRecorder
                  isRecording={recorderState.isRecording}
                  isProcessing={recorderState.isProcessing || isVerifying}
                  audioLevel={recorderState.audioLevel}
                  onStart={handleVerificationRecording}
                  onStop={handleVerificationRecording}
                  minDuration={MIN_PASSPHRASE_DURATION}
                  maxDuration={MAX_PASSPHRASE_DURATION}
                />

                {verificationResult && (
                  <div className={`p-5 rounded-xl transition-all ${
                    verificationResult.match 
                      ? 'bg-primary/10 border border-primary/30 success-glow' 
                      : 'bg-destructive/10 border border-destructive/30 error-glow'
                  }`}>
                    <div className="flex items-center gap-4">
                      {verificationResult.match ? (
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-primary" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                          <XCircle className="w-6 h-6 text-destructive" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-lg">
                          {verificationResult.match ? 'Voice Matched!' : 'Voice Not Recognized'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Confidence: {(verificationResult.confidence * 100).toFixed(1)}%
                        </p>
                        {!verificationResult.match && verificationResult.details && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Voice: {(verificationResult.details.meanSimilarity * 100).toFixed(0)}% | 
                            Pattern: {(verificationResult.details.varianceSimilarity * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full border-border/50 hover:bg-muted/50 hover:border-accent"
                  onClick={() => {
                    setShowOTP(true);
                    setVerificationAttempts(0);
                  }}
                >
                  Use OTP Verification Instead
                </Button>
              </CardContent>
            </Card>
          )}

          {/* OTP Fallback */}
          {showOTP && profile && (
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-accent" />
                  OTP Verification
                </CardTitle>
                <CardDescription>
                  Verify your identity with a one-time code.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OTPInput
                  userId={user!.id}
                  email={profile.email}
                  phone={profile.phone}
                  onVerified={() => {
                    setShowOTP(false);
                    setVerificationAttempts(0);
                    toast({
                      title: 'Authenticated!',
                      description: 'OTP verification successful.',
                    });
                  }}
                  onBack={() => {
                    setShowOTP(false);
                    setVerificationAttempts(0);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Security Notice */}
          <Card className="glass-card border-border/50 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Security Notice</p>
                  <p className="text-muted-foreground mt-1">
                    Your voice password "{ENROLLMENT_PASSPHRASE}" is unique to you. 
                    Only your voice saying this exact phrase will be accepted for verification.
                    After {MAX_VERIFICATION_ATTEMPTS} failed attempts, you'll need to use OTP verification.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
