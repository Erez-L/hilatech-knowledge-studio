/**
 * Loads the PDF library and repairs a side effect of loading it.
 *
 * pdf.js adds `Uint8Array.prototype.toBase64` / `Uint8Array.fromBase64` to
 * runtimes that lack them, in a simplified form that ignores the options
 * argument. Other libraries then detect the methods and call them with
 * `{ alphabet: "base64url", omitPadding: true }`: the authentication library
 * encodes its signed tokens that way, so after the first PDF was opened in a
 * process, verification and reset links came out in the wrong alphabet and
 * failed whenever the token contained "+" or "/". The functions below follow
 * the standard for both options and replace the simplified ones. Native
 * implementations are left alone.
 */
type Base64Options = { alphabet?: "base64" | "base64url"; omitPadding?: boolean };
const isNative = (fn: unknown) => typeof fn === "function" && Function.prototype.toString.call(fn).includes("[native code]");

export function repairBase64Polyfills(): void {
  const proto = Uint8Array.prototype as unknown as { toBase64?: (options?: Base64Options) => string };
  const ctor = Uint8Array as unknown as { fromBase64?: (text: string, options?: { alphabet?: "base64" | "base64url" }) => Uint8Array };

  if (proto.toBase64 && !isNative(proto.toBase64)) {
    Object.defineProperty(proto, "toBase64", {
      configurable: true,
      writable: true,
      value: function toBase64(this: Uint8Array, options: Base64Options = {}): string {
        const url = options.alphabet === "base64url";
        if (options.alphabet !== undefined && !url && options.alphabet !== "base64") throw new TypeError("Invalid alphabet");
        const text = Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString(url ? "base64url" : "base64");
        // Node's base64url has no padding; the standard pads unless omitPadding is set.
        if (url) return options.omitPadding ? text : text + "=".repeat((4 - (text.length % 4)) % 4);
        return options.omitPadding ? text.replace(/=+$/, "") : text;
      },
    });
  }
  if (ctor.fromBase64 && !isNative(ctor.fromBase64)) {
    Object.defineProperty(ctor, "fromBase64", {
      configurable: true,
      writable: true,
      value: function fromBase64(text: string, options: { alphabet?: "base64" | "base64url" } = {}): Uint8Array {
        if (typeof text !== "string") throw new TypeError("Expected a string");
        const url = options.alphabet === "base64url";
        const clean = text.replace(/[\t\n\f\r ]/g, "");
        if (!(url ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/).test(clean)) throw new SyntaxError("Invalid base64 string");
        return new Uint8Array(Buffer.from(clean, url ? "base64url" : "base64"));
      },
    });
  }
}

/** The only way this package loads the PDF library. */
export async function loadPdfLibrary() {
  const unpdf = await import("unpdf");
  await unpdf.getResolvedPDFJS(); // loading pdf.js is what installs the simplified methods
  repairBase64Polyfills();
  return unpdf;
}
