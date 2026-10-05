// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Checkbox } from "../Checkbox";
import { Field, FormField, TextareaField } from "../FormField";
import { ProgressBar } from "../Progress";
import { RadioGroup } from "../RadioGroup";
import { Select, SelectField } from "../Select";
import { Slider } from "../Slider";
import { Switch } from "../Switch";

const OPTIONS = [
  { value: "modpkg", label: ".modpkg" },
  { value: "fantome", label: ".fantome" },
];

describe("Field.Root", () => {
  it("names and describes the input it holds", () => {
    render(
      <Field.Root label="Name" description="Shown in the library.">
        <Field.Control />
      </Field.Root>,
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAccessibleDescription("Shown in the library.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks its control invalid and describes it by the error", () => {
    render(
      <Field.Root label="Version" error="A version has three parts.">
        <Field.Control />
      </Field.Root>,
    );

    const input = screen.getByRole("textbox", { name: "Version" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("A version has three parts.");
  });

  it("names and marks a select trigger", () => {
    render(
      <Field.Root label="Format" error="Choose a format.">
        <Select.Root>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
        </Select.Root>
      </Field.Root>,
    );

    const trigger = screen.getByRole("combobox", { name: "Format" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
  });

  it("names a switch, a checkbox, a slider and a radio group", () => {
    render(
      <>
        <Field.Root label="Overlay">
          <Switch />
        </Field.Root>
        <Field.Root label="Terms">
          <Checkbox />
        </Field.Root>
        <Field.Root label="Tint">
          <Slider value={30} onValueChange={() => {}} />
        </Field.Root>
        <Field.Root label="Launch mode">
          <RadioGroup.Root>
            <RadioGroup.Item value="patcher" label="With the patcher" />
          </RadioGroup.Root>
        </Field.Root>
      </>,
    );

    expect(screen.getByRole("switch", { name: "Overlay" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Terms" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Tint" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Launch mode" })).toBeInTheDocument();
  });
});

describe("Field.Control", () => {
  it("is marked invalid by hasError outside a root", () => {
    render(<Field.Control aria-label="Domain" hasError />);

    expect(screen.getByRole("textbox", { name: "Domain" })).toHaveAttribute("aria-invalid", "true");
  });
});

describe("the one-tag fields", () => {
  it("draws a text input through the root", () => {
    render(<FormField label="Author" error="An author is required." />);

    const input = screen.getByRole("textbox", { name: "Author" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("An author is required.")).toBeInTheDocument();
  });

  it("draws a textarea that the label names and the error marks", () => {
    render(<TextareaField label="Description" error="A description is required." />);

    const textarea = screen.getByRole("textbox", { name: "Description" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });

  it("ties a select field's label to its trigger", () => {
    render(<SelectField label="Format" options={OPTIONS} defaultValue="modpkg" />);

    expect(screen.getByRole("combobox", { name: "Format" })).toBeInTheDocument();
  });
});

describe("Switch", () => {
  it("is named by its label, and flips when the label is pressed", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Close to the tray" onCheckedChange={onCheckedChange} />);

    expect(screen.getByRole("switch", { name: "Close to the tray" })).toBeInTheDocument();

    await userEvent.click(screen.getByText("Close to the tray"));
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  });
});

describe("labels drawn by the control", () => {
  it("names a radio group by its label", () => {
    render(
      <RadioGroup.Root label="Output format">
        <RadioGroup.Card value="modpkg" title=".modpkg" />
      </RadioGroup.Root>,
    );

    expect(screen.getByRole("radiogroup", { name: "Output format" })).toBeInTheDocument();
  });

  it("draws the mark of a radio item that is not chosen", () => {
    render(
      <RadioGroup.Root label="Theme" defaultValue="system">
        <RadioGroup.Item value="system" label="System" />
        <RadioGroup.Item value="dark" label="Dark" />
      </RadioGroup.Root>,
    );

    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(dark).not.toBeChecked();
    expect(dark.firstElementChild).toHaveClass("rounded-full");
  });

  it("names a slider by its label", () => {
    render(<Slider label="Surface tint" value={30} onValueChange={() => {}} />);

    expect(screen.getByRole("slider", { name: "Surface tint" })).toBeInTheDocument();
  });

  it("names a progress bar by its label", () => {
    render(<ProgressBar value={40} label="Installing" />);

    expect(screen.getByRole("progressbar", { name: "Installing" })).toBeInTheDocument();
  });
});
