import { useStore } from "@tanstack/react-form";
import { useState } from "react";

import { m } from "@/i18n";
import { useAppForm } from "@/lib/form";
import type { WorkshopAuthor, WorkshopProject } from "@/lib/tauri";

import { useSaveProjectConfig } from "../../../api";
import {
  appendAuthor,
  filterEmptyAuthors,
  parseChampionsText,
  removeAuthorAt,
  updateAuthorAt,
} from "../utils/utils";

/** The three fields the form itself owns. Everything else is state beside it. */
interface DetailsValues {
  displayName: string;
  version: string;
  description: string;
}

const VERSION_PATTERN =
  /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;

/**
 * The project's metadata as one editable unit, dirty state included.
 *
 * The form covers the three plain fields. Tags, maps, champions and authors need
 * their own state because each is edited through a control rather than an input,
 * so the change check compares a normalised snapshot of all seven against what is
 * on disk instead of asking the form.
 */
export function useProjectDetails(project: WorkshopProject) {
  const saveConfig = useSaveProjectConfig();

  const [authors, setAuthors] = useState<WorkshopAuthor[]>(() => seedAuthors(project));
  const [tags, setTags] = useState<Set<string>>(() => new Set(project.tags));
  const [maps, setMaps] = useState<Set<string>>(() => new Set(project.maps));
  const [championsText, setChampionsText] = useState(() => project.champions.join(", "));

  const form = useAppForm({
    defaultValues: {
      displayName: project.displayName,
      version: project.version,
      description: project.description,
    } satisfies DetailsValues,
  });

  const values = useStore(form.store, (state) => state.values);
  const canSubmit = useStore(form.store, (state) => state.canSubmit);

  const edited = snapshot({
    ...values,
    authors,
    tags: [...tags],
    maps: [...maps],
    champions: parseChampionsText(championsText),
  });

  const saved = snapshot({
    displayName: project.displayName,
    version: project.version,
    description: project.description,
    authors: project.authors,
    tags: project.tags,
    maps: project.maps,
    champions: project.champions,
  });

  /**
   * Write the metadata. Rejects where a field is invalid and where the write failed.
   *
   * A caller that closes or quits on the save reads the rejection, so it keeps
   * the document open rather than dropping the edits.
   */
  async function save(): Promise<void> {
    if (edited === saved) return;
    if (!canSubmit) throw new Error(m.workshop_details_invalid_hint());

    await saveConfig.mutateAsync({
      projectPath: project.path,
      displayName: values.displayName,
      version: values.version,
      description: values.description,
      authors: filterEmptyAuthors(authors),
      tags: [...tags],
      champions: parseChampionsText(championsText),
      maps: [...maps],
    });
  }

  function discard() {
    form.reset({
      displayName: project.displayName,
      version: project.version,
      description: project.description,
    });
    setAuthors(seedAuthors(project));
    setTags(new Set(project.tags));
    setMaps(new Set(project.maps));
    setChampionsText(project.champions.join(", "));
  }

  return {
    form,
    authors,
    addAuthor: (initial?: Partial<WorkshopAuthor>) =>
      setAuthors((current) => appendAuthor(current, initial)),
    removeAuthor: (index: number) => setAuthors((current) => removeAuthorAt(current, index)),
    updateAuthor: (index: number, field: "name" | "role", value: string) =>
      setAuthors((current) => updateAuthorAt(current, index, field, value)),
    tags,
    setTags,
    maps,
    setMaps,
    championsText,
    setChampionsText,
    hasChanges: edited !== saved,
    canSave: canSubmit,
    isSaving: saveConfig.isPending,
    save,
    discard,
  };
}

/** Validates the version field, so a malformed one blocks the save. */
export function validateVersion(value: string): string | undefined {
  if (!value) return "Version is required";
  if (!VERSION_PATTERN.test(value)) return "Must be a valid version (e.g. 1.0.0)";
  return undefined;
}

/** An empty project still shows one author row, which never counts as an edit. */
function seedAuthors(project: WorkshopProject): WorkshopAuthor[] {
  if (project.authors.length > 0) return project.authors;
  return [{ name: "", role: "" }];
}

interface DetailsSnapshot extends DetailsValues {
  authors: readonly WorkshopAuthor[];
  tags: readonly string[];
  maps: readonly string[];
  champions: readonly string[];
}

/* Tags and maps come off a Set, whose order says nothing, so they sort before
   comparing. Champions keep the order they were typed in. */
function snapshot(details: DetailsSnapshot): string {
  return JSON.stringify({
    displayName: details.displayName,
    version: details.version,
    description: details.description,
    authors: filterEmptyAuthors([...details.authors]),
    tags: [...details.tags].sort(),
    maps: [...details.maps].sort(),
    champions: details.champions,
  });
}
