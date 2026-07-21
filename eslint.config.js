import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";

// Resolve the react preset rules defensively — the plugin changed its
// flat-config export shape across versions. We intentionally do NOT spread the
// react-hooks preset: v7 bundles aggressive React-Compiler rules that are too
// noisy for this codebase. We enable only the two classic hook rules below.
const reactRecommended =
  react.configs?.flat?.recommended?.rules ??
  react.configs?.recommended?.rules ??
  {};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "public/**",
      ".gitnexus/**",
      ".codegraph/**",
      ".claude/**",
    ],
  },

  js.configs.recommended,

  // Application source (browser + JSX).
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactRecommended,
      // New JSX transform (Vite) — React import not required, prop-types unused.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Cosmetic JSX-text rule; too noisy for existing marketing copy.
      "react/no-unescaped-entities": "off",
      // Classic, non-intrusive hook rules only.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ], // React & Hooks
      "react/self-closing-comp": ["error", { component: true, html: true }],
      "react/no-array-index-key": "warn",
      // Import formatting
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": "error",

      // JS General
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
    },
  },

  // Node context: Vite/Playwright/ESLint config files.
  {
    files: ["*.config.js", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // Tests (vitest + node; vitest APIs are imported explicitly).
  {
    files: ["tests/**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // Keep Prettier last so it disables all stylistic rules it owns.
  prettier,
];
