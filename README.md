# Hardhat KMS Signer

This plugin signs Ethereum transaction using KMS key during deployments.

## Usage

It's assumed that you have AWS access configured and your role perform kms:sign using KMS key.

In `hardhat.config.ts` do:

```
import "@rumblefishdev/hardhat-kms-signer";

...

const config: HardhatUserConfig = {
  networks: {
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_KEY}`,
      kmsKeyId: "YOUR KMS KEY ID"
    }
  }
}
```

### Learn your address

```
$ node_modules/.bin/hardhat console --network ropsten
Creating Typechain artifacts in directory types for target ethers-v5
Successfully generated Typechain artifacts!
Welcome to Node.js v12.22.6.
> getNamedAccounts().then(console.log)
Promise { <pending> }
> { deployer: '0x541dD0eC22fB1213d2C2B1fc83B5F302cEFF79A2' }
```

Remember to fund your address with some ETH before deploying.

### Minimal EIP1559 gas values

On less crowded networks (such as Sepolia) there may be situations where automatic gas provider will set 
`maxFeePerGas` & `maxPriorityFeePerGas` near 0 (when empty blocks are mined). To prevent this you can
set minimal values for them in config:

```
import "@rumblefishdev/hardhat-kms-signer";

...

const config: HardhatUserConfig = {
  networks: {
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_KEY}`,
      kmsKeyId: "YOUR KMS KEY ID",
      minMaxFeePerGas: 1600000000,
      mixMaxPriorityFeePerGas: 1200000000
    }
  }
}
```

