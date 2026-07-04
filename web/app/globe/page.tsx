import { Globe } from "@/components/globe";

export default function GlobePage() {
  return (
    <div className="min-h-screen bg-black text-zinc-50">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">
          HackHQ Globe
        </h1>
        <Globe />
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-400">
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
            Open
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-orange-500" />
            Closing soon
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
            Opens soon
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-zinc-500" />
            Closed
          </span>
        </div>
      </main>
    </div>
  );
}
