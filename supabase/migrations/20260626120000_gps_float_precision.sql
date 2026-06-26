-- Change GPS coordinate columns from numeric(x,2) to float8 (double precision)
-- to allow full decimal precision, controlled at the application layer.
ALTER TABLE farms
  ALTER COLUMN gps_lat TYPE float8 USING gps_lat::float8,
  ALTER COLUMN gps_lng TYPE float8 USING gps_lng::float8;
