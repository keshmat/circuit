-- Create a function that only returns the count
create or replace function public.get_registration_count()
returns integer
language sql
security definer
as $$
  select count(*) from registrations;
$$;

-- Add policy to allow calling the count function
create policy "Allow public to get registration count"
  on registrations for select
  to anon, authenticated
  using (false);

-- Grant execute permission on the function
grant execute on function public.get_registration_count() to anon, authenticated;

-- Drop the old policy that only allowed authenticated users to read
drop policy if exists "Allow authenticated users to read registrations" on registrations; 