# Vórtex AI

The current Vórtex website is wrapped in a Vite multi-page application so it can be opened and evolved in Cursor, Dyad, Codex or any standard Node.js IDE without changing the existing visual export.

## Requirements

- Node.js 20.19+ (or 22.12+)
- npm or pnpm

## Run with npm

```bash
npm install
npm run dev
```

## Run with pnpm

```bash
pnpm install
pnpm dev
```

The development server runs at `http://localhost:8080`.

## Project structure

```text
.
├── src/
│   ├── app/          # application bootstrap and shared initialization
│   ├── components/   # reusable application components
│   ├── lib/          # small shared utilities
│   ├── pages/        # page/route registry
│   ├── styles/       # future application-level styles
│   └── main.js       # Vite application entrypoint
├── assets/           # current exported media and fonts
├── css/              # current page CSS (kept intact for visual fidelity)
├── js/               # current page JS (kept intact for visual fidelity)
├── blog/             # current article HTML entrypoints
├── index.html        # current home page entrypoint
├── vite.config.mjs   # Vite dev/build configuration
└── package.json
```

## Migration strategy

The existing HTML, CSS, JavaScript and assets are deliberately preserved in place. Vite serves the same HTML entrypoints and injects only the non-visual `src/main.js` bootstrap. This provides a conventional application base while keeping the current rendered pages unchanged.

`npm run build` builds all top-level HTML pages and the HTML pages inside `/blog` into `dist/`.
