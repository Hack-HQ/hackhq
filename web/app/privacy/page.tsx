import { PageShell } from "@/components/hq/page-shell";
import {
  ContactLink,
  LegalCallout,
  LegalHero,
  LegalLabel,
  LegalList,
  LegalRows,
  LegalSection,
} from "@/components/hq/legal";

export const metadata = {
  title: "Privacy · HackHQ",
  description:
    "What HackHQ collects, when, and why - visitor vs signed-in, the third parties by name, and how to get your data deleted. Plain language, no surprises.",
};

/* Every claim on this page is backed by the code it describes - the audit
   trail lives in the PR that added it. If the code changes, this page must
   change with it. */

export default function PrivacyPage() {
  return (
    <PageShell>
      <LegalHero
        kicker="Legal · Privacy"
        title={
          <>
            Privacy,
            <br />
            in plain terms
          </>
        }
        intro={
          <>
            HackHQ is an open-source hackathon directory. We collect as little
            as the product allows, and this page tells you exactly what that
            is - what happens when you just browse, what changes when you sign
            in, and which third parties are involved. No dark patterns, no
            fine-print surprises.
          </>
        }
        effectiveDate="August 14, 2026"
      />

      <LegalSection index={1} kicker="Start here" title="The short version">
        <LegalList
          items={[
            "We never sell, rent, or trade your data. There are no ads and no advertising trackers.",
            "We set no analytics or advertising cookies. The only cookies come from Clerk, our sign-in provider, and exist purely to run sessions.",
            "Your application tracker lives in your own browser unless you sign in - then it syncs to your account.",
            "Product analytics is off by default. When enabled, it is cookieless and anonymous, and it respects Do Not Track and Global Privacy Control.",
            <>
              Want something deleted? Email <ContactLink /> and we will handle
              it.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection index={2} kicker="Visiting" title="Just browsing the site">
        <p>
          You can use the globe, the deck, the resources, and the tracker
          without an account. Here is everything that happens on a plain
          visit:
        </p>
        <LegalLabel>Hosting</LegalLabel>
        <p>
          Our hosting provider (currently Vercel) processes standard request
          metadata - your IP address, user agent, and the pages you request -
          in short-lived server logs used to serve and secure the site. We do
          not build profiles from these logs.
        </p>
        <LegalLabel>Fonts</LegalLabel>
        <p>
          Fonts are bundled with the site at build time and served from our own
          domain. Your browser makes no font requests to Google or any other
          font service.
        </p>
        <LegalLabel>The globe</LegalLabel>
        <p>
          The 3D globe renders map tiles from Mapbox. While it is on screen,
          your browser requests tiles directly from Mapbox servers, which see
          your IP address and user agent, as with any map on the web. The
          hackathon pins themselves are our own public listing data.
        </p>
        <LegalLabel>Error monitoring</LegalLabel>
        <p>
          We use Sentry to find out when the site breaks. If an error happens,
          the report includes the error message, a stack trace, the page URL,
          and basic browser and device metadata. We have Sentry&rsquo;s
          optional extras switched off: no performance tracing, no session
          replay, and no personally identifying enrichment of error reports.
        </p>
        <LegalLabel>Analytics, only when enabled</LegalLabel>
        <p>
          The site ships with optional PostHog analytics that is off unless a
          deployment explicitly enables it. When it is enabled, it is
          cookieless and anonymous by construction: nothing is stored on your
          device (memory-only, so nothing survives a reload), no user profiles
          are ever created, and it records exactly three things - page views,
          clicks on a listing&rsquo;s register link, and clicks on a globe
          pin. If your browser sends Do Not Track or Global Privacy Control,
          the analytics script is never even downloaded.
        </p>
      </LegalSection>

      <LegalSection
        index={3}
        kicker="Accounts"
        title="Signing in and the tracker"
      >
        <LegalLabel>Without an account</LegalLabel>
        <p>
          The tracker works entirely in your browser. Your pipeline and wins
          are saved in localStorage on your own device (under the keys
          hackhq-tracker-v1, hackhq-wins-v1, and hackhq-tracker-imported-v1)
          and never leave it. Clearing your browser&rsquo;s site data removes
          them.
        </p>
        <LegalLabel>With an account</LegalLabel>
        <p>
          Sign-in is optional and handled by Clerk, a dedicated authentication
          provider. Clerk manages your account details - such as your email
          address, name, and sign-in method - and uses cookies to keep your
          session alive. That means the site is not cookie-free once sign-in
          is in play; those cookies are strictly functional.
        </p>
        <p>
          When you are signed in, your tracker syncs to your account so it
          follows you across devices. What we store per saved hackathon is
          deliberately minimal: your account ID, the hackathon&rsquo;s ID, the
          stage you put it in, and whether you marked it a win. That is the
          whole row. It lives in our Supabase database, is only ever queried
          by your own account, and on first sign-in your browser-local tracker
          is offered to your account once so nothing you saved gets lost.
        </p>
      </LegalSection>

      <LegalSection index={4} kicker="Music" title="The record player">
        <p>
          Hack Radio plays only music you load yourself. On large screens the
          home page loads Spotify&rsquo;s embed script to power the disc, which
          means your browser talks to open.spotify.com. The actual player is
          created only when you paste a Spotify link - from that point the
          embed runs under Spotify&rsquo;s own privacy policy and may set its
          own cookies, and signing in to Spotify there is between you and
          Spotify.
        </p>
        <p>
          The disc&rsquo;s spinning animation comes from a vendored Framer
          component, which fetches one silenced demo audio file from
          Framer&rsquo;s CDN. It is never audible and nothing about you is
          sent beyond the request itself.
        </p>
      </LegalSection>

      <LegalSection
        index={5}
        kicker="Third parties"
        title="Everyone involved, by name"
      >
        <p>
          These are all the third parties that can receive any data when you
          use HackHQ, and when each one is in play:
        </p>
        <LegalRows
          rows={[
            {
              name: "Vercel",
              when: "Every visit",
              role: "Hosts the site. Sees standard request logs (IP address, user agent).",
            },
            {
              name: "Sentry",
              when: "When an error occurs",
              role: "Receives error reports: message, stack trace, page URL, browser and device metadata. No session replay, no tracing.",
            },
            {
              name: "Mapbox",
              when: "While the globe is on screen",
              role: "Serves the map tiles behind the 3D globe. Sees the tile requests your browser makes.",
            },
            {
              name: "Clerk",
              when: "Sign-in and signed-in sessions",
              role: "Manages accounts and session cookies. Holds your email, name, and sign-in method.",
            },
            {
              name: "Supabase",
              when: "Signed in, tracker in use",
              role: "Stores your tracker rows (account ID, hackathon ID, stage, win flag) and a mirror of the public listings.",
            },
            {
              name: "PostHog",
              when: "Only if analytics is enabled",
              role: "Receives anonymous, cookieless events: page views and two product clicks. Honors DNT and Global Privacy Control.",
            },
            {
              name: "Spotify",
              when: "Home page / when you load music",
              role: "Provides the embed behind Hack Radio. Sets its own cookies once you load a link; governed by Spotify's policies.",
            },
            {
              name: "GitHub",
              when: "When you submit or contribute",
              role: "Hosts the open-source repo. Listing submissions and gallery photos are public GitHub issues under your GitHub account.",
            },
          ]}
        />
      </LegalSection>

      <LegalSection
        index={6}
        kicker="Your data"
        title="Control and deletion"
      >
        <LegalList
          items={[
            "Browser-local tracker: clear this site's data in your browser and it is gone. It was never on our servers.",
            <>
              Account and synced tracker: email <ContactLink /> from the
              address on your account and we will delete your account records
              and every tracker row tied to it. You can also manage your
              account details directly from the account menu, powered by
              Clerk.
            </>,
            "Analytics: nothing to delete - when enabled it is anonymous and stores nothing on your device. Turning on Do Not Track or Global Privacy Control keeps it fully off for you.",
            "Public contributions: listings and gallery photos submitted through GitHub live in the public repo. Ask us (or open an issue) and we will remove a photo or credit you submitted.",
          ]}
        />
        <LegalCallout>
          We do not sell, rent, or share your personal data for advertising.
          Not now, not as a &ldquo;business improvement,&rdquo; not ever.
        </LegalCallout>
      </LegalSection>

      <LegalSection index={7} kicker="The fine print" title="The rest of it">
        <LegalLabel>Children</LegalLabel>
        <p>
          HackHQ is a general-audience site aimed at hackathon builders and is
          not directed at children under 13. We do not knowingly collect
          personal information from children under 13; if you believe a child
          has created an account, email us and we will delete it.
        </p>
        <LegalLabel>Changes to this policy</LegalLabel>
        <p>
          When our data practices change, this page changes with them and the
          effective date at the top is updated. Material changes will be
          called out on the site rather than buried here.
        </p>
        <LegalLabel>Contact</LegalLabel>
        <p>
          Questions, deletion requests, or anything unclear: <ContactLink />.
          A human reads it.
        </p>
      </LegalSection>
    </PageShell>
  );
}
