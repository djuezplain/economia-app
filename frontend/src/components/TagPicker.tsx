import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { normalizeTagName } from '../api/receipt-tags';
import type { ReceiptTag } from '../api/receipt-tags';
import { TagChip } from './TagChip';
import type { TagPickerValue } from './tag-picker.types';

const MAX_SUGGESTIONS = 6;

/**
 * Spec 051 H1 criterios 1 y 5: chips de las etiquetas elegidas y un campo
 * con sugerencias. Intro (o "Añadir") añade la etiqueta existente con ese
 * nombre (sin distinguir mayúsculas ni tildes) o, si no hay, una nueva.
 * Controlado: quien lo usa decide cuándo guardar.
 */
export function TagPicker({
  available,
  value,
  onChange,
  disabled = false,
}: {
  available: ReceiptTag[];
  value: TagPickerValue;
  onChange: (value: TagPickerValue) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [text, setText] = useState('');

  const chosen = new Set([...value.existing.map((t) => normalizeTagName(t.name)), ...value.newNames.map(normalizeTagName)]);
  const query = normalizeTagName(text);
  const suggestions = available
    .filter((tag) => !chosen.has(normalizeTagName(tag.name)) && (query === '' || normalizeTagName(tag.name).includes(query)))
    .slice(0, MAX_SUGGESTIONS);

  function addExisting(tag: ReceiptTag) {
    onChange({ ...value, existing: [...value.existing, tag] });
    setText('');
  }

  function addFromText() {
    const name = text.trim().replace(/\s+/g, ' ');
    if (name === '' || name.length > 40) return;
    const key = normalizeTagName(name);
    if (chosen.has(key)) {
      setText('');
      return;
    }
    const match = available.find((tag) => normalizeTagName(tag.name) === key);
    if (match) {
      addExisting(match);
      return;
    }
    onChange({ ...value, newNames: [...value.newNames, name] });
    setText('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addFromText();
    }
  }

  return (
    <div className="tag-picker">
      {(value.existing.length > 0 || value.newNames.length > 0) && (
        <ul className="receipt-tag-list" aria-label="Etiquetas elegidas">
          {value.existing.map((tag) => (
            <li key={tag.id}>
              <TagChip tag={tag}>
                <button
                  type="button"
                  className="receipt-tag-remove"
                  disabled={disabled}
                  aria-label={`Quitar la etiqueta ${tag.name}`}
                  onClick={() => onChange({ ...value, existing: value.existing.filter((t) => t.id !== tag.id) })}
                >
                  ×
                </button>
              </TagChip>
            </li>
          ))}
          {value.newNames.map((name) => (
            <li key={`new-${name}`}>
              <TagChip tag={{ name, color: null }}>
                <span className="card-meta"> (nueva)</span>
                <button
                  type="button"
                  className="receipt-tag-remove"
                  disabled={disabled}
                  aria-label={`Quitar la etiqueta ${name}`}
                  onClick={() => onChange({ ...value, newNames: value.newNames.filter((n) => n !== name) })}
                >
                  ×
                </button>
              </TagChip>
            </li>
          ))}
        </ul>
      )}

      <div className="tag-picker-input">
        <label htmlFor={inputId} className="sr-only">
          Añadir una etiqueta
        </label>
        <input
          id={inputId}
          className="input"
          type="text"
          maxLength={40}
          placeholder="Añadir una etiqueta…"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="btn btn-secondary" disabled={disabled || text.trim() === ''} onClick={addFromText}>
          Añadir
        </button>
      </div>

      {suggestions.length > 0 && (
        <p className="tag-picker-suggestions">
          <span className="card-meta">Sugerencias: </span>
          {suggestions.map((tag) => (
            <button key={tag.id} type="button" className="tag-suggestion" disabled={disabled} onClick={() => addExisting(tag)} aria-label={`Añadir la etiqueta ${tag.name}`}>
              <TagChip tag={tag} />
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
