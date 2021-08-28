import {Test} from '@nestjs/testing';
import {PassThroughService} from './pass-through.service';
import {mocked} from 'ts-jest/utils';
import {COMMANDER_PROGRAM, LOGGER} from '../constants';
import {VersionManagerService} from './version-manager.service';
import {noop} from 'rxjs';
import {CommandMock} from '../mocks/command.mock';
import {PassthroughCommandMock} from '../mocks/passthrough-command.mock';
import {GeneratorService} from './generator.service';

jest.mock('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const childProcess = mocked(require('child_process'), true)

describe('PassThroughService', () => {

  let fixture: PassThroughService;
  let commandMock: CommandMock;

  const log = jest.fn()
  const generate = jest.fn().mockResolvedValue(true)
  const getSelectedVersion = jest.fn().mockReturnValue('4.2.1');
  const filePath = jest.fn().mockReturnValue(`/some/path/to/4.2.1.jar`);

  beforeEach(async () => {
    commandMock = new CommandMock()

    const moduleRef = await Test.createTestingModule({
      providers: [
        PassThroughService,
        {provide: VersionManagerService, useValue: {filePath, getSelectedVersion}},
        {provide: GeneratorService, useValue: {generate, enabled: true}},
        {provide: COMMANDER_PROGRAM, useValue: commandMock},
        {provide: LOGGER, useValue: {log}},
      ],
    }).compile();

    fixture = moduleRef.get(PassThroughService);
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

        const completionText = [
          '  list',
          '  generate',
          '  meta',
          '  help',
          '  config-help',
          '  validate',
          '  version',
          '  completion',
          '  batch',
          '  --version',
          '  --help',
        ].join('\n')

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) => {
            if(cmd.endsWith('"/some/path/to/4.2.1.jar" help')) {
              cb(undefined, helpText)
            }

            if(cmd.endsWith('"/some/path/to/4.2.1.jar" completion')) {
              cb(undefined, completionText)
            }
          })
          await fixture.init()
        })

        it('adds 19 commands', () => {
          expect(commandMock.action).toBeCalledTimes(10)
          expect(commandMock.command).toBeCalledTimes(10)
          expect(commandMock.description).toBeCalledTimes(10)
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
          ['batch', ''],
          ['completion', ''],
        ])('%s', (cmd, desc) => {

          let cmdMock: PassthroughCommandMock;

          beforeEach(() => {
            cmdMock = new PassthroughCommandMock(cmd, ['foo', 'baz']);
            const on = jest.fn();
            childProcess.spawn.mockReset().mockReturnValue({on})
          })

          it('adds the correct description', () => {
            expect(commandMock.commands[cmd].description).toEqual(desc)
          })

          it('allows unknown options', () => {
            expect(commandMock.commands[cmd].allowUnknownOption).toBeTruthy()
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

          it('can delegate with custom jar', () => {
            delete process.env['JAVA_OPTS'];
            const args = [...cmdMock.args];
            cmdMock.args.push('--custom-generator=../some/custom.jar');
            commandMock.commands[cmd].action(cmdMock)
            const cpDelimiter = process.platform === "win32" ? ';' : ':';
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              `java -cp "${['/some/path/to/4.2.1.jar', '../some/custom.jar'].join(cpDelimiter)}" org.openapitools.codegen.OpenAPIGenerator`,
              [cmd, ...args],
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
              const logSpy = jest.spyOn(console, 'log').mockImplementation(noop)
              commandMock.commands[cmd].action(cmdMock)
              expect(childProcess.spawn).toBeCalledTimes(0)
              expect(commandMock.helpInformation).toBeCalledTimes(1)
              expect(logSpy).toHaveBeenCalledTimes(2);
              expect(logSpy).toHaveBeenNthCalledWith(1, 'some help text');
              expect(logSpy).toHaveBeenNthCalledWith(2, 'has custom generator');
            })
          }

          if (cmd === 'generate') {
            it('generates by using the generator config', () => {
              childProcess.spawn.mockReset()
              cmdMock.args = []
              commandMock.commands[cmd].action(cmdMock)
              expect(childProcess.spawn).toBeCalledTimes(0)
              expect(generate).toBeCalledTimes(1);
            })
          }

        })

      })

    })

  })

})
