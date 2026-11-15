import { AppError } from "@hks/shared";

/**
 * Renders one PDF page to a PNG on the server, for the document preview.
 * The browser receives an image, never the PDF's own scripts or links.
 */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, scale = 1.6): Promise<Uint8Array> {
  const { renderPageAsImage } = await import("unpdf");
  try {
    const png = await renderPageAsImage(new Uint8Array(bytes), pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale,
    });
    return new Uint8Array(png);
  } catch (error) {
    throw new AppError("extraction_failed", "The page could not be rendered", { cause: error });
  }
}
