-- Restore the authenticated read policy
create policy "Allow authenticated users to read registrations"
  on registrations for select
  to authenticated
  using (true); 