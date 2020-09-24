import {get, set} from 'lodash';

export class CommandMockSpec {

  commands: {
    [key: string]: {
      self: CommandMockSpec,
      description: string
      action: (cmd) => unknown
      options: Array<{
        flags: string
        description: string
        defaultValue: string
      }>
    }
  } = {};

  refs: {
    [key: string]: CommandMockSpec
  } = {}

  private currentCommand: string

  helpInformation = jest.fn().mockReturnValue('some help text')

  action = jest.fn().mockImplementation(action => {
    set(this.commands, [this.currentCommand, 'action'], action);
    return this
  })

  option = jest.fn().mockImplementation((flags, description, defaultValue) => {
    const options = get(this.commands, [this.currentCommand, 'options'], [])

    set(this.commands, [this.currentCommand, 'options'], [
      ...options,
      {
        flags,
        description,
        defaultValue,
      }
    ]);
    return this
  })

  command = jest.fn().mockImplementation(cmd => {
    this.currentCommand = cmd
    this.refs[cmd] = this
    return this
  })

  description = jest.fn().mockImplementation(desc => {
    set(this.commands, [this.currentCommand, 'description'], desc);
    return this
  })

  opts = jest.fn()

}
