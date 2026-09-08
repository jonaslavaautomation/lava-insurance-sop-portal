import { useEffect, useRef, useState } from 'react';
import { Loader2, ScanEye, Check, X as XIcon, Info } from 'lucide-react';

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  accepted: boolean;
  manual: boolean;
}

interface DraftBox {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

const DISPLAY_MAX_WIDTH = 720;

/**
 * Lets an admin black out sensitive info in an extracted screenshot before
 * it's attached to an SOP. Runs an on-device OCR scan on open and
 * auto-suggests boxes for things it can recognize (emails, phones, VINs,
 * ZIP codes, and labeled fields like "Name:"/"Policy #:") — click a
 * suggestion to accept/reject it. Click-and-drag directly on the image to
 * add your own box for anything the scan misses (an agency name with no
 * label, for instance). Nothing is redacted until "Apply".
 */
export function ImageRedactor({
  dataUrl,
  onApply,
  onCancel,
}: {
  dataUrl: string;
  onApply: (redactedDataUrl: string) => void;
  onCancel: () => void;
}) {
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftBox | null>(null);

  useEffect(() => {
    let cancelled = false;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      imgElRef.current = img;
    };
    img.src = dataUrl;

    async function scan() {
      setScanning(true);
      setScanError(null);
      try {
        const [Tesseract, { detectSensitiveRegions }] = await Promise.all([
          import('tesseract.js'),
          import('@/lib/detectSensitiveRegions'),
        ]);
        const worker = await Tesseract.createWorker('eng');
        // { blocks: true } is required — without it, data.blocks comes back
        // null and word-level bounding boxes (which suggestions are built
        // from) simply aren't computed.
        const { data } = await worker.recognize(dataUrl, {}, { blocks: true });
        await worker.terminate();
        if (cancelled) return;

        const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
        const regions = detectSensitiveRegions(lines);
        setBoxes(
          regions.map((r, i) => ({
            id: `auto-${i}`,
            x: r.x0,
            y: r.y0,
            width: r.x1 - r.x0,
            height: r.y1 - r.y0,
            reason: r.reason,
            accepted: true,
            manual: false,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setScanError('Automatic scan failed — you can still draw boxes by hand below.');
          console.error('OCR scan failed:', err);
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    }
    scan();

    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  const scale = natural ? Math.min(DISPLAY_MAX_WIDTH / natural.w, 1) : 1;
  const displayW = natural ? natural.w * scale : 0;
  const displayH = natural ? natural.h * scale : 0;

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDraft({ startX: x, startY: y, curX: x, curY: y });
  }
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!draft) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDraft({ ...draft, curX: e.clientX - rect.left, curY: e.clientY - rect.top });
  }
  function handleMouseUp() {
    if (!draft) return;
    const x0 = Math.min(draft.startX, draft.curX);
    const y0 = Math.min(draft.startY, draft.curY);
    const w = Math.abs(draft.curX - draft.startX);
    const h = Math.abs(draft.curY - draft.startY);
    if (w > 4 && h > 4) {
      setBoxes((prev) => [
        ...prev,
        {
          id: `manual-${Date.now()}-${prev.length}`,
          x: x0 / scale,
          y: y0 / scale,
          width: w / scale,
          height: h / scale,
          reason: 'Manual',
          accepted: true,
          manual: true,
        },
      ]);
    }
    setDraft(null);
  }

  function toggleOrRemove(box: Box) {
    if (box.manual) {
      setBoxes((prev) => prev.filter((b) => b.id !== box.id));
    } else {
      setBoxes((prev) => prev.map((b) => (b.id === box.id ? { ...b, accepted: !b.accepted } : b)));
    }
  }

  function applyRedactions() {
    if (!natural || !imgElRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = natural.w;
    canvas.height = natural.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgElRef.current, 0, 0);
    ctx.fillStyle = '#000000';
    const pad = 3;
    for (const b of boxes) {
      if (!b.accepted) continue;
      ctx.fillRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    }
    onApply(canvas.toDataURL('image/png'));
  }

  const acceptedCount = boxes.filter((b) => b.accepted).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {scanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              Scanning for sensitive text…
            </>
          ) : (
            <>
              <ScanEye className="w-4 h-4 text-slate-400" />
              {boxes.length > 0
                ? `${acceptedCount} of ${boxes.length} box${boxes.length !== 1 ? 'es' : ''} will be redacted`
                : 'No sensitive text auto-detected — draw a box over anything that needs hiding'}
            </>
          )}
        </div>
      </div>

      {scanError && (
        <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0" /> {scanError}
        </div>
      )}

      <p className="text-xs text-slate-400 mb-2">
        Click a suggested box to toggle it off/on. Click a box you drew to remove it. Drag on the image to add a new one.
      </p>

      <div
        className="relative select-none border border-slate-200 rounded-lg overflow-hidden bg-slate-100 mx-auto"
        style={{ width: displayW || '100%', height: displayH || 300, cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {natural && (
          <img src={dataUrl} alt="Extracted screenshot" style={{ width: displayW, height: displayH, display: 'block' }} draggable={false} />
        )}

        {boxes.map((b) => (
          <div
            key={b.id}
            onClick={(e) => {
              e.stopPropagation();
              toggleOrRemove(b);
            }}
            title={b.manual ? 'Click to remove' : `${b.reason} — click to ${b.accepted ? 'unredact' : 'redact'}`}
            className="absolute flex items-center justify-center"
            style={{
              left: b.x * scale,
              top: b.y * scale,
              width: b.width * scale,
              height: b.height * scale,
              background: b.accepted ? 'rgba(15,15,15,0.85)' : 'rgba(234,179,8,0.2)',
              border: b.accepted ? '1px solid #000' : '2px dashed #eab308',
              cursor: 'pointer',
            }}
          >
            {!b.accepted && <span className="text-[9px] font-medium text-amber-800 bg-amber-100 px-1 rounded">off</span>}
          </div>
        ))}

        {draft && (
          <div
            className="absolute border-2 border-dashed border-brand-600 bg-brand-600/10"
            style={{
              left: Math.min(draft.startX, draft.curX),
              top: Math.min(draft.startY, draft.curY),
              width: Math.abs(draft.curX - draft.startX),
              height: Math.abs(draft.curY - draft.startY),
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={applyRedactions}
          disabled={!natural}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          Apply {acceptedCount > 0 ? `& redact ${acceptedCount}` : '(no redactions)'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5"
        >
          <XIcon className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
