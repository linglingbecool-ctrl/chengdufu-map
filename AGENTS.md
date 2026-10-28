# Homepage release assets

The homepage uses `home.bundle.js` and `home.bundle.css`, generated from the existing source files in the order recorded in `scripts/build-home-assets.cjs`. Edit the source files, not the bundles. Other pages still use the individual source files.

After changing any bundled source, run `node scripts/build-home-assets.cjs`. It regenerates the bundles and updates their content hashes in `index.html`.

Before deployment, run `node scripts/build-home-assets.cjs --check` and `node --check home.bundle.js`. Include the generated bundles and updated HTML in the same release. Run the browser checks appropriate to the change.
