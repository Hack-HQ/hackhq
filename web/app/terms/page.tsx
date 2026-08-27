import { PageShell } from "@/components/hq/page-shell";
import {
  ContactLink,
  LegalCallout,
  LegalHero,
  LegalLabel,
  LegalList,
  LegalSection,
} from "@/components/hq/legal";

export const metadata = {
  title: "Terms of Use · HackHQ",
  description:
    "The terms for using HackHQ - what the directory is (and is not), accounts, submissions, open-source licensing, and the disclaimers that keep it honest.",
};

export default function TermsPage() {
  return (
    <PageShell>
      <LegalHero
        kicker="Legal · Terms of use"
        title={
          <>
            The terms,
            <br />
            kept readable
          </>
        }
        intro={
          <>
            These terms govern your use of HackHQ. By using the site you agree
            to them; if you do not agree, the fix is simply not to use the
            site. We have kept them short and honest - the one thing you must
            take away is in section two.
          </>
        }
        effectiveDate="August 14, 2026"
      />

      <LegalSection index={1} kicker="The service" title="What HackHQ is">
        <p>
          HackHQ is a community-maintained directory of hackathons: a 3D
          globe, a browsable deck of listings, and an application tracker. The
          listing data is gathered from public sources and community
          submissions, is openly published, and is updated continuously by
          people and automation.
        </p>
        <p>
          HackHQ is not a hackathon organizer. We do not run, sponsor, or
          endorse the events listed, and listing an event is not a partnership
          with it. Registering for a hackathon happens on the
          organizer&rsquo;s own site, under the organizer&rsquo;s own terms.
        </p>
        <LegalCallout>
          Listings can be wrong or stale. Dates shift, deadlines close early,
          venues change, events get cancelled. Accuracy is NOT guaranteed -
          always verify deadlines, eligibility, and details with the organizer
          before you plan around them.
        </LegalCallout>
      </LegalSection>

      <LegalSection index={2} kicker="Accounts" title="Your account">
        <LegalList
          items={[
            "Accounts are optional and handled by Clerk. Signing in unlocks the synced tracker; everything else works without one.",
            "Give accurate account information and keep your sign-in method secure. What happens under your account is your responsibility.",
            "We may suspend or remove accounts used to abuse the service - spam, scraping private endpoints, attacking other users, or breaking these terms.",
            "You can stop using HackHQ at any time, and you can ask us to delete your account and data (see the privacy policy).",
          ]}
        />
      </LegalSection>

      <LegalSection index={3} kicker="Conduct" title="Acceptable use">
        <p>
          The listing data is open on purpose - build with it. The service
          itself is shared infrastructure, so a few lines you must not cross:
        </p>
        <LegalList
          items={[
            "No breaking things: do not probe, overload, or disrupt the site, its APIs, or its infrastructure, or try to access data that is not yours.",
            "No abuse of the tracker or submission channels: no spam, no flooding, no automated junk submissions.",
            "No unlawful use, and no impersonating HackHQ, organizers, or other people.",
            "No misrepresenting HackHQ: do not present a fork or mirror as the official site.",
          ]}
        />
      </LegalSection>

      <LegalSection index={4} kicker="Contributions" title="Your submissions">
        <p>
          Listings, corrections, and gallery photos are submitted through
          GitHub issues on our public repository, which means submissions are
          public from the moment you make them, under your GitHub account.
        </p>
        <LegalLabel>Ownership and license</LegalLabel>
        <p>
          You keep ownership of what you submit. By submitting, you grant
          HackHQ a worldwide, non-exclusive, royalty-free license to host,
          display, reproduce, and distribute your submission as part of the
          site and its open-source repository. Accepted gallery photos are
          committed into the public repo and shown on the site with the credit
          you provide.
        </p>
        <LegalLabel>Your responsibility</LegalLabel>
        <LegalList
          items={[
            "Only submit content you have the rights to submit, and make sure identifiable people in a photo are okay with it being published.",
            "Submissions must be accurate to your knowledge and free of malicious content.",
            "We may edit, decline, or remove any submission - usually for accuracy, quality, or rights reasons.",
          ]}
        />
      </LegalSection>

      <LegalSection index={5} kicker="Ownership" title="Intellectual property">
        <LegalList
          items={[
            "The HackHQ source code is open source under the MIT license - use it, fork it, build on it.",
            "The HackHQ name, wordmark, and site content (copy, imagery, design) are reserved. Open-source code does not mean open-season branding: do not pass your project off as HackHQ.",
            "Hackathon names and logos in listings belong to their organizers and appear for identification only.",
          ]}
        />
      </LegalSection>

      <LegalSection
        index={6}
        kicker="Elsewhere"
        title="Third-party links and embeds"
      >
        <p>
          HackHQ links out constantly - to organizers&rsquo; registration
          pages, resources, and the GitHub repo - and embeds third-party
          services such as Mapbox tiles. Those sites
          and services are not ours: we do not control them, do not endorse
          them, and are not responsible for their content, terms, or privacy
          practices. Your use of them is governed by their own terms.
        </p>
      </LegalSection>

      <LegalSection
        index={7}
        kicker="Disclaimers"
        title="No warranty, limited liability"
      >
        <p>
          This is the section lawyers write in capitals. Ours is short, but it
          matters:
        </p>
        <p>
          HackHQ is provided AS IS and AS AVAILABLE, without warranties of any
          kind - express or implied - including accuracy, availability,
          fitness for a particular purpose, and non-infringement. A free,
          community-maintained directory cannot promise that every deadline is
          right or that the site never goes down, so it does not.
        </p>
        <p>
          To the maximum extent permitted by law, HackHQ and its contributors
          are NOT LIABLE for any indirect, incidental, consequential, or
          special damages, or for losses arising from your reliance on a
          listing - including a missed deadline, a cancelled event, or
          anything that happens at a hackathon. Where liability cannot be
          excluded, it is limited to the amount you paid us to use HackHQ,
          which is zero.
        </p>
      </LegalSection>

      <LegalSection index={8} kicker="Housekeeping" title="The rest of it">
        <LegalLabel>Termination</LegalLabel>
        <p>
          We may suspend or terminate access to the service (or any account)
          for breach of these terms or to protect the service and its users.
          Sections that by their nature should survive - licenses to public
          submissions, IP, disclaimers, and liability limits - survive
          termination.
        </p>
        <LegalLabel>Changes to these terms</LegalLabel>
        <p>
          We may update these terms as the product evolves. Changes appear on
          this page with a new effective date, and material changes will be
          called out on the site. Using HackHQ after a change means you accept
          the updated terms.
        </p>
        <LegalLabel>Contact</LegalLabel>
        <p>
          Questions about these terms: <ContactLink />.
        </p>
      </LegalSection>
    </PageShell>
  );
}
