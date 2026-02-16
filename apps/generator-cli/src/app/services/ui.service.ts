// import ora from 'ora'
import { Injectable } from '@nestjs/common';
import select, { Separator } from '@inquirer/select';
import { getTable } from 'console.table';
import { dim } from 'chalk';

@Injectable()
export class UIService {
  public async table<T>(config: {
    message: string;
    printColNum?: boolean;
    rows: Array<{ row: Record<string, string>; short: string; value: T }>;
  }): Promise<T> {
    const table: string = getTable(
      config.rows.map(({ row }, index: number) => {
        return config.printColNum === false ? row : { '#': index + 1, ...row };
      }),
    );

    const [header, separator, ...rows] = table.trim().split('\n');
    return this.list({
      message: config.message,
      choices: [
        new Separator(dim(header)),
        new Separator(dim(separator)),
        ...rows.map((name, index) => ({
          name,
          short: config.rows[index].short,
          value: config.rows[index].value,
        })),
        new Separator(dim(separator)),
        new Separator(dim(' '.repeat(separator.length))),
      ],
    });
  }

  public async list<T>(config: {
    message: string;
    choices: Array<{ name: string; short?: string; value: T } | Separator>;
  }): Promise<T> {
    const pageSize = Math.max(1, process.stdout.rows - 2);
    try {
      const res = await select({
        pageSize,
        message: config.message,
        choices: config.choices,
      });

      return res;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('User force closed the prompt with')) {
        process.exit(0);
      }
      throw err;
    }
  }
}
