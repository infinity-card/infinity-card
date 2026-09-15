import type { ClientCard } from "../../types";

export const client: ClientCard = {
  "slug": "ic-001",
  "theme": "men",
  "name": "INFINITY CARD",
  "description": "Infinity Card , Un simple geste, des connexions infinies.",
  "city": "Meknès",
  "heroImage": "assets/clients/atelier-yassine/hero.webp",
  "logoImage": "assets/clients/atelier-yassine/logo.webp",
  "logoAlt": "Logo du commerce",
  "colors": {
    "background": "#ffffff",
    "primary": "#0011ff",
    "accent": "#153748",
    "softAccent": "#c9946e",
    "ink": "#0d2029"
  },
  "contactCard": {
    "label": "Ajouter aux contacts",
    "organization": "INFINITY CARD"
  },
  "channels": {
    "whatsapp": {
      "label": "WhatsApp",
      "value": "+212 691-796692",
      "href": "https://wa.me/212691796692",
      "external": true
    },
    "phone": {
      "label": "Téléphone",
      "value": "+212 691-796692",
      "href": "tel:+212 691-796692"
    },
    "email": {
      "label": "E-mail",
      "value": "abdoukassou1200@gmail.com",
      "href": "mailto:abdoukassou1200@gmail.com"
    },
    "instagram": {
      "label": "Instagram",
      "value": "@infinitycard",
      "href": "https://www.instagram.com/infitycard?stkn=Y2hwM29tNzNqNjVk",
      "external": true
    },
    "linkedin": {
      "label": "LinkedIn",
      "value": "OUKASSOU abdejellil",
      "href": "https://www.linkedin.com/in/abdejellil-oukassou-37105b349/",
      "external": true
    },
    "facebook": {
      "label": "Facebook",
      "value": "infinity_card",
      "href": "https://facebook.com/infinity_card",
      "external": true
    }
  },
  "quickActions": [
    "whatsapp",
    "phone",
    "instagram"
  ],
  "detailItems": [
    "whatsapp",
    "phone",
    "email",
    "instagram",
    "linkedin",
    "facebook"
  ]
};

export default client;
