import React, { useEffect, useMemo, useRef } from 'react';
import { getFontMeta, normalizeFontId } from '../types/clock';
import { useClock } from '../state/ClockContext';
import {
  MATRIX_HEIGHT,
  MATRIX_WIDTH,
  type MatrixRenderOverrides,
  renderMomentraMatrix,
} from './ledMatrixRenderer';

interface LedMatrixPreviewProps {
  overrides?: MatrixRenderOverrides;
  surfaceMeta?: boolean;
  label?: string;
}

const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 320;

export const LedMatrixPreview: React.FC<LedMatrixPreviewProps> = ({
  overrides,
  surfaceMeta = false,
  label = '32×16 P10 Matrix',
}) => {
  const { status, live, theme } = useClock();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rendered = useMemo(
    () => renderMomentraMatrix(status, live, overrides),
    [status, live, overrides],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const bgColor = styles.getPropertyValue('--m-led-bg').trim() || '#05131a';
    const offColor = styles.getPropertyValue('--m-led-off').trim() || '#102a31';
    const onColor = styles.getPropertyValue('--m-led-on').trim() || '#8be8cb';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = LOGICAL_WIDTH * dpr;
    const targetH = LOGICAL_HEIGHT * dpr;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Panel background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const padX = 12;
    const padY = 12;
    const cellW = (LOGICAL_WIDTH - padX * 2) / MATRIX_WIDTH;
    const cellH = (LOGICAL_HEIGHT - padY * 2) / MATRIX_HEIGHT;
    const radius = Math.min(cellW, cellH) * 0.34;

    const brightness = Math.max(0, Math.min(100, rendered.brightness));
    const ledAlpha = brightness === 0 ? 0 : 0.18 + (brightness / 100) * 0.82;
    const glowBlur = brightness === 0 ? 0 : 4 + (brightness / 100) * 11;

    // Pass 1: unlit diode grid
    ctx.shadowBlur = 0;
    ctx.fillStyle = offColor;
    for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
      const cy = padY + y * cellH + cellH / 2;
      for (let x = 0; x < MATRIX_WIDTH; x += 1) {
        const cx = padX + x * cellW + cellW / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pass 2: lit LED diodes
    if (brightness > 0) {
      ctx.globalAlpha = ledAlpha;
      ctx.fillStyle = onColor;
      ctx.shadowColor = onColor;
      ctx.shadowBlur = glowBlur;
      for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
        const cy = padY + y * cellH + cellH / 2;
        for (let x = 0; x < MATRIX_WIDTH; x += 1) {
          if (!rendered.frame[y * MATRIX_WIDTH + x]) continue;
          const cx = padX + x * cellW + cellW / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }, [rendered, theme]);

  const effectiveFontId =
    (overrides?.timezone_secondary_enabled ?? status?.timezone_secondary_enabled) === 1
      ? 7
      : normalizeFontId(overrides?.font ?? status?.font ?? 0);
  const fontLabel = getFontMeta(effectiveFontId).label;

  return (
    <div className="led-matrix-wrap">
      <div className="led-matrix-bezel">
        <canvas
          ref={canvasRef}
          className="led-matrix-canvas"
          aria-label={`32 by 16 LED matrix preview (${rendered.modeLabel})`}
          data-testid="led-matrix-canvas"
        />
      </div>
      <div className={`led-matrix-meta ${surfaceMeta ? 'surface' : ''}`}>
        <span>
          {label} · {rendered.modeLabel}
        </span>
        <span>
          {fontLabel} · {rendered.brightness === 0 ? 'Panel Blanked (0%)' : `${rendered.brightness}%`}
        </span>
      </div>
    </div>
  );
};
