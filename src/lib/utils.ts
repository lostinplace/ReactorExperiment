const SI_PREFIX: Record<number, string> = {
  [-12]: "p",
  [-9]: "n",
  [-6]: "µ",
  [-3]: "m",
  [0]: "",
  [3]: "k",
  [6]: "M",
  [9]: "G",
  [12]: "T",
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Formats a number to <=3 chars using SI prefixes when helpful.
// Strings just truncate.
export function trunc_n(val: string | number, n = 3): string {
  const raw = String(val);
  if (raw.length <= n) return raw;

  if (typeof val !== "number" || !Number.isFinite(val)) {
    return raw.slice(0, n);
  }

  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);

  // If sign alone uses space, reduce available width.
  const width = n - sign.length;
  if (width <= 0) return sign.slice(0, n);

  // Pick engineering exponent multiple of 3
  // (so we can use SI prefixes)
  let exp3 = 0;
  if (abs > 0) {
    exp3 = Math.floor(Math.log10(abs) / 3) * 3;
    exp3 = clamp(exp3, -12, 12);
  }

  const prefix = SI_PREFIX[exp3] ?? "";
  const scaled = abs / Math.pow(10, exp3);

  // We need to fit: [sign][digits][prefix] within n chars.
  // Give prefix 1 char (or 0 if exp3==0), use remaining for digits.
  const prefixLen = prefix ? 1 : 0;
  const digitsBudget = width - prefixLen;
  if (digitsBudget <= 0) return (sign + prefix).slice(0, n);

  // Choose the most-informative representation within digitsBudget:
  // Try: integer, then 1 decimal, then fallback.
  const tryFormats: string[] = [];
  // integer
  tryFormats.push(String(Math.floor(scaled)));
  // one decimal (e.g. 9.8)
  tryFormats.push(scaled.toFixed(1));
  // two significant digits-ish fallback
  tryFormats.push(scaled.toPrecision(Math.min(2, Math.max(1, digitsBudget))));

  let best = tryFormats
    .map(s => s.replace(/\.0$/, "")) // drop trailing .0
    .find(s => s.length <= digitsBudget);

  if (!best) {
    best = String(scaled).slice(0, digitsBudget);
  }

  const out = sign + best + prefix;
  return out.length <= n ? out : out.slice(0, n);
}
