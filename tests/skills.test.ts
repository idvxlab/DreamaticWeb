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
  assert.equal(pi.skills.length, 33);
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
              "designer-impeccable-overdrive",
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
    await assert.rejects(
      () => library.prepare("designer", ["designer-large", "designer-extra"]),
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
      assert.match(manifest.archiveSha256, /^[a-f0-9]{64}$/);
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
    assert.equal(adapted, 5);
  } finally {
    library.close();
  }
});

test("deterministic routing composes complementary skills and keeps edits narrowly scoped", async () => {
  const { skills } = await lib.catalog();
  const route = (text: string, editing = false, brief?: unknown) =>
    selectSkills("designer", { text, editing, brief }, skills);
  // A paper or research page reads as an article, even when its brief is about charts and data.
  const editorial = [
    "designer-editorial",
    "designer-visual-design",
    "designer-web-architecture",
    "designer-interaction-design",
    "designer-no-ai-design-slop",
  ];
  assert.deepEqual(route("为这篇论文做一个介绍页。", false, { content: ["图表与数据"] }), editorial);
  assert.deepEqual(route("根据研究报告制作介绍网页"), editorial);
  assert.ok(!route("KPI dashboard").includes("designer-editorial"));
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
    ["产品营销首页", "designer-landing-page"],
    ["SaaS 多页面网站导航", "designer-saas-website"],
    ["KPI dashboard", "designer-dashboard"],
    ["商城商品详情", "designer-ecommerce"],
    ["作品集", "designer-portfolio"],
    ["长文出版网站", "designer-editorial"],
  ]) {
    const selected = route(request);
    assert.ok(selected.includes(expected));
    assert.ok(selected.length <= 5);
    assert.equal(new Set(selected).size, selected.length);
  }
  assert.deepEqual(
    route("KPI dashboard with helpful navigation and native disclosure"),
    ["designer-dashboard", "designer-visual-design", "designer-no-ai-design-slop"],
  );
  assert.deepEqual(route("创建网站"), [
    "designer-web-architecture",
    "designer-visual-design",
    "designer-no-ai-design-slop",
  ]);
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
