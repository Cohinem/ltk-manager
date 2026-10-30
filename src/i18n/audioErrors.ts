import { match } from "ts-pattern";

import type { AudioConvertError } from "@/lib/tauri";
import { m } from "@/paraglide/messages";

import type { ErrorCopy } from "./errors";

/** The copy for a file that gives no WEM for a media replacement. */
export function describeAudioConvertError(error: AudioConvertError): ErrorCopy {
  return match(error)
    .with({ kind: "noConsole" }, ({ extension }) => ({
      title: m["error.AUDIO_CONVERT.noConsole.title"]({ extension }),
      description: m["error.AUDIO_CONVERT.noConsole.description"](),
    }))
    .with({ kind: "format" }, ({ extension }) => ({
      title: m["error.AUDIO_CONVERT.format.title"]({ extension }),
      description: m["error.AUDIO_CONVERT.format.description"](),
    }))
    .with({ kind: "failed" }, ({ detail }) => ({
      title: m["error.AUDIO_CONVERT.failed.title"](),
      detail,
    }))
    .exhaustive();
}
