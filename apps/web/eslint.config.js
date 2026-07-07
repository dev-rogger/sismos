import { nextJsConfig } from "@sismos/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Serwist writes the compiled service worker here at build time; it's a
  // generated artifact, not source, so it shouldn't be linted.
  { ignores: ["public/sw.js"] },
  ...nextJsConfig,
];
