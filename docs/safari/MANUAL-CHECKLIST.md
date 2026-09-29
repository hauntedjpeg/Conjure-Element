# Safari manual checklist

Safari cannot be automated with the extension loaded, so every milestone has
a short manual pass here. Playwright's WebKit covers CSS-engine behaviour
only.

## One-time setup

1. Accept the Xcode licence. This needs your password, so it cannot be
   scripted:

   ```bash
   sudo xcodebuild -license accept
   ```

2. Generate the Xcode wrapper into `packages/safari`. Do this once and keep
   the result in the repo:

   ```bash
   pnpm safari:generate
   ```

3. In Safari, open Settings → Advanced and tick **Show features for web
   developers**.

## Every Safari restart

The extension is unsigned, so Safari forgets the permission on quit.

1. Safari → Settings → Developer → tick **Allow unsigned extensions**.
2. Safari → Settings → Extensions → tick **Conjure Element**.

## After changing extension code

```bash
pnpm safari:build
```

Then open the app it reports once, so Safari picks up the new build.

## M0: overlay

| Check | Pass |
|---|---|
| Toolbar button is visible with the violet icon | |
| On first click Safari asks for site access; choose *Always Allow on Every Website* | |
| Click on any page: the panel appears at the top right | |
| Click again: the panel disappears | |
| `Esc` closes the panel | |
| The × button closes the panel | |
| On a page with heavy global CSS, the panel's fonts and colours are unaffected | |
| Web Inspector → Elements: `<conjure-element-overlay>` shows no shadow content from the page's console (`$0.shadowRoot` is `null`) | |
| Web Inspector → Console shows no errors from the extension | |

## M0.5: clipboard

Covered by step 4 of [the probe protocol](../probe/PROTOCOL.md).

## Known unknowns to watch for

- Whether Safari's content-script world can adopt constructed stylesheets.
  The overlay falls back to a `<style>` element if not, so a working panel
  does not by itself tell you which path ran. On a page with a strict
  `style-src` policy, an unstyled panel means the fallback was used and
  blocked.
- Whether Safari keeps the background service worker alive reliably. If the
  toolbar button stops responding after the page has been idle, note it.
