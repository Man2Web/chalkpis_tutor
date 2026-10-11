// Images bundled with the app resolve to an asset id the <Image> component understands.
declare module '*.png' {
  const asset: number;
  export default asset;
}

/** Stylesheets (the Tailwind / Uniwind entry) are imported only for their side effect. */
declare module '*.css';
