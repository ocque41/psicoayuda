export type RegistrationAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  emailVerified: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function selectIncompleteRegistrations(
  accounts: RegistrationAccount[],
  professionalUserIds: string[],
  adminEmails: string[],
) {
  const completedUserIds = new Set(professionalUserIds);
  const administratorEmails = new Set(
    adminEmails.map(normalizeEmail).filter(Boolean),
  );

  return accounts
    .filter(
      (account) =>
        !completedUserIds.has(account.id) &&
        !administratorEmails.has(normalizeEmail(account.email)),
    )
    .sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
}

const accountDateFormatter = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "medium",
  timeZone: "America/Caracas",
});

export function IncompleteRegistrationsSection({
  registrations,
}: {
  registrations: RegistrationAccount[];
}) {
  return (
    <>
      <h2>Registros incompletos</h2>
      <p className="muted">Total: {registrations.length}</p>
      <p className="muted">
        Estas cuentas se conservan. La persona puede entrar con el mismo método
        que usó al registrarse y terminar su perfil. Al completarlo, dejará de
        aparecer aquí automáticamente.
      </p>

      {registrations.length > 0 ? (
        <div className="table-wrap">
          <table aria-label="Registros incompletos">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Creación de la cuenta</th>
                <th>Correo verificado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => (
                <tr key={registration.id}>
                  <td>
                    <strong>{registration.name}</strong>
                  </td>
                  <td>{registration.email}</td>
                  <td>
                    <time dateTime={registration.createdAt.toISOString()}>
                      {accountDateFormatter.format(registration.createdAt)}
                    </time>
                  </td>
                  <td>
                    {registration.emailVerified
                      ? "Verificado"
                      : "Sin verificar"}
                  </td>
                  <td>
                    <span className="badge badge-new">
                      Onboarding incompleto
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No hay registros incompletos.</p>
      )}
    </>
  );
}
