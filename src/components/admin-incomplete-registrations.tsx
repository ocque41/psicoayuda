import { AdminDeleteAccountForm } from "@/components/admin-delete-account-form";

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
  deleteAction,
}: {
  registrations: RegistrationAccount[];
  deleteAction?: (formData: FormData) => Promise<void>;
}) {
  return (
    <>
      <h2>Registros incompletos</h2>
      <p className="muted">Total: {registrations.length}</p>

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
                {deleteAction ? <th>Acción</th> : null}
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
                  {deleteAction ? (
                    <td>
                      <AdminDeleteAccountForm
                        action={deleteAction}
                        userId={registration.id}
                        accountLabel={registration.email}
                      />
                    </td>
                  ) : null}
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
