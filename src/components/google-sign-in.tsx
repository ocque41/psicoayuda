"use client";

import { createAuthClient } from "better-auth/react";
import { Button } from "@/components/ui/button";

const authClient = createAuthClient();

export function GoogleSignInButton() {
  return (
    <Button
      type="button"
      onClick={() =>
        authClient.signIn.social({
          provider: "google",
          callbackURL: "/pro/onboarding",
        })
      }
    >
      Entrar con Google
    </Button>
  );
}
