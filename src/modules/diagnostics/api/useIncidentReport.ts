import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, type AppError, type Incident } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { hintTexts } from "../utils/hints";
import { diagnosticsKeys } from "./keys";

/** What one report is built from: the incident, and its hints as the catalog reads them. */
export type ReportSubject = Pick<Incident, "id" | "verdict" | "redirected">;

/** Query options for one incident's report text, for a caller that fetches on demand. */
export function incidentReportOptions(incident: ReportSubject) {
  return queryOptions<string, AppError>({
    queryKey: diagnosticsKeys.incidentReport(incident.id),
    queryFn: queryFnWithArgs(api.diagnostics.incidentReport, incident.id, hintTexts(incident)),
    staleTime: Infinity,
  });
}

/**
 * The report text of one incident, built by the backend.
 *
 * Cached for good, because an incident is written once and the report is a
 * pure function of it. The hints ride along as sentences. The catalog owns
 * those, and the backend holds the codes alone.
 */
export function useIncidentReport(incident: ReportSubject) {
  return useQuery(incidentReportOptions(incident));
}
