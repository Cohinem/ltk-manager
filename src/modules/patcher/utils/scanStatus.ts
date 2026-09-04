import { AlertTriangle, FileWarning, type LucideIcon, PackageX, ShieldAlert } from "lucide-react";

import type { Incident, ScanStatus } from "@/lib/tauri";

export interface ScanStatusMessage {
  title: string;
  icon: LucideIcon;
  tone: "red" | "amber";
  lead: string;
  fix: string;
}

/**
 * How each rejection reads, for every surface that reports one.
 *
 * The backend classifies the scan's token and stops there, so this is the only
 * place a rejection is put into words. The blocking dialog and the Games tab
 * both read it, which is what keeps them from wording one event two ways.
 */
export const SCAN_STATUS_MESSAGES: Readonly<Record<ScanStatus, ScanStatusMessage>> = {
  skinhack: {
    title: "Skinhack detected",
    icon: ShieldAlert,
    tone: "red",
    lead: "The patcher's safety scan found a skinhack (an official Riot skin ported onto a base champion) among your enabled mods. To avoid crashing your game, the patcher was stopped and no mods were applied this session.",
    fix: "Remove or disable the offending mod(s), then start the patcher again.",
  },
  "missing-bin": {
    title: "A mod is incomplete",
    icon: PackageX,
    tone: "amber",
    lead: "The scan couldn't find a linked .bin file that a mod needs, so no mods were applied this session. This usually means the mod is broken or was built for a different game version.",
    fix: "Re-import or update the offending mod(s), then start the patcher again.",
  },
  corrupt: {
    title: "A mod file is corrupt",
    icon: PackageX,
    tone: "amber",
    lead: "A modded WAD couldn't be read (it's corrupt or built for an unsupported version), so no mods were applied this session.",
    fix: "Re-import the offending mod(s), then start the patcher again.",
  },
  "out-of-memory": {
    title: "Ran out of memory",
    icon: AlertTriangle,
    tone: "amber",
    lead: "The game ran out of memory while loading mods, so no mods were applied this session.",
    fix: "Close other programs or reduce the number of enabled mods, then try again.",
  },
  "base-skin": {
    title: "A mod is incomplete",
    icon: PackageX,
    tone: "amber",
    lead: "The base-skin check found a champion skin with a mesh missing, which reads as an incomplete mod, so no mods were applied this session.",
    fix: "Re-import or rebuild the offending mod(s), then start the patcher again.",
  },
  "base-wad": {
    title: "A game file is not what the scan expects",
    icon: FileWarning,
    tone: "amber",
    lead: "The scan objected to League's own copy of an archive rather than to a mod, so no mods were applied this session. No mod is at fault here.",
    fix: "Repair the install in the Riot Client, then start the patcher again.",
  },
  unknown: {
    title: "Mods could not be applied",
    icon: AlertTriangle,
    tone: "amber",
    lead: "A modded file failed the game's integrity scan, so no mods were applied this session.",
    fix: "Remove or re-import the offending mod(s), then start the patcher again.",
  },
};

/** The status in a few words, for a field that has already been labelled. */
export const SCAN_STATUS_LABELS: Readonly<Record<ScanStatus, string>> = {
  skinhack: "skinhack",
  "missing-bin": "a linked .bin is missing",
  corrupt: "corrupt or unsupported",
  "out-of-memory": "out of memory mid-scan",
  "base-skin": "base skin with a mesh missing",
  "base-wad": "the game's own copy of the archive",
  unknown: "a status this build does not know",
};

/**
 * Choose which status drives a burst's copy. A skinhack is the most serious and
 * always wins. A uniform burst uses its single status, and a mix of different
 * non-skinhack causes falls back to the generic copy so we never show one
 * cause's fix for a different cause's failure.
 */
export function pickPrimaryStatus(statuses: ScanStatus[]): ScanStatus {
  const unique = [...new Set(statuses)];
  if (unique.includes("skinhack")) return "skinhack";
  if (unique.length === 1) return unique[0] ?? "unknown";
  return "unknown";
}

/**
 * What a recorded rejection reads like under its verdict.
 *
 * An incident stored before the backend stopped writing prose still carries its
 * own sentence, and keeps it, so a history does not change wording underneath
 * the reader.
 */
export function scanRejectionCause(incident: Incident): string {
  if (incident.verdict.cause) return incident.verdict.cause;
  const status = incident.scanStatus;
  if (!status) return "";

  const { lead } = SCAN_STATUS_MESSAGES[status];
  const code = incident.scanStatusCode;
  const named = status === "unknown" && code ? `${lead} The status was ${code}.` : lead;

  const others = Math.max(0, incident.scanRejected - 1);
  if (others === 0) return named;
  return `${named} ${others} more archive${others === 1 ? "" : "s"} failed the scan.`;
}
