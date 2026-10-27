/**
 * Transformer de Jest para paquetes de node_modules publicados solo como ESM
 * (NestJS 12: @nestjs/common, @nestjs/core, @nestjs/testing, @nestjs/typeorm...).
 *
 * Jest ejecuta las pruebas en modo CommonJS, por lo que esos archivos `.js` con
 * `import`/`export` deben convertirse a CommonJS antes de cargarse. Se usa
 * `typescript.transpileModule` (ya es dependencia del proyecto) y se reemplazan
 * los usos de `import.meta`, que no existen en CommonJS.
 */
const crypto = require('node:crypto');
const ts = require('typescript');

const TRANSFORMER_VERSION = '1';

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2023,
  allowJs: true,
  esModuleInterop: true,
  inlineSourceMap: true,
  inlineSources: true,
};

function rewriteImportMeta(source) {
  return (
    source
      // `const require = createRequire(import.meta.url)` choca con el `require`
      // que Jest inyecta en cada módulo CommonJS; se usa directamente el de Jest.
      .replace(
        /^[ \t]*const require\s*=\s*createRequire\(\s*import\.meta\.url\s*\);?[ \t]*$/gm,
        '',
      )
      .replace(
        /\bimport\.meta\.url\b/g,
        "require('node:url').pathToFileURL(__filename).href",
      )
      .replace(/\bimport\.meta\.dirname\b/g, '__dirname')
      .replace(/\bimport\.meta\.filename\b/g, '__filename')
  );
}

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(rewriteImportMeta(sourceText), {
      fileName: sourcePath,
      compilerOptions,
      reportDiagnostics: false,
    });
    return { code: outputText };
  },

  getCacheKey(sourceText, sourcePath) {
    return crypto
      .createHash('sha256')
      .update(TRANSFORMER_VERSION)
      .update('\0')
      .update(ts.version)
      .update('\0')
      .update(sourcePath)
      .update('\0')
      .update(sourceText)
      .digest('hex');
  },
};
