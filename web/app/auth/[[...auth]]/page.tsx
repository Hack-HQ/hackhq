import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/hq/auth-screen";
import { PageShell } from "@/components/hq/page-shell";

type AuthMode = "sign-in" | "sign-up";

type AuthPageProps = {
  params: Promise<{
    auth?: string[];
  }>;
};

function getAuthMode(auth?: string[]): AuthMode {
  return auth?.[0] === "sign-up" ? "sign-up" : "sign-in";
}

export async function generateMetadata({
  params,
}: AuthPageProps): Promise<Metadata> {
  const { auth } = await params;
  const mode = getAuthMode(auth);

  return mode === "sign-up"
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
  const { auth } = await params;

  if (!auth?.[0]) {
    redirect("/auth/sign-in");
  }

  return (
    <PageShell>
      <AuthScreen mode={getAuthMode(auth)} />
    </PageShell>
  );
}
