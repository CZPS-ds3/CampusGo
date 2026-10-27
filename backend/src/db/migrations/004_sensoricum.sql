-- "Containers" is the DHBW Sensoricum: renamed, moved to the grey building beside the Bildungscampus car park
-- (next to Building C) and activated. Not labelled in OpenStreetMap, so the centre was taken on site.
-- Later tuning after the on-site tests (WP13) is done with plain UPDATEs.
UPDATE checkpoints SET checkpoint_name = 'Sensoricum', latitude = 49.147620, longitude = 9.217807, radius = 40, is_active = 1 WHERE checkpoint_name = 'Containers';
