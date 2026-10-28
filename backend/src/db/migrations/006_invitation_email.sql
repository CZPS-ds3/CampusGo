-- An invitation remembers the address the inviter typed, so that the team can see who was invited.
ALTER TABLE team_invitations ADD COLUMN invited_email VARCHAR(254) NULL;
