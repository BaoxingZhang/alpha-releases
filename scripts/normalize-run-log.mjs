/**
 * Normalize captured native smoke output before writing the tracked diagnostic
 * artifact. Native processes can emit spaces at a chunk boundary immediately
 * before a newline; those bytes are harmless but make `git diff --check` fail.
 */
export function normalizeRunLog(value) {
  return String(value ?? '').replace(/[ \t]+(?=\r?\n|$)/g, '');
}
