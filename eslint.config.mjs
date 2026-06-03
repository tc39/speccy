import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
	{ ignores: ['dist/', 'build/', 'node_modules/', 'data/'] },
	...compat.config({ extends: '@ljharb' }).map((config) => ({
		...config,
		files: ['**/*.js'],
	})),
	{
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'script',
			globals: { ...globals.browser },
		},
		rules: {
			'no-extra-parens': 'off',
			'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
		},
	},
	...tseslint.configs.recommended.map((config) => ({
		...config,
		files: ['**/*.ts'],
	})),
	{
		files: ['**/*.ts'],
		languageOptions: {
			globals: { ...globals.node },
		},
	},
];
