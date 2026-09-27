const RATES_TO_USD = {
  usd: 1.0,
  eur: 1.08,
  gbp: 1.28,
  jpy: 0.0065,
  cad: 0.74,
  aud: 0.65,
  chf: 1.13,
  cny: 0.14,
  inr: 0.012,
  mxn: 0.051,
  brl: 0.18,
  krw: 0.00072
};

const LENGTH_TO_METERS = {
  m: 1,
  meter: 1,
  meters: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254
};

const WEIGHT_TO_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  ton: 907185,
  tons: 907185
};

const DATA_TO_BYTES = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1024,
  kilobyte: 1024,
  kilobytes: 1024,
  mb: 1024 * 1024,
  megabyte: 1024 * 1024,
  megabytes: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  gigabyte: 1024 * 1024 * 1024,
  gigabytes: 1024 * 1024 * 1024,
  tb: 1024 * 1024 * 1024 * 1024,
  terabyte: 1024 * 1024 * 1024 * 1024,
  terabytes: 1024 * 1024 * 1024 * 1024
};

const TIME_TO_SECONDS = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86400,
  day: 86400,
  days: 86400,
  wk: 604800,
  week: 604800,
  weeks: 604800
};

function formatCleanNumber(num) {
  if (Math.abs(num) < 0.0001 && num !== 0) {
    return num.toExponential(4);
  }
  return Number(parseFloat(num.toPrecision(7))).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function tryConvert(query) {
  const q = query.trim().toLowerCase();
  const match = q.match(/^([\d\.\,]+)\s*([a-zA-Z]+|\$|€|£|¥)\s+(?:to|in)\s+([a-zA-Z]+|\$|€|£|¥)$/i);
  if (!match) return null;

  const rawVal = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(rawVal)) return null;

  let fromUnit = match[2].toLowerCase();
  let toUnit = match[3].toLowerCase();

  const symbolMap = { "$": "usd", "€": "eur", "£": "gbp", "¥": "jpy" };
  if (symbolMap[fromUnit]) fromUnit = symbolMap[fromUnit];
  if (symbolMap[toUnit]) toUnit = symbolMap[toUnit];

  if ((fromUnit === "c" || fromUnit === "celsius") && (toUnit === "f" || toUnit === "fahrenheit")) {
    const res = (rawVal * 9) / 5 + 32;
    return `${formatCleanNumber(res)} °F`;
  }
  if ((fromUnit === "f" || fromUnit === "fahrenheit") && (toUnit === "c" || toUnit === "celsius")) {
    const res = ((rawVal - 32) * 5) / 9;
    return `${formatCleanNumber(res)} °C`;
  }
  if ((fromUnit === "c" || fromUnit === "celsius") && (toUnit === "k" || toUnit === "kelvin")) {
    return `${formatCleanNumber(rawVal + 273.15)} K`;
  }
  if ((fromUnit === "k" || fromUnit === "kelvin") && (toUnit === "c" || toUnit === "celsius")) {
    return `${formatCleanNumber(rawVal - 273.15)} °C`;
  }

  if (RATES_TO_USD[fromUnit] && RATES_TO_USD[toUnit]) {
    const usd = rawVal * RATES_TO_USD[fromUnit];
    const converted = usd / RATES_TO_USD[toUnit];
    return `${formatCleanNumber(converted)} ${toUnit.toUpperCase()}`;
  }

  if (LENGTH_TO_METERS[fromUnit] && LENGTH_TO_METERS[toUnit]) {
    const meters = rawVal * LENGTH_TO_METERS[fromUnit];
    const converted = meters / LENGTH_TO_METERS[toUnit];
    return `${formatCleanNumber(converted)} ${toUnit}`;
  }

  if (WEIGHT_TO_GRAMS[fromUnit] && WEIGHT_TO_GRAMS[toUnit]) {
    const grams = rawVal * WEIGHT_TO_GRAMS[fromUnit];
    const converted = grams / WEIGHT_TO_GRAMS[toUnit];
    return `${formatCleanNumber(converted)} ${toUnit}`;
  }

  if (DATA_TO_BYTES[fromUnit] && DATA_TO_BYTES[toUnit]) {
    const bytes = rawVal * DATA_TO_BYTES[fromUnit];
    const converted = bytes / DATA_TO_BYTES[toUnit];
    return `${formatCleanNumber(converted)} ${toUnit.toUpperCase()}`;
  }

  if (TIME_TO_SECONDS[fromUnit] && TIME_TO_SECONDS[toUnit]) {
    const seconds = rawVal * TIME_TO_SECONDS[fromUnit];
    const converted = seconds / TIME_TO_SECONDS[toUnit];
    return `${formatCleanNumber(converted)} ${toUnit}`;
  }

  return null;
}
