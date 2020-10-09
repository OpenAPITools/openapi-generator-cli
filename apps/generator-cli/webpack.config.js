const { name, version, ...packageConfig } = require('../../package.json');
const GeneratePackageJsonPlugin = require('generate-package-json-webpack-plugin');
const { BannerPlugin } = require('webpack');
const { omit } = require('lodash');

module.exports = (config) => {
  const basePackageValues = {
    ...omit(packageConfig, ['scripts', 'dependencies', 'devDependencies']),
    version,
    name: `@${name}/openapi-generator-cli`,
    description: 'A npm package wrapper for OpenAPI Generator (https://github.com/OpenAPITools/openapi-generator), generates which API client libraries (SDK generation), server stubs, documentation and configuration automatically given an OpenAPI Spec (v2, v3)',
    bin: {
      'openapi-generator-cli': './main.js'
    },
    files: [
      'config.schema.json',
      'README.md',
      'main.js'
    ]
  };

  config.plugins.push(
    new BannerPlugin({ banner: '#!/usr/bin/env node', raw: true }),
    new GeneratePackageJsonPlugin(basePackageValues, {
      useInstalledVersions: true,
      additionalDependencies: {
        'reflect-metadata': '0.1.13'
      }
    })
  );

  return config;
};
