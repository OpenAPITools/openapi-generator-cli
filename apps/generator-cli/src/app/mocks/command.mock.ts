import { get, set } from 'lodash';

export class CommandMock {

  commands: {
    [key: string]: {
      self: CommandMock,
      description: string
      allowUnknownOption: boolean
      action: (cmd) => unknown
      options: Array<{
        flags: string
        description: string
        defaultValue: string
      }>
    }
  } = {};

  refs: {
    [key: string]: CommandMock
  } = {};

  private currentCommand: string;

  helpInformation = jest.fn().mockReturnValue('some help text');

  action = jest.fn().mockImplementation(action => {
    set(this.commands, [this.currentCommand, 'action'], action);
    return this;
  });

  option = jest.fn().mockImplementation((flags, description, defaultValue) => {
    const options = get(this.commands, [this.currentCommand, 'options'], []);

    set(this.commands, [this.currentCommand, 'options'], [
      ...options,
      {
        flags,
        description,
        defaultValue
      }
    ]);
    return this;
  });

  command = jest.fn().mockImplementation(cmd => {
    this.currentCommand = cmd;
    this.refs[cmd] = this;
    return this;
  });

  allowUnknownOption = jest.fn().mockImplementation(() => {
    set(this.commands, [this.currentCommand, 'allowUnknownOption'], true);
    return this;
  });

  description = jest.fn().mockImplementation(desc => {
    set(this.commands, [this.currentCommand, 'description'], desc);
    return this;
  });

  opts = jest.fn();

}
