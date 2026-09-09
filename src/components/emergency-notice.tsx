export function EmergencyNotice() {
  return (
    <div className="notice" role="note">
      <span aria-hidden="true">🛟</span>
      <span>
        <strong>Si es una emergencia ahora mismo</strong> y sientes que tu vida
        o la de alguien corre riesgo, por favor llama a emergencias locales o
        acude a un centro cercano: ahí podrán acompañarte de inmediato. Este
        espacio coordina apoyo psicológico por correo y no atiende crisis en
        tiempo real.
      </span>
    </div>
  );
}
