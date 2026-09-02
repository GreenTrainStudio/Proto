window.GAME_CONFIG = {
  SLICE_CONFIG: {
    rows: 9,
    cols: 3,
  },

  GAMEPLAY_CONFIG: {
    revealAllAtStart: true,
    snap: 18,
  },

  REVEAL_CONFIG: {
    mainPiecesCount: 1,
    extraPiecesCount: 1,
    onlyNearMergedArea: true,
  },

  ANIMATION_CONFIG: {
    enabled: true,
    moveDurationMs: 300,
  },

  // Fallback entries. The gallery uses compressed thumbs; full images load
  // only after the player selects a puzzle.
  PUZZLES: [
    { title: "Bee", image: "images/Bee.jpg", thumb: "images/thumbs/Bee.webp" },
    { title: "Jelly", image: "images/Jelly.jpg", thumb: "images/thumbs/Jelly.webp" },
    { title: "Car", image: "images/Car.jpg", thumb: "images/thumbs/Car.webp" },
    { title: "Country house", image: "images/House.jpg", thumb: "images/thumbs/House.webp" },
    { title: "Fruits", image: "images/Fruits.jpg", thumb: "images/thumbs/Fruits.webp" },
    { title: "Bike", image: "images/Bike.jpg", thumb: "images/thumbs/Bike.webp" },
    { title: "Cat", image: "images/Cat.jpg", thumb: "images/thumbs/Cat.webp" }
  ],
};
