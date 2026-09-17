import type { ClientCard } from "../../types";

export const client: ClientCard = {
  "slug": "ic-002",
  "theme": "women",
  "name": "Test",
  "description": "Tes",
  "city": "Test",
  "heroImage": "assets/clients/ic-002/hero.webp",
  "logoImage": "assets/clients/ic-002/logo.webp",
  "logoAlt": "Logo du commerce",
  "colors": {
    "background": "#ffffff",
    "primary": "#813f51",
    "accent": "#b96f73",
    "softAccent": "#dcb8b6",
    "ink": "#18211f"
  },
  "contactCard": {
    "label": "Ajouter aux contacts",
    "organization": "Test"
  },
  "channels": {
    "whatsapp": {
      "label": "WhatsApp",
      "value": "0123456789",
      "href": "https://wa.me/0123456789",
      "external": true
    }
  },
  "quickActions": [],
  "detailItems": [
    "whatsapp"
  ]
};

export default client;
