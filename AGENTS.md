# Notes for AI agents (Codex, Claude, others)

Flat Planner: plan flats you're interested in and furnish them in 3D from your own
catalogue. Static site (Vite + three.js), live at https://cambo2k20.github.io/flatPlanner/,
published from `main` by `.github/workflows/pages.yml`. Read `README.md` first: it has
the layout of the code and how a flat is described.

## Working on the code

- `npm ci`, then `npm run dev` (http://localhost:5173), `npm test`, `npm run build`.
- Run `npm test` after every change. Logic in `src/core/` has no 3D and is unit-tested.
- The owner uses an iPhone (Safari). Check every page at phone size (390 × 844). Safari
  sizes form fields by their natural width, so grid columns use `minmax(0, 1fr)`.
- Data lives only in the owner's browser (IndexedDB). You can't see their flats: ask for
  a flat file ("Save this flat as a file" on the Details tab) or screenshots.
- Never commit listings, traced flats or flat files: they show which homes the owner is
  looking at. Work on them outside the repository.
- Text in the app is plain British English: short sentences, no jargon.

## Turning a listing into a flat (the main task)

The owner only uses **ASPC** (aspc.co.uk). They send a listing link; you reply with a
link that adds the flat to their app. Full steps: `.claude/skills/listing-to-flat/SKILL.md`.
ASPC specifics (these override that file):

1. **Read the listing in a browser.** ASPC fills in details with JavaScript, so a
   plain download has none. Run `node scripts/aspc-listing.cjs <listing url> > listing.json`
   (Playwright with Chromium). Needs network access to www.aspc.co.uk, api.aspc.co.uk and
   cdn.aspc.co.uk.
2. **Room sizes come from the description text** below the photos (lines like
   `Lounge: 4.74m x 2.97m`). The owner wants these sizes, not the ones printed on the
   drawing; where they disagree, say so.
3. **Floorplan:** it loads when the page's "Floor plans" tab is clicked. Its address
   looks like `https://cdn.aspc.co.uk/resources/office/Property/<n>/Floorplan/<m>.jpg`.
   Download it and measure it: `python3 scripts/floorplan-walls.py plan.jpg --rows … --cols …`
   prints wall positions in pixels. Fit the scale (px per metre) to the text's sizes.
   **Photos:** `cdn.aspc.co.uk/resources/office/Property/<n>/Image/<m>.jpg`, in the page.
4. **Write the flat** as JSON (rooms, doors, windows, fittings, `photos`,
   `floorplanUrl`, and `underlay` so the floorplan lines up; see SKILL.md). ASPC's image
   server allows cross-site loading, so with `floorplanUrl` set the app fetches the
   floorplan itself.
5. **Check and make the link:** `node scripts/flat-link.mjs flat.json`. Fix every line
   starting with `!` (a door or window with no wall behind it). Optionally open the link
   locally with `--base http://localhost:5173/` and screenshot the top view.
6. **Reply** with the link, a table of rooms (text size vs traced), and anything guessed,
   such as fittings the plan doesn't show.

## Work in progress

115 Stoneywood Road, Aberdeen:
https://www.aspc.co.uk/search/property/445251/115-Stoneywood-Road/Aberdeen/
Over £90,000, 57 m², two bedrooms. Text sizes: lounge 4.74 × 2.97 m, kitchen
2.74 × 2.64 m, bedroom 1 3.37 × 2.94 m, bedroom 2 2.79 × 2.66 m; also vestibule
(entrance hall), hall, box room, bathroom (WC, basin, bath with shower). The drawing
prints different sizes (lounge 3.31 × 4.80 m). Floorplan:
https://cdn.aspc.co.uk/resources/office/Property/392901/Floorplan/377683.jpg (1179 × 1416 px).
Not traced yet.
