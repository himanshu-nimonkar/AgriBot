/** Strict OpenAPI payload validator (Vapi answers HTTP 400 "property X should not exist" for unknown fields). */
export class Validator {
  schemas: Record<string, any>;
  constructor(spec: any) { this.schemas = spec.components.schemas; }
  validate(name: string, value: unknown): string[] { return this.check({ $ref: `#/components/schemas/${name}` }, value, name); }
  private resolve(s: any): any { while (s.$ref) s = this.schemas[s.$ref.split("/").pop()!]; return s; }
  private check(schema: any, value: any, path: string): string[] {
    schema = this.resolve(schema);
    if (schema.allOf && Object.keys(schema).length <= 3) return schema.allOf.flatMap((s: any) => this.check(s, value, path));
    for (const k of ["oneOf", "anyOf"]) {
      if (schema[k]) {
        let best: string[] | null = null;
        for (const alt of schema[k]) { const e = this.check(alt, value, path); if (!e.length) return []; if (!best || e.length < best.length) best = e; }
        return best ?? [];
      }
    }
    const t = schema.type;
    if (schema.enum) {
      const items = Array.isArray(value) ? value : [value];
      const bad = items.filter((v) => !schema.enum.includes(v));
      if (bad.length) return [`${path}: ${JSON.stringify(bad)} not in enum`];
      if (typeof value !== "object" || t === "array") return [];
    }
    const errs: string[] = [];
    if (t === "object" || schema.properties) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path}: expected object`];
      const props = schema.properties ?? {};
      for (const [k, v] of Object.entries(value)) {
        if (Object.keys(props).length && !(k in props)) errs.push(`${path}.${k}: property should not exist`);
        else if (k in props) errs.push(...this.check(props[k], v, `${path}.${k}`));
      }
      for (const r of schema.required ?? []) if (!(r in value)) errs.push(`${path}: missing required '${r}'`);
    } else if (t === "array") {
      if (!Array.isArray(value)) return [`${path}: expected array`];
      value.forEach((it, i) => errs.push(...this.check(schema.items ?? {}, it, `${path}[${i}]`)));
    } else if (t === "string" && typeof value !== "string") errs.push(`${path}: expected string`);
    else if ((t === "number" || t === "integer")) {
      if (typeof value !== "number") errs.push(`${path}: expected number`);
      else {
        if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: ${value} < min ${schema.minimum}`);
        if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: ${value} > max ${schema.maximum}`);
      }
    } else if (t === "boolean" && typeof value !== "boolean") errs.push(`${path}: expected boolean`);
    return errs;
  }
}

export async function loadVapiSpec(): Promise<any | null> {
  try {
    const r = await fetch("https://api.vapi.ai/api-json", { headers: { "User-Agent": "agribot-tests/1.0" }, signal: AbortSignal.timeout(30_000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
