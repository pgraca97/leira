const MAX_LENGTH = 60

/**
 * A file name for something exported from a garden: its name in lowercase
 * ASCII with dashes, which every file system and mail client accepts.
 */
export function fileNameFor(gardenName: string, extension: string): string {
  const slug = gardenName
    // Split accented letters into letter plus accent, then drop the accents.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, "")
  return `${slug || "garden"}.${extension}`
}
