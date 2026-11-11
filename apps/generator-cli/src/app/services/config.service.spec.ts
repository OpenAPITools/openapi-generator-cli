import { Test } from '@nestjs/testing';
import { Command, createCommand } from 'commander';
import * as path from 'path';
import { ConfigService } from './config.service';
import { LOGGER, COMMANDER_PROGRAM } from '../constants';

jest.mock('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = jest.mocked(require('fs-extra'));

describe('ConfigService', () => {
  let fixture: ConfigService;
  let program: Command;

  const log = jest.fn();
  const error = jest.fn();

  let originalArgv: string[];

  beforeEach(async () => {
    // the config file is resolved from process.argv, pin it to a plain cli
    // invocation so the runner's own arguments (e.g. jest's --config) are not
    // mistaken for cli options
    originalArgv = process.argv;
    process.argv = ['node', 'openapi-generator-cli'];
    // keep the host environment from leaking into the resolution: an exported
    // OPENAPI_GENERATOR_CLI_CONFIG would send every ConfigService construction
    // in this suite down the config-not-found path
    delete process.env[ConfigService.envConfigVariable];

    program = createCommand();
    jest.spyOn(program, 'helpInformation');

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: LOGGER, useValue: { log, error } },
        { provide: COMMANDER_PROGRAM, useValue: program },
      ],
    }).compile();

    fixture = moduleRef.get(ConfigService);
    fs.writeJSONSync.mockReset();
    fs.readJSONSync.mockReset();
    fs.ensureFileSync.mockReset();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe('API', () => {
    describe('get()', () => {
      describe.each([
        ['the config is undefined', undefined],
        ['the config empty', {}],
      ])('%s', (_, config) => {
        beforeEach(() => {
          fs.readJSONSync.mockReturnValue(config);
        });

        it.each([
          [
            '$schema',
            './node_modules/@openapitools/openapi-generator-cli/config.schema.json',
          ],
          ['spaces', 2],
          ['generator-cli', { version: undefined }],
        ])('the key "%s" returns %s as default', (key, expectedValue) => {
          expect(fixture.get(key)).toEqual(expectedValue);
        });

        it('can return a default value', () => {
          expect(fixture.get('unknown', 'foo')).toEqual('foo');
        });

        it('does not create or modify the config file', () => {
          fixture.get('some-path');
          expect(fs.ensureFileSync).toHaveBeenCalledTimes(0);
          expect(fs.writeJSONSync).toHaveBeenCalledTimes(0);
        });
      });

      describe('the config has values', () => {
        beforeEach(() => {
          fs.readJSONSync.mockReturnValue({
            $schema: 'foo.json',
            spaces: 4,
            'generator-cli': {
              version: '1.2.3',
            },
          });
        });

        it('does not create or modify the config file', () => {
          fixture.get('some-path');
          expect(fs.ensureFileSync).toHaveBeenCalledTimes(0);
          expect(fs.writeJSONSync).toHaveBeenCalledTimes(0);
        });

        it.each([
          ['$schema', 'foo.json'],
          ['spaces', 4],
          ['generator-cli', { version: '1.2.3' }],
          ['generator-cli.version', '1.2.3'],
        ])('"%s" returns %s as default', (key, expectedValue) => {
          expect(fixture.get(key)).toEqual(expectedValue);
          expect(fs.readJSONSync).toHaveBeenNthCalledWith(
            1,
            fixture.configFile,
            { throws: false, encoding: 'utf8' }
          );
        });
      });
    });

    describe('the config has values having placeholders', () => {
      let originalEnv: NodeJS.ProcessEnv;

      beforeEach(() => {
        originalEnv = { ...process.env };

        fs.readJSONSync.mockReturnValue({
          $schema: 'foo.json',
          spaces: 4,
          'generator-cli': {
            version: '1.2.3',
            repository: {
              queryUrl: 'https://${env.__unit_test_username}:${env.__unit_test_password}@server/api',
              downloadUrl: 'https://${env.__unit_test_non_matching}@server/api'
            }
          },
        });
        process.env['__unit_test_username'] = 'myusername';
        process.env['__unit_test_password'] = 'mypassword';
      });

      afterEach(() => {
        process.env = { ...originalEnv };
      });

      it('verify placeholder replaced with env vars', () => {
        const value = fixture.get('generator-cli.repository.queryUrl');
        expect(value).toEqual('https://myusername:mypassword@server/api');
      });

      it('verify placeholders not matching env vars are not replaced', () => {
        const value = fixture.get('generator-cli.repository.downloadUrl');
        expect(value).toEqual('https://${env.__unit_test_non_matching}@server/api');
        expect(error).toHaveBeenCalledWith('Environment variable for placeholder \'__unit_test_non_matching\' not found.');
      });
    });

    describe('has()', () => {
      beforeEach(() => {
        fs.readJSONSync.mockReturnValue({
          propFalsy: false,
          propUndefined: undefined,
          propNull: null,
        });
      });

      it('returns true, if the prop is set', () => {
        expect(fixture.has('propFalsy')).toBeTruthy();
        expect(fixture.has('propUndefined')).toBeTruthy();
        expect(fixture.has('propNull')).toBeTruthy();
      });

      it('returns false, if the value is set', () => {
        expect(fixture.has('foo')).toBeFalsy();
      });
    });

    describe('set()', () => {
      beforeEach(() => {
        fs.readJSONSync.mockReturnValue({
          $schema: 'foo.json',
          spaces: 4,
          'generator-cli': {
            version: '1.2.3',
          },
        });

        fixture.set('generator-cli.version', '4.5.6');
      });

      it('ensures the config file', () => {
        expect(fs.ensureFileSync).toHaveBeenNthCalledWith(
          1,
          fixture.configFile
        );
      });

      it('saves the correct value', () => {
        expect(fs.writeJSONSync).toHaveBeenNthCalledWith(
          1,
          fixture.configFile,
          {
            $schema: 'foo.json',
            spaces: 4,
            'generator-cli': {
              version: '4.5.6',
            },
          },
          {
            encoding: 'utf8',
            spaces: 4,
          }
        );
      });
    });

    describe('configFileOrDefault()', () => {
      let exitSpy: jest.SpyInstance;
      let originalEnv: NodeJS.ProcessEnv;

      const createFixture = async (
        argv: string[] = ['node', 'openapi-generator-cli'],
      ): Promise<ConfigService> => {
        process.argv = argv;
        program = createCommand().option(
          '--openapitools <openapitools.json>',
          'Use the specified openapi-generator-cli configuration file',
        );

        fs.writeJSONSync.mockReset();
        fs.readJSONSync.mockReset();
        fs.ensureFileSync.mockReset();

        const moduleRef = await Test.createTestingModule({
          providers: [
            ConfigService,
            { provide: LOGGER, useValue: { log, error } },
            { provide: COMMANDER_PROGRAM, useValue: program },
          ],
        }).compile();

        return moduleRef.get(ConfigService);
      };

      beforeEach(() => {
        fs.existsSync.mockReset();
        error.mockClear();
        exitSpy = jest
          .spyOn(process, 'exit')
          .mockImplementation((() => undefined) as never);
        originalEnv = { ...process.env };
        delete process.env[ConfigService.envConfigVariable];
      });

      afterEach(() => {
        exitSpy.mockRestore();
        process.env = { ...originalEnv };
        process.argv = originalArgv;
      });

      describe('--openapitools set', () => {
        it('returns path set at cli, if openapitools argument provided', async () => {
          fs.existsSync.mockReturnValue(true);
          const fixture = await createFixture([
            'node',
            'openapi-generator-cli',
            '--openapitools',
            '/tmp/myopenapitools.json',
          ]);
          expect(fixture.configFile).toEqual('/tmp/myopenapitools.json');
        });
      });

      describe('-c/--config set before the command', () => {
        it.each([
          [
            'the separate -c option value',
            ['-c', '/tmp/my-other-openapitools.json'],
          ],
          [
            'the separate --config option value',
            ['--config', '/tmp/my-other-openapitools.json'],
          ],
          [
            'the inline --config option value',
            ['--config=/tmp/my-other-openapitools.json'],
          ],
          [
            'the attached -c option value',
            ['-c/tmp/my-other-openapitools.json'],
          ],
        ])(
          'returns the path provided via %s',
          async (_, configArgs) => {
            fs.existsSync.mockReturnValue(true);
            const fixture = await createFixture([
              'node',
              'openapi-generator-cli',
              ...configArgs,
              'version-manager',
              'resolve',
            ]);
            expect(fixture.configFile).toEqual(
              '/tmp/my-other-openapitools.json',
            );
          },
        );

        it('resolves a relative path against the cwd', async () => {
          fs.existsSync.mockReturnValue(true);
          const fixture = await createFixture([
            'node',
            'openapi-generator-cli',
            '-c',
            'conf/openapi.json',
            'version-manager',
            'resolve',
          ]);
          expect(fixture.configFile).toEqual(
            path.resolve(fixture.cwd, 'conf/openapi.json'),
          );
        });

        it('skips root options with a value, e.g. --custom-generator, before the command', async () => {
          fs.existsSync.mockReturnValue(true);
          const fixture = await createFixture([
            'node',
            'openapi-generator-cli',
            '--custom-generator',
            './my-generator.jar',
            '-c',
            '/tmp/my-other-openapitools.json',
            'version-manager',
            'resolve',
          ]);
          expect(fixture.configFile).toEqual(
            '/tmp/my-other-openapitools.json',
          );
        });

        it('rejects a trailing -c without a value', async () => {
          await expect(
            createFixture(['node', 'openapi-generator-cli', '-c']),
          ).rejects.toThrow('The -c/--config option requires a value');
        });

        it('rejects a trailing --config without a value', async () => {
          await expect(
            createFixture(['node', 'openapi-generator-cli', '--config']),
          ).rejects.toThrow('The -c/--config option requires a value');
        });
      });

      describe('the config options of the invoked command', () => {
        it.each([
          ['the separate -c option', ['generate', '-c', 'gen-cfg.yaml']],
          [
            'the separate --config option',
            ['generate', '--config', 'gen-cfg.yaml'],
          ],
          [
            'the inline --config option',
            ['generate', '--config=gen-cfg.yaml'],
          ],
          ['the attached -c option', ['generate', '-cgen-cfg.yaml']],
          [
            'an option of another command',
            ['version-manager', 'list', '-c', 'gen-cfg.yaml'],
          ],
        ])(
          'is left to the command: %s reaches the command and the default config is used',
          async (_, commandArgs) => {
            // even a not existing path must not be mistaken for the cli config
            fs.existsSync.mockReturnValue(false);
            const fixture = await createFixture([
              'node',
              'openapi-generator-cli',
              ...commandArgs,
            ]);
            expect(fixture.configFile).toEqual(
              expect.stringMatching(/[/\\]openapitools\.json$/),
            );
            expect(exitSpy).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
          },
        );
      });

      describe(ConfigService.envConfigVariable + ' set', () => {
        it('returns the path set via the environment variable', async () => {
          fs.existsSync.mockReturnValue(true);
          process.env[ConfigService.envConfigVariable] =
            '/tmp/env-openapitools.json';
          const fixture = await createFixture();
          expect(fixture.configFile).toEqual('/tmp/env-openapitools.json');
        });

        it('resolves a relative environment variable path against the cwd', async () => {
          fs.existsSync.mockReturnValue(true);
          process.env[ConfigService.envConfigVariable] = 'conf/openapi.json';
          const fixture = await createFixture();
          expect(fixture.configFile).toEqual(
            path.resolve(fixture.cwd, 'conf/openapi.json'),
          );
        });
      });

      describe('a cli option and the environment variable are set', () => {
        it('the cli option takes precedence over the environment variable', async () => {
          fs.existsSync.mockReturnValue(true);
          process.env[ConfigService.envConfigVariable] =
            '/tmp/env-openapitools.json';
          const fixture = await createFixture([
            'node',
            'openapi-generator-cli',
            '-c',
            '/tmp/cli-openapitools.json',
            'version-manager',
            'resolve',
          ]);
          expect(fixture.configFile).toEqual('/tmp/cli-openapitools.json');
        });
      });

      describe('--openapitools and -c/--config are both set', () => {
        it('--openapitools keeps precedence over -c/--config', async () => {
          fs.existsSync.mockReturnValue(true);
          const fixture = await createFixture([
            'node',
            'openapi-generator-cli',
            '--openapitools',
            '/tmp/openapitools.json',
            '-c',
            '/tmp/config.json',
            'version-manager',
            'resolve',
          ]);
          expect(fixture.configFile).toEqual('/tmp/openapitools.json');
        });
      });

      describe('--openapitools not set', () => {
        it('returns default path, if openapitools argument not provided', async () => {
          const fixture = await createFixture();
          expect(fixture.configFile).toEqual(
            expect.stringMatching(/[/\\]openapitools\.json$/),
          );
        });
      });

      describe('the explicit config file does not exist', () => {
        it('logs an error and exits, if the path was set via a cli option', async () => {
          fs.existsSync.mockReturnValue(false);
          const fixture = await createFixture([
            'node',
            'openapi-generator-cli',
            '-c',
            '/tmp/not-existing-openapitools.json',
            'version-manager',
            'resolve',
          ]);
          expect(fixture.configFile).toEqual('/tmp/not-existing-openapitools.json');
          expect(error).toHaveBeenCalledWith(
            expect.stringContaining('/tmp/not-existing-openapitools.json'),
          );
          expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('logs an error and exits, if the path was set via the environment variable', async () => {
          fs.existsSync.mockReturnValue(false);
          process.env[ConfigService.envConfigVariable] =
            '/tmp/not-existing-openapitools.json';
          await createFixture();
          expect(error).toHaveBeenCalledWith(
            expect.stringContaining('/tmp/not-existing-openapitools.json'),
          );
          expect(error).toHaveBeenCalledWith(
            expect.stringContaining(ConfigService.envConfigVariable),
          );
          expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('does not exit, if the default config file does not exist', async () => {
          fs.existsSync.mockReturnValue(false);
          const errorCallsBefore = error.mock.calls.length;
          const fixture = await createFixture();
          expect(fixture.configFile).toEqual(
            expect.stringMatching(/[/\\]openapitools\.json$/),
          );
          expect(exitSpy).not.toHaveBeenCalled();
          expect(error.mock.calls.length).toBe(errorCallsBefore);
        });
      });
    });

    describe('replacePlaceholders', () => {
      let originalEnv: NodeJS.ProcessEnv;

      beforeEach(() => {
        jest.clearAllMocks();
        originalEnv = { ...process.env };
      });

      afterEach(() => {
        process.env = { ...originalEnv };
      });

      it('replaces a simple placeholder with an environment variable', () => {
        process.env.TEST_VAR = 'value1';
        const input = { key: 'Hello ${TEST_VAR}' };
        const result = fixture['replacePlaceholders'](input);
        expect(result.key).toBe('Hello value1');
      });

      it('leaves placeholder unchanged and logs error if env var is missing', () => {
        delete process.env.MISSING_VAR;
        const input = { key: 'Hello ${MISSING_VAR}' };
        const result = fixture['replacePlaceholders'](input);
        expect(result.key).toBe('Hello ${MISSING_VAR}');
        expect(error).toHaveBeenCalledWith(expect.stringContaining('MISSING_VAR'));
      });

      it('replaces placeholders in nested objects and arrays', () => {
        process.env.NESTED_VAR = 'nested';
        const input = {
          arr: ['${NESTED_VAR}', { inner: '${NESTED_VAR}' }],
          obj: { deep: '${NESTED_VAR}' },
        };
        const result = fixture['replacePlaceholders'](input);
        expect(result.arr[0]).toBe('nested');
        expect((result.arr[1] as { inner: string }).inner).toBe('nested');
        expect((result.obj as { deep: string }).deep).toBe('nested');
      });

      it('handles env. prefix in placeholders', () => {
        process.env.PREFIX_VAR = 'prefix';
        const input = { key: 'Value: ${env.PREFIX_VAR}' };
        const result = fixture['replacePlaceholders'](input);
        expect(result.key).toBe('Value: prefix');
      });

      it('replaces multiple placeholders in a single string', () => {
        process.env.FIRST = 'one';
        process.env.SECOND = 'two';
        const input = { key: 'Values: ${FIRST}, ${SECOND}' };
        const result = fixture['replacePlaceholders'](input);
        expect(result.key).toBe('Values: one, two');
      });
    });
  });
});
