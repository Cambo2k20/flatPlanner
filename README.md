# Flat Planner

Plan the flats you're interested in and furnish them in 3D with your own furniture.

It grew out of the single-flat *Flat 3D Planner*: the same 3D view, top view and
eye-level walk-through, the same furniture models, overlap warnings, distances to the
walls, undo and `.glb` export. What's new is that the flat is no longer built in: you
add flats from their listings, and you furnish every one of them from one catalogue
of the things you own or want to buy.

## What you can do

- **Keep a list of flats** with their address, listing link, rent, status (interested,
  viewing booked, viewed, applied, not for me) and notes. Each card shows a picture of
  the flat, how much you've placed and what the things you'd still need would cost.
- **Add a flat from its listing.** Start from a blank plan (or a copy of a flat you've
  done). On the *Layout* tab, add a room for each one on the floorplan and type in the
  listing's sizes. Rooms can be L-shaped. Drag rooms into place: they snap to each
  other with a wall between. Add doors, windows and openings to any wall, and fixed
  fittings: kitchen units, fridge, toilet, basin, bath, shower, radiators, built-in
  wardrobes, boxing and ledges.
- **Trace over the listing's floorplan.** Add a screenshot of the floorplan, scale it
  until the rooms match their sizes, and draw the rooms on top of it.
- **Furnish it from your catalogue.** Tap an item to add it, then drag it into place,
  even into another room. Overlaps with furniture, fittings and door swings are
  flagged. The *Furnish* tab adds up what you'd have to buy and warns when you've
  placed more of something than you own.
- **Manage your catalogue** on its own page: name, 3D shape, real size, colour,
  whether you own it or want to buy it, how many you have, price, shop link, notes and
  a photo. Every item gets a 3D preview at its real size and colour. Change a size
  here and it changes in every flat. Import and export it as a spreadsheet (`.csv`).
- **Decorate**: wall colours per room or per wall, floors per room, ceiling and trim.
- **Look around**: 3D, top view (like an architect's plan, cut at 1.2 m) and eye level,
  where you can walk through the doorways.
- **Save files**: a flat (with its furniture and floorplan picture), the catalogue, or a
  backup of everything; a `.glb` 3D model with or without furniture; a picture of the
  view.
- **Bring your old layout over.** *Open a file* on the flats page reads a layout saved
  from the original Flat 3D Planner (*Save layout file*), and rebuilds that flat with
  your sizes, paint, floors and furniture.

The sample "Two-bedroom flat" is the flat from the original planner, rebuilt as data.

Everything is kept in the browser (IndexedDB); nothing is sent anywhere. Save a backup
file to move your flats to another device.

## Running it

You need [Node.js](https://nodejs.org) 20 or later.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the wall builder, placement and file import
npm run build    # a static site in dist/
```

`dist/` is plain static files, so it can be hosted anywhere. The included GitHub
Actions workflow (`.github/workflows/pages.yml`) tests and builds every push and
publishes `main` to GitHub Pages once Pages is switched on (Settings → Pages → Source:
GitHub Actions).

## How it's put together

```
src/
  main.js              start-up and the three screens (#/, #/catalogue, #/flat/<id>/<tab>)
  store.js             saving to IndexedDB (falls back to localStorage)
  core/                plain data and logic, no 3D – this is what the tests cover
    flat-model.js      rooms, doors and windows, fittings, decoration; validation
    walls.js           works out the walls from the rooms
    placement.js       keeping furniture in rooms, snapping, overlaps, where you can walk
    catalogue.js       your catalogue items, and the starter set
    shapes.js          every 3D shape the planner can draw, with typical sizes
    files.js           flat, catalogue and backup files; CSV; old-planner layouts
    sample-flat.js     the original two-bedroom flat, and the blank starting plan
    palette.js         paints, fabrics, floors, room types
  three/               drawing with three.js
    furniture.js       the furniture and fitting models
    flat-mesh.js       walls (in three heights for the cut-away views), floors,
                       ceilings, skirting, coving, doors, windows
    materials.js       materials and generated textures
    preview.js         3D previews of catalogue items
  ui/                  the screens
    home.js            your flats, adding a flat, opening files
    catalogue.js       the catalogue page and the item editor
    planner.js         the planner: views, dragging, the four tabs, the inspector
    widgets.js         dialogs, swatches, small form helpers
tests/                 vitest unit tests
```

### How a flat is described

All sizes are metres, seen from above with x to the right and z down the screen.

- A **room** is a rectangle of its *inside* measurements (what listings give), with an
  optional corner cut out to make an L: `{ id, name, type, x, z, w, d, notch }`.
- **Walls aren't stored.** Rooms sit with a gap between them and the gap *is* the wall:
  everything within `outerWall` of a room that isn't inside a room becomes wall, so the
  gap between two rooms is an inside wall and the band around the flat is the outside
  wall. `walls.js` cuts the plan into a grid along every room edge, classes each cell as
  room, wall or outside, and merges wall cells into boxes whose faces know which room's
  wall they belong to (for paint).
- A **door, window or opening** sits on one wall of a room: `{ room, edge, pos, width,
  kind, sill, top, hinge, swing, style }`. `edge` counts the room's walls clockwise from
  the top. The wall behind it, through to the next room or outside, gets the hole.
- **Fittings** belong to the flat (kitchen units, bathroom fittings…). Furniture can't
  go through them.
- The **design** holds paint, floors, trim and the placed **items**. Each item points at
  a catalogue entry (`cat`) and keeps a copy of its size and colour, so a flat still
  shows things you've since deleted from the catalogue.

## Ideas for next steps

- Sync between devices (for example with Supabase) instead of backup files.
- Several furniture layouts per flat, to compare side by side.
- Comparing flats: which of your things fit where, room sizes side by side.
- Angled walls, bay windows and stairs.
- Import product sizes straight from a shop link.
