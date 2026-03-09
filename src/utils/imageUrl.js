/**
 * Convert Supabase storage path to full public URL.
 * Handles relative paths like "gobahrain-post-images/xyz/file.jpg" or "xyz/file.jpg".
 */
const SUPABASE_STORAGE_BASE = 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public';

export function ensureImageUrl(url, bucket = 'gobahrain-post-images') {
  if (!url || typeof url !== 'string') return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const cleanPath = trimmed.startsWith(`${bucket}/`) ? trimmed.replace(`${bucket}/`, '') : trimmed;
  return `${SUPABASE_STORAGE_BASE}/${bucket}/${cleanPath}`;
}
