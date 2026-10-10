BEGIN;

-- Business-approved Hogaria tariff supplied in 2026 estimates and confirmed
-- by administration on 2026-10-10. New zero-price CYPE candidates are not in
-- this allow-list and remain unavailable until their sale price is approved.
UPDATE catalog_items
SET active = TRUE,
    review_status = 'verified',
    source_name = 'Tarifario Hogaria confirmado por administración',
    price_date = DATE '2026-10-10',
    valid_from = DATE '2026-10-10',
    valid_until = DATE '2027-01-10',
    review_note = 'Importes aportados y confirmados por administración; revisión comercial trimestral.'
WHERE reference IN (
  'PRE-001', 'PRE-002', 'PRE-003', 'PRE-004', 'PRE-005',
  'DEM-001', 'DEM-002', 'DEM-003', 'DEM-004', 'DEM-005', 'DEM-006',
  'ALB-001', 'ALB-002', 'ALB-003', 'ALB-004', 'ALB-005', 'ALB-006', 'ALB-007',
  'FON-001', 'FON-002', 'FON-003', 'FON-004', 'FON-005', 'FON-006',
  'ELE-001', 'ELE-002', 'ELE-003', 'ELE-004', 'ELE-005', 'ELE-006', 'ELE-007',
  'CLI-001', 'CLI-002', 'CLI-003', 'CLI-004',
  'REV-001', 'REV-002', 'REV-003', 'REV-004', 'REV-005', 'REV-006',
  'BAN-001', 'BAN-002', 'BAN-003', 'BAN-004', 'BAN-005', 'BAN-006',
  'COC-001', 'COC-002', 'COC-003', 'COC-004', 'COC-005',
  'CAR-001', 'CAR-002', 'CAR-003', 'CAR-004', 'CAR-005',
  'PIN-001', 'PIN-002', 'PIN-003'
)
  AND sale_price > 0
  AND (
    active IS DISTINCT FROM TRUE
    OR review_status IS DISTINCT FROM 'verified'
    OR source_name IS DISTINCT FROM 'Tarifario Hogaria confirmado por administración'
    OR price_date IS DISTINCT FROM DATE '2026-10-10'
    OR valid_from IS DISTINCT FROM DATE '2026-10-10'
    OR valid_until IS DISTINCT FROM DATE '2027-01-10'
  );

COMMIT;
