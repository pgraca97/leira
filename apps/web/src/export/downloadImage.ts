import { saveBlob } from "./downloadFile"

/**
 * Saves an SVG picture as a PNG file. The browser draws the SVG onto a canvas
 * at the size asked for, and the canvas is handed to the user as a download.
 * Rejects when the browser cannot draw or encode the picture.
 */
export async function downloadPng(
  svgMarkup: string,
  size: { width: number; height: number },
  fileName: string
): Promise<void> {
  const source = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml" }))
  try {
    const image = new Image()
    image.src = source
    await image.decode()

    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("No 2D canvas available")
    // White behind the picture: a transparent margin turns black in some viewers.
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(image, 0, 0, size.width, size.height)

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!png) throw new Error("The canvas could not be encoded")
    saveBlob(png, fileName)
  } finally {
    URL.revokeObjectURL(source)
  }
}
