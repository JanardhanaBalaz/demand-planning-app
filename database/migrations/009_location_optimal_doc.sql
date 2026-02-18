-- Optimal inventory levels (in days of cover) per warehouse/FBA location
CREATE TABLE IF NOT EXISTS location_optimal_doc (
  id SERIAL PRIMARY KEY,
  location_name VARCHAR(100) NOT NULL UNIQUE,
  optimal_days INTEGER NOT NULL DEFAULT 30,
  updated_by VARCHAR(255),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed defaults for all known locations
INSERT INTO location_optimal_doc (location_name, optimal_days) VALUES
  ('IQF+ AD', 30),
  ('BBMS', 30),
  ('Blr', 30),
  ('NL- WH', 30),
  ('SVT', 30),
  ('UK -WH', 30),
  ('AUS-FBA', 30),
  ('AUS- FBA', 30),
  ('CA-FBA', 30),
  ('EU-FBA', 30),
  ('UK-FBA', 30),
  ('SG-FBA', 30),
  ('UAE-FBA', 30),
  ('FBA - INDIA', 30),
  ('Shoppee', 30),
  ('Lazada', 30)
ON CONFLICT (location_name) DO NOTHING;
