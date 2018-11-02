# @harmowatch/openapi-generator-cli

[![Join the chat at https://gitter.im/harmowatch/openapi-generator-cli](https://badges.gitter.im/harmowatch/openapi-generator-cli.svg)](https://gitter.im/harmowatch/openapi-generator-cli?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

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
npm install @harmowatch/openapi-generator-cli -g

# install a specific version of "openapi-generator-cli"
npm install @harmowatch/openapi-generator-cli@cli-3.0.0 -g
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
npm install @harmowatch/openapi-generator-cli -D

# install a specific version of "openapi-generator-cli"
npm install @harmowatch/openapi-generator-cli@cli-3.0.0 -D
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

## Further Documentation

Please refer to the [official openapi-generator docs](https://github.com/OpenAPITools/openapi-generator#3---usage) for
more information about the possible arguments and a detailed usage manual of the command line interface.

## You like the package?

Please leave a star.