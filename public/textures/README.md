# Local game artwork

## Terrain atlas

Original image generated for this Crossroads project using the built-in ImageGen tool on 2026-09-09. 1536×1024, 3×2 cells. Bundled locally; the game makes no requests to an image service.

Order: forest, wheat, rock / pasture, clay, desert. Both SVG 2D and Three.js 3D sample these same image cells.

Prompt: Generate one precise 3-column by 2-row texture atlas with six equal full-bleed cells, no gaps, borders, text, numbers, icons or hex boundaries. Orthographic overhead dense green pine forest canopy; golden wheat fields; slate gray rocky mountain/quarry; lush pasture grass; rust-red clay hills; golden sand dunes. Premium painterly tabletop realism, tactile material detail, consistent soft daylight from upper left, neutral exposure, seamless texture within each cell, no game pieces or interface.

## Card and piece sprite atlas

Final asset: `public/textures/game-sprites.png` (1254×1254 RGBA). Generated once with the built-in ImageGen tool on 2026-09-09, not the CLI. Genuine transparency: 63.34% fully transparent pixels. The tool returned a larger square than the requested 1024px; both the CSS and SVG consumers sample normalized 4×4 cells, so they do not depend on 256px cell dimensions. Visually inspected all cells and checked the integrated desktop/mobile result. Original terrain atlas is unchanged. All artwork is bundled locally, with no runtime generation or external image requests.

Exact generation prompt:

> Use case: stylized-concept
> Asset type: one production sprite atlas for a Crossroads board-game UI.
> Primary request: Generate exactly ONE square 1024x1024 PNG with a genuine transparent alpha background, containing exactly 16 isolated icons in a precise 4x4 grid of equal 256x256 pixel cells.
> Style reference: Crisp outlined flat cartoon board-game icons with charcoal outlines, clean silhouettes, flat color fills, restrained bevel highlights and strong legibility at 40px. Use evergreen green, peach bricks, white sheep, golden wheat, pale turquoise ore, cyan, beige, white avatars and gray game pieces.
> Exact geometry: Canvas origin is top left. Columns span x=0–255, 256–511, 512–767, 768–1023. Rows span y=0–255, 256–511, 512–767, 768–1023. Cell centers are x=128,384,640,896 and y=128,384,640,896. Center each icon on its assigned cell center. Every part of every icon, including its charcoal outline, must fit entirely within the central 190x190 pixel safe box of its cell, leaving at least 33 transparent pixels on every cell edge. Precisely respect this grid and padding. Keep all padding and gutters fully transparent. Do not draw the grid or safe boxes.
> Row-major contents, one icon per cell, with no rearrangement:
> Row 1: (1) green evergreen tree; (2) stack of peach bricks; (3) white sheep facing right; (4) golden wheat stalks.
> Row 2: (5) pile of pale turquoise ore stones; (6) cyan question mark; (7) hammer over a green round disc, the development icon; (8) beige classical bank.
> Row 3: (9) white retro computer robot avatar; (10) white person wearing a dark explorer hat avatar; (11) white group of three people; (12) dark gray vertical beveled road piece.
> Row 4: (13) gray toy settlement with a pointed roof; (14) gray toy city made of double houses; (15) gray knight helmet; (16) curved gray stone road/bridge.
> Constraints: Isolated sprites only, consistent visual weight and scale, crisp smooth edges. The green disc belongs only to icon 7. Avatars have no enclosing medallions. No labels, letters, numbers, counts, grid lines, card borders, card backgrounds, avatar frames, watermarks, scene background, or extra objects. The question mark in cell 6 is the only textual symbol. No shadows outside the icon silhouettes. Background must be genuinely transparent, not white and not a painted checkerboard. Preserve actual PNG alpha. Produce only this one atlas; no variants.
