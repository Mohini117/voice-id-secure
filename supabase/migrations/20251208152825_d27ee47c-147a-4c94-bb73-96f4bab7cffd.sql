-- Create profiles table for user basic info
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create voice_profiles table for Azure voice profile data
CREATE TABLE public.voice_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  azure_profile_id TEXT NOT NULL,
  enrollment_status TEXT NOT NULL DEFAULT 'pending',
  samples_collected INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create auth_logs table for tracking authentication attempts
CREATE TABLE public.auth_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  confidence_score DECIMAL,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create otp_codes table for fallback authentication
CREATE TABLE public.otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  method TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Voice profiles policies
CREATE POLICY "Users can view their own voice profile"
ON public.voice_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own voice profile"
ON public.voice_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice profile"
ON public.voice_profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Auth logs policies (users can only view their own logs)
CREATE POLICY "Users can view their own auth logs"
ON public.auth_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert auth logs"
ON public.auth_logs FOR INSERT
WITH CHECK (true);

-- OTP codes policies
CREATE POLICY "Users can view their own OTP codes"
ON public.otp_codes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert OTP codes"
ON public.otp_codes FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own OTP codes"
ON public.otp_codes FOR UPDATE
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_voice_profiles_updated_at
BEFORE UPDATE ON public.voice_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'phone', '')
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();