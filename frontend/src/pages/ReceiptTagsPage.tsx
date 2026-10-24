import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { createReceiptTag, deleteReceiptTag, listReceiptTags, RECEIPT_TAG_COLORS, TAG_COLOR_LABELS, updateReceiptTag } from '../api/receipt-tags';
import type { ReceiptTagColor, ReceiptTagWithCount } from '../api/receipt-tags';
import { ApiError } from '../api/client';
import { TagChip } from '../components/TagChip';

const NO_COLOR = '';

function ColorSelect({ id, value, onChange, disabled }: { id: string; value: ReceiptTagColor | null; onChange: (color: ReceiptTagColor | null) => void; disabled?: boolean }) {
  return (
    <select id={id} className="input" value={value ?? NO_COLOR} disabled={disabled} onChange={(e) => onChange(e.target.value === NO_COLOR ? null : (e.target.value as ReceiptTagColor))}>
      <option value={NO_COLOR}>Sin color</option>
      {RECEIPT_TAG_COLORS.map((color) => (
        <option key={color} value={color}>
          {TAG_COLOR_LABELS[color]}
        </option>
      ))}
    </select>
  );
}

function tagsLabel(count: number): string {
  if (count === 0) return 'Sin tickets';
  return count === 1 ? '1 ticket' : `${count} tickets`;
}

/**
 * Spec 051 H1 criterio 3: las etiquetas de los tickets — crear, renombrar,
 * cambiar el color y borrar (con confirmación), con cuántos tickets usa cada una.
 */
export function ReceiptTagsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [tags, setTags] = useState<ReceiptTagWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<ReceiptTagColor | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    listReceiptTags()
      .then(setTags)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se han podido cargar las etiquetas.'));
  }, [isAuthenticated]);

  async function run(id: string | null, action: () => Promise<void>, fallback: string) {
    setActionError(null);
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    await run(
      null,
      async () => {
        await createReceiptTag(newName, newColor);
        setTags(await listReceiptTags());
        setNewName('');
        setNewColor(null);
      },
      'No se ha podido crear la etiqueta.',
    );
    setIsCreating(false);
  }

  function patchLocal(id: string, changes: Partial<ReceiptTagWithCount>) {
    setTags((current) => (current ?? []).map((tag) => (tag.id === id ? { ...tag, ...changes } : tag)));
  }

  async function handleRename(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    await run(
      id,
      async () => {
        const updated = await updateReceiptTag(id, { name: renameValue });
        patchLocal(id, { name: updated.name });
        setRenamingId(null);
      },
      'No se ha podido renombrar la etiqueta.',
    );
  }

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Etiquetas</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  if (!isOnline) {
    return (
      <main>
        <h1>Etiquetas</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link to="/tickets">Volver al historial</Link>
      </p>
      <h1>Etiquetas</h1>
      <p>Agrupa tus tickets con etiquetas ("garantía", "trabajo", "regalo"…). También puedes crearlas desde cada ticket.</p>

      <form className="card tag-create-form" onSubmit={(e) => void handleCreate(e)} aria-label="Nueva etiqueta">
        <div className="field">
          <label htmlFor="new-tag-name">Nombre</label>
          <input id="new-tag-name" className="input" type="text" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-tag-color">Color</label>
          <ColorSelect id="new-tag-color" value={newColor} onChange={setNewColor} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isCreating || newName.trim() === ''}>
          {isCreating ? 'Creando…' : 'Crear etiqueta'}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
      {actionError && <p role="alert">{actionError}</p>}

      {tags && tags.length === 0 && <p>Todavía no tienes ninguna etiqueta.</p>}
      {tags && tags.length > 0 && (
        <ul className="tag-manager-list">
          {tags.map((tag) => (
            <li className="card" key={tag.id}>
              <div className="wealth-item-header">
                {renamingId === tag.id ? (
                  <form className="tag-rename-form" onSubmit={(e) => void handleRename(e, tag.id)} aria-label={`Renombrar ${tag.name}`}>
                    <label htmlFor={`rename-${tag.id}`} className="sr-only">
                      Nuevo nombre
                    </label>
                    <input id={`rename-${tag.id}`} className="input" type="text" maxLength={40} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                    <button type="submit" className="btn btn-primary" disabled={busyId === tag.id || renameValue.trim() === ''}>
                      Guardar
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setRenamingId(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <TagChip tag={tag} />
                )}
                <span className="card-meta">{tagsLabel(tag.receiptCount)}</span>
              </div>

              <div className="tag-manager-actions">
                <label htmlFor={`color-${tag.id}`} className="sr-only">
                  Color de {tag.name}
                </label>
                <ColorSelect
                  id={`color-${tag.id}`}
                  value={tag.color}
                  disabled={busyId === tag.id}
                  onChange={(color) =>
                    void run(
                      tag.id,
                      async () => {
                        await updateReceiptTag(tag.id, { color });
                        patchLocal(tag.id, { color });
                      },
                      'No se ha podido cambiar el color.',
                    )
                  }
                />
                {renamingId !== tag.id && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setRenamingId(tag.id);
                      setRenameValue(tag.name);
                    }}
                  >
                    Renombrar
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDeleteId(tag.id)}>
                  Borrar
                </button>
              </div>

              {confirmDeleteId === tag.id && (
                <p role="alert">
                  ¿Borrar la etiqueta "{tag.name}"? Se quitará de {tagsLabel(tag.receiptCount).toLowerCase()}; los tickets no se borran.{' '}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === tag.id}
                    onClick={() =>
                      void run(
                        tag.id,
                        async () => {
                          await deleteReceiptTag(tag.id);
                          setTags((current) => (current ?? []).filter((t) => t.id !== tag.id));
                          setConfirmDeleteId(null);
                        },
                        'No se ha podido borrar la etiqueta.',
                      )
                    }
                  >
                    Sí, borrar
                  </button>{' '}
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>
                    Cancelar
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
