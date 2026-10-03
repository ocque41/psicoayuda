import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { saveService, toggleService } from "@/app/pro/consulta/actions";
import { CurrencySelect, PracticeForm } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { db } from "@/db";
import { practiceServices } from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { moneyLabel } from "@/lib/practice/domain";
export const metadata: Metadata = {
  title: "Tus servicios",
  robots: { index: false, follow: false },
};
export default async function ServicesPage() {
  const pro = await requirePracticeProfessional();
  const services = await db
    .select()
    .from(practiceServices)
    .where(eq(practiceServices.professionalId, pro.id))
    .orderBy(desc(practiceServices.createdAt));
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Una práctica a tu medida</h1>
        <p className="lead">
          Tú eliges la duración, los servicios y cómo acompañar a cada persona.
        </p>
        <PracticeNav />
        <div className="practice-columns">
          <section>
            <h2>Tus servicios</h2>
            {services.map((s) => (
              <article className="card" key={s.id}>
                <h3>{s.title}</h3>
                <p>
                  {s.sessionsCount}{" "}
                  {s.sessionsCount === 1 ? "sesión" : "sesiones"} de{" "}
                  {s.durationMinutes} minutos ·{" "}
                  {moneyLabel(s.priceCents, s.currency)}{" "}
                  {s.interval === "month" ? "al mes" : "en total"}
                </p>
                <p>
                  Vigencia: {s.validityDays} días · Cancelación con{" "}
                  {s.cancellationHours} h de aviso
                </p>
                <PracticeForm
                  action={toggleService}
                  submit={s.active ? "Pausar servicio" : "Activar servicio"}
                >
                  <input type="hidden" name="serviceId" value={s.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={s.active ? "0" : "1"}
                  />
                </PracticeForm>
              </article>
            ))}
            {!services.length ? (
              <div className="card">
                <h3>Empieza por una sesión</h3>
                <p>
                  También puedes crear paquetes o un acompañamiento mensual. La
                  ayuda por el terremoto mantiene su propia ficha gratuita.
                </p>
              </div>
            ) : null}
          </section>
          <section className="card">
            <h2>Crear servicio</h2>
            <PracticeForm action={saveService} submit="Crear servicio">
              <label>
                Nombre
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="Sesión individual"
                />
              </label>
              <label>
                Duración por sesión (minutos)
                <input
                  type="number"
                  name="durationMinutes"
                  defaultValue={50}
                  min={15}
                  max={180}
                  required
                />
              </label>
              <label>
                Sesiones incluidas
                <input
                  type="number"
                  name="sessionsCount"
                  defaultValue={1}
                  min={1}
                  max={50}
                  required
                />
              </label>
              <label>
                Precio total
                <input
                  name="price"
                  inputMode="decimal"
                  required
                  placeholder="25,00"
                />
              </label>
              <CurrencySelect />
              <label>
                Frecuencia
                <select name="interval">
                  <option value="one_time">Una sesión o paquete</option>
                  <option value="month">Acompañamiento mensual</option>
                </select>
              </label>
              <label>
                Vigencia del paquete / ciclo (días)
                <input
                  type="number"
                  name="validityDays"
                  defaultValue={30}
                  min={1}
                  max={365}
                  required
                />
              </label>
              <label>
                Aviso de cancelación (horas)
                <input
                  type="number"
                  name="cancellationHours"
                  defaultValue={24}
                  min={0}
                  max={168}
                  required
                />
              </label>
            </PracticeForm>
            <p className="hint">
              Crear un servicio no inicia cobros ni renovaciones. Acuerda las
              condiciones con el paciente antes de comenzar.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
