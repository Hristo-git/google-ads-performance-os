-- Create the gads_reports table for storing AI analysis history
create table if not exists gads_reports (
  id text primary key,
  customer_id text not null,
  template_id text not null,
  title text,
  analysis text,
  audience text,
  language text,
  model text,
  created_at timestamp with time zone default now(),
  metadata jsonb
);

-- Add indexes for common queries
create index if not exists idx_gads_reports_customer_id on gads_reports(customer_id);
create index if not exists idx_gads_reports_created_at on gads_reports(created_at desc);

-- Enable RLS (Row Level Security)
alter table gads_reports enable row level security;

-- Create policy to allow authenticated users to read reports
-- (Adjust this policy based on your actual auth needs, currently open for service role)
create policy "Enable read access for authenticated users" on gads_reports
  for select
  using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated users" on gads_reports
  for insert
  with check (auth.role() = 'authenticated' OR auth.role() = 'service_role');
