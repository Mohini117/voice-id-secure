import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  userId: string;
  method: "email" | "sms";
  destination: string;
  demoMode?: boolean;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, method, destination, demoMode }: SendOTPRequest = await req.json();
    
    console.log(`Sending OTP via ${method} to ${destination} for user ${userId}${demoMode ? ' (DEMO MODE)' : ''}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP in database
    const { error: insertError } = await supabase
      .from("otp_codes")
      .insert({
        user_id: userId,
        code: otp,
        method,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      throw new Error("Failed to store OTP");
    }

    console.log(`OTP generated and stored: ${otp}`);

    // DEMO MODE: Return OTP directly without sending
    if (demoMode) {
      console.log("Demo mode enabled - returning OTP directly");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Demo mode: Your code is ${otp}`,
          demoCode: otp 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP via chosen method
    if (method === "email") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      
      if (!resendApiKey) {
        console.error("RESEND_API_KEY not configured");
        throw new Error("Email service not configured");
      }

      const resend = new Resend(resendApiKey);
      
      try {
        const { data, error: emailError } = await resend.emails.send({
          from: "VoiceAuth <onboarding@resend.dev>",
          to: [destination],
          subject: "Your VoiceAuth Verification Code",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px;">
              <h2 style="color: #00f5d4; text-align: center; margin-bottom: 20px;">🔐 VoiceAuth</h2>
              <p style="color: #ffffff; text-align: center;">Your one-time verification code is:</p>
              <div style="background: rgba(0, 245, 212, 0.1); border: 1px solid #00f5d4; padding: 20px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; border-radius: 8px; color: #00f5d4;">
                ${otp}
              </div>
              <p style="color: #888; font-size: 14px; text-align: center;">This code expires in 5 minutes. Do not share it with anyone.</p>
            </div>
          `,
        });

        if (emailError) {
          console.error("Resend API error:", emailError);
          throw new Error(`Email delivery failed: ${emailError.message}`);
        }

        console.log("Email sent successfully:", data);
      } catch (emailErr: unknown) {
        const errMsg = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error("Email sending failed:", errMsg);
        throw new Error(errMsg);
      }
    } else if (method === "sms") {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

      if (!accountSid || !authToken || !fromNumber) {
        console.error("Twilio credentials not fully configured");
        throw new Error("SMS service not configured");
      }

      // Format phone number for Twilio (needs E.164 format)
      let formattedPhone = destination;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+91' + formattedPhone.replace(/\D/g, '');
      }

      // Check if To and From are the same
      if (formattedPhone === fromNumber) {
        throw new Error("Cannot send SMS to the same number as the sender. Please use a Twilio-purchased number as TWILIO_FROM_NUMBER.");
      }

      console.log(`Sending SMS to ${formattedPhone} from ${fromNumber}`);

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      
      try {
        const response = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
          },
          body: new URLSearchParams({
            To: formattedPhone,
            From: fromNumber,
            Body: `Your VoiceAuth verification code is: ${otp}. Valid for 5 minutes.`,
          }),
        });

        const responseData = await response.json();

        if (!response.ok) {
          console.error("Twilio error response:", responseData);
          throw new Error(responseData.message || "Failed to send SMS");
        }

        console.log("SMS sent successfully:", responseData.sid);
      } catch (smsErr: unknown) {
        const errMsg = smsErr instanceof Error ? smsErr.message : "Unknown SMS error";
        console.error("SMS sending failed:", errMsg);
        throw new Error(errMsg);
      }
    }

    console.log(`OTP sent successfully via ${method}`);

    return new Response(
      JSON.stringify({ success: true, message: `OTP sent via ${method}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-otp:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
