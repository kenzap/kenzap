import globals from "globals";
import pluginJs from "@eslint/js";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "ImportDeclaration[source.value=/^\\.\\//]",
        message: "Use absolute paths instead of relative paths."
      }],
      "no-unused-vars": ["warn", { "varsIgnorePattern": "^_" }]
    },
    languageOptions: {
      globals: globals.browser
    }
  },
  pluginJs.configs.recommended,
];