export type ResourceLink = {
  title: string;
  href: string;
  blurb: string;
};

export type ResourceStage = {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  tips: string[];
  links: ResourceLink[];
};

export type ResourceTool = {
  title: string;
  blurb: string;
  items: string[];
};

export const RESOURCE_STAGES: ResourceStage[] = [
  {
    id: "getting-started",
    kicker: "Stage 01 · First steps",
    title: "Getting started",
    summary:
      "A hackathon is a build sprint with a demo at the end—not a coding exam. Show up curious; leave with a story.",
    tips: [
      "Pick for fit, not prestige: virtual vs in-person, theme, team size, and whether you can finish the weekend without burning out.",
      "Before you register, check eligibility, deadline, Discord invite, and whether you can join solo or need a team.",
      "Done for a first timer means a working demo someone can understand in two minutes—not perfect code.",
      "Read the rules once. Note prize tracks, hardware limits, and what counts as a submission.",
    ],
    links: [
      {
        title: "Major League Hacking",
        href: "https://mlh.io/",
        blurb: "The student hackathon circuit—events, community, and how seasons work.",
      },
      {
        title: "Devpost — Discover hackathons",
        href: "https://devpost.com/hackathons",
        blurb: "Browse live and upcoming events; many use Devpost for submissions.",
      },
      {
        title: "Hack Club Hackathons",
        href: "https://hackathons.hackclub.com/",
        blurb: "A beginner-friendly calendar of high school and community hackathons worldwide.",
      },
    ],
  },
  {
    id: "finding-people",
    kicker: "Stage 02 · Crew",
    title: "Finding your people",
    summary:
      "Solo is fine. A balanced team is often better. The goal is people who finish together—not a stacked résumé.",
    tips: [
      "Open with a 30-second pitch: what you build, what you need, and what energy you bring.",
      "Hunt teammates in the event Discord, campus clubs, and mixers—not only LinkedIn cold DMs.",
      "Aim for complementary roles: builder, designer, storyteller, and someone who knows the domain.",
      "Joining an existing team? Ask what is missing, ship a small contribution early, and own a clear slice.",
    ],
    links: [
      {
        title: "MLH Discord",
        href: "https://discord.gg/mlh",
        blurb: "Meet organizers, mentors, and other hackers across the circuit.",
      },
      {
        title: "Devpost community",
        href: "https://devpost.com/",
        blurb: "Profiles, past projects, and team pages from thousands of events.",
      },
      {
        title: "Hack Club",
        href: "https://hackclub.com/",
        blurb: "Teen hacker community with events, grants, and a welcoming Slack.",
      },
    ],
  },
  {
    id: "first-weekend",
    kicker: "Stage 03 · The sprint",
    title: "Your first weekend",
    summary:
      "Treat the clock as a design constraint. Ideate fast, cut scope early, and protect time for the pitch.",
    tips: [
      "Prep the night before: accounts, repo, stack, chargers, and a sleep plan you will actually follow.",
      "Mental model: ideate → MVP → polish → pitch. If polish eats the demo, cut features—not the story.",
      "Demo structure: problem → solution → live proof → ask. Rehearse once out loud.",
      "Ask mentors early when stuck. Judges reward impact, originality, execution, and clarity—not all-nighter lore.",
    ],
    links: [
      {
        title: "How to give a great demo",
        href: "https://medium.com/hackathons-anonymous/how-to-give-a-great-hackathon-demo-c92fd1eabe4e",
        blurb: "A classic walkthrough of pacing, live demos, and what judges remember.",
      },
      {
        title: "MLH Hackathon Organizer Guide",
        href: "https://guide.mlh.io/",
        blurb: "Useful even as a participant—see how weekends are structured from the inside.",
      },
      {
        title: "Pitch deck basics",
        href: "https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck",
        blurb: "YC’s pitch structure maps cleanly onto a 2–3 minute hackathon demo.",
      },
    ],
  },
  {
    id: "leveling-up",
    kicker: "Stage 04 · Season play",
    title: "Leveling up",
    summary:
      "After a few events, stop treating every weekend the same. Choose on purpose and reuse what works.",
    tips: [
      "Pick events for sponsors, stack, prize tracks, and people—not only total prize pool.",
      "Build a personal kit: boilerplate, design tokens, pitch template, and a README you can fork.",
      "Chase a sponsor challenge only if it still serves a product you believe in.",
      "Ship the repo publicly within 48 hours. Follow up with mentors and teammates while the weekend is warm.",
    ],
    links: [
      {
        title: "MLH Event Calendar",
        href: "https://mlh.io/events",
        blurb: "Plan a season instead of scrambling week to week.",
      },
      {
        title: "Open Source Guides",
        href: "https://opensource.guide/",
        blurb: "Turn a hack into a real project—docs, contributors, and maintainership.",
      },
      {
        title: "Devpost winners archive",
        href: "https://devpost.com/software",
        blurb: "Study winning projects in your stack and see what demos actually look like.",
      },
    ],
  },
  {
    id: "advanced",
    kicker: "Stage 05 · Power user",
    title: "Advanced play",
    summary:
      "The next level is not more caffeine. It is better selection, sharper demos, and giving back.",
    tips: [
      "Novelty without a user is a trap. Winning patterns usually solve a sharp problem with a crisp demo.",
      "Plan recovery between events. Skipping a weekend is a skill—burnout kills seasons.",
      "Mentor, judge, or organize once you know the rhythm. Teaching forces clearer instincts.",
      "Build in public and recruit for future weekends before the Discord goes quiet.",
    ],
    links: [
      {
        title: "MLH Coach & Mentor",
        href: "https://mlh.io/coaches",
        blurb: "Paths into mentoring and coaching once you have a few weekends behind you.",
      },
      {
        title: "Hackathon Organizer Guide",
        href: "https://guide.mlh.io/",
        blurb: "If you are ready to run one—or help someone who is.",
      },
      {
        title: "Judging plan (MLH)",
        href: "https://guide.mlh.com/general-information/judging-and-submissions/judging-plan",
        blurb: "See how organizers brief judges so you can design for the score sheet.",
      },
    ],
  },
];

export const RESOURCE_TOOLS: ResourceTool[] = [
  {
    title: "Pitch outline",
    blurb: "Two minutes, four beats.",
    items: [
      "Hook: who hurts and why now",
      "Solution: what you built in one sentence",
      "Proof: live demo or tight recording",
      "Ask: prize track, users, or next step",
    ],
  },
  {
    title: "README template",
    blurb: "What judges and teammates open first.",
    items: [
      "Problem + one-line solution",
      "Demo GIF or screenshots",
      "Stack + how to run locally",
      "What you would ship next",
    ],
  },
  {
    title: "Demo checklist",
    blurb: "Before you walk on stage.",
    items: [
      "Cold start works offline or on hotspot",
      "Backup screen recording ready",
      "One person owns the click-path",
      "Timer practiced under the real limit",
    ],
  },
];
