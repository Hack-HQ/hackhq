import { loadHackathons } from "@/lib/listings";
import { PageShell } from "@/components/hq/page-shell";
import { Deck } from "@/components/hq/deck";

export const metadata = {
  title: "The Deck · HackHQ",
  description:
    "Flip through every hackathon as a bold, tactile card - or switch to the dense list when you're on a mission.",
};

export default function DeckPage() {
  const hackathons = loadHackathons();
  return (
    <PageShell>
      <Deck hackathons={hackathons} />
    </PageShell>
  );
}
