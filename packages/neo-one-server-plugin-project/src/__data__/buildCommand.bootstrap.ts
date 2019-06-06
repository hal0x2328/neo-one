/// <reference types="@neo-one/types/e2e"/>

import { ABI, Contract, privateKeyToAddress, UserAccountID, wifToPrivateKey } from '@neo-one/client-common';
import { DeveloperClient, Hash256, LocalKeyStore, LocalMemoryStore, NEOONEProvider } from '@neo-one/client-core';
import { Client, LocalUserAccountProvider } from '@neo-one/client-full-core';
import { Network } from '@neo-one/server-plugin-network';
import { Wallet } from '@neo-one/server-plugin-wallet';
import { TestOptions } from '@neo-one/smart-contract-test';
import BigNumber from 'bignumber.js';
import * as path from 'path';
import { EscrowSmartContract } from '../__data__/ico/one/generated';
import { ICOSmartContract } from '../__data__/ico/one/generated/ICO/types';
import { TokenSmartContract } from '../__data__/ico/one/generated/Token/types';
import { Contracts } from '../__data__/ico/one/generated/types';

const TO_PRIVATE_KEY = '7d128a6d096f0c14c3a25a2b0c41cf79661bfcb4a8cc95aaaea28bde4d732344';
const TO_PUBLIC_KEY = '02028a99826edc0c97d18e22b6932373d908d323aa7f92656a77ec26e8861699ef';

const LOCAL = 'local';

const getNetworks = async (): Promise<readonly Network[]> => {
  const networksString = await one.execute('get network --json');

  return JSON.parse(networksString);
};

const getWallets = async (networkName: string): Promise<readonly Wallet[]> => {
  const walletsString = await one.execute(`get wallet --json --network ${networkName}`);

  return JSON.parse(walletsString);
};

const getClients = async (
  network: Network,
  wallet: Wallet,
): Promise<{
  readonly client: Client;
}> => {
  const keystore = new LocalKeyStore(new LocalMemoryStore());

  if (wallet.wif === undefined) {
    throw new Error(`Something went wrong, wif is null for ${wallet.name}`);
  }
  await keystore.addUserAccount({
    network: LOCAL,
    name: wallet.name,
    privateKey: wifToPrivateKey(wallet.wif),
  });

  const provider = new NEOONEProvider([{ network: LOCAL, rpcURL: network.nodes[0].rpcAddress }]);
  const localUserAccountProvider = new LocalUserAccountProvider({ keystore, provider });
  const client = new Client({ memory: localUserAccountProvider });

  return { client };
};

const getContracts = async (client: Client, networkName: string): Promise<readonly Contract[]> => {
  const readClient = client.read(networkName);

  const mutableContracts: Contract[] = [];
  // tslint:disable-next-line no-loop-statement
  for await (const block of readClient.iterBlocks({ indexStart: 0 })) {
    // tslint:disable-next-line no-loop-statement
    for (const transaction of block.transactions) {
      if (transaction.type === 'InvocationTransaction' && transaction.invocationData.contracts.length > 0) {
        mutableContracts.push(transaction.invocationData.contracts[0]);

        if (mutableContracts.length === 3) {
          return mutableContracts;
        }
      }
    }
  }

  return mutableContracts;
};

const getGeneratedICOCode = (
  dataRoot: string,
): {
  readonly abi: ABI;
  readonly contract: {
    readonly createSmartContract: (client: Client) => ICOSmartContract;
  };
} => {
  // tslint:disable-next-line no-require-imports
  const abi = require(path.resolve(dataRoot, 'one/generated/ICO/abi')).icoABI;
  // tslint:disable-next-line no-require-imports
  const contract = require(path.resolve(dataRoot, 'one/generated/ICO/contract'));
  const createSmartContract = contract.createICOSmartContract;

  return { abi, contract: { createSmartContract } };
};

const getGeneratedTokenCode = (
  dataRoot: string,
): {
  readonly abi: ABI;
  readonly contract: {
    readonly createSmartContract: (client: Client) => TokenSmartContract;
  };
} => {
  // tslint:disable-next-line no-require-imports
  const abi = require(path.resolve(dataRoot, 'one/generated/Token/abi')).tokenABI;
  // tslint:disable-next-line no-require-imports
  const contract = require(path.resolve(dataRoot, 'one/generated/Token/contract'));
  const createSmartContract = contract.createTokenSmartContract;

  return { abi, contract: { createSmartContract } };
};

const getGeneratedEscrowCode = (
  dataRoot: string,
): {
  readonly abi: ABI;
  readonly contract: {
    readonly createSmartContract: (client: Client) => EscrowSmartContract;
  };
} => {
  // tslint:disable-next-line no-require-imports
  const abi = require(path.resolve(dataRoot, 'one/generated/Escrow/abi')).escrowABI;
  // tslint:disable-next-line no-require-imports
  const contract = require(path.resolve(dataRoot, 'one/generated/Escrow/contract'));
  const createSmartContract = contract.createEscrowSmartContract;

  return { abi, contract: { createSmartContract } };
};

const getGeneratedCommonCode = (
  dataRoot: string,
): {
  readonly createClient: () => Client;
  readonly createDeveloperClients: () => { readonly [network: string]: DeveloperClient };
  // tslint:disable-next-line no-require-imports
} => require(path.resolve(dataRoot, 'one/generated/client'));

const verifySmartContractAfterMint = async (
  ico: ICOSmartContract,
  token: TokenSmartContract,
  escrow: EscrowSmartContract,
  accountID: UserAccountID,
  toAccountID: UserAccountID,
  developerClient?: DeveloperClient,
): Promise<void> => {
  const [totalSupply, remaining, balance, toBalance] = await Promise.all([
    token.totalSupply(),
    ico.remaining(),
    token.balanceOf(accountID.address),
    token.balanceOf(toAccountID.address),
  ]);
  expect(totalSupply.toString()).toEqual('100');
  expect(remaining.toString()).toEqual(new BigNumber(9_999_999_900).toString());
  expect(balance.toString()).toEqual('100');
  expect(toBalance.toString()).toEqual('0');

  const result = await token.transfer(accountID.address, toAccountID.address, new BigNumber('25'));
  const [receipt] = await Promise.all([
    result.confirmed({ timeoutMS: 2500 }),
    developerClient === undefined ? Promise.resolve() : developerClient.runConsensusNow(),
  ]);
  if (receipt.result.state === 'FAULT') {
    throw new Error(receipt.result.message);
  }

  const [totalSupplyAfter, balanceAfter, toBalanceAfter] = await Promise.all([
    token.totalSupply(),
    token.balanceOf(accountID.address),
    token.balanceOf(toAccountID.address),
  ]);
  expect(totalSupplyAfter.toString()).toEqual('100');
  expect(balanceAfter.toString()).toEqual('75');
  expect(toBalanceAfter.toString()).toEqual('25');

  const escrowAddress = escrow.definition.networks[accountID.network].address;
  const [escrowTransferReceipt] = await Promise.all([
    token.transfer.confirmed(
      accountID.address,
      escrowAddress,
      new BigNumber('25'),
      ...escrow.forwardApproveReceiveTransferArgs(toAccountID.address),
    ),
    developerClient === undefined ? Promise.resolve() : developerClient.runConsensusNow(),
  ]);
  if (escrowTransferReceipt.result.state === 'FAULT') {
    throw new Error(escrowTransferReceipt.result.message);
  }
  expect(escrowTransferReceipt.events).toHaveLength(2);
  const transferEvent = escrowTransferReceipt.events[1];
  if (transferEvent.name !== 'transfer') {
    throw new Error('Expected transfer event');
  }
  expect(transferEvent.parameters.amount.toString()).toEqual('25');
  const balanceAvailableEvent = escrowTransferReceipt.events[0];
  if (balanceAvailableEvent.name !== 'balanceAvailable') {
    throw new Error('Expected balanceAvailable event');
  }
  expect(balanceAvailableEvent.parameters.amount.toString()).toEqual('25');

  const tokenAddress = token.definition.networks[accountID.network].address;
  const [escrowBalanceAfterEscrow, balanceAfterEscrow, toBalanceAfterEscrow, escrowPairBalance] = await Promise.all([
    token.balanceOf(escrowAddress),
    token.balanceOf(accountID.address),
    token.balanceOf(toAccountID.address),
    escrow.balanceOf(accountID.address, toAccountID.address, tokenAddress),
  ]);
  expect(escrowBalanceAfterEscrow.toString()).toEqual('25');
  expect(balanceAfterEscrow.toString()).toEqual('50');
  expect(toBalanceAfterEscrow.toString()).toEqual('25');
  expect(escrowPairBalance.toString()).toEqual('25');

  const [escrowClaimReceipt] = await Promise.all([
    escrow.claim.confirmed(accountID.address, toAccountID.address, tokenAddress, new BigNumber('10'), {
      from: toAccountID,
    }),
    developerClient === undefined ? Promise.resolve() : developerClient.runConsensusNow(),
  ]);
  if (escrowClaimReceipt.result.state === 'FAULT') {
    throw new Error(escrowClaimReceipt.result.message);
  }
  expect(escrowClaimReceipt.result.value).toEqual(true);
  expect(escrowClaimReceipt.events).toHaveLength(2);

  const [
    escrowBalanceAfterClaim,
    balanceAfterClaim,
    toBalanceAfterClaim,
    escrowPairBalanceAfterClaim,
  ] = await Promise.all([
    token.balanceOf(escrowAddress),
    token.balanceOf(accountID.address),
    token.balanceOf(toAccountID.address),
    escrow.balanceOf(accountID.address, toAccountID.address, tokenAddress),
  ]);
  expect(escrowBalanceAfterClaim.toString()).toEqual('15');
  expect(balanceAfterClaim.toString()).toEqual('50');
  expect(toBalanceAfterClaim.toString()).toEqual('35');
  expect(escrowPairBalanceAfterClaim.toString()).toEqual('15');
};

const verifySmartContracts = async (
  ico: ICOSmartContract,
  token: TokenSmartContract,
  escrow: EscrowSmartContract,
  accountID: UserAccountID,
  toAccountID: UserAccountID,
  nowSeconds: number,
  developerClient?: DeveloperClient,
): Promise<void> => {
  const [
    name,
    symbol,
    decimals,
    amountPerNEO,
    icoOwner,
    startTimeSeconds,
    icoDurationSeconds,
    initialTotalSupply,
    [initialRemaining, initialBalance],
  ] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    ico.amountPerNEO(),
    ico.owner(),
    ico.startTimeSeconds(),
    ico.icoDurationSeconds(),
    token.totalSupply(),
    Promise.all([ico.remaining(), token.balanceOf(accountID.address)]),
  ]);
  expect(name).toEqual('One');
  expect(symbol).toEqual('ONE');
  expect(decimals.toString()).toEqual('8');
  expect(amountPerNEO.toString()).toEqual('10');
  expect(icoOwner).toEqual(accountID.address);
  expect(startTimeSeconds.gte(new BigNumber(nowSeconds))).toBeTruthy();
  expect(icoDurationSeconds.toString()).toEqual('157700000');
  expect(initialTotalSupply.toString()).toEqual('0');
  expect(initialRemaining.toString()).toEqual(new BigNumber(10_000_000_000).toString());
  expect(initialBalance.toString()).toEqual('0');

  const mintResult = await ico.mintTokens({
    sendTo: [
      {
        amount: new BigNumber(10),
        asset: Hash256.NEO,
      },
    ],
  });

  const [mintReceipt] = await Promise.all([
    mintResult.confirmed(),
    developerClient === undefined ? Promise.resolve() : developerClient.runConsensusNow(),
  ]);
  if (mintReceipt.result.state === 'FAULT') {
    throw new Error(mintReceipt.result.message);
  }

  expect(mintReceipt.result.state).toEqual('HALT');
  expect(mintReceipt.result.value).toEqual(true);
  expect(mintReceipt.result.gasCost).toMatchSnapshot('mint cost');
  expect(mintReceipt.result.gasConsumed).toMatchSnapshot('mint consumed');
  expect(mintReceipt.events).toHaveLength(1);
  const event = mintReceipt.events[0];
  expect(event.name).toEqual('transfer');
  if (event.name !== 'transfer') {
    throw new Error('For TS');
  }
  expect(event.parameters.from).toBeUndefined();
  expect(event.parameters.to).toEqual(accountID.address);
  expect(event.parameters.amount.toString()).toEqual('100');

  await verifySmartContractAfterMint(ico, token, escrow, accountID, toAccountID, developerClient);
};

type WithContracts = (test: (contracts: Contracts & TestOptions) => Promise<void>) => Promise<void>;
const verifySmartContractsTest = async (dataRoot: string, nowSeconds: number) => {
  // tslint:disable-next-line no-require-imports
  const test = require(path.resolve(dataRoot, 'one/generated/test'));
  const withContracts: WithContracts = test.withContracts;
  await withContracts(async ({ ico, token, escrow, masterAccountID, networkName, client }) => {
    await client.providers.memory.keystore.addUserAccount({
      network: networkName,
      privateKey: TO_PRIVATE_KEY,
    });
    await verifySmartContracts(
      ico,
      token,
      escrow,
      masterAccountID,
      { network: networkName, address: privateKeyToAddress(TO_PRIVATE_KEY) },
      nowSeconds,
    );
  });
};

const verifySmartContractsManual = async (
  dataRoot: string,
  accountID: UserAccountID,
  toAccountID: UserAccountID,
  nowSeconds: number,
) => {
  const {
    abi: icoABI,
    contract: { createSmartContract: createICOSmartContract },
  } = getGeneratedICOCode(dataRoot);
  expect(icoABI).toBeDefined();
  const {
    abi: tokenABI,
    contract: { createSmartContract: createTokenSmartContract },
  } = getGeneratedTokenCode(dataRoot);
  expect(tokenABI).toBeDefined();
  const {
    abi: escrowABI,
    contract: { createSmartContract: createEscrowSmartContract },
  } = getGeneratedEscrowCode(dataRoot);
  expect(escrowABI).toBeDefined();

  const { createClient, createDeveloperClients } = getGeneratedCommonCode(dataRoot);
  const client = createClient();
  const developerClient = createDeveloperClients().local;

  const ico = createICOSmartContract(client);
  const token = createTokenSmartContract(client);
  const escrow = createEscrowSmartContract(client);

  await client.providers.memory.keystore.addUserAccount({
    network: accountID.network,
    privateKey: TO_PRIVATE_KEY,
  });

  await verifySmartContracts(ico, token, escrow, accountID, toAccountID, nowSeconds, developerClient);
};

const verifyICOContract = (contract?: Contract): void => {
  expect(contract).toBeDefined();
  if (contract === undefined) {
    throw new Error('For TS');
  }
  expect(contract.codeVersion).toEqual('1.0');
  expect(contract.author).toEqual('dicarlo2');
  expect(contract.email).toEqual('alex.dicarlo@neotracker.io');
  expect(contract.description).toEqual('NEO•ONE ICO');
  expect(contract.parameters).toEqual(['String', 'Array']);
  expect(contract.returnType).toEqual('Buffer');
  expect(contract.payable).toBeTruthy();
  expect(contract.storage).toBeTruthy();
  expect(contract.dynamicInvoke).toBeFalsy();
};

const verifyTokenContract = (contract?: Contract): void => {
  expect(contract).toBeDefined();
  if (contract === undefined) {
    throw new Error('For TS');
  }
  expect(contract.codeVersion).toEqual('1.0');
  expect(contract.author).toEqual('dicarlo2');
  expect(contract.email).toEqual('alex.dicarlo@neotracker.io');
  expect(contract.description).toEqual('NEO•ONE Token');
  expect(contract.parameters).toEqual(['String', 'Array']);
  expect(contract.returnType).toEqual('Buffer');
  expect(contract.payable).toBeFalsy();
  expect(contract.storage).toBeTruthy();
  expect(contract.dynamicInvoke).toBeTruthy();
};

const verifyEscrowContract = (contract?: Contract): void => {
  expect(contract).toBeDefined();
  if (contract === undefined) {
    throw new Error('For TS');
  }
  expect(contract.codeVersion).toEqual('1.0');
  expect(contract.author).toEqual('dicarlo2');
  expect(contract.email).toEqual('alex.dicarlo@neotracker.io');
  expect(contract.description).toEqual('Escrow');
  expect(contract.parameters).toEqual(['String', 'Array']);
  expect(contract.returnType).toEqual('Buffer');
  expect(contract.payable).toBeFalsy();
  expect(contract.storage).toBeTruthy();
  expect(contract.dynamicInvoke).toBeTruthy();
};

export {
  getNetworks,
  getWallets,
  getClients,
  getContracts,
  verifySmartContractsTest,
  verifySmartContractsManual,
  verifyICOContract,
  verifyTokenContract,
  verifyEscrowContract,
  TO_PRIVATE_KEY,
  TO_PUBLIC_KEY,
  LOCAL,
};
