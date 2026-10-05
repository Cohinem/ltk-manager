import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { Button, type ButtonSize, Field, Select, type SelectOption } from "@/components";

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
    <Field.Root
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
    >
      <Field.Control
        value={field.state.value}
        onChange={(e) => {
          const value = transform ? transform(e.target.value) : e.target.value;
          field.handleChange(value);
        }}
        onBlur={field.handleBlur}
        className={inputClassName}
        {...props}
      />
    </Field.Root>
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
    <Field.Root
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
      className={className}
    >
      <Field.Textarea
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        className={textareaClassName}
        {...props}
      />
    </Field.Root>
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
    <Field.Root
      label={label}
      description={description}
      required={required}
      error={errorOf(field.state.meta.errors)}
      className={className}
    >
      <Select.Root
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? "")}
        disabled={disabled}
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Field.Root>
  );
}

// SubmitButton - Form-aware submit button
export interface SubmitButtonProps {
  children: ReactNode;
  className?: string;
  variant?: "filled" | "ghost" | "outline";
  size?: ButtonSize;
}

/** The form's submit button, held until the form can be sent and spinning while it is. */
export function SubmitButton({ children, className, variant = "filled", size }: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => ({ isSubmitting: state.isSubmitting, canSubmit: state.canSubmit })}
    >
      {({ isSubmitting, canSubmit }) => (
        <Button
          type="submit"
          variant={variant}
          size={size}
          disabled={!canSubmit}
          loading={isSubmitting}
          className={className}
        >
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}
