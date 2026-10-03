"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { legacyPracticeHref } from "@/lib/practice/navigation";

export function LegacyPracticeNavigation() {
  const router = useRouter();
  useEffect(() => {
    let previous: string | null = null;
    function relocate() {
      const target = legacyPracticeHref(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );
      if (target && target !== previous) {
        previous = target;
        router.replace(target);
      }
    }
    relocate();
    window.addEventListener("hashchange", relocate);
    window.addEventListener("popstate", relocate);
    return () => {
      window.removeEventListener("hashchange", relocate);
      window.removeEventListener("popstate", relocate);
    };
  }, [router]);
  return null;
}
