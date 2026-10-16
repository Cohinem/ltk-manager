import { CaretDownIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { useShaderReadOptions } from "../hooks/useMaterialProgram";
import { previewKey, usePickedDefines, usePreviewDefinesStore } from "../state/previewDefines";

/** The defines that the studio sets on every pass, which the menu does not offer. */
const STUDIO_DEFINES: ReadonlySet<string> = new Set([
  "DISABLE_FOW",
  "DISABLE_SHADOWS",
  "NUM_BLEND_WEIGHTS",
]);

/** The text of a declared value that is empty. */
const EMPTY_VALUE = "-";

/** The radio value that clears a define's pick, which no declared value takes. */
const DEF_VALUE = "\u0000def";

/**
 * The menu of the defines that a shader def's preview sets, with a submenu per define that its
 * TOCs declare. "The material shell" in docs/ux/BIN_EDITOR.md.
 *
 * Each submenu offers Not set and every value that the TOCs declare.
 */
export function PermutationMenu({ document, entry }: { document: BinDocumentId; entry: string }) {
  const picked = usePickedDefines(document, entry);
  const read = useQuery(useShaderReadOptions(document, entry, true)).data ?? null;
  const pick = usePreviewDefinesStore((state) => state.pick);
  const clear = usePreviewDefinesStore((state) => state.clear);

  const declared = (read?.declared ?? []).filter((define) => !STUDIO_DEFINES.has(define.name));
  if (declared.length === 0) return null;

  const key = previewKey(document, entry);
  const count = Object.keys(picked).length;
  const label =
    count > 0
      ? m.workshop_bin_shader_permutation_count_label({ count })
      : m.workshop_bin_shader_permutation_label();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label={m.workshop_bin_shader_permutation_label()}
            left={<SlidersHorizontalIcon weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {label}
          </Button>
        }
      />
      <Menu.Content align="end" data-ui="PermutationMenu" className="max-h-96 w-64 overflow-y-auto">
        {count > 0 && (
          <>
            <Menu.Item onClick={() => clear(key)}>
              {m.workshop_bin_shader_permutation_reset_action()}
            </Menu.Item>
            <Menu.Separator />
          </>
        )}
        {declared.map((define) => (
          <Menu.SubmenuRoot key={define.name}>
            <Menu.SubmenuTrigger>
              <span className="font-mono text-mono-row">{define.name}</span>
            </Menu.SubmenuTrigger>
            <Menu.SubmenuContent data-ui="PermutationMenu:values">
              <Menu.RadioGroup
                value={picked[define.name] ?? DEF_VALUE}
                onValueChange={(value) =>
                  pick(key, define.name, value === DEF_VALUE ? null : (value as string))
                }
              >
                <Menu.RadioItem value={DEF_VALUE}>
                  {m.workshop_bin_shader_permutation_default_label()}
                </Menu.RadioItem>
                {define.values.map((value) => (
                  <Menu.RadioItem key={value} value={value}>
                    <span className="font-mono text-mono-row">{value || EMPTY_VALUE}</span>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.SubmenuContent>
          </Menu.SubmenuRoot>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}
