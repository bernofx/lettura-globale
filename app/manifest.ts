import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lettura Globale",
    short_name: "Lettura",
    description: "Esercizi di lettura globale guidati da un adulto.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6fb",
    theme_color: "#6659d9",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
