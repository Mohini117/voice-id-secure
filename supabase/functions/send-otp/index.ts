import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  userId: string;
  method: "email";
  destination: string;
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
    const { userId, method, destination }: SendOTPRequest = await req.json();
    
    console.log(`Generating OTP for user ${userId}, email: ${destination}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    const resend = new Resend(resendApiKey);

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP in database
    const { error: insertError } = await supabase
      .from("otp_codes")
      .insert({
        user_id: userId,
        code: otp,
        method: method || "email",
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      throw new Error("Failed to generate verification code");
    }

    console.log(`OTP generated successfully: ${otp}, sending to ${destination}`);

    // Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "VoiceAuth <onboarding@resend.dev>",
      to: [destination],
      subject: "Your VoiceAuth Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff; border-radius: 10px;">
          <h1 style="color: #00d4ff; text-align: center; margin-bottom: 30px;">🔐 VoiceAuth</h1>
          <p style="font-size: 16px; color: #e0e0e0;">Hello,</p>
          <p style="font-size: 16px; color: #e0e0e0;">Your verification code is:</p>
          <div style="background: rgba(0, 212, 255, 0.1); border: 2px solid #00d4ff; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #00d4ff;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #a0a0a0;">This code expires in 5 minutes.</p>
          <p style="font-size: 14px; color: #a0a0a0;">If you didn't request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;" />
          <p style="font-size: 12px; color: #666; text-align: center;">© 2024 VoiceAuth. Secure Voice Authentication.</p>
        </div>
      `,
    });

    if (emailError) {
      console.error("Failed to send email:", emailError);
      throw new Error(`Failed to send verification email: ${emailError.message}`);
    }

    console.log(`Email sent successfully:`, emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Verification code sent to your email"
      }),
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
