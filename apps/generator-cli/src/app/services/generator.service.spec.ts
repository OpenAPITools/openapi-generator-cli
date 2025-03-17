import { Test } from '@nestjs/testing';
import { GeneratorService } from './generator.service';
import { LOGGER } from '../constants';
import { javaCmd } from '../helpers';
import { VersionManagerService } from './version-manager.service';
import { ConfigService } from './config.service';

jest.mock('fs-extra');
jest.mock('glob');
jest.mock('concurrently');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = jest.mocked(require('fs-extra'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const glob = jest.mocked(require('glob'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const concurrently = jest.mocked(require('concurrently'));

describe('GeneratorService', () => {
  let fixture: GeneratorService;

  const log = jest.fn();
  const configGet = jest.fn();
  const cwd = '/my/cwd';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GeneratorService,
        { provide: LOGGER, useValue: { log } },
        {
          provide: VersionManagerService,
          useValue: { filePath: () => '/path/to/4.2.1.jar' },
        },
        {
          provide: ConfigService,
          useValue: { cwd, get: configGet, has: () => true },
        },
      ],
    }).compile();

    fixture = moduleRef.get(GeneratorService);
    fs.existsSync.mockReset();
    fs.readJSONSync.mockReset();
  });

  describe('API', () => {
    describe('generate()', () => {
      const config = {
        ['none.json']: undefined,
        ['also-none.json']: {},
        ['foo.json']: {
          angular: {
            glob: 'abc/**/*.yaml',
            output:
              '#{cwd}/generated-sources/openapi/typescript-angular/#{name}',
            'generator-name': 'typescript-angular',
            'additional-properties': {
              fileNaming: 'kebab-case',
              apiModulePrefix: '#{Name}',
              npmName: '#{name}RestClient',
              supportsES6: true,
              withInterfaces: true,
            },
          },
          foo: {
            glob: 'disabled/**/*.yaml',
            output: 'disabled/',
            disabled: true,
          },
          baz: {
            glob: 'def/**/*.{json,yaml}',
            name: '#{name}',
            nameUcFirst: '#{Name}',
            cwd: '#{cwd}',
            base: '#{base}',
            dir: '#{dir}',
            path: '#{path}',
            relDir: '#{relDir}',
            relPath: '#{relPath}',
            ext: '#{ext}',
            someBool: true,
            someInt: 1,
          },
        },
        ['bar.json']: {
          bar: {
            glob: 'bar/abc/**/*.yaml',
            output: 'bar/#{name}',
            someBool: false,
          },
        },
        ['no-glob.json']: {
          noGlob: {
            inputSpec: 'http://example.local/openapi.json',
            output: 'no-glob/#{name}',
            name: '#{name}',
            nameUcFirst: '#{Name}',
            cwd: '#{cwd}',
            base: '#{base}',
            dir: '#{dir}',
            path: '#{path}',
            relDir: '#{relDir}',
            relPath: '#{relPath}',
            ext: '#{ext}',
          },
        },
      };

      const specFiles = {
        'abc/**/*.yaml': ['abc/app/pet.yaml', 'abc/app/car.yaml'],
        'def/**/*.{json,yaml}': ['def/app/pet.yaml', 'def/app/car.json'],
        'bar/abc/**/*.yaml': ['api/cat.yaml', 'api/bird.json'],
      };

      let executedCommands = [];
      let concurrentlyCfg = [];

      beforeEach(() => {
        executedCommands = [];
        fs.existsSync.mockImplementation((p) => !!config[p]);
        fs.readJSONSync.mockImplementation((p) => config[p]);
        glob.sync.mockImplementation((g) => specFiles[g]);
        concurrently.mockImplementation((ec, cfg) => {
          executedCommands = ec;
          concurrentlyCfg = cfg;
          return Promise.resolve();
        });
      });

      const cmd = (name: string, javaCmd: string, appendix: string[]) => ({
        name,
        command: `${javaCmd} -jar "/path/to/4.2.1.jar" generate ${appendix.join(
          ' '
        )}`,
      });

      const cmdWithCustomJar = (
        name: string,
        javaCmd: string,
        customJar: string,
        appendix: string[]
      ) => ({
        name,
        command: `${javaCmd} -cp "/path/to/4.2.1.jar:${customJar}" org.openapitools.codegen.OpenAPIGenerator generate ${appendix.join(
          ' '
        )}`,
      });

      describe.each([
        [
          'foo.json',
          [
            cmd('[angular] abc/app/pet.yaml', javaCmd, [
              `--input-spec="${cwd}/abc/app/pet.yaml"`,
              `--output="${cwd}/generated-sources/openapi/typescript-angular/pet"`,
              `--generator-name="typescript-angular"`,
              `--additional-properties="fileNaming=kebab-case,apiModulePrefix=Pet,npmName=petRestClient,supportsES6=true,withInterfaces=true"`,
            ]),
            cmd('[angular] abc/app/car.yaml', javaCmd, [
              `--input-spec="${cwd}/abc/app/car.yaml"`,
              `--output="${cwd}/generated-sources/openapi/typescript-angular/car"`,
              `--generator-name="typescript-angular"`,
              `--additional-properties="fileNaming=kebab-case,apiModulePrefix=Car,npmName=carRestClient,supportsES6=true,withInterfaces=true"`,
            ]),
            cmd('[baz] def/app/pet.yaml', javaCmd, [
              `--input-spec="${cwd}/def/app/pet.yaml"`,
              `--name="pet"`,
              `--name-uc-first="Pet"`,
              `--cwd="${cwd}"`,
              `--base="pet.yaml"`,
              `--dir="${cwd}/def/app"`,
              `--path="${cwd}/def/app/pet.yaml"`,
              `--rel-dir="def/app"`,
              `--rel-path="def/app/pet.yaml"`,
              `--ext="yaml"`,
              '--some-bool',
              '--some-int=1',
            ]),
            cmd('[baz] def/app/car.json', javaCmd, [
              `--input-spec="${cwd}/def/app/car.json"`,
              `--name="car"`,
              `--name-uc-first="Car"`,
              `--cwd="${cwd}"`,
              `--base="car.json"`,
              `--dir="${cwd}/def/app"`,
              `--path="${cwd}/def/app/car.json"`,
              `--rel-dir="def/app"`,
              `--rel-path="def/app/car.json"`,
              `--ext="json"`,
              '--some-bool',
              '--some-int=1',
            ]),
          ],
        ],
        [
          'bar.json',
          [
            cmd('[bar] api/cat.yaml', javaCmd, [
              `--input-spec="${cwd}/api/cat.yaml"`,
              `--output="bar/cat"`,
              '--some-bool',
            ]),
            cmd('[bar] api/bird.json', javaCmd, [
              `--input-spec="${cwd}/api/bird.json"`,
              `--output="bar/bird"`,
              '--some-bool',
            ]),
          ],
        ],
        [
          'bar.json',
          [
            cmdWithCustomJar(
              '[bar] api/cat.yaml',
              javaCmd,
              '../some/custom.jar',
              [
                `--input-spec="${cwd}/api/cat.yaml"`,
                `--output="bar/cat"`,
                '--some-bool',
              ]
            ),
            cmdWithCustomJar(
              '[bar] api/bird.json',
              javaCmd,
              '../some/custom.jar',
              [
                `--input-spec="${cwd}/api/bird.json"`,
                `--output="bar/bird"`,
                '--some-bool',
              ]
            ),
          ],
          '../some/custom.jar',
        ],
        ['none.json', []],
        ['also-none.json', []],
        [
          'no-glob.json',
          [
            cmd('[noGlob] http://example.local/openapi.json', javaCmd, [
              `--input-spec="http://example.local/openapi.json"`,
              `--output="no-glob/openapi"`,
              `--name="openapi"`,
              `--name-uc-first="Openapi"`,
              `--cwd="${cwd}"`,
              `--base="openapi.json"`,
              `--dir="#{dir}"`,
              `--path="http://example.local/openapi.json"`,
              `--rel-dir="#{relDir}"`,
              `--rel-path="#{relPath}"`,
              `--ext="json"`,
            ]),
          ],
        ],
      ])('%s', (filePath, expectedCommands, customGenerator) => {
        let returnValue: boolean;

        beforeEach(async () => {
          configGet.mockImplementation(
            (path, defaultValue) => config[filePath] || defaultValue
          );
          returnValue = await fixture.generate(customGenerator);
        });

        it('calls the config get well', () => {
          expect(configGet).toHaveBeenNthCalledWith(
            1,
            'generator-cli.generators',
            {}
          );
        });

        it('runs max 10 processes at the same time', () => {
          expect(concurrentlyCfg).toEqual({ maxProcesses: 10 });
        });

        it(`executes ${expectedCommands.length} commands`, async () => {
          expect(executedCommands).toHaveLength(expectedCommands.length);
          expect(executedCommands).toEqual(expectedCommands);
        });

        it(`resolved to ${expectedCommands.length > 1}`, () => {
          expect(returnValue).toEqual(expectedCommands.length > 0);
        });
      });
    });
  });
});
