import { Reveal } from "./reveal";

/**
 * Dark card: giant pixel HOSTS title, intro copy, then an infinite marquee
 * of host-organization tiles (the template's Clients logo wall).
 */
export function HostsCard({ orgs }: { orgs: string[] }) {
  if (orgs.length === 0) return null;
  // Duplicate the row so the -50% marquee loop is seamless.
  const loop = [...orgs, ...orgs];

  return (
    <section className="stack-section">
      <div className="hq-card flex flex-col items-center justify-center gap-8 bg-hq-dark">
        <Reveal>
          <h2 className="px-display text-center text-[clamp(64px,12vw,180px)] uppercase text-white">
            Hosts
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <p className="body-copy w-[min(88vw,420px)] text-center">
            From university clubs to the world&apos;s biggest tech companies —
            the organizations running the hackathons we track.
          </p>
        </Reveal>

        <div className="mt-6 w-full overflow-hidden">
          <div className="marquee-track gap-4 pr-4">
            {loop.map((org, i) => (
              <div
                key={`${org}-${i}`}
                className="flex h-[34svh] w-[clamp(240px,26vw,380px)] shrink-0 items-center justify-center rounded-[36px] px-8"
                style={{
                  background:
                    "linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))",
                }}
              >
                <span className="px-display text-center text-[clamp(22px,2.2vw,34px)] leading-tight text-white/55">
                  {org}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
