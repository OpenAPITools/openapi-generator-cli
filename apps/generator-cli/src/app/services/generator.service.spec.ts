import {Test} from '@nestjs/testing';
import {GeneratorService} from './generator.service';
import {mocked} from 'ts-jest/utils';
import {LOGGER} from '../constants';
import {VersionManagerService} from './version-manager.service';
import {ConfigService} from './config.service';

jest.mock('fs-extra');
jest.mock('glob');
jest.mock('concurrently');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = mocked(require('fs-extra'), true)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const glob = mocked(require('glob'), true)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const concurrently = mocked(require('concurrently'), true)

describe('GeneratorService', () => {

  let fixture: GeneratorService;

  const log = jest.fn()
  const configGet = jest.fn()
  const cwd = '/my/cwd'

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GeneratorService,
        {provide: LOGGER, useValue: {log}},
        {provide: VersionManagerService, useValue: {filePath: () => '/path/to/4.2.1.jar'}},
        {provide: ConfigService, useValue: {cwd, get: configGet}},
      ],
    }).compile();

    fixture = moduleRef.get(GeneratorService);
    fs.existsSync.mockReset()
    fs.readJSONSync.mockReset()
  });

  describe('API', () => {

    describe('generate()', () => {

      const config = {
        ['none.json']: undefined,
        ['foo.json']: [
          {
            glob: 'abc/**/*.yaml',
            output: '#{cwd}/generated-sources/openapi/typescript-angular/#{name}',
            'generator-name': 'typescript-angular',
            'additional-properties': {
              fileNaming: 'kebab-case',
              apiModulePrefix: '#{Name}',
              npmName: '#{name}RestClient',
              supportsES6: true,
              withInterfaces: true
            }
          },
          {
            glob: 'disabled/**/*.yaml',
            output: 'disabled/',
            disabled: true,
          },
          {
            glob: 'def/**/*.(yaml|json)',
            name: '#{name}',
            Name: '#{Name}',
            cwd: '#{cwd}',
            base: '#{base}',
            dir: '#{dir}',
            path: '#{path}',
            relDir: '#{relDir}',
            relPath: '#{relPath}',
            ext: '#{ext}',
          },
        ],
        ['bar.json']: [
          {
            glob: 'bar/abc/**/*.yaml',
            output: 'bar/#{name}',
          },
        ],
      }

      const specFiles = {
        'abc/**/*.yaml': ['abc/app/pet.yaml', 'abc/app/car.yaml'],
        'def/**/*.(yaml|json)': ['def/app/pet.yaml', 'def/app/car.json'],
        'bar/abc/**/*.yaml': ['api/cat.yaml', 'api/bird.json'],
      };

      let executedCommands = []

      beforeEach(() => {
        executedCommands = []
        fs.existsSync.mockImplementation(p => !!config[p])
        fs.readJSONSync.mockImplementation(p => config[p])
        glob.sync.mockImplementation(g => specFiles[g])
        concurrently.mockImplementation(ec => {
          executedCommands = ec
          return Promise.resolve();
        })
      })

      const cmd = (appendix: string[]) => `java -jar "/path/to/4.2.1.jar" generate ${appendix.join(' ')}`

      describe.each([
        ['foo.json', [
          cmd([
            `--input-spec="${cwd}/abc/app/pet.yaml"`,
            `--output="${cwd}/generated-sources/openapi/typescript-angular/pet"`,
            `--generator-name="typescript-angular"`,
            `--additional-properties="fileNaming=kebab-case,apiModulePrefix=Pet,npmName=petRestClient,supportsES6=true,withInterfaces=true"`,
          ]),
          cmd([
            `--input-spec="${cwd}/abc/app/car.yaml"`,
            `--output="${cwd}/generated-sources/openapi/typescript-angular/car"`,
            `--generator-name="typescript-angular"`,
            `--additional-properties="fileNaming=kebab-case,apiModulePrefix=Car,npmName=carRestClient,supportsES6=true,withInterfaces=true"`,
          ]),
          cmd([
            `--input-spec="${cwd}/def/app/pet.yaml"`,
            `--name="pet"`,
            `--Name="Pet"`,
            `--cwd="${cwd}"`,
            `--base="pet.yaml"`,
            `--dir="${cwd}/def/app"`,
            `--path="${cwd}/def/app/pet.yaml"`,
            `--relDir="def/app"`,
            `--relPath="def/app/pet.yaml"`,
            `--ext="yaml"`,
          ]),
          cmd([
            `--input-spec="${cwd}/def/app/car.json"`,
            `--name="car"`,
            `--Name="Car"`,
            `--cwd="${cwd}"`,
            `--base="car.json"`,
            `--dir="${cwd}/def/app"`,
            `--path="${cwd}/def/app/car.json"`,
            `--relDir="def/app"`,
            `--relPath="def/app/car.json"`,
            `--ext="json"`,
          ]),
        ]],
        ['bar.json', [
          cmd([
            `--input-spec="${cwd}/api/cat.yaml"`,
            `--output="bar/cat"`,
          ]),
          cmd([
            `--input-spec="${cwd}/api/bird.json"`,
            `--output="bar/bird"`,
          ]),
        ]],
        ['none.json', []]
      ])('%s', (filePath, expectedCommands) => {

        beforeEach(async () => {
          configGet.mockImplementation((path, defaultValue) => config[filePath] || defaultValue)
          await fixture.generate()
        })

        it('calls the config get well', () => {
          expect(configGet).toHaveBeenNthCalledWith(1, 'generator-cli.generators', [])
        })

        it(`executes ${expectedCommands.length} commands`, async () => {
          expect(executedCommands).toHaveLength(expectedCommands.length)
          expect(executedCommands).toEqual(expectedCommands)
        })

      })

    })

  })

})
