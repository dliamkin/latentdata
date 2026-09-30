// esbuild bundles these with the text loader; vitest gets the same through a tiny plugin
declare module '*.md' {
  const text: string;
  export default text;
}
