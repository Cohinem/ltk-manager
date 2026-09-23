import { type ComponentProps, useEffect, useState } from "react";

import { ContentVisibilityContext, useContentVisible } from "@/hooks";

interface RetainedContentProps extends ComponentProps<"div"> {
  active: boolean;
  defer?: boolean;
}

/** A mounted pane whose renderers pause while it or an ancestor is hidden. */
export function RetainedContent({
  active,
  defer = false,
  children,
  ...props
}: RetainedContentProps) {
  const visible = useContentVisible() && active;
  const [visited, setVisited] = useState(false);
  useEffect(() => {
    if (visible) setVisited(true);
  }, [visible]);
  return (
    <div {...props} hidden={!active}>
      <ContentVisibilityContext value={visible}>
        {(!defer || visible || visited) && children}
      </ContentVisibilityContext>
    </div>
  );
}
