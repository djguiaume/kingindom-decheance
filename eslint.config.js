// ESLint flat config. Besides style, it enforces the architecture boundaries of ADR-008
// (layer 2, after the tsconfig "no DOM" layer): the role ArchUnit plays in a Java build.
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const viewLibs = ['phaser', 'phaser/*', 'vue', 'vue-router', 'pinia'];

const restrict = (packages, extra = []) => ({
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      paths: extra,
      patterns: [
        {
          group: packages,
          message:
            'Architecture boundary (ADR-008): arrows run apps/game → sim → core; content is usable by all.',
        },
      ],
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/content/schema/**',
      '.art-mock/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      // Prettier owns template formatting.
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
    },
  },
  {
    files: ['apps/game/src/**'],
    languageOptions: { globals: { ...globals.browser, __COMMIT__: 'readonly' } },
  },

  // The core: pure, deterministic, renderer-free (ADR-002, ADR-004).
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      ...restrict(
        [...viewLibs, '@kd/sim', '@kd/game', 'node:*'],
        // The core may use content *types* only.
        [
          {
            name: '@kd/content',
            allowTypeImports: true,
            message: 'The core may import content types only (ADR-008).',
          },
        ],
      ),
      'no-restricted-globals': [
        'error',
        ...[
          'Date',
          'performance',
          'setTimeout',
          'setInterval',
          'requestAnimationFrame',
          'window',
          'document',
          'crypto',
        ].map((name) => ({
          name,
          message:
            'Not deterministic or not available headless: keep it out of the core (ADR-002).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG in state.rng (ADR-002).',
        },
        ...['sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'pow', 'hypot', 'cbrt'].map((property) => ({
          object: 'Math',
          property,
          message:
            'Not bit-exact across JavaScript engines; stick to + - * / and Math.sqrt in the core.',
        })),
      ],
    },
  },
  {
    files: ['packages/content/src/**/*.ts'],
    rules: restrict([...viewLibs, '@kd/core', '@kd/sim', '@kd/game']),
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: restrict([...viewLibs, '@kd/game']),
  },
);
