import type { WorkshopAuthor } from "@/lib/tauri";

export function filterEmptyAuthors(authors: WorkshopAuthor[]): WorkshopAuthor[] {
  return authors.filter((a) => a.name.trim());
}

export function updateAuthorAt(
  authors: WorkshopAuthor[],
  index: number,
  field: "name" | "role",
  value: string,
): WorkshopAuthor[] {
  const updated = [...authors];
  updated[index] = { ...updated[index], [field]: value };
  return updated;
}

export function removeAuthorAt(authors: WorkshopAuthor[], index: number): WorkshopAuthor[] {
  return authors.filter((_, i) => i !== index);
}

export function appendAuthor(
  authors: WorkshopAuthor[],
  initial?: Partial<WorkshopAuthor>,
): WorkshopAuthor[] {
  return [...authors, { name: initial?.name ?? "", role: initial?.role ?? "" }];
}
