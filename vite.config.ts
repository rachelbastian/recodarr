import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
	plugins: [
		react(), 
		tailwindcss(), 
		tsconfigPaths(),
		{
			name: 'copy-splash-html',
			buildEnd: async () => {
				// Copy splash.html to dist-react/assets folder during build
				const source = resolve(__dirname, 'src/ui/assets/splash.html');
				const destination = resolve(__dirname, 'dist-react/assets/splash.html');
				
				// Ensure the directory exists
				fs.mkdirSync(resolve(__dirname, 'dist-react/assets'), { recursive: true });
				
				// Copy the file
				try {
					fs.copyFileSync(source, destination);
					console.log('Copied splash.html to dist-react/assets');
				} catch (err) {
					console.error('Failed to copy splash.html:', err);
				}
			}
		}
	],
	base: './',
	build: {
		outDir: 'dist-react',
		assetsDir: 'assets',
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
			},
			output: {
				assetFileNames: (assetInfo) => {
					if (assetInfo.name === 'icon_logo_recodarr.png' || assetInfo.name === 'splash.html') {
						return 'assets/[name][extname]';
					}
					return 'assets/[name]-[hash][extname]';
				},
			},
		},
	},
	server: {
		port: 3524,
		strictPort: true,
	},
	publicDir: resolve(__dirname, 'src/ui/assets'),
});
