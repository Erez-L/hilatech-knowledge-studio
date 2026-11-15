import type { ReactNode } from "react";

// The <html> element is rendered by the locale layout so it can set lang and dir.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
