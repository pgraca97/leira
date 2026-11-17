import { startAnalytics } from "../analytics"
import { loadAnalyticsToken } from "./analyticsToken"

/**
 * The only script the static pages load, after they are drawn. The pages
 * are counted like the app, which matters most here: this is where visitors
 * arrive from a search or a link.
 */
void startAnalytics(loadAnalyticsToken)
