import { useRef } from "react";

import { Field } from "@/components";
import { m } from "@/i18n";

import { usePaneCommands } from "../../menus/state/paneCommands";
import { useAtlasPreviewActions, useFontSample } from "../state/atlasPreview";
import { FONT_FOCUS_SAMPLE_COMMAND } from "../utils/atlasCommands";
import { ScreenMenu } from "./ScreenMenu";

/** The font preview pane's header: the screen the font sizes for, and the markup it draws. */
export function FontControls() {
  const sample = useFontSample();
  const { setFontSample } = useAtlasPreviewActions();
  const field = useRef<HTMLInputElement>(null);

  usePaneCommands("font.controls", {
    [FONT_FOCUS_SAMPLE_COMMAND]: {
      run: () => {
        field.current?.focus();
        field.current?.select();
      },
    },
  });

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 select-none">
      <ScreenMenu hud={false} />
      <Field.Root className="min-w-0 flex-1">
        <Field.Control
          ref={field}
          type="text"
          value={sample}
          onChange={(event) => setFontSample(event.target.value)}
          aria-label={m.workshop_bin_atlas_font_sample_label()}
          placeholder={m.workshop_bin_atlas_font_sample_label()}
          autoComplete="off"
          spellCheck={false}
          size="sm"
          className="select-text"
        />
      </Field.Root>
    </div>
  );
}
