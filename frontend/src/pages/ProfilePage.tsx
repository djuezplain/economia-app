import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getProfile, updateProfile, changePassword, deleteAccount } from '../api/users';
import type { UserProfile } from '../api/users';
import { ApiError } from '../api/client';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../validators/password';

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const LOCALES: Array<{ value: string; label: string }> = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

export function ProfilePage() {
  const { isAuthenticated, isLoading: isAuthLoading, logout } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Formulario de datos de perfil (H7 criterio 1).
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [locale, setLocale] = useState('es');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Spec 049 H1 criterio 6: interruptor global de avisos de recibos.
  const [isSavingReminders, setIsSavingReminders] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);

  // Formulario de cambio de contraseña (H7 criterio 2).
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(null);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Eliminar cuenta (H8 criterio 2 — panel de confirmación explícita).
  const [isDeletePanelOpen, setIsDeletePanelOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getProfile();
        if (cancelled) return;
        setProfile(p);
        setName(p.name);
        setCurrency(p.currency);
        setLocale(p.locale);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar tu perfil.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setIsSavingProfile(true);
    try {
      const updated = await updateProfile({ name, currency, locale });
      setProfile(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'No se han podido guardar los cambios.');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleToggleReminders(enabled: boolean) {
    setRemindersError(null);
    setIsSavingReminders(true);
    try {
      setProfile(await updateProfile({ recurringReminderEmails: enabled }));
    } catch (err) {
      setRemindersError(err instanceof ApiError ? err.message : 'No se ha podido guardar la preferencia de avisos.');
    } finally {
      setIsSavingReminders(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFormError(null);

    if (!isStrongPassword(newPassword)) {
      setPasswordFieldError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    setPasswordFieldError(null);

    setIsChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      // H7 criterio 2 / nota en users.service.ts: cambiar la contraseña
      // revoca todas las sesiones, incluida esta — se cierra la sesión local
      // también aquí, en vez de dejar que el usuario se encuentre con un
      // fallo confuso en el próximo refresco automático.
      setPasswordChanged(true);
      try {
        await logout();
      } catch {
        // El backend ya ha revocado todas las sesiones (users.service.ts);
        // un fallo de red aquí no cambia ese resultado, solo el aviso local.
      }
    } catch (err) {
      setPasswordFormError(
        err instanceof ApiError ? err.message : 'No se ha podido cambiar la contraseña.',
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    setIsDeleting(true);
    try {
      // H8 criterio 2: "reintroducir contraseña o email" según lo que la
      // cuenta tenga disponible (backend: DeleteAccountDto / UsersService).
      await deleteAccount(
        profile?.hasPassword ? { password: deletePassword } : { confirmEmail: deleteConfirmEmail },
      );
      setAccountDeleted(true);
      try {
        await logout();
      } catch {
        // La cuenta ya no existe (el backend acaba de borrarla): un intento
        // de logout contra el servidor fallará (401), pero eso no cambia
        // nada — solo interesa limpiar el estado local.
      }
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la cuenta.');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
      </main>
    );
  }

  if (accountDeleted) {
    // Misma razón que `passwordChanged` más abajo: el borrado acaba de
    // cerrar la sesión local, así que tiene que comprobarse antes que
    // `isAuthenticated`.
    return (
      <main>
        <h1>Cuenta eliminada</h1>
        <p>Tu cuenta y todos tus datos se han eliminado de forma permanente e inmediata.</p>
        <p>
          <Link to="/">Volver al inicio</Link>
        </p>
      </main>
    );
  }

  if (passwordChanged) {
    // Comprobar esto ANTES que `isAuthenticated`: cambiar la contraseña
    // acaba de cerrar la sesión local a propósito (ver handlePasswordSubmit),
    // así que en este punto `isAuthenticated` ya es `false` — sin este orden,
    // la rama de abajo taparía este aviso con el genérico "tienes que iniciar
    // sesión".
    return (
      <main>
        <h1>Contraseña actualizada</h1>
        <p>Por seguridad, se ha cerrado la sesión en todos los dispositivos. Vuelve a iniciar sesión.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Tu perfil</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Tu perfil</h1>

      {loadError && <p role="alert">{loadError}</p>}

      {profile && (
        <>
          <section>
            <h2>Datos de la cuenta</h2>
            <div className="card elev-sm">
              <div className="field">
                {/* No `htmlFor`/`id`: no es un control de formulario real (no
                    editable, ver `constitution.md` T7.1), solo toma el estilo
                    visual de `.field > label` + `<p>` que pide el handoff. */}
                <label>Email</label>
                <p>{profile.email}</p>
              </div>

              <form onSubmit={handleProfileSubmit} noValidate>
                <div className="field">
                  <label htmlFor="name">Nombre</label>
                  <input
                    id="name"
                    type="text"
                    required
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="currency">Moneda</label>
                  <select id="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="locale">Idioma</label>
                  <select id="locale" className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
                    {LOCALES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                {profileError && <p role="alert">{profileError}</p>}
                {profileSaved && <p>Cambios guardados.</p>}

                <button type="submit" className="btn btn-primary" disabled={isSavingProfile}>
                  {isSavingProfile ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </form>
            </div>
          </section>

          <section aria-label="Avisos">
            <h2>Avisos</h2>
            <div className="card elev-sm">
              <div className="field">
                <label htmlFor="recurring-reminder-emails">
                  <input
                    id="recurring-reminder-emails"
                    type="checkbox"
                    checked={profile.recurringReminderEmails}
                    disabled={isSavingReminders}
                    onChange={(e) => void handleToggleReminders(e.target.checked)}
                  />{' '}
                  Avisos de recibos por email
                </label>
                <p className="card-meta">
                  Emails antes de que venzan los recibos recurrentes que tengan el aviso activado. Apagándolo aquí no se envía ninguno,
                  sin cambiar la configuración de cada recibo.
                </p>
              </div>
              {remindersError && <p role="alert">{remindersError}</p>}
            </div>
          </section>

          <section>
            <h2>Cambiar contraseña</h2>
            <div className="card elev-sm">
              <form onSubmit={handlePasswordSubmit} noValidate>
                <div className="field">
                  <label htmlFor="currentPassword">Contraseña actual</label>
                  <input
                    id="currentPassword"
                    type="password"
                    required
                    className="input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="newPassword">Contraseña nueva</label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    className="input"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passwordFieldError) setPasswordFieldError(null);
                    }}
                    aria-describedby="new-password-help"
                  />
                  <p id="new-password-help">{PASSWORD_POLICY_MESSAGE}</p>
                  {passwordFieldError && <p role="alert">{passwordFieldError}</p>}
                </div>

                {passwordFormError && <p role="alert">{passwordFormError}</p>}

                <button type="submit" className="btn btn-primary" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Cambiando…' : 'Cambiar contraseña'}
                </button>
              </form>
            </div>
          </section>

          <section>
            <h2>Mi cuenta</h2>

            {/* Spec 032 (H1/H3): "Exportar mis datos" se muda a su propia
                página, junto con la importación — un único sitio, en vez de
                mantener el mismo botón aquí también. */}
            <div className="card elev-sm">
              <p className="card-body">Exporta todos tus datos, o importa un fichero exportado antes, desde Copia de seguridad.</p>
              <div>
                <Link to="/backup" className="btn btn-secondary">
                  Ir a Copia de seguridad
                </Link>
              </div>
            </div>

            {/* Spec 010 (rediseño editorial), plan.md §4.7: tarjeta propia y
                separada de "Mi cuenta" — botón de aspecto discreto (`.btn-ghost`,
                no `.btn-primary`) a propósito, para no invitar al clic
                accidental en una acción irreversible. */}
            <div className="card elev-sm">
              <h3 className="card-title">Eliminar cuenta</h3>

              {!isDeletePanelOpen && (
                <div>
                  <button type="button" className="btn btn-ghost" onClick={() => setIsDeletePanelOpen(true)}>
                    Eliminar cuenta
                  </button>
                </div>
              )}

              {isDeletePanelOpen && (
                <form onSubmit={handleDeleteAccount} noValidate>
                  <p role="alert">
                    Esto eliminará tu cuenta y todos tus datos de forma <strong>inmediata e irreversible</strong>:
                    no hay periodo de gracia ni forma de recuperarlos después.
                  </p>

                  {profile.hasPassword ? (
                    <div className="field">
                      <label htmlFor="deletePassword">Repite tu contraseña para confirmar</label>
                      <input
                        id="deletePassword"
                        type="password"
                        required
                        className="input"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="field">
                      <label htmlFor="deleteConfirmEmail">
                        Esta cuenta no tiene contraseña (usas Google) — escribe tu email para confirmar
                      </label>
                      <input
                        id="deleteConfirmEmail"
                        type="email"
                        required
                        className="input"
                        value={deleteConfirmEmail}
                        onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {deleteError && <p role="alert">{deleteError}</p>}

                  <button type="submit" className="btn btn-ghost" disabled={isDeleting}>
                    {isDeleting ? 'Eliminando…' : 'Eliminar cuenta definitivamente'}
                  </button>{' '}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isDeleting}
                    onClick={() => {
                      setIsDeletePanelOpen(false);
                      setDeleteError(null);
                      setDeletePassword('');
                      setDeleteConfirmEmail('');
                    }}
                  >
                    Cancelar
                  </button>
                </form>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
