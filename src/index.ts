import { extendConfig, extendEnvironment } from "hardhat/config";
import { BackwardsCompatibilityProviderAdapter } from "hardhat/internal/core/providers/backwards-compatibility";
import {
  AutomaticGasPriceProvider,
  AutomaticGasProvider,
} from "hardhat/internal/core/providers/gas-providers";
import { HttpProvider } from "hardhat/internal/core/providers/http";
import {
  EIP1193Provider,
  HardhatConfig,
  HardhatUserConfig,
  HttpNetworkUserConfig,
} from "hardhat/types";

import { KMSSigner } from "./provider";
import "./type-extensions";

extendConfig(
  (config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
    const userNetworks = userConfig.networks;
    if (userNetworks === undefined) {
      return;
    }
    for (const networkName in userNetworks) {
      if (networkName === "hardhat") {
        continue;
      }
      const network = userNetworks[networkName]!;
      if (network.kmsKeyId) {
        config.networks[networkName].kmsKeyId = network.kmsKeyId;
      }
    }
  }
);

extendEnvironment((hre) => {
  if (hre.network.config.kmsKeyId) {
    const httpNetConfig = hre.network.config as HttpNetworkUserConfig;
    const eip1193Provider = new HttpProvider(
      httpNetConfig.url!,
      hre.network.name,
      httpNetConfig.httpHeaders,
      httpNetConfig.timeout
    );
    let wrappedProvider: EIP1193Provider;
    wrappedProvider = new KMSSigner(
      eip1193Provider,
      hre.network.config.kmsKeyId
    );
    wrappedProvider = new AutomaticGasProvider(
      wrappedProvider,
      hre.network.config.gasMultiplier
    );
    wrappedProvider = new AutomaticGasPriceProvider(wrappedProvider);
    hre.network.provider = new BackwardsCompatibilityProviderAdapter(
      wrappedProvider
    );
  }
});
