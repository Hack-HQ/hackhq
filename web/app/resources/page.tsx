import { PageShell } from "@/components/hq/page-shell";
import { Resources } from "@/components/hq/resources";

export const metadata = {
  title: "Resources · HackHQ",
  description:
    "A field guide for hackathons—getting started, finding teammates, surviving the weekend, and leveling up.",
};

export default function ResourcesPage() {
  return (
    <PageShell>
      <Resources />
    </PageShell>
  );
}
