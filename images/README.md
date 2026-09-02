Put puzzle source images in this folder.

The menu first tries to load every supported image exposed by the `images/`
directory listing. If your server does not expose directory listings, use either
fallback:

- Add entries to `PUZZLES` in `game-config.js`.
- Create `images/manifest.json`, for example:

```json
[
  { "title": "Bee", "image": "Bee.jpg", "thumb": "thumbs/Bee.webp" },
  { "title": "Bike", "image": "Bike.jpg", "thumb": "thumbs/Bike.webp" }
]
```

Supported browser image formats include `.jpg`, `.jpeg`, `.png`, `.webp`, and `.gif`.

Gallery cards should use compressed thumbnails in `images/thumbs/`. Full-size
`image` files are loaded only after the player selects a puzzle.
