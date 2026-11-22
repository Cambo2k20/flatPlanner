---
name: listing-to-flat
description: Turn a property listing link (Rightmove, ESPC, S1homes, ASPC, or Zoopla screenshots) into a Flat Planner flat. Reads the listing, traces its floorplan using the listed room sizes, and replies with a link that adds the flat to the app in one tap. Use when the user sends a listing URL or floorplan and asks to add or plan that flat.
---

# Listing to flat

The user sends a listing link; you reply with a link that adds the whole flat to their
app (https://cambo2k20.github.io/flatPlanner/): details, photos, rooms, doors, windows,
fittings, and the floorplan's position so the picture lands under the rooms.

Work in the scratchpad. Never commit a listing, spec or flat file: they show which
homes the user is looking at. Fetch only the listing the user sent: no crawling.

## 1. Read the listing

The flatPlanner cloud environment allows these hosts: www.rightmove.co.uk,
media.rightmove.co.uk, www.zoopla.co.uk, lid.zoocdn.com, espc.com, www.espc.com,
www.s1homes.com, www.aspc.co.uk, cdn.aspc.co.uk, cambo2k20.github.io. Use curl from Bash.

- **Rightmove** has everything:
  `curl -s -A "Mozilla/5.0" "https://www.rightmove.co.uk/properties/<id>" -o page.html`
  then `node scripts/rightmove-listing.mjs page.html > listing.json` (address, price,
  rooms with sizes, floorplan URL, photos, description).
- **ESPC, S1homes**: read the HTML (curl, or the web-fetch agent) for the same fields.
- **ASPC**: property details load through JavaScript from ASPC's own data service,
  which this environment must not call. Use what the page HTML has (photos) and ask the
  user for a screenshot of the floorplan and the room sizes.
- **Zoopla** answers 403 to automated requests. Don't try to get round it: ask the user
  for screenshots of the floorplan and the room sizes.

Download the floorplan image (`curl -s "<floorplan url>" -o plan.jpg`) and look at it.

## 2. Measure the floorplan

All in the image's own pixels. `python3 scripts/floorplan-walls.py plan.jpg --rows … --cols …`
prints the dark wall runs along rows and columns; gaps are doors and windows.
`--fill x,y` gives a coloured room's box. Read each room's inside edges (the first light
pixel inside each wall), door and window spans, and fittings drawn on the plan.

Scale: for each listed room, divide its drawn length and width (px) by the listed
metres, pairing the longer with the longer. Use the median px/m; listings and drawings
often differ by 5-10%. If the listing gives no sizes, scale from a standard item (a bath
is about 1.70 m, internal doorways about 0.8-0.9 m) and say so.

## 3. Write the flat

A small .mjs that prints the flat as JSON, like the example below. Origin: the inside
top-left corner of one room (`X0, Y0` px); `S` px per metre.

- **Rooms** are inside measurements: `{ id, name, type, x, z, w, d, notch? }`, types
  living, kitchen, dining, bedroom, bathroom, hall, study, storage, other. An L-shaped
  room gets one corner `notch: { corner: 'nw'|'ne'|'se'|'sw', w, d }`.
  Keep the drawing's wall gap between rooms: the gap becomes the wall. Shapes the model
  can't take (a hall with two cut corners, a bay): split into rectangles that touch with
  no gap (no wall appears between them), or join two rooms with an `opening`.
- **Doors, windows, openings** sit on one wall of a room: `{ id, room, edge, kind, pos,
  width, sill?, top?, swing?, hinge?, style? }`. Edges count clockwise from the top
  wall; a plain rectangle has 0 top (runs left→right), 1 right (top→bottom), 2 bottom
  (right→left), 3 left (bottom→top); `pos` is from the start of that run. Doors swing
  `in` (into `room`) or `out`; `hinge` is `start` or `end` of the run.
- **Fittings**: `{ id, shape, name, room, x, z, rot, w, d, h, elev?, opts?, fullHeight? }`
  with shapes kitchenUnits (opts sink/hob 0-1 along the run, as seen from the front),
  wallUnits, fridge, toilet, vanity, bath, shower, radiator, builtInWardrobe, boxing.
  rot 0 backs onto the top wall, 90 the right, 180 the bottom, 270 the left.
  Fittings the listing describes but the plan doesn't draw: place them sensibly and
  tell the user they're guesses.
- **Listing**: `name, address, url, rent` (price) with `rentPeriod: 'sale' | 'month' |
  'week'`, `status: 'interested'`, `notes` (listed sizes and what was guessed),
  `photos` (https URLs), `floorplanUrl`.
- **Underlay**, so the floorplan picture lands in place when added:
  `{ show: true, x: (imgW/2 - X0)/S, z: (imgH/2 - Y0)/S, width: imgW/S, aspect: imgH/imgW, rot: 0, opacity: 0.55 }`.

```js
const S = 125, X0 = 88, Y0 = 33, m = (v) => Math.round(v * 1000) / 1000;
const X = (p) => m((p - X0) / S), Z = (p) => m((p - Y0) / S), L = (p) => m(p / S);
const room = (id, name, type, x0, y0, x1, y1, notch) => ({ id, name, type, x: X(x0), z: Z(y0), w: L(x1 - x0), d: L(y1 - y0), ...(notch ? { notch } : {}) });
// rooms: [room('living', 'Living room', 'living', 340, 940, 884, 1564), …]
```

## 4. Check it and make the link

    node scripts/flat-link.mjs flat.json --out name.flat.json

It checks each door and window has a wall behind it, prints the rooms, and prints the
link. Fix every line starting with `!`. To look at it, run the dev server, make the link
with `--base http://localhost:5173/`, open it with Playwright, add the floorplan picture
on the Layout tab and screenshot the top view: walls and door swings should sit on the
drawing's.

## 5. Reply

- The link, as a markdown link named after the flat.
- A table: each room, listed size, traced size.
- What you guessed (fittings, sizes the listing didn't give).
- Send the floorplan picture as a file: Rightmove's image server doesn't let the app
  fetch it. Tell them: open the link, tap Add flat, then on the Layout tab "Add the
  floorplan picture" and choose it. It lands under the rooms.
