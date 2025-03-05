import { Offset } from '../abstract_stream';
import { AbstractState, State } from '../state';
import { ClassicLevel } from 'classic-level';

type Options = { network: string };

export class LevelDbState extends AbstractState implements State {
  options: Required<Options>;
  initial?: string;

  constructor(
    private client: ClassicLevel,
    options: { id?: string },
  ) {
    super();

    this.options = {
      network: 'stream',
      ...options,
    };
  }

  async saveOffset(offset: Offset) {
    await this.client.put(
      this.options.network,
      {
        initial: this.initial,
        current: offset,
      },
      {valueEncoding: 'json'},
    );
  }

  async getOffset(defaultValue: Offset) {
    try {
      const {current, initial} = await this.client.get<string, any>(this.options.network, {
        valueEncoding: 'json',
      });
      this.initial = initial;

      return {current, initial};
    } catch (e: unknown) {
      this.initial = defaultValue;
      await this.saveOffset(defaultValue);

      return {current: defaultValue, initial: defaultValue};
    }
  }
}
