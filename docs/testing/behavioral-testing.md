# Behavioural Testing Standards

## Core Rule
- Assert only user-observable behavior.
- If internals are refactored while UX stays the same, the test should still pass.

## Mandatory Practices
- Use Testing Library queries in this order: `getByRole`, `getByLabelText`, `getByPlaceholderText`, then `getByTestId`.
- Mock only true external edges (Tauri bridge, plugin boundaries, OS integration).
- Keep component trees real for cross-view flows. Do not replace child views with mock placeholders in behavior suites.
- Prefer assertions on visible state, accessible name, focus, toasts, and user-triggered outcomes.

## What Not To Assert
- Store setter invocation counts (`setState`, `setScrollPosition`, etc.).
- Hook internals or private helper call paths.
- CSS class internals unless the class itself is the visible behavior under test.
- Event emitter internals when user-visible effect can be asserted directly.
- Example (bad): `expect(setSection).toHaveBeenCalledWith(2)`.
- Example (good): assert the section indicator and visible section title changed to section 3.
- Example (bad): `expect(parseMarkdown).toHaveBeenCalledTimes(1)`.
- Example (good): assert launch is blocked and the user sees the invalid-structure warning.

## Test Layers
- `src/test/behavior/critical`: blocking critical user flows.
- `src/test/behavior/high`: high-impact behavior, promoted to blocking after stabilization.
- `src/test/behavior/medium` and `src/test/behavior/low`: completeness and hardening.

## Runtime Boundary Guidance
- Frontend behavior tests validate UX outcomes using deterministic bridge stubs.
- Rust runtime tests validate persistence and command/event contracts that frontend behavior depends on.
- Avoid duplicating the same assertion at multiple levels.

## Migration Guidance
- Existing unit tests remain if they validate pure logic contracts.
- Replace only actively harmful shell-wiring tests that primarily verify callback plumbing.
- For each replaced test, add/keep one behavior test proving the same user intent.
