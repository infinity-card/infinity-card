import type { CardTheme, ChannelKind, ClientCard } from "../clients/types";

export type BuilderChannel = {
  label: string;
  value: string;
  href: string;
  external?: boolean;
};

export type BuilderDraft = Omit<ClientCard, "channels" | "quickActions" | "detailItems"> & {
  channels: Partial<Record<ChannelKind, BuilderChannel>>;
  quickActions: ChannelKind[];
  detailItems: ChannelKind[];
  heroImageData?: string;
  logoImageData?: string;
};

export const CHANNEL_DEFINITIONS: Array<{
  kind: ChannelKind;
  label: string;
  placeholder: string;
  external?: boolean;
}> = [
  { kind: "whatsapp", label: "WhatsApp", placeholder: "+212 6 00 00 00 00", external: true },
  { kind: "phone", label: "Téléphone", placeholder: "+212 6 00 00 00 00" },
  { kind: "email", label: "E-mail", placeholder: "bonjour@client.ma" },
  { kind: "instagram", label: "Instagram", placeholder: "@client", external: true },
  { kind: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/client", external: true },
  { kind: "facebook", label: "Facebook", placeholder: "Nom de la page", external: true },
  { kind: "tiktok", label: "TikTok", placeholder: "@client", external: true },
  { kind: "address", label: "Adresse", placeholder: "Rue, quartier, ville", external: true },
  { kind: "reviews", label: "Avis Google", placeholder: "Voir les avis · 5,0 ★", external: true },
  { kind: "website", label: "Site web", placeholder: "www.client.ma", external: true },
];

export const THEME_DEFAULTS: Record<CardTheme, Pick<BuilderDraft, "heroImage" | "logoImage" | "logoAlt">> = {
  women: {
    heroImage: "assets/clients/maison-lina/hero.webp",
    logoImage: "assets/clients/maison-lina/logo.webp",
    logoAlt: "Logo du commerce",
  },
  men: {
    heroImage: "assets/clients/atelier-yassine/hero.webp",
    logoImage: "assets/clients/atelier-yassine/logo.webp",
    logoAlt: "Logo du commerce",
  },
};

export function cloneDraft(client: ClientCard): BuilderDraft {
  return JSON.parse(JSON.stringify(client)) as BuilderDraft;
}

export function createBlankDraft(theme: CardTheme = "women", slug = "nouveau-client"): BuilderDraft {
  return {
    slug,
    theme,
    name: "",
    description: "",
    city: "",
    ...THEME_DEFAULTS[theme],
    contactCard: {
      label: "Ajouter aux contacts",
      organization: "",
    },
    channels: {},
    quickActions: [],
    detailItems: [],
  };
}

export function normalizeSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function getImageSource(path: string, data?: string) {
  if (data) return data;
  if (/^(data:|blob:|https?:\/\/)/i.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path}`;
}

export function toClientCard(draft: BuilderDraft): ClientCard {
  const channels = Object.fromEntries(
    Object.entries(draft.channels).filter(([, channel]) => channel?.value || channel?.href),
  ) as BuilderDraft["channels"];

  return {
    slug: normalizeSlug(draft.slug) || "client",
    theme: draft.theme,
    name: draft.name.trim(),
    description: draft.description.trim(),
    city: draft.city.trim(),
    heroImage: draft.heroImage,
    logoImage: draft.logoImage,
    logoAlt: draft.logoAlt.trim() || "Logo du commerce",
    contactCard: draft.contactCard?.label
      ? {
          label: draft.contactCard.label,
          organization: draft.contactCard.organization?.trim() || draft.name.trim(),
        }
      : undefined,
    channels,
    quickActions: draft.quickActions.filter((kind) => Boolean(channels[kind])),
    detailItems: draft.detailItems.filter((kind) => Boolean(channels[kind])),
  };
}

export function validateDraft(draft: BuilderDraft) {
  const errors: string[] = [];
  const slug = normalizeSlug(draft.slug);
  if (!slug) errors.push("Ajoute un identifiant pour le lien du client.");
  if (!draft.name.trim()) errors.push("Ajoute le nom du commerce.");
  if (!draft.description.trim()) errors.push("Ajoute une courte description.");
  if (!draft.city.trim()) errors.push("Ajoute la ville.");
  if (!Object.values(draft.channels).some((channel) => channel?.value || channel?.href)) {
    errors.push("Active au moins un moyen de contact.");
  }
  return errors;
}
