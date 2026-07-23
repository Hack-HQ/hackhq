import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "./url";

describe("safeHttpUrl", () => {
  it("allows https and http URLs", () => {
    expect(safeHttpUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
  });

  it("is case-insensitive on the scheme and trims whitespace", () => {
    expect(safeHttpUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com");
    expect(safeHttpUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("rejects javascript: and data: URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("JavaScript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeUndefined();
  });

  it("rejects relative, protocol-relative, and empty values", () => {
    expect(safeHttpUrl("/relative")).toBeUndefined();
    expect(safeHttpUrl("//evil.com")).toBeUndefined();
    expect(safeHttpUrl("")).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });

  it("passes the ingestion-neutralized form (https://javascript:...) through as safe", () => {
    // util.clean_url turns `javascript:alert(1)` into `https://javascript:alert(1)`
    // — no longer an executable scheme, so it's correctly allowed.
    expect(safeHttpUrl("https://javascript:alert(1)")).toBe(
      "https://javascript:alert(1)",
    );
  });
});
