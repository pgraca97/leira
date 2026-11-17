import { userClient } from "./supabase"

/**
 * Asks the database, as the caller, to delete their account after the grace
 * period, and resolves to the moment it will be deleted. The function records
 * the request and ends every session of the caller; asking again keeps the
 * first date. Throws when the database cannot be asked or refuses, as it does
 * for a guest.
 */
export async function requestAccountDeletion(env: Env, accessToken: string): Promise<Date> {
  const client = userClient(env, accessToken)
  if (!client) throw new Error("Supabase is not configured")
  const { data, error } = await client.rpc("request_account_deletion")
  if (error) throw new Error(error.message)
  const deleteOn = typeof data === "string" ? new Date(data) : null
  if (!deleteOn || Number.isNaN(deleteOn.getTime())) {
    throw new Error("request_account_deletion did not answer with a date")
  }
  return deleteOn
}
