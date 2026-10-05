import { twMerge } from "@/utils";

import { Spinner, type SpinnerProps } from "./Spinner";

export interface LoadingStateProps {
  readonly size?: SpinnerProps["size"];
  readonly className?: string;
}

/** A spinner centred in the room a view's content will take. */
export function LoadingState({ size = 24, className }: LoadingStateProps) {
  return (
    <div className={twMerge("flex flex-1 items-center justify-center", className)}>
      <Spinner size={size} />
    </div>
  );
}
