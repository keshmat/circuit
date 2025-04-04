-- Circuit Registration Database Schema
-- This file documents the Supabase database schema for the Circuit registration system

-- Settings table for controlling registration status and limits
create table if not exists registration_settings (
  id uuid primary key default uuid_generate_v4(),
  is_registration_open boolean default true,
  max_registrations integer,
  current_registrations integer default 0,
  updated_at timestamp with time zone default now()
);

-- Registrations table for storing player registrations
create table if not exists registrations (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  fide_id text,
  birthday date,
  rating integer,
  payment_receipt_url text,
  status text default 'pending', -- pending, confirmed, waitlisted
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'registrations' and rowsecurity = true) then
    alter table registrations enable row level security;
  end if;
  if not exists (select 1 from pg_tables where tablename = 'registration_settings' and rowsecurity = true) then
    alter table registration_settings enable row level security;
  end if;
end $$;

-- Create receipts bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Enable RLS on the receipts bucket
update storage.buckets
set file_size_limit = 5242880, -- 5MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
where id = 'receipts';

-- Drop existing policies if they exist
drop policy if exists "Allow all operations on registrations" on registrations;
drop policy if exists "Allow anon insert on registrations" on registrations;
drop policy if exists "Allow authenticated read on registrations" on registrations;
drop policy if exists "Allow authenticated update on registrations" on registrations;
drop policy if exists "Allow authenticated delete on registrations" on registrations;
drop policy if exists "Allow anon read on registration_settings" on registration_settings;
drop policy if exists "Allow authenticated update on registration_settings" on registration_settings;
drop policy if exists "Allow anon uploads to receipts bucket" on storage.objects;
drop policy if exists "Allow authenticated read on receipts bucket" on storage.objects;

-- Re-enable RLS on registrations table
alter table registrations enable row level security;

-- Registration Policies
-- Allow public to insert registrations
create policy "Allow public to insert registrations"
  on registrations for insert
  to anon, authenticated
  with check (true);

-- Allow authenticated users to read all registrations
create policy "Allow authenticated users to read registrations"
  on registrations for select
  to authenticated
  using (true);

-- Allow authenticated users to update registrations
create policy "Allow authenticated users to update registrations"
  on registrations for update
  to authenticated
  using (true);

-- Allow authenticated users to delete registrations
create policy "Allow authenticated users to delete registrations"
  on registrations for delete
  to authenticated
  using (true);

-- Registration Settings Policies
-- Allow public to read registration settings
create policy "Allow public to read registration settings"
  on registration_settings for select
  to anon, authenticated
  using (true);

-- Allow authenticated users to update registration settings
create policy "Allow authenticated users to update registration settings"
  on registration_settings for update
  to authenticated
  using (true);

-- Storage Policies
-- Allow public uploads to receipts bucket
create policy "Allow public uploads to receipts"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'receipts');

-- Allow public reads from receipts bucket
create policy "Allow public reads from receipts"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'receipts');

-- Initial setup
-- Insert initial settings record if it doesn't exist
insert into registration_settings (max_registrations)
select 100
where not exists (select 1 from registration_settings);

-- Environment Variables Required
-- PUBLIC_SUPABASE_URL=your_supabase_url
-- PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key 