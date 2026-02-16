-- Promotions table
CREATE TABLE IF NOT EXISTS promotions (
    id SERIAL PRIMARY KEY,
    promo_name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    channel VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('active', 'scheduled', 'completed', 'cancelled')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
