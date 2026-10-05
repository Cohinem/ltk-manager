import { Field as BaseField } from "@base-ui/react/field";
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { twMerge } from "@/utils";

import { fieldFrame, type FieldSize, fieldSizeClasses } from "./fieldFrame";

/** Whether `error` holds a message to draw. */
function hasMessage(error: ReactNode): boolean {
  return error !== undefined && error !== null && error !== false && error !== "";
}

export interface FieldRootProps extends Omit<BaseField.Root.Props, "className"> {
  /** Drawn above the control, and its accessible name. */
  label?: ReactNode;
  /** Helper text under the label, read out as the control's description. */
  description?: ReactNode;
  /** A message under the control, which also marks the control invalid. */
  error?: ReactNode;
  /** Marks the label with the required sign. */
  required?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * The frame every labelled control draws in: label, description, the control, error.
 *
 * A control from this folder placed inside is named by `label`, described by `description`
 * and marked `aria-invalid` while `error` holds a message. That covers `Field.Control`,
 * `Field.Textarea`, `Select`, `Combobox`, `Checkbox`, `Switch`, `RadioGroup`, `Slider` and the
 * number fields. The label, description and error parts stay exported for a field laid out
 * another way.
 */
const FieldRoot = forwardRef<HTMLDivElement, FieldRootProps>(
  ({ label, description, error, required, invalid, className, children, ...props }, ref) => {
    const failed = hasMessage(error);

    return (
      <BaseField.Root
        ref={ref}
        invalid={invalid ?? failed}
        className={twMerge("flex flex-col gap-1.5", className)}
        {...props}
      >
        {label && <FieldLabel required={required}>{label}</FieldLabel>}
        {description && <FieldDescription>{description}</FieldDescription>}
        {children}
        {failed && <FieldError>{error}</FieldError>}
      </BaseField.Root>
    );
  },
);
FieldRoot.displayName = "Field.Root";

export interface FieldLabelProps extends Omit<BaseField.Label.Props, "className"> {
  className?: string;
  required?: boolean;
  children?: ReactNode;
}

const FieldLabel = forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <BaseField.Label
        ref={ref}
        className={twMerge("text-sm font-medium text-surface-200", className)}
        {...props}
      >
        {children}
        {required && <span className="ml-1 text-required">*</span>}
      </BaseField.Label>
    );
  },
);
FieldLabel.displayName = "Field.Label";

export interface FieldDescriptionProps extends Omit<BaseField.Description.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const FieldDescription = forwardRef<HTMLParagraphElement, FieldDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseField.Description
        ref={ref}
        className={twMerge("text-xs text-surface-400", className)}
        {...props}
      >
        {children}
      </BaseField.Description>
    );
  },
);
FieldDescription.displayName = "Field.Description";

export interface FieldErrorProps extends Omit<BaseField.Error.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

/* `match` defaults on because every call site here decides for itself whether to
   draw the message. Base UI otherwise reads the control's own `ValidityState`,
   which nothing in this app writes, so the error rendered nothing at all. */
const FieldError = forwardRef<HTMLParagraphElement, FieldErrorProps>(
  ({ className, children, match = true, ...props }, ref) => {
    return (
      <BaseField.Error
        ref={ref}
        match={match}
        className={twMerge("text-xs text-danger-text", className)}
        {...props}
      >
        {children}
      </BaseField.Error>
    );
  },
);
FieldError.displayName = "Field.Error";

export interface FieldControlProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "size"
> {
  /** `md`, 32px, unless told otherwise. */
  size?: FieldSize;
  /** Marks a control standing outside a `Field.Root` invalid. */
  hasError?: boolean;
  className?: string;
}

/**
 * A one-line text input.
 *
 * The `aria-invalid` key is left off a valid control, because a key passed here replaces the
 * one its `Field.Root` sets.
 */
const FieldControl = forwardRef<HTMLInputElement, FieldControlProps>(
  ({ size = "md", className, hasError, ...props }, ref) => {
    return (
      <BaseField.Control
        ref={ref}
        {...(hasError && { "aria-invalid": true })}
        className={twMerge(fieldFrame, fieldSizeClasses[size], className)}
        {...props}
      />
    );
  },
);
FieldControl.displayName = "Field.Control";

export interface FieldTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> {
  /** Marks a control standing outside a `Field.Root` invalid. */
  hasError?: boolean;
  className?: string;
}

/** A text input of several lines, which grows by its resize handle. */
const FieldTextarea = forwardRef<HTMLTextAreaElement, FieldTextareaProps>(
  ({ className, hasError, ...props }, ref) => {
    /* Base UI types the control as an input whatever `render` draws. */
    const control = { ref, ...props } as unknown as BaseField.Control.Props;

    return (
      <BaseField.Control
        render={<textarea />}
        {...(hasError && { "aria-invalid": true })}
        className={twMerge(fieldFrame, "min-h-20 resize-y px-2.5 py-2 text-sm", className)}
        {...control}
      />
    );
  },
);
FieldTextarea.displayName = "Field.Textarea";

export const Field = {
  Root: FieldRoot,
  Label: FieldLabel,
  Description: FieldDescription,
  Error: FieldError,
  Control: FieldControl,
  Textarea: FieldTextarea,
};

export interface FormFieldProps extends Omit<FieldControlProps, "className" | "hasError"> {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  /** Marks the label, and is not passed to the input. */
  required?: boolean;
  className?: string;
  inputClassName?: string;
}

/** A labelled text input in one tag: `Field.Root` around a `Field.Control`. */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    { label, description, error, required, className, inputClassName, id, name, ...inputProps },
    ref,
  ) => {
    return (
      <FieldRoot
        label={label}
        description={description}
        error={error}
        required={required}
        className={className}
      >
        <FieldControl
          ref={ref}
          id={id ?? name}
          name={name}
          className={inputClassName}
          {...inputProps}
        />
      </FieldRoot>
    );
  },
);
FormField.displayName = "FormField";

export interface TextareaFieldProps extends Omit<FieldTextareaProps, "className" | "hasError"> {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  /** Marks the label, and is not passed to the textarea. */
  required?: boolean;
  className?: string;
  textareaClassName?: string;
}

/** A labelled textarea in one tag: `Field.Root` around a `Field.Textarea`. */
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  (
    { label, description, error, required, className, textareaClassName, id, name, ...props },
    ref,
  ) => {
    return (
      <FieldRoot
        label={label}
        description={description}
        error={error}
        required={required}
        className={className}
      >
        <FieldTextarea
          ref={ref}
          id={id ?? name}
          name={name}
          className={textareaClassName}
          {...props}
        />
      </FieldRoot>
    );
  },
);
TextareaField.displayName = "TextareaField";
