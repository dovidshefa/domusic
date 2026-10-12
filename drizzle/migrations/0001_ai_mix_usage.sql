CREATE TABLE public.ai_mix_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_mix_usage_user_time ON public.ai_mix_usage (user_id, created_at);
GRANT SELECT, INSERT ON public.ai_mix_usage TO authenticated;
GRANT ALL ON public.ai_mix_usage TO service_role;
ALTER TABLE public.ai_mix_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage read" ON public.ai_mix_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own usage insert" ON public.ai_mix_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);