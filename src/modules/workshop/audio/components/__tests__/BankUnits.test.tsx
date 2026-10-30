// @vitest-environment happy-dom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  AssetRef,
  BankReferencesResponse,
  SetFile,
  SiteRow,
  WorkshopProject,
} from "@/lib/tauri";
import { useWorkshopEditorStore } from "@/modules/workshop/shell/state/workshopEditor";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { renderWithProviders } from "@/test/utils";

import { objectDocumentId, previewDocumentId } from "../../../documents";
import { ProjectProvider } from "../../../projects/state/ProjectContext";
import { BankUnitMenu } from "../BankUnits";

const PROJECT: WorkshopProject = {
  path: "X:/mods/ahri-vo",
  name: "ahri-vo",
  displayName: "Ahri VO",
  version: "1.0.0",
  description: "",
  authors: [],
  tags: [],
  champions: ["Ahri"],
  maps: [],
  layers: [
    { name: "base", displayName: "Base", priority: 0, description: null, stringOverrides: {} },
  ],
  thumbnailPath: null,
  lastModified: "2026-10-29T10:00:00Z",
  location: "workshop",
  lastOpened: null,
  id: "id-ahri-vo",
};

const DIR = "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Ahri/Skins/Skin07";
const ASSET: AssetRef = { kind: "file", path: "C:/mods/ahri_skin07_vo_events.bnk" };
const MEDIA_ASSET: AssetRef = { kind: "file", path: "C:/mods/ahri_skin07_vo_audio.bnk" };
const SKIN_ASSET: AssetRef = { kind: "file", path: "C:/mods/skin7.bin" };

function file(name: string, asset: AssetRef | null, opened = false): SetFile {
  return {
    path: `${DIR}/${name}`,
    asset,
    state: asset === null ? { kind: "missing" } : { kind: "found" },
    opened,
  };
}

function row(bin: string, asset: AssetRef | null): SiteRow {
  return {
    asset,
    bin,
    objectHash: "0x11110000",
    object: "Characters/Ahri/Skins/Skin7",
    classHash: "0x0a3e6c3e",
    class: "SkinCharacterDataProperties",
    property: { path: "8f7b194f.f8f29f92[1]", label: "skinAudioProperties.bankUnits[1]" },
  };
}

const REFERENCES: BankReferencesResponse = {
  path: `${DIR}/Ahri_Skin07_VO_events.bnk`,
  units: [
    {
      name: "Ahri_Skin07_VO",
      voiceOver: true,
      files: [
        file("Ahri_Skin07_VO_audio.bnk", MEDIA_ASSET),
        file("Ahri_Skin07_VO_events.bnk", ASSET, true),
        file("Ahri_Skin07_VO_audio.wpk", null),
      ],
      declarations: [
        { row: row("data/characters/ahri/skins/skin7.bin", SKIN_ASSET), contextual: null },
        { row: row("data/characters/ahri/skins/root.bin", null), contextual: null },
      ],
    },
  ],
  lists: [],
  index: { status: "ready" },
};

/** Renders the menu and opens it once the unit name is on its button. */
async function openUnits() {
  mockInvoke.mockImplementation((command: string) =>
    Promise.resolve({
      ok: true,
      value: command === commandNames.audio.readBankReferences ? REFERENCES : null,
    }),
  );
  renderWithProviders(
    <ProjectProvider project={PROJECT}>
      <BankUnitMenu asset={ASSET} />
    </ProjectProvider>,
  );

  await userEvent.click(await screen.findByRole("button", { name: "Ahri_Skin07_VO" }));
}

/** Opens the submenu of the declarations and waits out Base UI's open delay. */
async function openDeclarations() {
  await userEvent.click(screen.getByRole("menuitem", { name: /Declared in 2 bins/ }));
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: /root\.bin/ })).toBeInTheDocument(),
  );
}

function openTabs(): string[] {
  return Object.keys(useWorkshopEditorStore.getState().byProject[PROJECT.path]?.documents ?? {});
}

describe("BankUnitMenu", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useWorkshopEditorStore.setState({ byProject: {} });
  });

  it("marks the opened file and disables a missing file", async () => {
    await openUnits();

    expect(
      screen.getByRole("menuitem", { name: "Event bank: Ahri_Skin07_VO_events.bnk, this file" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitem", { name: "Package: Ahri_Skin07_VO_audio.wpk, missing" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("opens a sibling file of the unit in a tab", async () => {
    await openUnits();

    await userEvent.click(
      screen.getByRole("menuitem", { name: "Media bank: Ahri_Skin07_VO_audio.bnk" }),
    );

    expect(openTabs()).toContain(previewDocumentId(MEDIA_ASSET));
  });

  it("opens a declaration at its bank unit row", async () => {
    await openUnits();
    await openDeclarations();

    /* `fireEvent`, because userEvent's pointer path leaves the submenu trigger and closes the
       submenu before the click lands. */
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Open skinAudioProperties.bankUnits[1] in data/characters/ahri/skins/skin7.bin",
      }),
    );

    const documentId = objectDocumentId(SKIN_ASSET, "0x11110000");
    expect(openTabs()).toContain(documentId);
    expect(useWorkshopEditorStore.getState().byProject[PROJECT.path]?.revealRow).toMatchObject({
      documentId,
      key: "0x11110000:8f7b194f.f8f29f92[1]",
    });
  });

  it("disables a declaration whose bin no store contains", async () => {
    await openUnits();
    await openDeclarations();

    expect(screen.getByRole("menuitem", { name: /root\.bin/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
