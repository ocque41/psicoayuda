import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPanelItemActive,
  isPanelSectionHref,
  type PanelNavGroup,
  panelSectionId,
  panelSectionIds,
} from "@/lib/panel-nav";
import {
  proChatsFingerprint,
  proChatsUnreadCount,
  sortProChats,
  toProChatSummary,
} from "@/lib/pro-chats";
import {
  PRO_SIGN_IN_PATH,
  PRO_SIGN_UP_PATH,
  signedInEntryPath,
} from "@/lib/pro-entry";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("entrada del voluntariado", () => {
  it("entrar manda al panel; crear cuenta, al perfil", () => {
    expect(PRO_SIGN_IN_PATH).toBe("/pro/dashboard");
    expect(PRO_SIGN_UP_PATH).toBe("/pro/onboarding");
    expect(signedInEntryPath({ isAdmin: false, hasProfile: true })).toBe(
      "/pro/dashboard",
    );
    expect(signedInEntryPath({ isAdmin: false, hasProfile: false })).toBe(
      "/pro/onboarding",
    );
    expect(signedInEntryPath({ isAdmin: true, hasProfile: false })).toBe(
      "/admin",
    );
  });

  it("/pro con sesión redirige en vez de mostrar el formulario", () => {
    const page = read("src/app/pro/page.tsx");
    expect(page).toContain("signedInEntryPath({");
    expect(page).toContain("redirect(");
    // El formulario de acceso solo se renderiza para quien no tiene sesión.
    expect(page).toContain("<AuthPanel");
  });

  it("el panel de acceso separa el destino de entrar y el de crear cuenta", () => {
    const panel = read("src/components/auth-panel.tsx");
    expect(panel).toContain("callbackURL = PRO_SIGN_IN_PATH");
    expect(panel).toContain("signupCallbackURL = PRO_SIGN_UP_PATH");
    expect(panel).toContain(
      'router.push(mode === "signup" ? signupCallbackURL : callbackURL)',
    );
    expect(panel).toContain(
      "buildProfessionalNewUserCallbackUrl(signupCallbackURL)",
    );
  });
});

describe("navegación lateral de los paneles", () => {
  const groups: PanelNavGroup[] = [
    {
      label: "Tu panel",
      items: [
        { href: "#chats", label: "Tus conversaciones" },
        { href: "/admin/export", label: "Exportar" },
        { href: "#chats", label: "Duplicada" },
      ],
    },
    {
      label: "Ir a",
      items: [{ href: "/", label: "Página de inicio" }],
    },
  ];

  it("reconoce anclas y las extrae sin repetir", () => {
    expect(isPanelSectionHref("#chats")).toBe(true);
    expect(isPanelSectionHref("/admin/export")).toBe(false);
    expect(isPanelSectionHref("#")).toBe(false);
    expect(panelSectionId("#chats")).toBe("chats");
    expect(panelSectionIds(groups)).toEqual(["chats"]);
  });

  it("marca la sección visible y solo ella", () => {
    expect(
      isPanelItemActive({
        href: "#chats",
        pathname: "/pro/dashboard",
        activeSection: "chats",
      }),
    ).toBe(true);
    expect(
      isPanelItemActive({
        href: "#chats",
        pathname: "/pro/dashboard",
        activeSection: "bandeja",
      }),
    ).toBe(false);
    // Sin sección resuelta (aún cargando) nada queda marcado.
    expect(
      isPanelItemActive({
        href: "#chats",
        pathname: "/pro/dashboard",
        activeSection: "",
      }),
    ).toBe(false);
  });

  it("marca la ruta actual exacta, no una hermana", () => {
    expect(
      isPanelItemActive({
        href: "/admin/export",
        pathname: "/admin/export",
        activeSection: "",
      }),
    ).toBe(true);
    expect(
      isPanelItemActive({
        href: "/admin/export",
        pathname: "/admin",
        activeSection: "",
      }),
    ).toBe(false);
    expect(
      isPanelItemActive({
        href: "/admin",
        pathname: "/admin/export",
        activeSection: "",
      }),
    ).toBe(false);
    expect(
      isPanelItemActive({
        href: "/pro/onboarding/",
        pathname: "/pro/onboarding",
        activeSection: "",
      }),
    ).toBe(true);
  });

  it("ambos paneles usan el sidebar y sus anclas existen", () => {
    const dashboard = read("src/app/pro/dashboard/page.tsx");
    expect(dashboard).toContain("<PanelShell");
    expect(dashboard).not.toContain('className="panel-nav"');
    for (const id of ["cifrado", "bandeja", "chats", "cuenta", "cobros"]) {
      expect(dashboard).toContain(`id="${id}"`);
      expect(dashboard).toContain(`"#${id}"`);
    }

    const admin = read("src/app/admin/page.tsx");
    expect(admin).toContain("<PanelShell");
    expect(admin).not.toContain('className="panel-nav"');
    for (const id of ["metricas", "contactos", "lista-espera", "solicitudes"]) {
      expect(admin).toContain(`id="${id}"`);
      expect(admin).toContain(`"#${id}"`);
    }
    // Anclas de subsecciones: viven en sus componentes.
    expect(read("src/components/admin-partners.tsx")).toContain('id="aliados"');
    expect(read("src/components/admin-incomplete-registrations.tsx")).toContain(
      'id="registros"',
    );
  });

  it("en móvil el menú es un cajón con diálogo, fondo y Escape", () => {
    // El cajón compartido (paneles y lista de conversaciones) se anuncia como
    // diálogo modal y queda inerte cuando está cerrado.
    const drawer = read("src/components/side-drawer.tsx");
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain("aria-modal");
    expect(drawer).toContain("inert={!open}");
    expect(drawer).toContain("aria-controls={id}");
    // Escape cierra y el fondo no hace scroll.
    expect(drawer).toContain('event.key === "Escape"');
    expect(drawer).toContain('document.body.style.overflow = "hidden"');

    const shell = read("src/components/panel-shell.tsx");
    expect(shell).toContain("<SideDrawer");
    // El cajón se cierra solo al navegar (la ruta guardada deja de coincidir).
    expect(shell).toContain("drawer.path === pathname");
  });
});

describe("lista de conversaciones del chat (profesional)", () => {
  const base = {
    status: "open",
    closedReason: null,
    lastMessageAt: new Date("2026-09-15T12:00:00.000Z"),
    proLastReadAt: null,
    createdAt: "2026-09-15T10:00:00.000Z",
    seekerName: "María",
    needCategory: "ansiedad",
    urgency: "media",
  };

  it("marca sin leer solo cuando el último mensaje es de la persona", () => {
    expect(
      toProChatSummary({
        ...base,
        conversationId: "c1",
        lastMessageRole: "seeker",
      }).unread,
    ).toBe(true);
    expect(
      toProChatSummary({
        ...base,
        conversationId: "c1",
        lastMessageRole: "seeker",
        proLastReadAt: new Date("2026-09-15T12:30:00.000Z"),
      }).unread,
    ).toBe(false);
    expect(
      toProChatSummary({
        ...base,
        conversationId: "c1",
        lastMessageRole: "professional",
      }).unread,
    ).toBe(false);
    expect(
      toProChatSummary({
        ...base,
        conversationId: "c1",
        lastMessageRole: null,
        lastMessageAt: null,
      }).unread,
    ).toBe(false);
  });

  it("usa la creación como actividad si nunca hubo mensajes", () => {
    const chat = toProChatSummary({
      ...base,
      conversationId: "c1",
      lastMessageRole: null,
      lastMessageAt: null,
    });
    expect(chat.lastActivityAt).toBe(
      new Date("2026-09-15T10:00:00.000Z").getTime(),
    );
  });

  it("ordena por actividad reciente y cuenta los no leídos", () => {
    const older = toProChatSummary({
      ...base,
      conversationId: "vieja",
      lastMessageAt: new Date("2026-09-15T09:00:00.000Z"),
      lastMessageRole: "seeker",
    });
    const newer = toProChatSummary({
      ...base,
      conversationId: "nueva",
      lastMessageAt: new Date("2026-09-15T11:00:00.000Z"),
      lastMessageRole: "professional",
    });
    const sorted = sortProChats([older, newer]);
    expect(sorted.map((chat) => chat.id)).toEqual(["nueva", "vieja"]);
    expect(proChatsUnreadCount(sorted)).toBe(1);
  });

  it("la huella cambia con la actividad y el estado de lectura", () => {
    const before = toProChatSummary({
      ...base,
      conversationId: "c1",
      lastMessageRole: "seeker",
    });
    const afterRead = toProChatSummary({
      ...base,
      conversationId: "c1",
      lastMessageRole: "seeker",
      proLastReadAt: new Date("2026-09-15T12:10:00.000Z"),
    });
    expect(proChatsFingerprint([before])).not.toBe(
      proChatsFingerprint([afterRead]),
    );
    expect(proChatsFingerprint([before])).toBe(proChatsFingerprint([before]));
  });

  it("la sala pinta la lista del pro y la ruta de refresco existe", () => {
    const page = read("src/app/c/[conversationId]/page.tsx");
    expect(page).toContain("<ProChatList");
    expect(page).toContain("conversationsForProfessional(view.professionalId)");

    const route = read("src/app/api/pro/chats/route.ts");
    expect(route).toContain("conversationsForProfessional(pro.id)");
    expect(route).toContain("cache-control");
    expect(route).toContain("no-store");

    // El chat avisa al instante a la lista al recibir o confirmar un mensaje.
    const room = read("src/app/c/[conversationId]/chat-room.tsx");
    expect(room).toContain('new Event("nido:chat-update")');
    // Y vuelve a marcar leído cuando llega un mensaje con la sala abierta.
    expect(room).toContain("void ensureProChatToken(conversationId)");
  });
});
