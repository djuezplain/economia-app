import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getProfile, updateProfile, changePassword } from '../api/users';
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

  // Formulario de cambio de contraseña (H7 criterio 2).
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(null);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
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
            <p>Email: {profile.email}</p>

            <form onSubmit={handleProfileSubmit} noValidate>
              <div>
                <label htmlFor="name">Nombre</label>
                <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div>
                <label htmlFor="currency">Moneda</label>
                <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="locale">Idioma</label>
                <select id="locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
                  {LOCALES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {profileError && <p role="alert">{profileError}</p>}
              {profileSaved && <p>Cambios guardados.</p>}

              <button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </form>
          </section>

          <section>
            <h2>Cambiar contraseña</h2>
            <form onSubmit={handlePasswordSubmit} noValidate>
              <div>
                <label htmlFor="currentPassword">Contraseña actual</label>
                <input
                  id="currentPassword"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="newPassword">Contraseña nueva</label>
                <input
                  id="newPassword"
                  type="password"
                  required
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

              <button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? 'Cambiando…' : 'Cambiar contraseña'}
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
