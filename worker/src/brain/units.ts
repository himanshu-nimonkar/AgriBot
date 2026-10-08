// Callers are US farmers: Fahrenheit / mph / inches.
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const kmhToMph = (v: number) => v * 0.621371;
export const mmToIn = (v: number) => v / 25.4;
export const pct = (v: number | null | undefined) =>
  v == null ? "n/a" : `${(v <= 1 ? v * 100 : v).toFixed(0)}%`;

export function nowPacific(d = new Date()) {
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", ...o }).format(d);
  return {
    date: fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    time: fmt({ hour: "numeric", minute: "2-digit" }),
    hour: Number(fmt({ hour: "numeric", hour12: false }).replace(/\D/g, "")) % 24,
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d), // YYYY-MM-DD
  };
}
