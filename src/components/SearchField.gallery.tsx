import { useState } from "react";

import type { GalleryEntry } from "./galleryEntry";
import { SearchField } from "./SearchField";

function Plain({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);

  return (
    <div className="flex w-72">
      <SearchField value={value} onChange={setValue} label="Find a mod" clearLabel="Clear" />
    </div>
  );
}

function WithRegex() {
  const [value, setValue] = useState("^fiora");
  const [regex, setRegex] = useState(true);

  return (
    <div className="flex w-72">
      <SearchField
        value={value}
        onChange={setValue}
        label="Find a mod"
        clearLabel="Clear"
        regex={regex}
        onRegexChange={setRegex}
        regexLabel="Find by pattern"
        regexToggleLabel="Match as a regular expression"
      />
    </div>
  );
}

const entry: GalleryEntry = {
  name: "SearchField",
  family: "fields",
  cases: [
    { name: "Empty", render: () => <Plain initial="" /> },
    { name: "With a pattern", render: () => <Plain initial="fiora" /> },
    { name: "Regex toggle", render: () => <WithRegex /> },
  ],
};

export default entry;
