# Obsidian Recording Workouts

Obsidian Recording Workouts is a small, local Obsidian plugin that helps you keep a workout log directly in your vault. The plugin provides a modal for quickly recording sets, weights, reps and tags — all stored in plain Markdown files inside your notes.

## Key features

- Fast set logging (weight/reps) via a modal or command.
- Save workout entries directly to a Markdown file configured in settings (default: `Тренировки/Все упражнения.md`).
- Group exercises by tags and persist collapsed group state.
- UI niceties: dynamic weight slider with gradual max increase, keyboard support and a ribbon icon for quick access.
- Fully local — no external API calls or cloud services.

## Installation

1. Clone the repository into your Obsidian plugins folder:

```powershell
cd <Vault>/.obsidian/plugins
git clone https://github.com/GoodGame563/obsidian-extension-for-recording-workouts.git
```

1. Install dependencies and build the plugin:

```powershell
npm install
npm run build
```

1. Restart Obsidian and enable the plugin under Settings → Community plugins.

## Usage

- Open the command palette and run `Open exercise modal (log set)` or click the ribbon icon to open the entry modal.
- Enter an exercise name (or pick an existing one), weight, repetitions, and optional tags like `#legs` or `#upperbody`.
- Press Save to append the entry to the configured file.

## Settings

Go to Settings → Community plugins → Obsidian Recording Workouts → Options to configure:

- `Tasks file path` — Markdown file for storing recorded sets (default: `Тренировки/Все упражнения.md`).
- `Remember last exercise` — if enabled, the plugin pre-fills the modal with the last-used exercise.
- `Modal size` and `Modal spacing` — control the modal's appearance and spacing.

## Commands

- `Open exercise modal (log set)` — open a modal to record a set.
- `Sample editor command` — example command (consider renaming to a relevant label in `main.ts`).

## Development

To modify and build the plugin locally:

```powershell
npm install
npm run dev  # watch build
```

Code structure suggestion: `settings.ts`, `commands/`, `ui/` for modular organization.

## License

This project is available under the MIT license — free to use, modify and distribute with attribution.

© 2025 GoodGame563

<!-- Removed the original sample plugin dynamic slider section; plugin README now focuses on Obsidian Recording Workouts features and usage. -->

