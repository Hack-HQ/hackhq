import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AuthScreen } from "@/components/hq/auth-screen";
import { PageShell } from "@/components/hq/page-shell";
import { isClerkConfigured } from "@/lib/env";

// Clerk's flows fan out into sub-paths (/auth/sign-in/factor-one,
// /auth/sign-up/sso-callback, ...), so the catch-all keeps them all on this
// page and only the first segment decides which form to mount.
type AuthMode = "sign-in" | "sign-up";

type AuthPageProps = {
  params: Promise<{
    auth?: string[];
  }>;
};

// The env branch below must not be baked into a build-time prerender: the same
// build can be deployed with and without Clerk keys.
export const dynamic = "force-dynamic";

function getAuthMode(auth?: string[]): AuthMode | null {
  const segment = auth?.[0];
  if (segment === "sign-in") return "sign-in";
  if (segment === "sign-up") return "sign-up";
  return null;
}

export async function generateMetadata({
  params,
}: AuthPageProps): Promise<Metadata> {
  const { auth } = await params;

  return getAuthMode(auth) === "sign-up"
    ? {
        title: "Create Account · HackHQ",
        description: "Create a HackHQ account with Google, GitHub, or email.",
      }
    : {
        title: "Sign In · HackHQ",
        description: "Sign in to My HackHQ with Google, GitHub, or email.",
      };
}

export default async function AuthPage({ params }: AuthPageProps) {
  // Clerk is optional. Without keys there is no <ClerkProvider> in the tree, so
  // <SignIn>/<SignUp> would throw — send visitors to /my, which explains setup.
  if (!isClerkConfigured()) {
    redirect("/my");
  }

  const { auth } = await params;
  const mode = getAuthMode(auth);

  if (!auth?.length) {
    redirect("/auth/sign-in");
  }

  if (!mode) {
    notFound();
  }

  return (
    <PageShell>
      <AuthScreen mode={mode} />
    </PageShell>
  );
}
