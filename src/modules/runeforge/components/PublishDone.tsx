import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AlertBox, Button, Dialog, ExternalLink, Inline, Stack } from "@/components";
import { describeError, errorSummary, m } from "@/i18n";
import type {
  HealthStatus,
  PublishChecklist,
  PublishOutcome,
  PublishRequirement,
  PublishResult,
} from "@/lib/tauri";

import { runeforgeMutations, runeforgeQueries } from "../api";
import { FindingList } from "./FindingList";

interface PublishDoneProps {
  outcome: PublishOutcome;
  onClose: () => void;
}

/**
 * The created post or release: a link to it, the publish result or the checklist that refused it,
 * the stamp result and the scan status of the package. The scan is read once and on "Check again".
 */
export function PublishDone({ outcome, onClose }: PublishDoneProps) {
  const [publish, setPublish] = useState<PublishResult | null>(outcome.publish);

  return (
    <>
      <Dialog.Body>
        <Stack gap={3}>
          <ExternalLink href={outcome.modUrl}>{m.runeforge_publish_open_action()}</ExternalLink>
          <PublishStatus modId={outcome.modId} result={publish} onResult={setPublish} />
          {outcome.postUpdateError && (
            <AlertBox tone="warning">
              {m.runeforge_publish_post_update_failed_description()}
            </AlertBox>
          )}
          {outcome.stamp.kind === "failed" && (
            <AlertBox tone="warning">{m.runeforge_publish_stamp_failed_description()}</AlertBox>
          )}
          <ScanStatus modId={outcome.modId} releaseId={outcome.releaseId} />
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button size="lg" onClick={onClose}>
          {m.runeforge_publish_close_action()}
        </Button>
      </Dialog.Footer>
    </>
  );
}

interface PublishStatusProps {
  modId: string;
  result: PublishResult | null;
  onResult: (result: PublishResult) => void;
}

function PublishStatus({ modId, result, onResult }: PublishStatusProps) {
  if (result === null) {
    return (
      <span className="text-row text-surface-300">{m.runeforge_publish_draft_description()}</span>
    );
  }

  if (result.kind === "published") {
    return <AlertBox tone="success">{m.runeforge_publish_published_description()}</AlertBox>;
  }

  if (result.kind === "failed") {
    const copy = describeError({ code: "RUNEFORGE", error: result.error });
    return (
      <AlertBox tone="danger" title={copy.title}>
        {errorSummary({ code: "RUNEFORGE", error: result.error })}
      </AlertBox>
    );
  }

  return (
    <RefusedChecklist
      modId={modId}
      checklist={result.checklist}
      reviewUrl={result.reviewUrl}
      onResult={onResult}
    />
  );
}

interface RefusedChecklistProps {
  modId: string;
  checklist: PublishChecklist;
  reviewUrl: string | null;
  onResult: (result: PublishResult) => void;
}

function RefusedChecklist({ modId, checklist, reviewUrl, onResult }: RefusedChecklistProps) {
  const publish = useMutation(runeforgeMutations.publish());
  const asksAi = checklist.missing.includes("ai_disclosure");

  function answer(hasAiGeneratedPostContent: boolean) {
    publish.mutate(
      {
        modId,
        answer: {
          hasAiGeneratedPostContent,
          expectedVersion: checklist.aiContentDisclosureVersion,
        },
      },
      { onSuccess: onResult },
    );
  }

  return (
    <AlertBox tone="warning" title={m.runeforge_publish_refused_title()}>
      <Stack gap={2}>
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          {checklist.missing.map((requirement) => (
            <li key={requirement}>{requirementLabel(requirement)}</li>
          ))}
        </ul>
        {checklist.path === "review" && (
          <span>{m.runeforge_publish_refused_review_description()}</span>
        )}
        {asksAi && (
          <Stack gap={1.5}>
            <span>{m.runeforge_publish_ai_description()}</span>
            {checklist.aiModeratorEnforced && <span>{m.runeforge_publish_ai_enforced_hint()}</span>}
            <Inline gap={2}>
              <Button
                size="xs"
                variant="tonal"
                loading={publish.isPending}
                onClick={() => answer(true)}
              >
                {m.runeforge_publish_ai_yes_action()}
              </Button>
              {!checklist.aiModeratorEnforced && (
                <Button
                  size="xs"
                  variant="tonal"
                  disabled={publish.isPending}
                  onClick={() => answer(false)}
                >
                  {m.runeforge_publish_ai_no_action()}
                </Button>
              )}
            </Inline>
          </Stack>
        )}
        {publish.error && <span className="select-text">{errorSummary(publish.error)}</span>}
        {reviewUrl && (
          <ExternalLink href={reviewUrl}>{m.runeforge_publish_review_action()}</ExternalLink>
        )}
      </Stack>
    </AlertBox>
  );
}

function ScanStatus({ modId, releaseId }: { modId: string; releaseId: string }) {
  const release = useQuery(runeforgeQueries.release(modId, releaseId));
  const artifact = release.data?.artifacts[0];
  const status: HealthStatus = artifact?.health?.status ?? "pending";

  return (
    <Stack gap={2}>
      <Inline gap={2} justify="between">
        <span className="text-row text-surface-200 select-none">
          {m.runeforge_publish_scan_label()}: {healthLabel(status)}
        </span>
        <Button
          size="xs"
          variant="ghost"
          loading={release.isFetching}
          onClick={() => void release.refetch()}
        >
          {m.runeforge_publish_check_again_action()}
        </Button>
      </Inline>
      {release.error && (
        <span className="text-meta text-danger-text">{errorSummary(release.error)}</span>
      )}
      <FindingList
        label={m.runeforge_publish_findings_label()}
        findings={artifact?.health?.findings ?? []}
      />
    </Stack>
  );
}

function healthLabel(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return m.runeforge_publish_scan_ok_label();
    case "warnings":
      return m.runeforge_publish_scan_warnings_label();
    case "errors":
      return m.runeforge_publish_scan_errors_label();
    case "pending":
      return m.runeforge_publish_scan_pending_label();
  }
}

function requirementLabel(requirement: PublishRequirement): string {
  switch (requirement) {
    case "thumbnail":
      return m.runeforge_publish_missing_thumbnail_label();
    case "release":
      return m.runeforge_publish_missing_release_label();
    case "license":
      return m.runeforge_publish_missing_license_label();
    case "ai_disclosure":
      return m.runeforge_publish_missing_ai_disclosure_label();
    case "unknown":
      return m.runeforge_publish_missing_unknown_label();
  }
}
