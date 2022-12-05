import {
  numberToRpcQuantity,
  rpcQuantityToBigInt,
} from "hardhat/internal/core/jsonrpc/types/base-types";
import { ProviderWrapper } from "hardhat/internal/core/providers/wrapper";
import { EIP1193Provider, RequestArguments } from "hardhat/types";

export class AutomaticGasPriceProvider extends ProviderWrapper {
  // We pay the max base fee that can be required if the next
  // EIP1559_BASE_FEE_MAX_FULL_BLOCKS_PREFERENCE are full.
  public static readonly EIP1559_BASE_FEE_MAX_FULL_BLOCKS_PREFERENCE: number = 3;

  // See eth_feeHistory for an explanation of what this means
  public static readonly EIP1559_REWARD_PERCENTILE: number = 0.5;

  private _nodeHasFeeHistory?: boolean;
  private _nodeSupportsEIP1559?: boolean;
  private _minMaxFeePerGas?: bigint;
  private _minMaxPriorityFeePerGas?: bigint;

  constructor(
    provider: EIP1193Provider,
    minMaxFeePerGas?: string | number,
    minMaxPriorityFeePerGas?: string | number
  ) {
    super(provider);
    this._minMaxFeePerGas =
      minMaxFeePerGas !== undefined ? BigInt(minMaxFeePerGas) : undefined;
    this._minMaxPriorityFeePerGas =
      minMaxPriorityFeePerGas !== undefined
        ? BigInt(minMaxPriorityFeePerGas)
        : undefined;
  }

  public async request(args: RequestArguments): Promise<unknown> {
    if (args.method !== "eth_sendTransaction") {
      return this._wrappedProvider.request(args);
    }

    const params = this._getParams(args);

    // TODO: Should we validate this type?
    const tx = params[0];

    if (tx === undefined) {
      return this._wrappedProvider.request(args);
    }

    // We don't need to do anything in these cases
    if (
      tx.gasPrice !== undefined ||
      (tx.maxFeePerGas !== undefined && tx.maxPriorityFeePerGas !== undefined)
    ) {
      if (
        tx.maxFeePerGas !== undefined &&
        this._minMaxFeePerGas !== undefined
      ) {
        const maxFeePerGasBN = rpcQuantityToBigInt(tx.maxFeePerGas);
        tx.maxFeePerGas = numberToRpcQuantity(
          this._validateMinMaxGas(maxFeePerGasBN, this._minMaxFeePerGas)
        );
      }

      if (
        tx.maxPriorityFeePerGas !== undefined &&
        this._minMaxPriorityFeePerGas !== undefined
      ) {
        const maxPriorityFeePerGasBN = rpcQuantityToBigInt(tx.maxPriorityFeePerGas);
        tx.maxPriorityFeePerGas = numberToRpcQuantity(
          this._validateMinMaxGas(
            maxPriorityFeePerGasBN,
            this._minMaxPriorityFeePerGas
          )
        );
      }

      return this._wrappedProvider.request(args);
    }

    let suggestedEip1559Values = await this._suggestEip1559FeePriceValues();

    // eth_feeHistory failed, so we send a legacy one
    if (
      tx.maxFeePerGas === undefined &&
      tx.maxPriorityFeePerGas === undefined &&
      suggestedEip1559Values === undefined
    ) {
      tx.gasPrice = numberToRpcQuantity(await this._getGasPrice());
      return this._wrappedProvider.request(args);
    }

    // If eth_feeHistory failed, but the user still wants to send an EIP-1559 tx
    // we use the gasPrice as default values.
    if (suggestedEip1559Values === undefined) {
      const gasPrice = await this._getGasPrice();

      suggestedEip1559Values = {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
      };
    }

    let maxFeePerGas =
      tx.maxFeePerGas !== undefined
        ? rpcQuantityToBigInt(tx.maxFeePerGas)
        : suggestedEip1559Values.maxFeePerGas;

    let maxPriorityFeePerGas =
      tx.maxPriorityFeePerGas !== undefined
        ? rpcQuantityToBigInt(tx.maxPriorityFeePerGas)
        : suggestedEip1559Values.maxPriorityFeePerGas;

    if (this._minMaxFeePerGas) {
      maxFeePerGas = this._validateMinMaxGas(
        maxFeePerGas,
        this._minMaxFeePerGas
      );
    }

    if (this._minMaxPriorityFeePerGas) {
      maxPriorityFeePerGas = this._validateMinMaxGas(
        maxPriorityFeePerGas,
        this._minMaxPriorityFeePerGas
      );
    }

    if (maxFeePerGas < maxPriorityFeePerGas) {
      maxFeePerGas = maxFeePerGas + maxPriorityFeePerGas;
    }

    tx.maxFeePerGas = numberToRpcQuantity(maxFeePerGas);
    tx.maxPriorityFeePerGas = numberToRpcQuantity(maxPriorityFeePerGas);

    return this._wrappedProvider.request(args);
  }

  private _validateMinMaxGas = (initialMaxGas: bigint, minMaxGas: bigint) => {
    return initialMaxGas < minMaxGas ? minMaxGas : initialMaxGas;
  };

  private async _getGasPrice(): Promise<bigint> {
    const response = (await this._wrappedProvider.request({
      method: "eth_gasPrice",
    })) as string;

    return rpcQuantityToBigInt(response);
  }

  private async _suggestEip1559FeePriceValues(): Promise<
    | {
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    }
    | undefined
  > {
    if (this._nodeSupportsEIP1559 === undefined) {
      const block = (await this._wrappedProvider.request({
        method: "eth_getBlockByNumber",
        params: ["latest", false],
      })) as any;
      this._nodeSupportsEIP1559 = block.baseFeePerGas !== undefined;
    }

    if (
      this._nodeHasFeeHistory === false ||
      this._nodeSupportsEIP1559 === false
    ) {
      return;
    }

    try {
      const response = (await this._wrappedProvider.request({
        method: "eth_feeHistory",
        params: [
          "0x1",
          "latest",
          [AutomaticGasPriceProvider.EIP1559_REWARD_PERCENTILE],
        ],
      })) as { baseFeePerGas: string[]; reward: string[][] };

      return {
        // Each block increases the base fee by 1/8 at most, when full.
        // We have the next block's base fee, so we compute a cap for the
        // next N blocks here.
        maxFeePerGas: rpcQuantityToBigInt(response.baseFeePerGas[1]) * (
          BigInt(9) ** (
            BigInt(
              AutomaticGasPriceProvider.EIP1559_BASE_FEE_MAX_FULL_BLOCKS_PREFERENCE -
              1
            )
          )
        )
          / (
            BigInt(8) ** (
              BigInt(
                AutomaticGasPriceProvider.EIP1559_BASE_FEE_MAX_FULL_BLOCKS_PREFERENCE -
                1
              )
            )
          )
          + (rpcQuantityToBigInt(response.reward[0][0])),

        maxPriorityFeePerGas: rpcQuantityToBigInt(response.reward[0][0]),
      };
    } catch (_error) {
      this._nodeHasFeeHistory = false;

      return undefined;
    }
  }
}
