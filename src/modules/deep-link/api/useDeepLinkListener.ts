import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { useToast } from "@/components";
import {
  api,
  type DeepLinkBlockedPayload,
  type DeepLinkInstallRequest,
  type DeepLinkSettingsRequest,
} from "@/lib/tauri";
import { useTauriEvent } from "@/lib/useTauriEvent";
import { useDeepLinkStore } from "@/stores";

export function useDeepLinkListener() {
  const toast = useToast();
  const navigate = useNavigate();

  const openSettings = useCallback(
    ({ focus }: DeepLinkSettingsRequest) => {
      void navigate({ to: "/settings", search: { focus } });
    },
    [navigate],
  );

  useTauriEvent<DeepLinkInstallRequest>("deep-link-install", (payload) => {
    useDeepLinkStore.getState().setRequest(payload);
  });

  useTauriEvent<DeepLinkSettingsRequest>("deep-link-settings", openSettings);

  useTauriEvent<DeepLinkBlockedPayload>("deep-link-blocked", (payload) => {
    toast.error(
      "Download Blocked",
      `The domain "${payload.domain}" is not in your trusted providers list. You can add it in Settings.`,
    );
  });

  /* A URL the app was launched with reaches the backend before this listener
     exists, so the link it could not send is asked for once, here. */
  useEffect(() => {
    void api.takePendingDeepLink().then((result) => {
      if (!result.ok || !result.value) return;
      if (result.value.kind === "settings") {
        openSettings(result.value);
        return;
      }
      useDeepLinkStore.getState().setRequest(result.value);
    });
  }, [openSettings]);
}
