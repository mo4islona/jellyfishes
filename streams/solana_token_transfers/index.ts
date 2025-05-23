import { BlockRef, OptionalArgs, PortalAbstractStream } from '../../core/portal_abstract_stream';
import * as splToken from '../solana_swaps/abi/tokenProgram';

export type SolanaTokenTransfer = {
    id: string;                    // Unique identifier (transaction hash + instruction address)
    type: 'transfer';              // Event type
    direction: 'in' | 'out';       // Direction relative to the wallet
    account: string;               // Token account owned by the wallet
    transaction: {
        hash: string;
        index: number;
    };
    amount: bigint;                // Transfer amount
    mint: string;                  // Token mint address
    decimals: number;              // Token decimals
    counterparty: string;          // Other party in the transfer
    block: BlockRef;               // Block reference
    timestamp: Date;               // Transfer timestamp
    instruction: { address: number[] }; // Instruction address
};

export class SolanaTokenTransfersStream extends PortalAbstractStream<
    SolanaTokenTransfer,
    OptionalArgs<{
        wallet: string;
    }>
> {
    async stream(): Promise<ReadableStream<SolanaTokenTransfer[]>> {
        const wallet = this.options.args?.wallet;

        const walletTokenAccount = wallet;

        const source = await this.getStream({
            type: 'solana',
            fields: {
                block: {
                    number: true,
                    hash: true,
                    timestamp: true,
                },
                tokenBalance: {
                    transactionIndex: true,
                    account: true,
                    preMint: false,
                    postMint: true,
                    postDecimals: false,
                    preAmount: false,
                    postAmount: true,
                },
            },
            instructions: [
                {
                    programId: [splToken.programId],
                    isCommitted: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    a0: [walletTokenAccount],
                    d1: [splToken.instructions.transfer.d1]
                },
                {
                    programId: [splToken.programId],
                    isCommitted: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    a1: [walletTokenAccount],
                    d1: [splToken.instructions.transfer.d1]
                },
                {
                    programId: [splToken.programId],
                    isCommitted: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    a0: [walletTokenAccount],
                    d1: [splToken.instructions.transferChecked.d1]
                },
                {
                    programId: [splToken.programId],
                    isCommitted: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    a2: [walletTokenAccount],
                    d1: [splToken.instructions.transferChecked.d1]
                },
            ]

        });

        return source.pipeThrough(
            new TransformStream({
                transform: (data, controller) => {
                    const { blocks } = data;
                    const transfers: SolanaTokenTransfer[] = [];

                    for (const block of blocks) {
                        if (block.tokenBalances) {
                            for (const balance of block.tokenBalances) {
                                if (balance.account == walletTokenAccount) {
                                    controller.enqueue({
                                        timestamp: block.header.timestamp,
                                        newBalance: balance['postAmount']
                                    });
                                }
                            }
                        }
                    }
                },
            }),
        );
    }
}