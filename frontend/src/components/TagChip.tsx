import type { ReactNode } from 'react';
import type { ReceiptTag } from '../api/receipt-tags';

/** Spec 051 H1: una etiqueta con su color (o neutra si no tiene). */
export function TagChip({ tag, children }: { tag: Pick<ReceiptTag, 'name' | 'color'>; children?: ReactNode }) {
  return (
    <span className="receipt-tag" data-color={tag.color ?? 'none'}>
      {tag.name}
      {children}
    </span>
  );
}

export function TagList({ tags }: { tags: ReceiptTag[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="receipt-tag-list" aria-label="Etiquetas">
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
    </span>
  );
}
