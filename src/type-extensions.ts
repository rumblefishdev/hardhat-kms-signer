import "hardhat/types/config";

declare module "hardhat/types/config" {
  export interface HttpNetworkUserConfig {
    kmsKeyId?: string;
    minMaxFeePerGas?: string | number;
    minMaxPriorityFeePerGas?: string | number;
  }

  export interface HardhatNetworkUserConfig {
    kmsKeyId?: string;
    minMaxFeePerGas?: string | number;
    minMaxPriorityFeePerGas?: string | number;
  }
  export interface HttpNetworkConfig {
    kmsKeyId?: string;
    minMaxFeePerGas?: string | number;
    minMaxPriorityFeePerGas?: string | number;
  }
  export interface HardhatNetworkConfig {
    kmsKeyId?: string;
    minMaxFeePerGas?: string | number;
    minMaxPriorityFeePerGas?: string | number;
  }
}
