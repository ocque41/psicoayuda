"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { adminSectionHref, isAdminView } from "./navigation";

// Keep old bookmarks and links useful after replacing the long admin page.
export function AdminLegacyNavigation() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.pathname !== "/admin") return;
    const section = window.location.hash.slice(1);
    if (!isAdminView(section)) return;
    const destination = new URL(
      adminSectionHref(section),
      window.location.origin,
    );
    destination.search = window.location.search;
    router.replace(`${destination.pathname}${destination.search}`);
  }, [router]);
  return null;
}
