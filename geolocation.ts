import { env } from "./env";

export type ApproximateLocation = { country?: string; region?: string; city?: string; timezone?: string };

export async function lookupApproximateIpLocation(ip: string): Promise<ApproximateLocation> {
  if (env.geolocation.provider === "disabled" || !env.geolocation.apiUrl || !ip || ip === "::1" || ip === "127.0.0.1") return {};
  const url = env.geolocation.apiUrl.includes("{ip}")
    ? env.geolocation.apiUrl.replace("{ip}", encodeURIComponent(ip))
    : `${env.geolocation.apiUrl.replace(/\/$/, "")}/${encodeURIComponent(ip)}`;
  const response = await fetch(url, { headers: env.geolocation.apiKey ? { Authorization: `Bearer ${env.geolocation.apiKey}` } : {} });
  if (!response.ok) return {};
  const data = (await response.json()) as Record<string, unknown>;
  const text = (...keys: string[]) => {
    const value = keys.map(key => data[key]).find(value => typeof value === "string");
    return typeof value === "string" ? value.slice(0, 120) : undefined;
  };
  return { country: text("country", "country_name"), region: text("region", "region_name", "state"), city: text("city"), timezone: text("timezone", "time_zone") };
}
