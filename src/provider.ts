import { BigNumber, utils } from "ethers";
import { rpcTransactionRequest } from "hardhat/internal/core/jsonrpc/types/input/transactionRequest";
import { validateParams } from "hardhat/internal/core/jsonrpc/types/input/validation";
import { ProviderWrapperWithChainId } from "hardhat/internal/core/providers/chainId";
import { EIP1193Provider, RequestArguments } from "hardhat/types";
import {
  createSignature,
  getEthAddressFromKMS,
} from "@rumblefishdev/eth-signer-kms";
import { keccak256 } from "ethers/lib/utils";
import { KMS } from "aws-sdk";

export class KMSSigner extends ProviderWrapperWithChainId {
  public kmsKeyId: string;
  public kmsInstance: KMS;
  public ethAddress?: string;

  constructor(provider: EIP1193Provider, kmsKeyId: string) {
    super(provider);
    this.kmsKeyId = kmsKeyId;
    this.kmsInstance = new KMS();
  }

  public async request(args: RequestArguments): Promise<unknown> {
    const method = args.method;
    const params = this._getParams(args);
    const sender = await this._getSender();

    if (method === "eth_sendTransaction") {
      const [txRequest] = validateParams(params, rpcTransactionRequest);
      const tx = await utils.resolveProperties(txRequest);
      const nonce = await this._getNonce(sender);

      const baseTx: utils.UnsignedTransaction = {
        chainId: (await this._getChainId()) || undefined,
        data: tx.data || undefined,
        gasLimit: tx.gas?.toString() || undefined,
        gasPrice: tx.gasPrice?.toString() || undefined,
        nonce: nonce,
        to: tx.to?.toString("hex") || undefined,
        value: tx.value?.toString() || undefined,
        type: undefined,
        maxFeePerGas: tx.maxFeePerGas?.toString() || undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() || undefined,
      };
      if (
        baseTx.maxFeePerGas !== undefined &&
        baseTx.maxPriorityFeePerGas !== undefined
      ) {
        baseTx.type = 2;
      }
      const unsignedTx = utils.serializeTransaction(baseTx);
      const hash = keccak256(utils.arrayify(unsignedTx));
      const sig = await createSignature({
        kmsInstance: this.kmsInstance,
        keyId: this.kmsKeyId,
        message: hash,
        address: sender,
      });

      const rawTx = utils.serializeTransaction(baseTx, sig);

      return this._wrappedProvider.request({
        method: "eth_sendRawTransaction",
        params: [rawTx],
      });
    } else if (
      args.method === "eth_accounts" ||
      args.method === "eth_requestAccounts"
    ) {
      return [sender];
    }

    return this._wrappedProvider.request(args);
  }

  private async _getSender(): Promise<string> {
    if (!this.ethAddress) {
      this.ethAddress = await getEthAddressFromKMS({
        keyId: this.kmsKeyId,
        kmsInstance: this.kmsInstance,
      });
    }
    return this.ethAddress;
  }

  private async _getNonce(address: string): Promise<number> {
    const response = await this._wrappedProvider.request({
      method: "eth_getTransactionCount",
      params: [address, "pending"],
    });

    return BigNumber.from(response).toNumber();
  }
}
