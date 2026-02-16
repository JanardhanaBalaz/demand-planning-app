-- Unified demand snapshots (synced from Metabase Q19170)
CREATE TABLE IF NOT EXISTS unified_demand_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    country_bucket VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    drr_92 NUMERIC(12, 2) DEFAULT 0,
    drr_30 NUMERIC(12, 2) DEFAULT 0,
    total_units_period INT DEFAULT 0,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uds_sku ON unified_demand_snapshots(sku);
CREATE INDEX IF NOT EXISTS idx_uds_country ON unified_demand_snapshots(country_bucket);
CREATE INDEX IF NOT EXISTS idx_uds_channel ON unified_demand_snapshots(channel);
CREATE INDEX IF NOT EXISTS idx_uds_snapshot_date ON unified_demand_snapshots(snapshot_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uds_unique ON unified_demand_snapshots(sku, country_bucket, channel, snapshot_date);

-- Demand forecasts (one row per SKU x Country x Channel x Month)
CREATE TABLE IF NOT EXISTS demand_forecasts (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    country_bucket VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    forecast_month DATE NOT NULL,
    forecast_units INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
    created_by INT REFERENCES users(id),
    updated_by INT REFERENCES users(id),
    submitted_at TIMESTAMP,
    approved_by INT REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (sku, country_bucket, channel, forecast_month)
);

CREATE INDEX IF NOT EXISTS idx_df_sku ON demand_forecasts(sku);
CREATE INDEX IF NOT EXISTS idx_df_country ON demand_forecasts(country_bucket);
CREATE INDEX IF NOT EXISTS idx_df_channel ON demand_forecasts(channel);
CREATE INDEX IF NOT EXISTS idx_df_forecast_month ON demand_forecasts(forecast_month);
CREATE INDEX IF NOT EXISTS idx_df_status ON demand_forecasts(status);
