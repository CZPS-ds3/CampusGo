// BR56: the invented players of the demo seed (students.is_demo) are left out of rankings, profiles, statistics and
// the admin lists until an administrator shows them for testing (app setting show_demo_players, off by default).

/**
 * SQL condition that keeps only real players of the students table `alias`, or every player while demo players are
 * shown. `alias` is always a fixed name from the code, never user input.
 */
export const realPlayers = (showDemo, alias = 's') =>
  showDemo ? 'TRUE' : `${alias}.is_demo = FALSE`;
