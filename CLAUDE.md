# CLAUDE.md

## Project Overview

This is a TypeScript library project built with Vite for building and bundling, and Vitest for unit testing. The project follows strict typing practices and uses ESM modules.

## Architecture Principles

### 1. **Strict Typing**
- Always use TypeScript's strict mode (`strict: true` in `tsconfig.json`)
- Avoid using `any` types; use `unknown` or proper type definitions instead
- Export all public types and interfaces for library consumers
- Use JSDoc comments for documentation alongside TypeScript types

### 2. **Modular Design**
- Keep modules small and focused on a single responsibility
- Use the barrel export pattern in `index.ts` to control the public API
- Separate concerns: utilities, core logic, types, and exports
- Follow the principle: "A module should do one thing and do it well"

### 3. **ESM First**
- All code uses ESM modules (`import`/`export`)
- Package is configured with `"type": "module"` in `package.json`
- Build outputs both ESM and CommonJS formats for maximum compatibility

### 4. **Minimal Dependencies**
- Keep production dependencies to an absolute minimum
- Evaluate the necessity and maintenance status of any new dependency
- Prefer standard library solutions when possible

### 5. **Clean Code Standards**
- Use ESLint and Prettier for consistent code style
- Run linting and formatting before commits
- Keep functions small and readable
- Use descriptive variable and function names

## Testing Guidelines

### 1. **Test Coverage**
- Aim for high test coverage (80%+) but focus on meaningful tests
- Every public function should have unit tests
- Test edge cases and error conditions, not just happy paths

### 2. **Test Structure**
- Use `describe` blocks to group related tests
- Use descriptive test names that explain what is being tested
- Follow the Arrange-Act-Assert (AAA) pattern:
  ```typescript
  it('should do something', () => {
    // Arrange: Set up test data
    const input = 'test';

    // Act: Execute the code under test
    const result = myFunction(input);

    // Assert: Verify the result
    expect(result).toBe('expected');
  });
  ```

### 3. **Test Independence**
- Each test should be independent and not rely on others
- Avoid shared state between tests
- Use `beforeEach`/`afterEach` for setup/cleanup when needed

### 4. **Unit vs Integration Tests**
- Focus on unit tests for individual functions and modules
- Use integration tests sparingly for complex interactions
- Mock external dependencies in unit tests

### 5. **Test-Driven Development (TDD)**
- Consider writing tests before implementation for new features
- Red-Green-Refactor cycle: Write failing test → Make it pass → Refactor

## Development Workflow

### Git Workflow & Best Practices

1. Context-Aware Branching
Check Current State: Before starting work, check the current branch.
Existing Branches: If you are already on a feature or fix branch that matches the current task, stay on that branch. Do not create a new one.

New Work: If you are on main (or the default integration branch), create a new branch named `feature/description` or `fix/description` or `fix/issue-number` if issue number was provided.

Linear History: Always keep the history straight. Use rebasing to bring in updates from the main branch; avoid merge commits unless specifically requested.

2. Atomic Commits & "Commit-Before-Delete"
Single Logic Changes: Each commit must be atomic. Do not mix refactoring with new feature code.

Strict File Preservation: You are prohibited from deleting uncommitted project files. If a file is no longer needed:

 - `git add` the file.
 - `git commit` it (to ensure its last state is in the history).
 - `git rm` the file in a separate, follow-up commit.

No Branch Deletion: Never run `git branch -d` or `-D`. All branches must remain in the repository for human review.

3. Safety & Documentation8
Verification: Run git status before every commit to verify the staging area. Always run it separately, never combine it with other git commands. Check the output than go to the next step.

Commit Messages: Use the imperative mood (e.g., "Fix header alignment"). If the change isn't self-explanatory, add a body to the commit message explaining the "why."

### 1. **Setting Up**
```bash
npm install              # Install dependencies
npm run typecheck        # Type check without emitting files
npm run lint             # Run linter
npm run format:check     # Check code formatting
```

### 2. **Development**
```bash
npm run dev              # Start development server (if applicable)
npm test                 # Run tests in watch mode
npm run test:ui          # Run tests with UI
npm run test:coverage    # Generate coverage report
```

### 3. **Before Commit**
```bash
npm run typecheck        # Ensure no type errors
npm run lint:fix         # Fix linting issues
npm run format           # Format code
npm test                 # Run all tests
```

### 4. **Building**
```bash
npm run build            # Build for production
```

## File Structure

```
/src                     # Source code
  /index.ts             # Main entry point (barrel exports)
  /example.ts           # Example module
  /...                  # Other modules

/tests                  # Unit tests
  /example.test.ts      # Tests for example module
  /...                  # Other test files

/dist                   # Build output (gitignored)
```

## Code Quality Checklist

Before submitting code, ensure:
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] New functionality has tests
- [ ] Public APIs have JSDoc comments
- [ ] No console.log or debug code remains
- [ ] Types are exported for library consumers

## Incremental Development

### Adding New Features
1. Create a new module file in `/src` (e.g., `feature.ts`)
2. Export types and functions with proper JSDoc
3. Add corresponding test file in `/tests` (e.g., `feature.test.ts`)
4. Export public APIs through `/src/index.ts`
5. Run tests, linting, and type checking
6. Update documentation if needed

### Refactoring
1. Ensure existing tests pass before refactoring
2. Refactor code while keeping tests green
3. Add tests for any uncovered edge cases discovered
4. Verify no breaking changes to public API

## Best Practices

### TypeScript
- Use `const` by default, `let` only when reassignment is needed
- Avoid `var` completely
- Use template literals for string concatenation
- Leverage type inference when types are obvious
- Define explicit return types for public functions

### Testing
- Test behavior, not implementation details
- Keep tests readable and maintainable
- Use `it.each` for parameterized tests
- Prefer `toBe` for primitives, `toEqual` for objects
- Use descriptive test names that serve as documentation

### Error Handling
- Use custom error classes for domain-specific errors
- Always type error boundaries
- Validate inputs for public APIs
- Provide helpful error messages

## Performance Considerations
- Avoid premature optimization
- Profile before optimizing
- Consider memory implications of data structures
- Be mindful of bundle size

## Security
- Never commit secrets or API keys
- Validate and sanitize external inputs
- Keep dependencies updated
- Review dependency security advisories

---

**Remember:** This is an incremental library. Start small, build solid foundations, and grow the codebase organically based on real needs.
