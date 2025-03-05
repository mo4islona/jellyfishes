import {struct, u64, address, string, unit} from '@subsquid/borsh'
import {instruction} from '../abi.support'

export interface CreateAccount {
    lamports: bigint
    space: bigint
    owner: string
}

export const createAccount = instruction(
    {
        d4: '0x00000000',
    },
    {
        fundingAccount: 0,
        newAccount: 1,
    },
    struct({
        lamports: u64,
        space: u64,
        owner: address,
    }),
)

export interface Assign {
    owner: string
}

export const assign = instruction(
    {
        d4: '0x01000000',
    },
    {
        assignAccount: 0,
    },
    struct({
        owner: address,
    }),
)

export interface Transfer {
    lamports: bigint
}

export const transfer = instruction(
    {
        d4: '0x02000000',
    },
    {
        source: 0,
        destination: 1,
    },
    struct({
        lamports: u64,
    }),
)

export interface CreateAccountWithSeed {
    base: string
    seed: string
    lamports: bigint
    space: bigint
    owner: string
}

export const createAccountWithSeed = instruction(
    {
        d4: '0x03000000',
    },
    {
        fundingAccount: 0,
        createdAccount: 1,
        baseAccount: 2,
    },
    struct({
        base: address,
        seed: string,
        lamports: u64,
        space: u64,
        owner: address,
    }),
)

export type AdvanceNonceAccount = undefined

export const advanceNonceAccount = instruction(
    {
        d4: '0x04000000',
    },
    {
        nonceAccount: 0,
        recentBlockhashesSysvar: 1,
        nonceAuthority: 2,
    },
    unit,
)

export interface WithdrawNonceAccount {
    withdrawAmount: bigint
}

export const withdrawNonceAccount = instruction(
    {
        d4: '0x05000000',
    },
    {
        nonceAccount: 0,
        recipientAccount: 1,
        recentBlockhashesSysvar: 2,
        rentSysvar: 3,
        nonceAuthority: 4,
    },
    struct({
        withdrawAmount: u64,
    }),
)

export interface InitializeNonceAccount {
    nonceAccount: string
}

export const initializeNonceAccount = instruction(
    {
        d4: '0x06000000',
    },
    {
        nonceAccount: 0,
        recentBlockhashesSysvar: 1,
        rentSysvar: 2,
    },
    struct({
        nonceAccount: address,
    }),
)

export interface AuthorizeNonceAccount {
    nonceAccount: string
}

export const authorizeNonceAccount = instruction(
    {
        d4: '0x07000000',
    },
    {
        nonceAccount: 0,
        nonceAuthority: 1,
    },
    struct({
        nonceAccount: address,
    }),
)

export interface Allocate {
    space: bigint
}

export const allocate = instruction(
    {
        d4: '0x08000000',
    },
    {
        newAccount: 0,
    },
    struct({
        space: u64,
    }),
)

export interface AllocateWithSeed {
    base: string
    seed: string
    space: bigint
    owner: string
}

export const allocateWithSeed = instruction(
    {
        d4: '0x09000000',
    },
    {
        allocatedAccount: 0,
        baseAccount: 1,
    },
    struct({
        base: address,
        seed: string,
        space: u64,
        owner: address,
    }),
)

export interface AssignWithSeed {
    base: string
    seed: string
    owner: string
}

export const assignWithSeed = instruction(
    {
        d4: '0x0a000000',
    },
    {
        assignedAccount: 0,
        baseAccount: 1,
    },
    struct({
        base: address,
        seed: string,
        owner: address,
    }),
)

export interface TransferWithSeed {
    lamports: bigint
    fromSeed: string
    fromOwner: string
}

export const transferWithSeed = instruction(
    {
        d4: '0x0b000000',
    },
    {
        fundingAccount: 0,
        baseAccount: 1,
        recipientAccount: 2,
    },
    struct({
        lamports: u64,
        fromSeed: string,
        fromOwner: address,
    }),
)

export type UpgradeNonceAccount = undefined

export const upgradeNonceAccount = instruction(
    {
        d4: '0x0c000000',
    },
    {
        nonceAccount: 0,
    },
    unit,
)
