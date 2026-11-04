import {
  SkillLibrary,
  selectSkills,
  SKILL_BODY_CHARACTER_LIMIT,
  SKILL_REFERENCE_BYTE_LIMIT,
} from "../apps/server/src/generation/skills.js";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: node --import tsx scripts/check-skills.ts --request '<request including optional /skill:designer-...>'\nChecks discovery, selection and body budget only; no model call or generation record.",
  );
} else {
  const index = args.indexOf("--request");
  if (index < 0 || !args[index + 1])
    throw new Error("Provide --request <text>; use --help for usage");
  const text = args[index + 1];
  const library = new SkillLibrary();
  try {
    const { skills, diagnostics } = await library.catalog();
    const names = selectSkills("designer", { text, editing: false }, skills);
    const selectedOnly = /\/skill:designer-[a-z0-9-]+/.test(text);
    const start = performance.now();
    const cold = await library.prepare("designer", names, { selectedOnly });
    const coldMs = performance.now() - start;
    const reads = library.io.reads;
    const warmStart = performance.now();
    const warm = await library.prepare("designer", names, { selectedOnly });
    console.log(
      JSON.stringify(
        {
          generation: false,
          modelCalls: 0,
          discovered: skills.length,
          diagnostics: diagnostics.map((item) => item.message),
          selection: selectedOnly ? "exact" : "automatic",
          selected: names,
          bodyCharacters: cold.characters,
          bodyCharacterLimit: SKILL_BODY_CHARACTER_LIMIT,
          referenceByteLimit: SKILL_REFERENCE_BYTE_LIMIT,
          referencesPreloaded: false,
          coldPreparationMs: coldMs,
          warmPreparationMs: performance.now() - warmStart,
          warmAdditionalDiskReads: library.io.reads - reads,
          warmResultIdentical: warm.prompt === cold.prompt,
        },
        null,
        2,
      ),
    );
  } finally {
    library.close();
  }
}
