import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyOTPRequest {
  userId: string;
  code: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, code }: VerifyOTPRequest = await req.json();
    
    console.log(`Verifying OTP for user ${userId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find valid OTP
    const { data: otpRecord, error: fetchError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching OTP:", fetchError);
      throw new Error("Failed to verify OTP");
    }

    if (!otpRecord) {
      console.log("Invalid or expired OTP");
      
      // Log failed attempt
      await supabase.from("auth_logs").insert({
        user_id: userId,
        auth_method: "otp",
        success: false,
      });

      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as used
    await supabase
      .from("otp_codes")
      .update({ used: true })
      .eq("id", otpRecord.id);

    // Log successful verification
    await supabase.from("auth_logs").insert({
      user_id: userId,
      auth_method: "otp",
      success: true,
      confidence_score: 1.0,
    });

    console.log("OTP verified successfully");

    return new Response(
      JSON.stringify({ success: true, message: "OTP verified successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-otp:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
