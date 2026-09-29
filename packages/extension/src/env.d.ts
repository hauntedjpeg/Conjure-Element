/** True only in the build produced by `pnpm build:e2e`. */
declare const __CONJURE_E2E__: boolean;

declare module "*.css?inline" {
  const css: string;
  export default css;
}
