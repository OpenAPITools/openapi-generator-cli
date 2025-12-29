import { Test } from '@nestjs/testing';
import { Command, createCommand } from 'commander';
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

  beforeEach(async () => {
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

        it('ensures the config file', () => {
          fixture.get('some-path');
          expect(fs.ensureFileSync).toHaveBeenNthCalledWith(
            1,
            fixture.configFile
          );
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
      describe('--openapitools set', () => {
        beforeEach(async () => {
          program = createCommand();
          program.opts().openapitools = '/tmp/myopenapitools.json';

          const moduleRef = await Test.createTestingModule({
            providers: [
              ConfigService,
              { provide: LOGGER, useValue: { log } },
              { provide: COMMANDER_PROGRAM, useValue: program },
            ],
          }).compile();

          fixture = moduleRef.get(ConfigService);
          fs.writeJSONSync.mockReset();
          fs.readJSONSync.mockReset();
          fs.ensureFileSync.mockReset();
        });
        it('returns path set at cli, if openapitools argument provided', () => {
          expect(fixture.configFile).toEqual('/tmp/myopenapitools.json');
        });
      });
      describe('--openapitools not set', () => {
        it('returns default path, if openapitools argument not provided', () => {
          expect(
            fixture.configFile.endsWith(
              'openapi-generator-cli/openapitools.json'
            )
          ).toBeTruthy();
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
