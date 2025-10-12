# version-container

A minimal TypeScript library built with Vite for building and Vitest for testing.

## Features

- **TypeScript** with strict mode enabled
- **Vite** for fast builds and development
- **Vitest** for unit testing
- **ESLint** with TypeScript support (ESLint 9 flat config)
- **Prettier** for code formatting
- **ESM modules** by default with CommonJS output support

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
# Type check without emitting files
npm run typecheck

# Run tests in watch mode
npm test

# Run tests with UI
npm run test:ui

# Generate test coverage report
npm run test:coverage

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check code formatting
npm run format:check
```

### Building

```bash
npm run build
```

This will generate:
- `dist/version-container.es.js` - ESM module
- `dist/version-container.cjs.js` - CommonJS module
- `dist/*.d.ts` - TypeScript declaration files

## Project Structure

```
/src                # Source code
  /example.ts       # Example module
  /index.ts         # Main entry point (barrel exports)

/tests              # Unit tests
  /example.test.ts  # Tests for example module

/dist               # Build output (gitignored)
```

## Guidelines

See [AGENTS.md](./AGENTS.md) for detailed architecture principles and testing guidelines.

## Scripts

- `npm run dev` - Start development server (if applicable)
- `npm run build` - Build for production
- `npm test` - Run tests in watch mode
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Generate coverage report
- `npm run lint` - Run linter
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code
- `npm run format:check` - Check code formatting
- `npm run typecheck` - Type check without emitting files

## License

ISC
