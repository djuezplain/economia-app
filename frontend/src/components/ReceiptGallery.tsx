import { Link } from 'react-router-dom';
import type { ReceiptSummary } from '../api/groceries';
import { localToday, warrantyStatus } from '../pages/receipt-warranty';
import { ReceiptThumbnail } from './ReceiptThumbnail';
import { TagList } from './TagChip';

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Spec 051 H6 criterio 2: los tickets como tarjetas con su miniatura,
 * comercio, fecha, total, etiquetas, nota y garantía. Toda la tarjeta
 * enlaza al detalle.
 */
export function ReceiptGallery({ receipts }: { receipts: ReceiptSummary[] }) {
  const today = localToday();
  return (
    <ul className="receipt-gallery" aria-label="Galería de tickets">
      {receipts.map((receipt) => {
        const status = warrantyStatus(receipt.warrantyUntil, today);
        return (
          <li key={receipt.id} className="receipt-gallery-item">
            <Link to={`/tickets/${receipt.id}`} className="receipt-gallery-card" aria-label={`${receipt.supermarketName}, ${shortDate(receipt.date)}`}>
              <ReceiptThumbnail receiptId={receipt.id} document={receipt.document} label={`Ticket de ${receipt.supermarketName}`} />
              <span className="receipt-gallery-body">
                <span className="receipt-gallery-title">{receipt.supermarketName}</span>
                <span className="card-meta">
                  {shortDate(receipt.date)} · {receipt.total !== null ? `${receipt.total} €` : '—'}
                  {receipt.hasNote && <span aria-label="con nota"> · 📝</span>}
                  {status !== 'none' && (
                    <span className={`warranty-status warranty-${status}`} aria-label={status === 'expired' ? 'garantía caducada' : status === 'expiring' ? 'garantía a punto de caducar' : 'con garantía'}>
                      {' '}
                      · 🛡️
                    </span>
                  )}
                </span>
              </span>
            </Link>
            <TagList tags={receipt.tags} />
          </li>
        );
      })}
    </ul>
  );
}
