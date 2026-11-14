-- BR56: the invented players of the demo seed (seed-demo.js, development only) are marked, so rankings, profiles,
-- statistics and the admin lists leave them out until an administrator shows them for testing. seed-demo.js sets the
-- mark on the players it creates, also on those of an earlier run.
ALTER TABLE students ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
