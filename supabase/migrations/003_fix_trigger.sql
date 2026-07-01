-- Fix handle_new_user trigger: previously inserted raw full_name/email as username,
-- which violates the username_format constraint for names with spaces, capitals, or periods,
-- causing the entire signup transaction to roll back.
-- username is now left NULL; UsernameModal prompts new users to choose one.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
