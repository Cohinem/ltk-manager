// @vitest-environment happy-dom

import type { CloseRequestedEvent } from "@tauri-apps/api/window";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/components";
import { useDocumentFlush, useDocumentSave } from "@/modules/editor";
import {
  EMPTY_EDITOR,
  useWorkshopEditorStore,
} from "@/modules/workshop/shell/state/workshopEditor";

import { UnsavedQuitGuard } from "../UnsavedQuitGuard";

/** What the window the guard listens to did. */
const destroy = vi.fn<() => Promise<void>>();
/** The guard's own handler, which a close request runs. */
let requestClose: (event: CloseRequestedEvent) => Promise<void>;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (handler: (event: CloseRequestedEvent) => Promise<void>) => {
      requestClose = handler;
      return Promise.resolve(() => {});
    },
    destroy,
  }),
}));

const PROJECT = "C:/mods/project-a";

/** A close request, as Tauri raises one. */
function closeEvent() {
  let prevented = false;
  return {
    preventDefault: () => {
      prevented = true;
    },
    isPreventDefault: () => prevented,
  } as unknown as CloseRequestedEvent;
}

/** The document that holds its edits until it is asked, as Mod details does. */
function OnDemand({ save }: { save: () => Promise<void> }) {
  useDocumentSave("details", save);
  return null;
}

/** The document that autosaves, as the readme does. */
function Autosaving({ flush }: { flush: () => Promise<void> }) {
  useDocumentFlush("text:readme", flush);
  return null;
}

function draw(document?: React.ReactNode) {
  return render(
    <ToastProvider>
      {document}
      <UnsavedQuitGuard />
    </ToastProvider>,
  );
}

/** Mark `id` as holding unsaved edits in this project's editor. */
function markDirty(id: string) {
  useWorkshopEditorStore.setState({
    byProject: { [PROJECT]: { ...EMPTY_EDITOR, dirty: new Set([id]) } },
  });
}

beforeEach(() => {
  destroy.mockReset();
  destroy.mockResolvedValue(undefined);
  useWorkshopEditorStore.setState({ byProject: {}, history: [], historyIndex: -1 });
});

describe("UnsavedQuitGuard", () => {
  it("writes a pending autosave and closes without asking", async () => {
    const flush = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    draw(<Autosaving flush={flush} />);

    await requestClose(closeEvent());

    expect(flush).toHaveBeenCalledOnce();
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("asks about a document that holds its edits, and leaves it alone on a cancel", async () => {
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    markDirty("details");
    draw(<OnDemand save={save} />);

    const asked = requestClose(closeEvent());

    await screen.findByText(/1 document has unsaved changes/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await asked;

    /* The flush leaves an on-demand document alone, so a cancel has written nothing. */
    expect(save).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("writes every unsaved document on a save all, and then closes", async () => {
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    markDirty("details");
    draw(<OnDemand save={save} />);

    const asked = requestClose(closeEvent());
    await screen.findByText(/1 document has unsaved changes/);
    await user.click(screen.getByRole("button", { name: "Save all" }));
    await asked;

    expect(save).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("closes on a discard without writing", async () => {
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    markDirty("details");
    draw(<OnDemand save={save} />);

    const asked = requestClose(closeEvent());
    await screen.findByText(/1 document has unsaved changes/);
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await asked;

    expect(save).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  /* A silent drop is what the guard exists to stop, so a document no mounted
     editor can write keeps the window open. */
  it("stays open when a save all cannot reach one of the documents", async () => {
    const user = userEvent.setup();
    markDirty("strings:base:en_us");
    draw();

    const asked = requestClose(closeEvent());
    await screen.findByText(/1 document has unsaved changes/);
    await user.click(screen.getByRole("button", { name: "Save all" }));
    await asked;

    expect(destroy).not.toHaveBeenCalled();
  });

  it("stays open when a write fails", async () => {
    const save = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("the disk is full"));
    const user = userEvent.setup();
    markDirty("details");
    draw(<OnDemand save={save} />);

    const asked = requestClose(closeEvent());
    await screen.findByText(/1 document has unsaved changes/);
    await user.click(screen.getByRole("button", { name: "Save all" }));
    await asked;

    expect(destroy).not.toHaveBeenCalled();
  });

  /* Tauri raises a request per close, and the second one arrives while the
     question from the first still stands. */
  it("keeps one question for two close requests", async () => {
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    markDirty("details");
    draw(<OnDemand save={save} />);

    const first = requestClose(closeEvent());
    await screen.findByText(/1 document has unsaved changes/);
    await requestClose(closeEvent());

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await first;

    await waitFor(() => expect(destroy).toHaveBeenCalledOnce());
  });
});
