-- Moves the 8 pilot checkpoints from the old placeholder area (about 2.8 km south) to the Bildungscampus
-- Heilbronn. Centres from OpenStreetMap, radii from the Main Project Document, section 5 (see seed.js).
-- Runs once; later tuning after the on-site tests (WP13) is done with plain UPDATEs, as before.
UPDATE checkpoints SET latitude = 49.148464, longitude = 9.215808, radius = 60 WHERE checkpoint_name = 'Mensa';
UPDATE checkpoints SET latitude = 49.149493, longitude = 9.216467, radius = 60 WHERE checkpoint_name = 'Library';
UPDATE checkpoints SET latitude = 49.148951, longitude = 9.216205, radius = 40 WHERE checkpoint_name = 'CAS Cafe';
UPDATE checkpoints SET latitude = 49.147082, longitude = 9.217206, radius = 50 WHERE checkpoint_name = 'Campus Garden';
UPDATE checkpoints SET latitude = 49.149088, longitude = 9.217270, radius = 40 WHERE checkpoint_name = 'Care.box and Shop.box';
UPDATE checkpoints SET latitude = 49.147126, longitude = 9.218486, radius = 60 WHERE checkpoint_name = 'Building B';
UPDATE checkpoints SET latitude = 49.147316, longitude = 9.217900, radius = 60 WHERE checkpoint_name = 'Building C';
-- Not in OpenStreetMap: inactive until its centre is picked on site (WP9).
UPDATE checkpoints SET latitude = 49.147003, longitude = 9.217753, radius = 40, is_active = 0 WHERE checkpoint_name = 'Containers';
