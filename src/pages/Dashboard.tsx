import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { OTPInput } from '@/components/OTPInput';
import { useAuth } from '@/hooks/useAuth';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Fingerprint, Shield, CheckCircle2, XCircle, LogOut, Mic } from 'lucide-react';

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
  const { state: recorderState, startRecording, stopRecording, extractSignature, verifyAgainst } = useVoiceRecorder();
  const { toast } = useToast();

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storedSignature, setStoredSignature] = useState<number[] | null>(null);
  const [enrollmentSamples, setEnrollmentSamples] = useState<number[][]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ match: boolean; confidence: number } | null>(null);
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
      // Fetch user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
      }

      // Fetch voice profile
      const { data: voiceData } = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (voiceData) {
        setVoiceProfile(voiceData);
        // Load stored signature from azure_profile_id (we store signature as JSON)
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
      // Average all samples to create final signature
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

      // Store in database
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

      // Log enrollment
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

      // Log verification attempt
      await supabase.from('auth_logs').insert({
        user_id: user?.id,
        auth_method: 'voice_verification',
        success: result.match,
        confidence_score: result.confidence,
      });

      if (result.match) {
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isEnrolled = voiceProfile?.enrollment_status === 'enrolled' && storedSignature;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Fingerprint className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">VoiceAuth</h1>
              <p className="text-sm text-muted-foreground">{profile?.full_name || user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Voice Profile Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Voice Profile
              </CardTitle>
              <Badge variant={isEnrolled ? "default" : "secondary"}>
                {isEnrolled ? "Enrolled" : "Not Enrolled"}
              </Badge>
            </div>
            <CardDescription>
              {isEnrolled
                ? "Your voice signature is ready for authentication."
                : `Record ${REQUIRED_SAMPLES} voice samples to enroll.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isEnrolled ? (
              <div className="space-y-4">
                <div className="flex gap-2 justify-center mb-4">
                  {Array.from({ length: REQUIRED_SAMPLES }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full ${
                        i < enrollmentSamples.length
                          ? 'bg-primary'
                          : 'bg-muted'
                      }`}
                    />
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
                  Say a phrase naturally (e.g., "My voice is my password")
                </p>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {voiceProfile?.samples_collected} samples collected
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Voice Verification */}
        {isEnrolled && !showOTP && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-5 h-5" />
                Voice Verification
              </CardTitle>
              <CardDescription>
                Verify your identity using your voice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className={`p-4 rounded-lg ${
                  verificationResult.match 
                    ? 'bg-primary/10 border border-primary/20' 
                    : 'bg-destructive/10 border border-destructive/20'
                }`}>
                  <div className="flex items-center gap-3">
                    {verificationResult.match ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <XCircle className="w-6 h-6 text-destructive" />
                    )}
                    <div>
                      <p className="font-medium">
                        {verificationResult.match ? 'Voice Matched!' : 'Voice Not Recognized'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Confidence: {(verificationResult.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowOTP(true)}
              >
                Use OTP Instead
              </Button>
            </CardContent>
          </Card>
        )}

        {/* OTP Fallback */}
        {showOTP && profile && (
          <Card>
            <CardHeader>
              <CardTitle>OTP Verification</CardTitle>
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
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-sm">{recorderState.error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
