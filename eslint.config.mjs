import base from "@groupe-j/eslint-config";

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
