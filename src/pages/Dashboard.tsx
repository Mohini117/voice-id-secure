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
  Loader2, Fingerprint, Shield, CheckCircle2, XCircle, LogOut, Mic, 
  User, Mail, Phone, ArrowLeft, Sparkles, RefreshCw, AlertTriangle, Bot
} from 'lucide-react';
import type { DeepfakeAnalysis } from '@/lib/audio/deepfakeDetection';

type VerificationResult = {
  match: boolean;
  confidence: number;
  deepfakeAnalysis?: DeepfakeAnalysis;
};

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
  const { state: recorderState, startRecording, stopRecording, extractSignature, verifyAgainst, checkDeepfake } = useVoiceRecorder();
  const { toast } = useToast();

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storedSignature, setStoredSignature] = useState<number[] | null>(null);
  const [enrollmentSamples, setEnrollmentSamples] = useState<number[][]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [showOTP, setShowOTP] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);

  const REQUIRED_SAMPLES = 3;

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
        try {
          const sig = JSON.parse(voiceData.azure_profile_id);
          setStoredSignature(sig);
        } catch {
          // Not a valid signature yet
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

      const signature = extractSignature(audioData);
      const newSamples = [...enrollmentSamples, signature];
      setEnrollmentSamples(newSamples);

      if (newSamples.length >= REQUIRED_SAMPLES) {
        await completeEnrollment(newSamples);
      } else {
        toast({
          title: `Sample ${newSamples.length}/${REQUIRED_SAMPLES} recorded`,
          description: `${REQUIRED_SAMPLES - newSamples.length} more sample(s) needed.`,
        });
      }
    } else {
      await startRecording();
    }
  };

  const completeEnrollment = async (samples: number[][]) => {
    if (!user) return;

    setIsEnrolling(true);

    try {
      const numCoeffs = samples[0].length;
      const finalSignature = new Array(numCoeffs).fill(0);
      
      for (const sample of samples) {
        for (let i = 0; i < numCoeffs; i++) {
          finalSignature[i] += sample[i];
        }
      }
      
      for (let i = 0; i < numCoeffs; i++) {
        finalSignature[i] /= samples.length;
      }

      const { error } = await supabase
        .from('voice_profiles')
        .upsert({
          user_id: user.id,
          azure_profile_id: JSON.stringify(finalSignature),
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
        description: 'Your voice profile has been created successfully.',
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
  };

  const handleVerificationRecording = async () => {
    if (recorderState.isRecording) {
      setIsVerifying(true);
      const audioData = await stopRecording();
      
      if (!audioData || !storedSignature) {
        setIsVerifying(false);
        return;
      }

      const result = verifyAgainst(audioData, storedSignature, 0.80);
      setVerificationResult(result);

      // Log deepfake detection attempt
      const isDeepfake = !result.deepfakeAnalysis?.isHuman;
      
      await supabase.from('auth_logs').insert({
        user_id: user?.id,
        auth_method: isDeepfake ? 'voice_deepfake_blocked' : 'voice_verification',
        success: result.match && !isDeepfake,
        confidence_score: result.confidence,
      });

      if (isDeepfake) {
        toast({
          title: 'AI Voice Detected!',
          description: 'This appears to be an AI-generated voice. Only human voices are allowed.',
          variant: 'destructive',
        });
      } else if (result.match) {
        toast({
          title: 'Voice verified!',
          description: `Confidence: ${(result.confidence * 100).toFixed(1)}%`,
        });
      } else {
        toast({
          title: 'Voice not recognized',
          description: 'You can try again or use OTP verification.',
          variant: 'destructive',
        });
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
                  : `Record ${REQUIRED_SAMPLES} voice samples to enroll your unique voice signature.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isEnrolled ? (
                <div className="space-y-6">
                  {/* Progress Indicators */}
                  <div className="flex items-center justify-center gap-3 mb-6">
                    {Array.from({ length: REQUIRED_SAMPLES }).map((_, i) => (
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
                    minDuration={3}
                    maxDuration={8}
                  />
                  
                  <p className="text-center text-sm text-muted-foreground">
                    Say a natural phrase like <span className="text-foreground font-medium">"My voice is my password"</span>
                  </p>
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
                  Verify your identity using your unique voice signature.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <VoiceRecorder
                  isRecording={recorderState.isRecording}
                  isProcessing={recorderState.isProcessing || isVerifying}
                  audioLevel={recorderState.audioLevel}
                  onStart={handleVerificationRecording}
                  onStop={handleVerificationRecording}
                  minDuration={2}
                  maxDuration={6}
                />

                {verificationResult && (
                  <div className="space-y-4">
                    {/* Deepfake Detection Result */}
                    {verificationResult.deepfakeAnalysis && (
                      <div className={`p-4 rounded-xl transition-all ${
                        verificationResult.deepfakeAnalysis.isHuman
                          ? 'bg-primary/5 border border-primary/20'
                          : 'bg-destructive/10 border border-destructive/30 error-glow'
                      }`}>
                        <div className="flex items-center gap-3">
                          {verificationResult.deepfakeAnalysis.isHuman ? (
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="w-5 h-5 text-primary" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                              <Bot className="w-5 h-5 text-destructive" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {verificationResult.deepfakeAnalysis.isHuman 
                                  ? 'Human Voice Detected' 
                                  : 'AI/Deepfake Voice Blocked!'}
                              </p>
                              {!verificationResult.deepfakeAnalysis.isHuman && (
                                <AlertTriangle className="w-4 h-4 text-destructive" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Authenticity: {(verificationResult.deepfakeAnalysis.confidence * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                        {!verificationResult.deepfakeAnalysis.isHuman && verificationResult.deepfakeAnalysis.reasons.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-destructive/20">
                            <p className="text-xs text-destructive/80 font-medium mb-1">Detection reasons:</p>
                            <ul className="text-xs text-muted-foreground space-y-0.5">
                              {verificationResult.deepfakeAnalysis.reasons.slice(0, 3).map((reason, i) => (
                                <li key={i}>• {reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Voice Match Result */}
                    {verificationResult.deepfakeAnalysis?.isHuman && (
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
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full border-border/50 hover:bg-muted/50 hover:border-accent"
                  onClick={() => setShowOTP(true)}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
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
                    toast({
                      title: 'Authenticated!',
                      description: 'OTP verification successful.',
                    });
                  }}
                  onBack={() => setShowOTP(false)}
                />
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {recorderState.error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="pt-6">
                <p className="text-destructive text-sm">{recorderState.error}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
