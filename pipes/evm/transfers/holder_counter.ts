import { Logger as PinoLogger, pino } from 'pino';

export type Logger = PinoLogger;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type TokenHolders = {
  token: string;
  holderCount: number;
};

export type HoldersChangedCallback = (timestamp: string, holders: TokenHolders[]) => void;

export class HolderCounter {
  private logger: Logger;
  private firstTransferFrom = new Map<string, string>(); // token address -> first from address
  private balances = new Map<string, Map<string, bigint>>(); // token -> address -> balance
  private holderCount = new Map<string, number>(); // token -> holders
  private lastStartOfFiveMinutesCallbackTimestamp?: Date;

  constructor(
    logger: Logger,
    private callback: HoldersChangedCallback,
  ) {
    this.logger = logger.child({
      module: 'HolderCounter',
    });
  }

  public async processTransfer(transfer: any) {
    const from = transfer.from;
    const to = transfer.to;
    const token = transfer.token;
    const amount = BigInt(transfer.amount);

    const firstFrom = this.firstTransferFrom.get(token);
    if (firstFrom === undefined) {
      this.firstTransferFrom.set(token, from);

      if (from !== ZERO_ADDRESS) {
        return;
      }
    } else {
      if (firstFrom !== ZERO_ADDRESS) {
        return;
      }
    }

    let newHolderCount = this.holderCount.get(token) || 0;

    // from balance handle
    if (from !== ZERO_ADDRESS) {
      const oldFromBal = this.getBalance(token, from);
      const newFromBal = oldFromBal - amount;
      if (newFromBal < 0) {
        //this.logger.error(`balance of token ${token} of account ${from} is less than zero`);
        return;
      }
      if (oldFromBal > 0 && newFromBal === 0n) {
        newHolderCount--;
      }
      this.setBalance(token, from, newFromBal);
    }

    // to balance change
    if (to !== ZERO_ADDRESS) {
      const oldToBal = this.getBalance(token, to);
      const newToBal = oldToBal + amount;

      if (oldToBal === 0n && newToBal > 0n) {
        newHolderCount++;
      }
      this.holderCount.set(token, newHolderCount);
      this.setBalance(token, to, newToBal);
    }

    const startOf5Min = this.toStartOfFiveMinutes(this.parseTimestamp(transfer.timestamp));
    if (
      this.lastStartOfFiveMinutesCallbackTimestamp === undefined ||
      this.lastStartOfFiveMinutesCallbackTimestamp < startOf5Min
    ) {
      this.lastStartOfFiveMinutesCallbackTimestamp = startOf5Min;
      const timestamp = this.formatTimestamp(startOf5Min);

      const holders = Array.from(this.holderCount.entries()).map(([token, holderCount]) => ({
        token,
        holderCount,
      }));

      this.callback(timestamp, holders);
    }
  }

  printState() {
    const tokenBalances = Array.from(this.balances.values());
    let maxTokenOwners = 0;
    let minTokenOwners = Number.MAX_VALUE;
    let totalOwners = 0;
    for (let i = 0; i < tokenBalances.length; i++) {
      maxTokenOwners = Math.max(maxTokenOwners, tokenBalances[i].size);
      minTokenOwners = Math.min(maxTokenOwners, tokenBalances[i].size);
      totalOwners += tokenBalances[i].size;
    }
    this.logger.info(
      [
        `Tokens tracked: ${this.holderCount.size}`,
        `First transfers: ${this.firstTransferFrom.size}`,
        `Max token holders: ${maxTokenOwners}`,
        `Min token holders: ${minTokenOwners}`,
        `Avg. token holders: ${Math.floor(totalOwners / tokenBalances.length)}`,
      ].join('\n'),
    );
  }

  private parseTimestamp(dateString: string): Date {
    // Split the date string into date and time parts
    const [datePart, timePart] = dateString.split(' ');
    // Combine with 'T' for ISO format and add 'Z' for UTC
    const isoString = `${datePart}T${timePart}Z`;
    return new Date(isoString);
  }

  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, -5);
  }

  private toStartOfFiveMinutes(date: Date): Date {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      Math.floor(date.getMinutes() / 5) * 5,
      0,
      0,
    );
  }

  private getBalance(token: string, address: string): bigint {
    const tokenBalances = this.balances.get(token);
    if (tokenBalances === undefined) {
      return 0n;
    }
    return tokenBalances.get(address) || 0n;
  }

  private setBalance(token: string, address: string, balance: bigint) {
    let tokenBalances: Map<string, bigint> | undefined;

    tokenBalances = this.balances.get(token);
    if (tokenBalances === undefined) {
      if (balance === 0n) {
        return;
      }
      tokenBalances = new Map<string, bigint>();
      this.balances.set(token, tokenBalances);
    }

    tokenBalances.set(address, balance);
  }
}
