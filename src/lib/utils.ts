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
// Formats a number to n characters using scale suffixes (k, M, G, etc).
// It attempts to use as much precision as possible to fill n characters.
export function trunc_n(val: string | number, n = 3): string {
  const raw = String(val);
  // If the raw string fits, just return it (unless it's a number we want to maybe format better? 
  // checking validation logic: 1.00 is better than 1 if n=4? 
  // The user requirement said: given 1, trunc_4 returns 1.00. 
  // So even if "1" fits in 4, we want to pad/format it.
  
  // However, if it's not a valid finite number, just slice it.
  if (typeof val !== "number" || !Number.isFinite(val)) {
     if (raw.length <= n) return raw;
     return raw.slice(0, n);
  }

  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);

  // Pick engineering exponent multiple of 3
  // (so we can use SI prefixes)
  let exp3 = 0;
  if (abs > 0) {
    exp3 = Math.floor(Math.log10(abs) / 3) * 3;
    exp3 = clamp(exp3, -12, 12);
  }

  // However, if the number is small (exp3 < 0), we might prefer to show it as 0.xxx 
  // instead of using 'm' or 'u' prefixes if n allows?
  // User didn't specify small number behavior deeply, but existing code used prefixes.
  // We'll stick to prefixes for consistency with existing behavior, 
  // unless exp3 is 0 (no prefix).

  const prefix = SI_PREFIX[exp3] ?? "";
  const scaled = abs / Math.pow(10, exp3);
  
  // We construct the string: [sign][digits][prefix]
  // We want total length <= n.
  // length_used_so_far = sign.length + prefix.length
  // available_for_digits = n - length_used_so_far
  
  // special case: if prefix is empty, it takes 0 chars.
  const prefixLen = prefix.length; 
  const widthAvailable = n - sign.length - prefixLen;

  if (widthAvailable <= 0) {
      // Not enough room for even 1 digit? 
      // Just return sign + prefix cropped? Or just return something indicating overflow?
      // existing logic returned (sign+prefix).slice(0,n)
      return (sign + prefix).padEnd(1, '?').slice(0, n);
  }

  // We want to format 'scaled' into 'widthAvailable' characters.
  // 'scaled' >= 1 and < 1000 generally (exception: if val=0, scaled=0, exp3=-12 -> wait, log10(0) is -Infinity. 
  // logic above: if abs > 0. if abs=0, exp3=0. scaled=0.
  
  // How many digits does the integer part take?
  const intPart = Math.floor(scaled);
  const intStr = String(intPart);
  const intLen = intStr.length;

  // Do we have room for the integer part?
  if (intLen > widthAvailable) {
      // If integer part is too big, it means n is too small for this number with this prefix.
      // e.g. 12345, n=4. exp3=3 (k). scaled=12.345. intStr="12". widthAvailable=4-0-1=3. 
      // Wait, 12 fits in 3.
      // Case where it doesn't fit: 12345, n=2. exp3=3(k). scaled=12. intStr="12". prefix="k". width=2-1=1. 
      // 12 needs 2 chars. available 1.
      // We assume we can't do better than showing just top digits? 
      // Or maybe we should just return what we can?
      // Existing logic used toPrecision(1) fallback
      
      // Let's try to do round? 
      const rounded = Math.round(scaled);
      const s = String(rounded);
      if (s.length <= widthAvailable) {
          return sign + s + prefix;
      }
      // If still too big, slice?
      return (sign + s).slice(0, widthAvailable) + prefix; 
  }

  // We have enough room for integer part.
  // Check space for decimal point and decimals.
  // Need 1 char for '.' if we have decimals.
  const decimalsSpace = widthAvailable - intLen - 1; // -1 for dot

  let formattedDigits: string;
  
  if (decimalsSpace > 0) {
      // We have room for 'decimalsSpace' fractional digits.
      // Check if adding that many decimals actually results in meaningful value?
      // User wants 1 -> 1.00 (n=4). 
      // So yes, PAD with zeros!
      formattedDigits = scaled.toFixed(decimalsSpace);
      
      // Edge case: rounding might bump up integer length? 
      // e.g. 9.99, available=3. int="9" (len 1). decimalsSpace=3-1-1=1.
      // toFixed(1) -> "10.0". Length 4. Too big!
      if (formattedDigits.length > widthAvailable) {
          // If rounding made it overflow, reduce decimal precision?
          // "10.0" -> try 0 decimals -> "10". Length 2. Fits?
          // If generated string > widthAvailable, back off.
          // Since it likely only grew by 1 char (9->10), removing .x should fix it.
          // Or just standard toPrecision approach?
          // Let's trying falling back to 0 decimals (integer)
         formattedDigits = scaled.toFixed(0);
      }
  } else if (decimalsSpace === 0) {
      // exactly room for dot but no digits? "12."
      // usually we don't want trailing dot.
      // So just integer.
      formattedDigits = scaled.toFixed(0);
  } else {
      // No room for dot.
      formattedDigits = scaled.toFixed(0);
  }

  // Final sanity check on length
  let out = sign + formattedDigits + prefix;
  
  // If still too long (rare rounding edge cases?), trim
  if (out.length > n) {
      // try removing decimals if present
      if (out.includes('.')) {
          // remove fractional part
           const [i, f] = formattedDigits.split('.');
           out = sign + i + prefix;
      }
      
      // if still too long
      if (out.length > n) {
          out = out.slice(0, n);
      }
  }

  return out;
}
