-- Enable the http extension
create extension if not exists http with schema extensions;

-- Create a dummy function for the original mistaken trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- This is a dummy function that was mistakenly created
  -- The correct implementation is in the next migration
  return NEW;
end;
$$;

-- Create a trigger to call the function when a new user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user(); 