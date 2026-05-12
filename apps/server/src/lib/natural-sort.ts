// Natural alphanumeric sort — "page2.jpg" before "page10.jpg".
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function isImageName(name: string): boolean {
  // More permissive - matches common image formats for comics, case-insensitive
  // Also handles uppercase extensions and common variations
  return /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|jp2|j2k|jpf|jpx)$/i.test(name);
}
