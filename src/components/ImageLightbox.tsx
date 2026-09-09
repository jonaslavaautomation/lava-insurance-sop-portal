import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;

/**
 * Full-screen zoomable view of an image — opened by clicking a screenshot
 * anywhere in the VA portal (see StepImage). Scroll/buttons to zoom, drag
 * to pan once zoomed in, double-click to toggle, Escape or backdrop click
 * to close.
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === '0') reset();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clamp(v: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
  }
  function zoomIn() {
    setScale((s) => clamp(s + SCALE_STEP));
  }
  function zoomOut() {
    setScale((s) => {
      const next = clamp(s - SCALE_STEP);
      if (next === MIN_SCALE) setPan({ x: 0, y: 0 });
      return next;
    });
  }
  function reset() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    setScale((s) => {
      const next = clamp(s + delta);
      if (next === MIN_SCALE) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    setDragging(true);
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragState.current) return;
    setPan({
      x: dragState.current.panX + (e.clientX - dragState.current.startX),
      y: dragState.current.panY + (e.clientY - dragState.current.startY),
    });
  }
  function endDrag() {
    setDragging(false);
    dragState.current = null;
  }

  function handleDoubleClick() {
    if (scale > 1) reset();
    else setScale(2);
  }

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-white/70 tabular-nums">{Math.round(scale * 100)}%</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            className="p-2 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button type="button" onClick={reset} className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors" aria-label="Reset zoom">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            className="p-2 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors ml-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-hidden flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          src={src}
          alt={alt ?? 'Full-size image'}
          draggable={false}
          className="select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
            maxWidth: '90vw',
            maxHeight: '80vh',
            objectFit: 'contain',
          }}
        />
      </div>

      <p className="text-center text-xs text-white/40 pb-3">Scroll or use +/− to zoom · drag to pan · double-click to reset · Esc to close</p>
    </div>
  );
}
