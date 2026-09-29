# Vendored fixtures

`two-boxes.captured.html` is a clipboard payload copied out of Figma (schema
version 106, zstd data chunk). It comes from
[figitdesign/web-to-figma](https://github.com/figitdesign/web-to-figma)
(`internal/oracle-harness/src/figma/__fixtures__/`), MIT licensed; see
`LICENSE-figit`.

It is used only as a decode fixture: proof that the reader handles a real
Figma copy. Templates for authoring come from `../captured/`, which you
populate with `pnpm probe:capture`.
