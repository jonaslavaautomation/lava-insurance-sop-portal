/*
  Promote an existing user to admin.

  Use this after someone signs in for the first time (Google/SSO or email) -
  new accounts always start as 'va_student'. Run this once per person you
  want to give admin access to, then have them refresh the site (or sign
  out and back in) - the app re-reads their role on load.
*/

UPDATE profiles
SET role = 'admin'
WHERE email = 'jonas@lavaautomation.com';

-- Sanity check: confirms the update took effect (should show role = admin)
SELECT id, email, role, full_name FROM profiles WHERE email = 'jonas@lavaautomation.com';
