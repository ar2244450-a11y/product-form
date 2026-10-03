-- حماية الـ public Edge Function من الإرسال المتكرر
create table if not exists public.product_api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

create or replace function public.consume_product_rate_limit(
  p_rate_key text,
  p_window_seconds integer default 3600,
  p_max_requests integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.product_api_rate_limits;
begin
  insert into public.product_api_rate_limits(rate_key, window_started_at, request_count)
  values (p_rate_key, now(), 1)
  on conflict (rate_key) do update set
    window_started_at = case
      when now() - product_api_rate_limits.window_started_at >= make_interval(secs => p_window_seconds)
      then now()
      else product_api_rate_limits.window_started_at
    end,
    request_count = case
      when now() - product_api_rate_limits.window_started_at >= make_interval(secs => p_window_seconds)
      then 1
      else product_api_rate_limits.request_count + 1
    end
  returning * into current_row;

  return current_row.request_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_product_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_product_rate_limit(text, integer, integer) to service_role;

alter table public.product_api_rate_limits enable row level security;
