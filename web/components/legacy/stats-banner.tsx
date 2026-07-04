import Image from "next/image";

export default function StatsBanner({
  statsBannerSrc,
  compact = false,
}: {
  statsBannerSrc: string | null;
  compact?: boolean;
}) {
  const image = statsBannerSrc ? (
    <div
      className={`relative aspect-[760/150] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 ${compact ? "" : "mt-4"}`}
    >
      <Image
        src={statsBannerSrc}
        alt="Hackathon stats"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1200px"
        className="object-contain"
      />
    </div>
  ) : (
    <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${compact ? "" : "mt-4"}`}>
      Stats banner unavailable.
    </p>
  );

  if (compact) return image;

  return (
    <section className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Stats
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        A snapshot of the list, updated automatically.
      </p>
      {image}
    </section>
  );
}
