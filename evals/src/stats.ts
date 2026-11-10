export function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample variance (n - 1). Zero for fewer than two values. */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
    (values.length - 1)
  );
}

export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
