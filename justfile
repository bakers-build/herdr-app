# Entry points mirror Herdr's justfile; CI calls the bun scripts directly.

default:
    @just --list

# Run the mod tests
test:
    bun run test

# Lint, format check, type check, hygiene, Herdr types, tests with the coverage floor
check:
    bun run check
