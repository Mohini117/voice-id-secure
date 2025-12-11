import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Phone, Loader2, ArrowLeft, Send, KeyRound, FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OTPInputProps {
  userId: string;
  email: string;
  phone: string;
  onVerified: () => void;
  onBack: () => void;
}

export function OTPInput({ userId, email, phone, onVerified, onBack }: OTPInputProps) {
  const [method, setMethod] = useState<'email' | 'sms' | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const { toast } = useToast();

  const sendOTP = async (selectedMethod: 'email' | 'sms', isDemo = false) => {
    setMethod(selectedMethod);
    setSending(true);
    setDemoMode(isDemo);
    setDemoCode(null);

    try {
      const destination = selectedMethod === 'email' ? email : phone;
      
      console.log('Sending OTP:', { userId, method: selectedMethod, destination, demoMode: isDemo });
      
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { userId, method: selectedMethod, destination, demoMode: isDemo }
      });

      console.log('Send OTP response:', { data, error });

      if (error) {
        console.error('Function invoke error:', error);
        throw new Error(error.message || 'Failed to send OTP');
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      // If demo mode, capture the code
      if (isDemo && data?.demoCode) {
        setDemoCode(data.demoCode);
      }

      setSent(true);
      toast({
        title: isDemo ? 'Demo code generated!' : 'Code sent!',
        description: isDemo 
          ? 'Your demo verification code is shown below.' 
          : `Check your ${selectedMethod === 'email' ? 'email inbox' : 'phone'} for the verification code.`,
      });
    } catch (error: any) {
      console.error('Failed to send OTP:', error);
      toast({
        title: 'Failed to send code',
        description: error.message || 'Please check your credentials and try again.',
        variant: 'destructive',
      });
      setMethod(null);
      setDemoMode(false);
    } finally {
      setSending(false);
    }
  };

  const verifyOTP = async () => {
    if (code.length !== 6) return;
    
    setVerifying(true);

    try {
      console.log('Verifying OTP:', { userId, code });
      
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { userId, code }
      });

      console.log('Verify OTP response:', { data, error });

      if (error) {
        console.error('Function invoke error:', error);
        throw new Error(error.message || 'Verification failed');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Invalid code');
      }

      toast({
        title: 'Verified!',
        description: 'Authentication successful.',
      });
      onVerified();
    } catch (error: any) {
      console.error('OTP verification failed:', error);
      toast({
        title: 'Verification failed',
        description: error.message || 'Invalid or expired code.',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const hasValidPhone = phone && phone.trim().length > 0;

  if (!sent) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to voice
        </Button>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gradient">Choose verification method</h3>
          <p className="text-sm text-muted-foreground">
            We'll send you a 6-digit code to verify your identity.
          </p>
        </div>

        <div className="grid gap-3">
          {/* Demo Mode Button */}
          <button
            onClick={() => sendOTP('email', true)}
            disabled={sending}
            className="group relative w-full p-4 rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 hover:bg-accent/10 hover:border-accent transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              {sending && demoMode ? (
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-yellow-400/20 flex items-center justify-center group-hover:from-accent/30 group-hover:to-yellow-400/30 transition-all">
                  <FlaskConical className="w-6 h-6 text-accent" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">Demo Mode</p>
                <p className="text-sm text-muted-foreground">Test without email/SMS setup</p>
              </div>
              <Send className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
            </div>
          </button>

          {/* Email Button */}
          <button
            onClick={() => sendOTP('email')}
            disabled={sending}
            className="group relative w-full p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-primary/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              {sending && method === 'email' && !demoMode ? (
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center group-hover:from-primary/30 group-hover:to-accent/30 transition-all">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">Email</p>
                <p className="text-sm text-muted-foreground truncate">{email}</p>
              </div>
              <Send className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>

          {hasValidPhone && (
            <button
              onClick={() => sendOTP('sms')}
              disabled={sending}
              className="group relative w-full p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-secondary/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-4">
                {sending && method === 'sms' ? (
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-secondary animate-spin" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary/20 to-cyan-400/20 flex items-center justify-center group-hover:from-secondary/30 group-hover:to-cyan-400/30 transition-all">
                    <Phone className="w-6 h-6 text-secondary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">SMS</p>
                  <p className="text-sm text-muted-foreground truncate">{phone}</p>
                </div>
                <Send className="w-5 h-5 text-muted-foreground group-hover:text-secondary transition-colors" />
              </div>
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          💡 Use <span className="text-accent font-medium">Demo Mode</span> to test OTP without configuring email/SMS services.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setSent(false);
          setCode('');
          setMethod(null);
          setDemoMode(false);
          setDemoCode(null);
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Choose different method
      </Button>

      <div className="space-y-2 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Enter verification code</h3>
        <p className="text-sm text-muted-foreground">
          {demoMode 
            ? 'Your demo verification code is shown below.'
            : `We sent a 6-digit code to your ${method === 'email' ? 'email' : 'phone'}.`
          }
        </p>
      </div>

      {/* Demo Code Display */}
      {demoMode && demoCode && (
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 text-center">
          <p className="text-sm text-muted-foreground mb-2">Your demo code:</p>
          <p className="text-3xl font-mono font-bold tracking-[0.5em] text-accent">{demoCode}</p>
        </div>
      )}

      <div className="space-y-4">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="otp-input h-16 text-center text-3xl font-mono tracking-[0.5em] bg-muted/50 border-border/50 focus:border-primary"
          autoFocus
        />

        <Button
          className="w-full neon-button bg-gradient-to-r from-primary to-accent text-primary-foreground h-12"
          onClick={verifyOTP}
          disabled={code.length !== 6 || verifying}
        >
          {verifying ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : null}
          Verify Code
        </Button>

        <Button
          variant="ghost"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={() => sendOTP(method!, demoMode)}
          disabled={sending}
        >
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Resend code
        </Button>
      </div>
    </div>
  );
}
