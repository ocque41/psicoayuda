import Link from "next/link";

export function PaymentConnections() {
  return (
    <>
      <section className="workspace-card">
        <p className="eyebrow">Pagos en cuotas</p>
        <h3>Cashea</h3>
        <span className="workspace-tag">Sin conexión automática</span>
        <p>
          Si tu comercio está afiliado y Cashea acepta tus servicios, puedes
          cobrar por su canal autorizado y registrar el pago recibido en Nido
          con el método Cashea.
        </p>
        <p className="hint">
          Nido no crea compras, financia cuotas ni confirma pagos en Cashea.
          Para ofrecerlo a tus pacientes, primero completa la afiliación y
          confirma con Cashea la venta de consultas y su modalidad online.
        </p>
        <p>
          <a
            className="button secondary"
            href="https://www.cashea.app/comercios"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver afiliación y condiciones ↗
          </a>
        </p>
        <Link className="link-arrow" href="/pro/cobros">
          Ver mis cobros externos →
        </Link>
      </section>
      <section className="workspace-card">
        <h3>Servicios y cobros</h3>
        <p>
          Gestiona precios, paquetes y acuerdos con tus pacientes desde tus
          servicios. Los pagos con tarjeta tienen su propia configuración y
          dependen de la disponibilidad de la cuenta de cobro.
        </p>
        <p>
          <Link className="button secondary" href="/pro/servicios">
            Configurar mis servicios
          </Link>
        </p>
        <Link className="link-arrow" href="/pro/dashboard#cobros">
          Revisar configuración de pagos →
        </Link>
      </section>
    </>
  );
}
