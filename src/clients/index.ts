import type { ClientCard } from "./types";
import { isCardSlotSlug } from "../cards/inventory";

// Each client owns one folder so their data and assets can move together.
// Adding `src/clients/data/<slug>/client.ts` is enough to register a page.
const clientModules = import.meta.glob<{ default?: ClientCard }>("./data/*/client.ts", { eager: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeHref(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const protocol = new URL(value, typeof window === "undefined" ? "https://infinity-card.invalid/" : window.location.href).protocol;
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

/** Guard published JSON so malformed data never replaces the bundled fallback. */
export function isClientCard(value: unknown, expectedSlug?: string): value is ClientCard {
  if (!isRecord(value)) return false;
  if (typeof value.slug !== "string" || (expectedSlug && value.slug !== expectedSlug)) return false;
  if (value.theme !== "women" && value.theme !== "men") return false;
  for (const key of ["name", "description", "city", "heroImage", "logoImage", "logoAlt"]) {
    if (typeof value[key] !== "string") return false;
  }
  const channels = value.channels;
  if (!isRecord(channels) || !Array.isArray(value.quickActions) || !Array.isArray(value.detailItems)) return false;
  for (const [kind, channel] of Object.entries(channels)) {
    if (!isRecord(channel) || typeof channel.label !== "string" || !isSafeHref(channel.href)) return false;
    if (channel.value !== undefined && typeof channel.value !== "string") return false;
    if (channel.external !== undefined && typeof channel.external !== "boolean") return false;
    if (!kind) return false;
  }
  if (value.quickActions.some((kind) => typeof kind !== "string" || !channels[kind])) return false;
  if (value.detailItems.some((kind) => {
    if (typeof kind !== "string") return true;
    const channel = channels[kind];
    return !isRecord(channel) || typeof channel.value !== "string" || !channel.value;
  })) return false;
  if (value.contactCard !== undefined) {
    if (!isRecord(value.contactCard) || typeof value.contactCard.label !== "string") return false;
    if (value.contactCard.organization !== undefined && typeof value.contactCard.organization !== "string") return false;
  }
  return true;
}

export const clients = Object.values(clientModules).reduce<Record<string, ClientCard>>((registry, module) => {
  if (module.default) registry[module.default.slug] = module.default;
  return registry;
}, {});

export async function loadPublishedClient(slug: string, assetBase: string): Promise<ClientCard | null> {
  if (!slug || typeof window === "undefined") return null;

  const base = new URL(assetBase || "./", window.location.href);
  const url = new URL(`clients/${encodeURIComponent(slug)}.json`, base);
  // GitHub Pages cannot set per-file cache headers. A unique query plus
  // cache:no-store makes a published edit visible on phones immediately.
  url.searchParams.set("v", `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    const response = await fetch(url.href, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isClientCard(data, slug) ? data : null;
  } catch {
    return null;
  }
}

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
