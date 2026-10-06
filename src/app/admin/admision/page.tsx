import type { Metadata } from "next";
import Link from "next/link";
import {
  adminNavigation,
  admissionNavigation,
  paolaPreviewNavigation,
} from "@/components/admin/navigation";
import { adminSearchValue } from "@/components/admin/search-params";
import { AdminShell } from "@/components/admin/shell";
import styles from "@/components/admin/shell.module.css";
import { AdmissionBoard } from "@/components/admission/admission-board";
import { AdmissionViewSwitcher } from "@/components/admission/role-view-switcher";
import type { AdmissionBoardViewData } from "@/components/admission/view-model";
import { AuthPanel } from "@/components/auth-panel";
import { requireAdmissionReviewer } from "@/lib/admission/access";
import { readAdmissionBoard } from "@/lib/admission/queries";
import type { AdmissionBoardData } from "@/lib/admission/types";
import { getServerSession } from "@/lib/auth-server";
import {
  configure,
  moveStage,
  publish,
  saveReview,
  saveScope,
} from "./actions";

export const metadata: Metadata = {
  title: "Admisión profesional",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function AdmissionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestedPaolaView = adminSearchValue(query.vista) === "paola";
  const callbackURL = requestedPaolaView
    ? "/admin/admision?vista=paola"
    : "/admin/admision";
  const actor = await requireAdmissionReviewer();
  if (!actor) {
    const session = await getServerSession();
    return (
      <section className="section">
        <div className="container">
          <h1>Acceso a admisión</h1>
          {session?.user ? (
            <div className="card">
              <p>
                Esta cuenta no tiene acceso a admisión. Se requiere una cuenta
                verificada autorizada para revisar nuevas candidaturas
                profesionales.
              </p>
            </div>
          ) : (
            <div className="signin">
              <p>
                Entra con tu cuenta para revisar nuevas candidaturas
                profesionales.
              </p>
              <AuthPanel
                callbackURL={callbackURL}
                googleEnabled={Boolean(
                  process.env.GOOGLE_CLIENT_ID?.trim() &&
                    process.env.GOOGLE_CLIENT_SECRET?.trim(),
                )}
              />
            </div>
          )}
        </div>
      </section>
    );
  }
  const paolaView = actor.isAdmin && requestedPaolaView;
  const items = actor.isAdmin
    ? paolaView
      ? paolaPreviewNavigation
      : adminNavigation
    : admissionNavigation;
  const accountLabel = actor.isAdmin
    ? paolaView
      ? "Superadmin · vista del rol de admisión"
      : "Superadmin"
    : "Administración de psicólogos";
  let data: AdmissionBoardData;
  try {
    data = await readAdmissionBoard(actor, query);
  } catch {
    return (
      <AdminShell
        active="admision"
        items={items}
        accountEmail={actor.email}
        accountLabel={accountLabel}
        title={actor.isAdmin && !paolaView ? "Panel de Paola" : "Admisión"}
      >
        <div className={styles.empty} role="status">
          <h2>El tablero no está disponible</h2>
          <p>
            Vuelve a abrir esta sección en unos momentos. Las candidaturas y
            revisiones se conservan.
          </p>
          <Link
            href={paolaView ? "/admin/admision?vista=paola" : "/admin/admision"}
          >
            Volver a abrir admisión
          </Link>
        </div>
      </AdminShell>
    );
  }
  const boardData: AdmissionBoardViewData = {
    ...data,
    // La vista sólo afecta a presentación. Las acciones conservan el actor real.
    limitedReviewer: paolaView || data.limitedReviewer,
    ...(paolaView ? { viewMode: "paola" } : {}),
  };
  return (
    <AdminShell
      active="admision"
      items={items}
      accountEmail={actor.email}
      accountLabel={accountLabel}
      title={actor.isAdmin && !paolaView ? "Panel de Paola" : "Admisión"}
      badges={{
        admision: Object.values(data.stageCounts).reduce(
          (total, count) => total + count,
          0,
        ),
      }}
    >
      {actor.isAdmin ? (
        <AdmissionViewSwitcher paolaView={paolaView} data={data} />
      ) : null}
      <AdmissionBoard
        data={boardData}
        actions={{ saveReview, saveScope, moveStage, publish, configure }}
      />
    </AdminShell>
  );
}
