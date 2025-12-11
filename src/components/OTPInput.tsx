import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Loader2, ArrowLeft, Send, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OTPInputProps {
  userId: string;
  email: string;
  phone?: string;
  onVerified: () => void;
  onBack: () => void;
}

export function OTPInput({ userId, email, onVerified, onBack }: OTPInputProps) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const sendOTP = async () => {
    setSending(true);

    try {
      console.log('Sending OTP:', { userId, email });
      
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { userId, method: 'email', destination: email }
      });

      console.log('Send OTP response:', { data, error });

      if (error) {
        console.error('Function invoke error:', error);
        throw new Error(error.message || 'Failed to send OTP');
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      setSent(true);
      toast({
        title: 'Verification code sent!',
        description: 'Check your email for the 6-digit code.',
      });
    } catch (error: any) {
      console.error('Failed to send OTP:', error);
      toast({
        title: 'Failed to send code',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
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

        <div className="space-y-2 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gradient">Email Verification</h3>
          <p className="text-sm text-muted-foreground">
            We'll send a 6-digit code to verify your identity.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Email</p>
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
          </div>
        </div>

        <Button
          className="w-full neon-button bg-gradient-to-r from-primary to-accent text-primary-foreground h-12"
          onClick={sendOTP}
          disabled={sending}
        >
          {sending ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Send className="w-5 h-5 mr-2" />
          )}
          Send Verification Code
        </Button>
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
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <div className="space-y-2 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Enter verification code</h3>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to your email.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Code sent to</p>
            <p className="text-sm text-muted-foreground truncate">{email}</p>
          </div>
        </div>
      </div>

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
          onClick={sendOTP}
          disabled={sending}
        >
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Resend code
        </Button>
      </div>
    </div>
  );
}
