"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearChatSessionCookies } from "@/app/actions-chat-session";
import {
  bridgeChatSessionEnd,
  completeChatSignOut,
} from "@/lib/chat-session-end";

type SessionUser = { id: string };

/** Public pages do not load the auth SDK. Protected/account routes resolve the
 * session once per area; HttpOnly cookies are deliberately never inspected. */
export function SiteNav({
  variant = "site",
}: {
  variant?: "site" | "workspace";
}) {
  const pathname = usePathname();
  useEffect(() => bridgeChatSessionEnd(), []);
  const professionalArea = pathname === "/pro" || pathname.startsWith("/pro/");
  const adminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const patientArea = pathname === "/mi" || pathname.startsWith("/mi/");
  const accountArea =
    pathname === "/entrar" ||
    pathname === "/empezar" ||
    pathname.startsWith("/empezar/");
  const needsSession =
    professionalArea ||
    adminArea ||
    patientArea ||
    accountArea ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/sesion/") ||
    pathname.startsWith("/acompanamiento/");
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdmissionReviewer, setIsAdmissionReviewer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const sessionVersion = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    const abort = new AbortController();
    async function resolve() {
      const version = ++sessionVersion.current;
      try {
        const response = await fetch("/api/auth/get-session", {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { user?: SessionUser } | null;
        if (!abort.signal.aborted && version === sessionVersion.current) {
          setSession(data?.user ?? null);
          setSessionRevision((revision) => revision + 1);
          try {
            if (data?.user)
              localStorage.setItem("nido:account:present:v1", "1");
            else localStorage.removeItem("nido:account:present:v1");
          } catch {
            /* Storage is optional; authorization remains on the server. */
          }
        }
      } catch {
        /* Navigation remains usable if the connection drops. */
      }
    }
    let accountHint = false;
    try {
      accountHint = localStorage.getItem("nido:account:present:v1") === "1";
    } catch {}
    if (needsSession || accountHint) void resolve();
    const sessionChanged = () => void resolve();
    window.addEventListener("nido:session-changed", sessionChanged);
    return () => {
      abort.abort();
      window.removeEventListener("nido:session-changed", sessionChanged);
    };
  }, [needsSession]);

  const checkAdmin = Boolean(session) && (professionalArea || adminArea);
  const checkedAccount = session
    ? `${session.id}:${sessionRevision}`
    : undefined;
  useEffect(() => {
    if (!checkAdmin || !checkedAccount) {
      setIsAdmin(false);
      setIsAdmissionReviewer(false);
      return;
    }
    setIsAdmin(false);
    setIsAdmissionReviewer(false);
    const abort = new AbortController();
    void fetch("/api/admin/status", {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: abort.signal,
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              isAdmin?: boolean;
              isAdmissionReviewer?: boolean;
            }>)
          : { isAdmin: false },
      )
      .then((data) => {
        if (!abort.signal.aborted) {
          setIsAdmin(Boolean(data.isAdmin));
          setIsAdmissionReviewer(Boolean(data.isAdmissionReviewer));
        }
      })
      .catch(() => {});
    return () => abort.abort();
  }, [checkAdmin, checkedAccount]);

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      await completeChatSignOut(clearChatSessionCookies, async () => {
        const response = await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        if (!response.ok) throw new Error("sign-out");
        return { error: null };
      });
      try {
        localStorage.removeItem("nido:account:present:v1");
      } catch {}
      window.location.assign("/");
    } catch {
      setError(
        "No se pudo cerrar la sesión. Revisa tu conexión y vuelve a intentarlo.",
      );
      setSigningOut(false);
    }
  }
  const workspaceHref = patientArea
    ? "/mi"
    : professionalArea
      ? "/pro/consulta"
      : "/empezar";
  return (
    <div className="site-navigation">
      <button
        type="button"
        className="site-nav-toggle"
        ref={menuButton}
        aria-label={
          variant === "workspace"
            ? menuOpen
              ? "Cerrar menú de cuenta"
              : "Abrir menú de cuenta"
            : menuOpen
              ? "Cerrar navegación"
              : "Abrir navegación"
        }
        aria-expanded={menuOpen}
        aria-controls="site-nav-links"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="site-nav-toggle-icon" aria-hidden="true">
          <span />
          <span />
        </span>
        <span>{variant === "workspace" ? "Cuenta" : "Menú"}</span>
      </button>
      <div
        className={`nav-links${menuOpen ? " is-open" : ""}`}
        id="site-nav-links"
      >
        {variant === "site" ? (
          <>
            <Link href="/profesionales" onClick={() => setMenuOpen(false)}>
              Buscar psicólogo
            </Link>
            <Link href="/orientacion" onClick={() => setMenuOpen(false)}>
              Ayúdame a elegir
            </Link>
            {!session ? (
              <Link href="/para-psicologos" onClick={() => setMenuOpen(false)}>
                Soy profesional
              </Link>
            ) : null}
          </>
        ) : null}
        {session ? (
          <Link
            className="site-account-link"
            href={workspaceHref}
            onClick={() => setMenuOpen(false)}
          >
            {professionalArea ? "Mi consulta" : "Mi espacio"}
            <span aria-hidden="true">↗</span>
          </Link>
        ) : (
          <Link
            className="site-account-link"
            href="/entrar"
            onClick={() => setMenuOpen(false)}
          >
            Ingresar<span aria-hidden="true">↗</span>
          </Link>
        )}
        {isAdmin && checkAdmin ? (
          <Link
            href="/admin"
            className="site-admin-link"
            onClick={() => setMenuOpen(false)}
          >
            Administración
          </Link>
        ) : isAdmissionReviewer && checkAdmin ? (
          <Link
            href="/admin/admision"
            className="site-admin-link"
            onClick={() => setMenuOpen(false)}
          >
            Admisión
          </Link>
        ) : null}
        {session ? (
          <button
            type="button"
            className="site-signout"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Cerrando…" : "Cerrar sesión"}
          </button>
        ) : null}
        {error ? (
          <p className="site-nav-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
