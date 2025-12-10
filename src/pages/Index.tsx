import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Fingerprint, Shield, Zap, Mic, ArrowRight, Sparkles } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid opacity-20" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[120px] animate-pulse animation-delay-400" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <nav className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full" />
              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Fingerprint className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>
            <span className="text-xl font-bold text-gradient">VoiceAuth</span>
          </div>
          <Link to="/auth">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10 hover:border-primary">
              Sign In
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 px-6 pt-20 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 mb-8 shimmer">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Next-Gen Biometric Security</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
              <span className="text-foreground">Your Voice is Your</span>
              <br />
              <span className="text-gradient">Password</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Experience passwordless authentication powered by advanced voice biometrics. 
              Secure, seamless, and uniquely yours.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
              <Link to="/auth">
                <Button size="lg" className="neon-button bg-gradient-to-r from-primary to-accent text-primary-foreground px-8 py-6 text-lg">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>

            {/* Voice Visualization */}
            <div className="relative w-64 h-64 mx-auto mb-20">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-2xl" />
              <div className="relative w-full h-full rounded-full border border-primary/30 bg-card/50 backdrop-blur-xl flex items-center justify-center float">
                <div className="absolute inset-4 rounded-full border border-primary/20" />
                <div className="absolute inset-8 rounded-full border border-primary/10" />
                <div className="flex items-center gap-1">
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 bg-gradient-to-t from-primary to-accent rounded-full voice-wave"
                      style={{ height: `${30 + Math.random() * 40}px`, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="glass-card p-6 group cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-primary/30">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-purple-500 p-0.5 mb-4">
                <div className="w-full h-full rounded-xl bg-background flex items-center justify-center">
                  <Mic className="w-6 h-6 text-foreground" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Voice Biometrics</h3>
              <p className="text-muted-foreground text-sm">Advanced MFCC analysis captures your unique voice signature.</p>
            </div>
            <div className="glass-card p-6 group cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-primary/30">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary to-cyan-400 p-0.5 mb-4">
                <div className="w-full h-full rounded-xl bg-background flex items-center justify-center">
                  <Shield className="w-6 h-6 text-foreground" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Bank-Grade Security</h3>
              <p className="text-muted-foreground text-sm">Multi-factor authentication with OTP fallback via email and SMS.</p>
            </div>
            <div className="glass-card p-6 group cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-primary/30">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent to-pink-500 p-0.5 mb-4">
                <div className="w-full h-full rounded-xl bg-background flex items-center justify-center">
                  <Zap className="w-6 h-6 text-foreground" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Lightning Fast</h3>
              <p className="text-muted-foreground text-sm">Authenticate in under 3 seconds with client-side ML processing.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/30 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>© 2024 VoiceAuth. Secure voice biometric authentication.</p>
        </div>
      </footer>
    </div>
  );
}
