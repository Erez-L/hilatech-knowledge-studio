import { AppError } from "@hks/shared";
import { loadPdfLibrary } from "./pdf-library.ts";

/**
 * Renders one PDF page to a PNG on the server, for the document preview.
 * The browser receives an image, never the PDF's own scripts or links.
 */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, scale = 1.6): Promise<Uint8Array> {
  const renderer = await openPdfRenderer(bytes);
  try {
    return await renderer.render(pageNumber, scale);
  } finally {
    await renderer.close();
  }
}

/**
 * Opens a PDF once for rendering several of its pages (the scanned pages of one upload), instead
 * of parsing the whole file again for every page. `close` must be called when done.
 */
export async function openPdfRenderer(bytes: Uint8Array): Promise<{ render(pageNumber: number, scale: number): Promise<Uint8Array>; close(): Promise<void> }> {
  const { getDocumentProxy, renderPageAsImage } = await loadPdfLibrary();
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (error) {
    throw new AppError("extraction_failed", "The page could not be rendered", { cause: error });
  }
  return {
    async render(pageNumber, scale) {
      try {
        const png = await renderPageAsImage(pdf, pageNumber, { canvasImport: () => import("@napi-rs/canvas"), scale });
        return new Uint8Array(png);
      } catch (error) {
        throw new AppError("extraction_failed", "The page could not be rendered", { cause: error });
      }
    },
    close: () => pdf.loadingTask.destroy().catch(() => {}),
  };
}
