/**
 * The Web Analytics token from the public settings, and nothing else from
 * them. The app reads the settings through its schema, but that brings the
 * whole validation library along, about 25 KB, to a page that needs one
 * string out of them.
 */
export async function loadAnalyticsToken(
  fetchSettings: () => Promise<Response> = () => fetch("/api/config")
): Promise<{ webAnalyticsToken?: string }> {
  const response = await fetchSettings()
  if (!response.ok) throw new Error(`The settings answered ${response.status}`)
  const { webAnalyticsToken } = (await response.json()) as { webAnalyticsToken?: unknown }
  return typeof webAnalyticsToken === "string" && webAnalyticsToken ? { webAnalyticsToken } : {}
}
