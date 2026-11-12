import test from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import {
  SkillLibrary,
  selectSkills,
  SKILLS_ROOT,
  SKILL_BODY_CHARACTER_LIMIT,
} from "../apps/server/src/generation/skills.js";

const lib = new SkillLibrary();
test.after(() => lib.close());

test("required references are scoped, budgeted, cached and invalidate the selected Skill", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dreamatic-core-refs-"));
  const dir = path.join(root, "designer-example");
  const library = new SkillLibrary(root);
  try {
    await mkdir(path.join(dir, "references"), { recursive: true });
    await writeFile(
      path.join(dir, "SKILL.md"),
      "---\nname: designer-example\ndescription: Example scene\n---\n# Scene\n[Optional](references/optional.md)\n\n## Required references\nApply [core](references/core.md).\n\n## Other work\nLeave the optional file deferred.\n",
    );
    await writeFile(
      path.join(dir, "references/core.md"),
      "# Essential scene\nA visible staged transformation.",
    );
    await writeFile(
      path.join(dir, "references/optional.md"),
      "OPTIONAL-NOT-NEEDED",
    );
    const names = ["designer-example"];
    const first = await library.signature("designer", names);
    const reads = library.io.reads;
    const prepared = await library.prepare("designer", names, {
      selectedOnly: true,
    });
    assert.match(prepared.prompt, /A visible staged transformation/);
    assert.doesNotMatch(prepared.prompt, /OPTIONAL-NOT-NEEDED/);
    assert.deepEqual(prepared.references, [
      "designer-example/references/core.md",
    ]);
    assert.equal(library.io.reads, reads);
    await library.prepare("designer", names);
    assert.equal(library.io.reads, reads);
    await writeFile(
      path.join(dir, "references/core.md"),
      "# Essential scene\nUpdated core mechanics.",
    );
    assert.notEqual(await library.signature("designer", names), first);
    assert.match(
      (await library.prepare("designer", names)).prompt,
      /Updated core mechanics/,
    );
    await writeFile(path.join(dir, "references/core.md"), "x".repeat(24000));
    await assert.rejects(
      () => library.prepare("designer", names),
      /24000.*预算/,
    );
    const outside = path.join(root, "outside.md");
    await writeFile(outside, "DO-NOT-LOAD");
    await rm(path.join(dir, "references/core.md"));
    await symlink(outside, path.join(dir, "references/core.md"));
    await assert.rejects(() => library.prepare("designer", names), /只能读取/);
  } finally {
    library.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("published Pi loader discovers portable Skills; Codex and Claude paths resolve the same resources", async () => {
  const pi = loadSkillsFromDir({ dir: SKILLS_ROOT, source: "test" });
  assert.equal(pi.diagnostics.length, 0);
  assert.equal(pi.skills.length, 24);
  const alias = path.resolve(".claude/skills");
  assert.equal(await realpath(alias), await realpath(SKILLS_ROOT));
  const claudeLayout = loadSkillsFromDir({
    dir: alias,
    source: "portable-path-check",
  });
  assert.deepEqual(
    claudeLayout.skills.map((s) => s.name).sort(),
    pi.skills.map((s) => s.name).sort(),
  );
  for (const s of pi.skills) {
    assert.equal(s.name, path.basename(s.baseDir));
    const raw = await readFile(s.filePath, "utf8");
    assert.match(raw, /^---\nname: [a-z0-9-]+\ndescription: [^\n]+\n---/);
    assert.ok(raw.length < 5000, "entrypoint is bounded: " + s.name);
    assert.doesNotMatch(
      raw,
      /submit_facts|submit_page|page_patch|DREAMATIC_|\$\{CLAUDE|<available_skills>/,
      "core instructions are harness-independent",
    );
    for (const ref of raw.matchAll(/\]\((references\/[^)]+)\)/g)) {
      assert.equal(
        await readFile(path.join(alias, s.name, ref[1]), "utf8"),
        await readFile(path.join(s.baseDir, ref[1]), "utf8"),
      );
    }
  }
});

test("explicit Designer selections stay exact and scoped while references remain on demand", async () => {
  const library = new SkillLibrary();
  try {
    const { skills } = await library.catalog();
    const names = ["designer-impeccable", "designer-3d-transforms"];
    const text =
      names.map((name) => `/skill:${name}`).join(" ") +
      " 生成多页公司官网，带交互";
    for (const editing of [false, true])
      assert.deepEqual(
        selectSkills("designer", { text, editing }, skills),
        names,
      );
    assert.deepEqual(
      selectSkills("analyst", { text, editing: false }, skills),
      ["analyst-information-extraction"],
    );
    assert.deepEqual(
      selectSkills(
        "designer",
        { text: text + " /skill:designer-impeccable", editing: false },
        skills,
      ),
      names,
    );
    assert.throws(
      () =>
        selectSkills(
          "designer",
          {
            text: [
              "designer-awwwards",
              "designer-impeccable",
              "designer-frontend-design",
              "designer-3d-transforms",
              "designer-motion-design",
            ]
              .map((n) => `/skill:${n}`)
              .join(" "),
            editing: false,
          },
          skills,
        ),
      /最多/,
    );
    await library.signature("designer", names);
    const before = library.io.reads;
    const prepared = await library.prepare("designer", names, {
      selectedOnly: true,
    });
    assert.equal(
      library.io.reads,
      before,
      "signature/preload reuse the same body bytes",
    );
    assert.deepEqual(prepared.names, names);
    assert.ok(prepared.characters < SKILL_BODY_CHARACTER_LIMIT);
    assert.ok(!prepared.prompt.includes('name="designer-visual-design"'));
    assert.ok(
      !prepared.prompt.includes("# Upstream depth tokens in readable form"),
      "optional depth reference is not preloaded",
    );
    const reader = library.reader("designer", undefined, names);
    await assert.rejects(
      () =>
        reader.execute("unselected", {
          path: path.join(SKILLS_ROOT, "designer-awwwards/SKILL.md"),
        }),
      /只能读取/,
    );
    const result = await reader.execute("selected", {
      path: path.join(
        SKILLS_ROOT,
        "designer-3d-transforms/references/depth-tokens.md",
      ),
    });
    assert.match(JSON.stringify(result.content), /1200px/);
    assert.equal(library.io.reads, before + 1);
  } finally {
    library.close();
  }
});

test("24k body ceiling permits larger inputs, rejects excess and keeps the 48k file boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dreamatic-budget-"));
  const library = new SkillLibrary(root);
  try {
    for (const [name, chars] of [
      ["designer-large", 20000],
      ["designer-extra", 5000],
    ] as const) {
      await mkdir(path.join(root, name));
      await writeFile(
        path.join(root, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Budget test fixture\n---\n` +
          "x".repeat(chars) +
          "\nEND-OF-BODY\n",
      );
    }
    const large = await library.prepare("designer", ["designer-large"]);
    assert.ok(
      large.characters > 18000 && large.characters < SKILL_BODY_CHARACTER_LIMIT,
    );
    assert.match(large.prompt, /END-OF-BODY/);
    // Automatic routing keeps the higher-priority entry; an explicit set is never reduced.
    const fitted = await library.prepare("designer", [
      "designer-large",
      "designer-extra",
    ]);
    assert.deepEqual(fitted.names, ["designer-large"]);
    await assert.rejects(
      () =>
        library.prepare("designer", ["designer-large", "designer-extra"], {
          selectedOnly: true,
        }),
      /24000.*预算/,
    );
    await mkdir(path.join(root, "designer-large/references"));
    await writeFile(
      path.join(root, "designer-large/references/too-big.md"),
      "x".repeat(48001),
    );
    await assert.rejects(
      () =>
        library.reader("designer").execute("oversize", {
          path: path.join(root, "designer-large/references/too-big.md"),
        }),
      /48 KB/,
    );
  } finally {
    library.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("adapted Skills carry intact licenses/provenance and every linked reference is natively readable", async () => {
  const library = new SkillLibrary();
  try {
    const { skills } = await library.catalog();
    let adapted = 0;
    for (const skill of skills) {
      let manifest;
      try {
        manifest = JSON.parse(
          await readFile(path.join(skill.baseDir, "upstream.json"), "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      adapted++;
      // Archived ports pin an archive hash; ports from a public repository pin its commit.
      assert.ok(
        /^[a-f0-9]{64}$/.test(manifest.archiveSha256 || "") ||
          /^[a-f0-9]{40}$/.test(manifest.commit || ""),
        skill.name + " pins its upstream",
      );
      for (const file of manifest.files) {
        const bytes = await readFile(path.join(skill.baseDir, file.path));
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          file.sha256,
          skill.name + "/" + file.path,
        );
      }
      const prepared = await library.prepare("designer", [skill.name], {
        selectedOnly: true,
      });
      assert.ok(prepared.characters < SKILL_BODY_CHARACTER_LIMIT);
      assert.ok(
        prepared.references.length > 0,
        "core methods are supplied without a model read turn",
      );
      const body = await readFile(skill.filePath, "utf8");
      for (const ref of body.matchAll(/\]\((references\/[^)]+\.md)\)/g)) {
        const result = await library
          .reader("designer", undefined, [skill.name])
          .execute("reference", { path: path.join(skill.baseDir, ref[1]) });
        assert.ok(!result.isError, skill.name + "/" + ref[1]);
      }
    }
    assert.equal(adapted, 13);
  } finally {
    library.close();
  }
});

test("deterministic routing composes complementary skills and keeps edits narrowly scoped", async () => {
  const { skills } = await lib.catalog();
  const route = (text: string, editing = false, brief?: unknown) =>
    selectSkills("designer", { text, editing, brief }, skills);
  assert.deepEqual(
    selectSkills("analyst", { text: "PDF table", editing: false }, skills),
    ["analyst-information-extraction"],
  );
  assert.deepEqual(
    route("把标题改为 Hello", true, { goal: "SaaS 多页面导航网站" }),
    [],
  );
  assert.deepEqual(
    route("把按钮颜色调深", true, { goal: "SaaS 多页面导航网站" }),
    ["designer-visual-design"],
  );
  assert.deepEqual(route("修正折叠菜单", true), [
    "designer-interaction-design",
  ]);
  for (const [request, expected] of [
    ["产品营销首页", "designer-taste"],
    ["SaaS 多页面网站导航", "designer-taste"],
    ["KPI dashboard", "designer-dashboard"],
    ["商城商品详情", "designer-ecommerce"],
    ["作品集", "designer-portfolio"],
    ["长文出版网站", "designer-editorial"],
  ]) {
    const selected = route(request);
    assert.ok(selected.includes(expected));
    assert.ok(selected.length <= 4);
    assert.equal(new Set(selected).size, selected.length);
  }
  assert.deepEqual(
    route("KPI dashboard with helpful navigation and native disclosure"),
    ["designer-dashboard", "designer-visual-design"],
  );
  assert.deepEqual(route("为这篇论文做一个介绍页。"), [
    "designer-editorial",
    "designer-visual-design",
    "designer-web-architecture",
    "designer-interaction-design",
  ]);
  assert.deepEqual(route("根据研究报告制作介绍网页"), [
    "designer-editorial",
    "designer-visual-design",
    "designer-web-architecture",
    "designer-interaction-design",
  ]);
  assert.deepEqual(route("为公司产品制作宣传页"), ["designer-taste"]);
  // Company, product and campaign pages, and pages of unstated type, are built on the page kit.
  assert.deepEqual(route("创建网站"), ["designer-taste"]);
  assert.deepEqual(route("/skill:designer-editorial 修改章节", true), [
    "designer-editorial",
  ]);
  assert.deepEqual(
    selectSkills(
      "analyst",
      { text: "/skill:designer-editorial", editing: false },
      skills,
    ),
    ["analyst-information-extraction"],
  );
  assert.throws(() => route("/skill:designer-missing", true), /不可用于/);
  assert.ok(
    !route("生成公司官网，不做电商支付，不要多页").includes(
      "designer-ecommerce",
    ),
  );
  assert.ok(
    !route("生成公司官网，不做电商支付，不要多页").includes(
      "designer-web-architecture",
    ),
  );
  assert.ok(
    route("生成公司官网，需要电商支付，需要多页").includes(
      "designer-ecommerce",
    ),
  );
  assert.ok(
    route("生成公司官网，需要多页").includes("designer-web-architecture"),
  );
});

test("native reader preloads only selected bodies, reuses bytes, denies originals/cross-role/scripts and reads references on demand", async () => {
  const start = lib.io.reads;
  const names = ["analyst-information-extraction"];
  const signature = await lib.signature("analyst", names);
  assert.ok(signature);
  const prepared = await lib.prepare("analyst", names);
  assert.ok(prepared.prompt.includes("# Extract useful facts in one pass"));
  assert.ok(
    !prepared.prompt.includes("Example source:"),
    "reference body is not preloaded",
  );
  assert.ok(
    !prepared.prompt.includes("# Choose a visual direction"),
    "Designer body not loaded",
  );
  const after = lib.io.reads;
  assert.equal(after - start, 1);
  await lib.signature("analyst", names);
  await lib.prepare("analyst", names);
  assert.equal(lib.io.reads, after, "warm prep does not reread files");
  const reader = lib.reader("analyst");
  const ref = await reader.execute("reference", {
    path: path.join(
      SKILLS_ROOT,
      "analyst-information-extraction/references/tables-and-coverage.md",
    ),
  });
  assert.match(JSON.stringify(ref.content), /non-randomized/);
  await assert.rejects(() =>
    reader.execute("denied", {
      path: path.join(SKILLS_ROOT, "designer-dashboard/SKILL.md"),
    }),
  );
  await assert.rejects(() =>
    reader.execute("denied", {
      path: path.resolve("config/agents/analyst.md"),
    }),
  );
  await assert.rejects(() =>
    lib.reader("orchestrator").execute("denied", {
      path: path.join(SKILLS_ROOT, names[0], "SKILL.md"),
    }),
  );
});

test("native discovery reloads additions/invalid frontmatter, selected reference edits invalidate signatures, symlink escapes are rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dreamatic-skills-"));
  const copy = path.join(root, "skills");
  await cp(SKILLS_ROOT, copy, { recursive: true });
  const library = new SkillLibrary(copy);
  try {
    const names = ["analyst-information-extraction"];
    const first = await library.signature("analyst", names);
    const reference = path.join(
      copy,
      names[0],
      "references/tables-and-coverage.md",
    );
    await writeFile(
      reference,
      (await readFile(reference, "utf8")) + "\nA new condition.\n",
    );
    library.invalidate();
    assert.notEqual(await library.signature("analyst", names), first);
    const stable = await library.signature("analyst", names);
    const designer = path.join(copy, "designer-editorial/SKILL.md");
    await writeFile(
      designer,
      (await readFile(designer, "utf8")) + "\nNew editorial example.\n",
    );
    library.invalidate();
    assert.equal(
      await library.signature("analyst", names),
      stable,
      "unrelated Skill edits do not invalidate facts",
    );
    await mkdir(path.join(copy, "designer-custom"));
    await writeFile(
      path.join(copy, "designer-custom/SKILL.md"),
      "---\nname: designer-custom\ndescription: Custom directory map layout\n---\n# Layout\nPreserve hierarchy.\n",
    );
    await mkdir(path.join(copy, "designer-broken"));
    await writeFile(
      path.join(copy, "designer-broken/SKILL.md"),
      "---\nname: [broken\n---\nInvalid",
    );
    library.invalidate();
    const catalog = await library.catalog();
    assert.ok(catalog.skills.some((s) => s.name === "designer-custom"));
    assert.ok(catalog.diagnostics.length > 0);
    assert.ok(
      selectSkills(
        "designer",
        { text: "/skill:designer-custom", editing: true },
        catalog.skills,
      ).includes("designer-custom"),
    );
    const outside = path.join(root, "secret.md");
    await writeFile(outside, "must not read");
    const escape = path.join(copy, names[0], "references/escape.md");
    await symlink(outside, escape);
    library.invalidate();
    await assert.rejects(
      () => library.reader("analyst").execute("escape", { path: escape }),
      /只能读取/,
    );
  } finally {
    library.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("showcase routing follows user wording, not Orchestrator defaults, and stays within the body budget", async () => {
  const library = new SkillLibrary();
  try {
    const { skills } = await library.catalog();
    const route = (text: string, brief?: unknown) =>
      selectSkills("designer", { text, editing: false, brief }, skills);
    const showcase = route(
      "用上传资料生成公司的产品宣传页，视觉成熟、酷炫、惊艳，整页有编排的主题动效",
    );
    // Showcase pages are built on the page kit, whose moments carry the motion.
    assert.deepEqual(showcase, ["designer-taste"]);
    assert.deepEqual(route("生成产品宣传页，不要动画，简洁即可"), ["designer-taste"]);
    assert.deepEqual(
      route("根据资料做公司介绍网站", {
        goal: "公司介绍",
        design: [],
        designDefaults: ["科技感、炫酷动效"],
      }),
      ["designer-taste"],
    );
    // Subject Skills still follow the user's wording, and ambition rises only from it.
    assert.deepEqual(route("作品集展示", { designDefaults: ["炫酷动效"] }), [
      "designer-portfolio",
      "designer-visual-design",
    ]);
    assert.ok(route("作品集展示，炫酷动效").includes("designer-motion-design"));
    const worst = route("产品宣传页，炫酷动效，带菜单交互和筛选");
    assert.deepEqual(worst, ["designer-taste", "designer-interaction-design"]);
    const prepared = await library.prepare("designer", worst);
    assert.ok(prepared.characters < SKILL_BODY_CHARACTER_LIMIT);
    assert.ok(
      prepared.references.some((r) => r.endsWith("kit.md")),
      "the kit markup is preloaded",
    );
  } finally {
    library.close();
  }
});

test("site type follows the user's words, and automatic routing drops low-priority entries instead of exceeding the budget", async () => {
  const library = new SkillLibrary();
  try {
    const { skills } = await library.catalog();
    const brief = {
      goal: "展示公司",
      content: ["case studies of customized propellers"],
    };
    assert.equal(
      selectSkills(
        "designer",
        { text: "用资料生成产品宣传页，酷炫动效", editing: false, brief },
        skills,
      )[0],
      "designer-taste",
      "a brief mention of case studies does not turn a promotional page into a portfolio",
    );
    const names = [
      "designer-portfolio",
      "designer-impeccable",
      "designer-motion-design",
      "designer-impeccable-overdrive",
      "designer-interaction-design",
    ];
    const fitted = await library.prepare("designer", names);
    assert.ok(fitted.characters <= SKILL_BODY_CHARACTER_LIMIT);
    assert.deepEqual(
      fitted.names.slice(0, 3),
      names.slice(0, 3),
      "higher priority entries are kept",
    );
    assert.ok(fitted.names.length < names.length);
    assert.ok(
      fitted.references.every((r) => fitted.names.includes(r.split("/")[0])),
    );
    await assert.rejects(
      library.prepare("designer", names, { selectedOnly: true }),
      /字符预算/,
      "an explicit selection is never silently reduced",
    );
  } finally {
    library.close();
  }
});

test("skill:// assets inline only from loaded Skills' assets folders, once, without breaking the script", async () => {
  const { inlineSkillAssets } =
    await import("../apps/server/src/generation/skill-assets.js");
  const library = new SkillLibrary();
  try {
    const load = (names: string[]) => (ref: string) =>
      library.assetText("designer", names, ref);
    const page =
      '<html><head><link rel="stylesheet" href="skill://designer-taste/assets/taste.css"><link rel="stylesheet" href="skill://designer-taste/assets/taste.css"></head><body><h1>x</h1><script src="skill://designer-taste/assets/taste.js"></script></body></html>';
    const { html, assets } = await inlineSkillAssets(
      page,
      load(["designer-taste"]),
    );
    assert.deepEqual(assets, [
      "designer-taste/assets/taste.css",
      "designer-taste/assets/taste.js",
    ]);
    assert.equal(
      (html.match(/data-skill-asset="designer-taste:taste.css"/g) || []).length,
      1,
    );
    assert.doesNotMatch(html, /skill:\/\//);
    assert.equal(
      (html.match(/<\/script>/g) || []).length,
      1,
      "kit code cannot close its script early",
    );
    await assert.rejects(
      inlineSkillAssets(page, load(["designer-impeccable"])),
      /已加载/,
    );
    for (const bad of [
      "skill://designer-taste/SKILL.md",
      "skill://designer-taste/assets/../SKILL.md",
      "skill://designer-taste/references/kit.md",
    ])
      await assert.rejects(
        inlineSkillAssets(
          `<html><head><link rel="stylesheet" href="${bad}"></head></html>`,
          load(["designer-taste"]),
        ),
      );
    await assert.rejects(
      inlineSkillAssets(
        '<html><body><img src="skill://designer-taste/assets/taste.css"></body></html>',
        load(["designer-taste"]),
      ),
      /只能用于/,
    );
    assert.equal(
      (await inlineSkillAssets("<html><body>plain</body></html>", load([])))
        .assets.length,
      0,
    );
  } finally {
    library.close();
  }
});
