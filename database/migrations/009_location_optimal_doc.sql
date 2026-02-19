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
  ('IQF+ AD', 7),
  ('BBMS', 30),
  ('Blr', 7),
  ('NL- WH', 7),
  ('SVT', 0),
  ('UK -WH', 7),
  ('AUS-FBA', 45),
  ('AUS- FBA', 45),
  ('CA-FBA', 45),
  ('EU-FBA', 45),
  ('UK-FBA', 45),
  ('SG-FBA', 45),
  ('UAE-FBA', 45),
  ('FBA - INDIA', 45),
  ('Shoppee', 45),
  ('Lazada', 45)
ON CONFLICT (location_name) DO NOTHING;
