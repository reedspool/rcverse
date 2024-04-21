import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";

export default [
  {
    languageOptions: { globals: globals.node },
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      indent: ["error", 2],
      "@stylistic/indent": ["error", 2],
      "@stylistic/no-tabs": ["error"],
    },
  },
];
