import { BigNumber } from 'ethers';
import {
  TokenId,
  ParsedRelayerMessage,
  ChainName,
  ChainId,
  NATIVE,
  ParsedMessage,
  Context,
  ParsedRelayerPayload,
  VaaInfo,
} from '../../types';
import { WormholeContext } from '../../wormhole';
import { TokenBridgeAbstract } from '../abstracts/tokenBridge';
import { AptosContracts } from './contracts';
import { AptosClient, CoinClient, Types } from 'aptos';
import {
  CHAIN_ID_APTOS,
  getForeignAssetAptos,
  getIsTransferCompletedAptos,
  getSignedVAAWithRetry,
  getTypeFromExternalAddress,
  hexToUint8Array,
  isValidAptosType,
  parseTokenTransferPayload,
  parseVaa,
  redeemOnAptos,
  transferFromAptos,
} from '@certusone/wormhole-sdk';
import {
  arrayify,
  hexZeroPad,
  hexlify,
  stripZeros,
  zeroPad,
} from 'ethers/lib/utils';
import { sha3_256 } from 'js-sha3';
import { MAINNET_CHAINS } from '../../config/MAINNET';
import { SolanaContext } from '../solana';
import { ForeignAssetCache, stripHexPrefix } from '../../utils';

export const APTOS_COIN = '0x1::aptos_coin::AptosCoin';

export class AptosContext<
  T extends WormholeContext,
> extends TokenBridgeAbstract<Types.EntryFunctionPayload> {
  readonly type = Context.APTOS;
  protected contracts: AptosContracts<T>;
  readonly context: T;
  readonly aptosClient: AptosClient;
  readonly coinClient: CoinClient;
  private foreignAssetCache: ForeignAssetCache;

  constructor(context: T, foreignAssetCache: ForeignAssetCache) {
    super();
    this.context = context;
    const rpc = context.conf.rpcs.aptos;
    if (rpc === undefined) throw new Error('No Aptos rpc configured');
    this.aptosClient = new AptosClient(rpc);
    this.coinClient = new CoinClient(this.aptosClient);
    this.contracts = new AptosContracts(context, this.aptosClient);
    this.foreignAssetCache = foreignAssetCache;
  }

  async send(
    token: TokenId | typeof NATIVE,
    amount: string,
    sendingChain: ChainName | ChainId,
    senderAddress: string,
    recipientChain: ChainName | ChainId,
    recipientAddress: string,
    relayerFee: string = '0',
  ): Promise<Types.EntryFunctionPayload> {
    return this.innerSend(
      token,
      amount,
      sendingChain,
      senderAddress,
      recipientChain,
      recipientAddress,
      relayerFee,
      undefined,
    );
  }

  async sendWithPayload(
    token: TokenId | typeof NATIVE,
    amount: string,
    sendingChain: ChainName | ChainId,
    senderAddress: string,
    recipientChain: ChainName | ChainId,
    recipientAddress: string,
    payload: Uint8Array,
  ): Promise<Types.EntryFunctionPayload> {
    return this.innerSend(
      token,
      amount,
      sendingChain,
      senderAddress,
      recipientChain,
      recipientAddress,
      undefined,
      payload,
    );
  }

  private async innerSend(
    token: TokenId | typeof NATIVE,
    amount: string,
    sendingChain: ChainName | ChainId,
    senderAddress: string,
    recipientChain: ChainName | ChainId,
    recipientAddress: string,
    relayerFee: string = '0',
    payload: Uint8Array | undefined,
  ): Promise<Types.EntryFunctionPayload> {
    const destContext = this.context.getContext(recipientChain);
    const recipientChainId = this.context.toChainId(recipientChain);

    let recipientAccount = recipientAddress;
    // get token account for solana
    if (recipientChainId === MAINNET_CHAINS.solana) {
      let tokenId = token;
      if (token === NATIVE) {
        tokenId = {
          address: APTOS_COIN,
          chain: 'aptos',
        };
      }
      const account = await (
        destContext as SolanaContext<WormholeContext>
      ).getAssociatedTokenAddress(tokenId as TokenId, recipientAddress);
      recipientAccount = account.toString();
    }
    const formattedRecipientAccount = arrayify(
      destContext.formatAddress(recipientAccount),
    );

    let coinType;
    if (token === NATIVE) {
      coinType = APTOS_COIN;
    } else {
      coinType = await this.mustGetForeignAsset(token, sendingChain);
    }

    const tx = transferFromAptos(
      this.contracts.mustGetBridge(sendingChain),
      coinType,
      amount,
      recipientChainId,
      formattedRecipientAccount,
      relayerFee,
      payload,
    );
    return tx;
  }

  formatAddress(address: string): Uint8Array {
    return arrayify(zeroPad(address, 32));
  }

  parseAddress(address: string): string {
    return hexlify(stripZeros(address));
  }

  async formatAssetAddress(address: string): Promise<Uint8Array> {
    if (!isValidAptosType(address)) {
      throw new Error(`Unable to format Aptos asset address: ${address}`);
    }
    return hexToUint8Array(sha3_256(address));
  }

  async parseAssetAddress(address: string): Promise<string> {
    const bridge = this.contracts.mustGetBridge('aptos');
    const assetType = await getTypeFromExternalAddress(
      this.aptosClient,
      bridge,
      address,
    );
    if (!assetType)
      throw new Error(`Unable to parse Aptos asset address: ${address}`);
    return assetType;
  }

  async getForeignAsset(
    tokenId: TokenId,
    chain: ChainName | ChainId,
  ): Promise<string | null> {
    const chainName = this.context.toChainName(chain);
    if (this.foreignAssetCache.get(tokenId.chain, tokenId.address, chainName)) {
      return this.foreignAssetCache.get(
        tokenId.chain,
        tokenId.address,
        chainName,
      )!;
    }

    const chainId = this.context.toChainId(tokenId.chain);
    const toChainId = this.context.toChainId(chain);
    if (toChainId === chainId) return tokenId.address;

    const { token_bridge } = this.context.mustGetContracts(chain);
    if (!token_bridge) throw new Error('token bridge contract not found');

    const tokenContext = this.context.getContext(tokenId.chain);
    const formattedAddr = await tokenContext.formatAssetAddress(
      tokenId.address,
    );
    const asset = await getForeignAssetAptos(
      this.aptosClient,
      token_bridge,
      chainId,
      hexlify(formattedAddr),
    );

    if (!asset) return null;
    this.foreignAssetCache.set(
      tokenId.chain,
      tokenId.address,
      chainName,
      asset,
    );
    return asset;
  }

  async mustGetForeignAsset(
    tokenId: TokenId,
    chain: ChainName | ChainId,
  ): Promise<string> {
    const addr = await this.getForeignAsset(tokenId, chain);
    if (!addr) throw new Error('token not registered');
    return addr;
  }

  async fetchTokenDecimals(
    tokenAddr: string,
    chain: ChainName | ChainId,
  ): Promise<number> {
    const coinType = `0x1::coin::CoinInfo<${tokenAddr}>`;
    const decimals = (
      (
        await this.aptosClient.getAccountResource(
          tokenAddr.split('::')[0],
          coinType,
        )
      ).data as any
    ).decimals;
    return decimals;
  }

  async getVaa(
    tx: string,
    chain: ChainName | ChainId,
  ): Promise<VaaInfo<Types.UserTransaction>> {
    const transaction = await this.aptosClient.getTransactionByHash(tx);
    if (transaction.type !== 'user_transaction') {
      throw new Error(`${tx} is not a user_transaction`);
    }
    const userTransaction = transaction as Types.UserTransaction;
    const message = userTransaction.events.find((event) =>
      event.type.endsWith('WormholeMessage'),
    );
    if (!message || !message.data) {
      throw new Error(`WormholeMessage not found for ${tx}`);
    }

    const { sender, sequence } = message.data;

    const emitter = stripHexPrefix(
      hexZeroPad(
        hexlify(sender, {
          allowMissingPrefix: true,
          hexPad: 'left',
        }),
        32,
      ),
    );

    const { vaaBytes } = await getSignedVAAWithRetry(
      this.context.conf.wormholeHosts,
      CHAIN_ID_APTOS,
      emitter,
      sequence,
      undefined,
      undefined,
      this.context.conf.wormholeHosts.length,
    );

    const parsedVaa = parseVaa(vaaBytes);
    return {
      transaction: userTransaction,
      rawVaa: vaaBytes,
      vaa: {
        ...parsedVaa,
        sequence: parsedVaa.sequence.toString(),
      },
    };
  }

  async parseMessage(
    info: VaaInfo<Types.UserTransaction>,
  ): Promise<ParsedMessage | ParsedRelayerMessage> {
    const { transaction, vaa } = info;

    const { emitterChain: chain, payload, emitterAddress, sequence } = vaa;
    const parsed = parseTokenTransferPayload(payload);
    const tokenContext = this.context.getContext(parsed.tokenChain as ChainId);
    const destContext = this.context.getContext(parsed.toChain as ChainId);
    const tokenAddress = await tokenContext.parseAssetAddress(
      hexlify(parsed.tokenAddress),
    );
    const tokenChain = this.context.toChainName(parsed.tokenChain);

    // make sender address even-length
    const emitter = hexlify(emitterAddress, {
      allowMissingPrefix: true,
      hexPad: 'left',
    });
    const parsedMessage: ParsedMessage = {
      sendTx: transaction.hash,
      sender: transaction.sender,
      amount: BigNumber.from(parsed.amount),
      payloadID: Number(parsed.payloadType),
      recipient: destContext.parseAddress(hexlify(parsed.to)),
      toChain: this.context.toChainName(parsed.toChain),
      fromChain: this.context.toChainName(chain),
      tokenAddress,
      tokenChain,
      tokenId: {
        chain: tokenChain,
        address: tokenAddress,
      },
      sequence: BigNumber.from(sequence),
      emitterAddress: hexlify(this.formatAddress(emitter)),
      block: Number(transaction.version),
      gasFee: BigNumber.from(transaction.gas_used).mul(
        transaction.gas_unit_price,
      ),
    };
    return parsedMessage;
  }

  async getNativeBalance(
    walletAddress: string,
    chain: ChainName | ChainId,
  ): Promise<BigNumber> {
    return await this.checkBalance(walletAddress, APTOS_COIN);
  }

  async getTokenBalance(
    walletAddress: string,
    tokenId: TokenId,
    chain: ChainName | ChainId,
  ): Promise<BigNumber | null> {
    const address = await this.getForeignAsset(tokenId, chain);
    if (!address) return null;
    const balance = await this.checkBalance(walletAddress, address);
    return balance ? BigNumber.from(balance) : null;
  }

  async checkBalance(
    walletAddress: string,
    coinType: string,
  ): Promise<BigNumber> {
    try {
      const balance = await this.coinClient.checkBalance(walletAddress, {
        coinType,
      });
      return BigNumber.from(balance);
    } catch (e: any) {
      if (
        (e instanceof Types.ApiError || e.errorCode === 'resource_not_found') &&
        e.status === 404
      ) {
        return BigNumber.from(0);
      }
      throw e;
    }
  }

  async redeem(
    destChain: ChainName | ChainId,
    signedVAA: Uint8Array,
    overrides: any,
    payerAddr?: any,
  ): Promise<Types.EntryFunctionPayload> {
    const payload = await redeemOnAptos(
      this.aptosClient,
      this.contracts.mustGetBridge(destChain),
      signedVAA,
    );
    return payload;
  }

  async isTransferCompleted(
    destChain: ChainName | ChainId,
    signedVaa: string,
  ): Promise<boolean> {
    return await getIsTransferCompletedAptos(
      this.aptosClient,
      this.contracts.mustGetBridge(destChain),
      arrayify(signedVaa, { allowMissingPrefix: true }),
    );
  }

  getTxIdFromReceipt(hash: Types.HexEncodedBytes) {
    return hash;
  }

  parseRelayerPayload(payload: Buffer): ParsedRelayerPayload {
    throw new Error('relaying is not supported on aptos');
  }

  async getCurrentBlock(): Promise<number> {
    throw new Error('Aptos getCurrentBlock not implemented');
  }
}
