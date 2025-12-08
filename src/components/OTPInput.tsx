import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Phone, Loader2, ArrowLeft } from 'lucide-react';
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
  const { toast } = useToast();

  const sendOTP = async (selectedMethod: 'email' | 'sms') => {
    setMethod(selectedMethod);
    setSending(true);

    try {
      const destination = selectedMethod === 'email' ? email : phone;
      
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { userId, method: selectedMethod, destination }
      });

      if (error) throw error;

      setSent(true);
      toast({
        title: 'Code sent',
        description: `Check your ${selectedMethod === 'email' ? 'email' : 'phone'} for the verification code.`,
      });
    } catch (error) {
      console.error('Failed to send OTP:', error);
      toast({
        title: 'Failed to send code',
        description: 'Please try again.',
        variant: 'destructive',
      });
      setMethod(null);
    } finally {
      setSending(false);
    }
  };

  const verifyOTP = async () => {
    if (code.length !== 6) return;
    
    setVerifying(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { userId, code }
      });

      if (error || !data?.success) {
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
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to voice
        </Button>

        <h3 className="text-lg font-semibold">Choose verification method</h3>
        <p className="text-sm text-muted-foreground">
          We'll send you a one-time code to verify your identity.
        </p>

        <div className="grid gap-3">
          <Button
            variant="outline"
            className="justify-start h-auto py-4 px-4"
            onClick={() => sendOTP('email')}
            disabled={sending}
          >
            {sending && method === 'email' ? (
              <Loader2 className="w-5 h-5 mr-3 animate-spin" />
            ) : (
              <Mail className="w-5 h-5 mr-3" />
            )}
            <div className="text-left">
              <p className="font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </Button>

          {phone && (
            <Button
              variant="outline"
              className="justify-start h-auto py-4 px-4"
              onClick={() => sendOTP('sms')}
              disabled={sending}
            >
              {sending && method === 'sms' ? (
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
              ) : (
                <Phone className="w-5 h-5 mr-3" />
              )}
              <div className="text-left">
                <p className="font-medium">SMS</p>
                <p className="text-sm text-muted-foreground">{phone}</p>
              </div>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setSent(false);
          setCode('');
          setMethod(null);
        }}
        className="mb-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Choose different method
      </Button>

      <h3 className="text-lg font-semibold">Enter verification code</h3>
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to your {method === 'email' ? 'email' : 'phone'}.
      </p>

      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className="text-center text-2xl tracking-widest font-mono"
      />

      <Button
        className="w-full"
        onClick={verifyOTP}
        disabled={code.length !== 6 || verifying}
      >
        {verifying ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : null}
        Verify Code
      </Button>

      <Button
        variant="ghost"
        className="w-full"
        onClick={() => sendOTP(method!)}
        disabled={sending}
      >
        Resend code
      </Button>
    </div>
  );
}
