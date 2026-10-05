import { FunnelIcon } from "@phosphor-icons/react";
import { useState } from "react";

import type { GalleryEntry } from "./galleryEntry";
import { TogglePill } from "./TogglePill";

function Pill({ label, count }: { label: string; count?: number }) {
  const [active, setActive] = useState(false);

  return (
    <TogglePill label={label} count={count} active={active} onClick={() => setActive(!active)} />
  );
}

const entry: GalleryEntry = {
  name: "TogglePill",
  family: "buttons",
  cases: [
    {
      name: "Idle and active",
      render: () => (
        <>
          <TogglePill label="Idle" active={false} />
          <TogglePill label="Active" active />
          <TogglePill label="Filtered" active icon={<FunnelIcon weight="bold" />} count={12} />
        </>
      ),
    },
    {
      name: "Toggling",
      render: () => (
        <>
          <Pill label="Champions" count={8} />
          <Pill label="Maps" />
        </>
      ),
    },
    { name: "Disabled", render: () => <TogglePill label="Disabled" active={false} disabled /> },
  ],
};

export default entry;
