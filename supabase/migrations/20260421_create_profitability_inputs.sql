-- Per-customer profitability inputs used by the Creative Ad Audit template.
-- Not available from Google Ads API (COGS, CM margins, LTV, CAC, blended MER).
create table if not exists customer_profitability_inputs (
  customer_id text primary key,
  currency text default 'EUR',
  avg_order_value numeric,
  cogs_percent numeric,
  cm1_percent numeric,
  cm2_percent numeric,
  cm3_percent numeric,
  target_ltv numeric,
  target_cac numeric,
  blended_mer numeric,
  break_even_roas numeric,
  notes text,
  updated_at timestamp with time zone default now()
);

create index if not exists idx_profitability_inputs_updated_at
  on customer_profitability_inputs(updated_at desc);

alter table customer_profitability_inputs enable row level security;

create policy "Enable read access for authenticated users" on customer_profitability_inputs
  for select
  using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated users" on customer_profitability_inputs
  for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy "Enable update for authenticated users" on customer_profitability_inputs
  for update
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');
