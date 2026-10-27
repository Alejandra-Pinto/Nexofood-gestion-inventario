import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

// Paquetes publicados únicamente como ES Modules que deben transpilarse a CJS.
const ESM_ONLY_PACKAGES = '@nestjs[\\\\/]';
const ESM_NODE_MODULES_JS = `^.+[\\\\/]node_modules[\\\\/]${ESM_ONLY_PACKAGES}.+\\.js$`;

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // NestJS 12 se publica solo como ESM: sus archivos .js de node_modules se
    // convierten a CommonJS para que Jest (modo CJS) pueda cargarlos.
    // Debe ir antes que la regla general de ts-jest (gana la primera coincidencia).
    [ESM_NODE_MODULES_JS]: '<rootDir>/test/jest-esm-transformer.js',
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Por defecto Jest no transforma nada dentro de node_modules; se exceptúan
  // los paquetes ESM-only. Se aceptan separadores / y \ (Windows).
  transformIgnorePatterns: [
    `[\\\\/]node_modules[\\\\/](?!${ESM_ONLY_PACKAGES})`,
  ],
  // Los decoradores de class-transformer/class-validator y la inyección de
  // dependencias de Nest necesitan la API Reflect.* antes de cargar cualquier DTO.
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
