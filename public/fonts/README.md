# Aeonik font

Place Aeonik `.woff2` files here so the app can use them:

- `Aeonik-Regular.woff2` (weight 400)
- `Aeonik-Medium.woff2` (weight 500)
- `Aeonik-Bold.woff2` (weight 700)

If you have a **variable** font instead (e.g. `Aeonik-Variable.woff2`), you can use a single file by updating `app/globals.css` with one `@font-face` using `font-weight: 100 900` (or the range your font supports).

Until these files are present, the UI falls back to system fonts.
