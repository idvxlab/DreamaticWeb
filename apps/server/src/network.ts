import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import ipaddr from "ipaddr.js";
export function publicAddress(address: string) {
  try {
    let a = ipaddr.parse(address);
    if (a.kind() === "ipv6" && (a as ipaddr.IPv6).isIPv4MappedAddress())
      a = (a as ipaddr.IPv6).toIPv4Address();
    return a.range() === "unicast";
  } catch {
    return false;
  }
}
// Pin the validated DNS answer on the socket to prevent DNS rebinding.
export async function fetchPublic(
  raw: string,
  redirects = 0,
): Promise<{ body: Buffer; type: string; url: string }> {
  const u = new URL(raw);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !["", "80", "443"].includes(u.port)
  )
    throw new Error("仅支持公开的 HTTP/HTTPS 网站");
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("不允许抓取本机、内网或保留地址");
  const a = addresses[0];
  return new Promise((resolve, reject) => {
    const req = (u.protocol === "https:" ? https : http).get(
      u,
      {
        headers: {
          "User-Agent": "DreamaticWeb/0.1 (+document research)",
          Accept: "text/html,text/plain,application/json",
        },
        lookup: ((_h: unknown, options: { all?: boolean }, cb: Function) =>
          options.all ? cb(null, [a]) : cb(null, a.address, a.family)) as never,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 4) return reject(new Error("重定向次数过多"));
          return fetchPublic(
            new URL(res.headers.location, u).href,
            redirects + 1,
          ).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("网站返回 HTTP " + res.statusCode));
        }
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (b: Buffer) => {
          size += b.length;
          if (size > 8 * 1024 * 1024) {
            res.destroy(new Error("网站内容超过 8 MB"));
            return;
          }
          parts.push(b);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            body: Buffer.concat(parts),
            type: String(res.headers["content-type"] || ""),
            url: u.href,
          }),
        );
      },
    );
    req.setTimeout(20000, () => req.destroy(new Error("网站抓取超时")));
    req.on("error", reject);
  });
}
