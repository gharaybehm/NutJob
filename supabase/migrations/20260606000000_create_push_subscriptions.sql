-- Push subscription registry. One row per browser/device per user per farm.
-- endpoint is the globally unique URL produced by the browser's PushManager.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_id    UUID        NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read and delete their own subscriptions
CREATE POLICY "users_own_push_subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_ps_farm ON public.push_subscriptions(farm_id);
CREATE INDEX idx_ps_user ON public.push_subscriptions(user_id);
CREATE INDEX idx_ps_ep   ON public.push_subscriptions(endpoint);
