# Design

> **Placeholder.** The full spec (tokens, layout, behaviour) and reference screenshots will be pasted
> here and into `docs/design/` before slice 2. Until then, don't invent visual design.

Canvas link (for humans only; agents can't open it): _TODO: paste claude.ai canvas link_

## Direction (decision 10)

- Combined "Marginalia + Lamplight".
- **Page** and **Focus** tabs; light and dark themes.
- A single amber highlight on the spoken word.
- Tokens are defined once as CSS variables in `src/renderer/styles/tokens.css`; components never use
  raw hex values.
- Fonts are bundled locally via @fontsource. The app works offline; nothing loads from Google Fonts at
  runtime.
- Reference screenshots go in `docs/design/`.
