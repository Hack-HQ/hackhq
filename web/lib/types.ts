export type Status = "OPEN" | "CLOSING_SOON" | "OPENS_SOON" | "CLOSED";

export type Section = "HACKATHONS";

export type Opportunity = {
  id: string;
  section: Section;
  sectionLabel: string;
  status: Status;
  organization: string;
  title: string;
  type: string;
  location: string;
  url: string;
  deadlineRaw: string;
  deadlineISO: string | null;
  daysUntilDeadline: number | null;
};

export type GalleryPhoto = {
  src: string;
  alt: string;
};

export const SECTION_LABELS: Record<Section, string> = {
  HACKATHONS: "Hackathons",
};

export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  CLOSING_SOON: "Closing Soon",
  OPENS_SOON: "Opens Soon",
  CLOSED: "Closed",
};
