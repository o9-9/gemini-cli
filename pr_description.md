### Summary

This PR enhances Plan Mode by allowing users to configure a custom directory for
storing implementation plans. This enables workflows where plans need to be
persisted, versioned, or shared within the project structure, rather than being
confined to the default temporary directory.

### Key Changes

- **Configuration**: Introduced a new `general.plan` configuration object in
  `settings.json` with a `directory` property.
  - Users can now set `"general": { "plan": { "directory": "docs/plans" } }`.
- **Core Logic**:
  - Updated `Config` to resolve the plan directory, supporting both absolute
    paths and paths relative to the project root.
  - Added security validation to ensure the configured directory is strictly
    within the project workspace.
  - Updated `EnterPlanModeTool` to inform the user of the active plan directory.
- **Schema**: Updated `settings.schema.json` and `settingsSchema.ts` to validate
  the new configuration structure.
- **Documentation**: Added a guide to `docs/cli/plan-mode.md` explaining how to
  configure the custom directory and the requisite security policies.

### How to Test

1.  **Configure Directory**: Add the following to your
    `~/.gemini/settings.json`:
    ```json
    {
      "general": {
        "plan": {
          "directory": "conductor/plans"
        }
      }
    }
    ```
2.  **Enter Plan Mode**: Run the `/plan` command.
3.  **Verify**: Confirm that the agent creates and reads plan files from the
    `conductor/plans/` directory in your workspace.

### Verification

- **Preflight**: Ran `npm run preflight` successfully.
- **Tests**: Added unit tests covering:
  - Configuration loading and migration.
  - Path resolution and security validation (preventing access outside
    workspace).
  - Schema validation.
