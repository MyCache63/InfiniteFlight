// Table lookup helpers. Linear interpolation, clamped at the table edges.

function locate(grid, x) {
  const n = grid.length;
  if (x <= grid[0]) return [0, 0];
  if (x >= grid[n - 1]) return [n - 2, 1];
  let i = 0;
  while (x > grid[i + 1]) i++;
  return [i, (x - grid[i]) / (grid[i + 1] - grid[i])];
}

export function lerp1(grid, vals, x) {
  const [i, t] = locate(grid, x);
  return vals[i] + (vals[i + 1] - vals[i]) * t;
}

export function lerp2(gridA, gridB, rows, a, b) {
  const [i, s] = locate(gridA, a);
  const [j, t] = locate(gridB, b);
  const r0 = rows[i], r1 = rows[i + 1];
  const v0 = r0[j] + (r0[j + 1] - r0[j]) * t;
  const v1 = r1[j] + (r1[j + 1] - r1[j]) * t;
  return v0 + (v1 - v0) * s;
}
