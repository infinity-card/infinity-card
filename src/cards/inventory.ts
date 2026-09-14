export const TOTAL_CARD_SLOTS = 200;

export type CardSlot = {
  id: string;
  slug: string;
};

export type CardSlotStatus = "available" | "reserved" | "published" | "sold";

export const CARD_SLOTS: CardSlot[] = Array.from({ length: TOTAL_CARD_SLOTS }, (_, index) => {
  const id = `IC-${String(index + 1).padStart(3, "0")}`;
  return { id, slug: id.toLowerCase() };
});

export function isCardSlotSlug(value: string) {
  const match = /^ic-(\d{3})$/i.exec(value.trim());
  if (!match) return false;
  const number = Number(match[1]);
  return number >= 1 && number <= TOTAL_CARD_SLOTS;
}

export function getCardSlot(slug: string) {
  const normalized = slug.trim().toLowerCase();
  return CARD_SLOTS.find((slot) => slot.slug === normalized);
}
