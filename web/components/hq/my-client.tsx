"use client";

import { SignIn, UserButton, useAuth, useUser } from "@clerk/nextjs";
import type { Hackathon } from "@/lib/types-hq";
import { PageShell } from "./page-shell";
import { Tracker } from "./tracker";

export function MyClient({
  hackathons,
  authEnabled,
}: {
  hackathons: Hackathon[];
  authEnabled: boolean;
}) {
  return (
    <PageShell>
      {authEnabled ? (
        <GatedHub hackathons={hackathons} />
      ) : (
        <>
          <AuthSetupNotice />
          <Tracker hackathons={hackathons} />
        </>
      )}
    </PageShell>
  );
}

/* Auth-aware wrapper - only rendered when ClerkProvider exists */
function GatedHub({ hackathons }: { hackathons: Hackathon[] }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <section className="p-2 pt-0">
        <div className="shell min-h-[78vh] animate-pulse bg-ink" />
      </section>
    );
  }

  if (!isSignedIn) return <SignInGate />;

  return (
    <>
      <HubGreeting />
      <Tracker hackathons={hackathons} />
    </>
  );
}

/* ----- Signed-out: the members gate ----- */

function SignInGate() {
  return (
    <section className="p-2 pt-0">
      <div className="shell flex min-h-[78vh] flex-col items-center justify-center gap-10 bg-ink px-5 py-16 sm:px-10">
        <div className="text-center">
          <div className="kicker text-coral">Members · Pillar 03</div>
          <h1 className="display mt-4 text-[clamp(1.6rem,4vw,2.8rem)] text-paper">
            My HackHQ
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-paper/60">
            Your hackathon pipeline lives here. Sign in with Google or GitHub
            to open your hub.
          </p>
        </div>

        <SignIn
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: "#ed5b29",
              colorBackground: "#1b1917",
              colorForeground: "#f5ede6",
              colorMutedForeground: "#9ba1a5",
              colorInput: "#100f0f",
              colorInputForeground: "#f5ede6",
              borderRadius: "1.25rem",
            },
          }}
        />
      </div>
    </section>
  );
}

/* ----- Signed-in: hub header ----- */

function HubGreeting() {
  const { user } = useUser();
  return (
    <section className="p-2 pt-0">
      <div className="shell flex items-center justify-between bg-ink-soft px-6 py-6 sm:px-10">
        <div>
          <div className="kicker text-coral">Members · Hub</div>
          <div className="display mt-2 text-[clamp(1.1rem,2.4vw,1.7rem)] text-paper">
            Welcome{user?.firstName ? `, ${user.firstName}` : ""}
          </div>
        </div>
        <UserButton />
      </div>
    </section>
  );
}

/* ----- Pre-setup: shown until Clerk keys exist in .env.local ----- */

function AuthSetupNotice() {
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink-soft px-6 py-8 sm:px-10">
        <div className="kicker text-coral">Sign-in not configured yet</div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/60">
          The hub is running in open mode. To turn on Google + GitHub sign-in:
          create a free app at{" "}
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noreferrer"
            className="text-coral underline underline-offset-4"
          >
            dashboard.clerk.com
          </a>
          , enable Google and GitHub under &ldquo;SSO connections&rdquo;, then
          paste the two keys into{" "}
          <code className="font-mono text-paper/80">.env.local</code> and
          restart the dev server.
        </p>
      </div>
    </section>
  );
}
