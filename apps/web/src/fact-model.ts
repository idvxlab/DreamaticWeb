import type {
  Asset,
  ProjectResponse,
} from "../../../packages/shared/project";

export type Fact = {
  text: string;
  sourceId: string;
  locationVerified?: boolean;
  assetIds?: string[];
  evidence?:
    | { kind: "text"; start: number; end: number; quote: string }
    | {
        kind: "cell";
        tableIndex: number;
        row: number;
        column: number;
        value: unknown;
      };
};
export function factsFor(project: ProjectResponse | null) {
  const analysis = project?.analysis as { facts?: Fact[] } | undefined;
  return Array.isArray(analysis?.facts)
    ? analysis.facts.filter(
        (f) =>
          f && typeof f.text === "string" && typeof f.sourceId === "string",
      )
    : [];
}

export function factImages(project: ProjectResponse, fact: Fact) {
  const source = project.sources.find((s) => s.id === fact.sourceId);
  if (!source) return [];
  const recommendations =
    (
      project.analysis as
        | { assets?: { url: string; sourceId: string; purpose?: string }[] }
        | undefined
    )?.assets || [];
  const eligible = source.assets.filter(
    (a) =>
      a.type === "image" &&
      a.url.startsWith(`/assets/${project.id}/`) &&
      /^image\/(png|jpeg|webp|gif)$/.test(a.mime),
  );
  const purpose = (asset: Asset) =>
    recommendations.find((r) => r.sourceId === source.id && r.url === asset.url)
      ?.purpose || asset.name;
  // Source ownership alone is not a fact-image association. Never fill old cards
  // from document-level recommendations or infer a link from filename similarity.
  if (!Array.isArray(fact.assetIds)) return [];
  return [...new Set(fact.assetIds)]
    .flatMap((id) => {
      const asset = eligible.find((a) => a.id === id);
      return asset ? [{ asset, purpose: purpose(asset) }] : [];
    })
    .slice(0, 3);
}
