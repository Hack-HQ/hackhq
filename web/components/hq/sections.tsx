"use client";

import { useState } from "react";
import { buildRequestMailto, type RequestKind } from "@/lib/contact-email";
import type { Hackathon, SiteStats } from "@/lib/types-hq";
import { REPO_URL, submitIssueUrl, submitGalleryPhotoUrl } from "@/lib/types-hq";

/* ----- Stats strip (Magnetto metrics style) ----- */

export function StatsStrip({ stats }: { stats: SiteStats }) {
  const items = [
    { n: String(stats.total), suffix: "+", label: "Hackathons tracked" },
    { n: String(stats.open), suffix: "", label: "Open right now" },
    { n: stats.prizeDisplay.replace("+", ""), suffix: "+", label: "In prize pools" },
    { n: String(stats.cities), suffix: "", label: "Cities on the globe" },
  ];
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink-soft px-6 py-12 sm:px-12 sm:py-16">
        {/* One per row below sm. The display clamp floors at 3rem and never
            shrinks further, but a 2-up grid only gives each cell 116px at
            320px - and prizeDisplay renders up to 7 characters ("$12.3M" plus
            the "+" span), which cannot fit at 48px under any font. It bled past
            both edges of its cell, collided with the neighbouring number, and
            was silently cut off by .shell's overflow:hidden rather than
            scrolling. Stacking keeps the giant-number look instead of dropping
            the clamp floor to fit. sm and up are unchanged. */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <div
              key={it.label}
              className={`flex flex-col items-center text-center ${
                i > 0 ? "lg:border-l lg:border-white/10" : ""
              }`}
            >
              <div className="font-display text-[clamp(3rem,7vw,6rem)] font-semibold leading-none tracking-tight text-paper">
                {it.n}
                {it.suffix && (
                  <span className="text-paper/30">{it.suffix}</span>
                )}
              </div>
              <div className="kicker mt-3 text-paper/45">{it.label}</div>
            </div>
          ))}
        </div>
        <div className="kicker mt-10 border-t border-white/8 pt-6 text-center text-[9px] text-paper/30">
          Self-updating · fed by a GitHub Action + AI extraction pipeline ·
          community-driven
        </div>
      </div>
    </section>
  );
}

/* ----- Theme / host marquee ----- */

export function ThemeMarquee({ hackathons }: { hackathons: Hackathon[] }) {
  const themes = Array.from(new Set(hackathons.flatMap((h) => h.themes)));
  const hosts = Array.from(new Set(hackathons.map((h) => h.host))).slice(0, 10);
  const tiles = [...themes.map((t) => `#${t}`), ...hosts.map((h) => h.toUpperCase())];
  const doubled = [...tiles, ...tiles];

  return (
    <section className="overflow-hidden p-2 pt-0">
      <div className="marquee-mask py-6">
        <div className="marquee-track flex gap-3">
          {doubled.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="glass shrink-0 rounded-2xl px-7 py-4 font-mono text-[12px] tracking-[0.2em] text-paper/70"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Founding contributors carousel (Pillar 03 · The crew) -----
   A testimonial-style spotlight: one developer featured at a time (portrait +
   note + name), prev/next arrows, a progress rail, and a filmstrip of everyone
   else. The active person's filmstrip slot becomes an up-arrow pointing at the
   card. Names are the public repo crew; roles, notes and photos are
   PLACEHOLDERS - set a real `bio`, `role` and `image` per person as the copy
   and photos land. Add or remove entries freely; the whole carousel adapts to
   the array length. */
type Dev = {
  name: string;
  role: string;
  org: string;
  /** Short intro blurb. Optional: when absent the carousel shows FALLBACK_BIO
      so a profile without copy yet still reads consistently (#222). */
  bio?: string;
  image?: string;
};

// Shown in place of a personal blurb until one is written, so a member without
// copy never renders an empty quote or blocks the whole carousel. Deliberately
// on-brand and generic rather than name-specific, so it reads cleanly for anyone.
const FALLBACK_BIO =
  "Part of the founding crew building an open, community-fed map of hackathons.";

const DEVELOPERS: Dev[] = [
  {
    name: "Jose Cruz",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/jose.jpg",
    bio: "Computer Engineering student at Boston University, concentrating in AI and machine learning. Built HackHQ so finding a hackathon doesn't come down to knowing the right people."
  },
  {
    name: "Allyson Keightley",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/allyson.jpg",
    bio: "Software Engineering student at Western Governors University. Built HackHQ to alleviate the frustration of hackathons not being discoverable by the builders who need them most."
  },
  {
    name: "Cai Zheng",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/cai.jpg",
    bio: "Computer Science and Philosophy graduate from UMass Amherst. Contributed to HackHQ as builders who are obsessed with building should know opportunities available to them."
  },
  {
    name: "Vick Mahindru",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/vick-mahindru.jpg",
    // TODO(#222): real intro blurb pending from Vick. Falls back to FALLBACK_BIO.
  },
  {
    name: "Gnan Sruthi R",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/gnan-sruthi-r.jpg",
    bio: "Computer Science Engineering student at Sri Eshwar College of Engineering. On HackHQ's dev side, since a good hackathon map shouldn't depend on knowing the right people to hear about it."
  },
  {
    name: "Jack He",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/jack-he.jpg",
    bio: "Computer science student at Boston University, concentrating in AI, machine learning, and DevOps. Life doesn't spoon-feed you much, but finding hackathons shouldn't be one more thing you have to fight for; that's why we built HackHQ."
  },
  {
    name: "Henry (Hoan) Nguyen",
    role: "Founding contributor",
    org: "HackHQ",
    image: "/repo-assets/contributors/henry.jpg",
    bio: "I’m a Mathematics and Computer Science student at Kenyon College interested in backend, data, and AI systems. I’m helping build HackHQ because finding a great hackathon shouldn’t depend on already being connected to the right people."
  },
];

/* Cursor-mask reveal (ported from the Framer "Cursor Mask Reveal"): a grayscale
   base with the colour photo revealed inside a soft circle that tracks the
   pointer. The circle centre rides two CSS vars updated on pointer move; the
   colour layer fades in on hover. Touch devices fall through to full colour. */
function DevReveal({
  src,
  alt,
  radius,
}: {
  src: string;
  alt: string;
  radius: number;
}) {
  const mask = `radial-gradient(circle ${radius}px at var(--rx, 50%) var(--ry, 50%), #000 55%, transparent 100%)`;
  return (
    <div
      className="group relative h-full w-full"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          "--rx",
          `${((e.clientX - r.left) / r.width) * 100}%`,
        );
        e.currentTarget.style.setProperty(
          "--ry",
          `${((e.clientY - r.top) / r.height) * 100}%`,
        );
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="reveal-base absolute inset-0 h-full w-full object-cover"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      />
    </div>
  );
}

function DevAvatar({ dev, size }: { dev: Dev; size: "lg" | "sm" }) {
  const initials = dev.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  if (dev.image) {
    return (
      <DevReveal src={dev.image} alt={dev.name} radius={size === "lg" ? 130 : 74} />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-soft to-ink-deep">
      <span
        className={`font-display text-paper/15 ${
          size === "lg" ? "text-[clamp(2.5rem,7vw,4.5rem)]" : "text-lg"
        }`}
      >
        {initials}
      </span>
    </div>
  );
}

function DevArrow({ dir }: { dir: "left" | "right" | "up" }) {
  const rot =
    dir === "left" ? "rotate-180" : dir === "up" ? "-rotate-90" : "";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${rot}`}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Developers() {
  const [active, setActive] = useState(0);
  const total = DEVELOPERS.length;
  const go = (delta: number) => setActive((a) => (a + delta + total) % total);

  const dev = DEVELOPERS[active];
  if (!dev) return null;

  return (
    <section id="developers" className="p-2 pt-0">
      <div className="shell bg-ink px-3 py-3 sm:px-4 sm:py-4">
        {/* header */}
        <div className="px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-8">
          <div className="kicker text-coral">Open source · Founding crew</div>
          <h2 className="display mt-4 text-[clamp(2rem,5vw,3.4rem)] text-paper">
            The developers
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/55">
            The founding open-source contributors who made HackHQ - the people
            behind the product.
          </p>
        </div>

        {/* featured card */}
        <div className="rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/60 p-5 sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr_auto] lg:gap-10">
            <div
              key={`img-${active}`}
              className="fade-swap mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-[var(--card-radius)] lg:mx-0"
            >
              <DevAvatar dev={dev} size="lg" />
            </div>

            <div
              key={`txt-${active}`}
              className="fade-swap flex flex-col justify-between"
            >
              <div>
                <span
                  aria-hidden
                  className="block font-serif text-6xl leading-[0.6] text-paper/15"
                >
                  &ldquo;
                </span>
                <p className="mt-4 text-[clamp(1.05rem,1.9vw,1.5rem)] italic leading-relaxed text-paper/70">
                  {dev.bio?.trim() || FALLBACK_BIO}
                </p>
              </div>
              <div className="mt-10 flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-[clamp(1.5rem,3vw,2.1rem)] font-semibold leading-none text-paper">
                    {dev.name}
                  </h3>
                  <div className="mt-2 text-sm text-paper/45">{dev.role}</div>
                </div>
                <div className="shrink-0 text-sm text-paper/40">{dev.org}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 lg:border-l lg:border-white/8 lg:pl-8">
              <button
                type="button"
                aria-label="Previous developer"
                onClick={() => go(-1)}
                className="grid h-11 w-11 place-items-center rounded-full text-coral transition hover:bg-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/50"
              >
                <DevArrow dir="left" />
              </button>
              <button
                type="button"
                aria-label="Next developer"
                onClick={() => go(1)}
                className="grid h-11 w-11 place-items-center rounded-full text-coral transition hover:bg-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/50"
              >
                <DevArrow dir="right" />
              </button>
            </div>
          </div>
        </div>

        {/* progress rail */}
        <div className="mt-6 flex items-center gap-4 px-2">
          <span className="kicker text-paper/40">Contributors</span>
          <div className="flex items-center gap-2">
            {DEVELOPERS.map((d, i) => (
              <button
                key={d.name}
                type="button"
                aria-label={`Show ${d.name}`}
                aria-current={i === active}
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === active
                    ? "w-8 bg-coral"
                    : "w-1.5 bg-paper/20 hover:bg-paper/40"
                }`}
              />
            ))}
          </div>
        </div>

        {/* filmstrip - active person's slot points up at the card */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-7 sm:gap-3">
          {DEVELOPERS.map((d, i) =>
            i === active ? (
              <div
                key={d.name}
                aria-hidden
                className="grid aspect-[4/5] place-items-center rounded-xl bg-ink-soft/30 text-coral"
              >
                <DevArrow dir="up" />
              </div>
            ) : (
              <button
                key={d.name}
                type="button"
                aria-label={`Show ${d.name}`}
                onClick={() => setActive(i)}
                className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-white/8 transition hover:border-coral/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/50"
              >
                <DevAvatar dev={d} size="sm" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-left text-[11px] text-paper/85">
                  {d.name}
                </span>
              </button>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

/* ----- Share a gallery photo -----
   Same glass-card pattern as SubmitSection, parked between the infinite
   canvas and the crew so a visitor who just dragged the wall can contribute
   without scrolling to the hackathon form further down. Opens gallery_photo.yaml;
   the image itself has to be attached on GitHub (query params can't carry files). */

   type GalleryShareState = "idle" | "ready" | "opened" | "blocked";

   export function GallerySubmitSection() {
     const [hackathon, setHackathon] = useState("");
     const [credit, setCredit] = useState("");
     const [state, setState] = useState<GalleryShareState>("idle");
   
     const trimmed = hackathon.trim();
   
     return (
       <section
         id="share-photo"
         tabIndex={-1}
         style={{ scrollMarginTop: "var(--nav-pill-bottom, 4.875rem)" }}
         className="mt-10 p-2 focus:outline-none"
       >
         <div className="shell flex min-h-[60vh] items-center justify-center bg-ink px-5 py-14 sm:px-10">
           <div className="glass w-full max-w-2xl rounded-[2.5rem] p-8 sm:p-12">
             <div className="kicker text-center text-coral">
               The community · Share a moment
             </div>
             <h2 className="display mt-3 text-center text-[clamp(1.5rem,3.4vw,2.6rem)] text-paper">
               Add your photo
               <br />
               to the wall
             </h2>
             <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-paper/60">
               Went to a hackathon you found here? Drop the name, open the issue,
               and attach a JPG or PNG (max 5 MB). A maintainer approves it before
               it lands on the canvas.
             </p>
   
             <form
               className="mt-8 flex flex-col gap-4"
               onSubmit={(e) => {
                 e.preventDefault();
                 const url = submitGalleryPhotoUrl({
                   hackathon: trimmed,
                   credit: credit.trim() || undefined,
                 });
                 // Same as SubmitSection: open in a new tab from a user gesture.
                 const win = window.open(url, "_blank");
                 if (win) win.opener = null;
                 setState(win ? "opened" : "blocked");
               }}
             >
               <div className="flex flex-col gap-4 sm:flex-row">
                 <label className="flex-1">
                   <span className="kicker mb-2 block text-[9px] text-paper/50">
                     Hackathon name
                   </span>
                   <input
                     value={hackathon}
                     onChange={(e) => {
                       setHackathon(e.target.value);
                       setState(e.target.value.trim() ? "ready" : "idle");
                     }}
                     placeholder="HackMIT 2027"
                     maxLength={80}
                     required
                     className="w-full rounded-xl border border-white/15 bg-ink-deep/40 px-4 py-3.5 text-sm text-paper outline-none backdrop-blur transition placeholder:text-paper/30 focus:border-coral"
                   />
                 </label>
                 <label className="flex-1">
                   <span className="kicker mb-2 block text-[9px] text-paper/50">
                     Your name (optional)
                   </span>
                   <input
                     value={credit}
                     onChange={(e) => setCredit(e.target.value)}
                     placeholder="How should we credit you?"
                     maxLength={80}
                     className="w-full rounded-xl border border-white/15 bg-ink-deep/40 px-4 py-3.5 text-sm text-paper outline-none backdrop-blur transition placeholder:text-paper/30 focus:border-coral"
                   />
                 </label>
               </div>
               <button
                 type="submit"
                 className="mt-2 rounded-full bg-paper py-4 font-mono text-[12px] font-bold tracking-[0.2em] text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
               >
                 SHARE VIA GITHUB ↗
               </button>
             </form>
   
             <div className="kicker mt-6 text-center text-[9px] text-paper/35">
               {state === "opened" &&
                 "Issue opened — attach your JPG or PNG there (max 5 MB)."}
               {state === "blocked" &&
                 "Popup blocked. Allow popups for this site, then try again."}
               {state === "ready" &&
                 "Opens a prefilled photo issue — attach the image on GitHub."}
               {state === "idle" &&
                 "Same engine as hackathon submit — opens a prefilled GitHub issue"}
             </div>
           </div>
         </div>
       </section>
     );
   }

/* ----- Submit a hackathon (Contribute) ----- */

export function SubmitSection() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  return (
    <section
      id="submit"
      // Focus target for the nav pill's SUBMIT button, which scrolls here
      // itself and so has to move the focus starting point itself too. Not in
      // the tab order (-1) and no focus ring: this is a landing spot, not a
      // control, and a ring around the whole section would be new visual noise
      // the plain fragment link never produced.
      tabIndex={-1}
      // Spacing sits in the margin, not the padding: padding is inside the
      // border box the browser scrolls to, so the 5rem of it was silently
      // doubling as the anchor offset. 5rem cleared the pill's bottom edge by
      // about 2px (nav.tsx derives that edge), so inflating the pill's text
      // landed the shell *under* it. The gap above is unchanged (4.5rem margin
      // + 0.5rem padding); the offset is now explicit and measured.
      // The fallback only covers the render before nav.tsx publishes.
      style={{ scrollMarginTop: "var(--nav-pill-bottom, 4.875rem)" }}
      className="mt-18 p-2 focus:outline-none"
    >
      <div className="shell flex min-h-[70vh] items-center justify-center bg-ink px-5 py-16 sm:px-10">
        <div className="glass w-full max-w-2xl rounded-[2.5rem] p-8 sm:p-12">
          <div className="kicker text-center text-coral">
            Contribute
          </div>
          <h2 className="display mt-3 text-center text-[clamp(1.5rem,3.4vw,2.6rem)] text-paper">
            Add a hackathon
            <br />
            in 60 seconds
          </h2>
          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-paper/60">
            Drop a name and a link. The pipeline extracts the rest - dates,
            prizes, location - and the globe updates itself. You get credit on
            the contributor wall.
          </p>

          <form
            className="mt-8 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              window.open(submitIssueUrl(name, url), "_blank");
            }}
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              <label className="flex-1">
                <span className="kicker mb-2 block text-[9px] text-paper/50">
                  Hackathon name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="HackMIT 2027"
                  className="w-full rounded-xl border border-white/15 bg-ink-deep/40 px-4 py-3.5 text-sm text-paper outline-none backdrop-blur transition placeholder:text-paper/30 focus:border-coral"
                />
              </label>
              <label className="flex-1">
                <span className="kicker mb-2 block text-[9px] text-paper/50">
                  Website URL
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  type="url"
                  className="w-full rounded-xl border border-white/15 bg-ink-deep/40 px-4 py-3.5 text-sm text-paper outline-none backdrop-blur transition placeholder:text-paper/30 focus:border-coral"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-2 rounded-full bg-paper py-4 font-mono text-[12px] font-bold tracking-[0.2em] text-ink transition hover:bg-white"
            >
              SUBMIT VIA GITHUB ↗
            </button>
          </form>

          <div className="kicker mt-6 text-center text-[9px] text-paper/35">
            Same engine, new surface - opens a prefilled GitHub issue
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----- Footer / CTA -----
   "Let's build" contact panel: the HACKHQ wordmark stands in for the giant
   headline, a stacked pair of cards on the left (socials + what the product
   does), and a bug/idea request form on the right that opens a prefilled email -
   the same "new surface on the same engine" move as SubmitSection. */

export function Footer() {
  return (
    <footer className="p-2 pt-0">
      <div className="shell bg-ink px-3 pb-6 pt-3 sm:px-4 sm:pb-8 sm:pt-4">
        {/* Giant wordmark - stands in for the "Let's Talk." headline */}
        <div className="rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/40 px-5 pb-10 pt-6 sm:px-9 sm:pb-16 sm:pt-9">
          <div className="flex items-baseline justify-between">
            <span className="kicker text-coral">Let&rsquo;s build</span>
            <span className="kicker hidden text-paper/35 sm:inline">
              Est. 2026
            </span>
          </div>
          <div className="mt-8 flex select-none justify-center overflow-hidden sm:mt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hackhq-wordmark.svg"
              alt="HackHQ"
              className="w-full max-w-[1200px]"
            />
          </div>
        </div>

        {/* Contact grid: left stack of cards, right form */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex flex-col gap-3">
            <FollowCard />
            <OfferCard />
          </div>
          <ContactCard />
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 px-2 pt-4 font-mono text-[10px] tracking-[0.15em] text-paper/35 sm:flex-row">
          <span>©2026 HACKHQ · OPEN SOURCE</span>
          <span>FROM REPO → TO PRODUCT</span>
        </div>
      </div>
    </footer>
  );
}

/* Real channel: GitHub. X / Discord don't have live handles yet, so they fall
   back to the repo - swap the hrefs in once the accounts exist. */
const SOCIALS: { label: string; href: string; icon: React.ReactNode }[] = [
  {
    label: "GitHub",
    href: REPO_URL,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
        <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.6 18 4.9 18 4.9c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
      </svg>
    ),
  },
  {
    label: "X",
    href: REPO_URL,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M18.9 1.5h3.6l-7.9 9 9.3 12.3h-7.3l-5.7-7.5-6.5 7.5H.7l8.4-9.6L0 1.5h7.5l5.1 6.8 5.3-6.8Zm-1.3 18.6h2L6.5 3.6H4.4l13.2 16.5Z" />
      </svg>
    ),
  },
  {
    label: "Discord",
    href: REPO_URL,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.7.4 3 .9 4.3 1.7A16.5 16.5 0 0 0 3 4.9c1.2-.8 2.6-1.4 4.3-1.7L7.1 3a19.8 19.8 0 0 0-5 1.4C.8 8.6.1 12.7.4 16.8a19.9 19.9 0 0 0 6 3l.8-1.2c-.6-.2-1.2-.5-1.8-.9l.4-.3a14.2 14.2 0 0 0 12.1 0l.4.3c-.6.4-1.2.7-1.8.9l.8 1.2a19.9 19.9 0 0 0 6-3c.4-4.8-.6-8.9-3-12.4ZM8.5 14.3c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
      </svg>
    ),
  },
];

function FollowCard() {
  return (
    <div className="flex items-center justify-between gap-6 rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/70 px-7 py-7 sm:px-9">
      <div className="text-lg text-paper sm:text-xl">Follow us</div>
      <div className="flex items-center gap-2.5">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            aria-label={s.label}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/12 text-paper/65 transition hover:border-coral hover:text-coral focus-visible:border-coral focus-visible:outline-none"
          >
            {s.icon}
          </a>
        ))}
      </div>
    </div>
  );
}

const OFFERS = [
  "Live global hackathon map",
  "Deadlines, prizes & status, tracked",
  "Open data - one listings.json",
  "Community-fed, updated daily",
];

function OfferCard() {
  return (
    <div className="flex flex-1 flex-col rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/70 px-7 py-8 sm:px-9">
      <div className="text-lg text-paper sm:text-xl">What HackHQ does</div>
      <ul className="mt-5 flex flex-col gap-3 text-sm text-paper/60">
        {OFFERS.map((o) => (
          <li key={o} className="flex items-start gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-coral" />
            {o}
          </li>
        ))}
      </ul>
      <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/8 pt-7 sm:grid-cols-3">
        <FooterCol
          title="Explore"
          links={[
            ["The globe", "/globe"],
            ["The deck", "/deck"],
            ["Resources", "/resources"],
            ["My HackHQ", "/my"],
          ]}
        />
        <FooterCol
          title="Open source"
          links={[
            ["GitHub repo", REPO_URL],
            ["listings.json", `${REPO_URL}/blob/main/.github/scripts/listings.json`],
            ["Contribute", `${REPO_URL}/blob/main/CONTRIBUTING.md`],
            ["Star us ★", REPO_URL],
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            ["Privacy", "/privacy"],
            ["Terms of use", "/terms"],
            ["MIT license", `${REPO_URL}/blob/main/LICENSE`],
            // Reporting route, not a legal document, but this is the column a
            // reader scans for "how do I tell them something serious".
            ["Report a vulnerability", `${REPO_URL}/blob/main/SECURITY.md`],
          ]}
        />
      </div>
    </div>
  );
}

const FIELD =
  "w-full rounded-2xl border border-white/10 bg-ink-deep/50 px-5 py-4 text-sm text-paper outline-none transition placeholder:text-paper/35 focus:border-coral";

function ContactCard() {
  const [kind, setKind] = useState<RequestKind>("idea");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [hasInteracted, setHasInteracted] = useState(false);

  return (
    <div className="flex flex-col rounded-[var(--card-radius)] border border-white/8 bg-ink-soft/70 px-7 py-8 sm:px-9">
      <h2 className="text-xl leading-tight text-paper sm:text-2xl">
        Found a bug? Want something built?
      </h2>
      <p className="mt-2 text-sm text-paper/50">
        Tell us what broke, or what HackHQ should do next. Every request lands
        straight in our inbox.
      </p>

      <form
        className="mt-6 flex flex-1 flex-col gap-3"
        onInput={() => setHasInteracted(true)}
        onSubmit={(e) => {
          e.preventDefault();
          if (!hasInteracted || website) return;
          window.location.href = buildRequestMailto({ kind, name, message });
        }}
      >
        {/* Which kind of request - drives the subject line the Gmail filter
            sorts on, so it is a real field, not decoration. */}
        <div
          role="radiogroup"
          aria-label="Request type"
          className="flex gap-2"
        >
          {(
            [
              ["idea", "Feature idea"],
              ["bug", "Bug report"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => {
                setKind(value);
                setHasInteracted(true);
              }}
              className={`rounded-full border px-4 py-2 font-mono text-[10px] font-bold tracking-[0.15em] transition ${
                kind === value
                  ? "border-coral bg-coral text-ink"
                  : "border-white/15 text-paper/60 hover:border-white/30"
              }`}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            kind === "bug"
              ? "What broke, and where? A screenshot helps - attach it in the email before sending."
              : "What should HackHQ have that it doesn't yet?"
          }
          aria-label="Your request"
          required
          className={`${FIELD} min-h-[132px] flex-1 resize-none`}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (we credit shipped ideas)"
          aria-label="Your name"
          className={FIELD}
        />
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />

        <div className="mt-1 flex items-center justify-between gap-4 rounded-2xl border border-white/8 px-5 py-4">
          <p className="text-xs italic leading-snug text-paper/45">
            Sending opens your email app with the request prefilled - attach
            screenshots there before you hit send.
          </p>
          <button
            type="submit"
            aria-label="Send request"
            disabled={!hasInteracted}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-coral text-2xl text-ink transition hover:bg-coral-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            →
          </button>
        </div>
      </form>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <div className="kicker mb-4 text-paper/40">{title}</div>
      {/* No gap below sm: the anchors become 44px blocks that sit flush, so the
          whole column is live rather than 17px targets separated by 10px of
          dead space. sm restores the gap and the inline anchors. */}
      <ul className="flex flex-col sm:gap-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="block py-3 text-sm text-paper/75 transition hover:text-coral sm:inline sm:py-0"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
