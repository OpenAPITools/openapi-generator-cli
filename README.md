# @harmowatch/openapi-generator-cli

This project checks the [maven repository](https://mvnrepository.com/artifact/org.openapitools/openapi-generator-cli) 
once a day for a new version and automatically makes it available as an npm package.

## Installation

#### latest version

```sh
npm install @harmowatch/openapi-generator-cli -D
```

#### specific version

```sh
npm install @harmowatch/openapi-generator-cli@cli-3.0.0 -D
```

or

```sh
npm install @harmowatch/openapi-generator-cli@cli-3.1.1 -D
```

## Usage

```json
{
  "name": "your-cool-package",
  "version": "0.0.0",
  "scripts": {
    "openapi-generator:generate": "openapi-generator generate -i docs/openapi.yaml -g typescript-angular -o generated-sources/openapi --additional-properties=\"ngVersion=6.1.7\"",
  }
}
```

Further information about possible arguments you will find in the 
[official openapi-generator docs](https://github.com/OpenAPITools/openapi-generator#3---usage).