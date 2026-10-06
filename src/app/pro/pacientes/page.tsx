import type { Metadata } from "next";
import Link from "next/link";
import { createPatient } from "@/app/pro/consulta/actions";
import { PracticeForm, TimeZoneSelect } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { PracticePagination } from "@/components/practice/pagination";
import { PatientProfileFields } from "@/components/practice/patient-profile-fields";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { patientStateLabels } from "@/lib/practice/domain";
import { patientListHref } from "@/lib/practice/navigation";
import { patientList } from "@/lib/practice/queries";

export const metadata: Metadata = {
  title: "Pacientes · Tu consulta",
  robots: { index: false, follow: false },
};

export default async function PracticePatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string }>;
}) {
  const pro = await requirePracticeProfessional();
  const params = await searchParams;
  const patients = await patientList(pro.id, params);
  return (
    <section className="section">
      <div className="container practice-shell">
        <p className="eyebrow">Nido · Tu consulta</p>
        <h1>Tus pacientes</h1>
        <p className="lead">
          Una ficha para cada persona, con sus sesiones, notas y conversación.
        </p>
        <PracticeNav />
        <section
          className="workspace-card"
          aria-labelledby="patients-list-title"
        >
          <div className="panel-nav">
            <h2 id="patients-list-title">Fichas de tu consulta</h2>
            <a href="#crear-paciente" className="button human">
              Crear ficha
            </a>
          </div>
          <form
            method="get"
            className="practice-filter"
            action="/pro/pacientes"
          >
            <label>
              Buscar por nombre
              <input name="q" defaultValue={patients.term} maxLength={80} />
            </label>
            <label>
              Seguimiento
              <select name="estado" defaultValue={patients.state || ""}>
                <option value="">Todos</option>
                {Object.entries(patientStateLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button secondary">
              Filtrar
            </button>
            {patients.term || patients.state ? (
              <Link href="/pro/pacientes" className="button secondary">
                Limpiar filtros
              </Link>
            ) : null}
          </form>
          <div className="practice-patients">
            {patients.rows.map((patient) => (
              <Link
                className="card practice-patient-row"
                href={`/pro/pacientes/${patient.id}`}
                key={patient.id}
              >
                <span>
                  <strong>{patient.name}</strong>
                  <small>
                    {patient.program === "earthquake"
                      ? "Ayuda Terremoto · $0"
                      : "Consulta"}
                  </small>
                </span>
                <span className="panel-chip">
                  {patientStateLabels[patient.status]}
                </span>
              </Link>
            ))}
            {!patients.rows.length ? (
              <div className="workspace-empty">
                <h3>
                  {patients.term || patients.state
                    ? "No hay fichas con estos filtros."
                    : "Tu primera ficha empieza aquí."}
                </h3>
                <p className="hint">
                  {patients.term || patients.state
                    ? "Prueba otro nombre o seguimiento para encontrar la ficha."
                    : "Crea una ficha o vincula una conversación para organizar el próximo encuentro."}
                </p>
                {!patients.term && !patients.state ? (
                  <Link href="/pro/mensajes" className="link-arrow">
                    Vincular una conversación →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          <PracticePagination
            page={patients.page}
            pages={patients.pages}
            total={patients.total}
            href={(page) =>
              patientListHref(
                { q: patients.term, estado: patients.state },
                page,
              )
            }
            prefetch={false}
          />
        </section>
        <section
          className="workspace-card"
          id="crear-paciente"
          aria-labelledby="patient-create-title"
        >
          <h2 id="patient-create-title">Crear ficha de paciente</h2>
          <p className="hint">
            Guarda el contacto y los datos opcionales de la ficha con
            autorización de la persona.
          </p>
          <PracticeForm
            action={createPatient}
            submit="Crear ficha"
            resetOnSuccess
          >
            <label>
              Nombre o alias
              <input name="name" required maxLength={80} autoComplete="off" />
            </label>
            <label>
              Correo de contacto (opcional)
              <input type="email" name="email" maxLength={254} />
            </label>
            <label>
              País donde recibe atención
              <input
                name="country"
                defaultValue="Venezuela"
                required
                maxLength={80}
              />
            </label>
            <TimeZoneSelect />
            <PatientProfileFields collapsible />
            <label>
              Programa
              <select name="program">
                <option value="general">Consulta</option>
                <option value="earthquake">
                  Ayuda Terremoto · elegibilidad confirmada · $0
                </option>
              </select>
            </label>
            <label className="practice-check">
              <input type="checkbox" name="consent" required />
              Tengo autorización para guardar el contacto y los datos que he
              añadido a esta ficha privada.
            </label>
          </PracticeForm>
        </section>
      </div>
    </section>
  );
}
