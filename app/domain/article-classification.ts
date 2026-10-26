const articlesById: Record<string, "IL" | "LA"> = {
  mela: "LA", gatto: "IL", pane: "IL", casa: "LA", palla: "LA", sole: "IL", fiore: "IL",
  cane: "IL", pesce: "IL", mucca: "LA", banana: "LA", pera: "LA", latte: "IL", sedia: "LA",
  letto: "IL", porta: "LA", libro: "IL", matita: "LA", scarpa: "LA", mano: "LA", luna: "LA",
  treno: "IL", barca: "LA", bocca: "LA", schiena: "LA", telefono: "IL", pigiama: "IL",
  bicicletta: "LA", gallo: "IL", gelato: "IL", maiale: "IL", coniglio: "IL", maglietta: "LA",
  piadina: "LA", giacca: "LA", camion: "IL", granchio: "IL", "coca-cola": "LA", carota: "LA",
};
export const articleFor = (item: { id: string; article?: "IL" | "LA" | null }) => item.article !== undefined ? item.article ?? undefined : articlesById[item.id];
