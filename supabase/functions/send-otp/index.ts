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
    
    console.log(`Sending OTP via ${method} to ${destination} for user ${userId}`);

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
          
          // Check if it's a domain verification error
          if (emailError.message?.includes("verify a domain") || emailError.message?.includes("testing emails")) {
            throw new Error("Email service requires domain verification. Please verify your domain at resend.com/domains or use the Resend account owner's email for testing.");
          }
          
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
        // Assume Indian number if no country code
        formattedPhone = '+91' + formattedPhone.replace(/\D/g, '');
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
          
          // Check for common Twilio errors
          if (responseData.code === 21608 || responseData.message?.includes("unverified")) {
            throw new Error("SMS requires a verified Twilio phone number. Please verify your 'From' number at twilio.com/console");
          }
          if (responseData.code === 21211) {
            throw new Error("Invalid phone number format. Please check the phone number.");
          }
          if (responseData.code === 21606) {
            throw new Error("The 'From' phone number is not a valid Twilio number. Please configure a valid Twilio phone number.");
          }
          
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
