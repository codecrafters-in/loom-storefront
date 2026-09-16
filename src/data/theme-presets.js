/**
 * Ready-made looks: every colour, both fonts and the corners in one pick.
 *
 * A live store gets this list from its backend (`GET /admin/storefront` → `admin.themePresets`); the demo uses this
 * copy, which matches the Odoo module's `services/theme.py` PRESETS (its tests check the same contrast rules as
 * test/theme-presets.test.mjs does here).
 */
export const THEME_PRESETS = [
  {
    "id": "linen",
    "name": "Linen",
    "description": "Warm off-white, a walnut accent and an editorial serif. The storefront's own look.",
    "industries": "Clothing, lifestyle",
    "dark": false,
    "colors": {
      "page": "#FAF8F5",
      "surface": "#FFFFFF",
      "ink": "#1A1815",
      "muted": "#6B645A",
      "accent": "#7C4A2D",
      "accentInk": "#FFFFFF",
      "sale": "#A3341F"
    },
    "fonts": {
      "heading": "Fraunces",
      "body": "Inter"
    },
    "radius": 2,
    "corners": "small"
  },
  {
    "id": "paper",
    "name": "Paper",
    "description": "White, black and nothing else, so product photos do the talking.",
    "industries": "Any catalogue",
    "dark": false,
    "colors": {
      "page": "#FFFFFF",
      "surface": "#FAFAFA",
      "ink": "#111111",
      "muted": "#5C5C5C",
      "accent": "#111111",
      "accentInk": "#FFFFFF",
      "sale": "#B42318"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Inter"
    },
    "radius": 0,
    "corners": "none"
  },
  {
    "id": "midnight",
    "name": "Midnight",
    "description": "Dark blue-grey with a soft blue accent and a geometric sans-serif.",
    "industries": "Electronics, gaming",
    "dark": true,
    "colors": {
      "page": "#0E1116",
      "surface": "#161B22",
      "ink": "#F0F3F6",
      "muted": "#9DA7B3",
      "accent": "#7AA2F7",
      "accentInk": "#0E1116",
      "sale": "#FF7B72"
    },
    "fonts": {
      "heading": "Manrope",
      "body": "Manrope"
    },
    "radius": 8,
    "corners": "medium"
  },
  {
    "id": "evergreen",
    "name": "Evergreen",
    "description": "Pale green-grey, a deep forest accent and a classic serif.",
    "industries": "Outdoor, garden, sustainable goods",
    "dark": false,
    "colors": {
      "page": "#F4F6F2",
      "surface": "#FFFFFF",
      "ink": "#17201A",
      "muted": "#56615A",
      "accent": "#2F5D46",
      "accentInk": "#FFFFFF",
      "sale": "#A63D2F"
    },
    "fonts": {
      "heading": "Lora",
      "body": "Work Sans"
    },
    "radius": 2,
    "corners": "small"
  },
  {
    "id": "harbour",
    "name": "Harbour",
    "description": "Cool white, a sea-blue accent and a clean sans-serif.",
    "industries": "Homeware, travel, services",
    "dark": false,
    "colors": {
      "page": "#F4F7FA",
      "surface": "#FFFFFF",
      "ink": "#13212E",
      "muted": "#526170",
      "accent": "#1F5F8B",
      "accentInk": "#FFFFFF",
      "sale": "#B3261E"
    },
    "fonts": {
      "heading": "DM Sans",
      "body": "DM Sans"
    },
    "radius": 8,
    "corners": "medium"
  },
  {
    "id": "blush",
    "name": "Blush",
    "description": "A soft pink ground, a raspberry accent, a fashion serif and round corners.",
    "industries": "Beauty, personal care",
    "dark": false,
    "colors": {
      "page": "#FBF5F3",
      "surface": "#FFFFFF",
      "ink": "#2B1B1F",
      "muted": "#6E5A5F",
      "accent": "#A63D62",
      "accentInk": "#FFFFFF",
      "sale": "#B42318"
    },
    "fonts": {
      "heading": "Playfair Display",
      "body": "Poppins"
    },
    "radius": 16,
    "corners": "large"
  },
  {
    "id": "terracotta",
    "name": "Terracotta",
    "description": "Cream with a burnt-orange accent and a bookish serif.",
    "industries": "Food, pottery, crafts",
    "dark": false,
    "colors": {
      "page": "#FBF6EF",
      "surface": "#FFFFFF",
      "ink": "#2A1E16",
      "muted": "#6B5A4C",
      "accent": "#A84B25",
      "accentInk": "#FFFFFF",
      "sale": "#8E2A1C"
    },
    "fonts": {
      "heading": "Libre Baskerville",
      "body": "Noto Sans"
    },
    "radius": 2,
    "corners": "small"
  },
  {
    "id": "circuit",
    "name": "Circuit",
    "description": "Cool grey, an electric indigo accent and a geometric sans-serif.",
    "industries": "Gadgets, software, tech accessories",
    "dark": false,
    "colors": {
      "page": "#F6F7FB",
      "surface": "#FFFFFF",
      "ink": "#101828",
      "muted": "#4B5565",
      "accent": "#3538CD",
      "accentInk": "#FFFFFF",
      "sale": "#C01048"
    },
    "fonts": {
      "heading": "Manrope",
      "body": "Inter"
    },
    "radius": 8,
    "corners": "medium"
  },
  {
    "id": "noir",
    "name": "Noir",
    "description": "Near-black with an antique gold accent and a fine serif.",
    "industries": "Jewellery, watches, luxury",
    "dark": true,
    "colors": {
      "page": "#121110",
      "surface": "#1C1A18",
      "ink": "#F4EFE7",
      "muted": "#B3AA9C",
      "accent": "#C9A45C",
      "accentInk": "#121110",
      "sale": "#E8836A"
    },
    "fonts": {
      "heading": "Cormorant Garamond",
      "body": "Inter"
    },
    "radius": 0,
    "corners": "none"
  },
  {
    "id": "playroom",
    "name": "Playroom",
    "description": "Warm cream, a bright orange accent, friendly type and round corners.",
    "industries": "Toys, kids, stationery",
    "dark": false,
    "colors": {
      "page": "#FFFBF2",
      "surface": "#FFFFFF",
      "ink": "#1F1A33",
      "muted": "#5B5670",
      "accent": "#C2410C",
      "accentInk": "#FFFFFF",
      "sale": "#9D174D"
    },
    "fonts": {
      "heading": "Poppins",
      "body": "Poppins"
    },
    "radius": 16,
    "corners": "large"
  },
  {
    "id": "sage",
    "name": "Sage",
    "description": "Muted green on pale sage with a calm serif.",
    "industries": "Wellness, tea, natural care",
    "dark": false,
    "colors": {
      "page": "#F3F5F0",
      "surface": "#FFFFFF",
      "ink": "#1E2620",
      "muted": "#5A665D",
      "accent": "#4A6B50",
      "accentInk": "#FFFFFF",
      "sale": "#A23B2C"
    },
    "fonts": {
      "heading": "Lora",
      "body": "Manrope"
    },
    "radius": 8,
    "corners": "medium"
  },
  {
    "id": "espresso",
    "name": "Espresso",
    "description": "Coffee brown on warm paper with a soft serif.",
    "industries": "Coffee, chocolate, bakeries",
    "dark": false,
    "colors": {
      "page": "#F6F0EA",
      "surface": "#FFFDFB",
      "ink": "#24170F",
      "muted": "#6A5646",
      "accent": "#5B3A24",
      "accentInk": "#FFFFFF",
      "sale": "#A33A1F"
    },
    "fonts": {
      "heading": "Fraunces",
      "body": "DM Sans"
    },
    "radius": 2,
    "corners": "small"
  }
]

/** The storefront document's `theme` for a preset. */
export function presetTheme(preset) {
  return {
    preset: preset.id,
    presetChanged: false,
    colors: { ...preset.colors },
    fonts: { ...preset.fonts },
    radius: preset.radius,
  }
}
