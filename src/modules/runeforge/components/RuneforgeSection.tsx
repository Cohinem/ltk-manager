import { CloudArrowUpIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AlertBox,
  Badge,
  Button,
  ExternalLink,
  Field,
  Inline,
  SectionCard,
  Stack,
} from "@/components";
import { errorSummary, m } from "@/i18n";
import type { ConnectedAccount, RuneforgeStatus } from "@/lib/tauri";

import { runeforgeMutations, runeforgeQueries } from "../api";
import { missingScopes } from "../utils/scopes";

/**
 * The RuneForge connection in Settings: the account, its scopes, and Connect, Reconnect and
 * Disconnect. The token field is a password input, and the token never comes back from the backend.
 */
export function RuneforgeSection() {
  const status = useQuery(runeforgeQueries.status()).data;
  const [replacing, setReplacing] = useState(false);

  if (!status) return null;

  const showForm = !status.account || replacing || status.rejected;

  return (
    <SectionCard
      title={m.runeforge_section_title()}
      description={m.runeforge_section_description()}
      icon={<CloudArrowUpIcon className="size-5" />}
    >
      <Stack gap={3}>
        {status.rejected && (
          <AlertBox tone="danger" title={m.runeforge_rejected_title()}>
            {m.runeforge_rejected_description()}
          </AlertBox>
        )}
        {status.account && <AccountSummary account={status.account} />}
        {showForm && <ConnectForm status={status} onConnected={() => setReplacing(false)} />}
        <Inline gap={2} justify="between">
          <ExternalLink href={status.tokenPageUrl}>{m.runeforge_token_page_action()}</ExternalLink>
          {status.account && (
            <AccountActions replacing={replacing} onReplace={() => setReplacing(true)} />
          )}
        </Inline>
      </Stack>
    </SectionCard>
  );
}

function AccountSummary({ account }: { account: ConnectedAccount }) {
  const missing = missingScopes(account.scopes);

  return (
    <Stack gap={2}>
      <Inline gap={2} align="center">
        <span className="font-medium text-surface-100 select-text">
          {account.displayName || account.username || account.userId}
        </span>
        {account.username && (
          <span className="text-meta text-surface-400 select-text">@{account.username}</span>
        )}
      </Inline>
      <Inline gap={1.5} align="center">
        <span className="text-meta text-surface-400">{m.runeforge_account_token_label()}</span>
        <span className="font-mono text-meta text-surface-300 select-text">
          {m.runeforge_account_token_prefix_label({ prefix: account.tokenPrefix })}
        </span>
      </Inline>
      <Inline gap={1.5} align="center">
        <span className="text-meta text-surface-400">{m.runeforge_account_scopes_label()}</span>
        {account.scopes.map((scope) => (
          <Badge key={scope} size="sm">
            {scope}
          </Badge>
        ))}
      </Inline>
      {missing.length > 0 && (
        <AlertBox tone="warning" title={m.runeforge_missing_scopes_title()}>
          {m.runeforge_missing_scopes_description({ scopes: missing.join(", ") })}
        </AlertBox>
      )}
    </Stack>
  );
}

function AccountActions({ replacing, onReplace }: { replacing: boolean; onReplace: () => void }) {
  const client = useQueryClient();
  const disconnect = useMutation(runeforgeMutations.disconnect(client));

  return (
    <Inline gap={2}>
      {!replacing && (
        <Button variant="ghost" size="sm" onClick={onReplace}>
          {m.runeforge_reconnect_action()}
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

function ConnectForm({
  status,
  onConnected,
}: {
  status: RuneforgeStatus;
  onConnected: () => void;
}) {
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
          <Button type="submit" size="sm" disabled={!token.trim()} loading={connect.isPending}>
            {submitLabel}
          </Button>
        </Inline>
      </Stack>
    </form>
  );
}
