import type { Metadata } from "next";
import { Space_Grotesk, Inter, Space_Mono } from "next/font/google";
import "./globals.css";

// HackHQ type system (per product design brief §08):
// - Space Grotesk: techy geometric display - headlines, big numbers
// - Inter: the workhorse for all UI text
// - Space Mono: kickers, metadata, countdowns - "built by devs" energy
const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
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

export const metadata: Metadata = {
  title: "HackHQ · A Living Map of the Hackathon World",
  description:
    "Spin the globe, flip through the deck, track your applications. Every hackathon worth joining - in-person and virtual - on one living 3D map. Updated daily, open source.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${inter.variable} ${smono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
