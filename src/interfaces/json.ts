import { z } from 'zod';

type JSONPrimitive = string | number | boolean | null;
interface IJSONObject {
  [key: string]: JSONValue;
}
type JSONArray = JSONValue[];
export type JSONValue = JSONPrimitive | IJSONObject | JSONArray;
const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)])
);
