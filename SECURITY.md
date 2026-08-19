# Security Policy

HackHQ is a community-run, open-source hackathon directory. It holds very little
about people — a signed-in user's tracker rows are an account id, a hackathon id,
a stage, a win flag and two timestamps — but it does hold accounts, and it does
publish community submissions. We would rather hear about a problem early and
awkwardly than late and publicly.

## Supported versions

There is one deployed version: whatever `main` currently is. HackHQ is a
continuously deployed site, not a released library, so there are no maintenance
branches and no back-porting.

| Version | Supported |
| --- | --- |
| `main` (the live site) | Yes |
| Any earlier commit, tag or fork | No |

If you are running a fork, the fix will be in `main` — rebase onto it.

## Reporting a vulnerability

**Do not open a public issue.** A public report is a public exploit window, and
this repository's issue templates are designed for hackathon listings rather than
for security reports.

Use whichever is easier:

1. **GitHub Private Vulnerability Reporting** — preferred.
   [Open a private report](https://github.com/Hack-HQ/hackhq/security/advisories/new).
   It is private to maintainers, it threads, and it produces an advisory we can
   publish once the fix is out.
2. **Email** — <hackheadquarters@gmail.com>, subject line starting
   `[SECURITY]`. This is the same monitored address as the site's contact form.
   Say "security" in the first line so it is not triaged as a listing request.

Helpful to include, in rough order of usefulness: what an attacker can do, the
steps to reproduce, the affected URL or file, and whether you have told anyone
else. A rough report you are unsure about is still worth sending.

Please **do not** put proof-of-concept code, request captures, session
identifiers or credentials in a public place — a pull request, a fork's branch, a
gist or a public issue. Attach them to the private report instead.

## What to expect from us

These are commitments we can actually meet with a small volunteer team, so they
are deliberately modest. If a deadline is going to slip, we will tell you rather
than go quiet.

| Stage | Target |
| --- | --- |
| We acknowledge your report | Within **3 business days** |
| We tell you whether we can reproduce it, and our severity assessment | Within **10 business days** |
| We agree a disclosure timeline with you | Once severity is assessed |
| Critical issues (account takeover, data exposure across accounts, secret disclosure) | Mitigated as fast as we can, usually configuration first and code after |

We will credit you in the advisory unless you would rather stay anonymous. We
have no bug bounty and cannot pay for reports.

Some of what runs HackHQ is not ours to fix: authentication is handled by Clerk,
the database by Supabase, hosting by Vercel. If your finding is in one of those
platforms rather than in this code, we will say so and help route it to that
vendor's security team, and we will not disclose it on their behalf.

## Safe harbour

We will not pursue or support legal action against you, and will treat your
research as authorised, if you act in good faith and:

- **Stay within your own data.** Use accounts you control. If you stumble into
  someone else's data, stop, do not save it, and tell us what you saw.
- **Do not degrade the service.** No denial of service, no load testing, no
  spamming the submission or sign-in flows, no automated scanning that a
  reasonable person would call an attack.
- **Do not use social engineering, phishing, or physical access** against
  maintainers, contributors, or our vendors.
- **Do not modify or delete data that is not yours**, and do not use a finding to
  gain more access than the finding itself demonstrates.
- **Give us a reasonable chance to fix it** before telling anyone else.
- **Respect the platforms.** Testing against Clerk, Supabase or Vercel
  infrastructure is governed by their policies, not ours, and we cannot grant you
  permission for it.

Working within these limits, we consider your testing authorised under the
computer-misuse laws that would otherwise apply, and we will say so publicly if
anyone suggests otherwise. Act outside them — particularly against other users'
accounts — and this does not apply.

## Things that are public on purpose

Please do not report these; they are documented decisions, not oversights. See
[`docs/threat-model.md`](docs/threat-model.md) for the reasoning.

- **Listing data is fully public**, including `source`, the GitHub username of
  whoever submitted a listing. It is already in `.github/scripts/listings.json`
  and the README.
- **Gallery photo credits are public**, including the name and profile link a
  contributor chooses to be credited under. The submission form offers a
  no-attribution option.
- **Submissions are public from the moment they are made** — they are GitHub
  issues under the submitter's own account.
- **Sentry DSNs and the Mapbox and Clerk publishable keys ship in the client
  bundle.** They are designed to be public. A Supabase *service role* key or a
  Clerk *secret* key in the bundle would be a real finding; those are server-only
  and never prefixed `NEXT_PUBLIC_`.

## Scope

In scope: this repository, and the site it deploys.

Out of scope: findings that require a compromised maintainer machine or a leaked
credential to begin with (report the leak instead — that we very much want to
know about), the security posture of a hackathon organiser's own site that we
merely link to, and vendor platform issues as described above.
