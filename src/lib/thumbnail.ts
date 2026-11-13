import type { CanvasData } from "./excalidraw";

export const THUMB_WIDTH = 240;
export const THUMB_HEIGHT = 150;
const PADDING = 16;
const MAX_ZOOM = 2;

type Point = [number, number];

type El = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  roundness?: unknown;
  points?: Point[];
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  lineHeight?: number;
  fileId?: string;
  isDeleted?: boolean;
};

const FONT_FAMILIES: Record<number, string> = {
  1: "Virgil",
  2: "Helvetica",
  3: "Cascadia",
  5: "Excalifont",
  6: "Nunito",
  7: "Lilita One",
  8: "Comic Shanns",
};

function isElement(x: unknown): x is El {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.type === "string" &&
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    o.isDeleted !== true
  );
}

function hasPoints(el: El): el is El & { points: Point[] } {
  return Array.isArray(el.points) && el.points.length > 0;
}

function bounds(els: El[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    if (hasPoints(el)) {
      for (const [px, py] of el.points) {
        minX = Math.min(minX, el.x + px);
        minY = Math.min(minY, el.y + py);
        maxX = Math.max(maxX, el.x + px);
        maxY = Math.max(maxY, el.y + py);
      }
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }
  return { minX, minY, maxX, maxY };
}

async function loadImages(
  els: El[],
  files: CanvasData["files"],
): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  const ids = new Set(
    els.filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId as string),
  );
  await Promise.all(
    [...ids].map(async (id) => {
      const file = files[id];
      if (!file?.dataURL) return;
      const img = new Image();
      img.src = file.dataURL;
      try {
        await img.decode();
        images.set(id, img);
      } catch {
        /* unreadable image, drawn as a placeholder box */
      }
    }),
  );
  return images;
}

function drawPolyline(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
}

function drawArrowhead(ctx: CanvasRenderingContext2D, points: Point[], size: number): void {
  if (points.length < 2) return;
  const [x2, y2] = points[points.length - 1];
  const [x1, y1] = points[points.length - 2];
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45));
  ctx.stroke();
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: El,
  images: Map<string, HTMLImageElement>,
  minLineWidth: number,
): void {
  const stroke = el.strokeColor ?? "#1e1e1e";
  const fill =
    el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : null;
  const w = el.width;
  const h = el.height;

  ctx.save();
  ctx.globalAlpha = (el.opacity ?? 100) / 100;
  ctx.translate(el.x, el.y);
  if (el.angle) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(el.angle);
    ctx.translate(-w / 2, -h / 2);
  }
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill ?? "transparent";
  ctx.lineWidth = Math.max(el.strokeWidth ?? 2, minLineWidth);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (el.type) {
    case "rectangle":
    case "frame":
    case "magicframe":
    case "embeddable":
    case "iframe": {
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, el.roundness ? Math.min(w, h) * 0.12 : 0);
      if (fill) ctx.fill();
      ctx.stroke();
      break;
    }
    case "diamond": {
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
      break;
    }
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      if (!hasPoints(el)) break;
      drawPolyline(ctx, el.points);
      if (fill && el.type === "line" && el.points.length > 2) ctx.fill();
      ctx.stroke();
      if (el.type === "arrow") drawArrowhead(ctx, el.points, 6 + ctx.lineWidth * 3);
      break;
    }
    case "freedraw": {
      if (!hasPoints(el)) break;
      ctx.lineWidth = Math.max((el.strokeWidth ?? 2) * 2, minLineWidth);
      drawPolyline(ctx, el.points);
      ctx.stroke();
      break;
    }
    case "text": {
      const size = el.fontSize ?? 20;
      const family = FONT_FAMILIES[el.fontFamily ?? 1] ?? "Virgil";
      ctx.font = `${size}px "${family}", "Segoe UI Emoji", sans-serif`;
      ctx.fillStyle = stroke;
      ctx.textBaseline = "top";
      const align = el.textAlign === "center" || el.textAlign === "right" ? el.textAlign : "left";
      ctx.textAlign = align;
      const x = align === "center" ? w / 2 : align === "right" ? w : 0;
      const lineHeight = size * (el.lineHeight ?? 1.25);
      (el.text ?? "").split("\n").forEach((line, i) => ctx.fillText(line, x, i * lineHeight));
      break;
    }
    case "image": {
      const img = el.fileId ? images.get(el.fileId) : undefined;
      if (img) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeRect(0, 0, w, h);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function viewBackground(appState: string | null): string {
  if (!appState) return "#ffffff";
  try {
    const parsed = JSON.parse(appState) as { viewBackgroundColor?: unknown };
    return typeof parsed.viewBackgroundColor === "string" ? parsed.viewBackgroundColor : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/**
 * A simplified, non-sketchy drawing of the whole scene fitted into a small box.
 * Returns null for an empty scene.
 */
export async function renderThumbnail(data: CanvasData): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.elements);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const els = parsed.filter(isElement);
  if (els.length === 0) return null;

  const { minX, minY, maxX, maxY } = bounds(els);
  const sceneW = Math.max(maxX - minX, 1);
  const sceneH = Math.max(maxY - minY, 1);
  const zoom = Math.min(
    (THUMB_WIDTH - PADDING * 2) / sceneW,
    (THUMB_HEIGHT - PADDING * 2) / sceneH,
    MAX_ZOOM,
  );

  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = viewBackground(data.appState);
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  ctx.translate(
    (THUMB_WIDTH - sceneW * zoom) / 2 - minX * zoom,
    (THUMB_HEIGHT - sceneH * zoom) / 2 - minY * zoom,
  );
  ctx.scale(zoom, zoom);

  const images = await loadImages(els, data.files);
  for (const el of els) drawElement(ctx, el, images, 1 / zoom);

  return canvas.toDataURL("image/webp", 0.85);
}
