import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";

import { Button, IconButton } from "./Button";
import { Checkbox } from "./Checkbox";
import { Combobox } from "./Combobox";
import { FieldAffix } from "./FieldAffix";
import type { FieldSize } from "./fieldFrame";
import { Field, FormField, TextareaField } from "./FormField";
import type { GalleryEntry } from "./galleryEntry";
import { RadioGroup } from "./RadioGroup";
import { Select } from "./Select";
import { Slider } from "./Slider";
import { Switch } from "./Switch";

const SIZES: FieldSize[] = ["xs", "sm", "md"];

const FORMATS = ["modpkg", "fantome"];

function FormatSelect({ size }: { size?: FieldSize }) {
  return (
    <Select.Root defaultValue="modpkg">
      <Select.Trigger size={size}>
        <Select.Value />
        <Select.Icon />
      </Select.Trigger>
      <Select.Content>
        {FORMATS.map((format) => (
          <Select.Item key={format} value={format}>
            {format}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

function FormatCombobox({ size }: { size?: FieldSize }) {
  return (
    <Combobox.Root items={FORMATS} defaultValue="modpkg">
      <Combobox.Input size={size} />
      <Combobox.Content>
        <Combobox.List>
          {(format: string) => (
            <Combobox.Item key={format} value={format}>
              {format}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox.Root>
  );
}

const entry: GalleryEntry = {
  name: "FormField",
  family: "fields",
  cases: [
    {
      name: "States",
      render: () => (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <FormField label="Name" placeholder="Fiora VFX" />
          <FormField label="Name" description="Shown in the library." defaultValue="Fiora VFX" />
          <FormField label="Version" required defaultValue="1.0.0" />
          <FormField label="Version" error="A version has three parts." defaultValue="1.0" />
          <FormField label="Author" disabled defaultValue="Crauzer" />
          <FormField placeholder="No label" aria-label="Unlabelled" />
        </div>
      ),
    },
    {
      name: "Sizes, each beside a button, a select and a combobox of its size",
      render: () => (
        <div className="flex w-full max-w-2xl flex-col gap-3">
          {SIZES.map((size) => (
            <div key={size} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              <Field.Control size={size} defaultValue={size} aria-label={`Input ${size}`} />
              <FormatSelect size={size} />
              <FormatCombobox size={size} />
              <Button size={size}>Apply</Button>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "Textarea",
      render: () => (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <TextareaField label="Description" placeholder="What the mod changes" />
          <TextareaField label="Description" error="A description is required." />
        </div>
      ),
    },
    {
      name: "Field.Root around each control, with an error",
      render: () => (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <Field.Root label="Format" description="The archive a build writes." error="Choose one.">
            <FormatSelect />
          </Field.Root>
          <Field.Root label="Format" error="No such format.">
            <FormatCombobox />
          </Field.Root>
          <Field.Root label="Surface tint" description="How far the neutrals lean to the accent.">
            <Slider value={30} onValueChange={() => {}} />
          </Field.Root>
          <Field.Root label="Launch mode" error="Choose a launch mode.">
            <RadioGroup.Root>
              <RadioGroup.Options orientation="vertical">
                <RadioGroup.Item value="patcher" label="With the patcher" />
                <RadioGroup.Item value="plain" label="Without mods" />
              </RadioGroup.Options>
            </RadioGroup.Root>
          </Field.Root>
          <Field.Root label="Overlay" description="Rebuilt when a mod changes.">
            <Switch />
          </Field.Root>
          <Field.Root label="Terms" error="Accept to continue.">
            <Checkbox />
          </Field.Root>
        </div>
      ),
    },
    {
      name: "Affix",
      render: () => (
        <div className="relative flex w-72 items-center">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-4 text-surface-400" />
          <Field.Control defaultValue="aatrox" aria-label="Search" className="pr-18 pl-8" />
          <FieldAffix>
            <IconButton icon={<XIcon />} label="Clear" />
            <IconButton icon={<MagnifyingGlassIcon />} label="Search" disabled />
          </FieldAffix>
        </div>
      ),
    },
  ],
};

export default entry;
