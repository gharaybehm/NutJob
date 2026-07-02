import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Trigger.dev build artifacts:
    ".trigger/**",
    // Local working folders (git-ignored):
    "design_handoff_rootloot_portal/**",
    "scratch/**",
    // Service worker (browser global scope, not lint-target source):
    "public/sw.js",
  ]),
  {
    rules: {
      // Allow intentionally-unused identifiers prefixed with underscore (e.g. `farmId: _farmId`)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
