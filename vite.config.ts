import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read root package.json to extract publishing metadata
const rootPackageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);

// Create minimal package.json for the dist folder (npm publishing)
const distPackageJson = {
  name: rootPackageJson.name,
  version: rootPackageJson.version,
  description: rootPackageJson.description,
  license: rootPackageJson.license,
  author: rootPackageJson.author,
  keywords: rootPackageJson.keywords,
  repository: rootPackageJson.repository,
  bugs: rootPackageJson.bugs,
  homepage: rootPackageJson.homepage,
  main: rootPackageJson.main,
  module: rootPackageJson.module,
  types: rootPackageJson.types,
  exports: rootPackageJson.exports,
  engines: rootPackageJson.engines,
};

export default defineConfig({
  build: {
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'VersionContainer',
      fileName: (format) => `version-container.${format}.js`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [],
    },
  },
  plugins: [
    {
      name: 'copy-metadata',
      writeBundle(): void {
        // Copy README.md and LICENSE to dist folder for npm package
        const readmeSrc = resolve(__dirname, 'README.md');
        const licenseSrc = resolve(__dirname, 'LICENSE');
        const readmeDest = resolve(__dirname, 'dist', 'README.md');
        const licenseDest = resolve(__dirname, 'dist', 'LICENSE');
        const packageJsonDest = resolve(__dirname, 'dist', 'package.json');

        if (existsSync(readmeSrc)) {
          copyFileSync(readmeSrc, readmeDest);
        }
        if (existsSync(licenseSrc)) {
          copyFileSync(licenseSrc, licenseDest);
        }

        // Write minimal package.json for npm publishing
        writeFileSync(packageJsonDest, JSON.stringify(distPackageJson, null, 2) + '\n');
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
