import type { Metadata } from "next";
import { Suspense } from "react";
import { Syncopate, Inter, Space_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured, validateEnv } from "@/lib/env";
import { Analytics } from "@/components/analytics";
import "./globals.css";

// Validate/log environment configuration once when the server boots.
validateEnv();

// HackHQ type system (per product design brief §08):
// - Syncopate: wide, blocky display face matching the HACKHQ wordmark -
//   headlines, big numbers
// - Inter: the workhorse for all UI text
// - Space Mono: kickers, metadata, countdowns - "built by devs" energy
const syncopate = Syncopate({
  variable: "--font-syncopate",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const smono = Space_Mono({
  variable: "--font-smono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hacking-hq.com";

const TITLE = "HackHQ · A Living Map of the Hackathon World";
const DESCRIPTION =
  "Spin the globe, flip through the deck, track your applications. Every hackathon worth joining - in-person and virtual - on one living 3D map. Updated daily, open source.";

export const metadata: Metadata = {
  // Required for og:image to resolve. Next emits image URLs relative to this;
  // without it the tags carry a relative path, which every unfurler rejects, so
  // a shared link renders with no preview at all.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // HackHQ spreads through Discord servers and group chats, so the unfurl is
  // effectively the landing page. Without these the site had zero og:* and
  // zero twitter:* tags and shared as a bare URL.
  //
  // The image lives in public/ and is referenced explicitly, rather than using
  // the app/opengraph-image.* file convention. That convention makes Next build
  // a route handler with the image bundled *into the server handler* - the
  // 535 KiB PNG pair pushed the Worker past Cloudflare's 3 MiB script cap and
  // failed the deploy outright. As a static asset it is served by the ASSETS
  // binding and costs the bundle nothing, which matters with ~190 KiB of
  // headroom. metadataBase above makes the relative URL absolute.
  //
  // No twitter:image on purpose: X, Slack and Discord all fall back to og:image
  // when it is absent, so a second copy would buy nothing.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "HackHQ",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "HackHQ - a living map of the hackathon world",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const page = (
    <html
      lang="en"
      className={`${syncopate.variable} ${inter.variable} ${smono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        {children}
        {/* Suspense because usePathname inside can suspend on dynamic routes. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );

  // Mount <ClerkProvider> only when Clerk is FULLY configured (both keys),
  // matching isClerkConfigured() used by middleware.ts and the /my + /auth gates.
  // A partial config (one key) previously mounted the provider here while the
  // proxy and pages treated auth as off — an inconsistent, fail-open state.
  // Now all surfaces agree: a half-configured deploy runs consistently in open
  // mode (and /auth redirects to /my rather than rendering a dead form).
  return isClerkConfigured() ? <ClerkProvider>{page}</ClerkProvider> : page;
}
