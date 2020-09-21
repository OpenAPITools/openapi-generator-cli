const {name, version, keywords, private} = require('../../package.json')
const webpack = require('webpack')

module.exports = (config) => {
  const basePackageValues = {
    version: version + '-beta8',
    keywords,
    private,
    name: `@${name}/openapi-generator-cli`,
    description: 'A npm package wrapper for OpenAPI Generator (https://github.com/OpenAPITools/openapi-generator), generates which API client libraries (SDK generation), server stubs, documentation and configuration automatically given an OpenAPI Spec (v2, v3)',
    main: "./main.js",
    bin: {
      "openapi-generator-cli": "./main.js"
    },
    files: [
      'main.js',
    ],
  }

  const GeneratePackageJsonPlugin = require('generate-package-json-webpack-plugin')
  const versionsPackageFilename = `${__dirname}/../../package.json`;
  config.plugins.push(
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
    }),
    new GeneratePackageJsonPlugin(basePackageValues, versionsPackageFilename, {
      useInstalledVersions: true,
      additionalDependencies: {
        'reflect-metadata': '0.1.13',
      }
    })
  )

  return config
}
