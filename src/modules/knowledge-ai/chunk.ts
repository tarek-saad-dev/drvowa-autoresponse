import {
  KNOWLEDGE_INGEST_CHUNK_OVERLAP,
  KNOWLEDGE_INGEST_CHUNK_SIZE,
  KNOWLEDGE_INGEST_MIN_ADAPTIVE_CHUNK,
} from "./constants";

/**
 * Split large paste into overlapping chunks on paragraph boundaries when possible.
 */
export function chunkText(
  input: string,
  chunkSize = KNOWLEDGE_INGEST_CHUNK_SIZE,
  overlap = KNOWLEDGE_INGEST_CHUNK_OVERLAP,
): string[] {
  const text = input.trim();
  if (!text) return [];
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const paraBreak = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
      );
      if (paraBreak > chunkSize * 0.4) {
        end = start + paraBreak;
      }
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

/**
 * Split a dense chunk roughly in half on a paragraph/newline boundary when possible.
 * Returns null when the chunk is too small to split usefully.
 */
export function splitDenseChunk(
  text: string,
  minSize = KNOWLEDGE_INGEST_MIN_ADAPTIVE_CHUNK,
): [string, string] | null {
  const trimmed = text.trim();
  if (trimmed.length < minSize * 2) return null;

  const mid = Math.floor(trimmed.length / 2);
  const window = trimmed.slice(0, mid);
  const paraBreak = Math.max(
    window.lastIndexOf("\n\n"),
    window.lastIndexOf("\n"),
  );
  const cut =
    paraBreak > trimmed.length * 0.3
      ? paraBreak
      : mid;

  const left = trimmed.slice(0, cut).trim();
  const right = trimmed.slice(cut).trim();
  if (!left || !right) return null;
  if (left.length < minSize || right.length < minSize) return null;
  return [left, right];
}
