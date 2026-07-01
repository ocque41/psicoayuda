"use client";

import {
  type ChangeEvent,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { saveProfessionalOnboarding } from "@/app/actions";
import { countries, needCategories, needLabels } from "@/lib/constants";

// Redimensiona la foto elegida a un avatar pequeño (máx 256px) y la comprime a
// JPEG antes de subirla: así no pesa ni recarga la web ni la base de datos.
const PHOTO_MAX_PX = 256;
const PHOTO_QUALITY = 0.82;

function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(
          1,
          PHOTO_MAX_PX / Math.max(img.width, img.height),
        );
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Pipeline aparte para el COMPROBANTE de registro (no reusa el de la foto: un
// certificado a 256px sería ilegible). Imágenes → se redimensionan a un tamaño
// legible; PDF → se lee tal cual. Tope ~1 MB, igual que la validación del server.
// ponytail: base64 en D1, sin R2. Techo ~1 MB; si el volumen crece, mover a R2 + URL.
const DOC_MAX_PX = 1600;
const DOC_QUALITY = 0.7;
const DOC_MAX_BYTES = 1_200_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function resizeDocumentToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, DOC_MAX_PX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", DOC_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfessionalOnboardingForm({
  email,
  name,
}: {
  email: string;
  name?: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveProfessionalOnboarding,
    null,
  );
  const formId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [phone, setPhone] = useState("");
  const [landline, setLandline] = useState("");
  const [emailPublic, setEmailPublic] = useState(true);
  // Credencial flexible: auxiliar no clínico exime de todo; si no, basta una vía.
  const [nonClinical, setNonClinical] = useState(false);
  const [registrationType, setRegistrationType] = useState("");
  const [proofDoc, setProofDoc] = useState<string | null>(null);
  const [proofName, setProofName] = useState("");
  const [proofError, setProofError] = useState("");
  const ids = {
    fullName: `${formId}-full-name`,
    displayName: `${formId}-display-name`,
    displayNameHint: `${formId}-display-name-hint`,
    country: `${formId}-country`,
    city: `${formId}-city`,
    licenseNumber: `${formId}-license-number`,
    licenseHint: `${formId}-license-hint`,
    licenseCountry: `${formId}-license-country`,
    university: `${formId}-university`,
    universityHint: `${formId}-university-hint`,
    fpvNumber: `${formId}-fpv-number`,
    fpvHint: `${formId}-fpv-hint`,
    cedula: `${formId}-cedula`,
    cedulaHint: `${formId}-cedula-hint`,
    supervisionInfo: `${formId}-supervision-info`,
    supervisionHint: `${formId}-supervision-hint`,
    registrationType: `${formId}-registration-type`,
    registrationHint: `${formId}-registration-hint`,
    registrationDetail: `${formId}-registration-detail`,
    registrationProof: `${formId}-registration-proof`,
    registrationProofHint: `${formId}-registration-proof-hint`,
    phone: `${formId}-phone`,
    phoneHint: `${formId}-phone-hint`,
    landline: `${formId}-landline`,
    landlineHint: `${formId}-landline-hint`,
    contactEmail: `${formId}-contact-email`,
    contactEmailHint: `${formId}-contact-email-hint`,
    maxActiveRequests: `${formId}-max-active-requests`,
    maxHint: `${formId}-max-hint`,
    contactNotes: `${formId}-contact-notes`,
    shortBio: `${formId}-short-bio`,
    shortBioHint: `${formId}-short-bio-hint`,
    photo: `${formId}-photo`,
    photoHint: `${formId}-photo-hint`,
  };

  useEffect(() => {
    if (state && !state.ok) {
      errorRef.current?.focus();
    }
  }, [state]);

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    if (!file.type.startsWith("image/")) {
      setPhotoError("Elige un archivo de imagen.");
      return;
    }
    try {
      setPhoto(await resizeImageToDataUrl(file));
    } catch {
      setPhotoError("No se pudo procesar la imagen. Prueba con otra.");
    }
  }

  async function handleProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProofError("");
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setProofError("Sube una imagen (JPG, PNG o WebP) o un PDF.");
      return;
    }
    try {
      const dataUrl = isPdf
        ? await readFileAsDataUrl(file)
        : await resizeDocumentToDataUrl(file);
      if (dataUrl.length > DOC_MAX_BYTES) {
        setProofError(
          "El documento es demasiado grande (máx ~1 MB). Sube un archivo más liviano.",
        );
        return;
      }
      setProofDoc(dataUrl);
      setProofName(file.name);
    } catch {
      setProofError(
        "No se pudo procesar el documento. Prueba con otro archivo.",
      );
    }
  }

  return (
    <form action={action} className="card" aria-busy={pending}>
      <p className="muted">Tu cuenta: {email}</p>

      <fieldset className="card">
        <legend>Quién eres</legend>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor={ids.fullName}>Nombre completo *</label>
            <input
              id={ids.fullName}
              name="fullName"
              defaultValue={name ?? ""}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={ids.displayName}>Nombre público</label>
            <p className="hint" id={ids.displayNameHint}>
              El nombre con el que te verán las personas. Puede ser solo tu
              nombre de pila.
            </p>
            <input
              id={ids.displayName}
              name="displayName"
              aria-describedby={ids.displayNameHint}
            />
          </div>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor={ids.country}>País</label>
            <select
              id={ids.country}
              name="country"
              autoComplete="country-name"
              defaultValue="Venezuela"
            >
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.city}>Ciudad</label>
            <input id={ids.city} name="city" />
          </div>
        </div>

        <div className="field">
          <label htmlFor={ids.photo}>Foto (opcional)</label>
          <p className="hint" id={ids.photoHint}>
            Una foto cercana ayuda a generar confianza. Se reduce
            automáticamente para que no pese.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {photo ? (
              // biome-ignore lint/performance/noImgElement: vista previa de un data URL en cliente; next/image no aplica
              <img
                src={photo}
                alt="Vista previa de tu foto"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  flex: "none",
                }}
              />
            ) : null}
            <input
              id={ids.photo}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePhotoChange}
              aria-describedby={ids.photoHint}
            />
            {photo ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setPhoto(null);
                  setPhotoError("");
                }}
              >
                Quitar
              </button>
            ) : null}
          </div>
          {photoError ? (
            <p className="form-error" role="alert">
              {photoError}
            </p>
          ) : null}
          <input type="hidden" name="photo" value={photo ?? ""} />
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Tu credencial profesional</legend>
        <p className="field-help">
          La revisa una persona del equipo para confirmar que puedes acompañar.
          Nunca se muestra públicamente. Con acreditar <strong>una</strong> vía
          basta.
        </p>

        <div className="checks" style={{ margin: "0 0 14px" }}>
          <label>
            <input
              name="nonClinicalHelper"
              type="checkbox"
              checked={nonClinical}
              onChange={(event) => setNonClinical(event.target.checked)}
            />
            Soy <strong>auxiliar no clínico</strong> (estudiante o voluntario/a
            sin credencial para ejercer). No hará falta número ni verificación,
            pero tu ficha mostrará la etiqueta “Auxiliar no Clínico”.
          </label>
        </div>

        {nonClinical ? (
          <p className="field-help" style={{ margin: 0 }}>
            Como auxiliar no clínico no necesitas credencial. Tu ficha mostrará
            la etiqueta <strong>“Auxiliar no Clínico”</strong> para que quien
            busca ayuda sepa que acompañas sin ser profesional con licencia.
          </p>
        ) : (
          <>
            <p className="field-help" style={{ margin: "0 0 10px" }}>
              <strong>Acredítate con una de estas tres vías</strong> (con una
              basta; las demás son opcionales):
            </p>

            <div className="field">
              <label htmlFor={ids.fpvNumber}>1. Número FPV</label>
              <p className="hint" id={ids.fpvHint}>
                Tu número de Psicólogo Federado. Si además añades tu cédula
                abajo, verificamos tu registro al instante en la Federación de
                Psicólogos de Venezuela y tu perfil queda marcado como
                verificado.
              </p>
              <input
                id={ids.fpvNumber}
                name="fpvNumber"
                aria-describedby={ids.fpvHint}
              />
              <label
                htmlFor={ids.cedula}
                style={{ marginTop: "10px", display: "block" }}
              >
                Cédula <span className="muted">(opcional, para verificar)</span>
              </label>
              <p className="hint" id={ids.cedulaHint}>
                Solo se usa para confirmar tu Nº FPV con la Federación en este
                momento. No la guardamos ni se muestra en tu perfil.
              </p>
              <input
                id={ids.cedula}
                name="cedula"
                inputMode="numeric"
                autoComplete="off"
                aria-describedby={ids.cedulaHint}
              />
            </div>

            <div className="field">
              <label htmlFor={ids.supervisionInfo}>
                2. Trabajo bajo supervisión
              </label>
              <p className="hint" id={ids.supervisionHint}>
                ¿Quién te supervisa y en qué institución? (p. ej. prácticas,
                Ministerio de Educación, o trabajo clínico/educativo
                supervisado).
              </p>
              <input
                id={ids.supervisionInfo}
                name="supervisionInfo"
                aria-describedby={ids.supervisionHint}
              />
            </div>

            <div className="field">
              <label htmlFor={ids.registrationType}>
                3. Comprobante de registro
              </label>
              <p className="hint" id={ids.registrationHint}>
                Elige dónde estás registrado/a y sube el comprobante (imagen o
                PDF).
              </p>
              <select
                id={ids.registrationType}
                name="registrationType"
                value={registrationType}
                onChange={(event) => setRegistrationType(event.target.value)}
                aria-describedby={ids.registrationHint}
              >
                <option value="">— Selecciona (opcional) —</option>
                <option value="ministerio_educacion">
                  Registro en el Ministerio de Educación
                </option>
                <option value="colegio_psicologos">
                  Colegio de Psicólogos de tu jurisdicción
                </option>
                <option value="inprepsi">Membresía en INPREPSI</option>
              </select>
            </div>

            {registrationType ? (
              <>
                <div className="field">
                  <label htmlFor={ids.registrationDetail}>
                    Jurisdicción o número de registro (opcional)
                  </label>
                  <input
                    id={ids.registrationDetail}
                    name="registrationDetail"
                  />
                </div>
                <div className="field">
                  <label htmlFor={ids.registrationProof}>
                    Comprobante (imagen o PDF) *
                  </label>
                  <p className="hint" id={ids.registrationProofHint}>
                    Foto legible o PDF del carnet/constancia. Máx ~1 MB.
                  </p>
                  <input
                    id={ids.registrationProof}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={handleProofChange}
                    required={!proofDoc}
                    aria-describedby={ids.registrationProofHint}
                  />
                  {proofDoc ? (
                    <p className="hint" role="status">
                      Documento cargado ✓ {proofName}
                    </p>
                  ) : null}
                  {proofError ? (
                    <p className="form-error" role="alert">
                      {proofError}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            <input
              type="hidden"
              name="registrationProofDoc"
              value={proofDoc ?? ""}
            />

            <div className="grid grid-2">
              <div className="field">
                <label htmlFor={ids.licenseNumber}>
                  Credencial o licencia (opcional)
                </label>
                <p className="hint" id={ids.licenseHint}>
                  Si tienes otro número de colegiatura o licencia, indícalo.
                </p>
                <input
                  id={ids.licenseNumber}
                  name="licenseNumber"
                  aria-describedby={ids.licenseHint}
                />
              </div>
              <div className="field">
                <label htmlFor={ids.licenseCountry}>
                  País de la credencial
                </label>
                <select
                  id={ids.licenseCountry}
                  name="licenseCountry"
                  defaultValue="Venezuela"
                >
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor={ids.university}>
                Universidad donde obtuviste tu título *
              </label>
              <p className="hint" id={ids.universityHint}>
                La institución que emitió tu título profesional.
              </p>
              <input
                id={ids.university}
                name="university"
                required
                aria-describedby={ids.universityHint}
              />
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="card">
        <legend>Cómo y a quién quieres acompañar</legend>
        <p className="field-help">
          Tú defines tus límites. Todo esto lo puedes cambiar más adelante.
        </p>

        <fieldset
          style={{
            border: 0,
            margin: 0,
            padding: 0,
            minInlineSize: "auto",
          }}
        >
          <legend style={{ fontWeight: 600, margin: "0 0 6px", padding: 0 }}>
            Áreas de especialización *
          </legend>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Marca aquello en lo que tienes más experiencia.
          </p>
          <div className="checks">
            {needCategories.map((value) => (
              <label key={value}>
                <input name="supportAreas" type="checkbox" value={value} />
                {needLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor={ids.maxActiveRequests}>
            ¿A cuántas personas quieres acompañar a la vez?
          </label>
          <p className="hint" id={ids.maxHint}>
            Tú decides tu límite. Empieza con lo que te resulte sostenible.
          </p>
          <input
            id={ids.maxActiveRequests}
            name="maxActiveRequests"
            type="number"
            min="1"
            max="10"
            defaultValue="3"
            aria-describedby={ids.maxHint}
          />
        </div>

        <div className="checks">
          <label>
            <input name="remoteAvailable" type="checkbox" defaultChecked />
            Estoy disponible para acompañar en remoto.
          </label>
          <label>
            <input name="acceptingRequests" type="checkbox" defaultChecked />
            Quiero recibir solicitudes desde ya.
          </label>
          <label>
            <input name="crisisExperience" type="checkbox" />
            Tengo experiencia acompañando situaciones de crisis.
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Tu presentación y cómo te coordinamos</legend>
        <div className="field">
          <label htmlFor={ids.shortBio}>Bio breve</label>
          <p className="hint" id={ids.shortBioHint}>
            Unas líneas cálidas sobre cómo acompañas. Ayuda a que la persona se
            sienta en confianza.
          </p>
          <textarea
            id={ids.shortBio}
            name="shortBio"
            rows={4}
            aria-describedby={ids.shortBioHint}
          />
        </div>
        <p className="field-help" style={{ margin: "0 0 8px" }}>
          <strong>¿Cómo quieres que te contacten?</strong> Elige al menos una
          vía. Cada una aparece en tu ficha como botón para contactarte al
          instante.
        </p>
        <div className="checks" style={{ margin: "0 0 10px" }}>
          <label>
            <input
              name="emailPublic"
              type="checkbox"
              checked={emailPublic}
              onChange={(event) => setEmailPublic(event.target.checked)}
            />
            Mostrar mi correo <strong>{email}</strong> para que me escriban.
          </label>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor={ids.phone}>WhatsApp</label>
            <p className="hint" id={ids.phoneHint}>
              Aparece como botón de WhatsApp y llamada. Si estás fuera de
              Venezuela, incluye el código de país (ej. +57…).
            </p>
            <input
              id={ids.phone}
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required={!emailPublic && !landline.trim()}
              aria-describedby={ids.phoneHint}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.landline}>Teléfono fijo</label>
            <p className="hint" id={ids.landlineHint}>
              Aparece como botón de llamada. Útil si prefieres que te llamen a
              un número fijo.
            </p>
            <input
              id={ids.landline}
              name="landline"
              type="tel"
              autoComplete="tel"
              value={landline}
              onChange={(event) => setLandline(event.target.value)}
              required={!emailPublic && !phone.trim()}
              aria-describedby={ids.landlineHint}
            />
          </div>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor={ids.contactEmail}>Correo para coordinación</label>
            <p className="hint" id={ids.contactEmailHint}>
              Lo usa el equipo para coordinar contigo. No se comparte con las
              personas.
            </p>
            <input
              id={ids.contactEmail}
              name="contactEmail"
              type="email"
              defaultValue={email}
              aria-describedby={ids.contactEmailHint}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.contactNotes}>Notas para coordinación</label>
            <textarea id={ids.contactNotes} name="contactNotes" rows={3} />
          </div>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Nuestro acuerdo compartido *</legend>
        <p className="field-help">
          Esto cuida tanto a quien pide ayuda como a ti.
        </p>
        <div className="checks">
          <label>
            <input name="conductFreeService" type="checkbox" required />
            Acepto que el servicio es gratuito para las personas contactadas
            mediante Nido.
          </label>
          <label>
            <input name="conductNoClientCapture" type="checkbox" required />
            Acepto no usar Nido para captar clientes pagos ni hacer publicidad
            engañosa.
          </label>
          <label>
            <input name="conductConfidentiality" type="checkbox" required />
            Acepto mantener confidencialidad sobre la información recibida.
          </label>
          <label>
            <input
              name="conductNoEmergencyGuarantee"
              type="checkbox"
              required
            />
            Entiendo que Nido no garantiza respuesta de emergencia.
          </label>
          <label>
            <input name="conductCompetence" type="checkbox" required />
            Acepto trabajar solo dentro de mi competencia profesional.
          </label>
        </div>
      </fieldset>

      {state && !state.ok ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {state.message}
        </p>
      ) : null}
      <button
        className="button human block"
        disabled={pending}
        aria-busy={pending}
        type="submit"
      >
        {pending ? "Enviando tu perfil…" : "Quiero empezar a ayudar"}
      </button>
    </form>
  );
}
