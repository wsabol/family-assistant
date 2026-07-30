# Update Documentation Task

You are updating documentation after code changes.

## 1. Identify Changes
- Check git diff or recent commits for modified files
- Identify which features/modules were changed
- Note any new files, deleted files, or renamed files

## 2. Verify Current Implementation
**CRITICAL**: DO NOT trust existing documentation. Read the actual code.

For each changed file:
- Read the current implementation
- Understand actual behavior (not documented behavior)
- Note any discrepancies with existing docs

## 3. Update Relevant Documentation

<!-- - **CHANGELOG.md**: Add entry under "Unreleased" section
  - Use categories: Added, Changed, Fixed, Security, Removed
  - Be concise, user-facing language -->

- **`.cursor/rules/*`**: Create or update rules that explain the project's architecture, design patterns, and technical guidelines.
  - Update key technical decisions (languages, frameworks, databases).
  - Specific design patterns selected for use and their justifications.
  - Component relationships and critical implementation paths.
  - **Update these sections thoroughly** with the latest changes. Ensure the information is consistent with the current code.
  - **Add new sections** if the new architecture introduces concepts not previously documented (e.g., a new cross-cutting concern, a specific new pattern).

## 4. Documentation Style Rules

✅ **Concise** - Sacrifice grammar for brevity
✅ **Practical** - Examples over theory
✅ **Accurate** - Code verified, not assumed
✅ **Current** - Matches actual implementation

❌ No enterprise fluff
❌ No outdated information
❌ No assumptions without verification

## 5. Ask if Uncertain

If you're unsure about intent behind a change or user-facing impact, **ask the user** - don't guess.
