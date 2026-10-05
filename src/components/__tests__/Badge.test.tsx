// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AutoPill } from "../AutoPill";
import { Badge } from "../Badge";
import { Chip } from "../Chip";

describe("Badge", () => {
  it("is plain text at rest, and a button once it can be pressed", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Badge tone="info">Up to date</Badge>
        <Badge tone="warning" onClick={onClick}>
          2 missing
        </Badge>
      </>,
    );

    expect(screen.queryByRole("button", { name: "Up to date" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "2 missing" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not answer a press while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Badge tone="warning" onClick={onClick} disabled>
        2 missing
      </Badge>,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 missing" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("removes itself through a button named for its label", async () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>VFX</Chip>);

    await userEvent.click(screen.getByRole("button", { name: "Remove VFX" }));

    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe("AutoPill", () => {
  it("is a button only when it is a suggestion to take", async () => {
    const onClick = vi.fn();
    render(
      <>
        <AutoPill label="Ahri" tone="champion" />
        <AutoPill label="Summoner's Rift" tone="map" onClick={onClick} />
      </>,
    );

    expect(screen.queryByRole("button", { name: "Ahri" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Summoner's Rift" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
