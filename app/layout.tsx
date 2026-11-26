import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./sounds-and-celebration.css";
import "./caa-stories.css";
import "./interface-styles.css";
// Fonts of the Studio and Giocoso styles, served by the app itself (no external requests).
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";

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
