import { Test } from '@nestjs/testing';
import { Command, createCommand } from 'commander';
import { ConfigService } from './config.service';
import { LOGGER, COMMANDER_PROGRAM } from '../constants';
import * as path from 'path';

jest.mock('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = jest.mocked(require('fs-extra'));

describe('ConfigService', () => {
  let fixture: ConfigService;
  let program: Command;

  const log = jest.fn();

  beforeEach(async () => {
    program = createCommand();
    jest.spyOn(program, 'helpInformation');

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

      describe('the config has values having placeholders', () => {
        beforeEach(() => {
          fs.readJSONSync.mockReturnValue({
            $schema: 'foo.json',
            spaces: 4,
            'generator-cli': {
              version: '1.2.3',
              repository: {
                queryUrl: 'https://${__unit_test_username}:${__unit_test_password}@server/api',
                downloadUrl: 'https://${__unit_test_non_matching}@server/api'
              }
            },
          });
          process.env['__unit_test_username'] = 'myusername';
          process.env['__unit_test_password'] = 'mypassword';
        });

        afterEach(() => {
          delete process.env['__unit_test_username'];
          delete process.env['__unit_test_password'];
        })

        it('verify placeholder replaced with env vars', () => {
          const value = fixture.get('generator-cli.repository.queryUrl');

          expect(value).toEqual('https://myusername:mypassword@server/api');
        });

        it('verify placeholders not matching env vars are not replaced', () => {
          const value = fixture.get('generator-cli.repository.downloadUrl');

          expect(value).toEqual('https://${__unit_test_non_matching}@server/api');
        });
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
              path.join('openapi-generator-cli', 'openapitools.json')
            )
          ).toBeTruthy();
        });
      });
    });
  });
});
