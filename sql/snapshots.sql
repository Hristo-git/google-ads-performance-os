-- Quality Score & Ad Strength Snapshot Tables
-- Run this in Supabase SQL Editor

-- Keyword QS snapshots (weekly)
CREATE TABLE IF NOT EXISTS gads_qs_snapshots (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  keyword_id TEXT NOT NULL,
  ad_group_id TEXT NOT NULL,
  quality_score SMALLINT,
  expected_ctr TEXT,
  landing_page_experience TEXT,
  ad_relevance TEXT,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, keyword_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_qs_snapshots_lookup
  ON gads_qs_snapshots(customer_id, snapshot_date);

-- Ad Strength snapshots (weekly)
CREATE TABLE IF NOT EXISTS gads_ad_strength_snapshots (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_group_id TEXT NOT NULL,
  ad_strength TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, ad_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_strength_snapshots_lookup
  ON gads_ad_strength_snapshots(customer_id, snapshot_date);
