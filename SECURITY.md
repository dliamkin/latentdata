# Security

Report a vulnerability privately through the "Report a vulnerability" button on this
repository's Security tab. Don't open a public issue for it.

I read reports within a week and fix confirmed issues as fast as a one-person project allows.
There is no bug bounty.

Out of scope: the public site is static and holds no user data; the admin API rejects every
request without a valid credential, so a missing rate limit on `/health` is not a finding.
