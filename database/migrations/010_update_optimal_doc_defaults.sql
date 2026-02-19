-- Update default target DOC values for all locations
UPDATE location_optimal_doc SET optimal_days = 7 WHERE location_name = 'IQF+ AD';
UPDATE location_optimal_doc SET optimal_days = 30 WHERE location_name = 'BBMS';
UPDATE location_optimal_doc SET optimal_days = 7 WHERE location_name = 'Blr';
UPDATE location_optimal_doc SET optimal_days = 7 WHERE location_name = 'NL- WH';
UPDATE location_optimal_doc SET optimal_days = 0 WHERE location_name = 'SVT';
UPDATE location_optimal_doc SET optimal_days = 7 WHERE location_name = 'UK -WH';
UPDATE location_optimal_doc SET optimal_days = 45 WHERE location_name IN (
  'AUS-FBA', 'AUS- FBA', 'CA-FBA', 'EU-FBA', 'UK-FBA',
  'SG-FBA', 'UAE-FBA', 'FBA - INDIA', 'Shoppee', 'Lazada'
);
