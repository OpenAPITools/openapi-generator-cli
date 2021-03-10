import {Test} from '@nestjs/testing';
import {Version, VersionManagerService} from './version-manager.service';
import {HttpService} from '@nestjs/common';
import {of} from 'rxjs';
import {mocked} from 'ts-jest/utils';
import {LOGGER} from '../constants';
import * as chalk from 'chalk';
import {ConfigService} from './config.service';
import {resolve} from 'path';
import * as os from 'os';
import {TestingModule} from '@nestjs/testing/testing-module';

jest.mock('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = mocked(require('fs-extra'), true);

describe('VersionManagerService', () => {

  let fixture: VersionManagerService;

  const get = jest.fn();
  const log = jest.fn();

  const getVersion = jest.fn().mockReturnValue('4.3.0');
  const getStorageDir = jest.fn().mockReturnValue(undefined);
  const setVersion = jest.fn();

  let testBed: TestingModule

  const compile = async () => {
    testBed = await Test.createTestingModule({
      providers: [
        VersionManagerService,
        { provide: HttpService, useValue: { get } },
        {
          provide: ConfigService, useValue: {
            get: (k) => {

              if (k === 'generator-cli.storageDir') {
                return getStorageDir(k);
              }

              if (k === 'generator-cli.repository.queryUrl') {
                return undefined;
                // return 'https://search.maven.custom/solrsearch/select?q=g:${repository.groupId}+AND+a:${repository.artifactId}&core=gav&start=0&rows=250';
              }

              if (k === 'generator-cli.repository.downloadUrl') {
                return undefined;
                // return 'https://search.maven.custom/solrsearch/select?q=g:${repository.groupId}+AND+a:${repository.artifactId}&core=gav&start=0&rows=250';
              }

              return getVersion(k);
            },
            set: setVersion,
            cwd: '/c/w/d'
          }
        },
        { provide: LOGGER, useValue: { log } }
      ]
    }).compile();

    fixture = testBed.get(VersionManagerService);
  }

  beforeEach(async () => {
    [get].forEach(fn => fn.mockClear());
    getStorageDir.mockReturnValue(undefined)
    await compile()
    fs.existsSync.mockReset().mockImplementation(filePath => filePath.indexOf('4.2') !== -1);
  });

  const expectedVersions = {
    '4.2.0': {
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.2.0/openapi-generator-cli-4.2.0.jar',
      installed: true,
      releaseDate: new Date(1599197918000),
      version: '4.2.0',
      versionTags: ['4.2.0', 'stable']
    },
    '5.0.0-beta': {
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.0-beta/openapi-generator-cli-5.0.0-beta.jar',
      installed: false,
      releaseDate: new Date(1593445793000),
      version: '5.0.0-beta',
      versionTags: ['5.0.0-beta', '5.0.0', 'beta', 'beta']
    },
    '4.3.1': {
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.3.1/openapi-generator-cli-4.3.1.jar',
      installed: false,
      releaseDate: new Date(1588758220000),
      version: '4.3.1',
      versionTags: ['4.3.1', 'stable', 'latest']
    },
    '5.0.0-beta2': {
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.0-beta2/openapi-generator-cli-5.0.0-beta2.jar',
      installed: false,
      releaseDate: new Date(1599197918000),
      version: '5.0.0-beta2',
      versionTags: ['5.0.0-beta2', '5.0.0', 'beta2', 'beta']
    },
    '3.0.0-alpha': {
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.0.0-alpha/openapi-generator-cli-3.0.0-alpha.jar',
      installed: false,
      releaseDate: new Date(1527849204000),
      version: '3.0.0-alpha',
      versionTags: ['3.0.0-alpha', '3.0.0', 'alpha', 'alpha']
    }
  };

  describe('API', () => {

    describe('getAll()', () => {

      let returnValue: Version[];

      beforeEach(async () => {
        get.mockReturnValue(of({
          data: {
            response: {
              docs: [
                { v: '4.2.0', timestamp: 1599197918000 },
                { v: '5.0.0-beta', timestamp: 1593445793000 },
                { v: '4.3.1', timestamp: 1588758220000 },
                { v: '5.0.0-beta2', timestamp: 1599197918000 },
                { v: '3.0.0-alpha', timestamp: 1527849204000 }
              ]
            }
          }
        }));

        returnValue = await fixture.getAll().toPromise();
      });

      it('executes one get request', () => {
        expect(get).toHaveBeenNthCalledWith(1, 'https://search.maven.org/solrsearch/select?q=g:org.openapitools+AND+a:openapi-generator-cli&core=gav&start=0&rows=200');
      });

      it('returns the correct versions', () => {
        expect(returnValue).toEqual([
          expectedVersions['4.2.0'],
          expectedVersions['5.0.0-beta'],
          expectedVersions['4.3.1'],
          expectedVersions['5.0.0-beta2'],
          expectedVersions['3.0.0-alpha']
        ]);
      });

    });

    describe('search()', () => {

      let returnValue: Version[];

      describe('using empty tags array', () => {

        beforeEach(async () => {
          get.mockReturnValue(of({
            data: {
              response: {
                docs: [
                  { v: '4.2.0', timestamp: 1599197918000 },
                  { v: '5.0.0-beta', timestamp: 1593445793000 },
                  { v: '4.3.1', timestamp: 1588758220000 },
                  { v: '5.0.0-beta2', timestamp: 1599197918000 },
                  { v: '3.0.0-alpha', timestamp: 1527849204000 }
                ]
              }
            }
          }));

          returnValue = await fixture.search([]).toPromise();
        });

        it('executes one get request', () => {
          expect(get).toHaveBeenNthCalledWith(1, 'https://search.maven.org/solrsearch/select?q=g:org.openapitools+AND+a:openapi-generator-cli&core=gav&start=0&rows=200');
        });

        it('returns all versions', () => {
          expect(returnValue).toEqual([
            expectedVersions['4.2.0'],
            expectedVersions['5.0.0-beta'],
            expectedVersions['4.3.1'],
            expectedVersions['5.0.0-beta2'],
            expectedVersions['3.0.0-alpha']
          ]);
        });

      });

      describe.each([
        [['beta'], [expectedVersions['5.0.0-beta'], expectedVersions['5.0.0-beta2']]],
        [['beta', 'alpha'], []],
        [['5'], [expectedVersions['5.0.0-beta'], expectedVersions['5.0.0-beta2']]],
        [['4.2'], [expectedVersions['4.2.0']]],
        [['stable'], [expectedVersions['4.2.0'], expectedVersions['4.3.1']]]
      ])('using tags %s', (tags, expectation) => {

        beforeEach(async () => {
          returnValue = await fixture.search(tags).toPromise();
        });

        it('executes one get request', () => {
          expect(get).toHaveBeenNthCalledWith(1, 'https://search.maven.org/solrsearch/select?q=g:org.openapitools+AND+a:openapi-generator-cli&core=gav&start=0&rows=200');
        });

        it('returns the correct versions', () => {
          expect(returnValue).toEqual(expectation);
        });

      });

    });

    describe('isSelectedVersion()', () => {

      it('return true if equal to the selected version', () => {
        expect(fixture.isSelectedVersion('4.3.0')).toBeTruthy();
      });

      it('return false if equal to the selected version', () => {
        expect(fixture.isSelectedVersion('4.3.1')).toBeFalsy();
      });

    });

    describe('getSelectedVersion', () => {

      it('returns the value from the config service', () => {
        expect(fixture.getSelectedVersion()).toEqual('4.3.0');
        expect(getVersion).toHaveBeenNthCalledWith(1, 'generator-cli.version');
      });

    });

    describe('setSelectedVersion', () => {

      let downloadIfNeeded: jest.SpyInstance;


      beforeEach(() => {
        log.mockReset();
        setVersion.mockReset();
      });

      describe('was download or exists', () => {

        beforeEach(async () => {
          downloadIfNeeded = jest.spyOn(fixture, 'downloadIfNeeded').mockResolvedValue(true);
          await fixture.setSelectedVersion('1.2.3');
        });

        it('calls downloadIfNeeded once', () => {
          expect(downloadIfNeeded).toHaveBeenNthCalledWith(1, '1.2.3');
        });

        it('sets the correct config value', () => {
          expect(setVersion).toHaveBeenNthCalledWith(1, 'generator-cli.version', '1.2.3');
        });

        it('logs a success message', () => {
          expect(log).toHaveBeenNthCalledWith(1, chalk.green('Did set selected version to 1.2.3'));
        });

      });

      describe('was not downloaded nor exists', () => {

        beforeEach(async () => {
          downloadIfNeeded = jest.spyOn(fixture, 'downloadIfNeeded').mockResolvedValue(false);
          await fixture.setSelectedVersion('1.2.3');
        });

        it('calls downloadIfNeeded once', () => {
          expect(downloadIfNeeded).toHaveBeenNthCalledWith(1, '1.2.3');
        });

        it('does not set the config value', () => {
          expect(setVersion).toBeCalledTimes(0);
        });

        it('logs no success message', () => {
          expect(log).toBeCalledTimes(0);
        });

      });

    });

    describe('remove()', () => {

      let logMessages = {
        before: [],
        after: []
      };

      beforeEach(() => {
        logMessages = {
          before: [],
          after: []
        };

        log.mockReset().mockImplementation(m => logMessages.before.push(m));

        fs.removeSync.mockImplementation(() => {
          log.mockReset().mockImplementation(m => logMessages.after.push(m));
        });

        fixture.remove('4.3.1');
      });

      it('removes the correct file', () => {
        expect(fs.removeSync).toHaveBeenNthCalledWith(1, `${fixture.storage}/4.3.1.jar`);
      });

      it('logs the correct messages', () => {
        expect(logMessages).toEqual({
          before: [],
          after: [chalk.green(`Removed 4.3.1`)]
        });
      });

    });

    describe('download()', () => {

      let returnValue: boolean;

      let logMessages = {
        before: [],
        after: []
      };

      describe('the server responds with an error', () => {

        beforeEach(async () => {
          get.mockImplementation(() => {
            log.mockReset().mockImplementation(m => logMessages.after.push(m));
            throw new Error('HTTP 404 Not Found');
          });

          logMessages = {
            before: [],
            after: []
          };

          log.mockReset().mockImplementation(m => logMessages.before.push(m));
          returnValue = await fixture.download('4.2.0');
        });

        it('returns false', () => {
          expect(returnValue).toBeFalsy();
        });

        it('logs the correct messages', () => {
          expect(logMessages).toEqual({
            before: [chalk.yellow(`Download 4.2.0 ...`)],
            after: [chalk.red(`Download failed, because of: "HTTP 404 Not Found"`)]
          });
        });

      });

      describe('the server responds a file', () => {

        const data = {
          pipe: jest.fn(),
        };

        const file = {
          on: jest.fn().mockImplementation((listener, res) => {
            if (listener === 'finish') {
              return res();
            }
          })
        }

        beforeEach(async () => {
          data.pipe.mockReset();
          fs.mkdtempSync.mockReset().mockReturnValue('/tmp/generator-cli-abcDEF');
          fs.ensureDirSync.mockReset();
          fs.createWriteStream.mockReset().mockReturnValue(file);

          get.mockImplementation(() => {
            log.mockReset().mockImplementation(m => logMessages.after.push(m));
            return of({ data });
          });

          logMessages = {
            before: [],
            after: []
          };

          log.mockReset().mockImplementation(m => logMessages.before.push(m));
          returnValue = await fixture.download('4.2.0');
        });

        it('returns true', () => {
          expect(returnValue).toBeTruthy();
        });

        describe('logging', () => {

          it('logs the correct messages', () => {
            expect(logMessages).toEqual({
              before: [chalk.yellow(`Download 4.2.0 ...`)],
              after: [chalk.green(`Downloaded 4.2.0`)]
            });
          });

          describe('there is a custom storage location', () => {

            it.each([
              ['/c/w/d/custom/dir', './custom/dir'],
              ['/custom/dir', '/custom/dir'],
            ])('returns %s for %s', async (expected, cfgValue) => {
              getStorageDir.mockReturnValue(cfgValue)
              logMessages = {before: [], after: []};
              log.mockReset().mockImplementation(m => logMessages.before.push(m));

              await compile()
              await fixture.download('4.2.0')
              expect(logMessages).toEqual({
                before: [chalk.yellow(`Download 4.2.0 ...`)],
                after: [chalk.green(`Downloaded 4.2.0 to custom storage location ${expected}`)]
              });
            });

          });
        })


        it('provides the correct params to get', () => {
          expect(get).toHaveBeenNthCalledWith(1, 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.2.0/openapi-generator-cli-4.2.0.jar', { responseType: 'stream' });
        });

        describe('file saving', () => {

          it('ensures the save dir', () => {
            expect(fs.ensureDirSync).toHaveBeenNthCalledWith(1, fixture.storage);
          });


          it('creates a temporary directory', () => {
            expect(fs.mkdtempSync).toHaveBeenNthCalledWith(1, '/tmp/generator-cli-');
          });

          it('creates the correct write stream', () => {
            expect(fs.createWriteStream).toHaveBeenNthCalledWith(1, '/tmp/generator-cli-abcDEF/4.2.0');
          });

          it('moves the file to the target location', () => {
            expect(fs.moveSync).toHaveBeenNthCalledWith(1, '/tmp/generator-cli-abcDEF/4.2.0', `${fixture.storage}/4.2.0.jar`, {overwrite: true});
          });

          it('receives the data piped', () => {
            expect(data.pipe).toHaveBeenNthCalledWith(1, file);
          });

        });

      });

    });

    describe('downloadIfNeeded()', () => {

      let downloadSpy: jest.SpyInstance;
      let isDownloadedSpy: jest.SpyInstance;

      beforeEach(() => {
        isDownloadedSpy = jest.spyOn(fixture, 'isDownloaded').mockReset();
        downloadSpy = jest.spyOn(fixture, 'download').mockReset();
      });

      describe('the version exists', () => {

        let returnValue: boolean;

        beforeEach(async () => {
          isDownloadedSpy.mockReturnValueOnce(true);
          returnValue = await fixture.downloadIfNeeded('4.2.0');
        });

        it('does not call download', () => {
          expect(downloadSpy).toBeCalledTimes(0);
        });

        it('returns true', () => {
          expect(returnValue).toBeTruthy();
        });

      });

      describe('the version does not exists', () => {

        beforeEach(async () => {
          isDownloadedSpy.mockReturnValueOnce(false);
          await fixture.downloadIfNeeded('4.2.0');
        });

        it('calls download once', () => {
          expect(downloadSpy).toHaveBeenNthCalledWith(1, '4.2.0');
        });

        it('returns true, if download return true', async () => {
          downloadSpy.mockReturnValueOnce(true);
          expect(await fixture.downloadIfNeeded('4.2.0')).toBeTruthy();
        });

        it('returns true, if download return true', async () => {
          downloadSpy.mockReturnValueOnce(false);
          expect(await fixture.downloadIfNeeded('4.2.0')).toBeFalsy();
        });

      });

    });

    describe('isDownloaded()', () => {

      it('returns true, if the file exists', () => {
        fs.existsSync.mockReturnValue(true);
        expect(fixture.isDownloaded('4.3.1')).toBeTruthy();
      });

      it('returns false, if the file does not exists', () => {
        fs.existsSync.mockReturnValue(false);
        expect(fixture.isDownloaded('4.3.1')).toBeFalsy();
      });

      it('provides the correct file path', () => {
        fixture.isDownloaded('4.3.1');
        expect(fs.existsSync).toHaveBeenNthCalledWith(1, fixture.storage + '/4.3.1.jar');
      });

    });

    describe('filePath()', () => {

      it('returns the path to the given version name', () => {
        expect(fixture.filePath('1.2.3')).toEqual(`${fixture.storage}/1.2.3.jar`);
      });

      it('returns the path to the selected version name as default', () => {
        expect(fixture.filePath()).toEqual(`${fixture.storage}/4.3.0.jar`);
      });

    });

    describe('storage', () => {

      describe('there is no custom storage location', () => {

        it('returns the correct location path', () => {
          expect(fixture.storage).toEqual(resolve(__dirname, './versions'));
        });

      });

      describe('there is a custom storage location', () => {

        it.each([
          ['/c/w/d/custom/dir', './custom/dir'],
          ['/custom/dir', '/custom/dir'],
          ['/custom/dir', '/custom/dir/'],
          [`${os.homedir()}/oa`, '~/oa/'],
          [`${os.homedir()}/oa`, '~/oa'],
        ])('returns %s for %s', async (expected, cfgValue) => {
          getStorageDir.mockReturnValue(cfgValue)
          await compile()
          expect(fixture.storage).toEqual(expected);
        });

      });

    });

  });

});
