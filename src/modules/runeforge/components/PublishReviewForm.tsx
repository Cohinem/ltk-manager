import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  AlertBox,
  Button,
  Checkbox,
  Dialog,
  FormField,
  Inline,
  SelectField,
  Stack,
  TextareaField,
} from "@/components";
import { describeError, errorSummary, m } from "@/i18n";
import type { AppError, PostField, Prefill, PublishRequest, PublishReview } from "@/lib/tauri";

import { runeforgeMutations, runeforgeQueries } from "../api";
import {
  initialPublishForm,
  type PublishForm,
  publishRequest,
  refreshableFields,
} from "../utils/publishForm";
import { FindingList } from "./FindingList";

/** The value of the target picker that stands for a new post. */
const NEW_POST = "new";

/** The value of the game version picker that stands for none. */
const NO_GAME_VERSION = "none";

interface PublishReviewFormProps {
  review: PublishReview;
  submitting: boolean;
  submitError: AppError | null;
  onSubmit: (request: PublishRequest) => void;
  onCancel: () => void;
}

/**
 * What the server read from the package, and the fields the creator confirms before the post or the
 * release is created: the target, the tag, the notes, the game version and the post fields to
 * refresh. Picking another target reads its prefill again.
 */
export function PublishReviewForm({
  review,
  submitting,
  submitError,
  onSubmit,
  onCancel,
}: PublishReviewFormProps) {
  const context = useQuery(runeforgeQueries.context()).data;
  const status = useQuery(runeforgeQueries.status()).data;
  const prefillFor = useMutation(runeforgeMutations.prefill());
  const [form, setForm] = useState<PublishForm>(() => initialPublishForm(review));
  const [prefill, setPrefill] = useState<Prefill>(review.review.prefill);

  const isRelease = form.target.kind === "existing";
  const canPublish = status?.account?.scopes.includes("publish") ?? false;
  const findings = [...review.review.findings, ...prefill.findings];
  const rejected = findings.some((finding) => finding.severity === "error");
  const suggestedTag = submitError && takenTag(submitError);

  function update(patch: Partial<PublishForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function pickTarget(value: string | null) {
    const modId = value === null || value === NEW_POST ? null : value;
    update({ target: modId === null ? { kind: "new" } : { kind: "existing", modId }, refresh: [] });

    prefillFor.mutate(
      { uploadId: review.review.upload.id, modId },
      {
        onSuccess: (next) => {
          setPrefill(next);
          update({
            tag: next.suggestedTag ?? next.release.tag,
            notes: next.release.notes,
            gameVersionId: next.release.gameVersionId,
          });
        },
      },
    );
  }

  const targetOptions = [
    ...review.owned.map((post) => ({
      value: post.id,
      label: post.latestRelease ? `${post.name} (${post.latestRelease.tag})` : post.name,
    })),
    { value: NEW_POST, label: m.runeforge_publish_new_post_label() },
  ];
  const gameVersionOptions = [
    { value: NO_GAME_VERSION, label: m.runeforge_publish_game_version_none_label() },
    ...(context?.gameVersions ?? []).map((version) => ({
      value: version.id,
      label: version.version,
    })),
  ];
  const refreshable = refreshableFields(prefill.changedPostFields);

  return (
    <Dialog.Form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(publishRequest(review, form));
      }}
    >
      <Dialog.Body>
        <Stack gap={4}>
          <SelectField
            label={m.runeforge_publish_target_label()}
            description={
              review.choice.foreignStamp ? m.runeforge_publish_foreign_stamp_hint() : undefined
            }
            options={targetOptions}
            value={form.target.kind === "existing" ? form.target.modId : NEW_POST}
            onValueChange={pickTarget}
            disabled={submitting}
          />

          {!isRelease && (
            <Stack gap={3}>
              <FormField
                label={m.runeforge_publish_name_label()}
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                disabled={submitting}
              />
              <SelectField
                label={m.runeforge_publish_category_label()}
                options={(context?.categories ?? [form.category]).map((category) => ({
                  value: category,
                  label: category,
                }))}
                value={form.category}
                onValueChange={(category) => category && update({ category })}
                disabled={submitting}
              />
            </Stack>
          )}

          <FormField
            label={m.runeforge_publish_tag_label()}
            value={form.tag}
            onChange={(event) => update({ tag: event.target.value })}
            error={suggestedTag ? errorSummary(submitError) : undefined}
            disabled={submitting || prefillFor.isPending}
            inputClassName="font-mono"
          />
          {suggestedTag && (
            <Inline gap={2}>
              <Button
                variant="tonal"
                size="xs"
                type="button"
                onClick={() => update({ tag: suggestedTag })}
              >
                {m.runeforge_publish_tag_taken_action({ tag: suggestedTag })}
              </Button>
            </Inline>
          )}

          <TextareaField
            label={m.runeforge_publish_notes_label()}
            value={form.notes}
            onChange={(event) => update({ notes: event.target.value })}
            rows={4}
            disabled={submitting || prefillFor.isPending}
          />

          <SelectField
            label={m.runeforge_publish_game_version_label()}
            options={gameVersionOptions}
            value={form.gameVersionId ?? NO_GAME_VERSION}
            onValueChange={(value) =>
              update({ gameVersionId: value === null || value === NO_GAME_VERSION ? null : value })
            }
            disabled={submitting}
          />

          {isRelease && refreshable.length > 0 && (
            <Stack gap={1.5}>
              <span className="text-meta font-medium text-surface-300 select-none">
                {m.runeforge_publish_refresh_label()}
              </span>
              {refreshable.map((field) => (
                <Checkbox
                  key={field}
                  size="sm"
                  label={postFieldLabel(field)}
                  checked={form.refresh.includes(field)}
                  onCheckedChange={(checked) =>
                    update({
                      refresh: checked
                        ? [...form.refresh, field]
                        : form.refresh.filter((item) => item !== field),
                    })
                  }
                  disabled={submitting}
                />
              ))}
            </Stack>
          )}

          {isRelease && (
            <Checkbox
              size="sm"
              label={m.runeforge_publish_mark_working_label()}
              checked={form.markAsWorking}
              onCheckedChange={(markAsWorking) => update({ markAsWorking })}
              disabled={submitting}
            />
          )}

          {!isRelease && canPublish && (
            <Checkbox
              size="sm"
              label={m.runeforge_publish_now_label()}
              checked={form.publishNow}
              onCheckedChange={(publishNow) => update({ publishNow })}
              disabled={submitting}
            />
          )}

          {submitError && !suggestedTag && (
            <AlertBox tone="danger" title={describeError(submitError).title}>
              {errorSummary(submitError)}
            </AlertBox>
          )}

          <FindingList label={m.runeforge_publish_findings_label()} findings={findings} />
          {review.warnings.length > 0 && (
            <Stack gap={1}>
              <span className="text-meta font-medium text-surface-300 select-none">
                {m.runeforge_publish_warnings_label()}
              </span>
              {review.warnings.map((warning) => (
                <span key={warning} className="text-row text-surface-300 select-text">
                  {warning}
                </span>
              ))}
            </Stack>
          )}
        </Stack>
      </Dialog.Body>

      <Dialog.Footer>
        <Button size="lg" variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
          {m.runeforge_publish_cancel_action()}
        </Button>
        <Button
          size="lg"
          type="submit"
          loading={submitting}
          disabled={rejected || prefillFor.isPending || !form.tag.trim()}
        >
          {m.runeforge_publish_submit_action()}
        </Button>
      </Dialog.Footer>
    </Dialog.Form>
  );
}

/** Returns the next free tag if `error` refused a taken tag. */
function takenTag(error: AppError): string | null {
  if (error.code !== "RUNEFORGE" || error.error.kind !== "TAG_TAKEN") return null;
  return error.error.suggestedTag;
}

function postFieldLabel(field: PostField): string {
  switch (field) {
    case "shortDescription":
      return m.runeforge_post_field_short_description_label();
    case "description":
      return m.runeforge_post_field_description_label();
    case "category":
      return m.runeforge_post_field_category_label();
    case "license":
      return m.runeforge_post_field_license_label();
    case "thumbnailImageId":
      return m.runeforge_post_field_thumbnail_label();
    case "championIds":
      return m.runeforge_post_field_champions_label();
    case "mapIds":
      return m.runeforge_post_field_maps_label();
    case "name":
    case "themes":
    case "features":
    case "unknown":
      return field;
  }
}
