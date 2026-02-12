-- Add assigned_channels to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_channels TEXT[] DEFAULT '{}';

-- Channel-level forecast settings (lift%, growth%, distribution per month)
CREATE TABLE IF NOT EXISTS channel_forecast_settings (
    id SERIAL PRIMARY KEY,
    channel_group VARCHAR(20) NOT NULL,
    country_bucket VARCHAR(50) NOT NULL,
    forecast_month DATE NOT NULL,
    baseline_drr NUMERIC(12,4) DEFAULT 0,
    lift_pct NUMERIC(8,2) DEFAULT 0,
    mom_growth_pct NUMERIC(8,2) DEFAULT 0,
    distribution_method VARCHAR(20) DEFAULT 'historical'
        CHECK (distribution_method IN ('desired', 'historical')),
    baseline_start_date DATE,
    baseline_end_date DATE,
    ring_basis VARCHAR(20) DEFAULT 'activated',
    updated_by INT REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (channel_group, country_bucket, forecast_month)
);

-- Per-SKU weight distribution within a channel/region
CREATE TABLE IF NOT EXISTS channel_sku_distribution (
    id SERIAL PRIMARY KEY,
    channel_group VARCHAR(20) NOT NULL,
    country_bucket VARCHAR(50) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    auto_weight_pct NUMERIC(8,4) DEFAULT 0,
    manual_weight_pct NUMERIC(8,4),
    is_override BOOLEAN DEFAULT FALSE,
    updated_by INT REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (channel_group, country_bucket, sku)
);

-- Materialized demand forecasts from channel forecast
CREATE TABLE IF NOT EXISTS demand_forecasts (
    id SERIAL PRIMARY KEY,
    channel_group VARCHAR(20) NOT NULL,
    country_bucket VARCHAR(50) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    forecast_month DATE NOT NULL,
    forecast_units INT DEFAULT 0,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (channel_group, country_bucket, sku, forecast_month)
);

CREATE INDEX IF NOT EXISTS idx_cfs_channel_country ON channel_forecast_settings(channel_group, country_bucket);
CREATE INDEX IF NOT EXISTS idx_csd_channel_country ON channel_sku_distribution(channel_group, country_bucket);
CREATE INDEX IF NOT EXISTS idx_df_channel_country ON demand_forecasts(channel_group, country_bucket);
