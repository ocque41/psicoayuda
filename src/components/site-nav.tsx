"use client";

import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

const authClient = createAuthClient();

/**
 * Navegación de dos modos. Por defecto (carga / sin sesión) muestra el menú
 * público — lo que ve la gente al entrar y lo que indexan los buscadores. Si
 * hay sesión (solo los profesionales inician sesión) cambia al menú profesional.
 * Es un island de cliente para no convertir todo el sitio en dinámico (las
 * páginas públicas siguen siendo estáticas).
 */
export function SiteNav() {
  const { data: session, isPending } = authClient.useSession();
  const isPro = !isPending && Boolean(session?.user);
  const [isAdmin, setIsAdmin] = useState(false);

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
            authClient.signOut().finally(() => {
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
