# @openapitools/openapi-generator-cli

[![Join the Slack chat room](https://img.shields.io/badge/Slack-Join%20the%20chat%20room-orange)](https://join.slack.com/t/openapi-generator/shared_invite/enQtNzAyNDMyOTU0OTE1LTY5ZDBiNDI5NzI5ZjQ1Y2E5OWVjMjZkYzY1ZGM2MWQ4YWFjMzcyNDY5MGI4NjQxNDBiMTlmZTc5NjY2ZTQ5MGM)

[![Renovate enabled](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovateapp.com/)
[![Build Status](https://travis-ci.org/openapitools/openapi-generator-cli.svg?branch=master)](https://travis-ci.org/OpenAPITools/openapi-generator-cli)
[![HitCount](http://hits.dwyl.io/openapitools/openapi-generator-cli.svg)](http://hits.dwyl.com/openapitools/openapi-generator-cli)

OpenAPI Generator allows generation of API client libraries (SDK generation), server stubs, documentation and 
configuration automatically given an OpenAPI Spec (both 2.0 and 3.0 are supported). Please see
[OpenAPITools/openapi-generator](https://github.com/OpenAPITools/openapi-generator)

---

This project checks the [maven repository](https://mvnrepository.com/artifact/org.openapitools/openapi-generator-cli) 
once a day for a new version and will publish this new version automatically as an npm package.

**Thanks [openapitools.org](https://openapitools.org) for this awesome CLI!**

## Installation

There are several ways to install the package.

#### Global Mode

In global mode (ie, with -g or --global appended to the command), it installs the package as a global package. This 
means that you'll get the `openapi-generator` command available on your command line interface (CLI) as well.

```sh
# install the latest version of "openapi-generator-cli"
npm install @openapitools/openapi-generator-cli -g

# install a specific version of "openapi-generator-cli"
npm install @openapitools/openapi-generator-cli@cli-3.0.0 -g
```

After the installation has finished you can type for example:

```sh
# this shall print the correct version number
openapi-generator version
```

#### Package Mode

It is recommended to install the package as development dependency, because normally you only need this dependency
during the development process. To do that you can type the following:

```sh
# install the latest version of "openapi-generator-cli"
npm install @openapitools/openapi-generator-cli -D

# install a specific version of "openapi-generator-cli"
npm install @openapitools/openapi-generator-cli@cli-3.0.0 -D
```

After the installation has finished you can add a script like this:

```json
{
  "name": "my-cool-package",
  "version": "0.0.0",
  "scripts": {
    "my-awesome-script-name": "openapi-generator generate -i docs/openapi.yaml -g typescript-angular -o generated-sources/openapi --additional-properties=\"ngVersion=6.1.7\"",
  }
}
```

## Usage Example

Mac/Linux:
```
openapi-generator generate -g ruby -i https://raw.githubusercontent.com/OpenAPITools/openapi-generator/master/modules/openapi-generator/src/test/resources/3_0/petstore.yaml -o /var/tmp/ruby-client
```

Windows:
```
openapi-generator generate -g ruby -i https://raw.githubusercontent.com/OpenAPITools/openapi-generator/master/modules/openapi-generator/src/test/resources/3_0/petstore.yaml -o C:\temp\ruby-client
```


## Further Documentation

Please refer to the [official openapi-generator docs](https://github.com/OpenAPITools/openapi-generator#3---usage) for
more information about the possible arguments and a detailed usage manual of the command line interface.

## You like the package?

Please leave a star.
