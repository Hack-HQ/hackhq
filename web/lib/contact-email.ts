const CONTACT_EMAIL = "hackheadquarters@gmail.com";

/** Stable, filterable prefix: a Gmail filter on subject:"[HackHQ request]"
    routes every submission into the HackHQ_Website_Requests label without
    ever catching ordinary correspondence. */
export const REQUEST_SUBJECT_PREFIX = "[HackHQ request]";

export type RequestKind = "bug" | "idea";

type WebsiteRequest = {
  kind: RequestKind;
  name: string;
  message: string;
};

const KIND_LABEL: Record<RequestKind, string> = {
  bug: "Bug report",
  idea: "Feature idea",
};

/** First line of the message, clipped, so the inbox row reads as the request
    itself rather than a generic subject. */
function summarize(message: string, name: string): string {
  const firstLine = message.trim().split("\n")[0]?.trim() ?? "";
  if (!firstLine) return `from ${name.trim() || "the website"}`;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

export function buildRequestMailto({ kind, name, message }: WebsiteRequest): string {
  const subject = `${REQUEST_SUBJECT_PREFIX} ${KIND_LABEL[kind]}: ${summarize(message, name)}`;
  const body = [
    `Type: ${KIND_LABEL[kind]}`,
    `From: ${name.trim() || "(no name given)"}`,
    "",
    message.trim(),
  ].join("\n");

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
