window.GAME_CONFIG = {
  SLICE_CONFIG: {
    rows: 4,
    cols: 4,
  },

  GAMEPLAY_CONFIG: {
    // "choice" fills the board in reading order and offers four cards below it.
    // Use "classic" to keep the original drag-and-reveal gameplay.
    mode: "choice",
    revealAllAtStart: true,
    lives: 3,
    snap: 18,
  },

  REVEAL_CONFIG: {
    mainPiecesCount: 1,
    extraPiecesCount: 1,
    onlyNearMergedArea: true,
  },

  ANIMATION_CONFIG: {
    enabled: true,
    // Card flight from the tray to the board.
    moveDurationMs: 460,
  },

  // Fallback entries. The gallery uses compressed thumbs; full images load
  // only after the player selects a puzzle.
  PUZZLES: [
    { title: "Corgi", image: "images/Corgi45.png", thumb: "images/thumbs/Corgi45.jpg" },
    { title: "Parrot", image: "images/Parrot45.png", thumb: "images/thumbs/Parrot45.jpg" },
    { title: "Toucan", image: "images/tuca45.png", thumb: "images/thumbs/tuca45.jpg" }
  ],
};
