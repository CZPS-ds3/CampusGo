-- One map style per student account (colours of the map and the pins, base light/dark/follow). NULL = default.
ALTER TABLE students ADD COLUMN map_style JSON NULL;
