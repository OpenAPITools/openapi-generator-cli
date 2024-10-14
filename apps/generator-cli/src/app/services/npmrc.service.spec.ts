import { Test } from '@nestjs/testing';
import { Command, createCommand } from 'commander';
import { NpmrcService } from './npmrc.service';
import { LOGGER, COMMANDER_PROGRAM } from '../constants';
import * as path from 'path';

jest.mock('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = jest.mocked(require('fs-extra'));

describe('NpmrcService', () => {
  let fixture: NpmrcService;

  const log = jest.fn();

  beforeEach(async () => {

    const moduleRef = await Test.createTestingModule({
      providers: [
        NpmrcService,
        { provide: LOGGER, useValue: { log } },
      ],
    }).compile();

    fixture = moduleRef.get(NpmrcService);
  });

  describe('API', () => {

    describe('getStrictSsl()', () => {

      describe('npmrc file does not exists', () => {
        let savedHome: string;
        beforeEach(() => {
          fixture.clear();
          savedHome = process.env.HOME;
          process.env.HOME = '/home/user';
          fs.existsSync
            .mockReset()
            .mockReturnValue(false);
        });

        afterEach(() => {
          process.env.HOME = savedHome;
        });

        it('should return true', () => {
          expect(fixture.getStrictSsl()).toBeTruthy();
        });
      });
  
      describe.each([
        ['empty file', '', true],
        ['commented line', '#strict-ssl=false', true],
        ['strict-ssl set to true', 'strict-ssl=true', true],
        ['strict-ssl set to false', 'strict-ssl=false', false],
        [
          'npmrc has multiple lines',
          `
          first line
          second line
          strict-ssl=false
          `,
          false
        ],
      ])('%s', (_, npmrcFileContents, expectation) => {
        describe('npmrc file exists', () => {
          let savedHome: string;
          beforeEach(() => {
            fixture.clear();
            savedHome = process.env.HOME;
            process.env.HOME = '/home/user';
            fs.existsSync
              .mockReset()
              .mockReturnValue(npmrcFileContents);
            fs.readFileSync
              .mockReset()
              .mockReturnValue(npmrcFileContents);
          });

          afterEach(() => {
            process.env.HOME = savedHome;
          });

          it(`should return true ${expectation}`, () => {
            expect(fixture.getStrictSsl()).toEqual(expectation);
          });
        });
      });
    });

    
    describe('getAuthToken()', () => {
  
      describe.each([
        [
          'undefined file',
          'https://testrepository.com',
          undefined,
          null
        ],
        [
          'commented line',
          'https://testrepository.com',
          '#//testrepository.com/npm/proxy/:_authToken=NpmToken.01',
          null
        ],
        [
          'base url matches',
          'https://testrepository.com',
          '//testrepository.com/npm/proxy/:_authToken=NpmToken.01',
          'NpmToken.01'
        ],
        [
          'base url does not match',
          'https://anotherrepository.com',
          '//testrepository.com/npm/proxy/:_authToken=NpmToken.01',
          null
        ],
        [
          'have a comme base url',
          'https://testrepository.com/mvn',
          '//testrepository.com/npm/proxy/:_authToken=NpmToken.01',
          'NpmToken.01'
        ],
      ])('%s', (_, url, npmrcFileContents, expectation) => {
        describe('npmrc file exists', () => {
          let savedHome: string;
          beforeEach(() => {
            fixture.clear();
            savedHome = process.env.HOME;
            process.env.HOME = '/home/user';
            fs.existsSync
              .mockReset()
              .mockReturnValue(npmrcFileContents);
            fs.readFileSync
              .mockReset()
              .mockReturnValue(npmrcFileContents);
          });

          afterEach(() => {
            process.env.HOME = savedHome;
          });

          it(`should return true ${expectation}`, () => {
            expect(fixture.getAuthToken(url)).toEqual(expectation);
          });
        });
      });
    });
    
  });
});
