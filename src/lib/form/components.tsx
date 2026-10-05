import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

import {
  ComboboxEmpty,
  ComboboxIcon,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  type ComboboxOption,
  ComboboxContent,
  ComboboxRoot,
  ComboboxTrigger,
  Field,
  FieldControl,
  FieldRoot,
  FieldTextarea,
  SelectIcon,
  SelectItem,
  type SelectOption,
  SelectContent,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  useComboboxFilter,
} from "@/components";
import { twMerge } from "@/utils";

import { useFieldContext, useFormContext } from "./form-context";

/** The field's errors as one message, or nothing while it has none. */
function errorOf(errors: unknown[]): string | undefined {
  if (errors.length === 0) return undefined;
  return errors.join(", ");
}

// Re-export Field compound component for composition
export { Field };

// TextField - Pre-bound text input field component
export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur" | "size"
> {
  label?: string;
  description?: string;
  inputClassName?: string;
  /** Optional transform function applied to value before updating */
  transform?: (value: string) => string;
}

export function TextField({
  label,
  description,
  inputClassName,
  required,
  transform,
  ...props
}: TextFieldProps) {
  const field = useFieldContext<string>();

  return (
    <FieldRoot
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
    >
      <FieldControl
        value={field.state.value}
        onChange={(e) => {
          const value = transform ? transform(e.target.value) : e.target.value;
          field.handleChange(value);
        }}
        onBlur={field.handleBlur}
        className={inputClassName}
        {...props}
      />
    </FieldRoot>
  );
}

// TextareaField - Pre-bound textarea field component
export interface TextareaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "onBlur"
> {
  label?: string;
  description?: string;
  textareaClassName?: string;
}

export function TextareaField({
  label,
  description,
  textareaClassName,
  required,
  className,
  ...props
}: TextareaFieldProps) {
  const field = useFieldContext<string>();

  return (
    <FieldRoot
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
      className={className}
    >
      <FieldTextarea
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        className={textareaClassName}
        {...props}
      />
    </FieldRoot>
  );
}

// SelectField - Pre-bound select field component
export interface SelectFieldProps {
  label?: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function SelectField({
  label,
  description,
  required,
  options,
  disabled,
  className,
  triggerClassName,
}: SelectFieldProps) {
  const field = useFieldContext<string>();

  return (
    <FieldRoot
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
      className={className}
    >
      <SelectRoot
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? "")}
        disabled={disabled}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue />
          <SelectIcon />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </FieldRoot>
  );
}

// ComboboxField - Pre-bound combobox field component
export interface ComboboxFieldProps {
  label?: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options: ComboboxOption[];
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export function ComboboxField({
  label,
  description,
  required,
  placeholder,
  options,
  disabled,
  className,
  inputClassName,
}: ComboboxFieldProps) {
  const field = useFieldContext<string>();
  const filter = useComboboxFilter();

  const selectedOption = options.find((o) => o.value === field.state.value);

  return (
    <FieldRoot
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
      className={className}
    >
      <ComboboxRoot<ComboboxOption>
        value={selectedOption}
        onValueChange={(opt) => field.handleChange(opt?.value ?? "")}
        disabled={disabled}
        items={options}
        filter={(item, query) => filter.contains(item, query, (o) => o.label)}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
      >
        <div className="relative">
          <ComboboxInput
            placeholder={placeholder}
            className={twMerge("pr-8", inputClassName)}
            onBlur={field.handleBlur}
          />
          <ComboboxTrigger className="absolute top-0 right-0 flex h-full items-center pr-3">
            <ComboboxIcon />
          </ComboboxTrigger>
        </div>
        <ComboboxContent>
          <ComboboxList>
            {(item: ComboboxOption) => (
              <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
          <ComboboxEmpty />
        </ComboboxContent>
      </ComboboxRoot>
    </FieldRoot>
  );
}

// SubmitButton - Form-aware submit button
export interface SubmitButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: "filled" | "ghost" | "outline";
}

export function SubmitButton({ children, className, variant = "filled" }: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => ({ isSubmitting: state.isSubmitting, canSubmit: state.canSubmit })}
    >
      {({ isSubmitting, canSubmit }) => {
        const baseStyles =
          "relative inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-surface-900 disabled:cursor-not-allowed disabled:opacity-50";

        const variantStyles = {
          filled: "bg-accent-600 text-on-accent hover:bg-accent-700",
          ghost: "text-surface-300 hover:bg-surface-700 hover:text-surface-100",
          outline:
            "border border-surface-600 text-surface-300 hover:border-surface-500 hover:text-surface-100",
        };

        return (
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className={twMerge(baseStyles, variantStyles[variant], className)}
          >
            {isSubmitting ? (
              <>
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </span>
                <span className="invisible">{children}</span>
              </>
            ) : (
              children
            )}
          </button>
        );
      }}
    </form.Subscribe>
  );
}
