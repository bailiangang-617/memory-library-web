CREATE TABLE IF NOT EXISTS public.moments (
  id bigserial PRIMARY KEY,
  client_id text,
  type text,
  title text,
  body text,
  happened_at bigint,
  created_at_client bigint,
  demo boolean DEFAULT false,
  files jsonb DEFAULT '[]'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.moments TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.moments_id_seq TO anon, authenticated, service_role;
