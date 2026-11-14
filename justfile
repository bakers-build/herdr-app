# Entry points mirror Herdr's justfile; CI calls the bun scripts directly.

default:
    @just --list

# Run the mod tests
test:
    bun run test

# Lint, format check, type check and tests
check:
    bun run check
