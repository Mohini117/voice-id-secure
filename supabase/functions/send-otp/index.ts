import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  userId: string;
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
    const { userId, destination }: SendOTPRequest = await req.json();
    
    console.log(`Generating OTP for user ${userId}, email: ${destination}`);

    // Get SMTP credentials
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpUser || !smtpPass) {
      throw new Error("SMTP credentials not configured");
    }

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
        method: "email",
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      throw new Error("Failed to generate verification code");
    }

    console.log(`OTP stored in database: ${otp}`);

    // Send email via SMTP (Gmail)
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    });

    try {
      await client.send({
        from: smtpUser,
        to: destination,
        subject: "VoiceAuth - Your Verification Code",
        content: `Your verification code is: ${otp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #8B5CF6; margin: 0;">VoiceAuth</h1>
              <p style="color: #666; margin-top: 5px;">Secure Voice Authentication</p>
            </div>
            <div style="background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); border-radius: 12px; padding: 30px; text-align: center;">
              <p style="color: white; margin: 0 0 15px 0; font-size: 16px;">Your verification code is:</p>
              <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 20px; display: inline-block;">
                <span style="color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${otp}</span>
              </div>
              <p style="color: rgba(255,255,255,0.8); margin: 20px 0 0 0; font-size: 14px;">This code expires in 5 minutes</p>
            </div>
            <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        `,
      });

      await client.close();
      console.log(`OTP email sent successfully to ${destination}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Verification code sent to your email"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (emailError) {
      await client.close();
      console.error("Failed to send email:", emailError);
      throw new Error("Failed to send verification email. Please check SMTP configuration.");
    }
  } catch (error: unknown) {
    console.error("Error in send-otp:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
