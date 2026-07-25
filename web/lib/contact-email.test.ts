import { describe, expect, it } from "vitest";
import { buildContactMailto } from "./contact-email";

describe("buildContactMailto", () => {
  it("addresses HackHQ and prefills the subject and body", () => {
    const url = new URL(
      buildContactMailto({
        name: "Ada Lovelace",
        email: "ada@example.com",
        org: "Analytical Engine",
        message: "I have a challenge idea.",
      }),
    );

    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("hackheadquarters@gmail.com");
    expect(url.searchParams.get("subject")).toBe("HackHQ contact: Ada Lovelace");
    expect(url.searchParams.get("body")).toBe(
      [
        "From: Ada Lovelace",
        "Reply email: ada@example.com",
        "GitHub or organization: Analytical Engine",
        "",
        "I have a challenge idea.",
      ].join("\n"),
    );
  });

  it("omits an empty organization and trims values", () => {
    const url = new URL(
      buildContactMailto({
        name: " Ada ",
        email: " ada@example.com ",
        org: " ",
        message: " Hello ",
      }),
    );

    expect(url.searchParams.get("subject")).toBe("HackHQ contact: Ada");
    expect(url.searchParams.get("body")).toBe(
      ["From: Ada", "Reply email: ada@example.com", "", "Hello"].join("\n"),
    );
  });
});
