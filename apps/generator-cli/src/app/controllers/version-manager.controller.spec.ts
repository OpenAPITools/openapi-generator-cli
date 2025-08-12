import { Test } from '@nestjs/testing';
import { VersionManagerController } from './version-manager.controller';
import { CommandMock } from '../mocks/command.mock';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import { UIService, VersionManagerService } from '../services';
import { of } from 'rxjs';
import chalk from 'chalk';

jest.mock('fs-extra');

describe('VersionManagerController', () => {
  let commandMock: CommandMock;

  const log = jest.fn();

  const uiServiceMock = {
    table: jest.fn(),
    list: jest.fn(),
  };

  const versionManagerServiceMock = {
    setSelectedVersion: jest.fn(),
    isSelectedVersion: jest.fn(),
    downloadIfNeeded: jest.fn(),
    download: jest.fn(),
    remove: jest.fn(),
    search: jest.fn(),
  };

  beforeEach(async () => {
    commandMock = new CommandMock();

    [
      log,
      ...Object.values(uiServiceMock),
      ...Object.values(versionManagerServiceMock),
    ].forEach((spy) => spy.mockReset());

    await Test.createTestingModule({
      controllers: [VersionManagerController],
      providers: [
        { provide: UIService, useValue: uiServiceMock },
        { provide: VersionManagerService, useValue: versionManagerServiceMock },
        { provide: COMMANDER_PROGRAM, useValue: commandMock },
        { provide: LOGGER, useValue: { log } },
      ],
    }).compile();
  });

  it('adds 3 commands, but 2 actions', () => {
    expect(commandMock.action).toHaveBeenCalledTimes(2);
    expect(commandMock.command).toHaveBeenCalledTimes(3);
    expect(commandMock.description).toHaveBeenCalledTimes(3);
  });

  describe('commands', function () {
    let cmd: (typeof commandMock.commands)[string];

    describe('list', () => {
      const versions = [
        {
          version: '1.2.3',
          installed: true,
          versionTags: ['latest', 'stable', '1'],
          releaseDate: new Date('2020-09-24T14:30:15.189Z'),
        },
        {
          version: '1.2.4',
          installed: true,
          versionTags: ['stable', '1'],
          releaseDate: new Date('2020-09-21T14:30:15.189Z'),
        },
        {
          version: '0.5.6',
          installed: false,
          versionTags: ['beta', '4.5'],
          releaseDate: new Date('2020-09-22T14:30:15.189Z'),
        },
      ];

      beforeEach(() => {
        versionManagerServiceMock.search.mockReturnValue(of(versions));
        cmd = commandMock.commands['list [versionTags...]'];
      });

      it('has the correct description', () => {
        expect(cmd.description).toEqual('lists all published versions');
      });

      it('has the options', () =>
        expect(cmd.options).toEqual([
          {
            flags: '-j, --json',
            description: 'print as json',
            defaultValue: false,
          },
        ]));

      describe('the --json flag is set', () => {
        beforeEach(async () => {
          commandMock.refs['list [versionTags...]'].opts.mockReturnValue({
            json: true,
          });
          await cmd.action(['tag1', 'tag2']);
        });

        it.each([
          'isSelectedVersion',
          'download',
          'remove',
          'setSelectedVersion',
        ])('does not call version manager %s', (fn) => {
          expect(versionManagerServiceMock[fn]).toHaveBeenCalledTimes(0);
        });

        it('does not print a table', () => {
          expect(uiServiceMock.table).toHaveBeenCalledTimes(0);
        });

        it('does not print a list', () => {
          expect(uiServiceMock.list).toHaveBeenCalledTimes(0);
        });

        it('prints the result as json', () => {
          expect(log).toHaveBeenNthCalledWith(
            1,
            JSON.stringify(versions, null, 2),
          );
        });
      });

      describe('the --json flag is not set', () => {
        const whatsNextSpy = jest.fn();

        beforeEach(async () => {
          whatsNextSpy.mockReset();
          uiServiceMock.table.mockReset().mockResolvedValue(versions[0]);
          uiServiceMock.list.mockReset().mockResolvedValue(whatsNextSpy);
          versionManagerServiceMock.isSelectedVersion.mockImplementationOnce(
            (v) => v === '1.2.3',
          );
          commandMock.refs['list [versionTags...]'].opts
            .mockReset()
            .mockReturnValue({ json: false });
          await cmd.action(['tag1', 'tag2']);
        });

        it('prints the table once', () => {
          expect(uiServiceMock.table).toHaveBeenNthCalledWith(1, {
            printColNum: false,
            message: 'The following releases are available:',
            name: 'version',
            rows: [
              {
                value: versions[0],
                short: versions[0].version,
                row: {
                  '☐': '☒',
                  releasedAt: '2020-09-24',
                  version: chalk.yellow(versions[0].version),
                  versionTags: `${chalk.green('latest')} stable 1`,
                  installed: chalk.green('yes'),
                },
              },
              {
                value: versions[1],
                short: versions[1].version,
                row: {
                  '☐': '☐',
                  releasedAt: '2020-09-21',
                  version: chalk.yellow(versions[1].version),
                  versionTags: `stable 1`,
                  installed: chalk.green('yes'),
                },
              },
              {
                value: versions[2],
                short: versions[2].version,
                row: {
                  '☐': '☐',
                  releasedAt: '2020-09-22',
                  version: chalk.gray(versions[2].version),
                  versionTags: `beta 4.5`,
                  installed: chalk.red('no'),
                },
              },
            ],
          });
        });

        it('prints "No results for ..., if no versions are found', async () => {
          versionManagerServiceMock.search.mockReturnValue(of([]));
          await cmd.action(['tag1', 'tag2']);
          expect(log).toHaveBeenNthCalledWith(
            1,
            chalk.red('No results for: tag1 tag2'),
          );
        });

        describe('the selection is installed and in use', () => {
          let choices: Array<{
            name: Record<string, unknown>;
            value: () => unknown;
          }>;

          beforeEach(async () => {
            whatsNextSpy.mockReset();

            uiServiceMock.list.mockClear().mockImplementation((opts) => {
              choices = opts.choices;
              return whatsNextSpy;
            });

            uiServiceMock.table.mockReset().mockResolvedValue(versions[0]);
            versionManagerServiceMock.isSelectedVersion.mockReturnValue(true);
            await cmd.action(['tag1', 'tag2']);
          });

          it('provides the correct choices', () => {
            expect(choices).toHaveLength(1);
            expect(choices[0].name).toEqual('exit');
          });
        });

        describe('the selection is installed but not in use', () => {
          let choices: Array<{
            name: Record<string, unknown>;
            value: () => unknown;
          }>;

          beforeEach(async () => {
            whatsNextSpy.mockReset();

            uiServiceMock.list.mockClear().mockImplementation((opts) => {
              choices = opts.choices;
              return whatsNextSpy;
            });

            uiServiceMock.table.mockReset().mockResolvedValue(versions[1]);
            versionManagerServiceMock.isSelectedVersion.mockReturnValue(false);
            await cmd.action(['tag1', 'tag2']);
          });

          it('provides the correct choices', () => {
            expect(choices).toHaveLength(3);
            expect(choices.map(({ name }) => name)).toEqual([
              chalk.green('use'),
              chalk.red('remove'),
              'exit',
            ]);
          });
        });

        describe('the selection is not installed and not in use', () => {
          let choices: Array<{
            name: Record<string, unknown>;
            value: () => unknown;
          }>;

          beforeEach(async () => {
            whatsNextSpy.mockReset();

            uiServiceMock.list.mockClear().mockImplementation((opts) => {
              choices = opts.choices;
              return whatsNextSpy;
            });

            uiServiceMock.table.mockReset().mockResolvedValue(versions[2]);
            versionManagerServiceMock.isSelectedVersion.mockReturnValue(false);
            await cmd.action(['tag1', 'tag2']);
          });

          it('provides the correct choices', () => {
            expect(choices).toHaveLength(3);
            expect(choices.map(({ name }) => name)).toEqual([
              chalk.green('use'),
              chalk.yellow('download'),
              'exit',
            ]);
          });
        });
      });
    });

    describe('set', () => {
      beforeEach(() => {
        cmd = commandMock.commands['set <versionTags...>'];
      });

      it('sets version[0] from the list', async () => {
        versionManagerServiceMock.search.mockReturnValue(
          of([
            { version: '1.2.3' },
            { version: '1.2.4' },
            { version: '0.5.6' },
          ]),
        );

        await cmd.action(['tag1', 'tag2']);
        expect(
          versionManagerServiceMock.setSelectedVersion,
        ).toHaveBeenNthCalledWith(1, '1.2.3');
      });

      it('prints a message, if the search result is empty', async () => {
        versionManagerServiceMock.search.mockReturnValue(of([]));
        await cmd.action(['tag1', 'tag2']);
        expect(log).toHaveBeenNthCalledWith(
          1,
          chalk.red('Unable to find version matching criteria "tag1 tag2"'),
        );
      });
    });
  });
});
