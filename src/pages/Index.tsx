import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Fingerprint, Shield, Mic, Mail, Loader2 } from 'lucide-react';

export default function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/50">
      <div className="container mx-auto px-4 py-16">
        {/* Hero */}
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
            <Fingerprint className="w-10 h-10 text-primary" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Voice Biometric
            <span className="text-primary block">Authentication</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-xl mx-auto">
            Secure your identity with your unique voice signature. 
            Fast, convenient, and backed by ML-powered verification.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate('/auth')}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/auth')}>
              Sign In
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-24 max-w-4xl mx-auto">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Mic className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Voice Recognition</h3>
            <p className="text-sm text-muted-foreground">
              MFCC-based voice signature extraction with cosine similarity matching.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Multi-Factor Auth</h3>
            <p className="text-sm text-muted-foreground">
              Voice biometrics combined with SMS and email OTP fallback.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">OTP Backup</h3>
            <p className="text-sm text-muted-foreground">
              Seamless fallback to SMS or email verification when needed.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-24 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">How It Works</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                1
              </div>
              <div>
                <h4 className="font-medium">Create Account</h4>
                <p className="text-sm text-muted-foreground">
                  Sign up with your email and optional phone number.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                2
              </div>
              <div>
                <h4 className="font-medium">Enroll Voice</h4>
                <p className="text-sm text-muted-foreground">
                  Record 3 voice samples to create your unique voice signature.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                3
              </div>
              <div>
                <h4 className="font-medium">Authenticate</h4>
                <p className="text-sm text-muted-foreground">
                  Speak to verify your identity. Use OTP as a backup if needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
