export const token = () => sessionStorage.getItem("dreamatic-token") || "";
export class ApiConnectionError extends Error {}
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
  }).catch((error) => {
    if (error instanceof TypeError && !options.signal?.aborted)
      throw new ApiConnectionError("无法连接服务，请检查连接后重试。");
    throw error;
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (data.code === "DEV_BACKEND_UNAVAILABLE")
      throw new ApiConnectionError(data.error);
    throw new Error(data.error || "请求失败");
  }
  return res.json();
}
export async function download(url: string, filename = "dreamatic-page.html") {
  const res = await fetch("/api" + url, {
    headers: token() ? { Authorization: "Bearer " + token() } : undefined,
  });
  if (!res.ok) throw new Error("导出失败");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
