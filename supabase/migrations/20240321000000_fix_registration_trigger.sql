-- Drop the incorrect trigger from auth.users
drop trigger if exists on_auth_user_created on auth.users;

-- Drop the old function if it exists
drop function if exists public.handle_new_user();

-- Create the correct function for registrations
create or replace function public.handle_new_registration()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Call the Edge Function
  perform
    net.http_post(
      url := 'https://qbxdqdscawcsfjuaduid.supabase.co/functions/v1/send-registration-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', current_setting('request.headers')::json->>'authorization'
      ),
      body := jsonb_build_object(
        'email', NEW.email,
        'name', NEW.first_name || ' ' || NEW.last_name
      )
    );
  return NEW;
end;
$$;

-- Create the correct trigger on registrations table
create trigger send_registration_confirmation_email
  after insert on registrations
  for each row execute procedure public.handle_new_registration(); 