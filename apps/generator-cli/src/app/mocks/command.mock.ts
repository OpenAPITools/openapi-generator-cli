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

  ensureCommand = () => {
    if (!this.commands[this.currentCommand]) {
      this.commands[this.currentCommand] = {
        self: this,
        description: '',
        allowUnknownOption: false,
        action: () => {},
        options: [],
      };
    }
  };

  action = jest.fn().mockImplementation((action) => {
    this.ensureCommand();
    this.commands[this.currentCommand].action = action;
    return this;
  });

  option = jest.fn().mockImplementation((flags, description, defaultValue) => {
    const options = this.commands[this.currentCommand]?.options ?? [];
    this.ensureCommand();
    this.commands[this.currentCommand].options = [
      ...options,
      {
        flags,
        description,
        defaultValue,
      },
    ];
    return this;
  });

  command = jest.fn().mockImplementation((cmd) => {
    this.currentCommand = cmd;
    this.refs[cmd] = this;
    return this;
  });

  allowUnknownOption = jest.fn().mockImplementation(() => {
    this.ensureCommand();
    this.commands[this.currentCommand].allowUnknownOption = true;
    return this;
  });

  description = jest.fn().mockImplementation((desc) => {
    this.ensureCommand();
    this.commands[this.currentCommand].description = desc;
    return this;
  });

  opts = jest.fn();
}
