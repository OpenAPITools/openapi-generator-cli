import {Test} from '@nestjs/testing';
import {PassTroughService} from './pass-trough.service';
import {mocked} from 'ts-jest/utils';
import {set} from 'lodash';
import {COMMANDER_PROGRAM} from '../constants';
import {VersionManagerService} from './version-manager.service';
import {noop} from 'rxjs';

jest.mock('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const childProcess = mocked(require('child_process'), true)

class CommandMock {

  commands: {
    [key: string]: {
      description: string
      action: (cmd) => unknown
    }
  } = {};

  private currentCommand: string

  helpInformation = jest.fn().mockReturnValue('some help text')

  action = jest.fn().mockImplementation((action) => {
    set(this.commands, [this.currentCommand, 'action'], action);
    return this
  })

  command = jest.fn().mockImplementation((cmd) => {
    this.currentCommand = cmd
    return this
  })

  description = jest.fn().mockImplementation((desc) => {
    set(this.commands, [this.currentCommand, 'description'], desc);
    return this
  })

}

describe('PassTroughService', () => {

  let fixture: PassTroughService;
  let commandMock: CommandMock;

  const getSelectedVersion = jest.fn().mockReturnValue('4.2.1');
  const filePath = jest.fn().mockImplementation(v => `/some/path/to/${v}.jar`);

  beforeEach(async () => {
    commandMock = new CommandMock()

    const moduleRef = await Test.createTestingModule({
      providers: [
        PassTroughService,
        {provide: VersionManagerService, useValue: {filePath, getSelectedVersion}},
        {provide: COMMANDER_PROGRAM, useValue: commandMock},
      ],
    }).compile();

    fixture = moduleRef.get(PassTroughService);
  });

  describe('API', () => {

    describe('init', () => {

      describe('the help command failed', () => {

        let error: Error

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) => cb(true, undefined, 'Some error'))
          try {
            await fixture.init()
          } catch (e) {
            error = e;
          }
        })

        it('throw the error', () => {
          expect(error.message).toEqual('Some error')
        })

        it('adds no commands', () => {
          expect(commandMock.action).toBeCalledTimes(0)
          expect(commandMock.command).toBeCalledTimes(0)
          expect(commandMock.description).toBeCalledTimes(0)
        })
      });

      describe('the help command works', () => {

        const helpText = [
          'usage: openapi-generator-cli <command> [<args>]',
          '',
          'The most commonly used openapi-generator-cli commands are:',
          '    author        Utilities for authoring generators or customizing templates.',
          '    config-help   Config help for chosen lang',
          '    generate      Generate code with the specified generator.',
          '    help          Display help information about openapi-generator',
          '    list          Lists the available generators',
          '    meta          MetaGenerator. Generator for creating a new template set and configuration for Codegen.  The output will be based on the language you specify, and includes default templates to include.',
          '    validate      Validate specification',
          '    version       Show version information used in tooling',
          '',
          `See 'openapi-generator-cli help <command>' for more information on a specific`,
          'command.'
        ].join('\n')

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) => cb(undefined, helpText))
          await fixture.init()
        })

        it('adds 6 commands', () => {
          expect(commandMock.action).toBeCalledTimes(8)
          expect(commandMock.command).toBeCalledTimes(8)
          expect(commandMock.description).toBeCalledTimes(8)
        })

        describe.each([
          ['author', 'Utilities for authoring generators or customizing templates.'],
          ['config-help', 'Config help for chosen lang'],
          ['generate', 'Generate code with the specified generator.'],
          ['help', 'Display help information about openapi-generator'],
          ['list', 'Lists the available generators'],
          ['meta', 'MetaGenerator. Generator for creating a new template set and configuration for Codegen.  The output will be based on the language you specify, and includes default templates to include.'],
          ['validate', 'Validate specification'],
          ['version', 'Show version information used in tooling'],
        ])('%s', (cmd, desc) => {

          const cmdMock = {name: () => cmd, args: ['foo', 'baz']};

          beforeEach(() => {
            const on = jest.fn();
            childProcess.spawn.mockReset().mockReturnValue({on})
          })

          it('adds the correct description', () => {
            expect(commandMock.commands[cmd].description).toEqual(desc)
          })

          it('can delegate with JAVA_OPTS', () => {
            process.env['JAVA_OPTS'] = 'java-opt-1=1'
            commandMock.commands[cmd].action(cmdMock)

            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              'java java-opt-1=1 -jar "/some/path/to/4.2.1.jar"',
              [cmd, ...cmdMock.args],
              {
                stdio: 'inherit',
                shell: true
              }
            )
          })

          it('can delegate without JAVA_OPTS', () => {
            delete process.env['JAVA_OPTS']
            commandMock.commands[cmd].action(cmdMock)

            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              'java -jar "/some/path/to/4.2.1.jar"',
              [cmd, ...cmdMock.args],
              {
                stdio: 'inherit',
                shell: true
              }
            )
          })

          if (cmd === 'help') {
            it('prints the help info and does not delegate, if args length = 0', () => {
              childProcess.spawn.mockReset()
              cmdMock.args = []
              const logSpy = jest.spyOn(console, 'log').mockImplementationOnce(noop)
              commandMock.commands[cmd].action(cmdMock)
              expect(childProcess.spawn).toBeCalledTimes(0)
              expect(commandMock.helpInformation).toBeCalledTimes(1)
              expect(logSpy).toHaveBeenNthCalledWith(1, 'some help text')
            })
          }

        })

      })

    })

  })

})
