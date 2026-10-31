import {
  CheckIcon,
  LinkBreakIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Inline,
  ListEditor,
  type ListEditorAction,
  RuneforgeIcon,
  SectionCard,
  useToast,
} from "@/components";
import { m } from "@/i18n";
import type { AuthorProfile } from "@/lib/tauri";
import { runeforgeQueries } from "@/modules/runeforge/api";

import { useLoadedSettings, useUpdateSettings } from "../api";
import { type AccountProfileSuggestion, accountProfileSuggestion } from "../authorProfileLink";

/** A cap the UI imposes on itself - settings will hold as many as it is given. */
const MAX_PROFILES = 5;

interface Draft {
  id: string;
  name: string;
  role: string;
  /** An unsaved row, so abandoning it drops the row rather than reverting it. */
  isNew: boolean;
}

export function AuthorProfilesSection() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { toast } = useToast();
  const account = useQuery(runeforgeQueries.status()).data?.account;

  const profiles = settings.authorProfiles ?? [];
  const defaultId = settings.defaultAuthorProfileId;

  /* Undo fires long after the save that armed it, so it reads settings as they are by then. */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const duplicateName = hasDuplicateName(profiles, draft);
  const rows = buildRows(profiles, draft);
  /* Counted off the rows so an unsaved one takes up its place before it is committed. */
  const atLimit = rows.length >= MAX_PROFILES;
  const suggestion = accountProfileSuggestion(profiles, account, atLimit);

  function beginAdd() {
    if (atLimit) return;
    settleDraft();
    setDraft({ id: crypto.randomUUID(), name: "", role: "", isNew: true });
  }

  function beginEdit(profile: AuthorProfile) {
    setDraft({ id: profile.id, name: profile.name, role: profile.role ?? "", isNew: false });
  }

  function commitDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || duplicateName) return;

    const role = draft.role.trim() || null;
    const updated = draft.isNew
      ? [...profiles, { id: draft.id, name, role, runeforgeUserId: null }]
      : profiles.map((profile) => (profile.id === draft.id ? { ...profile, name, role } : profile));

    setDraft(null);
    update({ authorProfiles: updated });
  }

  function settleDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setDraft(null);
      return;
    }
    commitDraft();
  }

  function removeProfile(profile: AuthorProfile) {
    const index = profiles.findIndex((p) => p.id === profile.id);
    const wasDefault = defaultId === profile.id;

    if (draft?.id === profile.id) setDraft(null);
    update({
      authorProfiles: profiles.filter((p) => p.id !== profile.id),
      defaultAuthorProfileId: wasDefault ? null : defaultId,
    });

    toast({
      title: `Removed ${profile.name}`,
      type: "info",
      action: {
        label: "Undo",
        onClick: () => {
          const current = settingsRef.current;
          const restored = [...(current.authorProfiles ?? [])];
          restored.splice(index, 0, profile);
          update({
            authorProfiles: restored,
            defaultAuthorProfileId: wasDefault ? profile.id : current.defaultAuthorProfileId,
          });
        },
      },
    });
  }

  function toggleDefault(profile: AuthorProfile) {
    update({ defaultAuthorProfileId: defaultId === profile.id ? null : profile.id });
  }

  function setLink(profile: AuthorProfile, runeforgeUserId: string | null) {
    update({
      authorProfiles: profiles.map((p) => (p.id === profile.id ? { ...p, runeforgeUserId } : p)),
    });
  }

  function acceptSuggestion(accepted: AccountProfileSuggestion) {
    if (!account) return;

    if (accepted.kind === "link") {
      setLink(accepted.profile, account.userId);
      return;
    }

    update({
      authorProfiles: [
        ...profiles,
        {
          id: crypto.randomUUID(),
          name: accepted.name,
          role: null,
          runeforgeUserId: account.userId,
        },
      ],
    });
  }

  const actions: ListEditorAction<AuthorProfile>[] = [
    {
      placement: "leading",
      icon: (profile) => <DefaultStar active={defaultId === profile.id} />,
      label: (profile) => (defaultId === profile.id ? "Clear default" : "Set as default"),
      pinned: (profile) => defaultId === profile.id,
      onSelect: toggleDefault,
    },
    {
      icon: <LinkBreakIcon weight="bold" className="size-4" />,
      label: m.settings_author_profile_runeforge_unlink_action(),
      hidden: (profile) => !account || profile.runeforgeUserId !== account.userId,
      onSelect: (profile) => setLink(profile, null),
    },
    {
      icon: <PencilSimpleIcon weight="bold" className="size-4" />,
      label: "Edit",
      onSelect: beginEdit,
    },
    {
      icon: <TrashIcon weight="bold" className="size-4" />,
      label: "Remove",
      variant: "danger",
      onSelect: removeProfile,
    },
  ];

  return (
    <SectionCard
      title="Author profiles"
      icon={<UsersThreeIcon className="size-5" />}
      description="Saved author identities you can reuse across projects."
      action={
        rows.length > 0 && (
          <div className="flex items-center gap-2">
            <ProfileCount used={rows.length} />
            <Button
              variant="outline"
              left={<PlusIcon weight="bold" className="size-4" />}
              onClick={beginAdd}
              disabled={atLimit}
            >
              Add profile
            </Button>
          </div>
        )
      }
    >
      <ListEditor
        items={rows}
        itemKey={(profile) => profile.id}
        editingKey={draft?.id ?? null}
        actions={actions}
        onActivate={beginEdit}
        renderItem={(profile) => (
          <ProfileRow
            profile={profile}
            isDefault={defaultId === profile.id}
            isLinked={!!account && profile.runeforgeUserId === account.userId}
          />
        )}
        renderEditor={() => {
          if (!draft) return null;
          return (
            <ProfileEditor
              draft={draft}
              duplicateName={duplicateName}
              onChange={setDraft}
              onCommit={commitDraft}
              onCancel={() => setDraft(null)}
              onSettle={settleDraft}
            />
          );
        }}
        empty={
          <EmptyState
            size="sm"
            title="No profiles yet"
            description="Add your author profile, and use it by default."
            action={
              <Inline gap={2} justify="center" wrap>
                {suggestion && (
                  <SuggestionButton suggestion={suggestion} onAccept={acceptSuggestion} />
                )}
                <Button
                  variant={suggestion ? "outline" : "tonal"}
                  left={<PlusIcon weight="bold" className="size-4" />}
                  onClick={beginAdd}
                >
                  Add profile
                </Button>
              </Inline>
            }
          />
        }
        footer={
          <>
            {suggestion && rows.length > 0 && (
              <Inline>
                <SuggestionButton suggestion={suggestion} onAccept={acceptSuggestion} quiet />
              </Inline>
            )}
            <ProfilesHint atLimit={atLimit} hasDefault={!!defaultId} count={rows.length} />
          </>
        }
      />
    </SectionCard>
  );
}

/** The unsaved row renders in place, so it joins the list before it exists in settings. */
function buildRows(profiles: AuthorProfile[], draft: Draft | null): AuthorProfile[] {
  if (!draft?.isNew) return profiles;
  return [
    ...profiles,
    { id: draft.id, name: draft.name, role: draft.role || null, runeforgeUserId: null },
  ];
}

function hasDuplicateName(profiles: AuthorProfile[], draft: Draft | null): boolean {
  const name = draft?.name.trim().toLowerCase();
  if (!draft || !name) return false;
  return profiles.some((profile) => profile.id !== draft.id && profile.name.toLowerCase() === name);
}

interface SuggestionButtonProps {
  suggestion: AccountProfileSuggestion;
  onAccept: (suggestion: AccountProfileSuggestion) => void;
  /** Draws the button as a `ghost`, for the footer of a list that already has rows. */
  quiet?: boolean;
}

function SuggestionButton({ suggestion, onAccept, quiet = false }: SuggestionButtonProps) {
  const label =
    suggestion.kind === "add"
      ? m.settings_author_profile_runeforge_add_action({ name: suggestion.name })
      : m.settings_author_profile_runeforge_link_action({ name: suggestion.profile.name });

  return (
    <Button
      variant={quiet ? "ghost" : "tonal"}
      left={<RuneforgeIcon className="size-4" />}
      onClick={() => onAccept(suggestion)}
    >
      {label}
    </Button>
  );
}

interface ProfileRowProps {
  profile: AuthorProfile;
  isDefault: boolean;
  isLinked: boolean;
}

function ProfileRow({ profile, isDefault, isLinked }: ProfileRowProps) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-surface-100 select-text">
          {profile.name}
        </span>
        {isDefault && (
          <Badge tone="accent" className="shrink-0 font-medium tracking-wide uppercase">
            Default
          </Badge>
        )}
        {isLinked && (
          <Badge icon={<RuneforgeIcon className="size-3" />} className="shrink-0">
            {m.settings_author_profile_runeforge_label()}
          </Badge>
        )}
      </div>
      <RoleLine role={profile.role} />
    </div>
  );
}

function RoleLine({ role }: { role: string | null }) {
  if (!role) return <span className="truncate text-xs text-surface-400">No role set</span>;
  return <span className="truncate text-xs text-surface-400 select-text">{role}</span>;
}

interface ProfileEditorProps {
  draft: Draft;
  duplicateName: boolean;
  onChange: (draft: Draft) => void;
  onCommit: () => void;
  onCancel: () => void;
  onSettle: () => void;
}

function ProfileEditor({
  draft,
  duplicateName,
  onChange,
  onCommit,
  onCancel,
  onSettle,
}: ProfileEditorProps) {
  const canCommit = !!draft.name.trim() && !duplicateName;

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    onSettle();
  }

  return (
    <div className="flex flex-col gap-1" onBlur={handleBlur}>
      <div className="flex items-center gap-2">
        <Field.Control
          autoFocus
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="Author name"
          hasError={duplicateName}
          className="min-w-0 flex-1"
        />
        <Field.Control
          value={draft.role}
          onChange={(e) => onChange({ ...draft, role: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="Role (optional)"
          className="w-44 shrink-0"
        />
        <IconButton
          icon={<CheckIcon />}
          size="sm"
          aria-label="Save profile"
          disabled={!canCommit}
          onClick={onCommit}
        />
        <IconButton icon={<XIcon />} size="sm" aria-label="Discard changes" onClick={onCancel} />
      </div>
      {duplicateName && (
        <p className="px-1 text-xs text-danger-text">A profile with that name already exists.</p>
      )}
    </div>
  );
}

function DefaultStar({ active }: { active: boolean }) {
  if (active) return <StarIcon weight="fill" className="size-4 text-accent-400" />;
  return <StarIcon weight="bold" className="size-4" />;
}

function ProfileCount({ used }: { used: number }) {
  if (used === 0) return null;
  return (
    <span className="text-xs text-surface-400 tabular-nums">
      {used}/{MAX_PROFILES}
    </span>
  );
}

function ProfilesHint({
  atLimit,
  hasDefault,
  count,
}: {
  atLimit: boolean;
  hasDefault: boolean;
  count: number;
}) {
  if (atLimit) {
    return <p className="px-2 text-xs text-surface-400">Remove a profile to add another.</p>;
  }
  if (hasDefault || count === 0) return null;
  return (
    <p className="px-2 text-xs text-surface-400">
      Set a default profile to fill new projects with it automatically.
    </p>
  );
}
