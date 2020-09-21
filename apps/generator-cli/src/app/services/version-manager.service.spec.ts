import {Test} from '@nestjs/testing';
import {Version, VersionManagerService} from './version-manager.service';
import {HttpService} from '@nestjs/common';
import {of} from 'rxjs';
import {mocked} from 'ts-jest/utils';
import {LOGGER} from '../constants';
import * as chalk from 'chalk';

jest.mock('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = mocked(require('fs-extra'), true)

describe('VersionManagerService', () => {

  let fixture: VersionManagerService;

  const get = jest.fn();
  const log = jest.fn()

  beforeEach(async () => {
    [get].forEach(fn => fn.mockClear());

    const moduleRef = await Test.createTestingModule({
      providers: [
        VersionManagerService,
        {provide: HttpService, useValue: {get}},
        {provide: LOGGER, useValue: {log}},
      ],
    }).compile();

    fixture = moduleRef.get(VersionManagerService);
    (fs.existsSync).mockImplementation(filePath => filePath.indexOf('4.2') !== -1)
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
  }

  describe('API', () => {

    describe('getAll()', () => {

      let returnValue: Version[]

      beforeEach(async () => {
        get.mockReturnValue(of({
          data: {
            response: {
              docs: [
                {v: '4.2.0', timestamp: 1599197918000},
                {v: '5.0.0-beta', timestamp: 1593445793000},
                {v: '4.3.1', timestamp: 1588758220000},
                {v: '5.0.0-beta2', timestamp: 1599197918000},
                {v: '3.0.0-alpha', timestamp: 1527849204000}
              ]
            }
          }
        }))

        returnValue = await fixture.getAll().toPromise();
      })

      it('executes one get request', () => {
        expect(get).toHaveBeenNthCalledWith(1, 'https://search.maven.org/solrsearch/select?q=g:org.openapitools+AND+a:openapi-generator-cli&core=gav&start=0&rows=200')
      })

      it('returns the correct versions', () => {
        expect(returnValue).toEqual([
          expectedVersions['4.2.0'],
          expectedVersions['5.0.0-beta'],
          expectedVersions['4.3.1'],
          expectedVersions['5.0.0-beta2'],
          expectedVersions['3.0.0-alpha'],
        ])
      })

    })

    describe('search()', () => {

      let returnValue: Version[]

      describe('using empty tags array', () => {

        beforeEach(async () => {
          get.mockReturnValue(of({
            data: {
              response: {
                docs: [
                  {v: '4.2.0', timestamp: 1599197918000},
                  {v: '5.0.0-beta', timestamp: 1593445793000},
                  {v: '4.3.1', timestamp: 1588758220000},
                  {v: '5.0.0-beta2', timestamp: 1599197918000},
                  {v: '3.0.0-alpha', timestamp: 1527849204000}
                ]
              }
            }
          }))

          returnValue = await fixture.search([]).toPromise();
        })

        it('executes one get request', () => {
          expect(get).toHaveBeenNthCalledWith(1, 'https://search.maven.org/solrsearch/select?q=g:org.openapitools+AND+a:openapi-generator-cli&core=gav&start=0&rows=200')
        })

        it('returns all versions', () => {
          expect(returnValue).toEqual([
            expectedVersions['4.2.0'],
            expectedVersions['5.0.0-beta'],
            expectedVersions['4.3.1'],
            expectedVersions['5.0.0-beta2'],
            expectedVersions['3.0.0-alpha'],
          ])
        })

      })

      describe.each([
        [['beta'], [expectedVersions['5.0.0-beta'], expectedVersions['5.0.0-beta2']]],
        [['beta', 'alpha'], []],
        [['5'], [expectedVersions['5.0.0-beta'], expectedVersions['5.0.0-beta2']]],
        [['4.2'], [expectedVersions['4.2.0']]],
        [['stable'], [expectedVersions['4.2.0'], expectedVersions['4.3.1']]],
      ])('using tags %s', (tags, expectation) => {

        beforeEach(async () => {
          returnValue = await fixture.search(tags).toPromise();
        })

        it('executes one get request', () => {
          expect(get).toHaveBeenNthCalledWith(1, 'https://search.maven.org/solrsearch/select?q=g:org.openapitools+AND+a:openapi-generator-cli&core=gav&start=0&rows=200')
        })

        it('returns the correct versions', () => {
          expect(returnValue).toEqual(expectation)
        })

      })

    })

    describe('install()', () => {

      let returnValue: boolean

      let logMessages = {
        before: [],
        after: [],
      }

      describe('the server responds with an error', () => {

        beforeEach(async () => {
          get.mockImplementation(() => {
            log.mockReset().mockImplementation(m => logMessages.after.push(m))
            throw new Error('HTTP 404 Not Found');
          })

          logMessages = {
            before: [],
            after: [],
          }

          log.mockReset().mockImplementation(m => logMessages.before.push(m))
          returnValue = await fixture.install('4.2.0')
        })

        it('returns false', () => {
          expect(returnValue).toBeFalsy()
        })

        it('logs the correct messages', () => {
          expect(logMessages).toEqual({
            before: [chalk.yellow(`Install 4.2.0 ...`)],
            after: [chalk.red(`Installation failed, because of: "HTTP 404 Not Found"`)],
          })
        })

      })

      describe('the server responds a file', () => {

        const data = {
          pipe: jest.fn(),
          on: jest.fn().mockImplementation((listener, res) => {
            if (listener === 'end') {
              return res();
            }
          }),
        }

        const file = Symbol();

        beforeEach(async () => {
          data.pipe.mockReset()
          fs.ensureDirSync.mockReset()
          fs.createWriteStream.mockReset().mockReturnValue(file)

          get.mockImplementation(() => {
            log.mockReset().mockImplementation(m => logMessages.after.push(m))
            return of({data})
          })

          logMessages = {
            before: [],
            after: [],
          }

          log.mockReset().mockImplementation(m => logMessages.before.push(m))
          returnValue = await fixture.install('4.2.0')
        })

        it('returns false', () => {
          expect(returnValue).toBeTruthy()
        })

        it('logs the correct messages', () => {
          expect(logMessages).toEqual({
            before: [chalk.yellow(`Install 4.2.0 ...`)],
            after: [chalk.green(`Installed 4.2.0`)],
          })
        })

        describe('file saving', () => {

          it('ensures the save dir', () => {
            expect(fs.ensureDirSync).toHaveBeenNthCalledWith(1, fixture.storage)
          })

          it('creates the correct write stream', () => {
            expect(fs.createWriteStream).toHaveBeenNthCalledWith(1, `${fixture.storage}/4.2.0.jar`)
          })

          it('receives the data piped', () => {
            expect(data.pipe).toHaveBeenNthCalledWith(1, file)
          })

        })

      })

    })

  })

})
