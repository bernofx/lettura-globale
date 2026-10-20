import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lettura Globale",
  description: "Esercizi di lettura globale guidati da terapisti e genitori.",
  applicationName: "Lettura Globale",
  icons: {
    icon: "/lettura-globale-icon-v2.png",
    shortcut: "/lettura-globale-icon-v2.png",
    apple: "/lettura-globale-icon-v2.png",
  },
};

export const viewport: Viewport = { themeColor: "#f5b900", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
