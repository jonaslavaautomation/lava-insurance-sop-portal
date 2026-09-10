import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanEye, Check, X as XIcon, Info, Square, ArrowUpRight, EyeOff, PenLine } from 'lucide-react';

type Tool = 'redact' | 'arrow' | 'highlight' | 'pen';

interface Point {
  x: number;
  y: number;
}

interface Shape {
  id: string;
  kind: Tool;
  // Rectangle shapes (redact/highlight): box in natural image px.
  x: number;
  y: number;
  width?: number;
  height?: number;
  // Arrow: end point in natural image px (x/y above is the start point).
  x2?: number;
  y2?: number;
  // Pen: the freehand stroke path, in natural image px.
  points?: Point[];
  reason: string;
  accepted: boolean; // only meaningful for kind === 'redact'; arrows/highlights/pen are always shown
  manual: boolean;
}

interface Draft {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  points?: Point[]; // pen only, in display px, grows as the stroke is drawn
}

const DISPLAY_MAX_WIDTH = 720;
const ARROW_COLOR = '#dc2626';
const PEN_COLOR = '#000000';

const TOOLS: { id: Tool; label: string; icon: typeof Square }[] = [
  { id: 'redact', label: 'Redact', icon: EyeOff },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'highlight', label: 'Highlight box', icon: Square },
  { id: 'pen', label: 'Pen', icon: PenLine },
];

/**
 * Lets an admin annotate an extracted screenshot before it's attached to an
 * SOP — two things in one tool:
 *
 *  - Redact: runs an on-device OCR scan on open and auto-suggests boxes for
 *    sensitive text it can recognize. Click a field's quick-mask chip to
 *    accept/reject every instance of that field at once, or click an
 *    individual box. Drag on the image with the Redact tool active to add
 *    a box for anything the scan missed. Applied areas are pixelated, not
 *    blurred or blacked out — a real mosaic that destroys the underlying
 *    pixels (unlike Gaussian blur, which can sometimes be reversed).
 *  - Arrow / Highlight box: Snipping-Tool-style callouts in red, for
 *    pointing out the exact spot in a process — not redaction, the
 *    opposite: drawing attention to something.
 *  - Pen: a freehand black ballpoint-pen line — circle something, underline
 *    it, jot a quick note, same as Snipping Tool's pen.
 *
 * Nothing is applied to the actual image until "Apply & Redact".
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
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tool, setTool] = useState<Tool>('redact');

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
        setShapes((prev) => [
          ...prev,
          ...regions.map(
            (r, i): Shape => ({
              id: `auto-${i}`,
              kind: 'redact',
              x: r.x0,
              y: r.y0,
              width: r.x1 - r.x0,
              height: r.y1 - r.y0,
              reason: r.reason,
              accepted: true,
              manual: false,
            })
          ),
        ]);
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

  // Suggested (OCR, non-manual) redaction boxes grouped by field type, for
  // the one-click "mask this whole field" bar.
  const fieldGroups = useMemo(() => {
    const map = new Map<string, Shape[]>();
    for (const s of shapes) {
      if (s.kind !== 'redact' || s.manual) continue;
      if (!map.has(s.reason)) map.set(s.reason, []);
      map.get(s.reason)!.push(s);
    }
    return [...map.entries()];
  }, [shapes]);

  function toggleFieldGroup(reason: string) {
    setShapes((prev) => {
      const group = prev.filter((s) => s.kind === 'redact' && !s.manual && s.reason === reason);
      const allAccepted = group.length > 0 && group.every((s) => s.accepted);
      return prev.map((s) => (s.kind === 'redact' && !s.manual && s.reason === reason ? { ...s, accepted: !allAccepted } : s));
    });
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDraft({ startX: x, startY: y, curX: x, curY: y, points: tool === 'pen' ? [{ x, y }] : undefined });
  }
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!draft) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDraft({
      ...draft,
      curX: x,
      curY: y,
      points: draft.points ? [...draft.points, { x, y }] : undefined,
    });
  }
  function handleMouseUp() {
    if (!draft) return;
    const dist = Math.hypot(draft.curX - draft.startX, draft.curY - draft.startY);

    if (tool === 'pen') {
      if (draft.points && draft.points.length > 1) {
        setShapes((prev) => [
          ...prev,
          {
            id: `pen-${Date.now()}`,
            kind: 'pen',
            x: draft.points![0].x / scale,
            y: draft.points![0].y / scale,
            points: draft.points!.map((p) => ({ x: p.x / scale, y: p.y / scale })),
            reason: 'Pen',
            accepted: true,
            manual: true,
          },
        ]);
      }
    } else if (tool === 'arrow') {
      if (dist > 12) {
        setShapes((prev) => [
          ...prev,
          {
            id: `arrow-${Date.now()}`,
            kind: 'arrow',
            x: draft.startX / scale,
            y: draft.startY / scale,
            x2: draft.curX / scale,
            y2: draft.curY / scale,
            reason: 'Pointer',
            accepted: true,
            manual: true,
          },
        ]);
      }
    } else {
      const x0 = Math.min(draft.startX, draft.curX);
      const y0 = Math.min(draft.startY, draft.curY);
      const w = Math.abs(draft.curX - draft.startX);
      const h = Math.abs(draft.curY - draft.startY);
      if (w > 4 && h > 4) {
        setShapes((prev) => [
          ...prev,
          {
            id: `${tool}-${Date.now()}`,
            kind: tool,
            x: x0 / scale,
            y: y0 / scale,
            width: w / scale,
            height: h / scale,
            reason: tool === 'redact' ? 'Manual' : 'Pointer',
            accepted: true,
            manual: true,
          },
        ]);
      }
    }
    setDraft(null);
  }

  function handleShapeClick(shape: Shape) {
    if (shape.manual) {
      setShapes((prev) => prev.filter((s) => s.id !== shape.id));
    } else {
      setShapes((prev) => prev.map((s) => (s.id === shape.id ? { ...s, accepted: !s.accepted } : s)));
    }
  }

  /**
   * True pixelation/mosaic, not blur: draws the region at a tiny size
   * (letting the browser average many source pixels into each one) then
   * draws that tiny result back up with smoothing off (hard block edges,
   * no interpolation). Unlike Gaussian blur, this genuinely destroys the
   * underlying detail — there's no way to mathematically reverse an
   * averaging step back to the original pixels, which is exactly why real
   * redaction tools (and broadcast face/plate blurring) use pixelation
   * instead of blur.
   */
  function pixelateRegion(ctx: CanvasRenderingContext2D, source: HTMLImageElement, x: number, y: number, width: number, height: number) {
    if (!natural || width <= 0 || height <= 0) return;
    // Clamp to the image bounds — drawImage throws if the source rect falls
    // outside the source image (a box near an edge, after padding, can).
    const sx = Math.max(0, x);
    const sy = Math.max(0, y);
    const sw = Math.min(natural.w, x + width) - sx;
    const sh = Math.min(natural.h, y + height) - sy;
    if (sw <= 0 || sh <= 0) return;

    const blockSize = Math.max(8, Math.min(sw, sh) / 4);
    const smallW = Math.max(1, Math.round(sw / blockSize));
    const smallH = Math.max(1, Math.round(sh / blockSize));

    const small = document.createElement('canvas');
    small.width = smallW;
    small.height = smallH;
    const smallCtx = small.getContext('2d');
    if (!smallCtx) return;
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.drawImage(source, sx, sy, sw, sh, 0, 0, smallW, smallH);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, smallW, smallH, sx, sy, sw, sh);
    ctx.imageSmoothingEnabled = true;
  }

  function drawArrowOnCanvas(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    const headLength = Math.max(16, natural ? natural.w * 0.02 : 16);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = ARROW_COLOR;
    ctx.fillStyle = ARROW_COLOR;
    ctx.lineWidth = Math.max(4, natural ? natural.w * 0.005 : 4);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function applyAll() {
    if (!natural || !imgElRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = natural.w;
    canvas.height = natural.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgElRef.current, 0, 0);

    const pad = 3;
    for (const s of shapes) {
      if (s.kind === 'redact') {
        if (!s.accepted) continue;
        pixelateRegion(ctx, imgElRef.current, s.x - pad, s.y - pad, (s.width ?? 0) + pad * 2, (s.height ?? 0) + pad * 2);
      } else if (s.kind === 'highlight') {
        ctx.strokeStyle = ARROW_COLOR;
        ctx.lineWidth = Math.max(3, natural.w * 0.004);
        ctx.strokeRect(s.x, s.y, s.width ?? 0, s.height ?? 0);
      } else if (s.kind === 'arrow') {
        drawArrowOnCanvas(ctx, s.x, s.y, s.x2 ?? s.x, s.y2 ?? s.y);
      } else if (s.kind === 'pen' && s.points && s.points.length > 1) {
        ctx.strokeStyle = PEN_COLOR;
        ctx.lineWidth = Math.max(3, natural.w * 0.003);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
        ctx.stroke();
      }
    }
    onApply(canvas.toDataURL('image/png'));
  }

  const redactCount = shapes.filter((s) => s.kind === 'redact' && s.accepted).length;
  const arrowCount = shapes.filter((s) => s.kind === 'arrow').length;
  const highlightCount = shapes.filter((s) => s.kind === 'highlight').length;
  const penCount = shapes.filter((s) => s.kind === 'pen').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {scanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              Scanning for sensitive text…
            </>
          ) : fieldGroups.length > 0 ? (
            <>
              <ScanEye className="w-4 h-4 text-slate-400" />
              {redactCount} of {shapes.filter((s) => s.kind === 'redact').length} field
              {shapes.filter((s) => s.kind === 'redact').length !== 1 ? 's' : ''} will be redacted
            </>
          ) : (
            <>
              <ScanEye className="w-4 h-4 text-slate-400" />
              No sensitive text auto-detected — use the Redact tool to draw a box over anything that needs hiding
            </>
          )}
        </div>
      </div>

      {scanError && (
        <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0" /> {scanError}
        </div>
      )}

      {/* Tool selector */}
      <div className="flex items-center gap-1.5 mb-3">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              tool === t.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" style={tool === t.id && (t.id === 'arrow' || t.id === 'highlight') ? { color: ARROW_COLOR } : undefined} />
            {t.label}
          </button>
        ))}
      </div>

      {/* One-click mask-by-field-type bar */}
      {fieldGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {fieldGroups.map(([reason, group]) => {
            const allAccepted = group.every((s) => s.accepted);
            return (
              <button
                key={reason}
                type="button"
                onClick={() => toggleFieldGroup(reason)}
                title={`Click to ${allAccepted ? 'un-redact' : 'redact'} every "${reason}" match on this image`}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  allAccepted
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-400'
                }`}
              >
                {allAccepted ? '✓ ' : ''}
                {reason} ({group.length})
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mb-2">
        {tool === 'redact' &&
          'Click a field chip above to mask every match at once. Click an individual box to toggle it, or a box you drew to remove it. Drag on the image to add your own.'}
        {(tool === 'arrow' || tool === 'highlight') &&
          `Drag on the image to draw a red ${tool === 'arrow' ? 'arrow' : 'highlight box'} pointing at the process. Click one to remove it.`}
        {tool === 'pen' && 'Drag on the image to draw in black pen — circle something, underline it, jot a note. Click a stroke to remove it.'}
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

        {/* Rectangle shapes: redact + highlight */}
        {shapes
          .filter((s) => s.kind === 'redact' || s.kind === 'highlight')
          .map((s) => (
            <div
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                handleShapeClick(s);
              }}
              title={
                s.kind === 'highlight'
                  ? 'Click to remove'
                  : s.manual
                    ? 'Click to remove'
                    : `${s.reason} — click to ${s.accepted ? 'unredact' : 'redact'}`
              }
              className="absolute flex items-center justify-center"
              style={{
                left: s.x * scale,
                top: s.y * scale,
                width: (s.width ?? 0) * scale,
                height: (s.height ?? 0) * scale,
                cursor: 'pointer',
                ...(s.kind === 'highlight'
                  ? { border: `3px solid ${ARROW_COLOR}`, background: 'rgba(220,38,38,0.08)' }
                  : s.accepted
                    ? {
                        // Live preview only — a soft, clean-looking blur.
                        // What actually gets saved (applyAll/pixelateRegion)
                        // is true pixelation, not this: blur alone can be
                        // reversed, pixelation can't. See the comment there.
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        background: 'rgba(255,255,255,0.25)',
                        border: '1px solid rgba(15,15,15,0.35)',
                      }
                    : { background: 'rgba(234,179,8,0.2)', border: '2px dashed #eab308' }),
              }}
            >
              {s.kind === 'redact' && !s.accepted && (
                <span className="text-[9px] font-medium text-amber-800 bg-amber-100 px-1 rounded">off</span>
              )}
            </div>
          ))}

        {/* Arrows + pen strokes: SVG overlay (lines/paths can't be drawn with a plain box) */}
        <svg className="absolute inset-0 pointer-events-none" width={displayW} height={displayH}>
          <defs>
            <marker id="redactor-arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={ARROW_COLOR} />
            </marker>
          </defs>
          {shapes
            .filter((s) => s.kind === 'arrow')
            .map((s) => (
              <line
                key={s.id}
                x1={s.x * scale}
                y1={s.y * scale}
                x2={(s.x2 ?? s.x) * scale}
                y2={(s.y2 ?? s.y) * scale}
                stroke={ARROW_COLOR}
                strokeWidth={4}
                strokeLinecap="round"
                markerEnd="url(#redactor-arrowhead)"
              />
            ))}
          {shapes
            .filter((s) => s.kind === 'pen' && s.points)
            .map((s) => (
              <polyline
                key={s.id}
                points={s.points!.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
                fill="none"
                stroke={PEN_COLOR}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
        </svg>
        {/* Invisible click targets to remove an arrow/pen stroke (SVG above is pointer-events:none) */}
        {shapes
          .filter((s) => s.kind === 'arrow')
          .map((s) => {
            const x1 = s.x * scale;
            const y1 = s.y * scale;
            const x2 = (s.x2 ?? s.x) * scale;
            const y2 = (s.y2 ?? s.y) * scale;
            const pad = 10;
            return (
              <div
                key={`hit-${s.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShapeClick(s);
                }}
                title="Click to remove"
                className="absolute cursor-pointer"
                style={{
                  left: Math.min(x1, x2) - pad,
                  top: Math.min(y1, y2) - pad,
                  width: Math.abs(x2 - x1) + pad * 2,
                  height: Math.abs(y2 - y1) + pad * 2,
                }}
              />
            );
          })}
        {shapes
          .filter((s) => s.kind === 'pen' && s.points && s.points.length > 0)
          .map((s) => {
            const xs = s.points!.map((p) => p.x * scale);
            const ys = s.points!.map((p) => p.y * scale);
            const pad = 8;
            return (
              <div
                key={`hit-${s.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShapeClick(s);
                }}
                title="Click to remove"
                className="absolute cursor-pointer"
                style={{
                  left: Math.min(...xs) - pad,
                  top: Math.min(...ys) - pad,
                  width: Math.max(...xs) - Math.min(...xs) + pad * 2,
                  height: Math.max(...ys) - Math.min(...ys) + pad * 2,
                }}
              />
            );
          })}

        {draft && tool === 'arrow' && (
          <svg className="absolute inset-0 pointer-events-none" width={displayW} height={displayH}>
            <line
              x1={draft.startX}
              y1={draft.startY}
              x2={draft.curX}
              y2={draft.curY}
              stroke={ARROW_COLOR}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="6 4"
            />
          </svg>
        )}
        {draft && tool === 'pen' && draft.points && (
          <svg className="absolute inset-0 pointer-events-none" width={displayW} height={displayH}>
            <polyline
              points={draft.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={PEN_COLOR}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {draft && (tool === 'redact' || tool === 'highlight') && (
          <div
            className="absolute border-2 border-dashed"
            style={{
              left: Math.min(draft.startX, draft.curX),
              top: Math.min(draft.startY, draft.curY),
              width: Math.abs(draft.curX - draft.startX),
              height: Math.abs(draft.curY - draft.startY),
              borderColor: tool === 'highlight' ? ARROW_COLOR : '#C22A1D',
              background: tool === 'highlight' ? 'rgba(220,38,38,0.1)' : 'rgba(194,42,29,0.1)',
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={applyAll}
          disabled={!natural}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          Apply & Redact
        </button>
        {(redactCount > 0 || arrowCount > 0 || highlightCount > 0 || penCount > 0) && (
          <span className="text-xs text-slate-400">
            {[
              redactCount > 0 ? `${redactCount} redaction${redactCount !== 1 ? 's' : ''}` : null,
              arrowCount > 0 ? `${arrowCount} arrow${arrowCount !== 1 ? 's' : ''}` : null,
              highlightCount > 0 ? `${highlightCount} highlight${highlightCount !== 1 ? 's' : ''}` : null,
              penCount > 0 ? `${penCount} pen mark${penCount !== 1 ? 's' : ''}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5 ml-auto"
        >
          <XIcon className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
