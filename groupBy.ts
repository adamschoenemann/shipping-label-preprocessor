export function groupBy<T extends { [k: string]: any }, K extends keyof T>(
  array: T[],
  key: K,
  ...args: (undefined extends T[K] ? [NonNullable<T[K]>] : [undefined?])
): Record<NonNullable<T[K]>, T[]> {
  return array.reduce((objectsByKeyValue, obj) => {
    let value = obj[key];
    if (value === undefined) {
      value = args[0] as unknown as any;
    }
    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
    return objectsByKeyValue;
  }, {} as Record<T[K], T[]>);
}
