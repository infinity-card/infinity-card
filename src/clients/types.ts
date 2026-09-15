export type CardTheme = "women" | "men";

export type ChannelKind =
  | "whatsapp"
  | "phone"
  | "reviews"
  | "email"
  | "instagram"
  | "linkedin"
  | "facebook"
  | "tiktok"
  | "address"
  | "website";

export type Channel = {
  label: string;
  value?: string;
  href: string;
  external?: boolean;
};

export type CardColors = {
  background: string;
  primary: string;
  accent: string;
  softAccent: string;
  ink: string;
};

export type ClientCard = {
  slug: string;
  theme: CardTheme;
  name: string;
  description: string;
  city: string;
  heroImage: string;
  logoImage: string;
  logoAlt: string;
  colors?: CardColors;
  isPlaceholder?: boolean;
  contactCard?: {
    label: string;
    organization?: string;
  };
  channels: Partial<Record<ChannelKind, Channel>>;
  quickActions: ChannelKind[];
  detailItems: ChannelKind[];
};
