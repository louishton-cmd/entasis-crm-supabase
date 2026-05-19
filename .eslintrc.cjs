// .eslintrc.cjs
// Config ESLint pour le CRM (Vite + React 18, plain JS).
//
// Pragmatique : on remonte les vrais problèmes (unused vars, deps de
// hooks, keys manquantes) en *warning* — pas en error — pour ne pas
// bloquer les commits actuels. Au fur et à mesure du refacto on
// resserrera.

module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vite.config.js'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh'],
  rules: {
    // React 18 + JSX runtime → pas besoin d'importer React dans chaque fichier
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',
    'react/jsx-no-target-blank': 'warn',

    // Hooks : strict mais en warning pour ne pas bloquer le code legacy
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Unused : warning + on autorise _foo pour les args volontairement skipped
    'no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    }],

    // Vite Fast Refresh : composant exporté doit être seul dans son fichier
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // Préfère const sur let quand possible
    'prefer-const': 'warn',

    // Pas de console.log en prod (on a un logger dédié)
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

    // try/catch avec catch vide : pattern légitime pour localStorage,
    // gcal token, etc. où l'erreur n'est pas actionnable.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
}
