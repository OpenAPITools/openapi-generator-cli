import Ajv from 'ajv';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const configSchema = require('./config.schema.json');

// strict mode is disabled because the `generator-cli.repository` block uses
// non-standard nesting (queryUrl/downloadUrl are not declared as properties),
// which ajv strict mode reports as unknown keywords
const validate = new Ajv({ strict: false }).compile(configSchema);

const baseConfig = {
  $schema: './node_modules/@openapitools/openapi-generator-cli/config.schema.json',
  spaces: 2,
  'generator-cli': {
    version: '7.12.0',
    generators: {
      kotlin: {
        generatorName: 'kotlin',
        inputSpec: './openapi/petstore.yaml',
        output: './generated/kotlin',
      },
    },
  },
};

function configWithIgnoreList(ignoreList: unknown) {
  return {
    ...baseConfig,
    'generator-cli': {
      ...baseConfig['generator-cli'],
      generators: {
        kotlin: {
          ...baseConfig['generator-cli'].generators.kotlin,
          openapiGeneratorIgnoreList: ignoreList,
        },
      },
    },
  };
}

describe('config.schema', () => {
  it('is a valid JSON schema', () => {
    expect(new Ajv({ strict: false }).validateSchema(configSchema)).toBe(true);
  });

  it('validates a config without openapiGeneratorIgnoreList', () => {
    expect(validate(baseConfig)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  describe('openapiGeneratorIgnoreList', () => {
    it.each([[['README.md', 'pom.xml', 'docs/*.md']], [['single']], [[]]])(
      'accepts the array of strings %j',
      (ignoreList) => {
        expect(validate(configWithIgnoreList(ignoreList))).toBe(true);
        expect(validate.errors).toBeNull();
      }
    );

    it('accepts a comma separated list', () => {
      expect(validate(configWithIgnoreList('README.md,pom.xml'))).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it.each([[42], [true], [null], [[42]], [[{}]], [{}]])(
      'rejects the invalid value %j',
      (invalidValue) => {
        expect(validate(configWithIgnoreList(invalidValue))).toBe(false);
      }
    );
  });
});
