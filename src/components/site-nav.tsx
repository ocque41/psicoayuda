"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionUser = { id: string; email: string };

/**
 * Navegación de dos modos. Por defecto (carga / sin sesión) muestra el menú
 * público — lo que ve la gente al entrar y lo que indexan los buscadores. Si
 * hay sesión (solo los profesionales inician sesión) cambia al menú profesional.
 *
 * No usa el SDK de Better Auth en el cliente: ese paquete (~10 KB gzip) viajaba
 * en TODAS las páginas y además pedía `/api/auth/get-session` en cada visita,
 * también para quien no tiene sesión. Aquí comprobamos primero si existe la
 * cookie de sesión y solo entonces consultamos el endpoint (mismo JSON), con
 * `fetch` propio. El coste para el visitante anónimo es cero.
 */
export function SiteNav() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [resolved, setResolved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    // La cookie de sesión de Better Auth se llama `better-auth.session_token`
    // (con prefijo `__Secure-` en producción). Si no existe, no hay sesión que
    // resolver: nada de peticiones extra para el visitante anónimo.
    if (!document.cookie.includes("better-auth")) {
      setResolved(true);
      return;
    }
    fetch("/api/auth/get-session", { headers: { accept: "application/json" } })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ user?: SessionUser }>)
          : { user: undefined },
      )
      .then((data) => {
        if (!active) return;
        setSession(data?.user ?? null);
        setResolved(true);
      })
      .catch(() => {
        if (active) setResolved(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const isPro = resolved && Boolean(session);

  // Solo con sesión preguntamos al servidor si esta cuenta es admin. La lista de
  // ADMIN_EMAILS nunca sale al cliente; el endpoint solo devuelve el booleano.
  useEffect(() => {
    if (!isPro) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    fetch("/api/admin/status", { headers: { accept: "application/json" } })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ isAdmin?: boolean }>)
          : { isAdmin: false },
      )
      .then((data) => {
        if (active) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [isPro]);

  if (isPro) {
    return (
      <div className="nav-links">
        <Link href="/pro/dashboard">Perfil</Link>
        <Link href="/pro/dashboard#chats">Chats</Link>
        <Link href="/pro/dashboard#contacto">Contacto</Link>
        {isAdmin ? (
          <Link
            href="/admin"
            style={{
              background: "var(--accent)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Panel admin
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => {
            fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            }).finally(() => {
              window.location.href = "/";
            });
          }}
          style={{
            background: "none",
            border: "none",
            padding: "10px 8px",
            font: "inherit",
            color: "var(--accent)",
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="nav-links">
      <Link href="/ayuda">Pedir ayuda</Link>
      <Link href="/pro?modo=registro">Soy profesional</Link>
      <Link href="/recursos">Recursos</Link>
      <Link href="/pro">Ingresar</Link>
    </div>
  );
}
