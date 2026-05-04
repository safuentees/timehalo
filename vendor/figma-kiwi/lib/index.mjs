// Vendored from allan-simon/figma-kiwi-protocol (MIT). See AUDIT.md.
// Trimmed: only the read-path subset is vendored; svg.mjs / session.mjs /
// clone.mjs / builder.mjs are intentionally excluded.

export {
  isFigWireFrame,
  extractCompressedSchema,
  isZstdCompressed,
} from './kiwi.mjs';

export {
  decodePage,
  nodeId,
  mergePages,
  buildTree,
  countByType,
  serializeScenegraph,
} from './scenegraph.mjs';

export {
  rgbaToCSS,
  extractCSSFromKiwi,
  extractCSSFromAPI,
} from './css.mjs';
