import {Test} from '@nestjs/testing';
import {ConfigService} from './config.service';
import {mocked} from 'ts-jest/utils';
import {LOGGER} from '../constants';

jest.mock('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = mocked(require('fs-extra'), true)

describe('ConfigService', () => {

  let fixture: ConfigService;

  const log = jest.fn()

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfigService,
        {provide: LOGGER, useValue: {log}},
      ],
    }).compile();

    fixture = moduleRef.get(ConfigService);
    fs.writeJSONSync.mockReset()
    fs.readJSONSync.mockReset()
    fs.ensureFileSync.mockReset()
  });

  describe('API', () => {

    describe('get()', () => {

      describe.each([
        ['the config is undefined', undefined],
        ['the config empty', {}],
      ])('%s', (_, config) => {

        beforeEach(() => {
          fs.readJSONSync.mockReturnValue(config)
        })

        it.each([
          ['$schema', 'node_modules/@openapitools/openapi-generator-cli/config.schema.json'],
          ['spaces', 2],
          ['generator-cli', {version: undefined}],
        ])('the key "%s" returns %s as default', (key, expectedValue) => {
          expect(fixture.get(key)).toEqual(expectedValue)
        })

        it('can return a default value', () => {
          expect(fixture.get('unknown', 'foo')).toEqual('foo')
        })

      })

      describe('the config has values', () => {

        beforeEach(() => {
          fs.readJSONSync.mockReturnValue({
            $schema: 'foo.json',
            spaces: 4,
            'generator-cli': {
              version: '1.2.3',
            },
          })
        })

        it('ensures the config file', () => {
          fixture.get('some-path')
          expect(fs.ensureFileSync).toHaveBeenNthCalledWith(1, fixture.configFile)
        })

        it.each([
          ['$schema', 'foo.json'],
          ['spaces', 4],
          ['generator-cli', {version: '1.2.3'}],
          ['generator-cli.version', '1.2.3'],
        ])('"%s" returns %s as default', (key, expectedValue) => {
          expect(fixture.get(key)).toEqual(expectedValue)
          expect(fs.readJSONSync).toHaveBeenNthCalledWith(1, fixture.configFile, {throws: false, encoding: 'utf8'})
        })

      })

    })

    describe('has()', () => {

      beforeEach(() => {
        fs.readJSONSync.mockReturnValue({
          propFalsy: false,
          propUndefined: undefined,
          propNull: null,
        })
      })

      it('returns true, if the prop is set', () => {
        expect(fixture.has('propFalsy')).toBeTruthy()
        expect(fixture.has('propUndefined')).toBeTruthy()
        expect(fixture.has('propNull')).toBeTruthy()
      })

      it('returns false, if the value is set', () => {
        expect(fixture.has('foo')).toBeFalsy()
      })


    })

    describe('set()', () => {
      beforeEach(() => {
        fs.readJSONSync.mockReturnValue({
          $schema: 'foo.json',
          spaces: 4,
          'generator-cli': {
            version: '1.2.3',
          },
        })

        fixture.set('generator-cli.version', '4.5.6')
      })

      it('ensures the config file', () => {
        expect(fs.ensureFileSync).toHaveBeenNthCalledWith(1, fixture.configFile)
      })

      it('saves the correct value', () => {
        expect(fs.writeJSONSync).toHaveBeenNthCalledWith(1,
          fixture.configFile,
          {
            $schema: 'foo.json',
            spaces: 4,
            'generator-cli': {
              version: '4.5.6',
            },
          }, {
            encoding: 'utf8',
            spaces: 4,
          }
        )
      })

    })

  })

})
