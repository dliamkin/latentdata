// the alias resolves to whatever SNAPSHOT_PATH says; it is unknown on purpose so the only way
// to get typed data out is through the zod parse in src/data/snapshot.ts
declare module '@snapshot' {
  const value: unknown;
  export default value;
}
