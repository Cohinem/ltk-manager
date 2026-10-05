import { useState } from "react";

import type { GalleryEntry } from "./galleryEntry";
import { Table } from "./Table";

const ROWS = [
  { name: "Fiora VFX", author: "Crauzer", size: "12.4 MB" },
  { name: "Classic Rift", author: "LeagueToolkit", size: "310 MB" },
  { name: "Poro HUD", author: "Anonymous", size: "1.1 MB" },
];

function Demo() {
  const [direction, setDirection] = useState<"asc" | "desc" | false>("asc");
  const rows = direction === "desc" ? [...ROWS].reverse() : ROWS;

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-lg border border-surface-700">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>
              <Table.SortButton
                direction={direction}
                onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
              >
                Name
              </Table.SortButton>
            </Table.Head>
            <Table.Head>
              <Table.SortButton direction={false}>Author</Table.SortButton>
            </Table.Head>
            <Table.Head>Size</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.name}>
              <Table.Cell className="select-text">{row.name}</Table.Cell>
              <Table.Cell className="select-text">{row.author}</Table.Cell>
              <Table.Cell className="tabular-nums">{row.size}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

const entry: GalleryEntry = {
  name: "Table",
  family: "data",
  cases: [{ name: "Sortable columns", render: () => <Demo /> }],
};

export default entry;
