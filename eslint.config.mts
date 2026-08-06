import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'.claude',
		'esbuild.config.mjs',
		'jest.config.js',
		'scripts',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Jest injects its globals, and the tests are not plugin UI, so the Obsidian UI rules
		// have nothing to say about them.
		files: ['src/__tests__/**/*.ts', 'src/__mocks__/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.jest,
				...globals.node,
			},
		},
		rules: {
			'obsidianmd/ui/sentence-case': 'off',
			'obsidianmd/hardcoded-config-path': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			// The vault audit's console output *is* its deliverable: it prints what the real
			// vault looks like today. Nothing here ships inside the plugin.
			'obsidianmd/rule-custom-message': 'off',
		},
	},
);
