import type { Opportunity, Status } from "@/lib/types";

const STATUS_META: Record<Status, { label: string; dot: string }> = {
  OPEN: { label: "Open", dot: "#10b981" },
  CLOSING_SOON: { label: "Closing soon", dot: "#f97316" },
  OPENS_SOON: { label: "Opens soon", dot: "#3b82f6" },
  CLOSED: { label: "Closed", dot: "#71717a" },
};

export function ProjectTile({
  opp,
  size,
  index,
}: {
  opp: Opportunity;
  size: "small" | "large";
  index: number;
}) {
  const meta = STATUS_META[opp.status];
  const href = opp.url || "/hackathons";
  const external = Boolean(opp.url);
  const monogram = (opp.organization || opp.title || "H").trim().charAt(0).toUpperCase();

  // Per-status editorial cover gradient over near-black.
  const cover = {
    backgroundColor: "#0c0b0b",
    backgroundImage: `radial-gradient(120% 120% at 82% 8%, ${meta.dot}26, transparent 55%), linear-gradient(150deg, rgba(255,255,255,0.05), rgba(0,0,0,0.25))`,
  };

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group flex flex-col gap-[var(--space-md)]"
    >
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-[var(--color-line-muted)] ${
          size === "large" ? "aspect-[16/10]" : "aspect-[4/5]"
        }`}
        style={cover}
      >
        <span className="absolute left-5 top-5 font-mono text-xs tabular-nums text-white/40">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span
          className="absolute inset-0 flex items-center justify-center font-semibold text-white/10 transition-colors duration-500 group-hover:text-white/20"
          style={{ fontSize: size === "large" ? "13rem" : "8rem", lineHeight: 1 }}
          aria-hidden
        >
          {monogram}
        </span>

        <span className="absolute bottom-5 left-5 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/70">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: meta.dot }}
            aria-hidden
          />
          {meta.label}
        </span>

        <span className="absolute bottom-5 right-5 text-lg text-white/30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white">
          ↗
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow">{opp.organization || "Hackathon"}</span>
        <h3 className="text-xl font-medium leading-tight tracking-tight text-white min-[1200px]:text-2xl">
          {opp.title}
        </h3>
        <span className="eyebrow text-white/35">
          {[opp.location, opp.deadlineRaw].filter(Boolean).join(" · ")}
        </span>
      </div>
    </a>
  );
}
