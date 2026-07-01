"use client";

import { useActionState, useEffect, useId, useState } from "react";
import type {
  Partner,
  PartnerContact,
  PartnerContactType,
} from "@/lib/partners";

type SaveState = { ok: boolean; message?: string } | null;
type SaveAction = (
  prevState: SaveState,
  formData: FormData,
) => Promise<SaveState>;
type DeleteAction = (formData: FormData) => void | Promise<void>;

const CONTACT_TYPE_OPTIONS: { value: PartnerContactType; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Teléfono" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Sitio web" },
  { value: "email", label: "Correo" },
];

type ContactRow = {
  key: string;
  label: string;
  type: PartnerContactType;
  value: string;
};

// Redimensiona un logo subido a ~256px y lo devuelve como data URL liviana, para
// que no infle la fila (el esquema corta a ~300 KB). SVG se usa tal cual.
async function fileToLogoDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml") return dataUrl;

  const image = document.createElement("img");
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Imagen no válida."));
    image.src = dataUrl;
  });
  const max = 256;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.85);
}

function toRows(contacts: PartnerContact[]): ContactRow[] {
  return contacts.map((contact, index) => ({
    key: `c${index}`,
    label: contact.label ?? "",
    type: contact.type,
    value: contact.value,
  }));
}

function PartnerForm({
  partner,
  saveAction,
  deleteAction,
}: {
  partner?: Partner;
  saveAction: SaveAction;
  deleteAction: DeleteAction;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    saveAction,
    null,
  );
  const isNew = !partner;
  const formId = useId();

  const [name, setName] = useState(partner?.name ?? "");
  const [specialty, setSpecialty] = useState(partner?.specialty ?? "");
  const [description, setDescription] = useState(partner?.description ?? "");
  const [logo, setLogo] = useState(partner?.logo ?? "");
  const [status, setStatus] = useState<Partner["status"]>(
    partner?.status ?? "published",
  );
  const [sortOrder, setSortOrder] = useState(String(partner?.sortOrder ?? 0));
  const [rows, setRows] = useState<ContactRow[]>(
    toRows(partner?.contacts ?? []),
  );
  const [logoError, setLogoError] = useState("");

  // Al crear con éxito, limpiamos el formulario (el aliado ya aparece en la lista).
  useEffect(() => {
    if (state?.ok && isNew) {
      setName("");
      setSpecialty("");
      setDescription("");
      setLogo("");
      setStatus("published");
      setSortOrder("0");
      setRows([]);
    }
  }, [state, isNew]);

  const contactsJson = JSON.stringify(
    rows
      .filter((row) => row.value.trim())
      .map((row) => ({
        label: row.label.trim() || undefined,
        type: row.type,
        value: row.value.trim(),
      })),
  );

  async function handleLogoFile(file: File) {
    setLogoError("");
    if (!file.type.startsWith("image/")) {
      setLogoError("Sube un archivo de imagen.");
      return;
    }
    try {
      setLogo(await fileToLogoDataUrl(file));
    } catch {
      setLogoError("No se pudo procesar la imagen.");
    }
  }

  return (
    <form action={formAction} className="partner-admin-form">
      {partner ? <input name="id" type="hidden" value={partner.id} /> : null}
      <input name="contacts" type="hidden" value={contactsJson} />
      <input name="logo" type="hidden" value={logo} />

      <div className="partner-admin-grid">
        <label htmlFor={`${formId}-name`}>
          Nombre
          <input
            id={`${formId}-name`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label htmlFor={`${formId}-specialty`}>
          Especialidad
          <input
            id={`${formId}-specialty`}
            name="specialty"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            maxLength={160}
            placeholder="Ej. Primeros Auxilios Psicológicos"
          />
        </label>
      </div>

      <label htmlFor={`${formId}-description`}>
        Descripción
        <textarea
          id={`${formId}-description`}
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={1200}
        />
      </label>

      <div className="partner-admin-grid">
        <label htmlFor={`${formId}-status`}>
          Estado
          <select
            id={`${formId}-status`}
            name="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as Partner["status"])
            }
          >
            <option value="published">Publicado (visible)</option>
            <option value="hidden">Oculto</option>
          </select>
        </label>
        <label htmlFor={`${formId}-order`}>
          Orden
          <input
            id={`${formId}-order`}
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </label>
      </div>

      <fieldset className="partner-admin-logo">
        <legend>Logo</legend>
        <div className="partner-admin-logo-row">
          {logo ? (
            // biome-ignore lint/performance/noImgElement: previsualización de un logo arbitrario (URL/data URL)
            <img
              className="partner-logo"
              src={logo}
              alt="Logo actual"
              width={64}
              height={64}
            />
          ) : (
            <span className="partner-namechip">{name || "Sin logo"}</span>
          )}
          <div className="partner-admin-logo-fields">
            <input
              aria-label="URL del logo"
              value={logo.startsWith("data:") ? "" : logo}
              onChange={(event) => setLogo(event.target.value)}
              placeholder="Pega una URL de logo…"
            />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleLogoFile(file);
              }}
            />
            {logo ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => setLogo("")}
              >
                Quitar logo
              </button>
            ) : null}
          </div>
        </div>
        {logoError ? (
          <p className="form-error" role="alert">
            {logoError}
          </p>
        ) : null}
        <p className="hint">
          Si no hay logo, en el carrusel se muestra el nombre en limpio.
        </p>
      </fieldset>

      <fieldset className="partner-admin-contacts">
        <legend>Vías de contacto</legend>
        {rows.length === 0 ? (
          <p className="hint">Sin contactos. Añade al menos una vía.</p>
        ) : null}
        {rows.map((row) => (
          <div className="partner-contact-row" key={row.key}>
            <input
              aria-label="Etiqueta (opcional)"
              value={row.label}
              onChange={(event) =>
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="Nombre (opcional)"
              maxLength={80}
            />
            <select
              aria-label="Tipo de contacto"
              value={row.type}
              onChange={(event) =>
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? {
                          ...item,
                          type: event.target.value as PartnerContactType,
                        }
                      : item,
                  ),
                )
              }
            >
              {CONTACT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Dato de contacto"
              value={row.value}
              onChange={(event) =>
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="Número, @usuario, URL o correo"
              maxLength={200}
            />
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setRows((current) =>
                  current.filter((item) => item.key !== row.key),
                )
              }
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: crypto.randomUUID(),
                label: "",
                type: "whatsapp",
                value: "",
              },
            ])
          }
        >
          + Añadir contacto
        </button>
      </fieldset>

      <div className="partner-admin-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Guardando…" : isNew ? "Crear aliado" : "Guardar cambios"}
        </button>
        {partner ? (
          <span
            // Confirmación de borrado: el submit sale de un botón dentro de esta
            // forma anidada lógicamente; usamos una forma aparte para el delete.
            className="partner-admin-delete"
          >
            <DeleteButton partnerId={partner.id} deleteAction={deleteAction} />
          </span>
        ) : null}
        {state?.message ? (
          <span
            className={state.ok ? "status-message" : "form-error"}
            role={state.ok ? "status" : "alert"}
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function DeleteButton({
  partnerId,
  deleteAction,
}: {
  partnerId: string;
  deleteAction: DeleteAction;
}) {
  return (
    <form
      action={deleteAction}
      onSubmit={(event) => {
        if (!confirm("¿Eliminar este aliado? No se puede deshacer.")) {
          event.preventDefault();
        }
      }}
    >
      <input name="partnerId" type="hidden" value={partnerId} />
      <button className="button secondary danger" type="submit">
        Eliminar
      </button>
    </form>
  );
}

export function AdminPartnersSection({
  partners,
  saveAction,
  deleteAction,
}: {
  partners: Partner[];
  saveAction: SaveAction;
  deleteAction: DeleteAction;
}) {
  return (
    <section className="partner-admin">
      <h2>Aliados (carrusel y escaparate)</h2>
      <p className="muted">
        Estas organizaciones aparecen en el carrusel de la portada y en{" "}
        <code>/alianzas</code>. Publica, oculta, reordena o edita el logo y los
        contactos.
      </p>

      <details className="partner-admin-new">
        <summary>+ Añadir un aliado</summary>
        <PartnerForm saveAction={saveAction} deleteAction={deleteAction} />
      </details>

      {partners.length === 0 ? (
        <p className="muted">Aún no hay aliados.</p>
      ) : (
        <div className="grid">
          {partners.map((partner) => (
            <article className="card" key={partner.id}>
              <p className="muted">
                {partner.status === "hidden" ? "Oculto" : "Publicado"} · orden{" "}
                {partner.sortOrder}
              </p>
              <PartnerForm
                partner={partner}
                saveAction={saveAction}
                deleteAction={deleteAction}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
