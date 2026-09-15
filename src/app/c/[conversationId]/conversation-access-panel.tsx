import Link from "next/link";
import { requestAccessLinks } from "@/app/acceso/actions";
import { QuickExit } from "@/components/quick-exit";

/**
 * Pantalla que ve quien abre el enlace de una conversación en OTRO navegador
 * (o con la sesión caducada): en vez de un 404 frío que parece un fallo,
 * explica que la sala es privada y ofrece el enlace mágico por correo. La
 * conversación existe; solo falta la credencial de este dispositivo.
 */
export function ConversationAccessPanel() {
  return (
    <>
      <QuickExit />
      <h1>Esta conversación es privada</h1>
      <p className="lead">
        El enlace solo abre la conversación en el navegador donde la empezaste
        —es una medida de privacidad—. Para entrar desde este dispositivo, pide
        un enlace de acceso con el correo que dejaste.
      </p>
      <form action={requestAccessLinks} className="card">
        <label htmlFor="acceso-conversacion-email">Tu correo</label>
        <input
          id="acceso-conversacion-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          placeholder="tucorreo@ejemplo.com"
        />
        <p>
          <button className="button human" type="submit">
            Enviarme el enlace
          </button>
        </p>
        <p className="hint">
          Te enviamos enlaces frescos a tus conversaciones vivas (hasta 5).
          Revisa también la carpeta de spam. Por tu privacidad, no decimos si un
          correo tiene conversaciones o no.
        </p>
      </form>
      <p className="muted">
        ¿No dejaste correo al crear el chat o ya no puedes acceder a él?{" "}
        <Link href="/ayuda">Pide apoyo de nuevo</Link> o{" "}
        <Link href="/contacto">escríbenos</Link>.
      </p>
    </>
  );
}
