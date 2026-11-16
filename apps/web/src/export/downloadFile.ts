/** Hands a file made in the browser to the user as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  // Revoked on the next tick, once the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Saves text as a file of the given media type, in UTF-8. */
export function downloadText(text: string, type: string, fileName: string): void {
  saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName)
}
