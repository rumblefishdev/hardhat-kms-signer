import Common, { Hardfork } from "@ethereumjs/common";
import {
  FeeMarketEIP1559Transaction,
  FeeMarketEIP1559TxData,
} from "@ethereumjs/tx";
import { BN, bufferToHex } from "ethereumjs-util";
import { rpcQuantityToBN } from "hardhat/internal/core/jsonrpc/types/base-types";
import { rpcTransactionRequest } from "hardhat/internal/core/jsonrpc/types/input/transactionRequest";
import { validateParams } from "hardhat/internal/core/jsonrpc/types/input/validation";
import { JsonRpcTransactionData } from "hardhat/internal/core/providers/accounts";
import { ProviderWrapperWithChainId } from "hardhat/internal/core/providers/chainId";
import { EIP1193Provider, RequestArguments } from "hardhat/types";
import { pick } from "lodash";

import { createSignature, getEthAddressFromKMS } from "./kms";

export class KMSSigner extends ProviderWrapperWithChainId {
  public kmsKeyId: string;
  public ethAddress?: string;

  constructor(provider: EIP1193Provider, kmsKeyId: string) {
    super(provider);
    this.kmsKeyId = kmsKeyId;
  }

  public async request(args: RequestArguments): Promise<unknown> {
    const method = args.method;
    const params = this._getParams(args);

    if (method === "eth_sendTransaction") {
      const tx: JsonRpcTransactionData = params[0];

      if (tx !== undefined && tx.from === undefined) {
        tx.from = await this._getSender();
      }
      const [txRequest] = validateParams(params, rpcTransactionRequest);

      if (txRequest.nonce === undefined) {
        txRequest.nonce = await this._getNonce(txRequest.from);
      }
      const txOptions = new Common({
        chain: await this._getChainId(),
        hardfork: Hardfork.London,
      });

      const txParams: FeeMarketEIP1559TxData = pick(txRequest, [
        "from",
        "to",
        "value",
        "nonce",
        "data",
        "chainId",
        "maxFeePerGas",
        "maxPriorityFeePerGas",
      ]);
      txParams.gasLimit = txRequest.gas;
      const txf = FeeMarketEIP1559Transaction.fromTxData(txParams, {
        common: txOptions,
      });

      const txSignature = await createSignature({
        keyId: this.kmsKeyId,
        message: txf.getMessageToSign(),
        address: tx.from!,
        txOpts: txOptions,
      });

      const signedTx = FeeMarketEIP1559Transaction.fromTxData(
        {
          ...txParams,
          ...txSignature,
        },
        {
          common: txOptions,
        }
      );

      const rawTx = `0x${signedTx.serialize().toString("hex")}`;
      return this._wrappedProvider.request({
        method: "eth_sendRawTransaction",
        params: [rawTx],
      });
    } else if (
      args.method === "eth_accounts" ||
      args.method === "eth_requestAccounts"
    ) {
      return [await this._getSender()];
    }

    return this._wrappedProvider.request(args);
  }

  private async _getSender(): Promise<string | undefined> {
    if (!this.ethAddress) {
      this.ethAddress = await getEthAddressFromKMS(this.kmsKeyId);
    }
    return this.ethAddress;
  }

  private async _getNonce(address: Buffer): Promise<BN> {
    const response = (await this._wrappedProvider.request({
      method: "eth_getTransactionCount",
      params: [bufferToHex(address), "pending"],
    })) as string;

    return rpcQuantityToBN(response);
  }
}
