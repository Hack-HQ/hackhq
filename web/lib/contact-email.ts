const CONTACT_EMAIL = "hackheadquarters@gmail.com";

type ContactMessage = {
  name: string;
  email: string;
  org: string;
  message: string;
};

export function buildContactMailto({
  name,
  email,
  org,
  message,
}: ContactMessage): string {
  const subject = `HackHQ website inquiry from ${name.trim()}`;
  const body = [
    `From: ${name.trim()}`,
    `Reply email: ${email.trim()}`,
    org.trim() ? `GitHub or organization: ${org.trim()}` : null,
    "",
    message.trim(),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
