/** Text-preserving numeric steps, including integers beyond JavaScript's safe range. */
export function stepNumber(
  text: string,
  step: number | "integer",
  direction: number,
  fine: boolean,
  coarse: boolean,
): string | null {
  if (step === "integer") {
    if (!/^[+-]?\d+$/.test(text.trim())) {
      return null;
    }

    return String(BigInt(text.trim()) + BigInt(direction * (coarse ? 10 : 1)));
  }

  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) {
    return null;
  }

  const increment = step * (coarse ? 10 : fine ? 0.1 : 1);
  const next = Number((value + direction * increment).toPrecision(12));

  return Number.isFinite(next) ? String(next) : null;
}
