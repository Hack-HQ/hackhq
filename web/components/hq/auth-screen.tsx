"use client";

import { SignIn, SignUp } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#ed5b29",
    colorBackground: "#1b1917",
    colorForeground: "#f5ede6",
    colorMutedForeground: "#9ba1a5",
    colorInput: "#100f0f",
    colorInputForeground: "#f5ede6",
    borderRadius: "1.25rem",
  },
  elements: {
    socialButtonsBlockButton: {
      backgroundColor: "#100f0f",
      border: "1px solid rgba(245, 237, 230, 0.18)",
      boxShadow: "inset 0 0 0 1px rgba(237, 91, 41, 0.16)",
      color: "#f5ede6",
      padding: "0.5rem",
    },
    socialButtonsBlockButtonText: {
      color: "#f5ede6",
      fontWeight: "700",
      letterSpacing: "0.01em",
    },
    socialButtonsBlockButtonArrow: {
      color: "#f5ede6",
    },
    socialButtonsBlockButton__hover: {
      backgroundColor: "#1b1917",
      borderColor: "rgba(237, 91, 41, 0.7)",
      color: "#f5ede6",
    },
    socialButtonsBlockButton__focus: {
      boxShadow:
        "0 0 0 2px #1b1917, 0 0 0 4px rgba(237, 91, 41, 0.85)",
    },
    formFieldInput: {
      padding: "0.5rem",
    },
  },
};

type AuthScreenProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthScreen({ mode }: AuthScreenProps) {
  const isSignIn = mode === "sign-in";

  return (
    <section className="p-2 pt-0">
      <div className="shell flex min-h-[78vh] flex-col items-center justify-center gap-10 bg-ink px-5 py-16 sm:px-10">
        <div className="text-center">
          <div className="kicker text-coral">Members · Pillar 03</div>
          <h1 className="display mt-4 text-[clamp(1.6rem,4vw,2.8rem)] text-paper">
            {isSignIn ? "My HackHQ" : "Create your HackHQ account"}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-paper/60">
            Use Google, GitHub, or email and password to open your hackathon
            pipeline.
          </p>
        </div>

        {isSignIn ? (
          <SignIn
            routing="path"
            path="/auth/sign-in"
            signUpUrl="/auth/sign-up"
            forceRedirectUrl="/my"
            appearance={clerkAppearance}
          />
        ) : (
          <SignUp
            routing="path"
            path="/auth/sign-up"
            signInUrl="/auth/sign-in"
            forceRedirectUrl="/my"
            appearance={clerkAppearance}
          />
        )}
      </div>
    </section>
  );
}
