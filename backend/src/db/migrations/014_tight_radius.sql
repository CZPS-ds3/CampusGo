-- BR12 (2026-11-14): the checkpoints are only 34-127 m apart, so the pilot circles shrink to 35 m for buildings, 30 m
-- for the garden and 25 m for small spots (grace zone and accuracy credit shrink in the config). Every pilot circle that
-- is larger shrinks, also one that migration 011 or an admin made larger under the old lenient rule; a smaller radius
-- an admin set stays. Quests the admins made themselves are not touched.
UPDATE checkpoints SET radius = 35
  WHERE checkpoint_name IN ('Mensa', 'Library', 'Building B', 'Building C') AND radius > 35;
UPDATE checkpoints SET radius = 30 WHERE checkpoint_name = 'Campus Garden' AND radius > 30;
UPDATE checkpoints SET radius = 25
  WHERE checkpoint_name IN ('CAS Cafe', 'Care.box and Shop.box', 'Sensoricum') AND radius > 25;

