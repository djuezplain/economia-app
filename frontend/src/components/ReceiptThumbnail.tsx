import { useEffect, useRef, useState } from 'react';
import { getReceiptThumbnail } from '../api/groceries';
import type { ReceiptDocumentInfo } from '../api/groceries';

/**
 * Spec 051 H6 criterio 4: la miniatura se pide solo cuando la tarjeta entra
 * en pantalla (o enseguida si el navegador no tiene `IntersectionObserver`),
 * y su URL de objeto se libera al desmontar. PDF, ticket sin documento o
 * miniatura que no carga: un icono.
 */
export function ReceiptThumbnail({ receiptId, document, label }: { receiptId: string; document: ReceiptDocumentInfo | null; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  // Sin `IntersectionObserver` (navegadores antiguos, tests) se carga enseguida.
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = document !== null && document.mimeType !== 'application/pdf';

  useEffect(() => {
    if (!isImage || isVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [isImage, isVisible]);

  useEffect(() => {
    if (!isVisible || !document || !isImage) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    getReceiptThumbnail(receiptId, document.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isVisible, receiptId, document, isImage]);

  let icon: string | null = null;
  if (!document) icon = '🧾';
  else if (!isImage) icon = '📄';
  else if (failed) icon = '🖼️';

  return (
    <div ref={container} className="receipt-thumb">
      {icon ? (
        <span className="receipt-thumb-icon" aria-label={!document ? 'Sin documento' : !isImage ? 'PDF' : 'Foto'}>
          {icon}
        </span>
      ) : url ? (
        <img src={url} alt={label} />
      ) : (
        <span className="receipt-thumb-loading" aria-hidden="true" />
      )}
    </div>
  );
}
