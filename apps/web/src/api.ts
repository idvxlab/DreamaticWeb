export const token = () => sessionStorage.getItem("dreamatic-token") || "";
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token() ? { Authorization: "Bearer " + token() } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || "请求失败");
  }
  return res.json();
}
export async function download(url: string) {
  const res = await fetch("/api" + url, {
    headers: token() ? { Authorization: "Bearer " + token() } : undefined,
  });
  if (!res.ok) throw new Error("导出失败");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = "dreamatic-page.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
