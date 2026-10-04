import type { Metadata } from "next";
import Link from "next/link";
import {
  adminNavigation,
  admissionNavigation,
} from "@/components/admin/navigation";
import { AdminShell } from "@/components/admin/shell";
import styles from "@/components/admin/shell.module.css";
import { AdmissionBoard } from "@/components/admission/admission-board";
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
                callbackURL="/admin/admision"
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
  let data: AdmissionBoardData;
  try {
    data = await readAdmissionBoard(actor, await searchParams);
  } catch {
    return (
      <AdminShell
        active="admision"
        items={actor.isAdmin ? adminNavigation : admissionNavigation}
        accountEmail={actor.email}
        accountLabel={
          actor.isAdmin ? "Cuenta administradora" : "Revisión de admisión"
        }
      >
        <div className={styles.empty} role="status">
          <h2>El tablero no está disponible</h2>
          <p>
            Vuelve a abrir esta sección en unos momentos. Las candidaturas y
            revisiones se conservan.
          </p>
          <Link href="/admin/admision">Volver a abrir admisión</Link>
        </div>
      </AdminShell>
    );
  }
  return (
    <AdminShell
      active="admision"
      items={actor.isAdmin ? adminNavigation : admissionNavigation}
      accountEmail={actor.email}
      accountLabel={
        actor.isAdmin ? "Cuenta administradora" : "Revisión de admisión"
      }
      badges={{
        admision: Object.values(data.stageCounts).reduce(
          (total, count) => total + count,
          0,
        ),
      }}
    >
      <AdmissionBoard
        data={data}
        actions={{ saveReview, saveScope, moveStage, publish, configure }}
      />
    </AdminShell>
  );
}
