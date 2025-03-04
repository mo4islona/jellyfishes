import { Offset } from '../abstract_stream';
import { AbstractState, State } from '../state';
import { ClassicLevel } from 'classic-level';

type Options = { id: string };

export class LevelDbState extends AbstractState implements State {
  options: Required<Options>;
  initial?: string;

  constructor(
    private client: ClassicLevel,
    options: { id?: string },
  ) {
    super();

    this.options = {
      id: 'stream',
      ...options,
    };
  }

  async saveOffset(offset: Offset) {
    await this.client.put(
      this.options.id,
      JSON.stringify({
        initial: this.initial,
        offset: offset,
      }),
      {valueEncoding: 'json'},
    );
  }

  async getOffset(defaultValue: Offset) {
    try {
      const res = await this.client.get(this.options.id, {valueEncoding: 'json'});

      return res as any;
    } catch (e: unknown) {
      this.initial = defaultValue;
      await this.saveOffset(defaultValue);

      return {current: defaultValue, initial: defaultValue};
    }
  }
}
