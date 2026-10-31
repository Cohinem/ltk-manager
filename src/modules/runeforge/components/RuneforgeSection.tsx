import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AlertBox,
  Badge,
  Button,
  Code,
  ExternalLink,
  Field,
  Grid,
  Inline,
  RuneforgeIcon,
  SectionCard,
  Spinner,
  Stack,
} from "@/components";
import { errorSummary, m } from "@/i18n";
import type { ConnectedAccount, RuneforgeStatus, Scope } from "@/lib/tauri";

import { runeforgeMutations, runeforgeQueries } from "../api";
import { missingScopes, PUBLISHING_SCOPES } from "../utils/scopes";

/** The label and the value of each fact about the connected token. */
const FACT_COLUMNS = "max-content minmax(0, 1fr)";

/**
 * The RuneForge connection in Settings: the account, its scopes, and Connect, Reconnect and
 * Disconnect. The token field is a password input, and the token never comes back from the backend.
 */
export function RuneforgeSection() {
  const { data: status, error } = useQuery(runeforgeQueries.status());

  return (
    <SectionCard
      title={m.runeforge_section_title()}
      description={m.runeforge_section_description()}
      icon={<RuneforgeIcon className="size-5" />}
      action={
        status && (
          <ExternalLink href={status.tokenPageUrl} className="text-row whitespace-nowrap">
            {m.runeforge_token_page_action()}
          </ExternalLink>
        )
      }
    >
      {error && (
        <AlertBox tone="danger" title={m.runeforge_status_failed_title()}>
          {errorSummary(error)}
        </AlertBox>
      )}
      {!status && !error && <Spinner />}
      {status && <Connection status={status} />}
    </SectionCard>
  );
}

function Connection({ status }: { status: RuneforgeStatus }) {
  const [replacing, setReplacing] = useState(false);

  const showForm = !status.account || replacing || status.rejected;

  return (
    <Stack gap={4}>
      {status.rejected && (
        <AlertBox tone="danger" title={m.runeforge_rejected_title()}>
          {m.runeforge_rejected_description()}
        </AlertBox>
      )}
      {status.account && (
        <AccountSummary
          account={status.account}
          rejected={status.rejected}
          canReplace={!showForm}
          onReplace={() => setReplacing(true)}
        />
      )}
      {showForm && (
        <ConnectForm
          status={status}
          onConnected={() => setReplacing(false)}
          onCancel={replacing && !status.rejected ? () => setReplacing(false) : undefined}
        />
      )}
    </Stack>
  );
}

interface AccountSummaryProps {
  account: ConnectedAccount;
  rejected: boolean;
  canReplace: boolean;
  onReplace: () => void;
}

function AccountSummary({ account, rejected, canReplace, onReplace }: AccountSummaryProps) {
  const missing = missingScopes(account.scopes);
  const name = account.displayName || account.username || m.runeforge_account_fallback_label();

  return (
    <Stack gap={3}>
      <Inline gap={4} justify="between">
        <Inline gap={2} fill>
          <span className="truncate text-sm font-medium text-surface-100 select-text">{name}</span>
          {account.username && account.username !== name && (
            <span className="shrink-0 text-meta text-surface-400 select-text">
              {m.runeforge_account_username_label({ username: account.username })}
            </span>
          )}
        </Inline>
        <AccountActions canReplace={canReplace} onReplace={onReplace} />
      </Inline>

      <Grid columns={FACT_COLUMNS} gap={3} rowGap={1.5} align="center">
        <FactLabel>{m.runeforge_account_token_label()}</FactLabel>
        <div>
          <Code className="text-xs">
            {m.runeforge_account_token_prefix_label({ prefix: account.tokenPrefix })}
          </Code>
        </div>

        <FactLabel>{m.runeforge_account_scopes_label()}</FactLabel>
        <Inline gap={1.5} wrap>
          {PUBLISHING_SCOPES.map((scope) => (
            <ScopeBadge key={scope} scope={scope} granted={account.scopes.includes(scope)} />
          ))}
        </Inline>
      </Grid>

      {missing.length > 0 && !rejected && (
        <AlertBox tone="warning" title={m.runeforge_missing_scopes_title()}>
          {m.runeforge_missing_scopes_description()}
        </AlertBox>
      )}
    </Stack>
  );
}

function FactLabel({ children }: { children: string }) {
  return <span className="text-meta text-surface-400 select-none">{children}</span>;
}

/** A scope that publishing uses, marked by whether the token has it. */
function ScopeBadge({ scope, granted }: { scope: Scope; granted: boolean }) {
  if (granted) {
    return (
      <Badge tone="success" icon={<CheckIcon weight="bold" className="size-2.5" />}>
        {scope}
      </Badge>
    );
  }

  return (
    <Badge tone="warning" dashed icon={<XIcon weight="bold" className="size-2.5" />}>
      {scope}
    </Badge>
  );
}

function AccountActions({ canReplace, onReplace }: { canReplace: boolean; onReplace: () => void }) {
  const client = useQueryClient();
  const disconnect = useMutation(runeforgeMutations.disconnect(client));

  return (
    <Inline gap={2}>
      {canReplace && (
        <Button variant="outline" size="sm" onClick={onReplace}>
          {m.runeforge_replace_token_action()}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        loading={disconnect.isPending}
        onClick={() => disconnect.mutate()}
      >
        {m.runeforge_disconnect_action()}
      </Button>
    </Inline>
  );
}

interface ConnectFormProps {
  status: RuneforgeStatus;
  onConnected: () => void;
  /** Closes the form that Replace token opened. Omitted when no working token remains. */
  onCancel?: () => void;
}

function ConnectForm({ status, onConnected, onCancel }: ConnectFormProps) {
  const client = useQueryClient();
  const connect = useMutation(runeforgeMutations.connect(client));
  const [token, setToken] = useState("");

  const submitLabel = status.account
    ? m.runeforge_reconnect_action()
    : m.runeforge_connect_action();

  function submit() {
    if (!token.trim()) return;

    connect.mutate(token, {
      onSuccess: () => {
        setToken("");
        onConnected();
      },
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap={2}>
        <Field.Root
          label={m.runeforge_connect_token_label()}
          description={m.runeforge_connect_token_description()}
          error={connect.error ? errorSummary(connect.error) : undefined}
        >
          <Field.Control
            /* Replace token unmounts the button that held focus. */
            autoFocus={onCancel !== undefined}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            placeholder={m.runeforge_connect_token_placeholder()}
            onChange={(event) => setToken(event.target.value)}
            hasError={Boolean(connect.error)}
            className="font-mono"
          />
        </Field.Root>
        <Inline gap={2} justify="end">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {m.runeforge_replace_cancel_action()}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!token.trim()} loading={connect.isPending}>
            {submitLabel}
          </Button>
        </Inline>
      </Stack>
    </form>
  );
}
