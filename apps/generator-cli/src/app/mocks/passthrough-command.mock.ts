export class PassthroughCommandMock {
  name = jest.fn().mockReturnValue(this._name);
  options: Record<string, string> = {};

  parseOptions = jest.fn().mockImplementation(() => {
    const result = this.args.find(a => a.startsWith('--custom-generator'))?.split('=')[1];
    this.options.customGenerator = result || undefined;
    this.args = this.args.filter(a => !a.startsWith('--custom-generator'));
    return this.opts();
  });

  helpInformation = jest.fn().mockReturnValue('has custom generator');

  opts = jest.fn().mockImplementation(() => ({ ...this.options, unknown: this.args}));

  constructor(private _name: string, public args: string[]) { }
}
