# Project: Fetch Icons Tool

## General Instructions
- This project is a TypeScript-based tool for fetching and processing icons.
- Ensure code is clean, maintainable, and follows the existing project structure.

## Tech Stack
- TypeScript
- Node.js

## Coding Style
- Use explicit types whenever possible.
- Avoid `any` type; try to define proper interfaces.
- Prefer `const` over `let` for variable declarations.
- Use async/await for asynchronous operations.

## Convention
- Function names should be descriptive of their action.
- File names should be kebab-case (e.g., `fetch-icons.ts`).

## Project Structure
- `src/`: Source code
  - `interpret.ts`: Main entry point for fetching and interpreting icon tags.
  - `fix-tags.ts`: Utility to refine and fix tags for icons.
  - `extract.ts`: Logic for extracting icon names from various sources.
  - `shared.ts`: Shared utilities, constants, and helper functions.
- `config.json`: Configuration file for URLs, Ollama settings, and prompts.
- `packs-temp/`: Temporary storage for downloaded icon packs.
- `dist/`: Compiled JavaScript output.

## Configuration
- The project uses `config.json` for all settings.
