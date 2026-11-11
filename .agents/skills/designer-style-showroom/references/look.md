# The look

1. **Pictures fill the tiles.** Products sit in square-cornered light grey tiles separated by white gutters (`.range` as the kit writes it); the tile's grey is the render's own backdrop. Section heads are centred above the tiles.
2. **One action colour.** The blue (`--p-action`) fills every primary pill and nothing else; the secondary action is a 1px ink outline pill. Over a photograph, a white ghost pill.
3. **Calm, tight type.** One grotesk family, tracked slightly tight; headings at 600, everything else at 400; hierarchy from size and from ink at stepped opacities (`--p-ink`, `--p-muted`, a lighter grey for captions). Product names are set large and light. Figures read as large, calm data at regular weight, not as shouting headlines.
4. **A rank label only.** The burnt orange (`--p-accent`) marks a product's rank or kind in a small eyebrow, `<p class="tier">旗舰</p>` above its name; it never fills a button or a block.
5. **No shadows, no rounded pictures.** Only pills are round. Close with the charcoal footer (`ground-inverse`); a pale grey band (`<section class="section band-soft">`) may carry a row of links or facts once.
