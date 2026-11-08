import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

const sharedScriptGlobals = {
  ARTWORKS: "readonly",
  ARTWORK_MUSEUMS: "readonly",
  artworkMuseum: "readonly",
  COLLECTIONS: "readonly",
  QUOTES: "readonly",
  MUSEUM_TOTAL: "readonly",
  MUSEUM_MILESTONES: "readonly",
  museumStats: "readonly",
  artGradient: "readonly",
  artImageUrl: "readonly",
  weekCardData: "readonly",
  roundRectPath: "readonly",
  commonsThumbUrl: "readonly",
  loadArtImage: "readonly",
  loadImage: "readonly",
  drawWeekCard: "readonly",
  downloadWeekCard: "readonly",
  drawPassportCard: "readonly",
  downloadPassportCard: "readonly",
  passportDateKey: "readonly"
};

const exportedLibraryNames = "^(ARTWORKS|ARTWORK_MUSEUMS|artworkMuseum|COLLECTIONS|QUOTES|MUSEUM_TOTAL|MUSEUM_MILESTONES|museumStats|artGradient|artImageUrl|weekCardData|roundRectPath|commonsThumbUrl|loadArtImage|loadImage|drawWeekCard|downloadWeekCard|drawPassportCard|downloadPassportCard|passportDateKey|localDateKey)$";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**"
    ]
  },
  {
    files: [
      "background.js",
      "content/**/*.js",
      "lib/**/*.js",
      "popup/**/*.js",
      "newtab/**/*.js"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.webextensions
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }]
    }
  },
  {
    files: [
      "background.js",
      "content/**/*.js",
      "popup/**/*.js",
      "newtab/**/*.js"
    ],
    languageOptions: {
      globals: sharedScriptGlobals
    }
  },
  {
    files: ["lib/**/*.js"],
    languageOptions: {
      globals: {
        ...sharedScriptGlobals,
        localDateKey: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: exportedLibraryNames }],
      "no-redeclare": "off"
    }
  }
]);
