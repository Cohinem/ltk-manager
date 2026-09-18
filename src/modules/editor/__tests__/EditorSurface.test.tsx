// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditorSurface } from "../components/EditorSurface";
import { useDocumentSave } from "../state/documentSaves";
import type { EditorDocumentBase, EditorDocumentProps, EditorRegistry } from "../types";

interface Note extends EditorDocumentBase {
  kind: "note";
  title: string;
}

const NOTES: readonly Note[] = [
  { id: "a", kind: "note", title: "Alpha" },
  { id: "b", kind: "note", title: "Beta" },
];

/** A document with nothing to save, which is every kind that writes on its own. */
const PLAIN: EditorRegistry<Note> = {
  note: {
    icon: () => null,
    label: (document) => ({ title: document.title }),
    component: ({ document }) => <p>{document.title} body</p>,
  },
};

/** The save the one document on screen offers, for the registry below. */
let save = vi.fn<() => Promise<void>>();

function SavingNote({ document }: EditorDocumentProps<Note>) {
  useDocumentSave(document.id, save);
  return <p>{document.title} body</p>;
}

/** A document that holds its edits until it is asked, as Mod details does. */
const SAVING: EditorRegistry<Note> = {
  note: {
    icon: () => null,
    label: (document) => ({ title: document.title }),
    component: SavingNote,
  },
};

interface DrawOptions {
  registry?: EditorRegistry<Note>;
  onClose?: (id: string) => void;
  onActivate?: (id: string) => void;
}

function draw({ registry = PLAIN, onClose = vi.fn(), onActivate = vi.fn() }: DrawOptions = {}) {
  render(
    <EditorSurface
      leafId="leaf-1"
      documents={NOTES}
      activeId="a"
      registry={registry}
      dirtyIds={new Set(["a", "b"])}
      pinnedIds={[]}
      onActivate={onActivate}
      onClose={onClose}
    />,
  );
  return { onClose, onActivate };
}

/*
 * The strip's own close button. Found through hidden elements, because the
 * question is modal and marks the surface behind it away from a reader - a
 * close made while one stands comes from a command rather than a pointer.
 */
function closeTab(title: string) {
  fireEvent.click(screen.getByRole("button", { name: `Close ${title}`, hidden: true }));
}

beforeEach(() => {
  save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
});

describe("EditorSurface", () => {
  it("asks about a second close rather than dropping the first question", async () => {
    const user = userEvent.setup();
    const { onClose, onActivate } = draw();

    closeTab("Alpha");
    closeTab("Beta");

    expect(screen.getByText(/Alpha has unsaved changes/)).toBeTruthy();
    /* The question stands over the document it names. */
    expect(onActivate).toHaveBeenCalledWith("a");

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onClose).toHaveBeenCalledWith("a");
    await screen.findByText(/Beta has unsaved changes/);
    expect(onActivate).toHaveBeenCalledWith("b");

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledWith("b");
  });

  it("drops the whole queue on a cancel", async () => {
    const user = userEvent.setup();
    const { onClose } = draw();

    closeTab("Alpha");
    closeTab("Beta");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(/has unsaved changes/)).toBeNull());
  });

  it("offers a save for a document that holds its edits, and closes on the write", async () => {
    const user = userEvent.setup();
    const { onClose } = draw({ registry: SAVING });

    closeTab("Alpha");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledOnce();
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("a"));
  });

  it("keeps the document open when the write fails", async () => {
    const user = userEvent.setup();
    save = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("the disk is full"));
    const { onClose } = draw({ registry: SAVING });

    closeTab("Alpha");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText(/has unsaved changes/)).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers no save for a document that writes on its own", () => {
    draw();

    closeTab("Alpha");

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
