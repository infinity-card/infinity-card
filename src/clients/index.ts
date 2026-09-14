import type { ClientCard } from "./types";
import { isCardSlotSlug } from "../cards/inventory";

// Each client owns one folder so their data and assets can move together.
// Adding `src/clients/data/<slug>/client.ts` is enough to register a page.
const clientModules = import.meta.glob<{ default?: ClientCard }>("./data/*/client.ts", { eager: true });

export const clients = Object.values(clientModules).reduce<Record<string, ClientCard>>((registry, module) => {
  if (module.default) registry[module.default.slug] = module.default;
  return registry;
}, {});

export function getActiveClient(): ClientCard {
  const fallback = clients["maison-lina"] ?? Object.values(clients)[0];
  const slug = new URLSearchParams(window.location.search).get("client") ?? fallback?.slug;
  const client = slug ? clients[slug] : fallback;
  if (!client && slug && isCardSlotSlug(slug)) {
    const normalizedSlug = slug.toLowerCase();
    return {
      slug: normalizedSlug,
      theme: "women",
      name: `Carte ${normalizedSlug.toUpperCase()}`,
      description: "Cette carte n’est pas encore activée.",
      city: "Infinity Card",
      heroImage: "assets/infinity-card/placeholder-hero.svg",
      logoImage: "assets/infinity-card/placeholder-logo.svg",
      logoAlt: "Infinity Card",
      isPlaceholder: true,
      channels: {},
      quickActions: [],
      detailItems: [],
    };
  }
  if (!client) throw new Error("No Infinity Card client data was found.");
  return client;
}

export type { Channel, ChannelKind, ClientCard } from "./types";
