import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lettura Globale",
    short_name: "Lettura",
    description: "Esercizi di lettura globale guidati da un adulto.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6fb",
    theme_color: "#f5b900",
    icons: [
      { src: "/lettura-globale-icon-v2.png", sizes: "1256x1256", type: "image/png", purpose: "any" },
      { src: "/lettura-globale-icon-v2.png", sizes: "1256x1256", type: "image/png", purpose: "maskable" },
    ],
  };
}
