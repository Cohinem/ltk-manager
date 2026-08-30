// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HealthCheckReadiness, ModHealth, ModHealthVerdict } from "@/lib/tauri";

import { ModHealthBadge } from "../ModHealthBadge";
import { verdict } from "./modHealthFixtures";

const useModHealthVerdict = vi.fn<() => { data: ModHealthVerdict | undefined }>();
const useHealthCheckReadiness = vi.fn<() => HealthCheckReadiness>(() => "ready");
const checkOne = vi.fn();
const repairOne = vi.fn();

vi.mock("@/modules/library", () => ({
  useModHealthVerdict: () => useModHealthVerdict(),
  useHealthCheckReadiness: () => useHealthCheckReadiness(),
  useCheckModHealth: () => ({ mutate: checkOne, isPending: false }),
  useRepairMod: () => ({ mutate: repairOne, isPending: false }),
}));

function show(health: ModHealth) {
  useModHealthVerdict.mockReturnValue({ data: verdict("a", health) });
  render(<ModHealthBadge modId="a" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModHealthBadge", () => {
  /* A badge on every card would bury the few that need one. */
  it("draws nothing for a mod the check found nothing wrong with", () => {
    show("healthy");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws nothing for a mod nothing has checked", () => {
    useModHealthVerdict.mockReturnValue({ data: undefined });
    render(<ModHealthBadge modId="a" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("counts every finding on a mod no repair reaches", () => {
    show("unrepairable");

    expect(
      screen.getByRole("button", { name: /unrepairable findings, click for details/i }),
    ).toBeInTheDocument();
  });

  it("counts what a repair reaches on a repairable mod", () => {
    show("repairable");

    expect(
      screen.getByRole("button", { name: /repairable findings, click to repair/i }),
    ).toBeInTheDocument();
  });
});
