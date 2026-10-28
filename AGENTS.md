# Homepage release assets

The homepage uses `home.bundle.js` and `home.bundle.css`, generated from the existing source files in the order recorded in `scripts/build-home-assets.cjs`. Edit the source files, not the bundles. Other pages still use the individual source files.

After changing any bundled source, run `node scripts/build-home-assets.cjs`. It regenerates the bundles and updates their content hashes in `index.html`.

Before deployment, run `node scripts/build-home-assets.cjs --check` and `node --check home.bundle.js`. Include the generated bundles and updated HTML in the same release. Run the browser checks appropriate to the change.

## Static resource mirror

The public homepage loads its bundles, map images, font and point data from the existing CloudBase hosting environment `chengdufu-map-d4g459au02132689e`. The mirror base URL is in `index.html`; `script.js` resolves point data and preview images beside its own loaded script. Original historical image links and backend functions retain their existing paths.

Before publishing HTML/source changes to GitHub, stage the latest public assets with `node scripts/stage-home-assets.cjs /absolute/staging-directory`, then upload that directory to the CloudBase path referenced in `index.html` using `tcb hosting deploy`. Verify uploaded bytes and browser loading from `https://tuhuichengdu.cn` (font/JSON CORS must work). Never overwrite the separate `__auth` or `cloud-admin` paths. On a future mirror-path change, update the base replacement in isolated loading tests too; those tests intentionally load the same assets locally.
